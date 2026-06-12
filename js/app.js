import { GridCanvas } from "./gridCanvas.js";
import { exportMatrixAsPng } from "./exporter.js";
import {
  createImportPreview,
  loadImageFromFile,
  movePreviewToCell,
  stampPreview,
  suggestImportSize,
} from "./imageImporter.js";
import { createMatrix, MAX_SIZE, resizeMatrix, state, toInt } from "./state.js";
import { generateInstructions } from "./weaving.js";

const elements = {
  rowsInput: document.querySelector("#rowsInput"),
  colsInput: document.querySelector("#colsInput"),
  tallCellsInput: document.querySelector("#tallCellsInput"),
  paintToolBtn: document.querySelector("#paintToolBtn"),
  eraseToolBtn: document.querySelector("#eraseToolBtn"),
  clearBtn: document.querySelector("#clearBtn"),
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

const mobileLayout = window.matchMedia("(max-width: 900px)");

function updateFocusSpacing() {
  if (mobileLayout.matches && state.mode === "weave") {
    elements.weaveView.style.paddingBottom = `${elements.weaveFocus.offsetHeight + 20}px`;
  } else {
    elements.weaveView.style.paddingBottom = "";
  }
}

const designCanvas = new GridCanvas(elements.patternCanvas, () => state, {
  onPaintCell: ({ row, col }) => {
    if (state.importPreview) return;
    state.matrix[row][col] = state.tool === "paint";
    redraw();
  },
  onPreviewMove: (cell) => {
    state.importPreview = movePreviewToCell(state.importPreview, cell, state.rows, state.cols);
    redraw();
  },
});

const weaveCanvas = new GridCanvas(elements.weaveCanvas, () => state, {
  readonly: true,
});

function redraw() {
  designCanvas.handleResize();
  weaveCanvas.handleResize();
  if (state.mode === "weave") renderInstructions();
}

function setMode(mode) {
  state.mode = mode;
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

function setTool(tool) {
  state.tool = tool;
  elements.paintToolBtn.classList.toggle("is-active", tool === "paint");
  elements.eraseToolBtn.classList.toggle("is-active", tool === "erase");
}

function updateSize() {
  const rows = toInt(elements.rowsInput.value, state.rows);
  const cols = toInt(elements.colsInput.value, state.cols);
  elements.rowsInput.value = rows;
  elements.colsInput.value = cols;
  elements.importWidthInput.max = cols;
  elements.importHeightInput.max = rows;
  state.matrix = resizeMatrix(state.matrix, rows, cols);
  state.rows = rows;
  state.cols = cols;
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

function bindEvents() {
  elements.rowsInput.addEventListener("change", updateSize);
  elements.colsInput.addEventListener("change", updateSize);
  elements.tallCellsInput.addEventListener("change", (event) => {
    state.tallCells = event.target.checked;
    redraw();
  });
  elements.paintToolBtn.addEventListener("click", () => setTool("paint"));
  elements.eraseToolBtn.addEventListener("click", () => setTool("erase"));
  elements.clearBtn.addEventListener("click", () => {
    state.matrix = createMatrix(state.rows, state.cols);
    redraw();
  });
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
  window.addEventListener("keydown", (event) => {
    if (state.mode !== "weave") return;
    if (event.key === "ArrowLeft") setActiveColumn(state.activeColumn - 1);
    if (event.key === "ArrowRight") setActiveColumn(state.activeColumn + 1);
  });
}

function init() {
  elements.rowsInput.max = MAX_SIZE;
  elements.colsInput.max = MAX_SIZE;
  elements.instructionsPanel.open = !mobileLayout.matches;
  bindEvents();
  const params = new URLSearchParams(window.location.search);
  if (window.location.hash === "#weave" || params.get("mode") === "weave") {
    setMode("weave");
    return;
  }
  redraw();
}

init();
