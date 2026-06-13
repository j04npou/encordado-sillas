import { clamp } from "./state.js";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

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
  selection: "rgba(30, 124, 107, 0.16)",
  selectionStroke: "#1e7c6b",
  overflowVeil: "rgba(34, 32, 29, 0.12)",
  activeEdge: "rgba(34, 32, 29, 0.55)",
};

export class GridCanvas {
  constructor(canvas, getState, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.getState = getState;
    this.readonly = options.readonly ?? false;
    this.fitHeight = options.fitHeight ?? false;
    this.onCellDown = options.onCellDown ?? null;
    this.onCellDrag = options.onCellDrag ?? null;
    this.onCellUp = options.onCellUp ?? null;
    this.cellWidth = 24;
    this.cellHeight = 24;
    this.gridWidth = 0;
    this.gridHeight = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.zoom = 1;
    // Ancla de scroll: posición (en celdas) del área activa, para mantenerla fija
    // en pantalla cuando el lienzo crece por overflow arriba/izquierda.
    this.anchorRow = 0;
    this.anchorCol = 0;
    this.panMode = false;
    this.panStart = null;
    this.isPointerDown = false;
    this.lastCellKey = "";

    this.handleResize = this.handleResize.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);

    window.addEventListener("resize", this.handleResize);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointercancel", this.handlePointerUp);
    window.addEventListener("pointerup", this.handlePointerUp);
    this.handleResize();
  }

  destroy() {
    window.removeEventListener("resize", this.handleResize);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointercancel", this.handlePointerUp);
    window.removeEventListener("pointerup", this.handlePointerUp);
  }

  handleResize() {
    const parent = this.canvas.parentElement;
    // Posición previa del ancla en píxeles, para mantener el área activa fija en
    // pantalla si el lienzo crece o encoge por overflow arriba/izquierda.
    const prevAnchorX = this.anchorCol * this.cellWidth;
    const prevAnchorY = this.anchorRow * this.cellHeight;
    const measured = this.applyLayout();
    // Al dimensionar puede aparecer o desaparecer una barra de scroll del marco,
    // cambiando el hueco disponible: si es así, se redimensiona con la medida nueva.
    if (
      parent &&
      (parent.clientWidth !== measured.width || parent.clientHeight !== measured.height)
    ) {
      this.applyLayout();
    }
    if (parent) {
      const dx = this.anchorCol * this.cellWidth - prevAnchorX;
      const dy = this.anchorRow * this.cellHeight - prevAnchorY;
      if (dx) parent.scrollLeft += dx;
      if (dy) parent.scrollTop += dy;
    }
    this.draw();
  }

  applyLayout() {
    const parent = this.canvas.parentElement;
    const parentWidth = parent?.clientWidth ?? 800;
    const parentHeight = parent?.clientHeight ?? 600;
    const { rows, cols, tallCells, activeRows, activeCols, activeOffsetRow, activeOffsetCol } =
      this.getState();
    this.anchorRow = activeOffsetRow ?? 0;
    this.anchorCol = activeOffsetCol ?? 0;
    // El tamaño de celda se ajusta al área activa; la región puede ser mayor
    // (overflow) y entonces el lienzo desborda el marco con scroll.
    const fitRows = activeRows ?? rows;
    const fitCols = activeCols ?? cols;
    const aspect = tallCells ? 2 : 1;
    if (this.fitHeight) {
      // Llena la altura exacta del marco; las celdas pueden ser fraccionarias,
      // así no se acumula el error de redondeo (visible sobre todo con alto ×2).
      this.cellHeight = Math.max(8, parentHeight / fitRows);
      this.cellWidth = this.cellHeight / aspect;
    } else {
      const maxCellByWidth = Math.floor((parentWidth - 32) / fitCols);
      const maxCellByHeight = Math.floor((parentHeight - 32) / (fitRows * aspect));
      const fitted = clamp(Math.min(maxCellByWidth, maxCellByHeight), 6, 34);
      this.cellWidth = Math.round(fitted * this.zoom);
      this.cellHeight = this.cellWidth * aspect;
    }
    this.gridWidth = cols * this.cellWidth;
    this.gridHeight = rows * this.cellHeight;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${this.gridWidth}px`;
    this.canvas.style.height = `${this.gridHeight}px`;
    this.canvas.width = Math.round(this.gridWidth * dpr);
    this.canvas.height = Math.round(this.gridHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: parentWidth, height: parentHeight };
  }

  setZoom(zoom) {
    const next = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    if (next === this.zoom) return;
    const frame = this.canvas.parentElement;
    const centerX = (frame.scrollLeft + frame.clientWidth / 2) / Math.max(1, this.gridWidth);
    const centerY = (frame.scrollTop + frame.clientHeight / 2) / Math.max(1, this.gridHeight);
    this.zoom = next;
    this.handleResize();
    frame.scrollLeft = centerX * this.gridWidth - frame.clientWidth / 2;
    frame.scrollTop = centerY * this.gridHeight - frame.clientHeight / 2;
  }

  setPanMode(enabled) {
    this.panMode = enabled;
    this.panStart = null;
    // Con pan activo se permite el gesto táctil nativo (scroll del marco y de la página).
    this.canvas.style.touchAction = enabled ? "auto" : "";
  }

  centerColumn(column) {
    const frame = this.canvas.parentElement;
    if (!frame) return;
    const target = (column + 0.5) * this.cellWidth - frame.clientWidth / 2;
    frame.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }

  draw() {
    const {
      rows,
      cols,
      matrix,
      importPreview,
      activeColumn,
      mode,
      floating,
      selection,
      activeRows,
      activeCols,
      activeOffsetRow,
      activeOffsetCol,
    } = this.getState();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.gridWidth, this.gridHeight);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.gridWidth, this.gridHeight);

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        ctx.fillStyle = matrix[row][col] ? COLORS.active : COLORS.inactive;
        ctx.fillRect(col * this.cellWidth, row * this.cellHeight, this.cellWidth, this.cellHeight);
      }
    }

    if (mode === "weave") {
      this.drawColumnHighlight(activeColumn);
    }

    this.drawGrid(rows, cols);

    const offR = activeOffsetRow ?? 0;
    const offC = activeOffsetCol ?? 0;
    if (activeRows != null && (rows > activeRows || cols > activeCols || offR > 0 || offC > 0)) {
      this.drawOverflowZone(rows, cols, activeRows, activeCols, offR, offC);
    }

    if (importPreview) {
      this.drawPreview(importPreview);
    }

    if (floating) {
      this.drawPreview(floating);
    }

    if (selection && !this.readonly) {
      this.drawSelection(selection);
    }
  }

  drawOverflowZone(rows, cols, activeRows, activeCols, activeOffsetRow = 0, activeOffsetCol = 0) {
    const ctx = this.ctx;
    const x0 = activeOffsetCol * this.cellWidth;
    const y0 = activeOffsetRow * this.cellHeight;
    const x1 = x0 + activeCols * this.cellWidth;
    const y1 = y0 + activeRows * this.cellHeight;
    const W = this.gridWidth;
    const H = this.gridHeight;

    ctx.fillStyle = COLORS.overflowVeil;
    if (y0 > 0) ctx.fillRect(0, 0, W, y0);
    if (y1 < H) ctx.fillRect(0, y1, W, H - y1);
    if (x0 > 0) ctx.fillRect(0, y0, x0, y1 - y0);
    if (x1 < W) ctx.fillRect(x1, y0, W - x1, y1 - y0);

    ctx.strokeStyle = COLORS.activeEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
  }

  drawSelection(selection) {
    const ctx = this.ctx;
    const x = selection.x * this.cellWidth;
    const y = selection.y * this.cellHeight;
    const width = selection.width * this.cellWidth;
    const height = selection.height * this.cellHeight;
    ctx.fillStyle = COLORS.selection;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = COLORS.selectionStroke;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
    ctx.setLineDash([]);
  }

  drawGrid(rows, cols) {
    const ctx = this.ctx;
    ctx.lineWidth = 1;
    for (let col = 0; col <= cols; col += 1) {
      ctx.strokeStyle = col % 5 === 0 ? COLORS.majorGrid : COLORS.grid;
      const x = col * this.cellWidth + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.gridHeight);
      ctx.stroke();
    }
    for (let row = 0; row <= rows; row += 1) {
      ctx.strokeStyle = row % 5 === 0 ? COLORS.majorGrid : COLORS.grid;
      const y = row * this.cellHeight + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.gridWidth, y);
      ctx.stroke();
    }
  }

  drawColumnHighlight(activeColumn) {
    const ctx = this.ctx;
    const x = activeColumn * this.cellWidth;
    ctx.fillStyle = COLORS.highlight;
    ctx.fillRect(x, 0, this.cellWidth, this.gridHeight);
    ctx.strokeStyle = COLORS.highlightStroke;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, 1.5, this.cellWidth - 3, this.gridHeight - 3);
  }

  drawPreview(preview) {
    const ctx = this.ctx;
    const { x, y, width, height, cells } = preview;
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const cell = cells[row][col];
        const drawX = (x + col) * this.cellWidth;
        const drawY = (y + row) * this.cellHeight;
        ctx.fillStyle =
          cell === null ? COLORS.previewIgnored : cell ? COLORS.previewOn : COLORS.previewOff;
        ctx.fillRect(drawX, drawY, this.cellWidth, this.cellHeight);
      }
    }
    ctx.strokeStyle = COLORS.previewBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(
      x * this.cellWidth + 1,
      y * this.cellHeight + 1,
      width * this.cellWidth - 2,
      height * this.cellHeight - 2,
    );
  }

  getCellFromEvent(event, clampToGrid = false) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const col = Math.floor(x / this.cellWidth);
    const row = Math.floor(y / this.cellHeight);
    const { rows, cols } = this.getState();
    if (clampToGrid) {
      return { row: clamp(row, 0, rows - 1), col: clamp(col, 0, cols - 1) };
    }
    if (row < 0 || col < 0 || row >= rows || col >= cols) return null;
    return { row, col };
  }

  handlePointerDown(event) {
    if (this.panMode) {
      const frame = this.canvas.parentElement;
      this.panStart = {
        x: event.clientX,
        y: event.clientY,
        left: frame.scrollLeft,
        top: frame.scrollTop,
      };
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (this.readonly) return;
    const cell = this.getCellFromEvent(event);
    if (!cell) return;
    this.canvas.setPointerCapture(event.pointerId);
    this.isPointerDown = true;
    this.lastCellKey = `${cell.row}:${cell.col}`;
    this.onCellDown?.(cell);
  }

  handlePointerMove(event) {
    if (this.panMode) {
      if (!this.panStart) return;
      const frame = this.canvas.parentElement;
      frame.scrollLeft = this.panStart.left - (event.clientX - this.panStart.x);
      frame.scrollTop = this.panStart.top - (event.clientY - this.panStart.y);
      return;
    }
    if (!this.isPointerDown || this.readonly) return;
    const cell = this.getCellFromEvent(event, true);
    const key = `${cell.row}:${cell.col}`;
    if (key === this.lastCellKey) return;
    this.lastCellKey = key;
    this.onCellDrag?.(cell);
  }

  handlePointerUp() {
    this.panStart = null;
    if (!this.isPointerDown) return;
    this.isPointerDown = false;
    this.lastCellKey = "";
    this.onCellUp?.();
  }
}
