import { Tracker } from "./tracker.js";

/**
 * Joins the tracker with the verdict about the language of the current video, and decides what is
 * worth saving. It knows nothing about the page: the content script feeds it events and a clock,
 * and gives it a `send(intervals)` function, so it can be tested.
 *
 * While the language is still unknown (the page has not shown the captions yet), the time is kept
 * and credited as soon as the video turns out to be in the target language, or dropped if it is not.
 */
export class Watcher {
  #tracker = new Tracker();
  #inTarget = null;
  #send;

  constructor({ send }) {
    this.#send = send;
  }

  /** What the popup shows: the verdict on the language (`null` while unknown) and whether it plays. */
  get status() {
    return { inTarget: this.#inTarget, playing: this.#tracker.isPlaying };
  }

  play(now) {
    this.#tracker.play(now);
  }

  pause(now) {
    this.#tracker.pause(now);
    this.flush(now);
  }

  /**
   * What the player says right now, checked every few seconds: stops the count of a video that stopped
   * without an event saying so. When YouTube's player fails ("Something went wrong") it empties the video
   * element, which leaves it paused without a `pause` event, and the time went on counting for as long as
   * the tab stayed open. It never starts the count: only the `playing` event does that.
   */
  sync(now, playing) {
    if (!playing && this.#tracker.isPlaying) {
      this.pause(now);
    }
  }

  /** The language of the current video is known: `true` for the target language, `false` for anything else. */
  setInTarget(now, inTarget) {
    this.#tracker.tick(now);
    this.#inTarget = inTarget;
    this.flush(now);
  }

  /** Another video starts: the time of the last one is settled and the verdict is forgotten. */
  newVideo(now) {
    this.flush(now);
    this.#tracker.take();
    this.#inTarget = null;
  }

  /** Saves what has been counted if the video is in the target language. Called every few seconds while playing. */
  flush(now) {
    this.#tracker.tick(now);
    if (this.#inTarget === null) {
      return;
    }
    const intervals = this.#tracker.take();
    if (this.#inTarget && intervals.length > 0) {
      this.#send(intervals);
    }
  }
}
