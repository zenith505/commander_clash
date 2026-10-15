// "Whenever you sacrifice ..." triggers (CR 701.21a), mana equal to a count ("Add an amount of {G} equal to ~'s
// power", "Add X mana of any one color, where X is ..."), and "Target player draws two cards and loses 2 life".

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, pt, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const bloodbriar = card("Bloodbriar", "Creature — Plant Elemental", "{2}{G}", {
  power: "2",
  toughness: "3",
  oracleText: "Whenever you sacrifice another permanent, put a +1/+1 counter on this creature.",
});
const tracker = card("Tireless Tracker", "Creature — Human Scout", "{2}{G}", {
  power: "3",
  toughness: "2",
  oracleText:
    'Landfall — Whenever a land you control enters, investigate. (Create a Clue token. It\'s an artifact with "{2}, Sacrifice this token: Draw a card.")\nWhenever you sacrifice a Clue, put a +1/+1 counter on this creature.',
});
const clue = card("Clue", "Artifact — Clue", "", { oracleText: "{2}, Sacrifice this artifact: Draw a card." });
const altar = card("Bone Altar", "Artifact", "{1}", { oracleText: "Sacrifice a creature: You gain 1 life." });
const joiner = card("Viridian Joiner", "Creature — Elf Druid", "{2}{G}", { power: "1", toughness: "2", oracleText: "{T}: Add an amount of {G} equal to this creature's power." });
const channeler = card("Wirewood Channeler", "Creature — Elf Druid", "{3}{G}", {
  power: "2",
  toughness: "2",
  oracleText: "{T}: Add X mana of any one color, where X is the number of Elves on the battlefield.",
});
const blossom = card("Lotus Blossom", "Artifact", "{2}", {
  oracleText: "At the beginning of your upkeep, you may put a petal counter on this artifact.\n{T}, Sacrifice this artifact: Add X mana of any one color, where X is the number of petal counters on this artifact.",
});
const signInBlood = card("Sign in Blood", "Sorcery", "{B}{B}", { oracleText: "Target player draws two cards and loses 2 life." });
const elf = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1" });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("sacrifice triggers, mana from counts, draw and lose life", () => {
  it("compile", () => {
    for (const d of [bloodbriar, tracker, joiner, channeler, blossom, signInBlood]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("whenever you sacrifice another permanent: costs count, the source itself and other players' sacrifices don't", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bloodbriar);
    const seer = putOnBattlefield(s0, ap, altar);
    const fodder = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, altar);
    const theirFodder = putOnBattlefield(s0, opp, bear());
    let s = act(s0, { type: "activateAbility", player: ap, objectId: seer, index: 0, costs: { sacrifice: [fodder] } });
    s = settle(s);
    expect(pt(s, b)).toBe("3/4");
    // Sacrificing Bloodbriar itself: "another" leaves it out.
    s = act(s, { type: "activateAbility", player: ap, objectId: seer, index: 0, costs: { sacrifice: [b] } });
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.triggerQueue.length + s.stack.filter((x) => x.sourceId === b).length).toBe(0);
    // An opponent sacrificing doesn't trigger a new Bloodbriar.
    const b2 = putOnBattlefield(s, ap, bloodbriar);
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "activateAbility", player: opp, objectId: theirs, index: 0, costs: { sacrifice: [theirFodder] } });
    expect(s.objects[theirFodder]!.zone).toBe("graveyard");
    expect(s.triggerQueue.some((t) => t.sourceId === b2) || s.stack.some((x) => x.sourceId === b2)).toBe(false);
  });

  it("whenever you sacrifice a Clue: only Clues", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tracker);
    const c = putOnBattlefield(s0, ap, clue);
    let s = activate(s0, ap, c, 0);
    s = settle(s);
    expect(s.objects[c]!.zone).toBe("graveyard");
    expect(pt(s, t)).toBe("4/3");
  });

  it("mana equal to its power, and X mana of one color counted as it's activated", () => {
    const { s: s0, ap } = setup([]);
    const j = putOnBattlefield(s0, ap, joiner);
    const ch = putOnBattlefield(s0, ap, channeler);
    putOnBattlefield(s0, ap, elf);
    s0.objects[j]!.counters["+1/+1"] = 2; // power 3
    let s = act(s0, { type: "activateMana", player: ap, objectId: j, mana: "G" });
    expect(s.players[ap]!.manaPool.G).toBe(3);
    // Three Elves: Joiner, Channeler, Llanowar Elves.
    s = act(s, { type: "activateMana", player: ap, objectId: ch, mana: "U" });
    expect(s.players[ap]!.manaPool.U).toBe(3);
  });

  it("Lotus Blossom: as many as its petal counters, though it's sacrificed to pay", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, blossom);
    s0.objects[l]!.counters.petal = 4;
    const s = act(s0, { type: "activateMana", player: ap, objectId: l, mana: "R" });
    expect(s.objects[l]!.zone).toBe("graveyard");
    expect(s.players[ap]!.manaPool.R).toBe(4);
  });

  it("target player draws two cards and loses 2 life", () => {
    const { s: s0, ap, ids, opp } = setup([signInBlood]);
    const hand = s0.players[opp]!.hand.length;
    const s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
    expect(s.players[opp]!.life).toBe(38);
  });
});
