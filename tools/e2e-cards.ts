// Writes the card definitions the browser tests use (apps/web/e2e/cards.json), so the tests run without the
// full card data. Every quoted string in apps/web/e2e/*.ts that is a card name is included.
//
//   npm run e2e:cards           (needs data/generated/cards.json)

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { isFullySupported, meldResultsFor, registerMeldResults, type CardDef } from "../packages/engine/src";

const dir = new URL("../apps/web/e2e/", import.meta.url);
const cards: CardDef[] = JSON.parse(readFileSync(new URL("../data/generated/cards.json", import.meta.url), "utf8"));
registerMeldResults(cards);
const byName = new Map(cards.map((c) => [c.name, c]));
const names = new Set<string>();
for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts")))
  for (const m of readFileSync(new URL(f, dir), "utf8").matchAll(/"([^"\n]+)"/g)) if (byName.has(m[1]!)) names.add(m[1]!);
// A meld card's combined back face (CR 712.4), which the game needs and the tests needn't quote.
for (const r of meldResultsFor([...names].map((n) => byName.get(n)!))) names.add(r.name);
// A quoted word that happens to be a card name ("Sacrifice") is left out if the engine can't play it anyway.
const out = [...names].sort().flatMap((n) => {
  // No images: the tests run without network access to Scryfall.
  const { imageUrl: _i, artUrl: _a, ...def } = byName.get(n)! as CardDef & { artUrl?: string };
  return isFullySupported(def) || meldResultsFor([...names].map((x) => byName.get(x)!)).some((r) => r.name === n) ? [def] : [];
});
writeFileSync(new URL("cards.json", dir), JSON.stringify(out, null, 1) + "\n");
console.log(`${out.length} cards`);
