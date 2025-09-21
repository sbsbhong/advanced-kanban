export type Task = {
  id: string;
  title: string;
};

export type Cell = {
  id: string;
  title: string;
  height: number;
};

export type Column = {
  id: string;
  title: string;
  cells: Cell[];
};

export type BoardState = {
  columns: Column[];
  tasksByCell: Record<string, Task[]>;
};
