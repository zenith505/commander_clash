// Activated mana abilities with costs or instructions a `ManaAbility` doesn't describe ("Sacrifice a creature: Add
// {C}{C}", "{T}: Add {C}. You gain 1 life."): CR 605.1a makes them mana abilities all the same, so they don't use the
// stack (605.3b) and can be activated while paying a cost (605.3a) or under split second (702.61b). An ability whose
// instructions move a card to or from a library isn't one (605.1a, as updated in 2026: Chromatic Sphere's rulings).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup, target } from "./helpers";
import { botActions, compileCard, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ManaType, type ObjectId, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
const pool = (s: GameState, pid: PlayerId) => Object.entries(s.players[pid]!.manaPool).flatMap(([m, n]) => Array<string>(n).fill(m)).join("");
/** Tap every land `pid` controls, so only the permanents under test make mana. */
const tapLands = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && /Land/.test(s.cards[s.objects[id]!.cardId]!.typeLine)) s.objects[id]!.tapped = true;
};

// Real oracle text (Scryfall).
const ashnod = card("Ashnod's Altar", "Artifact", "{3}", { oracleText: "Sacrifice a creature: Add {C}{C}." });
const phyAltar = card("Phyrexian Altar", "Artifact", "{3}", { oracleText: "Sacrifice a creature: Add one mana of any color." });
const sphere = card("Chromatic Sphere", "Artifact", "{1}", { oracleText: "{1}, {T}, Sacrifice this artifact: Add one mana of any color. Draw a card. (Activate only as an instant.)" });
const egg = card("Darkwater Egg", "Artifact", "{1}", { oracleText: "{2}, {T}, Sacrifice this artifact: Add {U}{B}. Draw a card. (Activate only as an instant.)" });
const sextant = card("Barbed Sextant", "Artifact", "{1}", { oracleText: "{1}, {T}, Sacrifice this artifact: Add one mana of any color. Draw a card at the beginning of the next turn's upkeep." });
const moxOpal = card("Mox Opal", "Legendary Artifact", "{0}", { oracleText: "Metalcraft — {T}: Add one mana of any color. Activate only if you control three or more artifacts." });
const talisman = card("Pristine Talisman", "Artifact", "{3}", { oracleText: "{T}: Add {C}. You gain 1 life." });
const tower = card("Phyrexian Tower", "Legendary Land", "", { oracleText: "{T}: Add {C}.\n{T}, Sacrifice a creature: Add {B}{B}." });
const fertile = card("Fertile Ground", "Enchantment — Aura", "{1}{G}", { keywords: ["Enchant"], oracleText: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional one mana of any color." });
const wildGrowth = card("Wild Growth", "Enchantment — Aura", "{G}", { keywords: ["Enchant"], oracleText: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}." });
const leafkin = card("Leafkin Druid", "Creature — Elemental Druid", "{1}{G}", { power: "0", toughness: "3", oracleText: "{T}: Add {G}. If you control four or more creatures, add {G}{G} instead." });
const reflecting = card("Reflecting Pool", "Land", "", { oracleText: "{T}: Add one mana of any type that a land you control could produce." });
const suddenShock = card("Sudden Shock", "Instant", "{1}{R}", { keywords: ["Split second"], oracleText: "Split second (As long as this spell is on the stack, players can't cast spells or activate abilities that aren't mana abilities.)\nSudden Shock deals 2 damage to any target." });
const goose = card("Gilded Goose", "Creature — Bird", "{G}", { power: "0", toughness: "2", keywords: ["Flying", "Food"], oracleText: "Flying\nWhen this creature enters, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\n{1}{G}, {T}: Create a Food token.\n{T}, Sacrifice a Food: Add one mana of any color." });
const crypt = card("Crypt of Agadeem", "Land", "", { oracleText: "This land enters tapped.\n{T}: Add {B}.\n{2}, {T}: Add {B} for each black creature card in your graveyard." });
const bloodArtist = card("Blood Artist", "Creature — Vampire", "{1}{B}", { power: "0", toughness: "1", oracleText: "Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const warded = card("Warded Golem", "Artifact Creature — Golem", "{4}", { power: "3", toughness: "3", keywords: ["Ward"], oracleText: "Ward {2}" });
const bear = card("Runeclaw Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
const ogre = card("Gray Ogre", "Creature — Ogre", "{2}{R}", { power: "2", toughness: "2" });
const trinket = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });

const ability = (s: GameState, id: ObjectId, i: number, extra: Partial<Extract<Action, { type: "activateAbility" }>> = {}): Action => ({ type: "activateAbility", player: s.objects[id]!.controller, objectId: id, index: i, ...extra });

describe("activated mana abilities with other costs (CR 605.1a)", () => {
  it("compile as mana abilities; ones that draw a card don't (CR 605.1a), a delayed draw does", () => {
    supported(ashnod, phyAltar, sphere, egg, sextant, moxOpal, talisman, tower, leafkin, goose);
    for (const d of [ashnod, phyAltar, sextant, moxOpal, talisman, leafkin]) expect(compileCard(d).activated[0]!.mana, d.name).toBe(true);
    expect(compileCard(tower).activated[0]!.mana).toBe(true);
    expect(compileCard(goose).activated.find((a) => /Sacrifice a Food/.test(a.text))!.mana).toBe(true);
    expect(compileCard(goose).activated.find((a) => /Create a Food/.test(a.text))!.mana).toBeUndefined();
    expect(compileCard(sphere).activated[0]!.mana).toBeUndefined();
    expect(compileCard(egg).activated[0]!.mana).toBeUndefined();
    // "Add {B} for each ..." with a mana cost is one too (it used to be left out for using the stack).
    expect(compileCard(crypt).activated.every((a) => a.mana)).toBe(true);
  });

  it("Ashnod's Altar: the mana is there at once, nothing goes on the stack, and it pays for a spell", () => {
    const { s: s0, ap, ids } = setup([ogre]);
    tapLands(s0, ap);
    const altar = putOnBattlefield(s0, ap, ashnod);
    const b = putOnBattlefield(s0, ap, bear);
    s0.players[ap]!.manaPool.R = 1;
    let s = act(s0, ability(s0, altar, 0, { costs: { sacrifice: [b] } }));
    expect(s.stack).toHaveLength(0);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(pool(s, ap)).toBe("RCC");
    expect(waitingOn(s)).toBe(ap); // still their priority (CR 117.3c)
    s = run(s, planCast(s, ap, ids[0]!));
    expect(s.stack.map((x) => x.description)).toEqual([expect.stringContaining("Gray Ogre")]);
    expect(pool(s, ap)).toBe("");
  });

  it("what sacrificing for mana triggers goes on the stack once the spell is cast (CR 601.2g)", () => {
    const { s: s0, ap, ids } = setup([ogre]);
    tapLands(s0, ap);
    const altar = putOnBattlefield(s0, ap, ashnod);
    putOnBattlefield(s0, ap, bloodArtist);
    const b = putOnBattlefield(s0, ap, bear);
    s0.players[ap]!.manaPool.R = 1;
    let s = act(s0, ability(s0, altar, 0, { costs: { sacrifice: [b] } }));
    expect(s.stack).toHaveLength(0);
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]! });
    // Blood Artist's trigger waits for its target, on top of the Ogre.
    expect(s.stack[0]!.description).toContain("Gray Ogre");
    expect(s.pending?.kind === "chooseTargets" || s.stack.length === 2).toBe(true);
  });

  it("Phyrexian Altar: the color can be given as it's activated, or chosen as it resolves", () => {
    const { s: s0, ap } = setup([]);
    const altar = putOnBattlefield(s0, ap, phyAltar);
    const b1 = putOnBattlefield(s0, ap, bear);
    const b2 = putOnBattlefield(s0, ap, bear);
    let s = act(s0, ability(s0, altar, 0, { costs: { sacrifice: [b1] }, mana: "U" }));
    expect(pool(s, ap)).toBe("U");
    expect(s.pending).toBeNull();
    s = act(s, ability(s, altar, 0, { costs: { sacrifice: [b2] } }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "color" });
    expect(s.stack).toHaveLength(0);
    s = act(s, { type: "chooseOption", player: ap, choice: "Black" });
    expect(pool(s, ap)).toBe("UB");
    expect(s.pending).toBeNull();
    expect(waitingOn(s)).toBe(ap);
  });

  it("can be activated while paying for ward (CR 605.3a), with the color given then", () => {
    const { s: s0, ap, opp, ids } = setup([shock]);
    const golem = putOnBattlefield(s0, opp, warded);
    const altar = putOnBattlefield(s0, ap, phyAltar);
    const b = putOnBattlefield(s0, ap, bear);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(golem)]));
    tapLands(s, ap);
    for (let i = 0; i < 20 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap });
    // Not without the color: it couldn't stop for one while ward waits on the payment.
    expect(() => act(s, ability(s, altar, 0, { costs: { sacrifice: [b] } }))).toThrow(/choose the mana/);
    s = act(s, ability(s, altar, 0, { costs: { sacrifice: [b] }, mana: "G" }));
    expect(s.pending).toMatchObject({ kind: "payUnless" });
    expect(pool(s, ap)).toBe("G");
  });

  it("works under split second (CR 702.61b); other activated abilities don't", () => {
    const { s: s0, ap, opp, ids } = setup([suddenShock]);
    const altar = putOnBattlefield(s0, opp, ashnod);
    const b = putOnBattlefield(s0, opp, bear);
    const goo = putOnBattlefield(s0, opp, goose);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(() => act(s, ability(s, goo, compileCard(goose).activated.findIndex((a) => /Create a Food/.test(a.text))))).toThrow(/split second/);
    s = act(s, ability(s, altar, 0, { costs: { sacrifice: [b] } }));
    expect(pool(s, opp)).toBe("CC");
  });

  it("Chromatic Sphere draws, so it uses the stack and can be responded to (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const sp = putOnBattlefield(s0, ap, sphere);
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planActivate(s0, ap, sp, 0));
    expect(s.stack).toHaveLength(1);
    expect(s.pending).toBeNull();
    for (let i = 0; i < 8 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color" });
    s = act(s, { type: "chooseOption", player: ap, choice: "Red" });
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Barbed Sextant's draw comes from a delayed trigger, so it's a mana ability: mana now, a card next upkeep", () => {
    const { s: s0, ap } = setup([]);
    const sx = putOnBattlefield(s0, ap, sextant);
    const s = run(s0, planActivate(s0, ap, sx, 0, undefined, undefined, undefined, undefined, undefined, { mana: "W" }));
    expect(s.stack).toHaveLength(0);
    expect(s.objects[sx]!.zone).toBe("graveyard");
    expect(s.players[ap]!.manaPool.W).toBeGreaterThanOrEqual(1);
    expect(s.delayed?.some((d) => /Draw a card/.test(d.body.text ?? ""))).toBe(true);
  });

  it("paying for a spell uses Mox Opal only with metalcraft, and Pristine Talisman with its life", () => {
    const { s: s0, ap, ids } = setup([ogre]);
    tapLands(s0, ap);
    const mox = putOnBattlefield(s0, ap, moxOpal);
    const tal = putOnBattlefield(s0, ap, talisman);
    s0.players[ap]!.manaPool.R = 1;
    // Two artifacts: the Mox can't be activated, so {2}{R} can't be paid.
    expect(planCast(s0, ap, ids[0]!)).toBeNull();
    putOnBattlefield(s0, ap, trinket);
    const plan = planCast(s0, ap, ids[0]!)!;
    expect(plan.filter((a) => a.type === "activateAbility").map((a) => (a as { objectId: ObjectId }).objectId).sort()).toEqual([mox, tal].sort());
    const life = s0.players[ap]!.life;
    const s = run(s0, plan);
    expect(s.stack.map((x) => x.description)).toEqual([expect.stringContaining("Gray Ogre")]);
    expect(s.players[ap]!.life).toBe(life + 1);
    expect(s.objects[mox]!.tapped && s.objects[tal]!.tapped).toBe(true);
  });

  it("autopay never sacrifices a creature for mana: what to sacrifice is the player's choice", () => {
    const { s: s0, ap, ids } = setup([ogre]);
    tapLands(s0, ap);
    putOnBattlefield(s0, ap, ashnod);
    putOnBattlefield(s0, ap, bear);
    s0.players[ap]!.manaPool.R = 1;
    expect(planCast(s0, ap, ids[0]!)).toBeNull();
  });

  it("Phyrexian Tower under Wild Growth: tapping it for mana triggers the Aura (CR 106.12a, 605.4a)", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tower);
    const wg = putOnBattlefield(s0, ap, wildGrowth);
    s0.objects[wg]!.attachedTo = t;
    const b = putOnBattlefield(s0, ap, bear);
    const s = act(s0, ability(s0, t, 0, { costs: { sacrifice: [b] } }));
    expect(pool(s, ap)).toBe("BBG");
  });

  it("under Fertile Ground, its extra color is picked as it's activated", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tower);
    const fg = putOnBattlefield(s0, ap, fertile);
    s0.objects[fg]!.attachedTo = t;
    const b = putOnBattlefield(s0, ap, bear);
    expect(() => act(s0, ability(s0, t, 0, { costs: { sacrifice: [b] } }))).toThrow(/also adds/);
    const s = act(s0, ability(s0, t, 0, { costs: { sacrifice: [b] }, extra: ["W"] }));
    expect(pool(s, ap)).toBe("WBB");
  });

  it("Leafkin Druid: what it adds is worked out as it resolves", () => {
    const { s: s0, ap } = setup([]);
    const lk = putOnBattlefield(s0, ap, leafkin);
    let s = act(s0, ability(s0, lk, 0));
    expect(pool(s, ap)).toBe("G");
    const { s: s1 } = setup([]);
    const lk1 = putOnBattlefield(s1, ap, leafkin);
    for (let i = 0; i < 3; i++) putOnBattlefield(s1, ap, bear);
    s = act(s1, ability(s1, lk1, 0));
    expect(pool(s, ap)).toBe("GG");
    expect(s.stack).toHaveLength(0);
  });

  it("Reflecting Pool counts what Phyrexian Tower's other ability would add (CR 106.7)", () => {
    const { s: s0, ap } = setup([]);
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    const pool0 = putOnBattlefield(s0, ap, reflecting);
    putOnBattlefield(s0, ap, tower);
    const s = act(s0, { type: "activateMana", player: ap, objectId: pool0, mana: "B" as ManaType });
    expect(pool(s, ap)).toBe("B");
  });

  it("bots pay with them too, and don't activate them for nothing", () => {
    const { s: s0, ap, ids } = setup([ogre]);
    tapLands(s0, ap);
    for (const a of [moxOpal, trinket, trinket]) putOnBattlefield(s0, ap, a);
    putOnBattlefield(s0, ap, talisman);
    s0.players[ap]!.manaPool.R = 1;
    let s = s0;
    for (let i = 0; i < 6 && s.objects[ids[0]!]!.zone === "hand"; i++) {
      const acts = botActions(s, ap);
      if (acts.some((a) => a.type === "passPriority")) break;
      for (const a of acts) s = act(s, a);
    }
    expect(s.objects[ids[0]!]!.zone).toBe("stack");
    expect(s.players[ap]!.life).toBe(s0.players[ap]!.life + 1); // the Talisman paid
  });
});
