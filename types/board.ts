export type Card = {
  id: string;
  title: string;
};

export type Cell = {
  id: string;
  title: string;
  span: number;
};

export type Column = {
  id: string;
  frac: number;
  cells: Cell[];
};

export type BoardState = {
  columns: Column[];
  cardsByCell: Record<string, Card[]>;
  rowFracs: number[];
};

export type QuadrantDirection = "top" | "bottom" | "left" | "right";
