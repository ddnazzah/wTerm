export interface Size {
  width: number
  height: number
}

export interface Box extends Size {
  left: number
  top: number
}

/** Fraction of the viewport the modal takes when the user has not resized it. */
const WIDTH_RATIO = 0.92
const HEIGHT_RATIO = 0.92

/** Never smaller than this, or the editor stops being usable. */
const MIN_WIDTH = 420
const MIN_HEIGHT = 300

/**
 * Widest the editor goes on its own. Beyond roughly this, lines get long
 * enough to hurt readability, so extra screen width is left as margin rather
 * than spent on the editor.
 */
const MAX_AUTO_WIDTH = 1800

/** Margin kept around the modal so it never meets the window edge. */
const EDGE_MARGIN = 40

/**
 * Size for the file modal, given the viewport and any previously saved size.
 *
 * With no saved size the modal is proportional to the screen, so a larger
 * display genuinely gets a larger editor instead of the old fixed 900×600.
 *
 * A saved size is respected, but it is clamped to fit the current viewport —
 * and grown if it is far smaller than the screen now allows, which is what
 * happens when a size saved on a laptop is reopened on a much larger display.
 * A saved size that is merely a bit smaller than the proportional default is
 * treated as a deliberate choice and left alone.
 */
export function modalSizeFor(viewport: Size, saved: Size | null): Size {
  const auto = {
    width: clamp(
      Math.round(viewport.width * WIDTH_RATIO),
      MIN_WIDTH,
      Math.min(MAX_AUTO_WIDTH, viewport.width - EDGE_MARGIN)
    ),
    height: clamp(
      Math.round(viewport.height * HEIGHT_RATIO),
      MIN_HEIGHT,
      viewport.height - EDGE_MARGIN
    ),
  }

  if (!saved || saved.width < MIN_WIDTH || saved.height < MIN_HEIGHT) {
    return auto
  }

  // "Far smaller" = under 70% of what the screen now affords. Below that the
  // saved value is almost certainly a leftover from a smaller display rather
  // than a preference worth preserving.
  const outgrown = saved.width < auto.width * 0.7

  if (outgrown) {
    return auto
  }

  return {
    width: clamp(saved.width, MIN_WIDTH, viewport.width - EDGE_MARGIN),
    height: clamp(saved.height, MIN_HEIGHT, viewport.height - EDGE_MARGIN),
  }
}

/**
 * Place the floating editor inside `host` — the workspace's content area, not
 * the whole window.
 *
 * Sizing against the viewport is what broke: a card 92% of the window wide
 * reached under the right sidebar and the activity bar, and every button there
 * stopped responding because the clicks landed on the editor instead. The
 * chrome around the workspace has to stay reachable while a file is open, so
 * the card is measured and centred against the space the workspace actually
 * owns, and is never allowed to exceed it — not even to honour MIN_WIDTH.
 */
export function modalBoxIn(host: Box, saved: Size | null): Box {
  const fitted = modalSizeFor({ width: host.width, height: host.height }, saved)
  const width = Math.min(fitted.width, host.width)
  const height = Math.min(fitted.height, host.height)

  return {
    left: host.left + (host.width - width) / 2,
    top: host.top + (host.height - height) / 2,
    width,
    height,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)))
}

/**
 * Clamp an explicitly chosen size to the viewport.
 *
 * Used while dragging the resize handle. Unlike {@link modalSizeFor} this
 * never grows the result: the user dragging the modal small on a large display
 * is a deliberate choice, and snapping it back to the proportional default
 * would make the handle feel broken.
 */
export function clampModalSize(viewport: Size, size: Size): Size {
  return {
    width: clamp(size.width, MIN_WIDTH, viewport.width - EDGE_MARGIN),
    height: clamp(size.height, MIN_HEIGHT, viewport.height - EDGE_MARGIN),
  }
}
