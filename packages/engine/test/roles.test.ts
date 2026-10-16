// Role tokens (CR 111.10j-r, 303.7): colorless Aura Role tokens created attached to a creature. A Role that couldn't
// legally enchant the creature isn't created (rulings); a player keeps only their newest Role on each creature, the
// others go to the graveyard (SBA, CR 704.5z), but Roles from different players coexist.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, island, passAll, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { compileCard, isFullySupported, moveObject, waitingOn, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const monstrousRage = card("Monstrous Rage", "Instant", "{R}", { keywords: ["Role token"], oracleText: "Target creature gets +2/+0 until end of turn. Create a Monster Role token attached to it. (If you control another Role on it, put that one into the graveyard. Enchanted creature gets +1/+1 and has trample.)" });
const cursedCourtier = card("Cursed Courtier", "Creature — Human Noble", "{2}{W}", { power: "3", toughness: "3", keywords: ["Lifelink", "Role token"], oracleText: "Lifelink\nWhen this creature enters, create a Cursed Role token attached to it. (Enchanted creature is 1/1.)" });
const asinineAntics = card("Asinine Antics", "Sorcery", "{2}{U}{U}", { keywords: ["Role token"], oracleText: "You may cast this spell as though it had flash if you pay {2} more to cast it.\nFor each creature your opponents control, create a Cursed Role token attached to that creature. (If you control another Role on it, put that one into the graveyard. Enchanted creature is 1/1.)" });
const gylwain = card("Gylwain, Casting Director", "Legendary Creature — Human Bard", "{1}{G}{W}", { power: "2", toughness: "3", keywords: ["Role token"], oracleText: "Whenever Gylwain or another nontoken creature you control enters, choose one —\n• Create a Royal Role token attached to that creature.\n• Create a Sorcerer Role token attached to that creature.\n• Create a Monster Role token attached to that creature." });
const syrArmont = card("Syr Armont, the Redeemer", "Legendary Creature — Human Knight", "{3}{G}{W}", { power: "4", toughness: "4", keywords: ["Role token"], oracleText: "When Syr Armont enters, create a Monster Role token attached to another target creature you control. (If you control another Role on it, put that one into the graveyard. Enchanted creature gets +1/+1 and has trample.)\nEnchanted creatures you control get +1/+1." });
const royalTreatment = card("Royal Treatment", "Instant", "{G}", { keywords: ["Role token"], oracleText: "Target creature you control gains hexproof until end of turn. Create a Royal Role token attached to that creature. (If you control another Role on it, put that one into the graveyard. Enchanted creature gets +1/+1 and has ward {1}.)" });
const sewerWitch = card("Twisted Sewer-Witch", "Creature — Human Warlock", "{3}{B}{B}", { power: "3", toughness: "4", keywords: ["Role token"], oracleText: 'When this creature enters, create a 1/1 black Rat creature token with "This creature can\'t block." Then for each Rat you control, create a Wicked Role token attached to that Rat. (If you control another Role on it, put that one into the graveyard. Enchanted creature gets +1/+1. When this token is put into a graveyard, each opponent loses 1 life.)' });
const ellivere = card("Ellivere of the Wild Court", "Legendary Creature — Human Knight", "{2}{G}{W}", { power: "4", toughness: "4", keywords: ["Role token"], oracleText: "Whenever Ellivere enters or attacks, create a Virtuous Role token attached to another target creature you control. (If you control another Role on it, put that one into the graveyard. Enchanted creature gets +1/+1 for each enchantment you control.)\nWhenever an enchanted creature you control deals combat damage to a player, draw a card." });
const returnTriumphant = card("Return Triumphant", "Sorcery", "{1}{W}", { keywords: ["Role token"], oracleText: 'Return target creature card with mana value 3 or less from your graveyard to the battlefield. Create a Young Hero Role token attached to it. (Enchanted creature has "Whenever this creature attacks, if its toughness is 3 or less, put a +1/+1 counter on it." If you put another Role on the creature later, put this one into the graveyard.)' });
const protectiveParents = card("Protective Parents", "Creature — Human Peasant", "{2}{W}", { power: "3", toughness: "2", keywords: ["Role token"], oracleText: 'When this creature dies, create a Young Hero Role token attached to up to one target creature you control. (If you control another Role on it, put that one into the graveyard. Enchanted creature has "Whenever this creature attacks, if its toughness is 3 or less, put a +1/+1 counter on it.")' });
const splashy = card("Splashy Spellcaster", "Creature — Elemental Wizard", "{3}{U}", { power: "2", toughness: "4", keywords: ["Role token", "Scry"], oracleText: 'Whenever you cast an instant or sorcery spell, create a Sorcerer Role token attached to up to one other target creature you control. (If you control another Role on it, put that one into the graveyard. Enchanted creature gets +1/+1 and has "Whenever this creature attacks, scry 1.")' });
const venomousVines = card("Venomous Vines", "Sorcery", "{2}{G}{G}", { oracleText: "Destroy target enchanted permanent." });
const doublingSeason = card("Doubling Season", "Enchantment", "{4}{G}", { oracleText: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead." });
const proEnchantments = card("Warded Knight", "Creature — Human Knight", "{1}{W}", { power: "2", toughness: "2", keywords: ["Protection"], oracleText: "Protection from enchantments" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** The names of the Roles attached to `host`, oldest first. */
const roles = (s: GameState, host: string) =>
  s.battlefield
    .map((id) => s.objects[id]!)
    .filter((o) => o.attachedTo === host && s.cards[o.cardId]!.subtypes.includes("Role"))
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((o) => s.cards[o.cardId]!.name.replace(/ Token$/, ""));
const roleIds = (s: GameState, host: string) => s.battlefield.filter((id) => s.objects[id]!.attachedTo === host && s.cards[s.objects[id]!.cardId]!.subtypes.includes("Role"));
/** Passes priority (answering target and mode prompts in order) until the stack and trigger queue are empty. */
function settle(s: GameState, answers: (TargetChoice[] | number[])[] = []): GameState {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: (answers.shift() ?? []) as TargetChoice[] });
    else if (p?.kind === "chooseModes") s = act(s, { type: "chooseModes", player: p.player, modes: (answers.shift() ?? [0]) as number[] });
    else if (p) throw new Error(`unexpected ${p.kind}`);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}
const castAndSettle = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[], answers?: (TargetChoice[] | number[])[]) => settle(cast(s, pid, id, targets), answers);

describe("Role tokens", () => {
  it("parses these cards and every Role token", () => {
    supported(monstrousRage, cursedCourtier, asinineAntics, gylwain, syrArmont, royalTreatment, sewerWitch, ellivere, returnTriumphant, protectiveParents, splashy, venomousVines);
    expect(compileCard(monstrousRage).spell!.effects[1]).toMatchObject({ type: "createToken", attachTo: { ref: "target", index: 0 } });
  });

  it("Monstrous Rage: a Monster Role attached to the target, +1/+1 and trample on top of +2/+0", () => {
    const { s: s0, ap, ids } = setup([monstrousRage]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = castAndSettle(s0, ap, ids[0]!, [target(b)]);
    expect(roles(s, b)).toEqual(["Monster"]);
    expect(pt(s, b)).toBe("5/3");
    const role = s.objects[roleIds(s, b)[0]!]!;
    expect(role.isToken).toBe(true);
    expect(role.controller).toBe(ap);
    expect(s.cards[role.cardId]!.colors).toEqual([]);
  });

  it("Cursed Courtier: its own Cursed Role makes it 1/1", () => {
    const { s: s0, ap, ids } = setup([cursedCourtier]);
    const s = castAndSettle(s0, ap, ids[0]!);
    const c = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Cursed Courtier")!;
    expect(roles(s, c)).toEqual(["Cursed"]);
    expect(pt(s, c)).toBe("1/1");
  });

  it("a new Role from the same player replaces the old one (CR 704.5z); the Cursed Role goes to the graveyard", () => {
    const { s: s0, ap, ids } = setup([cursedCourtier, monstrousRage]);
    let s = castAndSettle(s0, ap, ids[0]!);
    const c = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Cursed Courtier")!;
    const cursed = roleIds(s, c)[0]!;
    s = castAndSettle(s, ap, ids[1]!, [target(c)]);
    expect(roles(s, c)).toEqual(["Monster"]);
    // A token in a graveyard ceases to exist (CR 704.5d, 111.7).
    expect(s.objects[cursed]?.zone ?? "gone").not.toBe("battlefield");
    expect(pt(s, c)).toBe("6/4");
  });

  it("Asinine Antics: a Cursed Role on each creature opponents control; another player's Role on it stays", () => {
    const { s: s0, ap, opp, ids } = setup([asinineAntics, asinineAntics]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, island);
    const theirs = putOnBattlefield(s0, opp, bear({ power: "4", toughness: "4" }));
    const third = putOnBattlefield(s0, s0.turnOrder[2]!, bear({ power: "5", toughness: "5" }));
    const mine = putOnBattlefield(s0, ap, bear({ power: "3", toughness: "3" }));
    let s = castAndSettle(s0, ap, ids[0]!);
    expect(roles(s, theirs)).toEqual(["Cursed"]);
    expect(roles(s, third)).toEqual(["Cursed"]);
    expect(roles(s, mine)).toEqual([]);
    expect(pt(s, theirs)).toBe("1/1");
    expect(pt(s, mine)).toBe("3/3");
    // As if the opponent had created that one: a second Cursed Role from us doesn't replace theirs.
    s.objects[roleIds(s, theirs)[0]!]!.controller = opp;
    s = castAndSettle(s, ap, ids[1]!);
    expect(roles(s, theirs)).toEqual(["Cursed", "Cursed"]);
    expect(roles(s, third)).toEqual(["Cursed"]);
  });

  it("a Role that couldn't legally enchant the creature isn't created (protection from enchantments)", () => {
    const { s: s0, ap, opp, ids } = setup([asinineAntics]);
    const warded = putOnBattlefield(s0, opp, proEnchantments);
    const s = castAndSettle(s0, ap, ids[0]!);
    expect(roles(s, warded)).toEqual([]);
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.subtypes.includes("Role"))).toBe(false);
  });

  it("Royal Treatment: hexproof, then a Royal Role (+1/+1 and ward {1})", () => {
    const { s: s0, ap, ids } = setup([royalTreatment]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = castAndSettle(s0, ap, ids[0]!, [target(b)]);
    expect(roles(s, b)).toEqual(["Royal"]);
    expect(pt(s, b)).toBe("3/3");
  });

  it("Syr Armont: a Monster Role on another target creature, and enchanted creatures you control get +1/+1", () => {
    const { s: s0, ap, ids } = setup([syrArmont]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = castAndSettle(s0, ap, ids[0]!, undefined, [[target(b)]]);
    expect(roles(s, b)).toEqual(["Monster"]);
    expect(pt(s, b)).toBe("4/4");
  });

  it("Gylwain: the chosen Role on the creature that entered", () => {
    const { s: s0, ap, ids } = setup([gylwain, cursedCourtier]);
    let s = castAndSettle(s0, ap, ids[0]!, undefined, [[2]]);
    const g = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Gylwain, Casting Director")!;
    expect(roles(s, g)).toEqual(["Monster"]);
    expect(pt(s, g)).toBe("3/4");
    // Cursed Courtier: its own Cursed Role and Gylwain's Royal Role, in the order the triggers resolve; only the newest stays.
    s = castAndSettle(s, ap, ids[1]!, undefined, [[0]]);
    const c = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Cursed Courtier")!;
    expect(roles(s, c)).toHaveLength(1);
  });

  it("Twisted Sewer-Witch: a Wicked Role on each Rat; when it's put into a graveyard, each opponent loses 1 life", () => {
    const { s: s0, ap, ids } = setup([sewerWitch, venomousVines]);
    let s = castAndSettle(s0, ap, ids[0]!);
    const rat = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Rat Token")!;
    expect(roles(s, rat)).toEqual(["Wicked"]);
    expect(pt(s, rat)).toBe("2/2");
    const life = s.turnOrder.map((p) => s.players[p]!.life);
    s = castAndSettle(s, ap, ids[1]!, [target(rat)]);
    expect(s.objects[rat]?.zone ?? "gone").not.toBe("battlefield");
    expect(s.turnOrder.map((p) => s.players[p]!.life)).toEqual(life.map((l, i) => (s.turnOrder[i] === ap ? l : l - 1)));
  });

  it("Ellivere: a Virtuous Role, +1/+1 for each enchantment you control", () => {
    const { s: s0, ap, ids } = setup([ellivere]);
    const b = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, doublingSeason);
    const s = castAndSettle(s0, ap, ids[0]!, undefined, [[target(b)]]);
    // Doubling Season makes two Virtuous Roles; only one stays (rulings: they're identical). Two enchantments: +2/+2.
    expect(roles(s, b)).toEqual(["Virtuous"]);
    expect(pt(s, b)).toBe("4/4");
  });

  it("Return Triumphant: the returned creature gets a Young Hero Role and a counter when it attacks with toughness 3 or less", () => {
    const small = bear({ name: "Small Bear" });
    const wall = card("Tall Wall", "Creature — Wall", "{2}", { power: "1", toughness: "4" });
    const { s: s0, ap, opp, ids } = setup([returnTriumphant, returnTriumphant]);
    const a = putOnBattlefield(s0, ap, small);
    const w = putOnBattlefield(s0, ap, wall);
    moveObject(s0, a, "graveyard");
    moveObject(s0, w, "graveyard");
    let s = castAndSettle(s0, ap, ids[0]!, [target(a)]);
    s = castAndSettle(s, ap, ids[1]!, [target(w)]);
    expect(roles(s, a)).toEqual(["Young Hero"]);
    expect(roles(s, w)).toEqual(["Young Hero"]);
    s.objects[a]!.controlledSinceTurn = -1;
    s.objects[w]!.controlledSinceTurn = -1;
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: w, defender: opp }] });
    s = settle(s);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, a)).toBe("3/3");
    expect(s.objects[w]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Protective Parents: dying, up to one target creature you control gets a Young Hero Role", () => {
    const { s: s0, ap } = setup([]);
    const parents = putOnBattlefield(s0, ap, protectiveParents);
    const b = putOnBattlefield(s0, ap, bear());
    moveObject(s0, parents, "graveyard");
    const s = settle(passAll(s0), [[target(b)]]);
    expect(roles(s, b)).toEqual(["Young Hero"]);
  });

  it("Splashy Spellcaster: casting an instant puts a Sorcerer Role on up to one other creature", () => {
    const { s: s0, ap, ids } = setup([monstrousRage]);
    putOnBattlefield(s0, ap, splashy);
    const b = putOnBattlefield(s0, ap, bear());
    const c = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    const s = settle(cast(s0, ap, ids[0]!, [target(c)]), [[target(b)]]);
    expect(roles(s, b)).toEqual(["Sorcerer"]);
    expect(roles(s, c)).toEqual(["Monster"]);
    expect(pt(s, b)).toBe("3/3");
  });
});
