import { GridCanvas, MAX_ZOOM, MIN_ZOOM } from "./gridCanvas.js";
import { exportMatrixAsPng } from "./exporter.js";
import { createImportPreview, loadImageFromFile, stampPreview } from "./imageImporter.js";
import {
  clamp,
  clearRegion,
  cloneMatrix,
  contentBounds,
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
  widePixelsRow: document.querySelector("#widePixelsRow"),
  widePixelsInput: document.querySelector("#widePixelsInput"),
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
  importError: document.querySelector("#importError"),
  invertImageInput: document.querySelector("#invertImageInput"),
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
let preImportSnapshot = null;
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

// --- Matriz con overflow ---
// La matriz puede ser mayor que el área activa (rows×cols): los píxeles que
// quedan fuera al encoger el lienzo se conservan como overflow visible.

function matrixRows() {
  return state.matrix.length;
}

function matrixCols() {
  return state.matrix[0]?.length ?? 0;
}

// Mantiene la matriz tan grande como el área activa o el contenido real,
// recortando el overflow vacío por todos los lados (incluido arriba/izquierda).
function normalizeMatrix() {
  const bounds = contentBounds(state.matrix);

  if (bounds.rows > 0) {
    // Recorta filas/columnas vacías iniciales que queden antes del contenido Y del área activa.
    const trimRow = Math.min(bounds.minRow, state.offsetRow);
    const trimCol = Math.min(bounds.minCol, state.offsetCol);
    if (trimRow > 0 || trimCol > 0) {
      const newRows = matrixRows() - trimRow;
      const newCols = matrixCols() - trimCol;
      const next = createMatrix(newRows, newCols);
      for (let r = trimRow; r < matrixRows(); r += 1) {
        for (let c = trimCol; c < matrixCols(); c += 1) {
          next[r - trimRow][c - trimCol] = state.matrix[r][c];
        }
      }
      state.matrix = next;
      state.offsetRow -= trimRow;
      state.offsetCol -= trimCol;
      if (state.selection) {
        state.selection.x -= trimCol;
        state.selection.y -= trimRow;
      }
    }
  } else {
    // Matriz vacía: resetea el offset para que el área activa vuelva a (0,0).
    state.offsetRow = 0;
    state.offsetCol = 0;
  }

  // Asegura que la matriz cubre el área activa y el contenido actual.
  const nb = contentBounds(state.matrix);
  const rows = Math.max(state.offsetRow + state.rows, nb.rows);
  const cols = Math.max(state.offsetCol + state.cols, nb.cols);
  if (rows !== matrixRows() || cols !== matrixCols()) {
    state.matrix = resizeMatrix(state.matrix, rows, cols);
  }

  // La selección no puede apuntar fuera de la matriz tras el recorte.
  if (state.selection) {
    const sel = state.selection;
    if (sel.x < 0 || sel.y < 0 || sel.x >= matrixCols() || sel.y >= matrixRows()) {
      state.selection = null;
    } else {
      sel.width = Math.min(sel.width, matrixCols() - sel.x);
      sel.height = Math.min(sel.height, matrixRows() - sel.y);
    }
  }
}

function growMatrixToFit(layer) {
  // Overflow hacia la izquierda/arriba: extiende la matriz y actualiza el offset.
  const dRow = layer.y < 0 ? -layer.y : 0;
  const dCol = layer.x < 0 ? -layer.x : 0;
  if (dRow > 0 || dCol > 0) {
    const newRows = matrixRows() + dRow;
    const newCols = matrixCols() + dCol;
    const next = createMatrix(newRows, newCols);
    for (let r = 0; r < matrixRows(); r += 1) {
      for (let c = 0; c < matrixCols(); c += 1) {
        next[r + dRow][c + dCol] = state.matrix[r][c];
      }
    }
    state.matrix = next;
    state.offsetRow += dRow;
    state.offsetCol += dCol;
    layer.y += dRow;
    layer.x += dCol;
    if (state.selection) {
      state.selection.y += dRow;
      state.selection.x += dCol;
    }
  }
  // Overflow hacia la derecha/abajo.
  const rows = Math.max(matrixRows(), layer.y + layer.height);
  const cols = Math.max(matrixCols(), layer.x + layer.width);
  if (rows !== matrixRows() || cols !== matrixCols()) {
    state.matrix = resizeMatrix(state.matrix, rows, cols);
  }
}

// --- Vista con píxel cuadrado (duplica columnas, solo presentación) ---

function isWideView() {
  return state.tallCells && state.widePixels;
}

function viewCols() {
  return state.cols * (isWideView() ? 2 : 1);
}

function doubleColumns(matrix) {
  return matrix.map((row) => row.flatMap((value) => [value, value]));
}

function widenRect(rect) {
  if (!rect) return rect;
  return { ...rect, x: rect.x * 2, width: rect.width * 2 };
}

function widenLayer(layer) {
  if (!layer) return layer;
  return { ...widenRect(layer), cells: doubleColumns(layer.cells) };
}

// Disposición del lienzo de diseño, en coordenadas de matriz.
// minY/minX < 0 cuando una capa flotante asoma por encima/izquierda del lienzo:
// padTop/padLeft son el margen de render que se añade para poder mostrarla y
// arrastrarla hacia ese lado (igual que la región crece a la derecha/abajo).
function designLayout() {
  let minY = 0;
  let minX = 0;
  let maxY = Math.max(state.offsetRow + state.rows, matrixRows());
  let maxX = Math.max(state.offsetCol + state.cols, matrixCols());
  for (const layer of [state.floating, state.importPreview]) {
    if (layer) {
      minY = Math.min(minY, layer.y);
      minX = Math.min(minX, layer.x);
      maxY = Math.max(maxY, layer.y + layer.height);
      maxX = Math.max(maxX, layer.x + layer.width);
    }
  }
  return { padTop: -minY, padLeft: -minX, rows: maxY - minY, cols: maxX - minX };
}

// Copia la matriz dentro de una rejilla mayor desplazada (padTop, padLeft).
function padDesignMatrix(matrix, layout) {
  const { padTop, padLeft, rows, cols } = layout;
  if (padTop === 0 && padLeft === 0 && rows === matrixRows() && cols === matrixCols()) {
    return matrix;
  }
  const out = createMatrix(rows, cols);
  for (let r = 0; r < matrix.length; r += 1) {
    const tr = r + padTop;
    if (tr < 0 || tr >= rows) continue;
    const src = matrix[r];
    const dst = out[tr];
    for (let c = 0; c < src.length; c += 1) {
      const tc = c + padLeft;
      if (tc >= 0 && tc < cols) dst[tc] = src[c];
    }
  }
  return out;
}

// Estado que ve el lienzo de diseño: el diseño original nunca se modifica.
function designViewState() {
  const layout = designLayout();
  const matrix = padDesignMatrix(state.matrix, layout);
  const shift = (layer) =>
    layer ? { ...layer, x: layer.x + layout.padLeft, y: layer.y + layout.padTop } : layer;
  const base = {
    ...state,
    rows: layout.rows,
    cols: layout.cols,
    activeRows: state.rows,
    activeCols: state.cols,
    // Posición del área activa dentro del lienzo (offset real + margen de render por
    // overflow arriba/izquierda). El canvas la usa como ancla para compensar el scroll
    // y no arrastrar el contenido bajo el cursor cuando el lienzo crece por ese lado.
    activeOffsetRow: state.offsetRow + layout.padTop,
    activeOffsetCol: state.offsetCol + layout.padLeft,
    matrix,
    selection: shift(state.selection),
    floating: shift(state.floating),
    importPreview: shift(state.importPreview),
  };
  if (!isWideView()) return base;
  return {
    ...base,
    cols: base.cols * 2,
    activeCols: state.cols * 2,
    activeOffsetCol: base.activeOffsetCol * 2,
    matrix: doubleColumns(matrix),
    selection: widenRect(base.selection),
    floating: widenLayer(base.floating),
    importPreview: widenLayer(base.importPreview),
  };
}

// Estado que ve el lienzo de tejer: solo el área activa, sin overflow ni capas.
function weaveViewState() {
  return {
    ...state,
    cols: viewCols(),
    activeRows: state.rows,
    activeCols: viewCols(),
    matrix: displayMatrix(),
    selection: null,
    floating: null,
    importPreview: null,
  };
}

// Convierte una celda del lienzo (con pad de render y duplicado wide) a coordenadas de matriz.
function toModelCell(cell) {
  const { padTop, padLeft } = designLayout();
  const col = isWideView() ? Math.floor(cell.col / 2) : cell.col;
  return { row: cell.row - padTop, col: col - padLeft };
}

// Área activa sin transformaciones visuales: datos reales que se tejen y se exportan.
function activeMatrix() {
  const result = createMatrix(state.rows, state.cols);
  for (let r = 0; r < state.rows; r += 1) {
    const mr = r + state.offsetRow;
    if (mr >= matrixRows()) break;
    for (let c = 0; c < state.cols; c += 1) {
      const mc = c + state.offsetCol;
      if (mc < matrixCols()) result[r][c] = state.matrix[mr][mc];
    }
  }
  return result;
}

// Matriz que ve el lienzo de tejer: área activa con duplicado visual de columnas si aplica.
function displayMatrix() {
  const base = activeMatrix();
  return isWideView() ? doubleColumns(base) : base;
}

// --- Historial ---

const HISTORY_LIMIT = 80;
const undoStack = [];
const redoStack = [];

function snapshot() {
  return {
    matrix: cloneMatrix(state.matrix),
    rows: state.rows,
    cols: state.cols,
    offsetRow: state.offsetRow,
    offsetCol: state.offsetCol,
  };
}

function pushSnapshot(snap) {
  undoStack.push(snap);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

function pushHistory() {
  pushSnapshot(snapshot());
}

function applySnapshot(snap) {
  state.matrix = cloneMatrix(snap.matrix);
  state.rows = snap.rows;
  state.cols = snap.cols;
  state.offsetRow = snap.offsetRow ?? 0;
  state.offsetCol = snap.offsetCol ?? 0;
  elements.rowsInput.value = snap.rows;
  elements.colsInput.value = snap.cols;
  state.selection = null;
  state.activeColumn = Math.min(state.activeColumn, snap.cols - 1);
  redraw();
}

function undo() {
  if (state.importPreview) {
    cancelImport();
    return;
  }
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

// Solo los píxeles pintados viajan con la capa; los vacíos (null) no tapan el fondo.
function transparentCells(cells) {
  return cells.map((row) => row.map((value) => (value ? true : null)));
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
  growMatrixToFit(state.floating);
  state.matrix = stampPreview(state.matrix, state.floating);
  state.selection = rectOf(state.floating);
  state.floating = null;
  // Si el bloque venía del overflow, recorta la región que haya quedado vacía.
  normalizeMatrix();
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
  normalizeMatrix();
  redraw();
}

function deleteSelection() {
  if (!state.selection) return;
  pushHistory();
  clearRegion(state.matrix, state.selection);
  normalizeMatrix();
  redraw();
}

function pasteClipboard() {
  if (!state.clipboard || state.mode !== "design") return;
  commitFloating();
  const { width, height, cells } = state.clipboard;
  const x = clamp(
    state.selection?.x ?? Math.floor((state.cols - width) / 2),
    0,
    Math.max(0, state.cols - width),
  );
  const y = clamp(
    state.selection?.y ?? Math.floor((state.rows - height) / 2),
    0,
    Math.max(0, state.rows - height),
  );
  state.floating = { x, y, width, height, cells: transparentCells(cells) };
  state.selection = null;
  redraw();
}

// --- Gestos sobre el lienzo ---

function handleCellDown(cell) {
  cell = toModelCell(cell);
  if (state.importPreview) {
    if (cellInRect(cell, state.importPreview)) {
      dragAction = {
        type: "import",
        dx: cell.col - state.importPreview.x,
        dy: cell.row - state.importPreview.y,
      };
    } else {
      stampImport();
    }
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
        cells: transparentCells(extractRegion(state.matrix, state.selection)),
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

function moveLayer(layer, cell) {
  // Las capas pueden salir del área activa en cualquier dirección: quedarán como overflow al fijarse.
  layer.x = clamp(cell.col - dragAction.dx, 1 - layer.width, MAX_SIZE - layer.width);
  layer.y = clamp(cell.row - dragAction.dy, 1 - layer.height, MAX_SIZE - layer.height);
}

function handleCellDrag(cell) {
  if (!dragAction) return;
  cell = toModelCell(cell);
  if (dragAction.type === "import") {
    moveLayer(state.importPreview, cell);
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
    moveLayer(state.floating, cell);
  }
  redraw();
}

function handleCellUp() {
  if (dragAction?.type === "paint") {
    // Si la goma vació el overflow, la región sobrante se recorta al soltar.
    normalizeMatrix();
    redraw();
  }
  dragAction = null;
}

const designCanvas = new GridCanvas(elements.patternCanvas, designViewState, {
  onCellDown: handleCellDown,
  onCellDrag: handleCellDrag,
  onCellUp: handleCellUp,
});

const weaveCanvas = new GridCanvas(elements.weaveCanvas, weaveViewState, {
  readonly: true,
  fitHeight: true,
});
weaveCanvas.setPanMode(true);

function updateEditButtons() {
  const hasSelection = Boolean(state.selection);
  elements.undoBtn.disabled = !undoStack.length && !state.floating && !state.importPreview;
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
  cancelImport();
  state.mode = mode;
  state.selection = null;
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
  if (rows !== state.rows || cols !== state.cols) {
    commitFloating();
    pushHistory();
    state.rows = rows;
    state.cols = cols;
    // No recorta: los píxeles que queden fuera se conservan como overflow.
    normalizeMatrix();
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
  state.importPreview = createImportPreview(importedImage, {
    width: importedImage.naturalWidth,
    height: importedImage.naturalHeight,
    rows: state.rows,
    cols: state.cols,
    invert: elements.invertImageInput.checked,
    previousPosition: state.importPreview,
  });
  redraw();
}

function showImportError(message) {
  elements.importError.textContent = message;
  elements.importError.hidden = !message;
}

async function handleImageImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  event.target.value = "";
  cancelImport();
  const image = await loadImageFromFile(file);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width > MAX_SIZE || height > MAX_SIZE) {
    showImportError(
      `La imagen mide ${width}×${height} px y el máximo es ${MAX_SIZE}×${MAX_SIZE}. ` +
        "Redúcela antes de importarla: cada píxel se convierte en una celda.",
    );
    return;
  }
  importedImage = image;
  preImportSnapshot = snapshot();
  if (width > state.cols || height > state.rows) {
    state.cols = Math.max(state.cols, width);
    state.rows = Math.max(state.rows, height);
    normalizeMatrix();
    elements.rowsInput.value = state.rows;
    elements.colsInput.value = state.cols;
    state.selection = null;
  }
  elements.importControls.hidden = false;
  refreshImportPreview();
}

function stampImport() {
  if (!state.importPreview) return;
  // Un solo paso de deshacer que incluye el crecimiento del lienzo y el fijado.
  pushSnapshot(preImportSnapshot ?? snapshot());
  preImportSnapshot = null;
  growMatrixToFit(state.importPreview);
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
  showImportError("");
  if (preImportSnapshot) {
    // Deshace el crecimiento automático del lienzo sin tocar el historial.
    const snap = preImportSnapshot;
    preImportSnapshot = null;
    applySnapshot(snap);
    return;
  }
  redraw();
}

function renderInstructions() {
  const instructions = generateInstructions(displayMatrix(), state.readDirection);
  elements.currentColumnLabel.textContent = `Columna ${state.activeColumn + 1} de ${viewCols()}`;

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
  state.activeColumn = Math.max(0, Math.min(viewCols() - 1, column));
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
    if (state.importPreview) {
      cancelImport();
    } else if (state.floating) {
      cancelFloating();
    } else if (state.selection) {
      state.selection = null;
      redraw();
    }
  } else if (key === "enter") {
    if (state.importPreview) {
      stampImport();
    } else {
      commitFloating();
    }
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
    elements.widePixelsRow.hidden = !state.tallCells;
    if (!state.tallCells) {
      state.widePixels = false;
      elements.widePixelsInput.checked = false;
    }
    state.activeColumn = Math.min(state.activeColumn, viewCols() - 1);
    redraw();
  });
  elements.widePixelsInput.addEventListener("change", (event) => {
    state.widePixels = event.target.checked;
    state.activeColumn = Math.min(state.activeColumn, viewCols() - 1);
    redraw();
  });
  elements.toolButtons.forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });
  elements.clearBtn.addEventListener("click", () => {
    cancelFloating();
    pushHistory();
    state.matrix = createMatrix(state.rows, state.cols);
    state.offsetRow = 0;
    state.offsetCol = 0;
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
  elements.invertImageInput.addEventListener("change", refreshImportPreview);
  elements.exportBtn.addEventListener("click", () => exportMatrixAsPng(activeMatrix()));
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
