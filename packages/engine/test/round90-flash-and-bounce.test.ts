// Round 90, third batch: Grave Pact ("each other player" is each opponent in a free-for-all game, CR 102.3), Champion's
// Helm (hexproof only for a legendary creature), Ozolith, the Shattered Spire (+1/+1 counters on artifacts and creatures),
// Borne Upon a Wind and Sigarda's Aid (cast as though they had flash, CR 702.8a), Remand (countered into its owner's
// hand) and Reprieve (a spell returned to its owner's hand, which isn't countering it).

import { describe, expect, it } from "vitest";
import { act, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { castProblem, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const gravePact = card("Grave Pact", "Enchantment", "{1}{B}{B}{B}", { oracleText: "Whenever a creature you control dies, each other player sacrifices a creature of their choice." });
const helm = card("Champion's Helm", "Artifact — Equipment", "{3}", { oracleText: "Equipped creature gets +2/+2.\nAs long as equipped creature is legendary, it has hexproof. (It can't be the target of spells or abilities your opponents control.)\nEquip {1}" });
const ozolith = card("Ozolith, the Shattered Spire", "Legendary Artifact", "{1}{G}", { oracleText: "If one or more +1/+1 counters would be put on an artifact or creature you control, that many plus one +1/+1 counters are put on it instead.\nCycling {2} ({2}, Discard this card: Draw a card.)" });
const borne = card("Borne Upon a Wind", "Instant", "{1}{U}", { oracleText: "You may cast spells this turn as though they had flash.\nDraw a card." });
const sigardasAid = card("Sigarda's Aid", "Enchantment", "{W}", { oracleText: "Flash\nYou may cast Aura and Equipment spells as though they had flash.\nWhenever an Equipment you control enters, you may attach it to target creature you control." });
const remand = card("Remand", "Instant", "{1}{U}", { oracleText: "Counter target spell. If that spell is countered this way, put it into its owner's hand instead of into that player's graveyard.\nDraw a card." });
const reprieve = card("Reprieve", "Instant", "{1}{W}", { oracleText: "Return target spell to its owner's hand.\nDraw a card." });
const sorcery = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const uncounterable = card("Big Uncounterable", "Sorcery", "{1}{G}", { oracleText: "This spell can't be countered.\nYou gain 5 life." });
const growth = card("Big Growth", "Instant", "{3}{G}", { oracleText: "Put a +1/+1 counter on target artifact creature." });
const aura = card("Small Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
const bolt = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const bearCard = card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

function settle(s: GameState): GameState {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
function inHand(s: GameState, pid: PlayerId, def: CardDef): string {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}
/** On to `opp`'s upkeep with `ap` holding priority and all of ap's lands untapped. */
function opponentsUpkeep(s0: GameState, ap: PlayerId, opp: PlayerId): GameState {
  let s = passUntil(s0, "upkeep", opp);
  while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("round 90 flash and bounce", () => {
  it("parse", () => {
    for (const c of [gravePact, helm, ozolith, borne, sigardasAid, remand, reprieve]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Grave Pact: each opponent sacrifices a creature when one of ours dies", () => {
    const { s: s0, ap, ids } = setup([bolt]);
    putOnBattlefield(s0, ap, gravePact);
    const mine = putOnBattlefield(s0, ap, bearCard);
    const theirs = s0.turnOrder.filter((p) => p !== ap).map((p) => putOnBattlefield(s0, p, bearCard));
    let s = settle(cast(s0, ap, ids[0]!, [target(mine)]));
    for (let i = 0; i < 10 && s.pending; i++) s = settle(act(s, { type: "pickPermanents", player: s.pending!.player, ids: (s.pending as { options: string[] }).options.slice(0, 1) } as never));
    expect(s.objects[mine]!.zone).toBe("graveyard");
    for (const id of theirs) expect(s.objects[id]!.zone).toBe("graveyard");
  });

  it("Champion's Helm gives hexproof only to a legendary creature", () => {
    const { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, helm);
    const plain = putOnBattlefield(s, ap, bearCard);
    const legend = putOnBattlefield(s, ap, card("Legend Bear", "Legendary Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    s.objects[h]!.attachedTo = plain;
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[plain]!, "Hexproof")).toBe(false);
    s.objects[h]!.attachedTo = legend;
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[legend]!, "Hexproof")).toBe(true);
  });

  it("Ozolith, the Shattered Spire: one more +1/+1 counter on an artifact creature", () => {
    const { s: s0, ap, ids } = setup([growth]);
    putOnBattlefield(s0, ap, ozolith);
    const golem = putOnBattlefield(s0, ap, card("Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" }));
    const s = settle(cast(s0, ap, ids[0]!, [target(golem)]));
    expect(s.objects[golem]!.counters["+1/+1"]).toBe(2);
  });

  it("Borne Upon a Wind: sorceries on an opponent's turn, for the rest of that turn only", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = inHand(s0, ap, borne);
    const sor = inHand(s0, ap, sorcery);
    let s = opponentsUpkeep(s0, ap, opp);
    expect(castProblem(s, ap, sor)).toMatch(/sorcery speed/);
    for (const a of planCast(s, ap, b)!) s = act(s, a);
    s = settle(s);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(planCast(s, ap, sor)).not.toBeNull();
  });

  it("Sigarda's Aid: Auras at instant speed, not sorceries", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, sigardasAid);
    putOnBattlefield(s0, ap, bearCard);
    const a = inHand(s0, ap, aura);
    const sor = inHand(s0, ap, sorcery);
    const s = opponentsUpkeep(s0, ap, opp);
    expect(castProblem(s, ap, sor)).toMatch(/sorcery speed/);
    expect(castProblem(s, ap, a)).not.toMatch(/sorcery speed/);
  });

  it("Remand puts the countered spell back into its owner's hand", () => {
    const { s: s0, ap, ids } = setup([remand, sorcery]);
    let s = s0;
    for (const a of planCast(s, ap, ids[1]!)!) s = act(s, a);
    const spell = s.stack.find((x) => x.objectId === ids[1])!;
    for (const a of planCast(s, ap, ids[0]!, [{ kind: "stack", id: spell.id }])!) s = act(s, a);
    s = settle(s);
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
    expect(s.players[ap]!.hand).toContain(ids[1]);
  });

  it("Reprieve returns even a spell that can't be countered", () => {
    const { s: s0, ap, ids } = setup([reprieve, uncounterable]);
    let s = s0;
    const life = s.players[ap]!.life;
    for (const a of planCast(s, ap, ids[1]!)!) s = act(s, a);
    const spell = s.stack.find((x) => x.objectId === ids[1])!;
    for (const a of planCast(s, ap, ids[0]!, [{ kind: "stack", id: spell.id }])!) s = act(s, a);
    s = settle(s);
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
    expect(s.players[ap]!.life).toBe(life);
  });

  it("Remand can't counter a spell that can't be countered", () => {
    const { s: s0, ap, ids } = setup([remand, uncounterable]);
    let s = s0;
    const life = s.players[ap]!.life;
    for (const a of planCast(s, ap, ids[1]!)!) s = act(s, a);
    const spell = s.stack.find((x) => x.objectId === ids[1])!;
    for (const a of planCast(s, ap, ids[0]!, [{ kind: "stack", id: spell.id }])!) s = act(s, a);
    s = settle(s);
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 5);
  });
});
