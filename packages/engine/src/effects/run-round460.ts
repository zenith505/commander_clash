// Round 460's effects: Word of Command (CR 723.2): you control the target opponent while it resolves, they play the card
// you chose from their hand if able, and you control them again while the spell they cast that way resolves.
import type { Effect } from "../abilities";
import { planCast } from "../autopay";
import { defOf, isType } from "../cards";
import { asFace, castableFaces, landFaces, registerFace } from "../faces";
import { altCost, altCostsFor, canPlayLandNow, castProblem, landUntappedOffer, log, nameOf, playLandByEffect, player } from "../game";
import type { CostChoices, GameState, ObjectId, PlayerId } from "../types";
import type { ResolveCtx } from "./resolve";
import { players } from "./resolve";

/**
 * The player controlling `pid` because of what's resolving now (GameState.resolveControls), the last such effect created
 * (CR 723.1a), with when it was created; undefined if none. A player who left the game controls no one (CR 800.4a).
 */
export function resolveControlOf(s: GameState, pid: PlayerId): { controller: PlayerId; created: number } | undefined {
  const id = s.resolving?.item.id;
  if (!id || !s.resolveControls) return undefined;
  let best: { controller: PlayerId; created: number } | undefined;
  for (const c of s.resolveControls) if (c.item === id && c.controlled === pid && c.controller !== pid && !player(s, c.controller).lost && (!best || c.created > best.created)) best = c;
  return best;
}

/** The control effects of stack items that are gone (resolved, countered, or left the stack) end (CR 723.2). */
export function endResolveControls(s: GameState, finished?: string): void {
  if (!s.resolveControls) return;
  const live = (item: string) => item !== finished && (s.stack.some((x) => x.id === item) || s.resolving?.item.id === item);
  s.resolveControls = s.resolveControls.filter((c) => live(c.item));
  if (!s.resolveControls.length) s.resolveControls = undefined;
}

/**
 * The ways `pid` could cast this card from their hand now (CR 601.2b): as it is, as one of its other nonland faces or a
 * split card's half (CR 709.3, 712.11b, 715.3), prototyped (CR 718.3), or for any alternative cost they could pay
 * (rulings: "If there is a non-mana way to cast a spell, as with Pitch Spells, you may require that way").
 */
function commandWays(s: GameState, pid: PlayerId, id: ObjectId): CostChoices[] {
  const o = s.objects[id]!;
  const d = defOf(s, o);
  const faces = castableFaces(s, o).filter((f) => !isType(s.cards[registerFace(s, o, f)]!, "Land"));
  const alts = altCostsFor(s, pid, o).map((a) => a.kind);
  return [{}, ...faces.map((face) => ({ face })), ...(altCost(d, "prototype") ? [{ alt: "prototype" as const }] : []), ...alts.filter((a) => a !== "prototype").map((alt) => ({ alt }))];
}

/**
 * A way `pid` can cast the card they're made to cast now (castFree `how` "commanded"), its mana from what their pool
 * holds and mana abilities of lands they control (CR 723.7; manaabilities.ts commandedProblem), or undefined. Asked with
 * that decision pending, so the restriction applies; set for the question if it isn't.
 */
export function commandWay(s: GameState, pid: PlayerId, id: ObjectId): CostChoices | undefined {
  const prev = s.pending;
  const asked = prev?.kind === "castFree" && prev.how === "commanded" && prev.player === pid && prev.objectId === id;
  if (!asked) s.pending = { kind: "castFree", player: pid, objectId: id, source: "Word of Command", how: "commanded", must: true };
  try {
    const o = s.objects[id];
    if (!o || o.zone !== "hand" || o.owner !== pid) return undefined;
    return commandWays(s, pid, id).find((way) => {
      const problem = castProblem(s, pid, id, undefined, undefined, undefined, undefined, undefined, way);
      return problem === null || (/^not enough mana/.test(problem) && planCast(s, pid, id, undefined, undefined, "auto", undefined, way) !== null);
    });
  } finally {
    if (!asked) s.pending = prev;
  }
}

/** Whether `pid` can cast that card that way now (commandWay): "plays that card if able" (rulings: you must, if you can). */
export const commandCastable = (s: GameState, pid: PlayerId, id: ObjectId): boolean => commandWay(s, pid, id) !== undefined;

/**
 * How `pid` can play the card as a land now (CR 305.2, 305.3: only on their turn with a land play left, timing otherwise
 * ignored, 608.2g): "land" for a land card, "land:N" for a land face of a modal double-faced card (CR 712.12).
 */
function landPlays(s: GameState, pid: PlayerId, id: ObjectId): string[] {
  const o = s.objects[id]!;
  const out: string[] = [];
  if (isType(defOf(s, o), "Land") && canPlayLandNow(s, pid, id)) out.push("land");
  for (const f of landFaces(s, o)) if (f !== (o.face ?? 0) && asFace(s, o, f, () => canPlayLandNow(s, pid, id))) out.push(`land:${f}`);
  return out;
}

const landFace = (play: string): number | undefined => (play === "land" ? undefined : Number(play.slice(5)));

/** The play options' labels (chooseOption "commandPlay"). */
function playLabel(s: GameState, id: ObjectId, play: string): string {
  const o = s.objects[id]!;
  if (play === "cast") return `Cast ${defOf(s, o).name}`;
  const f = landFace(play);
  return `Play ${f === undefined ? defOf(s, o).name : s.cards[registerFace(s, o, f)]!.name} as a land`;
}

/**
 * Word of Command: "Look at target opponent's hand and choose a card from it. You control that player until ~ finishes
 * resolving. The player plays that card if able. While doing so, the player can activate mana abilities only if they're
 * from lands that player controls and only if mana they produce is spent to activate other mana abilities of lands the
 * player controls and/or to play that card. If the chosen card is cast as a spell, you control the player while that spell
 * is resolving."
 *
 * You look at the hand (not revealed: only you see it) and choose a card (chooseOption "commandCard"). You then control the
 * player (GameState.resolveControls, CR 723.2, 723.5): you make every choice they'd make while this resolves, using their
 * resources (723.5a). They play the card if able (rulings: "You must order your opponent to play the chosen card if it is
 * possible to do so"): a land only on their turn with a land play left (CR 305.2, 305.3; the ruling's "if they have not
 * already done so this turn"), a spell as they could cast it with priority, its timing ignored (CR 608.2g), its costs paid
 * (rulings: an alternative cost may be chosen), with only their lands' mana abilities activated, whose mana can be spent
 * only on that card or on their lands' mana abilities (castFree `how` "commanded"; manaabilities.ts commandedProblem, spend.ts
 * commandSpend). Mana already in their pool isn't restricted: the text restricts only which mana abilities are activated.
 * A card that can be played both ways is played the way you choose (chooseOption "commandPlay"). If it's cast, you control
 * the player again while that spell resolves (a new control effect on that stack item, created now, CR 723.1a).
 */
export function runWordOfCommandEffect(s: GameState, e: Extract<Effect, { type: "wordOfCommand" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const you = player(s, ctx.controller);
  if (!sc.command) {
    const opp = players(s, e.who, ctx)[0];
    if (opp === undefined || player(s, opp).lost) return;
    const them = player(s, opp);
    log(s, `${you.name} looks at ${them.name}'s hand (${src}).`);
    if (them.hand.length) log(s, `${them.name}'s hand: ${them.hand.map((id) => nameOf(s, id)).join(", ")}.`, you.id);
    if (!them.hand.length) {
      sc.command = { opp, card: "none", step: "done" };
      log(s, `${them.name} has no cards in hand.`);
      takeControl(s, you.id, opp, r.item.id, src);
      return;
    }
    sc.command = { opp, card: "" };
    s.pending = {
      kind: "chooseOption",
      player: you.id,
      source: src,
      what: "commandCard",
      options: [...them.hand],
      labels: them.hand.map((id) => nameOf(s, id)),
      prompt: `choose a card from ${them.name}'s hand: you control ${them.name} while ${src} resolves, and they play it if able`,
      secret: true,
    };
    return "paused";
  }
  const st = sc.command;
  if (st.step === "done" || st.card === "" || st.card === "none") return;
  const opp = st.opp;
  const them = player(s, opp);
  const id = st.card;
  // Cast or not (a decline is allowed only while it can't be cast): you control them while that spell resolves.
  if (st.step === "cast") return castDone(s, you.id, opp, id, r.item.id, src);
  const o = s.objects[id];
  if (!o || o.zone !== "hand" || o.owner !== opp || them.lost) {
    st.step = "done";
    return;
  }
  if (st.play === undefined) {
    if (!(s.resolveControls ?? []).some((c) => c.item === r.item.id)) takeControl(s, you.id, opp, r.item.id, src);
    const plays = [...landPlays(s, opp, id), ...(commandCastable(s, opp, id) ? ["cast"] : [])];
    if (!plays.length) {
      st.step = "done";
      log(s, `${them.name} can't play the chosen card (${src}).`);
      log(s, `${defOf(s, o).name} can't be played now.`, you.id);
      log(s, `${defOf(s, o).name} can't be played now.`, opp);
      return;
    }
    if (plays.length > 1) {
      st.play = "";
      s.pending = { kind: "chooseOption", player: opp, source: src, what: "commandPlay", options: plays, labels: plays.map((p) => playLabel(s, id, p)), prompt: `${them.name} plays ${defOf(s, o).name} (${src}): how?` };
      return "paused";
    }
    st.play = plays[0]!;
  }
  if (st.play === "") return; // still asked
  if (st.play !== "cast") {
    const face = landFace(st.play);
    if (st.step !== "untapped") {
      // A land with "enters tapped unless you pay 2 life" and the like: chosen as it enters (CR 614.12), by you (CR 723.5).
      const offer = asFace(s, o, face, () => landUntappedOffer(s, opp, id));
      if (offer) {
        st.step = "untapped";
        delete sc.may;
        s.pending = { kind: "chooseMay", player: opp, prompt: offer, source: src, card: id };
        return "paused";
      }
    }
    const untapped = st.step === "untapped" && !!sc.may;
    delete sc.may;
    st.step = "done";
    if (!asFace(s, o, face, () => canPlayLandNow(s, opp, id))) return;
    log(s, `${them.name} plays ${playLabel(s, id, st.play).replace(/^Play /, "")} (${src}).`);
    playLandByEffect(s, opp, id, untapped, face);
    return;
  }
  st.step = "cast";
  log(s, `${them.name} casts ${defOf(s, o).name} if able (${src}).`);
  s.pending = { kind: "castFree", player: opp, objectId: id, source: src, how: "commanded", must: true };
  return "paused";
}

/** Once the card was cast (or couldn't be): `you` control `opp` while that spell resolves (CR 723.2), a new control effect. */
function castDone(s: GameState, you: PlayerId, opp: PlayerId, id: ObjectId, word: string, src: string): void {
  s.resolving!.scratch!.command!.step = "done";
  const item = s.stack.find((x) => x.kind === "spell" && x.objectId === id);
  if (!item) return;
  const created = s.resolveControls?.find((c) => c.item === word)?.created ?? s.nextTimestamp++;
  (s.resolveControls ??= []).push({ controlled: opp, controller: you, item: item.id, created });
  log(s, `${player(s, you).name} will control ${player(s, opp).name} while ${item.description} resolves (${src}).`);
}

/** `controller` controls `controlled` while the stack item `item` is resolving (CR 723.2). */
function takeControl(s: GameState, controller: PlayerId, controlled: PlayerId, item: string, src: string): void {
  endResolveControls(s);
  (s.resolveControls ??= []).push({ controlled, controller, item, created: s.nextTimestamp++ });
  log(s, `${player(s, controller).name} controls ${player(s, controlled).name} until ${src} finishes resolving.`);
}

/**
 * A bot's card for Word of Command: the costliest spell the opponent can cast now (it uses up their lands' mana, cast the
 * way they'd cast it: bots make a controlled player's choices as that player would), else a card they can't play (nothing
 * happens), else any.
 */
export function commandCardFor(s: GameState, opp: PlayerId, options: string[]): string {
  const mv = (id: string) => defOf(s, s.objects[id]!).cmc ?? 0;
  const castable = options.filter((id) => !isType(defOf(s, s.objects[id]!), "Land") && commandCastable(s, opp, id)).sort((a, b) => mv(b) - mv(a));
  if (castable[0]) return castable[0];
  const idle = options.find((id) => !landPlays(s, opp, id).length);
  return idle ?? options[0]!;
}
