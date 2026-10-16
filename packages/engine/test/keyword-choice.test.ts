// "Gains your choice of menace or lifelink until end of turn": the keyword is chosen as the spell or ability resolves
// (CR 608.2d, Rattleback Apothecary's rulings), from the ones it lists, and the creature gains only that one.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, compileCard, isFullySupported, objHasKeyword, planActivate, type CardDef, type GameState } from "../src";

// Real oracle text (Scryfall).
const gift = card("Alchemist's Gift", "Instant", "{B}", { oracleText: "Target creature gets +1/+1 and gains your choice of deathtouch or lifelink until end of turn. (Any amount of damage a creature with deathtouch deals to a creature is enough to destroy it. Damage dealt by a creature with lifelink also causes its controller to gain that much life.)" });
const initiate = card("Assassin Initiate", "Creature — Human Assassin", "{B}", { power: "1", toughness: "1", oracleText: "{1}: This creature gains your choice of flying, deathtouch, or lifelink until end of turn." });
const apothecary = card("Rattleback Apothecary", "Creature — Gorgon Warlock", "{2}{B}", { power: "3", toughness: "2", keywords: ["Deathtouch"], oracleText: "Deathtouch\nWhenever you commit a crime, target creature you control gains your choice of menace or lifelink until end of turn. (Targeting opponents, anything they control, and/or cards in their graveyards is a crime.)" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const has = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);

describe("your choice of keywords", () => {
  it("compiles them", () => {
    supported(gift, initiate, apothecary);
    expect(compileCard(gift).spell!.effects[0]).toEqual({ type: "choose", choice: "keyword", options: ["Deathtouch", "Lifelink"] });
  });

  it("Alchemist's Gift: chosen as it resolves; only the chosen keyword, until end of turn", () => {
    let { s, ap, ids } = setup([gift]);
    const b = putOnBattlefield(s, ap, bear());
    s = cast(s, ap, ids[0]!, [target(b)]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "keyword", options: ["Deathtouch", "Lifelink"] });
    expect(() => applyAction(s, { type: "chooseOption", player: ap, choice: "Flying" })).toThrow();
    s = act(s, { type: "chooseOption", player: ap, choice: "Lifelink" });
    expect(has(s, b, "Lifelink")).toBe(true);
    expect(has(s, b, "Deathtouch")).toBe(false);
  });

  it("Assassin Initiate: each activation chooses again", () => {
    let { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, initiate);
    for (const [i, k] of ["Flying", "Deathtouch"].entries()) {
      for (const x of planActivate(s, ap, a, 0)!) s = act(s, x);
      s = passAll(s);
      expect(s.pending, `activation ${i}`).toMatchObject({ kind: "chooseOption", what: "keyword", options: ["Flying", "Deathtouch", "Lifelink"] });
      s = act(s, { type: "chooseOption", player: ap, choice: k });
    }
    expect(has(s, a, "Flying") && has(s, a, "Deathtouch") && !has(s, a, "Lifelink")).toBe(true);
  });

  it("Rattleback Apothecary: a crime triggers it; a bot picks a keyword", () => {
    let { s, ap, ids, opp } = setup([shock]);
    putOnBattlefield(s, ap, apothecary);
    const b = putOnBattlefield(s, ap, bear());
    s = cast(s, ap, ids[0]!, [{ kind: "player", id: opp }]);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseOption"; i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(b)] });
      else s = passAll(s);
    }
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "keyword", options: ["Menace", "Lifelink"] });
    const pick = botActions(s, ap)[0];
    expect(pick).toMatchObject({ type: "chooseOption", choice: "Menace" });
    s = act(s, pick!);
    expect(s.battlefield.filter((id) => has(s, id, "Menace")).length).toBe(1);
  });
});
