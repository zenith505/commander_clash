// Cards with several faces, by layout (split, flip, transform, modal_dfc, adventure, prepare, meld): how many the
// engine supports, and the face lines blocking the most of the rest.
//
//   npm run faces            (needs data/generated/cards.json; LINES=40 for more lines per layout)

import { readFileSync } from "node:fs";
import { compileCard, faceDef, isFullySupported, registerMeldResults, restingDef, type CardDef } from "../packages/engine/src";

type Card = CardDef & { commanderLegal?: string };
const cards: Card[] = JSON.parse(readFileSync(new URL("../data/generated/cards.json", import.meta.url), "utf8"));
// The combined back faces of the meld pairs, for their meld cards (CR 712.4).
registerMeldResults(cards);
const top = Number(process.env.LINES ?? 12);
const by = new Map<string, { all: number; ok: number; lines: Map<string, number> }>();
for (const c of cards.filter((c) => c.commanderLegal === "legal" && c.faces?.length)) {
  const g = by.get(c.layout!) ?? { all: 0, ok: 0, lines: new Map() };
  by.set(c.layout!, g);
  g.all++;
  if (isFullySupported(c)) g.ok++;
  else {
    const r = restingDef(c);
    const lines = new Set(r.faces!.flatMap((_, i) => compileCard(faceDef(r, i)).unsupported));
    for (const l of lines) g.lines.set(l, (g.lines.get(l) ?? 0) + 1);
  }
}
for (const [k, g] of [...by].sort((a, b) => b[1].all - a[1].all)) {
  console.log(`\n== ${k}: ${g.ok} of ${g.all} supported`);
  for (const [l, n] of [...g.lines].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`${String(n).padStart(4)}  ${l.replace(/\n/g, " / ").slice(0, 140)}`);
}
