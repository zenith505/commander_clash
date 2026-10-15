// "Tap an untapped creature you control" as a cost (CR 602.2b), for activated and mana abilities.

import { describe, expect, it } from "vitest";
import { act, bear, card, pt, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, botActions, isFullySupported, planActivate, planCast, planManaAbility, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, actions: Action[] | null) => {
  if (!actions) throw new Error("no plan");
  return actions.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const springleafDrum = card("Springleaf Drum", "Artifact", "{1}", { oracleText: "{T}, Tap an untapped creature you control: Add one mana of any color." });
const bramblesnap = card("Bramblesnap", "Creature — Elemental", "{1}{G}", { power: "1", toughness: "1", keywords: ["Trample"], oracleText: "Trample\nTap an untapped creature you control: This creature gets +1/+1 until end of turn." });
const opposition = card("Opposition", "Enchantment", "{2}{U}{U}", { oracleText: "Tap an untapped creature you control: Tap target artifact, creature, or land." });
const handOfJustice = card("Hand of Justice", "Creature — Avatar", "{5}{W}", { power: "2", toughness: "6", oracleText: "{T}, Tap three untapped white creatures you control: Destroy target creature." });
const heritageDruid = card("Heritage Druid", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "Tap three untapped Elves you control: Add {G}{G}{G}." });
const knight = card("White Knight Test", "Creature — Human Knight", "{W}{W}", { power: "2", toughness: "2" });
const elf = card("Elvish Test", "Creature — Elf", "{G}", { power: "1", toughness: "1" });
const blueSpell = card("Divination Test", "Sorcery", "{U}", { oracleText: "Draw a card." });

describe("tap an untapped creature you control", () => {
  it("pays an activated ability's cost; summoning-sick creatures can pay it (rulings)", () => {
    supported(springleafDrum, bramblesnap, opposition, handOfJustice, heritageDruid);
    const { s: s0, ap, opp } = setup([]);
    const snap = putOnBattlefield(s0, ap, bramblesnap);
    const sick = putOnBattlefield(s0, ap, bear(), { sick: true });
    const target = putOnBattlefield(s0, opp, bear());
    // Without a choice, the ability says what it needs.
    expect(() => act(s0, { type: "activateAbility", player: ap, objectId: snap, index: 0 })).toThrow(/choose/);
    let s = act(s0, { type: "activateAbility", player: ap, objectId: snap, index: 0, costs: { tap: [sick] } });
    expect(s.objects[sick]!.tapped).toBe(true);
    s = settle(s);
    expect(pt(s, snap)).toBe("2/2");
    // A tapped creature can't pay, and neither can an opponent's.
    expect(abilityProblem(s, ap, snap, 0, undefined, undefined, undefined, undefined, { tap: [sick] })).toMatch(/tap/);
    expect(abilityProblem(s, ap, snap, 0, undefined, undefined, undefined, undefined, { tap: [target] })).toMatch(/tap/);
    // With no {T} in the cost, it can tap itself (Bramblesnap ruling).
    s = settle(act(s, { type: "activateAbility", player: ap, objectId: snap, index: 0, costs: { tap: [snap] } }));
    expect(pt(s, snap)).toBe("3/3");
    expect(s.objects[snap]!.tapped).toBe(true);
  });

  it("with {T} in the cost, the source can't also pay it", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, handOfJustice);
    const hs = [putOnBattlefield(s0, ap, knight), putOnBattlefield(s0, ap, knight)];
    const target = putOnBattlefield(s0, opp, bear());
    const t = [{ kind: "object" as const, id: target }];
    expect(planActivate(s0, ap, g, 0, t, undefined, undefined, undefined, { tap: hs })).toBeNull();
    expect(planActivate(s0, ap, g, 0, t, undefined, undefined, undefined, { tap: [...hs, g] })).toBeNull();
    hs.push(putOnBattlefield(s0, ap, knight, { sick: true }));
    const s = settle(run(s0, planActivate(s0, ap, g, 0, t, undefined, undefined, undefined, { tap: hs })));
    expect(s.objects[target]!.zone).toBe("graveyard");
    expect(hs.every((h) => s.objects[h]!.tapped)).toBe(true);
  });

  it("the bot pays with spare creatures after its combat", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, opposition);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    // In main 1, it keeps its creatures for combat.
    const early = botActions(s0, ap);
    expect(early.some((a) => a.type === "activateAbility")).toBe(false);
    s0.step = "main2";
    s0.players[ap]!.landsPlayedThisTurn = 1;
    // Nothing else to do: no mana for its commander, no cards in hand.
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.typeLine.includes("Land")) s0.objects[id]!.tapped = true;
    for (const id of s0.players[ap]!.hand) s0.objects[id]!.zone = "library";
    s0.players[ap]!.library.push(...s0.players[ap]!.hand);
    s0.players[ap]!.hand = [];
    const late = botActions(s0, ap);
    const a = late.find((x) => x.type === "activateAbility");
    expect(a && a.type === "activateAbility" && a.costs?.tap).toEqual([mine]);
    const s = settle(run(s0, late));
    expect(s.objects[theirs]!.tapped).toBe(true);
  });
});

describe("tapping for mana", () => {
  it("Heritage Druid taps three Elves, itself and summoning-sick ones included", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, heritageDruid, { sick: true });
    const e1 = putOnBattlefield(s0, ap, elf, { sick: true });
    const e2 = putOnBattlefield(s0, ap, elf, { sick: true });
    const s = act(s0, { type: "activateMana", player: ap, objectId: d, mana: "G", ability: 0, tap: [d, e1, e2] });
    expect(s.players[ap]!.manaPool.G).toBe(3);
  });

  it("taps the Drum and a creature for one mana of any color", () => {
    const { s: s0, ap } = setup([]);
    const drum = putOnBattlefield(s0, ap, springleafDrum);
    const b = putOnBattlefield(s0, ap, bear(), { sick: true });
    // Naming nothing to tap is an error; naming the Drum itself is too.
    expect(() => act(s0, { type: "activateMana", player: ap, objectId: drum, mana: "U", ability: 0 })).toThrow(/tap/);
    const s = act(s0, { type: "activateMana", player: ap, objectId: drum, mana: "U", ability: 0, tap: [b] });
    expect(s.players[ap]!.manaPool.U).toBe(1);
    expect(s.objects[drum]!.tapped && s.objects[b]!.tapped).toBe(true);
    expect(planManaAbility(s0, ap, drum, 0, "B")?.at(-1)).toMatchObject({ type: "activateMana", tap: [b] });
  });

  it("the auto-payer uses it when it needs the color, tapping a creature not used for anything else", () => {
    const { s: s0, ap, ids } = setup([blueSpell]);
    // No Islands: only the Drum makes blue.
    for (const id of [...s0.battlefield]) if (s0.cards[s0.objects[id]!.cardId]!.name === "Island") s0.objects[id]!.tapped = true;
    const drum = putOnBattlefield(s0, ap, springleafDrum);
    const b = putOnBattlefield(s0, ap, bear(), { sick: true });
    const plan = planCast(s0, ap, ids[0]!);
    expect(plan?.find((a) => a.type === "activateMana" && a.objectId === drum)).toMatchObject({ tap: [b] });
    const s = settle(run(s0, plan));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});
