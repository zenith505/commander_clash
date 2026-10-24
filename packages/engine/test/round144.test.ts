// Round 144: the most played cards, in popularity order, starting with Chaos Dragon.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, attackProblem, beholdCandidates, botActions, castProblem, characteristics, compileCard, moveObject, invalidateCharacteristics, isFullySupported, objIsType, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or something asks a player to choose. */
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone !== "exile") s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const nextOf = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!;

// Real oracle text (Scryfall).
const chaosDragon = card("Chaos Dragon", "Creature — Dragon", "{1}{R}{R}", { power: "4", toughness: "4", keywords: ["Flying", "Haste"], oracleText: "Flying, haste\nThis creature attacks each combat if able.\nAt the beginning of combat on your turn, each player rolls a d20. If one or more opponents had the highest result, this creature can't attack those players or planeswalkers they control this combat." });

describe("Chaos Dragon", () => {
  it("is fully supported; each player rolls a d20 and it can't attack the opponents with the highest result, this combat only", () => {
    supported(chaosDragon);
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { s: s0, ap } = setup([], seed);
      const dragon = putOnBattlefield(s0, ap, chaosDragon);
      let s = passUntil(s0, "beginCombat", ap);
      s = resolveAll(s);
      const rolls = new Map<PlayerId, number>();
      for (const e of s.log) {
        const m = /^(\w+) rolls a d20 for Chaos Dragon: (\d+)\.$/.exec(e.text);
        if (m) rolls.set(s.turnOrder.find((p) => s.players[p]!.name === m[1])!, Number(m[2]));
      }
      expect(rolls.size, `seed ${seed}`).toBe(4);
      const top = Math.max(...rolls.values());
      const banned = s.turnOrder.filter((p) => p !== ap && rolls.get(p) === top);
      expect([...characteristics(s, s.objects[dragon]!).cantAttackPlayers].sort()).toEqual(banned.sort());
      for (const p of s.turnOrder.filter((x) => x !== ap)) expect(attackProblem(s, s.objects[dragon]!, p) !== null, `seed ${seed}`).toBe(banned.includes(p));
    }
  });

  it("the restriction ends with that combat", () => {
    const { s: s0, ap } = setup([], 3);
    const dragon = putOnBattlefield(s0, ap, chaosDragon);
    let s = resolveAll(passUntil(s0, "beginCombat", ap));
    s.combatsThisTurn = (s.combatsThisTurn ?? 0) + 1; // a later combat this turn
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[dragon]!).cantAttackPlayers).toEqual([]);
  });
});

const swift = card("Swift Reconfiguration", "Enchantment — Aura", "{W}", { keywords: ["Enchant", "Flash"], oracleText: "Flash\nEnchant creature or Vehicle\nEnchanted permanent is a Vehicle artifact with crew 5 and it loses all other card types. (It's not a creature unless it's crewed.)" });
const golem = card("Test Equipment Golem", "Artifact Creature — Equipment Golem", "{3}", { power: "3", toughness: "3", keywords: ["Equip"], oracleText: "Equipped creature gets +1/+1.\nEquip {2}" });

describe("Swift Reconfiguration", () => {
  it("is fully supported; the creature becomes a noncreature Vehicle artifact with crew 5, and crewed it's a creature again", () => {
    supported(swift);
    const { s: s0, ap, ids, opp } = setup([swift]);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Big Bear", power: "6", toughness: "6" }));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: theirs }])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(theirs);
    const c = characteristics(s, s.objects[theirs]!);
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toEqual(["Vehicle"]); // Bear goes with the creature type (CR 205.1a)
    const crew = abilitiesOf(s, s.objects[theirs]!).activated.findIndex((a) => a.crew === 5);
    expect(crew).toBeGreaterThanOrEqual(0);
    // Its controller crews it with 5 power: an artifact creature until end of turn, still enchanted (it's a Vehicle).
    const crewers = [putOnBattlefield(s, opp, bear({ name: "Crew One", power: "3", toughness: "3" })), putOnBattlefield(s, opp, bear({ name: "Crew Two", power: "2", toughness: "2" }))];
    s.priority = opp;
    s = resolveAll(act(s, { type: "activateAbility", player: opp, objectId: theirs, index: crew, tapCreatures: crewers }));
    expect(crewers.every((id) => s.objects[id]!.tapped)).toBe(true);
    expect(objIsType(s, s.objects[theirs]!, "Creature")).toBe(true);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(theirs);
  });

  it("an Equipment creature loses Equipment and falls off what it equipped (rulings)", () => {
    const { s: s0, ap, ids } = setup([swift]);
    const g = putOnBattlefield(s0, ap, golem);
    const host = putOnBattlefield(s0, ap, bear());
    s0.objects[g]!.attachedTo = host;
    invalidateCharacteristics(s0);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: g }])));
    expect(characteristics(s, s.objects[g]!).subtypes).toEqual(["Vehicle"]);
    expect(s.objects[g]!.attachedTo).toBeUndefined();
  });
});

const stampede = card("Selvala's Stampede", "Sorcery", "{4}{G}{G}", { keywords: ["Council's dilemma"], oracleText: "Council's dilemma — Starting with you, each player votes for wild or free. Reveal cards from the top of your library until you reveal a creature card for each wild vote. Put those creature cards onto the battlefield, then shuffle the rest into your library. You may put a permanent card from your hand onto the battlefield for each free vote." });
const charm = card("Test Charm", "Enchantment", "{1}{G}");

describe("Selvala's Stampede", () => {
  it("is fully supported; a creature card from the library for each wild vote, a permanent card from your hand for each free vote", () => {
    supported(stampede);
    const { s: s0, ap, ids } = setup([stampede, bear({ name: "Hand Bear" }), charm, card("Test Instant", "Instant", "{U}")]);
    const word: Record<number, string> = { [ap]: "wild", [nextOf(s0, ap)]: "free", [nextOf(s0, ap, 2)]: "wild", [nextOf(s0, ap, 3)]: "free" };
    const before = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && objIsType(s0, s0.objects[id]!, "Creature")).length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    let asked = false;
    for (let i = 0; i < 60 && (s.stack.length || s.pending); i++) {
      const pend = s.pending;
      if (pend?.kind === "chooseOption" && pend.what === "vote") s = act(s, { type: "chooseOption", player: pend.player, choice: word[pend.voter ?? pend.player]! });
      else if (pend?.kind === "searchLibrary") {
        expect(pend).toMatchObject({ player: ap, fromHand: true, min: 0, max: 2 });
        expect(pend.cards).toEqual(expect.arrayContaining([ids[1]!, ids[2]!]));
        expect(pend.cards).not.toContain(ids[3]!);
        asked = true;
        s = act(s, { type: "searchLibrary", player: ap, found: [ids[1]!, ids[2]!] });
      } else if (pend) throw new Error(pend.kind);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked).toBe(true);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[2]!]!.zone).toBe("battlefield");
    const after = s.battlefield.filter((id) => s.objects[id]!.controller === ap && objIsType(s, s.objects[id]!, "Creature")).length;
    expect(after - before).toBe(3); // two from the library, the Hand Bear
    expect(s.log.some((e) => /reveals \d+ cards? from the top of their library/.test(e.text))).toBe(true);
  });

  it("with every vote wild, four creature cards and no question about the hand", () => {
    const { s: s0, ap, ids } = setup([stampede, bear({ name: "Hand Bear" })]);
    const before = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && objIsType(s0, s0.objects[id]!, "Creature")).length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 60 && (s.stack.length || s.pending); i++) {
      const pend = s.pending;
      if (pend?.kind === "chooseOption" && pend.what === "vote") s = act(s, { type: "chooseOption", player: pend.player, choice: "wild" });
      else if (pend) throw new Error(pend.kind);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && objIsType(s, s.objects[id]!, "Creature")).length - before).toBe(4);
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
  });
});

const echoes = card("Mana Echoes", "Enchantment", "{2}{R}{R}", { oracleText: "Whenever a creature enters, you may add an amount of {C} equal to the number of creatures you control that share a creature type with it." });
const humanWarrior = card("Test Human Warrior", "Creature — Human Warrior", "{1}{R}", { power: "2", toughness: "2" });

describe("Mana Echoes", () => {
  it("is fully supported; counts the creature itself and each creature you control sharing a type (not how many types)", () => {
    supported(echoes);
    const { s: s0, ap, ids, opp } = setup([humanWarrior]);
    putOnBattlefield(s0, ap, echoes);
    putOnBattlefield(s0, ap, card("Test Human", "Creature — Human Cleric", "{W}", { power: "1", toughness: "1" }));
    putOnBattlefield(s0, ap, card("Test Warrior", "Creature — Orc Warrior", "{R}", { power: "1", toughness: "1" }));
    putOnBattlefield(s0, ap, card("Test Human Warrior Two", "Creature — Human Warrior", "{R}", { power: "1", toughness: "1" }));
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, card("Their Human", "Creature — Human", "{W}", { power: "1", toughness: "1" }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const pool = (s: GameState) => s.players[ap]!.manaPool.C ?? 0;
    const was = pool(s);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = resolveAll(s);
    expect(pool(s) - was).toBe(4); // itself, the Human, the Warrior, the other Human Warrior
  });

  it("an opponent's creature: counts only creatures you control sharing a type with it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, echoes);
    putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const pool = (s: GameState) => s.players[ap]!.manaPool.C ?? 0;
    const theirs = card("Their Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2", keywords: ["Flash"], oracleText: "Flash" });
    const { s: t0 } = { s: s0 };
    const id = into(t0, opp, theirs, "hand");
    putOnBattlefield(t0, opp, forest);
    putOnBattlefield(t0, opp, forest);
    t0.priority = opp;
    let s = run(t0, planCast(t0, opp, id));
    s = resolveAll(s);
    const was = pool(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(pool(s) - was).toBe(1); // My Bear only
  });
});

const business = card("Unfinished Business", "Sorcery", "{3}{W}{W}", { oracleText: "Return target creature card from your graveyard to the battlefield, then return up to two target Aura and/or Equipment cards from your graveyard to the battlefield attached to that creature. (If the Auras can't enchant that creature, they remain in your graveyard.)" });
const might = card("Test Might", "Enchantment — Aura", "{G}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +2/+2." });
const landAura = card("Test Land Aura", "Enchantment — Aura", "{G}", { keywords: ["Enchant"], oracleText: "Enchant land\nEnchanted land has \"{T}: Add {G}{G}.\"" });
const sword = card("Test Sword", "Artifact — Equipment", "{1}", { keywords: ["Equip"], oracleText: "Equipped creature gets +1/+1.\nEquip {1}" });

describe("Unfinished Business", () => {
  it("is fully supported; returns the creature, then the Aura and the Equipment attached to it", () => {
    supported(business);
    const { s: s0, ap, ids } = setup([business]);
    const [c, a, e] = [into(s0, ap, bear({ name: "Old Bear" }), "graveyard"), into(s0, ap, might, "graveyard"), into(s0, ap, sword, "graveyard")];
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: c }, { kind: "object", id: a }, { kind: "object", id: e }])));
    expect(s.objects[c]!.zone).toBe("battlefield");
    expect(s.objects[a]!.attachedTo).toBe(c);
    expect(s.objects[e]!.attachedTo).toBe(c);
    expect(pt(s, c)).toBe("5/5");
  });

  it("an Aura that can't enchant it stays in the graveyard; with the creature gone, an Equipment enters unattached (rulings)", () => {
    const { s: s0, ap, ids } = setup([business]);
    const [c, a] = [into(s0, ap, bear({ name: "Old Bear" }), "graveyard"), into(s0, ap, landAura, "graveyard")];
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: c }, { kind: "object", id: a }, { kind: "none" }])));
    expect(s.objects[c]!.zone).toBe("battlefield");
    expect(s.objects[a]!.zone).toBe("graveyard");
    // The creature card leaves the graveyard before it resolves: the Equipment still returns, unattached.
    const { s: t0, ap: p, ids: more } = setup([business]);
    const [c2, e2] = [into(t0, p, bear({ name: "Old Bear" }), "graveyard"), into(t0, p, sword, "graveyard")];
    s = run(t0, planCast(t0, p, more[0]!, [{ kind: "object", id: c2 }, { kind: "object", id: e2 }, { kind: "none" }]));
    s.players[p]!.graveyard.splice(s.players[p]!.graveyard.indexOf(c2), 1);
    s.objects[c2]!.zone = "exile";
    s = resolveAll(s);
    expect(s.objects[e2]!.zone).toBe("battlefield");
    expect(s.objects[e2]!.attachedTo).toBeUndefined();
  });
});

const bagOfHolding = card("Bag of Holding", "Artifact", "{1}", { oracleText: "Whenever you discard a card, exile that card from your graveyard.\n{2}, {T}: Draw a card, then discard a card.\n{4}, {T}, Sacrifice this artifact: Return all cards exiled with this artifact to their owner's hand." });

describe("Bag of Holding", () => {
  it("is fully supported; exiles the discarded card, and its last ability returns the cards it exiled", () => {
    supported(bagOfHolding);
    const { s: s0, ap, ids } = setup([bear({ name: "Discard Me" })]);
    const bag = putOnBattlefield(s0, ap, bagOfHolding);
    const loot = abilitiesOf(s0, s0.objects[bag]!).activated.findIndex((a) => a.text.startsWith("{2}"));
    let s = run(s0, planActivate(s0, ap, bag, loot));
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("discard");
    s = resolveAll(act(s, { type: "discard", player: ap, objectIds: [ids[0]!] }));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    // A card exiled some other way stays exiled.
    const other = into(s, ap, bear({ name: "Other Exile" }), "exile");
    s.objects[bag]!.tapped = false;
    const sac = abilitiesOf(s, s.objects[bag]!).activated.findIndex((a) => a.text.startsWith("{4}"));
    s = resolveAll(run(s, planActivate(s, ap, bag, sac)));
    expect(s.objects[bag]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
    expect(s.objects[other]!.zone).toBe("exile");
  });
});

const alteredEgo = card("Altered Ego", "Creature — Shapeshifter", "{X}{2}{G}{U}", { power: "0", toughness: "0", oracleText: "This spell can't be countered.\nYou may have this creature enter as a copy of any creature on the battlefield, except it enters with X additional +1/+1 counters on it." });

describe("Altered Ego", () => {
  it("is fully supported; enters as a copy with X additional +1/+1 counters", () => {
    supported(alteredEgo);
    const { s: s0, ap, ids, opp } = setup([alteredEgo]);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear", power: "3", toughness: "3" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 3));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy", player: ap });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: theirs }));
    expect(characteristics(s, s.objects[ids[0]!]!).name).toBe("Their Bear");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
    expect(pt(s, ids[0]!)).toBe("6/6");
  });

  it("copying nothing, it enters as a 0/0 with no counters and dies", () => {
    const { s: s0, ap, ids, opp } = setup([alteredEgo]);
    putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2)));
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});

// Behold (CR 701.4a).
const champions = card("Champions of the Perfect", "Creature — Elf Warrior", "{3}{G}", { power: "6", toughness: "6", keywords: ["Behold"], oracleText: "As an additional cost to cast this spell, behold an Elf and exile it. (Exile an Elf you control or an Elf card from your hand.)\nWhenever you cast a creature spell, draw a card.\nWhen this creature leaves the battlefield, return the exiled card to its owner's hand." });
const aspirant = card("Kinsbaile Aspirant", "Creature — Kithkin Citizen", "{W}", { power: "2", toughness: "1", keywords: ["Behold"], oracleText: "As an additional cost to cast this spell, behold a Kithkin or pay {2}. (To behold a Kithkin, choose a Kithkin you control or reveal a Kithkin card from your hand.)\nWhenever another creature you control enters, this creature gets +1/+1 until end of turn." });
const elf = (name: string) => card(name, "Creature — Elf Druid", "{G}", { power: "1", toughness: "1" });
const kithkin = (name: string) => card(name, "Creature — Kithkin Soldier", "{W}", { power: "1", toughness: "1" });

describe("Champions of the Perfect: behold an Elf and exile it", () => {
  it("is fully supported; the beheld Elf from the battlefield is exiled, and returns to its owner's hand when Champions leaves", () => {
    supported(champions, aspirant);
    const { s: s0, ap, ids } = setup([champions]);
    const myElf = putOnBattlefield(s0, ap, elf("Field Elf"));
    expect(beholdCandidates(s0, ap, s0.objects[ids[0]!]!, compileCard(champions).additionalCosts![0] as never)).toEqual([myElf]);
    // Without choosing what to behold, it can't be cast.
    expect(() => run(s0, planCast(s0, ap, ids[0]!))).toThrow(/additional cost/);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { reveal: [myElf] })));
    expect(s.objects[myElf]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    // It leaves: the Elf comes back to its owner's hand.
    moveObject(s, ids[0]!, "graveyard");
    s = resolveAll(s);
    expect(s.objects[myElf]!.zone).toBe("hand");
  });

  it("an Elf card from the hand works too; countered, the card stays exiled (rulings)", () => {
    const { s: s0, ap, ids } = setup([champions, elf("Hand Elf")]);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { reveal: [ids[1]!] }));
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
    // Countered: put into the graveyard from the stack.
    const item = s.stack.findIndex((x) => x.kind === "spell" && x.objectId === ids[0]!);
    s.stack.splice(item, 1);
    moveObject(s, ids[0]!, "graveyard");
    s = resolveAll(s);
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
  });

  it("with no Elf to behold, it can't be cast", () => {
    const { s: s0, ap, ids } = setup([champions]);
    expect(castProblem(s0, ap, ids[0]!)).toMatch(/behold an Elf and exile it/);
  });

  it("bots behold an Elf card from their hand before an Elf on the battlefield, never a token", () => {
    const { s: s0, ap, ids } = setup([champions, elf("Hand Elf")]);
    const tok = putOnBattlefield(s0, ap, elf("Elf Token"));
    s0.objects[tok]!.isToken = true;
    s0.players[ap]!.landsPlayedThisTurn = 9;
    const cast = botActions(s0, ap).find((a) => a.type === "castSpell" && a.objectId === ids[0]!);
    expect(cast).toMatchObject({ reveal: [ids[1]!] });
  });
});

describe("Kinsbaile Aspirant: behold a Kithkin or pay {2}", () => {
  it("beholding a Kithkin you control costs nothing more and leaves it where it is", () => {
    const { s: s0, ap, ids } = setup([aspirant]);
    const k = putOnBattlefield(s0, ap, kithkin("Field Kithkin"));
    const or = compileCard(aspirant).costOr!;
    const behold = or.findIndex((x) => x.cost?.kind === "reveal");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { costOr: behold, reveal: [k] })));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[k]!.zone).toBe("battlefield");
    expect(s.log.some((e) => /beholds Field Kithkin\./.test(e.text))).toBe(true);
  });
});
