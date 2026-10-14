// Plays bot-vs-bot games with the sample decks and reports speed and outcomes.
//   npm run simulate -- [games=5]
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { applyAction, botActions, createGame, waitingOn, type CardDef } from "../packages/engine/src";

const ROOT = resolve(import.meta.dirname, "..");
const bundle = JSON.parse(readFileSync(join(ROOT, "apps/web/public/data/sample-decks.json"), "utf8")) as {
  decks: { name: string; commander: string; secondCommander?: string; cards: string[] }[];
  cards: CardDef[];
};
const byName = new Map(bundle.cards.map((c) => [c.name, c]));
const games = Number(process.argv[2] ?? 5);
for (let g = 0; g < games; g++) {
  let s = createGame(
    bundle.decks.slice(0, 4).map((d) => ({ name: d.name, commander: byName.get(d.commander)!, ...(d.secondCommander ? { secondCommander: byName.get(d.secondCommander)! } : {}), deck: d.cards.map((n) => byName.get(n)!), isBot: true })),
    g + 1,
    { mulligans: true },
  );
  const t0 = performance.now();
  let actions = 0;
  while (!s.over && s.turn < 300) {
    for (const a of botActions(s, waitingOn(s)!)) s = applyAction(s, a);
    actions++;
  }
  const ms = performance.now() - t0;
  console.log(
    `game ${g + 1}: ${s.over ? `winner ${s.winner !== null ? s.players[s.winner]!.name : "none"}` : "unfinished"} on turn ${s.turn}, ` +
      `${actions} decisions, ${(ms / actions).toFixed(2)} ms/decision`,
  );
}
