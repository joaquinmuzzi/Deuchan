/**
 * Counts how long a video really plays.
 *
 * It does not read `currentTime`: rewinding, looping and seeking move it back and forth, but all
 * of that is still time spent listening. Instead it measures the clock while the video is playing
 * and multiplies by the playback speed, so a minute at 1.5x counts as 1.5 minutes of German.
 */

/**
 * The longest gap between two ticks that is trusted. A longer one means the computer slept or the
 * browser froze the tab, and nobody was listening during that time.
 */
export const MAX_GAP_SECONDS = 5;

export class Tracker {
  #playingSince = null;
  #rate = 1;
  #pending = 0;

  get isPlaying() {
    return this.#playingSince !== null;
  }

  /** The video started or resumed playing. `now` is a timestamp in seconds. */
  play(now, rate = 1) {
    if (this.isPlaying) {
      this.tick(now);
    }
    this.#playingSince = now;
    this.#rate = rate;
  }

  /** The video paused, ended, is buffering or its tab closed. */
  pause(now) {
    this.tick(now);
    this.#playingSince = null;
  }

  /** The playback speed changed. */
  setRate(now, rate) {
    if (this.isPlaying) {
      this.tick(now);
    }
    this.#rate = rate;
  }

  /** Moves the clock forward without stopping, so the time can be saved while the video plays. */
  tick(now) {
    if (!this.isPlaying) {
      return;
    }
    const elapsed = now - this.#playingSince;
    this.#playingSince = now;
    if (elapsed > 0 && elapsed <= MAX_GAP_SECONDS) {
      this.#pending += elapsed * this.#rate;
    }
  }

  /** The seconds counted since the last call, to be saved. Starts again from zero. */
  take() {
    const seconds = this.#pending;
    this.#pending = 0;
    return seconds;
  }
}
