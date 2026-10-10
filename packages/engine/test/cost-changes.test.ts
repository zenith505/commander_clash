// Spells that cost more or less (CR 601.2f): permanents' "Creature spells you cast cost {1} less to cast",
// "Noncreature spells cost {1} more to cast", and a spell's own "This spell costs {1} less to cast for each
// ..." / "... if ...". Increases come first; reductions only take off generic mana (CR 118.7a).

import { describe, expect, it } from "vitest";
import { addEffect, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, spellCost, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
/** What casting it costs right now, as text: colored symbols, then generic. */
const costOf = (s: GameState, pid: number, id: string) => {
  const c = spellCost(s, pid, s.objects[id]!);
  return `${c.cost.symbols.map((x) => ("color" in x ? x.color : x.kind)).join("")}+${c.extra}`;
};

const electro = card("Electro Test", "Creature — Goblin Wizard", "{1}{U}{R}", { power: "2", toughness: "2", oracleText: "Instant and sorcery spells you cast cost {1} less to cast." });
const thalia = card("Thalia Test", "Legendary Creature — Human Soldier", "{1}{W}", { power: "2", toughness: "1", oracleText: "First strike\nNoncreature spells cost {1} more to cast.", keywords: ["First strike"] });
const drake = card("Drake Test", "Creature — Drake", "{3}{U}", { power: "2", toughness: "2", oracleText: "During turns other than yours, spells you cast cost {1} less to cast." });
const shock = card("Shock Test", "Instant", "{R}", { oracleText: "Shock Test deals 2 damage to any target." });
const blast = card("Blast Test", "Sorcery", "{2}{R}", { oracleText: "Blast Test deals 3 damage to any target." });
const ghoul = card("Ghoul Test", "Creature — Zombie", "{7}{G}", { power: "6", toughness: "6", oracleText: "This spell costs {1} less to cast for each creature card in your graveyard." });
const journey = card("Journey Test", "Sorcery", "{4}{U}", { oracleText: "This spell costs {2} less to cast if you control a Wizard.\nDraw two cards." });

describe("cost changes", () => {
  it("compiles them", () => supported(electro, thalia, drake, ghoul, journey));

  it("reduces only generic mana, and only your matching spells", () => {
    const { s, ap, ids, opp } = setup([shock, blast, bear()]);
    expect(costOf(s, ap, ids[1]!)).toBe("R+2");
    putOnBattlefield(s, ap, electro);
    expect(costOf(s, ap, ids[0]!)).toBe("R+0"); // can't take off the {R} (CR 118.7a)
    expect(costOf(s, ap, ids[1]!)).toBe("R+1");
    expect(costOf(s, ap, ids[2]!)).toBe("G+1"); // a creature spell
    // An opponent's Electromancer does nothing for you.
    const { s: t, ap: tap, ids: tids, opp: topp } = setup([blast]);
    putOnBattlefield(t, topp, electro);
    expect(costOf(t, tap, tids[0]!)).toBe("R+2");
    void opp;
  });

  it("taxes everyone's noncreature spells, the controller's too; increases come before reductions", () => {
    const { s, ap, ids, opp } = setup([shock, blast, bear()]);
    putOnBattlefield(s, opp, thalia);
    expect(costOf(s, ap, ids[0]!)).toBe("R+1");
    expect(costOf(s, ap, ids[2]!)).toBe("G+1");
    putOnBattlefield(s, ap, electro);
    expect(costOf(s, ap, ids[0]!)).toBe("R+0"); // {R}+{1}-{1}
    expect(costOf(s, ap, ids[1]!)).toBe("R+2");
  });

  it("stops when the permanent loses its abilities", () => {
    const { s, ap, ids } = setup([blast]);
    const e = putOnBattlefield(s, ap, electro);
    expect(costOf(s, ap, ids[0]!)).toBe("R+1");
    addEffect(s, ap, [e], [{ kind: "loseAllAbilities" }]);
    expect(costOf(s, ap, ids[0]!)).toBe("R+2");
  });

  it("during turns other than yours", () => {
    const { s: s0, ap, ids } = setup([blast]);
    putOnBattlefield(s0, ap, drake);
    expect(costOf(s0, ap, ids[0]!)).toBe("R+2");
    const s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(costOf(s, ap, ids[0]!)).toBe("R+1");
  });

  it("a spell's own reductions: for each, and if", () => {
    const { s, ap, ids } = setup([ghoul, journey]);
    expect(costOf(s, ap, ids[0]!)).toBe("G+7");
    for (let i = 0; i < 3; i++) {
      const id = putOnBattlefield(s, ap, bear());
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "graveyard";
      s.players[ap]!.graveyard.push(id);
    }
    expect(costOf(s, ap, ids[0]!)).toBe("G+4");
    expect(costOf(s, ap, ids[1]!)).toBe("U+4");
    putOnBattlefield(s, ap, electro); // a Goblin Wizard
    expect(costOf(s, ap, ids[1]!)).toBe("U+1"); // {2} less, and {1} less for a sorcery
  });
});
