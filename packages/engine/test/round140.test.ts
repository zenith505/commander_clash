// Round 140: the most played cards, in popularity order, and the fix for Indulgent Tormentor's second "pay 3 life" prompt.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, forest, passUntil, pt, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, attackProblem, blockProblem, invalidateCharacteristics, botActions, characteristics, controllerOf, isFullySupported, legalActions, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

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
const nextOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const prevOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 3) % 4]!;
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).name.replace(/ Token$/, "") === name);
const inZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
/** `pid` attacks with `attacks` from its first main phase; the attack triggers go on the stack. */
const attack = (s: GameState, pid: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", pid), { type: "declareAttackers", player: pid, attacks });
/** On to combat damage with no blocks; the damage triggers go on the stack. */
const toDamage = (s: GameState) => {
  for (let i = 0; i < 60 && s.step !== "combatDamage"; i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};


describe("Indulgent Tormentor: pay 3 life", () => {
  const tormentor = card("Indulgent Tormentor", "Creature — Demon", "{3}{B}{B}", { power: "5", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nAt the beginning of your upkeep, draw a card unless target opponent sacrifices a creature of their choice or pays 3 life." });

  it("choosing to pay 3 life pays it, with no second prompt (CR 119.4)", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    putOnBattlefield(s0, ap, tormentor);
    const b = putOnBattlefield(s0, opp, bear({ name: "Test Bear" }));
    let s = passUntil(passUntil(s0, "draw"), "upkeep", ap);
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "punisher" });
    const pend = s.pending as { options: string[]; labels: string[] };
    const pay = pend.options[pend.labels.indexOf("Pay 3 life")]!;
    const hand = s.players[ap]!.hand.length;
    const life = s.players[opp]!.life;
    s = resolveAll(act(s, { type: "chooseOption", player: opp, choice: pay }));
    expect(s.pending).toBeFalsy();
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.objects[b]!.zone).toBe("battlefield");
  });
});

const REMINDER = "\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)";
const glassworks = scry("split", [
  { name: "Glassworks", mana_cost: "{2}{R}", type_line: "Enchantment — Room", oracle_text: `When you unlock this door, this Room deals 4 damage to target creature an opponent controls.${REMINDER}` },
  { name: "Shattered Yard", mana_cost: "{4}{R}", type_line: "Enchantment — Room", oracle_text: `At the beginning of your end step, this Room deals 1 damage to each opponent.${REMINDER}` },
]);
const aura = card("Test Aura", "Enchantment", "{1}{W}", { oracleText: "" });

describe("Ghostly Dancers and Ghostly Keybearer: unlock a locked door (CR 709.5f)", () => {
  const dancers = card("Ghostly Dancers", "Creature — Spirit", "{3}{W}{W}", { power: "2", toughness: "5", keywords: ["Flying", "Eerie"], oracleText: "Flying\nWhen this creature enters, return an enchantment card from your graveyard to your hand or unlock a locked door of a Room you control.\nEerie — Whenever an enchantment you control enters and whenever you fully unlock a Room, create a 3/1 white Spirit creature token with flying." });
  const keybearer = card("Ghostly Keybearer", "Creature — Spirit", "{3}{U}", { power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature deals combat damage to a player, unlock a locked door of up to one target Room you control." });

  it("are fully supported", () => supported(dancers, keybearer));

  it("with both possible, you choose; unlocking asks which locked door, and fully unlocking triggers eerie", () => {
    const { s: s0, ap, ids } = setup([dancers]);
    const room = putOnBattlefield(s0, ap, glassworks);
    s0.objects[room]!.unlocked = [0];
    const ench = inZone(s0, ap, aura, "graveyard");
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "either", labels: ["Return an enchantment card", "Unlock a locked door"] });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    // Only Shattered Yard is locked: no question which.
    expect(s.objects[room]!.unlocked).toEqual([0, 1]);
    expect(s.objects[ench]!.zone).toBe("graveyard");
    // Eerie: "whenever you fully unlock a Room".
    expect(named(s, ap, "Spirit")).toHaveLength(1);
  });

  it("two locked doors: you choose which one", () => {
    const { s: s0, ap, ids } = setup([dancers]);
    const room = putOnBattlefield(s0, ap, glassworks);
    let s = cast(s0, ap, ids[0]!);
    // No enchantment card in your graveyard: only the unlock can be chosen (CR 608.2d).
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "unlockDoor", options: [`${room}:0`, `${room}:1`], labels: ["Glassworks", "Shattered Yard"] });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: `${room}:1` }));
    expect(s.objects[room]!.unlocked).toEqual([1]);
    expect(characteristics(s, s.objects[room]!).name).toBe("Shattered Yard");
    expect(named(s, ap, "Spirit")).toHaveLength(0);
  });

  it("no Room with a locked door: the enchantment card is returned without asking", () => {
    const { s: s0, ap, ids } = setup([dancers]);
    const ench = inZone(s0, ap, aura, "graveyard");
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 4 && s.pending; i++) s = resolveAll(act(s, botActions(s, waitingOn(s)!)[0]!));
    expect(s.objects[ench]!.zone).toBe("hand");
  });

  it("neither possible: nothing happens", () => {
    const { s: s0, ap, ids } = setup([dancers]);
    const s = cast(s0, ap, ids[0]!);
    expect(s.pending).toBeFalsy();
    expect(s.stack).toHaveLength(0);
  });

  it("the bot unlocks the dearer door", () => {
    const { s: s0, ap, ids } = setup([dancers]);
    const room = putOnBattlefield(s0, ap, glassworks);
    let s = cast(s0, ap, ids[0]!);
    s = resolveAll(act(s, botActions(s, ap)[0]!));
    expect(s.objects[room]!.unlocked).toEqual([1]);
  });

  it("Keybearer: combat damage unlocks a locked door of the target Room", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    const k = putOnBattlefield(s0, ap, keybearer);
    const room = putOnBattlefield(s0, ap, glassworks);
    s0.objects[room]!.unlocked = [1];
    let s = toDamage(attack(s0, ap, [{ attacker: k, defender: opp }]));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: room }] }));
    expect(s.objects[room]!.unlocked).toEqual([1, 0]);
  });
});

/** No lands: only what the test puts on the battlefield makes mana. */
const noLands = (s: GameState, pid: PlayerId) => {
  for (const id of [...s.battlefield]) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) moveObject(s, id, "graveyard");
};

describe("Sorcerer Class", () => {
  const sorcererClass = card("Sorcerer Class", "Enchantment — Class", "{U}{R}", { oracleText: "(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, draw two cards, then discard two cards.\n{U}{R}: Level 2\nCreatures you control have \"{T}: Add {U} or {R}. Spend this mana only to cast an instant or sorcery spell or to gain a Class level.\"\n{3}{U}{R}: Level 3\nWhenever you cast an instant or sorcery spell, that spell deals damage to each opponent equal to the number of instant and sorcery spells you've cast this turn." });
  const bolt = card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." });
  const opt = card("Test Opt", "Instant", "{U}", { oracleText: "Draw a card." });
  const goblin = card("Test Goblin", "Creature — Goblin", "{R}", { power: "1", toughness: "1" });

  it("is fully supported", () => supported(sorcererClass));

  it("level 2: your creatures tap for {U} or {R}, spent only on instants, sorceries and Class levels (CR 106.6)", () => {
    const { s: s0, ap, ids } = setup([bolt, goblin]);
    noLands(s0, ap);
    const c = putOnBattlefield(s0, ap, sorcererClass);
    s0.objects[c]!.classLevel = 2;
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, ap, bear({ name: `Test Bear ${i}` }));
    // Not a creature spell.
    expect(planCast(s0, ap, ids[1]!)).toBeNull();
    // A Class level: {3}{U}{R} from five creatures.
    let s = run(s0, planActivate(s0, ap, c, abilitiesOf(s0, s0.objects[c]!).activated.findIndex((a) => a.activateIf?.kind === "classLevel" && a.activateIf.min === 2)));
    s = resolveAll(s);
    expect(s.objects[c]!.classLevel).toBe(3);
  });

  it("level 2: the mana casts an instant", () => {
    const { s: s0, ap, ids } = setup([bolt]);
    noLands(s0, ap);
    const c = putOnBattlefield(s0, ap, sorcererClass);
    s0.objects[c]!.classLevel = 2;
    putOnBattlefield(s0, ap, bear({ name: "Test Bear" }));
    expect(planCast(s0, ap, ids[0]!, [{ kind: "player", id: nextOf(s0, ap) }])).not.toBeNull();
  });

  it("level 3: each instant or sorcery you cast deals damage to each opponent, counted as the trigger resolves", () => {
    const { s: s0, ap, ids } = setup([opt, opt]);
    const c = putOnBattlefield(s0, ap, sorcererClass);
    s0.objects[c]!.classLevel = 3;
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const life = opps.map((p) => s0.players[p]!.life);
    let s = cast(s0, ap, ids[0]!);
    expect(opps.map((p) => s.players[p]!.life)).toEqual(life.map((l) => l - 1));
    expect(s.players[ap]!.life).toBe(40);
    s = cast(s, ap, ids[1]!);
    expect(opps.map((p) => s.players[p]!.life)).toEqual(life.map((l) => l - 3));
    expect(s.log.some((l) => /Test Opt deals 2 damage/.test(l.text))).toBe(true);
  });

  it("level 3: a spell countered or gone still deals the damage (rulings)", () => {
    const { s: s0, ap, ids } = setup([opt]);
    const c = putOnBattlefield(s0, ap, sorcererClass);
    s0.objects[c]!.classLevel = 3;
    const opp = nextOf(s0, ap);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // As if countered: the spell leaves the stack before the trigger above it resolves.
    const spell = s.stack.find((i) => i.kind === "spell")!;
    moveObject(s, spell.objectId!, "graveyard");
    s.stack = s.stack.filter((i) => i !== spell);
    s = resolveAll(s);
    expect(s.players[opp]!.life).toBe(39);
  });
});

describe("Hakbal of the Surging Soul", () => {
  const hakbal = card("Hakbal of the Surging Soul", "Legendary Creature — Merfolk Scout", "{2}{G}{U}", { power: "3", toughness: "3", keywords: ["Explore"], oracleText: "At the beginning of combat on your turn, each Merfolk creature you control explores. (Reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on the exploring creature, then put the card back or put it into your graveyard.)\nWhenever Hakbal attacks, you may put a land card from your hand onto the battlefield. If you don't, draw a card." });
  const merfolk = card("Test Merfolk", "Creature — Merfolk", "{U}", { power: "1", toughness: "1" });
  const rock = card("Test Rock", "Artifact", "{1}");
  const land = card("Test Land", "Land", "", { oracleText: "{T}: Add {G}." });

  it("is fully supported", () => supported(hakbal));

  it("each Merfolk you control explores, in the order you choose; the second sees the card the first left on top", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, hakbal);
    const m = putOnBattlefield(s0, ap, merfolk);
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Bear" }));
    const r = inZone(s0, ap, rock, "library");
    let s = resolveAll(passUntil(s0, "beginCombat", ap));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, what: "creature to explore next" });
    expect((s.pending as { options: string[] }).options.sort()).toEqual([h, m].sort());
    s = act(s, { type: "pickPermanents", player: ap, ids: [m] });
    // Test Rock: a counter on the Merfolk, and it stays on top.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, card: r });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    // Hakbal explores next with no question, and reveals the same card.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, card: r });
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[m]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[h]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[r]!.zone).toBe("graveyard");
  });

  it("attacking: you may put a land card from your hand onto the battlefield; if you don't, you draw", () => {
    const { s: s0, ap, ids } = setup([land]);
    const h = putOnBattlefield(s0, ap, hakbal);
    const opp = nextOf(s0, ap);
    let s = passUntil(s0, "main1", ap);
    s = attack(s, ap, [{ attacker: h, defender: opp }]);
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, min: 0 });
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [ids[0]!] }));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("attacking: putting none draws a card, and so does having no land card", () => {
    const { s: s0, ap, ids } = setup([land]);
    const h = putOnBattlefield(s0, ap, hakbal);
    const opp = nextOf(s0, ap);
    let s = resolveAll(attack(s0, ap, [{ attacker: h, defender: opp }]));
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // No land card in hand (its explore at the beginning of combat reveals Test Rock, which stays on top).
    const { s: t0, ap: ap2 } = setup([]);
    for (const id of [...t0.players[ap2]!.hand]) moveObject(t0, id, "graveyard");
    const h2 = putOnBattlefield(t0, ap2, hakbal);
    inZone(t0, ap2, rock, "library");
    let t = resolveAll(passUntil(t0, "beginCombat", ap2));
    t = resolveAll(act(t, { type: "chooseMay", player: ap2, yes: false }));
    t = resolveAll(act(passUntil(t, "declareAttackers", ap2), { type: "declareAttackers", player: ap2, attacks: [{ attacker: h2, defender: nextOf(t0, ap2) }] }));
    expect(t.pending).toBeFalsy();
    expect(t.players[ap2]!.hand.map((id) => t.objects[id]!.cardId)).toEqual([rock.oracleId]);
  });
});

describe("Maddening Hex", () => {
  const hex = card("Maddening Hex", "Enchantment — Aura Curse", "{1}{R}{R}", { keywords: ["Enchant"], oracleText: "Enchant player\nWhenever enchanted player casts a noncreature spell, roll a d6. This Aura deals damage to that player equal to the result. Then attach this Aura to another one of your opponents chosen at random." });
  const trinket = card("Test Trinket", "Artifact", "{0}");
  const elf = card("Test Elf", "Creature — Elf", "{0}", { power: "1", toughness: "1" });

  it("is fully supported", () => supported(hex));

  it("a noncreature spell: d6 damage to its caster, then the Curse moves to another of your opponents at random", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    const h = putOnBattlefield(s0, ap, hex);
    s0.objects[h]!.attachedToPlayer = opp;
    const t = inZone(s0, opp, trinket, "hand");
    const e = inZone(s0, opp, elf, "hand");
    let s = passUntil(s0, "main1", opp);
    // A creature spell: nothing.
    s = resolveAll(run(s, planCast(s, opp, e)));
    expect(s.objects[h]!.attachedToPlayer).toBe(opp);
    expect(s.players[opp]!.life).toBe(40);
    s = resolveAll(run(s, planCast(s, opp, t)));
    const lost = 40 - s.players[opp]!.life;
    expect(lost).toBeGreaterThanOrEqual(1);
    expect(lost).toBeLessThanOrEqual(6);
    expect(s.log.some((l) => l.text.includes(`rolls a d6 for Maddening Hex: ${lost}`))).toBe(true);
    const now = s.objects[h]!.attachedToPlayer!;
    expect(now).not.toBe(opp);
    expect(now).not.toBe(ap);
    expect(s.players[now]!.life).toBe(40);
  });

  it("enchanting your only opponent, it stays (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    for (const p of s0.turnOrder) if (p !== ap && p !== opp) s0.players[p]!.lost = true;
    const h = putOnBattlefield(s0, ap, hex);
    s0.objects[h]!.attachedToPlayer = opp;
    const t = inZone(s0, opp, trinket, "hand");
    let s = passUntil(s0, "main1", opp);
    s = resolveAll(run(s, planCast(s, opp, t)));
    expect(s.players[opp]!.life).toBeLessThan(40);
    expect(s.objects[h]!.attachedToPlayer).toBe(opp);
  });
});

describe("Illusionist's Gambit", () => {
  const gambit = card("Illusionist's Gambit", "Instant", "{2}{U}{U}", { oracleText: "Cast this spell only during the declare blockers step on an opponent's turn.\nRemove all attacking creatures from combat and untap them. After this phase, there is an additional combat phase. Each of those creatures attacks that combat if able. They can't attack you or planeswalkers you control that combat." });

  /** On to the declare blockers step with no blocks, until `pid` has priority there. */
  const toBlockersPriority = (s: GameState, pid: PlayerId) => {
    for (let i = 0; i < 60 && !(s.step === "declareBlockers" && !s.pending && waitingOn(s) === pid); i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };

  it("is fully supported", () => supported(gambit));

  it("removes the attackers from combat and untaps them; in the added combat they must attack, but not you", () => {
    const { s: s0, ap, ids } = setup([gambit]);
    const opp = nextOf(s0, ap);
    const third = nextOf(s0, opp);
    const a = putOnBattlefield(s0, opp, bear({ name: "Test Bear A" }));
    const b = putOnBattlefield(s0, opp, bear({ name: "Test Bear B" }));
    const stay = putOnBattlefield(s0, opp, bear({ name: "Test Bear C" }));
    let s = attack(s0, opp, [{ attacker: a, defender: ap }, { attacker: b, defender: third }]);
    // Not before the declare blockers step.
    expect(planCast(s, ap, ids[0]!)).toBeNull();
    s = toBlockersPriority(s, ap);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[a]!.attacking).toBeUndefined();
    expect(s.objects[a]!.tapped).toBe(false);
    expect(s.objects[b]!.tapped).toBe(false);
    const life = s.turnOrder.map((p) => s.players[p]!.life);
    // On through this combat (nothing deals damage) to the added one.
    for (let i = 0; i < 60 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "declareAttackers", player: opp });
    expect(s.turnOrder.map((p) => s.players[p]!.life)).toEqual(life);
    // They must attack, and not you; the creature that didn't attack before needn't (rulings) and may attack you.
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [] })).toThrow();
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: a, defender: ap }, { attacker: b, defender: third }] })).toThrow();
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: a, defender: third }, { attacker: b, defender: third }, { attacker: stay, defender: ap }] });
    expect(s.objects[a]!.attacking).toBe(third);
    expect(s.objects[stay]!.attacking).toBe(ap);
  });

  it("the restriction is for that combat only: bots attack with them, and not you", () => {
    const { s: s0, ap, ids } = setup([gambit]);
    const opp = nextOf(s0, ap);
    const a = putOnBattlefield(s0, opp, bear({ name: "Test Bear A" }));
    let s = attack(s0, opp, [{ attacker: a, defender: ap }]);
    s = toBlockersPriority(s, ap);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    for (let i = 0; i < 60 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, botActions(s, opp)[0]!);
    expect(s.objects[a]!.attacking).toBeDefined();
    expect(s.objects[a]!.attacking).not.toBe(ap);
  });
});

describe("Jegantha, the Wellspring: mana that can't pay generic costs", () => {
  const jegantha = card("Jegantha, the Wellspring", "Legendary Creature — Elemental Elk", "{4}{R/G}", { power: "5", toughness: "5", keywords: ["Companion"], oracleText: "Companion — No card in your starting deck has more than one of the same mana symbol in its mana cost. (If this card is your chosen companion, you may put it into your hand from outside the game for {3} as a sorcery.)\n{T}: Add {W}{U}{B}{R}{G}. This mana can't be spent to pay generic mana costs." });
  const twoGU = card("Test Mystic", "Creature — Human", "{2}{G}{U}", { power: "3", toughness: "3" });
  const oneG = card("Test Elf", "Creature — Elf", "{1}{G}", { power: "2", toughness: "2" });
  const spectral = card("Test Spectral", "Instant", "{2/W}", { oracleText: "Draw a card." });
  const tapJeg = (s: GameState, pid: PlayerId, j: string) => act(s, { type: "activateMana", player: pid, objectId: j, mana: "W" });

  it("is fully supported", () => supported(jegantha));

  it("its mana pays colored symbols only: {1}{G} needs another source for the {1}", () => {
    const { s: s0, ap, ids } = setup([oneG]);
    noLands(s0, ap);
    const j = putOnBattlefield(s0, ap, jegantha);
    expect(planCast(s0, ap, ids[0]!)).toBeNull();
    let s = tapJeg(s0, ap, j);
    expect(() => act(s, { type: "castSpell", player: ap, objectId: ids[0]! })).toThrow();
    // With a Forest for the {1}: the {G} from Jegantha, and its other four mana stay in the pool.
    const f = putOnBattlefield(s, ap, forest);
    s = act(s, { type: "activateMana", player: ap, objectId: f, mana: "G" });
    s = resolveAll(act(s, { type: "castSpell", player: ap, objectId: ids[0]! }));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    const pool = s.players[ap]!.manaPool;
    expect([pool.W, pool.U, pool.B, pool.R, pool.G]).toEqual([1, 1, 1, 1, 0]);
  });

  it("autopay taps Jegantha for the colored symbols and lands for the generic mana", () => {
    const { s: s0, ap, ids } = setup([twoGU]);
    noLands(s0, ap);
    putOnBattlefield(s0, ap, jegantha);
    putOnBattlefield(s0, ap, forest);
    expect(planCast(s0, ap, ids[0]!)).toBeNull();
    putOnBattlefield(s0, ap, forest);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("a {2/W} symbol takes it only as {W} (rulings)", () => {
    const { s: s0, ap, ids } = setup([spectral, spectral]);
    noLands(s0, ap);
    const j = putOnBattlefield(s0, ap, jegantha);
    let s = tapJeg(s0, ap, j);
    s = resolveAll(act(s, { type: "castSpell", player: ap, objectId: ids[0]! }));
    expect(s.players[ap]!.manaPool.W).toBe(0);
    // No more {W}: two of its other colors can't pay {2}.
    expect(() => act(s, { type: "castSpell", player: ap, objectId: ids[1]! })).toThrow();
  });
});

describe("Preston, the Vanisher", () => {
  const preston = card("Preston, the Vanisher", "Legendary Creature — Rabbit Wizard", "{3}{W}", { power: "2", toughness: "5", oracleText: "Whenever another nontoken creature you control enters, if it wasn't cast, create a token that's a copy of that creature, except it's a 0/1 white Illusion.\n{1}{W}, Sacrifice five Illusions: Exile target nonland permanent." });
  const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" });

  it("is fully supported", () => supported(preston));

  it("a creature put onto the battlefield (not cast) is copied as a 0/1 white Illusion; a cast one isn't", () => {
    const { s: s0, ap, ids } = setup([ogre, ogre]);
    putOnBattlefield(s0, ap, preston);
    let s = cast(s0, ap, ids[0]!);
    expect(named(s, ap, "Test Ogre")).toHaveLength(1);
    moveObject(s, ids[1]!, "battlefield");
    s = resolveAll(s);
    const ogres = named(s, ap, "Test Ogre");
    expect(ogres).toHaveLength(3);
    const token = ogres.find((id) => s.objects[id]!.isToken)!;
    const c = characteristics(s, s.objects[token]!);
    expect([c.power, c.toughness]).toEqual([0, 1]);
    expect(c.colors).toEqual(["W"]);
    expect(c.subtypes).toEqual(["Illusion"]);
  });
});

describe("Determined Iteration", () => {
  const iteration = card("Determined Iteration", "Enchantment", "{3}{U}", { oracleText: "At the beginning of combat on your turn, populate. The token created this way gains haste. Sacrifice it at the beginning of the next end step." });
  const golem = card("Test Golem", "Token Artifact Creature — Golem", "", { power: "3", toughness: "3" });

  it("is fully supported", () => supported(iteration));

  it("copies a creature token you control, with haste, and sacrifices the copy at the next end step", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, iteration);
    const g = putOnBattlefield(s0, ap, golem);
    s0.objects[g]!.isToken = true;
    let s = resolveAll(passUntil(s0, "beginCombat", ap));
    const golems = named(s, ap, "Test Golem");
    expect(golems).toHaveLength(2);
    const copy = golems.find((id) => id !== g)!;
    expect(characteristics(s, s.objects[copy]!).keywords).toContain("Haste");
    expect(characteristics(s, s.objects[g]!).keywords).not.toContain("Haste");
    s = resolveAll(passUntil(s, "end", ap));
    expect(s.objects[copy]?.zone ?? "gone").not.toBe("battlefield");
    expect(s.objects[g]!.zone).toBe("battlefield");
  });
});

describe("Breaching Dragonstorm", () => {
  const storm = card("Breaching Dragonstorm", "Enchantment", "{4}{R}", { oracleText: "When this enchantment enters, exile cards from the top of your library until you exile a nonland card. You may cast it without paying its mana cost if that spell's mana value is 8 or less. If you don't, put that card into your hand.\nWhen a Dragon you control enters, return this enchantment to its owner's hand." });
  const small = card("Test Drake", "Creature — Drake", "{2}{U}", { power: "2", toughness: "2" });
  const huge = card("Test Titan", "Creature — Giant", "{7}{R}{R}", { power: "9", toughness: "9" });
  const land = card("Test Land", "Land", "", { oracleText: "{T}: Add {G}." });

  it("is fully supported", () => supported(storm));

  it("exiles to a nonland card; mana value 8 or less may be cast free, else (or if you don't) it goes to your hand", () => {
    const { s: s0, ap, ids } = setup([storm, storm]);
    const d = inZone(s0, ap, small, "library");
    const l = inZone(s0, ap, land, "library");
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: d, mv: { max: 8 } });
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[d]!.zone).toBe("hand");
    expect(s.objects[l]!.zone).toBe("exile");
    // Mana value 9: no free cast, into the hand.
    const t = inZone(s, ap, huge, "library");
    s = cast(s, ap, ids[1]!);
    expect(s.pending).toBeFalsy();
    expect(s.objects[t]!.zone).toBe("hand");
  });

  it("cast: the spell is cast free as the trigger resolves", () => {
    const { s: s0, ap, ids } = setup([storm]);
    const d = inZone(s0, ap, small, "library");
    let s = cast(s0, ap, ids[0]!);
    s = resolveAll(act(s, { type: "castSpell", player: ap, objectId: d }));
    expect(s.objects[d]!.zone).toBe("battlefield");
  });
});

describe("Expansion // Explosion", () => {
  const expansion = scry("split", [
    { name: "Expansion", mana_cost: "{U/R}{U/R}", type_line: "Instant", oracle_text: "Copy target instant or sorcery spell with mana value 4 or less. You may choose new targets for the copy." },
    { name: "Explosion", mana_cost: "{X}{U}{U}{R}{R}", type_line: "Instant", oracle_text: "Explosion deals X damage to any target. Target player draws X cards." },
  ]);
  const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
  const big = card("Test Big Burn", "Sorcery", "{4}{R}", { oracleText: "Test Big Burn deals 5 damage to any target." });

  it("is fully supported", () => supported(expansion));

  it("Expansion copies an instant or sorcery spell with mana value 4 or less, not one with 5", () => {
    const { s: s0, ap, ids, opp } = setup([shock, expansion, big, expansion]);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    const item = s.stack[s.stack.length - 1]!.id;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: item }], undefined, undefined, undefined, { face: 0 }));
    s = resolveAll(s);
    // The copy may get new targets: a different opponent.
    const third = nextOf(s, opp);
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap, copyOf: "Test Shock" });
    s = resolveAll(act(s, { type: "copyTargets", player: ap, targets: [{ kind: "player", id: third }] }));
    expect(s.players[opp]!.life).toBe(38);
    expect(s.players[third]!.life).toBe(38);
    // Mana value 5: not a legal target.
    let t = run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: opp }]));
    const bigItem = t.stack[t.stack.length - 1]!.id;
    expect(planCast(t, ap, ids[3]!, [{ kind: "stack", id: bigItem }], undefined, undefined, undefined, { face: 0 })).toBeNull();
  });

  it("Explosion deals X damage to any target and a target player draws X cards", () => {
    const { s: s0, ap, ids, opp } = setup([expansion]);
    const hand = s0.players[ap]!.hand.length;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }, { kind: "player", id: ap }], undefined, undefined, 3, { face: 1 })));
    expect(s.players[opp]!.life).toBe(37);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });
});

describe("Sorin of House Markov // Sorin, Ravenous Neonate", () => {
  const EXTORT = "Extort (Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain that much life.)";
  const sorin = scry("transform", [
    { name: "Sorin of House Markov", mana_cost: "{1}{B}", type_line: "Legendary Creature — Human Noble", power: "1", toughness: "4", oracle_text: `Lifelink\n${EXTORT}\nAt the beginning of each of your postcombat main phases, if you gained 3 or more life this turn, exile Sorin, then return him to the battlefield transformed under his owner's control.` },
    { name: "Sorin, Ravenous Neonate", type_line: "Legendary Planeswalker — Sorin", loyalty: "3", color_indicator: ["B"], oracle_text: `${EXTORT}\n+2: Create a Food token.\n−1: Sorin deals damage equal to the amount of life you gained this turn to any target.\n−6: Gain control of target creature. It becomes a Vampire in addition to its other types. Put a lifelink counter on it if you control a white permanent other than that creature or Sorin.` },
  ], { keywords: ["Lifelink", "Extort", "Transform", "Food"] });
  const whiteBear = bear({ name: "White Bear", manaCost: "{1}{W}", colors: ["W"] });
  const glorious = card("Test White Enchantment", "Enchantment", "{W}", { colors: ["W"] });
  const backUp = (s: GameState, pid: PlayerId, loyalty: number) => {
    const id = putOnBattlefield(s, pid, sorin);
    s.objects[id]!.face = 1;
    s.objects[id]!.counters.loyalty = loyalty;
    invalidateCharacteristics(s);
    return id;
  };

  it("is fully supported", () => supported(sorin));

  it("transforms at your postcombat main phase if you gained 3 or more life this turn, entering with 3 loyalty", () => {
    for (const gained of [2, 3]) {
      const { s: s0, ap } = setup([]);
      const id = putOnBattlefield(s0, ap, sorin);
      (s0.turnLog ??= {} as NonNullable<GameState["turnLog"]>).lifeGained = { [ap]: gained };
      const s = resolveAll(passUntil(s0, "main2", ap));
      const now = named(s, ap, gained >= 3 ? "Sorin, Ravenous Neonate" : "Sorin of House Markov");
      expect(now, `gained ${gained}`).toHaveLength(1);
      if (gained >= 3) {
        expect(s.objects[now[0]!]!.counters.loyalty).toBe(3);
        expect(characteristics(s, s.objects[now[0]!]!).types).toEqual(["Planeswalker"]);
      } else expect(now[0]).toBe(id);
    }
  });

  it("−1: damage equal to the life you gained this turn, not counting life lost (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const id = backUp(s0, ap, 3);
    (s0.turnLog ??= {} as NonNullable<GameState["turnLog"]>).lifeGained = { [ap]: 4 };
    s0.players[ap]!.life -= 4;
    const s = resolveAll(run(s0, planActivate(s0, ap, id, 1, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(36);
    expect(s.objects[id]!.counters.loyalty).toBe(2);
  });

  it("−6: gain control of a creature, it's a Vampire, and it gets a lifelink counter only with another white permanent", () => {
    for (const other of [false, true]) {
      const { s: s0, ap, opp } = setup([]);
      const id = backUp(s0, ap, 6);
      const b = putOnBattlefield(s0, opp, whiteBear);
      if (other) putOnBattlefield(s0, ap, glorious);
      const s = resolveAll(run(s0, planActivate(s0, ap, id, 2, [{ kind: "object", id: b }])));
      expect(controllerOf(s, s.objects[b]!)).toBe(ap);
      expect(characteristics(s, s.objects[b]!).subtypes).toContain("Vampire");
      expect(s.objects[b]!.counters.lifelink ?? 0, `other white permanent: ${other}`).toBe(other ? 1 : 0);
    }
  });
});

describe("White Lotus Tile", () => {
  const tile = card("White Lotus Tile", "Artifact", "{4}", { oracleText: "This artifact enters tapped.\n{T}: Add X mana of any one color, where X is the greatest number of creatures you control that have a creature type in common." });
  const elf = (n: string) => card(n, "Creature — Elf Druid", "{G}", { power: "1", toughness: "1" });
  const shifter = card("Test Shapeshifter", "Creature — Shapeshifter", "{2}", { power: "1", toughness: "1", keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" });
  const goblin = card("Test Goblin", "Creature — Goblin", "{R}", { power: "1", toughness: "1" });

  it("is fully supported", () => supported(tile));

  it("adds one mana for each creature in your biggest group sharing a creature type; a changeling joins any (CR 702.73a)", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, tile);
    for (const c of [elf("Elf A"), elf("Elf B"), shifter, goblin]) putOnBattlefield(s0, ap, c);
    // An opponent's Elves don't count.
    putOnBattlefield(s0, opp, elf("Elf C"));
    const s = act(s0, { type: "activateMana", player: ap, objectId: t, mana: "B", ability: 0 });
    expect(s.players[ap]!.manaPool.B).toBe(3);
  });
});

describe("Unlicensed Hearse", () => {
  const hearse = card("Unlicensed Hearse", "Artifact — Vehicle", "{2}", { power: "*", toughness: "*", keywords: ["Crew"], oracleText: "{T}: Exile up to two target cards from a single graveyard.\nUnlicensed Hearse's power and toughness are each equal to the number of cards exiled with it.\nCrew 2" });

  it("is fully supported", () => supported(hearse));

  it("is as big as the number of cards exiled with it (CR 607.2a)", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, hearse);
    expect(pt(s0, h)).toBe("0/0");
    const a = inZone(s0, opp, bear({ name: "Bear A" }), "graveyard");
    const b = inZone(s0, opp, bear({ name: "Bear B" }), "graveyard");
    // Other cards in exile don't count.
    const other = inZone(s0, opp, bear({ name: "Bear C" }), "graveyard");
    moveObject(s0, other, "exile");
    const s = resolveAll(run(s0, planActivate(s0, ap, h, 0, [{ kind: "object", id: a }, { kind: "object", id: b }])));
    expect([s.objects[a]!.zone, s.objects[b]!.zone]).toEqual(["exile", "exile"]);
    expect(pt(s, h)).toBe("2/2");
  });
});

describe("Eriette of the Charmed Apple", () => {
  const eriette = card("Eriette of the Charmed Apple", "Legendary Creature — Human Warlock", "{1}{W}{B}", { power: "2", toughness: "4", oracleText: "Each creature that's enchanted by an Aura you control can't attack you or planeswalkers you control.\nAt the beginning of your end step, each opponent loses X life and you gain X life, where X is the number of Auras you control." });
  const charm = card("Test Charm", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature" });

  it("is fully supported", () => supported(eriette, charm));

  it("a creature enchanted by your Aura can't attack you, but can attack others; one enchanted by its controller's Aura can", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, eriette);
    const mine = putOnBattlefield(s0, opp, bear({ name: "Charmed Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Own Aura Bear" }));
    const a1 = putOnBattlefield(s0, ap, charm);
    s0.objects[a1]!.attachedTo = mine;
    const a2 = putOnBattlefield(s0, opp, charm);
    s0.objects[a2]!.attachedTo = theirs;
    invalidateCharacteristics(s0);
    expect(attackProblem(s0, s0.objects[mine]!, ap)).toBeTruthy();
    expect(attackProblem(s0, s0.objects[mine]!, nextOf(s0, opp))).toBeNull();
    expect(attackProblem(s0, s0.objects[theirs]!, ap)).toBeNull();
    // Your end step: X is the one Aura you control.
    const s = resolveAll(passUntil(s0, "end", ap));
    expect(s.players[opp]!.life).toBe(39);
    expect(s.players[ap]!.life).toBe(41);
  });
});

describe("Vohar, Vodalian Desecrator", () => {
  const vohar = card("Vohar, Vodalian Desecrator", "Legendary Creature — Phyrexian Merfolk Wizard", "{U}{B}", { power: "1", toughness: "2", oracleText: "{T}: Draw a card, then discard a card. If you discarded an instant or sorcery card this way, each opponent loses 1 life and you gain 1 life.\n{2}, Sacrifice Vohar: You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead. Activate only as a sorcery." });
  const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });

  it("is fully supported", () => supported(vohar));

  it("loots; discarding an instant or sorcery drains each opponent for 1", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    const v = putOnBattlefield(s0, ap, vohar);
    let s = resolveAll(run(s0, planActivate(s0, ap, v, 0)));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    s = resolveAll(act(s, { type: "discard", player: ap, objectIds: [ids[0]!] }));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    for (const p of s.turnOrder.filter((p) => p !== ap)) expect(s.players[p]!.life).toBe(39);
    expect(s.players[ap]!.life).toBe(41);
    // Discarding a land: nothing more.
    s.objects[v]!.tapped = false;
    s = resolveAll(run(s, planActivate(s, ap, v, 0)));
    const land = s.players[ap]!.hand.find((id) => characteristics(s, s.objects[id]!).types.includes("Land") || s.cards[s.objects[id]!.cardId]!.types.includes("Land"))!;
    s = resolveAll(act(s, { type: "discard", player: ap, objectIds: [land] }));
    expect(s.players[opp]!.life).toBe(39);
  });

  it("sacrificed: you may cast an instant or sorcery card from your graveyard this turn, and it's exiled afterwards", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    const v = putOnBattlefield(s0, ap, vohar);
    moveObject(s0, ids[0]!, "graveyard");
    let s = resolveAll(run(s0, planActivate(s0, ap, v, 1, [{ kind: "object", id: ids[0]! }])));
    expect(s.objects[v]!.zone).toBe("graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, undefined, { via: "permission" })));
    expect(s.players[opp]!.life).toBe(38);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });
});
