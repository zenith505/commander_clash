// Decayed (CR 702.147a): "This creature can't block" and "When this creature attacks, sacrifice it at end of combat",
// however the creature got it: printed, on a token, granted, or from a decayed counter (CR 122.1b). Keyword counters on
// cards outside the battlefield (CR 122.1a-b). "If you control no creatures with decayed" (Jadar), "if it didn't have
// decayed" (Wilhelt), "you may sacrifice a Zombie. If you do, ...", "You create ..." after another player's instruction,
// and "X target creatures" in an activated ability with {X} (CR 107.3a, 602.2b).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, cast, passUntil, pt, putOnBattlefield, setup, swamp, target } from "./helpers";
import { putCounters } from "../src/counters";
import { blockProblem, characteristics, isFullySupported, objHasKeyword, planActivate, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));
const tokensOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid);

// Real oracle text (Scryfall).
const falcon = card("Falcon Abomination", "Creature — Zombie Bird", "{2}{U}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, create a 2/2 black Zombie creature token with decayed. (It can't block. When it attacks, sacrifice it at end of combat.)" });
const jadar = card("Jadar, Ghoulcaller of Nephalia", "Legendary Creature — Human Wizard", "{1}{B}", { power: "1", toughness: "1", oracleText: "At the beginning of your end step, if you control no creatures with decayed, create a 2/2 black Zombie creature token with decayed. (It can't block. When it attacks, sacrifice it at end of combat.)" });
const wilhelt = card("Wilhelt, the Rotcleaver", "Legendary Creature — Zombie Warrior", "{2}{U}{B}", { power: "3", toughness: "3", oracleText: "Whenever another Zombie you control dies, if it didn't have decayed, create a 2/2 black Zombie creature token with decayed. (It can't block. When it attacks, sacrifice it at end of combat.)\nAt the beginning of your end step, you may sacrifice a Zombie. If you do, draw a card." });
const rakshasa = card("Rot-Curse Rakshasa", "Creature — Demon", "{1}{B}", { power: "5", toughness: "5", keywords: ["Renew", "Trample", "Decayed"], oracleText: "Trample\nDecayed (This creature can't block. When it attacks, sacrifice it at end of combat.)\nRenew — {X}{B}{B}, Exile this card from your graveyard: Put a decayed counter on each of X target creatures. Activate only as a sorcery." });
const noWayOut = card("No Way Out", "Sorcery", "{2}{B}", { oracleText: "Target opponent discards two cards. You create a 2/2 black Zombie creature token with decayed. (It can't block. When it attacks, sacrifice it at end of combat.)" });
const curse = card("Curse of the Restless Dead", "Enchantment — Aura Curse", "{2}{B}", { keywords: ["Enchant"], oracleText: "Enchant player\nWhenever a land enchanted player controls enters, you create a 2/2 black Zombie creature token with decayed. (It can't block. When it attacks, sacrifice it at end of combat.)" });
const procession = card("Ghoulish Procession", "Enchantment", "{1}{B}", { oracleText: "Whenever one or more nontoken creatures die, create a 2/2 black Zombie creature token with decayed. This ability triggers only once each turn. (A creature with decayed can't block. When it attacks, sacrifice it at end of combat.)" });
const candelabra = card("Candelabra of Tawnos", "Artifact", "{1}", { oracleText: "{X}, {T}: Untap X target lands." });
const anurid = card("Excavating Anurid", "Creature — Frog Beast", "{4}{G}", { power: "4", toughness: "4", keywords: ["Threshold"], oracleText: "When this creature enters, you may sacrifice a land. If you do, draw a card.\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +1/+1 and has vigilance." });
const zombie = (name = "Walking Corpse") => card(name, "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2" });

describe("decayed", () => {
  it("compiles", () => supported(falcon, jadar, wilhelt, rakshasa, noWayOut, curse, procession, candelabra, anurid));

  it("a decayed token can't block, and is sacrificed at end of combat after it attacks (Falcon Abomination)", () => {
    const { s: s0, ap, opp, ids } = setup([falcon]);
    let s = settle(cast(s0, ap, ids[0]!));
    const [tok] = tokensOf(s, ap);
    expect(objHasKeyword(s, s.objects[tok!]!, "Decayed")).toBe(true);
    // It can't block.
    const theirs = putOnBattlefield(s, opp, bear());
    s.objects[theirs]!.attacking = ap;
    expect(blockProblem(s, s.objects[tok!]!, s.objects[theirs]!)).toMatch(/can't block/);
    s.objects[theirs]!.attacking = undefined;
    // Next turn it attacks: it deals its damage, then it's sacrificed at end of combat.
    s = attack(s, ap, [{ attacker: tok!, defender: opp }]);
    expect(s.objects[tok!]?.zone).toBe("battlefield");
    s = settle(passUntil(s, "endCombat", ap));
    s = settle(s);
    expect(s.players[opp]!.life).toBe(38);
    expect(s.battlefield).not.toContain(tok);
  });

  it("a printed decayed creature: same, and losing all abilities first lets it block and keeps it (Rot-Curse Rakshasa)", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rakshasa);
    const other = putOnBattlefield(s0, ap, rakshasa);
    addEffect(s0, ap, [other], [{ kind: "loseAllAbilities" }], "game");
    const theirs = putOnBattlefield(s0, opp, bear());
    s0.objects[theirs]!.attacking = ap;
    expect(blockProblem(s0, s0.objects[r]!, s0.objects[theirs]!)).toMatch(/can't block/);
    expect(blockProblem(s0, s0.objects[other]!, s0.objects[theirs]!)).toBeNull();
    s0.objects[theirs]!.attacking = undefined;
    let s = attack(s0, ap, [{ attacker: r, defender: opp }, { attacker: other, defender: opp }]);
    s = settle(passUntil(s, "endCombat", ap));
    expect(s.battlefield).not.toContain(r);
    expect(s.battlefield).toContain(other);
    expect(s.players[ap]!.graveyard).toContain(r);
  });

  it("renew puts a decayed counter on each of X target creatures, which then have decayed (CR 122.1b)", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rakshasa);
    s0.battlefield.splice(s0.battlefield.indexOf(r), 1);
    s0.objects[r]!.zone = "graveyard";
    s0.players[ap]!.graveyard.push(r);
    const a = putOnBattlefield(s0, opp, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, opp, bear({ name: "Bear B" }));
    const c = putOnBattlefield(s0, opp, bear({ name: "Bear C" }));
    // X is 2: exactly two targets.
    expect(planActivate(s0, ap, r, 0, [target(a)], undefined, undefined, 2)).toBeNull();
    const plan = planActivate(s0, ap, r, 0, [target(a), target(b)], undefined, undefined, 2)!;
    expect(plan).not.toBeNull();
    let s = s0;
    for (const x of plan) s = act(s, x);
    s = settle(s);
    expect(s.objects[r]!.zone).toBe("exile");
    expect([s.objects[a]!.counters.decayed, s.objects[b]!.counters.decayed, s.objects[c]!.counters.decayed ?? 0]).toEqual([1, 1, 0]);
    expect(objHasKeyword(s, s.objects[a]!, "Decayed")).toBe(true);
    expect(objHasKeyword(s, s.objects[c]!, "Decayed")).toBe(false);
    // It attacks on its controller's turn and is sacrificed at end of combat.
    s = attack(s, opp, [{ attacker: a, defender: ap }]);
    s = settle(passUntil(s, "endCombat", opp));
    expect(s.battlefield).not.toContain(a);
    expect(s.battlefield).toContain(b);
  });

  it("a decayed counter put on after an effect that removes all abilities still gives decayed (CR 613.7c)", () => {
    const { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    addEffect(s, ap, [b], [{ kind: "loseAllAbilities" }], "game");
    putCounters(s, s.objects[b]!, "decayed", 1);
    const theirs = putOnBattlefield(s, opp, bear());
    s.objects[theirs]!.attacking = ap;
    expect(blockProblem(s, s.objects[b]!, s.objects[theirs]!)).toMatch(/can't block/);
  });

  it("Jadar makes a token at your end step only if you control no creatures with decayed", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, jadar);
    let s = settle(passUntil(s0, "end", ap));
    expect(tokensOf(s, ap)).toHaveLength(1);
    s = settle(passUntil(passUntil(s, "upkeep", ap), "end", ap));
    expect(tokensOf(s, ap)).toHaveLength(1);
  });

  it("Wilhelt: a Zombie without decayed dying makes a token, a decayed one doesn't; at end step, sacrifice a Zombie to draw", () => {
    const { s: s0, ap, ids } = setup([noWayOut]);
    putOnBattlefield(s0, ap, wilhelt);
    const z = putOnBattlefield(s0, ap, zombie());
    const opp = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.pending?.kind).toBe("discard");
    s = settle(act(s, { type: "discard", player: opp, objectIds: s.players[opp]!.hand.slice(0, 2) }));
    // No Way Out: "You create" — the caster gets the decayed Zombie.
    const [tok] = tokensOf(s, ap);
    expect(tok).toBeDefined();
    expect(objHasKeyword(s, s.objects[tok!]!, "Decayed")).toBe(true);
    // The decayed token dies: no new token.
    const kill = card("Test Removal", "Instant", "{0}", { oracleText: "Destroy target creature." });
    const k1 = putOnBattlefield(s, ap, kill);
    s.battlefield.splice(s.battlefield.indexOf(k1), 1);
    s.objects[k1]!.zone = "hand";
    s.players[ap]!.hand.push(k1);
    s = settle(cast(s, ap, k1, [target(tok!)]));
    expect(tokensOf(s, ap)).toHaveLength(0);
    // The Zombie without decayed dies: a token.
    const k2 = putOnBattlefield(s, ap, kill);
    s.battlefield.splice(s.battlefield.indexOf(k2), 1);
    s.objects[k2]!.zone = "hand";
    s.players[ap]!.hand.push(k2);
    s = settle(cast(s, ap, k2, [target(z)]));
    const made = tokensOf(s, ap);
    expect(made).toHaveLength(1);
    // End step: sacrifice the token, draw a card.
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: [made[0]!] });
    s = settle(s);
    expect(s.battlefield).not.toContain(made[0]);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("'you may sacrifice a land. If you do' isn't offered without a land, and draws when done (Excavating Anurid)", () => {
    const { s: s0, ap, ids } = setup([anurid]);
    const hand = s0.players[ap]!.hand.length - 1;
    let s = cast(s0, ap, ids[0]!);
    s = settle(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    const land = s.battlefield.find((id) => characteristics(s, s.objects[id]!).types.includes("Land") && s.objects[id]!.controller === ap)!;
    if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: [land] });
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("keyword counters outside the battlefield (CR 122.1a-b)", () => {
  it("a card in exile with a flying counter has flying; a creature card in a graveyard with +1/+1 counters is bigger", () => {
    const { s, ap } = setup([]);
    const e = putOnBattlefield(s, ap, bear({ name: "Exiled Bear" }));
    s.battlefield.splice(s.battlefield.indexOf(e), 1);
    s.objects[e]!.zone = "exile";
    s.players[ap]!.exile.push(e);
    s.objects[e]!.counters = { flying: 1 };
    expect(objHasKeyword(s, s.objects[e]!, "Flying")).toBe(true);
    const g = putOnBattlefield(s, ap, bear({ name: "Buried Bear" }));
    s.battlefield.splice(s.battlefield.indexOf(g), 1);
    s.objects[g]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(g);
    s.objects[g]!.counters = { "+1/+1": 2, decayed: 1 };
    expect(pt(s, g)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[g]!, "Decayed")).toBe(true);
    // A noncreature card's +1/+1 counters change nothing (it has no power or toughness).
    const sw = putOnBattlefield(s, ap, swamp);
    s.battlefield.splice(s.battlefield.indexOf(sw), 1);
    s.objects[sw]!.zone = "graveyard";
    s.objects[sw]!.counters = { "+1/+1": 1 };
    expect(characteristics(s, s.objects[sw]!).pt).toEqual([]);
  });
});

describe("X target creatures in an activated ability with {X}", () => {
  it("untaps exactly X target lands (Candelabra of Tawnos)", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, candelabra);
    const lands = s0.battlefield.filter((id) => characteristics(s0, s0.objects[id]!).types.includes("Land") && s0.objects[id]!.controller === ap);
    for (const id of lands.slice(0, 4)) s0.objects[id]!.tapped = true;
    const plan = planActivate(s0, ap, c, 0, [target(lands[0]!), target(lands[1]!)], undefined, undefined, 2)!;
    expect(plan).not.toBeNull();
    let s = s0;
    for (const x of plan) s = act(s, x);
    s = settle(s);
    expect(s.objects[lands[0]!]!.tapped).toBe(false);
    expect(s.objects[lands[1]!]!.tapped).toBe(false);
    expect(s.objects[lands[2]!]!.tapped).toBe(true);
  });
});
