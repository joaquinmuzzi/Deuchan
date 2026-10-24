// Runs on YouTube pages. Listens to the player and tells the background script how many seconds of
// German were watched. The logic is in watcher.js and language.js; this file only connects them to
// the page.
(async () => {
  const [{ Watcher }, { detectGerman }] = await Promise.all([
    import(chrome.runtime.getURL("src/watcher.js")),
    import(chrome.runtime.getURL("src/language.js")),
  ]);

  const FLUSH_EVERY_MS = 10_000;
  const LANGUAGE_RETRY_MS = 1_000;
  const LANGUAGE_ATTEMPTS = 15;

  const now = () => performance.now() / 1000;
  const watcher = new Watcher({
    send: (seconds) => chrome.runtime.sendMessage({ type: "watched", seconds }).catch(() => {}),
  });

  let currentVideoId = null;
  let attempts = 0;

  function askForVideo() {
    window.postMessage({ type: "deuchan:request" }, window.location.origin);
  }

  // The player data arrives a moment after the page changes, so ask again until it is there
  function findLanguage() {
    askForVideo();
    attempts += 1;
    if (attempts < LANGUAGE_ATTEMPTS) {
      setTimeout(() => currentVideoId === null && findLanguage(), LANGUAGE_RETRY_MS);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "deuchan:video" || !event.data.videoId) {
      return;
    }
    if (event.data.videoId !== currentVideoId) {
      watcher.newVideo(now());
      currentVideoId = event.data.videoId;
    }
    watcher.setGerman(now(), detectGerman(event.data).german);
  });

  function attach(video) {
    if (video.dataset.deuchan) {
      return;
    }
    video.dataset.deuchan = "attached";
    const startIfPlaying = () => !video.paused && watcher.play(now(), video.playbackRate);
    video.addEventListener("playing", startIfPlaying);
    video.addEventListener("pause", () => watcher.pause(now()));
    video.addEventListener("waiting", () => watcher.pause(now()));
    video.addEventListener("ended", () => watcher.pause(now()));
    video.addEventListener("ratechange", () => watcher.setRate(now(), video.playbackRate));
    startIfPlaying();
  }

  function lookForVideo() {
    const video = document.querySelector("video.html5-main-video");
    if (video) {
      attach(video);
    }
  }

  // YouTube is a single page app: the video element stays and the page changes under it
  document.addEventListener("yt-navigate-finish", () => {
    currentVideoId = null;
    attempts = 0;
    lookForVideo();
    findLanguage();
  });
  new MutationObserver(lookForVideo).observe(document.documentElement, { childList: true, subtree: true });

  setInterval(() => watcher.flush(now()), FLUSH_EVERY_MS);
  document.addEventListener("visibilitychange", () => document.hidden && watcher.flush(now()));
  window.addEventListener("pagehide", () => watcher.flush(now()));

  lookForVideo();
  findLanguage();
})();
