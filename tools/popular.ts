// The most played Commander cards the engine doesn't support yet, most played first, with the lines that fail
// (EDHREC rank from data/popularity.json; `npm run popularity` rebuilds it). Rounds take their cards from the top.
//
//   npm run popular            the first 60
//   npm run popular -- 200     the first 200

import { readFileSync } from "node:fs";
import { compileCard, isFullySupported, registerMeldResults, type CardDef } from "../packages/engine/src";
import { loadRanks } from "./popularity";

type Card = CardDef & { commanderLegal?: string };
const cards: Card[] = JSON.parse(readFileSync(new URL("../data/generated/cards.json", import.meta.url), "utf8"));
registerMeldResults(cards);
const ranks = loadRanks();
if (!ranks) throw new Error("data/popularity.json is missing: npm run popularity -- <scryfall-oracle-cards.jsonl.gz>");
const byName = new Map(cards.map((c) => [c.name, c]));
const out = [...ranks].sort((a, b) => a[1] - b[1]).flatMap(([name, rank]) => {
  const c = byName.get(name);
  return c && !isFullySupported(c) ? [{ rank, c }] : [];
});
for (const { rank, c } of out.slice(0, Number(process.argv[2] ?? 60))) {
  console.log(`${rank}\t${c.name}`);
  for (const l of compileCard(c).unsupported) console.log(`\t\t${l.replaceAll(c.name, "~")}`);
}
