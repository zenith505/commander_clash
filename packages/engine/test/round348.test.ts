// Round 348 (Lane A): Dack Fayden's emblem (gain control of the permanents a spell you cast targets), Everquill Phoenix (a
// red artifact token named Feather with an ability of its own) and Firesong and Sunspeaker (red instant and sorcery spells
// with lifelink, and life gained because a white instant or sorcery spell resolves).

import { describe, expect, it } from "vitest";
import { act, bear, forest, passAll, passUntil, plainsCard, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, isFullySupported, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

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
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const nameOf = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
/** A copy of `def` in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};

// Real oracle text (Scryfall).
const dack = (): CardDef => ({"oracleId":"9d4b1e44-3c66-4b1b-8a1d-308aa4f841f8","name":"Dack Fayden","manaCost":"{1}{U}{R}","cmc":3,"typeLine":"Legendary Planeswalker — Dack","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Dack"],"oracleText":"+1: Target player draws two cards, then discards two cards.\n−2: Gain control of target artifact.\n−6: You get an emblem with \"Whenever you cast a spell that targets one or more permanents, gain control of those permanents.\"","loyalty":"3","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"commanderLegal":"legal","set":"sld","releasedAt":"2024-05-13","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const phoenix = (): CardDef => ({"oracleId":"56ba78c1-d1eb-4cc1-b70d-98c35d2972ba","name":"Everquill Phoenix","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Creature — Phoenix","supertypes":[],"types":["Creature"],"subtypes":["Phoenix"],"oracleText":"Mutate {3}{R} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)\nFlying\nWhenever this creature mutates, create a red artifact token named Feather with \"{1}, Sacrifice this token: Return target Phoenix card from your graveyard to the battlefield tapped.\"","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Mutate"],"commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"rare","layout":"mutate","gameChanger":false}) as CardDef;
const firesong = (): CardDef => ({"oracleId":"fffaa634-42a0-4038-b027-24f28754fec7","name":"Firesong and Sunspeaker","manaCost":"{4}{R}{W}","cmc":6,"typeLine":"Legendary Creature — Minotaur Cleric","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Minotaur","Cleric"],"oracleText":"Red instant and sorcery spells you control have lifelink.\nWhenever a white instant or sorcery spell causes you to gain life, Firesong and Sunspeaker deals 3 damage to target creature or player.","power":"4","toughness":"6","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"commanderLegal":"legal","set":"mul","releasedAt":"2023-04-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const balm = (): CardDef => ({"oracleId":"1f493e26-a556-4ca0-bb44-5408800ccf82","name":"Soothing Balm","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target player gains 5 life.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const helix = (): CardDef => ({"oracleId":"800c258a-cfc4-4a54-a667-065ea8dea69e","name":"Lightning Helix","manaCost":"{R}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Helix deals 3 damage to any target and you gain 3 life.","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const missionary = (): CardDef => ({"oracleId":"626f1dc3-3b14-4873-902f-ffec5487a97d","name":"Lone Missionary","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Kor Monk","supertypes":[],"types":["Creature"],"subtypes":["Kor","Monk"],"oracleText":"When this creature enters, you gain 4 life.","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"roe","releasedAt":"2010-04-23","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const growth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const tovolar = (): CardDef => ({"oracleId":"45d49831-548a-4a0e-9a18-9f7397913895","name":"Tovolar, Dire Overlord // Tovolar, the Midnight Scourge","manaCost":"{1}{R}{G}","cmc":3,"typeLine":"Legendary Creature — Human Werewolf // Legendary Creature — Werewolf","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Werewolf"],"oracleText":"Whenever a Wolf or Werewolf you control deals combat damage to a player, draw a card.\nAt the beginning of your upkeep, if you control three or more Wolves and/or Werewolves, it becomes night. Then transform any number of Human Werewolves you control.\nDaybound","power":"3","toughness":"3","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Daybound","Transform","Nightbound"],"commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Tovolar, Dire Overlord","manaCost":"{1}{R}{G}","typeLine":"Legendary Creature — Human Werewolf","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Werewolf"],"oracleText":"Whenever a Wolf or Werewolf you control deals combat damage to a player, draw a card.\nAt the beginning of your upkeep, if you control three or more Wolves and/or Werewolves, it becomes night. Then transform any number of Human Werewolves you control.\nDaybound","power":"3","toughness":"3","colors":["G","R"]},{"name":"Tovolar, the Midnight Scourge","manaCost":"","typeLine":"Legendary Creature — Werewolf","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Werewolf"],"oracleText":"Whenever a Wolf or Werewolf you control deals combat damage to a player, draw a card.\n{X}{R}{G}: Target Wolf or Werewolf you control gets +X/+0 and gains trample until end of turn.\nNightbound","power":"4","toughness":"4","colors":["G","R"],"colorIndicator":["G","R"]}]}) as CardDef;
const gatstaf = (): CardDef => ({"oracleId":"c05c5375-d0d7-4cf2-92e6-76f86cd0febf","name":"Gatstaf Shepherd // Gatstaf Howler","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Human Werewolf // Creature — Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Human","Werewolf"],"oracleText":"At the beginning of each upkeep, if no spells were cast last turn, transform this creature.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Transform","Intimidate"],"commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Gatstaf Shepherd","manaCost":"{1}{G}","typeLine":"Creature — Human Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Human","Werewolf"],"oracleText":"At the beginning of each upkeep, if no spells were cast last turn, transform this creature.","power":"2","toughness":"2","colors":["G"]},{"name":"Gatstaf Howler","manaCost":"","typeLine":"Creature — Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Werewolf"],"oracleText":"Intimidate (This creature can't be blocked except by artifact creatures and/or creatures that share a color with it.)\nAt the beginning of each upkeep, if a player cast two or more spells last turn, transform this creature.","power":"3","toughness":"3","colors":["G"],"colorIndicator":["G"]}]}) as CardDef;
const wolves = (): CardDef => ({"oracleId":"35d07ac9-b184-4b5f-8192-34b1db042f69","name":"Timber Wolves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Wolf","supertypes":[],"types":["Creature"],"subtypes":["Wolf"],"oracleText":"Banding (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding you control are blocking or being blocked by a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":["Banding"],"commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const naturalist = (): CardDef => ({"oracleId":"54f8acb1-58f3-49d1-bff8-c1b578245936","name":"Kessig Naturalist // Lord of the Ulvenwald","manaCost":"{R}{G}","cmc":2,"typeLine":"Creature — Human Werewolf // Creature — Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Human","Werewolf"],"oracleText":"Whenever this creature attacks, add {R} or {G}. Until end of turn, you don't lose this mana as steps and phases end.\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)","power":"2","toughness":"2","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Transform","Daybound","Nightbound"],"producedMana":["G","R"],"commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Kessig Naturalist","manaCost":"{R}{G}","typeLine":"Creature — Human Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Human","Werewolf"],"oracleText":"Whenever this creature attacks, add {R} or {G}. Until end of turn, you don't lose this mana as steps and phases end.\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)","power":"2","toughness":"2","colors":["G","R"]},{"name":"Lord of the Ulvenwald","manaCost":"","typeLine":"Creature — Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Werewolf"],"oracleText":"Other Wolves and Werewolves you control get +1/+1.\nWhenever this creature attacks, add {R} or {G}. Until end of turn, you don't lose this mana as steps and phases end.\nNightbound (If a player casts at least two spells during their own turn, it becomes day next turn.)","power":"3","toughness":"3","colors":["G","R"],"colorIndicator":["G","R"]}]}) as CardDef;

const marauder = (): CardDef => ({"oracleId":"1a4075f3-6c18-4cbe-99e0-f403dd78a7b0","name":"Hollow Marauder","manaCost":"{6}{B}","cmc":7,"typeLine":"Creature — Specter Rogue","supertypes":[],"types":["Creature"],"subtypes":["Specter","Rogue"],"oracleText":"This spell costs {1} less to cast for each creature card in your graveyard.\nFlying\nWhen this creature enters, any number of target opponents each discard a card. For each of those opponents who didn't discard a card with mana value 4 or greater, draw a card.","power":"4","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Flying"],"commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("round 348: compiles", () => {
  it("every card of the round", () => supported(dack(), phoenix(), firesong(), tovolar(), marauder()));
});

describe("Dack Fayden's emblem", () => {
  /** Dack's −6 activated and resolved: the emblem is ap's, Dack gone with 0 loyalty. */
  const ready = (hand: CardDef[]) => {
    const { s: s0, ap, opp, ids } = setup(hand);
    const d = putOnBattlefield(s0, ap, dack());
    s0.objects[d]!.counters.loyalty = 6;
    const s = settle(run(s0, planActivate(s0, ap, d, 2)), ap);
    return { s, ap, opp, ids, d };
  };

  it("−6: the emblem is its controller's; Dack is gone", () => {
    const { s, ap, d } = ready([]);
    expect((s.emblems ?? []).filter((id) => s.objects[id]!.owner === ap)).toHaveLength(1);
    expect(s.objects[d]!.zone).toBe("graveyard");
  });

  it("a spell that targets an opponent's creature: its trigger resolves first and you gain control of it for good (rulings)", () => {
    const { s: s0, ap, opp, ids } = ready([growth()]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(b)]));
    // The emblem's trigger is above the spell (rulings).
    expect(s.stack.length).toBe(2);
    expect(s.stack[s.stack.length - 1]!.kind).toBe("ability");
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 3 && s.stack.length === 2; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // Control changes before Giant Growth resolves.
    expect(s.stack.length).toBe(1);
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    s = settle(s, ap);
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    expect(characteristics(s, s.objects[b]!).power).toBe(5);
    // Still yours on later turns: the effect lasts indefinitely (rulings).
    for (let i = 0; i < 60 && s.turn < s0.turn + 2; i++) s = passAll(s.pending ? settle(s, -1 as unknown as PlayerId) : s);
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
  });

  it("an Aura spell targets the creature it will enchant: you gain control of it too", () => {
    const { s: s0, ap, opp, ids } = ready([pacifism()]);
    const b = putOnBattlefield(s0, opp, bear());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(b)])), ap);
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
  });

  it("a spell that targets only a player doesn't trigger it", () => {
    const { s: s0, ap, opp, ids } = ready([bolt()]);
    const life = s0.players[opp]!.life;
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.stack.length).toBe(1);
    expect(settle(s, ap).players[opp]!.life).toBe(life - 3);
  });

  it("a target that changed zones before the trigger resolves is a new object: no control of it (CR 400.7)", () => {
    const { s: s0, ap, opp, ids } = ready([growth()]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(b)]));
    moveObject(s, b, "hand");
    moveObject(s, b, "battlefield");
    s = settle(s, ap);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[b]!)).toBe(opp);
  });

  it("an opponent's spell doesn't trigger your emblem", () => {
    const { s: s0, ap, opp } = ready([]);
    const b = putOnBattlefield(s0, opp, bear());
    // The opponent holds a Giant Growth and a Forest, and casts it on their own bear once ap passes priority.
    const g = inHand(s0, opp, growth());
    putOnBattlefield(s0, opp, forest);
    const s1 = act(s0, { type: "passPriority", player: ap });
    expect(waitingOn(s1)).toBe(opp);
    const plan = planCast(s1, opp, g, [target(b)]);
    expect(plan).not.toBeNull();
    let s = s1;
    s = run(s, plan);
    expect(s.stack.length).toBe(1);
    s = settle(s, ap);
    expect(controllerOf(s, s.objects[b]!)).toBe(opp);
  });
});

describe("Everquill Phoenix", () => {
  it("mutating makes a red artifact token named Feather; {1}, sacrifice it: return target Phoenix card tapped", () => {
    const { s: s0, ap, ids } = setup([phoenix()]);
    const b = putOnBattlefield(s0, ap, bear());
    const dead = putOnBattlefield(s0, ap, phoenix());
    moveObject(s0, dead, "graveyard");
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!, [target(b)], undefined, "auto", undefined, { alt: "mutate" })));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "mutate" });
    s = act(s, { type: "chooseOption", player: ap, choice: "top" });
    s = settle(s, ap);
    const feather = s.battlefield.find((id) => nameOf(s, id) === "Feather")!;
    expect(feather).toBeDefined();
    const c = characteristics(s, s.objects[feather]!);
    expect(c.types).toEqual(["Artifact"]);
    expect(c.colors).toEqual(["R"]);
    expect(s.objects[feather]!.isToken).toBe(true);
    s = settle(run(s, planActivate(s, ap, feather, 0, [target(dead)])), ap);
    expect(s.objects[feather]?.zone ?? "gone").not.toBe("battlefield");
    expect(s.objects[dead]!.zone).toBe("battlefield");
    expect(s.objects[dead]!.tapped).toBe(true);
  });

  it("Feather's target is a Phoenix card in your graveyard only", () => {
    const { s: s0, ap, ids } = setup([phoenix()]);
    const b = putOnBattlefield(s0, ap, bear());
    const notPhoenix = putOnBattlefield(s0, ap, bear());
    moveObject(s0, notPhoenix, "graveyard");
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!, [target(b)], undefined, "auto", undefined, { alt: "mutate" })));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "top" }), ap);
    const feather = s.battlefield.find((id) => nameOf(s, id) === "Feather")!;
    expect(planActivate(s, ap, feather, 0, [target(notPhoenix)])).toBeNull();
  });
});

describe("Firesong and Sunspeaker", () => {
  const ready = (hand: CardDef[]) => {
    const { s, ap, opp, ids } = setup(hand);
    const f = putOnBattlefield(s, ap, firesong());
    return { s, ap, opp, ids, f };
  };

  it("a red instant has lifelink: Lightning Bolt gains you 3; a red spell's life gain doesn't trigger the damage", () => {
    const { s: s0, ap, opp, ids } = ready([bolt()]);
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    expect(s.players[ap]!.life).toBe(life + 3);
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
  });

  it("a white instant that makes you gain life: 3 damage to target creature or player, not a planeswalker (rulings)", () => {
    const { s: s0, ap, opp, ids } = ready([balm()]);
    const b = putOnBattlefield(s0, opp, bear());
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }])), ap);
    expect(s.players[ap]!.life).toBe(life + 5);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }), ap);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Lightning Helix: its lifelink damage and its own life gain are two events, two triggers (rulings)", () => {
    const { s: s0, ap, opp, ids } = ready([helix()]);
    const life = s0.players[ap]!.life;
    const oppLife = s0.players[opp]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    expect(s.players[ap]!.life).toBe(life + 6);
    let triggers = 0;
    for (let i = 0; i < 4 && s.pending?.kind === "chooseTargets"; i++) {
      triggers++;
      s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }), ap);
    }
    expect(triggers).toBe(2);
    expect(s.players[opp]!.life).toBe(oppLife - 3 - 6);
  });

  it("an opponent's white instant that makes you gain life triggers it too (rulings)", () => {
    const { s: s0, ap, opp } = ready([]);
    const g = inHand(s0, opp, balm());
    putOnBattlefield(s0, opp, plainsCard);
    putOnBattlefield(s0, opp, plainsCard);
    let s = act(s0, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    const plan = planCast(s, opp, g, [{ kind: "player", id: ap }]);
    expect(plan).not.toBeNull();
    s = settle(run(s, plan), ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
  });

  it("a white creature's triggered ability isn't a spell: Lone Missionary's life doesn't trigger it (rulings)", () => {
    const { s: s0, ap, ids } = ready([missionary()]);
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.players[ap]!.life).toBe(life + 4);
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
  });
});

describe("Tovolar, Dire Overlord", () => {
  /**
   * ap's upkeep with Tovolar, Gatstaf Shepherd, Timber Wolves and Kessig Naturalist (daybound) put onto the battlefield in
   * the turn before, by day, with a spell cast that turn (so day stays day and Gatstaf's own upkeep trigger doesn't).
   */
  const ready = (extra: CardDef[] = [wolves()]) => {
    const { s: s0, ap } = setup([]);
    const prev = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 3) % 4]!;
    let s = passUntil(s0, "end", prev);
    const tov = putOnBattlefield(s, ap, tovolar());
    const gat = putOnBattlefield(s, ap, gatstaf());
    const nat = putOnBattlefield(s, ap, naturalist());
    for (const d of extra) putOnBattlefield(s, ap, d);
    (s.castThisTurn ??= []).push({ player: prev, card: "test" });
    s = passUntil(s, "upkeep", ap);
    return { s, ap, tov, gat, nat };
  };

  it("with three or more Wolves and/or Werewolves: it becomes night, then you choose Human Werewolves to transform", () => {
    const r = ready();
    expect(r.s.dayNight).toBe("day");
    let s = settle(r.s, r.ap);
    expect(s.dayNight).toBe("night");
    // Tovolar and Kessig Naturalist are daybound: they transformed as it became night (CR 702.145b), and their
    // nightbound faces aren't Humans.
    expect(nameOf(s, r.tov)).toBe("Tovolar, the Midnight Scourge");
    expect(nameOf(s, r.nat)).toBe("Lord of the Ulvenwald");
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: r.ap, action: "choose", anyNumber: true, min: 0, options: [r.gat] });
    s = settle(act(s, { type: "pickPermanents", player: r.ap, ids: [r.gat] }), r.ap);
    expect(nameOf(s, r.gat)).toBe("Gatstaf Howler");
  });

  it("choosing none transforms none", () => {
    const r = ready();
    let s = settle(r.s, r.ap);
    s = settle(act(s, { type: "pickPermanents", player: r.ap, ids: [] }), r.ap);
    expect(s.dayNight).toBe("night");
    expect(nameOf(s, r.gat)).toBe("Gatstaf Shepherd");
  });

  it("with fewer than three Wolves and/or Werewolves it doesn't trigger (an intervening if, CR 603.4)", () => {
    // Tovolar alone, the other two Werewolves gone before the upkeep began.
    const { s: s0, ap } = setup([]);
    const prev = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 3) % 4]!;
    let s = passUntil(s0, "end", prev);
    putOnBattlefield(s, ap, tovolar());
    putOnBattlefield(s, ap, wolves());
    (s.castThisTurn ??= []).push({ player: prev, card: "test" });
    s = settle(passUntil(s, "upkeep", ap), ap);
    expect(s.pending).toBeNull();
    expect(s.dayNight).toBe("day");
  });

  it("a bot transforms all of its Human Werewolves", () => {
    const r = ready();
    let s = r.s;
    for (let i = 0; i < 50 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(nameOf(s, r.gat)).toBe("Gatstaf Howler");
  });
});

describe("Hollow Marauder", () => {
  /** Each opponent's hand emptied, then given these cards (none for an empty hand). */
  const ready = (hands: CardDef[][]) => {
    const { s, ap, ids } = setup([marauder()]);
    const opps = s.turnOrder.filter((p) => p !== ap);
    opps.forEach((p, i) => {
      for (const id of [...s.players[p]!.hand]) moveObject(s, id, "library");
      for (const d of hands[i] ?? []) inHand(s, p, d);
    });
    return { s, ap, opps, m: ids[0]! };
  };

  it("target opponents each discard; you draw for each who didn't discard a card with mana value 4 or greater, an empty hand too", () => {
    const { s: s0, ap, opps, m } = ready([[giant()], [bear()], []]);
    let s = settle(run(s0, planCast(s0, ap, m)), ap);
    expect(s.objects[m]!.zone).toBe("battlefield");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: opps.map((p) => ({ kind: "player" as const, id: p })) }), ap);
    // Hill Giant (4) and Grizzly Bears (2) were discarded; the third opponent had nothing to discard.
    expect(s.players[opps[0]!]!.hand).toHaveLength(0);
    expect(s.players[opps[1]!]!.hand).toHaveLength(0);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("an opponent who wasn't targeted doesn't count", () => {
    const { s: s0, ap, opps, m } = ready([[giant()], [bear()], []]);
    let s = settle(run(s0, planCast(s0, ap, m)), ap);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opps[0]! }, { kind: "player", id: opps[1]! }] }), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("it costs {1} less for each creature card in your graveyard", () => {
    const { s, ap, m } = ready([]);
    for (let i = 0; i < 6; i++) moveObject(s, putOnBattlefield(s, ap, bear()), "graveyard");
    const plan = planCast(s, ap, m);
    expect(plan).not.toBeNull();
    const taps = plan!.filter((a) => a.type === "activateMana").length;
    expect(taps).toBe(1);
  });
});

describe("round 348: bots", () => {
  it("a bot's Hollow Marauder targets its opponents", () => {
    const { s: s0, ap, ids } = setup([marauder()]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && !(s.pending?.kind === "chooseTargets"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const [a] = botActions(s, ap);
    expect(a).toMatchObject({ type: "chooseTargets" });
    const chosen = (a as Extract<Action, { type: "chooseTargets" }>).targets;
    expect(chosen.length).toBeGreaterThan(0);
    expect(chosen.every((t) => t.kind === "player" && t.id !== ap)).toBe(true);
  });
});
