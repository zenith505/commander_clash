// Picks the printing the game shows for each English oracle card from a Scryfall bulk file and writes just those
// card objects, so the card database can be rebuilt from a ~20 MB file instead of the 300 MB-3 GB bulk download.
// Plain Node with no packages, so it runs on any machine with Node (no `npm install`).
//
//   node tools/scryfall-extract.mjs [cards.jsonl] [rulings.jsonl] [--out <dir>] [--push <branch>]
//
// Inputs default to the newest unique-artwork / default-cards / all-cards and rulings files in data/raw/ (a path can
// also be a folder holding the .jsonl, as Windows unzips them). Outputs, in --out (default data/raw/):
//   scryfall-oracle-cards.jsonl.gz   one Scryfall card object per oracle card, every field the game might use
//   scryfall-rulings.jsonl.gz        the rulings file as is
// `npm run build:cards -- <dir>/scryfall-oracle-cards.jsonl.gz <dir>/scryfall-rulings.jsonl.gz` builds from them.
//
// --push <branch> commits the two files, and nothing else, to a new branch with no history and pushes it to origin,
// without touching the working tree or the index (git plumbing), so they can be fetched where the bulk files aren't.
// tools/build-cards.ts uses the same printing choice (bestPrintings).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGunzip, createGzip } from "node:zlib";

/** Layouts that aren't playable cards in a Commander game. */
export const SKIP_LAYOUTS = new Set(["art_series", "token", "double_faced_token", "emblem", "planar", "scheme", "vanguard", "augment", "host"]);

/** Per-printing store and site links the game never uses, dropped from the extract to keep it small. */
const DROP_FIELDS = [
  "prices", "purchase_uris", "related_uris", "uri", "scryfall_uri", "rulings_uri", "prints_search_uri",
  "multiverse_ids", "mtgo_id", "mtgo_foil_id", "arena_id", "tcgplayer_id", "tcgplayer_etched_id", "cardmarket_id",
];

/** A bulk file path, or a folder holding it (Windows "extracts" a download into a folder of the same name). */
export function resolveJsonl(path) {
  if (!statSync(path).isDirectory()) return path;
  const inside = readdirSync(path).filter((n) => n.endsWith(".jsonl") || n.endsWith(".json"));
  const same = inside.find((n) => n === basename(path));
  if (same || inside.length === 1) return join(path, same ?? inside[0]);
  throw new Error(`${path} is a folder; expected one .jsonl file in it, found ${inside.length}`);
}

/** The newest bulk file in `dir` whose name starts with `prefix` (names end in a timestamp), or undefined. */
export function newest(dir, prefix) {
  if (!existsSync(dir)) return undefined;
  const f = readdirSync(dir)
    .filter((n) => n.startsWith(prefix) && /\.jsonl(\.gz)?$/.test(n))
    .sort()
    .pop();
  return f && resolveJsonl(join(dir, f));
}

/** The non-empty lines of a .jsonl or .jsonl.gz file. */
export async function* lines(path) {
  const raw = createReadStream(resolveJsonl(path));
  const input = path.endsWith(".gz") ? raw.pipe(createGunzip()) : raw;
  input.setEncoding("utf8");
  const rl = createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield line;
}

/** English playable cards with an oracle id: no tokens, art cards, planes, memorabilia or Un-cards. */
export function isPlayablePrinting(c) {
  if (c.lang !== "en" || !c.oracle_id || SKIP_LAYOUTS.has(c.layout)) return false;
  return c.set_type !== "memorabilia" && c.set_type !== "funny";
}

/** Higher is a better printing to show: regular, recent, high-res, non-promo frames. */
export function printingScore(c) {
  let n = 0;
  if (c.highres_image) n += 4;
  if (!c.promo) n += 4;
  if (!c.full_art && !c.textless) n += 2;
  if (c.frame === "2015") n += 2;
  if (c.border_color === "black") n += 1;
  if (!c.digital) n += 3;
  return n * 1e9 + Date.parse(c.released_at ?? "2000-01-01") / 1000;
}

/** oracle_id -> the printing to show, from a bulk file of Scryfall card objects. */
export async function bestPrintings(path, onProgress) {
  const best = new Map();
  let seen = 0;
  for await (const line of lines(path)) {
    seen++;
    if (onProgress && seen % 100_000 === 0) onProgress(seen);
    const c = JSON.parse(line);
    if (!isPlayablePrinting(c)) continue;
    const score = printingScore(c);
    const prev = best.get(c.oracle_id);
    if (!prev || score > prev.score) best.set(c.oracle_id, { score, card: c });
  }
  return { seen, cards: [...best.values()].map((b) => b.card) };
}

function trim(c) {
  const out = { ...c };
  for (const k of DROP_FIELDS) delete out[k];
  return out;
}

async function writeGz(path, gen) {
  await pipeline(async function* () {
    for await (const s of gen) yield s;
  }, createGzip({ level: 9 }), createWriteStream(path));
}

const md5 = (path) => createHash("md5").update(readFileSync(path)).digest("hex");

function git(args, input) {
  return execFileSync("git", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] }).trim();
}

/** Commits `files` alone (no parent, nothing from the working tree) and pushes the commit to origin as `branch`. */
function pushFiles(files, branch) {
  const entries = files.map((f) => `100644 blob ${git(["hash-object", "-w", f])}\t${basename(f)}\n`).join("");
  const tree = git(["mktree"], entries);
  const commit = git(["commit-tree", tree, "-m", `Scryfall extract for the card database (${files.map((f) => basename(f)).join(", ")})`]);
  git(["push", "origin", `${commit}:refs/heads/${branch}`]);
  console.log(`Pushed ${commit} to origin ${branch}`);
}

async function main(argv) {
  const flag = (name) => {
    const i = argv.indexOf(name);
    if (i < 0) return undefined;
    const v = argv[i + 1];
    argv.splice(i, 2);
    return v;
  };
  const out = resolve(flag("--out") ?? join("data", "raw"));
  const branch = flag("--push");
  const raw = join("data", "raw");
  const cardsPath = argv[0] ?? newest(raw, "unique-artwork") ?? newest(raw, "default-cards") ?? newest(raw, "all-cards");
  const rulingsPath = argv[1] ?? newest(raw, "rulings");
  if (!cardsPath) throw new Error(`No Scryfall card file given or found in ${resolve(raw)}`);
  console.log(`Cards:   ${resolveJsonl(cardsPath)}\nRulings: ${rulingsPath ? resolveJsonl(rulingsPath) : "(none)"}`);

  mkdirSync(out, { recursive: true });
  const { seen, cards } = await bestPrintings(cardsPath, (n) => console.log(`  ...${n.toLocaleString()} lines`));
  cards.sort((a, b) => a.name.localeCompare(b.name) || a.oracle_id.localeCompare(b.oracle_id));
  const cardsOut = join(out, "scryfall-oracle-cards.jsonl.gz");
  await writeGz(cardsOut, (function* () {
    for (const c of cards) yield JSON.stringify(trim(c)) + "\n";
  })());
  console.log(`Read ${seen.toLocaleString()} printings -> ${cards.length.toLocaleString()} English oracle cards`);
  const written = [cardsOut];
  if (rulingsPath) {
    const rulingsOut = join(out, "scryfall-rulings.jsonl.gz");
    let n = 0;
    await writeGz(rulingsOut, (async function* () {
      for await (const line of lines(rulingsPath)) {
        n++;
        yield line + "\n";
      }
    })());
    console.log(`Rulings: ${n.toLocaleString()}`);
    written.push(rulingsOut);
  }
  for (const f of written) console.log(`${md5(f)}  ${f} (${(statSync(f).size / 1e6).toFixed(1)} MB)`);
  if (branch) pushFiles(written, branch);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
