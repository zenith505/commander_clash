// Round 329 (Lane A, skip-list cards): replacements of losing the game, chosen among by the player (CR 616.1): "The next
// time you would lose the game this turn, instead draw seven cards and your life total becomes 1." (Stunning Reversal) and
// "If you would lose the game, instead exile this creature and your life total becomes equal to your starting life
// total." (Exquisite Archangel, which may go to the graveyard instead when it dies in the same check, rulings); "Surveil
// 1. If you put a noncreature, nonland card into your graveyard this way, put that card into your hand." (Chandra, Chill
// of Compliance; Enlightened Confidant's mana value bound); "If it was a creature card, ... If it was a land card, ...
// Otherwise, ..." (Misfortune Teller); "exile all cards from your library face down, then shuffle all cards from your
// graveyard into your library." (Inverter of Truth); "For each blocking creature, flip a coin. If you win the flip, prevent
// all combat damage that would be dealt by that creature this turn." (Fighting Chance).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, compileCard, gainLife as gain, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

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
/** One priority pass by whoever has priority: the state-based actions are performed after it (CR 704.3). */
const check = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const named = (s: GameState, name: string, z: string, pid?: PlayerId) => Object.values(s.objects).filter((o) => s.cards[o.cardId]!.name === name && o.zone === z && (pid === undefined || o.owner === pid)).map((o) => o.id);

// Real oracle text (Scryfall).
const reversal = (): CardDef => ({"oracleId":"3db00947-d568-45d7-82cd-b54b4fcb1312","name":"Stunning Reversal","manaCost":"{3}{B}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"The next time you would lose the game this turn, instead draw seven cards and your life total becomes 1.\nExile Stunning Reversal.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"bbd","releasedAt":"2018-06-08","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const archangel = (): CardDef => ({"oracleId":"472efb69-47c8-4c93-b60a-f6dba4364b8c","name":"Exquisite Archangel","manaCost":"{5}{W}{W}","cmc":7,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nIf you would lose the game, instead exile this creature and your life total becomes equal to your starting life total.","power":"5","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":["Flying"],"commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const throne = (): CardDef => ({"oracleId":"a68f41a2-37ee-46e1-bf3c-164c78b003ca","name":"The Golden Throne","manaCost":"{4}","cmc":4,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"Arcane Life-support — If you would lose the game, instead exile The Golden Throne and your life total becomes 1.\nA Thousand Souls Die Every Day — {T}, Sacrifice a creature: Add three mana in any combination of colors.","colors":[],"colorIdentity":[],"keywords":["Arcane Life-support","A Thousand Souls Die Every Day"],"producedMana":["B","G","R","U","W"],"commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const teller = (): CardDef => ({"oracleId":"bd1ccc6f-d281-413e-889e-1e022c3f2a99","name":"Misfortune Teller","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Human Warlock","supertypes":[],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"Deathtouch\nWhenever this creature enters or deals combat damage to a player, exile target card from a graveyard. If it was a creature card, create a 2/2 black Rogue creature token. If it was a land card, create a Treasure token. Otherwise, you gain 3 life.","power":"3","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Treasure","Deathtouch"],"commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const chandra = (): CardDef => ({"oracleId":"c3dfa1e2-6785-49a0-a194-fb842a8eb63c","name":"Chandra, Chill of Compliance","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Chandra","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Chandra"],"oracleText":"+1: Surveil 1. If you put a noncreature, nonland card into your graveyard this way, put that card into your hand.\n+1: Add {U}. Spend this mana only to cast a noncreature spell.\n−X: Tap target artifact or creature. Put X stun counters on it.\n−6: You get an emblem with \"Whenever you cast a spell, draw a card.\"","loyalty":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Surveil"],"producedMana":["U"],"commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const confidant = (): CardDef => ({"oracleId":"a139eb7f-3853-490c-a839-35d0e5aed7b5","name":"Enlightened Confidant","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Kor Cleric","supertypes":[],"types":["Creature"],"subtypes":["Kor","Cleric"],"oracleText":"Lifelink\nAt the beginning of your end step, if you gained life this turn, surveil 1. If you put a card with mana value less than or equal to the amount of life you gained this turn into your graveyard this way, put that card into your hand.","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Surveil","Lifelink"],"commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const chance = (): CardDef => ({"oracleId":"fece632b-d8d5-4d3d-a4a7-643293b67538","name":"Fighting Chance","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"For each blocking creature, flip a coin. If you win the flip, prevent all combat damage that would be dealt by that creature this turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"exo","releasedAt":"1998-06-15","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const inverter = (): CardDef => ({"oracleId":"941350ba-30e2-4549-865f-ca1bd7626782","name":"Inverter of Truth","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Creature — Eldrazi","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"Devoid (This card has no color.)\nFlying\nWhen this creature enters, exile all cards from your library face down, then shuffle all cards from your graveyard into your library.","power":"6","toughness":"6","colors":[],"colorIdentity":["B"],"keywords":["Flying","Devoid"],"commanderLegal":"legal","set":"ogw","releasedAt":"2016-01-22","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);

/** A card put into `pid`'s graveyard. */
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** A card put on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const platinum = () => card("Platinum Angel", "Artifact Creature — Angel", "{7}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nYou can't lose the game and your opponents can't win the game." });
const doom = () => card("Doom Decree", "Sorcery", "{B}", { cmc: 1, oracleText: "Target player loses the game." });

describe("round 329", () => {
  it("are fully supported", () => supported(reversal(), archangel(), teller(), chandra(), confidant(), inverter(), chance()));
  it("Stunning Reversal and Exquisite Archangel compile to their replacements", () => {
    expect(compileCard(archangel()).loseGameExileSelf).toBe("startingLife");
    expect(compileCard(throne()).loseGameExileSelf).toBe(true);
    expect(compileCard(reversal()).spell?.effects.map((e) => e.type)).toEqual(["loseInsteadThisTurn"]);
  });
});

describe("round 329: Stunning Reversal", () => {
  it("the next loss this turn draws seven cards and sets the life total to 1 instead; it's exiled; the loss after that stands", () => {
    const { s: s0, ap, ids } = setup([reversal()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(s.players[ap]!.loseInstead).toHaveLength(1);
    const hand = s.players[ap]!.hand.length;
    s.players[ap]!.life = -4;
    s = check(s);
    expect(s.players[ap]!.lost).toBeFalsy();
    expect(s.players[ap]!.life).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 7);
    expect(s.players[ap]!.loseInstead).toBeUndefined();
    s.players[ap]!.life = 0;
    s = check(s);
    expect(s.players[ap]!.lost).toBe(true);
  });
  it("replaces a loss of any kind: ten poison counters, which are still there, so the player loses at the next check", () => {
    const { s: s0, ap, ids } = setup([reversal()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    s.players[ap]!.poison = 10;
    s = check(s);
    // The replacement applies once; the poison counters stay, and the next check loses (rulings).
    expect(s.players[ap]!.lost).toBe(true);
    expect(s.log.some((l) => l.text.includes("draws seven cards instead"))).toBe(true);
  });
  it("with fewer than seven cards in the library, the player loses right after it applies", () => {
    const { s: s0, ap, ids } = setup([reversal()]);
    const lib = s0.players[ap]!.library;
    for (const id of lib.splice(3)) s0.objects[id]!.zone = "exile";
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    s.players[ap]!.life = 0;
    s = check(s);
    expect(s.players[ap]!.library).toHaveLength(0);
    expect(s.players[ap]!.lost).toBe(true);
    expect(s.players[ap]!.lossReason).toBe("drew from an empty library");
  });
  it("lasts only this turn", () => {
    const { s: s0, ap, ids, opp } = setup([reversal()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    s = passUntil(s, "upkeep", opp);
    s.players[ap]!.life = 0;
    s = check(s);
    expect(s.players[ap]!.lost).toBe(true);
  });
  it("doesn't apply while the player can't lose the game (Platinum Angel); the shield stays", () => {
    const { s: s0, ap, ids } = setup([reversal()]);
    putOnBattlefield(s0, ap, platinum());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    const hand = s.players[ap]!.hand.length;
    s.players[ap]!.life = 0;
    s = check(s);
    expect(s.players[ap]!.lost).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.loseInstead).toHaveLength(1);
  });
  it("a bot keeps it until its life is low", () => {
    const { s: s0, ap, ids } = setup([reversal()]);
    for (const id of s0.players[ap]!.hand.filter((x) => x !== ids[0])) s0.objects[id]!.zone = "exile";
    s0.players[ap]!.hand = [ids[0]!];
    const casts = (s: GameState) => botActions(s, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0]);
    expect(casts(s0)).toBe(false);
    s0.players[ap]!.life = 3;
    expect(casts(s0)).toBe(true);
  });
});

describe("round 329: Exquisite Archangel", () => {
  it("a loss exiles it instead and the life total becomes the starting life total, 40", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, archangel());
    s0.players[ap]!.life = -6;
    const s = check(s0);
    expect(s.players[ap]!.lost).toBeFalsy();
    expect(zone(s, a)).toBe("exile");
    expect(s.players[ap]!.life).toBe(40);
  });
  it("dying in the same check as the loss: its controller chooses exile or the graveyard, and the life total becomes 40 either way", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, archangel());
    s0.objects[a]!.damage = 5;
    s0.players[ap]!.life = 0;
    let s = check(s0);
    const p = s.pending;
    expect(p).toMatchObject({ kind: "chooseOption", player: ap, what: "loseReplacement" });
    if (p?.kind !== "chooseOption") return;
    expect(p.options).toEqual([a, `${a}:graveyard`]);
    const viaExile = act(s, { type: "chooseOption", player: ap, choice: a });
    expect(zone(viaExile, a)).toBe("exile");
    expect(viaExile.players[ap]!.life).toBe(40);
    s = act(s, { type: "chooseOption", player: ap, choice: `${a}:graveyard` });
    expect(s.players[ap]!.lost).toBeFalsy();
    expect(zone(s, a)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(40);
  });
  it("with The Golden Throne too, the player chooses which replacement applies; the other stays", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, archangel());
    const t = putOnBattlefield(s0, ap, throne());
    s0.players[ap]!.life = 0;
    let s = check(s0);
    const p = s.pending;
    expect(p).toMatchObject({ kind: "chooseOption", player: ap, what: "loseReplacement" });
    if (p?.kind !== "chooseOption") return;
    expect([...p.options].sort()).toEqual([a, t].sort());
    s = act(s, { type: "chooseOption", player: ap, choice: t });
    expect(zone(s, t)).toBe("exile");
    expect(zone(s, a)).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(1);
    expect(s.players[ap]!.lost).toBeFalsy();
  });
  it("a bot picks the replacement that leaves it the most life", () => {
    const { s: s0, opp } = setup([]);
    const a = putOnBattlefield(s0, opp, archangel());
    putOnBattlefield(s0, opp, throne());
    s0.players[opp]!.life = 0;
    const s = check(s0);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "loseReplacement" });
    expect(botActions(s, opp)).toEqual([{ type: "chooseOption", player: opp, choice: a }]);
  });
  it("a loss an effect causes waits for the choice until the spell has resolved, then the chosen replacement applies", () => {
    const { s: s0, ap, ids, opp } = setup([doom()]);
    const a = putOnBattlefield(s0, opp, archangel());
    const t = putOnBattlefield(s0, opp, throne());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = settle(s, opp);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "loseReplacement" });
    expect(s.players[opp]!.loseDeferred).toBe("Doom Decree");
    s = act(s, { type: "chooseOption", player: opp, choice: a });
    expect(s.players[opp]!.lost).toBeFalsy();
    expect(s.players[opp]!.loseDeferred).toBeUndefined();
    expect(zone(s, a)).toBe("exile");
    expect(zone(s, t)).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(40);
  });
});

describe("round 329: Chandra, Chill of Compliance and Enlightened Confidant", () => {
  it("Chandra's +1: a noncreature, nonland card surveiled into the graveyard goes to the hand", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, chandra());
    s0.objects[c]!.counters.loyalty = 3;
    const shock = onTop(s0, ap, card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." }));
    let s = settle(run(s0, planActivate(s0, ap, c, 0)), ap);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [], away: [shock] }), ap);
    expect(zone(s, shock)).toBe("hand");
    expect(s.objects[c]!.counters.loyalty).toBe(4);
  });
  it("Chandra's +1: a creature card stays in the graveyard, and a card kept on top stays there", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, chandra());
    s0.objects[c]!.counters.loyalty = 3;
    const bear = onTop(s0, ap, card("Runeclaw Bear", "Creature — Bear", "{1}{G}", { cmc: 2, power: "2", toughness: "2" }));
    let s = settle(run(s0, planActivate(s0, ap, c, 0)), ap);
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [], away: [bear] }), ap);
    expect(zone(s, bear)).toBe("graveyard");
    const s1 = structuredClone(s0);
    const shock = onTop(s1, ap, card("Shock", "Instant", "{R}", { cmc: 1 }));
    let s2 = settle(run(s1, planActivate(s1, ap, c, 0)), ap);
    s2 = settle(act(s2, { type: "arrangeTop", player: ap, top: [shock], away: [] }), ap);
    expect(zone(s2, shock)).toBe("library");
    expect(s2.players[ap]!.library[0]).toBe(shock);
  });
  it("Enlightened Confidant: the surveiled card goes to the hand if its mana value is at most the life gained this turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, confidant());
    const three = card("Three Drop", "Sorcery", "{2}{R}", { cmc: 3 });
    const four = card("Four Drop", "Sorcery", "{3}{R}", { cmc: 4 });
    for (const [def, kept] of [[three, true], [four, false]] as const) {
      // No life gained this turn: no trigger (CR 603.4).
      const s1 = structuredClone(s0);
      onTop(s1, ap, def);
      let s = passUntil(s1, "end", ap);
      expect(s.stack.length + s.triggerQueue.length).toBe(0);
      const s2 = structuredClone(s0);
      const id = onTop(s2, ap, def);
      gain(s2, ap, 3);
      s = settle(passUntil(s2, "end", ap), ap);
      expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap });
      s = settle(act(s, { type: "arrangeTop", player: ap, top: [], away: [id] }), ap);
      expect(zone(s, id)).toBe(kept ? "hand" : "graveyard");
    }
  });
});

describe("round 329: Misfortune Teller", () => {
  const exileWith = (def: CardDef) => {
    const { s: s0, ap, ids, opp } = setup([teller()]);
    const victim = inYard(s0, opp, def);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(victim)] }), ap);
    expect(zone(s, victim)).toBe("exile");
    return { s, ap };
  };
  it("a creature card: a 2/2 black Rogue", () => {
    const { s, ap } = exileWith(card("Runeclaw Bear", "Creature — Bear", "{1}{G}", { cmc: 2, power: "2", toughness: "2" }));
    expect(named(s, "Rogue Token", "battlefield", ap)).toHaveLength(1);
    expect(named(s, "Treasure Token", "battlefield", ap)).toHaveLength(0);
    expect(s.players[ap]!.life).toBe(40);
  });
  it("a land card: a Treasure", () => {
    const { s, ap } = exileWith(card("Swamp", "Basic Land — Swamp"));
    expect(named(s, "Treasure Token", "battlefield", ap)).toHaveLength(1);
    expect(named(s, "Rogue Token", "battlefield", ap)).toHaveLength(0);
    expect(s.players[ap]!.life).toBe(40);
  });
  it("otherwise: 3 life", () => {
    const { s, ap } = exileWith(card("Shock", "Instant", "{R}", { cmc: 1 }));
    expect(named(s, "Treasure Token", "battlefield", ap)).toHaveLength(0);
    expect(named(s, "Rogue Token", "battlefield", ap)).toHaveLength(0);
    expect(s.players[ap]!.life).toBe(43);
  });
  it("a land creature card (Dryad Arbor): both tokens, no life (rulings)", () => {
    const { s, ap } = exileWith(card("Dryad Arbor", "Land Creature — Forest Dryad", "", { power: "1", toughness: "1" }));
    expect(named(s, "Rogue Token", "battlefield", ap)).toHaveLength(1);
    expect(named(s, "Treasure Token", "battlefield", ap)).toHaveLength(1);
    expect(s.players[ap]!.life).toBe(40);
  });
});

describe("round 329: Inverter of Truth", () => {
  it("exiles the whole library face down, then shuffles the graveyard in as the library", () => {
    const { s: s0, ap, ids } = setup([inverter()]);
    const yard = [1, 2, 3, 4, 5].map((i) => inYard(s0, ap, card(`Old Card ${i}`, "Sorcery", "{1}", { cmc: 1 })));
    const lib = [...s0.players[ap]!.library];
    expect(lib.length).toBeGreaterThan(50);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    for (const id of lib) {
      expect(zone(s, id)).toBe("exile");
      expect(s.objects[id]!.hiddenExile?.seen).toEqual([]);
    }
    expect([...s.players[ap]!.library].sort()).toEqual([...yard].sort());
    expect(s.players[ap]!.graveyard).toHaveLength(0);
  });
  it("a bot doesn't cast it with a small graveyard", () => {
    const { s: s0, ap, ids } = setup([inverter()]);
    expect(botActions(s0, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(false);
  });
});

describe("round 329: Fighting Chance", () => {
  const blocked = (seed: number) => {
    const { s: s0, ap, ids, opp } = setup([chance()], seed);
    const bear = (name: string) => card(name, "Creature — Bear", "{1}{G}", { cmc: 2, power: "3", toughness: "3" });
    const attackers = ["Red Bear", "Blue Bear", "Green Bear"].map((n) => putOnBattlefield(s0, ap, bear(n)));
    const blockers = ["Gray Bear", "Brown Bear", "Black Bear"].map((n) => putOnBattlefield(s0, opp, bear(n)));
    let s = passUntil(s0, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((a) => ({ attacker: a, defender: opp })) });
    while (!(s.pending?.kind === "declareBlockers" && s.pending.player === opp)) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: blockers.map((b, i) => ({ blocker: b, attacker: attackers[i]! })) });
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, ids, opp, attackers, blockers };
  };
  it("a flip for each blocking creature: each one won deals no combat damage this turn, each one lost does", () => {
    let wins = 0;
    let losses = 0;
    for (const seed of [1, 2, 3, 4]) {
      const { s: s0, ap, ids, attackers, blockers } = blocked(seed);
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
      const line = s.log.find((l) => l.text.includes("for Fighting Chance"))!.text;
      // "A flips 3 coins for Fighting Chance: won for X, Y, lost for Z."
      const wonNames = (/: won for (.*?)(?:, lost for .*)?\.$/.exec(line)?.[1] ?? "").split(", ");
      s = passUntil(s, "endCombat");
      blockers.forEach((b, i) => {
        const name = s.cards[s.objects[b]!.cardId]!.name;
        const won = wonNames.includes(name);
        if (won) wins++;
        else losses++;
        expect(s.objects[attackers[i]!]!.zone, `${line} (${name})`).toBe(won ? "battlefield" : "graveyard");
        expect(s.objects[b]!.zone).toBe("graveyard"); // the attacker's damage isn't prevented
      });
    }
    expect(wins).toBeGreaterThan(0);
    expect(losses).toBeGreaterThan(0);
  });
  it("with no blocking creature it flips no coins; a bot doesn't cast it then", () => {
    const { s: s0, ap, ids } = setup([chance()]);
    expect(botActions(s0, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(false);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.log.some((l) => l.text.includes("flips no coins for Fighting Chance"))).toBe(true);
  });
});
