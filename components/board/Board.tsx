"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DragDropContext,
  Draggable,
  DraggableProvidedDragHandleProps,
  DropResult,
  Droppable,
  DroppableProvided,
  DroppableStateSnapshot,
} from "@hello-pangea/dnd";
import {
  MIN_COL_PX,
  MIN_ROW_PX,
  absorbSpanAfterRemoval,
  insertCellWithClamp,
  normalizeFracs,
  sumSpans,
} from "@/lib/boardUtils";
import { useElementRect } from "@/hooks/useElementRect";
import {
  BoardState,
  Card,
  Cell,
  Column,
  QuadrantDirection,
} from "@/types/board";

const INITIAL_ROWS = [0.34, 0.33, 0.33];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

type QuadrantIdentifier = {
  columnIndex: number;
  cellIndex: number;
  direction: QuadrantDirection;
};

const parseQuadrantId = (id: string): QuadrantIdentifier | null => {
  const [prefix, columnPart, cellPart, directionPart] = id.split(":");
  if (prefix !== "quad") {
    return null;
  }
  const columnIndex = Number(columnPart);
  const cellIndex = Number(cellPart);
  if (Number.isNaN(columnIndex) || Number.isNaN(cellIndex)) {
    return null;
  }
  if (
    directionPart !== "top" &&
    directionPart !== "bottom" &&
    directionPart !== "left" &&
    directionPart !== "right"
  ) {
    return null;
  }
  return {
    columnIndex,
    cellIndex,
    direction: directionPart,
  };
};

const parseColumnDroppableId = (id: string) => {
  const [prefix, indexPart] = id.split("-");
  if (prefix !== "col") {
    return null;
  }
  const index = Number(indexPart);
  return Number.isNaN(index) ? null : index;
};

const createInitialBoard = (): BoardState => {
  const rows = INITIAL_ROWS;

  const columnA: Column = {
    id: crypto.randomUUID(),
    frac: 0.34,
    cells: [
      { id: crypto.randomUUID(), title: "아이디어", span: 1 },
      { id: crypto.randomUUID(), title: "요구사항 정리", span: 2 },
    ],
  };

  const columnB: Column = {
    id: crypto.randomUUID(),
    frac: 0.33,
    cells: [
      { id: crypto.randomUUID(), title: "설계", span: 1 },
      { id: crypto.randomUUID(), title: "개발 진행", span: 1 },
      { id: crypto.randomUUID(), title: "리뷰", span: 1 },
    ],
  };

  const columnC: Column = {
    id: crypto.randomUUID(),
    frac: 0.33,
    cells: [
      { id: crypto.randomUUID(), title: "출시 준비", span: 2 },
      { id: crypto.randomUUID(), title: "완료", span: 1 },
    ],
  };

  const cardsByCell: BoardState["cardsByCell"] = {};

  const seedCards = (
    cell: Cell,
    titles: string[],
  ) => {
    cardsByCell[cell.id] = titles.map((title) => ({
      id: crypto.randomUUID(),
      title,
    }));
  };

  seedCards(columnA.cells[0], ["디자인 리서치", "사용자 인터뷰"]);
  seedCards(columnA.cells[1], ["MVP 범위 확정"]);
  seedCards(columnB.cells[0], ["IA 설계"]);
  seedCards(columnB.cells[1], ["프론트엔드", "백엔드"]);
  seedCards(columnB.cells[2], ["QA 체크리스트"]);
  seedCards(columnC.cells[0], ["런북 정리", "시장 알림"]);
  seedCards(columnC.cells[1], ["배포 완료"]);

  return {
    columns: [columnA, columnB, columnC],
    cardsByCell,
    rowFracs: rows,
  };
};

const resolveDestination = (
  columns: Column[],
  quadrant: QuadrantIdentifier,
  sourceColumnIndex: number,
  sourceIndex: number,
): { columnIndex: number; insertIndex: number } | null => {
  const targetColumn = columns[quadrant.columnIndex];
  if (!targetColumn) {
    return null;
  }

  let columnIndex = quadrant.columnIndex;
  let insertIndex = quadrant.cellIndex;

  switch (quadrant.direction) {
    case "top": {
      insertIndex = quadrant.cellIndex;
      break;
    }
    case "bottom": {
      insertIndex = quadrant.cellIndex + 1;
      break;
    }
    case "left": {
      columnIndex = quadrant.columnIndex - 1;
      if (columnIndex < 0) {
        columnIndex = quadrant.columnIndex;
        insertIndex = quadrant.cellIndex;
      } else {
        const neighbor = columns[columnIndex];
        const maxIndex = neighbor ? neighbor.cells.length : 0;
        insertIndex = clamp(quadrant.cellIndex, 0, maxIndex);
      }
      break;
    }
    case "right": {
      columnIndex = quadrant.columnIndex + 1;
      if (columnIndex >= columns.length) {
        columnIndex = quadrant.columnIndex;
        insertIndex = clamp(quadrant.cellIndex + 1, 0, targetColumn.cells.length);
      } else {
        const neighbor = columns[columnIndex];
        const maxIndex = neighbor ? neighbor.cells.length : 0;
        insertIndex = clamp(quadrant.cellIndex, 0, maxIndex);
      }
      break;
    }
    default:
      break;
  }

  if (columnIndex === sourceColumnIndex) {
    if (insertIndex > sourceIndex) {
      insertIndex -= 1;
    }
  }

  return {
    columnIndex,
    insertIndex,
  };
};

const SelfCheckBadge = ({
  columns,
  rowFracs,
  boardWidth,
  rows,
}: {
  columns: Column[];
  rowFracs: number[];
  boardWidth: number;
  rows: number;
}) => {
  const widthSum = columns.reduce(
    (total, column) => total + column.frac * boardWidth,
    0,
  );
  const widthOk = boardWidth === 0 || Math.abs(widthSum - boardWidth) < 0.5;
  const rowSum = rowFracs.reduce((total, value) => total + value, 0);
  const rowOk = Math.abs(rowSum - 1) < 0.0001;
  const spansOk = columns.every((column) => sumSpans(column.cells) === rows);
  const noEmpty = columns.every((column) => column.cells.length > 0);

  const items = [
    { label: "Σ(colPx) === availW", ok: widthOk },
    { label: "rowFracs 합 == 1", ok: rowOk },
    { label: "각 컬럼 span 합 == rows", ok: spansOk },
    { label: "빈 컬럼 없음", ok: noEmpty && columns.length > 0 },
  ];

  return (
    <div className="flex flex-wrap gap-2 text-xs text-zinc-200">
      {items.map((item) => (
        <span
          key={item.label}
          className={`rounded-full border px-3 py-1 ${
            item.ok
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-amber-500/40 bg-amber-500/10"
          }`}
        >
          <span className="mr-2 font-semibold">
            {item.ok ? "✅" : "⚠️"}
          </span>
          {item.label}
        </span>
      ))}
    </div>
  );
};

const QuadrantDroppable = ({
  droppableId,
  className,
}: {
  droppableId: string;
  className: string;
}) => (
  <Droppable droppableId={droppableId} type="CELL_QUADRANT">
    {(provided: DroppableProvided, snapshot: DroppableStateSnapshot) => (
      <div
        ref={provided.innerRef}
        {...provided.droppableProps}
        aria-hidden
        className={`${className} pointer-events-none border border-dashed border-zinc-500/40 transition-colors duration-150 ${
          snapshot.isDraggingOver
            ? "border-sky-500 bg-sky-500/20 opacity-100"
            : "opacity-40"
        }`}
      >
        {provided.placeholder}
      </div>
    )}
  </Droppable>
);

type CellCardProps = {
  cell: Cell;
  columnIndex: number;
  cellIndex: number;
  cards: Card[];
  dragHandleProps: DraggableProvidedDragHandleProps | null;
  isDragging: boolean;
  onAddCard: (cellId: string, title: string) => void;
  onRemoveCard: (cellId: string, cardId: string) => void;
  onDeleteCell: () => void;
  onUpdateCellTitle: (cellId: string, title: string) => void;
};

const CellCard = ({
  cell,
  columnIndex,
  cellIndex,
  cards,
  dragHandleProps,
  isDragging,
  onAddCard,
  onRemoveCard,
  onDeleteCell,
  onUpdateCellTitle,
}: CellCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(cell.title);
  const [newCardTitle, setNewCardTitle] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraftTitle(cell.title);
  }, [cell.title]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commitTitle = useCallback(() => {
    const nextTitle = draftTitle.trim() || "무제 셀";
    onUpdateCellTitle(cell.id, nextTitle);
    setIsEditing(false);
  }, [cell.id, draftTitle, onUpdateCellTitle]);

  const handleAddCard = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const title = newCardTitle.trim() || "새 카드";
      onAddCard(cell.id, title);
      setNewCardTitle("");
    },
    [cell.id, newCardTitle, onAddCard],
  );

  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 shadow-sm transition-shadow ${
        isDragging ? "z-20 shadow-xl ring-2 ring-sky-500/60" : "z-10"
      }`}
    >
      <QuadrantDroppable
        droppableId={`quad:${columnIndex}:${cellIndex}:top`}
        className="absolute left-3 right-3 top-2 h-[26%] rounded-md"
      />
      <QuadrantDroppable
        droppableId={`quad:${columnIndex}:${cellIndex}:bottom`}
        className="absolute bottom-2 left-3 right-3 h-[26%] rounded-md"
      />
      <QuadrantDroppable
        droppableId={`quad:${columnIndex}:${cellIndex}:left`}
        className="absolute bottom-3 left-2 top-3 w-[32%] rounded-md"
      />
      <QuadrantDroppable
        droppableId={`quad:${columnIndex}:${cellIndex}:right`}
        className="absolute bottom-3 right-2 top-3 w-[32%] rounded-md"
      />
      <div className="flex items-center justify-between gap-2 border-b border-zinc-700 px-3 py-2">
        {isEditing ? (
          <input
            ref={inputRef}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitTitle();
              }
              if (event.key === "Escape") {
                setDraftTitle(cell.title);
                setIsEditing(false);
              }
            }}
            className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none"
          />
        ) : (
          <div
            className="flex flex-1 items-center gap-2"
            onDoubleClick={() => setIsEditing(true)}
          >
            <div
              aria-label="셀 드래그 핸들"
              aria-grabbed={isDragging}
              className="cursor-grab select-none rounded bg-zinc-700/50 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
              {...(dragHandleProps ?? {})}
            >
              Move
            </div>
            <span className="text-sm font-semibold text-zinc-50">
              {cell.title}
            </span>
          </div>
        )}
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-600 text-xs text-zinc-200 transition-colors hover:border-red-500 hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
          onClick={onDeleteCell}
          aria-label="셀 삭제"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {cards.length === 0 ? (
            <p className="text-sm text-zinc-400">카드를 추가하세요.</p>
          ) : (
            cards.map((card) => (
              <div
                key={card.id}
                className="relative rounded-md border border-zinc-600 bg-zinc-700/70 p-3 text-sm text-zinc-50"
              >
                <p className="pr-6 leading-snug">{card.title}</p>
                <button
                  type="button"
                  className="absolute right-2 top-2 h-6 w-6 rounded-full text-xs text-zinc-300 transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                  onClick={() => onRemoveCard(cell.id, card.id)}
                  aria-label="카드 삭제"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
        <form
          onSubmit={handleAddCard}
          className="border-t border-zinc-700 px-3 py-2"
        >
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-300">
            새 카드
            <input
              value={newCardTitle}
              onChange={(event) => setNewCardTitle(event.target.value)}
              placeholder="제목을 입력하세요"
              className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="mt-2 inline-flex items-center justify-center rounded bg-sky-500 px-3 py-1 text-sm font-semibold text-white transition-colors hover:bg-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          >
            + 카드 추가
          </button>
        </form>
      </div>
    </div>
  );
};

const Board = () => {
  const [state, setState] = useState<BoardState>(() => createInitialBoard());
  const [boardRef, boardRect] = useElementRect<HTMLDivElement>();
  const [activeColumnHandle, setActiveColumnHandle] = useState<number | null>(null);
  const [activeRowHandle, setActiveRowHandle] = useState<number | null>(null);

  const rows = state.rowFracs.length;

  const gridTemplateRows = useMemo(
    () => state.rowFracs.map((frac) => `${(frac * 100).toFixed(3)}%`).join(" "),
    [state.rowFracs],
  );

  const columnOffsets = useMemo(() => {
    const offsets: number[] = [];
    let sum = 0;
    state.columns.forEach((column, index) => {
      sum += column.frac;
      if (index < state.columns.length - 1) {
        offsets.push(sum);
      }
    });
    return offsets;
  }, [state.columns]);

  const rowOffsets = useMemo(() => {
    const offsets: number[] = [];
    let sum = 0;
    state.rowFracs.forEach((frac, index) => {
      sum += frac;
      if (index < state.rowFracs.length - 1) {
        offsets.push(sum);
      }
    });
    return offsets;
  }, [state.rowFracs]);

  const handleAddColumn = useCallback(() => {
    setState((prev) => {
      const rowsCount = prev.rowFracs.length;
      const newCell: Cell = {
        id: crypto.randomUUID(),
        title: "새 셀",
        span: rowsCount,
      };
      const newColumn: Column = {
        id: crypto.randomUUID(),
        frac: prev.columns.length === 0 ? 1 : 1 / (prev.columns.length + 1),
        cells: [newCell],
      };

      if (prev.columns.length === 0) {
        return {
          ...prev,
          columns: [newColumn],
          cardsByCell: {
            ...prev.cardsByCell,
            [newCell.id]: [],
          },
        };
      }

      const shrinkFactor = 1 - newColumn.frac;
      const nextColumns = [
        ...prev.columns.map((column) => ({
          ...column,
          frac: column.frac * shrinkFactor,
        })),
        newColumn,
      ];

      return {
        ...prev,
        columns: normalizeFracs(nextColumns),
        cardsByCell: {
          ...prev.cardsByCell,
          [newCell.id]: [],
        },
      };
    });
  }, []);

  const handleAddCard = useCallback((cellId: string, title: string) => {
    setState((prev) => {
      const cards = prev.cardsByCell[cellId] ?? [];
      return {
        ...prev,
        cardsByCell: {
          ...prev.cardsByCell,
          [cellId]: [...cards, { id: crypto.randomUUID(), title }],
        },
      };
    });
  }, []);

  const handleRemoveCard = useCallback((cellId: string, cardId: string) => {
    setState((prev) => {
      const cards = prev.cardsByCell[cellId] ?? [];
      return {
        ...prev,
        cardsByCell: {
          ...prev.cardsByCell,
          [cellId]: cards.filter((card) => card.id !== cardId),
        },
      };
    });
  }, []);

  const handleUpdateCellTitle = useCallback((cellId: string, title: string) => {
    setState((prev) => ({
      ...prev,
      columns: prev.columns.map((column) => ({
        ...column,
        cells: column.cells.map((cell) =>
          cell.id === cellId
            ? {
                ...cell,
                title,
              }
            : cell,
        ),
      })),
    }));
  }, []);

  const handleDeleteCell = useCallback((columnIndex: number, cellIndex: number) => {
    setState((prev) => {
      const targetColumn = prev.columns[columnIndex];
      if (!targetColumn) {
        return prev;
      }

      const cells = targetColumn.cells.map((cell) => ({ ...cell }));
      const [removedCell] = cells.splice(cellIndex, 1);
      if (!removedCell) {
        return prev;
      }

      const nextCards = { ...prev.cardsByCell };
      delete nextCards[removedCell.id];

      if (cells.length === 0) {
        const nextColumns = prev.columns
          .filter((_, index) => index !== columnIndex)
          .map((column) => ({
            ...column,
            cells: column.cells.map((cell) => ({ ...cell })),
          }));
        return {
          ...prev,
          columns: normalizeFracs(nextColumns),
          cardsByCell: nextCards,
        };
      }

      const redistributed = absorbSpanAfterRemoval(cells, cellIndex, removedCell.span);
      const nextColumns = prev.columns.map((column, index) => {
        if (index !== columnIndex) {
          return {
            ...column,
            cells: column.cells.map((cell) => ({ ...cell })),
          };
        }
        return {
          ...column,
          cells: redistributed,
        };
      });

      return {
        ...prev,
        columns: nextColumns,
        cardsByCell: nextCards,
      };
    });
  }, []);

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { destination, source } = result;
      if (!destination) {
        return;
      }

      const quadrant = parseQuadrantId(destination.droppableId);
      if (!quadrant) {
        return;
      }

      const sourceColumnIndex = parseColumnDroppableId(source.droppableId);
      if (sourceColumnIndex === null) {
        return;
      }

      setState((prev) => {
        const destinationInfo = resolveDestination(
          prev.columns,
          quadrant,
          sourceColumnIndex,
          source.index,
        );

        if (!destinationInfo) {
          return prev;
        }

        if (destinationInfo.columnIndex === sourceColumnIndex) {
          const nextColumns = prev.columns.map((column, columnIndex) => {
            if (columnIndex !== sourceColumnIndex) {
              return {
                ...column,
                cells: column.cells.map((cell) => ({ ...cell })),
              };
            }
            const cells = column.cells.map((cell) => ({ ...cell }));
            const [movedCell] = cells.splice(source.index, 1);
            if (!movedCell) {
              return {
                ...column,
                cells,
              };
            }
            const insertIndex = clamp(
              destinationInfo.insertIndex,
              0,
              cells.length,
            );
            cells.splice(insertIndex, 0, movedCell);
            return {
              ...column,
              cells,
            };
          });

          return {
            ...prev,
            columns: nextColumns,
          };
        }

        const workingColumns = prev.columns.map((column) => ({
          ...column,
          cells: column.cells.map((cell) => ({ ...cell })),
        }));

        const sourceColumn = workingColumns[sourceColumnIndex];
        if (!sourceColumn) {
          return prev;
        }

        const [movedCell] = sourceColumn.cells.splice(source.index, 1);
        if (!movedCell) {
          return prev;
        }

        let removedColumn = false;
        if (sourceColumn.cells.length === 0) {
          workingColumns.splice(sourceColumnIndex, 1);
          removedColumn = true;
        } else {
          workingColumns[sourceColumnIndex] = {
            ...sourceColumn,
            cells: absorbSpanAfterRemoval(
              sourceColumn.cells,
              source.index,
              movedCell.span,
            ),
          };
        }

        let destinationColumnIndex = destinationInfo.columnIndex;
        if (removedColumn && destinationColumnIndex > sourceColumnIndex) {
          destinationColumnIndex -= 1;
        }
        destinationColumnIndex = clamp(
          destinationColumnIndex,
          0,
          Math.max(workingColumns.length - 1, 0),
        );

        const targetColumn = workingColumns[destinationColumnIndex];
        if (!targetColumn) {
          return prev;
        }

        const nextCells = insertCellWithClamp(
          targetColumn.cells,
          destinationInfo.insertIndex,
          movedCell,
          rows,
        );

        workingColumns[destinationColumnIndex] = {
          ...targetColumn,
          cells: nextCells,
        };

        const normalizedColumns = removedColumn
          ? normalizeFracs(workingColumns)
          : workingColumns;

        return {
          ...prev,
          columns: normalizedColumns,
        };
      });
    },
    [rows],
  );

  const startColumnResize = useCallback(
    (index: number) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (!boardRect.width || state.columns.length <= index + 1) {
        return;
      }
      event.preventDefault();
      const width = boardRect.width;
      const minFrac = Math.min(0.5, MIN_COL_PX / width);
      const startX = event.clientX;
      const initialFracs = state.columns.map((column) => column.frac);
      setActiveColumnHandle(index);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaPx = moveEvent.clientX - startX;
        const deltaFrac = deltaPx / width;
        setState((prev) => {
          const leftIndex = index;
          const rightIndex = index + 1;
          const total = initialFracs[leftIndex] + initialFracs[rightIndex];
          const effectiveMin = Math.min(minFrac, total / 2);
          const nextLeft = clamp(
            initialFracs[leftIndex] + deltaFrac,
            effectiveMin,
            total - effectiveMin,
          );
          const nextRight = total - nextLeft;
          return {
            ...prev,
            columns: prev.columns.map((column, columnIndex) => {
              if (columnIndex === leftIndex) {
                return {
                  ...column,
                  frac: nextLeft,
                };
              }
              if (columnIndex === rightIndex) {
                return {
                  ...column,
                  frac: nextRight,
                };
              }
              return column;
            }),
          };
        });
      };

      const handlePointerUp = () => {
        setActiveColumnHandle(null);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [boardRect.width, state.columns],
  );

  const startRowResize = useCallback(
    (index: number) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (!boardRect.height || state.rowFracs.length <= index + 1) {
        return;
      }
      event.preventDefault();
      const height = boardRect.height;
      const minFrac = Math.min(0.5, MIN_ROW_PX / height);
      const startY = event.clientY;
      const initialFracs = state.rowFracs;
      setActiveRowHandle(index);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaPx = moveEvent.clientY - startY;
        const deltaFrac = deltaPx / height;
        setState((prev) => {
          const upper = initialFracs[index];
          const lower = initialFracs[index + 1];
          const total = upper + lower;
          const effectiveMin = Math.min(minFrac, total / 2);
          const nextUpper = clamp(upper + deltaFrac, effectiveMin, total - effectiveMin);
          const nextLower = total - nextUpper;
          const nextFracs = [...prev.rowFracs];
          nextFracs[index] = nextUpper;
          nextFracs[index + 1] = nextLower;
          return {
            ...prev,
            rowFracs: nextFracs,
          };
        });
      };

      const handlePointerUp = () => {
        setActiveRowHandle(null);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [boardRect.height, state.rowFracs],
  );

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-50">Advanced Kanban</h1>
            <p className="text-sm text-zinc-400">
              셀 헤더를 드래그하여 배치하고, 가장자리로 드랍해 위치를 조정하세요.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddColumn}
            className="inline-flex items-center gap-2 rounded bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          >
            + 새 컬럼
          </button>
        </header>
        <SelfCheckBadge
          columns={state.columns}
          rowFracs={state.rowFracs}
          boardWidth={boardRect.width}
          rows={rows}
        />
        <div className="relative h-[90vh] w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <div
            ref={boardRef}
            className="relative flex h-full w-full overflow-hidden"
          >
            <DragDropContext onDragEnd={handleDragEnd}>
              {state.columns.map((column, columnIndex) => (
                <div
                  key={column.id}
                  className="relative flex h-full flex-col px-3"
                  style={{
                    width: `${(column.frac * 100).toFixed(4)}%`,
                    flexBasis: `${(column.frac * 100).toFixed(4)}%`,
                    flexGrow: 0,
                    flexShrink: 0,
                  }}
                >
                  <Droppable
                    droppableId={`col-${columnIndex}`}
                    type="CELL"
                    isDropDisabled
                  >
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="grid h-full w-full"
                        style={{ gridTemplateRows }}
                      >
                        {column.cells.map((cell, cellIndex) => (
                          <Draggable
                            key={cell.id}
                            draggableId={cell.id}
                            index={cellIndex}
                          >
                            {(draggableProvided, snapshot) => (
                              <div
                                ref={draggableProvided.innerRef}
                                {...draggableProvided.draggableProps}
                                className="p-2"
                                style={{
                                  ...draggableProvided.draggableProps.style,
                                  gridRow: `span ${cell.span}`,
                                }}
                              >
                                <CellCard
                                  cell={cell}
                                  columnIndex={columnIndex}
                                  cellIndex={cellIndex}
                                  cards={state.cardsByCell[cell.id] ?? []}
                                  dragHandleProps={draggableProvided.dragHandleProps}
                                  isDragging={snapshot.isDragging}
                                  onAddCard={handleAddCard}
                                  onRemoveCard={handleRemoveCard}
                                  onDeleteCell={() => handleDeleteCell(columnIndex, cellIndex)}
                                  onUpdateCellTitle={handleUpdateCellTitle}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </DragDropContext>
            {columnOffsets.map((offset, index) => (
              <div
                key={`col-divider-${offset}`}
                className="pointer-events-none absolute inset-y-0 z-30 flex"
                style={{
                  left: `${(offset * 100).toFixed(4)}%`,
                  transform: "translateX(-50%)",
                }}
              >
                <div className="relative flex h-full w-6 justify-center">
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    className={`pointer-events-auto h-full w-1 cursor-ew-resize rounded-full transition-colors ${
                      activeColumnHandle === index
                        ? "bg-sky-500"
                        : "bg-zinc-600 hover:bg-sky-500"
                    }`}
                    onPointerDown={startColumnResize(index)}
                  />
                </div>
              </div>
            ))}
            {rowOffsets.map((offset, index) => (
              <div
                key={`row-divider-${offset}`}
                className="pointer-events-none absolute inset-x-0 z-30 flex"
                style={{
                  top: `${(offset * 100).toFixed(4)}%`,
                  transform: "translateY(-50%)",
                }}
              >
                <div className="relative h-6 w-full">
                  <div
                    role="separator"
                    aria-orientation="horizontal"
                    className={`pointer-events-auto h-1 w-full cursor-ns-resize rounded-full transition-colors ${
                      activeRowHandle === index
                        ? "bg-sky-500"
                        : "bg-zinc-600 hover:bg-sky-500"
                    }`}
                    onPointerDown={startRowResize(index)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Board;
