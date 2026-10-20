// Round 94: "whenever a player plays a land" (CR 305.1): playing one, not putting one onto the battlefield with an effect
// (rulings on Burgeoning, Horn of Greed); Archaeomancer's Map's "if that player controls more lands than you", the
// entering land's controller, checked as it triggers and resolves (rulings, CR 603.4).

import { describe, expect, it } from "vitest";
import { act, card, cast, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const burgeoning = card("Burgeoning", "Enchantment", "{G}", { oracleText: "Whenever an opponent plays a land, you may put a land card from your hand onto the battlefield." });
const horn = card("Horn of Greed", "Artifact", "{3}", { oracleText: "Whenever a player plays a land, that player draws a card." });
const wurm = card("Dirtcowl Wurm", "Creature — Wurm", "{4}{G}", { power: "3", toughness: "4", oracleText: "Whenever an opponent plays a land, put a +1/+1 counter on this creature." });
const map = card("Archaeomancer's Map", "Artifact", "{2}{W}", { oracleText: "When this artifact enters, search your library for up to two basic Plains cards, reveal them, put them into your hand, then shuffle.\nWhenever a land an opponent controls enters, if that player controls more lands than you, you may put a land card from your hand onto the battlefield." });
const ramp = card("Rampant Growth", "Sorcery", "{1}{G}", { oracleText: "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle." });

const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const step = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = step(s);
  return s;
};
const landsOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;

describe("playing a land", () => {
  it("parse", () => {
    for (const d of [burgeoning, horn, wurm, map]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Burgeoning: when an opponent plays a land, you may put one from your hand; not on your own land play", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, burgeoning);
    const w = putOnBattlefield(s0, ap, wurm);
    const mine = toHand(s0, ap, forest);
    const mine2 = toHand(s0, ap, forest);
    // Our own land play doesn't trigger it.
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: mine2 }));
    expect(s.pending).toBeNull();
    expect(s.objects[w]!.counters["+1/+1"] ?? 0).toBe(0);
    s = passUntil(s, "main1", opp);
    const theirs = toHand(s, opp, forest);
    s = act(s, { type: "playLand", player: opp, objectId: theirs });
    for (let i = 0; i < 20 && !s.pending; i++) s = step(s);
    expect(s.pending).toMatchObject({ player: ap });
    const before = landsOf(s, ap);
    for (let i = 0; i < 5 && s.pending; i++) {
      const p = s.pending!;
      s = p.kind === "chooseMay" ? act(s, { type: "chooseMay", player: ap, yes: true }) : act(s, { type: "searchLibrary", player: ap, found: [mine] });
    }
    s = settle(s);
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(landsOf(s, ap)).toBe(before + 1);
    expect(s.objects[w]!.counters["+1/+1"]).toBe(1);
  });

  it("Horn of Greed: the player who played the land draws; a land put onto the battlefield by a spell doesn't count", () => {
    const { s: s0, ap, opp, ids } = setup([ramp]);
    putOnBattlefield(s0, opp, horn);
    const l = toHand(s0, ap, forest);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: l }));
    expect(s.players[ap]!.hand.length).toBe(hand); // one played, one drawn
    expect(s.players[opp]!.hand.length).toBe(s0.players[opp]!.hand.length);
    s = cast(s, ap, ids[0]!);
    for (let i = 0; i < 5 && s.pending?.kind === "searchLibrary"; i++) s = settle(act(s, { type: "searchLibrary", player: ap, found: s.pending.cards.slice(0, 1) }));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  for (const more of [true, false])
    it(`Archaeomancer's Map: ${more ? "a land when that opponent has more lands" : "nothing when they don't"}`, () => {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, ap, map);
      const mine = toHand(s0, ap, forest);
      let s = passUntil(s0, "main1", opp);
      // We have 14 lands from setup; they get 14 (then one more makes 15) or 13 (14 after: not more).
      for (let i = 0; i < (more ? 14 : 13); i++) putOnBattlefield(s, opp, forest);
      const theirs = toHand(s, opp, forest);
      s = act(s, { type: "playLand", player: opp, objectId: theirs });
      for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = step(s);
      if (!more) {
        expect(s.pending).toBeNull();
        expect(s.objects[mine]!.zone).toBe("hand");
        return;
      }
      for (let i = 0; i < 5 && s.pending; i++) {
        const p = s.pending!;
        s = p.kind === "chooseMay" ? act(s, { type: "chooseMay", player: ap, yes: true }) : act(s, { type: "searchLibrary", player: ap, found: [mine] });
      }
      s = settle(s);
      expect(s.objects[mine]!.zone).toBe("battlefield");
    });
});
