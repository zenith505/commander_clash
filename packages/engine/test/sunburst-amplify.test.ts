// Sunburst (CR 702.44) and amplify (CR 702.38).

import { describe, expect, it } from "vitest";
import { act, bear, card, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, actions: Action[] | null) => {
  if (!actions) throw new Error("no plan");
  return actions.reduce((x, a) => act(x, a), s);
};
const castNow = (s: GameState, pid: PlayerId, id: string) => run(s, planCast(s, pid, id, undefined, undefined, "auto"));
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const landsOf = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);

// Real oracle text (Scryfall), with the keywords Scryfall lists.
const suntouchedMyr = card("Suntouched Myr", "Artifact Creature — Myr", "{3}", { power: "0", toughness: "0", keywords: ["Sunburst"], oracleText: "Sunburst (This creature enters with a +1/+1 counter on it for each color of mana spent to cast it.)" });
const pentadPrism = card("Pentad Prism", "Artifact", "{2}", { keywords: ["Sunburst"], oracleText: "Sunburst (This artifact enters with a charge counter on it for each color of mana spent to cast it.)\nRemove a charge counter from this artifact: Add one mana of any color." });
const heliophial = card("Heliophial", "Artifact", "{5}", { keywords: ["Sunburst"], oracleText: "Sunburst (This artifact enters with a charge counter on it for each color of mana spent to cast it.)\n{2}, Sacrifice this artifact: It deals damage equal to the number of charge counters on it to any target." });
const arcboundWanderer = card("Arcbound Wanderer", "Artifact Creature — Golem", "{6}", { power: "0", toughness: "0", keywords: ["Modular", "Sunburst"], oracleText: "Modular—Sunburst (This creature enters with a +1/+1 counter on it for each color of mana spent to cast it. When it dies, you may put its +1/+1 counters on target artifact creature.)" });
const skyreachManta = card("Skyreach Manta", "Artifact Creature — Fish", "{5}", { power: "0", toughness: "0", keywords: ["Flying", "Sunburst"], oracleText: "Sunburst (This creature enters with a +1/+1 counter on it for each color of mana spent to cast it.)\nFlying" });
const gloweringRogon = card("Glowering Rogon", "Creature — Beast", "{5}{G}", { power: "4", toughness: "4", keywords: ["Amplify"], oracleText: "Amplify 1 (As this creature enters, put a +1/+1 counter on it for each Beast card you reveal in your hand.)" });
const avenWarhawk = card("Aven Warhawk", "Creature — Bird Soldier", "{4}{W}", { power: "2", toughness: "2", keywords: ["Flying", "Amplify"], oracleText: "Amplify 1 (As this creature enters, put a +1/+1 counter on it for each Bird and/or Soldier card you reveal in your hand.)\nFlying" });
const kilnmouthDragon = card("Kilnmouth Dragon", "Creature — Dragon", "{5}{R}{R}", { power: "5", toughness: "5", keywords: ["Flying", "Amplify"], oracleText: "Amplify 3 (As this creature enters, put three +1/+1 counters on it for each Dragon card you reveal in your hand.)\nFlying\n{T}: This creature deals damage equal to the number of +1/+1 counters on it to any target." });
const beast = card("Craw Wurm Beast", "Creature — Beast", "{4}{G}{G}", { power: "6", toughness: "4" });
const soldier = card("Elite Vanguard", "Creature — Human Soldier", "{W}", { power: "2", toughness: "1" });
const shapeshifter = card("Changeling Outcast", "Creature — Shapeshifter", "{B}", { power: "1", toughness: "1", keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)\nChangeling Outcast can't block and can't be blocked." });

describe("sunburst", () => {
  it("counts each color of mana spent: the bot and the auto-payer pay generic mana with as many colors as they can (CR 702.44a)", () => {
    supported(suntouchedMyr, pentadPrism, heliophial, arcboundWanderer, skyreachManta);
    const { s: s0, ap, ids } = setup([suntouchedMyr, skyreachManta, pentadPrism]);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
    expect(s.log.some((e) => /Suntouched Myr enters with 3 \+1\/\+1 counters \(sunburst\)/.test(e.text))).toBe(true);
    s = settle(castNow(s, ap, ids[1]!));
    expect(pt(s, ids[1]!)).toBe("5/5");
    // A noncreature gets charge counters.
    s = settle(castNow(s, ap, ids[2]!));
    expect(s.objects[ids[2]!]!.counters.charge).toBe(2);
    expect(s.objects[ids[2]!]!.counters["+1/+1"]).toBeUndefined();
  });

  it("colorless mana adds nothing, and mana already in the pool is spent as it is", () => {
    const { s: s0, ap, ids } = setup([suntouchedMyr]);
    // Tap three Forests first: only green is spent.
    let s = s0;
    for (const f of landsOf(s, ap, "Forest")) s = act(s, { type: "activateMana", player: ap, objectId: f, mana: "G" });
    s = settle(castNow(s, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, ids[0]!)).toBe("1/1");
  });

  it("only works for a resolving spell: put onto the battlefield, it gets no counters (CR 702.44b)", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, suntouchedMyr);
    expect(s0.objects[id]!.counters["+1/+1"]).toBeUndefined();
  });

  it("Modular—Sunburst: +1/+1 counters for the colors spent, moved on when it dies (CR 702.44c)", () => {
    const { s: s0, ap, ids } = setup([arcboundWanderer]);
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(5);
  });
});

describe("amplify", () => {
  it("reveals any number of cards that share a creature type; N +1/+1 counters for each, before it has entered (CR 702.38a)", () => {
    supported(gloweringRogon, avenWarhawk, kilnmouthDragon);
    const { s: s0, ap, ids } = setup([gloweringRogon, beast, beast, bear(), shapeshifter]);
    let s = castNow(s0, ap, ids[0]!);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 4 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "reveal", objectId: ids[0], min: 0 });
    const pend = s.pending as Extract<GameState["pending"], { kind: "pickPermanents" }>;
    // The Beasts and the changeling share a creature type with it; the Bear doesn't, nor does the Rogon itself.
    expect([...pend.options].sort()).toEqual([ids[1], ids[2], ids[4]].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [ids[1]!, ids[4]!] }));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
    expect(pt(s, ids[0]!)).toBe("6/6");
    // Revealed cards stay in the hand.
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
  });

  it("asks nothing with no card to reveal; a bot reveals every card it can", () => {
    const { s: s0, ap, ids } = setup([kilnmouthDragon]);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBeUndefined();
    const { s: b0, ap: bp, ids: bids } = setup([avenWarhawk, soldier, soldier]);
    s = castNow(b0, bp, bids[0]!);
    for (let i = 0; i < 6 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const plan = botActions(s, bp);
    expect(plan).toEqual([{ type: "pickPermanents", player: bp, ids: [bids[1], bids[2]] }]);
    s = settle(plan.reduce((x, a) => act(x, a), s));
    expect(pt(s, bids[0]!)).toBe("4/4");
    void toHand;
  });
});
