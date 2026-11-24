import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "frontend/apsyntra-styles.bundle.css",
    ],
  },
  {
    files: [
      "frontend/fm1/**/*.js",
      "frontend/tests/fm1-*.test.mjs",
      "scripts/fm1-browser-acceptance.mjs",
      "vite.config.js",
      "frontend/tradelink/draft-recovery-*.js",
      "frontend/tests/tradelink-recovery-controller.test.mjs",
      "frontend/tests/tradelink-save-recovery.test.mjs",
      "scripts/cp-tl-autosave-05-browser.mjs",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
    },
  },
];
