// Lane B round B270's effects: Abstract Performance's piles (abstractPiles).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { enterTogether, log, moveObject, obj, player } from "../game";
import type { GameState, ObjectId, PlayerId } from "../types";
import type { ResolveCtx } from "./resolve";
import { chooseAnOpponent } from "./run-library";

type B270Effect = Extract<Effect, { type: "abstractPiles" }>;

/**
 * Abstract Performance: "Exile the top four cards of your library in a face-down pile, then exile the top four cards of
 * your library in a face-up pile. An opponent chooses one of those piles. Put that pile into your graveyard. Look at the
 * cards in the other pile." The first pile is exiled face down and nobody may look at it until told to (rulings, CR
 * 406.3); the second face up, smaller or empty with fewer than eight cards left (rulings). An opponent you choose as it
 * resolves (rulings) picks a pile, seeing only the face-down one's size; it goes into your graveyard (face up there, CR
 * 404.2), and you look at the other. Its cards are those the castFromAmong `fromDug` after this casts from
 * (ResolvingInfo.dugExiled), the rest going into your hand.
 */
export function runLaneB270Effect(s: GameState, e: B270Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const p = player(s, ctx.controller);
  const names = (ids: ObjectId[]) => (ids.length ? ids.map((id) => defOf(s, obj(s, id)).name).join(", ") : "no cards");
  const count = (n: number) => (n === 1 ? "1 card" : `${n} cards`);
  if (!sc.abstractPiles) {
    const down: ObjectId[] = [];
    const up: ObjectId[] = [];
    const at = s.nextTimestamp++;
    for (const id of p.library.slice(0, e.n)) {
      moveObject(s, id, "exile");
      const o = obj(s, id);
      if (o.zone !== "exile") continue;
      o.hiddenExile = { by: ctx.sourceId ?? "", seen: [], label: "Face down", at };
      down.push(id);
    }
    for (const id of p.library.slice(0, e.n)) {
      moveObject(s, id, "exile");
      if (obj(s, id).zone === "exile") up.push(id);
    }
    sc.abstractPiles = { down, up };
    log(s, `${p.name} exiles the top ${count(down.length)} of their library face down in a pile, then ${up.length ? names(up) : "no cards"} face up in another.`);
  }
  // Only the cards still in exile, as they are now (CR 400.7).
  const live = (ids: ObjectId[]) => ids.filter((id) => s.objects[id]?.zone === "exile");
  const down = live(sc.abstractPiles.down);
  const up = live(sc.abstractPiles.up);
  if (sc.pileChoice === undefined) {
    const opp: PlayerId | undefined | "paused" = chooseAnOpponent(s, ctx, src, "choose an opponent to choose a pile for your graveyard");
    if (opp === "paused") return "paused";
    if (opp === undefined || player(s, opp).lost) return;
    s.pending = { kind: "chooseOption", player: opp, source: src, what: "pile", options: ["0", "1"], labels: [`Face-down pile: ${count(down.length)}`, `Face-up pile: ${names(up)}`], piles: [down, up], of: p.id, pileMode: "faceDownYard", prompt: `choose the pile to put into ${p.name}'s graveyard (${p.name} may cast a spell from the other without paying its mana cost and puts the rest into their hand)` };
    return "paused";
  }
  const yard = sc.pileChoice === 0 ? down : up;
  const other = sc.pileChoice === 0 ? up : down;
  enterTogether(s, () => {
    for (const id of yard) moveObject(s, id, "graveyard");
  });
  log(s, `${p.name} puts ${names(yard)} into their graveyard.`);
  // "Look at the cards in the other pile": the face-down ones stay face down, but you've seen them (CR 406.3).
  for (const id of other) {
    const h = s.objects[id]?.hiddenExile;
    if (h && !h.seen.includes(p.id)) h.seen = [...h.seen, p.id];
  }
  r.dugExiled = other.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 }));
}
