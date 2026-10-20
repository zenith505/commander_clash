// Round 93: "Mill three cards. You may put a land card from among them into your hand." (Six, Ainok Wayfarer and
// others): one of the cards that mill just put into your graveyard, not any other card there; "If you don't, put a
// +1/+1 counter on this creature." Six's "During your turn, nonland permanent cards in your graveyard have retrace."

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { graveyardWays, isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const six = card("Six", "Legendary Creature — Treefolk", "{2}{G}", { power: "2", toughness: "4", keywords: ["Reach", "Mill"], oracleText: "Reach\nWhenever Six attacks, mill three cards. You may put a land card from among them into your hand.\nDuring your turn, nonland permanent cards in your graveyard have retrace. (You may cast permanent cards from your graveyard by discarding a land card in addition to paying their other costs.)" });
const ainok = card("Ainok Wayfarer", "Creature — Dog Scout", "{1}{G}", { power: "1", toughness: "1", keywords: ["Mill"], oracleText: "When this creature enters, mill three cards. You may put a land card from among them into your hand. If you don't, put a +1/+1 counter on this creature. (To mill three cards, put the top three cards of your library into your graveyard.)" });

/** Puts `defs` on top of `pid`'s library, the first one on top. */
function onTop(s: GameState, pid: PlayerId, defs: CardDef[]) {
  const ids = defs.map((def) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  return ids;
}
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const step = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });

describe("a card from among the milled ones", () => {
  it("parse", () => {
    for (const d of [six, ainok]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Six: only the milled land cards are offered; nonland permanent cards have retrace on your turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const sx = putOnBattlefield(s0, ap, six);
    const older = toYard(s0, ap, forest);
    const [land, b1, b2] = onTop(s0, ap, [forest, bear(), bear()]) as [string, string, string];
    expect(graveyardWays(s0, s0.objects[older]!)).toEqual([]); // a land card
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: sx, defender: opp }] });
    for (let i = 0; i < 20 && !s.pending; i++) s = step(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromGraveyard: "hand", cards: [land], max: 1, min: 0 });
    s = act(s, { type: "searchLibrary", player: ap, found: [land] });
    expect(s.objects[land]!.zone).toBe("hand");
    expect(s.objects[older]!.zone).toBe("graveyard");
    expect(graveyardWays(s, s.objects[b1]!).map((g) => g.kind)).toEqual(["grantedRetrace"]);
    void b2;
  });

  for (const take of [true, false])
    it(`Ainok Wayfarer: ${take ? "a land card to your hand, no counter" : "none taken: a +1/+1 counter"}`, () => {
      const { s: s0, ap } = setup([ainok]);
      const [land] = onTop(s0, ap, [forest, bear(), bear()]) as [string];
      const ids = s0.players[ap]!.hand.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Ainok Wayfarer");
      let s = s0;
      s = planCast(s, ap, ids[0]!)!.reduce((x, a) => act(x, a), s);
      for (let i = 0; i < 20 && !s.pending; i++) s = step(s);
      s = act(s, { type: "searchLibrary", player: ap, found: take ? [land] : [] });
      for (let i = 0; i < 20 && s.stack.length && !s.pending; i++) s = step(s);
      expect(s.objects[land]!.zone).toBe(take ? "hand" : "graveyard");
      expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(take ? 0 : 1);
    });
});
