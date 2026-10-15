import { readFileSync } from "node:fs";
import { compileCard, isFullySupported, type CardDef } from "../packages/engine/src";
const cards: (CardDef & { commanderLegal?: string })[] = JSON.parse(readFileSync(new URL("../data/generated/cards.json", import.meta.url), "utf8"));
const rul = JSON.parse(readFileSync(new URL("../data/generated/rulings.json", import.meta.url), "utf8"));
const showR = process.env.R;
for (const name of process.argv.slice(2)) {
  const re = new RegExp(name, "i");
  for (const c of cards.filter((c) => c.name === name || (name.startsWith("/") && re.test(c.oracleText ?? "")))) {
    console.log(`== ${c.name} [${c.typeLine}] ${c.manaCost} legal=${c.commanderLegal} supported=${isFullySupported(c)}`);
    console.log(c.oracleText);
    console.log("  UNSUPPORTED:", JSON.stringify(compileCard(c).unsupported));
    if (showR) for (const r of rul[c.oracleId] ?? []) console.log("  R:", typeof r === "string" ? r : r.comment ?? r.text ?? JSON.stringify(r));
  }
}
