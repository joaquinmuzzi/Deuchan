// Runs in every page and frame of every site while the immersion profile is on (see immersion.js),
// added by the background script. Every video that plays with sound counts: in this Chrome profile
// everything is in the target language, so there is no language to guess. The person can still say
// a page is not.
(async () => {
  // Added again when the page runs it twice (an extension update)
  if (globalThis.deuchanGeneric) {
    return;
  }
  globalThis.deuchanGeneric = true;
  // The pages of YouTube have their own script; a YouTube player inside another page does not
  if (location.hostname === "www.youtube.com" && window === window.top) {
    return;
  }

  const [{ Watcher }, { createSender }] = await Promise.all([
    import(chrome.runtime.getURL("src/watcher.js")),
    import(chrome.runtime.getURL("src/delivery.js")),
  ]);

  const FLUSH_EVERY_MS = 2_000;
  const now = () => Date.now() / 1000;

  // The background script names the item after the page of the tab, which a frame cannot see. The time
  // is kept until it says it is written, and sent again if it is not (see delivery.js)
  const sender = createSender((message) => chrome.runtime.sendMessage(message));
  const watcher = new Watcher({
    send: (intervals) => sender.send({ type: "watched", intervals, page: true }),
  });
  const announce = (inTarget) =>
    chrome.runtime.sendMessage({ type: "language", inTarget, page: true }).catch(() => {});

  const videos = new Set();
  let inTarget = true;
  let playing = false;
  let stopped = false;

  // A muted video is an animation or an advert that plays by itself, not something being watched
  const audible = (video) =>
    video.isConnected && !video.paused && !video.ended && !video.muted && video.volume > 0;

  function update() {
    const any = !stopped && [...videos].some(audible);
    if (any && !playing) {
      watcher.play(now());
    } else if (!any && playing) {
      watcher.pause(now());
    }
    playing = any;
  }

  function attach(video) {
    if (videos.has(video)) {
      return;
    }
    if (videos.size === 0) {
      watcher.setInTarget(now(), inTarget);
      announce(inTarget);
    }
    videos.add(video);
    for (const type of ["playing", "pause", "waiting", "ended", "volumechange", "emptied"]) {
      video.addEventListener(type, update);
    }
    update();
  }

  const lookForVideos = () => document.querySelectorAll("video").forEach(attach);

  new MutationObserver(lookForVideos).observe(document.documentElement, { childList: true, subtree: true });

  // Turned off: nothing more counts here, even before the page is opened again
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.immersion && changes.immersion.newValue?.enabled !== true) {
      stopped = true;
      update();
      watcher.flush(now());
    }
  });

  // The popup asks what the tab is doing; only a frame with a video answers
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || videos.size === 0 || stopped) {
      return;
    }
    if (message?.type === "status") {
      sendResponse({ ...watcher.status, immersion: true });
    } else if (message?.type === "setInTarget" && typeof message.inTarget === "boolean") {
      inTarget = message.inTarget;
      watcher.setInTarget(now(), inTarget);
      announce(inTarget);
    }
  });

  setInterval(() => {
    update();
    watcher.flush(now());
    sender.retry(now());
  }, FLUSH_EVERY_MS);
  document.addEventListener("visibilitychange", () => document.hidden && watcher.flush(now()));
  window.addEventListener("pagehide", () => watcher.flush(now()));

  lookForVideos();
})();
