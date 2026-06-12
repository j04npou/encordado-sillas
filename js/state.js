export const MIN_SIZE = 1;
export const MAX_SIZE = 120;

export function createMatrix(rows, cols, fill = false) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

export function resizeMatrix(matrix, rows, cols) {
  const next = createMatrix(rows, cols);
  for (let row = 0; row < Math.min(rows, matrix.length); row += 1) {
    for (let col = 0; col < Math.min(cols, matrix[0]?.length ?? 0); col += 1) {
      next[row][col] = matrix[row][col];
    }
  }
  return next;
}

export function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

export function extractRegion(matrix, rect) {
  return Array.from({ length: rect.height }, (_, row) =>
    Array.from({ length: rect.width }, (_, col) => matrix[rect.y + row][rect.x + col]),
  );
}

export function clearRegion(matrix, rect) {
  for (let row = 0; row < rect.height; row += 1) {
    for (let col = 0; col < rect.width; col += 1) {
      matrix[rect.y + row][rect.x + col] = false;
    }
  }
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function toInt(value, fallback, min = MIN_SIZE, max = MAX_SIZE) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return clamp(parsed, min, max);
}

export const state = {
  rows: 18,
  cols: 24,
  matrix: createMatrix(18, 24),
  tool: "paint",
  mode: "design",
  readDirection: "bottom-up",
  tallCells: false,
  activeColumn: 0,
  importPreview: null,
  selection: null,
  floating: null,
  clipboard: null,
};
