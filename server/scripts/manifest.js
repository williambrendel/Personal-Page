/**
 * Corpus manifest: documentId -> sha256 of the markdown the .bin was built from.
 *
 * Why this exists. A .bin stores section ranges as byte offsets into its source
 * markdown; SectionResolver reads that markdown live at query time. Edit the
 * markdown without re-ingesting and the offsets silently point at the wrong
 * bytes — the resolver only returns null when a range overshoots the file
 * length, so a merely shifted range returns plausible-looking garbage.
 *
 * Observed consequence: a header rewrite shifted every offset, section text was
 * severed mid-sentence, and the model invented employment dates to bridge the
 * gap. No error anywhere in the stack.
 *
 * Written by ingest, verified at engine boot.
 *
 *   npm run manifest            write it from what is on disk
 *   npm run verify              check it, exit 1 on a mismatch
 *
 * ── The implementation lives in llms now ────────────────────────────────
 *
 * `pipelines/rag/manifest` is this code, extracted. This file is the binding:
 * it supplies this corpus's paths and keeps the two entry points the rest of
 * the app already uses — a default export with `verify()` and `write(built)`,
 * and the CLI.
 *
 * Checked against the implementation it replaced, on this corpus: the same 61
 * documents with the same hashes, in the same key order, and `verify()`
 * returning the same shape. The library's `write(built)` takes the same
 * documentId→markdown map `ingest.js` passes it, which matters because ingest
 * records the text each `.bin` was actually built from rather than whatever is
 * on disk when a multi-minute run finishes.
 */
import CONFIG from "../config.js";
import createManifest, { cli } from "@williambrendel/llms/src/pipelines/rag/manifest.js";

const manifest = createManifest({
  markdowns: CONFIG.MARKDOWNS,
  dataset:   CONFIG.DATASET,
});

export default manifest;

// Run directly: `node scripts/manifest.js` writes, `--verify` checks.
// The library's cli prints the same lines this used to and sets the same exit
// code, so `npm run verify` and ship.sh's gate are unchanged.
if (process.argv[1] === import.meta.filename) {
  cli(manifest, { fix: "npm run ingest" });
}
