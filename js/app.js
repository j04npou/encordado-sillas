import { GridCanvas, MAX_ZOOM, MIN_ZOOM } from "./gridCanvas.js";
import { exportMatrixAsPng } from "./exporter.js";
import {
  createImportPreview,
  loadImageFromFile,
  movePreviewToCell,
  stampPreview,
  suggestImportSize,
} from "./imageImporter.js";
import {
  clamp,
  clearRegion,
  cloneMatrix,
  createMatrix,
  extractRegion,
  MAX_SIZE,
  resizeMatrix,
  state,
  toInt,
} from "./state.js";
import { generateInstructions } from "./weaving.js";

const elements = {
  rowsInput: document.querySelector("#rowsInput"),
  colsInput: document.querySelector("#colsInput"),
  tallCellsInput: document.querySelector("#tallCellsInput"),
  toolButtons: Array.from(document.querySelectorAll("[data-tool]")),
  clearBtn: document.querySelector("#clearBtn"),
  undoBtn: document.querySelector("#undoBtn"),
  redoBtn: document.querySelector("#redoBtn"),
  copyBtn: document.querySelector("#copyBtn"),
  cutBtn: document.querySelector("#cutBtn"),
  pasteBtn: document.querySelector("#pasteBtn"),
  deleteSelBtn: document.querySelector("#deleteSelBtn"),
  zoomInBtn: document.querySelector("#zoomInBtn"),
  zoomOutBtn: document.querySelector("#zoomOutBtn"),
  zoomFitBtn: document.querySelector("#zoomFitBtn"),
  panBtn: document.querySelector("#panBtn"),
  imageInput: document.querySelector("#imageInput"),
  importControls: document.querySelector("#importControls"),
  importWidthInput: document.querySelector("#importWidthInput"),
  importHeightInput: document.querySelector("#importHeightInput"),
  invertImageInput: document.querySelector("#invertImageInput"),
  stampImportBtn: document.querySelector("#stampImportBtn"),
  cancelImportBtn: document.querySelector("#cancelImportBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  designModeBtn: document.querySelector("#designModeBtn"),
  weaveModeBtn: document.querySelector("#weaveModeBtn"),
  designView: document.querySelector("#designView"),
  weaveView: document.querySelector("#weaveView"),
  patternCanvas: document.querySelector("#patternCanvas"),
  weaveCanvas: document.querySelector("#weaveCanvas"),
  directionInput: document.querySelector("#directionInput"),
  instructionsList: document.querySelector("#instructionsList"),
  prevColumnBtn: document.querySelector("#prevColumnBtn"),
  nextColumnBtn: document.querySelector("#nextColumnBtn"),
  currentColumnLabel: document.querySelector("#currentColumnLabel"),
  currentColumnTiles: document.querySelector("#currentColumnTiles"),
  weaveFocus: document.querySelector("#weaveFocus"),
  instructionsPanel: document.querySelector("#instructionsPanel"),
};

let importedImage = null;
let dragAction = null;
let panActive = false;

const mobileLayout = window.matchMedia("(max-width: 900px)");

function updateFocusSpacing() {
  if (mobileLayout.matches && state.mode === "weave") {
    elements.weaveView.style.paddingBottom = `${elements.weaveFocus.offsetHeight + 20}px`;
  } else {
    elements.weaveView.style.paddingBottom = "";
  }
}

// --- Historial ---

const HISTORY_LIMIT = 80;
const undoStack = [];
const redoStack = [];

function snapshot() {
  return { matrix: cloneMatrix(state.matrix), rows: state.rows, cols: state.cols };
}

function pushHistory() {
  undoStack.push(snapshot());
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

function applySnapshot(snap) {
  state.matrix = cloneMatrix(snap.matrix);
  state.rows = snap.rows;
  state.cols = snap.cols;
  elements.rowsInput.value = snap.rows;
  elements.colsInput.value = snap.cols;
  elements.importWidthInput.max = snap.cols;
  elements.importHeightInput.max = snap.rows;
  state.selection = null;
  state.activeColumn = Math.min(state.activeColumn, snap.cols - 1);
  redraw();
}

function undo() {
  if (state.floating) {
    cancelFloating();
    return;
  }
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  applySnapshot(undoStack.pop());
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  applySnapshot(redoStack.pop());
}

// --- Selección y portapapeles ---

function rectOf(layer) {
  return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
}

function cellInRect(cell, rect) {
  return (
    cell.col >= rect.x &&
    cell.col < rect.x + rect.width &&
    cell.row >= rect.y &&
    cell.row < rect.y + rect.height
  );
}

function commitFloating() {
  if (!state.floating) return;
  // El historial de un bloque movido ya se guardó al levantarlo de la cuadrícula.
  if (!state.floating.moved) pushHistory();
  state.matrix = stampPreview(state.matrix, state.floating);
  state.selection = rectOf(state.floating);
  state.floating = null;
  redraw();
}

function cancelFloating() {
  if (!state.floating) return;
  const { moved } = state.floating;
  state.floating = null;
  if (moved && undoStack.length) {
    // Devuelve el bloque a su posición original restaurando la instantánea del levantamiento.
    applySnapshot(undoStack.pop());
    return;
  }
  redraw();
}

function copySelection() {
  if (!state.selection) return;
  state.clipboard = {
    width: state.selection.width,
    height: state.selection.height,
    cells: extractRegion(state.matrix, state.selection),
  };
  updateEditButtons();
}

function cutSelection() {
  if (!state.selection) return;
  copySelection();
  pushHistory();
  clearRegion(state.matrix, state.selection);
  redraw();
}

function deleteSelection() {
  if (!state.selection) return;
  pushHistory();
  clearRegion(state.matrix, state.selection);
  redraw();
}

function pasteClipboard() {
  if (!state.clipboard || state.mode !== "design") return;
  commitFloating();
  const width = Math.min(state.clipboard.width, state.cols);
  const height = Math.min(state.clipboard.height, state.rows);
  const cells = state.clipboard.cells.slice(0, height).map((row) => row.slice(0, width));
  const x = clamp(
    state.selection?.x ?? Math.floor((state.cols - width) / 2),
    0,
    state.cols - width,
  );
  const y = clamp(
    state.selection?.y ?? Math.floor((state.rows - height) / 2),
    0,
    state.rows - height,
  );
  state.floating = { x, y, width, height, cells };
  state.selection = null;
  redraw();
}

// --- Gestos sobre el lienzo ---

function handleCellDown(cell) {
  if (state.importPreview) {
    state.importPreview = movePreviewToCell(state.importPreview, cell, state.rows, state.cols);
    dragAction = { type: "import" };
    redraw();
    return;
  }
  if (state.floating) {
    if (cellInRect(cell, state.floating)) {
      dragAction = {
        type: "floating",
        dx: cell.col - state.floating.x,
        dy: cell.row - state.floating.y,
      };
    } else {
      commitFloating();
    }
    return;
  }
  if (state.tool === "paint" || state.tool === "erase") {
    pushHistory();
    state.matrix[cell.row][cell.col] = state.tool === "paint";
    dragAction = { type: "paint" };
    redraw();
    return;
  }
  if (state.tool === "select") {
    dragAction = { type: "select", anchor: cell };
    state.selection = { x: cell.col, y: cell.row, width: 1, height: 1 };
    redraw();
    return;
  }
  if (state.tool === "move") {
    if (state.selection && cellInRect(cell, state.selection)) {
      pushHistory();
      state.floating = {
        ...rectOf(state.selection),
        moved: true,
        cells: extractRegion(state.matrix, state.selection),
      };
      clearRegion(state.matrix, state.selection);
      dragAction = {
        type: "move",
        dx: cell.col - state.floating.x,
        dy: cell.row - state.floating.y,
      };
    }
    state.selection = null;
    redraw();
  }
}

function moveFloating(cell) {
  state.floating.x = clamp(cell.col - dragAction.dx, 0, state.cols - state.floating.width);
  state.floating.y = clamp(cell.row - dragAction.dy, 0, state.rows - state.floating.height);
}

function handleCellDrag(cell) {
  if (!dragAction) return;
  if (dragAction.type === "import") {
    state.importPreview = movePreviewToCell(state.importPreview, cell, state.rows, state.cols);
  } else if (dragAction.type === "paint") {
    state.matrix[cell.row][cell.col] = state.tool === "paint";
  } else if (dragAction.type === "select") {
    const { anchor } = dragAction;
    state.selection = {
      x: Math.min(anchor.col, cell.col),
      y: Math.min(anchor.row, cell.row),
      width: Math.abs(anchor.col - cell.col) + 1,
      height: Math.abs(anchor.row - cell.row) + 1,
    };
  } else if (dragAction.type === "move" || dragAction.type === "floating") {
    moveFloating(cell);
  }
  redraw();
}

function handleCellUp() {
  dragAction = null;
}

const designCanvas = new GridCanvas(elements.patternCanvas, () => state, {
  onCellDown: handleCellDown,
  onCellDrag: handleCellDrag,
  onCellUp: handleCellUp,
});

const weaveCanvas = new GridCanvas(elements.weaveCanvas, () => state, {
  readonly: true,
  fitHeight: true,
});
weaveCanvas.setPanMode(true);

function updateEditButtons() {
  const hasSelection = Boolean(state.selection);
  elements.undoBtn.disabled = !undoStack.length && !state.floating;
  elements.redoBtn.disabled = !redoStack.length;
  elements.copyBtn.disabled = !hasSelection;
  elements.cutBtn.disabled = !hasSelection;
  elements.deleteSelBtn.disabled = !hasSelection;
  elements.pasteBtn.disabled = !state.clipboard;
}

function redraw() {
  designCanvas.handleResize();
  weaveCanvas.handleResize();
  updateEditButtons();
  if (state.mode === "weave") {
    renderInstructions();
    weaveCanvas.centerColumn(state.activeColumn);
  }
}

function setMode(mode) {
  commitFloating();
  state.mode = mode;
  state.selection = null;
  state.importPreview = null;
  importedImage = null;
  elements.importControls.hidden = true;
  elements.designView.hidden = mode !== "design";
  elements.weaveView.hidden = mode !== "weave";
  document.querySelectorAll("[data-panel='design']").forEach((panel) => {
    panel.hidden = mode !== "design";
  });
  document.querySelectorAll("[data-panel='weave']").forEach((panel) => {
    panel.hidden = mode !== "weave";
  });
  elements.designModeBtn.classList.toggle("is-active", mode === "design");
  elements.weaveModeBtn.classList.toggle("is-active", mode === "weave");
  elements.designModeBtn.setAttribute("aria-selected", String(mode === "design"));
  elements.weaveModeBtn.setAttribute("aria-selected", String(mode === "weave"));
  state.activeColumn = Math.min(state.activeColumn, state.cols - 1);
  requestAnimationFrame(redraw);
}

function updateCanvasCursor() {
  elements.patternCanvas.style.cursor = panActive
    ? "grab"
    : state.tool === "move"
      ? "move"
      : "crosshair";
}

function setTool(tool) {
  state.tool = tool;
  elements.toolButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tool === tool);
  });
  updateCanvasCursor();
  if ((tool === "paint" || tool === "erase") && state.selection) {
    state.selection = null;
    redraw();
  }
}

function refreshZoomButtons() {
  elements.zoomInBtn.disabled = designCanvas.zoom >= MAX_ZOOM;
  elements.zoomOutBtn.disabled = designCanvas.zoom <= MIN_ZOOM;
}

function applyZoom(zoom) {
  designCanvas.setZoom(zoom);
  refreshZoomButtons();
}

function togglePan() {
  panActive = !panActive;
  designCanvas.setPanMode(panActive);
  elements.panBtn.classList.toggle("is-active", panActive);
  updateCanvasCursor();
}

function updateSize() {
  const rows = toInt(elements.rowsInput.value, state.rows);
  const cols = toInt(elements.colsInput.value, state.cols);
  elements.rowsInput.value = rows;
  elements.colsInput.value = cols;
  elements.importWidthInput.max = cols;
  elements.importHeightInput.max = rows;
  if (rows !== state.rows || cols !== state.cols) {
    commitFloating();
    pushHistory();
    state.matrix = resizeMatrix(state.matrix, rows, cols);
    state.rows = rows;
    state.cols = cols;
    state.selection = null;
  }
  state.activeColumn = Math.min(state.activeColumn, cols - 1);
  if (state.importPreview) {
    refreshImportPreview();
  }
  redraw();
}

function refreshImportPreview() {
  if (!importedImage) return;
  const previousPosition = state.importPreview;
  const width = toInt(elements.importWidthInput.value, 1, 1, state.cols);
  const height = toInt(elements.importHeightInput.value, 1, 1, state.rows);
  elements.importWidthInput.value = width;
  elements.importHeightInput.value = height;
  state.importPreview = createImportPreview(importedImage, {
    width,
    height,
    rows: state.rows,
    cols: state.cols,
    invert: elements.invertImageInput.checked,
    previousPosition,
  });
  redraw();
}

async function handleImageImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  importedImage = await loadImageFromFile(file);
  const suggested = suggestImportSize(importedImage, state.cols, state.rows);
  elements.importWidthInput.max = state.cols;
  elements.importHeightInput.max = state.rows;
  elements.importWidthInput.value = suggested.width;
  elements.importHeightInput.value = suggested.height;
  elements.importControls.hidden = false;
  refreshImportPreview();
  event.target.value = "";
}

function stampImport() {
  if (!state.importPreview) return;
  pushHistory();
  state.matrix = stampPreview(state.matrix, state.importPreview);
  state.importPreview = null;
  importedImage = null;
  elements.importControls.hidden = true;
  redraw();
}

function cancelImport() {
  state.importPreview = null;
  importedImage = null;
  elements.importControls.hidden = true;
  redraw();
}

function renderInstructions() {
  const instructions = generateInstructions(state.matrix, state.readDirection);
  elements.currentColumnLabel.textContent = `Columna ${state.activeColumn + 1} de ${state.cols}`;

  const activeInstruction = instructions.find(
    (instruction) => instruction.column === state.activeColumn,
  );
  elements.currentColumnTiles.innerHTML = (activeInstruction?.segments ?? [])
    .map((segment) => {
      const stateClass = segment.active ? "is-over" : "is-under";
      const label = segment.active ? "encima" : "debajo";
      return `
        <span class="focus-tile ${stateClass}" aria-label="${segment.count} por ${label}">
          <strong>${segment.count}</strong>
          <small>${label}</small>
        </span>
      `;
    })
    .join("");

  elements.instructionsList.innerHTML = instructions
    .map((instruction) => {
      const active = instruction.column === state.activeColumn ? " is-active" : "";
      const tiles = instruction.segments
        .map((segment) => {
          const stateClass = segment.active ? "is-over" : "is-under";
          const label = segment.active ? "por encima" : "por debajo";
          return `
            <span class="instruction-tile ${stateClass}" title="${segment.count} ${label}" aria-label="${segment.count} ${label}">
              ${segment.count}
            </span>
          `;
        })
        .join("");
      return `
        <article class="instruction-card${active}" data-column="${instruction.column}">
          <div class="instruction-title">
            <span>Columna ${instruction.column + 1}</span>
            <span>${instruction.segments.length} tramos</span>
          </div>
          <div class="instruction-tiles" aria-label="Tramos de la columna ${instruction.column + 1}">
            ${tiles}
          </div>
        </article>
      `;
    })
    .join("");

  const list = elements.instructionsList;
  const activeCard = list.querySelector(".instruction-card.is-active");
  if (activeCard && list.scrollHeight > list.clientHeight) {
    const delta = activeCard.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTop += delta - list.clientHeight / 2 + activeCard.offsetHeight / 2;
  }
  updateFocusSpacing();
}

function setActiveColumn(column) {
  state.activeColumn = Math.max(0, Math.min(state.cols - 1, column));
  redraw();
}

function handleKeydown(event) {
  const target = event.target;
  if (target instanceof HTMLElement && target.matches("input, select, textarea")) return;
  if (state.mode === "weave") {
    if (event.key === "ArrowLeft") setActiveColumn(state.activeColumn - 1);
    if (event.key === "ArrowRight") setActiveColumn(state.activeColumn + 1);
    return;
  }
  const ctrl = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (ctrl && key === "z" && !event.shiftKey) {
    event.preventDefault();
    undo();
  } else if (ctrl && (key === "y" || (key === "z" && event.shiftKey))) {
    event.preventDefault();
    redo();
  } else if (ctrl && key === "c") {
    event.preventDefault();
    copySelection();
  } else if (ctrl && key === "x") {
    event.preventDefault();
    cutSelection();
  } else if (ctrl && key === "v") {
    event.preventDefault();
    pasteClipboard();
  } else if (key === "delete" || key === "backspace") {
    event.preventDefault();
    deleteSelection();
  } else if (key === "escape") {
    if (state.floating) {
      cancelFloating();
    } else if (state.selection) {
      state.selection = null;
      redraw();
    }
  } else if (key === "enter") {
    commitFloating();
  } else if (!ctrl && !event.altKey && key === "p") {
    setTool("paint");
  } else if (!ctrl && !event.altKey && key === "b") {
    setTool("erase");
  } else if (!ctrl && !event.altKey && key === "s") {
    setTool("select");
  } else if (!ctrl && !event.altKey && key === "m") {
    setTool("move");
  }
}

function bindEvents() {
  elements.rowsInput.addEventListener("change", updateSize);
  elements.colsInput.addEventListener("change", updateSize);
  elements.tallCellsInput.addEventListener("change", (event) => {
    state.tallCells = event.target.checked;
    redraw();
  });
  elements.toolButtons.forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });
  elements.clearBtn.addEventListener("click", () => {
    cancelFloating();
    pushHistory();
    state.matrix = createMatrix(state.rows, state.cols);
    state.selection = null;
    redraw();
  });
  elements.undoBtn.addEventListener("click", undo);
  elements.redoBtn.addEventListener("click", redo);
  elements.copyBtn.addEventListener("click", copySelection);
  elements.cutBtn.addEventListener("click", cutSelection);
  elements.pasteBtn.addEventListener("click", pasteClipboard);
  elements.deleteSelBtn.addEventListener("click", deleteSelection);
  elements.zoomInBtn.addEventListener("click", () => applyZoom(designCanvas.zoom * 1.5));
  elements.zoomOutBtn.addEventListener("click", () => applyZoom(designCanvas.zoom / 1.5));
  elements.zoomFitBtn.addEventListener("click", () => applyZoom(1));
  elements.panBtn.addEventListener("click", togglePan);
  elements.imageInput.addEventListener("change", handleImageImport);
  elements.importWidthInput.addEventListener("change", refreshImportPreview);
  elements.importHeightInput.addEventListener("change", refreshImportPreview);
  elements.invertImageInput.addEventListener("change", refreshImportPreview);
  elements.stampImportBtn.addEventListener("click", stampImport);
  elements.cancelImportBtn.addEventListener("click", cancelImport);
  elements.exportBtn.addEventListener("click", () =>
    exportMatrixAsPng(state.matrix, state.tallCells),
  );
  elements.designModeBtn.addEventListener("click", () => setMode("design"));
  elements.weaveModeBtn.addEventListener("click", () => setMode("weave"));
  elements.directionInput.addEventListener("change", (event) => {
    state.readDirection = event.target.value;
    renderInstructions();
  });
  elements.prevColumnBtn.addEventListener("click", () => setActiveColumn(state.activeColumn - 1));
  elements.nextColumnBtn.addEventListener("click", () => setActiveColumn(state.activeColumn + 1));
  elements.instructionsList.addEventListener("click", (event) => {
    const card = event.target.closest(".instruction-card");
    if (!card) return;
    setActiveColumn(Number.parseInt(card.dataset.column, 10));
  });
  window.addEventListener("resize", updateFocusSpacing);
  window.addEventListener("keydown", handleKeydown);
}

function init() {
  elements.rowsInput.max = MAX_SIZE;
  elements.colsInput.max = MAX_SIZE;
  elements.instructionsPanel.open = !mobileLayout.matches;
  bindEvents();
  refreshZoomButtons();
  const params = new URLSearchParams(window.location.search);
  if (window.location.hash === "#weave" || params.get("mode") === "weave") {
    setMode("weave");
    return;
  }
  redraw();
}

init();
