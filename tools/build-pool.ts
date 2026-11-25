// Writes the deck builder's card pool, apps/web/public/data/card-pool.json.gz: every Commander-legal card the engine
// fully supports (the cards a saved deck can use), plus the meld results and named cards those need in a game.
// Run it after anything changes which cards are supported (a card round) or the card data (npm run build:cards):
//
//   npm run build:pool                  (needs data/generated/cards.json, ~3 minutes)
//
// It's gzipped (about 5 MB instead of 26) and the app unzips it as it loads (apps/web/src/decks/pool.ts).

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { isFullySupported, meldResultsFor, registerMeldResults, type CardRecord } from "../packages/engine/src";

const ROOT = resolve(import.meta.dirname, "..");
const cards: CardRecord[] = JSON.parse(readFileSync(join(ROOT, "data", "generated", "cards.json"), "utf8"));
registerMeldResults(cards);
const supported = cards.filter((c) => c.commanderLegal === "legal" && isFullySupported(c));
const extras = meldResultsFor(supported);
const pool = { cards: supported, extras };
const out = join(ROOT, "apps", "web", "public", "data", "card-pool.json.gz");
// mtime 0 in the gzip header, so the same cards give the same bytes.
writeFileSync(out, gzipSync(JSON.stringify(pool), { level: 9 }));
console.log(`${supported.length.toLocaleString()} cards (+${extras.length} meld results and named cards) -> ${out}`);
