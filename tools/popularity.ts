// How often each card is played in Commander (EDHREC rank, from the Scryfall extract), so rounds can take the most
// played unsupported cards first and `npm run coverage` can report the top 1,000 / 2,000 / 5,000.
//
//   npm run popularity -- <dir>/scryfall-oracle-cards.jsonl.gz     rewrites data/popularity.json (top 5,000, in git)
//   npm run popular [-- 100]                                       the most played unsupported cards and their lines
//
// data/popularity.json is small and tracked, so coverage works without the Scryfall extract. Rebuild it when the
// extract is refreshed.

import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";

const FILE = new URL("../data/popularity.json", import.meta.url);
/** The popularity bars the roadmap tracks; cards are counted to the largest. */
export const TOPS = [1000, 2000, 5000];

/** Card name -> EDHREC rank, for Commander-legal cards ranked within the largest bar; null if the file is missing. */
export function loadRanks(): Map<string, number> | null {
  if (!existsSync(FILE)) return null;
  const { ranks } = JSON.parse(readFileSync(FILE, "utf8")) as { ranks: [number, string][] };
  return new Map(ranks.map(([r, n]) => [n, r]));
}

/** "top 1,000: 812 of 1,000 (81%)" for each bar, given which ranked cards are supported. */
export function popularityLines(ranks: Map<string, number>, supported: (name: string) => boolean): string[] {
  return TOPS.map((top) => {
    const names = [...ranks].filter(([, r]) => r <= top).map(([n]) => n);
    const sup = names.filter(supported).length;
    return `top ${top.toLocaleString("en-US")}: ${sup.toLocaleString("en-US")} of ${names.length.toLocaleString("en-US")} (${Math.floor((100 * sup) / names.length)}%)`;
  });
}

async function build(path: string) {
  const lines = createInterface({ input: path.endsWith(".gz") ? createReadStream(path).pipe(createGunzip()) : createReadStream(path) });
  const ranks: [number, string][] = [];
  for await (const line of lines) {
    if (!line.trim()) continue;
    const c = JSON.parse(line) as { name: string; edhrec_rank?: number; legalities?: { commander?: string } };
    if (c.legalities?.commander === "legal" && c.edhrec_rank && c.edhrec_rank <= TOPS[TOPS.length - 1]) ranks.push([c.edhrec_rank, c.name]);
  }
  ranks.sort((a, b) => a[0] - b[0]);
  writeFileSync(FILE, `{"source":"EDHREC rank via Scryfall, Commander-legal cards ranked ${TOPS[TOPS.length - 1]} or better","ranks":[\n${ranks.map((r) => JSON.stringify(r)).join(",\n")}\n]}\n`);
  console.log(`wrote ${ranks.length} ranked cards to data/popularity.json`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("usage: npm run popularity -- <scryfall-oracle-cards.jsonl[.gz]>");
  await build(process.argv[2]);
}
