// Runs on the streaming sites the person turned on in the settings (see sites.js), added by the background
// script. It asks the page script (streaming-bridge.js) what the player plays, lets streaming.js turn that
// into an episode, its audio language and whether an ad plays, and counts the seconds the video element
// plays in the target language, as content.js does on YouTube. In the immersion profile every title counts.
(async () => {
  // Added again when the page runs it twice (an extension update)
  if (globalThis.inputlyStreaming) {
    return;
  }
  // Set before anything waits: the immersion profile's script (generic.js), which runs later in the same
  // pages, leaves a page this script counts alone, or the time would be counted under two names
  globalThis.inputlyStreaming = true;

  const { siteOfUrl } = await import(chrome.runtime.getURL("src/sites.js"));
  const site = siteOfUrl(location.href);
  if (!site) {
    return;
  }

  const FLUSH_EVERY_MS = 2_000;
  const ASK_EVERY_MS = 1_000;
  // A frame that stopped telling counts as stopped after this long (it says every flush period)
  const FRAME_SILENCE_MS = 6_000;
  const videoPlays = (video) => video.isConnected && !video.paused && !video.ended;

  // The player of some sites (Crunchyroll's Vilos) is a frame of another origin than the page: there this
  // script only tells the page whether its video plays, and the page counts it
  if (window !== window.top) {
    if (!(site.frames ?? []).includes(location.origin)) {
      globalThis.inputlyStreaming = false;
      return;
    }
    const tell = () =>
      window.top.postMessage(
        { type: "inputly:frame-video", playing: [...document.querySelectorAll("video")].some(videoPlays) },
        "*",
      );
    for (const type of ["playing", "pause", "waiting", "ended", "emptied", "error"]) {
      document.addEventListener(type, tell, true);
    }
    setInterval(tell, FLUSH_EVERY_MS);
    return;
  }

  const [
    { Watcher },
    { readStreaming, streamingItem, streamingVerdict },
    { overridesKey, verdict },
    { immersionOf },
    { TARGET_KEY, targetOf },
    { createSender },
    { SITES_KEY, enabledSites },
  ] = await Promise.all([
    import(chrome.runtime.getURL("src/watcher.js")),
    import(chrome.runtime.getURL("src/streaming.js")),
    import(chrome.runtime.getURL("src/overrides.js")),
    import(chrome.runtime.getURL("src/immersion.js")),
    import(chrome.runtime.getURL("src/target.js")),
    import(chrome.runtime.getURL("src/delivery.js")),
    import(chrome.runtime.getURL("src/sites.js")),
  ]);
  const saved = await chrome.storage.local.get(["immersion", TARGET_KEY]);
  let immersion = immersionOf(saved.immersion);
  let target = targetOf(saved[TARGET_KEY]);
  let stopped = false;

  const now = () => Date.now() / 1000;
  // The episode or film that plays: `{ id, title, url }`, named in the day's list and in the popup
  let item = null;
  let key = null;
  let decided = null;
  const sender = createSender((message) => chrome.runtime.sendMessage(message));
  const watcher = new Watcher({
    send: (intervals) => sender.send({ type: "watched", intervals, video: item }),
  });
  const announce = (inTarget) => chrome.runtime.sendMessage({ type: "language", inTarget }).catch(() => {});

  // Whether a video plays: an element of this page, or the frame of the player
  const videos = new Set();
  let frameSaid = { playing: false, at: 0 };
  const playsNow = () =>
    !stopped &&
    ([...videos].some(videoPlays) || (frameSaid.playing && Date.now() - frameSaid.at < FRAME_SILENCE_MS));
  let playing = false;
  let ad = false;

  function update() {
    const plays = playsNow();
    watcher.setAd(now(), ad, plays);
    if (plays && !playing) {
      watcher.play(now());
    } else if (!plays && playing) {
      watcher.pause(now());
    }
    playing = plays;
  }

  function attach(video) {
    if (videos.has(video)) {
      return;
    }
    videos.add(video);
    for (const type of ["playing", "pause", "waiting", "ended", "emptied", "error"]) {
      video.addEventListener(type, update);
    }
    update();
  }
  const lookForVideos = () => document.querySelectorAll("video").forEach(attach);

  window.addEventListener("message", (event) => {
    if (event.data?.type === "inputly:frame-video" && (site.frames ?? []).includes(event.origin)) {
      frameSaid = { playing: event.data.playing === true, at: Date.now() };
      update();
    }
  });

  const ask = () =>
    window.postMessage({ type: "inputly:streaming-request", site: site.id }, window.location.origin);

  function forget() {
    watcher.newVideo(now());
    item = null;
    key = null;
    decided = null;
    announce(null);
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.data?.type !== "inputly:streaming" || event.data.site !== site.id) {
      return;
    }
    const info = readStreaming(site.id, event.data.raw);
    if (!info) {
      // The player closed, or the page went back to browsing: what was counted is settled
      if (key !== null) {
        forget();
      }
      return;
    }
    if (info.key !== key) {
      forget();
      key = info.key;
    }
    item = streamingItem(info, site.name);
    if (info.ad !== ad) {
      ad = info.ad;
      update();
    }
    // What the person decided about this title, for this target language, wins over the player's answer
    const asked = target;
    const storageKey = overridesKey(asked);
    const { [storageKey]: overrides } = await chrome.storage.local.get(storageKey);
    if (info.key !== key || asked !== target || ad) {
      // During an ad the tracks are the ad's: the verdict stays the title's
      return;
    }
    const guess = immersion ? true : streamingVerdict(info, asked);
    const inTarget = verdict(overrides, item.id, guess);
    if (typeof inTarget === "boolean" && inTarget !== decided) {
      decided = inTarget;
      watcher.setInTarget(now(), inTarget);
      announce(inTarget);
    }
  });

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
    // Turned off: nothing more counts here, even before the page is opened again
    if (changes[SITES_KEY] && !enabledSites(changes[SITES_KEY].newValue).includes(site.id)) {
      stopped = true;
      update();
      watcher.flush(now());
    }
    if (changes[overridesKey(target)] || changes.immersion || changes[TARGET_KEY]) {
      decided = null;
      ask();
    }
  });

  // The popup asks what the tab plays, and can correct the answer about its language
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || stopped || !item) {
      return;
    }
    if (message?.type === "status") {
      sendResponse({ ...watcher.status, immersion, title: item.title });
    } else if (message?.type === "setInTarget" && typeof message.inTarget === "boolean") {
      decided = message.inTarget;
      watcher.setInTarget(now(), message.inTarget);
      announce(message.inTarget);
      chrome.runtime
        .sendMessage({ type: "override", videoId: item.id, inTarget: message.inTarget })
        .catch(() => {});
    }
  });

  new MutationObserver(lookForVideos).observe(document.documentElement, { childList: true, subtree: true });
  // These sites change page without loading one, and switch tracks while playing: the player is asked
  // every second, which costs a few property reads
  setInterval(ask, ASK_EVERY_MS);
  setInterval(() => {
    update();
    watcher.sync(now(), playsNow());
    watcher.flush(now());
    sender.retry(now());
  }, FLUSH_EVERY_MS);
  document.addEventListener("visibilitychange", () => document.hidden && watcher.flush(now()));
  window.addEventListener("pagehide", () => watcher.flush(now()));

  lookForVideos();
  ask();
})();
