// Lane B round B135: Prairie Dog (a +1/+1 counter replacement until end of turn, CR 614.1a), Force Bubble (damage to you
// replaced by depletion counters), Kill-Suit Cultist (the next damage to a creature replaced by its destruction), Equal
// Treatment (any damage of 1 or more becomes 2 this turn), Void (a number chosen as it resolves), Bronze Horse (damage from
// spells that target it prevented), Sentinel and Sworn Defender (power and toughness set from a creature in combat with
// it, locked in as the ability resolves, CR 608.2h, 613.4b) and Kheru Lich Lord (a creature card returned at random,
// exiled at your next end step or if it would leave), Grave Consequences (each player exiles any number of cards from their
// graveyard, then loses life for those left).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const dog = card("Prairie Dog", "Creature — Squirrel", "{1}{W}", { power: "2", toughness: "2", keywords: ["Lifelink"], oracleText: "Lifelink\nAt the beginning of your end step, if you haven't cast a spell from your hand this turn, put a +1/+1 counter on this creature.\n{4}{W}: Until end of turn, if you would put one or more +1/+1 counters on a creature you control, put that many plus one +1/+1 counters on it instead." });
const bubble = card("Force Bubble", "Enchantment", "{2}{W}{W}", { oracleText: "If damage would be dealt to you, put that many depletion counters on this enchantment instead.\nWhen there are four or more depletion counters on this enchantment, sacrifice it.\nAt the beginning of each end step, remove all depletion counters from this enchantment." });
const cultist = card("Kill-Suit Cultist", "Creature — Goblin Berserker", "{R}", { power: "1", toughness: "1", oracleText: "This creature attacks each combat if able.\n{B}, Sacrifice this creature: The next time damage would be dealt to target creature this turn, destroy that creature instead." });
const equal = card("Equal Treatment", "Instant", "{1}{W}", { oracleText: "If any source would deal 1 or more damage to a permanent or player this turn, it deals 2 damage to that permanent or player instead.\nDraw a card." });
const voidCard = card("Void", "Sorcery", "{3}{B}{R}", { oracleText: "Choose a number. Destroy all artifacts and creatures with mana value equal to that number. Then target player reveals their hand and discards all nonland cards with mana value equal to the number." });
const horse = card("Bronze Horse", "Artifact Creature — Horse", "{7}", { power: "4", toughness: "4", keywords: ["Trample"], oracleText: "Trample\nAs long as you control another creature, prevent all damage that would be dealt to this creature by spells that target it." });
const sentinel = card("Sentinel", "Artifact Creature — Shapeshifter", "{4}", { power: "1", toughness: "1", oracleText: "{0}: This creature's base toughness becomes equal to 1 plus the power of target creature blocking or blocked by this creature. (This effect lasts indefinitely.)" });
const defender = card("Sworn Defender", "Creature — Human Knight", "{2}{W}{W}", { power: "1", toughness: "3", oracleText: "{1}: This creature's power becomes the toughness of target creature blocking or being blocked by this creature minus 1 until end of turn, and its toughness becomes 1 plus the power of that creature until end of turn." });
const consequences = card("Grave Consequences", "Instant", "{1}{B}", { oracleText: "Each player may exile any number of cards from their graveyard. Then each player loses 1 life for each card in their graveyard.\nDraw a card." });
const kheru = card("Kheru Lich Lord", "Creature — Zombie Wizard", "{3}{B}{G}{U}", { power: "4", toughness: "4", oracleText: "At the beginning of your upkeep, you may pay {2}{B}. If you do, return a creature card at random from your graveyard to the battlefield. It gains flying, trample, and haste. Exile that card at the beginning of your next end step. If it would leave the battlefield, exile it instead of putting it anywhere else." });

// Helpers' cards.
const bolt = card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." });
const ping = card("Test Ping", "Instant", "{R}", { oracleText: "Test Ping deals 1 damage to any target." });
const quake = card("Test Quake", "Sorcery", "{R}", { oracleText: "Test Quake deals 2 damage to each creature." });
const growth = card("Test Growth", "Instant", "{G}", { oracleText: "Put two +1/+1 counters on target creature." });
const ogre = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const golem = card("Test Golem", "Artifact Creature — Golem", "{2}", { power: "2", toughness: "2" });
const shield = card("Test Shield", "Artifact", "{3}");
const stout = card("Darksteel Myr", "Artifact Creature — Myr", "{3}", { power: "0", toughness: "1", keywords: ["Indestructible"], oracleText: "Indestructible" });
const counterBeast = card("Test Counter Beast", "Creature — Beast", "{2}{G}", { power: "0", toughness: "0", oracleText: "This creature enters with two +1/+1 counters on it." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const pl = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const castIt = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = []) => settle(run(s, planCast(s, pid, id, targets)));
const activateIt = (s: GameState, pid: PlayerId, id: string, i: number, targets: TargetChoice[] = []) => settle(run(s, planActivate(s, pid, id, i, targets)));
/** A copy of `def` put into `pid`'s hand. */
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** A copy of `def` put straight into `pid`'s graveyard. */
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;

/** `attacker` of the active player attacks `defender`'s player, blocked by `blocker`; returns at the declare blockers step with the active player to act. */
function combat(s0: GameState, ap: PlayerId, opp: PlayerId, attacker: string, blocker: string): GameState {
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
  for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: s.pending.player === opp ? [{ blocker, attacker }] : [] });
  expect(s.step).toBe("declareBlockers");
  for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("Prairie Dog: +1/+1 counters plus one until end of turn (CR 614.1a)", () => {
  it("parses", () => supported(dog));

  it("counters you put on a creature you control: one more for each resolution, this turn only", () => {
    const { s: s0, ap, ids, opp } = setup([growth, growth, growth]);
    const d = putOnBattlefield(s0, ap, dog);
    const mine = putOnBattlefield(s0, ap, ogre);
    const theirs = putOnBattlefield(s0, opp, ogre);
    let s = activateIt(s0, ap, d, 0);
    s = castIt(s, ap, ids[0]!, [tgt(mine)]);
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(3);
    // Not on a creature an opponent controls.
    s = castIt(s, ap, ids[1]!, [tgt(theirs)]);
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(2);
    // Twice: two more (rulings).
    s = activateIt(s, ap, d, 0);
    s = castIt(s, ap, ids[2]!, [tgt(d)]);
    expect(s.objects[d]!.counters["+1/+1"]).toBe(4);
  });

  it("a creature you control entering with counters gets one more; counters an opponent puts don't", () => {
    const { s: s0, ap, ids, opp } = setup([counterBeast]);
    const d = putOnBattlefield(s0, ap, dog);
    const mine = putOnBattlefield(s0, ap, ogre);
    let s = activateIt(s0, ap, d, 0);
    s = castIt(s, ap, ids[0]!);
    const beast = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Test Counter Beast")!;
    expect(s.objects[beast]!.counters["+1/+1"]).toBe(3);
    // The opponent puts them: it's "if you would put" (rulings).
    const g = toHand(s, opp, growth);
    s.players[opp]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 1, C: 0 };
    s = act(s, { type: "passPriority", player: ap });
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = castIt(s, opp, g, [tgt(mine)]);
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(2);
  });

  it("gone the next turn", () => {
    const { s: s0, ap, ids } = setup([growth]);
    const d = putOnBattlefield(s0, ap, dog);
    const mine = putOnBattlefield(s0, ap, ogre);
    let s = activateIt(s0, ap, d, 0);
    s.players[ap]!.hand = [ids[0]!];
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "main1", next);
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const g = s.players[ap]!.hand[0]!;
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 1, C: 0 };
    s = castIt(s, ap, g, [tgt(mine)]);
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(2);
  });
});

describe("Force Bubble: damage to you replaced by depletion counters", () => {
  it("parses", () => supported(bubble));

  it("no life lost; four counters and it's sacrificed; the end step takes them off", () => {
    const { s: s0, ap, ids, opp } = setup([bolt, ping]);
    const fb = putOnBattlefield(s0, opp, bubble);
    let s = castIt(s0, ap, ids[0]!, [pl(opp)]);
    expect(s.players[opp]!.life).toBe(40);
    expect(s.objects[fb]!.counters.depletion).toBe(3);
    expect(s.objects[fb]!.zone).toBe("battlefield");
    s = castIt(s, ap, ids[1]!, [pl(opp)]);
    expect(s.players[opp]!.life).toBe(40);
    expect(s.objects[fb]!.zone).toBe("graveyard");
  });

  it("the counters come off at the beginning of each end step", () => {
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const fb = putOnBattlefield(s0, opp, bubble);
    let s = castIt(s0, ap, ids[0]!, [pl(opp)]);
    expect(s.objects[fb]!.counters.depletion).toBe(3);
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.objects[fb]!.counters.depletion ?? 0).toBe(0);
  });
});

describe("Kill-Suit Cultist: the next damage to the creature destroys it instead", () => {
  it("parses", () => supported(cultist));

  it("destroyed instead of dealt the damage; another creature's damage doesn't use it", () => {
    const { s: s0, ap, ids, opp } = setup([ping, ping]);
    const k = putOnBattlefield(s0, ap, cultist);
    const big = putOnBattlefield(s0, opp, ogre);
    const other = putOnBattlefield(s0, opp, card("Stone Giant", "Creature — Giant", "{2}{R}{R}", { power: "3", toughness: "4" }));
    let s = activateIt(s0, ap, k, 0, [tgt(big)]);
    expect(s.objects[k]!.zone).toBe("graveyard");
    s = castIt(s, ap, ids[0]!, [tgt(other)]);
    expect(s.objects[other]!.damage).toBe(1);
    expect(s.objects[big]!.zone).toBe("battlefield");
    s = castIt(s, ap, ids[1]!, [tgt(big)]);
    expect(s.objects[big]!.zone).toBe("graveyard");
    expect(s.objects[big]!.damage ?? 0).toBe(0);
  });

  it("an indestructible creature isn't destroyed, isn't dealt the damage, and the replacement is used up", () => {
    const { s: s0, ap, ids, opp } = setup([ping, ping]);
    const k = putOnBattlefield(s0, ap, cultist);
    const myr = putOnBattlefield(s0, opp, stout);
    let s = activateIt(s0, ap, k, 0, [tgt(myr)]);
    s = castIt(s, ap, ids[0]!, [tgt(myr)]);
    expect(s.objects[myr]!.zone).toBe("battlefield");
    expect(s.objects[myr]!.damage ?? 0).toBe(0);
    s = castIt(s, ap, ids[1]!, [tgt(myr)]);
    expect(s.objects[myr]!.damage).toBe(1);
  });
});

describe("Equal Treatment: damage of 1 or more is 2 this turn", () => {
  it("parses", () => supported(equal));

  it("3 becomes 2, 1 becomes 2, and it draws a card", () => {
    const { s: s0, ap, ids, opp } = setup([equal, bolt, ping]);
    const big = putOnBattlefield(s0, opp, ogre);
    const hand = s0.players[ap]!.hand.length;
    let s = castIt(s0, ap, ids[0]!);
    expect(s.players[ap]!.hand.length).toBe(hand); // cast one, drew one
    s = castIt(s, ap, ids[1]!, [pl(opp)]);
    expect(s.players[opp]!.life).toBe(38);
    s = castIt(s, ap, ids[2]!, [tgt(big)]);
    expect(s.objects[big]!.damage).toBe(2);
  });
});

describe("Void: a number chosen as it resolves", () => {
  it("parses", () => supported(voidCard));

  it("artifacts and creatures with that mana value destroyed, then that player's nonland cards with it discarded", () => {
    const { s: s0, ap, ids, opp } = setup([voidCard]);
    const two = putOnBattlefield(s0, opp, bear());
    const twoArt = putOnBattlefield(s0, ap, golem);
    const three = putOnBattlefield(s0, opp, shield);
    const four = putOnBattlefield(s0, opp, ogre);
    s0.players[opp]!.hand = [];
    const h2 = toHand(s0, opp, bear());
    const h4 = toHand(s0, opp, ogre);
    const land = toHand(s0, opp, card("Wastes", "Basic Land"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [pl(opp)])), { me: [ap] });
    expect(s.pending?.kind).toBe("chooseOption");
    if (s.pending?.kind !== "chooseOption") return;
    expect(s.pending.numberRange).toEqual({ min: 0, max: 20 });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "2" }));
    expect(s.objects[two]!.zone).toBe("graveyard");
    expect(s.objects[twoArt]!.zone).toBe("graveyard");
    expect(s.objects[three]!.zone).toBe("battlefield");
    expect(s.objects[four]!.zone).toBe("battlefield");
    expect(s.objects[h2]!.zone).toBe("graveyard");
    expect(s.objects[h4]!.zone).toBe("hand");
    expect(s.objects[land]!.zone).toBe("hand");
  });

  it("0: a land in hand isn't discarded (nonland cards only)", () => {
    const { s: s0, ap, ids, opp } = setup([voidCard]);
    s0.players[opp]!.hand = [];
    const land = toHand(s0, opp, card("Wastes", "Basic Land"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [pl(opp)])), { me: [ap] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }));
    expect(s.objects[land]!.zone).toBe("hand");
  });
});

describe("Bronze Horse: damage from spells that target it prevented while you control another creature", () => {
  it("parses", () => supported(horse));

  it("a targeting spell's damage is prevented, a spell that doesn't target it isn't", () => {
    const { s: s0, ap, ids, opp } = setup([bolt, quake]);
    const h = putOnBattlefield(s0, opp, horse);
    putOnBattlefield(s0, opp, ogre);
    let s = castIt(s0, ap, ids[0]!, [tgt(h)]);
    expect(s.objects[h]!.damage ?? 0).toBe(0);
    s = castIt(s, ap, ids[1]!);
    expect(s.objects[h]!.damage).toBe(2);
  });

  it("alone, it's dealt the damage", () => {
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const h = putOnBattlefield(s0, opp, horse);
    const s = castIt(s0, ap, ids[0]!, [tgt(h)]);
    expect(s.objects[h]!.damage).toBe(3);
  });
});

describe("Sentinel and Sworn Defender: set from a creature in combat with it (CR 608.2h, 613.4b)", () => {
  it("parses", () => supported(sentinel, defender));

  it("Sentinel: base toughness 1 plus the blocker's power, kept after combat, counters still apply", () => {
    const { s: s0, ap, opp } = setup([]);
    const sen = putOnBattlefield(s0, ap, sentinel);
    const blocker = putOnBattlefield(s0, opp, ogre);
    let s = combat(s0, ap, opp, sen, blocker);
    s = activateIt(s, ap, sen, 0, [tgt(blocker)]);
    expect(pt(s, sen)).toBe("1/4");
    // Locked in: the blocker getting bigger later changes nothing.
    s.objects[blocker]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s);
    expect(pt(s, sen)).toBe("1/4");
    s.objects[blocker]!.counters = {};
    s.objects[sen]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    expect(pt(s, sen)).toBe("2/5");
    // Indefinitely: still so on the next turn.
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(pt(s, sen)).toBe("2/5");
  });

  it("Sentinel: no target out of combat", () => {
    const { s, ap, opp } = setup([]);
    const sen = putOnBattlefield(s, ap, sentinel);
    const other = putOnBattlefield(s, opp, ogre);
    expect(planActivate(s, ap, sen, 0, [tgt(other)])).toBeNull();
  });

  it("Sworn Defender: power the toughness minus 1 and toughness 1 plus the power, until end of turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const sw = putOnBattlefield(s0, ap, defender);
    const blocker = putOnBattlefield(s0, opp, card("Stone Giant", "Creature — Giant", "{2}{R}{R}", { power: "3", toughness: "4" }));
    let s = combat(s0, ap, opp, sw, blocker);
    s = activateIt(s, ap, sw, 0, [tgt(blocker)]);
    expect(pt(s, sw)).toBe("3/4");
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(s.objects[sw]!.zone).toBe("battlefield");
    expect(pt(s, sw)).toBe("1/3");
  });
});

describe("Kheru Lich Lord: a creature card at random from your graveyard", () => {
  it("parses", () => supported(kheru));

  /** At `ap`'s next upkeep with Kheru's trigger asking, {2}{B} in the pool. */
  const toKheru = (s0: GameState, ap: PlayerId) => {
    let s = passUntil(s0, "upkeep", ap, 4000);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  };

  it("paid: it returns with flying, trample and haste, and is exiled at your end step", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, kheru);
    s0.players[ap]!.graveyard = [];
    const g = toYard(s0, ap, ogre);
    s0.players[ap]!.hand = [];
    // Round the table to ap's next upkeep.
    let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4], 4000);
    s = toKheru(s, ap);
    expect(s.pending?.kind).toBe("chooseMay");
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 1, R: 0, G: 0, C: 2 };
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
    expect(s.objects[g]!.zone).toBe("battlefield");
    const c = s.objects[g]!;
    expect(characteristics(s, c).keywords).toEqual(expect.arrayContaining(["Flying", "Trample", "Haste"]));
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.objects[g]!.zone).toBe("exile");
  });

  it("if it would leave the battlefield, it's exiled instead", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, kheru);
    s0.players[ap]!.graveyard = [];
    const g = toYard(s0, ap, ogre);
    s0.players[ap]!.hand = [];
    let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4], 4000);
    s = toKheru(s, ap);
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 1, R: 0, G: 0, C: 2 };
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
    expect(s.objects[g]!.zone).toBe("battlefield");
    s = passUntil(s, "main1", ap);
    const b = toHand(s, ap, bolt);
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 };
    s = castIt(s, ap, b, [tgt(g)]);
    expect(s.objects[g]!.zone).toBe("exile");
    expect(s.players[opp]!.graveyard).not.toContain(g);
  });

  it("not paid: nothing returns", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, kheru);
    s0.players[ap]!.graveyard = [];
    const g = toYard(s0, ap, ogre);
    s0.players[ap]!.hand = [];
    let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4], 4000);
    s = toKheru(s, ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), { me: [ap] });
    expect(s.objects[g]!.zone).toBe("graveyard");
  });
});

describe("Grave Consequences: each player may exile any number of cards from their graveyard", () => {
  it("parses", () => supported(consequences));

  it("you choose yours, the bots theirs; each loses 1 life for each card left, then you draw", () => {
    const { s: s0, ap, ids, opp } = setup([consequences]);
    for (const p of s0.players) p.graveyard = [];
    const mine = [toYard(s0, ap, ogre), toYard(s0, ap, bolt), toYard(s0, ap, ping)];
    const theirs = [toYard(s0, opp, ogre), toYard(s0, opp, ogre)];
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: [ap] });
    const p = s.pending;
    expect(p?.kind).toBe("searchLibrary");
    if (p?.kind !== "searchLibrary") return;
    expect(p.player).toBe(ap);
    expect([p.min, p.max]).toEqual([0, 3]);
    expect(p.what).toBe("any number of cards");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [mine[0]!, mine[1]!] }), { me: [ap] });
    expect(mine.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "graveyard"]);
    expect(s.players[ap]!.life).toBe(39);
    // A bot at 40 life with nothing it can use there exiles it all.
    expect(theirs.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
    expect(s.players[opp]!.life).toBe(40);
    expect(s.players[ap]!.hand.length).toBe(hand); // cast one, drew one
  });
});
