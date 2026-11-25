import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RATING_THRESHOLD_SECONDS,
  STORE_URLS,
  ratingUrl,
  shouldAskForRating,
  storeOf,
} from "../extension/src/rating.js";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const EDGE = `${CHROME} Edg/131.0.0.0`;
const FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";

test("the threshold is ten hours", () => {
  assert.equal(RATING_THRESHOLD_SECONDS, 36000);
});

test("storeOf tells Edge, Chrome and Firefox apart", () => {
  assert.equal(storeOf(EDGE), "edge");
  assert.equal(storeOf(CHROME), "chrome");
  assert.equal(storeOf(FIREFOX), null);
  // Other Chromium browsers install from the Chrome Web Store
  assert.equal(storeOf(""), "chrome");
  assert.equal(storeOf(undefined), "chrome");
});

test("ratingUrl opens each store's own page, and none in Firefox", () => {
  assert.equal(ratingUrl(EDGE), STORE_URLS.edge);
  assert.equal(ratingUrl(CHROME), STORE_URLS.chrome);
  assert.match(
    STORE_URLS.chrome,
    /^https:\/\/chromewebstore\.google\.com\/detail\/imadljjebohcpkeopadcifnodmfbndel\/reviews$/,
  );
  assert.match(
    STORE_URLS.edge,
    /^https:\/\/microsoftedge\.microsoft\.com\/addons\/detail\/ofophfcnojdmdffnfljneagppnnjelpp$/,
  );
  assert.equal(ratingUrl(FIREFOX), null);
});

test("shouldAskForRating waits for ten hours in all", () => {
  assert.equal(shouldAskForRating({ totalSeconds: 0, done: undefined, userAgent: CHROME }), false);
  assert.equal(shouldAskForRating({ totalSeconds: RATING_THRESHOLD_SECONDS - 1, userAgent: CHROME }), false);
  assert.equal(shouldAskForRating({ totalSeconds: RATING_THRESHOLD_SECONDS, userAgent: CHROME }), true);
  assert.equal(shouldAskForRating({ totalSeconds: 500000, userAgent: EDGE }), true);
});

test("shouldAskForRating never asks again once answered", () => {
  assert.equal(shouldAskForRating({ totalSeconds: 500000, done: true, userAgent: CHROME }), false);
});

test("shouldAskForRating never asks in Firefox", () => {
  assert.equal(shouldAskForRating({ totalSeconds: 500000, userAgent: FIREFOX }), false);
});

test("shouldAskForRating treats anything but true as not answered", () => {
  for (const done of [undefined, null, false, "yes", 1]) {
    assert.equal(
      shouldAskForRating({ totalSeconds: RATING_THRESHOLD_SECONDS, done, userAgent: CHROME }),
      true,
    );
  }
});
