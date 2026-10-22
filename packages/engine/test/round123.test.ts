// Round 123: round 122's gaps (the order of two redirections of the same damage, Sheoldred's "nontoken creature or
// planeswalker", protection from a mana value), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { botActions, castProblem, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";
import { invalidateCharacteristics } from "../src/layers";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes });
    else if (p) s = botActions(s, p.player).reduce((x, a) => act(x, a), s);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Pass priority until something waits on a choice or the stack is empty. */
const untilChoice = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Answer a damage shield question with the option whose label contains `text`. */
const answerShield = (s: GameState, text: string) => {
  const p = s.pending;
  if (p?.kind !== "chooseOption" || p.what !== "damageShield") throw new Error(`no shield question: ${JSON.stringify(p)}`);
  const i = p.labels!.findIndex((l) => l.includes(text));
  if (i < 0) throw new Error(`no "${text}" in ${p.labels!.join(" | ")}`);
  return act(s, { type: "chooseOption", player: p.player, choice: p.options[i]! });
};

// Real oracle text (Scryfall).
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const pariah = card("Pariah", "Enchantment — Aura", "{2}{W}", { oracleText: "Enchant creature\nAll damage that would be dealt to you is dealt to enchanted creature instead." });
const giant = card("Palisade Giant", "Creature — Giant Soldier", "{4}{W}{W}", { power: "2", toughness: "7", oracleText: "All damage that would be dealt to you and other permanents you control is dealt to this creature instead." });

describe("two redirections of the same damage: the player being dealt it chooses which applies (CR 616.1)", () => {
  const scene = () => {
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const b = putOnBattlefield(s0, opp, bear());
    const p = putOnBattlefield(s0, opp, pariah);
    s0.objects[p]!.attachedTo = b;
    const g = putOnBattlefield(s0, opp, giant);
    invalidateCharacteristics(s0);
    const s = untilChoice(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    return { s, opp, b, g };
  };

  it("Lightning Bolt at a player with Pariah and Palisade Giant: they're asked, and the Giant takes it", () => {
    const { s: s0, opp, b, g } = scene();
    expect(s0.pending).toMatchObject({ kind: "chooseOption", what: "damageShield", player: opp, source: "Lightning Bolt" });
    const s = settle(answerShield(s0, "Palisade Giant instead"));
    expect(s.objects[g]!.damage).toBe(3);
    expect(s.objects[b]!.damage).toBe(0);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("choosing Pariah: the enchanted creature is dealt it, and the Giant doesn't take it from there (rulings)", () => {
    const { s: s0, opp, b, g } = scene();
    const s = settle(answerShield(s0, "Grizzly Bears instead"));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[g]!.damage).toBe(0);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("two Palisade Giants: the damage is dealt to either one, as its player chooses (rulings on Palisade Giant)", () => {
    supported(pariah, giant);
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const g1 = putOnBattlefield(s0, opp, giant);
    const g2 = putOnBattlefield(s0, opp, { ...giant, oracleId: `${giant.oracleId}-2` });
    invalidateCharacteristics(s0);
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    const p = s.pending;
    if (p?.kind !== "chooseOption") throw new Error("no question");
    s = settle(act(s, { type: "chooseOption", player: opp, choice: p.options[1]! }));
    expect([s.objects[g1]!.damage, s.objects[g2]!.damage].sort()).toEqual([0, 3]);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("a bot answers the question itself", () => {
    const { s: s0, opp } = scene();
    const s = settle(s0);
    expect(s.players[opp]!.life).toBe(40);
    expect(s.pending).toBeNull();
  });
});

const sheoldred = scry("transform", [
  { name: "Sheoldred", mana_cost: "{3}{B}{B}", type_line: "Legendary Creature — Phyrexian Praetor", power: "4", toughness: "5", oracle_text: "Menace\nWhen Sheoldred enters, each opponent sacrifices a nontoken creature or planeswalker of their choice.\n{4}{B}: Exile Sheoldred, then return it to the battlefield transformed under its owner's control. Activate only as a sorcery and only if an opponent has eight or more cards in their graveyard." },
  { name: "The True Scriptures", type_line: "Enchantment — Saga", oracle_text: "(As this Saga enters and after your draw step, add a lore counter.)\nI — For each opponent, destroy up to one target creature or planeswalker that player controls.\nII — Each opponent discards three cards, then mills three cards.\nIII — Put all creature cards from all graveyards onto the battlefield under your control. Exile this Saga, then return it to the battlefield (front face up)." },
], { keywords: ["Transform", "Menace", "Mill"] });

describe("Sheoldred // The True Scriptures", () => {
  it("each opponent sacrifices a nontoken creature or planeswalker: \"nontoken\" is for both (CR 205.4e); tokens stay", () => {
    supported(sheoldred);
    const { s: s0, ap } = setup([]);
    const [a, b] = s0.turnOrder.filter((p) => p !== ap);
    const tokenA = putOnBattlefield(s0, a!, bear({ name: "Test Token" }));
    s0.objects[tokenA]!.isToken = true;
    const realA = putOnBattlefield(s0, a!, bear());
    const tokenB = putOnBattlefield(s0, b!, bear({ name: "Test Token B" }));
    s0.objects[tokenB]!.isToken = true;
    const sh = putOnBattlefield(s0, ap, sheoldred);
    s0.battlefield.splice(s0.battlefield.indexOf(sh), 1);
    s0.objects[sh]!.zone = "hand";
    s0.players[ap]!.hand.push(sh);
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, sh)));
    expect(s.objects[sh]!.zone).toBe("battlefield");
    expect(s.objects[realA]!.zone).toBe("graveyard");
    expect(s.objects[tokenA]?.zone).toBe("battlefield");
    expect(s.objects[tokenB]?.zone).toBe("battlefield");
  });
});

const titan = card("Reaver Titan", "Artifact — Vehicle", "{7}", { power: "10", toughness: "10", keywords: ["Gatling Blaster", "Void Shields", "Protection", "Crew"], oracleText: "Void Shields — Protection from mana value 3 or less\nGatling Blaster — Whenever this Vehicle attacks, it deals 5 damage to each opponent.\nCrew 4 (Tap any number of creatures you control with total power 4 or more: This Vehicle becomes an artifact creature until end of turn.)" });
const skulk = card("Mistmeadow Skulk", "Creature — Kithkin Rogue", "{1}{W}", { power: "1", toughness: "1", keywords: ["Lifelink", "Protection"], oracleText: "Lifelink, protection from mana value 3 or greater" });
const lightUp = card("Test X Burn", "Sorcery", "{X}{R}", { oracleText: "Test X Burn deals X damage to target creature." });
const flametongue = card("Test Three Drop", "Creature — Elemental", "{2}{R}", { power: "3", toughness: "1" });

/** The Vehicle is an artifact creature until end of turn, as crewing makes it (CR 702.122a). */
const crewed = (s: GameState, id: string) => {
  s.effects.push({ id: `crewed-${id}`, timestamp: s.nextTimestamp++, controller: s.objects[id]!.controller, sourceName: "test", duration: "endOfTurn", affected: [id], mods: [{ kind: "addTypes", types: ["Creature"], subtypes: [] }] });
  invalidateCharacteristics(s);
};

describe("protection from a mana value (CR 702.16a)", () => {
  it("Reaver Titan: Lightning Bolt can't target it; an X spell can when its mana value with X is 4 or more (rulings)", () => {
    supported(titan, skulk);
    const { s: s0, ap, ids } = setup([bolt, lightUp]);
    const t = putOnBattlefield(s0, ap, titan);
    crewed(s0, t);
    expect(castProblem(s0, ap, ids[0]!, [{ kind: "object", id: t }])).toBeTruthy();
    expect(planCast(s0, ap, ids[1]!, [{ kind: "object", id: t }], undefined, "auto", 2)).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[1]!, [{ kind: "object", id: t }], undefined, "auto", 3)));
    expect(s.objects[t]!.damage).toBe(3);
  });

  it("Reaver Titan, crewed and attacking, can't be blocked by a 3-mana creature; a 4-mana one can", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, titan);
    crewed(s0, t);
    const three = putOnBattlefield(s0, opp, flametongue);
    const four = putOnBattlefield(s0, opp, card("Test Four Drop", "Creature — Giant", "{3}{R}", { power: "4", toughness: "4" }));
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: opp }] });
    s = untilChoice(s);
    s = passUntil(s, "declareBlockers");
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: three, attacker: t }] })).toThrow(/protection/);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: four, attacker: t }] })).not.toThrow();
  });

  it("Mistmeadow Skulk: blocking a 3-mana creature, its damage is prevented; Lightning Bolt's isn't", () => {
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const att = putOnBattlefield(s0, ap, flametongue);
    const sk = putOnBattlefield(s0, opp, { ...skulk, toughness: "5" });
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: att, defender: opp }] });
    s = passUntil(s, "declareBlockers");
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: sk, attacker: att }] });
    s = passUntil(s, "endCombat");
    expect(s.objects[sk]!.damage).toBe(0);
    expect(s.objects[att]!.zone).toBe("graveyard");
    s = passUntil(s, "main2");
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: sk }])));
    expect(s.objects[sk]!.damage).toBe(3);
  });
});
