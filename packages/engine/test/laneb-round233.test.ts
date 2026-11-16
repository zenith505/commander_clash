// Lane B round B233: Memory Vampire (mill any number of target players, collect evidence 9, cast a nonland card from the
// defending player's graveyard), Riddles in the Dark (a face-down and a face-up pile, an opponent picks the one for your
// hand), Oracle en-Vec (an opponent's chosen creatures attack during their next turn, the others can't) and A Killer Among
// Us (a creature type chosen secretly, revealed to pump an attacking token).

import { describe, expect, it } from "vitest";
import { act, addEffect, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, botActions, invalidateCharacteristics, objHasKeyword, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const memoryVampire = (): CardDef => ({"oracleId":"6031d854-10a8-43da-b5c4-b561194bcd4e","name":"Memory Vampire","manaCost":"{4}{U}{B}","cmc":6,"typeLine":"Creature — Vampire Detective","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Detective"],"oracleText":"Flying\nWhenever this creature deals combat damage to a player, any number of target players each mill that many cards. Then you may collect evidence 9. When you do, you may cast target nonland card from defending player's graveyard without paying its mana cost.","power":"4","toughness":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Flying","Collect evidence","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/5/d/5d0704a4-8961-43f5-86ed-3f7b43abcf26.jpg?1783912573","artUrl":"https://cards.scryfall.io/art_crop/front/5/d/5d0704a4-8961-43f5-86ed-3f7b43abcf26.jpg?1783912573","commanderLegal":"legal","set":"clu","releasedAt":"2024-02-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const riddles = (): CardDef => ({"oracleId":"78bed291-0ec7-466f-bc7a-9dae7d0b56ae","name":"Riddles in the Dark","manaCost":"{2}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Look at the top four cards of your library and separate them into a face-down pile and a face-up pile. An opponent chooses one of the piles. Put that pile into your hand and the other into your graveyard.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/6/a6129286-7437-4ba4-be55-586a22cd67ca.jpg?1783902787","artUrl":"https://cards.scryfall.io/art_crop/front/a/6/a6129286-7437-4ba4-be55-586a22cd67ca.jpg?1783902787","commanderLegal":"legal","set":"hob","releasedAt":"2026-08-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const oracleEnVec = (): CardDef => ({"oracleId":"367faa8c-617a-41a0-901c-f65106e86d56","name":"Oracle en-Vec","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: Target opponent chooses any number of creatures they control. During that player's next turn, the chosen creatures attack if able, and other creatures can't attack. At the beginning of that turn's end step, destroy each of the chosen creatures that didn't attack this turn. Activate only during your turn.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/c/cc538730-c46c-4e5f-bc1f-0efb7765086d.jpg?1783946664","artUrl":"https://cards.scryfall.io/art_crop/front/c/c/cc538730-c46c-4e5f-bc1f-0efb7765086d.jpg?1783946664","commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const killer = (): CardDef => ({"oracleId":"79d577a8-53c0-4220-bc0e-70764d72d5fd","name":"A Killer Among Us","manaCost":"{4}{G}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, create a 1/1 white Human creature token, a 1/1 blue Merfolk creature token, and a 1/1 red Goblin creature token. Then secretly choose Human, Merfolk, or Goblin.\nSacrifice this enchantment, Reveal the creature type you chose: If target attacking creature token is the chosen type, put three +1/+1 counters on it and it gains deathtouch until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c1392c5-91a5-4e6e-803d-ed032e4d594b.jpg?1783912865","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c1392c5-91a5-4e6e-803d-ed032e4d594b.jpg?1783912865","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or `me` has a question. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const nextOf = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % s.turnOrder.length]!;
/** A copy of `def` in `pid`'s hand, graveyard or library (on top). */
const inZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;

/** `pid`'s creatures attack `defender`; no blocks; then on until `me` has a question or the combat damage step's triggers are done. */
const attack = (s0: GameState, pid: PlayerId, attackers: string[], defender: PlayerId, me?: PlayerId) => {
  let s = passUntil(s0, "declareAttackers", pid);
  s = act(s, { type: "declareAttackers", player: pid, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 60 && s.step !== "combatDamage"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("Lane B round B233", () => {
  it("are fully supported", () => {
    supported(memoryVampire(), riddles(), oracleEnVec(), killer());
  });

  it("Memory Vampire: any number of target players mill that many; then evidence 9 lets you cast a nonland card from the defending player's graveyard free", () => {
    const { s: s0, ap, opp } = setup([]);
    const vamp = putOnBattlefield(s0, ap, memoryVampire());
    const other = nextOf(s0, opp);
    const div = inZone(s0, opp, divination(), "graveyard");
    const land = inZone(s0, opp, s0.cards[s0.objects[s0.players[opp]!.library[0]!]!.cardId]!, "graveyard");
    expect(s0.cards[s0.objects[land]!.cardId]!.name).toBe("Forest");
    const evidence = [hillGiant(), hillGiant(), lightningBolt(), lightningBolt()].map((d) => inZone(s0, ap, d, "graveyard"));
    const yours = inZone(s0, ap, divination(), "graveyard");
    s0.players[ap]!.hand = [];
    const libs = s0.turnOrder.map((p) => s0.players[p]!.library.length);
    let s = attack(s0, ap, [vamp], opp, ap);
    // The trigger's targets: any number of players (here the defending player and another opponent).
    const p = s.pending;
    if (p?.kind !== "chooseTargets") throw new Error(JSON.stringify(p));
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }, { kind: "player", id: other }] });
    s = settle(s, ap);
    expect(s.players[opp]!.life).toBe(36);
    expect(s.players[opp]!.library.length).toBe(libs[s0.turnOrder.indexOf(opp)]! - 4);
    expect(s.players[other]!.library.length).toBe(libs[s0.turnOrder.indexOf(other)]! - 4);
    expect(s.players[ap]!.library.length).toBe(libs[s0.turnOrder.indexOf(ap)]!);
    // Collect evidence 9: two Hill Giants (8) aren't enough, a Bolt more is.
    expect(s.pending).toMatchObject({ kind: "collectEvidence", player: ap, n: 9 });
    expect(() => act(s, { type: "collectEvidence", player: ap, ids: evidence.slice(0, 2) })).toThrow();
    s = act(s, { type: "collectEvidence", player: ap, ids: evidence.slice(0, 3) });
    expect(evidence.slice(0, 3).map((id) => zone(s, id))).toEqual(["exile", "exile", "exile"]);
    // The reflexive trigger's target: a nonland card in the defending player's graveyard, not a land, not one of yours.
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(land)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(yours)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(div)] });
    s = settle(s, ap);
    // "You may cast": yes, without paying its mana cost; Divination draws you two and goes to its owner's graveyard.
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: div });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: div }), ap);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand.length).toBe(2);
    expect(zone(s, div)).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(div);
  });

  it("Memory Vampire: no targets is fine; without mana value 9 in your graveyard you aren't asked and nothing is cast", () => {
    const { s: s0, ap, opp } = setup([]);
    const vamp = putOnBattlefield(s0, ap, memoryVampire());
    const div = inZone(s0, opp, divination(), "graveyard");
    [hillGiant(), hillGiant()].forEach((d) => inZone(s0, ap, d, "graveyard"));
    const libs = s0.turnOrder.map((p) => s0.players[p]!.library.length);
    let s = attack(s0, ap, [vamp], opp, ap);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [] });
    s = settle(s, ap);
    expect(s.pending).toBeNull();
    expect(s.turnOrder.map((p) => s.players[p]!.library.length)).toEqual(libs);
    expect(zone(s, div)).toBe("graveyard");
  });

  it("Riddles in the Dark: you look at the top four and separate them; an opponent you choose picks the pile for your hand, the other goes to your graveyard", () => {
    const { s: s0, ap, ids } = setup([riddles()]);
    const top = s0.players[ap]!.library.slice(0, 4);
    const fifth = s0.players[ap]!.library[4]!;
    const before = s0.log.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    const o = nextOf(s, ap);
    s = act(s, { type: "chooseOption", player: ap, choice: String(o) });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, piles: true, min: 0, max: 4 });
    expect(s.log.slice(before).map((l) => l.text).join("\n")).toContain("looks at the top 4 cards of their library");
    s = act(s, { type: "searchLibrary", player: ap, found: [top[0]!] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: o, what: "pile", pileMode: "faceDown", piles: [[top[0]], [top[1], top[2], top[3]]] });
    s = settle(act(s, { type: "chooseOption", player: o, choice: "1" }), ap);
    expect([top[1], top[2], top[3]].map((id) => zone(s, id!))).toEqual(["hand", "hand", "hand"]);
    expect(zone(s, top[0]!)).toBe("graveyard");
    expect(zone(s, fifth)).toBe("library");
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

describe("Lane B round B233: Oracle en-Vec", () => {
  it("is fully supported, and only during your turn", () => {
    supported(oracleEnVec(), killer());
    const { s: s0, ap, opp } = setup([]);
    const oracle = putOnBattlefield(s0, ap, oracleEnVec());
    let s = passUntil(s0, "main1", opp);
    for (let i = 0; i < 8 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(waitingOn(s)).toBe(ap);
    expect(abilityProblem(s, ap, oracle, 0, [{ kind: "player", id: opp }])).toBe("Oracle en-Vec's ability can't be activated now");
  });

  /** Oracle en-Vec activated by `ap` at `opp`, who chooses `pick` of their three Grizzly Bears; then on to `opp`'s declare attackers step (or their main phase). */
  const chosen = (pick: number[], tapAtTheirTurn: number[] = [], toCombat = true) => {
    const { s: s0, ap, opp } = setup([]);
    const oracle = putOnBattlefield(s0, ap, oracleEnVec());
    const bears = [0, 1, 2].map(() => putOnBattlefield(s0, opp, grizzlyBears()));
    let s = run(s0, planActivate(s0, ap, oracle, 0, [{ kind: "player", id: opp }]));
    s = settle(s, opp);
    const p = s.pending;
    if (p?.kind !== "pickPermanents" || p.player !== opp) throw new Error(JSON.stringify(p));
    expect([...p.options].sort()).toEqual([...bears].sort());
    s = settle(act(s, { type: "pickPermanents", player: opp, ids: pick.map((i) => bears[i]!) }), opp);
    expect(s.pending).toBeNull();
    s = passUntil(s, "main1", opp);
    for (const i of tapAtTheirTurn) s.objects[bears[i]!]!.tapped = true;
    if (toCombat) s = passUntil(s, "declareAttackers", opp);
    return { s, ap, opp, bears };
  };

  it("during that player's next turn the chosen creatures attack if able and the others can't; none is destroyed when all attacked", () => {
    const { s, ap, opp, bears } = chosen([0, 1]);
    const at = (ids: string[]) => () => act(s, { type: "declareAttackers", player: opp, attacks: ids.map((attacker) => ({ attacker, defender: ap })) });
    // The unchosen one can't attack; both chosen ones must.
    expect(at([bears[0]!, bears[1]!, bears[2]!])).toThrow();
    expect(at([])).toThrow();
    expect(at([bears[0]!])).toThrow();
    let x = at([bears[0]!, bears[1]!])();
    x = passUntil(x, "cleanup", opp);
    expect(bears.map((id) => zone(x, id))).toEqual(["battlefield", "battlefield", "battlefield"]);
    // Over after that turn: on their following turn the third one may attack, and the others needn't.
    x = passUntil(passUntil(x, "upkeep", ap), "declareAttackers", opp);
    expect(x.chosenAttackers).toBeUndefined();
    const later = act(x, { type: "declareAttackers", player: opp, attacks: [{ attacker: bears[2]!, defender: ap }] });
    expect(later.objects[bears[2]!]!.attacking).toBe(ap);
  });

  it("a bot that is that player attacks with the chosen creature and not with the others", () => {
    const { s, opp, bears } = chosen([0]);
    const decl = botActions(s, opp).find((a) => a.type === "declareAttackers");
    if (decl?.type !== "declareAttackers") throw new Error("no declaration");
    expect(decl.attacks.map((a) => a.attacker)).toEqual([bears[0]]);
  });

  it("a chosen creature that couldn't attack is destroyed as that turn's end step begins; the unchosen one isn't", () => {
    const { s, ap, opp, bears } = chosen([0, 1], [1]);
    let x = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: bears[0]!, defender: ap }] });
    x = passUntil(x, "end", opp);
    x = settle(x);
    expect(bears.map((id) => zone(x, id))).toEqual(["battlefield", "graveyard", "battlefield"]);
    expect(x.log.some((l) => l.text.includes("Oracle en-Vec destroys Grizzly Bears, which didn't attack this turn."))).toBe(true);
  });

  it("with none chosen, no creature can attack during that turn, and nothing is destroyed; a bot chooses none", () => {
    const { s, opp, bears } = chosen([], [], false);
    // No creature could attack: no attackers are declared (CR 508.8), and the turn goes on to its end step.
    const turn = s.turn;
    let x = passUntil(s, "endCombat", opp);
    expect(x.turn).toBe(turn);
    expect(bears.some((id) => x.objects[id]!.attackedTurns?.includes(turn))).toBe(false);
    x = settle(passUntil(x, "end", opp));
    expect(bears.map((id) => zone(x, id))).toEqual(["battlefield", "battlefield", "battlefield"]);

    const { s: s0, ap: ap1, opp: opp1 } = setup([]);
    const oracle = putOnBattlefield(s0, ap1, oracleEnVec());
    putOnBattlefield(s0, opp1, grizzlyBears());
    let y = run(s0, planActivate(s0, ap1, oracle, 0, [{ kind: "player", id: opp1 }]));
    y = settle(y, ap1);
    expect(y.pending).toBeNull();
    expect(Object.values(y.chosenAttackers ?? {})).toEqual([{ player: opp1, sinceTurn: y.turn, chosen: [], source: "Oracle en-Vec" }]);
  });
});

describe("Lane B round B233: A Killer Among Us", () => {
  /** Cast it, choose `type` secretly, then on to our next turn's declare blockers step with the Human and Merfolk tokens attacking. */
  const attacking = (type: string) => {
    const { s: s0, ap, ids, opp } = setup([killer()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    const before = s.log.length;
    const tokens = (x: GameState, name: string) => x.battlefield.filter((id) => x.cards[x.objects[id]!.cardId]!.name === `${name} Token`);
    expect(["Human", "Merfolk", "Goblin"].map((n) => tokens(s, n).length)).toEqual([1, 1, 1]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "secretType", options: ["Human", "Merfolk", "Goblin"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: type }), ap);
    expect(s.objects[ids[0]!]!.secretType).toMatchObject({ type, by: ap });
    // The choice stays secret: the log says only that a type was chosen.
    const said = s.log.slice(before).map((l) => l.text).join("\n");
    expect(said).toContain("secretly chooses a creature type for A Killer Among Us");
    expect(said).not.toContain(type);
    s = passUntil(passUntil(s, "upkeep", opp), "declareAttackers", ap);
    const human = tokens(s, "Human")[0]!;
    const merfolk = tokens(s, "Merfolk")[0]!;
    const goblin = tokens(s, "Goblin")[0]!;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [human, merfolk].map((attacker) => ({ attacker, defender: opp })) });
    for (let i = 0; i < 40 && !(s.step === "declareBlockers" && !s.pending && waitingOn(s) === ap); i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return { s, ap, opp, killer: ids[0]!, human, merfolk, goblin };
  };

  it("revealed and sacrificed: the target attacking token gets three +1/+1 counters and deathtouch only if it's the chosen type", () => {
    const { s, ap, killer: k, human, merfolk, goblin } = attacking("Merfolk");
    // Only an attacking creature token can be the target.
    expect(planActivate(s, ap, k, 0, [tgt(goblin)])).toBeNull();
    const before = s.log.length;
    const yes = settle(run(s, planActivate(s, ap, k, 0, [tgt(merfolk)])), ap);
    expect(zone(yes, k)).toBe("graveyard");
    expect(pt(yes, merfolk)).toBe("4/4");
    expect(objHasKeyword(yes, yes.objects[merfolk]!, "Deathtouch")).toBe(true);
    expect(yes.log.slice(before).map((l) => l.text).join("\n")).toContain("reveals the creature type chosen for A Killer Among Us: Merfolk");
    // The Human isn't the chosen type: nothing, and the enchantment is gone all the same.
    const no = settle(run(s, planActivate(s, ap, k, 0, [tgt(human)])), ap);
    expect(zone(no, k)).toBe("graveyard");
    expect(pt(no, human)).toBe("1/1");
    expect(objHasKeyword(no, no.objects[human]!, "Deathtouch")).toBe(false);
  });

  it("only the player who chose can reveal it: another player who gains control of it can't activate it", () => {
    const { s, ap, opp, killer: k, merfolk } = attacking("Merfolk");
    addEffect(s, opp, [k], [{ kind: "control" }], "game");
    expect(abilityProblem(s, opp, k, 0, [tgt(merfolk)])).toMatch(/only the player who secretly chose/);
    expect(abilityProblem(s, ap, k, 0, [tgt(merfolk)])).toMatch(/don't control/);
  });
});
