// Hand disruption (CR 701.9b: an effect may let another player choose the card discarded): "Target opponent reveals
// their hand. You choose a nonland card from it. That player discards that card." (Thoughtseize, Duress, Inquisition
// of Kozilek), "... and exile that card" (Castigate), and the same on a creature's enters trigger.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, forest, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, botActions, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const thoughtseize = card("Thoughtseize", "Sorcery", "{B}", { oracleText: "Target player reveals their hand. You choose a nonland card from it. That player discards that card. You lose 2 life." });
const duress = card("Duress", "Sorcery", "{B}", { oracleText: "Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card." });
const inquisition = card("Inquisition of Kozilek", "Sorcery", "{B}", {
  oracleText: "Target player reveals their hand. You choose a nonland card from it with mana value 3 or less. That player discards that card.",
});
const castigate = card("Castigate", "Sorcery", "{W}{B}", { oracleText: "Target opponent reveals their hand. You choose a nonland card from it and exile that card." });
const raider = card("Gastal Raider", "Creature — Goblin Warrior", "{2}{R}", {
  power: "3",
  toughness: "3",
  oracleText: "When this creature enters, target opponent reveals their hand. You choose an instant or sorcery card from it. That player discards that card.\nMax speed — This creature gets +1/+1 and has menace.",
});
const appetite = card("Appetite for Brains", "Sorcery", "{B}", { oracleText: "Target opponent reveals their hand. You choose a card from it with mana value 4 or greater and exile that card." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const titan = card("Grave Titan", "Creature — Giant", "{4}{B}{B}", { power: "6", toughness: "6" });
const ring = card("Sol Ring", "Artifact", "{1}");

function toHand(s: GameState, pid: PlayerId, d: CardDef) {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
}
/** The opponent's hand is exactly these cards. */
function oppHand(s: GameState, opp: PlayerId, cards: CardDef[]) {
  const p = s.players[opp]!;
  for (const id of p.hand) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = [];
  return cards.map((d) => toHand(s, opp, d));
}
const at = (opp: PlayerId) => [{ kind: "player" as const, id: opp }];

describe("hand disruption", () => {
  it("compiles", () => {
    for (const d of [thoughtseize, duress, inquisition, castigate, raider, appetite]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Thoughtseize: the caster sees the whole hand and picks a nonland card; that player discards it; the caster loses 2 life", () => {
    const { s: s0, ap, opp, ids } = setup([thoughtseize]);
    const [land, bolt, big] = oppHand(s0, opp, [forest, shock, titan]);
    let s = cast(s0, ap, ids[0]!, at(opp));
    const pend = s.pending;
    expect(pend?.kind).toBe("searchLibrary");
    if (pend?.kind !== "searchLibrary") throw new Error();
    expect(pend.player).toBe(ap);
    expect(pend.hand).toBe(opp);
    expect(pend.dig?.looked.sort()).toEqual([land, bolt, big].sort());
    expect(pend.cards.sort()).toEqual([bolt, big].sort()); // not the land
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [land!] })).toThrow();
    const life = s.players[ap]!.life;
    s = act(s, { type: "searchLibrary", player: ap, found: [big!] });
    expect(s.objects[big!]!.zone).toBe("graveyard");
    expect(s.players[opp]!.hand.sort()).toEqual([land, bolt].sort());
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(s.log.some((e) => /reveals their hand/.test(e.text))).toBe(true);
  });

  it("Duress: only noncreature, nonland cards; with none, nothing is discarded", () => {
    const { s: s0, ap, opp, ids } = setup([duress]);
    oppHand(s0, opp, [forest, titan, bear()]);
    const s = cast(s0, ap, ids[0]!, at(opp));
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.hand.length).toBe(3);
    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([duress]);
    const [, r] = oppHand(s1, opp1, [titan, ring]);
    const t = cast(s1, ap1, ids1[0]!, at(opp1));
    expect(t.pending?.kind === "searchLibrary" && t.pending.cards).toEqual([r]);
  });

  it("Inquisition of Kozilek: mana value 3 or less; Appetite for Brains: 4 or greater, exiled", () => {
    const { s: s0, ap, opp, ids } = setup([inquisition]);
    const [bolt] = oppHand(s0, opp, [shock, titan]);
    const s = cast(s0, ap, ids[0]!, at(opp));
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toEqual([bolt]);
    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([appetite]);
    const [, big] = oppHand(s1, opp1, [shock, titan]);
    let t = cast(s1, ap1, ids1[0]!, at(opp1));
    expect(t.pending?.kind === "searchLibrary" && t.pending.cards).toEqual([big]);
    t = act(t, { type: "searchLibrary", player: ap1, found: [big!] });
    expect(t.objects[big!]!.zone).toBe("exile");
  });

  it("Castigate exiles the card; a choice is required when one matches", () => {
    const { s: s0, ap, opp, ids } = setup([castigate]);
    const [bolt] = oppHand(s0, opp, [shock]);
    let s = cast(s0, ap, ids[0]!, at(opp));
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [] })).toThrow();
    s = act(s, { type: "searchLibrary", player: ap, found: [bolt!] });
    expect(s.objects[bolt!]!.zone).toBe("exile");
    expect(s.players[opp]!.hand).toEqual([]);
  });

  it("an enters trigger (Gastal Raider), and a bot choosing takes the most expensive card", () => {
    const { s: s0, ap, opp, ids } = setup([raider]);
    const [, bolt] = oppHand(s0, opp, [titan, shock]);
    let s = cast(s0, ap, ids[0]!);
    // The trigger targets an opponent.
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: at(opp) });
    for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toEqual([bolt]);
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.objects[bolt!]!.zone).toBe("graveyard");
  });
});
