// ESLint flat config for the SPA and the build/verification scripts.
//
// Two environments live in this package and they do not share globals: the
// Svelte sources run in a browser, the `scripts/` and config files run in
// Node. Splitting them is what lets `no-undef` mean something in both — a
// single permissive block would let a stray `process.env` through in a
// component and a stray `window` through in a build script.
//
// Formatting is Prettier's job, not ESLint's; `eslint-config-prettier` is
// last in the array so it switches off every stylistic rule that would
// otherwise fight the formatter.

import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";
import globals from "globals";
import svelteConfig from "./svelte.config.js";

export default [
  {
    ignores: ["dist/**", "node_modules/**", ".sourcemaps/**", "public/**"],
  },

  js.configs.recommended,
  ...svelte.configs.recommended,

  // Browser sources: the SPA, its components and everything under src/lib.
  {
    files: ["src/**/*.js", "src/**/*.svelte"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        // Injected by Vite's `define`, see vite.config.js.
        __BUILD_ID__: "readonly",
      },
    },
  },

  {
    files: ["**/*.svelte", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: { svelteConfig },
    },
  },

  // Build steps, generators and the node:test verification suites.
  {
    files: ["scripts/**/*.mjs", "*.config.js", "svelte.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        // Web streams are globals on Node 22, which is the version CI pins
        // and the version vite.config.js's dev middleware assumes.
        WritableStream: "readonly",
      },
    },
  },

  {
    files: ["src/**/*.svelte"],
    rules: {
      // Switched off deliberately, and backed by a test rather than a promise:
      // `scripts/verify_template_safety.mjs` asserts that every `{@html …}`
      // expression is rooted in an in-repo constant (a COPY key or a legal
      // paragraph), and that the app has no free-text input at all — every
      // control is a number, range, checkbox or radio. There is therefore no
      // path from an untrusted string to the DOM as markup. If either
      // invariant breaks, that suite fails and this line has to come out.
      "svelte/no-at-html-tags": "off",
    },
  },

  {
    rules: {
      // An unused name is either a leftover or a typo. The underscore prefix
      // is the escape hatch for the deliberate cases — a discarded positional
      // argument, a destructured field pulled off only to drop it.
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // `catch {}` with no binding is fine and used deliberately in a few
      // places where the failure is the expected path; a bare `{}` block
      // elsewhere is not.
      "no-empty": ["error", { allowEmptyCatch: true }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      // `destructuring: "all"` so `let { open = $bindable(), ...rest } =
      // $props()` is not reported for the read-only half: one bindable prop
      // makes the whole binding a `let`, and that is correct Svelte 5.
      "prefer-const": ["error", { destructuring: "all" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  // Build and verification scripts report to a terminal; that is what
  // console.log is for.
  {
    files: ["scripts/**/*.mjs", "*.config.js"],
    rules: { "no-console": "off" },
  },

  // The files that drive a browser span BOTH environments. They run in Node,
  // but the callbacks they hand to `page.evaluate()` are serialised and
  // executed inside Chromium, where `document` and `getComputedStyle` are the
  // whole point — reading a computed style is how a layout assertion becomes a
  // fact rather than a grep for a CSS declaration. Node's globals stay in
  // scope too, from the block above, so `no-undef` still catches a genuine
  // typo in either half.
  //
  // Matched by pattern rather than named one by one: the render suites are
  // split by subject, and a new one added to `test:render` would otherwise
  // lint clean until its first `page.evaluate()` and then fail for a reason
  // that has nothing to do with what it asserts.
  {
    files: [
      "scripts/verify_render*.mjs",
      "scripts/render-harness.mjs",
      "scripts/make_screenshot.mjs",
      // Holds the `page.evaluate()` callbacks the screenshot and its guard
      // share, so it is a browser file that never launches one itself.
      "scripts/screenshot-frame.mjs",
    ],
    languageOptions: { globals: { ...globals.browser } },
  },

  prettier,
];
