// The streaming sites' readers, fed with what the bridge copies from each player. Where the data comes from
// is said for each site, and in docs/streaming.md: Crunchyroll's was captured from its real page, Netflix's
// is the probe output another extension published, Prime Video's and Disney+'s follow the shapes other
// extensions read (no account was at hand to capture them).
import assert from "node:assert/strict";
import { test } from "node:test";

import { isWebItemId } from "../extension/src/items.js";
import {
  readCrunchyroll,
  readDisneyPlus,
  readNetflix,
  readPrimeVideo,
  readStreaming,
  streamingItem,
  streamingVerdict,
} from "../extension/src/streaming.js";

// Crunchyroll, captured logged out on 2026-11-23 from www.crunchyroll.com/es/watch/<id> (the bridge's copy of
// the store: `watch.id` and `content.media.byId[id]`). One Piece episode 1, original and Latin American dub.
const crunchyrollDubs = [
  { guid: "GR3VWXP96", audioLocale: "ja-JP" },
  { guid: "GE00010122ES419", audioLocale: "es-419" },
  { guid: "GE00010122PTBR", audioLocale: "pt-BR" },
];
const crunchyrollOriginal = {
  watchId: "GR3VWXP96",
  premiumDubSelectedVersion: null,
  media: {
    id: "GR3VWXP96",
    type: "episode",
    title: "¡Soy Luffy! ¡El hombre que se convertirá en el Rey de los Piratas!",
    parentTitle: "One Piece",
    episode: "1",
    audioLocale: "ja-JP",
    subtitleLanguages: ["en-US", "es-419", "es-ES", "pt-BR"],
    dubVersions: crunchyrollDubs,
  },
};
const crunchyrollDub = {
  watchId: "GE00010122ES419",
  premiumDubSelectedVersion: null,
  media: {
    ...crunchyrollOriginal.media,
    id: "GE00010122ES419",
    audioLocale: "es-419",
    subtitleLanguages: ["en-US", "es-419", "es-ES", "pt-BR", "es-419"],
  },
};

test("Crunchyroll: the episode of the page is the audio that plays", () => {
  const info = readCrunchyroll(crunchyrollOriginal);
  assert.deepEqual(info, {
    key: "https://www.crunchyroll.com/watch/GR3VWXP96",
    title: "One Piece E1 - ¡Soy Luffy! ¡El hombre que se convertirá en el Rey de los Piratas!",
    audioLanguage: "ja-JP",
    subtitleLanguages: ["en-US", "es-419", "es-ES", "pt-BR"],
    ad: false,
  });
  assert.equal(streamingVerdict(info, "ja"), true);
  assert.equal(streamingVerdict(info, "es"), false);
});

test("Crunchyroll: a dub is another episode, in the language of the dub", () => {
  const info = readCrunchyroll(crunchyrollDub);
  assert.equal(info.key, "https://www.crunchyroll.com/watch/GE00010122ES419");
  assert.equal(info.audioLanguage, "es-419");
  // The subtitle list repeats a language: kept once
  assert.deepEqual(info.subtitleLanguages, ["en-US", "es-419", "es-ES", "pt-BR"]);
  assert.equal(streamingVerdict(info, "ja"), false);
  assert.equal(streamingVerdict(info, "es"), true);
});

test("Crunchyroll: a dub picked inside the player wins over the page's episode", () => {
  const info = readCrunchyroll({ ...crunchyrollOriginal, premiumDubSelectedVersion: "GE00010122PTBR" });
  assert.equal(info.key, "https://www.crunchyroll.com/watch/GE00010122PTBR");
  assert.equal(info.audioLanguage, "pt-BR");
});

test("Crunchyroll: a store that does not hold the page's episode yet says nothing", () => {
  assert.equal(readCrunchyroll({ watchId: "GR3VWXP96", media: null }), null);
  assert.equal(readCrunchyroll({ ...crunchyrollOriginal, watchId: "GY2P59DJY" }), null);
  assert.equal(readCrunchyroll({}), null);
});

test("Crunchyroll: a film is named by its title", () => {
  const info = readCrunchyroll({
    watchId: "G2XU0Z1P7",
    media: { id: "G2XU0Z1P7", type: "movie", title: "Suzume", parentTitle: "Suzume", audioLocale: "ja-JP" },
  });
  assert.equal(info.title, "Suzume");
});

// Netflix: the values of the probe LingoFlix published for "A Different World" E1 (/watch/82028220), Chrome 154,
// 2026-10-10 (docs/netflix-internals.md of jaycho1214/lingoflix), in the shape the bridge copies.
const netflixEpisode = {
  movieId: 82028220,
  audioTrack: { bcp47: "en", displayName: "English [Original]" },
  timedTextTrack: { bcp47: "en", isNoneTrack: false, isForcedNarrative: false },
  video: {
    title: "A Different World",
    type: "show",
    seasons: [
      {
        seq: 1,
        episodes: [
          { id: 82028220, seq: 1, title: "Irreconcilable Differences" },
          { id: 82028221, seq: 2, title: "O Captain! My Captain!" },
        ],
      },
    ],
  },
  currentTime: 691009,
  segmentTime: 691009,
  adLabel: false,
  domTitle: "A Different WorldE1Irreconcilable Differences",
};

test("Netflix: the audio track the player plays, and the episode's name from its metadata", () => {
  const info = readNetflix(netflixEpisode);
  assert.deepEqual(info, {
    key: "https://www.netflix.com/watch/82028220",
    title: "A Different World S1:E1 Irreconcilable Differences",
    audioLanguage: "en",
    subtitleLanguages: ["en"],
    ad: false,
  });
  assert.equal(streamingVerdict(info, "en"), true);
  assert.equal(streamingVerdict(info, "de"), false);
});

test("Netflix: a dub plays in its own language, whatever the original was", () => {
  const info = readNetflix({ ...netflixEpisode, audioTrack: { bcp47: "ja", displayName: "Japanese" } });
  assert.equal(streamingVerdict(info, "ja"), true);
  assert.equal(streamingVerdict(info, "en"), false);
});

test("Netflix: the lead-in ad before the title, and the ad label, are ads", () => {
  // LingoFlix saw getSegmentTime() stay 0 while getCurrentTime() ran through a 7007 ms lead-in
  const leadIn = readNetflix({ ...netflixEpisode, currentTime: 3500, segmentTime: 0 });
  assert.equal(leadIn.ad, true);
  // During an ad the verdict is not taken from the tracks, which may be the ad's
  assert.equal(streamingVerdict(leadIn, "en"), null);
  assert.equal(readNetflix({ ...netflixEpisode, adLabel: true }).ad, true);
  // The very start of the title, before anything played, is not an ad
  assert.equal(readNetflix({ ...netflixEpisode, currentTime: 0, segmentTime: 0 }).ad, false);
});

test("Netflix: subtitles turned off or forced narrative are not shown subtitles", () => {
  const off = readNetflix({ ...netflixEpisode, timedTextTrack: { bcp47: "en", isNoneTrack: true } });
  assert.deepEqual(off.subtitleLanguages, []);
  const forced = readNetflix({
    ...netflixEpisode,
    timedTextTrack: { bcp47: "en", isNoneTrack: false, isForcedNarrative: true },
  });
  assert.deepEqual(forced.subtitleLanguages, []);
});

test("Netflix: a film is its title; without metadata the player's title line names it", () => {
  assert.equal(readNetflix({ ...netflixEpisode, video: { title: "Roma", type: "movie" } }).title, "Roma");
  assert.equal(readNetflix({ ...netflixEpisode, video: null, domTitle: " Roma " }).title, "Roma");
});

test("Netflix: no player session, or no audio said yet, decides nothing", () => {
  assert.equal(readNetflix({ movieId: null }), null);
  const loading = readNetflix({ ...netflixEpisode, audioTrack: null });
  assert.equal(loading.audioLanguage, null);
  assert.equal(streamingVerdict(loading, "en"), null);
});

// Prime Video: the shape tvctl (yusukeshib/tvctl, plugins/primevideo/chrome.js) reads from the player's context;
// the values are made up, in that shape.
const primeEpisode = {
  titleInfo: { titleId: "amzn1.dv.gti.0000aaaa-bbbb-cccc-dddd-eeeeffff0000", title: "The Boys" },
  audio: { id: "de_dialog_0", language: "de-de" },
  subtitle: { id: "off", language: null },
  adPlaying: false,
  adTimer: false,
  domTitle: "The Boys",
  domSubtitle: "Season 1, Ep. 1 The Name of the Game",
};

test("Prime Video: the active audio stream decides, and the episode line names it", () => {
  const info = readPrimeVideo(primeEpisode);
  assert.equal(info.title, "The Boys - Season 1, Ep. 1 The Name of the Game");
  assert.equal(info.audioLanguage, "de-de");
  assert.deepEqual(info.subtitleLanguages, []);
  assert.equal(
    info.key,
    "https://www.primevideo.com/detail/amzn1.dv.gti.0000aaaa-bbbb-cccc-dddd-eeeeffff0000",
  );
  assert.equal(streamingVerdict(info, "de"), true);
});

test("Prime Video: a stream with no language says it in its id", () => {
  const info = readPrimeVideo({ ...primeEpisode, audio: { id: "ja-jp_dialog_0" } });
  assert.equal(info.audioLanguage, "ja-jp");
  assert.equal(streamingVerdict(info, "ja"), true);
});

test("Prime Video: an ad, said by the ad player or by its timer, is an ad", () => {
  assert.equal(readPrimeVideo({ ...primeEpisode, adPlaying: true }).ad, true);
  assert.equal(readPrimeVideo({ ...primeEpisode, adTimer: true }).ad, true);
  assert.equal(readPrimeVideo({ titleInfo: null }), null);
});

// Disney+: the audio track as Theater Mode Everywhere (TomaszJanusz/Theater-Mode-Everywhere,
// src/providers/disney/audio-main.ts) reads it, the ad badge as jp343 reads it; values made up in that shape.
const disneyFilm = {
  path: "/play/3c2a6e2e-7f61-4f1e-9c8c-2b8f1a0d9e11",
  title: "Encanto | Disney+",
  audio: { language: "es-419" },
  adBadge: null,
};

test("Disney+: the selected audio track decides, and the page title names it", () => {
  const info = readDisneyPlus(disneyFilm);
  assert.deepEqual(info, {
    key: "https://www.disneyplus.com/play/3c2a6e2e-7f61-4f1e-9c8c-2b8f1a0d9e11",
    title: "Encanto",
    audioLanguage: "es-419",
    subtitleLanguages: [],
    ad: false,
  });
  assert.equal(streamingVerdict(info, "es"), true);
});

test("Disney+: the ad badge with time left is an ad; a page that is not the player is nothing", () => {
  assert.equal(readDisneyPlus({ ...disneyFilm, adBadge: "Ad 0:15" }).ad, true);
  assert.equal(readDisneyPlus({ ...disneyFilm, adBadge: "" }).ad, false);
  assert.equal(readDisneyPlus({ ...disneyFilm, path: "/browse/entity-123" }), null);
  assert.equal(readDisneyPlus({ ...disneyFilm, title: "Disney+" }).title, "");
});

test("an unknown site, missing data or a player that changed shape reads as nothing", () => {
  assert.equal(readStreaming("hulu", { movieId: 1 }), null);
  assert.equal(readStreaming("netflix", null), null);
  assert.equal(
    readStreaming("netflix", {
      movieId: 1,
      get audioTrack() {
        throw new Error("gone");
      },
    }),
    null,
  );
  assert.equal(readStreaming("toString", {}), null);
});

test("a title is kept as a web item, named after the site when the player gives no name", () => {
  const info = readCrunchyroll(crunchyrollOriginal);
  const item = streamingItem(info, "Crunchyroll");
  assert.ok(isWebItemId(item.id));
  assert.equal(item.url, "https://www.crunchyroll.com/watch/GR3VWXP96");
  // The same episode from another page address is the same item
  assert.equal(streamingItem(readCrunchyroll(crunchyrollOriginal), "Crunchyroll").id, item.id);
  assert.notEqual(streamingItem(readCrunchyroll(crunchyrollDub), "Crunchyroll").id, item.id);
  assert.equal(streamingItem({ ...info, title: "" }, "Crunchyroll").title, "Crunchyroll");
});
