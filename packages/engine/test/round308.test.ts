// Round 308 (Lane A, skip-list cards): Shellshock (a Mutagen token for each creature dealt damage), Axebane Ferox
// (ward—collect evidence 4), Furygale Flocking (tokens that must attack each opponent), Ghouls' Night Out (a creature card
// from each graveyard, black Zombies with decayed), Doomsday Confluence ("Choose X" modes), Mishra's Command (target player
// discards up to X, then draws as many), Party Dude ("whenever one or more of your opponents are attacked"), Ajani
// Unrelenting (−2 and −3).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { moveObject } from "../src/game";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const leftOf = (s: GameState, pid: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % s.turnOrder.length]!;
const ctl = (s: GameState, id: string) => controllerOf(s, s.objects[id]!);
const named = (s: GameState, name: string) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === name);
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
};
const t = (id: string): TargetChoice => ({ kind: "object", id });
const none: TargetChoice = { kind: "none" };

// Real oracle text (Scryfall).
const shellshock = (): CardDef => ({"oracleId":"f406630b-d9f1-4fc5-b3f3-5327384b2901","name":"Shellshock","manaCost":"{X}{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"For each opponent, choose up to one target creature that player controls. Shellshock deals X damage to each of those creatures. You create a Mutagen token for each creature dealt damage this way. (They're artifacts with \"{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery.\")","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"});
const ferox = (): CardDef => ({"oracleId":"35b3ae1c-4116-49b0-89a9-7332fe9bbff0","name":"Axebane Ferox","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"Deathtouch, haste\nWard—Collect evidence 4. (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player exiles cards with total mana value 4 or greater from their graveyard.)","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Collect evidence","Haste","Ward","Deathtouch"],"layout":"normal"});
const furygale = (): CardDef => ({"oracleId":"943fc88d-c281-46bb-9dc7-1052f789362b","name":"Furygale Flocking","manaCost":"{8}{R}{R}","cmc":10,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {1} less to cast for each instant and sorcery card in your graveyard.\nFor each opponent, create two 3/3 blue and red Elemental creature tokens with flying that attack that opponent this turn if able. They gain haste until end of turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"});
const ghouls = (): CardDef => ({"oracleId":"cc9f9f14-a11c-4e33-9e11-8bf6ef13cf2b","name":"Ghouls' Night Out","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"For each player, choose a creature card in that player's graveyard. Put those cards onto the battlefield under your control. They're black Zombies in addition to their other colors and types and they gain decayed. (A creature with decayed can't block. When it attacks, sacrifice it at end of combat.)","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"});
const doomsday = (): CardDef => ({"oracleId":"01bc8bfa-2e46-4324-a848-cc68bc9330d0","name":"Doomsday Confluence","manaCost":"{X}{X}{B}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose X. You may choose the same mode more than once.\n• Each player sacrifices a nonartifact creature of their choice.\n• Create a 3/3 black Dalek artifact creature token with menace.\n• Each opponent discards a card.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"});
const mishra = (): CardDef => ({"oracleId":"25434ea3-bcfa-4dae-a16e-10ab87ce32af","name":"Mishra's Command","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose two —\n• Choose target player. They may discard up to X cards. Then they draw a card for each card discarded this way.\n• This spell deals X damage to target creature.\n• This spell deals X damage to target planeswalker.\n• Target creature gets +X/+0 and gains haste until end of turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"});
const partyDude = (): CardDef => ({"oracleId":"8df7a58c-053f-4ead-a778-2747718e5f10","name":"Party Dude","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Class","supertypes":[],"types":["Enchantment"],"subtypes":["Class"],"oracleText":"(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, each player creates a Food token.\n{1}{G}: Level 2\nWhenever an artifact an opponent controls is put into a graveyard from the battlefield, draw a card.\n{4}{G}: Level 3\nWhenever one or more of your opponents are attacked, up to one target attacking creature gets +X/+X until end of turn, where X is the number of cards in your hand.","colors":["G"],"colorIdentity":["G"],"keywords":["Food"],"layout":"class"});
const ajani = (): CardDef => ({"oracleId":"71620e92-45a4-49cb-94d5-348013ecf886","name":"Ajani Unrelenting","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Legendary Planeswalker — Ajani","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Ajani"],"oracleText":"Whenever you activate a loyalty ability, create a 2/2 colorless Wizard Soldier creature token named Cadet.\n+1: Creatures you control get +1/+0 and gain haste until end of turn.\n−2: Discard your hand, then draw a card for each creature you control.\n−3: Ajani deals 4 damage to each creature except for tokens you control.","loyalty":"5","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"});

const shock = () => card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to target creature." });

describe("round 308", () => {
  it("every card of the round compiles fully", () => supported(shellshock(), ferox(), furygale(), ghouls(), doomsday(), mishra(), partyDude(), ajani()));
});

describe("round 308: Shellshock", () => {
  it("X damage to up to one creature of each opponent, and a Mutagen token for each creature dealt damage", () => {
    const { s: s0, ap, ids } = setup([shellshock()]);
    const [b, c, d] = [leftOf(s0, ap), leftOf(s0, ap, 2), leftOf(s0, ap, 3)];
    const bb = putOnBattlefield(s0, b, bear({ name: "Test B Bear" }));
    const cc = putOnBattlefield(s0, c, bear({ name: "Test C Big", power: "5", toughness: "5" }));
    putOnBattlefield(s0, d, bear({ name: "Test D Bear" }));
    invalidateCharacteristics(s0);
    // Nothing chosen for D.
    let s = run(s0, planCast(s0, ap, ids[0]!, [t(bb), t(cc), none], undefined, "auto", 2));
    s = settle(s, ap);
    expect(s.objects[bb]!.zone).toBe("graveyard");
    expect(s.objects[cc]!.damage).toBe(2);
    expect(named(s, "Mutagen Token").filter((id) => ctl(s, id) === ap)).toHaveLength(2);
  });

  it("with X 0 nothing is dealt damage, so no Mutagen token", () => {
    const { s: s0, ap, ids } = setup([shellshock()]);
    const bb = putOnBattlefield(s0, leftOf(s0, ap), bear({ name: "Test B Bear" }));
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [t(bb), none, none], undefined, "auto", 0));
    s = settle(s, ap);
    expect(s.objects[bb]!.zone).toBe("battlefield");
    expect(named(s, "Mutagen Token")).toHaveLength(0);
  });
});

describe("round 308: Axebane Ferox's ward—collect evidence 4", () => {
  const board = (evidence: CardDef[]) => {
    const { s: s0, ap, ids, opp } = setup([shock()]);
    const fx = putOnBattlefield(s0, opp, ferox());
    const yard = evidence.map((d) => toYard(s0, ap, d));
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [t(fx)]));
    s = settle(s, ap);
    return { s, ap, opp, fx, yard, spell: ids[0]! };
  };

  it("its controller's opponent may collect evidence 4 to keep the spell: the cards they pick are exiled", () => {
    const x = board([bear({ name: "Test Two" }), card("Test Three", "Sorcery", "{2}{R}", { oracleText: "Draw a card." }), bear({ name: "Test Other Two" })]);
    let s = x.s;
    expect(s.pending).toMatchObject({ kind: "payUnless", player: x.ap, collectEvidence: 4 });
    s = act(s, { type: "payUnless", player: x.ap, pay: true });
    expect(s.pending).toMatchObject({ kind: "collectEvidence", player: x.ap, n: 4, forUnless: true });
    // Not enough with one card.
    expect(() => act(s, { type: "collectEvidence", player: x.ap, ids: [x.yard[0]!] })).toThrow(/total mana value/);
    s = act(s, { type: "collectEvidence", player: x.ap, ids: [x.yard[0]!, x.yard[2]!] });
    s = settle(s, x.ap);
    expect(s.objects[x.yard[0]!]!.zone).toBe("exile");
    expect(s.objects[x.yard[2]!]!.zone).toBe("exile");
    expect(s.objects[x.yard[1]!]!.zone).toBe("graveyard");
    // The spell resolved.
    expect(s.objects[x.fx]!.damage).toBe(2);
  });

  it("not paying, or picking nothing, counters the spell", () => {
    const evidence = [bear({ name: "Test Two" }), bear({ name: "Test Other Two" })];
    const x = board(evidence);
    let s = act(x.s, { type: "payUnless", player: x.ap, pay: false });
    s = settle(s, x.ap);
    expect(s.objects[x.fx]!.damage ?? 0).toBe(0);
    expect(s.objects[x.spell]!.zone).toBe("graveyard");
    const y = board(evidence);
    s = act(y.s, { type: "payUnless", player: y.ap, pay: true });
    s = act(s, { type: "collectEvidence", player: y.ap, ids: [] });
    s = settle(s, y.ap);
    expect(s.objects[y.fx]!.damage ?? 0).toBe(0);
    expect(y.yard.every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
  });

  it("without total mana value 4 in the graveyard it can't be paid: countered with no question", () => {
    const x = board([bear({ name: "Test Two" }), card("Test One", "Instant", "{R}", { oracleText: "Draw a card." })]);
    expect(x.s.pending).toBeNull();
    expect(x.s.objects[x.fx]!.damage ?? 0).toBe(0);
    expect(x.s.objects[x.spell]!.zone).toBe("graveyard");
  });

  it("a bot pays when its graveyard has enough, exiling the fewest cards", () => {
    const x = board([bear({ name: "Test Two" }), card("Test Four", "Sorcery", "{3}{R}", { oracleText: "Draw a card." }), bear({ name: "Test Other Two" })]);
    let s = act(x.s, botActions(x.s, x.ap)[0]!);
    expect(s.pending).toMatchObject({ kind: "collectEvidence", forUnless: true });
    s = act(s, botActions(s, x.ap)[0]!);
    s = settle(s, x.ap);
    expect(s.objects[x.fx]!.damage).toBe(2);
    expect(x.yard.filter((id) => s.objects[id]!.zone === "exile")).toHaveLength(1);
  });
});

describe("round 308: Furygale Flocking", () => {
  it("costs {1} less for each instant and sorcery card in your graveyard; two hasty 3/3 fliers for each opponent, each having to attack that opponent", () => {
    const { s: s0, ap, ids } = setup([furygale()]);
    for (let i = 0; i < 3; i++) toYard(s0, ap, card(`Test Spell ${i}`, "Sorcery", "{1}", { oracleText: "Draw a card." }));
    invalidateCharacteristics(s0);
    // 14 lands: {8}{R}{R} less three is seven mana.
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped)).toHaveLength(7);
    s = settle(s, ap);
    const tokens = named(s, "Elemental Token");
    expect(tokens).toHaveLength(6);
    expect(tokens.every((id) => objHasKeyword(s, s.objects[id]!, "Haste") && objHasKeyword(s, s.objects[id]!, "Flying"))).toBe(true);
    const opps = s.turnOrder.filter((p) => p !== ap);
    for (const o of opps) expect(tokens.filter((id) => characteristics(s, s.objects[id]!).mustAttack.includes(o))).toHaveLength(2);
    s = passUntil(s, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow(/must attack/);
    const at = (id: string) => characteristics(s, s.objects[id]!).mustAttack[0]!;
    const wrong = tokens.map((id, i) => ({ attacker: id, defender: at(tokens[(i + 2) % 6]!) }));
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: wrong })).toThrow(/must attack/);
    s = act(s, { type: "declareAttackers", player: ap, attacks: tokens.map((id) => ({ attacker: id, defender: at(id) })) });
    expect(tokens.every((id) => s.objects[id]!.attacking === at(id))).toBe(true);
  });
});

describe("round 308: Ghouls' Night Out", () => {
  it("a creature card from each player's graveyard, chosen by you, onto the battlefield under your control as black Zombies with decayed", () => {
    const { s: s0, ap, ids } = setup([ghouls()]);
    const [b, c] = [leftOf(s0, ap), leftOf(s0, ap, 2)];
    const mine = toYard(s0, ap, bear({ name: "Test Mine" }));
    const b1 = toYard(s0, b, bear({ name: "Test B One", colors: ["G"] }));
    const b2 = toYard(s0, b, bear({ name: "Test B Two" }));
    toYard(s0, c, card("Test C Spell", "Sorcery", "{1}", { oracleText: "Draw a card." }));
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    // You choose for each player with a creature card in their graveyard (your own has only one, so no question).
    const answered: string[] = [];
    for (let i = 0; i < 4 && s.pending; i++) {
      expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
      const cards = (s.pending as { cards: string[] }).cards;
      const pick = cards.includes(b1) ? b1 : cards[0]!;
      answered.push(pick);
      s = act(s, { type: "searchLibrary", player: ap, found: [pick] });
      s = settle(s, ap);
    }
    expect(answered).toEqual([b1]);
    expect(s.objects[b2]!.zone).toBe("graveyard");
    for (const id of [mine, b1]) {
      const o = s.objects[id]!;
      expect(o.zone).toBe("battlefield");
      expect(ctl(s, id)).toBe(ap);
      const ch = characteristics(s, o);
      expect(ch.subtypes).toEqual(expect.arrayContaining(["Bear", "Zombie"]));
      expect(ch.colors).toContain("B");
      expect(objHasKeyword(s, o, "Decayed")).toBe(true);
    }
    expect(characteristics(s, s.objects[b1]!).colors).toEqual(expect.arrayContaining(["G", "B"]));
  });
});

describe("round 308: Doomsday Confluence", () => {
  it("as many modes as X, the same one more than once", () => {
    const { s: s0, ap, ids } = setup([doomsday()]);
    // X 2: {2}{2}{B}, two Daleks.
    expect(planCast(s0, ap, ids[0]!, undefined, [1, 1], "auto", 3)).toBeNull();
    expect(planCast(s0, ap, ids[0]!, undefined, [1], "auto", 2)).toBeNull();
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, [1, 1], "auto", 2));
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped)).toHaveLength(5);
    s = settle(s, ap);
    const daleks = named(s, "Dalek Token");
    expect(daleks).toHaveLength(2);
    expect(daleks.every((id) => objHasKeyword(s, s.objects[id]!, "Menace") && characteristics(s, s.objects[id]!).types.includes("Artifact"))).toBe(true);
  });

  it("modes in printed order: each player sacrifices, then the Dalek, then each opponent discards", () => {
    const { s: s0, ap, ids } = setup([doomsday()]);
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const theirs = opps.map((p) => putOnBattlefield(s0, p, bear({ name: `Test Bear ${p}` })));
    const art = putOnBattlefield(s0, opps[0]!, card("Test Art Creature", "Artifact Creature — Golem", "{2}", { power: "2", toughness: "2" }));
    invalidateCharacteristics(s0);
    const hands = opps.map((p) => s0.players[p]!.hand.length);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, [2, 1, 0], "auto", 3));
    s = settle(s, ap);
    // The Dalek came after the sacrifices, so it's still here; the artifact creature can't be sacrificed.
    expect(named(s, "Dalek Token")).toHaveLength(1);
    expect(theirs.every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
    expect(s.objects[art]!.zone).toBe("battlefield");
    opps.forEach((p, i) => expect(s.players[p]!.hand.length).toBe(Math.max(0, hands[i]! - 1)));
  });
});

describe("round 308: Mishra's Command", () => {
  it("target player discards up to X cards, then draws as many; X damage to target creature", () => {
    const filler = card("Test Filler", "Sorcery", "{1}", { oracleText: "Draw a card." });
    const { s: s0, ap, ids } = setup([mishra(), filler, filler, filler]);
    const opp = leftOf(s0, ap);
    const big = putOnBattlefield(s0, opp, bear({ name: "Test Big", power: "4", toughness: "4" }));
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }, t(big)], [0, 1], "auto", 2));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 2, upTo: true });
    const hand = s.players[ap]!.hand.length;
    const drawn = s.players[ap]!.library.length;
    s = act(s, { type: "discard", player: ap, objectIds: [ids[1]!] });
    s = settle(s, ap);
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.library.length).toBe(drawn - 1);
    expect(s.objects[big]!.damage).toBe(2);
  });

  it("discarding none draws none; +X/+0 and haste", () => {
    const { s: s0, ap, ids } = setup([mishra(), card("Test Filler", "Sorcery", "{1}", { oracleText: "Draw a card." })]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test Mine" }), { sick: true });
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }, t(mine)], [0, 3], "auto", 3));
    s = settle(s, ap);
    const lib = s.players[ap]!.library.length;
    s = act(s, { type: "discard", player: ap, objectIds: [] });
    s = settle(s, ap);
    expect(s.players[ap]!.library.length).toBe(lib);
    expect(characteristics(s, s.objects[mine]!).power).toBe(5);
    expect(objHasKeyword(s, s.objects[mine]!, "Haste")).toBe(true);
  });
});

describe("round 308: Party Dude", () => {
  it("level 3: whenever one or more of your opponents are attacked, up to one target attacking creature gets +X/+X, X the cards in your hand", () => {
    const { s: s0, ap } = setup([card("Test A", "Sorcery", "{1}"), card("Test B", "Sorcery", "{1}"), card("Test C", "Sorcery", "{1}")]);
    const pd = putOnBattlefield(s0, ap, partyDude());
    s0.objects[pd]!.classLevel = 3;
    const att = putOnBattlefield(s0, ap, bear({ name: "Test Attacker" }));
    invalidateCharacteristics(s0);
    const hand = s0.players[ap]!.hand.length;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: att, defender: leftOf(s, ap) }] });
    s = settle(s);
    expect(characteristics(s, s.objects[att]!).power).toBe(2 + hand);
  });

  it("an opponent attacking another opponent triggers it too; an opponent attacking you doesn't", () => {
    const { s: s0, ap } = setup([]);
    const pd = putOnBattlefield(s0, ap, partyDude());
    s0.objects[pd]!.classLevel = 3;
    const b = leftOf(s0, ap);
    const ba = putOnBattlefield(s0, b, bear({ name: "Test B Attacker" }));
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", b);
    s = act(s, { type: "declareAttackers", player: b, attacks: [{ attacker: ba, defender: leftOf(s, ap, 2) }] });
    expect(s.triggerQueue.length + s.stack.length + (s.pending ? 1 : 0)).toBeGreaterThan(0);
    const log = s.log.length;
    s = settle(s);
    expect(s.log.slice(log).some((l) => /Party Dude/.test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
    const { s: s1, ap: ap1 } = setup([]);
    const pd1 = putOnBattlefield(s1, ap1, partyDude());
    s1.objects[pd1]!.classLevel = 3;
    const b1 = leftOf(s1, ap1);
    const ba1 = putOnBattlefield(s1, b1, bear({ name: "Test B Attacker" }));
    invalidateCharacteristics(s1);
    let t1 = passUntil(s1, "declareAttackers", b1);
    t1 = act(t1, { type: "declareAttackers", player: b1, attacks: [{ attacker: ba1, defender: ap1 }] });
    expect(t1.triggerQueue.length + t1.stack.length).toBe(0);
    expect(t1.pending).toBeNull();
  });
});

describe("round 308: Ajani Unrelenting", () => {
  it("−2: discard your hand, then draw a card for each creature you control, counted after", () => {
    const { s: s0, ap, ids } = setup([card("Test A", "Sorcery", "{1}"), card("Test B", "Sorcery", "{1}")]);
    const aj = putOnBattlefield(s0, ap, ajani());
    s0.objects[aj]!.counters.loyalty = 5;
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, bear({ name: `Test Bear ${i}` }));
    invalidateCharacteristics(s0);
    let s = run(s0, planActivate(s0, ap, aj, 1));
    s = settle(s);
    expect(ids.every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
    // Three Bears and the Cadet its loyalty ability made.
    expect(s.players[ap]!.hand).toHaveLength(4);
  });

  it("−3: 4 damage to each creature except for tokens you control", () => {
    const { s: s0, ap } = setup([]);
    const aj = putOnBattlefield(s0, ap, ajani());
    s0.objects[aj]!.counters.loyalty = 5;
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test Mine", power: "5", toughness: "5" }));
    const theirs = putOnBattlefield(s0, leftOf(s0, ap), bear({ name: "Test Theirs", power: "5", toughness: "5" }));
    invalidateCharacteristics(s0);
    let s = run(s0, planActivate(s0, ap, aj, 2));
    s = settle(s);
    expect(s.objects[mine]!.damage).toBe(4);
    expect(s.objects[theirs]!.damage).toBe(4);
    // The Cadet the loyalty ability made is a token you control.
    const cadet = named(s, "Cadet");
    expect(cadet).toHaveLength(1);
    expect(s.objects[cadet[0]!]!.damage ?? 0).toBe(0);
  });
});
