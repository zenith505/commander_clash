// Dark Confidant's reveal-and-lose-life; "Skip your draw step" (CR 614.10); "If that spell is countered this way, exile
// it / put it on top of its owner's library instead" (CR 701.6a); reinforce (CR 702.77); Obstinate Baloth's discard
// replacement (CR 614.1a).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const bob = card("Dark Confidant", "Creature — Human Wizard", "{1}{B}", { power: "2", toughness: "1", oracleText: "At the beginning of your upkeep, reveal the top card of your library and put that card into your hand. You lose life equal to its mana value." });
const appeasement = card("Dragon Appeasement", "Enchantment", "{3}{B}{R}{G}", { oracleText: "Skip your draw step.\nWhenever you sacrifice a creature, you may draw a card." });
const dissipate = card("Dissipate", "Instant", "{1}{U}{U}", { oracleText: "Counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard." });
const lapse = card("Memory Lapse", "Instant", "{1}{U}", { oracleText: "Counter target spell. If that spell is countered this way, put it on top of its owner's library instead of into that player's graveyard." });
const guard = card("Mosquito Guard", "Creature — Kithkin Soldier", "{W}", { power: "1", toughness: "1", keywords: ["First strike"], oracleText: "First strike\nReinforce 1—{1}{W} ({1}{W}, Discard this card: Put a +1/+1 counter on target creature.)" });
const baloth = card("Obstinate Baloth", "Creature — Beast", "{2}{G}{G}", {
  power: "4",
  toughness: "4",
  oracleText: "When this creature enters, you gain 4 life.\nIf a spell or ability an opponent controls causes you to discard this card, put it onto the battlefield instead of putting it into your graveyard.",
});
const mindRot = card("Mind Rot", "Sorcery", "{2}{B}", { oracleText: "Target player discards two cards." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
function castOnly(s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[]) {
  for (const a of planCast(s, pid, id, targets)!) s = act(s, a);
  return s;
}
function inHand(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}
/** Put this card on top of `pid`'s library. */
function onTop(s: GameState, pid: PlayerId, def: CardDef) {
  const id = inHand(s, pid, def);
  s.players[pid]!.hand.pop();
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
}

describe("library and hand", () => {
  it("compile", () => {
    for (const d of [bob, appeasement, dissipate, lapse, guard, baloth]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Dark Confidant: the top card into your hand, and you lose life equal to its mana value", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, bob);
    let s = passUntil(s0, "end", ap);
    const top = onTop(s, ap, card("Big Thing", "Sorcery", "{4}{B}{B}"));
    const life = s.players[ap]!.life;
    s = settle(passUntil(s, "upkeep", ap));
    s = settle(s);
    expect(s.objects[top]!.zone).toBe("hand");
    expect(s.players[ap]!.life).toBe(life - 6);
  });

  it("Dragon Appeasement: no draw step at all", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, appeasement);
    // An empty hand, so the cleanup discard doesn't change the count; then on to ap's next turn.
    for (const id of s0.players[ap]!.hand.splice(0)) {
      s0.objects[id]!.zone = "library";
      s0.players[ap]!.library.push(id);
    }
    const s = passUntil(passUntil(s0, "end", ap), "main1", ap);
    expect(s.players[ap]!.hand.length).toBe(0);
    expect(s.log.some((e) => /skips their draw step/.test(e.text))).toBe(true);
  });

  it("Dissipate exiles the countered spell; Memory Lapse puts it on top of its owner's library", () => {
    const { s: s0, ap, ids, opp } = setup([bolt, dissipate, bolt, lapse]);
    let s = castOnly(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    s = settle(castOnly(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[0]!.id }]));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    s = castOnly(s, ap, ids[2]!, [{ kind: "player", id: opp }]);
    s = settle(castOnly(s, ap, ids[3]!, [{ kind: "stack", id: s.stack[0]!.id }]));
    expect(s.players[ap]!.library[0]).toBe(ids[2]);
    expect(s.objects[ids[3]!]!.zone).toBe("graveyard");
  });

  it("reinforce: discard it from your hand for +1/+1 counters on target creature", () => {
    const { s: s0, ap, ids } = setup([guard]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = settle(activate(s0, ap, ids[0]!, 0, [target(b)]));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
  });

  it("Obstinate Baloth: an opponent's discard puts it onto the battlefield; its own controller's doesn't", () => {
    const { s: s0, ap, ids, opp } = setup([mindRot]);
    const b = inHand(s0, opp, baloth);
    inHand(s0, opp, bear());
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    if (s.pending?.kind === "discard") s = settle(act(s, { type: "discard", player: opp, objectIds: [b, s.players[opp]!.hand.find((x) => x !== b)!] }));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.controller).toBe(opp);
    // Its own discard (a hand-size discard isn't a spell or ability; nor is a cost) goes to the graveyard.
    const { s: t0, ap: ap2, ids: ids2 } = setup([baloth, card("Faithless Looting", "Sorcery", "{R}", { oracleText: "Draw two cards, then discard two cards." })]);
    let t = cast(t0, ap2, ids2[1]!);
    t = settle(t);
    if (t.pending?.kind === "discard") t = act(t, { type: "discard", player: ap2, objectIds: [ids2[0]!, t.players[ap2]!.hand.find((x) => x !== ids2[0])!] });
    t = settle(t);
    expect(t.objects[ids2[0]!]!.zone).toBe("graveyard");
    void botActions;
  });
});
