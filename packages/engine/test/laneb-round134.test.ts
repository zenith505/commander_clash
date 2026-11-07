// Lane B round B134: splice costs that aren't mana (Torrent of Stone's "Sacrifice two Mountains", Hundred-Talon Strike's
// "Tap an untapped white creature you control", Roar of Jukai's "An opponent gains 5 life", Horobi's Whisper's "Exile four
// cards from your graveyard"; CR 702.47a, 601.2b, 601.2f-h), entwine costs that aren't mana (Betrayal of Flesh, Solar
// Tide; CR 702.42a-b), Samite Censer-Bearer (a shield on each creature you control), Puppet Master (the payment offered
// only if the card went to the hand), Rock Hydra (a +1/+1 counter for each 1 damage prevented) and Whip Vine ("target
// creature with flying blocked by ~", kept tapped while the Vine stays tapped).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, damageEstimate, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, spellCost, manaValue, spliceCandidates, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const SPLICE = " (As you cast an Arcane spell, you may reveal this card from your hand and pay its splice cost. If you do, add this card's effects to that spell.)";
const torrent = card("Torrent of Stone", "Instant — Arcane", "{3}{R}", { keywords: ["Splice"], oracleText: `Torrent of Stone deals 4 damage to target creature.\nSplice onto Arcane—Sacrifice two Mountains.${SPLICE}` });
const talon = card("Hundred-Talon Strike", "Instant — Arcane", "{W}", { keywords: ["Splice"], oracleText: `Target creature gets +1/+0 and gains first strike until end of turn.\nSplice onto Arcane—Tap an untapped white creature you control.${SPLICE}` });
const roar = card("Roar of Jukai", "Instant — Arcane", "{2}{G}", { keywords: ["Splice"], oracleText: `If you control a Forest, each blocked creature gets +2/+2 until end of turn.\nSplice onto Arcane—An opponent gains 5 life.${SPLICE}` });
const whisper = card("Horobi's Whisper", "Instant — Arcane", "{1}{B}{B}", { keywords: ["Splice"], oracleText: `If you control a Swamp, destroy target nonblack creature.\nSplice onto Arcane—Exile four cards from your graveyard.${SPLICE}` });
const veil = card("Veil of Secrecy", "Instant — Arcane", "{1}{U}", { keywords: ["Splice"], oracleText: `Target creature gains shroud until end of turn and can't be blocked this turn. (A creature with shroud can't be the target of spells or abilities.)\nSplice onto Arcane—Return a blue creature you control to its owner's hand.${SPLICE}` });
const ray = card("Glacial Ray", "Instant — Arcane", "{1}{R}", { keywords: ["Splice"], oracleText: `Glacial Ray deals 2 damage to any target.\nSplice onto Arcane {1}{R}${SPLICE}` });
const betrayal = card("Betrayal of Flesh", "Instant", "{5}{B}", { keywords: ["Entwine"], oracleText: "Choose one —\n• Destroy target creature.\n• Return target creature card from your graveyard to the battlefield.\nEntwine—Sacrifice three lands. (Choose both if you pay the entwine cost.)" });
const solar = card("Solar Tide", "Sorcery", "{4}{W}{W}", { keywords: ["Entwine"], oracleText: "Choose one —\n• Destroy all creatures with power 2 or less.\n• Destroy all creatures with power 3 or greater.\nEntwine—Sacrifice two lands. (Choose both if you pay the entwine cost.)" });
const censer = card("Samite Censer-Bearer", "Creature — Human Rebel Cleric", "{W}", { power: "1", toughness: "1", oracleText: "{W}, Sacrifice this creature: Prevent the next 1 damage that would be dealt to each creature you control this turn." });
const puppet = card("Puppet Master", "Enchantment — Aura", "{U}{U}{U}", { keywords: ["Enchant"], oracleText: "Enchant creature\nWhen enchanted creature dies, return that card to its owner's hand. If that card is returned to its owner's hand this way, you may pay {U}{U}{U}. If you do, return this card to its owner's hand." });
const hydra = card("Rock Hydra", "Creature — Hydra", "{X}{R}{R}", { power: "0", toughness: "0", oracleText: "This creature enters with X +1/+1 counters on it.\nFor each 1 damage that would be dealt to this creature, if it has a +1/+1 counter on it, remove a +1/+1 counter from it and prevent that 1 damage.\n{R}: Prevent the next 1 damage that would be dealt to this creature this turn.\n{R}{R}{R}: Put a +1/+1 counter on this creature. Activate only during your upkeep." });
const vine = card("Whip Vine", "Creature — Plant Wall", "{2}{G}", { power: "1", toughness: "4", keywords: ["Reach", "Defender"], oracleText: "Defender; reach (This creature can block creatures with flying.)\nYou may choose not to untap this creature during your untap step.\n{T}: Tap target creature with flying blocked by this creature. That creature doesn't untap during its controller's untap step for as long as this creature remains tapped." });

// Helpers' cards.
const lions = card("Savannah Lions", "Creature — Cat", "{W}", { power: "2", toughness: "1" });
const giant = card("Stone Giant", "Creature — Giant", "{2}{R}{R}", { power: "3", toughness: "4" });
const ogre = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const drake = card("Wind Drake", "Creature — Drake", "{2}{U}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const rite = card("Test Arcane Rite", "Instant — Arcane", "{B}", { oracleText: "As an additional cost to cast this spell, sacrifice a creature.\nTarget player loses 2 life." });
const mountainLike = card("Mountain", "Basic Land — Mountain");

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const pl = (id: PlayerId): TargetChoice => ({ kind: "player", id });
/** No mana but what's put in the pool: every land tapped, the pool set. */
const onlyPool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana };
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) s.objects[id]!.tapped = true;
};
const landsOf = (s: GameState, pid: PlayerId, name?: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land") && (!name || s.cards[s.objects[id]!.cardId]!.name === name));
/** A card put straight into `pid`'s graveyard. */
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
const third = (s: GameState, ap: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;

describe("splice costs that aren't mana (CR 702.47a)", () => {
  it("parses", () => supported(torrent, talon, roar, whisper, veil, ray));

  it("Veil of Secrecy: a blue creature you control returned to its owner's hand", () => {
    const { s: s0, ap, ids, opp } = setup([ray, veil]);
    const [blue, other] = [putOnBattlefield(s0, ap, drake), putOnBattlefield(s0, ap, ogre)];
    onlyPool(s0, ap, { R: 2 });
    const targets = [pl(opp), tgt(other)];
    expect(castProblem(s0, ap, ids[0]!, targets, undefined, undefined, undefined, undefined, { splice: [ids[1]!], returnToHand: [other] })).not.toBeNull(); // not blue
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, targets, undefined, "auto", undefined, { splice: [ids[1]!], returnToHand: [blue] })));
    expect(s.objects[blue]!.zone).toBe("hand");
    expect(s.objects[other]!.zone).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(38);
  });

  it("Torrent of Stone spliced onto Glacial Ray: two Mountains sacrificed, both effects, and it stays in hand", () => {
    const { s: s0, ap, ids, opp } = setup([ray, torrent]);
    const [r, t] = ids as [string, string];
    const theirs = putOnBattlefield(s0, opp, giant);
    onlyPool(s0, ap, { R: 2 });
    expect(spliceCandidates(s0, ap, r)).toEqual([t]);
    // The splice adds no mana: {1}{R} in all.
    const c = spellCost(s0, ap, s0.objects[r]!, 0, [], { splice: [t] });
    expect(manaValue(c.cost) + c.extra).toBe(2);
    const targets = [pl(opp), tgt(theirs)];
    const [m1, m2] = landsOf(s0, ap, "Mountain") as [string, string];
    const island = landsOf(s0, ap, "Island")[0]!;
    expect(() => act(s0, { type: "castSpell", player: ap, objectId: r, targets, splice: [t] })).toThrow(/additional cost/);
    expect(castProblem(s0, ap, r, targets, undefined, undefined, undefined, undefined, { splice: [t], sacrifice: [m1, island] })).not.toBeNull();
    let s = run(s0, planCast(s0, ap, r, targets, undefined, "auto", undefined, { splice: [t], sacrifice: [m1, m2] }));
    expect([m1, m2].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    expect(s.players[ap]!.hand).toContain(t);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(38);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand).toContain(t);
  });

  it("any two Mountains pay it, not only basic ones (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([ray, torrent]);
    const dual = putOnBattlefield(s0, ap, card("Plateau", "Land — Mountain Plains"));
    const theirs = putOnBattlefield(s0, opp, giant);
    onlyPool(s0, ap, { R: 2 });
    const m1 = landsOf(s0, ap, "Mountain")[0]!;
    expect(castProblem(s0, ap, ids[0]!, [pl(opp), tgt(theirs)], undefined, undefined, undefined, undefined, { splice: [ids[1]!], sacrifice: [m1, dual] })).toBeNull();
  });

  it("Hundred-Talon Strike: an untapped white creature you control is tapped", () => {
    const { s: s0, ap, ids, opp } = setup([ray, talon]);
    const [white, pumped] = [putOnBattlefield(s0, ap, lions), putOnBattlefield(s0, ap, ogre)];
    onlyPool(s0, ap, { R: 2 });
    const targets = [pl(opp), tgt(pumped)];
    expect(castProblem(s0, ap, ids[0]!, targets, undefined, undefined, undefined, undefined, { splice: [ids[1]!], tap: [pumped] })).not.toBeNull(); // not white
    let s = run(s0, planCast(s0, ap, ids[0]!, targets, undefined, "auto", undefined, { splice: [ids[1]!], tap: [white] }));
    expect(s.objects[white]!.tapped).toBe(true);
    s = settle(s);
    expect(power(s, s.objects[pumped]!)).toBe(4);
    expect(s.players[opp]!.life).toBe(38);
  });

  it("Roar of Jukai: the opponent you pick gains 5 life", () => {
    const { s: s0, ap, ids, opp } = setup([ray, roar]);
    onlyPool(s0, ap, { R: 2 });
    const other = third(s0, ap);
    let s = run(s0, planCast(s0, ap, ids[0]!, [pl(opp)], undefined, "auto", undefined, { splice: [ids[1]!], lifeTo: other }));
    s = settle(s);
    expect(s.players[other]!.life).toBe(45);
    expect(s.players[opp]!.life).toBe(38);
  });

  it("Horobi's Whisper: four cards exiled from your graveyard; three aren't enough", () => {
    const { s: s0, ap, ids, opp } = setup([ray, whisper]);
    const theirs = putOnBattlefield(s0, opp, ogre);
    onlyPool(s0, ap, { R: 2 });
    const yard = [bear(), bear(), bear()].map((d) => toYard(s0, ap, d));
    const targets = [pl(opp), tgt(theirs)];
    expect(castProblem(s0, ap, ids[0]!, targets, undefined, undefined, undefined, undefined, { splice: [ids[1]!], exileCards: yard })).not.toBeNull();
    yard.push(toYard(s0, ap, bear()));
    let s = run(s0, planCast(s0, ap, ids[0]!, targets, undefined, "auto", undefined, { splice: [ids[1]!], exileCards: yard }));
    expect(yard.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile", "exile"]);
    s = settle(s);
    expect(s.objects[theirs]!.zone).toBe("graveyard"); // we control a Swamp
  });

  it("a splice cost that picks what the spell's own additional cost picks isn't offered", () => {
    const { s, ap, ids } = setup([rite, torrent, whisper]);
    expect(spliceCandidates(s, ap, ids[0]!)).toEqual([ids[2]]);
  });

  it("a bot splices Torrent of Stone onto Glacial Ray, sacrificing two Mountains", () => {
    const { s, ap, ids, opp } = setup([ray, torrent]);
    s.players[ap]!.command = [];
    s.players[ap]!.hand = [...ids];
    putOnBattlefield(s, opp, giant);
    onlyPool(s, ap, { R: 2 });
    const a = botActions(s, ap).find((x) => x.type === "castSpell" && x.objectId === ids[0]);
    expect(a?.type === "castSpell" && a.splice).toEqual([ids[1]]);
    expect(a?.type === "castSpell" && a.sacrifice?.map((id) => s.cards[s.objects[id]!.cardId]!.name)).toEqual(["Mountain", "Mountain"]);
  });

  it("a bot with few lands doesn't sacrifice two of them to splice", () => {
    const { s, ap, ids, opp } = setup([ray, torrent]);
    s.players[ap]!.command = [];
    s.players[ap]!.hand = [...ids];
    putOnBattlefield(s, opp, giant);
    for (const id of landsOf(s, ap).slice(5)) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      delete s.objects[id];
    }
    onlyPool(s, ap, { R: 2 });
    const a = botActions(s, ap).find((x) => x.type === "castSpell" && x.objectId === ids[0]);
    expect(a?.type === "castSpell" ? (a.splice ?? []) : []).toEqual([]);
  });
});

describe("entwine costs that aren't mana (CR 702.42a)", () => {
  it("parses", () => supported(betrayal, solar));

  it("Betrayal of Flesh entwined: three lands sacrificed, both modes in order", () => {
    const { s: s0, ap, ids, opp } = setup([betrayal]);
    const theirs = putOnBattlefield(s0, opp, ogre);
    const dead = toYard(s0, ap, giant);
    onlyPool(s0, ap, { B: 1, C: 5 });
    const targets = [tgt(theirs), tgt(dead)];
    // One mode needs no lands; both need three.
    expect(castProblem(s0, ap, ids[0]!, [tgt(theirs)], [0])).toBeNull();
    expect(castProblem(s0, ap, ids[0]!, targets, [0, 1], undefined, undefined, undefined, { sacrifice: landsOf(s0, ap, "Forest").slice(0, 2) })).not.toBeNull();
    expect(() => act(s0, { type: "castSpell", player: ap, objectId: ids[0]!, targets, modes: [0, 1] })).toThrow(/additional cost/);
    const sac = landsOf(s0, ap, "Forest");
    let s = run(s0, planCast(s0, ap, ids[0]!, targets, [0, 1], "auto", undefined, { sacrifice: sac }));
    expect(sac.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
    s = settle(s);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[dead]!.zone).toBe("battlefield");
  });

  it("Solar Tide: one mode, or both for two lands", () => {
    const { s: s0, ap, ids, opp } = setup([solar]);
    const [small, big] = [putOnBattlefield(s0, opp, bear()), putOnBattlefield(s0, opp, ogre)];
    onlyPool(s0, ap, { W: 2, C: 4 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], [0, 1], "auto", undefined, { sacrifice: landsOf(s0, ap, "Island").slice(0, 2) })));
    expect([small, big].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    expect(landsOf(s, ap, "Island")).toHaveLength(1);
  });

  it("a bot entwines Solar Tide when both modes help it, and not when they'd wipe its own board", () => {
    const { s, ap, ids, opp } = setup([solar]);
    s.players[ap]!.command = [];
    s.players[ap]!.hand = [...ids];
    for (const d of [bear(), ogre, giant, bear()]) putOnBattlefield(s, opp, d);
    onlyPool(s, ap, { W: 2, C: 4 });
    const a = botActions(s, ap).find((x) => x.type === "castSpell" && x.objectId === ids[0]);
    expect(a?.type === "castSpell" && a.modes).toEqual([0, 1]);
    expect(a?.type === "castSpell" && a.sacrifice).toHaveLength(2);

    const { s: s2, ap: ap2, ids: ids2, opp: opp2 } = setup([solar]);
    s2.players[ap2]!.command = [];
    s2.players[ap2]!.hand = [...ids2];
    for (const d of [ogre, giant, ogre]) putOnBattlefield(s2, ap2, d);
    for (const d of [bear(), bear()]) putOnBattlefield(s2, opp2, d);
    onlyPool(s2, ap2, { W: 2, C: 4 });
    const b = botActions(s2, ap2).find((x) => x.type === "castSpell" && x.objectId === ids2[0]);
    expect(b?.type === "castSpell" ? b.modes : [0]).not.toEqual([0, 1]);
  });
});

describe("Samite Censer-Bearer", () => {
  it("parses", () => supported(censer));

  it("a shield of 1 on each creature you control as it resolves, none for others' or later ones (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const cb = putOnBattlefield(s0, ap, censer);
    const [mine, theirs] = [putOnBattlefield(s0, ap, ogre), putOnBattlefield(s0, opp, ogre)];
    let s = settle(run(s0, planActivate(s0, ap, cb, 0)));
    expect(s.objects[cb]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.preventNext).toBe(1);
    expect(s.objects[theirs]!.preventNext ?? 0).toBe(0);
    const later = putOnBattlefield(s, ap, ogre);
    expect(s.objects[later]!.preventNext ?? 0).toBe(0);
  });
});

describe("Puppet Master", () => {
  it("parses", () => supported(puppet));

  const enchanted = () => {
    const { s, ap, ids } = setup([murder]);
    const b = putOnBattlefield(s, ap, ogre);
    const pm = putOnBattlefield(s, ap, puppet);
    s.objects[pm]!.attachedTo = b;
    invalidateCharacteristics(s);
    onlyPool(s, ap, { B: 2, C: 1, U: 3 });
    return { s: run(s, planCast(s, ap, ids[0]!, [tgt(b)])), ap, b, pm };
  };

  it("the creature card returns to its owner's hand, and paying {U}{U}{U} returns the Aura too", () => {
    const { s: s0, ap, b, pm } = enchanted();
    let s = settle(s0, { me: [ap] });
    expect(s.objects[b]!.zone).toBe("hand");
    expect(s.pending?.player).toBe(ap);
    s = run(s, botActions(s, ap));
    s = settle(s);
    expect(s.objects[pm]!.zone).toBe("hand");
    expect(s.players[ap]!.manaPool.U).toBe(0);
  });

  it("no payment is offered if the card didn't go to the hand (rulings)", () => {
    const { s: s0, ap, b, pm } = enchanted();
    let s = s0;
    // Through to the trigger on the stack; then the creature card leaves the graveyard.
    for (let i = 0; i < 20 && !s.stack.some((x) => x.kind === "ability"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.some((x) => x.kind === "ability")).toBe(true);
    const p = s.players[ap]!;
    p.graveyard.splice(p.graveyard.indexOf(b), 1);
    s.objects[b]!.zone = "exile";
    s.objects[b]!.zoneChanges = (s.objects[b]!.zoneChanges ?? 0) + 1;
    p.exile.push(b);
    s = settle(s, { me: [ap] });
    expect(s.pending).toBeFalsy();
    expect(s.objects[pm]!.zone).toBe("graveyard");
    expect(s.players[ap]!.manaPool.U).toBe(3);
  });
});

describe("Rock Hydra", () => {
  it("parses", () => supported(hydra));

  it("each 1 damage removes a +1/+1 counter and is prevented while it has one; the rest is dealt", () => {
    const { s: s0, ap, ids, opp } = setup([ray, ray]);
    const h = putOnBattlefield(s0, opp, hydra);
    s0.objects[h]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s0);
    expect(damageEstimate(s0, s0.objects[putOnBattlefield(s0, ap, ogre)]!, { object: h }, 5, false)).toBe(2);
    onlyPool(s0, ap, { R: 4 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(h)])));
    expect(s.objects[h]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[h]!.damage).toBe(0);
    expect(`${power(s, s.objects[h]!)}/${toughness(s, s.objects[h]!)}`).toBe("1/1");
    // 2 more: one prevented by the last counter, one dealt to a 0/0 that's gone anyway.
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(h)])));
    expect(s.objects[h]!.zone).toBe("graveyard");
  });

  it("its own {R} shield is used up first, saving a counter (CR 616.1)", () => {
    const { s: s0, ap, ids, opp } = setup([ray]);
    const h = putOnBattlefield(s0, opp, hydra);
    s0.objects[h]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s0);
    s0.objects[h]!.preventNext = 1;
    onlyPool(s0, ap, { R: 2 });
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(h)])));
    expect(s.objects[h]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[h]!.damage).toBe(0);
  });
});

describe("Whip Vine", () => {
  it("parses", () => supported(vine));

  it("taps the flier it blocks, which stays tapped while the Vine does", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, vine);
    const [flier, other] = [putOnBattlefield(s0, opp, drake), putOnBattlefield(s0, opp, card("Vigilant Drake", "Creature — Drake", "{2}{U}", { power: "1", toughness: "3", keywords: ["Flying", "Vigilance"], oracleText: "Flying, vigilance" }))];
    let s = passUntil(s0, "declareAttackers", opp);
    if (s.pending?.kind !== "declareAttackers") throw new Error("no attack");
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: flier, defender: ap }, { attacker: other, defender: ap }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: s.pending.player === ap ? [{ blocker: v, attacker: flier }] : [] });
    expect(s.step).toBe("declareBlockers");
    // Only the creature it blocks.
    expect(planActivate(s, ap, v, 0, [tgt(other)])).toBeNull();
    for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planActivate(s, ap, v, 0, [tgt(flier)])));
    expect(s.objects[v]!.tapped).toBe(true);
    // Our turn: the Vine kept tapped (CR 502.3); then the drake's controller's untap step leaves it tapped.
    for (let i = 0; i < 3000 && !(s.activePlayer === opp && s.step === "upkeep" && s.turn > s0.turn + 1); i++) {
      const p = s.pending;
      if (p?.kind === "pickPermanents" && p.action === "keepTapped") s = act(s, { type: "pickPermanents", player: p.player, ids: p.options.filter((id) => id === v) });
      else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
      else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
      else if (p) s = run(s, botActions(s, p.player));
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.activePlayer).toBe(opp);
    expect(s.objects[v]!.tapped).toBe(true);
    expect(s.objects[flier]!.tapped).toBe(true);
    expect(s.objects[other]!.tapped).toBe(false);
  });
});
