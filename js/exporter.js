export function exportMatrixAsPng(matrix, filename = "patron-cordado.png") {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const w = Math.max(1, cols);
  const h = Math.max(1, rows);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(w, h);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const idx = (row * cols + col) * 4;
      const val = matrix[row][col] ? 0 : 255;
      imageData.data[idx] = val;
      imageData.data[idx + 1] = val;
      imageData.data[idx + 2] = val;
      imageData.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
