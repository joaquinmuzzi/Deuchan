import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "coverage/", "dist/", ".claude/"] },
  js.configs.recommended,
  {
    files: ["extension/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.browser, chrome: "readonly" },
    },
  },
  {
    // The stand-in for the chrome API of the store screenshots runs in a plain web page
    files: ["scripts/screenshots/*.js"],
    languageOptions: { sourceType: "script", globals: globals.browser },
  },
  {
    files: ["tests/**/*.js", "scripts/**/*.mjs", "*.js"],
    languageOptions: { sourceType: "module", globals: globals.node },
  },
];
