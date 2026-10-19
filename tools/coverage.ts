// Reports how many Commander-legal cards the engine fully supports, and the most common
// oracle lines it can't compile yet (the to-do list for new card templates).
//
//   npm run coverage            (needs data/generated/cards.json from build:cards)

import { readFileSync } from "node:fs";
import { compileCard, isFullySupported, registerMeldResults, type CardDef } from "../packages/engine/src";

type Card = CardDef & { commanderLegal?: string };
const cards: Card[] = JSON.parse(readFileSync(new URL("../data/generated/cards.json", import.meta.url), "utf8"));
// The combined back faces of the meld pairs, for their meld cards (CR 712.4).
registerMeldResults(cards);
const legal = cards.filter((c) => c.commanderLegal === "legal");
const sup = legal.filter((c) => isFullySupported(c));
console.log(`fully supported: ${sup.length} of ${legal.length} legal (${cards.length} total)`);
const by = (pred: (c: Card) => boolean) => sup.filter(pred).length;
console.log("auras", by((c) => c.subtypes.includes("Aura")), "equipment", by((c) => c.subtypes.includes("Equipment")),
  "with statics", by((c) => compileCard(c).statics.length > 0));
const counts = new Map<string, number>();
for (const c of legal) for (const l of compileCard(c).unsupported) {
  const k = l.replace(/\d+/g, "N").replace(c.name, "~");
  counts.set(k, (counts.get(k) ?? 0) + 1);
}
console.log([...counts].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => `${n}\t${k}`).join("\n"));
