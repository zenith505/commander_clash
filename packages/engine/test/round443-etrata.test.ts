// Round 443 (Lane A): Etrata, Deadly Fugitive ('Face-down creatures you control have "{2}{U}{B}: Turn this creature face
// up. If you can't, exile it, then you may cast the exiled card without paying its mana cost."' and "Whenever an Assassin
// you control deals combat damage to an opponent, cloak the top card of that player's library.": CR 708.8, 701.58,
// 609.3, 608.2g; rulings).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, botActions, characteristics, compileCard, compileGranted, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, waitingOn, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const etrata = (): CardDef => ({"oracleId":"87957d09-7e22-40fe-8770-ff66d1934a38","name":"Etrata, Deadly Fugitive","manaCost":"{1}{U}{B}","cmc":3,"typeLine":"Legendary Creature — Vampire Assassin","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire","Assassin"],"oracleText":"Deathtouch\nFace-down creatures you control have \"{2}{U}{B}: Turn this creature face up. If you can't, exile it, then you may cast the exiled card without paying its mana cost.\"\nWhenever an Assassin you control deals combat damage to an opponent, cloak the top card of that player's library.","power":"1","toughness":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Cloak","Deathtouch"],"commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const unable = (): CardDef => ({"oracleId":"3d240726-5214-4493-8537-29bf65db1e4b","name":"Unable to Scream","manaCost":"{U}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature loses all abilities and is a Toy artifact creature with base power and toughness 0/2 in addition to its other types.\nAs long as enchanted creature is face down, it can't be turned face up.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const angel = (): CardDef => ({"oracleId":"2f6e9ab8-6951-4c5f-bcde-0e96e0fe87f2","name":"Exalted Angel","manaCost":"{4}{W}{W}","cmc":6,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nWhenever this creature deals damage, you gain that much life.\nMorph {2}{W}{W} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)","power":"4","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Morph"],"commanderLegal":"legal","set":"v15","releasedAt":"2015-08-21","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const assassin = (): CardDef => ({"oracleId":"9ed6f28f-a3db-48c5-9ab0-b90a7fba5f57","name":"Royal Assassin","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Human Assassin","supertypes":[],"types":["Creature"],"subtypes":["Human","Assassin"],"oracleText":"{T}: Destroy target tapped creature.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const forestCard = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** A card of `def` face down (cloaked) on the battlefield under `pid`. */
const cloaked = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.faceDown = "cloak";
  invalidateCharacteristics(s);
  return id;
};
const FACE_UP = /^\{2\}\{U\}\{B\}: Turn ~ face up\./;
const faceUpIndex = (s: GameState, id: ObjectId) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => FACE_UP.test(a.text));
/** Activate the granted ability of face-down `id`, leaving it on the stack. */
const activateFaceUp = (s: GameState, pid: PlayerId, id: ObjectId) => {
  const i = faceUpIndex(s, id);
  expect(i).toBeGreaterThanOrEqual(0);
  const plan = planActivate(s, pid, id, i);
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
/** A bot with nothing else to do: no cards in hand, its commander out of the command zone. */
const idleBot = (s: GameState, pid: PlayerId) => {
  const p = s.players[pid]!;
  p.isBot = true;
  for (const id of [...p.hand, ...p.command]) s.objects[id]!.zone = "exile";
  p.exile.push(...p.hand, ...p.command);
  p.hand = [];
  p.command = [];
};
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};

describe("Etrata, Deadly Fugitive", () => {
  it("parse: the granted ability turns it face up, and if it can't, exiles it and lets the card be cast", () => {
    expect(isFullySupported(etrata())).toBe(true);
    const st = compileCard(etrata()).statics.find((x) => x.mods.some((m) => m.kind === "addAbility"));
    expect(st?.affects).toMatchObject({ kind: "filter", spec: { faceDown: true, controller: "you", types: ["Creature"] } });
    const text = st!.mods[0]!.kind === "addAbility" ? st!.mods[0]!.text : "";
    const g = compileGranted(text);
    expect(g.unsupported).toEqual([]);
    expect(g.activated[0]!.manaCost).toBe("{2}{U}{B}");
    expect(g.activated[0]!.body.effects).toEqual([
      { type: "turnFaceUp", what: { ref: "self" }, setDid: true },
      { type: "if", cond: { kind: "youDid" }, effects: [], otherwise: [{ type: "exileSelfCastFree" }] },
    ]);
    const t = compileCard(etrata()).triggers.find((x) => x.body.effects.some((e) => e.type === "dig"));
    expect(t?.body.effects).toEqual([expect.objectContaining({ type: "dig", into: "cloak", n: 1, count: 1, library: { ref: "eventPlayer" } })]);
  });

  it("only face-down creatures you control have it", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, etrata());
    const mine = cloaked(s, ap, giant());
    const theirs = cloaked(s, opp, giant());
    const up = putOnBattlefield(s, ap, bears());
    expect(faceUpIndex(s, mine)).toBeGreaterThanOrEqual(0);
    expect(faceUpIndex(s, theirs)).toBe(-1);
    expect(faceUpIndex(s, up)).toBe(-1);
  });

  it("a cloaked creature card is turned face up, no cost but the ability's: nothing exiled", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, etrata());
    const g = cloaked(s0, ap, giant());
    const s = settle(activateFaceUp(s0, ap, g));
    const o = s.objects[g]!;
    expect(o.zone).toBe("battlefield");
    expect(o.faceDown).toBeUndefined();
    expect(characteristics(s, o).name).toBe("Hill Giant");
    expect(logged(s, /is exiled/)).toBe(false);
  });

  it("a face-down morph creature is turned face up without paying its morph cost (CR 708.8)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, etrata());
    const a = putOnBattlefield(s0, ap, angel());
    s0.objects[a]!.faceDown = "morph";
    invalidateCharacteristics(s0);
    const s = settle(activateFaceUp(s0, ap, a));
    expect(s.objects[a]!.faceDown).toBeUndefined();
    expect(characteristics(s, s.objects[a]!).name).toBe("Exalted Angel");
    expect(logged(s, /turns a face-down permanent of .* face up: it's Exalted Angel/)).toBe(true);
  });

  it("a cloaked land card is turned face up too (only an instant or sorcery stays face down, CR 701.58g)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, etrata());
    const f = cloaked(s0, ap, forestCard());
    const s = settle(activateFaceUp(s0, ap, f));
    expect(s.objects[f]!.zone).toBe("battlefield");
    expect(s.objects[f]!.faceDown).toBeUndefined();
    expect(characteristics(s, s.objects[f]!).types).toEqual(["Land"]);
  });

  it("a cloaked instant is revealed and stays face down, so it's exiled and cast without paying its mana cost", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, etrata());
    const b = cloaked(s0, ap, bolt());
    const victim = putOnBattlefield(s0, opp, giant());
    let s = settle(activateFaceUp(s0, ap, b));
    expect(logged(s, /reveals the face-down permanent, Lightning Bolt, an instant card; it stays face down/)).toBe(true);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: b });
    const pool = { ...s.players[ap]!.manaPool };
    s = act(s, { type: "castSpell", player: ap, objectId: b, targets: [target(victim)] });
    expect(s.players[ap]!.manaPool).toEqual(pool); // without paying its mana cost
    s = settle(s);
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("a card another player owns that you cloaked: you may cast it, and it goes to its owner's graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, etrata());
    const b = cloaked(s0, opp, bolt());
    s0.objects[b]!.controller = ap;
    invalidateCharacteristics(s0);
    let s = settle(activateFaceUp(s0, ap, b));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: b });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "castSpell", player: ap, objectId: b, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(b);
  });

  it("declining the cast leaves the card in exile", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, etrata());
    const d = cloaked(s0, ap, divination());
    let s = settle(activateFaceUp(s0, ap, d));
    expect(s.pending?.kind).toBe("castFree");
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s);
    expect(s.objects[d]!.zone).toBe("exile");
    expect(s.pending).toBeNull();
  });

  it("a sorcery cast this way ignores timing: on another player's turn, as the ability resolves (CR 608.2g)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, etrata());
    const d = cloaked(s0, ap, divination());
    let s = passUntil(s0, "upkeep", opp);
    for (const id of s.battlefield) if (controllerOf(s, s.objects[id]!) === ap) s.objects[id]!.tapped = false;
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(waitingOn(s)).toBe(ap);
    s = settle(activateFaceUp(s, ap, d));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: d });
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "castSpell", player: ap, objectId: d }));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("a creature that can't be turned face up (Unable to Scream) is exiled and its card cast: it enters again", () => {
    const { s: s0, ap } = setup([]);
    const g = cloaked(s0, ap, giant());
    const aura = putOnBattlefield(s0, ap, unable());
    s0.objects[aura]!.attachedTo = g;
    // Etrata's later: its ability is given after Unable to Scream's "loses all abilities" (CR 613.7, layer 6).
    putOnBattlefield(s0, ap, etrata());
    invalidateCharacteristics(s0);
    expect(characteristics(s0, s0.objects[g]!).cantTurnFaceUp).toBe(true);
    let s = settle(activateFaceUp(s0, ap, g));
    expect(s.objects[g]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: g });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: g }));
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.objects[g]!.faceDown).toBeUndefined();
    expect(characteristics(s, s.objects[g]!).name).toBe("Hill Giant");
  });

  it("a creature turned face up in response can't be turned face up again: it's exiled, and its card may be cast (CR 609.3)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, etrata());
    const g = cloaked(s0, ap, giant());
    let s = activateFaceUp(s0, ap, g);
    // Turned face up as the ability waits on the stack (its mana-cost special action, CR 701.58b).
    s.objects[g]!.faceDown = undefined;
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.objects[g]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: g });
  });

  it("gone before it resolves: nothing is exiled or cast (CR 400.7)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, etrata());
    const g = cloaked(s0, ap, bolt());
    let s = activateFaceUp(s0, ap, g);
    s.battlefield.splice(s.battlefield.indexOf(g), 1);
    s.objects[g]!.zone = "graveyard";
    s.objects[g]!.faceDown = undefined;
    s.objects[g]!.zoneChanges = (s.objects[g]!.zoneChanges ?? 0) + 1;
    s.players[s.objects[g]!.owner]!.graveyard.push(g);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.pending).toBeNull();
  });

  it("an Assassin's combat damage to an opponent cloaks the top card of that player's library under your control", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, etrata());
    const ra = putOnBattlefield(s0, ap, assassin());
    const top = onTop(s0, opp, giant());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ra, defender: opp }] });
    for (let i = 0; i < 80 && !(s.step === "end" || s.step === "main2"); i++) {
      const pid = waitingOn(s)!;
      s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: pid, blocks: [] } : { type: "passPriority", player: pid });
    }
    const o = s.objects[top]!;
    expect(o.zone).toBe("battlefield");
    expect(o.faceDown).toBe("cloak");
    expect(o.owner).toBe(opp);
    expect(controllerOf(s, o)).toBe(ap);
    expect(characteristics(s, o).keywords).toContain("Ward");
    // And it has Etrata's ability: its controller's face-down creature.
    expect(faceUpIndex(s, top)).toBeGreaterThanOrEqual(0);
  });

  it("a non-Assassin's combat damage doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, etrata());
    const b = putOnBattlefield(s0, ap, bears());
    const top = onTop(s0, opp, giant());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 80 && !(s.step === "end" || s.step === "main2"); i++) {
      const pid = waitingOn(s)!;
      s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: pid, blocks: [] } : { type: "passPriority", player: pid });
    }
    expect(s.objects[top]!.zone).toBe("library");
  });

  it("the bot uses it in its second main phase: a cloaked instant can't be turned face up, so it's exiled and cast", () => {
    const { s: s0, ap, opp } = setup([]);
    idleBot(s0, ap);
    putOnBattlefield(s0, ap, etrata());
    const b = cloaked(s0, ap, bolt());
    const victim = putOnBattlefield(s0, opp, giant());
    let s = passUntil(s0, "main2", ap);
    for (let i = 0; i < 12 && s.step === "main2" && s.objects[b]!.zone !== "graveyard"; i++) {
      for (const x of botActions(s, waitingOn(s)!)) s = act(s, x);
      s = settle(s);
    }
    expect(logged(s, /Lightning Bolt is exiled/)).toBe(true);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.log.some((l) => /casts Lightning Bolt/.test(l.text))).toBe(true);
    expect(s.objects[victim]!.zone).toBe("graveyard");
  });

});
