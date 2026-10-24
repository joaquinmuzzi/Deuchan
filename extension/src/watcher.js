import { Tracker } from "./tracker.js";

/**
 * Joins the tracker with the verdict about the language of the current video, and decides what is
 * worth saving. It knows nothing about the page: the content script feeds it events and a clock,
 * and gives it a `send(intervals)` function, so it can be tested.
 *
 * While the language is still unknown (the page has not shown the captions yet), the time is kept
 * and credited as soon as the video turns out to be German, or dropped if it is not.
 */
export class Watcher {
  #tracker = new Tracker();
  #german = null;
  #send;

  constructor({ send }) {
    this.#send = send;
  }

  /** What the popup shows: the verdict on the language (`null` while unknown) and whether it plays. */
  get status() {
    return { german: this.#german, playing: this.#tracker.isPlaying };
  }

  play(now) {
    this.#tracker.play(now);
  }

  pause(now) {
    this.#tracker.pause(now);
    this.flush(now);
  }

  /** The language of the current video is known: `true` for German, `false` for anything else. */
  setGerman(now, german) {
    this.#tracker.tick(now);
    this.#german = german;
    this.flush(now);
  }

  /** Another video starts: the time of the last one is settled and the verdict is forgotten. */
  newVideo(now) {
    this.flush(now);
    this.#tracker.take();
    this.#german = null;
  }

  /** Saves what has been counted if the video is German. Called every few seconds while playing. */
  flush(now) {
    this.#tracker.tick(now);
    if (this.#german === null) {
      return;
    }
    const intervals = this.#tracker.take();
    if (this.#german && intervals.length > 0) {
      this.#send(intervals);
    }
  }
}
