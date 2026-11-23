// A stand-in for the `chrome` API, so the real pages of the extension can be opened from a plain web
// server with demo data, to take the store screenshots (see capture.mjs). It is never packaged: the zip
// takes only `extension/`. capture.mjs puts `window.inputlyDemo` (the storage, the moment to pretend it
// is, and the answer of the YouTube tab) in the page before this script.
(() => {
  const demo = window.inputlyDemo;
  const storage = structuredClone(demo.storage);
  const listeners = [];

  // Always the same moment, so the charts, the streak and "Today" do not depend on when it runs
  const RealDate = Date;
  class DemoDate extends RealDate {
    constructor(...args) {
      super(...(args.length > 0 ? args : [demo.now]));
    }

    static now() {
      return demo.now;
    }
  }
  window.Date = DemoDate;

  const pick = (keys) => {
    if (keys === null || keys === undefined) {
      return structuredClone(storage);
    }
    const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    return Object.fromEntries(
      list.filter((key) => key in storage).map((key) => [key, structuredClone(storage[key])]),
    );
  };

  const tab = { id: 1, url: "https://www.youtube.com/watch?v=q7Lk2mVx9aE", title: "YouTube" };

  window.chrome = {
    storage: {
      local: {
        get: async (keys) => pick(keys),
        set: async (items) => {
          const changes = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: storage[key], newValue: value };
            storage[key] = value;
          }
          listeners.forEach((listener) => listener(changes, "local"));
        },
      },
      onChanged: { addListener: (listener) => listeners.push(listener) },
    },
    runtime: {
      // Nothing answers: Mosaik is off, and nothing is removed or corrected in a screenshot
      sendMessage: async () => ({}),
      getURL: (path) => new URL(`/extension/${path}`, location.origin).href,
    },
    tabs: {
      query: async () => [tab],
      // What the content script of a YouTube tab answers about its video
      sendMessage: async () => demo.status,
      create: async () => tab,
    },
    permissions: {
      request: async () => false,
      contains: async () => false,
    },
  };
})();
