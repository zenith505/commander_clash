// Round 132: round 131's gaps (Doubling Cube, Fear of Sleep Paralysis, Titan's Presence, Blitzball, Lord of the Nazgûl),
// then the most played cards.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { addMana, canPayFromPool } from "../src/spend";
import { dealDamage, objectSource } from "../src/damage";
import { abilityProblem, blockProblem, botActions, parseManaCost, characteristics, defOf, isFullySupported, manaOptions, planActivate, planCast, planManaAbility, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Bots answer every choice and everyone passes until the stack and trigger queue are empty. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const who = s.pending ? s.pending.player : waitingOn(s)!;
    const acts = s.pending ? botActions(s, who) : [];
    s = acts.length ? acts.reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: who });
  }
  return s;
};
/** Everyone passes until something asks a player to choose (or the stack is empty). */
const passToPending = (s: GameState) => {
  for (let i = 0; i < 30 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const logText = (s: GameState) => s.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n");
/** A fresh copy of `def` put into `pid`'s `zone` (on top of the library). */
const putIn = (s: GameState, pid: PlayerId, def: CardDef, zone: "library" | "graveyard" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
const opponentsOf = (s: GameState, ap: PlayerId) => [1, 2, 3].map((n) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % 4]!);
const ogre = (name = "Test Ogre", p = "3") => card(name, "Creature — Ogre", "{2}{R}", { power: p, toughness: "3" });
const nameOf = (s: GameState, id: string) => defOf(s, s.objects[id]!).name;
const poolOf = (s: GameState, pid: PlayerId) => Object.entries(s.players[pid]!.manaPool).filter(([, n]) => n).map(([m, n]) => `${m}${n}`).join(" ");
void [settleBots, passToPending, logText, putIn, opponentsOf, ogre, nameOf, characteristics, planActivate, planCast, passUntil];

const doublingCube = card("Doubling Cube", "Artifact", "{2}", { oracleText: "{3}, {T}: Double the amount of each type of unspent mana you have." });
const ziggurat = card("Ancient Ziggurat", "Land", "", { oracleText: "{T}: Add one mana of any color. Spend this mana only to cast a creature spell." });

describe("Doubling Cube: its mana is worked out once its {3} is paid from the pool (rulings)", () => {
  it("each way to pay {3} from the pool is offered, and what's left is doubled", () => {
    supported(doublingCube);
    const { s: s0, ap } = setup([]);
    const cube = putOnBattlefield(s0, ap, doublingCube);
    for (const p of Object.values(s0.players)) p.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    addMana(s0, ap, ["W", "W", "U", "U", "C"]);
    const opts = manaOptions(s0, s0.objects[cube]!);
    // {W}{W}{U}, {W}{W}{C}, {W}{U}{U}, {W}{U}{C}, {U}{U}{C}
    expect(opts.map((x) => x.pays!.join(""))).toEqual(["WWU", "WWC", "WUU", "WUC", "UUC"]);
    const x = opts.find((o) => o.pays!.join("") === "UUC")!;
    expect(x.adds).toEqual(["W", "W"]);
    const s = run(s0, planManaAbility(s0, ap, cube, x.ability, x.mana, undefined, undefined, x.combo));
    expect(poolOf(s, ap)).toBe("W4");
    expect(s.objects[cube]!.tapped).toBe(true);
  });

  it("restricted mana is doubled into mana without the restriction, and can't pay for it", () => {
    const { s: s0, ap } = setup([]);
    const cube = putOnBattlefield(s0, ap, doublingCube);
    const zig = putOnBattlefield(s0, ap, ziggurat);
    for (const p of Object.values(s0.players)) p.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    let s = act(s0, { type: "activateMana", player: ap, objectId: zig, mana: "G" });
    addMana(s, ap, ["C", "C", "C"]);
    const opts = manaOptions(s, s.objects[cube]!);
    expect(opts.map((o) => o.pays!.join(""))).toEqual(["CCC"]);
    s = run(s, planManaAbility(s, ap, cube, opts[0]!.ability, opts[0]!.mana, undefined, undefined, opts[0]!.combo));
    expect(poolOf(s, ap)).toBe("G2");
    // One {G} can pay for an ability now, the other still only for a creature spell.
    expect(s.players[ap]!.manaLots?.filter((l) => l.n && l.only).map((l) => l.n)).toEqual([1]);
    expect(canPayFromPool(s, ap, parseManaCost("{G}"), { ability: s.objects[cube]! })).toBe(true);
  });

  it("with less than {3} in the pool it can't be activated, and automatic payment never uses it", () => {
    const { s: s0, ap } = setup([]);
    const cube = putOnBattlefield(s0, ap, doublingCube);
    for (const p of Object.values(s0.players)) p.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    addMana(s0, ap, ["R", "R"]);
    expect(manaOptions(s0, s0.objects[cube]!)).toEqual([]);
    // With {3} in the pool, a {1} spell is still paid from the pool, not by doubling it.
    addMana(s0, ap, ["R"]);
    expect(manaOptions(s0, s0.objects[cube]!).length).toBe(1);
    const spell = card("Test Shock", "Instant", "{1}{R}", { oracleText: "Test Shock deals 2 damage to any target." });
    const id = putIn(s0, ap, spell, "hand");
    const plan = planCast(s0, ap, id, [{ kind: "player", id: opponentsOf(s0, ap)[0]! }]);
    expect(plan?.some((a) => "objectId" in a && a.objectId === cube)).toBe(false);
  });
});

const fearOfSleepParalysis = card("Fear of Sleep Paralysis", "Enchantment Creature — Nightmare", "{5}{U}", { power: "6", toughness: "6", keywords: ["Flying", "Eerie"], oracleText: "Flying\nEerie — Whenever this creature or another enchantment you control enters and whenever you fully unlock a Room, tap up to one target creature and put a stun counter on it.\nStun counters can't be removed from permanents your opponents control. (They won't untap if they have stun counters.)" });
const hexmage = card("Vampire Hexmage", "Creature — Vampire Shaman", "{B}{B}", { power: "2", toughness: "1", keywords: ["First strike"], oracleText: "First strike\nSacrifice this creature: Remove all counters from target permanent." });

describe("Fear of Sleep Paralysis: stun counters stay on its controller's opponents' permanents (rulings)", () => {
  it("its eerie trigger stuns a creature, which then neither untaps nor loses the counter", () => {
    supported(fearOfSleepParalysis, hexmage);
    const { s: s0, ap, ids, opp } = setup([fearOfSleepParalysis]);
    const theirs = putOnBattlefield(s0, opp, ogre("Their Ogre"));
    const mine = putOnBattlefield(s0, ap, ogre("My Ogre"));
    s0.objects[mine]!.tapped = true;
    s0.objects[mine]!.counters.stun = 1;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = passToPending(s);
    // The spell resolves, then its eerie trigger asks for its target.
    for (let i = 0; i < 10 && s.objects[ids[0]!]!.zone !== "battlefield"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: theirs }] } as Action);
    s = passToPending(s);
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(s.objects[theirs]!.counters.stun).toBe(1);
    // Their untap step: it stays tapped with its counter.
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(s.objects[theirs]!.counters.stun).toBe(1);
    // Mine untap as usual: the stun counter comes off instead (CR 122.1d).
    s = passUntil(s, "upkeep", ap);
    expect(s.objects[mine]!.counters.stun ?? 0).toBe(0);
    expect(s.objects[mine]!.tapped).toBe(true);
  });

  it("\"remove all counters\" leaves the stun counters on an opponent's permanent", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, fearOfSleepParalysis);
    const theirs = putOnBattlefield(s0, opp, ogre("Their Ogre"));
    const h = putOnBattlefield(s0, opp, hexmage);
    Object.assign(s0.objects[theirs]!.counters, { stun: 2, "+1/+1": 1 });
    // The opponent sacrifices Vampire Hexmage on their own stunned creature.
    s0.priority = opp;
    let s = run(s0, planActivate(s0, opp, h, 0, [{ kind: "object", id: theirs }]));
    s = settleBots(s);
    expect(s.objects[theirs]!.counters).toMatchObject({ stun: 2 });
    expect(s.objects[theirs]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

const titansPresence = card("Titan's Presence", "Instant", "{3}", { oracleText: "As an additional cost to cast this spell, reveal a colorless creature card from your hand.\nExile target creature if its power is less than or equal to the revealed card's power." });
const calamity = card("Calamity of the Titans", "Sorcery", "{4}{C}{C}", { oracleText: "As an additional cost to cast this spell, reveal a colorless creature card from your hand.\nExile each creature and planeswalker with mana value less than the revealed card's mana value." });
const titan = card("Test Titan", "Creature — Eldrazi", "{5}", { power: "4", toughness: "4" });

describe("Titan's Presence and the other reveal-cost cards: the revealed card as it last existed in the hand (rulings)", () => {
  it("exiles the target only if its power is at most the revealed card's, even after that card left the hand", () => {
    supported(titansPresence, calamity);
    const { s: s0, ap, ids, opp } = setup([titansPresence, titan]);
    const small = putOnBattlefield(s0, opp, ogre("Small Ogre", "4"));
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: small }], undefined, "auto", undefined, { reveal: [ids[1]!] }));
    expect(logText(s)).toMatch(/reveals Test Titan from their hand/);
    // The revealed card is discarded in response: its power in the hand still counts.
    const p = s.players[ap]!;
    p.hand.splice(p.hand.indexOf(ids[1]!), 1);
    p.graveyard.push(ids[1]!);
    s.objects[ids[1]!]!.zone = "graveyard";
    s = settleBots(s);
    expect(s.objects[small]!.zone).toBe("exile");
  });

  it("does nothing to a creature with greater power", () => {
    const { s: s0, ap, ids, opp } = setup([titansPresence, titan]);
    const big = putOnBattlefield(s0, opp, ogre("Big Ogre", "5"));
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: big }], undefined, "auto", undefined, { reveal: [ids[1]!] }));
    s = settleBots(s);
    expect(s.objects[big]!.zone).toBe("battlefield");
  });

  it("Calamity of the Titans exiles each creature with lesser mana value than the revealed card", () => {
    const { s: s0, ap, ids, opp } = setup([calamity, titan]);
    const cheap = putOnBattlefield(s0, opp, ogre("Cheap Ogre")); // mana value 3
    const five = putOnBattlefield(s0, opp, card("Five Drop", "Creature — Ogre", "{4}{R}", { power: "5", toughness: "5" }));
    addMana(s0, ap, ["C", "C"]);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { reveal: [ids[1]!] }));
    s = settleBots(s);
    expect(s.objects[cheap]!.zone).toBe("exile");
    expect(s.objects[five]!.zone).toBe("battlefield");
  });
});

const blitzball = card("Blitzball", "Artifact", "{3}", { oracleText: "{T}: Add one mana of any color.\nGOOOOAAAALLL! — {T}, Sacrifice this artifact: Draw two cards. Activate only if an opponent was dealt combat damage by a legendary creature this turn." });
const legend = card("Test Legend", "Legendary Creature — Human Warrior", "{2}{R}", { power: "3", toughness: "3" });

describe("Blitzball: only once an opponent was dealt combat damage by a legendary creature this turn", () => {
  it("can't be activated before, and can after a legendary creature's combat damage to an opponent", () => {
    supported(blitzball);
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, blitzball);
    const l = putOnBattlefield(s0, ap, legend);
    const plain = putOnBattlefield(s0, ap, ogre());
    expect(abilityProblem(s0, ap, b, 0)).toMatch(/can't be activated|only/);
    // A nonlegendary creature's combat damage doesn't count.
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: plain, defender: opp }] });
    s = passUntil(s, "main2", ap);
    expect(s.players[opp]!.life).toBe(37);
    expect(abilityProblem(s, ap, b, 0)).not.toBeNull();
    // Next turn of ours, the legend attacks.
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: l, defender: opp }] });
    s = passUntil(s, "main2", ap);
    expect(abilityProblem(s, ap, b, 0)).toBeNull();
    const hand = s.players[ap]!.hand.length;
    s = settleBots(run(s, planActivate(s, ap, b, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });
});

const lordOfTheNazgul = card("Lord of the Nazgûl", "Legendary Creature — Wraith Noble", "{3}{U}{B}", { power: "4", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWraiths you control have protection from Ring-bearers.\nWhenever you cast an instant or sorcery spell, create a 3/3 black Wraith creature token with menace. Then if you control nine or more Wraiths, Wraiths you control have base power and toughness 9/9 until end of turn." });
const wraith = card("Test Wraith", "Creature — Wraith", "{2}{B}", { power: "3", toughness: "3" });

describe("Lord of the Nazgûl: Wraiths you control have protection from Ring-bearers (CR 701.54, 702.16)", () => {
  it("an opponent's Ring-bearer can't block a Wraith, and its damage to one is prevented; once it isn't the Ring-bearer, it can", () => {
    supported(lordOfTheNazgul);
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, lordOfTheNazgul);
    const w = putOnBattlefield(s, ap, wraith);
    const bearer = putOnBattlefield(s, opp, ogre("Bearer"));
    const other = putOnBattlefield(s, opp, ogre("Other Ogre"));
    s.players[opp]!.ring = { tempted: 1, timestamp: s.nextTimestamp++, bearer: { id: bearer, zc: 0 } };
    s.objects[w]!.attacking = opp;
    expect(blockProblem(s, s.objects[bearer]!, s.objects[w]!)).toMatch(/protection/);
    expect(blockProblem(s, s.objects[other]!, s.objects[w]!)).toBeNull();
    expect(dealDamage(s, objectSource(s, s.objects[bearer]!), { object: s.objects[w]! }, 3)).toBe(0);
    expect(dealDamage(s, objectSource(s, s.objects[other]!), { object: s.objects[w]! }, 1)).toBe(1);
    // The designation is gone: an ordinary creature again.
    s.players[opp]!.ring!.bearer = { id: other, zc: 0 };
    expect(blockProblem(s, s.objects[bearer]!, s.objects[w]!)).toBeNull();
    expect(blockProblem(s, s.objects[other]!, s.objects[w]!)).toMatch(/protection/);
  });
});

const igniteTheFuture = card("Ignite the Future", "Sorcery", "{3}{R}", { oracleText: "Exile the top three cards of your library. Until the end of your next turn, you may play those cards. If this spell was cast from a graveyard, you may play cards this way without paying their mana costs.\nFlashback {7}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const blaze = card("Test Blaze", "Sorcery", "{X}{R}", { oracleText: "Test Blaze deals X damage to any target." });
/** The mana `pid` could still make: untapped lands and what's in their pool. */
const untapped = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && ["Forest", "Island", "Swamp", "Mountain", "Plains"].includes(nameOf(s, id))).length + Object.values(s.players[pid]!.manaPool).reduce((a, b) => a + b, 0);

describe("Ignite the Future: free plays only when it was cast from a graveyard, and then paying is still allowed (rulings)", () => {
  it("cast from the hand: the exiled cards are played paying their costs", () => {
    supported(igniteTheFuture);
    const { s: s0, ap, ids } = setup([igniteTheFuture]);
    const o = putIn(s0, ap, ogre("Exiled Ogre"), "library");
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[o]!.zone).toBe("exile");
    expect(s.objects[o]!.mayPlay).toMatchObject({ until: "nextTurn" });
    expect(s.objects[o]!.mayPlay?.free).toBeUndefined();
    const before = untapped(s, ap);
    s = settleBots(run(s, planCast(s, ap, o)));
    expect(s.objects[o]!.zone).toBe("battlefield");
    expect(untapped(s, ap)).toBe(before - 3);
  });

  it("cast with flashback: free, or for its mana cost to choose an X", () => {
    const { s: s0, ap, ids, opp } = setup([igniteTheFuture]);
    const p = s0.players[ap]!;
    p.hand.splice(p.hand.indexOf(ids[0]!), 1);
    p.graveyard.push(ids[0]!);
    s0.objects[ids[0]!]!.zone = "graveyard";
    const b = putIn(s0, ap, blaze, "library");
    const o = putIn(s0, ap, ogre("Exiled Ogre"), "library");
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "flashback" })));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.objects[o]!.mayPlay).toMatchObject({ free: true, orPay: true });
    const before = untapped(s, ap);
    s = settleBots(run(s, planCast(s, ap, o)));
    expect(s.objects[o]!.zone).toBe("battlefield");
    expect(untapped(s, ap)).toBe(before);
    // X = 3: its mana cost is paid ({3}{R}).
    s = settleBots(run(s, planCast(s, ap, b, [{ kind: "player", id: opp }], undefined, undefined, 3)));
    expect(s.players[opp]!.life).toBe(37);
    expect(untapped(s, ap)).toBe(before - 4);
  });
});

const dihada = card("Dihada, Binder of Wills", "Legendary Planeswalker — Dihada", "{1}{R}{W}{B}", { loyalty: "5", oracleText: "+2: Up to one target legendary creature gains vigilance, lifelink, and indestructible until your next turn.\n−3: Reveal the top four cards of your library. Put any number of legendary cards from among them into your hand and the rest into your graveyard. Create a Treasure token for each card put into your graveyard this way.\n−11: Gain control of all nonland permanents until end of turn. Untap them. They gain haste until end of turn.\nDihada, Binder of Wills can be your commander." });

describe("Dihada, Binder of Wills: a Treasure for each card put into the graveyard by its −3", () => {
  it("keeps the legendary cards chosen; the rest, a legendary one left too, make Treasures", () => {
    supported(dihada);
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, dihada);
    s0.objects[d]!.counters.loyalty = 5;
    const cards = [legend, ogre(), card("Other Legend", "Legendary Creature — Elf", "{G}", { power: "1", toughness: "1" }), ogre("Second Ogre")].map((c) => putIn(s0, ap, c, "library"));
    let s = passToPending(run(s0, planActivate(s0, ap, d, 1)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const pend = s.pending as { cards: string[] };
    expect([...pend.cards].sort()).toEqual([cards[0]!, cards[2]!].sort());
    s = act(s, { type: "searchLibrary", player: ap, found: [cards[0]!] });
    s = settleBots(s);
    expect(s.objects[cards[0]!]!.zone).toBe("hand");
    expect([cards[1]!, cards[2]!, cards[3]!].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && /^Treasure/.test(nameOf(s, id))).length).toBe(3);
  });
});

const selectiveObliteration = card("Selective Obliteration", "Sorcery", "{3}{C}{C}", { oracleText: "Each player chooses a color. Then exile each permanent unless it's colorless or it's only the color its controller chose." });

describe("Selective Obliteration: each player's color spares only their own monocolored permanents (rulings)", () => {
  it("asks each player in turn order; colorless permanents stay, multicolored ones go", () => {
    supported(selectiveObliteration);
    const { s: s0, ap, ids, opp } = setup([selectiveObliteration]);
    addMana(s0, ap, ["C", "C"]);
    const myRed = putOnBattlefield(s0, ap, ogre("My Red Ogre"));
    const myGreen = putOnBattlefield(s0, ap, card("My Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    const myGold = putOnBattlefield(s0, ap, card("My Gold", "Creature — Elf", "{R}{G}", { power: "2", toughness: "2" }));
    const theirRed = putOnBattlefield(s0, opp, ogre("Their Red Ogre"));
    const theirGreen = putOnBattlefield(s0, opp, card("Their Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    const rock = putOnBattlefield(s0, opp, card("Their Rock", "Artifact", "{2}"));
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color", player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: "Red" });
    // The others, in turn order.
    const order: PlayerId[] = [];
    while (s.pending?.kind === "chooseOption" && s.pending.what === "color") {
      const who = s.pending.player;
      order.push(who);
      s = act(s, { type: "chooseOption", player: who, choice: "Green" });
    }
    expect(order).toEqual(opponentsOf(s, ap));
    s = settleBots(s);
    expect([myRed, myGreen, myGold, theirRed, theirGreen, rock].map((id) => s.objects[id]!.zone)).toEqual(["battlefield", "exile", "exile", "exile", "battlefield", "battlefield"]);
    // Lands are colorless: they stay.
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Forest").length).toBeGreaterThan(0);
  });

  it("a bot picks the color of its own most valuable monocolored permanents", () => {
    const { s: s0, ap, ids, opp } = setup([selectiveObliteration]);
    addMana(s0, ap, ["C", "C"]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, card(`Their Elf ${i}`, "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    putOnBattlefield(s0, opp, ogre("Their Ogre"));
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "chooseOption", player: ap, choice: "Red" });
    while (s.pending?.kind === "chooseOption" && s.pending.player !== opp) s = act(s, { type: "chooseOption", player: s.pending.player, choice: "Blue" });
    expect(botActions(s, opp)).toEqual([{ type: "chooseOption", player: opp, choice: "Green" }]);
  });
});

const neyali = card("Neyali, Suns' Vanguard", "Legendary Creature — Human Rebel", "{2}{R}{W}", { power: "3", toughness: "3", oracleText: "Attacking tokens you control have double strike.\nWhenever one or more tokens you control attack a player, exile the top card of your library. During any turn you attacked with a token, you may play that card." });

describe("Neyali, Suns' Vanguard: the exiled card is playable during any turn you attacked with a token (rulings)", () => {
  it("once for each player attacked; playable that turn, not in a turn without a token attack, again in a later one", () => {
    supported(neyali);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, neyali);
    const t1 = putOnBattlefield(s0, ap, card("Soldier Token", "Token Creature — Soldier", "", { power: "1", toughness: "1" }));
    const t2 = putOnBattlefield(s0, ap, card("Soldier Token", "Token Creature — Soldier", "", { power: "1", toughness: "1" }));
    s0.objects[t1]!.isToken = s0.objects[t2]!.isToken = true;
    const top = [ogre("Second Exiled"), ogre("First Exiled")].map((c) => putIn(s0, ap, c, "library"));
    const other = opponentsOf(s0, ap)[1]!;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t1, defender: opp }, { attacker: t2, defender: other }] });
    s = settleBots(s);
    // Two players attacked: two cards.
    expect(top.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
    s = passUntil(s, "main2", ap);
    expect(planCast(s, ap, top[1]!)).not.toBeNull();
    // The next turn of ours, without attacking: not playable.
    s = passUntil(s, "main1", ap, 4000);
    expect(planCast(s, ap, top[1]!)).toBeNull();
    // Attacking with a token again: it is.
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t1, defender: opp }] });
    s = passUntil(s, "main2", ap);
    expect(planCast(s, ap, top[0]!)).not.toBeNull();
  });
});

const bonnyPall = card("Bonny Pall, Clearcutter", "Legendary Creature — Giant Scout", "{3}{G}{U}", { power: "6", toughness: "5", keywords: ["Reach"], oracleText: "Reach\nWhen Bonny Pall enters, create Beau, a legendary blue Ox creature token with \"Beau's power and toughness are each equal to the number of lands you control.\"\nWhenever you attack, draw a card, then you may put a land card from your hand or graveyard onto the battlefield." });

describe("Bonny Pall, Clearcutter: Beau, and a land from the hand or graveyard whenever you attack", () => {
  it("Beau's power and toughness are the lands you control; attacking draws, then a land comes from the graveyard", () => {
    supported(bonnyPall);
    const { s: s0, ap, ids, opp } = setup([bonnyPall]);
    const yardLand = putIn(s0, ap, card("Test Grove", "Land", "", { oracleText: "{T}: Add {G}." }), "graveyard");
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    const beau = s.battlefield.find((id) => nameOf(s, id) === "Beau")!;
    expect(s.objects[beau]!.isToken).toBe(true);
    expect(characteristics(s, s.objects[beau]!).supertypes).toContain("Legendary");
    expect(pt(s, beau)).toBe("14/14");
    const attacker = putOnBattlefield(s, ap, ogre());
    s = passUntil(s, "declareAttackers", ap);
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
    s = passToPending(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    expect((s.pending as { cards: string[] }).cards).toContain(yardLand);
    s = act(s, { type: "searchLibrary", player: ap, found: [yardLand] });
    expect(s.objects[yardLand]!.zone).toBe("battlefield");
    expect(pt(s, beau)).toBe("15/15");
  });
});
