"use client";

import {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box, Button, Flex, Heading, Input, Text, VStack, chakra } from "@chakra-ui/react";
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
import { BoardState, Card, Cell, Column, QuadrantDirection } from "@/types/board";

const INITIAL_ROWS = [0.34, 0.33, 0.33];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

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
  if (directionPart !== "top" && directionPart !== "bottom" && directionPart !== "left" && directionPart !== "right") {
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

const parseCardDroppableId = (id: string) => {
  if (!id.startsWith("cards-")) {
    return null;
  }
  return id.slice("cards-".length);
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

  const seedCards = (cell: Cell, titles: string[]) => {
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
  const widthSum = columns.reduce((total, column) => total + column.frac * boardWidth, 0);
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
    <Flex wrap="wrap" gap={2} fontSize="xs" color="gray.200">
      {items.map((item) => (
        <Flex
          key={item.label}
          align="center"
          borderWidth="1px"
          borderColor={item.ok ? "green.400" : "orange.400"}
          bg={item.ok ? "rgba(34,197,94,0.12)" : "rgba(251,191,36,0.12)"}
          px={3}
          py={1}
          borderRadius="full"
          fontWeight="medium"
        >
          <Text mr={2}>{item.ok ? "✅" : "⚠️"}</Text>
          <Text>{item.label}</Text>
        </Flex>
      ))}
    </Flex>
  );
};

const QuadrantDroppable = ({ droppableId, style }: { droppableId: string; style: CSSProperties }) => (
  <Droppable droppableId={droppableId} type="CELL">
    {(provided: DroppableProvided, snapshot: DroppableStateSnapshot) => (
      <Box
        ref={provided.innerRef}
        {...provided.droppableProps}
        style={{
          pointerEvents: "none",
          borderWidth: "1px",
          borderStyle: "dashed",
          borderColor: snapshot.isDraggingOver ? "rgba(56,189,248,0.6)" : "rgba(113,113,122,0.6)",
          background: snapshot.isDraggingOver ? "rgba(56,189,248,0.18)" : "transparent",
          opacity: snapshot.isDraggingOver ? 0.9 : 0,
          transition: "opacity 0.15s ease, border-color 0.15s ease",
          borderRadius: "8px",
          ...style,
        }}
      >
        {provided.placeholder}
      </Box>
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
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const title = newCardTitle.trim() || "새 카드";
      onAddCard(cell.id, title);
      setNewCardTitle("");
    },
    [cell.id, newCardTitle, onAddCard],
  );

  const droppableId = `cards-${cell.id}`;
  const minimumHeight = `${Math.max(cell.span * MIN_ROW_PX, 160)}px`;

  return (
    <Box
      position="relative"
      display="flex"
      flexDirection="column"
      overflow="hidden"
      borderWidth="1px"
      borderColor="gray.700"
      bg="gray.800"
      rounded="lg"
      shadow={isDragging ? "xl" : "md"}
      zIndex={isDragging ? 20 : 10}
      minH={minimumHeight}
    >
      <QuadrantDroppable
        droppableId={`quad:${columnIndex}:${cellIndex}:top`}
        style={{ position: "absolute", left: "12px", right: "12px", top: "8px", height: "26%" }}
      />
      <QuadrantDroppable
        droppableId={`quad:${columnIndex}:${cellIndex}:bottom`}
        style={{ position: "absolute", left: "12px", right: "12px", bottom: "8px", height: "26%" }}
      />
      <QuadrantDroppable
        droppableId={`quad:${columnIndex}:${cellIndex}:left`}
        style={{ position: "absolute", top: "12px", bottom: "12px", left: "8px", width: "32%" }}
      />
      <QuadrantDroppable
        droppableId={`quad:${columnIndex}:${cellIndex}:right`}
        style={{ position: "absolute", top: "12px", bottom: "12px", right: "8px", width: "32%" }}
      />
      <Flex align="center" justify="space-between" gap={2} borderBottomWidth="1px" borderColor="gray.700" px={3} py={2}>
        {isEditing ? (
          <Input
            ref={inputRef}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter") {
                commitTitle();
              }
              if (event.key === "Escape") {
                setDraftTitle(cell.title);
                setIsEditing(false);
              }
            }}
            size="sm"
            bg="gray.900"
            borderColor="gray.600"
            _focus={{ borderColor: "blue.400", boxShadow: "0 0 0 1px rgba(56,189,248,0.4)" }}
          />
        ) : (
          <Flex flex="1" align="center" gap={2} onDoubleClick={() => setIsEditing(true)}>
            <Box
              as="span"
              cursor="grab"
              userSelect="none"
              px={2}
              py={1}
              fontSize="xs"
              fontWeight="semibold"
              textTransform="uppercase"
              bg="gray.700"
              color="gray.100"
              borderRadius="md"
              aria-label="셀 드래그 핸들"
              aria-grabbed={isDragging}
              {...(dragHandleProps ?? {})}
            >
              Move
            </Box>
            <Text fontSize="sm" fontWeight="semibold" color="gray.100">
              {cell.title}
            </Text>
          </Flex>
        )}
        <Button
          aria-label="셀 삭제"
          size="sm"
          variant="ghost"
          colorScheme="red"
          borderRadius="full"
          onClick={onDeleteCell}
        >
          ✕
        </Button>
      </Flex>
      <Flex direction="column" flex="1" overflow="hidden">
        <Droppable droppableId={droppableId} type="CARD">
          {(provided, snapshot) => (
            <VStack
              ref={provided.innerRef}
              {...provided.droppableProps}
              align="stretch"
              gap={2}
              flex="1"
              overflowY="auto"
              px={3}
              py={3}
              bg={snapshot.isDraggingOver ? "rgba(56,189,248,0.08)" : "transparent"}
              borderRadius="md"
              minH={`${Math.max(cell.span * MIN_ROW_PX - 96, 120)}px`}
            >
              {cards.length === 0 ? (
                <Text fontSize="sm" color="gray.400">
                  카드를 추가하세요.
                </Text>
              ) : (
                cards.map((card, index) => (
                  <Draggable key={card.id} draggableId={card.id} index={index}>
                    {(cardProvided, cardSnapshot) => (
                      <Box
                        ref={cardProvided.innerRef}
                        {...cardProvided.draggableProps}
                        {...cardProvided.dragHandleProps}
                        position="relative"
                        borderWidth="1px"
                        borderColor={cardSnapshot.isDragging ? "blue.300" : "gray.600"}
                        bg={cardSnapshot.isDragging ? "gray.700" : "gray.700"}
                        rounded="md"
                        p={3}
                        shadow={cardSnapshot.isDragging ? "lg" : undefined}
                      >
                        <Text pr={6} fontSize="sm" color="gray.100">
                          {card.title}
                        </Text>
                        <Button
                          aria-label="카드 삭제"
                          size="xs"
                          variant="ghost"
                          colorScheme="red"
                          borderRadius="full"
                          position="absolute"
                          top={2}
                          right={2}
                          minW="auto"
                          h={6}
                          w={6}
                          onClick={() => onRemoveCard(cell.id, card.id)}
                        >
                          ✕
                        </Button>
                      </Box>
                    )}
                  </Draggable>
                ))
              )}
              {provided.placeholder}
            </VStack>
          )}
        </Droppable>
        <chakra.form
          onSubmit={handleAddCard}
          borderTopWidth="1px"
          borderColor="gray.700"
          px={3}
          py={2}
          bg="gray.900"
        >
          <Text fontSize="xs" fontWeight="semibold" textTransform="uppercase" color="gray.300" mb={2}>
            새 카드
          </Text>
          <Input
            value={newCardTitle}
            onChange={(event) => setNewCardTitle(event.target.value)}
            placeholder="제목을 입력하세요"
            size="sm"
            bg="gray.900"
            borderColor="gray.600"
            _placeholder={{ color: "gray.500" }}
            _focus={{ borderColor: "blue.400", boxShadow: "0 0 0 1px rgba(56,189,248,0.4)" }}
          />
          <Button type="submit" size="sm" mt={2} colorScheme="blue">
            + 카드 추가
          </Button>
        </chakra.form>
      </Flex>
    </Box>
  );
};

const Board = () => {
  const [state, setState] = useState<BoardState>(() => createInitialBoard());
  const [boardRef, boardRect] = useElementRect<HTMLDivElement>();
  const [activeColumnHandle, setActiveColumnHandle] = useState<number | null>(null);
  const [activeRowHandle, setActiveRowHandle] = useState<number | null>(null);

  const rows = state.rowFracs.length;
  const boardMinHeight = useMemo(() => Math.max(rows * MIN_ROW_PX, 480), [rows]);

  const gridTemplateRows = useMemo(
    () => state.rowFracs.map((frac) => `${(frac * 100).toFixed(3)}%`).join(" "),
    [state.rowFracs],
  );

  const columnOffsets = useMemo(() => {
    if (state.columns.length <= 1) {
      return [] as number[];
    }
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
    if (state.rowFracs.length <= 1) {
      return [] as number[];
    }
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
          cells: column.cells.map((cell) => ({ ...cell })),
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
            : { ...cell },
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
      const { destination, source, type } = result;
      if (!destination) {
        return;
      }

      if (type === "CARD") {
        const sourceCellId = parseCardDroppableId(source.droppableId);
        const destinationCellId = parseCardDroppableId(destination.droppableId);
        if (!sourceCellId || !destinationCellId) {
          return;
        }

        if (sourceCellId === destinationCellId && source.index === destination.index) {
          return;
        }

        setState((prev) => {
          const sourceCards = [...(prev.cardsByCell[sourceCellId] ?? [])];
          const movedCard = sourceCards[source.index];
          if (!movedCard) {
            return prev;
          }
          sourceCards.splice(source.index, 1);
          const nextCardsByCell = { ...prev.cardsByCell };

          if (sourceCellId === destinationCellId) {
            const insertIndex = clamp(destination.index, 0, sourceCards.length);
            sourceCards.splice(insertIndex, 0, movedCard);
            nextCardsByCell[sourceCellId] = sourceCards;
          } else {
            nextCardsByCell[sourceCellId] = sourceCards;
            const targetCards = [...(nextCardsByCell[destinationCellId] ?? [])];
            const insertIndex = clamp(destination.index, 0, targetCards.length);
            targetCards.splice(insertIndex, 0, movedCard);
            nextCardsByCell[destinationCellId] = targetCards;
          }

          return {
            ...prev,
            cardsByCell: nextCardsByCell,
          };
        });
        return;
      }

      if (type !== "CELL") {
        return;
      }

      const sourceColumnIndex = parseColumnDroppableId(source.droppableId);
      if (sourceColumnIndex === null) {
        return;
      }

      setState((prev) => {
        let destinationInfo: { columnIndex: number; insertIndex: number } | null = null;
        const quadrant = parseQuadrantId(destination.droppableId);
        if (quadrant) {
          destinationInfo = resolveDestination(prev.columns, quadrant, sourceColumnIndex, source.index);
        } else {
          const columnIndex = parseColumnDroppableId(destination.droppableId);
          if (columnIndex !== null) {
            destinationInfo = {
              columnIndex,
              insertIndex: destination.index,
            };
          }
        }

        if (!destinationInfo) {
          return prev;
        }

        if (destinationInfo.columnIndex === sourceColumnIndex) {
          const targetColumn = prev.columns[sourceColumnIndex];
          if (!targetColumn) {
            return prev;
          }
          const cells = targetColumn.cells.map((cell) => ({ ...cell }));
          const [movedCell] = cells.splice(source.index, 1);
          if (!movedCell) {
            return prev;
          }
          const insertIndex = clamp(destinationInfo.insertIndex, 0, cells.length);
          cells.splice(insertIndex, 0, movedCell);
          const nextColumns = prev.columns.map((column, index) =>
            index === sourceColumnIndex
              ? {
                  ...column,
                  cells,
                }
              : {
                  ...column,
                  cells: column.cells.map((cell) => ({ ...cell })),
                },
          );

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
            cells: absorbSpanAfterRemoval(sourceColumn.cells, source.index, movedCell.span),
          };
        }

        let destinationColumnIndex = destinationInfo.columnIndex;
        if (removedColumn && destinationColumnIndex > sourceColumnIndex) {
          destinationColumnIndex -= 1;
        }
        destinationColumnIndex = clamp(destinationColumnIndex, 0, Math.max(workingColumns.length - 1, 0));

        const targetColumn = workingColumns[destinationColumnIndex];
        if (!targetColumn) {
          return prev;
        }

        const nextCells = insertCellWithClamp(targetColumn.cells, destinationInfo.insertIndex, movedCell, rows);

        workingColumns[destinationColumnIndex] = {
          ...targetColumn,
          cells: nextCells,
        };

        const normalizedColumns = removedColumn ? normalizeFracs(workingColumns) : workingColumns;

        return {
          ...prev,
          columns: normalizedColumns,
        };
      });
    },
    [rows],
  );

  const startColumnResize = useCallback(
    (index: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
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
          const nextLeft = clamp(initialFracs[leftIndex] + deltaFrac, effectiveMin, total - effectiveMin);
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
    (index: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
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
    <Flex direction="column" minH="100vh" bg="gray.900" color="gray.100">
      <Flex direction="column" flex="1" maxW="6xl" w="full" mx="auto" px={6} py={6} gap={6}>
        <Flex align="center" justify="space-between" flexWrap="wrap" gap={3}>
          <Box>
            <Heading size="lg" color="gray.50">
              Advanced Kanban
            </Heading>
            <Text fontSize="sm" color="gray.400">
              셀 헤더를 드래그하여 배치하고, 가장자리로 드랍해 위치를 조정하세요.
            </Text>
          </Box>
          <Button type="button" onClick={handleAddColumn} colorScheme="blue">
            + 새 컬럼
          </Button>
        </Flex>
        <SelfCheckBadge columns={state.columns} rowFracs={state.rowFracs} boardWidth={boardRect.width} rows={rows} />
        <Box
          position="relative"
          flex="1"
          minH={`${boardMinHeight}px`}
          maxH="90vh"
          w="full"
          overflow="hidden"
          borderWidth="1px"
          borderColor="gray.800"
          bg="gray.900"
          rounded="xl"
          display="flex"
        >
          <Box ref={boardRef} position="relative" flex="1" overflow="auto">
            <DragDropContext onDragEnd={handleDragEnd}>
              <Flex h="full" w="full">
                {state.columns.map((column, columnIndex) => (
                  <Flex
                    key={column.id}
                    position="relative"
                    direction="column"
                    px={3}
                    h="full"
                    style={{
                      width: `${(column.frac * 100).toFixed(4)}%`,
                      flexBasis: `${(column.frac * 100).toFixed(4)}%`,
                      flexGrow: 0,
                      flexShrink: 0,
                    }}
                  >
                    <Droppable droppableId={`col-${columnIndex}`} type="CELL">
                      {(provided) => (
                        <Box
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          display="grid"
                          h="full"
                          w="full"
                          gridTemplateRows={gridTemplateRows}
                        >
                          {column.cells.map((cell, cellIndex) => (
                            <Draggable key={cell.id} draggableId={cell.id} index={cellIndex}>
                              {(draggableProvided, snapshot) => (
                                <Box
                                  ref={draggableProvided.innerRef}
                                  {...draggableProvided.draggableProps}
                                  style={{
                                    ...draggableProvided.draggableProps.style,
                                    gridRow: `span ${cell.span}`,
                                  }}
                                  p={2}
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
                                </Box>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </Box>
                      )}
                    </Droppable>
                  </Flex>
                ))}
              </Flex>
            </DragDropContext>
            {columnOffsets.map((offset, index) => (
              <Box
                key={`col-divider-${offset}`}
                position="absolute"
                insetY={0}
                zIndex={30}
                display="flex"
                pointerEvents="none"
                left={`${(offset * 100).toFixed(4)}%`}
                transform="translateX(-50%)"
              >
                <Box position="relative" h="full" w={6} display="flex" justifyContent="center">
                  <Box
                    role="separator"
                    aria-orientation="vertical"
                    pointerEvents="auto"
                    h="full"
                    w={1}
                    cursor="ew-resize"
                    borderRadius="full"
                    bg={activeColumnHandle === index ? "blue.400" : "gray.600"}
                    _hover={{ bg: "blue.400" }}
                    onPointerDown={startColumnResize(index)}
                  />
                </Box>
              </Box>
            ))}
            {rowOffsets.map((offset, index) => (
              <Box
                key={`row-divider-${offset}`}
                position="absolute"
                insetX={0}
                zIndex={30}
                display="flex"
                pointerEvents="none"
                top={`${(offset * 100).toFixed(4)}%`}
                transform="translateY(-50%)"
              >
                <Box position="relative" w="full" h={6}>
                  <Box
                    role="separator"
                    aria-orientation="horizontal"
                    pointerEvents="auto"
                    h={1}
                    w="full"
                    cursor="ns-resize"
                    borderRadius="full"
                    bg={activeRowHandle === index ? "blue.400" : "gray.600"}
                    _hover={{ bg: "blue.400" }}
                    onPointerDown={startRowResize(index)}
                  />
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Flex>
    </Flex>
  );
};

export default Board;
