// Ranks the rules-text lines that keep the most Commander-legal cards unsupported. For each unsupported card it
// finds the lines that really fail (each line is retried alone), then counts, per line pattern, how many cards
// that line alone blocks ("single") and how many it appears in ("n"). Pick the next round's work from the top.
//
//   npm run blockers                       top 60 by cards blocked alone
//   npm run blockers -- "madness" 20       only patterns matching a regex
//   BY_COUNT=1 npm run blockers            sort by total appearances instead

import { readFileSync } from "node:fs";
import { compileCard, isFullySupported, type CardDef } from "../packages/engine/src";

type Card = CardDef & { commanderLegal?: string };
const cards: Card[] = JSON.parse(readFileSync(new URL("../data/generated/cards.json", import.meta.url), "utf8"));
const unsupported = cards.filter((c) => c.commanderLegal === "legal" && !c.name.includes(" // ") && !isFullySupported(c));
const re = process.argv[2] ? new RegExp(process.argv[2], "i") : null;
const fams = new Map<string, { n: number; single: number; ex: string[] }>();
for (const c of unsupported) {
  const u = compileCard(c).unsupported;
  const real = u.length === 1 ? u : u.filter((l) => compileCard({ ...c, oracleText: l }).unsupported.length > 0);
  const fails = real.length ? real : u;
  for (const l of fails) {
    const k = l.replaceAll(c.name, "~").replace(/\d+/g, "N");
    if (re && !re.test(k)) continue;
    const e = fams.get(k) ?? { n: 0, single: 0, ex: [] };
    e.n++;
    if (fails.length === 1) {
      e.single++;
      if (e.ex.length < 3) e.ex.push(c.name);
    }
    fams.set(k, e);
  }
}
const order = process.env.BY_COUNT ? (a: [string, { n: number; single: number }], b: typeof a) => b[1].n - a[1].n : (a: [string, { n: number; single: number }], b: typeof a) => b[1].single - a[1].single || b[1].n - a[1].n;
console.log(`${unsupported.length} legal cards unsupported. single/n  pattern  [examples blocked only by it]`);
for (const [k, v] of [...fams].sort(order).slice(0, Number(process.argv[3] ?? 60))) console.log(`${v.single}/${v.n}\t${k}\t[${v.ex.join("; ")}]`);
