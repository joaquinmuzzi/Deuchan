// Runs in the page itself (world "MAIN") on the streaming sites the person turned on (see sites.js), because
// what the player knows is not visible from the isolated world of a content script. It answers
// `inputly:streaming-request` with a copy of a few plain values (the ids, the title, the playing audio and
// subtitle tracks, whether an ad plays), which streaming.js turns into what counts. It never writes to the
// page, never calls the player, and makes no request. What each value is, and where it was seen, is in
// docs/streaming.md.
(() => {
  if (window.inputlyStreamingBridge) {
    return;
  }
  window.inputlyStreamingBridge = true;

  const MAX_TEXT = 300;
  const str = (value) => (typeof value === "string" ? value.slice(0, MAX_TEXT) : null);
  const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  const attempt = (read) => {
    try {
      return read();
    } catch {
      return null;
    }
  };
  const visibleText = (selector) => {
    const element = document.querySelector(selector);
    return element ? str(element.textContent) : null;
  };

  /** The props of the React components above an element, nearest first, until `found` says one is it. */
  function reactProps(element, found) {
    const key = element && Object.keys(element).find((name) => name.startsWith("__reactFiber"));
    let fiber = key ? element[key] : null;
    for (let depth = 0; fiber && depth < 60; depth += 1, fiber = fiber.return) {
      const value = found(fiber.memoizedProps);
      if (value) {
        return value;
      }
    }
    return null;
  }

  function netflix() {
    const api = window.netflix?.appContext?.state?.playerApp?.getAPI?.()?.videoPlayer;
    const ids = api?.getAllPlayerSessionIds?.() ?? [];
    const session = ids.find((id) => String(id).startsWith("watch")) ?? ids[0];
    const player = session ? api.getVideoPlayerBySessionId(session) : null;
    if (!player) {
      return null;
    }
    const movieId = attempt(() => player.getMovieId());
    const audio = attempt(() => player.getAudioTrack());
    const shown = attempt(() => player.getTimedTextTrack());
    const metadata = attempt(
      () =>
        window.netflix.appContext.state.playerApp.getState().videoPlayer.videoMetadata[movieId]
          ._metadataObject.video,
    );
    const seasons = Array.isArray(metadata?.seasons) ? metadata.seasons.slice(0, 50) : [];
    return {
      movieId: num(movieId),
      audioTrack: audio && { bcp47: str(audio.bcp47), displayName: str(audio.displayName) },
      timedTextTrack: shown && {
        bcp47: str(shown.bcp47),
        isNoneTrack: shown.isNoneTrack === true,
        isForcedNarrative: shown.isForcedNarrative === true,
      },
      video: metadata && {
        title: str(metadata.title),
        type: str(metadata.type),
        seasons: seasons.map((season) => ({
          seq: num(season?.seq),
          episodes: (Array.isArray(season?.episodes) ? season.episodes.slice(0, 200) : []).map((episode) => ({
            id: num(episode?.id),
            seq: num(episode?.seq),
            title: str(episode?.title),
          })),
        })),
      },
      currentTime: num(attempt(() => player.getCurrentTime())),
      segmentTime: num(attempt(() => player.getSegmentTime())),
      adLabel: document.querySelector('[data-uia*="ads-info"]') !== null,
      domTitle: visibleText('[data-uia="video-title"]'),
    };
  }

  // The store of Crunchyroll's web app, found once through the props of its React root
  let crunchyrollStore = null;
  function crunchyroll() {
    if (window !== window.top) {
      return null;
    }
    if (!crunchyrollStore) {
      for (const element of document.querySelectorAll("body > div, body > div > div")) {
        crunchyrollStore = reactProps(element, (props) =>
          typeof props?.store?.getState === "function" ? props.store : null,
        );
        if (crunchyrollStore) {
          break;
        }
      }
    }
    const state = crunchyrollStore?.getState?.();
    const watchId = str(state?.watch?.id);
    const media = watchId ? state.content?.media?.byId?.[watchId] : null;
    if (!media) {
      return null;
    }
    return {
      watchId,
      premiumDubSelectedVersion: str(state.watch.premiumDubSelectedVersion),
      media: {
        id: str(media.id),
        type: str(media.type),
        title: str(media.title),
        parentTitle: str(media.parentTitle),
        episode: str(media.episode),
        audioLocale: str(media.audioLocale),
        subtitleLanguages: (Array.isArray(media.subtitleLanguages) ? media.subtitleLanguages : [])
          .slice(0, 50)
          .map(str),
        dubVersions: (Array.isArray(media.dubVersions) ? media.dubVersions : [])
          .slice(0, 50)
          .map((version) => ({
            guid: str(version?.guid),
            audioLocale: str(version?.audioLocale),
          })),
      },
    };
  }

  // The context Prime Video's player gives its components, found through the player's container
  let primeContext = { element: null, value: null };
  function primevideo() {
    const element = document.querySelector("#dv-web-player .atvwebplayersdk-player-container");
    if (!element) {
      return null;
    }
    if (primeContext.element !== element) {
      const value = reactProps(element, (props) =>
        [props?.context, props?.value].find((each) => each?.audioStream && each?.title && each?.player),
      );
      primeContext = { element, value };
    }
    const context = primeContext.value;
    if (!context || !context.player.isPlayerOpen || context.player.isPlayerDestroyed) {
      return null;
    }
    const info = attempt(() => context.title.getTitleInfo());
    const audio = attempt(() => context.audioStream.getAudioStreamInfo().activeStream);
    const subtitle = attempt(() => context.captions.getCurrentCaptionsStream());
    const items = attempt(() => context.player.timeline.items);
    const index = attempt(() => context.player.currentTime.currentTimelineItemIndex);
    const item = Array.isArray(items) && Number.isInteger(index) ? items[index] : null;
    return {
      titleInfo: info && { titleId: str(info.titleId), title: str(info.title) },
      audio: audio && { id: str(audio.id), language: str(audio.language) },
      subtitle: subtitle && { id: str(subtitle.id), language: str(subtitle.language) },
      // An ad plays when the ad player says so, or the timeline item is not the title's (`..._main`)
      adPlaying:
        Boolean(attempt(() => context.adPlayback.getAdPlaybackInfo())) ||
        (typeof item?.contentId === "string" && !item.contentId.endsWith("_main")),
      adTimer: document.querySelector(".atvwebplayersdk-ad-timer") !== null,
      domTitle: visibleText(".atvwebplayersdk-title-text"),
      domSubtitle: visibleText(".atvwebplayersdk-subtitle-text"),
    };
  }

  function disneyplus() {
    const element = document.querySelector("disney-web-player");
    const own = (target, key) => (target && Object.hasOwn(target, key) ? target[key] : undefined);
    const audio = attempt(() => own(element, "mediaPlayer")?.audio?.selectedTrack);
    const badge = document.querySelector("ad-badge-overlay");
    return {
      path: str(location.pathname),
      title: str(document.title),
      audio: audio && { language: str(audio.language) },
      adBadge: badge ? str((badge.shadowRoot ?? badge).textContent) : null,
    };
  }

  const READERS = { netflix, crunchyroll, primevideo, disneyplus };

  window.addEventListener("message", (event) => {
    const site = event.data?.site;
    if (
      event.source !== window ||
      event.data?.type !== "inputly:streaming-request" ||
      !Object.hasOwn(READERS, site)
    ) {
      return;
    }
    window.postMessage(
      { type: "inputly:streaming", site, raw: attempt(READERS[site]) },
      window.location.origin,
    );
  });
})();
