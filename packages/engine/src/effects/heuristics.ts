import { allEffects, refCovers } from "../abilities";
import type { AbilityBody, Amount, Modification } from "../abilities";
import { lethalLeft } from "../cards";
import { halve } from "../amounts";
import { compileGranted } from "../oracle";
import type { GameObject, GameState, ObjectId } from "../types";
import { harmfulCounter } from "./run-permanents";
import { controllerOf, staticConditionNow } from "../layers";

/**
 * Would this untargeted ability do nothing right now? "{1}: Untap ~" on an untapped
 * permanent is still legal to activate (only the {Q} cost needs it tapped, CR 107.6), but
 * bots shouldn't waste mana on it and the UI says so.
 */
export function doesNothingNow(s: GameState, sourceId: ObjectId, body: AbilityBody): boolean {
  const o = s.objects[sourceId];
  if (body.inert) return true;
  if (!o || body.modal || body.targets.length || !body.effects.length) return false;
  return body.effects.every(
    (e) =>
      ((e.type === "untap" || e.type === "tap") && e.what.ref === "self" && o.tapped === (e.type === "tap")) ||
      (e.type === "adapt" && (o.counters["+1/+1"] ?? 0) > 0 && o.adaptFresh !== s.turn) ||
      (e.type === "monstrosity" && !!o.monstrous) ||
      // "If ~ is a Warrior, ..." while it isn't one (Figure of Destiny).
      (e.type === "if" && !e.otherwise?.length && e.cond.kind === "state" && e.cond.cond.kind === "selfIs" && !staticConditionNow(s, e.cond.cond, o.id, controllerOf(s, o))) ||
      // Supper for Spiders (round B268): no creature card went to an opponent's graveyard from the battlefield this turn.
      (e.type === "returnAllFromGraveyard" && !e.toHand && e.who.ref === "eachOpponent" && !!e.filter.fromBattlefieldThisTurn && e.filter.types?.length === 1 && e.filter.types[0] === "Creature" &&
        !s.turnOrder.some((pid) => pid !== o.owner && !s.players[pid]!.lost && s.players[pid]!.graveyard.some((id) => s.objects[id]?.fromBattlefieldTurn === s.turn && (s.cards[s.objects[id]!.cardId]?.types ?? []).includes("Creature")))),
  );
}

/** Which targets of a body are aimed at something bad for the target (damage, removal, shrink)? Used by bots and the UI. */
export function harmfulTargets(body: AbilityBody): boolean[] {
  const harm = body.targets.map(() => false);
  const mark = (i: number, n = 1) => {
    for (let j = i; j < i + n; j++) harm[j] = true;
  };
  // A punisher's effects (Scarwood Bandits: "Unless an opponent pays {2}, gain control of target artifact") are what
  // happens to the target if no one pays.
  const all = allEffects(body.effects).flatMap((e) => (e.type === "punisher" ? [e, ...allEffects(e.effects)] : [e]));
  for (const e of all) {
    if (e.type === "damage" && "index" in e.to) mark(e.to.index, "n" in e.to ? e.to.n : 1);
    // Returning a card from a graveyard to its owner's hand helps its owner.
    if (e.type === "bounce" && e.what.ref === "target" && body.targets[e.what.index]?.kind === "card") continue;
    // A card in exile put into a graveyard or library (Pull from Eternity, Riftsweeper, Blade of the Swarm): taken from an
    // opponent, a suspended, plotted or adventuring card they'd have cast.
    if ((e.type === "putInGraveyard" || e.type === "putInLibrary" || e.type === "shuffleIntoLibrary") && e.what.ref === "target" && body.targets[e.what.index]?.inExile) mark(e.what.index);
    // A permanent put into its owner's library (Excommunicate, Chaos Warp, Proteus Staff): removal, for an opponent's (not
    // one that can only be yours, Tel-Jilad Stylus).
    if ((e.type === "putInLibrary" || e.type === "shuffleIntoLibrary") && e.what.ref === "target" && body.targets[e.what.index]?.kind === "object" && !body.targets[e.what.index]!.controller && !body.targets[e.what.index]!.owner) mark(e.what.index, e.what.n);
    // Phasing out removes a permanent until its controller's next turn: used against opponents' things.
    // Quarum Trench Gnomes: a Plains that makes colorless mana instead of white is worse for its controller.
    // "Target unblocked attacking creature becomes blocked" (Curtain of Light): against an opponent's attacker.
    // Disorienting Choice ("controllersMayExile"): their permanent exiled, or lands for us.
    // Altaïr Ibn-La'Ahad (round 444): a card from your own graveyard exiled with a counter on it, for your later use.
    if (e.type === "exile" && e.counters && e.what.ref === "target" && body.targets[e.what.index]?.kind === "card" && body.targets[e.what.index]!.owner === "you") continue;
    if (["destroy", "destroyRandomTarget", "exile", "bounce", "tap", "tapOrUntap", "skipUntap", "phaseOut", "replaceLandMana", "turnFaceDown", "becomeBlocked", "controllersMayExile"].includes(e.type) && "what" in e && e.what?.ref === "target") mark(e.what.index, e.what.n);
    // Identity Thief: "exile another target nontoken creature. If you do, ~ becomes a copy of that creature until end of
    // turn" (the card back at the next end step): an opponent's creature out of the way for the turn, and copied.
    if (e.type === "flicker" && e.at && e.what.ref === "target" && all.some((x) => x.type === "becomeCopy" && x.of.ref === "target" && x.of.index === (e.what as { index: number }).index)) mark(e.what.index, e.what.n);
    // "Destroy target blocking creature at end of combat" (Silent Assassin): later, but aimed at an opponent's creature.
    if (e.type === "delayed" && e.when === "endOfCombat" && e.of?.ref === "target" && e.effects.length === 1 && e.effects[0]!.type === "destroy") mark(e.of.index, e.of.n);
    // A suspected creature can't block (CR 701.60c): aimed at opponents unless the card says "you control".
    if (e.type === "suspect" && !e.no && e.what.ref === "target") mark(e.what.index, e.what.n);
    // "Target creature becomes unprepared" (Biblioplex Tomekeeper, CR 722.3b): its prepare spell's copy is gone.
    if (e.type === "becomePrepared" && e.un && e.what.ref === "target") mark(e.what.index, e.what.n);
    if (e.type === "counters" && harmfulCounter(e.counter) && e.what.ref === "target") mark(e.what.index, e.what.n);
    // Cloak and Dagger, Entwined (round 420): the target opponent's card or the chosen creature, exiled.
    if (e.type === "exileFromHandOrTarget") {
      mark(e.player);
      mark(e.creature);
    }
    // Kill-Suit Cultist: "the next time damage would be dealt to target creature this turn, destroy that creature instead".
    if (e.type === "damageMod" && e.toTarget !== undefined && e.mod.op === "destroy") mark(e.toTarget);
    // "Move a counter from target creature an opponent controls onto target creature you control" (Rikku): taken from them.
    if (e.type === "moveCounter" && e.from.ref === "target" && (e.counter === "any" || !harmfulCounter(e.counter))) mark(e.from.index);
    if (e.type === "continuous" && e.what.ref === "target" && modsAreHarmful(e.mods)) mark(e.what.index, e.what.n);
    // "Target player gains control of target permanent you control" (Donate): given to an opponent, a permanent that does
    // its new controller harm (bots don't look for one: with only their own permanents to choose from, they don't cast it).
    // Domineering Will: control "until end of turn" of creatures taken from their controllers, given to a player chosen to
    // gain them (the bot itself), so only the creatures are aimed at opponents.
    if (e.type === "continuous" && e.giveTo?.ref === "target") {
      if (e.duration !== "endOfTurn") mark(e.giveTo.index);
      if (e.what.ref === "target") mark(e.what.index, e.what.n);
    }
    // Fateful Handoff: "... target artifact or creature you control. An opponent gains control of that permanent": given
    // away like Donate's, so bots don't cast it on their own creatures. (Discerning Financier's Treasure is worth giving.)
    if (e.type === "continuous" && e.giveTo?.ref === "chosenPlayer" && e.what.ref === "target" && e.mods.some((m) => m.kind === "control") && body.targets[e.what.index]?.types?.includes("Creature")) mark(e.what.index, e.what.n);
    // "Destroy all creatures target player controls": aimed at an opponent, like the permanents themselves would be.
    const group = "what" in e && e.what && typeof e.what === "object" && "ref" in e.what ? e.what : e.type === "damage" ? e.to : undefined;
    if (group?.ref === "each" && group.of?.ref === "target") {
      const hurts = ["destroy", "exile", "bounce", "tap", "skipUntap", "phaseOut", "damage", "putInLibrary", "toCommandZone"].includes(e.type) || (e.type === "counters" && harmfulCounter(e.counter)) || (e.type === "continuous" && modsAreHarmful(e.mods));
      if (hurts) mark(group.of.index, group.of.n);
    }
    if ((e.type === "loseLife" || e.type === "mill" || e.type === "millUntil" || e.type === "exileTop" || e.type === "poison" || e.type === "getRad" || e.type === "exileGraveyard" || e.type === "cantCast" || e.type === "cantPlayLands" || e.type === "exileNamed" || e.type === "skip" || e.type === "noUntapNext" || e.type === "stealDrawsThisTurn") && e.who.ref === "target") mark(e.who.index, e.who.n);
    // "Exile the top X cards of target opponent's library. You may ... cast spells from among" (Gix): an opponent's cards.
    if (e.type === "castFromAmong" && e.who.ref === "target") mark(e.who.index);
    // "Put it onto the battlefield attached to target player" (Bitterheart Witch): a Curse, for an opponent.
    if (e.type === "search" && e.dest.attachToPlayer?.ref === "target") mark(e.dest.attachToPlayer.index);
    // "Put it onto the battlefield attached to target creature" (Arachnus Spinner, the only one): Arachnus Web, which stops
    // that creature attacking or blocking, for an opponent's creature.
    if (e.type === "search" && e.dest.attachTo?.ref === "target") mark(e.dest.attachTo.index, e.dest.attachTo.n);
    // An Aura token made attached to the target: The Rani's Mark of the Rani ("+2/+2 and is goaded") and Smoke Blessing (1
    // damage to the enchanted creature's controller as it dies) are for an opponent's creature; Estrid's Mask for our own.
    if (e.type === "createToken" && e.attachTo?.ref === "target" && e.token.subtypes.includes("Aura") && !e.token.subtypes.includes("Role") && auraTokenHarms(e.token.abilities ?? "")) mark(e.attachTo.index, e.attachTo.n);
    // Controlling a player's turn (CR 723): an opponent's, who then does what we like.
    if (e.type === "controlPlayer" && e.who.ref === "target") mark(e.who.index);
    // Word of Command (round 460): an opponent, made to play a card of ours choosing.
    if (e.type === "wordOfCommand" && e.who.ref === "target") mark(e.who.index);
    // Equipoise (round B222): the target player's permanents beyond ours phase out, so an opponent.
    if (e.type === "phaseOutExcess" && e.who.ref === "target") mark(e.who.index);
    if (e.type === "counterSpell") mark(e.index);
    // Vaevictis Asmadi, the Dire: each player's target is sacrificed (our own one the least useful).
    if (e.type === "sacrificeTargetsReveal" && e.what.ref === "target") mark(e.what.index, e.what.n);
    // Guff Rewrites History (round 411): each player's target is shuffled away (our own one the least useful).
    if (e.type === "guffRewrite" && e.what.ref === "target") mark(e.what.index, e.what.n);
    // Retribution, Cannibalize: one of the two is sacrificed, exiled or dealt damage: an opponent's creatures.
    if (e.type === "splitTargets") mark(0, e.options.length);
    // Exchanging control (Oko): the opponent's permanent taken, our least useful one given.
    if (e.type === "exchangeControl") for (const r of [e.a, e.b]) if (r.ref === "target") mark(r.index);
    // Taking a spell over: an opponent's.
    if (e.type === "controlSpell") mark(e.index);
    // Haunt: the card does something again when the haunted creature dies, which an opponent's creature does when
    // it's removed or blocked, without costing its owner anything.
    if (e.type === "haunt") mark(0);
    if ((e.type === "discard" || e.type === "takeFromHand" || (e.type === "lookAtHand" && e.reveal)) && e.who.ref === "target") mark(e.who.index, e.who.n);
    // "Target player sacrifices a creature" (Diabolic Edict), "target opponent chooses a creature they control. Destroy
    // that creature." (Imperial Edict), "unless target player pays {3}, that player loses 5 life" (Rhystic Syphon),
    // "target opponent puts a card from their hand on top of their library" (Chittering Rats), "look at the top two
    // cards of target player's library. Put one of them into their graveyard" (Wu Spy): aimed at an opponent.
    if (e.type === "pick" && e.who.ref === "target" && ["sacrifice", "exile", "bounce", "choose", "tap"].includes(e.action)) mark(e.who.index, e.who.n);
    if ((e.type === "punisher" || e.type === "handToTop") && e.who?.ref === "target") mark(e.who.index, e.who.n);
    if (e.type === "dig" && e.into === "graveyard" && e.library?.ref === "target") mark(e.library.index, e.library.n);
    if ((e.type === "fight" || e.type === "bite") && e.b.ref === "target") mark(e.b.index);
    // Removing all counters (loyalty, +1/+1) is aimed at others' permanents, unless it can only be your own.
    if ((e.type === "removeAllCounters" || e.type === "removeAnyCounters") && e.what.ref === "target" && body.targets[e.what.index]?.controller !== "you") mark(e.what.index, e.what.n);
  }
  // Target players whose permanents are counted ("X is the number of creatures those opponents control", Call the
  // Coppercoats): opponents, who have the most of them.
  const counted = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(counted);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const w = o.whose as { ref?: string; index?: number; n?: number } | undefined;
    if (o.kind === "permanents" && w?.ref === "target" && w.index !== undefined) mark(w.index, w.n);
    Object.values(o).forEach(counted);
  };
  counted(body.effects);
  // An Aura spell with "enchant player" is a Curse, aimed at an opponent.
  body.targets.forEach((t, i) => t.kind === "player" && / to enchant$/.test(t.text) && !t.helpsEnchanted && mark(i));
  body.targets.forEach((t, i) => t.harmsEnchanted && mark(i));
  return harm;
}

/** An Aura token's abilities do what it's attached to (or its controller) harm. */
function auraTokenHarms(text: string): boolean {
  const c = compileGranted(text);
  return c.statics.some((st) => st.affects.kind === "attached" && modsAreHarmful(st.mods)) || c.triggers.some((tr) => allEffects(tr.body.effects).some((e) => (e.type === "damage" && e.to.ref === "subjectController") || (e.type === "loseLife" && e.who.ref === "subjectController")));
}

/**
 * Would these changes be bad for the permanent's controller? Shrinking, losing abilities,
 * restrictions, or being stolen. Used by bots to aim Auras and effects.
 */
export function modsAreHarmful(mods: Modification[]): boolean {
  let pt = 0;
  for (const m of mods) {
    // "-X/-X" (Skullmane Baku) shrinks whatever X is: counted as 1, not 0.
    if (m.kind === "modifyPT") pt += estimate(m.power, 1) + estimate(m.toughness, 1);
    if (m.kind === "addAbility") pt -= grantCost(m.text);
    if (["control", "loseAllAbilities", "loseStatic", "removeKeywords", "cantAttack", "cantBlock", "doesntUntap", "setSubtypes", "setLandTypes", "goad", "cantActivate"].includes(m.kind)) return true;
    // A small base P/T hurts a creature, but not a land made into one (awaken's counters come with it).
    if (m.kind === "setPT" && estimate(m.power) + estimate(m.toughness) <= 2 && !mods.some((x) => x.kind === "addTypes" && x.types.includes("Creature"))) return true;
    // Vhati il-Dal: "base power 1 or base toughness 1".
    if ((m.kind === "setPower" && estimate(m.power) <= 1) || (m.kind === "setToughness" && estimate(m.toughness) <= 1)) return true;
    // "Is a colorless Forest land", "is an enchantment and loses all other card types": no longer a creature.
    if (m.kind === "setTypes" && !m.types.includes("Creature")) return true;
  }
  return pt < 0;
}

/**
 * How much a granted triggered ability hurts the permanent's controller, in power/toughness points: an
 * upkeep edict ('Enchanted creature has "At the beginning of your upkeep, sacrifice a creature."') or life
 * loss makes the Aura one to put on an opponent's creature.
 */
function grantCost(text: string): number {
  let n = 0;
  for (const t of compileGranted(text).triggers)
    for (const e of allEffects(t.body.effects)) {
      if (e.type === "sacrifice" || (e.type === "pick" && e.action !== "counters") || e.type === "cumulativeUpkeep") n += 10;
      else if (e.type === "loseLife" && e.who.ref === "you") n += 4;
      else if (e.type === "discard" && e.who.ref === "you") n += 4;
      else if ((e.type === "tap" && e.what.ref === "self") || (e.type === "counters" && harmfulCounter(e.counter) && e.what.ref === "self")) n += 4;
    }
  return n;
}

/** How much damage an effect body deals to target `i`, for picking what to kill. */
export function damageTo(body: AbilityBody, i: number, x = 0): number {
  let n = 0;
  for (const e of allEffects(body.effects)) if (e.type === "damage" && refCovers(e.to, i)) n += estimate(e.amount, x);
  return n;
}

export const lethalDamage = (s: GameState, o: GameObject) => lethalLeft(s, o);

/**
 * A rough value for an amount before the game works it out, for bots and previews: X as `x`,
 * a count as 2 of whatever it counts.
 */
export function estimate(a: Amount, x = 0): number {
  if (typeof a === "number") return a;
  const v = (a.count.kind === "x" ? x : 2) * (a.times ?? 1) + (a.plus ?? 0);
  const n = Math.max(0, a.half ? (a.third ? Math.ceil(v / 3) : halve(v, a.half)) : v);
  return a.negate ? -n : n;
}
