// "At the beginning of your end step, if you didn't attack with a creature this turn, sacrifice ~" (Curious
// Obsession, See Red): checked as it triggers and as it resolves (CR 603.4). Any creature you attacked with counts,
// not only the enchanted one; one put onto the battlefield attacking wasn't declared as an attacker (CR 508.4).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const curiousObsession = card("Curious Obsession", "Enchantment — Aura", "{U}", {"keywords":["Enchant"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+1 and has \"Whenever this creature deals combat damage to a player, you may draw a card.\"\nAt the beginning of your end step, if you didn't attack with a creature this turn, sacrifice this Aura."});
const seeRed = card("See Red", "Enchantment — Aura", "{1}{R}", {"keywords":["Enchant"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+1 and has first strike.\nAt the beginning of your end step, if you didn't attack with a creature this turn, sacrifice this Aura."});
const bears = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2", oracleText: "" });

describe("if you didn't attack with a creature this turn", () => {
  it("compiles", () => supported(curiousObsession, seeRed));

  it("Curious Obsession: sacrificed at your end step if you didn't attack", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bears);
    const aura = putOnBattlefield(s0, ap, curiousObsession);
    s0.objects[aura]!.attachedTo = b;
    const s = settle(passUntil(s0, "end", ap));
    expect(s.objects[aura]!.zone).toBe("graveyard");
  });

  it("See Red: kept if you attacked with any creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bears);
    const other = putOnBattlefield(s0, ap, bears);
    const aura = putOnBattlefield(s0, ap, seeRed);
    s0.objects[aura]!.attachedTo = b;
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: other, defender: opp }] });
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[aura]!.zone).toBe("battlefield");
  });
});
