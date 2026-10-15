// Increment (CR 702.191a), transmute (CR 702.53a), "if you would gain life, you gain twice that much life instead" (CR
// 614.1a), and the predefined tokens Lander and Map (CR 111.10s, 111.10u).

import { describe, expect, it } from "vitest";
import { act, activate, card, cast, pt, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const graffalon = card("Hungry Graffalon", "Creature — Giraffe", "{3}{G}", {
  power: "3",
  toughness: "4",
  keywords: ["Reach", "Increment"],
  oracleText: "Reach\nIncrement (Whenever you cast a spell, if the amount of mana you spent is greater than this creature's power or toughness, put a +1/+1 counter on this creature.)",
});
const drift = card("Drift of Phantasms", "Creature — Spirit", "{2}{U}", {
  cmc: 3,
  power: "0",
  toughness: "5",
  keywords: ["Defender", "Flying", "Transmute"],
  oracleText: "Defender (This creature can't attack.)\nFlying\nTransmute {1}{U}{U} ({1}{U}{U}, Discard this card: Search your library for a card with the same mana value as this card, reveal it, put it into your hand, then shuffle. Transmute only as a sorcery.)",
});
const faithmender = card("Rhox Faithmender", "Creature — Rhino Monk", "{3}{W}", {
  power: "1",
  toughness: "5",
  keywords: ["Lifelink"],
  oracleText: "Lifelink (Damage dealt by this creature also causes you to gain that much life.)\nIf you would gain life, you gain twice that much life instead.",
});
const healing = card("Healing Salve", "Instant", "{W}", { oracleText: "Choose one —\n• Target player gains 3 life.\n• Prevent the next 3 damage that would be dealt to any target this turn." });
const wayfarer = card("Galactic Wayfarer", "Creature — Human Scout", "{2}{G}", {
  power: "3",
  toughness: "2",
  oracleText: "When this creature enters, create a Lander token. (It's an artifact with \"{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\")",
});
const companion = card("Cartographer's Companion", "Artifact Creature — Gnome", "{3}", {
  power: "2",
  toughness: "2",
  oracleText: "When this creature enters, create a Map token. (It's an artifact with \"{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery.\")",
});
const ogre = card("Big Ogre", "Creature — Ogre", "{4}{R}", { power: "5", toughness: "5" });
const elf = card("Small Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tokenNamed = (s: GameState, name: string) => s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === name);

describe("increment, transmute, life doubling, Lander and Map", () => {
  it("compile", () => {
    for (const d of [graffalon, drift, faithmender, wayfarer, companion]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("increment: a spell with more mana spent than its power or toughness gives it a +1/+1 counter", () => {
    const { s: s0, ap, ids } = setup([ogre, elf]);
    const g = putOnBattlefield(s0, ap, graffalon);
    let s = settle(cast(s0, ap, ids[0]!)); // 5 mana: more than 3 power
    expect(pt(s, g)).toBe("4/5");
    s = settle(cast(s, ap, ids[1]!)); // 1 mana: not more than either
    expect(pt(s, g)).toBe("4/5");
  });

  it("transmute: discard it to find a card with the same mana value", () => {
    const three = card("Three Drop", "Creature — Bear", "{2}{G}", { cmc: 3, power: "3", toughness: "3" });
    const { s: s0, ap, ids } = setup([drift]);
    const lib = s0.players[ap]!.library;
    const t = putOnBattlefield(s0, ap, three);
    s0.battlefield.splice(s0.battlefield.indexOf(t), 1);
    s0.objects[t]!.zone = "library";
    lib.splice(10, 0, t);
    let s = activate(s0, ap, ids[0]!, 0);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [t] });
    s = act(s, { type: "searchLibrary", player: ap, found: [t] });
    expect(s.objects[t]!.zone).toBe("hand");
  });

  it("life gain is doubled, twice with two", () => {
    const { s: s0, ap, ids } = setup([healing, healing]);
    putOnBattlefield(s0, ap, faithmender);
    const life = s0.players[ap]!.life;
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: ap }], [0]));
    expect(s.players[ap]!.life).toBe(life + 6);
    putOnBattlefield(s, ap, faithmender);
    s = settle(cast(s, ap, ids[1]!, [{ kind: "player", id: ap }], [0]));
    expect(s.players[ap]!.life).toBe(life + 6 + 12);
  });

  it("a Lander finds a basic land tapped; a Map makes a creature explore", () => {
    const { s: s0, ap, ids } = setup([wayfarer, companion]);
    let s = settle(cast(s0, ap, ids[0]!));
    const lander = tokenNamed(s, "Lander Token")!;
    expect(lander).toBeDefined();
    s = activate(s, ap, lander, 0);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const land = (s.pending as { cards: string[] }).cards[0]!;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [land] }));
    expect(s.objects[land]!).toMatchObject({ zone: "battlefield", tapped: true });
    s = settle(cast(s, ap, ids[1]!));
    const map = tokenNamed(s, "Map Token")!;
    const top = s.players[ap]!.library[0]!;
    s = settle(activate(s, ap, map, 0, [{ kind: "object", id: ids[0]! }]));
    // The top card was a land (into the hand) or not (a +1/+1 counter, then a choice about the card).
    expect(s.objects[top]!.zone === "hand" || s.objects[ids[0]!]!.counters["+1/+1"] === 1).toBe(true);
  });
});
