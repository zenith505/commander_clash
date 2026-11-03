// Round 259: the top of the popularity list. Dog Umbra (umbra armor or "can't attack or block" by who controls the
// creature), Colfenor's Urn (cards ever exiled with it, then back at an end step), Earthshape (earthbend, then creatures
// with power up to that land's), Temporal Extortion (any player may pay half their life to counter it), Onakke Oathkeeper
// (an attack tax only on your planeswalkers), Iron Mastiff (a d20 for each player being attacked, the highest kept),
// Ultimate Magic: Meteor (cast from exile: an artifact or land chosen for each opponent, destroyed), Rat King,
// Verminister (a creature card and all cards with its name from your graveyard) and Golden Guardian (returns transformed
// when it dies that turn).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, attackTax, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** The opponents in turn order, starting with the next player (APNAP order on your turn). */
const opps = (s: GameState, ap: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % s.turnOrder.length]!);
const answerBot = (s: GameState) => botActions(s, s.pending!.player).reduce((x, a) => act(x, a), s);
const named = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;

// Real oracle text (Scryfall).
const dogUmbra = (): CardDef => ({"oracleId":"e475c96f-6cf8-4139-92fd-f68ecaae4893","name":"Dog Umbra","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Flash\nEnchant creature\nAs long as another player controls enchanted creature, it can't attack or block. Otherwise, this Aura has umbra armor. (If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura.)","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant","Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/8/d/8d4ba710-eddb-40ca-b2fe-0e4e778aab9c.jpg?1783911304","artUrl":"https://cards.scryfall.io/art_crop/front/8/d/8d4ba710-eddb-40ca-b2fe-0e4e778aab9c.jpg?1783911304","commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const urn = (): CardDef => ({"oracleId":"920c4df3-9517-44cd-8304-28b1ef69d60e","name":"Colfenor's Urn","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever a creature with toughness 4 or greater is put into your graveyard from the battlefield, you may exile it.\nAt the beginning of the end step, if three or more cards have been exiled with this artifact, sacrifice it. If you do, return those cards to the battlefield under their owner's control.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/1/419fea28-3813-4e65-8b90-6d335fdf0a0b.jpg?1783942851","artUrl":"https://cards.scryfall.io/art_crop/front/4/1/419fea28-3813-4e65-8b90-6d335fdf0a0b.jpg?1783942851","commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const earthshape = (): CardDef => ({"oracleId":"300f17a2-1594-40cb-9187-952898a83622","name":"Earthshape","manaCost":"{2}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Earthbend 3. Then each creature you control with power less than or equal to that land's power gains hexproof and indestructible until end of turn. You gain hexproof until end of turn.","colors":["W"],"colorIdentity":["W"],"keywords":["Earthbend"],"imageUrl":"https://cards.scryfall.io/normal/front/d/8/d873c678-c8f2-40f0-ab03-a2fdf5187aea.jpg?1783904839","artUrl":"https://cards.scryfall.io/art_crop/front/d/8/d873c678-c8f2-40f0-ab03-a2fdf5187aea.jpg?1783904839","commanderLegal":"legal","set":"tle","releasedAt":"2025-11-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const extortion = (): CardDef => ({"oracleId":"13da5255-2fc5-43a4-a44c-13a5d9ff77c3","name":"Temporal Extortion","manaCost":"{B}{B}{B}{B}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"When you cast this spell, any player may pay half their life, rounded up. If a player does, counter Temporal Extortion.\nTake an extra turn after this one.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/33da3281-1cf1-41ac-841a-e01521642779.jpg?1788710716","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/33da3281-1cf1-41ac-841a-e01521642779.jpg?1788710716","commanderLegal":"legal","set":"sld","releasedAt":"2025-06-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const onakke = (): CardDef => ({"oracleId":"080df9eb-c26b-494a-96b4-d7e47e501866","name":"Onakke Oathkeeper","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Ogre Spirit","supertypes":[],"types":["Creature"],"subtypes":["Ogre","Spirit"],"oracleText":"Creatures can't attack planeswalkers you control unless their controller pays {1} for each creature they control that's attacking a planeswalker you control.\n{4}{W}{W}, Exile this card from your graveyard: Return target planeswalker card from your graveyard to the battlefield.","power":"0","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/3/2340093f-a8b2-4bd7-b7bf-32ddede628b1.jpg?1783915474","artUrl":"https://cards.scryfall.io/art_crop/front/2/3/2340093f-a8b2-4bd7-b7bf-32ddede628b1.jpg?1783915474","commanderLegal":"legal","set":"cmm","releasedAt":"2023-08-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mastiff = (): CardDef => ({"oracleId":"6d00e24f-c89f-49fa-869e-d788021aa084","name":"Iron Mastiff","manaCost":"{4}","cmc":4,"typeLine":"Artifact Creature — Dog","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Dog"],"oracleText":"Whenever this creature attacks, roll a d20 for each player being attacked and ignore all but the highest roll.\n1—9 | This creature deals damage equal to its power to you.\n10—19 | This creature deals damage equal to its power to defending player.\n20 | This creature deals damage equal to its power to each opponent.","power":"4","toughness":"4","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/9/d9633151-d704-42a4-b1c6-66446bf48bee.jpg?1783922674","artUrl":"https://cards.scryfall.io/art_crop/front/d/9/d9633151-d704-42a4-b1c6-66446bf48bee.jpg?1783922674","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const meteor = (): CardDef => ({"oracleId":"31cc5d9d-9384-4a9b-ba7f-6a4edbcb7a35","name":"Ultimate Magic: Meteor","manaCost":"{5}{R}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Ultimate Magic: Meteor deals 7 damage to each creature. If this spell was cast from exile, for each opponent, choose an artifact or land that player controls. Destroy the chosen permanents.\nForetell {5}{R} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)","colors":["R"],"colorIdentity":["R"],"keywords":["Foretell"],"imageUrl":"https://cards.scryfall.io/normal/front/b/5/b5b0f0fd-574a-4ae7-ab55-b815112d6b3a.jpg?1783906353","artUrl":"https://cards.scryfall.io/art_crop/front/b/5/b5b0f0fd-574a-4ae7-ab55-b815112d6b3a.jpg?1783906353","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ratKing = (): CardDef => ({"oracleId":"a5656dab-5ce6-48fd-9eae-2c06969bb8df","name":"Rat King, Verminister","manaCost":"{1}{B}","cmc":2,"typeLine":"Legendary Creature — Rat Avatar","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Rat","Avatar"],"oracleText":"Disappear — At the beginning of your end step, if a permanent left the battlefield under your control this turn, create a 1/1 black Rat creature token and put a +1/+1 counter on Rat King.\n{T}, Sacrifice three Rats: Return target creature card and all other cards with the same name as that card from your graveyard to the battlefield tapped.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Disappear"],"imageUrl":"https://cards.scryfall.io/normal/front/b/e/be464d88-8933-46e8-97b0-3be05f1976a3.jpg?1783904102","artUrl":"https://cards.scryfall.io/art_crop/front/b/e/be464d88-8933-46e8-97b0-3be05f1976a3.jpg?1783904102","commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const guardian = (): CardDef => ({"oracleId":"58afb897-4d57-4b53-a5c3-b532cb3d5180","name":"Golden Guardian // Gold-Forge Garrison","manaCost":"{4}","cmc":4,"typeLine":"Artifact Creature — Golem // Land","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"Defender\n{2}: This creature fights another target creature you control. When this creature dies this turn, return it to the battlefield transformed under your control.","power":"4","toughness":"4","colors":[],"colorIdentity":[],"keywords":["Transform","Fight","Defender"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/3/9/397ba02d-f347-46f7-b028-dd4ba55faa2f.jpg?1783935270","artUrl":"https://cards.scryfall.io/art_crop/front/3/9/397ba02d-f347-46f7-b028-dd4ba55faa2f.jpg?1783935270","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Golden Guardian","manaCost":"{4}","typeLine":"Artifact Creature — Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"Defender\n{2}: This creature fights another target creature you control. When this creature dies this turn, return it to the battlefield transformed under your control.","power":"4","toughness":"4","colors":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/9/397ba02d-f347-46f7-b028-dd4ba55faa2f.jpg?1783935270","artUrl":"https://cards.scryfall.io/art_crop/front/3/9/397ba02d-f347-46f7-b028-dd4ba55faa2f.jpg?1783935270"},{"name":"Gold-Forge Garrison","manaCost":"","typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"(Transforms from Golden Guardian.)\n{T}: Add two mana of any one color.\n{4}, {T}: Create a 4/4 colorless Golem artifact creature token.","colors":[],"imageUrl":"https://cards.scryfall.io/normal/back/3/9/397ba02d-f347-46f7-b028-dd4ba55faa2f.jpg?1783935270","artUrl":"https://cards.scryfall.io/art_crop/back/3/9/397ba02d-f347-46f7-b028-dd4ba55faa2f.jpg?1783935270"}]}) as CardDef;

const golem = card("Test Golem", "Artifact Creature — Golem", "{3}", { cmc: 3, power: "3", toughness: "3" });
const giant = card("Test Giant", "Creature — Giant", "{4}{G}", { cmc: 5, power: "5", toughness: "5" });
const tower = card("Test Tower", "Creature — Wall", "{3}", { cmc: 3, power: "0", toughness: "4" });
const relic = card("Test Relic", "Artifact", "{2}", { cmc: 2 });
const walker = card("Test Walker", "Legendary Planeswalker — Testy", "{2}{U}{U}", { cmc: 4, colors: ["U"], loyalty: "3", oracleText: "+1: Draw a card." });
const rat = card("Test Rat", "Creature — Rat", "{B}", { cmc: 1, power: "1", toughness: "1" });
const wastes = card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });

describe("round 259", () => {
  it("every card of the round compiles fully", () => {
    supported(dogUmbra(), urn(), earthshape(), extortion(), onakke(), mastiff(), meteor(), ratKing(), guardian());
  });
});

describe("Dog Umbra", () => {
  const umbra = (theirs: boolean) => {
    const { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, theirs ? opp : ap, bear());
    const a = putOnBattlefield(s, ap, dogUmbra());
    s.objects[a]!.attachedTo = b;
    invalidateCharacteristics(s);
    return { s, ap, opp, b, a };
  };
  it("on your own creature it has umbra armor: the Aura is destroyed instead and the damage is removed", () => {
    const { s: s0, b, a } = umbra(false);
    expect(objHasKeyword(s0, s0.objects[a]!, "Umbra armor")).toBe(true);
    expect(characteristics(s0, s0.objects[b]!).cantAttack).toBeFalsy();
    s0.objects[b]!.damage = 2;
    invalidateCharacteristics(s0);
    const s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    expect(zone(s, b)).toBe("battlefield");
    expect(s.objects[b]!.damage).toBe(0);
    expect(zone(s, a)).toBe("graveyard");
  });
  it("on another player's creature: it can't attack or block, and there's no umbra armor to save it", () => {
    const { s: s0, b, a } = umbra(true);
    expect(objHasKeyword(s0, s0.objects[a]!, "Umbra armor")).toBe(false);
    const ch = characteristics(s0, s0.objects[b]!);
    expect([ch.cantAttack, ch.cantBlock]).toEqual([true, true]);
    s0.objects[b]!.damage = 2;
    invalidateCharacteristics(s0);
    const s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, a)).toBe("graveyard");
  });
  it("checked continuously: when you gain control of the creature it stops being restricted and the Aura gains umbra armor", () => {
    const { s, ap, b, a } = umbra(true);
    s.objects[b]!.controller = ap;
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[a]!, "Umbra armor")).toBe(true);
    expect(characteristics(s, s.objects[b]!).cantAttack).toBe(false);
  });
});

describe("Colfenor's Urn", () => {
  /** You control the Urn and three creatures with toughness 4 or greater (one of them the opponent's card you control). */
  const withUrn = () => {
    const { s, ap, opp } = setup([]);
    const u = putOnBattlefield(s, ap, urn());
    const big = [putOnBattlefield(s, ap, giant), putOnBattlefield(s, ap, tower), putOnBattlefield(s, ap, giant)];
    const small = putOnBattlefield(s, ap, bear());
    return { s, ap, opp, u, big, small };
  };
  /** Kill these creatures with damage and answer each "you may exile it" with `yes`. */
  const kill = (s: GameState, ap: PlayerId, ids: ObjectId[], yes = true) => {
    for (const id of ids) s.objects[id]!.damage = 10;
    invalidateCharacteristics(s);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 20; i++) {
      s = settle(s);
      if (s.pending?.kind !== "chooseMay") break;
      expect(s.pending.player).toBe(ap);
      s = act(s, { type: "chooseMay", player: ap, yes });
    }
    return settle(s);
  };
  it("a creature with toughness 4 or more put into your graveyard may be exiled; a smaller one doesn't trigger", () => {
    const { s: s0, ap, big, small } = withUrn();
    let s = kill(s0, ap, [big[0]!, small]);
    expect(zone(s, big[0]!)).toBe("exile");
    expect(zone(s, small)).toBe("graveyard");
    s = kill(s, ap, [big[1]!], false);
    expect(zone(s, big[1]!)).toBe("graveyard");
  });
  it("at the beginning of the end step with three or more cards exiled with it, it's sacrificed and they return under their owners' control", () => {
    const { s: s0, ap, u, big } = withUrn();
    let s = kill(s0, ap, big);
    expect(big.every((id) => zone(s, id) === "exile")).toBe(true);
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(zone(s, u)).toBe("graveyard");
    for (const id of big) {
      expect(zone(s, id)).toBe("battlefield");
      expect(controllerOf(s, s.objects[id]!)).toBe(ap);
    }
  });
  it("with fewer than three nothing happens; any player's end step counts", () => {
    const { s: s0, ap, opp, u, big } = withUrn();
    let s = kill(s0, ap, big.slice(0, 2));
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, u)).toBe("battlefield");
    s = kill(s, ap, [big[2]!]);
    s = settle(passUntil(s, "end", opp));
    expect(zone(s, u)).toBe("graveyard");
    expect(big.every((id) => zone(s, id) === "battlefield")).toBe(true);
  });
  it("counts every card it ever exiled (rulings), but only the ones still in exile come back", () => {
    const { s: s0, ap, u, big } = withUrn();
    let s = kill(s0, ap, big);
    // One of them leaves exile before the end step.
    const gone = s.objects[big[0]!]!;
    s.players[ap]!.exile.splice(s.players[ap]!.exile.indexOf(big[0]!), 1);
    gone.zone = "graveyard";
    gone.zoneChanges = (gone.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(big[0]!);
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, u)).toBe("graveyard");
    expect(zone(s, big[0]!)).toBe("graveyard");
    expect([zone(s, big[1]!), zone(s, big[2]!)]).toEqual(["battlefield", "battlefield"]);
  });
  it("a creature card you own that dies under an opponent's control goes to your graveyard, so it triggers too", () => {
    const { s: s0, ap, opp } = withUrn();
    const mine = putOnBattlefield(s0, ap, giant);
    s0.objects[mine]!.controller = opp;
    const theirs = putOnBattlefield(s0, opp, giant);
    const s = kill(s0, ap, [mine, theirs]);
    expect(zone(s, mine)).toBe("exile");
    expect(zone(s, theirs)).toBe("graveyard");
  });
});

describe("Earthshape", () => {
  const shape = () => {
    const { s, ap, ids } = setup([earthshape()]);
    const land = putOnBattlefield(s, ap, wastes);
    const small = putOnBattlefield(s, ap, bear());
    const big = putOnBattlefield(s, ap, card("Test Ogre", "Creature — Ogre", "{3}{R}", { power: "4", toughness: "4" }));
    return { s, ap, ids, land, small, big };
  };
  it("earthbend 3, then each creature you control with power up to that land's gains hexproof and indestructible; you gain hexproof", () => {
    const { s: s0, ap, ids, land, small, big } = shape();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(land)])));
    expect([power(s, s.objects[land]!), toughness(s, s.objects[land]!)]).toEqual([3, 3]);
    for (const id of [land, small]) {
      expect(objHasKeyword(s, s.objects[id]!, "Hexproof"), named(s, id)).toBe(true);
      expect(objHasKeyword(s, s.objects[id]!, "Indestructible"), named(s, id)).toBe(true);
    }
    expect(objHasKeyword(s, s.objects[big]!, "Hexproof")).toBe(false);
    expect(s.players[ap]!.gained).toContain("Hexproof");
  });
  it("a land already bigger counts with its power as it is then", () => {
    const { s: s0, ap, ids, land, big } = shape();
    s0.objects[land]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(land)])));
    expect(power(s, s.objects[land]!)).toBe(4);
    expect(objHasKeyword(s, s.objects[big]!, "Indestructible")).toBe(true);
  });
});

describe("Temporal Extortion", () => {
  const extort = () => {
    const { s, ap, ids } = setup([extortion()]);
    s.players[ap]!.manaPool.B = 4;
    return { s, ap, ids };
  };
  it("as it's cast, each player in turn order may pay half their life, rounded up; if one does, it's countered", () => {
    const { s: s0, ap, ids } = extort();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const [o1, o2, o3] = opps(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: ap });
    if (s.pending?.kind !== "chooseOption") return;
    expect(s.pending.labels).toEqual(["Pay half your life, rounded up", "Don't"]);
    expect(s.pending.prompt).toMatch(/If anyone does, counter Temporal Extortion/);
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(s.pending).toMatchObject({ player: o1 });
    s.players[o2!]!.life = 39;
    s = act(s, { type: "chooseOption", player: o1!, choice: "none" });
    expect(s.pending).toMatchObject({ player: o2 });
    s = act(s, { type: "chooseOption", player: o2!, choice: "0" });
    // The others still get the option (rulings).
    expect(s.pending).toMatchObject({ player: o3 });
    s = settle(act(s, { type: "chooseOption", player: o3!, choice: "none" }));
    expect(s.players[o2!]!.life).toBe(19);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.extraTurns ?? []).toHaveLength(0);
  });
  it("if no one pays, it resolves: an extra turn", () => {
    const { s: s0, ap, ids } = extort();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 4 && s.pending?.kind === "chooseOption"; i++) s = settle(act(s, { type: "chooseOption", player: s.pending.player, choice: "none" }));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.extraTurns ?? []).toHaveLength(1);
  });
  it("bots don't pay half their life; a player who can't lose life can't pay", () => {
    const { s: s0, ap, ids } = extort();
    const [o1, o2] = opps(s0, ap);
    s0.players[o1!]!.lifeCantChange = true;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    // The first opponent has nothing to choose (CR 119.8); the next one is a bot that keeps its life.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: o2 });
    expect(botActions(s, o2!)).toEqual([{ type: "chooseOption", player: o2, choice: "none" }]);
  });
});

describe("Onakke Oathkeeper", () => {
  it("creatures attacking your planeswalkers cost {1} each; attacking you is free", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, onakke());
    const pw = putOnBattlefield(s, ap, walker);
    const a1 = putOnBattlefield(s, opp, bear());
    const a2 = putOnBattlefield(s, opp, bear());
    expect(attackTax(s, [{ attacker: a1, defender: ap }])).toBe(0);
    expect(attackTax(s, [{ attacker: a1, defender: ap, planeswalker: pw }])).toBe(1);
    expect(attackTax(s, [{ attacker: a1, defender: ap, planeswalker: pw }, { attacker: a2, defender: ap, planeswalker: pw }])).toBe(2);
  });
  it("its controller's opponents can't attack its planeswalkers without paying", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, onakke());
    const pw = putOnBattlefield(s0, ap, walker);
    s0.objects[pw]!.counters.loyalty = 3;
    const a1 = putOnBattlefield(s0, opp, bear());
    let s = passUntil(s0, "declareAttackers", opp);
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: a1, defender: ap, planeswalker: pw }] })).toThrow();
    s.players[opp]!.manaPool.C = 1;
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: a1, defender: ap, planeswalker: pw }] });
    expect(s.objects[a1]!.attacking).toBe(ap);
    expect(s.players[opp]!.manaPool.C ?? 0).toBe(0);
  });
});

describe("Iron Mastiff", () => {
  /** The Mastiff attacks the first opponent; with `two`, a bear attacks the second. */
  const attack = (seed: number, two = false) => {
    const { s: s0, ap } = setup([]);
    const [o1, o2] = opps(s0, ap);
    const m = putOnBattlefield(s0, ap, mastiff());
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s.rngState = seed;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: m, defender: o1! }, ...(two ? [{ attacker: b, defender: o2! }] : [])] });
    const life = s.players.map((p) => p.life);
    s = settle(s);
    const roll = s.log.map((l) => /rolls (?:a d20|2 d20) for Iron Mastiff: (\d+)(?: \((\d+), (\d+), 1 ignored\))?\./.exec(l.text)).find((x) => x);
    return { s, ap, o1: o1!, o2: o2!, life, roll };
  };
  it("rolls one d20 for one player attacked; 1-9 hurts you, 10-19 the defending player, 20 each opponent", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      const { s, ap, o1, o2, life, roll } = attack(seed);
      expect(roll).toBeTruthy();
      expect(roll![2]).toBeUndefined();
      const r = Number(roll![1]);
      const lost = s.players.map((p, i) => life[i]! - p.life);
      if (r <= 9) expect([lost[ap], lost[o1], lost[o2]]).toEqual([4, 0, 0]);
      else if (r <= 19) expect([lost[ap], lost[o1], lost[o2]]).toEqual([0, 4, 0]);
      else expect([lost[ap], lost[o1], lost[o2]]).toEqual([0, 4, 4]);
      seen.add(r <= 9 ? "low" : r <= 19 ? "mid" : "top");
    }
    expect(seen.has("low") && seen.has("mid")).toBe(true);
  });
  it("two players attacked: two dice, only the highest counts", () => {
    for (let seed = 1; seed < 20; seed++) {
      const { s, ap, o1, life, roll } = attack(seed, true);
      expect(roll![2]).toBeDefined();
      const [r, a, b] = [Number(roll![1]), Number(roll![2]), Number(roll![3])];
      expect(r).toBe(Math.max(a, b));
      if (r <= 9) expect(life[ap]! - s.players[ap]!.life).toBe(4);
      else expect(life[o1]! - s.players[o1]!.life).toBe(4);
    }
  });
});

describe("Ultimate Magic: Meteor", () => {
  const board = () => {
    const { s, ap, ids } = setup([meteor()]);
    const [o1, o2, o3] = opps(s, ap);
    // The third opponent has no artifact or land, so nothing is chosen for them.
    const perms = { relic1: putOnBattlefield(s, o1!, relic), land1: putOnBattlefield(s, o1!, wastes), relic2: putOnBattlefield(s, o2!, relic), giant: putOnBattlefield(s, o3!, giant), mine: putOnBattlefield(s, ap, bear()) };
    return { s, ap, ids, o1: o1!, perms };
  };
  it("cast from your hand: 7 damage to each creature and nothing more", () => {
    const { s: s0, ap, ids, perms } = board();
    s0.players[ap]!.manaPool.R = 6;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect([zone(s, perms.giant), zone(s, perms.mine)]).toEqual(["graveyard", "graveyard"]);
    expect([zone(s, perms.relic1), zone(s, perms.land1), zone(s, perms.relic2)]).toEqual(["battlefield", "battlefield", "battlefield"]);
  });
  it("cast from exile (foretold): you choose an artifact or land of each opponent, not targeted, and they're destroyed", () => {
    const { s: s0, ap, ids, o1, perms } = board();
    s0.players[ap]!.manaPool.C = 2;
    let s = act(s0, { type: "foretell", player: ap, objectId: ids[0]! });
    expect(zone(s, ids[0]!)).toBe("exile");
    s = passUntil(s, "upkeep", o1);
    s = passUntil(s, "main1", ap);
    s.players[ap]!.manaPool.R = 6;
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "foretell" })));
    // The first opponent has two to choose from; the second has one, chosen with no question; the third has none.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, of: o1, count: 1 });
    if (s.pending?.kind !== "pickPermanents") return;
    expect([...s.pending.options].sort()).toEqual([perms.relic1, perms.land1].sort());
    expect(s.pending.prompt).toMatch(/destroys the chosen permanents/);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [perms.land1] }));
    expect(s.pending).toBeNull();
    expect([zone(s, perms.land1), zone(s, perms.relic2), zone(s, perms.relic1)]).toEqual(["graveyard", "graveyard", "battlefield"]);
    expect(zone(s, perms.giant)).toBe("graveyard");
  });
  it("a bot picks for each opponent", () => {
    const { s: s0, ap, ids, o1 } = board();
    s0.players[ap]!.manaPool.C = 2;
    let s = act(s0, { type: "foretell", player: ap, objectId: ids[0]! });
    s = passUntil(passUntil(s, "upkeep", o1), "main1", ap);
    s.players[ap]!.manaPool.R = 6;
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "foretell" })));
    s = settle(answerBot(s));
    expect(s.pending).toBeNull();
    expect(s.log.filter((l) => /is destroyed|destroys/.test(l.text)).length).toBeGreaterThan(0);
  });
});

describe("Rat King, Verminister", () => {
  const rats = () => {
    const { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, ratKing());
    const fodder = [putOnBattlefield(s, ap, rat), putOnBattlefield(s, ap, rat), putOnBattlefield(s, ap, rat)];
    const g = [into(s, ap, giant, "graveyard"), into(s, ap, giant, "graveyard")];
    const other = into(s, ap, tower, "graveyard");
    return { s, ap, k, fodder, g, other };
  };
  it("sacrifice three Rats: the target creature card and every other card with its name return to the battlefield tapped", () => {
    const { s: s0, ap, k, fodder, g, other } = rats();
    const s = settle(run(s0, planActivate(s0, ap, k, 0, [tgt(g[0]!)], undefined, undefined, undefined, { sacrifice: fodder })));
    expect(fodder.every((id) => zone(s, id) === "graveyard")).toBe(true);
    for (const id of g) {
      expect(zone(s, id)).toBe("battlefield");
      expect(s.objects[id]!.tapped).toBe(true);
      expect(controllerOf(s, s.objects[id]!)).toBe(ap);
    }
    expect(zone(s, other)).toBe("graveyard");
  });
  it("Rats sacrificed for the cost come back too when they share the target's name", () => {
    const { s: s0, ap, k, fodder } = rats();
    const deadRat = into(s0, ap, rat, "graveyard");
    const s = settle(run(s0, planActivate(s0, ap, k, 0, [tgt(deadRat)], undefined, undefined, undefined, { sacrifice: fodder })));
    for (const id of [deadRat, ...fodder]) expect(zone(s, id)).toBe("battlefield");
  });
  it("nothing returns if the target is gone", () => {
    const { s: s0, ap, k, fodder, g } = rats();
    let s = run(s0, planActivate(s0, ap, k, 0, [tgt(g[0]!)], undefined, undefined, undefined, { sacrifice: fodder }));
    const o = s.objects[g[0]!]!;
    s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(g[0]!), 1);
    o.zone = "exile";
    o.zoneChanges = (o.zoneChanges ?? 0) + 1;
    s.players[ap]!.exile.push(g[0]!);
    s = settle(s);
    expect(zone(s, g[1]!)).toBe("graveyard");
  });
});

describe("Golden Guardian", () => {
  const guard = () => {
    const { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, guardian());
    const big = putOnBattlefield(s, ap, giant);
    const small = putOnBattlefield(s, ap, bear());
    return { s, ap, g, big, small };
  };
  it("fights another creature you control; when it dies this turn it returns transformed into Gold-Forge Garrison", () => {
    const { s: s0, ap, g, big } = guard();
    s0.players[ap]!.manaPool.C = 2;
    const s = settle(run(s0, planActivate(s0, ap, g, 0, [tgt(big)])));
    expect(zone(s, g)).toBe("battlefield");
    expect(named(s, g)).toBe("Gold-Forge Garrison");
    expect(characteristics(s, s.objects[g]!).types).toEqual(["Land"]);
    expect(controllerOf(s, s.objects[g]!)).toBe(ap);
    expect(s.objects[big]!.damage).toBe(4);
  });
  it("it returns if it dies any other way later that turn", () => {
    const { s: s0, ap, g, small } = guard();
    s0.players[ap]!.manaPool.C = 2;
    let s = settle(run(s0, planActivate(s0, ap, g, 0, [tgt(small)])));
    expect(zone(s, small)).toBe("graveyard");
    expect(named(s, g)).toBe("Golden Guardian");
    s.objects[g]!.damage = 4;
    invalidateCharacteristics(s);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, g)).toBe("battlefield");
    expect(named(s, g)).toBe("Gold-Forge Garrison");
  });
  it("not on a later turn", () => {
    const { s: s0, ap, g, small } = guard();
    s0.players[ap]!.manaPool.C = 2;
    let s = settle(run(s0, planActivate(s0, ap, g, 0, [tgt(small)])));
    s = passUntil(s, "upkeep", opps(s, ap)[0]);
    s.objects[g]!.damage = 4;
    invalidateCharacteristics(s);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, g)).toBe("graveyard");
  });
});
