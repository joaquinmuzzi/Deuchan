// Runs on YouTube pages. Listens to the player and tells the background script how many seconds in the
// target language (German unless the person chose another, see target.js) were watched. The logic is
// in watcher.js and language.js; this file only connects them to the page. In the immersion profile
// (see immersion.js) every video is taken for the target language, unless the person said it is not.
(async () => {
  const [
    { Watcher },
    { detectTarget, needsTextLanguages, videoText },
    { overridesKey, verdict },
    { immersionOf },
    { TARGET_KEY, targetOf },
    { createSender },
  ] = await Promise.all([
    import(chrome.runtime.getURL("src/watcher.js")),
    import(chrome.runtime.getURL("src/language.js")),
    import(chrome.runtime.getURL("src/overrides.js")),
    import(chrome.runtime.getURL("src/immersion.js")),
    import(chrome.runtime.getURL("src/target.js")),
    import(chrome.runtime.getURL("src/delivery.js")),
  ]);
  const saved = await chrome.storage.local.get(["immersion", TARGET_KEY]);
  let immersion = immersionOf(saved.immersion);
  let target = targetOf(saved[TARGET_KEY]);

  const FLUSH_EVERY_MS = 2_000;
  const LANGUAGE_RETRY_MS = 1_000;
  const RECHECK_EVERY_MS = 5_000;
  const LANGUAGE_ATTEMPTS = 15;

  // The wall clock, not performance.now(): every tab has to measure on the same clock, so that the
  // background script can see when two tabs played at the same time
  const now = () => Date.now() / 1000;
  // The video that is playing, so that the time can be explained afterwards: which videos made a day
  let currentVideo = null;
  // The time is kept until the background script says it is written, and sent again if it is not
  const sender = createSender((message) => chrome.runtime.sendMessage(message));
  const watcher = new Watcher({
    send: (intervals) => sender.send({ type: "watched", intervals, video: currentVideo }),
  });

  // The toolbar icon of this tab turns orange while the video is in the target language
  const announce = (inTarget) => chrome.runtime.sendMessage({ type: "language", inTarget }).catch(() => {});

  let currentVideoId = null;
  // What the language of the video was taken to be the last time, so that the same answer is not
  // given again and again
  let decided = null;
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

  // What Chrome's detector said about the last text it was asked about: the page is asked again every few
  // seconds, and the title and description rarely change
  let lastText = null;
  let lastLanguages = null;

  /** The languages Chrome detects in the text of a video, or null if it cannot tell. */
  async function textLanguages(video) {
    const text = videoText(video);
    if (text !== lastText) {
      try {
        lastLanguages = await chrome.i18n.detectLanguage(text);
      } catch {
        lastLanguages = null;
      }
      lastText = text;
    }
    return lastLanguages;
  }

  function setVerdict(inTarget) {
    watcher.setInTarget(now(), inTarget);
    announce(inTarget);
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.data?.type !== "deuchan:video" || !event.data.videoId) {
      return;
    }
    const videoId = event.data.videoId;
    if (videoId !== currentVideoId) {
      watcher.newVideo(now());
      currentVideoId = videoId;
      decided = null;
    }
    currentVideo = { id: videoId, title: event.data.title };
    // What the user decided about this video, for this target language, wins over the guess
    const asked = target;
    const key = overridesKey(asked);
    const { [key]: overrides } = await chrome.storage.local.get(key);
    // The immersion profile takes every video for the target, so it needs no detector
    const languages =
      !immersion && needsTextLanguages(event.data, asked) ? await textLanguages(event.data) : null;
    // The target may have changed while waiting: the answer of the next request will use the new one
    if (videoId === currentVideoId && asked === target) {
      const detected = detectTarget(event.data, { target: asked, textLanguages: languages }).inTarget;
      const inTarget = verdict(overrides, videoId, immersion || detected);
      if (inTarget !== decided) {
        decided = inTarget;
        setVerdict(inTarget);
      }
    }
  });

  // The video element listened to, to check every few seconds that it still plays
  let attached = null;
  const playsNow = (video) => video !== null && video.isConnected && !video.paused && !video.ended;

  function attach(video) {
    if (video.dataset.deuchan) {
      return;
    }
    video.dataset.deuchan = "attached";
    attached = video;
    const startIfPlaying = () => !video.paused && watcher.play(now());
    video.addEventListener("playing", startIfPlaying);
    // A player that fails empties the element (`emptied`, sometimes `error`) and sends no `pause`
    for (const type of ["pause", "waiting", "ended", "emptied", "error"]) {
      video.addEventListener(type, () => watcher.pause(now()));
    }
    startIfPlaying();
  }

  // Whether the player shows an ad. YouTube plays ads in the same video element as the video, so its
  // `playing` events would count them. The player data was tried first (a real pre-roll, 2026-11-23): during
  // the ad, `getAdState()` said -1 (no ad), and `getVideoData()` and `getPlayerResponse()` gave the video's own
  // id, so nothing there tells them apart (which also means the language verdict, made from that data, stays
  // the video's). The `ad-showing` class on `#movie_player` was there from the first frame of the ad to the
  // last, skipped or not, and went away just before the video's `playing`. The player's own CSS hangs on that
  // class, and it can be read from this isolated world and watched without polling. Overlay ads over a
  // playing video do not set it, and do not need to: the video still plays.
  const AD_CLASS = "ad-showing";
  let player = null;
  const updateAd = () =>
    watcher.setAd(now(), player?.classList.contains(AD_CLASS) ?? false, playsNow(attached));
  const adObserver = new MutationObserver(updateAd);

  function watchPlayer() {
    const found = document.getElementById("movie_player");
    if (found && found !== player) {
      player = found;
      adObserver.disconnect();
      adObserver.observe(player, { attributes: true, attributeFilter: ["class"] });
      updateAd();
    }
  }

  function lookForVideo() {
    const video = document.querySelector("video.html5-main-video");
    if (video) {
      watchPlayer();
      attach(video);
    }
  }

  // YouTube is a single page app: the video element stays and the page changes under it
  document.addEventListener("yt-navigate-finish", () => {
    currentVideoId = null;
    decided = null;
    attempts = 0;
    announce(null);
    lookForVideo();
    findLanguage();
  });
  new MutationObserver(lookForVideo).observe(document.documentElement, { childList: true, subtree: true });

  // A decision about a video made somewhere else (the dashboard), or another target language, applies to
  // the one that is playing now
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }
    if (changes.immersion) {
      immersion = immersionOf(changes.immersion.newValue);
    }
    if (changes[TARGET_KEY]) {
      target = targetOf(changes[TARGET_KEY].newValue);
    }
    const relevant = changes[overridesKey(target)] || changes.immersion || changes[TARGET_KEY];
    if (relevant && currentVideoId) {
      askForVideo();
    }
  });

  // The popup asks what the current tab is doing, and can correct the guess about the language
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) {
      return;
    }
    if (message?.type === "status") {
      sendResponse({ ...watcher.status, immersion, title: currentVideo?.title ?? "" });
    } else if (message?.type === "setInTarget" && typeof message.inTarget === "boolean" && currentVideoId) {
      decided = message.inTarget;
      setVerdict(message.inTarget);
      chrome.runtime
        .sendMessage({ type: "override", videoId: currentVideoId, inTarget: message.inTarget })
        .catch(() => {});
    }
  });

  setInterval(() => {
    updateAd();
    watcher.sync(now(), playsNow(attached));
    watcher.flush(now());
    sender.retry(now());
  }, FLUSH_EVERY_MS);
  // The audio track can change while the video plays (the viewer picks another language)
  setInterval(() => currentVideoId && askForVideo(), RECHECK_EVERY_MS);
  document.addEventListener("visibilitychange", () => document.hidden && watcher.flush(now()));
  window.addEventListener("pagehide", () => watcher.flush(now()));

  lookForVideo();
  findLanguage();
})();
