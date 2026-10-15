// Small mechanics: graveyard abilities that return their card, "tap target creature defending player controls",
// "can't be blocked except by three or more creatures", Arrest, ingest, annihilator and party (CR 700.8).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, blockersNeeded, botActions, characteristics, isFullySupported, manaAbilityProblem, partySize, planActivate, spellCost, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const bot = (s: GameState): Action => botActions(s, waitingOn(s)!)[0]!;

// Real oracle text (Scryfall).
const abzanDevotee = card("Abzan Devotee", "Creature — Dog Cleric", "{1}{B}", { power: "2", toughness: "1", oracleText: "{1}: Add {W}, {B}, or {G}. Activate only once each turn.\n{2}{B}: Return this card from your graveyard to your hand." });
const drownyardTemple = card("Drownyard Temple", "Land", "", { oracleText: "{T}: Add {C}.\n{3}: Return this card from your graveyard to the battlefield tapped." });
const fiendBinder = card("Fiend Binder", "Creature — Human Soldier", "{3}{W}", { power: "3", toughness: "2", oracleText: "Whenever this creature attacks, tap target creature defending player controls." });
const gorillaBerserkers = card("Gorilla Berserkers", "Creature — Ape Berserker", "{3}{G}{G}", { power: "2", toughness: "3", keywords: ["Trample", "Rampage"], oracleText: "Trample; rampage 2 (Whenever this creature becomes blocked, it gets +2/+2 until end of turn for each creature blocking it beyond the first.)\nThis creature can't be blocked except by three or more creatures." });
const arrest = card("Arrest", "Enchantment — Aura", "{2}{W}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature can't attack or block, and its activated abilities can't be activated." });
const benthicInfiltrator = card("Benthic Infiltrator", "Creature — Eldrazi Drone", "{2}{U}", { power: "1", toughness: "4", keywords: ["Devoid", "Ingest"], oracleText: "Devoid (This card has no color.)\nIngest (Whenever this creature deals combat damage to a player, that player exiles the top card of their library.)\nThis creature can't be blocked." });
const seaGateColossus = card("Sea Gate Colossus", "Artifact Creature — Golem Warrior", "{7}", { power: "7", toughness: "5", oracleText: "This spell costs {1} less to cast for each creature in your party. (Your party consists of up to one each of Cleric, Rogue, Warrior, and Wizard.)" });
const ulamogsCrusher = card("Ulamog's Crusher", "Creature — Eldrazi", "{8}", { power: "8", toughness: "8", keywords: ["Annihilator"], oracleText: "Annihilator 2 (Whenever this creature attacks, defending player sacrifices two permanents of their choice.)\nThis creature attacks each combat if able." });
const llanowarElves = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const cleric = (name: string, subtypes: string) => card(name, `Creature — ${subtypes}`, "{W}", { power: "1", toughness: "1" });
const changeling = card("Changeling Outcast", "Creature — Shapeshifter", "{B}", { power: "1", toughness: "1", keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked." });

/** Move a permanent the helpers made into its owner's graveyard. */
function toGraveyard(s: GameState, id: string) {
  const o = s.objects[id]!;
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  o.zone = "graveyard";
  s.players[o.owner]!.graveyard.push(id);
}

describe("graveyard abilities that return their own card (CR 113.6j)", () => {
  it("works only from the graveyard, and returns the card to its owner's hand", () => {
    supported(abzanDevotee, drownyardTemple);
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, abzanDevotee);
    // On the battlefield the ability can't be activated.
    expect(abilityProblem(s0, ap, id, 0)).toMatch(/works only from your graveyard/);
    toGraveyard(s0, id);
    let s = s0;
    const plan = planActivate(s, ap, id, 0)!;
    expect(plan).toBeTruthy();
    for (const a of plan) s = act(s, a);
    s = passAll(s);
    expect(s.objects[id]!.zone).toBe("hand");
  });

  it("does nothing if the card left the graveyard before it resolves (CR 400.7)", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, drownyardTemple);
    toGraveyard(s0, id);
    let s = s0;
    for (const a of planActivate(s, ap, id, 0)!) s = act(s, a);
    expect(s.stack.length).toBe(1);
    // It's exiled in response: a new object, so the ability does nothing.
    s.players[ap]!.graveyard = s.players[ap]!.graveyard.filter((x) => x !== id);
    s.objects[id]!.zone = "exile";
    s.objects[id]!.zoneChanges = (s.objects[id]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.exile.push(id);
    s = passAll(s);
    expect(s.objects[id]!.zone).toBe("exile");
  });

  it("a land returns to the battlefield tapped", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, drownyardTemple);
    toGraveyard(s0, id);
    let s = s0;
    for (const a of planActivate(s, ap, id, 0)!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[id]!.zone).toBe("battlefield");
    expect(s.objects[id]!.tapped).toBe(true);
  });
});

describe("attack triggers that target what defending player controls", () => {
  it("can only target a creature the attacked player controls", () => {
    supported(fiendBinder);
    const { s: s0, ap, opp } = setup([]);
    const fb = putOnBattlefield(s0, ap, fiendBinder);
    const theirs = putOnBattlefield(s0, opp, bear());
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const elsewhere = putOnBattlefield(s0, other, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: fb, defender: opp }] });
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(elsewhere)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(theirs)] });
    s = passAll(s);
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(s.objects[elsewhere]!.tapped).toBe(false);
  });
});

describe("can't be blocked except by three or more creatures (CR 509.1b)", () => {
  it("needs three blockers; two aren't allowed", () => {
    supported(gorillaBerserkers);
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, gorillaBerserkers);
    const bs = [1, 2, 3].map((i) => putOnBattlefield(s0, opp, bear({ name: `Bear ${i}` })));
    expect(blockersNeeded(s0, s0.objects[g]!)).toBe(3);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] });
    s = passUntil(s, "declareBlockers");
    while (s.pending?.kind !== "declareBlockers" || s.pending.player !== opp) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: bs.slice(0, 2).map((b) => ({ blocker: b, attacker: g })) })).toThrow(/except by 3 or more/);
    const ok = act(s, { type: "declareBlockers", player: opp, blocks: bs.map((b) => ({ blocker: b, attacker: g })) });
    expect(ok.objects[g]!.blockedBy).toHaveLength(3);
    // The bot doesn't try to block it with one creature.
    const b = bot(s);
    expect(b.type === "declareBlockers" && b.blocks.filter((x) => x.attacker === g).length !== 1 && b.blocks.filter((x) => x.attacker === g).length !== 2).toBe(true);
  });
});

describe("Arrest: its activated abilities can't be activated", () => {
  it("stops attacking, blocking and activated abilities, mana abilities included (CR 605.1a)", () => {
    supported(arrest);
    const { s: s0, ap, ids } = setup([arrest]);
    const elf = putOnBattlefield(s0, ap, llanowarElves);
    const devotee = putOnBattlefield(s0, ap, abzanDevotee);
    expect(manaAbilityProblem(s0, ap, s0.objects[elf]!, 0)).toBeNull();
    let s = cast(s0, ap, ids[0]!, [target(elf)]);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(elf);
    const c = characteristics(s, s.objects[elf]!);
    expect(c.cantAttack && c.cantBlock).toBe(true);
    expect(manaAbilityProblem(s, ap, s.objects[elf]!, 0)).toMatch(/can't be activated/);
    expect(() => act(s, { type: "activateMana", player: ap, objectId: elf, mana: "G" })).toThrow();
    // Another creature's abilities still work.
    expect(manaAbilityProblem(s, ap, s.objects[devotee]!, 0, true)).toBeNull();
  });
});

describe("ingest (CR 702.115a)", () => {
  it("the player dealt combat damage exiles the top card of their library", () => {
    supported(benthicInfiltrator);
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, benthicInfiltrator);
    const top = s0.players[opp]!.library[0]!;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 100 && !(s.step === "endCombat"); i++) s = act(s, s.pending ? bot(s) : { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.objects[top]!.mayPlay).toBeUndefined();
  });
});

describe("annihilator (CR 702.86a)", () => {
  it("defending player sacrifices two permanents of their choice", () => {
    supported(ulamogsCrusher);
    const { s: s0, ap, opp } = setup([]);
    const u = putOnBattlefield(s0, ap, ulamogsCrusher);
    const theirs = [1, 2, 3].map((i) => putOnBattlefield(s0, opp, bear({ name: `Bear ${i}` })));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: u, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "pickPermanents"; i++) s = act(s, s.pending ? bot(s) : { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind === "pickPermanents" && s.pending.player).toBe(opp);
    s = act(s, { type: "pickPermanents", player: opp, ids: theirs.slice(0, 2) });
    expect(theirs.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "battlefield"]);
  });
});

describe("party (CR 700.8)", () => {
  it("counts up to one each of Cleric, Rogue, Warrior and Wizard, the largest way", () => {
    supported(seaGateColossus);
    const { s, ap } = setup([seaGateColossus]);
    expect(partySize(s, ap)).toBe(0);
    putOnBattlefield(s, ap, cleric("Priest", "Human Cleric"));
    putOnBattlefield(s, ap, cleric("Battle Priest", "Human Cleric Wizard"));
    // A Cleric and a Cleric Wizard make two (rulings).
    expect(partySize(s, ap)).toBe(2);
    putOnBattlefield(s, ap, cleric("Another Priest", "Human Cleric"));
    expect(partySize(s, ap)).toBe(2);
    putOnBattlefield(s, ap, changeling);
    expect(partySize(s, ap)).toBe(3);
    putOnBattlefield(s, ap, cleric("Thief", "Human Rogue"));
    expect(partySize(s, ap)).toBe(4);
    // Opponents' creatures don't count.
    expect(partySize(s, s.turnOrder.find((p) => p !== ap)!)).toBe(0);
  });

  it("Sea Gate Colossus costs {1} less for each creature in your party", () => {
    const { s, ap, ids } = setup([seaGateColossus]);
    const before = spellCost(s, ap, s.objects[ids[0]!]!);
    putOnBattlefield(s, ap, cleric("Priest", "Human Cleric"));
    putOnBattlefield(s, ap, cleric("Warrior", "Human Warrior"));
    const after = spellCost(s, ap, s.objects[ids[0]!]!);
    expect(before.extra - after.extra).toBe(2);
  });
});
