import { clamp, MAX_SIZE } from "./state.js";

// Codifica el diseño completo (área activa + overflow) y su configuración en una URL,
// y lo reconstruye al abrirla. La matriz se empaqueta bit a bit y se pasa a base64url.

const VERSION = 1;

function toBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function packMatrix(matrix, rows, cols) {
  const bytes = new Uint8Array(Math.ceil((rows * cols) / 8));
  let index = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (matrix[r][c]) bytes[index >> 3] |= 1 << (index & 7);
      index += 1;
    }
  }
  return bytes;
}

function unpackMatrix(bytes, rows, cols) {
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(false));
  let index = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      matrix[r][c] = ((bytes[index >> 3] >> (index & 7)) & 1) === 1;
      index += 1;
    }
  }
  return matrix;
}

export function encodeDesign(state) {
  const mr = state.matrix.length;
  const mc = state.matrix[0]?.length ?? 0;
  const params = new URLSearchParams();
  params.set("v", String(VERSION));
  params.set("r", String(state.rows));
  params.set("c", String(state.cols));
  params.set("mr", String(mr));
  params.set("mc", String(mc));
  if (state.offsetRow) params.set("or", String(state.offsetRow));
  if (state.offsetCol) params.set("oc", String(state.offsetCol));
  if (state.tallCells) params.set("t", "1");
  if (state.widePixels) params.set("w", "1");
  if (state.readDirection === "top-down") params.set("dir", "td");
  params.set("m", toBase64Url(packMatrix(state.matrix, mr, mc)));
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = params.toString();
  return url.toString();
}

export function decodeDesign(search) {
  const params = new URLSearchParams(search);
  if (!params.has("m") || !params.has("mr") || !params.has("mc")) return null;
  const mr = Number.parseInt(params.get("mr"), 10);
  const mc = Number.parseInt(params.get("mc"), 10);
  if (!Number.isInteger(mr) || !Number.isInteger(mc) || mr < 1 || mc < 1) return null;
  let bytes;
  try {
    bytes = fromBase64Url(params.get("m"));
  } catch {
    return null;
  }
  if (bytes.length < Math.ceil((mr * mc) / 8)) return null;

  const intOr = (key, fallback) => {
    const n = Number.parseInt(params.get(key), 10);
    return Number.isInteger(n) ? n : fallback;
  };
  return {
    matrix: unpackMatrix(bytes, mr, mc),
    rows: clamp(intOr("r", mr), 1, MAX_SIZE),
    cols: clamp(intOr("c", mc), 1, MAX_SIZE),
    offsetRow: clamp(intOr("or", 0), 0, mr),
    offsetCol: clamp(intOr("oc", 0), 0, mc),
    tallCells: params.get("t") === "1",
    widePixels: params.get("w") === "1",
    readDirection: params.get("dir") === "td" ? "top-down" : "bottom-up",
  };
}
