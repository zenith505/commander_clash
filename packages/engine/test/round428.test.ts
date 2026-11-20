// Round 428: Ninja Teen's level 3 (sneak given to the creature cards in your graveyard, and a permission to cast them from
// there using their sneak abilities, CR 702.190a) and Dynaheir, Invoker Adept (activating other creatures' abilities as
// though they had haste, CR 302.6; a copy of the next ability you spend four or more mana to activate, CR 603.7, 707.10).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup } from "./helpers";
import { altCostsFor, applyAction, botActions, castProblem, graveyardWays, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const teen = (): CardDef => ({"oracleId":"2c5044ff-a303-4276-8e23-7caac30a275b","name":"Ninja Teen","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment — Class","supertypes":[],"types":["Enchantment"],"subtypes":["Class"],"oracleText":"(Gain the next level as a sorcery to add its ability.)\nWhenever a creature you control leaves the battlefield, each opponent loses 1 life.\n{1}{B}: Level 2\nCreatures you control get +1/+0 and have menace.\n{B}: Level 3\nCreature cards in your graveyard have sneak {3}{B}.\nYou may cast creature spells from your graveyard using their sneak abilities.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/0825a28f-f60b-4f80-83e3-cad6f9b266ce.jpg?1783904106","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/0825a28f-f60b-4f80-83e3-cad6f9b266ce.jpg?1783904106","commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"rare","layout":"class","gameChanger":false}) as CardDef;
const dyn = (): CardDef => ({"oracleId":"a968524a-3d2d-4c0c-8f66-bfbfb9ff3c36","name":"Dynaheir, Invoker Adept","manaCost":"{1}{U}{R}{W}","cmc":4,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Haste\nYou may activate abilities of other creatures you control as though those creatures had haste.\n{T}: When you next activate an ability that isn't a mana ability this turn by spending four or more mana to activate it, copy that ability. You may choose new targets for the copy.","power":"4","toughness":"4","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09541c8e-5a75-4833-aa9c-b90834f9b242.jpg?1783922628","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09541c8e-5a75-4833-aa9c-b90834f9b242.jpg?1783922628","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tome = (): CardDef => ({"oracleId":"39ee576a-0803-4063-9c84-f2b537e4d44c","name":"Jayemdae Tome","manaCost":"{4}","cmc":4,"typeLine":"Artifact — Book","supertypes":[],"types":["Artifact"],"subtypes":["Book"],"oracleText":"{4}, {T}: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cac8c421-5b92-481d-b2de-560c0231ab58.jpg?1783948664","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cac8c421-5b92-481d-b2de-560c0231ab58.jpg?1783948664","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const enc = (): CardDef => ({"oracleId":"d91ea728-2d69-42cb-bb5d-e2b058f0d7b1","name":"Arcane Encyclopedia","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Book","supertypes":[],"types":["Artifact"],"subtypes":["Book"],"oracleText":"{3}, {T}: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/0/00ff4cb8-a0e0-4527-a77d-03394065ffe0.jpg?1783922682","artUrl":"https://cards.scryfall.io/art_crop/front/0/0/00ff4cb8-a0e0-4527-a77d-03394065ffe0.jpg?1783922682","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const helix = (): CardDef => ({"oracleId":"9ddc5a06-b4e1-459a-9e39-7cd1aa994fe1","name":"Helix Pinnacle","manaCost":"{G}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Shroud (This enchantment can't be the target of spells or abilities.)\n{X}: Put X tower counters on this enchantment.\nAt the beginning of your upkeep, if there are 100 or more tower counters on this enchantment, you win the game.","colors":["G"],"colorIdentity":["G"],"keywords":["Shroud"],"imageUrl":"https://cards.scryfall.io/normal/front/6/c/6c9d51b0-21d4-40e3-91cd-b9d7b6365dda.jpg?1783904336","artUrl":"https://cards.scryfall.io/art_crop/front/6/c/6c9d51b0-21d4-40e3-91cd-b9d7b6365dda.jpg?1783904336","commanderLegal":"legal","set":"spg","releasedAt":"2026-01-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const sorc = (): CardDef => ({"oracleId":"5e961d15-5972-4e4b-9385-1cd7cd7c6bbe","name":"Prodigal Sorcerer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard Sorcerer","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard","Sorcerer"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const leo = (): CardDef => ({"oracleId":"348c7e22-2179-41b8-a5d2-8dd488e7e66d","name":"Leonardo, Leader in Blue","manaCost":"{W}","cmc":1,"typeLine":"Legendary Creature — Mutant Ninja Turtle","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Mutant","Ninja","Turtle"],"oracleText":"Sneak {3}{W}{W} (You may cast this spell for {3}{W}{W} if you also return an unblocked attacker you control to hand during the declare blockers step. He enters tapped and attacking.)\nWhen Leonardo enters, if his sneak cost was paid, creatures you control get +2/+0 until end of turn.\n{1}{W}: Leonardo gains first strike until end of turn.","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Sneak"],"imageUrl":"https://cards.scryfall.io/normal/front/d/6/d6eaae35-d513-43d8-be2d-b97c15e25937.jpg?1783904123","artUrl":"https://cards.scryfall.io/art_crop/front/d/6/d6eaae35-d513-43d8-be2d-b97c15e25937.jpg?1783904123","commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ogre = (): CardDef => ({"oracleId":"83c8a3a6-2e1a-4e26-8847-6d066f42d906","name":"Gray Ogre","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Ogre","supertypes":[],"types":["Creature"],"subtypes":["Ogre"],"oracleText":"","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));
const noBlocks = (s: GameState) => {
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  while (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return settle(s);
};
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
const level = (s: GameState, id: string, n: number) => {
  s.objects[id]!.classLevel = n;
  invalidateCharacteristics(s);
};

describe("round 428: compiles", () => {
  it("every card of the round", () => supported(teen(), dyn()));
});

describe("Ninja Teen", () => {
  const prep = (n: number) => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, teen());
    level(s0, t, n);
    const b = putOnBattlefield(s0, ap, bear());
    const g = toYard(s0, ap, giant());
    return { s0, ap, opp, t, b, g };
  };

  it("level 3: a creature card in your graveyard is cast for sneak {3}{B} during your declare blockers step, tapped and attacking", () => {
    const { s0, ap, opp, b, g } = prep(3);
    expect(graveyardWays(s0, s0.objects[g]!, ap).some((w) => w.kind === "permission" && w.alt === "sneak")).toBe(true);
    // Not before the declare blockers step (CR 702.190a, rulings: the permission doesn't change when).
    expect(castProblem(s0, ap, g, undefined, undefined, undefined, undefined, undefined, { via: "permission", alt: "grantedSneak" })).toMatch(/declare blockers/);
    // Not for its mana cost from there: only using a sneak ability.
    let s = noBlocks(attack(s0, ap, [{ attacker: b, defender: opp }]));
    expect(s.step).toBe("declareBlockers");
    expect(castProblem(s, ap, g, undefined, undefined, undefined, undefined, undefined, { via: "permission" })).toMatch(/sneak/);
    expect(altCostsFor(s, ap, s.objects[g]!).some((a) => a.kind === "grantedSneak" && a.mana === "{3}{B}")).toBe(true);
    const plan = planCast(s, ap, g, undefined, undefined, "auto", undefined, { via: "permission", alt: "grantedSneak", returnToHand: [b] });
    expect(castProblem(s, ap, g, undefined, undefined, undefined, undefined, undefined, { via: "permission", alt: "grantedSneak", returnToHand: [b] })).toMatch(/not enough mana/);
    expect(plan).toBeTruthy();
    expect(plan!.filter((a) => a.type === "activateMana")).toHaveLength(4);
    s = settle(run(s, plan));
    expect(s.objects[b]!.zone).toBe("hand");
    const o = s.objects[g]!;
    expect(o.zone).toBe("battlefield");
    expect(o.tapped).toBe(true);
    expect(o.attacking).toBe(opp);
    // A 4/3 with the level 2 bonus ("as long as this Class is level N or greater", CR 716.2a).
    const life = s.players[opp]!.life;
    s = settle(passUntil(s, "main2", ap));
    expect(s.players[opp]!.life).toBe(life - 4);
  });

  it("below level 3, or with a blocked attacker only, it can't be cast from the graveyard", () => {
    for (const n of [1, 2]) {
      const { s0, ap, opp, b, g } = prep(n);
      const s = noBlocks(attack(s0, ap, [{ attacker: b, defender: opp }]));
      expect(graveyardWays(s, s.objects[g]!, ap).some((w) => w.alt === "sneak")).toBe(false);
      expect(planCast(s, ap, g, undefined, undefined, "auto", undefined, { via: "permission", alt: "grantedSneak", returnToHand: [b] })).toBeNull();
    }
    const { s0, ap, opp, b, g } = prep(3);
    // Two blockers: the bear has menace at level 2 and up.
    const blocker = putOnBattlefield(s0, opp, bear({ name: "Blocker" }));
    const blocker2 = putOnBattlefield(s0, opp, bear({ name: "Second Blocker" }));
    let s = attack(s0, ap, [{ attacker: b, defender: opp }]);
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    while (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: s.pending.player === opp ? [{ blocker, attacker: b }, { blocker: blocker2, attacker: b }] : [] });
    s = settle(s);
    expect(planCast(s, ap, g, undefined, undefined, "auto", undefined, { via: "permission", alt: "grantedSneak", returnToHand: [b] })).toBeNull();
  });

  it("a card with sneak of its own may use either sneak cost (rulings)", () => {
    const { s0, ap, opp, b } = prep(3);
    const l = toYard(s0, ap, leo());
    const s = noBlocks(attack(s0, ap, [{ attacker: b, defender: opp }]));
    const kinds = altCostsFor(s, ap, s.objects[l]!).map((a) => a.kind);
    expect(kinds).toContain("sneak");
    expect(kinds).toContain("grantedSneak");
    // Its own {3}{W}{W}, or {3}{B} from Ninja Teen.
    const own = planCast(s, ap, l, undefined, undefined, "auto", undefined, { via: "permission", alt: "sneak", returnToHand: [b] });
    const given = planCast(s, ap, l, undefined, undefined, "auto", undefined, { via: "permission", alt: "grantedSneak", returnToHand: [b] });
    expect(own).toBeTruthy();
    expect(given).toBeTruthy();
    const t = settle(run(structuredClone(s), own));
    expect(t.objects[l]!.zone).toBe("battlefield");
    expect(t.objects[l]!.attacking).toBe(opp);
  });

  it("a creature card in an opponent's graveyard isn't in yours", () => {
    const { s0, ap, opp, b } = prep(3);
    const theirs = toYard(s0, opp, giant());
    const s = noBlocks(attack(s0, ap, [{ attacker: b, defender: opp }]));
    expect(planCast(s, ap, theirs, undefined, undefined, "auto", undefined, { via: "permission", alt: "grantedSneak", returnToHand: [b] })).toBeNull();
  });

  it("a bot sneaks a creature card from its graveyard in for an unblocked token attacker", () => {
    const { s0, ap, opp, b, g } = prep(3);
    // A token attacker (worth less than the card).
    s0.objects[b]!.isToken = true;
    let s = noBlocks(attack(s0, ap, [{ attacker: b, defender: opp }]));
    // Priority back to the attacker in the declare blockers step.
    for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "castSpell" && a.objectId === g)).toBe(true);
  });
});

describe("Dynaheir, Invoker Adept", () => {
  it("other creatures' {T} abilities can be activated the turn they come under your control; its own needs haste (it has it)", () => {
    const { s: s0, ap, opp } = setup([]);
    const sorcerer = putOnBattlefield(s0, ap, sorc(), { sick: true });
    expect(planActivate(s0, ap, sorcerer, 0, [{ kind: "player", id: opp }])).toBeNull();
    putOnBattlefield(s0, ap, dyn(), { sick: true });
    const s = settle(run(s0, planActivate(s0, ap, sorcerer, 0, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(s0.players[opp]!.life - 1);
    // The sorcerer doesn't gain haste (rulings).
    expect(s.objects[sorcerer]!.controlledSinceTurn).toBe(s.turn);
  });

  it("an opponent's creature isn't covered", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, dyn());
    const theirs = putOnBattlefield(s0, opp, sorc(), { sick: true });
    expect(planActivate(s0, opp, theirs, 0, [{ kind: "player", id: ap }])).toBeNull();
  });

  it("copies the next ability you spend four or more mana to activate this turn; one with less doesn't use it up", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, dyn());
    const e = putOnBattlefield(s0, ap, enc());
    const t = putOnBattlefield(s0, ap, tome());
    let s = settle(run(s0, planActivate(s0, ap, d, 0)));
    expect(s.nextCast?.some((x) => x.minManaSpent === 4)).toBe(true);
    const hand0 = s.players[ap]!.hand.length;
    // Arcane Encyclopedia: three mana, no copy.
    s = settle(run(s, planActivate(s, ap, e, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand0 + 1);
    expect(s.nextCast?.some((x) => x.minManaSpent === 4)).toBe(true);
    // Jayemdae Tome: four mana, copied: two cards.
    s = settle(run(s, planActivate(s, ap, t, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand0 + 3);
    expect(s.nextCast?.some((x) => x.minManaSpent === 4) ?? false).toBe(false);
  });

  it("mana spent on {X} counts: Helix Pinnacle with X=4 is copied; mana abilities don't use it up", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, dyn());
    const h = putOnBattlefield(s0, ap, helix());
    let s = settle(run(s0, planActivate(s0, ap, d, 0)));
    const isle = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Island" && !s.objects[id]!.tapped)!;
    s = act(s, { type: "activateMana", player: ap, objectId: isle, mana: "U" });
    expect(s.nextCast?.some((x) => x.minManaSpent === 4)).toBe(true);
    s = settle(run(s, planActivate(s, ap, h, 0, undefined, undefined, undefined, 4)));
    expect(s.objects[h]!.counters.tower).toBe(8);
  });

  it("lasts only this turn, and a bot activates it only with a big enough ability to use", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, dyn());
    expect(botActions(s0, ap).some((a) => a.type === "activateAbility" && a.objectId === d)).toBe(false);
    let s = settle(run(s0, planActivate(s0, ap, d, 0)));
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(s.nextCast?.some((x) => x.minManaSpent === 4) ?? false).toBe(false);
  });
});
