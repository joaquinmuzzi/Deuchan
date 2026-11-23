import { Tracker } from "./tracker.js";

/**
 * Joins the tracker with the verdict about the language of the current video, and decides what is
 * worth saving. It knows nothing about the page: the content script feeds it events and a clock,
 * and gives it a `send(intervals)` function, so it can be tested.
 *
 * While the language is still unknown (the page has not shown the captions yet), the time is kept
 * and credited as soon as the video turns out to be in the target language, or dropped if it is not.
 *
 * An ad is not input: while one plays (see `setAd`) nothing is counted, and the verdict stays the
 * video's, since the ad plays in the same player before, in the middle of or after it.
 */
export class Watcher {
  #tracker = new Tracker();
  #inTarget = null;
  #ad = false;
  #send;

  constructor({ send }) {
    this.#send = send;
  }

  /**
   * What the popup shows: the verdict on the language (`null` while unknown), whether it is counted as
   * playing, and whether an ad plays instead of the video.
   */
  get status() {
    return { inTarget: this.#inTarget, playing: this.#tracker.isPlaying, ad: this.#ad };
  }

  /** The video element plays. During an ad it plays the ad, which does not count. */
  play(now) {
    if (!this.#ad) {
      this.#tracker.play(now);
    }
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

  /**
   * Whether the player shows an ad, told every time it may have changed (it does nothing if nothing did).
   * An ad stops the count and saves the video's time before it; when it ends, the count goes on if the
   * element plays (`playing`), because the video may resume in the same element without a new `playing`
   * event.
   */
  setAd(now, showing, playing) {
    if (showing === this.#ad) {
      return;
    }
    if (showing) {
      this.pause(now);
      this.#ad = true;
    } else {
      this.#ad = false;
      if (playing) {
        this.play(now);
      }
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
