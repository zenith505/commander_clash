// Lane B round B306's effects: The Celestial Toymaker (exilePilesDefenderChooses, and the count of the spells and
// abilities that made players guess or group things into piles this turn).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { enterTogether, log, moveObject, obj, player } from "../game";
import type { GameState, ObjectId } from "../types";
import { players, type ResolveCtx } from "./resolve";

/**
 * The effects whose instructions group cards or permanents into piles (CR 700.3): "separate ... into two piles" (Fact or
 * Fiction, Liliana of the Veil, Whims of the Fates, Bend or Break, Stand or Fall, Raging River's "left" and "right"
 * piles), "exile ... in a face-down pile" (Ghastly Conscription, Mangara's Tome, Hostile Negotiations, Triumph of Saint
 * Katherine, Abstract Performance), and The Celestial Toymaker's own. A pile may be empty (CR 700.3d), so the instruction
 * groups whatever it finds, nothing too. Phyrexian Portal's is noted only once its library check passes
 * (run-laneb265.ts), Brilliant Ultimatum's with its castFromAmong `piles`.
 */
const PILE_EFFECTS = new Set<Effect["type"]>(["piles", "exiledPiles", "faceDownPile", "faceDownPiles", "abstractPiles", "bendOrBreak", "permanentPiles", "pilesOnly", "whimsPiles", "ragingRiver", "pileOnTop", "shuffleExiledPile", "exilePilesDefenderChooses"]);

/** Whether this effect, as it runs, groups cards or permanents into piles (see PILE_EFFECTS). */
export const groupsIntoPiles = (e: Effect): boolean => PILE_EFFECTS.has(e.type) || (e.type === "castFromAmong" && !!e.piles);

/**
 * The Celestial Toymaker's count: the spell or ability resolving now (its stack item, CR 113.1, 608) caused a player to
 * guess (Gollum, Liar's Pendulum, Master of Predicaments, The Seventh Doctor, The Toymaker's Trap: the instructions that
 * say "guess", noted as the guess is asked) or to group cards or permanents into a pile (PILE_EFFECTS). Each spell or
 * ability counts once, however many players or piles (TurnLog.pileOrGuess). Judgment call, no ruling: only instructions
 * that say "guess" are guesses; naming a card (Conundrum Sphinx) or calling a coin flip (CR 705.2) isn't one.
 */
export function notePileOrGuess(s: GameState): void {
  const id = s.resolving?.item.id;
  if (!id) return;
  const seen = ((s.turnLog ??= {}).pileOrGuess ??= []);
  if (!seen.includes(id)) seen.push(id);
}

/**
 * The Celestial Toymaker: "Whenever ~ attacks, look at the top three cards of your library. Exile any number of them in a
 * face-down pile and the rest in a face-up pile. Defending player chooses one of those piles. Put that pile into your
 * hand." You look at the cards (they aren't revealed) and choose the face-down pile, any number of them, none or all (CR
 * 700.3d); both piles are exiled at once, the face-down one so only you may look at it (CR 406.3). The defending player is
 * the player it attacked, or the controller of the planeswalker or the protector of the battle it attacked (CR 506.2,
 * the trigger's player); they see the face-up pile and only the size of the other. The pile they choose goes into your
 * hand; the other stays in exile, face down or face up as it is. With no defending player left in the game, no pile is
 * chosen and both stay in exile.
 */
export function runLaneB306Effect(s: GameState, e: Extract<Effect, { type: "exilePilesDefenderChooses" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const p = player(s, ctx.controller);
  const names = (ids: ObjectId[]) => (ids.length ? ids.map((id) => defOf(s, obj(s, id)).name).join(", ") : "no cards");
  const count = (n: number) => (n === 1 ? "1 card" : `${n} cards`);
  if (!sc.facePiles) {
    if (!sc.looked) {
      sc.looked = p.library.slice(0, e.n);
      if (!sc.looked.length) return void log(s, `${p.name}'s library is empty (${src}).`);
      log(s, `${p.name} looks at the top ${sc.looked.length === 1 ? "card" : `${sc.looked.length} cards`} of their library.`);
    }
    const looked = sc.looked.filter((id) => s.objects[id]?.zone === "library");
    if (sc.separating && sc.found) {
      sc.pileOne = sc.found;
      sc.separating = undefined;
      sc.found = undefined;
    }
    if (!sc.pileOne) {
      sc.separating = true;
      s.pending = { kind: "searchLibrary", player: p.id, source: src, what: "the cards", cards: looked, min: 0, max: looked.length, dig: { looked, to: "for the face-down pile", rest: "form the face-up pile; both piles are exiled" }, piles: true };
      return "paused";
    }
    const down = sc.pileOne.filter((id) => looked.includes(id));
    const up = looked.filter((id) => !down.includes(id));
    // Both piles at once (one instruction), each card that reached exile in its pile (CR 400.7).
    const at = s.nextTimestamp++;
    const piles: [ObjectId[], ObjectId[]] = [[], []];
    enterTogether(s, () => {
      for (const id of [...down, ...up]) {
        moveObject(s, id, "exile");
        const o = obj(s, id);
        if (o.zone !== "exile") continue;
        if (down.includes(id)) {
          o.hiddenExile = { by: ctx.sourceId ?? "", seen: [p.id], label: "Face down", at };
          piles[0].push(id);
        } else piles[1].push(id);
      }
    });
    sc.facePiles = piles;
    log(s, `${p.name} exiles ${count(piles[0].length)} in a face-down pile and ${names(piles[1])} in a face-up pile (${src}).`);
  }
  const [down, up] = sc.facePiles.map((pile) => pile.filter((id) => s.objects[id]?.zone === "exile")) as [ObjectId[], ObjectId[]];
  if (!down.length && !up.length) return;
  if (sc.pileChoice === undefined) {
    const chooser = players(s, { ref: "eventPlayer" }, ctx).find((pid) => !player(s, pid).lost && pid !== p.id);
    if (chooser === undefined) return void log(s, `No defending player is left to choose a pile; both stay in exile (${src}).`);
    s.pending = { kind: "chooseOption", player: chooser, source: src, what: "pile", options: ["0", "1"], labels: [`Face-down pile: ${count(down.length)}`, `Face-up pile: ${names(up)}`], piles: [down, up], of: p.id, pileMode: "faceDown", prompt: `choose the pile to put into ${p.name}'s hand (the other stays in exile)` };
    return "paused";
  }
  const hand = sc.pileChoice === 0 ? down : up;
  log(s, `${p.name} puts ${sc.pileChoice === 0 ? `the face-down pile (${count(hand.length)})` : names(hand)} into their hand.`);
  enterTogether(s, () => {
    for (const id of hand) moveObject(s, id, "hand");
  });
}
