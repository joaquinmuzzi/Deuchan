/**
 * The icon of Deuchan: a "D" made of the little squares of the activity heatmap, white on a rounded
 * square. The toolbar icon is grey while there is nothing German in the tab and orange (the colour of
 * the app) while the video of the tab is in German. It is drawn when needed, so the toolbar needs no
 * image file, and `scripts/make-icons.mjs` draws the same shape into the PNG files of the manifest.
 *
 * The shape is in units of a 48 x 48 square, and `iconCells` and `insideRoundedRect` are pure, so
 * both drawings share it.
 */

export const IDLE_COLOR = "#8a8a8a";
export const GERMAN_COLOR = "#e8590c";

/** The colour of the icon for what the tab says about its video: `true` only for German. */
export const iconColor = (german) => (german === true ? GERMAN_COLOR : IDLE_COLOR);

/** The squares of the heatmap that make the letter. `X` is a lit square and `.` is an empty one. */
export const PATTERN = ["XXXX.", "X...X", "X...X", "X...X", "XXXX."];

const UNIT = 48;
const CELL = 6.4;
const GAP = 2.2;
const CELL_RADIUS = 1.4;
/** The corner of the icon, as in the sections of the app. */
const CORNER = 11;
/** The squares that are not part of the letter are still drawn, faintly, as in a heatmap. */
const FAINT = 0.22;

/** The square of the icon as a rounded rectangle, for a canvas of `size` pixels. */
export const iconShape = (size) => ({
  x: 0,
  y: 0,
  width: size,
  height: size,
  radius: (CORNER / UNIT) * size,
});

/** The 25 squares for a canvas of `size` pixels: where, how big and how opaque the white is. */
export function iconCells(size) {
  const scale = size / UNIT;
  const start = (UNIT - (PATTERN.length * CELL + (PATTERN.length - 1) * GAP)) / 2;
  return PATTERN.flatMap((row, line) =>
    [...row].map((mark, column) => ({
      x: (start + column * (CELL + GAP)) * scale,
      y: (start + line * (CELL + GAP)) * scale,
      width: CELL * scale,
      height: CELL * scale,
      radius: CELL_RADIUS * scale,
      alpha: mark === "X" ? 1 : FAINT,
    })),
  );
}

/** Whether the point is inside the rounded rectangle (`x`, `y`, `width`, `height`, `radius`). */
export function insideRoundedRect(pointX, pointY, { x, y, width, height, radius }) {
  if (pointX < x || pointX > x + width || pointY < y || pointY > y + height) {
    return false;
  }
  // Only the corners cut: look at the distance to the centre of the nearest one
  const cornerX = Math.min(Math.max(pointX, x + radius), x + width - radius);
  const cornerY = Math.min(Math.max(pointY, y + radius), y + height - radius);
  return (pointX - cornerX) ** 2 + (pointY - cornerY) ** 2 <= radius ** 2;
}

/** The icon as `ImageData` for each size the browser asks for, to give to `chrome.action.setIcon`. */
export function drawIcons(color) {
  const icons = {};
  for (const size of [16, 32, 48, 128]) {
    const context = new OffscreenCanvas(size, size).getContext("2d");
    const { x, y, width, height, radius } = iconShape(size);
    context.fillStyle = color;
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    context.fill();
    for (const cell of iconCells(size)) {
      context.fillStyle = `rgba(255, 255, 255, ${cell.alpha})`;
      context.beginPath();
      context.roundRect(cell.x, cell.y, cell.width, cell.height, cell.radius);
      context.fill();
    }
    icons[size] = context.getImageData(0, 0, size, size);
  }
  return icons;
}
