// "Whenever ~ becomes untapped" (inspired) and "whenever a permanent (you control) becomes untapped": a permanent that
// changes from tapped to untapped (CR 701.26b), in its controller's untap step (CR 502.3) or by an effect. Untapping an
// untapped permanent, or a stun counter removed instead (CR 122.1d), isn't that. What triggers during the untap step is
// put on the stack in the upkeep, when a player next gets priority (CR 502.4).

import { describe, expect, it } from "vitest";
import { act, card, passAll, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, untapPermanent, type CardDef, type GameState } from "../src";
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const disciple = card("Sphinx's Disciple", "Creature — Human Wizard", "{2}{U}{U}", { power: "2", toughness: "2", keywords: ["Flying", "Inspired"], oracleText: "Flying\nInspired — Whenever this creature becomes untapped, draw a card." });
const butcher = card("Kragma Butcher", "Creature — Minotaur Warrior", "{2}{R}", { power: "2", toughness: "3", keywords: ["Inspired"], oracleText: "Inspired — Whenever this creature becomes untapped, it gets +2/+0 until end of turn." });
const tromper = card("Pheres-Band Tromper", "Creature — Centaur Warrior", "{3}{G}", { power: "3", toughness: "3", keywords: ["Inspired"], oracleText: "Inspired — Whenever this creature becomes untapped, put a +1/+1 counter on it." });
const worshippers = card("Aerie Worshippers", "Creature — Human Cleric", "{3}{U}", { power: "2", toughness: "4", keywords: ["Inspired"], oracleText: "Inspired — Whenever this creature becomes untapped, you may pay {2}{U}. If you do, create a 2/2 blue Bird enchantment creature token with flying." });
const orb = card("Mesmeric Orb", "Artifact", "{2}", { oracleText: "Whenever a permanent becomes untapped, that permanent's controller mills a card." });
const thrasher = card("Wake Thrasher", "Creature — Merfolk Soldier", "{2}{U}{U}", { power: "1", toughness: "1", oracleText: "Whenever a permanent you control becomes untapped, this creature gets +1/+1 until end of turn." });
const wellRested = card("Well Rested", "Enchantment — Aura", "{1}{G}", { oracleText: "Enchant creature\nEnchanted creature has \"Whenever this creature becomes untapped, put two +1/+1 counters on it, then you gain 2 life and draw a card. This ability triggers only once each turn.\"" });
const servant = card("Servant of Tymaret", "Creature — Zombie", "{2}{B}", { power: "3", toughness: "1", keywords: ["Inspired"], oracleText: "Inspired — Whenever this creature becomes untapped, each opponent loses 1 life. You gain life equal to the life lost this way.\n{2}{B}: Regenerate this creature." });

/** Everyone passes until the stack is empty. */
const resolveAll = (s: GameState) => {
  while (s.stack.length && !s.pending) s = passAll(s);
  return s;
};

describe("becomes untapped", () => {
  it("parse", () => {
    supported(disciple, butcher, tromper, worshippers, orb, thrasher, wellRested, servant);
  });

  it("in its controller's untap step: the trigger goes on the stack in the upkeep (Sphinx's Disciple draws)", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, disciple);
    s0.objects[d]!.tapped = true;
    let s = passUntil(s0, "upkeep", (ap + 1) % 4);
    expect(s.stack.length).toBe(0); // someone else's untap step doesn't untap it
    s = passUntil(s, "upkeep", ap);
    expect(s.objects[d]!.tapped).toBe(false);
    expect(s.stack.length).toBe(1);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("untapped by an effect: Kragma Butcher gets +2/+0, Pheres-Band Tromper gets a counter; untapped already does nothing", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, butcher);
    const t = putOnBattlefield(s0, ap, tromper);
    s0.objects[b]!.tapped = true;
    untapPermanent(s0, s0.objects[b]!);
    untapPermanent(s0, s0.objects[t]!); // not tapped: it doesn't become untapped
    const s = resolveAll(act(s0, { type: "passPriority", player: ap }));
    expect(pt(s, b)).toBe("4/3");
    expect(pt(s, t)).toBe("3/3");
  });

  it("a stun counter removed instead isn't untapping", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tromper);
    s0.objects[t]!.tapped = true;
    s0.objects[t]!.counters.stun = 1;
    untapPermanent(s0, s0.objects[t]!);
    const s = resolveAll(act(s0, { type: "passPriority", player: ap }));
    expect(s.objects[t]!.tapped).toBe(true);
    expect(pt(s, t)).toBe("3/3");
  });

  it("Aerie Worshippers: you may pay {2}{U} for a Bird", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, worshippers);
    s0.objects[w]!.tapped = true;
    untapPermanent(s0, s0.objects[w]!);
    let s = passAll(act(s0, { type: "passPriority", player: ap }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { mana: "{2}{U}" } });
    addMana(s, ap, ["C", "C", "U"], {});
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(true);
  });

  it("Mesmeric Orb: each permanent that untaps makes its controller mill a card; Wake Thrasher counts yours", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, orb);
    const th = putOnBattlefield(s0, ap, thrasher);
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Land")).slice(0, 3);
    for (const id of lands) s0.objects[id]!.tapped = true;
    const yard = s0.players[ap]!.graveyard.length;
    for (const id of lands) untapPermanent(s0, s0.objects[id]!);
    const s = resolveAll(act(s0, { type: "passPriority", player: ap }));
    expect(s.players[ap]!.graveyard.length).toBe(yard + 3);
    expect(pt(s, th)).toBe("4/4");
  });

  it("Well Rested's granted ability triggers only once each turn", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, servant);
    const aura = putOnBattlefield(s0, ap, wellRested);
    s0.objects[aura]!.attachedTo = c;
    const life = s0.players[ap]!.life;
    for (let i = 0; i < 2; i++) {
      s0.objects[c]!.tapped = true;
      untapPermanent(s0, s0.objects[c]!);
    }
    const s = resolveAll(act(s0, { type: "passPriority", player: ap }));
    expect(s.objects[c]!.counters["+1/+1"]).toBe(2);
    // Servant of Tymaret's own inspired twice (3 opponents lose 1 each time), Well Rested's 2 life once.
    expect(s.players[ap]!.life).toBe(life + 3 + 3 + 2);
  });
});
