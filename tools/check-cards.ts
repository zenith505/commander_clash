// Which of these cards compile fully, and the lines that don't: `npx tsx tools/check-cards.ts "Card A" "Card B"`.
// With GREP=text, every card whose rules text contains that text instead.

import { readFileSync } from "node:fs";
import { compileCard, isFullySupported, registerMeldResults, type CardDef } from "../packages/engine/src";

const cards: CardDef[] = JSON.parse(readFileSync(new URL("../data/generated/cards.json", import.meta.url), "utf8"));
registerMeldResults(cards);
const grep = process.env.GREP;
const picked = grep ? cards.filter((c) => c.oracleText?.includes(grep)) : process.argv.slice(2).map((n) => cards.find((c) => c.name === n) ?? cards.find((c) => c.name.startsWith(n)));
for (const c of picked) {
  if (!c) continue;
  const ok = isFullySupported(c);
  console.log(`${ok ? "OK " : "-- "} ${c.name}`);
  if (!ok) for (const l of compileCard(c).unsupported) console.log(`\t${l.replaceAll(c.name, "~")}`);
}
