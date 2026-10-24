import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "coverage/", ".claude/"] },
  js.configs.recommended,
  {
    files: ["extension/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.browser, chrome: "readonly" },
    },
  },
  {
    files: ["tests/**/*.js", "*.js"],
    languageOptions: { sourceType: "module", globals: globals.node },
  },
];
