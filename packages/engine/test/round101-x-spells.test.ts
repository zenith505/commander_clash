// Round 101: Martial Coup (the Soldiers survive its "destroy all other creatures", rulings), Awaken the Woods (Forest
// Dryad land creature tokens: "{T}: Add {G}" from their land type, CR 305.6), Finale of Revelation ("If X is 10 or more,
// instead ..."), Endurance ("up to one target player", CR 115.6) and Solitude's evoke cost that isn't mana (CR 702.74a).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, manaAbilitiesOn, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const coup = card("Martial Coup", "Sorcery", "{X}{W}{W}", { oracleText: "Create X 1/1 white Soldier creature tokens. If X is 5 or more, destroy all other creatures." });
const woods = card("Awaken the Woods", "Sorcery", "{X}{G}{G}", { oracleText: "Create X 1/1 green Forest Dryad land creature tokens. (They're affected by summoning sickness.)" });
const finale = card("Finale of Revelation", "Sorcery", "{X}{U}{U}", { oracleText: "Draw X cards. If X is 10 or more, instead shuffle your graveyard into your library, draw X cards, untap up to five lands, and you have no maximum hand size for the rest of the game.\nExile Finale of Revelation." });
const endurance = card("Endurance", "Creature — Elemental Incarnation", "{1}{G}{G}", { power: "3", toughness: "4", keywords: ["Reach", "Evoke", "Flash"], oracleText: "Flash\nReach\nWhen this creature enters, up to one target player puts all the cards from their graveyard on the bottom of their library in a random order.\nEvoke—Exile a green card from your hand." });
const solitude = card("Solitude", "Creature — Elemental Incarnation", "{3}{W}{W}", { power: "3", toughness: "2", keywords: ["Lifelink", "Evoke", "Flash"], oracleText: "Flash\nLifelink\nWhen this creature enters, exile up to one other target creature. That creature's controller gains life equal to its power.\nEvoke—Exile a white card from your hand." });
const whiteCard = card("Swords to Plowshares", "Instant", "{W}", { oracleText: "Exile target creature. Its controller gains life equal to its power." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't do it");
  return settle(plan.reduce((x, a) => act(x, a), s));
};
const tokens = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid);

describe("round 101: X spells, Endurance, evoke by exiling a card", () => {
  it("parse", () => {
    for (const c of [coup, woods, finale, endurance, solitude]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Martial Coup: with X 5, the Soldiers stay and every other creature is destroyed; with X 4, nothing is", () => {
    for (const x of [4, 5]) {
      const { s: s0, ap, opp, ids } = setup([coup]);
      const mine = putOnBattlefield(s0, ap, bear());
      const theirs = putOnBattlefield(s0, opp, bear());
      s0.players[ap]!.manaPool.W = 2 + x;
      const s = run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, x));
      expect(tokens(s, ap).length).toBe(x);
      expect(s.objects[mine]!.zone).toBe(x >= 5 ? "graveyard" : "battlefield");
      expect(s.objects[theirs]!.zone).toBe(x >= 5 ? "graveyard" : "battlefield");
    }
  });

  it("Awaken the Woods: Forest Dryad land creature tokens that tap for {G}", () => {
    const { s: s0, ap, ids } = setup([woods]);
    s0.players[ap]!.manaPool.G = 5;
    const s = run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 3));
    const made = tokens(s, ap);
    expect(made.length).toBe(3);
    const t = s.objects[made[0]!]!;
    expect(s.cards[t.cardId]!.types).toEqual(["Land", "Creature"]);
    expect(s.cards[t.cardId]!.subtypes).toEqual(["Forest", "Dryad"]);
    expect(manaAbilitiesOn(s, t).length).toBe(1);
  });

  it("Finale of Revelation: X cards; with X 10, the graveyard is shuffled in first and no maximum hand size", () => {
    for (const x of [3, 10]) {
      const { s: s0, ap, ids } = setup([finale]);
      const b = putOnBattlefield(s0, ap, bear());
      s0.battlefield.splice(s0.battlefield.indexOf(b), 1);
      s0.objects[b]!.zone = "graveyard";
      s0.players[ap]!.graveyard.push(b);
      s0.players[ap]!.manaPool.U = 2 + x;
      const hand = s0.players[ap]!.hand.length - 1;
      let s = run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, x));
      // "Untap up to five lands": any we like.
      if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }));
      expect(s.players[ap]!.hand.length).toBe(hand + x);
      expect(s.objects[b]!.zone === "graveyard").toBe(x < 10);
      expect(s.objects[ids[0]!]!.zone).toBe("exile");
      expect(!!s.players[ap]!.noMaxHandSize).toBe(x >= 10);
    }
  });

  it("Endurance: up to one target player's graveyard goes to the bottom of their library; or no one's", () => {
    const { s: s0, ap, opp, ids } = setup([endurance]);
    const b = putOnBattlefield(s0, opp, bear());
    s0.battlefield.splice(s0.battlefield.indexOf(b), 1);
    s0.objects[b]!.zone = "graveyard";
    s0.players[opp]!.graveyard.push(b);
    s0.players[ap]!.manaPool.G = 3;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.objects[b]!.zone).toBe("library");
    expect(s.players[opp]!.library.at(-1)).toBe(b);
  });

  it("Solitude: evoked by exiling a white card from the hand, then sacrificed after its exile", () => {
    const { s: s0, ap, opp, ids } = setup([solitude, whiteCard]);
    const b = putOnBattlefield(s0, opp, bear());
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap) s0.objects[id]!.tapped = true; // no mana
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { alt: "evoke", exileFromHand: [ids[1]!] }));
    for (let i = 0; i < 4 && s.pending; i++) {
      if (s.pending.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
      else break;
    }
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});
