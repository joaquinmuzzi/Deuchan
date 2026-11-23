// Makes the Chrome Web Store images in docs/store/ from the real pages of the extension, with demo data:
//
//   node scripts/screenshots/capture.mjs
//
// It serves the repository on a local port, puts the demo data (demo-data.mjs) and a stand-in for the
// `chrome` API (chrome-stub.js) in each extension page, opens the pages in a headless Chrome or Edge
// through the DevTools protocol, and saves JPEGs at the exact sizes the store asks for. Set CHROME to the
// browser's path if it is not found. Nothing here is packaged: `npm run package` takes only `extension/`.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DEMO_NOW, OPENED_DAY, demoStorage } from "./demo-data.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "docs/store");
const QUALITY = 90;

/** What the YouTube tab answers in the popup: a Japanese video that plays. */
const PLAYING_STATUS = { inTarget: true, playing: true, immersion: false };

/**
 * The images, in the order of the listing: the first ones show what only Inputly does (a video counted
 * only when it is in the language, and each one can be taken out of its day). `scale` is how many image
 * pixels each CSS pixel takes: the dialogs are small, so their pages are drawn larger to stay readable.
 * `act` runs in the page once it has loaded.
 */
const SHOTS = [
  {
    file: "screenshot-1-day-videos.jpg",
    page: "extension/dashboard/dashboard.html",
    theme: "dark",
    width: 1280,
    height: 800,
    scale: 1.6,
    act: `document.querySelector('.cell[data-day="${OPENED_DAY}"]').click();
          document.activeElement.blur();`,
  },
  {
    file: "screenshot-2-popup.jpg",
    page: "scripts/screenshots/popup-frame.html",
    theme: "dark",
    width: 1280,
    height: 800,
    scale: 1.6,
  },
  {
    file: "screenshot-3-dashboard-dark.jpg",
    page: "extension/dashboard/dashboard.html",
    theme: "dark",
    width: 1280,
    height: 800,
    scale: 1,
  },
  {
    file: "screenshot-4-dashboard-light.jpg",
    page: "extension/dashboard/dashboard.html",
    theme: "light",
    width: 1280,
    height: 800,
    scale: 1,
  },
  {
    // The picker opened as a list: a native drop-down is not drawn in a screenshot
    file: "screenshot-5-language.jpg",
    page: "extension/dashboard/dashboard.html",
    theme: "light",
    width: 1280,
    height: 800,
    scale: 1.25,
    act: `document.getElementById("settings").click();
          const select = document.getElementById("targetSelect");
          select.size = 6;
          select.style.height = "auto";
          select.style.padding = "0 4px";
          // Whole rows only, Japanese the third one
          select.scrollTop = (select.clientHeight / select.size) * (select.selectedIndex - 2);
          document.activeElement.blur();`,
  },
  {
    file: "promo-small-440x280.jpg",
    page: "scripts/screenshots/promo.html",
    theme: "light",
    width: 440,
    height: 280,
    scale: 1,
  },
];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

/** The repository as a web site; the extension pages get the demo data and the stub first. */
function serve() {
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    const path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!path.startsWith(ROOT) || !existsSync(path)) {
      response.writeHead(404).end();
      return;
    }
    let body = readFileSync(path);
    if (extname(path) === ".html" && url.pathname.startsWith("/extension/")) {
      const demo = {
        now: DEMO_NOW,
        storage: demoStorage({ theme: url.searchParams.get("theme") ?? "dark" }),
        status: PLAYING_STATUS,
      };
      const head =
        `<script>window.inputlyDemo = ${JSON.stringify(demo)};</script>` +
        `<script src="/scripts/screenshots/chrome-stub.js"></script>`;
      body = body.toString("utf8").replace("<head>", `<head>${head}`);
    }
    response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    response.end(body);
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server)));
}

function findBrowser() {
  const candidates = [
    process.env.CHROME,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) {
    throw new Error("No Chrome or Edge found: set CHROME to the path of one");
  }
  return found;
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/** Starts the browser and returns the WebSocket address of its first page. */
async function launch(profile) {
  const browser = spawn(
    findBrowser(),
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const portFile = join(profile, "DevToolsActivePort");
  for (let tries = 0; !existsSync(portFile) || readFileSync(portFile, "utf8").trim() === ""; tries += 1) {
    if (tries > 100) {
      throw new Error("The browser did not start");
    }
    await wait(100);
  }
  const port = readFileSync(portFile, "utf8").split("\n")[0].trim();
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  return { browser, socketUrl: pages.find((page) => page.type === "page").webSocketDebuggerUrl };
}

/** A small DevTools protocol client: `send` a command, `once` an event. */
async function connect(socketUrl) {
  const socket = new WebSocket(socketUrl);
  await new Promise((done, fail) => {
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", fail, { once: true });
  });
  let lastId = 0;
  const pending = new Map();
  const waiting = [];
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { done, fail } = pending.get(message.id);
      pending.delete(message.id);
      return message.error ? fail(new Error(message.error.message)) : done(message.result);
    }
    for (const waiter of waiting.filter((item) => item.method === message.method)) {
      waiting.splice(waiting.indexOf(waiter), 1);
      waiter.done(message.params);
    }
  });
  return {
    send: (method, params = {}) =>
      new Promise((done, fail) => {
        lastId += 1;
        pending.set(lastId, { done, fail });
        socket.send(JSON.stringify({ id: lastId, method, params }));
      }),
    once: (method) => new Promise((done) => waiting.push({ method, done })),
    close: () => socket.close(),
  };
}

async function capture(client, origin, shot) {
  // A page of a whole number of CSS pixels, or the image is a pixel short (800 / 1.4 is not whole)
  if (!Number.isInteger(shot.width / shot.scale) || !Number.isInteger(shot.height / shot.scale)) {
    throw new Error(`${shot.file}: ${shot.width} × ${shot.height} cannot be divided by ${shot.scale}`);
  }
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: shot.width / shot.scale,
    height: shot.height / shot.scale,
    deviceScaleFactor: shot.scale,
    mobile: false,
  });
  await client.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: shot.theme }],
  });
  const loaded = client.once("Page.loadEventFired");
  await client.send("Page.navigate", { url: `${origin}/${shot.page}?theme=${shot.theme}` });
  await loaded;
  // The pages render after reading the storage, and the popup frame loads the popup after its own load
  await wait(800);
  if (shot.act) {
    const result = await client.send("Runtime.evaluate", { expression: shot.act, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(`${shot.file}: ${result.exceptionDetails.exception?.description}`);
    }
    await wait(300);
  }
  await client.send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
  const { data } = await client.send("Page.captureScreenshot", { format: "jpeg", quality: QUALITY });
  writeFileSync(join(OUT, shot.file), Buffer.from(data, "base64"));
  console.log(`Wrote docs/store/${shot.file} (${shot.width} × ${shot.height})`);
}

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = mkdtempSync(join(tmpdir(), "inputly-shots-"));
const { browser, socketUrl } = await launch(profile);
try {
  const client = await connect(socketUrl);
  await client.send("Page.enable");
  for (const shot of SHOTS) {
    await capture(client, origin, shot);
  }
  client.close();
} finally {
  browser.kill();
  server.close();
  await wait(500);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
