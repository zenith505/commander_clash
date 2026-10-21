// Round 104, popular cards after the starting ones: Cloud, Midgar Mercenary (its and its Equipment's triggers again
// while equipped, CR 603.2d), Mazirek ("whenever a player sacrifices another permanent"), Tergrid (a sacrificed or
// discarded card onto the battlefield).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, scry, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const cloud = card("Cloud, Midgar Mercenary", "Legendary Creature — Human Soldier Mercenary", "{W}{W}", { power: "2", toughness: "1", oracleText: "When Cloud enters, search your library for an Equipment card, reveal it, put it into your hand, then shuffle.\nAs long as Cloud is equipped, if a triggered ability of Cloud or an Equipment attached to it triggers, that ability triggers an additional time." });
const mazirek = card("Mazirek, Kraul Death Priest", "Legendary Creature — Insect Shaman", "{3}{B}{G}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhenever a player sacrifices another permanent, put a +1/+1 counter on each creature you control." });
const tergrid = scry("transform", [
  { name: "Tergrid, God of Fright", mana_cost: "{3}{B}{B}", type_line: "Legendary Creature — God", power: "4", toughness: "5", oracle_text: "Menace\nWhenever an opponent sacrifices a nontoken permanent or discards a permanent card, you may put that card from a graveyard onto the battlefield under your control." },
  { name: "Tergrid's Lantern", mana_cost: "{3}{B}", type_line: "Legendary Artifact", oracle_text: "{T}: Target player loses 3 life unless they sacrifice a nonland permanent of their choice or discard a card.\n{3}{B}: Untap Tergrid's Lantern." },
], { keywords: ["Menace"] });

// Test cards.
const sword = card("Test Sword", "Artifact — Equipment", "{1}", { oracleText: "Whenever equipped creature attacks, you gain 1 life.\nEquip {1}" });
const lifeOnCast = card("Life Gem", "Artifact", "{1}", { oracleText: "Whenever you cast a spell, you gain 1 life." });
const edict = card("Edict", "Sorcery", "{B}", { oracleText: "Each opponent sacrifices a creature of their choice." });
const mindRot = card("Rot", "Sorcery", "{B}", { oracleText: "Target player discards a card." });
const bear = (n = "Bear") => card(n, "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

const run = (s: GameState, plan: ReturnType<typeof planCast>) => plan!.reduce((x, a) => act(x, a), s);
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const answerMay = (s: GameState, yes: boolean) => {
  for (let i = 0; i < 10 && s.pending?.kind === "chooseMay"; i++) s = settle(act(s, { type: "chooseMay", player: s.pending.player, yes }));
  return s;
};

describe("round 104: popular cards", () => {
  it("parse", () => [cloud, mazirek, tergrid].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Cloud: while equipped, its Equipment's trigger triggers twice; not another permanent's", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, cloud);
    const sw = putOnBattlefield(s0, ap, sword);
    s0.objects[sw]!.attachedTo = c;
    const life = s0.players[ap]!.life;
    let s = s0;
    while (s.step !== "declareAttackers" || s.pending?.kind !== "declareAttackers") s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }] }));
    expect(s.players[ap]!.life - life).toBe(2);
  });

  it("Cloud: not equipped, nothing extra", () => {
    const { s: s0, ap, ids } = setup([edict]);
    putOnBattlefield(s0, ap, cloud);
    putOnBattlefield(s0, ap, lifeOnCast);
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.life - life).toBe(1);
  });

  it("Mazirek: an opponent sacrificing a creature puts a counter on each creature you control", () => {
    const { s: s0, ap, opp, ids } = setup([edict]);
    const m = putOnBattlefield(s0, ap, mazirek);
    const b = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, bear("Their Bear"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: s.pending.player, ids: s.pending.options.slice(0, s.pending.count) }));
    expect(s.objects[m]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
  });

  it("Tergrid: an opponent's sacrificed creature and discarded permanent card come to you", () => {
    const { s: s0, ap, opp, ids } = setup([edict, mindRot]);
    putOnBattlefield(s0, ap, tergrid);
    const theirs = putOnBattlefield(s0, opp, bear("Their Bear"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: s.pending.player, ids: [theirs] }));
    s = answerMay(s, true);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(ap);
    // A discard: their hand is one permanent card.
    const pcard = s.players[opp]!.hand[0]!;
    s.players[opp]!.hand = [pcard];
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    if (s.pending?.kind === "discard") s = settle(act(s, { type: "discard", player: opp, objectIds: [pcard] }));
    s = answerMay(s, true);
    expect(s.objects[pcard]!.zone).toBe("battlefield");
    expect(s.objects[pcard]!.controller).toBe(ap);
  });
});
