import assert from "node:assert/strict";
import { test } from "node:test";

import { RESEND_SECONDS, createSender } from "../extension/src/delivery.js";
import { KEEP_SECONDS, addCoverage } from "../extension/src/coverage.js";

const message = (from, to) => ({ type: "watched", intervals: [{ from, to }] });

/** A background script that answers or not, as `answers` says for each message it is sent. */
function background(answers) {
  const posted = [];
  const post = (sent) => {
    posted.push(sent);
    const answer = answers.shift() ?? "ok";
    if (answer === "throw") {
      throw new Error("Extension context invalidated.");
    }
    return answer === "ok" ? Promise.resolve({}) : Promise.reject(new Error("channel closed"));
  };
  return { posted, post };
}

test("a message that was answered is not sent again", async () => {
  const { posted, post } = background(["ok"]);
  const sender = createSender(post);
  await sender.send(message(0, 2));
  await sender.retry(4);
  assert.equal(posted.length, 1);
  assert.equal(sender.waiting, 0);
});

test("a message the background script did not answer goes again with the next one", async () => {
  // It was stopped before writing the time, then started again for the next message
  const { posted, post } = background(["lost", "ok", "ok"]);
  const sender = createSender(post);
  await sender.send(message(0, 2));
  assert.equal(sender.waiting, 1);
  await sender.send(message(2, 4));
  await sender.retry(4);
  assert.deepEqual(posted, [message(0, 2), message(2, 4), message(0, 2)]);
  assert.equal(sender.waiting, 0);
});

test("a page that cannot reach the extension any more keeps trying, then lets go", async () => {
  const { posted, post } = background(["throw", "throw", "throw"]);
  const sender = createSender(post);
  await sender.send(message(0, 2));
  await sender.retry(10);
  assert.equal(sender.waiting, 1);
  await sender.retry(2 + RESEND_SECONDS + 1);
  assert.equal(sender.waiting, 0);
  assert.equal(posted.length, 2);
});

test("time sent twice counts once, as long as it is tried again in time", () => {
  assert.ok(RESEND_SECONDS < KEEP_SECONDS);
  // Written, but the answer was lost; the copy comes RESEND_SECONDS later, after newer time
  let { covered } = addCoverage([], { from: 0, to: 2 });
  ({ covered } = addCoverage(covered, { from: RESEND_SECONDS, to: RESEND_SECONDS + 2 }));
  assert.equal(addCoverage(covered, { from: 0, to: 2 }).newSeconds, 0);
});
