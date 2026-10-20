// Round 92: Syr Konrad, the Grim. "Whenever another creature dies, or a creature card is put into a graveyard from
// anywhere other than the battlefield, or a creature card leaves your graveyard, Syr Konrad deals 1 damage to each
// opponent." Three events, once for each creature or card (rulings: it triggers for each creature dying with it).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const konrad = card("Syr Konrad, the Grim", "Legendary Creature — Human Knight", "{3}{B}{B}", { power: "5", toughness: "4", oracleText: "Whenever another creature dies, or a creature card is put into a graveyard from anywhere other than the battlefield, or a creature card leaves your graveyard, Syr Konrad deals 1 damage to each opponent.\n{1}{B}: Each player mills a card. (They each put the top card of their library into their graveyard.)" });
const wrath = card("Wrath of God", "Sorcery", "{2}{W}{W}", { oracleText: "Destroy all creatures. They can't be regenerated." });
const mindRot = card("Mind Rot", "Sorcery", "{2}{B}", { oracleText: "Target player discards two cards." });
const purge = card("Bojuka Bog", "Land", "", { oracleText: "Bojuka Bog enters tapped.\nWhen Bojuka Bog enters, exile target player's graveyard." });

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const lifeOf = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap).map((p) => s.players[p]!.life);

describe("Syr Konrad, the Grim", () => {
  it("parse", () => expect(isFullySupported(konrad)).toBe(true));

  it("each other creature dying is a trigger, Syr Konrad dying with them isn't", () => {
    const { s: s0, ap, ids, opp } = setup([wrath]);
    putOnBattlefield(s0, ap, konrad);
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, bear());
    const s = settle(cast(s0, ap, ids[0]!));
    // Two other creatures died: 2 damage to each opponent (its own death isn't "another creature").
    expect(lifeOf(s, ap)).toEqual([38, 38, 38]);
  });

  it("creature cards discarded and milled trigger it; lands don't", () => {
    const { s: s0, ap, ids, opp } = setup([mindRot]);
    putOnBattlefield(s0, ap, konrad);
    // The opponent's hand: one creature card and the rest lands.
    const hand = s0.players[opp]!.hand;
    const cardName = (id: string) => s0.cards[s0.objects[id]!.cardId]!.name;
    const creature = hand.find((id) => cardName(id) === "Grizzly Bears");
    const lands = hand.filter((id) => cardName(id) === "Forest");
    if (!creature || !lands.length) throw new Error("bad hand");
    s0.players[opp]!.hand = [creature, lands[0]!];
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    s = settle(s);
    expect(s.players[opp]!.graveyard).toContain(creature);
    expect(lifeOf(s, ap)).toEqual([39, 39, 39]);
  });

  it("its mill ability: one trigger for each creature card milled", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, konrad);
    // Top of every library: Grizzly Bears for two players, a Forest for the others.
    s0.turnOrder.forEach((pid, i) => {
      const lib = s0.players[pid]!.library;
      const want = i < 2 ? "Grizzly Bears" : "Forest";
      const j = lib.findIndex((id) => s0.cards[s0.objects[id]!.cardId]!.name === want);
      lib.unshift(...lib.splice(j, 1));
    });
    const s = settle(activate(s0, ap, k, 0));
    expect(lifeOf(s, ap)).toEqual([38, 38, 38]);
  });

  for (const ours of [false, true])
    it(`a creature card leaving ${ours ? "your" : "an opponent's"} graveyard ${ours ? "triggers it" : "doesn't"}`, () => {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, ap, konrad);
      const mine = putOnBattlefield(s0, ap, bear());
      const theirs = putOnBattlefield(s0, opp, bear());
      for (const [id, pid] of [[mine, ap], [theirs, opp]] as const) {
        s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
        s0.objects[id]!.zone = "graveyard";
        s0.players[pid]!.graveyard.push(id);
      }
      const bog = putOnBattlefield(s0, ap, purge);
      s0.battlefield.splice(s0.battlefield.indexOf(bog), 1);
      s0.objects[bog]!.zone = "hand";
      s0.players[ap]!.hand.push(bog);
      let s = act(s0, { type: "playLand", player: ap, objectId: bog });
      for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: ours ? ap : opp }] }));
      expect(s.objects[ours ? mine : theirs]!.zone).toBe("exile");
      expect(lifeOf(s, ap)).toEqual(ours ? [39, 39, 39] : [40, 40, 40]);
    });
});
