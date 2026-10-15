// Mana from a Treasure: mana whose source is a Treasure (CR 106.3, the source of an ability's mana is the ability's
// source), here a Treasure token sacrificed for mana (CR 111.10a). The mana pool remembers which mana a Treasure made
// until it's spent or empties (CR 106.4); a spell or an activated ability remembers how much of it paid its cost.
// "If mana from a Treasure was spent to cast it" is an intervening if on a trigger (CR 603.4). Security Rhox's
// alternative cost (CR 118.9) can only be paid with that mana.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const hexblade = card("Hired Hexblade", "Creature — Elf Warlock", "{1}{B}", { power: "2", toughness: "2", oracleText: "When this creature enters, if mana from a Treasure was spent to cast it, you draw a card and you lose 1 life." });
const sellSword = card("Jaded Sell-Sword", "Creature — Dragon Warrior", "{3}{R}", { power: "4", toughness: "3", oracleText: "When this creature enters, if mana from a Treasure was spent to cast it, it gains first strike and haste until end of turn." });
const marut = card("Marut", "Artifact Creature — Construct", "{8}", { power: "7", toughness: "7", keywords: ["Trample"], oracleText: "Trample\nWhen this creature enters, if mana from a Treasure was spent to cast it, create a Treasure token for each mana from a Treasure spent to cast it. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")" });
const smaug = card("Smaug, Wicked Worm", "Legendary Creature — Dragon", "{3}{B}{R}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\nWhen Smaug enters, create X tapped Treasure tokens, where X is the number of artifacts your opponents control.\nWhenever you cast a spell, if mana from a Treasure was spent to cast it, you draw a card and lose 1 life." });
const spoils = card("Spoils of the Hunt", "Instant", "{2}{G}", { oracleText: "Target creature you control gets +1/+0 until end of turn for each mana from a Treasure that was spent to cast this spell. Then that creature deals damage equal to its power to target creature an opponent controls." });
const loyalty = card("Price of Loyalty", "Sorcery", "{2}{R}", { oracleText: "Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. If mana from a Treasure was spent to cast this spell, that creature gets +2/+0 until end of turn." });
const paladin = card("Forsworn Paladin", "Creature — Human Knight", "{B}", { power: "1", toughness: "1", keywords: ["Menace"], oracleText: "Menace\n{1}{B}, {T}, Pay 1 life: Create a Treasure token.\n{2}{B}: Target creature gets +2/+0 until end of turn. If mana from a Treasure was spent to activate this ability, that creature also gains deathtouch until end of turn." });
const fixer = card("Jetmir's Fixer", "Creature — Cat Warrior", "{R}{G}", { power: "2", toughness: "2", oracleText: "{R}{G}: This creature gets +1/+1 until end of turn. If mana from a Treasure was spent to activate this ability, put a +1/+1 counter on this creature instead." });
const rhox = card("Security Rhox", "Creature — Rhino Warrior", "{2}{R}{G}", { power: "5", toughness: "4", oracleText: "You may pay {R}{G} rather than pay this spell's mana cost. Spend only mana produced by Treasures to cast it this way." });

const treasure = card("Treasure", "Token Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this token: Add one mana of any color." });
const shock = card("Shock Test", "Instant", "{R}", { oracleText: "~ deals 2 damage to any target." });
const giant = card("Hill Giant Test", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });

/** Sacrifice a Treasure for one mana of this color. */
function crack(s: GameState, pid: PlayerId, id: string, mana: "W" | "U" | "B" | "R" | "G"): GameState {
  return act(s, { type: "activateMana", player: pid, objectId: id, mana });
}

function run(s: GameState, plan: Action[] | null): GameState {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
}

/** Pass until the stack and the trigger queue are empty or someone has to decide something. */
function settle(s: GameState): GameState {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

const treasures = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name.startsWith("Treasure")).length;

describe("mana from a Treasure", () => {
  it("parses", () => {
    supported(hexblade, sellSword, marut, smaug, spoils, loyalty, paladin, fixer, rhox);
  });

  it("the pool remembers what a Treasure made until it's spent or empties (CR 106.3, 106.4)", () => {
    const { s: s0, ap } = setup([]);
    const t1 = putOnBattlefield(s0, ap, treasure);
    const t2 = putOnBattlefield(s0, ap, treasure);
    let s = crack(s0, ap, t1, "R");
    s = crack(s, ap, t2, "B");
    expect(s.players[ap]!.treasureMana).toEqual({ R: 1, B: 1 });
    // The step ends: the mana, and what it remembered, are gone.
    s = passAll(s);
    expect(s.players[ap]!.manaPool.R).toBe(0);
    expect(s.players[ap]!.treasureMana).toBeUndefined();
  });

  it("Hired Hexblade: draws a card only if mana from a Treasure paid for it (an intervening if, CR 603.4)", () => {
    const { s: s0, ap, ids } = setup([hexblade, hexblade]);
    const t = putOnBattlefield(s0, ap, treasure);
    const hand = s0.players[ap]!.hand.length;
    // Its {B} from the Treasure, its {1} from a land.
    let s = crack(s0, ap, t, "B");
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.treasureSpent).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    expect(s.players[ap]!.life).toBe(39);
    // The other one paid with lands only: no trigger at all.
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[1]!]!.treasureSpent).toBeUndefined();
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    expect(s.players[ap]!.life).toBe(39);
  });

  it("Treasure mana is spent before other mana of the same type where the player has the choice", () => {
    const { s: s0, ap, ids } = setup([hexblade]);
    const t = putOnBattlefield(s0, ap, treasure);
    const swamp = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Swamp")!;
    // {B} from a Swamp and {B} from a Treasure in the pool: paying {1}{B}, both are spent; with {B}{B}{B} for a {B}
    // cost, the Treasure's goes first.
    let s = act(s0, { type: "activateMana", player: ap, objectId: swamp, mana: "B" });
    s = crack(s, ap, t, "B");
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]! });
    expect(s.objects[ids[0]!]!.treasureSpent).toBe(1);
    expect(s.players[ap]!.treasureMana).toBeUndefined();
  });

  it("Jaded Sell-Sword: first strike and haste with Treasure mana", () => {
    const { s: s0, ap, ids } = setup([sellSword]);
    const t = putOnBattlefield(s0, ap, treasure);
    let s = crack(s0, ap, t, "R");
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "First strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(true);
  });

  it("Marut: a Treasure for each mana from a Treasure spent to cast it", () => {
    const { s: s0, ap, ids } = setup([marut]);
    const ts = [0, 1, 2].map(() => putOnBattlefield(s0, ap, treasure));
    let s = s0;
    for (const t of ts) s = crack(s, ap, t, "G");
    expect(treasures(s, ap)).toBe(0);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(treasures(s, ap)).toBe(3);
  });

  it("Smaug: a card for each spell cast with Treasure mana, not for one cast without", () => {
    const { s: s0, ap, opp, ids } = setup([shock, shock]);
    putOnBattlefield(s0, ap, smaug);
    const t = putOnBattlefield(s0, ap, treasure);
    const hand = s0.players[ap]!.hand.length;
    let s = crack(s0, ap, t, "R");
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    expect(s.players[ap]!.life).toBe(39);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    expect(s.players[ap]!.life).toBe(39);
    expect(s.players[opp]!.life).toBe(36);
  });

  it("Spoils of the Hunt: +1/+0 for each mana from a Treasure spent to cast it", () => {
    const { s: s0, ap, opp, ids } = setup([spoils]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, giant);
    const [t1, t2] = [putOnBattlefield(s0, ap, treasure), putOnBattlefield(s0, ap, treasure)];
    let s = crack(crack(s0, ap, t1!, "G"), ap, t2!, "R");
    s = settle(run(s, planCast(s, ap, ids[0]!, [target(mine), target(theirs)])));
    expect(pt(s, mine)).toBe("4/2");
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("Price of Loyalty: +2/+0 only with Treasure mana", () => {
    const { s: s0, ap, opp, ids } = setup([loyalty]);
    const theirs = putOnBattlefield(s0, opp, giant);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(theirs)])));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(pt(s, theirs)).toBe("3/3");
    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([loyalty]);
    const theirs1 = putOnBattlefield(s1, opp1, giant);
    const t = putOnBattlefield(s1, ap1, treasure);
    s = crack(s1, ap1, t, "R");
    s = settle(run(s, planCast(s, ap1, ids1[0]!, [target(theirs1)])));
    expect(pt(s, theirs1)).toBe("5/3");
  });

  it("'spent to activate this ability' (Forsworn Paladin, Jetmir's Fixer)", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, paladin);
    const f = putOnBattlefield(s0, ap, fixer);
    const b = putOnBattlefield(s0, ap, bear());
    const [t1, t2] = [putOnBattlefield(s0, ap, treasure), putOnBattlefield(s0, ap, treasure)];
    // Paladin with lands only: +2/+0, no deathtouch.
    let s = settle(run(s0, planActivate(s0, ap, p, 1, [target(b)])));
    expect(pt(s, b)).toBe("4/2");
    expect(objHasKeyword(s, s.objects[b]!, "Deathtouch")).toBe(false);
    // With a Treasure's {B}: deathtouch too.
    s = crack(s, ap, t1!, "B");
    s = settle(run(s, planActivate(s, ap, p, 1, [target(b)])));
    expect(pt(s, b)).toBe("6/2");
    expect(objHasKeyword(s, s.objects[b]!, "Deathtouch")).toBe(true);
    // The Fixer: +1/+1 with lands, a +1/+1 counter instead with a Treasure's mana.
    s = settle(run(s, planActivate(s, ap, f, 0)));
    expect(pt(s, f)).toBe("3/3");
    expect(s.objects[f]!.counters["+1/+1"]).toBeUndefined();
    s = crack(s, ap, t2!, "G");
    s = settle(run(s, planActivate(s, ap, f, 0)));
    expect(s.objects[f]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, f)).toBe("4/4");
  });

  it("Security Rhox: {R}{G} rather than its mana cost, paid only with mana from Treasures", () => {
    const { s: s0, ap, ids } = setup([rhox]);
    // Lands alone can't pay it this way, and land mana in the pool doesn't count.
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "alternative" })).toMatch(/not enough mana/);
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "alternative" })).toBeNull();
    const t1 = putOnBattlefield(s0, ap, treasure);
    const t2 = putOnBattlefield(s0, ap, treasure);
    // With two Treasures: the plan sacrifices them, and only them.
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "alternative" })!;
    expect(plan.filter((a) => a.type === "activateMana").map((a) => (a as { objectId: string }).objectId).sort()).toEqual([t1, t2].sort());
    const s = settle(run(s0, plan));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[t1]!.zone).not.toBe("battlefield");
    // One Treasure's {R} and a Forest's {G} in the pool: not enough.
    const { s: s1, ap: ap1, ids: ids1 } = setup([rhox]);
    const t3 = putOnBattlefield(s1, ap1, treasure);
    const forest = s1.battlefield.find((id) => s1.cards[s1.objects[id]!.cardId]!.name === "Forest")!;
    let s2 = crack(s1, ap1, t3, "R");
    s2 = act(s2, { type: "activateMana", player: ap1, objectId: forest, mana: "G" });
    expect(castProblem(s2, ap1, ids1[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "alternative" })).toMatch(/not enough mana/);
  });

  it("a bot casts Security Rhox with its Treasures when it can't pay the mana cost", () => {
    const { s: s0, ap, ids } = setup([rhox]);
    // Only Treasures to pay with.
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.typeLine.includes("Land")) s0.objects[id]!.tapped = true;
    s0.players[ap]!.landsPlayedThisTurn = 1;
    putOnBattlefield(s0, ap, treasure);
    putOnBattlefield(s0, ap, treasure);
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "castSpell" && a.objectId === ids[0] && a.alt === "alternative")).toBe(true);
  });
});
