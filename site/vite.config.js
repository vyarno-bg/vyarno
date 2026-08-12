import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, statSync, createReadStream } from "node:fs";
import { execSync } from "node:child_process";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../data/published");

// Build stamp — short git SHA + build date, rendered small in the footer so a
// support conversation can start with "which build are you on". Falls back to
// 'local' where git is unavailable (a tarball, a container without .git):
// a missing stamp must never fail a build.
function buildId() {
  const date = new Date().toISOString().slice(0, 10);
  try {
    const sha = execSync("git rev-parse --short=7 HEAD", {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return `${sha} · ${date}`;
  } catch {
    return `local · ${date}`;
  }
}

// Serve /data/published/* from ../data/published/* in dev.
// This mirrors production where the same files sit next to the static
// bundle on the CDN. The SPA's fetch('/data/published/foo.json') hits
// this middleware in dev and a CDN in production.
function dataMiddleware() {
  return {
    name: "vyarno-data-published",
    configureServer(server) {
      server.middlewares.use("/data/published", (req, res, next) => {
        // req.url is "/<file>.json" because the mount path strips /data/published
        const filePath = resolve(DATA_DIR, "." + req.url.split("?")[0]);
        // Path-traversal guard: must stay inside DATA_DIR
        if (!filePath.startsWith(DATA_DIR + "/") && filePath !== DATA_DIR) {
          return next();
        }
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          return next();
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        Readable.toWeb(createReadStream(filePath))
          .pipeTo(
            new WritableStream({
              write(chunk) {
                res.write(chunk);
              },
              close() {
                res.end();
              },
            })
          )
          .catch(() => res.end());
      });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), dataMiddleware()],
  root: ".",
  publicDir: "public",
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  resolve: {
    alias: {
      $lib: resolve(__dirname, "src/lib"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Bind 0.0.0.0 (not 127.0.0.1) so the dev server is LAN-reachable
    // by default — phones/tablets/second laptops on the same Wi-Fi
    // can hit http://<laptop-lan-ip>:5173/ without any startup flag.
    // The Vite banner shows the actual LAN URL on startup (Network: …).
    // Same default as `npm run dev` (which runs `vite --host`).
    host: true,
    fs: {
      // Allow serving files from the parent's data/ folder.
      allow: [resolve(__dirname, "..")],
    },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    // Nine entries, nine real URLs on a static host with no rewrite rules:
    //   index.html         → /            the calculator
    //   how/index.html     → /how/        the country's figures, with their sources
    //   legal/index.html   → /legal/      terms, privacy, ЗЕТ чл. 4 identity, sources
    //   support/index.html → /support/    how the project is paid for
    //   en/…               → /en/…        each of those four again, in English
    //   404.html           → /404.html    served by name for any unmatched path,
    //                                     which every static host does unconfigured
    //
    // Each is a separate entry rather than a route inside the SPA so it
    // resolves without a client-side router or a host rewrite, and so someone
    // who came to read the terms — or to find out who pays for this — does not
    // download the calculator to do it. `/how/` is also the entry that has to
    // be separate for a second reason: one page ranks for one cluster of
    // queries, and the calculator is answering a different one (docs/seo.md).
    //
    // **The `en/` four are that same argument applied to language.** A page
    // that ranks does so as a DOCUMENT, and the document a crawler is served
    // carries one language: `prerender.mjs` writes the language its entry
    // declares and drops the other, so a single URL answering in two languages
    // put only one of them in front of a search engine. Two URLs is also what
    // makes the pair expressible at all — an `hreflang` alternate needs
    // somewhere to point, and the English half had no address of its own.
    //
    // They cost no second Svelte build and no second component: each entry
    // names the same bootstrap as its Bulgarian counterpart, and the difference
    // between the pair is the `data-lang` on `<html>`, the head tags, and which
    // half of every string survives the prerender.
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        how: resolve(__dirname, "how/index.html"),
        market: resolve(__dirname, "market/index.html"),
        legal: resolve(__dirname, "legal/index.html"),
        support: resolve(__dirname, "support/index.html"),
        enMain: resolve(__dirname, "en/index.html"),
        enHow: resolve(__dirname, "en/how/index.html"),
        enMarket: resolve(__dirname, "en/market/index.html"),
        enLegal: resolve(__dirname, "en/legal/index.html"),
        enSupport: resolve(__dirname, "en/support/index.html"),
        notFound: resolve(__dirname, "404.html"),
      },
    },
    // 'hidden', not `true` and not `false`, and the reason is payload size
    // rather than secrecy — the source is public on GitHub under Apache-2.0,
    // so hiding it from devtools would be theatre.
    //
    // `true` emits dist/assets/*.js.map plus a //# sourceMappingURL= comment:
    // hundreds of kilobytes of `sourcesContent` inside the deploy artefact
    // that no visitor's browser asks for, served from a small self-managed
    // box to an audience largely on mobile data.
    //
    // `false` would leave production stack traces unreadable forever — a
    // minified frame with no function name and no line number.
    //
    // 'hidden' writes the maps and omits the comment;
    // scripts/strip-sourcemaps.mjs then moves them into site/.sourcemaps/,
    // where they stay available for an error-reporting service. Serving them
    // is a legitimate call to make later: a deploy-size trade, not a licence
    // question.
    sourcemap: "hidden",
  },
});
