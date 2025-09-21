"use client";

import {
  ChangeEvent,
  FormEvent,
  Fragment,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  Input,
  Text,
  chakra,
} from "@chakra-ui/react";
import {
  DragDropContext,
  Draggable,
  DraggableProvidedDragHandleProps,
  DropResult,
  Droppable,
} from "@hello-pangea/dnd";
import { AddIcon, DeleteIcon, DragHandleIcon } from "@chakra-ui/icons";
import { BoardState, Cell, Column, Task } from "@/types/board";
import { arrayMove, clamp } from "@/lib/boardUtils";

const BOARD_MIN_HEIGHT = 560;
const COLUMN_MIN_HEIGHT = 420;
const CELL_MIN_HEIGHT_PX = 96;

const createId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

const cellsDroppableId = (columnId: string) => `cells-${columnId}`;
const tasksDroppableId = (cellId: string) => `tasks-${cellId}`;

const parseCellsDroppableId = (id: string) => (id.startsWith("cells-") ? id.slice(6) : null);
const parseTasksDroppableId = (id: string) => (id.startsWith("tasks-") ? id.slice(6) : null);

const createInitialBoard = (): BoardState => {
  const columnA: Column = {
    id: createId(),
    title: "아이디어",
    cells: [
      { id: createId(), title: "아이디어 풀", height: 1 },
      { id: createId(), title: "요구사항 정리", height: 1 },
    ],
  };

  const columnB: Column = {
    id: createId(),
    title: "진행 중",
    cells: [
      { id: createId(), title: "설계", height: 1 },
      { id: createId(), title: "개발", height: 1 },
      { id: createId(), title: "리뷰", height: 1 },
    ],
  };

  const columnC: Column = {
    id: createId(),
    title: "출시",
    cells: [
      { id: createId(), title: "출시 준비", height: 1 },
      { id: createId(), title: "완료", height: 1 },
    ],
  };

  const tasksByCell: BoardState["tasksByCell"] = {
    [columnA.cells[0].id]: [
      { id: createId(), title: "시장 조사" },
      { id: createId(), title: "사용자 인터뷰" },
    ],
    [columnA.cells[1].id]: [{ id: createId(), title: "MVP 정의" }],
    [columnB.cells[0].id]: [{ id: createId(), title: "IA 설계" }],
    [columnB.cells[1].id]: [
      { id: createId(), title: "프론트엔드" },
      { id: createId(), title: "백엔드" },
    ],
    [columnB.cells[2].id]: [{ id: createId(), title: "QA 준비" }],
    [columnC.cells[0].id]: [
      { id: createId(), title: "런북 작성" },
      { id: createId(), title: "시장 공지" },
    ],
    [columnC.cells[1].id]: [{ id: createId(), title: "배포 완료" }],
  };

  return {
    columns: [columnA, columnB, columnC],
    tasksByCell,
  };
};

type InlineTitleInputProps = {
  value: string;
  fallback: string;
  onCommit: (value: string) => void;
  fontSize?: string;
  ariaLabel?: string;
};

const InlineTitleInput = ({ value, fallback, onCommit, fontSize, ariaLabel }: InlineTitleInputProps) => {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    onCommit(trimmed.length > 0 ? trimmed : fallback);
  }, [draft, fallback, onCommit]);

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
        event.currentTarget.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDraft(value);
        event.currentTarget.blur();
      }
    },
    [commit, value],
  );

  return (
    <chakra.input
      value={draft}
      onChange={handleChange}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      fontSize={fontSize}
      fontWeight="semibold"
      color={{ base: "gray.700", _dark: "gray.100" }}
      placeholder={fallback}
      aria-label={ariaLabel}
      minW="0"
      px={1}
      py={1}
      border="none"
      bg="transparent"
      borderRadius="md"
      _focusVisible={{
        outline: "none",
        boxShadow: "0 0 0 1px var(--chakra-colors-blue-400)",
        bg: { base: "gray.50", _dark: "gray.800" },
      }}
      transition="background-color 0.2s ease, box-shadow 0.2s ease"
    />
  );
};

type CellCardProps = {
  cell: Cell;
  tasks: Task[];
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
  isDragging: boolean;
  hasBottomNeighbor: boolean;
  onAddTask: (cellId: string, title: string) => void;
  onRemoveTask: (cellId: string, taskId: string) => void;
  onDeleteCell: () => void;
  onUpdateCellTitle: (cellId: string, title: string) => void;
  onStartResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

const CellCard = ({
  cell,
  tasks,
  dragHandleProps,
  isDragging,
  hasBottomNeighbor,
  onAddTask,
  onRemoveTask,
  onDeleteCell,
  onUpdateCellTitle,
  onStartResize,
}: CellCardProps) => {
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const dragHandle = dragHandleProps ?? {};

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const value = newTaskTitle.trim() || "새 태스크";
      onAddTask(cell.id, value);
      setNewTaskTitle("");
    },
    [cell.id, newTaskTitle, onAddTask],
  );

  return (
    <Flex
      direction="column"
      height="100%"
      minH={`${CELL_MIN_HEIGHT_PX}px`}
      bg={{ base: "white", _dark: "gray.800" }}
      borderWidth="1px"
      borderColor={{ base: "gray.200", _dark: "gray.700" }}
      borderRadius="lg"
      boxShadow={isDragging ? "lg" : "sm"}
      transition="box-shadow 0.2s ease, transform 0.2s ease"
      transform={isDragging ? "scale(1.02)" : "none"}
      position="relative"
      overflow="visible"
      p={4}
      gap={3}
      data-cell-id={cell.id}
    >
      <Flex align="center" justify="space-between" gap={3}>
        <Flex align="center" gap={2} flex="1" minW="0">
          <IconButton
            aria-label="셀 이동"
            variant="ghost"
            size="sm"
            cursor="grab"
            {...dragHandle}
          >
            <DragHandleIcon boxSize={4} />
          </IconButton>
          <InlineTitleInput
            value={cell.title}
            fallback="무제 셀"
            onCommit={(next) => onUpdateCellTitle(cell.id, next)}
            ariaLabel="셀 제목"
          />
        </Flex>
        <IconButton aria-label="셀 삭제" size="sm" onClick={onDeleteCell} variant="ghost">
          <DeleteIcon boxSize={3} />
        </IconButton>
      </Flex>

      <Droppable droppableId={tasksDroppableId(cell.id)} type="TASK">
        {(provided) => (
          <Flex
            direction="column"
            ref={provided.innerRef}
            {...provided.droppableProps}
            gap={2}
            flex="1"
            overflowY="auto"
            minH="0"
            pr={1}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(taskProvided, taskSnapshot) => (
                  <Box
                    ref={taskProvided.innerRef}
                    {...taskProvided.draggableProps}
                    {...taskProvided.dragHandleProps}
                    p={3}
                    borderWidth="1px"
                    borderColor={
                      taskSnapshot.isDragging ? "blue.300" : { base: "gray.200", _dark: "gray.700" }
                    }
                    bg={
                      taskSnapshot.isDragging
                        ? { base: "blue.50", _dark: "blue.700" }
                        : { base: "gray.50", _dark: "gray.900" }
                    }
                    borderRadius="md"
                    boxShadow={taskSnapshot.isDragging ? "md" : "sm"}
                  >
                    <Flex align="center" justify="space-between" gap={3}>
                      <Text fontWeight="medium" flex="1">
                        {task.title}
                      </Text>
                      <IconButton
                        aria-label="태스크 삭제"
                        size="xs"
                        variant="ghost"
                        onClick={() => onRemoveTask(cell.id, task.id)}
                      >
                        <DeleteIcon boxSize={3} />
                      </IconButton>
                    </Flex>
                  </Box>
                )}
              </Draggable>
            ))}
            {tasks.length === 0 && (
              <Text fontSize="sm" color={{ base: "gray.400", _dark: "gray.500" }} textAlign="center" py={4}>
                태스크를 드롭하거나 추가하세요.
              </Text>
            )}
            {provided.placeholder}
          </Flex>
        )}
      </Droppable>

      <chakra.form onSubmit={handleSubmit} mt="auto" display="flex" gap={2}>
        <Input
          size="sm"
          placeholder="새 태스크"
          value={newTaskTitle}
          onChange={(event) => setNewTaskTitle(event.target.value)}
        />
        <Button type="submit" size="sm" colorScheme="blue">
          추가
        </Button>
      </chakra.form>

      {hasBottomNeighbor && (
        <Box
          position="absolute"
          left={4}
          right={4}
          bottom={-3}
          height="6px"
          borderRadius="full"
          bg="transparent"
          _hover={{ bg: "blue.300" }}
          cursor="row-resize"
          onPointerDown={onStartResize}
          role="separator"
          aria-label="셀 높이 조절"
          zIndex={2}
        />
      )}
    </Flex>
  );
};

const Board = () => {
  const [state, setState] = useState<BoardState>(() => createInitialBoard());
  const columnRefs = useRef<Array<HTMLDivElement | null>>([]);

  const handleAddColumn = useCallback(() => {
    setState((prev) => {
      const columnId = createId();
      const cellId = createId();
      const newColumn: Column = {
        id: columnId,
        title: `새 컬럼 ${prev.columns.length + 1}`,
        cells: [{ id: cellId, title: "새 셀", height: 1 }],
      };
      return {
        columns: [...prev.columns, newColumn],
        tasksByCell: { ...prev.tasksByCell, [cellId]: [] },
      };
    });
  }, []);

  const handleDeleteColumn = useCallback((columnId: string) => {
    setState((prev) => {
      const nextColumns = prev.columns.filter((column) => column.id !== columnId);
      const removedColumn = prev.columns.find((column) => column.id === columnId);
      if (!removedColumn) {
        return prev;
      }
      const nextTasks = { ...prev.tasksByCell };
      removedColumn.cells.forEach((cell) => {
        delete nextTasks[cell.id];
      });
      return {
        columns: nextColumns,
        tasksByCell: nextTasks,
      };
    });
  }, []);

  const handleAddCell = useCallback((columnId: string) => {
    setState((prev) => {
      const nextColumns = prev.columns.map((column) => {
        if (column.id !== columnId) {
          return column;
        }
        const cellId = createId();
        return {
          ...column,
          cells: [...column.cells, { id: cellId, title: "새 셀", height: 1 }],
        };
      });

      const addedColumn = nextColumns.find((column) => column.id === columnId);
      if (!addedColumn) {
        return prev;
      }

      const addedCell = addedColumn.cells[addedColumn.cells.length - 1];
      return {
        columns: nextColumns,
        tasksByCell: { ...prev.tasksByCell, [addedCell.id]: [] },
      };
    });
  }, []);

  const handleDeleteCell = useCallback((columnId: string, cellId: string) => {
    setState((prev) => {
      const nextColumns = prev.columns.map((column) => {
        if (column.id !== columnId) {
          return column;
        }
        return {
          ...column,
          cells: column.cells.filter((cell) => cell.id !== cellId),
        };
      });
      const nextTasks = { ...prev.tasksByCell };
      delete nextTasks[cellId];
      return {
        columns: nextColumns,
        tasksByCell: nextTasks,
      };
    });
  }, []);

  const handleUpdateColumnTitle = useCallback((columnId: string, title: string) => {
    setState((prev) => ({
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title: title.trim() || "무제 컬럼" } : column,
      ),
      tasksByCell: prev.tasksByCell,
    }));
  }, []);

  const handleUpdateCellTitle = useCallback((cellId: string, title: string) => {
    setState((prev) => ({
      columns: prev.columns.map((column) => ({
        ...column,
        cells: column.cells.map((cell) =>
          cell.id === cellId ? { ...cell, title: title.trim() || "무제 셀" } : cell,
        ),
      })),
      tasksByCell: prev.tasksByCell,
    }));
  }, []);

  const handleAddTask = useCallback((cellId: string, title: string) => {
    setState((prev) => {
      const nextTasks = { ...prev.tasksByCell };
      const tasks = nextTasks[cellId] ? [...nextTasks[cellId]] : [];
      tasks.push({ id: createId(), title });
      nextTasks[cellId] = tasks;
      return {
        columns: prev.columns,
        tasksByCell: nextTasks,
      };
    });
  }, []);

  const handleRemoveTask = useCallback((cellId: string, taskId: string) => {
    setState((prev) => {
      const nextTasks = { ...prev.tasksByCell };
      const tasks = nextTasks[cellId];
      if (!tasks) {
        return prev;
      }
      nextTasks[cellId] = tasks.filter((task) => task.id !== taskId);
      return {
        columns: prev.columns,
        tasksByCell: nextTasks,
      };
    });
  }, []);

  const handleDragEnd = useCallback((result: DropResult) => {
    const { source, destination, type } = result;
    if (!destination) {
      return;
    }

    if (type === "CELL") {
      setState((prev) => {
        const sourceColumnId = parseCellsDroppableId(source.droppableId);
        const destinationColumnId = parseCellsDroppableId(destination.droppableId);
        if (!sourceColumnId || !destinationColumnId) {
          return prev;
        }

        const sourceColumnIndex = prev.columns.findIndex((column) => column.id === sourceColumnId);
        const destinationColumnIndex = prev.columns.findIndex(
          (column) => column.id === destinationColumnId,
        );
        if (sourceColumnIndex === -1 || destinationColumnIndex === -1) {
          return prev;
        }

        if (sourceColumnIndex === destinationColumnIndex) {
          const column = prev.columns[sourceColumnIndex];
          const nextCells = arrayMove(column.cells, source.index, destination.index);
          if (nextCells === column.cells) {
            return prev;
          }
          const nextColumns = [...prev.columns];
          nextColumns[sourceColumnIndex] = { ...column, cells: nextCells };
          return {
            columns: nextColumns,
            tasksByCell: prev.tasksByCell,
          };
        }

        const nextColumns = prev.columns.map((column) => ({ ...column, cells: [...column.cells] }));
        const [movedCell] = nextColumns[sourceColumnIndex].cells.splice(source.index, 1);
        if (!movedCell) {
          return prev;
        }
        const targetCells = nextColumns[destinationColumnIndex].cells;
        const insertIndex = clamp(destination.index, 0, targetCells.length);
        targetCells.splice(insertIndex, 0, movedCell);
        return {
          columns: nextColumns,
          tasksByCell: prev.tasksByCell,
        };
      });
      return;
    }

    if (type === "TASK") {
      setState((prev) => {
        const sourceCellId = parseTasksDroppableId(source.droppableId);
        const destinationCellId = parseTasksDroppableId(destination.droppableId);
        if (!sourceCellId || !destinationCellId) {
          return prev;
        }

        const sourceTasks = prev.tasksByCell[sourceCellId] ? [...prev.tasksByCell[sourceCellId]] : [];
        const [movedTask] = sourceTasks.splice(source.index, 1);
        if (!movedTask) {
          return prev;
        }

        const nextTasksByCell = { ...prev.tasksByCell };
        if (sourceCellId === destinationCellId) {
          const insertIndex = clamp(destination.index, 0, sourceTasks.length);
          sourceTasks.splice(insertIndex, 0, movedTask);
          nextTasksByCell[sourceCellId] = sourceTasks;
        } else {
          nextTasksByCell[sourceCellId] = sourceTasks;
          const targetTasks = nextTasksByCell[destinationCellId]
            ? [...nextTasksByCell[destinationCellId]]
            : [];
          const insertIndex = clamp(destination.index, 0, targetTasks.length);
          targetTasks.splice(insertIndex, 0, movedTask);
          nextTasksByCell[destinationCellId] = targetTasks;
        }

        return {
          columns: prev.columns,
          tasksByCell: nextTasksByCell,
        };
      });
    }
  }, []);

  const handleResizeStart = useCallback(
    (columnIndex: number, cellIndex: number, event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const columnElement = columnRefs.current[columnIndex];
      const column = state.columns[columnIndex];
      if (!columnElement || !column) {
        return;
      }

      const topCell = column.cells[cellIndex];
      const bottomCell = column.cells[cellIndex + 1];
      if (!topCell || !bottomCell) {
        return;
      }

      const topElement = columnElement.querySelector<HTMLElement>(`[data-cell-id="${topCell.id}"]`);
      const bottomElement = columnElement.querySelector<HTMLElement>(
        `[data-cell-id="${bottomCell.id}"]`,
      );
      if (!topElement || !bottomElement) {
        return;
      }

      const topRect = topElement.getBoundingClientRect();
      const bottomRect = bottomElement.getBoundingClientRect();
      const totalHeightPx = topRect.height + bottomRect.height;
      if (totalHeightPx <= 0) {
        return;
      }

      const totalHeightWeight = topCell.height + bottomCell.height;
      const startY = event.clientY;
      const minHeightPx = Math.min(CELL_MIN_HEIGHT_PX, totalHeightPx / 2);
      const minRatio = minHeightPx / totalHeightPx;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaY = moveEvent.clientY - startY;
        const nextTopPx = clamp(topRect.height + deltaY, minHeightPx, totalHeightPx - minHeightPx);
        const ratio = clamp(nextTopPx / totalHeightPx, minRatio, 1 - minRatio);
        const nextTopHeight = totalHeightWeight * ratio;
        const nextBottomHeight = totalHeightWeight - nextTopHeight;

        setState((prev) => {
          const nextColumns = prev.columns.map((prevColumn, index) => {
            if (index !== columnIndex) {
              return prevColumn;
            }
            return {
              ...prevColumn,
              cells: prevColumn.cells.map((cell, idx) => {
                if (idx === cellIndex) {
                  return { ...cell, height: nextTopHeight };
                }
                if (idx === cellIndex + 1) {
                  return { ...cell, height: nextBottomHeight };
                }
                return cell;
              }),
            };
          });
          return {
            columns: nextColumns,
            tasksByCell: prev.tasksByCell,
          };
        });
      };

      const handlePointerUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
      };

      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [state.columns],
  );

  return (
    <Box
      w="100%"
      minH={`${BOARD_MIN_HEIGHT}px`}
      px={6}
      py={4}
      display="flex"
      flexDirection="column"
    >
      <Flex justify="space-between" align="center" mb={4}>
        <Heading size="lg">작업 보드</Heading>
        <Button
          colorScheme="blue"
          onClick={handleAddColumn}
          display="inline-flex"
          alignItems="center"
          gap={2}
        >
          <AddIcon />
          컬럼 추가
        </Button>
      </Flex>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Flex
          gap={4}
          align="stretch"
          overflowX="auto"
          overflowY="auto"
          pb={4}
          flex="1"
        >
          {state.columns.map((column, columnIndex) => (
            <Box
              key={column.id}
              bg={{ base: "gray.100", _dark: "gray.900" }}
              borderRadius="xl"
              borderWidth="1px"
              borderColor={{ base: "gray.200", _dark: "gray.700" }}
              minW="320px"
              maxW="340px"
              flexShrink={0}
              p={4}
              display="flex"
              flexDirection="column"
              gap={4}
              minH={`${COLUMN_MIN_HEIGHT}px`}
              height="100%"
            >
              <Flex align="center" justify="space-between" gap={3}>
                <Box flex="1" minW="0">
                  <InlineTitleInput
                    value={column.title}
                    fallback="무제 컬럼"
                    onCommit={(next) => handleUpdateColumnTitle(column.id, next)}
                    fontSize="lg"
                    ariaLabel="컬럼 제목"
                  />
                </Box>
                <IconButton
                  aria-label="컬럼 삭제"
                  onClick={() => handleDeleteColumn(column.id)}
                  variant="ghost"
                  size="sm"
                >
                  <DeleteIcon />
                </IconButton>
              </Flex>

              <Droppable droppableId={cellsDroppableId(column.id)} type="CELL">
                {(provided) => (
                  <Flex
                    ref={(node) => {
                      provided.innerRef(node);
                      columnRefs.current[columnIndex] = node;
                    }}
                    {...provided.droppableProps}
                    direction="column"
                    gap={3}
                    flex="1"
                    minH="200px"
                    position="relative"
                  >
                    {column.cells.map((cell, cellIndex) => (
                      <Fragment key={cell.id}>
                        <Draggable draggableId={cell.id} index={cellIndex}>
                          {(draggableProvided, draggableSnapshot) => (
                            <Box
                              ref={draggableProvided.innerRef}
                              {...draggableProvided.draggableProps}
                              flex={`${cell.height} 1 0`}
                              display="flex"
                              flexDirection="column"
                              minH={`${CELL_MIN_HEIGHT_PX}px`}
                            >
                              <CellCard
                                cell={cell}
                                tasks={state.tasksByCell[cell.id] ?? []}
                                dragHandleProps={draggableProvided.dragHandleProps}
                                isDragging={draggableSnapshot.isDragging}
                                hasBottomNeighbor={cellIndex < column.cells.length - 1}
                                onAddTask={handleAddTask}
                                onRemoveTask={handleRemoveTask}
                                onDeleteCell={() => handleDeleteCell(column.id, cell.id)}
                                onUpdateCellTitle={handleUpdateCellTitle}
                                onStartResize={(event) => handleResizeStart(columnIndex, cellIndex, event)}
                              />
                            </Box>
                          )}
                        </Draggable>
                      </Fragment>
                    ))}
                    {provided.placeholder}
                    {column.cells.length === 0 && (
                      <Box
                        flex="1"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        borderWidth="1px"
                        borderRadius="lg"
                        borderStyle="dashed"
                        borderColor={{ base: "gray.300", _dark: "gray.600" }}
                        py={6}
                        textAlign="center"
                        color={{ base: "gray.500", _dark: "gray.400" }}
                      >
                        셀을 추가하거나 드롭하세요.
                      </Box>
                    )}
                  </Flex>
                )}
              </Droppable>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAddCell(column.id)}
                display="inline-flex"
                alignItems="center"
                gap={2}
              >
                <AddIcon boxSize={3} />
                셀 추가
              </Button>
            </Box>
          ))}
        </Flex>
      </DragDropContext>
    </Box>
  );
};

export default Board;
