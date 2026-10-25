// Round 160: the most played cards, in popularity order, starting with Bonus Round.

import { describe, expect, it } from "vitest";
import { act, bear, card, mountain, passUntil, pt, putOnBattlefield, scry, setup } from "./helpers";
import { botActions, castProblem, characteristics, foretellCostOf, foretellProblem, invalidateCharacteristics, isFullySupported, legalActions, planCast, planForetell, spellCost, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const obj = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const mine = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && nameOf(s, id) === name);
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const total = (c: { cost: { symbols: unknown[] }; extra: number }) => c.cost.symbols.length + c.extra;

// Real oracle text (Scryfall).
const bonus = card("Bonus Round", "Sorcery", "{1}{R}{R}", {cmc: 3,oracleText: "Until end of turn, whenever a player casts an instant or sorcery spell, that player copies it and may choose new targets for the copy."});
const danitha = card("Danitha, Benalia's Hope", "Legendary Creature — Human Knight", "{4}{W}", {cmc: 5,power: "4",toughness: "4",keywords: ["Lifelink","Vigilance","First strike"],oracleText: "First strike, vigilance, lifelink\nWhen Danitha enters, you may put an Aura or Equipment card from your hand or graveyard onto the battlefield attached to Danitha."});
const researchers = card("Academy Researchers", "Creature — Human Wizard", "{1}{U}{U}", {cmc: 3,power: "2",toughness: "2",oracleText: "When this creature enters, you may put an Aura card from your hand onto the battlefield attached to this creature."});
const radgull = card("Vexing Radgull", "Creature — Bird Mutant", "{1}{U}", {cmc: 2,power: "1",toughness: "2",keywords: ["Flying","Proliferate"],oracleText: "Flying\nWhenever this creature deals combat damage to a player, that player gets two rad counters if they don't have any rad counters. Otherwise, proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)"});
const sylvan = card("Sylvan Offering", "Sorcery", "{X}{G}", {cmc: 1,oracleText: "Choose an opponent. You and that player each create an X/X green Treefolk creature token.\nChoose an opponent. You and that player each create X 1/1 green Elf Warrior creature tokens."});
const benevolent = card("Benevolent Offering", "Instant", "{3}{W}", {cmc: 4,oracleText: "Choose an opponent. You and that player each create three 1/1 white Spirit creature tokens with flying.\nChoose an opponent. You gain 2 life for each creature you control and that player gains 2 life for each creature they control."});
const intellectual = card("Intellectual Offering", "Instant", "{4}{U}", {cmc: 5,oracleText: "Choose an opponent. You and that player each draw three cards.\nChoose an opponent. Untap all nonland permanents you control and all nonland permanents that player controls."});
const roku = card("Avatar Roku, Firebender", "Legendary Creature — Human Avatar", "{3}{R}{R}{R}", {cmc: 6,power: "6",toughness: "6",oracleText: "Whenever a player attacks, add six {R}. Until end of combat, you don't lose this mana as steps end.\n{R}{R}{R}: Target creature gets +3/+0 until end of turn."});
const snort = card("Snort", "Sorcery", "{3}{R}", {cmc: 4,keywords: ["Flashback"],oracleText: "Each player may discard their hand and draw five cards. Then Snort deals 5 damage to each opponent who discarded their hand this way.\nFlashback {5}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"});
const devourer = card("Dream Devourer", "Creature — Demon Cleric", "{1}{B}", {cmc: 2,power: "0",toughness: "3",oracleText: "Each nonland card in your hand without foretell has foretell. Its foretell cost is equal to its mana cost reduced by {2}. (During your turn, you may pay {2} and exile it from your hand face down. Cast it on a later turn for its foretell cost.)\nWhenever you foretell a card, this creature gets +2/+0 until end of turn."});
const bohn = card("Bohn, Beguiling Balladeer", "Legendary Creature — Human Bard", "{1}{U}{R}", {cmc: 3,power: "3",toughness: "3",keywords: ["Goad"],oracleText: "Each nonland card in your hand without foretell has foretell. Its foretell cost is equal to its mana cost reduced by {2}. (During your turn, you may pay {2} and exile it from your hand face down. Cast it on a later turn for its foretell cost.)\nWhenever you cast your second spell each turn, goad target creature an opponent controls."});

const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
const divination = card("Test Divination", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw two cards." });
const ogre = card("Test Ogre", "Creature — Ogre", "{3}{R}", { cmc: 4, power: "4", toughness: "4" });
const pacifism = card("Test Pacifism", "Enchantment — Aura", "{1}{W}", { cmc: 2, oracleText: "Enchant creature\nEnchanted creature can't attack or block." });
const landAura = card("Test Land Aura", "Enchantment — Aura", "{G}", { cmc: 1, oracleText: "Enchant land\nEnchanted land has \"{T}: Add {G}{G}.\"" });
const sword = card("Test Sword", "Artifact — Equipment", "{2}", { cmc: 2, keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0.\nEquip {2}" });

describe("round 160 cards", () => {
  it("are fully supported", () => supported(bonus, danitha, radgull, sylvan, roku, snort, devourer));
  it("and these, from the same pieces", () => supported(researchers, benevolent, intellectual, bohn));
});

describe("Bonus Round", () => {
  it("until end of turn, each player who casts an instant or sorcery copies it, chooses the copy's new targets and controls it", () => {
    const { s: s0, ap, ids } = setup([bonus, shock]);
    const b = next(s0, ap);
    const c = next(s0, b);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    const theirs = into(s, b, shock, "hand");
    putOnBattlefield(s, b, mountain);
    // Your own spell: you copy it.
    s = run(s, planCast(s, ap, ids[1]!, [player(b)]));
    expect(s.stack.length).toBe(2);
    // An opponent's spell in response, this turn: they copy it (rulings: its caster controls the copy and chooses its
    // targets).
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(b);
    s = run(s, planCast(s, b, theirs, [player(ap)]));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: b });
    s = act(s, { type: "copyTargets", player: b });
    s = resolveAll(s);
    expect(s.players[ap]!.life).toBe(36);
    // Then yours: you may pick a new target for your copy.
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = act(s, { type: "copyTargets", player: ap, targets: [player(c)] });
    s = resolveAll(s);
    expect(s.players[b]!.life).toBe(38);
    expect(s.players[c]!.life).toBe(38);
  });

  it("ends with the turn", () => {
    const { s: s0, ap, ids } = setup([bonus]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.floatingTriggers?.length).toBe(1);
    s = passUntil(s, "main1", next(s, ap));
    expect(s.floatingTriggers).toBeUndefined();
  });
});

describe("Danitha, Benalia's Hope and Academy Researchers", () => {
  it("Danitha puts an Aura or Equipment card from your hand or graveyard onto the battlefield attached to her", () => {
    const { s: s0, ap, ids } = setup([danitha]);
    const fromYard = into(s0, ap, sword, "graveyard");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true });
    s = act(s, { type: "searchLibrary", player: ap, found: [fromYard] });
    s = resolveAll(s);
    expect(zone(s, fromYard)).toBe("battlefield");
    expect(s.objects[fromYard]!.attachedTo).toBe(ids[0]);
    expect(pt(s, ids[0]!)).toBe("6/4");
  });

  it("an Aura that can't enchant Danitha stays where it was (rulings)", () => {
    const { s: s0, ap, ids } = setup([danitha, landAura]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] });
    s = resolveAll(s);
    expect(zone(s, ids[1]!)).toBe("hand");
  });

  it("an Aura enchants Danitha even with other creatures it could enchant", () => {
    const { s: s0, ap, ids } = setup([danitha, pacifism]);
    putOnBattlefield(s0, next(s0, ap), bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] });
    s = resolveAll(s);
    expect(s.objects[ids[1]!]!.attachedTo).toBe(ids[0]);
  });

  it("with Danitha gone, an Equipment enters unattached and an Aura stays where it was (rulings)", () => {
    const { s: s0, ap, ids } = setup([danitha, shock, pacifism]);
    const fromYard = into(s0, ap, sword, "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    // The trigger is on the stack (it asks nothing until it resolves): kill her first.
    expect(s.pending).toMatchObject({ kind: "searchLibrary" });
    const o = s.objects[ids[0]!]!;
    s.battlefield.splice(s.battlefield.indexOf(o.id), 1);
    o.zone = "graveyard";
    o.zoneChanges = (o.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(o.id);
    invalidateCharacteristics(s);
    s = act(s, { type: "searchLibrary", player: ap, found: [fromYard] });
    s = resolveAll(s);
    expect(zone(s, fromYard)).toBe("battlefield");
    expect(s.objects[fromYard]!.attachedTo).toBeUndefined();
  });

  it("Academy Researchers: only an Aura card from your hand", () => {
    const { s: s0, ap, ids } = setup([researchers, pacifism, sword]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect(s.pending.cards).toEqual([ids[1]]);
    s = act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] });
    s = resolveAll(s);
    expect(s.objects[ids[1]!]!.attachedTo).toBe(ids[0]);
  });
});

describe("Vexing Radgull", () => {
  it("gives the player it hits two rad counters; if they have some, proliferate instead", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const gull = putOnBattlefield(s0, ap, radgull);
    let s = attack(s0, ap, [{ attacker: gull, defender: b }]);
    s = passUntil(s, "main2", ap);
    expect(s.players[b]!.rad).toBe(2);
    // Next time: proliferate, which may give that player another one.
    s = passUntil(s, "main1", ap);
    s.players[b]!.rad = 1;
    s = attack(s, ap, [{ attacker: gull, defender: b }]);
    s = passUntil(s, "main2", ap);
    expect(s.players[b]!.rad).toBe(2);
  });
});

describe("Sylvan Offering, Benevolent Offering, Intellectual Offering", () => {
  it("Sylvan Offering: one opponent for each paragraph, the same or another (rulings)", () => {
    const { s: s0, ap, ids } = setup([sylvan]);
    const b = next(s0, ap);
    const c = next(s0, b);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 3));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(c) });
    s = resolveAll(s);
    expect(mine(s, ap, "Treefolk Token").map((id) => pt(s, id))).toEqual(["3/3"]);
    expect(mine(s, b, "Treefolk Token").map((id) => pt(s, id))).toEqual(["3/3"]);
    expect(mine(s, c, "Treefolk Token")).toEqual([]);
    expect(mine(s, ap, "Elf Warrior Token").length).toBe(3);
    expect(mine(s, c, "Elf Warrior Token").length).toBe(3);
    expect(mine(s, b, "Elf Warrior Token").length).toBe(0);
  });

  it("Benevolent Offering: each of you gains 2 life for each creature you control", () => {
    const { s: s0, ap, ids } = setup([benevolent]);
    const b = next(s0, ap);
    const c = next(s0, b);
    putOnBattlefield(s0, c, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    s = act(s, { type: "chooseOption", player: ap, choice: String(c) });
    s = resolveAll(s);
    expect(s.players[ap]!.life).toBe(46);
    expect(s.players[c]!.life).toBe(42);
    expect(s.players[b]!.life).toBe(40);
  });

  it("Intellectual Offering: untaps your nonland permanents and that player's", () => {
    const { s: s0, ap, ids } = setup([intellectual]);
    const b = next(s0, ap);
    const c = next(s0, b);
    const theirs = putOnBattlefield(s0, c, bear());
    const notThem = putOnBattlefield(s0, b, bear());
    s0.objects[theirs]!.tapped = true;
    s0.objects[notThem]!.tapped = true;
    const hand = s0.players[b]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    s = act(s, { type: "chooseOption", player: ap, choice: String(c) });
    s = resolveAll(s);
    expect(s.players[b]!.hand.length).toBe(hand + 3);
    expect(s.objects[theirs]!.tapped).toBe(false);
    expect(s.objects[notThem]!.tapped).toBe(true);
  });
});

describe("Avatar Roku, Firebender", () => {
  it("whenever any player attacks, adds six {R} that stay until end of combat", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    putOnBattlefield(s0, ap, roku);
    const theirs = putOnBattlefield(s0, b, bear());
    let s = passUntil(s0, "main1", b);
    s = attack(s, b, [{ attacker: theirs, defender: ap }]);
    s = resolveAll(s);
    expect(s.players[ap]!.manaPool.R).toBe(6);
    s = passUntil(s, "declareBlockers", b);
    expect(s.players[ap]!.manaPool.R).toBe(6);
    s = passUntil(s, "main2", b);
    expect(s.players[ap]!.manaPool.R).toBe(0);
  });
});

describe("Snort", () => {
  it("each player may discard their hand and draw five; it deals 5 damage to each opponent who did, an empty hand too (rulings)", () => {
    const { s: s0, ap, ids } = setup([snort]);
    const [b, c, d] = [next(s0, ap), next(s0, next(s0, ap)), next(s0, next(s0, next(s0, ap)))];
    s0.players[d]!.hand = [];
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const answers: Record<number, boolean> = { [ap]: true, [b]: true, [c]: false, [d]: true };
    for (let i = 0; i < 4; i++) {
      expect(s.pending?.kind).toBe("chooseMay");
      if (s.pending?.kind !== "chooseMay") break;
      s = act(s, { type: "chooseMay", player: s.pending.player, yes: answers[s.pending.player]! });
    }
    s = resolveAll(s);
    expect(s.players[ap]!.life).toBe(40);
    expect(s.players[b]!.life).toBe(35);
    expect(s.players[c]!.life).toBe(40);
    expect(s.players[d]!.life).toBe(35);
    expect(s.players[d]!.hand.length).toBe(5);
  });
});

describe("Dream Devourer and Bohn, Beguiling Balladeer", () => {
  it("nonland cards in your hand have foretell for their mana cost less {2} generic; foretelling pumps it", () => {
    const { s: s0, ap, ids } = setup([ogre, shock, mountain]);
    const dd = putOnBattlefield(s0, ap, devourer);
    expect(foretellCostOf(s0, s0.objects[ids[0]!]!)).toBe("{1}{R}");
    // Colored mana isn't reduced (rulings).
    expect(foretellCostOf(s0, s0.objects[ids[1]!]!)).toBe("{R}");
    // Not lands; not an opponent's cards.
    expect(foretellCostOf(s0, s0.objects[ids[2]!]!)).toBeUndefined();
    const theirs = into(s0, next(s0, ap), ogre, "hand");
    expect(foretellCostOf(s0, s0.objects[theirs]!)).toBeUndefined();
    let s = run(s0, planForetell(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.foretold).toBe(true);
    s = resolveAll(s);
    expect(pt(s, dd)).toBe("2/3");
    // Gone from your hand, it keeps the foretell cost it was given, even without Dream Devourer (rulings).
    s.battlefield.splice(s.battlefield.indexOf(dd), 1);
    s.objects[dd]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(dd);
    invalidateCharacteristics(s);
    s = passUntil(passUntil(s, "main1", next(s, ap)), "main1", ap);
    const o = s.objects[ids[0]!]!;
    expect(total(spellCost(s, ap, o, 0, [], { alt: "foretell" }))).toBe(2);
    expect(castProblem(s, ap, ids[0]!)).toMatch(/foretell cost/);
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "foretell" }));
    s = resolveAll(s);
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });

  it("without Dream Devourer, those cards don't have foretell; the bot foretells only cards it makes cheaper", () => {
    const { s: s0, ap, ids } = setup([ogre, shock]);
    expect(foretellProblem(s0, ap, ids[0]!)).toMatch(/doesn't have foretell/);
    putOnBattlefield(s0, ap, bohn);
    let s = passUntil(s0, "main2", ap);
    s.players[ap]!.hand = [ids[1]!, ids[0]!];
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land"));
    for (const id of lands) s.objects[id]!.tapped = true;
    for (const id of lands.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Plains").slice(0, 2)) s.objects[id]!.tapped = false;
    const a = botActions(s, ap);
    expect(a[a.length - 1]).toMatchObject({ type: "foretell", objectId: ids[0] });
    expect(legalActions(s, ap).some((x) => x.type === "foretell")).toBe(false); // the mana isn't in the pool yet
  });
});

const bringer = card("Bringer of the Last Gift", "Creature — Vampire Demon", "{6}{B}{B}", {cmc: 8,power: "6",toughness: "6",keywords: ["Flying"],oracleText: "Flying\nWhen this creature enters, if you cast it, each player sacrifices all other creatures they control. Then each player returns all creature cards from their graveyard that weren't put there this way to the battlefield."});
const uchuulon = card("Uchuulon", "Creature — Crab Ooze Horror", "{3}{B}", {cmc: 4,power: "*",toughness: "4",keywords: ["Horrific Symbiosis"],oracleText: "Uchuulon's power is equal to the number of Crabs, Oozes, and/or Horrors you control.\nHorrific Symbiosis — At the beginning of your end step, exile up to one target creature card from an opponent's graveyard. If you do, create a token that's a copy of this creature."});
const taigam = card("Taigam, Master Opportunist", "Legendary Creature — Human Monk", "{1}{U}", {cmc: 2,power: "2",toughness: "2",keywords: ["Flurry"],oracleText: "Flurry — Whenever you cast your second spell each turn, copy it, then exile the spell you cast with four time counters on it. If it doesn't have suspend, it gains suspend. (At the beginning of its owner's upkeep, they remove a time counter. When the last is removed, they may play it without paying its mana cost. If it's a creature, it has haste.)"});
const nemata = card("Nemata, Primeval Warden", "Legendary Creature — Treefolk", "{2}{B}{G}", {cmc: 4,power: "3",toughness: "4",keywords: ["Reach"],oracleText: "Reach\nIf a creature an opponent controls would die, exile it instead. When you do, create a 1/1 green Saproling creature token.\n{G}, Sacrifice a Saproling: Nemata gets +2/+2 until end of turn.\n{1}{B}, Sacrifice two Saprolings: Draw a card."});
const priest = card("Containment Priest", "Creature — Human Cleric", "{1}{W}", {cmc: 2,power: "2",toughness: "2",keywords: ["Flash"],oracleText: "Flash\nIf a nontoken creature would enter and it wasn't cast, exile it instead."});
const reanimate = card("Test Reanimate", "Sorcery", "{B}", { cmc: 1, oracleText: "Return target creature card from your graveyard to the battlefield." });
const elves = card("Test Elves", "Sorcery", "{G}", { cmc: 1, oracleText: "Create two 1/1 green Elf Warrior creature tokens." });
const arbor = card("Test Arbor", "Land Creature — Forest Dryad", "", { power: "1", toughness: "1" });

describe("Bringer of the Last Gift", () => {
  it("cast: everyone sacrifices their other creatures, then returns the creature cards that weren't sacrificed", () => {
    const { s: s0, ap, ids } = setup([bringer]);
    const b = next(s0, ap);
    const mineBear = putOnBattlefield(s0, ap, bear());
    const theirBear = putOnBattlefield(s0, b, bear({ name: "Their Bears" }));
    const myOld = into(s0, ap, ogre, "graveyard");
    const theirOld = into(s0, b, card("Old Wolf", "Creature — Wolf", "{1}{G}", { power: "2", toughness: "2" }), "graveyard");
    const notCreature = into(s0, b, divination, "graveyard");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(zone(s, mineBear)).toBe("graveyard");
    expect(zone(s, theirBear)).toBe("graveyard");
    expect(zone(s, myOld)).toBe("battlefield");
    expect(s.objects[myOld]!.controller).toBe(ap);
    expect(zone(s, theirOld)).toBe("battlefield");
    expect(s.objects[theirOld]!.controller).toBe(b);
    expect(zone(s, notCreature)).toBe("graveyard");
    supported(bringer);
  });

  it("put onto the battlefield without being cast, it does nothing (rulings)", () => {
    const { s: s0, ap, ids } = setup([reanimate]);
    const mineBear = putOnBattlefield(s0, ap, bear());
    const dead = into(s0, ap, bringer, "graveyard");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(dead)])));
    expect(zone(s, dead)).toBe("battlefield");
    expect(zone(s, mineBear)).toBe("battlefield");
  });
});

describe("Uchuulon", () => {
  it("at your end step, exiles a creature card from an opponent's graveyard and makes a token copy of itself", () => {
    const { s: s0, ap } = setup([]);
    const u = putOnBattlefield(s0, ap, uchuulon);
    const theirs = into(s0, next(s0, ap), ogre, "graveyard");
    expect(pt(s0, u)).toBe("1/4");
    let s = passUntil(s0, "end", ap);
    for (let i = 0; i < 5 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [obj(theirs)] }));
    expect(zone(s, theirs)).toBe("exile");
    const us = mine(s, ap, "Uchuulon");
    expect(us.length).toBe(2);
    expect(s.objects[us.find((id) => id !== u)!]!.isToken).toBe(true);
    // Each is a Crab Ooze Horror: 2 of them.
    expect(pt(s, u)).toBe("2/4");
    supported(uchuulon);
  });

  it("with no target chosen, no token", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, uchuulon);
    into(s0, next(s0, ap), ogre, "graveyard");
    let s = passUntil(s0, "end", ap);
    for (let i = 0; i < 5 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }] }));
    expect(mine(s, ap, "Uchuulon").length).toBe(1);
  });
});

describe("Taigam, Master Opportunist", () => {
  it("your second spell each turn is copied, then exiled with four time counters and suspend", () => {
    const { s: s0, ap, ids } = setup([divination, shock]);
    putOnBattlefield(s0, ap, taigam);
    const b = next(s0, ap);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand).toContain(ids[1]!);
    s = run(s, planCast(s, ap, ids[1]!, [player(b)]));
    s = resolveAll(s);
    // The copy deals 2; the original is gone before it resolves.
    expect(s.players[b]!.life).toBe(38);
    const o = s.objects[ids[1]!]!;
    expect(o.zone).toBe("exile");
    expect(o.counters.time).toBe(4);
    expect(o.gainedSuspend).toBe(o.zoneChanges ?? 0);
    supported(taigam);
  });
});

describe("Nemata, Primeval Warden", () => {
  it("an opponent's creature that would die is exiled instead, and you get a Saproling; yours still die", () => {
    const { s: s0, ap, ids } = setup([shock, card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." })]);
    putOnBattlefield(s0, ap, nemata);
    const theirs = putOnBattlefield(s0, next(s0, ap), bear());
    const ours = putOnBattlefield(s0, ap, bear({ name: "My Bears" }));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(theirs)])));
    expect(zone(s, theirs)).toBe("exile");
    expect(mine(s, ap, "Saproling Token").length).toBe(1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [obj(ours)])));
    expect(zone(s, ours)).toBe("graveyard");
    expect(mine(s, ap, "Saproling Token").length).toBe(1);
    supported(nemata);
  });
});

describe("Containment Priest", () => {
  it("exiles a creature card put onto the battlefield without being cast, not cast ones or tokens", () => {
    const { s: s0, ap, ids } = setup([reanimate, bear({ name: "Cast Bears" }), elves]);
    putOnBattlefield(s0, next(s0, ap), priest);
    const dead = into(s0, ap, ogre, "graveyard");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(dead)])));
    expect(zone(s, dead)).toBe("exile");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(zone(s, ids[1]!)).toBe("battlefield");
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    expect(mine(s, ap, "Elf Warrior Token").length + mine(s, ap, "Elf Warrior").length).toBe(2);
    supported(priest);
  });

  it("a land creature played as a land wasn't cast, so it's exiled", () => {
    const { s: s0, ap, ids } = setup([arbor]);
    putOnBattlefield(s0, ap, priest);
    const s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(zone(s, ids[0]!)).toBe("exile");
  });
});

const emperion = card("Platinum Emperion", "Artifact Creature — Golem", "{8}", {cmc: 8,power: "8",toughness: "8",oracleText: "Your life total can't change. (You can't gain or lose life. You can't pay any amount of life except 0.)"});
const athlete = card("Star Athlete", "Creature — Human Warrior", "{1}{R}{R}", {cmc: 3,power: "3",toughness: "2",keywords: ["Blitz","Menace"],oracleText: "Menace\nWhenever this creature attacks, choose up to one target nonland permanent. Its controller may sacrifice it. If they don't, this creature deals 5 damage to that player.\nBlitz {3}{R} (If you cast this spell for its blitz cost, it gains haste and \"When this creature dies, draw a card.\" Sacrifice it at the beginning of the next end step.)"});
const broughtBack = card("Brought Back", "Instant", "{W}{W}", {cmc: 2,oracleText: "Choose up to two target permanent cards in your graveyard that were put there from the battlefield this turn. Return them to the battlefield tapped."});
const titan = card("Titan of Littjara", "Creature — Illusion", "{4}{U}{U}", {cmc: 6,power: "6",toughness: "6",oracleText: "As this creature enters, choose a creature type.\nThis creature is the chosen type in addition to its other types.\nWhenever this creature enters or attacks, you may draw a card for each other creature you control that shares a creature type with it. If you do, discard a card."});
const judith = card("Judith, Carnage Connoisseur", "Legendary Creature — Human Shaman", "{3}{B}{R}", {cmc: 5,power: "3",toughness: "4",oracleText: "Whenever you cast an instant or sorcery spell, choose one —\n• That spell gains deathtouch and lifelink.\n• Create a 2/2 red Imp creature token with \"When this token dies, it deals 2 damage to each opponent.\""});
const norin = card("Norin the Wary", "Legendary Creature — Human Warrior", "{R}", {cmc: 1,power: "2",toughness: "1",oracleText: "When a player casts a spell or a creature attacks, exile Norin. Return it to the battlefield under its owner's control at the beginning of the next end step."});
const onceSword = card("Sword of Once and Future", "Artifact — Equipment", "{3}", {cmc: 3,keywords: ["Surveil","Equip"],oracleText: "Equipped creature gets +2/+2 and has protection from blue and from black.\nWhenever equipped creature deals combat damage to a player, surveil 2. Then you may cast an instant or sorcery spell with mana value 2 or less from your graveyard without paying its mana cost. If that spell would be put into your graveyard, exile it instead.\nEquip {2}"});
const eidolon = card("Hateful Eidolon", "Enchantment Creature — Spirit", "{B}", {cmc: 1,power: "1",toughness: "2",keywords: ["Lifelink"],oracleText: "Lifelink\nWhenever an enchanted creature dies, draw a card for each Aura you controlled that was attached to it."});
const cryptolith = scry("transform", [
  { name: "Cryptolith Fragment", mana_cost: "{3}", type_line: "Artifact", oracle_text: "This artifact enters tapped.\n{T}: Add one mana of any color. Each player loses 1 life.\nAt the beginning of your upkeep, if each player has 10 or less life, transform this artifact." },
  { name: "Aurora of Emrakul", type_line: "Creature — Eldrazi Reflection", oracle_text: "Flying, deathtouch\nWhenever this creature attacks, each opponent loses 3 life.", power: "1", toughness: "4" },
]);
const lifeDrain = card("Test Drain", "Sorcery", "{B}", { cmc: 1, oracleText: "Each opponent loses 3 life. You gain 3 life." });
const payLife = card("Test Bargain", "Artifact", "{1}", { cmc: 1, oracleText: "{1}, Pay 2 life: Draw a card." });
const wrath = card("Test Ruin", "Sorcery", "{2}{B}", { cmc: 3, oracleText: "Destroy all creatures and enchantments." });
const kill = card("Test Kill", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });

describe("Platinum Emperion", () => {
  it("your life total can't change: no loss, no gain, no paying life; damage is still dealt", () => {
    const { s: s0, ap, ids } = setup([lifeDrain, shock]);
    const b = next(s0, ap);
    putOnBattlefield(s0, b, emperion);
    const bargain = putOnBattlefield(s0, b, payLife);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[b]!.life).toBe(40);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [player(b)])));
    expect(s.players[b]!.life).toBe(40);
    // Its controller's life can't go up either, and paying 2 life isn't possible.
    putOnBattlefield(s, ap, emperion);
    expect(legalActions(s, b).some((a) => a.type === "activateAbility" && a.objectId === bargain)).toBe(false);
    supported(emperion);
  });
});

describe("Star Athlete", () => {
  it("attacking, its target's controller sacrifices it or takes 5 damage", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const sa = putOnBattlefield(s0, ap, athlete);
    const rock = putOnBattlefield(s0, b, payLife);
    let s = attack(s0, ap, [{ attacker: sa, defender: b }]);
    for (let i = 0; i < 5 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseTargets", player: ap, targets: [obj(rock)] });
    for (let i = 0; i < 8 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: b });
    // A bot gives up a cheap permanent rather than take 5.
    expect(botActions(s, b)).toEqual([{ type: "chooseMay", player: b, yes: true }]);
    const kept = resolveAll(act(s, { type: "chooseMay", player: b, yes: false }));
    expect(zone(kept, rock)).toBe("battlefield");
    expect(kept.players[b]!.life).toBe(35);
    const sacked = resolveAll(act(s, { type: "chooseMay", player: b, yes: true }));
    expect(zone(sacked, rock)).toBe("graveyard");
    expect(sacked.players[b]!.life).toBe(40);
    supported(athlete);
  });
});

describe("Brought Back", () => {
  it("returns permanent cards put into your graveyard from the battlefield this turn, tapped; not others", () => {
    const { s: s0, ap, ids } = setup([kill, broughtBack]);
    const bears = putOnBattlefield(s0, ap, bear());
    const old = into(s0, ap, ogre, "graveyard");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(bears)])));
    expect(zone(s, bears)).toBe("graveyard");
    const plan = planCast(s, ap, ids[1]!, [obj(old), { kind: "none" }]);
    expect(plan).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [obj(bears), { kind: "none" }])));
    expect(zone(s, bears)).toBe("battlefield");
    expect(s.objects[bears]!.tapped).toBe(true);
    expect(zone(s, old)).toBe("graveyard");
    supported(broughtBack);
  });
});

describe("Titan of Littjara", () => {
  it("draws a card for each other creature you control sharing a creature type with it, then discards one", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, titan);
    putOnBattlefield(s0, ap, card("Test Illusion", "Creature — Illusion", "{U}", { power: "1", toughness: "1" }));
    putOnBattlefield(s0, ap, card("Test Wizard Illusion", "Creature — Human Illusion", "{U}", { power: "1", toughness: "1" }));
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, next(s0, ap), card("Their Illusion", "Creature — Illusion", "{U}", { power: "1", toughness: "1" }));
    const hand = s0.players[ap]!.hand.length;
    let s = attack(s0, ap, [{ attacker: t, defender: next(s0, ap) }]);
    for (let i = 0; i < 8 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.pending?.kind).toBe("discard");
    s = act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand[0]!] });
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    supported(titan);
  });
});

describe("Judith, Carnage Connoisseur", () => {
  it("an instant or sorcery spell of yours can gain deathtouch and lifelink, or you get an Imp", () => {
    const { s: s0, ap, ids } = setup([shock, shock]);
    putOnBattlefield(s0, ap, judith);
    const big = putOnBattlefield(s0, next(s0, ap), ogre);
    s0.players[ap]!.life = 30;
    let s = run(s0, planCast(s0, ap, ids[0]!, [obj(big)]));
    for (let i = 0; i < 5 && s.pending?.kind !== "chooseModes"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(act(s, { type: "chooseModes", player: ap, modes: [0] }));
    // 2 damage with deathtouch destroys the 4/4, and its lifelink gains 2.
    expect(zone(s, big)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(32);
    s = run(s, planCast(s, ap, ids[1]!, [player(next(s, ap))]));
    for (let i = 0; i < 5 && s.pending?.kind !== "chooseModes"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(act(s, { type: "chooseModes", player: ap, modes: [1] }));
    expect(mine(s, ap, "Imp Token").length).toBe(1);
    expect(s.players[ap]!.life).toBe(32);
    supported(judith);
  });
});

describe("Norin the Wary", () => {
  it("a spell or an attack exiles it until the next end step; several triggers exile and return it once", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, norin);
    const a1 = putOnBattlefield(s0, ap, bear());
    const a2 = putOnBattlefield(s0, ap, bear({ name: "Other Bears" }));
    let s = resolveAll(attack(s0, ap, [{ attacker: a1, defender: next(s0, ap) }, { attacker: a2, defender: next(s0, ap) }]));
    expect(zone(s, n)).toBe("exile");
    s = passUntil(s, "cleanup", ap);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Norin the Wary").length).toBe(1);
    supported(norin);
  });

  it("it's exiled when it attacks itself (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, norin);
    const s = resolveAll(attack(s0, ap, [{ attacker: n, defender: next(s0, ap) }]));
    expect(zone(s, n)).toBe("exile");
  });
});

describe("Cryptolith Fragment", () => {
  it("transforms at your upkeep only if each player has 10 or less life", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, cryptolith);
    for (const p of s0.players) p.life = 10;
    s0.players[next(s0, ap)]!.life = 11;
    let s = passUntil(passUntil(s0, "main1", next(s0, ap)), "main1", ap);
    expect(nameOf(s, c)).toBe("Cryptolith Fragment");
    for (const p of s.players) p.life = 10;
    s = passUntil(passUntil(s, "main1", next(s, ap)), "main1", ap);
    expect(nameOf(s, c)).toBe("Aurora of Emrakul");
    expect(isFullySupported(cryptolith)).toBe(true);
  });
});

describe("Sword of Once and Future", () => {
  it("after combat damage, surveil 2 and cast an instant or sorcery with mana value 2 or less from your graveyard, then exile it", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const knight = putOnBattlefield(s0, ap, bear());
    const sw = putOnBattlefield(s0, ap, onceSword);
    s0.objects[sw]!.attachedTo = knight;
    const zap = into(s0, ap, shock, "graveyard");
    into(s0, ap, divination, "graveyard");
    invalidateCharacteristics(s0);
    expect(pt(s0, knight)).toBe("4/4");
    let s = attack(s0, ap, [{ attacker: knight, defender: b }]);
    for (let i = 0; i < 30 && s.pending?.kind !== "arrangeTop"; i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.players[b]!.life).toBe(36);
    expect(s.pending?.kind).toBe("arrangeTop");
    if (s.pending?.kind !== "arrangeTop") return;
    s = act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromHand", options: [zap, "none"] });
    s = act(s, { type: "chooseOption", player: ap, choice: zap });
    expect(s.pending?.kind).toBe("castFree");
    s = run(s, planCast(s, ap, zap, [player(b)]));
    s = resolveAll(s);
    expect(s.players[b]!.life).toBe(34);
    expect(zone(s, zap)).toBe("exile");
    supported(onceSword);
  });
});

describe("Hateful Eidolon", () => {
  it("an enchanted creature dying draws a card for each of your Auras on it, also ones destroyed with it", () => {
    const { s: s0, ap, ids } = setup([kill, wrath]);
    const b = next(s0, ap);
    putOnBattlefield(s0, ap, eidolon);
    const target = putOnBattlefield(s0, b, ogre);
    const mine1 = putOnBattlefield(s0, ap, pacifism);
    const mine2 = putOnBattlefield(s0, ap, pacifism);
    const theirs = putOnBattlefield(s0, b, pacifism);
    for (const a of [mine1, mine2, theirs]) s0.objects[a]!.attachedTo = target;
    invalidateCharacteristics(s0);
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(target)])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    // Destroyed together with its Aura (rulings): it still counts.
    const other = putOnBattlefield(s, b, bear());
    const aura = putOnBattlefield(s, ap, pacifism);
    s.objects[aura]!.attachedTo = other;
    invalidateCharacteristics(s);
    const before = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.hand.length).toBe(before - 1 + 1);
    supported(eidolon);
  });
});
