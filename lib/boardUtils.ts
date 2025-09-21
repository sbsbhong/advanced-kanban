export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (typeof moved === "undefined") {
    return items;
  }
  const boundedIndex = to < 0 ? 0 : to > next.length ? next.length : to;
  next.splice(boundedIndex, 0, moved);
  return next;
}
