// "You may activate abilities of creatures you control as though those creatures had haste" (Thousand-Year Elixir,
// Tyvar, CR 302.6): {T} abilities of creatures that just came under your control, mana abilities included. They don't
// gain haste, so they still can't attack (rulings).

import { describe, expect, it } from "vitest";
import { card, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, isFullySupported, objHasKeyword, type CardDef } from "../src";
import { manaAbilityProblem } from "../src/manaabilities";
import { potentialAttackers } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const elixir = card("Thousand-Year Elixir", "Artifact", "{3}", { oracleText: "You may activate abilities of creatures you control as though those creatures had haste.\n{1}, {T}: Untap target creature." });
const tyvar = card("Tyvar, Jubilant Brawler", "Legendary Planeswalker — Tyvar", "{1}{B}{G}", { loyalty: "3", oracleText: "You may activate abilities of creatures you control as though those creatures had haste.\n+1: Untap up to one target creature.\n−2: Mill three cards, then you may return a creature card with mana value 2 or less from your graveyard to the battlefield." });
const pinger = card("Prodigal Sorcerer", "Creature — Human Wizard", "{2}{U}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });
const elves = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });

describe("activate abilities as though creatures had haste", () => {
  it("parse", () => supported(elixir, tyvar));

  it("Thousand-Year Elixir: a creature that just arrived can use its {T} abilities, but can't attack", () => {
    const { s, ap } = setup([]);
    const p = putOnBattlefield(s, ap, pinger, { sick: true });
    const e = putOnBattlefield(s, ap, elves, { sick: true });
    expect(abilityProblem(s, ap, p, 0)).toMatch(/summoning sickness/);
    expect(manaAbilityProblem(s, ap, s.objects[e]!, 0)).toMatch(/summoning sickness/);
    putOnBattlefield(s, ap, elixir);
    expect(abilityProblem(s, ap, p, 0)).toBeNull();
    expect(manaAbilityProblem(s, ap, s.objects[e]!, 0)).toBeNull();
    expect(objHasKeyword(s, s.objects[p]!, "Haste")).toBe(false);
    expect(potentialAttackers(s, ap).map((o) => o.id)).not.toContain(p);
  });

  it("only creatures you control: an opponent's Elixir doesn't help", () => {
    const { s, ap, opp } = setup([]);
    const p = putOnBattlefield(s, ap, pinger, { sick: true });
    putOnBattlefield(s, opp, elixir);
    expect(abilityProblem(s, ap, p, 0)).toMatch(/summoning sickness/);
  });
});
