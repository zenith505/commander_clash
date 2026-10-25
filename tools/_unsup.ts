import { readFileSync } from "node:fs";
import { compileCard, faceDef, isFullySupported, registerMeldResults, restingDef, type CardDef } from "../packages/engine/src";
const cards: (CardDef & { commanderLegal?: string })[] = JSON.parse(readFileSync(new URL("../data/generated/cards.json", import.meta.url), "utf8"));
registerMeldResults(cards);
const re = process.argv[2] ? new RegExp(process.argv[2]) : null;
const names = process.argv.slice(3);
for (const c of cards) {
  if (re ? !re.test(c.oracleText ?? "") : !names.some((n) => c.name === n || c.name.startsWith(n + " //"))) continue;
  const ok = isFullySupported(c);
  console.log(`${ok ? "OK " : "-- "}${c.name} [${c.commanderLegal}]`);
  if (ok) continue;
  const lines = compileCard(c).unsupported;
  if (c.faces?.length) { const r = restingDef(c); r.faces!.forEach((_, i) => { const f = faceDef(r, i); for (const l of compileCard(f).unsupported) lines.push(`${f.name}: ${l}`); }); }
  for (const l of new Set(lines)) console.log("     " + l.replace(/\n/g, " / "));
}
