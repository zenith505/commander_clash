// Round 197: blight as a cost (CR 701.68a): "{T}, Blight 1: ..." in an activated ability's cost (Gristle Glutton,
// Sting-Slinger, Spiral into Solitude, Evershrike's Gift, Champion of the Weird), "As an additional cost to cast this
// spell, blight 1 or pay {3}" (Bogslither's Embrace, Wild Unraveling), and the optional additional costs "you may blight 1"
// and "you may behold a Dragon" (CR 701.4a) with "if this spell's additional cost was paid" and "if a Dragon was beheld"
// (Burning Curiosity, Cinder Strike, Pyrrhic Strike, Requiting Hex, Dispelling Exhale, Osseous Exhale, Piercing Exhale,
// Hyperion's Atomic Vision, Hulk's Thunderclap), paid like kicker but not kicker for other cards; "Then if it isn't your
// main phase, blight 2" (Dose of Dawnglow).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const minus = (s: GameState, id: string) => s.objects[id]!.counters["-1/-1"] ?? 0;
const pt = (s: GameState, id: ObjectId) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const creature = (name: string, sub: string, p: number, t = p, cost = "{G}") => card(name, `Creature — ${sub}`, cost, { cmc: cost.match(/\{/g)?.length ?? 0, power: String(p), toughness: String(t) });
const next = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!;

// Real oracle text (Scryfall).
const gristleGlutton = card("Gristle Glutton", "Creature — Goblin Scout", "{1}{R}", {"cmc":2,"power":"1","toughness":"3","keywords":["Blight"],"oracleText":"{T}, Blight 1: Discard a card. If you do, draw a card. (To blight 1, put a -1/-1 counter on a creature you control.)","colors":["R"]});
const stingslinger = card("Sting-Slinger", "Creature — Goblin Warrior", "{2}{R}", {"cmc":3,"power":"3","toughness":"3","keywords":["Blight"],"oracleText":"{1}{R}, {T}, Blight 1: This creature deals 2 damage to each opponent. (To blight 1, put a -1/-1 counter on a creature you control.)","colors":["R"]});
const spiralIntoSolitude = card("Spiral into Solitude", "Enchantment — Aura", "{1}{W}", {"cmc":2,"keywords":["Blight","Enchant"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.\n{1}{W}, Blight 1, Sacrifice this Aura: Exile enchanted creature. (To blight 1, put a -1/-1 counter on a creature you control.)","colors":["W"]});
const evershrikesGift = card("Evershrike's Gift", "Enchantment — Aura", "{W}", {"cmc":1,"keywords":["Blight","Enchant"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+0 and has flying.\n{1}{W}, Blight 2: Return this card from your graveyard to your hand. Activate only as a sorcery. (To blight 2, put two -1/-1 counters on a creature you control.)","colors":["W"]});
const championOfTheWeird = card("Champion of the Weird", "Creature — Goblin Berserker", "{3}{B}", {"cmc":4,"power":"5","toughness":"5","keywords":["Blight","Behold"],"oracleText":"As an additional cost to cast this spell, behold a Goblin and exile it. (Exile a Goblin you control or a Goblin card from your hand.)\nPay 1 life, Blight 2: Target opponent blights 2. Activate only as a sorcery.\nWhen this creature leaves the battlefield, return the exiled card to its owner's hand.","colors":["B"]});
const bogslithersEmbrace = card("Bogslither's Embrace", "Sorcery", "{1}{B}", {"cmc":2,"keywords":["Blight"],"oracleText":"As an additional cost to cast this spell, blight 1 or pay {3}. (To blight 1, put a -1/-1 counter on a creature you control.)\nExile target creature.","colors":["B"]});
const wildUnraveling = card("Wild Unraveling", "Instant", "{U}{U}", {"cmc":2,"keywords":["Blight"],"oracleText":"As an additional cost to cast this spell, blight 2 or pay {1}. (To blight 2, put two -1/-1 counters on a creature you control.)\nCounter target spell.","colors":["U"]});
const burningCuriosity = card("Burning Curiosity", "Sorcery", "{2}{R}", {"cmc":3,"keywords":["Blight"],"oracleText":"As an additional cost to cast this spell, you may blight 1. (You may put a -1/-1 counter on a creature you control.)\nExile the top two cards of your library. If this spell's additional cost was paid, exile the top three cards instead. Until the end of your next turn, you may play those cards.","colors":["R"]});
const cinderStrike = card("Cinder Strike", "Sorcery", "{R}", {"cmc":1,"keywords":["Blight"],"oracleText":"As an additional cost to cast this spell, you may blight 1. (You may put a -1/-1 counter on a creature you control.)\nCinder Strike deals 2 damage to target creature. It deals 4 damage to that creature instead if this spell's additional cost was paid.","colors":["R"]});
const pyrrhicStrike = card("Pyrrhic Strike", "Instant", "{2}{W}", {"cmc":3,"keywords":["Blight"],"oracleText":"As an additional cost to cast this spell, you may blight 2. (You may put two -1/-1 counters on a creature you control.)\nChoose one. If this spell's additional cost was paid, choose both instead.\n• Destroy target artifact or enchantment.\n• Destroy target creature with mana value 3 or greater.","colors":["W"]});
const requitingHex = card("Requiting Hex", "Instant", "{B}", {"cmc":1,"keywords":["Blight"],"oracleText":"As an additional cost to cast this spell, you may blight 1. (You may put a -1/-1 counter on a creature you control.)\nDestroy target creature with mana value 2 or less. If this spell's additional cost was paid, you gain 2 life.","colors":["B"]});
const dispellingExhale = card("Dispelling Exhale", "Instant", "{1}{U}", {"cmc":2,"keywords":["Behold"],"oracleText":"As an additional cost to cast this spell, you may behold a Dragon. (You may choose a Dragon you control or reveal a Dragon card from your hand.)\nCounter target spell unless its controller pays {2}. If a Dragon was beheld, counter that spell unless its controller pays {4} instead.","colors":["U"]});
const osseousExhale = card("Osseous Exhale", "Instant", "{1}{W}", {"cmc":2,"keywords":["Behold"],"oracleText":"As an additional cost to cast this spell, you may behold a Dragon. (You may choose a Dragon you control or reveal a Dragon card from your hand.)\nOsseous Exhale deals 5 damage to target attacking or blocking creature. If a Dragon was beheld, you gain 2 life.","colors":["W"]});
const piercingExhale = card("Piercing Exhale", "Instant", "{1}{G}", {"cmc":2,"keywords":["Surveil","Behold"],"oracleText":"As an additional cost to cast this spell, you may behold a Dragon. (You may choose a Dragon you control or reveal a Dragon card from your hand.)\nTarget creature you control deals damage equal to its power to target creature or planeswalker. If a Dragon was beheld, surveil 2.","colors":["G"]});
const hyperionsAtomicVision = card("Hyperion's Atomic Vision", "Instant", "{1}{W}", {"cmc":2,"keywords":["Behold","Scry"],"oracleText":"As an additional cost to cast this spell, you may behold a Hero. (You may choose a Hero you control or reveal a Hero card from your hand.)\nDestroy target tapped creature. If a Hero was beheld, scry 2. (Look at the top two cards of your library, then put any number of them on the bottom and the rest on top in any order.)","colors":["W"]});
const hulksThunderclap = card("Hulk's Thunderclap", "Sorcery", "{1}{G}", {"cmc":2,"keywords":["Behold"],"oracleText":"As an additional cost to cast this spell, you may behold a Gamma creature. (You may choose a Gamma creature you control or reveal a Gamma creature card from your hand.)\nTarget creature you control deals damage equal to its power to another target creature. If this spell's additional cost was paid, destroy target noncreature artifact or noncreature enchantment.","colors":["G"]});
const doseOfDawnglow = card("Dose of Dawnglow", "Instant", "{4}{B}", {"cmc":5,"keywords":["Blight"],"oracleText":"Return target creature card from your graveyard to the battlefield. Then if it isn't your main phase, blight 2. (Put two -1/-1 counters on a creature you control.)","colors":["B"]});
const ALL = [gristleGlutton, stingslinger, spiralIntoSolitude, evershrikesGift, championOfTheWeird, bogslithersEmbrace, wildUnraveling, burningCuriosity, cinderStrike, pyrrhicStrike, requitingHex, dispellingExhale, osseousExhale, piercingExhale, hyperionsAtomicVision, hulksThunderclap, doseOfDawnglow];

describe("Round 197", () => {
  it("all compile", () => supported(...ALL));

  it("Gristle Glutton: {T}, Blight 1 puts a -1/-1 counter on a creature you control (itself too), then loots", () => {
    const { s: s0, ap, opp } = setup([]);
    const glutton = putOnBattlefield(s0, ap, gristleGlutton);
    const theirs = putOnBattlefield(s0, opp, creature("Test Their Ox", "Ox", 3));
    into(s0, ap, creature("Test Discard Ox", "Ox", 1), "hand");
    // Not on an opponent's creature (CR 701.68a: a creature you control).
    expect(() => act(s0, { type: "activateAbility", player: ap, objectId: glutton, index: 0, costs: { counterOn: [theirs] } } as Action)).toThrow();
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planActivate(s0, ap, glutton, 0, undefined, undefined, undefined, undefined, { counterOn: [glutton] }));
    expect(s.objects[glutton]!.tapped).toBe(true);
    expect(minus(s, glutton)).toBe(1);
    expect(pt(s, glutton)).toEqual([0, 2]);
    s = resolveAll(s);
    s = act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand[0]!] });
    s = resolveAll(s);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.graveyard.length).toBe(1);
  });

  it("Sting-Slinger: blight 1 on another creature, 2 damage to each opponent", () => {
    const { s: s0, ap } = setup([]);
    const slinger = putOnBattlefield(s0, ap, stingslinger);
    const ox = putOnBattlefield(s0, ap, creature("Test Ox", "Ox", 2));
    let s = run(s0, planActivate(s0, ap, slinger, 0, undefined, undefined, undefined, undefined, { counterOn: [ox] }));
    expect(minus(s, ox)).toBe(1);
    s = resolveAll(s);
    for (const p of s.turnOrder) expect(s.players[p]!.life).toBe(p === ap ? 40 : 38);
  });

  it("Evershrike's Gift: Blight 2 can kill a 2/2 (rulings), and returns the Aura from your graveyard to your hand", () => {
    const { s: s0, ap } = setup([]);
    const gift = into(s0, ap, evershrikesGift, "graveyard");
    const ox = putOnBattlefield(s0, ap, creature("Test Ox", "Ox", 2));
    let s = run(s0, planActivate(s0, ap, gift, 0, undefined, undefined, undefined, undefined, { counterOn: [ox] }));
    expect(s.objects[ox]?.zone).toBe("graveyard");
    s = resolveAll(s);
    expect(s.objects[gift]!.zone).toBe("hand");
  });

  it("Evershrike's Gift: no creature to blight, no activation (CR 701.68b)", () => {
    const { s, ap } = setup([]);
    const gift = into(s, ap, evershrikesGift, "graveyard");
    expect(planActivate(s, ap, gift, 0)).toBeNull();
  });

  it("Spiral into Solitude: blight 1 and sacrifice it to exile the enchanted creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const theirs = putOnBattlefield(s0, opp, creature("Test Their Ox", "Ox", 3));
    const spiral = putOnBattlefield(s0, ap, spiralIntoSolitude);
    s0.objects[spiral]!.attachedTo = theirs;
    const ox = putOnBattlefield(s0, ap, creature("Test Ox", "Ox", 2));
    invalidateCharacteristics(s0);
    let s = run(s0, planActivate(s0, ap, spiral, 0, undefined, undefined, undefined, undefined, { counterOn: [ox] }));
    expect(minus(s, ox)).toBe(1);
    expect(s.objects[spiral]!.zone).toBe("graveyard");
    s = resolveAll(s);
    expect(s.objects[theirs]!.zone).toBe("exile");
  });

  it("Champion of the Weird: Pay 1 life, Blight 2: target opponent blights 2, on a creature they choose", () => {
    const { s: s0, ap, opp } = setup([]);
    const champ = putOnBattlefield(s0, ap, championOfTheWeird);
    const theirs = putOnBattlefield(s0, opp, creature("Test Their Ox", "Ox", 3));
    let s = run(s0, planActivate(s0, ap, champ, 0, [player(opp)], undefined, undefined, undefined, { counterOn: [champ] }));
    expect(s.players[ap]!.life).toBe(39);
    expect(minus(s, champ)).toBe(2);
    s = resolveAll(s);
    if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: opp, ids: [theirs] } as Action);
    s = resolveAll(s);
    expect(minus(s, theirs)).toBe(2);
  });

  it("Bogslither's Embrace: blight 1 or pay {3}; with no creature, only the {3}", () => {
    const { s: s0, ap, opp, ids } = setup([bogslithersEmbrace]);
    const theirs = putOnBattlefield(s0, opp, creature("Test Their Ox", "Ox", 3));
    // No creature of ours: the blight way can't be chosen (CR 701.68b).
    expect(planCast(s0, ap, ids[0]!, [tgt(theirs)], undefined, undefined, undefined, { costOr: 0 })).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [tgt(theirs)], undefined, undefined, undefined, { costOr: 1 })).not.toBeNull();
    const ox = putOnBattlefield(s0, ap, creature("Test Ox", "Ox", 2));
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && !s0.objects[id]!.tapped).length;
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)], undefined, undefined, undefined, { costOr: 0, counterOn: [ox] }));
    expect(minus(s, ox)).toBe(1);
    // {1}{B} only: two lands tapped.
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length).toBe(lands - 2);
    s = resolveAll(s);
    expect(s.objects[theirs]!.zone).toBe("exile");
  });

  it("Wild Unraveling: blight 2 counters a spell", () => {
    const { s: s0, ap, ids } = setup([wildUnraveling, creature("Test Spell Ox", "Ox", 2, 2, "{1}{G}")]);
    const ox = putOnBattlefield(s0, ap, creature("Test Big Ox", "Ox", 4));
    let s = run(s0, planCast(s0, ap, ids[1]!));
    const spell = s.stack.at(-1)!.id;
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: spell }], undefined, undefined, undefined, { costOr: 0, counterOn: [ox] }));
    expect(minus(s, ox)).toBe(2);
    s = resolveAll(s);
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
  });

  it("Cinder Strike: 2 damage, or 4 if you blighted 1 as you cast it", () => {
    const { s: s0, ap, opp, ids } = setup([cinderStrike]);
    const big = putOnBattlefield(s0, opp, creature("Test Their Big Ox", "Ox", 4));
    const ox = putOnBattlefield(s0, ap, creature("Test Ox", "Ox", 2));
    const plain = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(big)])));
    expect(plain.objects[big]!.damage).toBe(2);
    expect(minus(plain, ox)).toBe(0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(big)], undefined, undefined, undefined, { kicks: [0], counterOn: [ox] }));
    expect(minus(s, ox)).toBe(1);
    s = resolveAll(s);
    expect(s.objects[big]!.zone).toBe("graveyard");
  });

  it("Burning Curiosity: exile two, or three if you blighted; play them until the end of your next turn", () => {
    const { s: s0, ap, ids } = setup([burningCuriosity]);
    const ox = putOnBattlefield(s0, ap, creature("Test Ox", "Ox", 2));
    const exiled = (s: GameState) => s.players[ap]!.exile.length;
    const plain = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(exiled(plain)).toBe(2);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { kicks: [0], counterOn: [ox] })));
    expect(exiled(s)).toBe(3);
    expect(s.players[ap]!.exile.every((id) => s.objects[id]!.mayPlay)).toBe(true);
  });

  it("Pyrrhic Strike: one mode, or both (and only both) if you blighted 2", () => {
    const { s: s0, ap, opp, ids } = setup([pyrrhicStrike]);
    const art = putOnBattlefield(s0, opp, card("Test Rock", "Artifact", "{2}"));
    const big = putOnBattlefield(s0, opp, creature("Test Their Big Ox", "Ox", 4, 4, "{3}{G}"));
    const ox = putOnBattlefield(s0, ap, creature("Test Ox", "Ox", 3));
    expect(planCast(s0, ap, ids[0]!, [tgt(art), tgt(big)], [0, 1])).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [tgt(art)], [0], undefined, undefined, { kicks: [0], counterOn: [ox] })).toBeNull();
    const one = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(art)], [0])));
    expect(one.objects[art]!.zone).toBe("graveyard");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(art), tgt(big)], [0, 1], undefined, undefined, { kicks: [0], counterOn: [ox] })));
    expect(minus(s, ox)).toBe(2);
    expect(s.objects[art]!.zone).toBe("graveyard");
    expect(s.objects[big]!.zone).toBe("graveyard");
  });

  it("Requiting Hex: you gain 2 life only if you blighted", () => {
    const { s: s0, ap, opp, ids } = setup([requitingHex]);
    const small = putOnBattlefield(s0, opp, creature("Test Their Small Ox", "Ox", 2, 2, "{1}{G}"));
    const ox = putOnBattlefield(s0, ap, creature("Test Ox", "Ox", 2));
    const plain = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(small)])));
    expect(plain.players[ap]!.life).toBe(40);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(small)], undefined, undefined, undefined, { kicks: [0], counterOn: [ox] })));
    expect(s.objects[small]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(42);
  });

  it("Dispelling Exhale: counter unless its controller pays {2}, or {4} if a Dragon card was revealed from your hand", () => {
    const dragon = creature("Test Dragon", "Dragon", 5, 5, "{5}{R}");
    const { s: s0, ap, ids } = setup([dispellingExhale, creature("Test Spell Ox", "Ox", 2, 2, "{1}{G}"), dragon]);
    const cast = (kick: boolean) => {
      let s = run(structuredClone(s0), planCast(s0, ap, ids[1]!));
      const spell = s.stack.at(-1)!.id;
      s = run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: spell }], undefined, undefined, undefined, kick ? { kicks: [0], reveal: [ids[2]!] } : {}));
      return resolveAll(s);
    };
    expect(cast(false).pending).toMatchObject({ kind: "payUnless", cost: "{2}" });
    const s = cast(true);
    expect(s.pending).toMatchObject({ kind: "payUnless", cost: "{4}" });
    // The revealed Dragon stays in your hand.
    expect(s.objects[ids[2]!]!.zone).toBe("hand");
  });

  it("Dispelling Exhale: no Dragon to behold, no paying the additional cost", () => {
    const { s: s0, ap, ids } = setup([dispellingExhale, creature("Test Spell Ox", "Ox", 2, 2, "{1}{G}")]);
    const s = run(s0, planCast(s0, ap, ids[1]!));
    expect(planCast(s, ap, ids[0]!, [{ kind: "stack", id: s.stack.at(-1)!.id }], undefined, undefined, undefined, { kicks: [0] })).toBeNull();
  });

  it("Osseous Exhale: a Dragon you control beheld, 5 damage to an attacker and you gain 2 life", () => {
    const { s: s0, ap, opp, ids } = setup([osseousExhale]);
    const dragon = putOnBattlefield(s0, ap, creature("Test Dragon", "Dragon", 5, 5, "{5}{R}"));
    const attacker = putOnBattlefield(s0, opp, creature("Test Their Ox", "Ox", 4));
    s0.objects[attacker]!.attacking = { player: ap } as never;
    invalidateCharacteristics(s0);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(attacker)], undefined, undefined, undefined, { kicks: [0], reveal: [dragon] })));
    expect(s.objects[attacker]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(42);
    expect(s.objects[dragon]!.zone).toBe("battlefield");
  });

  it("Hulk's Thunderclap: the third target only if a Gamma creature was beheld", () => {
    const gamma = creature("Test Gamma Brute", "Gamma Berserker", 3, 3, "{2}{G}");
    const { s: s0, ap, opp, ids } = setup([hulksThunderclap, gamma]);
    const mine = putOnBattlefield(s0, ap, creature("Test Ox", "Ox", 5));
    const theirs = putOnBattlefield(s0, opp, creature("Test Their Ox", "Ox", 3));
    const rock = putOnBattlefield(s0, opp, card("Test Rock", "Artifact", "{2}"));
    expect(planCast(s0, ap, ids[0]!, [tgt(mine), tgt(theirs), tgt(rock)])).toBeNull();
    const plain = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(mine), tgt(theirs), { kind: "none" }])));
    expect(plain.objects[theirs]!.zone).toBe("graveyard");
    expect(plain.objects[rock]!.zone).toBe("battlefield");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(mine), tgt(theirs), tgt(rock)], undefined, undefined, undefined, { kicks: [0], reveal: [ids[1]!] })));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[rock]!.zone).toBe("graveyard");
  });

  it("Hyperion's Atomic Vision: a Hero beheld, scry 2 after destroying the tapped creature", () => {
    const hero = creature("Test Hero", "Human Hero", 2, 2, "{1}{W}");
    const { s: s0, ap, opp, ids } = setup([hyperionsAtomicVision, hero]);
    const theirs = putOnBattlefield(s0, opp, creature("Test Their Ox", "Ox", 3));
    s0.objects[theirs]!.tapped = true;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)], undefined, undefined, undefined, { kicks: [0], reveal: [ids[1]!] })));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap });
  });

  it("Piercing Exhale: a Dragon beheld, the bite and then surveil 2", () => {
    const { s: s0, ap, opp, ids } = setup([piercingExhale]);
    const dragon = putOnBattlefield(s0, ap, creature("Test Dragon", "Dragon", 5, 5, "{5}{R}"));
    const theirs = putOnBattlefield(s0, opp, creature("Test Their Ox", "Ox", 3));
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(dragon), tgt(theirs)], undefined, undefined, undefined, { kicks: [0], reveal: [dragon] })));
    expect(s.objects[theirs]!.damage).toBe(5);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "surveil", player: ap });
  });

  it("an optional additional cost isn't kicker: a 'whenever you cast a kicked spell' trigger doesn't see it", () => {
    const merfolk = card("Lullmage's Familiar", "Creature — Merfolk Wizard", "{G}{U}", { cmc: 2, power: "1", toughness: "1", oracleText: "{T}: Add {G} or {U}.\nWhenever you cast a kicked spell, you gain 2 life." });
    supported(merfolk);
    const { s: s0, ap, opp, ids } = setup([requitingHex]);
    putOnBattlefield(s0, ap, merfolk);
    const small = putOnBattlefield(s0, opp, creature("Test Their Small Ox", "Ox", 2, 2, "{1}{G}"));
    const ox = putOnBattlefield(s0, ap, creature("Test Ox", "Ox", 2));
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(small)], undefined, undefined, undefined, { kicks: [0], counterOn: [ox] })));
    // Requiting Hex's own 2 life only.
    expect(s.players[ap]!.life).toBe(42);
  });

  it("Dose of Dawnglow: no blight during your main phase; on another player's turn, blight 2", () => {
    const { s: s0, ap, ids } = setup([doseOfDawnglow]);
    const dead = into(s0, ap, creature("Test Dead Ox", "Ox", 3), "graveyard");
    const main = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(dead)])));
    expect(main.objects[dead]!.zone).toBe("battlefield");
    expect(main.pending).toBeFalsy();
    expect(minus(main, dead)).toBe(0);
    // On the next player's turn (instant speed): the blight happens, on the returned creature if it's the only one.
    let s = passUntil(structuredClone(s0), "upkeep", next(s0, ap));
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 5 } as never;
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(dead)])));
    if (s.pending?.kind === "pickPermanents") s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [dead] } as Action));
    expect(minus(s, dead)).toBe(2);
  });
});
