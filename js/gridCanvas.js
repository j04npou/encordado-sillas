import { clamp } from "./state.js";

const COLORS = {
  background: "#fbfcfb",
  active: "#163f39",
  inactive: "#fbfcfb",
  grid: "#d7dfdc",
  majorGrid: "#9ba8a4",
  previewOn: "rgba(196, 78, 53, 0.62)",
  previewOff: "rgba(251, 252, 251, 0.76)",
  previewIgnored: "rgba(34, 32, 29, 0.08)",
  previewBorder: "#c44e35",
  highlight: "rgba(196, 78, 53, 0.22)",
  highlightStroke: "#c44e35",
};

export class GridCanvas {
  constructor(canvas, getState, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.getState = getState;
    this.readonly = options.readonly ?? false;
    this.onPaintCell = options.onPaintCell ?? null;
    this.onPreviewMove = options.onPreviewMove ?? null;
    this.cellSize = 24;
    this.gridWidth = 0;
    this.gridHeight = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.isPointerDown = false;
    this.lastPaintedKey = "";

    this.handleResize = this.handleResize.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);

    window.addEventListener("resize", this.handleResize);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    this.handleResize();
  }

  destroy() {
    window.removeEventListener("resize", this.handleResize);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
  }

  handleResize() {
    const parent = this.canvas.parentElement;
    const parentWidth = parent?.clientWidth ?? 800;
    const parentHeight = parent?.clientHeight ?? 600;
    const { rows, cols } = this.getState();
    const maxCellByWidth = Math.floor((parentWidth - 32) / cols);
    const maxCellByHeight = Math.floor((parentHeight - 32) / rows);
    this.cellSize = clamp(Math.min(maxCellByWidth, maxCellByHeight), 6, 34);
    this.gridWidth = cols * this.cellSize;
    this.gridHeight = rows * this.cellSize;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${this.gridWidth}px`;
    this.canvas.style.height = `${this.gridHeight}px`;
    this.canvas.width = Math.round(this.gridWidth * dpr);
    this.canvas.height = Math.round(this.gridHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  draw() {
    const { rows, cols, matrix, importPreview, activeColumn, mode } = this.getState();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.gridWidth, this.gridHeight);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.gridWidth, this.gridHeight);

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        ctx.fillStyle = matrix[row][col] ? COLORS.active : COLORS.inactive;
        ctx.fillRect(col * this.cellSize, row * this.cellSize, this.cellSize, this.cellSize);
      }
    }

    if (mode === "weave") {
      this.drawColumnHighlight(activeColumn);
    }

    this.drawGrid(rows, cols);

    if (importPreview) {
      this.drawPreview(importPreview);
    }
  }

  drawGrid(rows, cols) {
    const ctx = this.ctx;
    ctx.lineWidth = 1;
    for (let col = 0; col <= cols; col += 1) {
      ctx.strokeStyle = col % 5 === 0 ? COLORS.majorGrid : COLORS.grid;
      const x = col * this.cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.gridHeight);
      ctx.stroke();
    }
    for (let row = 0; row <= rows; row += 1) {
      ctx.strokeStyle = row % 5 === 0 ? COLORS.majorGrid : COLORS.grid;
      const y = row * this.cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.gridWidth, y);
      ctx.stroke();
    }
  }

  drawColumnHighlight(activeColumn) {
    const ctx = this.ctx;
    const x = activeColumn * this.cellSize;
    ctx.fillStyle = COLORS.highlight;
    ctx.fillRect(x, 0, this.cellSize, this.gridHeight);
    ctx.strokeStyle = COLORS.highlightStroke;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, 1.5, this.cellSize - 3, this.gridHeight - 3);
  }

  drawPreview(preview) {
    const ctx = this.ctx;
    const { x, y, width, height, cells } = preview;
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const cell = cells[row][col];
        const drawX = (x + col) * this.cellSize;
        const drawY = (y + row) * this.cellSize;
        ctx.fillStyle =
          cell === null ? COLORS.previewIgnored : cell ? COLORS.previewOn : COLORS.previewOff;
        ctx.fillRect(drawX, drawY, this.cellSize, this.cellSize);
      }
    }
    ctx.strokeStyle = COLORS.previewBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(
      x * this.cellSize + 1,
      y * this.cellSize + 1,
      width * this.cellSize - 2,
      height * this.cellSize - 2,
    );
  }

  getCellFromEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    const { rows, cols } = this.getState();
    if (row < 0 || col < 0 || row >= rows || col >= cols) return null;
    return { row, col };
  }

  handlePointerDown(event) {
    const cell = this.getCellFromEvent(event);
    if (!cell || this.readonly) return;
    this.canvas.setPointerCapture(event.pointerId);
    this.isPointerDown = true;
    this.lastPaintedKey = "";
    if (this.getState().importPreview && this.onPreviewMove) {
      this.onPreviewMove(cell);
      return;
    }
    this.applyPointerAction(cell);
  }

  handlePointerMove(event) {
    const cell = this.getCellFromEvent(event);
    const { importPreview } = this.getState();
    if (importPreview && this.isPointerDown && cell && this.onPreviewMove) {
      this.onPreviewMove(cell);
      return;
    }
    if (!this.isPointerDown || !cell || this.readonly) return;
    this.applyPointerAction(cell);
  }

  handlePointerUp() {
    this.isPointerDown = false;
    this.lastPaintedKey = "";
  }

  applyPointerAction(cell) {
    const key = `${cell.row}:${cell.col}`;
    if (key === this.lastPaintedKey) return;
    this.lastPaintedKey = key;
    this.onPaintCell?.(cell);
  }
}
