// The most played Commander cards the engine doesn't support yet, most played first, with the lines that fail
// (EDHREC rank from data/popularity.json; `npm run popularity` rebuilds it). Rounds take their cards from the top.
//
//   npm run popular            the first 60
//   npm run popular -- 200     the first 200
//   npm run popular -- --least 200   least played first (Lane B works up from the bottom): Commander-legal cards
//                                    EDHREC doesn't rank come first, then ranked cards from the highest rank up (not
//                                    meld results: a melded permanent isn't a card, CR 712.4b)

import { readFileSync } from "node:fs";
import { compileCard, isFullySupported, isMeldResult, registerMeldResults, type CardDef } from "../packages/engine/src";
import { faceDef, restingDef } from "../packages/engine/src/faces";
import { loadRanks } from "./popularity";

type Card = CardDef & { commanderLegal?: string };
const cards: Card[] = JSON.parse(readFileSync(new URL("../data/generated/cards.json", import.meta.url), "utf8"));
registerMeldResults(cards);
const ranks = loadRanks();
if (!ranks) throw new Error("data/popularity.json is missing: npm run popularity -- <scryfall-oracle-cards.jsonl.gz>");
const byName = new Map(cards.map((c) => [c.name, c]));
const args = process.argv.slice(2);
const least = args.includes("--least");
const count = Number(args.find((a) => a !== "--least") ?? 60);
let out: { rank: number | null; c: Card }[] = [...ranks].sort((a, b) => a[1] - b[1]).flatMap(([name, rank]) => {
  const c = byName.get(name);
  return c && !isFullySupported(c) ? [{ rank, c }] : [];
});
if (least) {
  const unranked = cards.filter((c) => c.commanderLegal === "legal" && !ranks.has(c.name) && !isMeldResult(c) && !isFullySupported(c));
  out = [...unranked.map((c) => ({ rank: null, c })), ...out.reverse()];
}
for (const { rank, c } of out.slice(0, count)) {
  console.log(`${rank ?? "unranked"}\t${c.name}`);
  const lines = compileCard(c).unsupported.map((l) => l.replaceAll(c.name, "~"));
  // A card with faces: each face's lines, named by face.
  if (!lines.length && c.faces?.length) {
    const d = restingDef(c);
    d.faces!.forEach((_, i) => {
      const f = faceDef(d, i);
      for (const l of compileCard(f).unsupported) lines.push(`${f.name}: ${l.replaceAll(f.name, "~")}`);
    });
  }
  for (const l of lines) console.log(`\t\t${l}`);
}
