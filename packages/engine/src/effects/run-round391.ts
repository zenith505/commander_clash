// Round 391's effects: cards exiled in a face-down pile, shuffled, then manifested or cloaked (Ghastly Conscription,
// Become Anonymous, Expose the Culprit).
import type { Effect } from "../abilities";
import { defOf, objHasKeyword, objIsType } from "../cards";
import { controllerOf } from "../layers";
import { enterTogether, log, moveObject, obj, player } from "../game";
import { shuffle } from "../rng";
import type { GameState, ObjectId, PlayerId } from "../types";
import type { ResolveCtx } from "./resolve";
import { objects, players } from "./resolve";

/**
 * "Exile ... in a face-down pile, shuffle that pile, then manifest those cards" (Ghastly Conscription) or "cloak those
 * cards. They enter tapped." (Become Anonymous): the cards are exiled together, face down (CR 406.3), the pile shuffled
 * so no one knows which face-down creature is which (rulings), then each one still in exile is put onto the battlefield
 * face down under your control, a 2/2 creature (with ward {2} if cloaked), whoever owns it (CR 701.40a, 701.58a). Its
 * controller may look at it (CR 708.5). A card that didn't reach exile (a commander moved by its owner, or the target
 * gone) isn't in the pile, and an instant or sorcery card is put onto the battlefield face down like any other (rulings).
 */
export function runFaceDownPileEffect(s: GameState, e: Extract<Effect, { type: "faceDownPile" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const me = player(s, ctx.controller);
  const fromYards: ObjectId[] = [];
  const fromField: ObjectId[] = [];
  // Expose the Culprit: "any number of face-up creatures you control with disguise", chosen as it resolves (CR 608.2d),
  // after its first mode has turned a creature face up (CR 700.2, modes in the order printed). Disguise as the creature
  // has it now: one that lost its abilities has none (CR 613.1f).
  if (e.chooseDisguised) {
    const sc = (s.resolving!.scratch ??= {});
    if (sc.chosen?.[ctx.controller] !== undefined) {
      fromField.push(...sc.chosen[ctx.controller]!.filter((id) => disguised(s, ctx.controller).includes(id)));
      sc.chosen = undefined;
      sc.queue = undefined;
    } else {
      const options = disguised(s, ctx.controller);
      if (!options.length) {
        log(s, `${me.name} controls no face-up creature with disguise, so nothing is cloaked (${src}).`);
        return;
      }
      sc.queue = [ctx.controller];
      sc.chosen = {};
      s.pending = { kind: "pickPermanents", player: ctx.controller, source: src, action: "choose", what: "face-up creatures you control with disguise", options, count: options.length, min: 0, anyNumber: true, prompt: "choose any number of face-up creatures you control with disguise: they're exiled in a face-down pile, shuffled, then cloaked" };
      return "paused";
    }
    if (!fromField.length) {
      log(s, `${me.name} chooses no creatures to cloak (${src}).`);
      return;
    }
  }
  // "All creature cards from target player's graveyard": their card types where they are (CR 400.3).
  for (const pid of e.yardOf ? players(s, e.yardOf, ctx) : []) fromYards.push(...player(s, pid).graveyard.filter((id) => objIsType(s, obj(s, id), "Creature")));
  // "Target nontoken creature you own": still a legal target as it resolves, or the spell doesn't resolve (CR 608.2b).
  for (const o of e.what ? objects(s, e.what, ctx) : []) if (o.zone === "battlefield") fromField.push(o.id);
  const fromTop = e.top ? me.library.slice(0, e.top) : [];
  const parts: string[] = [];
  if (fromField.length) parts.push(fromField.map((id) => defOf(s, obj(s, id)).name).join(", "));
  if (fromTop.length) parts.push(`the top ${fromTop.length === 1 ? "card" : `${fromTop.length} cards`} of their library`);
  if (fromYards.length) parts.push(`${fromYards.map((id) => defOf(s, obj(s, id)).name).join(", ")} from ${[...new Set(fromYards.map((id) => obj(s, id).owner))].map((p) => `${player(s, p).name}'s`).join(" and ")} graveyard`);
  if (!parts.length) {
    log(s, `${src} exiles nothing.`);
    return;
  }
  const at = s.nextTimestamp;
  const pile: ObjectId[] = [];
  for (const id of [...fromField, ...fromTop, ...fromYards]) {
    moveObject(s, id, "exile");
    const o = obj(s, id);
    if (o.zone !== "exile") continue;
    o.hiddenExile = { by: ctx.sourceId ?? "", seen: [], label: "Face down", at };
    pile.push(id);
  }
  shuffle(s, pile);
  log(s, `${me.name} exiles ${parts.join(" and ")} in a face-down pile and shuffles it (${src}).`);
  const done: ObjectId[] = [];
  enterTogether(s, () => {
    for (const id of pile) {
      if (obj(s, id).zone !== "exile") continue;
      moveObject(s, id, "battlefield", { controller: ctx.controller, faceDown: e.into, ...(e.tapped ? { tapped: true } : {}) });
      if (obj(s, id).zone === "battlefield") done.push(id);
    }
  });
  if (s.resolving) s.resolving.created = done;
  if (done.length) log(s, `${me.name} ${e.into}s ${done.length === 1 ? "a card" : `${done.length} cards`}: ${done.length === 1 ? "a" : "each a"} face-down 2/2 creature${e.into === "cloak" ? " with ward {2}" : ""}${e.tapped ? ", tapped" : ""}.`);
}

/** Expose the Culprit's choices: face-up creatures `pid` controls that have disguise now. */
function disguised(s: GameState, pid: PlayerId): ObjectId[] {
  return s.battlefield.filter((id) => {
    const o = obj(s, id);
    return !o.faceDown && !s.phasedOut?.includes(id) && controllerOf(s, o) === pid && objIsType(s, o, "Creature") && objHasKeyword(s, o, "Disguise");
  });
}
