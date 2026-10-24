// Round 138: round 137's gaps (Bane of the Living's X tried on a copy of the game), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, controllerOf, invalidateCharacteristics, legalActions, manaAbilitiesOn, isFullySupported, objHasKeyword, planActivate, planCast, planForetell, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).name.replace(/ Token$/, "") === name);
const inZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
const faceDown = (s0: GameState, pid: PlayerId, id: string) => resolveAll(run(s0, planCast(s0, pid, id, undefined, undefined, "auto", undefined, { faceDown: true })));

describe("Bane of the Living: bots try each X on a copy of the game", () => {
  const bane = card("Bane of the Living", "Creature — Insect", "{2}{B}{B}", { power: "4", toughness: "3", keywords: ["Morph"], oracleText: "Morph {X}{B}{B}\nWhen this creature is turned face up, all creatures get -X/-X until end of turn." });
  const lord = card("Test Lord", "Creature — Human", "{2}{W}", { power: "2", toughness: "2", oracleText: "Other creatures you control get +1/+1." });

  it("is fully supported", () => supported(bane, lord));

  it("kills an anthem's source and lets its creatures die with it, instead of a bigger X that kills its own", () => {
    const { s: s0, ap, ids } = setup([bane]);
    const opp = nextOf(s0, ap);
    putOnBattlefield(s0, opp, lord);
    for (const k of [1, 2]) putOnBattlefield(s0, opp, bear({ name: `Test Bear ${k}` }));
    putOnBattlefield(s0, ap, bear({ name: "Test Wall", power: "0", toughness: "3" }));
    s0.players[ap]!.hand = [ids[0]!];
    const s = faceDown(s0, ap, ids[0]!);
    const acts = botActions(s, ap);
    // The bears are 3/3 while the lord lives: X = 2 kills the lord, and then the bears (-2/-2 on 2/2). X = 3 would also
    // kill our wall and Bane.
    expect(acts[acts.length - 1]).toMatchObject({ type: "turnFaceUp", objectId: ids[0]!, x: 2 });
    const after = resolveAll(run(s, acts));
    expect(after.battlefield.filter((id) => controllerOf(after, after.objects[id]!) === opp && after.objects[id]!.zone === "battlefield" && /Test (Bear|Lord)/.test(after.cards[after.objects[id]!.cardId]!.name))).toEqual([]);
    expect(named(after, ap, "Test Wall")).toHaveLength(1);
    expect(after.objects[ids[0]!]!.zone).toBe("battlefield");
  });
});

describe("The Necrobloom: land cards in your graveyard have dredge 2", () => {
  const necrobloom = card("The Necrobloom", "Legendary Creature — Plant", "{1}{W}{B}{G}", { power: "2", toughness: "7", keywords: ["Mill", "Landfall"], oracleText: "Landfall — Whenever a land you control enters, create a 0/1 green Plant creature token. If you control seven or more lands with different names, create a 2/2 black Zombie creature token instead.\nLand cards in your graveyard have dredge 2. (You may return a land card from your graveyard to your hand and mill two cards instead of drawing a card.)" });
  const divination = card("Test Divination", "Sorcery", "{1}{U}", { oracleText: "Draw a card." });
  const quarry = card("Test Quarry", "Land", "", { oracleText: "{T}: Add {C}." });

  it("is fully supported", () => supported(necrobloom, divination));

  it("a land card in your graveyard can replace a draw: back to hand, mill two", () => {
    const { s: s0, ap, ids } = setup([divination]);
    putOnBattlefield(s0, ap, necrobloom);
    const land = inZone(s0, ap, quarry, "graveyard");
    const lib = s0.players[ap]!.library.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "dredge", player: ap });
    expect((s.pending as { options: string[] }).options).toContain(land);
    s = act(s, { type: "dredge", player: ap, objectId: land });
    expect(s.players[ap]!.hand).toContain(land);
    expect(s.players[ap]!.library.length).toBe(lib - 2);
    expect(s.log.some((l) => /dredges Test Quarry/.test(l.text))).toBe(true);
  });

  it("not without The Necrobloom, nor a land in an opponent's graveyard, nor with fewer than two cards in the library", () => {
    const { s: s0, ap, ids } = setup([divination, divination, divination]);
    const opp = nextOf(s0, ap);
    inZone(s0, ap, quarry, "graveyard");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeFalsy();
    // Their Necrobloom gives our lands nothing.
    putOnBattlefield(s, opp, necrobloom);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.pending).toBeFalsy();
    // Ours, with one card left in the library: dredge 2 can't (CR 702.52b).
    putOnBattlefield(s, ap, necrobloom);
    s.players[ap]!.library = s.players[ap]!.library.slice(0, 1);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.library).toHaveLength(0);
  });

  it("a bot with no land in hand dredges a land", () => {
    const { s: s0, ap, ids } = setup([divination]);
    putOnBattlefield(s0, ap, necrobloom);
    s0.players[ap]!.hand = [ids[0]!];
    // Few lands out.
    s0.battlefield = s0.battlefield.filter((id) => controllerOf(s0, s0.objects[id]!) !== ap || !s0.cards[s0.objects[id]!.cardId]!.typeLine.includes("Land")).concat(s0.battlefield.filter((id) => controllerOf(s0, s0.objects[id]!) === ap && s0.cards[s0.objects[id]!.cardId]!.typeLine.includes("Land")).slice(-4));
    const land = inZone(s0, ap, quarry, "graveyard");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "dredge" });
    expect(botActions(s, ap)).toEqual([{ type: "dredge", player: ap, objectId: land }]);
  });
});

/** On to `pid`'s next upkeep with its triggers on the stack, choosing `target` for one that asks. */
const toUpkeep = (s: GameState, pid: PlayerId, target?: string | TargetChoice) => {
  s = passUntil(passUntil(s, "draw"), "upkeep", pid);
  for (let i = 0; i < 10 && (s.pending || s.triggerQueue.length) && s.step === "upkeep"; i++) {
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: s.pending.player, targets: target === undefined ? [] : [typeof target === "string" ? { kind: "object", id: target } : target] });
    else if (!s.pending) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    else break;
  }
  return s;
};

describe("Court of Ardenvale", () => {
  const court = card("Court of Ardenvale", "Enchantment", "{2}{W}{W}", { oracleText: "When this enchantment enters, you become the monarch.\nAt the beginning of your upkeep, return target permanent card with mana value 3 or less from your graveyard to your hand. If you're the monarch, return that permanent card to the battlefield instead." });
  const ogre = bear({ name: "Test Ogre", manaCost: "{3}{R}", power: "4", toughness: "4" });

  it("is fully supported", () => supported(court));

  it("returns the card to the battlefield while you're the monarch, to your hand when you're not", () => {
    const { s: s0, ap, ids } = setup([court]);
    const opp = nextOf(s0, ap);
    const b = inZone(s0, ap, bear(), "graveyard");
    inZone(s0, ap, ogre, "graveyard");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.monarch).toBe(ap);
    s = toUpkeep(s, ap, b);
    // Only a card with mana value 3 or less could be the target.
    s = resolveAll(s);
    expect(s.objects[b]!.zone).toBe("battlefield");
    // Not the monarch any more: to the hand.
    s.monarch = opp;
    const b2 = inZone(s, ap, bear({ name: "Test Bear Two" }), "graveyard");
    s = resolveAll(toUpkeep(s, ap, b2));
    expect(s.objects[b2]!.zone).toBe("hand");
  });
});

describe("Reckoner Bankbuster", () => {
  const bankbuster = card("Reckoner Bankbuster", "Artifact — Vehicle", "{2}", { power: "4", toughness: "4", keywords: ["Treasure", "Crew"], oracleText: 'This Vehicle enters with three charge counters on it.\n{2}, {T}, Remove a charge counter from this Vehicle: Draw a card. Then if there are no charge counters on this Vehicle, create a Treasure token and a 1/1 colorless Pilot creature token with "This token crews Vehicles as though its power were 2 greater."\nCrew 3' });

  it("is fully supported", () => supported(bankbuster));

  it("the last counter: a card, a Treasure and a Pilot that crews 3 by itself", () => {
    const { s: s0, ap, ids } = setup([bankbuster]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const v = ids[0]!;
    expect(s.objects[v]!.counters.charge).toBe(3);
    s.objects[v]!.counters.charge = 1;
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planActivate(s, ap, v, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(named(s, ap, "Treasure")).toHaveLength(1);
    const pilot = named(s, ap, "Pilot");
    expect(pilot).toHaveLength(1);
    expect(pt(s, pilot[0]!)).toBe("1/1");
    // Crew 3 with the 1/1 Pilot alone (1 + 2).
    s.objects[pilot[0]!]!.controlledSinceTurn = -1;
    s = act(s, { type: "activateAbility", player: ap, objectId: v, index: 1, tapCreatures: pilot });
    s = resolveAll(s);
    expect(s.objects[pilot[0]!]!.tapped).toBe(true);
  });

  it("with counters left, no tokens; destroyed in response, it counts the counters it last had (CR 608.2h)", () => {
    const shatter = card("Test Shatter", "Instant", "{1}{R}", { oracleText: "Destroy target artifact." });
    const { s: s0, ap, ids } = setup([bankbuster, shatter, shatter]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const v = ids[0]!;
    s = resolveAll(run(s, planActivate(s, ap, v, 0)));
    expect(s.objects[v]!.counters.charge).toBe(2);
    expect(named(s, ap, "Pilot")).toHaveLength(0);
    // One counter left as it's destroyed: no tokens.
    s.objects[v]!.tapped = false;
    s = run(s, planActivate(s, ap, v, 0));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: v }])));
    expect(s.objects[v]!.zone).toBe("graveyard");
    expect(named(s, ap, "Pilot")).toHaveLength(0);
  });

  it("its last counter removed, then destroyed in response: the tokens are still made", () => {
    const shatter = card("Test Shatter", "Instant", "{1}{R}", { oracleText: "Destroy target artifact." });
    const { s: s0, ap, ids } = setup([bankbuster, shatter]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const v = ids[0]!;
    s.objects[v]!.counters.charge = 1;
    s = run(s, planActivate(s, ap, v, 0));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: v }])));
    expect(s.objects[v]!.zone).toBe("graveyard");
    expect(named(s, ap, "Pilot")).toHaveLength(1);
    expect(named(s, ap, "Treasure")).toHaveLength(1);
  });
});

/** The index of the activated ability of `id` whose text starts with `start`. */
const abilityIndex = (s: GameState, id: string, start: string) => {
  const i = abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.text.startsWith(start));
  if (i < 0) throw new Error(`no ability "${start}"`);
  return i;
};

describe("Mutable Explorer: a tapped Mutavault token", () => {
  const explorer = card("Mutable Explorer", "Creature — Shapeshifter", "{2}{G}", { power: "1", toughness: "1", keywords: ["Changeling"], oracleText: 'Changeling (This card is every creature type.)\nWhen this creature enters, create a tapped Mutavault token. (It\'s a land with "{T}: Add {C}" and "{1}: This token becomes a 2/2 creature with all creature types until end of turn. It\'s still a land.")' });

  it("is fully supported", () => supported(explorer));

  it("the token is a tapped land named Mutavault that taps for {C} and becomes a 2/2 with all creature types", () => {
    const { s: s0, ap, ids } = setup([explorer]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const [vault] = named(s, ap, "Mutavault");
    expect(vault).toBeDefined();
    const o = s.objects[vault!]!;
    expect(o.tapped).toBe(true);
    expect(characteristics(s, o).types).toEqual(["Land"]);
    expect(manaAbilitiesOn(s, o).length).toBeGreaterThan(0);
    s = resolveAll(run(s, planActivate(s, ap, vault!, abilityIndex(s, vault!, "{1}"))));
    const c = characteristics(s, s.objects[vault!]!);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.allCreatureTypes).toBe(true);
    expect(pt(s, vault!)).toBe("2/2");
  });
});

describe("Blacksmith's Talent", () => {
  const talent = card("Blacksmith's Talent", "Enchantment — Class", "{R}", { oracleText: '(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, create a colorless Equipment artifact token named Sword with "Equipped creature gets +1/+1" and equip {2}.\n{2}{R}: Level 2\nAt the beginning of combat on your turn, attach target Equipment you control to up to one target creature you control.\n{3}{R}: Level 3\nDuring your turn, equipped creatures you control have double strike and haste.' });
  const ironHills = card("Iron Hills Blacksmith", "Creature — Dwarf Artificer", "{1}{W}", { power: "1", toughness: "1", keywords: ["Double strike"], oracleText: 'Double strike\nWhen this creature enters, create a colorless Equipment artifact token named Axe with "Equipped creature gets +1/+0" and equip {2}.' });

  it("are fully supported", () => supported(talent, ironHills));

  it("a Sword token that equips for {2}; level 3 gives equipped creatures double strike and haste during your turn only", () => {
    const { s: s0, ap, ids } = setup([talent]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const [sword] = named(s, ap, "Sword");
    expect(sword).toBeDefined();
    expect(characteristics(s, s.objects[sword!]!).subtypes).toEqual(["Equipment"]);
    s = resolveAll(run(s, planActivate(s, ap, sword!, abilityIndex(s, sword!, "Equip"), [{ kind: "object", id: b }])));
    expect(s.objects[sword!]!.attachedTo).toBe(b);
    expect(pt(s, b)).toBe("3/3");
    expect(objHasKeyword(s, s.objects[b]!, "Double strike")).toBe(false);
    s = resolveAll(run(s, planActivate(s, ap, ids[0]!, abilityIndex(s, ids[0]!, "{2}{R}"))));
    s = resolveAll(run(s, planActivate(s, ap, ids[0]!, abilityIndex(s, ids[0]!, "{3}{R}"))));
    expect(s.objects[ids[0]!]!.classLevel).toBe(3);
    expect(objHasKeyword(s, s.objects[b]!, "Double strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Haste")).toBe(true);
    // Another player's turn: not now. (Level 2's trigger attaches the Sword to the bear again on the way.)
    for (let i = 0; i < 200 && !(s.step === "upkeep" && s.activePlayer === nextOf(s, ap)); i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: sword! }, { kind: "object", id: b }] });
      else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: ap, attacks: [] });
      else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: s.pending.player, objectIds: s.players[s.pending.player]!.hand.slice(0, s.pending.count) });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[sword!]!.attachedTo).toBe(b);
    expect(objHasKeyword(s, s.objects[b]!, "Double strike")).toBe(false);
  });

  it("level 2: at the beginning of combat on your turn, attach target Equipment to up to one target creature", () => {
    const { s: s0, ap, ids } = setup([talent]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const [sword] = named(s, ap, "Sword");
    s = resolveAll(run(s, planActivate(s, ap, ids[0]!, abilityIndex(s, ids[0]!, "{2}{R}"))));
    expect(s.objects[ids[0]!]!.classLevel).toBe(2);
    for (let i = 0; i < 20 && s.step !== "beginCombat"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && s.step === "beginCombat" && s.objects[sword!]!.attachedTo !== b; i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: sword! }, { kind: "object", id: b }] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[sword!]!.attachedTo).toBe(b);
  });
});

const untappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && !s.objects[id]!.tapped && characteristics(s, s.objects[id]!).types.includes("Land")).length;

/** `pid` attacks with `attacks` from its first main phase; the attack triggers resolve. */
const attack = (s: GameState, pid: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => {
  s = act(passUntil(s, "declareAttackers", pid), { type: "declareAttackers", player: pid, attacks });
  return resolveAll(s);
};

describe("Martial Impetus and Sigil of Valor: other than the enchanted or equipped creature", () => {
  const impetus = card("Martial Impetus", "Enchantment — Aura", "{2}{W}", { keywords: ["Goad", "Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+1 and is goaded. (It attacks each combat if able and attacks a player other than you if able.)\nWhenever enchanted creature attacks, each other creature that's attacking one of your opponents gets +1/+1 until end of turn." });
  const sigil = card("Sigil of Valor", "Artifact — Equipment", "{2}", { keywords: ["Equip"], oracleText: "Whenever equipped creature attacks alone, it gets +1/+1 until end of turn for each other creature you control.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)" });

  it("are fully supported", () => supported(impetus, sigil));

  it("Martial Impetus: the other creatures attacking your opponents get +1/+1, not the enchanted one", () => {
    const { s: s0, ap, ids } = setup([impetus]);
    const opp = nextOf(s0, ap);
    const a = putOnBattlefield(s0, ap, bear({ name: "Test Bear A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Bear B" }));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: a }])));
    expect(pt(s, a)).toBe("3/3");
    s = attack(s, ap, [{ attacker: a, defender: opp }, { attacker: b, defender: nextOf(s, opp) }]);
    expect(pt(s, a)).toBe("3/3");
    expect(pt(s, b)).toBe("3/3");
  });

  it("Martial Impetus on an opponent's creature: only creatures attacking the Aura's controller's opponents", () => {
    const { s: s0, ap, ids } = setup([impetus]);
    const opp = nextOf(s0, ap);
    const third = nextOf(s0, opp);
    const x = putOnBattlefield(s0, opp, bear({ name: "Test Bear X" }));
    const y = putOnBattlefield(s0, opp, bear({ name: "Test Bear Y" }));
    const z = putOnBattlefield(s0, opp, bear({ name: "Test Bear Z" }));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: x }])));
    // On its controller's turn it attacks (goaded: not us); Y attacks another opponent of ours, Z attacks us.
    s = passUntil(s, "main1", opp);
    s = attack(s, opp, [{ attacker: x, defender: third }, { attacker: y, defender: third }, { attacker: z, defender: ap }]);
    expect(pt(s, x)).toBe("3/3");
    expect(pt(s, y)).toBe("3/3");
    expect(pt(s, z)).toBe("2/2");
  });

  it("Sigil of Valor counts the other creatures you control, not the attacker", () => {
    const { s: s0, ap, ids } = setup([sigil]);
    const opp = nextOf(s0, ap);
    const a = putOnBattlefield(s0, ap, bear({ name: "Test Bear A" }));
    putOnBattlefield(s0, ap, bear({ name: "Test Bear B" }));
    putOnBattlefield(s0, ap, bear({ name: "Test Bear C" }));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = resolveAll(run(s, planActivate(s, ap, ids[0]!, abilityIndex(s, ids[0]!, "Equip"), [{ kind: "object", id: a }])));
    s = attack(s, ap, [{ attacker: a, defender: opp }]);
    // Two other creatures (the commanders are in the command zone).
    expect(pt(s, a)).toBe("4/4");
  });
});

describe("Laughing Jasper Flint", () => {
  const jasper = card("Laughing Jasper Flint", "Legendary Creature — Lizard Rogue", "{1}{B}{R}", { power: "4", toughness: "3", oracleText: "Creatures you control but don't own are Mercenaries in addition to their other types.\nAt the beginning of your upkeep, exile the top X cards of target opponent's library, where X is the number of outlaws you control. Until end of turn, you may cast spells from among those cards, and mana of any type can be spent to cast those spells." });
  const elk = bear({ name: "Test Green Elk", manaCost: "{G}{G}" });

  it("is fully supported", () => supported(jasper));

  it("a creature you control but don't own is a Mercenary, so an outlaw; X of their cards exiled, spells cast with any mana, no lands", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    putOnBattlefield(s0, ap, jasper);
    const stolen = putOnBattlefield(s0, opp, bear({ name: "Test Stolen Bear" }));
    s0.objects[stolen]!.controller = ap;
    invalidateCharacteristics(s0);
    expect(characteristics(s0, s0.objects[stolen]!).subtypes).toEqual(expect.arrayContaining(["Bear", "Mercenary"]));
    // Our own bear isn't.
    const mine = putOnBattlefield(s0, ap, bear());
    expect(characteristics(s0, s0.objects[mine]!).subtypes).not.toContain("Mercenary");
    // No Forests: the Elk needs mana of any type.
    s0.battlefield = s0.battlefield.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name !== "Forest" || controllerOf(s0, s0.objects[id]!) !== ap);
    const elkId = inZone(s0, opp, elk, "library");
    const land = inZone(s0, opp, card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." }), "library");
    // Jasper and the stolen bear: X = 2, the land and the Elk.
    let s = toUpkeep(s0, ap, { kind: "player", id: opp });
    // On top of their library now (they drew on their turn).
    s.players[opp]!.library = [elkId, land, ...s.players[opp]!.library.filter((id) => id !== elkId && id !== land)];
    s.players[opp]!.hand = s.players[opp]!.hand.filter((id) => id !== elkId && id !== land);
    s.objects[elkId]!.zone = "library";
    s.objects[land]!.zone = "library";
    s = resolveAll(s);
    expect([s.objects[elkId]!.zone, s.objects[land]!.zone]).toEqual(["exile", "exile"]);
    s = passUntil(s, "main1", ap);
    expect(planCast(s, ap, elkId)).not.toBeNull();
    expect(legalActions(s, ap).some((a) => a.type === "playLand" && a.objectId === land)).toBe(false);
    s = resolveAll(run(s, planCast(s, ap, elkId)));
    expect(s.objects[elkId]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[elkId]!)).toBe(ap);
    // The Elk is theirs: a Mercenary now.
    expect(characteristics(s, s.objects[elkId]!).subtypes).toContain("Mercenary");
  });
});

describe("Fortune Teller's Talent and Sage of the Beyond", () => {
  const talent = card("Fortune Teller's Talent", "Enchantment — Class", "{U}", { oracleText: "(Gain the next level as a sorcery to add its ability.)\nYou may look at the top card of your library any time.\n{3}{U}: Level 2\nAs long as you've cast a spell this turn, you may play cards from the top of your library.\n{2}{U}: Level 3\nSpells you cast from anywhere other than your hand cost {2} less to cast." });
  const sage = card("Sage of the Beyond", "Creature — Spirit Giant", "{5}{U}{U}", { power: "5", toughness: "5", keywords: ["Flying", "Foretell"], oracleText: "Flying\nSpells you cast from anywhere other than your hand cost {2} less to cast.\nForetell {4}{U} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)" });
  const ogre = bear({ name: "Test Ogre", manaCost: "{4}{G}", power: "4", toughness: "4" });
  const shock = card("Test Spark", "Instant", "{R}", { oracleText: "Test Spark deals 1 damage to any target." });

  it("are fully supported", () => supported(talent, sage));

  it("level 2: the top of the library is playable only once you've cast a spell this turn; level 3: {2} less from there, not from hand", () => {
    const { s: s0, ap, ids } = setup([talent, shock, ogre]);
    const opp = nextOf(s0, ap);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = resolveAll(run(s, planActivate(s, ap, ids[0]!, abilityIndex(s, ids[0]!, "{3}{U}"))));
    s = resolveAll(run(s, planActivate(s, ap, ids[0]!, abilityIndex(s, ids[0]!, "{2}{U}"))));
    expect(s.objects[ids[0]!]!.classLevel).toBe(3);
    // A fresh turn of ours: nothing cast yet.
    s = passUntil(passUntil(s, "upkeep", opp), "main1", ap);
    expect(s.castThisTurn ?? []).toEqual([]);
    const top = inZone(s, ap, ogre, "library");
    expect(planCast(s, ap, top)).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    const pool = untappedLands(s, ap);
    s = resolveAll(run(s, planCast(s, ap, top)));
    expect(s.objects[top]!.zone).toBe("battlefield");
    // {4}{G} less {2}: three lands.
    expect(pool - untappedLands(s, ap)).toBe(3);
  });

  it("Sage of the Beyond: a foretold card costs {2} less; one from hand doesn't", () => {
    const { s: s0, ap, ids } = setup([ogre]);
    putOnBattlefield(s0, ap, sage);
    const before = untappedLands(s0, ap);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(before - untappedLands(s, ap)).toBe(5);
    // Foretold ({2}), then cast for {4}{U} on a later turn: {2}{U}.
    const sage2 = inZone(s, ap, sage, "hand");
    s = run(s, planForetell(s, ap, sage2));
    s = passUntil(passUntil(s, "upkeep", nextOf(s, ap)), "main1", ap);
    const lands = untappedLands(s, ap);
    s = resolveAll(run(s, planCast(s, ap, sage2, undefined, undefined, "auto", undefined, { alt: "foretell" })));
    expect(s.objects[sage2]!.zone).toBe("battlefield");
    expect(lands - untappedLands(s, ap)).toBe(3);
  });
});

describe("Tifa, Martial Artist", () => {
  const tifa = card("Tifa, Martial Artist", "Legendary Creature — Human Monk", "{1}{R}{G}{W}", { power: "4", toughness: "4", keywords: ["Melee"], oracleText: "Melee (Whenever this creature attacks, it gets +1/+1 until end of turn for each opponent you attacked this combat.)\nWhenever one or more creatures you control with power 7 or greater deal combat damage to a player, untap all creatures you control. If it's the first combat phase of your turn, there is an additional combat phase after this phase." });
  const giant = bear({ name: "Test Giant", power: "7", toughness: "7" });

  it("is fully supported", () => supported(tifa));

  it("a 7-power creature's combat damage untaps your creatures; an additional combat only after the first", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    putOnBattlefield(s0, ap, tifa);
    const g = putOnBattlefield(s0, ap, giant);
    const life = s0.players[opp]!.life;
    let s = attack(s0, ap, [{ attacker: g, defender: opp }]);
    expect(s.objects[g]!.tapped).toBe(true);
    s = resolveAll(passUntil(s, "combatDamage", ap));
    s = resolveAll(s);
    expect(s.players[opp]!.life).toBe(life - 7);
    expect(s.objects[g]!.tapped).toBe(false);
    // The second combat phase, straight after this one (no main phase in between, rulings).
    for (let i = 0; i < 20 && s.step !== "declareAttackers"; i++) {
      expect(s.step).not.toBe("main2");
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.combatsThisTurn).toBe(2);
    s = resolveAll(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] }));
    s = resolveAll(passUntil(s, "combatDamage", ap));
    s = resolveAll(s);
    expect(s.players[opp]!.life).toBe(life - 14);
    expect(s.objects[g]!.tapped).toBe(false);
    // No third.
    s = passUntil(s, "main2", ap);
    expect(s.combatsThisTurn).toBe(2);
  });

  it("not for a smaller creature", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextOf(s0, ap);
    putOnBattlefield(s0, ap, tifa);
    const b = putOnBattlefield(s0, ap, bear());
    let s = attack(s0, ap, [{ attacker: b, defender: opp }]);
    s = resolveAll(passUntil(s, "combatDamage", ap));
    s = resolveAll(s);
    expect(s.objects[b]!.tapped).toBe(true);
  });
});

describe("Might of the Meek", () => {
  const might = card("Might of the Meek", "Instant", "{R}", { oracleText: "Target creature gains trample until end of turn. It also gets +1/+0 until end of turn if you control a Mouse.\nDraw a card." });
  const mouse = bear({ name: "Test Mouse", typeLine: "Creature — Mouse", subtypes: ["Mouse"] });

  it("is fully supported", () => supported(might));

  it("+1/+0 only with a Mouse", () => {
    const { s: s0, ap, ids } = setup([might, might]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }])));
    expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(true);
    expect(pt(s, b)).toBe("2/2");
    putOnBattlefield(s, ap, mouse);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: b }])));
    expect(pt(s, b)).toBe("3/2");
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("Spinner of Souls", () => {
  const spinner = card("Spinner of Souls", "Creature — Spider Spirit", "{2}{G}", { power: "4", toughness: "3", keywords: ["Reach"], oracleText: "Reach\nWhenever another nontoken creature you control dies, you may reveal cards from the top of your library until you reveal a creature card. Put that card into your hand and the rest on the bottom of your library in a random order." });
  const murder = card("Test Murder", "Instant", "{B}", { oracleText: "Destroy target creature." });

  it("is fully supported", () => supported(spinner));

  it("you may: a creature card to hand, the rest on the bottom; or nothing", () => {
    const { s: s0, ap, ids } = setup([murder, murder]);
    putOnBattlefield(s0, ap, spinner);
    const b1 = putOnBattlefield(s0, ap, bear({ name: "Test Bear One" }));
    const b2 = putOnBattlefield(s0, ap, bear({ name: "Test Bear Two" }));
    const land = inZone(s0, ap, card("Test Wastes", "Land"), "library");
    const lib = s0.players[ap]!.library.length;
    s0.players[ap]!.library = [land, ...s0.players[ap]!.library.filter((id) => id !== land)];
    const creature = s0.players[ap]!.library.find((id) => s0.cards[s0.objects[id]!.cardId]!.typeLine.startsWith("Creature"))!;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b1 }])));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.hand).toContain(creature);
    // Revealed before it: our land and the Forests, on the bottom in a random order.
    const revealed = s0.players[ap]!.library.indexOf(creature);
    expect(s.players[ap]!.library.slice(-revealed)).toContain(land);
    expect(s.players[ap]!.library.length).toBe(lib - 1);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: b2 }])));
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });
});

describe("Nibelheim Aflame", () => {
  const aflame = card("Nibelheim Aflame", "Sorcery", "{2}{R}{R}", { keywords: ["Flashback"], oracleText: "Choose target creature you control. It deals damage equal to its power to each other creature. If this spell was cast from a graveyard, discard your hand and draw four cards.\nFlashback {5}{R}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
  const ogre = bear({ name: "Test Ogre", power: "4", toughness: "4" });
  const big = bear({ name: "Test Big", power: "1", toughness: "5" });
  const proRed = bear({ name: "Test White Knight", oracleText: "Protection from red", keywords: ["Protection"] });

  it("is fully supported", () => supported(aflame));

  it("the target deals damage equal to its power to each other creature (it's the source, not the red spell)", () => {
    const { s: s0, ap, ids } = setup([aflame]);
    const opp = nextOf(s0, ap);
    const o = putOnBattlefield(s0, ap, ogre);
    const k = putOnBattlefield(s0, opp, proRed);
    const b = putOnBattlefield(s0, opp, bear());
    const g = putOnBattlefield(s0, ap, big);
    const hand = s0.players[ap]!.hand.length;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: o }])));
    expect([s.objects[k]!.zone, s.objects[b]!.zone, s.objects[g]!.zone, s.objects[o]!.zone]).toEqual(["graveyard", "graveyard", "battlefield", "battlefield"]);
    expect(s.objects[o]!.damage).toBe(0);
    expect(s.objects[g]!.damage).toBe(4);
    // From the hand: no discard and draw.
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("with flashback: also discard your hand and draw four", () => {
    const { s: s0, ap, ids } = setup([bear(), bear()]);
    const o = putOnBattlefield(s0, ap, ogre);
    const f = inZone(s0, ap, aflame, "graveyard");
    let s = run(s0, planCast(s0, ap, f, [{ kind: "object", id: o }], undefined, undefined, undefined, { via: "flashback" }));
    s = resolveAll(s);
    expect(s.objects[f]!.zone).toBe("exile");
    expect(s.players[ap]!.hand).toHaveLength(4);
    expect(s.players[ap]!.hand).not.toContain(ids[0]);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});

describe("Flourishing Defenses", () => {
  const defenses = card("Flourishing Defenses", "Enchantment", "{4}{G}", { oracleText: "Whenever a -1/-1 counter is put on a creature, you may create a 1/1 green Elf Warrior creature token." });
  const weaken = card("Test Weaken", "Instant", "{B}", { oracleText: "Put two -1/-1 counters on target creature." });
  const growth = card("Test Growth", "Instant", "{G}", { oracleText: "Put two +1/+1 counters on target creature." });

  it("is fully supported", () => supported(defenses));

  it("once for each -1/-1 counter, on anyone's creature; not for +1/+1 counters", () => {
    const { s: s0, ap, ids } = setup([weaken, growth]);
    const opp = nextOf(s0, ap);
    putOnBattlefield(s0, ap, defenses);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Test Big Bear", power: "5", toughness: "5" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: theirs }]));
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++)
      s = s.pending?.kind === "chooseMay" ? act(s, { type: "chooseMay", player: s.pending.player, yes: true }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(named(s, ap, "Elf Warrior")).toHaveLength(2);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: theirs }])));
    expect(s.pending).toBeFalsy();
    expect(named(s, ap, "Elf Warrior")).toHaveLength(2);
  });
});

describe("Legion's Landing // Adanto, the First Fort", () => {
  const landing = scry("transform", [
    { name: "Legion's Landing", mana_cost: "{W}", type_line: "Legendary Enchantment", oracle_text: "When Legion's Landing enters, create a 1/1 white Vampire creature token with lifelink.\nWhen you attack with three or more creatures, transform Legion's Landing." },
    { name: "Adanto, the First Fort", type_line: "Legendary Land", oracle_text: "(Transforms from Legion's Landing.)\n{T}: Add {W}.\n{2}{W}, {T}: Create a 1/1 white Vampire creature token with lifelink." },
  ]);

  it("is fully supported", () => supported(landing));

  it("a lifelink Vampire; transforms when you attack with three creatures, not two", () => {
    const { s: s0, ap, ids } = setup([landing]);
    const opp = nextOf(s0, ap);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const [vamp] = named(s, ap, "Vampire");
    expect(vamp).toBeDefined();
    expect(objHasKeyword(s, s.objects[vamp!]!, "Lifelink")).toBe(true);
    const b1 = putOnBattlefield(s, ap, bear({ name: "Test Bear One" }));
    const b2 = putOnBattlefield(s, ap, bear({ name: "Test Bear Two" }));
    s.objects[vamp!]!.controlledSinceTurn = -1;
    const two = attack(structuredClone(s), ap, [{ attacker: b1, defender: opp }, { attacker: b2, defender: opp }]);
    expect(characteristics(two, two.objects[ids[0]!]!).name).toBe("Legion's Landing");
    s = attack(s, ap, [{ attacker: b1, defender: opp }, { attacker: b2, defender: opp }, { attacker: vamp!, defender: opp }]);
    const c = characteristics(s, s.objects[ids[0]!]!);
    expect(c.name).toBe("Adanto, the First Fort");
    expect(c.types).toEqual(["Land"]);
  });
});
