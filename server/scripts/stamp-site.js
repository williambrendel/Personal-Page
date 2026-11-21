/**
 * Version-stamp the site's CSS and JS links, so a deploy is visible at once.
 *
 *   npm --prefix server run stamp
 *
 * GitHub Pages serves everything with `cache-control: max-age=600`. A
 * browser that loaded the page before a deploy therefore keeps the OLD
 * stylesheet for up to ten minutes — the HTML revalidates on reload, the
 * stylesheet does not. The page looks unchanged, and the obvious conclusion
 * is that the change was never made. That cost real time on 2026-11-10:
 * production had the new CSS, the browser had the old one, and both of us
 * were looking at a layout that had already been fixed.
 *
 * The stamp is a hash of the file's own contents, not the commit SHA. A SHA
 * would be circular — stamping changes index.html, which changes the commit
 * — and it would also bust the cache on every deploy whether or not the
 * asset moved. A content hash changes exactly when the file does.
 *
 * Run it after touching anything under css/ or scripts/, before committing.
 * Running it when nothing changed is a no-op and says so.
 *
 *   npm --prefix server run stamp -- --verify
 *
 * --verify writes nothing and exits 1 if any stamp is out of date. It exists
 * because "run it before committing" is a habit, and the habit failed: on
 * 2026-11-19 css/common.css and css/thinking-loader.css were found carrying
 * stamps for contents they no longer had, so every returning visitor kept
 * the cached stylesheet — the exact failure the paragraph above describes,
 * recurring because nothing checked. ship.sh runs this in preflight
 * alongside npm test, so a stale stamp stops a deploy instead of reaching
 * visitors.
 *
 * ── The implementation is pwa's `stampRefs` now ─────────────────────────
 *
 * This file is the binding: it points the stamper at the site root and keeps
 * the wording the operator reads, since the library's "Run: pwa stamp" is
 * not the command this repo uses.
 *
 * Checked before switching: pwa's stamper run in verify mode against the
 * stamps this repo had already committed reported zero stale, so its hashing
 * and its walk over HTML, CSS @import and JS import agree with the
 * implementation it replaced on every reference the site has.
 */
import path from "node:path";
import { stampRefs } from "@williambrendel/pwa/build";

const ROOT = path.resolve(import.meta.dirname, "../..");
const VERIFY = process.argv.includes("--verify");

const result = stampRefs({ root: ROOT, verify: VERIFY });

for (const m of result.missing) console.log(`  missing, left alone: ${m}`);

if (result.cycle) {
  console.error("  stopped after the pass limit: is there an import cycle?");
  process.exitCode = 1;
} else if (VERIFY) {
  if (result.stale.length) {
    console.error("stamps: STALE — these carry a hash for contents they no longer have:");
    for (const f of result.stale) console.error(`  ${f}`);
    console.error("\n  Returning visitors keep the cached version until the stamp moves.");
    console.error("  Run: npm --prefix server run stamp");
    process.exitCode = 1;
  } else {
    console.log("stamps: OK — every ?v= matches its file");
  }
} else if (result.changed.length) {
  console.log(`Stamped ${result.changed.length} reference(s):`);
  for (const f of result.changed) console.log(`  ${f}`);
} else {
  console.log("Already current: nothing to stamp.");
}
