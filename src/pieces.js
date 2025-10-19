export const PIECE_DEFINITIONS = [
  { id: "P1", name: "Single", squares: [[0, 0]] },
  { id: "P2", name: "Domino", squares: [[0, 0], [1, 0]] },
  { id: "P3", name: "Triomino I", squares: [[0, 0], [1, 0], [2, 0]] },
  { id: "P4", name: "Triomino L", squares: [[0, 0], [0, 1], [1, 0]] },
  { id: "P5", name: "Tetromino I", squares: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { id: "P6", name: "Tetromino O", squares: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { id: "P7", name: "Tetromino L", squares: [[0, 0], [0, 1], [0, 2], [1, 0]] },
  { id: "P8", name: "Tetromino T", squares: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { id: "P9", name: "Tetromino S", squares: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  { id: "P10", name: "Pentomino F", squares: [[1, 0], [0, 1], [1, 1], [1, 2], [2, 1]] },
  { id: "P11", name: "Pentomino I", squares: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
  { id: "P12", name: "Pentomino L", squares: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0]] },
  { id: "P13", name: "Pentomino P", squares: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] },
  { id: "P14", name: "Pentomino N", squares: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]] },
  { id: "P15", name: "Pentomino T", squares: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]] },
  { id: "P16", name: "Pentomino U", squares: [[0, 0], [0, 1], [1, 1], [2, 0], [2, 1]] },
  { id: "P17", name: "Pentomino V", squares: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] },
  { id: "P18", name: "Pentomino W", squares: [[0, 0], [1, 1], [1, 0], [2, 1], [2, 2]] },
  { id: "P19", name: "Pentomino X", squares: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },
  { id: "P20", name: "Pentomino Y", squares: [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1]] },
  { id: "P21", name: "Pentomino Z", squares: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]] },
];

export function normalizeShape(shape) {
  const minX = Math.min(...shape.map(([x]) => x));
  const minY = Math.min(...shape.map(([, y]) => y));
  return shape
    .map(([x, y]) => [x - minX, y - minY])
    .sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
}

function rotate90(shape) {
  return shape.map(([x, y]) => [y, -x]);
}

function flipHorizontal(shape) {
  return shape.map(([x, y]) => [-x, y]);
}

export function getAllOrientations(shape) {
  const orientations = new Map();
  let current = shape;
  for (let i = 0; i < 4; i += 1) {
    const normalized = normalizeShape(current);
    const key = JSON.stringify(normalized);
    orientations.set(key, normalized);
    const flipped = normalizeShape(flipHorizontal(current));
    orientations.set(JSON.stringify(flipped), flipped);
    current = rotate90(current);
  }
  return Array.from(orientations.values());
}

export function getPieceById(id) {
  return PIECE_DEFINITIONS.find((piece) => piece.id === id);
}

export function getPieceOrientationsById(id) {
  const piece = getPieceById(id);
  if (!piece) return [];
  return getAllOrientations(piece.squares);
}
