// Copies of Rooms (CR 709.5): the doors and the two static abilities of the shared type line are copiable values, the
// unlocked designations aren't. So a copy of a Room is the whole Room, and one that didn't enter as a cast door has
// both doors locked (709.5c-d), whatever the original has unlocked.

import { describe, expect, it } from "vitest";
import { act, card, island, putOnBattlefield, scry, setup, target } from "./helpers";
import { abilitiesOf, botActions, characteristics, isFullySupported, planCast, planUnlock, waitingOn, type Action, type GameState } from "../src";

const REMINDER = "\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)";
const pool = scry("split", [
  { name: "Bottomless Pool", mana_cost: "{U}", type_line: "Enchantment — Room", oracle_text: `When you unlock this door, return up to one target creature to its owner's hand.${REMINDER}` },
  { name: "Locker Room", mana_cost: "{4}{U}", type_line: "Enchantment — Room", oracle_text: `Whenever one or more creatures you control deal combat damage to a player, draw a card.${REMINDER}` },
]);
const glassworks = scry("split", [
  { name: "Glassworks", mana_cost: "{2}{R}", type_line: "Enchantment — Room", oracle_text: `When you unlock this door, this Room deals 4 damage to target creature an opponent controls.${REMINDER}` },
  { name: "Shattered Yard", mana_cost: "{4}{R}", type_line: "Enchantment — Room", oracle_text: `At the beginning of your end step, this Room deals 1 damage to each opponent.${REMINDER}` },
]);
const copyEnchantment = card("Copy Enchantment", "Enchantment", "{2}{U}", { oracleText: "You may have this enchantment enter as a copy of any enchantment on the battlefield." });
const flash = card("Copy Test", "Sorcery", "{1}{U}", { oracleText: "Create a token that's a copy of target permanent." });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;

describe("copies of Rooms (CR 709.5)", () => {
  it("the cards compile", () => {
    expect(isFullySupported(copyEnchantment)).toBe(true);
    expect(isFullySupported(flash)).toBe(true);
  });

  it("a token copy of a Room with a door unlocked is the whole Room, both doors locked", () => {
    const { s: s0, ap, ids } = setup([flash]);
    const r = putOnBattlefield(s0, ap, pool);
    let s = run(s0, planUnlock(s0, ap, r, 0) ?? []);
    s = settle(s);
    if (s.pending) s = settle(act(s, botActions(s, ap)[0]!));
    expect(name(s, r)).toBe("Bottomless Pool");
    s = settle(run(s, planCast(s, ap, ids[0]!, [target(r)])));
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(tok).toBeDefined();
    expect(s.objects[tok]!.unlocked).toEqual([]);
    expect(name(s, tok)).toBe("");
    // Its controller may unlock either door of the copy: it has both.
    for (const l of [island, island, island, island, island]) putOnBattlefield(s, ap, l);
    expect(planUnlock(s, ap, tok, 1)).not.toBeNull();
    s = settle(run(s, planUnlock(s, ap, tok, 1)));
    expect(name(s, tok)).toBe("Locker Room");
  });

  it("Copy Enchantment entering as a copy of a Room has both doors locked, and can unlock them", () => {
    const { s: s0, ap, ids } = setup([copyEnchantment]);
    const r = putOnBattlefield(s0, ap, glassworks);
    let s = run(s0, planUnlock(s0, ap, r, 1));
    s = settle(s);
    expect(name(s, r)).toBe("Shattered Yard");
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 40 && !(s.pending?.kind === "chooseOption" && s.pending.what === "copy"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: r }));
    const c = ids[0]!;
    expect(s.objects[c]!.zone).toBe("battlefield");
    expect(s.objects[c]!.unlocked).toEqual([]);
    expect(name(s, c)).toBe("");
    expect(planUnlock(s, ap, c, 1)).not.toBeNull();
    s = settle(run(s, planUnlock(s, ap, c, 1)));
    expect(name(s, c)).toBe("Shattered Yard");
  });

  it("a door's abilities keep their places as the other door unlocks", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, glassworks);
    let s = settle(run(s0, planUnlock(s0, ap, r, 1)));
    const before = abilitiesOf(s, s.objects[r]!).triggers.map((t) => t.body.text);
    expect(before).toHaveLength(1);
    s = settle(run(s, planUnlock(s, ap, r, 0)));
    if (s.pending) s = settle(act(s, botActions(s, ap)[0]!));
    const after = abilitiesOf(s, s.objects[r]!).triggers.map((t) => t.body.text);
    expect(after[0]).toBe(before[0]);
    expect(after).toHaveLength(2);
    expect(name(s, r)).toBe("Glassworks // Shattered Yard");
  });
});
