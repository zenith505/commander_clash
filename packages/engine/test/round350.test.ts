// Round 350 (Lane A): a soulbond-granted "you may return it ... at the beginning of your next upkeep" (Breathkeeper Seraph)
// a token whose gained ability returns the card its creator exiled (Timothar, Baron of Bats) and Deserts back at your next
// end step (Desert Warfare), creatures with the activated abilities of exiled land cards (Steward of the Harvest) and of
// every card in exile with a brain counter (Rex, Cyber-Hound).

import { describe, expect, it } from "vitest";
import { act, activate, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, botActions, characteristics, manaAbilitiesOn, controllerOf, isFullySupported, moveObject, objHasKeyword, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** The player after `pid` in turn order. */
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;

// Real oracle text (Scryfall).
const seraph = (): CardDef => ({"oracleId":"a41e632f-9d36-44d2-b1dd-e17df0d2486e","name":"Breathkeeper Seraph","manaCost":"{4}{W}{W}","cmc":6,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying, soulbond (You may pair this creature with another unpaired creature when either enters. They remain paired for as long as you control both of them.)\nAs long as Breathkeeper Seraph is paired with another creature, each of those creatures has \"When this creature dies, you may return it to the battlefield under its owner's control at the beginning of your next upkeep.\"","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Soulbond"],"commanderLegal":"legal","set":"voc","releasedAt":"2021-11-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const timothar = (): CardDef => ({"oracleId":"82e03151-3990-451c-99cc-c7d386872df2","name":"Timothar, Baron of Bats","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Legendary Creature — Vampire Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire","Noble"],"oracleText":"Ward—Discard a card.\nWhenever another nontoken Vampire you control dies, you may pay {1} and exile it. If you do, create a 1/1 black Bat creature token with flying. It gains \"When this token deals combat damage to a player, sacrifice it and return the exiled card to the battlefield tapped.\"","power":"4","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Ward"],"commanderLegal":"legal","set":"voc","releasedAt":"2021-11-19","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const nighthawk = (): CardDef => ({"oracleId":"feb244f8-bcb1-44cf-9940-2719221a7309","name":"Vampire Nighthawk","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Vampire Shaman","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Shaman"],"oracleText":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)","power":"2","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch","Flying","Lifelink"],"commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const desertWarfare = (): CardDef => ({"oracleId":"de301ef8-8ba0-423d-9117-a8492a58d01b","name":"Desert Warfare","manaCost":"{3}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever you sacrifice a Desert and whenever a Desert card is put into your graveyard from your hand or library, put that card onto the battlefield under your control at the beginning of your next end step.\nAt the beginning of combat on your turn, if you control five or more Deserts, create that many 1/1 red, green, and white Sand Warrior creature tokens. They gain haste.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const desert = (): CardDef => ({"oracleId":"2672e0ca-8d5c-449f-8483-35d0e697fbb2","name":"Desert of the True","manaCost":"","cmc":0,"typeLine":"Land — Desert","supertypes":[],"types":["Land"],"subtypes":["Desert"],"oracleText":"This land enters tapped.\n{T}: Add {W}.\nCycling {1}{W} ({1}{W}, Discard this card: Draw a card.)","colors":[],"colorIdentity":["W"],"keywords":["Cycling"],"producedMana":["W"],"commanderLegal":"legal","set":"hou","releasedAt":"2017-07-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const plainsDef = (): CardDef => ({"oracleId":"bc71ebf6-2056-41f7-be35-b2e5c34afa99","name":"Plains","manaCost":"","cmc":0,"typeLine":"Basic Land — Plains","supertypes":["Basic"],"types":["Land"],"subtypes":["Plains"],"oracleText":"({T}: Add {W}.)","colors":[],"colorIdentity":["W"],"keywords":[],"producedMana":["W"],"commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const steward = (): CardDef => ({"oracleId":"1bb7a942-c4b9-47a2-9782-3ec3efcdaff5","name":"Steward of the Harvest","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Human Druid","supertypes":[],"types":["Creature"],"subtypes":["Human","Druid"],"oracleText":"When this creature enters, exile up to three target land cards from your graveyard.\nCreatures you control have all activated abilities of all land cards exiled with this creature.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"tdc","releasedAt":"2025-04-11","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ghostQuarter = (): CardDef => ({"oracleId":"2ec4288e-34c6-4831-a2c0-ba1ca1d9d1dc","name":"Ghost Quarter","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{T}, Sacrifice this land: Destroy target land. Its controller may search their library for a basic land card, put it onto the battlefield, then shuffle.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"sld","releasedAt":"2022-04-11","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rex = (): CardDef => ({"oracleId":"7ad52f9c-48d8-486f-90b7-73ce5cb3b9db","name":"Rex, Cyber-Hound","manaCost":"{1}{W}{U}","cmc":3,"typeLine":"Legendary Artifact Creature — Robot Dog","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot","Dog"],"oracleText":"Whenever Rex deals combat damage to a player, they mill two cards and you get {E}{E} (two energy counters).\nPay {E}{E}: Choose target creature card in a graveyard. Exile it with a brain counter on it. Activate only as a sorcery.\nRex has all activated abilities of all cards in exile with brain counters on them.","power":"2","toughness":"2","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Mill"],"commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pyromancer = (): CardDef => ({"oracleId":"29b3cb3e-aeb1-43eb-8095-9f7881aa34bd","name":"Prodigal Pyromancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("round 350: compiles", () => {
  it("every card of the round", () => supported(seraph(), timothar(), desertWarfare(), steward(), rex()));
});

describe("Breathkeeper Seraph", () => {
  /** Seraph and a Bears of `ap`'s, paired. */
  const paired = () => {
    const { s, ap, opp } = setup([]);
    const sera = putOnBattlefield(s, ap, seraph());
    const b = putOnBattlefield(s, ap, bears());
    s.objects[sera]!.paired = { id: b, zc: 0, by: ap };
    s.objects[b]!.paired = { id: sera, zc: 0, by: ap };
    return { s, ap, opp, sera, b };
  };

  it("a paired creature that dies may come back under its owner's control at its controller's next upkeep", () => {
    const { s: s0, ap, sera, b } = paired();
    moveObject(s0, b, "graveyard");
    let s = settle(s0, ap);
    expect(s.objects[b]!.zone).toBe("graveyard");
    // Not before that upkeep.
    s = settle(passUntil(s, "upkeep", next(s, ap)), ap);
    expect(s.objects[b]!.zone).toBe("graveyard");
    s = settle(passUntil(s, "upkeep", ap), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    // Seraph itself has the ability too while paired.
    expect(s.objects[sera]!.zone).toBe("battlefield");
  });

  it("declined, the card stays in the graveyard", () => {
    const { s: s0, ap, b } = paired();
    moveObject(s0, b, "graveyard");
    let s = settle(passUntil(settle(s0, ap), "upkeep", next(s0, ap)), ap);
    s = settle(passUntil(s, "upkeep", ap), ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("the Seraph's own death works the same way, and an unpaired creature gets nothing", () => {
    const { s: s0, ap, sera } = paired();
    const lone = putOnBattlefield(s0, ap, bears());
    moveObject(s0, sera, "graveyard");
    moveObject(s0, lone, "graveyard");
    let s = settle(passUntil(settle(s0, ap), "upkeep", next(s0, ap)), ap);
    s = settle(passUntil(s, "upkeep", ap), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    // Only one question: back, the Seraph's soulbond asks whether to pair it (with the Bears).
    expect(s.pending?.kind).not.toBe("chooseMay");
    expect(s.objects[sera]!.zone).toBe("battlefield");
    expect(s.objects[lone]!.zone).toBe("graveyard");
  });

  it("a card that left the graveyard before that upkeep stays where it went", () => {
    const { s: s0, ap, b } = paired();
    moveObject(s0, b, "graveyard");
    let s = settle(s0, ap);
    moveObject(s, b, "exile");
    s = settle(passUntil(s, "upkeep", next(s, ap)), ap);
    s = settle(passUntil(s, "upkeep", ap), ap);
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.objects[b]!.zone).toBe("exile");
  });

  it("bots return it", () => {
    const { s: s0, ap, b } = paired();
    moveObject(s0, b, "graveyard");
    let s = settle(passUntil(settle(s0), "upkeep", next(s0, ap)));
    s = settle(passUntil(s, "upkeep", ap));
    expect(s.objects[b]!.zone).toBe("battlefield");
  });
});

/** `ap` attacks `defender` with `attackers`, nobody blocks; stops at a question of `me`'s or once combat damage is over and the stack is empty. */
const swing = (s: GameState, ap: PlayerId, attackers: string[], defender: PlayerId, me?: PlayerId) => {
  s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 300; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p && p.player === me) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else if ((s.step === "combatDamage" || s.step === "endCombat") && !s.stack.length && !s.triggerQueue.length) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error("combat never ended");
};
/** {C} in `pid`'s mana pool, to pay a "you may pay {1}" with. */
const floatOne = (s: GameState, pid: PlayerId) => {
  s.players[pid]!.manaPool.C = (s.players[pid]!.manaPool.C ?? 0) + 1;
  return s;
};
const bats = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).subtypes.includes("Bat"));

describe("Timothar, Baron of Bats", () => {
  it("paid: the Vampire is exiled for a flying Bat; when the Bat deals combat damage to a player it's sacrificed and the Vampire returns tapped", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, timothar());
    const v = putOnBattlefield(s0, ap, nighthawk());
    moveObject(s0, v, "graveyard");
    let s = settle(s0, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { mana: "{1}" } });
    s = settle(act(floatOne(s, ap), { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.objects[v]!.zone).toBe("exile");
    const [bat] = bats(s, ap);
    expect(bat).toBeDefined();
    expect(objHasKeyword(s, s.objects[bat!]!, "Flying")).toBe(true);
    s.objects[bat!]!.controlledSinceTurn = -1;
    s = swing(s, ap, [bat!], opp, ap);
    expect(s.objects[bat!]?.zone).not.toBe("battlefield");
    expect(s.objects[v]!.zone).toBe("battlefield");
    expect(s.objects[v]!.tapped).toBe(true);
    expect(controllerOf(s, s.objects[v]!)).toBe(ap);
  });

  it("not paid, the card stays in the graveyard and there's no Bat; a card already gone can't be paid for", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, timothar());
    const v = putOnBattlefield(s0, ap, nighthawk());
    moveObject(s0, v, "graveyard");
    let s = settle(s0, ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.objects[v]!.zone).toBe("graveyard");
    expect(bats(s, ap)).toEqual([]);
    // Another one, exiled from the graveyard before the trigger resolves: no question, no Bat (rulings).
    const w = putOnBattlefield(s, ap, nighthawk());
    moveObject(s, w, "graveyard");
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    while (s.triggerQueue.length && !s.stack.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    moveObject(s, w, "exile");
    s = settle(s, ap);
    expect(s.pending).toBeFalsy();
    expect(bats(s, ap)).toEqual([]);
  });

  it("each Bat returns only its own card; with its card gone from exile the Bat is still sacrificed", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, timothar());
    const v = putOnBattlefield(s0, ap, nighthawk());
    const v2 = putOnBattlefield(s0, ap, nighthawk());
    moveObject(s0, v, "graveyard");
    moveObject(s0, v2, "graveyard");
    let s = s0;
    for (let i = 0; i < 2; i++) {
      s = settle(s, ap);
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
      s = act(floatOne(s, ap), { type: "chooseMay", player: ap, yes: true });
    }
    s = settle(s, ap);
    const two = bats(s, ap);
    expect(two.length).toBe(2);
    for (const b of two) s.objects[b]!.controlledSinceTurn = -1;
    // Each Bat returns only its own card: one card has left exile.
    moveObject(s, v2, "graveyard");
    s = swing(s, ap, two, opp, ap);
    expect(bats(s, ap)).toEqual([]);
    expect(s.objects[v]!.zone).toBe("battlefield");
    expect(s.objects[v2]!.zone).toBe("graveyard");
  });
});

describe("Desert Warfare", () => {
  /** `pid`'s cards of `name` on the battlefield under `pid`'s control. */
  const mine = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).name === name);
  /** A copy of `def` in `pid`'s hand. */
  const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "hand";
    s.players[pid]!.hand.push(id);
    return id;
  };
  /** A copy of `def` on top of `pid`'s library. */
  const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.unshift(id);
    return id;
  };

  it("a sacrificed Desert comes back under your control at your next end step, an opponent's one too; a destroyed one doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, desertWarfare());
    const d = putOnBattlefield(s0, ap, desert());
    const theirs = putOnBattlefield(s0, opp, desert());
    s0.objects[theirs]!.controller = ap;
    const gone = putOnBattlefield(s0, ap, desert());
    const p = putOnBattlefield(s0, ap, plainsDef());
    moveObject(s0, d, "graveyard", { sacrificed: true });
    moveObject(s0, theirs, "graveyard", { sacrificed: true });
    moveObject(s0, gone, "graveyard", { destroyed: true });
    moveObject(s0, p, "graveyard", { sacrificed: true });
    let s = settle(s0);
    expect(s.objects[d]!.zone).toBe("graveyard");
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[d]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(s.objects[gone]!.zone).toBe("graveyard");
    expect(s.objects[p]!.zone).toBe("graveyard");
  });

  it("a Desert card put into your graveyard from your hand or library comes back; one that has left the graveyard doesn't", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, desertWarfare());
    const h = inHand(s0, ap, desert());
    const l = onTop(s0, ap, desert());
    const l2 = onTop(s0, ap, desert());
    moveObject(s0, h, "graveyard");
    moveObject(s0, l, "graveyard");
    moveObject(s0, l2, "graveyard");
    let s = settle(s0);
    moveObject(s, l2, "exile");
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[h]!.zone).toBe("battlefield");
    expect(s.objects[l]!.zone).toBe("battlefield");
    expect(s.objects[l2]!.zone).toBe("exile");
  });

  it("a Desert sacrificed on an opponent's turn waits for your own end step", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, desertWarfare());
    const d = putOnBattlefield(s0, ap, desert());
    let s = settle(passUntil(s0, "main1", opp));
    moveObject(s, d, "graveyard", { sacrificed: true });
    s = settle(passUntil(settle(s), "end", opp));
    s = settle(passUntil(s, "cleanup", opp));
    expect(s.objects[d]!.zone).toBe("graveyard");
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[d]!.zone).toBe("battlefield");
  });

  it("beginning of combat with five or more Deserts: that many hasty 1/1 red, green and white Sand Warriors; with four, none", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, desertWarfare());
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, desert());
    let s = settle(passUntil(s0, "beginCombat", ap));
    expect(mine(s, ap, "Sand Warrior Token")).toEqual([]);
    s = settle(passUntil(s, "main1", ap));
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, desert());
    s = settle(passUntil(s, "beginCombat", ap));
    const tokens = mine(s, ap, "Sand Warrior Token");
    expect(tokens.length).toBe(6);
    const c = characteristics(s, s.objects[tokens[0]!]!);
    expect([...c.colors].sort()).toEqual(["G", "R", "W"]);
    expect(objHasKeyword(s, s.objects[tokens[0]!]!, "Haste")).toBe(true);
  });
});

describe("Steward of the Harvest", () => {
  /** Steward enters from `ap`'s hand with Plains and Ghost Quarter in `ap`'s graveyard, exiling both. */
  const withSteward = () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, plainsDef());
    const gq = putOnBattlefield(s0, ap, ghostQuarter());
    moveObject(s0, p, "graveyard");
    moveObject(s0, gq, "graveyard");
    const st = putOnBattlefield(s0, ap, steward());
    s0.battlefield.splice(s0.battlefield.indexOf(st), 1);
    s0.objects[st]!.zone = "hand";
    s0.players[ap]!.hand.push(st);
    moveObject(s0, st, "battlefield", { controller: ap });
    let s = settle(s0, ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(p), target(gq), { kind: "none" }] }), ap);
    expect(s.objects[p]!.zone).toBe("exile");
    expect(s.objects[gq]!.zone).toBe("exile");
    return { s, ap, opp, st, p, gq };
  };
  const whiteIndex = (s: GameState, id: string) => manaAbilitiesOn(s, s.objects[id]!).findIndex((a) => JSON.stringify(a).includes('"W"'));

  it("creatures you control get the exiled lands' activated abilities: a Plains' {T}: Add {W}, Ghost Quarter's sacrifice ability on the creature itself", () => {
    const { s: s0, ap, opp } = withSteward();
    const b = putOnBattlefield(s0, ap, bears());
    const theirs = putOnBattlefield(s0, opp, bears());
    const land = putOnBattlefield(s0, opp, plainsDef());
    let s = s0;
    const w = whiteIndex(s, b);
    expect(w).toBeGreaterThanOrEqual(0);
    // An opponent's creature gets nothing.
    expect(whiteIndex(s, theirs)).toBe(-1);
    s = act(s, { type: "activateMana", player: ap, objectId: b, mana: "W", ability: w });
    expect(s.players[ap]!.manaPool.W).toBeGreaterThanOrEqual(1);
    expect(s.objects[b]!.tapped).toBe(true);
    // Ghost Quarter's "{T}, Sacrifice this land": the creature that has it is sacrificed.
    const b2 = putOnBattlefield(s, ap, bears());
    const gqAt = abilitiesOf(s, s.objects[b2]!).activated.findIndex((a) => a.sacrificeSelf);
    expect(gqAt).toBeGreaterThanOrEqual(0);
    s = settle(activate(s, ap, b2, gqAt, [target(land)]));
    expect(s.objects[b2]!.zone).toBe("graveyard");
    expect(s.objects[land]!.zone).toBe("graveyard");
  });

  it("a creature that came under your control this turn can't use a {T} ability; the abilities go once Steward leaves", () => {
    const { s: s0, ap } = withSteward();
    const sick = putOnBattlefield(s0, ap, bears(), { sick: true });
    let s = s0;
    const w = whiteIndex(s, sick);
    expect(w).toBeGreaterThanOrEqual(0);
    expect(() => act(s, { type: "activateMana", player: ap, objectId: sick, mana: "W", ability: w })).toThrow();
    const b = putOnBattlefield(s, ap, bears());
    const st = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Steward of the Harvest")!;
    moveObject(s, st, "graveyard");
    s = settle(s);
    expect(whiteIndex(s, b)).toBe(-1);
  });
});

describe("Rex, Cyber-Hound", () => {
  it("pay {E}{E}: a creature card from any graveyard is exiled with a brain counter, and Rex has its activated abilities", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rex());
    const pyro = putOnBattlefield(s0, opp, pyromancer());
    const elf = putOnBattlefield(s0, ap, elves());
    moveObject(s0, pyro, "graveyard");
    moveObject(s0, elf, "graveyard");
    s0.players[ap]!.energy = 4;
    const own = abilitiesOf(s0, s0.objects[r]!).activated.length;
    let s = settle(activate(s0, ap, r, 0, [target(pyro)]));
    expect(s.objects[pyro]!.zone).toBe("exile");
    expect(s.objects[pyro]!.counters.brain).toBe(1);
    expect(s.players[ap]!.energy).toBe(2);
    // Rex's version of "{T}: This creature deals 1 damage to any target" is Rex's own.
    const lent = abilitiesOf(s, s.objects[r]!).activated;
    expect(lent.length).toBe(own + 1);
    const life = s.players[opp]!.life;
    s = settle(activate(s, ap, r, own, [{ kind: "player", id: opp }]));
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(s.objects[r]!.tapped).toBe(true);
    // A second card: its mana ability too.
    s.objects[r]!.tapped = false;
    s = settle(activate(s, ap, r, 0, [target(elf)]));
    expect(manaAbilitiesOn(s, s.objects[r]!).some((a) => JSON.stringify(a).includes('"G"'))).toBe(true);
  });

  it("a card that leaves exile takes its abilities with it; with too little energy the ability can't be activated", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rex());
    const pyro = putOnBattlefield(s0, opp, pyromancer());
    moveObject(s0, pyro, "graveyard");
    s0.players[ap]!.energy = 1;
    expect(() => activate(s0, ap, r, 0, [target(pyro)])).toThrow();
    s0.players[ap]!.energy = 2;
    const own = abilitiesOf(s0, s0.objects[r]!).activated.length;
    let s = settle(activate(s0, ap, r, 0, [target(pyro)]));
    expect(abilitiesOf(s, s.objects[r]!).activated.length).toBe(own + 1);
    moveObject(s, pyro, "graveyard");
    s = settle(s);
    expect(abilitiesOf(s, s.objects[r]!).activated.length).toBe(own);
  });
});
