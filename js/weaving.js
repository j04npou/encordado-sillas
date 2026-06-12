export function generateInstructions(matrix, direction = "top-down") {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const instructions = [];

  for (let col = 0; col < cols; col += 1) {
    const values = [];
    for (let step = 0; step < rows; step += 1) {
      const row = direction === "top-down" ? step : rows - 1 - step;
      values.push(matrix[row][col]);
    }
    instructions.push({
      column: col,
      segments: groupSegments(values),
    });
  }

  return instructions;
}

function groupSegments(values) {
  if (values.length === 0) return [];
  const segments = [];
  let current = values[0];
  let count = 1;

  for (let index = 1; index < values.length; index += 1) {
    if (values[index] === current) {
      count += 1;
      continue;
    }
    segments.push({ active: current, count });
    current = values[index];
    count = 1;
  }
  segments.push({ active: current, count });
  return segments;
}
