/**
 * What a streaming player says it is playing, turned into the same few facts for every site:
 * `{ key, title, audioLanguage, subtitleLanguages, ad }`.
 *
 * - `key` names the episode or film: the same one is the same item in the day's list, whatever the address
 *   of the page says (an item id is made from it, see `streamingItem`).
 * - `audioLanguage` is the language of the audio track the player says is playing (a BCP 47 tag, or `null`
 *   when it does not say). It decides, as it does on YouTube: what is heard is what counts. A dub in the
 *   target language counts, an original in the target language with the person's dub picked does not.
 * - `subtitleLanguages` are the subtitle tracks shown (or offered, where the player says no more), kept for
 *   the record: subtitles are often translations, so they never decide.
 * - `ad` is true while the player shows an ad instead of the title.
 *
 * Each `read<Site>` takes what `streaming-bridge.js` copied from the page (plain data, never the player's
 * objects) and returns those facts, or `null` when nothing is playing. They are pure so that they can be
 * tested with data captured from the real players (see tests/streaming.test.js and docs/streaming.md).
 */
import { webItemId } from "./items.js";
import { isTarget, normalizeLanguage } from "./target.js";

const text = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

/** A language tag as the player gives it (`"ja"`, `"ja-JP"`, `"es-419"`, `"en_US"`), or `null`. */
const tag = (value) => (normalizeLanguage(typeof value === "string" ? value : null) ? value.trim() : null);

const tags = (values) => [...new Set((Array.isArray(values) ? values : []).map(tag).filter(Boolean))];

const idText = (value) =>
  (typeof value === "number" && Number.isSafeInteger(value)) || (typeof value === "string" && value.trim())
    ? String(value).trim()
    : null;

// Netflix

/**
 * Netflix's player (Cadmium), read through `netflix.appContext.state.playerApp.getAPI().videoPlayer`:
 * `movieId` is the episode or film, `audioTrack` the playing track (`bcp47`), `timedTextTrack` the shown
 * subtitles, `video` the title's metadata (`_metadataObject.video`: the show, its seasons and episodes).
 *
 * Ads (the plan with ads): before the title the player plays a lead-in in its own segment, and the player
 * clock (`currentTime`) runs while the title's clock (`segmentTime`) stays at 0; during any ad the player
 * shows its "Ad" label (`adLabel`, from `[data-uia*="ads-info"]`).
 */
export function readNetflix(raw) {
  const movieId = idText(raw?.movieId);
  if (!movieId) {
    return null;
  }
  const audio = raw.audioTrack ?? {};
  const shown = raw.timedTextTrack;
  const subtitles = shown && !shown.isNoneTrack && !shown.isForcedNarrative ? [shown.bcp47] : [];
  const leadIn = raw.segmentTime === 0 && raw.currentTime > 0;
  return {
    key: `https://www.netflix.com/watch/${movieId}`,
    title: netflixTitle(raw.video, movieId) || text(raw.domTitle),
    audioLanguage: tag(audio.bcp47),
    subtitleLanguages: tags(subtitles),
    ad: raw.adLabel === true || leadIn,
  };
}

/** "Show S1:E2 Episode" for an episode, the title alone for a film. */
function netflixTitle(video, movieId) {
  const show = text(video?.title);
  if (!show || video.type !== "show") {
    return show;
  }
  for (const season of Array.isArray(video.seasons) ? video.seasons : []) {
    const episode = (Array.isArray(season?.episodes) ? season.episodes : []).find(
      (each) => idText(each?.id) === movieId,
    );
    if (episode) {
      const name = text(episode.title);
      return `${show} S${season.seq}:E${episode.seq}${name ? ` ${name}` : ""}`;
    }
  }
  return show;
}

// Crunchyroll

/**
 * Crunchyroll's web app keeps the episode of the watch page in its store: `watch.id`, and
 * `content.media.byId[id]` with its `audioLocale`. Each dub is a separate episode with its own id
 * (`dubVersions`), so the episode of the page is the audio that plays; a dub picked inside the player
 * (`premiumDubSelectedVersion`) wins over it.
 *
 * Ads: none is detected. Every episode seen was `premium_only` (no free tier with ads, checked logged out on
 * 2026-11-23), and a premium account plays none.
 */
export function readCrunchyroll(raw) {
  const media = raw?.media;
  const pageId = idText(raw?.watchId);
  if (!media || !pageId || idText(media.id) !== pageId) {
    return null;
  }
  const versions = Array.isArray(media.dubVersions) ? media.dubVersions : [];
  const picked = versions.find((version) => version?.guid && version.guid === raw.premiumDubSelectedVersion);
  const id = idText(picked?.guid) ?? pageId;
  const audio = tag(picked?.audioLocale) ?? tag(media.audioLocale);
  const series = text(media.parentTitle);
  const name = text(media.title);
  const episode = text(media.episode);
  const title =
    media.type === "episode" && series
      ? `${series}${episode ? ` E${episode}` : ""}${name ? ` - ${name}` : ""}`
      : name || series;
  return {
    key: `https://www.crunchyroll.com/watch/${id}`,
    title,
    audioLanguage: audio,
    subtitleLanguages: tags(media.subtitleLanguages),
    ad: false,
  };
}

// Prime Video

/**
 * Prime Video's web player (the "atvwebplayersdk"), read from the context its React tree gives the player:
 * `title.getTitleInfo()` (`titleId`, `title`), `audioStream.getAudioStreamInfo().activeStream` (`language`,
 * or an id that starts with it), `captions.getCurrentCaptionsStream()`. During an ad
 * `adPlayback.getAdPlaybackInfo()` says so (`adPlaying`), and the player shows an ad timer (`adTimer`).
 */
export function readPrimeVideo(raw) {
  const titleId = idText(raw?.titleInfo?.titleId);
  if (!titleId) {
    return null;
  }
  const streamLanguage = (stream) =>
    stream && stream.id !== "off"
      ? (tag(stream.language) ?? tag(typeof stream.id === "string" ? stream.id.split("_")[0] : null))
      : null;
  const title = text(raw.titleInfo.title) || text(raw.domTitle);
  const episode = text(raw.domSubtitle);
  return {
    key: `https://www.primevideo.com/detail/${encodeURIComponent(titleId)}`,
    title: episode && title && !title.includes(episode) ? `${title} - ${episode}` : title,
    audioLanguage: streamLanguage(raw.audio),
    subtitleLanguages: tags([streamLanguage(raw.subtitle)]),
    ad: raw.adPlaying === true || raw.adTimer === true,
  };
}

// Disney+

/** "Disney+" alone, or a page that is not the player, says nothing of the title. */
const DISNEY_SUFFIX = /\s*[|–—-]\s*Disney\+\s*$/i;
const GENERIC_DISNEY = /^(disney\+?|home|watch|search)$/i;

/**
 * Disney+'s player (`disney-web-player`) keeps its audio on the element (`mediaPlayer.audio.selectedTrack`,
 * whose `language` is a tag). The id is the one of the play page (`/play/<id>`). The title is the page's,
 * without " | Disney+". During an ad the player draws `ad-badge-overlay` with the time left ("0:15").
 */
export function readDisneyPlus(raw) {
  const id = /\/play\/([\w-]+)/.exec(typeof raw?.path === "string" ? raw.path : "")?.[1];
  if (!id) {
    return null;
  }
  const title = text(raw.title)
    .replace(DISNEY_SUFFIX, "")
    .replace(/^watch\s+/i, "");
  return {
    key: `https://www.disneyplus.com/play/${id}`,
    title: GENERIC_DISNEY.test(title) ? "" : title,
    audioLanguage: tag(raw.audio?.language),
    subtitleLanguages: tags([raw.subtitle?.language]),
    ad: /\d+:\d{2}/.test(text(raw.adBadge)),
  };
}

const READERS = {
  netflix: readNetflix,
  crunchyroll: readCrunchyroll,
  primevideo: readPrimeVideo,
  disneyplus: readDisneyPlus,
};

/** What a site's player is playing, from what the bridge copied of it; `null` if nothing (or not known). */
export function readStreaming(siteId, raw) {
  const read = Object.hasOwn(READERS, siteId) ? READERS[siteId] : null;
  try {
    return read && raw && typeof raw === "object" ? read(raw) : null;
  } catch {
    // A player that changed shape reads as nothing: nothing is counted, rather than a wrong guess
    return null;
  }
}

/**
 * Whether what plays is in the target language: `null` while the player has not said which audio plays
 * (the time waits, and is dropped if it never says), and during an ad, whose tracks are the ad's.
 */
export function streamingVerdict(info, target) {
  if (!info || info.ad || !info.audioLanguage) {
    return null;
  }
  return isTarget(info.audioLanguage, target);
}

/** The item the time of an episode or film is kept under, for the day's list: `{ id, title, url }`. */
export function streamingItem(info, siteName) {
  return { id: webItemId(info.key), title: info.title || siteName, url: info.key };
}
