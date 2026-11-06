// Lane B round B120: damage redirection and "next time" shields. Turn the Tables (combat damage to you dealt to target
// attacking creature instead), Weathered Bodyguards and Veteran Bodyguard (damage to you from unblocked creatures dealt to
// them while untapped), Reverberation (a target sorcery's damage dealt to its controller), Aegis of Honor and Harsh
// Judgment (an instant or sorcery spell's damage to you dealt to that spell's controller), Shield Dancer (an attacking
// creature's combat damage to ~ dealt to itself), Soltari Guerrillas (~'s next combat damage to an opponent dealt to target
// creature), Mercenaries (~'s next damage to whoever activated it prevented), Gloom Surgeon (combat damage to ~ prevented,
// that many cards exiled from the top of your library).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";

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
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const life = (s: GameState, p: PlayerId) => s.players[p]!.life;
const dmg = (s: GameState, id: string) => s.objects[id]!.damage ?? 0;
const pool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...mana };
};
/** Moves a new card for `def` into `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Passes priority (answering other questions as bots, damage assignment included) until `step`. */
const toStep = (s: GameState, step: Step, bots: PlayerId[] = []) => {
  for (let i = 0; i < 400 && s.step !== step; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (bots.includes(waitingOn(s)!)) for (const a of botActions(s, waitingOn(s)!)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  if (s.step !== step) throw new Error(`never reached ${step}`);
  return s;
};
/** The active player attacks with `attacks`; the defender declares `blocks`; then it's the declare blockers step with the active player's priority. */
const combat = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], blocks: { blocker: string; attacker: string }[] = []) => {
  s = toStep(s, "declareAttackers");
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 200 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  const defenders = new Set(attacks.map((a) => a.defender));
  while (s.pending?.kind === "declareBlockers") {
    const p = s.pending.player;
    s = act(s, { type: "declareBlockers", player: p, blocks: defenders.has(p) ? blocks : [] });
  }
  return s;
};

// Real oracle text (Scryfall).
const tables = (): CardDef => ({"oracleId":"bd5ad7c3-4477-4278-9875-d2ffbb0e8089","name":"Turn the Tables","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"All combat damage that would be dealt to you this turn is dealt to target attacking creature instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const weathered = (): CardDef => ({"oracleId":"86d0ba9d-6972-4cbc-871d-3fb413565c45","name":"Weathered Bodyguards","manaCost":"{5}{W}","cmc":6,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"As long as this creature is untapped, all combat damage that would be dealt to you by unblocked creatures is dealt to this creature instead.\nMorph {3}{W} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)","power":"2","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":["Morph"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const veteran = (): CardDef => ({"oracleId":"d29078c0-1fb8-437a-81d1-bb319f646941","name":"Veteran Bodyguard","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Human","supertypes":[],"types":["Creature"],"subtypes":["Human"],"oracleText":"As long as this creature is untapped, all damage that would be dealt to you by unblocked creatures is dealt to this creature instead.","power":"2","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const reverb = (): CardDef => ({"oracleId":"d3088e1d-62c9-4478-9ef7-fc3c9e5cfadb","name":"Reverberation","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"All damage that would be dealt this turn by target sorcery spell is dealt to that spell's controller instead.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const aegis = (): CardDef => ({"oracleId":"ea93acc8-0c1f-42a2-bed3-f385d210d58f","name":"Aegis of Honor","manaCost":"{W}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}: The next time an instant or sorcery spell would deal damage to you this turn, that spell deals that damage to its controller instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const harsh = (): CardDef => ({"oracleId":"1fa272bf-8759-4750-b40b-8e2f6972d570","name":"Harsh Judgment","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"As this enchantment enters, choose a color.\nIf an instant or sorcery spell of the chosen color would deal damage to you, it deals that damage to its controller instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const dancer = (): CardDef => ({"oracleId":"0ca9c400-c62a-49d8-8dce-5caca7f92ed9","name":"Shield Dancer","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human Rebel","supertypes":[],"types":["Creature"],"subtypes":["Human","Rebel"],"oracleText":"{2}{W}: The next time target attacking creature would deal combat damage to this creature this turn, that creature deals that damage to itself instead.","power":"1","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const soltari = (): CardDef => ({"oracleId":"37da03c2-c03e-453c-8fbf-e1039faceb8c","name":"Soltari Guerrillas","manaCost":"{2}{R}{W}","cmc":4,"typeLine":"Creature — Soltari Soldier","supertypes":[],"types":["Creature"],"subtypes":["Soltari","Soldier"],"oracleText":"Shadow (This creature can block or be blocked by only creatures with shadow.)\n{0}: The next time this creature would deal combat damage to an opponent this turn, it deals that damage to target creature instead.","power":"3","toughness":"2","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Shadow"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const mercs = (): CardDef => ({"oracleId":"9d96671c-7a98-48ec-b479-bc451e18264d","name":"Mercenaries","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Human Mercenary","supertypes":[],"types":["Creature"],"subtypes":["Human","Mercenary"],"oracleText":"{3}: The next time this creature would deal damage to you this turn, prevent that damage. Any player may activate this ability.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const surgeon = (): CardDef => ({"oracleId":"48b8ab2d-9f3f-42b2-9c5d-7497bceae43e","name":"Gloom Surgeon","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Spirit","supertypes":[],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"If combat damage would be dealt to this creature, prevent that damage and exile that many cards from the top of your library.","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;

// Test cards.
const shock = card("Test Shock", "Instant", "{0}", { colors: ["R"], oracleText: "Test Shock deals 3 damage to any target." });
const blueShock = card("Test Blue Shock", "Instant", "{0}", { colors: ["U"], oracleText: "Test Blue Shock deals 3 damage to any target." });
const blaze = card("Test Blaze", "Sorcery", "{0}", { colors: ["R"], oracleText: "Test Blaze deals 3 damage to each creature and each player." });
const axe = card("Test Axe", "Sorcery", "{0}", { colors: ["R"], oracleText: "Test Axe deals 5 damage to target player or planeswalker." });
const pinger = card("Test Pinger", "Creature — Human", "{1}{R}", { cmc: 2, power: "1", toughness: "1", colors: ["R"], oracleText: "{T}: Test Pinger deals 1 damage to any target." });
const big = card("Test Big", "Creature — Giant", "{5}{G}", { cmc: 6, power: "5", toughness: "5", colors: ["G"] });
const trampler = card("Test Trampler", "Creature — Beast", "{5}{G}", { cmc: 6, power: "5", toughness: "5", colors: ["G"], keywords: ["Trample"], oracleText: "Trample" });
const chump = card("Test Chump", "Creature — Wall", "{1}", { cmc: 1, power: "0", toughness: "1" });

describe("Lane B round B120", () => {
  it("all the cards are supported", () => supported(tables(), weathered(), veteran(), reverb(), aegis(), harsh(), dancer(), soltari(), mercs(), surgeon()));

  it("Turn the Tables: all combat damage to you this turn is dealt to the target attacking creature, not other damage", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const g = putOnBattlefield(s, ap, big);
    const b = putOnBattlefield(s, ap, bear());
    const tt = inHand(s, opp, tables());
    const sh = inHand(s, ap, shock);
    s = combat(s, ap, [{ attacker: g, defender: opp }, { attacker: b, defender: opp }]);
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    pool(s, opp, { W: 5 });
    s = settle(run(s, planCast(s, opp, tt, [tgt(b)])));
    const before = life(s, opp);
    s = toStep(s, "endCombat");
    // The Giant's 5 and the Bear's own 2 go to the Bear.
    expect(life(s, opp)).toBe(before);
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, g)).toBe("battlefield");
    // Noncombat damage to that player is dealt as usual.
    s = toStep(s, "main2");
    s = settle(run(s, planCast(s, ap, sh, [{ kind: "player", id: opp }])));
    expect(life(s, opp)).toBe(before - 3);
  });

  it("Turn the Tables: with the target gone, the combat damage isn't redirected", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const g = putOnBattlefield(s, ap, big);
    const b = putOnBattlefield(s, ap, bear());
    const tt = inHand(s, opp, tables());
    const sh = inHand(s, opp, shock);
    s = combat(s, ap, [{ attacker: g, defender: opp }, { attacker: b, defender: opp }]);
    s = act(s, { type: "passPriority", player: ap });
    pool(s, opp, { W: 5 });
    s = settle(run(s, planCast(s, opp, tt, [tgt(b)])));
    // The opponent shocks the Bear away themselves before damage.
    s = act(s, { type: "passPriority", player: ap });
    s = settle(run(s, planCast(s, opp, sh, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
    const before = life(s, opp);
    s = toStep(s, "endCombat");
    expect(life(s, opp)).toBe(before - 5);
  });

  it("a bot casts Turn the Tables at its biggest attacker", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const g = putOnBattlefield(s, ap, big);
    const b = putOnBattlefield(s, ap, bear());
    inHand(s, opp, tables());
    s.players[opp]!.life = 6;
    s = combat(s, ap, [{ attacker: g, defender: opp }, { attacker: b, defender: opp }]);
    s = act(s, { type: "passPriority", player: ap });
    pool(s, opp, { W: 5 });
    s = run(s, botActions(s, opp));
    expect(s.stack.at(-1)?.targets).toMatchObject([tgt(g)]);
    s = toStep(s, "endCombat");
    expect(life(s, opp)).toBe(6);
    expect(zone(s, g)).toBe("graveyard");
  });

  it("Weathered Bodyguards: an unblocked creature's combat damage to you is dealt to it while it's untapped; trample and noncombat damage aren't", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const wb = putOnBattlefield(s, opp, weathered());
    const c = putOnBattlefield(s, opp, chump);
    const t = putOnBattlefield(s, ap, trampler);
    const b = putOnBattlefield(s, ap, bear());
    const sh = inHand(s, ap, shock);
    const before = life(s, opp);
    s = combat(s, ap, [{ attacker: t, defender: opp }, { attacker: b, defender: opp }], [{ blocker: c, attacker: t }]);
    s = toStep(s, "endCombat");
    // The Bear's 2 to the Bodyguards; the Trampler's 4 past its blocker to the player.
    expect(dmg(s, wb)).toBe(2);
    expect(life(s, opp)).toBe(before - 4);
    s = toStep(s, "main2");
    s = settle(run(s, planCast(s, ap, sh, [{ kind: "player", id: opp }])));
    expect(life(s, opp)).toBe(before - 7);
    expect(dmg(s, wb)).toBe(2);
  });

  it("Weathered Bodyguards: tapped, it takes nothing", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const wb = putOnBattlefield(s, opp, weathered());
    s.objects[wb]!.tapped = true;
    const b = putOnBattlefield(s, ap, bear());
    const before = life(s, opp);
    s = combat(s, ap, [{ attacker: b, defender: opp }]);
    s = toStep(s, "endCombat");
    expect(dmg(s, wb)).toBe(0);
    expect(life(s, opp)).toBe(before - 2);
  });

  it("Veteran Bodyguard: an unblocked creature's damage to you is dealt to it; a creature that isn't attacking deals its damage to you", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const vb = putOnBattlefield(s, opp, veteran());
    const b = putOnBattlefield(s, ap, bear());
    const p = putOnBattlefield(s, ap, pinger);
    const before = life(s, opp);
    s = settle(run(s, planActivate(s, ap, p, 0, [{ kind: "player", id: opp }])));
    expect(life(s, opp)).toBe(before - 1);
    s = combat(s, ap, [{ attacker: b, defender: opp }]);
    s = toStep(s, "endCombat");
    expect(dmg(s, vb)).toBe(2);
    expect(life(s, opp)).toBe(before - 1);
  });

  it("Reverberation: all the damage the target sorcery would deal is dealt to its controller instead", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const bz = inHand(s, ap, blaze);
    const rv = inHand(s, opp, reverb());
    const ob = putOnBattlefield(s, opp, bear());
    const mb = putOnBattlefield(s, ap, bear());
    const creatures = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).types.includes("Creature")).length;
    const lives = s.turnOrder.map((p) => life(s, p));
    s = run(s, planCast(s, ap, bz, []));
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    pool(s, opp, { U: 4 });
    s = run(s, planCast(s, opp, rv, [{ kind: "stack", id: s.stack.at(-1)!.id }]));
    s = settle(s);
    // Everyone's 3 and each creature's 3 to the sorcery's controller, nobody else hurt.
    expect(s.turnOrder.map((p) => life(s, p))).toEqual(s.turnOrder.map((p, i) => (p === ap ? lives[i]! - 3 * (4 + creatures) : lives[i]!)));
    expect(zone(s, ob)).toBe("battlefield");
    expect(zone(s, mb)).toBe("battlefield");
  });

  it("Aegis of Honor: the next instant or sorcery spell's damage to you goes to its controller; then it's used up", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const ag = putOnBattlefield(s, opp, aegis());
    const s1 = inHand(s, ap, shock);
    const s2 = inHand(s, ap, shock);
    const p = putOnBattlefield(s, ap, pinger);
    const [a0, o0] = [life(s, ap), life(s, opp)];
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    pool(s, opp, { C: 1 });
    s = settle(act(s, { type: "activateAbility", player: opp, objectId: ag, index: 0 }));
    // A creature's ability isn't a spell: dealt as usual, and the shield waits.
    s = settle(run(s, planActivate(s, ap, p, 0, [{ kind: "player", id: opp }])));
    expect(life(s, opp)).toBe(o0 - 1);
    s = settle(run(s, planCast(s, ap, s1, [{ kind: "player", id: opp }])));
    expect(life(s, opp)).toBe(o0 - 1);
    expect(life(s, ap)).toBe(a0 - 3);
    s = settle(run(s, planCast(s, ap, s2, [{ kind: "player", id: opp }])));
    expect(life(s, opp)).toBe(o0 - 4);
    expect(life(s, ap)).toBe(a0 - 3);
  });

  it("a bot answers a damage spell aimed at it with Aegis of Honor, and a sorcery with Reverberation", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const ag = putOnBattlefield(s, opp, aegis());
    const s1 = inHand(s, ap, shock);
    const [a0, o0] = [life(s, ap), life(s, opp)];
    s = run(s, planCast(s, ap, s1, [{ kind: "player", id: opp }]));
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    pool(s, opp, { C: 1 });
    s = run(s, botActions(s, opp));
    expect(s.stack.at(-1)?.sourceId).toBe(ag);
    s = settle(s);
    expect([life(s, ap), life(s, opp)]).toEqual([a0 - 3, o0]);
    const ax = inHand(s, ap, axe);
    inHand(s, opp, reverb());
    s = run(s, planCast(s, ap, ax, [{ kind: "player", id: opp }]));
    s = act(s, { type: "passPriority", player: ap });
    pool(s, opp, { U: 4 });
    s = run(s, botActions(s, opp));
    expect(s.stack.at(-1)?.targets).toMatchObject([{ kind: "stack" }]);
    s = settle(s);
    expect(life(s, opp)).toBe(o0);
    expect(life(s, ap)).toBe(a0 - 8);
  });

  it("Harsh Judgment: an instant or sorcery spell of the chosen color deals its damage to you to its controller instead", () => {
    let { s, ap, ids } = setup([harsh()]);
    const opp = next(s, ap);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])), { me: [ap] });
    expect(s.pending?.kind).toBe("chooseOption");
    const p = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>;
    expect(p.what).toBe("color");
    const red = p.options.find((o) => /^(R|Red)$/.test(o))!;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: red }));
    expect(s.objects[ids[0]!]!.chosen?.color).toBe("R");
    const rs = inHand(s, opp, shock);
    const us = inHand(s, opp, blueShock);
    const rs2 = inHand(s, opp, shock);
    const b = putOnBattlefield(s, ap, bear());
    const [a0, o0] = [life(s, ap), life(s, opp)];
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = settle(run(s, planCast(s, opp, rs, [{ kind: "player", id: ap }])));
    expect(life(s, ap)).toBe(a0);
    expect(life(s, opp)).toBe(o0 - 3);
    s = act(s, { type: "passPriority", player: ap });
    s = settle(run(s, planCast(s, opp, us, [{ kind: "player", id: ap }])));
    expect(life(s, ap)).toBe(a0 - 3);
    // Damage to your creatures isn't damage to you.
    s = act(s, { type: "passPriority", player: ap });
    s = settle(run(s, planCast(s, opp, rs2, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
    expect(life(s, opp)).toBe(o0 - 3);
  });

  it("Shield Dancer: the target attacker's combat damage to it is dealt to that attacker instead", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const sd = putOnBattlefield(s, opp, dancer());
    const g = putOnBattlefield(s, ap, big);
    s = combat(s, ap, [{ attacker: g, defender: opp }], [{ blocker: sd, attacker: g }]);
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    pool(s, opp, { W: 3 });
    s = settle(act(s, { type: "activateAbility", player: opp, objectId: sd, index: 0, targets: [tgt(g)] } as Action));
    s = toStep(s, "endCombat");
    // The Giant's 5 to itself and Shield Dancer's 1: 6, it dies; Shield Dancer is unhurt.
    expect(zone(s, g)).toBe("graveyard");
    expect(zone(s, sd)).toBe("battlefield");
    expect(dmg(s, sd)).toBe(0);
  });

  it("Soltari Guerrillas: its next combat damage to an opponent is dealt to the target creature instead, once", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const sg = putOnBattlefield(s, ap, soltari());
    const ob = putOnBattlefield(s, opp, big);
    s = settle(run(s, planActivate(s, ap, sg, 0, [tgt(ob)])));
    s = settle(run(s, planActivate(s, ap, sg, 0, [tgt(ob)])));
    const before = life(s, opp);
    s = combat(s, ap, [{ attacker: sg, defender: opp }]);
    s = toStep(s, "endCombat");
    // Two shields: the first sends the 3 to the Giant, the second is left for a later damage event.
    expect(dmg(s, ob)).toBe(3);
    expect(life(s, opp)).toBe(before);
  });

  it("Mercenaries: any player may pay {3} to prevent its next damage to them", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const m = putOnBattlefield(s, ap, mercs());
    const before = life(s, opp);
    s = combat(s, ap, [{ attacker: m, defender: opp }]);
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    pool(s, opp, { C: 3 });
    s = settle(act(s, { type: "activateAbility", player: opp, objectId: m, index: 0 }));
    s = toStep(s, "endCombat");
    expect(life(s, opp)).toBe(before);
  });

  it("Gloom Surgeon: combat damage to it is prevented and its controller exiles that many cards from the top; other damage isn't", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const gs = putOnBattlefield(s, opp, surgeon());
    const g = putOnBattlefield(s, ap, big);
    const sh = inHand(s, ap, shock);
    const top = s.players[opp]!.library.slice(0, 6);
    s = combat(s, ap, [{ attacker: g, defender: opp }], [{ blocker: gs, attacker: g }]);
    s = toStep(s, "endCombat");
    expect(zone(s, gs)).toBe("battlefield");
    expect(dmg(s, gs)).toBe(0);
    expect(top.map((id) => zone(s, id))).toEqual(["exile", "exile", "exile", "exile", "exile", "library"]);
    expect(dmg(s, g)).toBe(2);
    s = toStep(s, "main2");
    s = settle(run(s, planCast(s, ap, sh, [tgt(gs)])));
    expect(zone(s, gs)).toBe("graveyard");
  });
});
