/**
 * The toolbar icon: grey while there is nothing German in the tab, orange (the colour of the app)
 * while the video of the tab is in German. It is drawn when needed, so there are no image files.
 */

export const IDLE_COLOR = "#8a8a8a";
export const GERMAN_COLOR = "#e8590c";

/** The colour of the icon for what the tab says about its video: `true` only for German. */
export const iconColor = (german) => (german === true ? GERMAN_COLOR : IDLE_COLOR);

/** The icon as `ImageData` for each size the browser asks for, to give to `chrome.action.setIcon`. */
export function drawIcons(color) {
  const icons = {};
  for (const size of [16, 32, 48, 128]) {
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d");
    context.fillStyle = color;
    context.fillRect(0, 0, size, size);
    context.fillStyle = "#ffffff";
    context.font = `bold ${Math.round(size * 0.72)}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    // A little above the middle: the letter has no tail, and its box does
    context.fillText("D", size / 2, size / 2 + size * 0.04);
    icons[size] = context.getImageData(0, 0, size, size);
  }
  return icons;
}
