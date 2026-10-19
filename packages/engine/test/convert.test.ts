// The Transformers cards: convert (CR 701.28) turns a permanent so its other face is up, just as transforming does;
// More Than Meets the Eye (702.162) casts the card converted, its back face up on the stack; living metal (702.161)
// makes a Vehicle an artifact creature during its controller's turn.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, pt, putOnBattlefield, scry, setup, target } from "./helpers";
import { moveObject } from "../src/game";
import { botActions, characteristics, compileCard, defOf, faceDef, isFullySupported, objIsType, planCast, restingDef, waitingOn, type Action, type GameState } from "../src";

// Real oracle text (Scryfall).
const goldbug = scry(
  "transform",
  [
    { name: "Goldbug, Humanity's Ally", mana_cost: "{1}{W}{U}", type_line: "Legendary Artifact Creature — Robot", oracle_text: "More Than Meets the Eye {W}{U} (You may cast this card converted for {W}{U}.)\nPrevent all combat damage that would be dealt to attacking Humans you control.\nWhenever you cast your second spell each turn, convert Goldbug.", power: "3", toughness: "3" },
    { name: "Goldbug, Scrappy Scout", type_line: "Legendary Artifact — Vehicle", oracle_text: "Living metal (During your turn, this Vehicle is also a creature.)\nHuman spells you control can't be countered.\nWhenever Goldbug and at least one Human attack, draw a card and convert Goldbug.", power: "1", toughness: "3" },
  ],
  { keywords: ["Living metal", "Convert", "More Than Meets the Eye"] },
);
const optimus = scry(
  "transform",
  [
    { name: "Optimus Prime, Hero", mana_cost: "{3}{U}{R}{W}", type_line: "Legendary Artifact Creature — Robot", oracle_text: "More Than Meets the Eye {2}{U}{R}{W} (You may cast this card converted for {2}{U}{R}{W}.)\nAt the beginning of each end step, bolster 1. (Choose a creature with the least toughness among creatures you control and put a +1/+1 counter on it.)\nWhen Optimus Prime dies, return it to the battlefield converted under its owner's control.", power: "4", toughness: "8" },
    { name: "Optimus Prime, Autobot Leader", type_line: "Legendary Artifact — Vehicle", oracle_text: "Living metal (During your turn, this Vehicle is also a creature.)\nTrample\nWhenever you attack, bolster 2. The chosen creature gains trample until end of turn. When that creature deals combat damage to a player this turn, convert Optimus Prime.", power: "6", toughness: "8" },
  ],
  { keywords: ["Living metal", "Trample", "Convert", "More Than Meets the Eye", "Bolster"] },
);
const human = card("Human Test", "Creature — Human Soldier", "{W}", { power: "1", toughness: "1" });
const opt = card("Opt", "Instant", "{U}", { oracleText: "Draw a card." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;

describe("convert, More Than Meets the Eye and living metal (CR 701.28, 702.161, 702.162)", () => {
  it("Goldbug compiles; its More Than Meets the Eye cost belongs to the back face it's cast as", () => {
    expect(isFullySupported(goldbug)).toBe(true);
    expect(compileCard(goldbug).altCosts).toEqual([{ kind: "convert", mana: "{W}{U}" }]);
  });

  it("cast converted for {W}{U}: the back face on the stack with the front face's mana value, and it enters converted", () => {
    const { s: s0, ap, ids } = setup([goldbug]);
    const id = ids[0]!;
    let s = run(s0, planCast(s0, ap, id, undefined, undefined, "auto", undefined, { alt: "convert" }));
    expect(s.objects[id]!.zone).toBe("stack");
    expect(name(s, id)).toBe("Goldbug, Scrappy Scout");
    // Two lands tapped, not three.
    expect(s.battlefield.filter((x) => s.objects[x]!.tapped).length).toBe(2);
    expect(characteristics(s, s.objects[id]!).types).toEqual(["Artifact"]);
    s = settle(s);
    expect(s.objects[id]!.zone).toBe("battlefield");
    expect(name(s, id)).toBe("Goldbug, Scrappy Scout");
    expect(s.log.some((l) => /converted, for its More Than Meets the Eye cost/.test(l.text))).toBe(true);
    // Living metal: an artifact creature during its controller's turn, with its printed power and toughness.
    expect(objIsType(s, s.objects[id]!, "Creature")).toBe(true);
    expect(pt(s, id)).toBe("1/3");
    expect(defOf(s, s.objects[id]!).cmc).toBe(3);
    // During an opponent's turn, just a Vehicle.
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(objIsType(s, s.objects[id]!, "Creature")).toBe(false);
  });

  it("the front face converts on its controller's second spell of the turn; the back converts again attacking with a Human", () => {
    const { s: s0, ap, ids } = setup([opt, opt]);
    const g = putOnBattlefield(s0, ap, goldbug);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(name(s, g)).toBe("Goldbug, Humanity's Ally");
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(name(s, g)).toBe("Goldbug, Scrappy Scout");
    expect(s.log.some((l) => l.text === "Goldbug, Humanity's Ally converts into Goldbug, Scrappy Scout.")).toBe(true);

    // Next turn: attacking with Goldbug alone does nothing; with a Human, it draws a card and converts.
    const h = putOnBattlefield(s, ap, human);
    s = passUntil(s, "declareAttackers", ap);
    const defender = s.turnOrder.find((p) => p !== ap)!;
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender }, { attacker: h, defender }] }));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(name(s, g)).toBe("Goldbug, Humanity's Ally");
  });

  it("Optimus Prime dies and returns converted, as if transformed (CR 701.28a, 712.14a)", () => {
    // Its back face's attack trigger isn't supported yet; its front face is.
    expect(compileCard(faceDef(restingDef(optimus), 0)).unsupported).toEqual([]);
    const { s: s0, ap, ids } = setup([murder]);
    const o = putOnBattlefield(s0, ap, optimus);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(o)])));
    expect(s.objects[o]!.zone).toBe("battlefield");
    expect(name(s, o)).toBe("Optimus Prime, Autobot Leader");
    expect(pt(s, o)).toBe("6/8");
  });

  it("a bot casts it converted when its mana cost is out of reach", () => {
    const { s: s0, ap, ids } = setup([goldbug]);
    // Only two untapped lands: a Plains and an Island.
    let s = s0;
    const lands = s.battlefield.filter((x) => defOf(s, s.objects[x]!).types.includes("Land"));
    const keep = [lands.find((x) => defOf(s, s.objects[x]!).name === "Plains")!, lands.find((x) => defOf(s, s.objects[x]!).name === "Island")!];
    for (const l of lands) if (!keep.includes(l)) s.objects[l]!.tapped = true;
    for (const h of s.players[ap]!.hand.filter((x) => x !== ids[0])) moveObject(s, h, "library");
    for (let i = 0; i < 6 && s.objects[ids[0]!]!.zone === "hand"; i++) {
      const a = botActions(s, ap)[0];
      if (!a) break;
      s = act(s, a);
    }
    expect(s.objects[ids[0]!]!.zone).toBe("stack");
    expect(name(s, ids[0]!)).toBe("Goldbug, Scrappy Scout");
  });
});
