export function exportMatrixAsPng(matrix, filename = "patron-cordado.png") {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const scale = Math.max(8, Math.min(32, Math.floor(1600 / Math.max(rows, cols))));
  const canvas = document.createElement("canvas");
  canvas.width = cols * scale;
  canvas.height = rows * scale;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#fbfcfb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      ctx.fillStyle = matrix[row][col] ? "#163f39" : "#fbfcfb";
      ctx.fillRect(col * scale, row * scale, scale, scale);
    }
  }

  ctx.strokeStyle = "rgba(34, 32, 29, 0.18)";
  ctx.lineWidth = 1;
  for (let col = 0; col <= cols; col += 1) {
    ctx.beginPath();
    ctx.moveTo(col * scale + 0.5, 0);
    ctx.lineTo(col * scale + 0.5, canvas.height);
    ctx.stroke();
  }
  for (let row = 0; row <= rows; row += 1) {
    ctx.beginPath();
    ctx.moveTo(0, row * scale + 0.5);
    ctx.lineTo(canvas.width, row * scale + 0.5);
    ctx.stroke();
  }

  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
