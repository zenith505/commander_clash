// "Creatures your opponents control enter tapped" and the like: replacement effects on other permanents entering
// (CR 614.1c, 614.12), checked against the permanent as it would exist on the battlefield.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};

// Real oracle text (Scryfall).
const authority = card("Authority of the Consuls", "Enchantment", "{W}", { oracleText: "Creatures your opponents control enter tapped.\nWhenever a creature an opponent controls enters, you gain 1 life." });
const thalia = card("Thalia, Heretic Cathar", "Legendary Creature — Human Soldier", "{2}{W}", {
  power: "3",
  toughness: "2",
  keywords: ["First strike"],
  oracleText: "First strike\nCreatures and nonbasic lands your opponents control enter tapped.",
});
const ruins = card("Mystic Ruins Test", "Land", "", { oracleText: "{T}: Add {C}." });

describe("others enter tapped", () => {
  it("an opponent's creature enters tapped; your own doesn't", () => {
    supported(authority, thalia);
    const { s: s0, ap, ids, opp } = setup([bear()]);
    putOnBattlefield(s0, opp, authority);
    const mine = toHand(s0, opp, bear());
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = settle(s);
    expect(s.objects[ids[0]!]).toMatchObject({ zone: "battlefield", tapped: true });
    // The enchantment's controller's own creature, on their turn: untapped.
    s = passUntil(s, "main1", opp);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, opp, forest);
    for (const a of planCast(s, opp, mine)!) s = act(s, a);
    s = settle(s);
    expect(s.objects[mine]).toMatchObject({ zone: "battlefield", tapped: false });
  });

  it("Thalia: an opponent's nonbasic land enters tapped, a basic land doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, thalia);
    const land = toHand(s0, ap, ruins);
    const basic = toHand(s0, ap, forest);
    let s = act(s0, { type: "playLand", player: ap, objectId: land });
    expect(s.objects[land]).toMatchObject({ zone: "battlefield", tapped: true });
    s.players[ap]!.landsPlayedThisTurn = 0;
    s = act(s, { type: "playLand", player: ap, objectId: basic });
    expect(s.objects[basic]).toMatchObject({ zone: "battlefield", tapped: false });
  });
});
