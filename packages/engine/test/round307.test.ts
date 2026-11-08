// Round 307 (Lane A, skip-list cards): Aminatou, the Fateshifter's −6 (every player's nonland permanents to the player
// before them), Shelob, Dread Weaver (a creature card exiled with it as a cost), Vraska, the Silencer (returned as a
// Treasure), Sothera, the Supervoid (each opponent exiles a creature; one comes back), Goldberry, River-Daughter (counters
// moved both ways), Deathmist Raptor (back from the graveyard face up or face down).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { moveObject } from "../src/game";
import { groupValue } from "../src/value";
import { abilityCosts } from "../src/bot";
import { abilitiesOf } from "../src/cards";
import { compileCard } from "../src/oracle";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
type T = TargetChoice;
const leftOf = (s: GameState, pid: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % s.turnOrder.length]!;
const ctl = (s: GameState, id: string) => controllerOf(s, s.objects[id]!);

// Real oracle text (Scryfall).
const aminatou = (): CardDef => ({"oracleId":"3a30089d-cd2d-49be-9b06-7a2454117692","name":"Aminatou, the Fateshifter","manaCost":"{W}{U}{B}","cmc":3,"typeLine":"Legendary Planeswalker — Aminatou","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Aminatou"],"oracleText":"+1: Draw a card, then put a card from your hand on top of your library.\n−1: Exile another target permanent you own, then return it to the battlefield under your control.\n−6: Choose left or right. Each player gains control of all nonland permanents other than Aminatou controlled by the next player in the chosen direction.\nAminatou, the Fateshifter can be your commander.","loyalty":"3","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":[],"layout":"normal"});
const shelob = (): CardDef => ({"oracleId":"7eade76f-92e4-4d26-9eb8-d3d954845c04","name":"Shelob, Dread Weaver","manaCost":"{3}{B}","cmc":4,"typeLine":"Legendary Creature — Spider Demon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spider","Demon"],"oracleText":"Whenever a nontoken creature an opponent controls dies, exile it.\n{2}{B}, Put a creature card exiled with Shelob into its owner's graveyard: Put two +1/+1 counters on Shelob. Draw a card.\n{X}{1}{B}: Put target creature card with mana value X exiled with Shelob onto the battlefield tapped under your control.","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"});
const vraska = (): CardDef => ({"oracleId":"e7c5a568-3855-4a20-9edf-01a8a6a4ba97","name":"Vraska, the Silencer","manaCost":"{1}{B}{G}","cmc":3,"typeLine":"Legendary Creature — Gorgon Assassin","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Gorgon","Assassin"],"oracleText":"Deathtouch\nWhenever a nontoken creature an opponent controls dies, you may pay {1}. If you do, return that card to the battlefield tapped under your control. It's a Treasure artifact with \"{T}, Sacrifice this artifact: Add one mana of any color,\" and it loses all other card types.","power":"3","toughness":"3","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Deathtouch"],"producedMana":["B","G","R","U","W"],"layout":"normal"});
const sothera = (): CardDef => ({"oracleId":"760ede92-a826-4144-9de8-84ba9b8743d1","name":"Sothera, the Supervoid","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Legendary Enchantment","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a creature you control dies, each opponent chooses a creature they control and exiles it.\nAt the beginning of your end step, if a player controls no creatures, sacrifice Sothera, then put a creature card exiled with it onto the battlefield under your control with two additional +1/+1 counters on it.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"});
const goldberry = (): CardDef => ({"oracleId":"fca3545a-2956-49f9-8465-1c8937deb294","name":"Goldberry, River-Daughter","manaCost":"{1}{U}","cmc":2,"typeLine":"Legendary Creature — Nymph","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Nymph"],"oracleText":"{T}: Move a counter of each kind not on Goldberry from another target permanent you control onto Goldberry.\n{U}, {T}: Move one or more counters from Goldberry onto another target permanent you control. If you do, draw a card.","power":"1","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"});
const deathmist = (): CardDef => ({"oracleId":"a7d4f5aa-26d4-4363-aa5a-a26d6f791b82","name":"Deathmist Raptor","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Creature — Dinosaur Beast","supertypes":[],"types":["Creature"],"subtypes":["Dinosaur","Beast"],"oracleText":"Deathtouch\nWhenever a permanent you control is turned face up, you may return this card from your graveyard to the battlefield face up or face down.\nMegamorph {4}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Megamorph","Deathtouch"],"layout":"normal"});
const ravenloft = (): CardDef => ({"oracleId":"1822f924-51ba-4f81-92cc-6c5d741a33f9","name":"Ravenloft Adventurer","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Human Rogue Assassin","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue","Assassin"],"oracleText":"When this creature enters, you take the initiative.\nIf a creature an opponent controls would die, instead exile it and put a hit counter on it.\nWhenever this creature attacks, if you've completed a dungeon, defending player loses 1 life for each card they own in exile with a hit counter on it.","power":"3","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"});
const bounty = (): CardDef => ({"oracleId":"b6689782-08d8-48e1-a05d-cd040dfe85bc","name":"Curse of Bounty","manaCost":"{1}{G}","cmc":2,"typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nWhenever enchanted player is attacked, untap all nonland permanents you control. Each opponent attacking that player untaps all nonland permanents they control.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"layout":"normal"});

describe("round 307", () => {
  it("every card of the round compiles fully", () => supported(aminatou(), shelob(), vraska(), sothera(), goldberry(), deathmist(), ravenloft(), bounty()));
});

describe("round 307: Aminatou, the Fateshifter's −6", () => {
  const board = (s0: GameState, ap: PlayerId) => {
    const [b, c, d] = [leftOf(s0, ap), leftOf(s0, ap, 2), leftOf(s0, ap, 3)];
    const ami = putOnBattlefield(s0, ap, aminatou());
    s0.objects[ami]!.counters.loyalty = 6;
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test Mine" }));
    const myLand = putOnBattlefield(s0, ap, card("Test Land A", "Land"));
    const b1 = putOnBattlefield(s0, b, bear({ name: "Test B1" }));
    const bArt = putOnBattlefield(s0, b, card("Test B Rock", "Artifact", "{1}", { oracleText: "{T}: Add {C}." }));
    const bLand = putOnBattlefield(s0, b, card("Test Land B", "Land"));
    const c1 = putOnBattlefield(s0, c, bear({ name: "Test C1" }));
    const d1 = putOnBattlefield(s0, d, bear({ name: "Test D1", power: "7", toughness: "7" }));
    invalidateCharacteristics(s0);
    return { b, c, d, ami, mine, myLand, b1, bArt, bLand, c1, d1 };
  };

  it("left: each player gains control of the next player's nonland permanents to their left, all at once; Aminatou and lands stay", () => {
    const { s: s0, ap } = setup([]);
    const x = board(s0, ap);
    let s = run(s0, planActivate(s0, ap, x.ami, 2));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "direction", player: ap, options: ["left", "right"] });
    s = act(s, { type: "chooseOption", player: ap, choice: "left" });
    s = settle(s, ap);
    expect(s.stack.length).toBe(0);
    expect(ctl(s, x.b1)).toBe(ap);
    expect(ctl(s, x.bArt)).toBe(ap);
    expect(ctl(s, x.c1)).toBe(x.b);
    expect(ctl(s, x.d1)).toBe(x.c);
    expect(ctl(s, x.mine)).toBe(x.d);
    // Not Aminatou, and no land.
    expect(ctl(s, x.ami)).toBe(ap);
    expect(ctl(s, x.myLand)).toBe(ap);
    expect(ctl(s, x.bLand)).toBe(x.b);
  });

  it("right: the other way round; it lasts after Aminatou leaves; a player who has left the game has no seat", () => {
    const { s: s0, ap } = setup([]);
    const x = board(s0, ap);
    // C has left the game: B's next player to the right is you, D's is B.
    s0.players[x.c]!.lost = true;
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.owner === x.c) moveObject(s0, id, "exile");
    invalidateCharacteristics(s0);
    let s = run(s0, planActivate(s0, ap, x.ami, 2));
    s = settle(s, ap);
    s = act(s, { type: "chooseOption", player: ap, choice: "right" });
    s = settle(s, ap);
    // Right of you is D; right of D is B; right of B is you.
    expect(ctl(s, x.d1)).toBe(ap);
    expect(ctl(s, x.b1)).toBe(x.d);
    expect(ctl(s, x.mine)).toBe(x.b);
    // Aminatou gone: the control changes stay (rulings).
    moveObject(s, x.ami, "graveyard");
    invalidateCharacteristics(s);
    expect(ctl(s, x.d1)).toBe(ap);
    expect(ctl(s, x.mine)).toBe(x.b);
  });

  it("a bot picks the direction with more to take", () => {
    const { s: s0, ap } = setup([]);
    const x = board(s0, ap);
    let s = run(s0, planActivate(s0, ap, x.ami, 2));
    s = settle(s, ap);
    // D (to your right) has the 7/7.
    s = act(s, botActions(s, ap)[0]!);
    s = settle(s, ap);
    expect(ctl(s, x.d1)).toBe(ap);
  });

  it("a bot weighs the ultimate as the better side's permanents less all of its own", () => {
    const { s: s0, ap } = setup([]);
    const x = board(s0, ap);
    const body = compileCard(aminatou()).activated[2]!.body;
    expect(groupValue(s0, ap, body, undefined, x.ami)).toBeGreaterThan(0);
    // With a 9/9 of its own and nothing worth more next to it, it keeps it.
    putOnBattlefield(s0, ap, bear({ name: "Test Huge", power: "9", toughness: "9" }));
    invalidateCharacteristics(s0);
    expect(groupValue(s0, ap, body, undefined, x.ami)).toBeLessThan(0);
  });
});

describe("round 307: Shelob, Dread Weaver", () => {
  it("exiles the opponents' nontoken creatures that die; its {2}{B} puts a creature card exiled with it into its owner's graveyard as a cost", () => {
    const { s: s0, ap, opp } = setup([]);
    const sh = putOnBattlefield(s0, ap, shelob());
    const victim = putOnBattlefield(s0, opp, bear({ name: "Test Victim" }));
    const mineDies = putOnBattlefield(s0, ap, bear({ name: "Test Mine" }));
    invalidateCharacteristics(s0);
    moveObject(s0, victim, "graveyard");
    moveObject(s0, mineDies, "graveyard");
    let s = settle(s0, ap);
    expect(s.objects[victim]!.zone).toBe("exile");
    expect(s.objects[mineDies]!.zone).toBe("graveyard"); // only an opponent's
    s.players[ap]!.manaPool.B = 3;
    // No creature card exiled with it: the cost can't be paid with another card in exile.
    const other = putOnBattlefield(s, opp, bear({ name: "Test Other" }));
    moveObject(s, other, "exile");
    expect(planActivate(s, ap, sh, 0, undefined, undefined, undefined, undefined, { exileCards: [other] })).toBeNull();
    s = run(s, planActivate(s, ap, sh, 0, undefined, undefined, undefined, undefined, { exileCards: [victim] }));
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(victim);
    const hand = s.players[ap]!.hand.length;
    s = settle(s, ap);
    expect(s.objects[sh]!.counters["+1/+1"]).toBe(2);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("a bot pays with the cheapest creature card exiled with it", () => {
    const { s: s0, ap, opp } = setup([]);
    const sh = putOnBattlefield(s0, ap, shelob());
    const cheap = putOnBattlefield(s0, opp, bear({ name: "Test Cheap" }));
    const dear = putOnBattlefield(s0, opp, card("Test Dear", "Creature — Giant", "{6}", { power: "6", toughness: "6" }));
    invalidateCharacteristics(s0);
    moveObject(s0, cheap, "graveyard");
    moveObject(s0, dear, "graveyard");
    let s = settle(s0, ap);
    expect([s.objects[cheap]!.zone, s.objects[dear]!.zone]).toEqual(["exile", "exile"]);
    s.players[ap]!.manaPool.B = 3;
    const costs = abilityCosts(s, ap, s.objects[sh]!, compileCard(shelob()).activated[0]!, []);
    expect(costs?.exileCards).toEqual([cheap]);
    s = run(s, planActivate(s, ap, sh, 0, undefined, undefined, undefined, undefined, costs!));
    expect(s.objects[cheap]!.zone).toBe("graveyard");
    expect(s.objects[dear]!.zone).toBe("exile");
  });
});

describe("round 307: Vraska, the Silencer", () => {
  it("pay {1}: the creature card comes back tapped under your control as a Treasure artifact only, keeping its supertypes and abilities", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, vraska());
    const victim = putOnBattlefield(s0, opp, card("Test Legend", "Legendary Creature — Elf Druid", "{2}{G}", { power: "3", toughness: "3", supertypes: ["Legendary"], oracleText: "{T}: You gain 1 life." }));
    invalidateCharacteristics(s0);
    moveObject(s0, victim, "graveyard");
    s0.players[ap]!.manaPool.C = 1;
    let s = settle(s0, ap);
    expect(s.pending?.player).toBe(ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{1}" } });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, ap);
    const o = s.objects[victim]!;
    expect(o.zone).toBe("battlefield");
    expect(o.tapped).toBe(true);
    expect(ctl(s, victim)).toBe(ap);
    const c = characteristics(s, o);
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toEqual(["Treasure"]);
    expect(c.supertypes).toContain("Legendary");
    // Its own ability and the Treasure's: it isn't a creature, so it can tap for either right away.
    expect(abilitiesOf(s, o).activated.map((a) => a.text)).toEqual(["{T}: You gain 1 life."]);
    expect(abilitiesOf(s, o).mana).toHaveLength(1);
    expect(s.players[ap]!.manaPool.C ?? 0).toBe(0);
  });
});

describe("round 307: Sothera, the Supervoid", () => {
  it("whenever a creature you control dies, each opponent exiles a creature of their choice; at your end step, if a player controls no creatures, it's sacrificed and one comes back with two more +1/+1 counters", () => {
    const { s: s0, ap } = setup([]);
    const [b, c, d] = [leftOf(s0, ap), leftOf(s0, ap, 2), leftOf(s0, ap, 3)];
    const so = putOnBattlefield(s0, ap, sothera());
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test Mine" }));
    const b1 = putOnBattlefield(s0, b, bear({ name: "Test B1" }));
    const b2 = putOnBattlefield(s0, b, bear({ name: "Test B2", power: "5", toughness: "5" }));
    const c1 = putOnBattlefield(s0, c, card("Test C1", "Creature — Giant", "{5}", { power: "5", toughness: "5", oracleText: "This creature enters with a +1/+1 counter on it." }));
    // D controls no creatures.
    invalidateCharacteristics(s0);
    moveObject(s0, mine, "graveyard");
    let s = settle(s0, ap);
    // B (a bot) exiles its worst; C its only one; D has none.
    expect(s.objects[b1]!.zone).toBe("exile");
    expect(s.objects[b2]!.zone).toBe("battlefield");
    expect(s.objects[c1]!.zone).toBe("exile");
    expect(s.players[d]!.exile.length).toBe(0);
    // Your end step: D controls no creatures, so it's sacrificed and you put one of those cards onto the battlefield.
    for (let i = 0; i < 200 && !(s.step === "end" && s.activePlayer === ap && (s.pending || s.stack.length)); i++) s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
    s = settle(s, ap);
    expect(s.objects[so]!.zone).toBe("graveyard");
    if (s.pending) {
      expect(s.pending.player).toBe(ap);
      s = act(s, botActions(s, ap)[0]!);
      s = settle(s, ap);
    }
    const back = [b1, c1].find((id) => s.objects[id]!.zone === "battlefield")!;
    expect(back).toBeDefined();
    expect(ctl(s, back)).toBe(ap);
    // Two additional: the Giant has its own one too.
    expect(s.objects[back]!.counters["+1/+1"]).toBe(back === c1 ? 3 : 2);
  });

  it("no trigger at your end step while every player controls a creature", () => {
    const { s: s0, ap } = setup([]);
    const so = putOnBattlefield(s0, ap, sothera());
    for (const p of s0.turnOrder) putOnBattlefield(s0, p, bear({ name: `Test ${p}` }));
    invalidateCharacteristics(s0);
    let s = s0;
    let sawEnd = false;
    for (let i = 0; i < 300 && s.activePlayer === ap; i++) {
      sawEnd ||= s.step === "end";
      expect(s.stack.length).toBe(0);
      s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
    }
    expect(sawEnd).toBe(true);
    expect(s.objects[so]!.zone).toBe("battlefield");
  });
});

describe("round 307: Goldberry, River-Daughter", () => {
  it("{T}: one counter of each kind it doesn't have moves from the target onto it", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, goldberry());
    const from = putOnBattlefield(s0, ap, bear({ name: "Test Holder" }));
    s0.objects[from]!.counters = { "+1/+1": 3, charge: 2, oil: 1 };
    s0.objects[g]!.counters = { charge: 1 };
    invalidateCharacteristics(s0);
    let s = run(s0, planActivate(s0, ap, g, 0, [{ kind: "object", id: from } as T]));
    s = settle(s, ap);
    expect(s.objects[g]!.counters).toMatchObject({ charge: 1, "+1/+1": 1, oil: 1 });
    expect(s.objects[from]!.counters).toMatchObject({ "+1/+1": 2, charge: 2, oil: 0 });
  });

  it("{U}, {T}: one or more of its counters, chosen one at a time, onto the target; then a card", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, goldberry());
    const to = putOnBattlefield(s0, ap, bear({ name: "Test Receiver" }));
    s0.objects[g]!.counters = { "+1/+1": 2, oil: 1 };
    s0.players[ap]!.manaPool.U = 1;
    invalidateCharacteristics(s0);
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planActivate(s0, ap, g, 1, [{ kind: "object", id: to } as T]));
    s = settle(s, ap);
    // At least one: no "None" before the first.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "removeCounter", player: ap, options: ["+1/+1", "oil"] });
    s = act(s, { type: "chooseOption", player: ap, choice: "+1/+1" });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "removeCounter", options: ["+1/+1", "oil", "done"] });
    s = act(s, { type: "chooseOption", player: ap, choice: "oil" });
    s = act(s, { type: "chooseOption", player: ap, choice: "done" });
    s = settle(s, ap);
    expect(s.objects[g]!.counters).toMatchObject({ "+1/+1": 1, oil: 0 });
    expect(s.objects[to]!.counters).toMatchObject({ "+1/+1": 1, oil: 1 });
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("with no counters on it, nothing moves and no card is drawn", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, goldberry());
    const to = putOnBattlefield(s0, ap, bear({ name: "Test Receiver" }));
    s0.players[ap]!.manaPool.U = 1;
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planActivate(s0, ap, g, 1, [{ kind: "object", id: to } as T]));
    s = settle(s, ap);
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("round 307: Deathmist Raptor", () => {
  const morph = () => card("Test Morph", "Creature — Beast", "{4}{G}", { power: "4", toughness: "4", keywords: ["Morph"], oracleText: "Morph {1}{G}" });

  it("when a permanent you control is turned face up, it may come back from your graveyard face up", () => {
    const { s: s0, ap } = setup([]);
    const raptor = putOnBattlefield(s0, ap, deathmist());
    moveObject(s0, raptor, "graveyard");
    const m = putOnBattlefield(s0, ap, morph());
    s0.objects[m]!.faceDown = "morph";
    s0.players[ap]!.manaPool.G = 2;
    invalidateCharacteristics(s0);
    let s = act(s0, { type: "turnFaceUp", player: ap, objectId: m });
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
    if (s.pending?.kind !== "chooseOption") throw new Error();
    expect(s.pending.labels).toEqual(["Face up", "Face down"]);
    s = act(s, { type: "chooseOption", player: ap, choice: s.pending.options[0]! });
    s = settle(s, ap);
    const back = s.battlefield.find((id) => s.objects[id]!.cardId === s.objects[raptor]!.cardId || id === raptor)!;
    expect(back).toBeDefined();
    expect(s.objects[back]!.faceDown).toBeFalsy();
    expect(characteristics(s, s.objects[back]!).name).toBe("Deathmist Raptor");
  });

  it("face down it's a 2/2 that can be turned face up for its megamorph cost, with a +1/+1 counter; not from an opponent's turning one up", () => {
    const { s: s0, ap, opp } = setup([]);
    const raptor = putOnBattlefield(s0, ap, deathmist());
    moveObject(s0, raptor, "graveyard");
    const theirs = putOnBattlefield(s0, opp, morph());
    s0.objects[theirs]!.faceDown = "morph";
    const m = putOnBattlefield(s0, ap, morph());
    s0.objects[m]!.faceDown = "morph";
    invalidateCharacteristics(s0);
    s0.players[opp]!.manaPool.G = 2;
    let s = s0;
    // Turning it face up is a special action they take with priority (CR 116.2b).
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "turnFaceUp", player: opp, objectId: theirs });
    s = settle(s, ap);
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.graveyard).toContain(raptor);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s.players[ap]!.manaPool.G = 2;
    s = act(s, { type: "turnFaceUp", player: ap, objectId: m });
    s = settle(s, ap);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    if (s.pending?.kind !== "chooseOption") throw new Error();
    s = act(s, { type: "chooseOption", player: ap, choice: s.pending.options[1]! });
    s = settle(s, ap);
    const back = s.battlefield.find((id) => s.objects[id]!.faceDown && id !== m && id !== theirs)!;
    expect(back).toBeDefined();
    expect(characteristics(s, s.objects[back]!).power).toBe(2);
    s.players[ap]!.manaPool.G = 5;
    s = act(s, { type: "turnFaceUp", player: ap, objectId: back });
    s = settle(s, ap);
    expect(characteristics(s, s.objects[back]!).name).toBe("Deathmist Raptor");
    expect(s.objects[back]!.counters["+1/+1"]).toBe(1);
  });
});

describe("round 307: Ravenloft Adventurer", () => {
  it("an opponent's creature that would die is exiled with a hit counter; attacking with a dungeon completed, the defending player loses 1 life for each of their cards in exile with one", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, ravenloft());
    const v1 = putOnBattlefield(s0, opp, bear({ name: "Test V1" }));
    const v2 = putOnBattlefield(s0, opp, bear({ name: "Test V2" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test Mine" }));
    invalidateCharacteristics(s0);
    moveObject(s0, v1, "graveyard");
    moveObject(s0, v2, "graveyard");
    moveObject(s0, mine, "graveyard");
    expect([s0.objects[v1]!.zone, s0.objects[v2]!.zone]).toEqual(["exile", "exile"]);
    expect(s0.objects[v1]!.counters.hit).toBe(1);
    expect(s0.objects[mine]!.zone).toBe("graveyard"); // yours die as usual
    // Not before a dungeon is completed.
    let s = passUntil(s0, "declareAttackers", ap);
    const life = s.players[opp]!.life;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: opp }] } as Action);
    s = settle(s, ap);
    expect(s.players[opp]!.life).toBe(life);
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const r2 = putOnBattlefield(t0, ap2, ravenloft());
    const w = putOnBattlefield(t0, opp2, bear({ name: "Test W" }));
    const w2 = putOnBattlefield(t0, opp2, bear({ name: "Test W2" }));
    invalidateCharacteristics(t0);
    moveObject(t0, w, "graveyard");
    moveObject(t0, w2, "graveyard");
    t0.players[ap2]!.completedDungeons = ["Undercity"];
    let t = passUntil(t0, "declareAttackers", ap2);
    const life2 = t.players[opp2]!.life;
    t = act(t, { type: "declareAttackers", player: ap2, attacks: [{ attacker: r2, defender: opp2 }] } as Action);
    t = settle(t, ap2);
    expect(t.players[opp2]!.life).toBe(life2 - 2);
  });
});

describe("round 307: Curse of Bounty", () => {
  it("when the enchanted player is attacked, you untap your nonland permanents, and so does each opponent of yours attacking them", () => {
    const { s: s0, ap } = setup([]);
    const [b, c, d] = [leftOf(s0, ap), leftOf(s0, ap, 2), leftOf(s0, ap, 3)];
    const curse = putOnBattlefield(s0, ap, bounty());
    s0.objects[curse]!.attachedToPlayer = c;
    const myRock = putOnBattlefield(s0, ap, card("Test Rock A", "Artifact", "{1}", { oracleText: "{T}: Add {C}." }));
    const myLand = putOnBattlefield(s0, ap, card("Test Land A", "Land"));
    const attacker = putOnBattlefield(s0, b, bear({ name: "Test Attacker" }));
    const bRock = putOnBattlefield(s0, b, card("Test Rock B", "Artifact", "{1}", { oracleText: "{T}: Add {C}." }));
    const dRock = putOnBattlefield(s0, d, card("Test Rock D", "Artifact", "{1}", { oracleText: "{T}: Add {C}." }));
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", b);
    for (const id of [myRock, myLand, bRock, dRock]) s.objects[id]!.tapped = true;
    s = act(s, { type: "declareAttackers", player: b, attacks: [{ attacker, defender: c }] } as Action);
    s = settle(s, ap);
    expect(s.objects[myRock]!.tapped).toBeFalsy();
    expect(s.objects[myLand]!.tapped).toBe(true); // nonland only
    expect(s.objects[bRock]!.tapped).toBeFalsy(); // B is attacking C
    expect(s.objects[dRock]!.tapped).toBe(true); // D isn't
    expect(s.objects[attacker]!.tapped).toBeFalsy(); // its own attacker too: a nonland permanent B controls
  });
});
