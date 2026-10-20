// Round 91: Guardian Project (an intervening "if" about the entering creature's name, CR 603.4), Entish Restoration
// ("If you control a creature with power 4 or greater, instead search ..."), Rise of the Dark Realms (all graveyards,
// under your control).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const project = card("Guardian Project", "Enchantment", "{3}{G}", { oracleText: "Whenever a nontoken creature you control enters, if it doesn't have the same name as another creature you control or a creature card in your graveyard, draw a card." });
const entish = card("Entish Restoration", "Instant", "{2}{G}", { oracleText: "Sacrifice a land. Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle. If you control a creature with power 4 or greater, instead search your library for up to three basic land cards, put them onto the battlefield tapped, then shuffle." });
const rise = card("Rise of the Dark Realms", "Sorcery", "{7}{B}{B}", { oracleText: "Put all creature cards from all graveyards onto the battlefield under your control." });
const elf = card("Elvish Mystic", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1" });

function toYard(s: GameState, pid: PlayerId, def: CardDef): string {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  Object.assign(s.objects[id]!, { zone: "graveyard" });
  s.players[pid]!.graveyard.push(id);
  return id;
}
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 91, more", () => {
  it("parse", () => {
    for (const d of [project, entish, rise]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Guardian Project: a card for the first of its name, not for a second one", () => {
    const { s: s0, ap, ids } = setup([bear(), bear(), elf]);
    putOnBattlefield(s0, ap, project);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    s = settle(cast(s, ap, ids[1]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 1);
    s = settle(cast(s, ap, ids[2]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 3 + 2);
  });

  it("Guardian Project: not with a creature card of that name in your graveyard", () => {
    const { s: s0, ap, ids } = setup([elf]);
    putOnBattlefield(s0, ap, project);
    toYard(s0, ap, elf);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("Entish Restoration: three lands with a big creature, two without", () => {
    const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;
    for (const big of [false, true]) {
      const { s: s0, ap, ids } = setup([entish]);
      if (big) putOnBattlefield(s0, ap, card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4" }));
      const before = lands(s0, ap);
      let s = cast(s0, ap, ids[0]!);
      for (let i = 0; i < 6 && s.pending; i++) {
        const p = s.pending;
        if (p.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: p.options.slice(0, p.count) });
        else if (p.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: p.cards.slice(0, p.max) });
        else break;
        s = settle(s);
      }
      expect(lands(s, ap)).toBe(before - 1 + (big ? 3 : 2));
    }
  });

  it("Rise of the Dark Realms: every graveyard's creature cards, under your control", () => {
    const { s: s0, ap, ids, opp } = setup([rise]);
    const a = toYard(s0, ap, elf);
    const b = toYard(s0, opp, bear());
    const s = cast(s0, ap, ids[0]!);
    for (const id of [a, b]) {
      expect(s.objects[id]!.zone).toBe("battlefield");
      expect(s.objects[id]!.controller).toBe(ap);
    }
  });
});

describe("Commander's Plate", () => {
  const plate = card("Commander's Plate", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +3/+3 and has protection from each color that's not in your commander's color identity.\nEquip commander {3}\nEquip {5}" });
  it("parse", () => expect(isFullySupported(plate)).toBe(true));

  it("protection from each color outside your commander's color identity", async () => {
    const { objHasKeyword, power, invalidateCharacteristics } = await import("../src");
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const cmd = Object.values(s.objects).find((o) => o.isCommander && o.owner === ap)!;
    s.cards[cmd.cardId] = { ...s.cards[cmd.cardId]!, colorIdentity: ["G", "W"] };
    s.objects[putOnBattlefield(s, ap, plate)]!.attachedTo = b;
    invalidateCharacteristics(s);
    const o = s.objects[b]!;
    expect(power(s, o)).toBe(5);
    for (const c of ["blue", "black", "red"]) expect(objHasKeyword(s, o, `Protection from ${c}`), c).toBe(true);
    for (const c of ["white", "green"]) expect(objHasKeyword(s, o, `Protection from ${c}`), c).toBe(false);
    // No commander: no protection (rulings).
    cmd.isCommander = false;
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[b]!, "Protection from blue")).toBe(false);
  });
});

describe("Chandra's Ignition", () => {
  const ignition = card("Chandra's Ignition", "Sorcery", "{3}{R}{R}", { oracleText: "Target creature you control deals damage equal to its power to each other creature and each opponent." });
  it("parse", () => expect(isFullySupported(ignition)).toBe(true));

  it("the creature deals damage equal to its power to each other creature and each opponent; lifelink is its own", () => {
    const { s: s0, ap, ids, opp } = setup([ignition]);
    const big = putOnBattlefield(s0, ap, card("Vampire Nighthawk Copy", "Creature — Vampire", "{1}{B}{B}", { power: "4", toughness: "4", keywords: ["Lifelink"] }));
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    const life = s0.players[ap]!.life;
    const s = cast(s0, ap, ids[0]!, [{ kind: "object", id: big }]);
    expect(s.battlefield).toContain(big);
    expect(s.battlefield).not.toContain(mine);
    expect(s.battlefield).not.toContain(theirs);
    for (const p of s.turnOrder.filter((p) => p !== ap)) expect(s.players[p]!.life).toBe(40 - 4);
    // 4 to each of two creatures and three opponents, all from the lifelinker.
    expect(s.players[ap]!.life).toBe(life + 20);
  });
});
