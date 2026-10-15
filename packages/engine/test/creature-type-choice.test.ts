// "Becomes the creature type of your choice" (CR 205.1b: the new type replaces its creature types) and "creatures of
// the creature type of your choice": the type is chosen as the ability or spell resolves (CR 608.2d).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(s);
};
const subtypes = (s: GameState, id: string) => characteristics(s, s.objects[id]!).subtypes;

// Real oracle text (Scryfall).
const dreamer = card("Mistform Dreamer", "Creature — Illusion", "{2}{U}", { power: "2", toughness: "1", keywords: ["Flying"], oracleText: "Flying\n{1}: This creature becomes the creature type of your choice until end of turn." });
const sliver = card("Mistform Sliver", "Creature — Illusion Sliver", "{1}{U}", {
  power: "1",
  toughness: "1",
  oracleText: 'All Slivers have "{1}: This permanent becomes the creature type of your choice in addition to its other types until end of turn."',
});
const tribalUnity = card("Tribal Unity", "Instant", "{X}{2}{G}", { oracleText: "Creatures of the creature type of your choice get +X/+X until end of turn." });
const trickery = card("Trickery Charm", "Instant", "{U}", {
  oracleText:
    "Choose one —\n• Target creature gains flying until end of turn.\n• Target creature becomes the creature type of your choice until end of turn.\n• Look at the top four cards of your library, then put them back in any order.",
});

describe("the creature type of your choice", () => {
  it("Mistform Dreamer becomes only the chosen type until end of turn", () => {
    supported(dreamer, sliver, tribalUnity, trickery);
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, dreamer);
    let s = run(s0, planActivate(s0, ap, d, 0));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "creatureType" });
    expect((s.pending as { options: string[] }).options).toContain("Goblin");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Goblin" }));
    expect(subtypes(s, d)).toEqual(["Goblin"]);
    s = passUntil(s, "upkeep");
    expect(subtypes(s, d)).toEqual(["Illusion"]);
  });

  it("Mistform Sliver's granted ability adds the type in addition to its other types", () => {
    const { s: s0, ap } = setup([]);
    const sl = putOnBattlefield(s0, ap, sliver);
    let s = run(s0, planActivate(s0, ap, sl, 0));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Elf" }));
    expect(subtypes(s, sl)).toEqual(expect.arrayContaining(["Illusion", "Sliver", "Elf"]));
  });

  it("Tribal Unity pumps every creature of the chosen type, whoever controls it", () => {
    const { s: s0, ap, ids, opp } = setup([tribalUnity]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    const elf = putOnBattlefield(s0, opp, bear({ name: "Elvish Bear", typeLine: "Creature — Elf", subtypes: ["Elf"] }));
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 2));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "creatureType" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Bear" }));
    const p = (id: string) => characteristics(s, s.objects[id]!).power;
    expect([p(mine), p(theirs), p(elf)]).toEqual([4, 4, 2]);
  });

  it("Trickery Charm: the target is chosen on casting, the type as it resolves", () => {
    const { s: s0, ap, ids, opp } = setup([trickery]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(b)], [1]));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Wall" }));
    expect(subtypes(s, b)).toEqual(["Wall"]);
  });
});
