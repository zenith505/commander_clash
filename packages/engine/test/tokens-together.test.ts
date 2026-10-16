// Tokens created by one instruction enter at the same time (CR 608.2f): none counts another as it enters (CR 614.12), and
// each one's "whenever another creature enters" sees the others enter (CR 603.6a), as with cards moved together.

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const warden = card("Soul Warden", "Creature — Human Cleric", "{W}", { power: "1", toughness: "1", oracleText: "Whenever another creature enters, you gain 1 life." });
const procession = card("Anointed Procession", "Enchantment", "{3}{W}", { oracleText: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead." });
const counterpart = card("Cackling Counterpart", "Instant", "{1}{U}{U}", { keywords: ["Flashback"], oracleText: "Create a token that's a copy of target creature you control.\nFlashback {5}{U}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const chauffeur = card("Boss's Chauffeur", "Creature — Elf Citizen", "{4}{W}", {
  power: "0",
  toughness: "0",
  keywords: ["Alliance"],
  oracleText: "This creature enters with a number of +1/+1 counters on it equal to one plus the number of other creatures you control.\nAlliance — Whenever another creature you control enters, put a +1/+1 counter on this creature.\nWhen this creature dies, create a 1/1 green and white Citizen creature token for each +1/+1 counter on it.",
});

describe("tokens created together", () => {
  it("compiles them", () => supported(warden, procession, counterpart, chauffeur));

  it("two Soul Warden copies see each other enter: 4 life, not 3", () => {
    let { s, ap, ids } = setup([counterpart]);
    const w = putOnBattlefield(s, ap, warden);
    putOnBattlefield(s, ap, procession);
    const life = s.players[ap]!.life;
    for (const a of planCast(s, ap, ids[0]!, [target(w)])!) s = act(s, a);
    s = settle(s);
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken)).toHaveLength(2);
    expect(s.players[ap]!.life).toBe(life + 4);
  });

  it("Boss's Chauffeur copies don't count each other as they enter, then each gets an alliance counter for the other", () => {
    let { s, ap, ids } = setup([counterpart]);
    const c = putOnBattlefield(s, ap, chauffeur);
    s.objects[c]!.counters["+1/+1"] = 1;
    putOnBattlefield(s, ap, procession);
    for (const a of planCast(s, ap, ids[0]!, [target(c)])!) s = act(s, a);
    // Resolve the copy spell only.
    for (let i = 0; i < 8 && s.stack.length === 1; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(tokens.map((id) => s.objects[id]!.counters["+1/+1"])).toEqual([2, 2]); // one plus the original Chauffeur
    s = settle(s);
    expect(tokens.map((id) => s.objects[id]!.counters["+1/+1"])).toEqual([3, 3]);
    expect(s.objects[c]!.counters["+1/+1"]).toBe(3);
  });
});
