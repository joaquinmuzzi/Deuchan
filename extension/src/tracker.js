/**
 * Counts how long a video really plays, as real seconds of the clock.
 *
 * It does not read `currentTime` and it does not look at the playback speed: rewinding, looping
 * and seeking still count, and a minute at 2x is a minute, not two. What it keeps are the
 * intervals of the clock in which the video was playing, not just their length, so that the
 * background script can tell when two tabs were playing at the same time and count that time once.
 */

/**
 * The longest gap between two ticks that is trusted. A longer one means the computer slept or the
 * browser froze the tab, and nobody was listening during that time.
 */
export const MAX_GAP_SECONDS = 5;

export class Tracker {
  #playingSince = null;
  #intervals = [];

  get isPlaying() {
    return this.#playingSince !== null;
  }

  /** The video started or resumed playing. `now` is a timestamp in seconds. */
  play(now) {
    if (this.isPlaying) {
      this.tick(now);
    }
    this.#playingSince = now;
  }

  /** The video paused, ended, is buffering or its tab closed. */
  pause(now) {
    this.tick(now);
    this.#playingSince = null;
  }

  /** Moves the clock forward without stopping, so the time can be saved while the video plays. */
  tick(now) {
    if (!this.isPlaying) {
      return;
    }
    const from = this.#playingSince;
    this.#playingSince = now;
    if (now - from <= 0 || now - from > MAX_GAP_SECONDS) {
      return;
    }
    const last = this.#intervals.at(-1);
    if (last && last.to === from) {
      last.to = now;
    } else {
      this.#intervals.push({ from, to: now });
    }
  }

  /** The intervals counted since the last call, to be saved. Starts again from nothing. */
  take() {
    const intervals = this.#intervals;
    this.#intervals = [];
    return intervals;
  }
}
