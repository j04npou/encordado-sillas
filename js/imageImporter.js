import { clamp } from "./state.js";

export async function loadImageFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function imageToCells(image, width, height, invert = false) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const cells = [];

  for (let row = 0; row < height; row += 1) {
    const line = [];
    for (let col = 0; col < width; col += 1) {
      const index = (row * width + col) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      if (alpha < 24) {
        line.push(null);
        continue;
      }
      const brightness = 0.299 * red + 0.587 * green + 0.114 * blue;
      const active = brightness < 142;
      line.push(invert ? !active : active);
    }
    cells.push(line);
  }

  return cells;
}

export function createImportPreview(image, options) {
  const { width, height, rows, cols, invert, previousPosition } = options;
  const safeWidth = clamp(width, 1, cols);
  const safeHeight = clamp(height, 1, rows);
  const previousX = previousPosition?.x ?? Math.floor((cols - safeWidth) / 2);
  const previousY = previousPosition?.y ?? Math.floor((rows - safeHeight) / 2);
  return {
    image,
    width: safeWidth,
    height: safeHeight,
    x: clamp(previousX, 0, cols - safeWidth),
    y: clamp(previousY, 0, rows - safeHeight),
    cells: imageToCells(image, safeWidth, safeHeight, invert),
  };
}

export function stampPreview(matrix, preview) {
  const next = matrix.map((row) => [...row]);
  for (let row = 0; row < preview.height; row += 1) {
    for (let col = 0; col < preview.width; col += 1) {
      const value = preview.cells[row][col];
      if (value === null) continue;
      next[preview.y + row][preview.x + col] = value;
    }
  }
  return next;
}
