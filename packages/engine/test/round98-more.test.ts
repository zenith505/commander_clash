// Round 98, more cards: Dusk // Dawn ("creature cards with power 2 or less"), Agadeem's Awakening (targets that each have
// a different mana value, CR 601.2c), All Is Dust and Epicenter ("sacrifices all ... they control", colored permanents,
// CR 105.2c), Moraug (+1/+0 for each time it attacked; "at the beginning of that combat", CR 603.7 and the rulings),
// Chain of Vapor and Chain of Acid (that permanent's controller copies the spell, CR 707.10), and "permanents you own"
// (Brand, Gruul Charm, CR 108.3).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, forest, passUntil, putOnBattlefield, scry, setup, target } from "./helpers";
import { castProblem, controllerOf, isFullySupported, planCast, power, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const duskDawn = scry("split", [
  { name: "Dusk", mana_cost: "{2}{W}{W}", type_line: "Sorcery", oracle_text: "Destroy all creatures with power 3 or greater." },
  { name: "Dawn", mana_cost: "{3}{W}{W}", type_line: "Sorcery", oracle_text: "Aftermath (Cast this spell only from your graveyard. Then exile it.)\nReturn all creature cards with power 2 or less from your graveyard to your hand." },
], { keywords: ["Aftermath"] });
const agadeem = scry("modal_dfc", [
  { name: "Agadeem's Awakening", mana_cost: "{X}{B}{B}{B}", type_line: "Sorcery", oracle_text: "Return from your graveyard to the battlefield any number of target creature cards that each have a different mana value X or less." },
  { name: "Agadeem, the Undercrypt", mana_cost: "", type_line: "Land", oracle_text: "As this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {B}." },
]);
const allIsDust = card("All Is Dust", "Kindred Sorcery — Eldrazi", "{7}", { oracleText: "Each player sacrifices all permanents they control that are one or more colors." });
const moraug = card("Moraug, Fury of Akoum", "Legendary Creature — Minotaur Warrior", "{4}{R}{R}", { power: "6", toughness: "6", keywords: ["Landfall"], oracleText: "Each creature you control gets +1/+0 for each time it has attacked this turn.\nLandfall — Whenever a land you control enters, if it's your main phase, there's an additional combat phase after this phase. At the beginning of that combat, untap all creatures you control." });
const chainOfVapor = card("Chain of Vapor", "Instant", "{U}", { oracleText: "Return target nonland permanent to its owner's hand. Then that permanent's controller may sacrifice a land of their choice. If the player does, they may copy this spell and may choose a new target for that copy." });
const chainOfAcid = card("Chain of Acid", "Sorcery", "{3}{G}", { oracleText: "Destroy target noncreature permanent. Then that permanent's controller may copy this spell and may choose a new target for that copy." });
const gruulCharm = card("Gruul Charm", "Instant", "{R}{G}", { oracleText: "Choose one —\n• Creatures without flying can't block this turn.\n• Gain control of all permanents you own.\n• Gruul Charm deals 3 damage to each creature with flying." });
const brand = card("Brand", "Instant", "{R}", { keywords: ["Cycling"], oracleText: "Gain control of all permanents you own. (This effect lasts indefinitely.)\nCycling {2} ({2}, Discard this card: Draw a card.)" });
const epicenter = card("Epicenter", "Sorcery", "{4}{R}", { keywords: ["Threshold"], oracleText: "Target player sacrifices a land of their choice.\nThreshold — Each player sacrifices all lands they control instead if there are seven or more cards in your graveyard." });
const uginsConstruct = card("Ugin's Construct", "Artifact Creature — Construct", "{4}", { power: "4", toughness: "5", oracleText: "When this creature enters, sacrifice a permanent that's one or more colors." });

const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const elf = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1" });
const ornithopter = card("Ornithopter", "Artifact Creature — Thopter", "", { power: "0", toughness: "2", keywords: ["Flying"] });
const trinket = card("Trinket", "Artifact", "{1}");
const ward = card("White Ward", "Enchantment", "{W}");
const hulk = card("Big Hulk", "Creature — Beast", "{5}{G}", { power: "6", toughness: "6" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const nextAfter = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % 4]!;
function to(s: GameState, pid: PlayerId, zone: "graveyard" | "library" | "hand", def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
}

describe("round 98, more cards", () => {
  it("parse", () => {
    supported(duskDawn, agadeem, allIsDust, moraug, chainOfVapor, chainOfAcid, gruulCharm, brand, epicenter, uginsConstruct);
  });

  it("Dawn returns only the creature cards with power 2 or less from your graveyard", () => {
    const { s: s0, ap } = setup([]);
    const dd = to(s0, ap, "graveyard", duskDawn);
    const small = to(s0, ap, "graveyard", bear());
    const big = to(s0, ap, "graveyard", giant);
    const s = settle(run(s0, planCast(s0, ap, dd, undefined, undefined, "auto", undefined, { face: 1, via: "aftermath" })));
    expect(s.objects[small]!.zone).toBe("hand");
    expect(s.objects[big]!.zone).toBe("graveyard");
    expect(s.objects[dd]!.zone).toBe("exile");
  });

  it("Agadeem's Awakening: each target a different mana value, X or less", () => {
    const { s: s0, ap, ids } = setup([agadeem]);
    putOnBattlefield(s0, ap, card("Swamp", "Basic Land — Swamp"));
    const mv1 = to(s0, ap, "graveyard", elf);
    const mv2 = to(s0, ap, "graveyard", bear());
    const mv2b = to(s0, ap, "graveyard", bear({ name: "Other Bear" }));
    const mv4 = to(s0, ap, "graveyard", giant);
    const mv0 = to(s0, ap, "graveyard", ornithopter);
    // Two with mana value 2 can't both be chosen, and 4 is more than X = 2.
    expect(castProblem(s0, ap, ids[0]!, [target(mv2), target(mv2b)], undefined, undefined, undefined, 2)).toMatch(/target/);
    expect(planCast(s0, ap, ids[0]!, [target(mv2), target(mv2b)], undefined, "auto", 2)).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [target(mv4)], undefined, "auto", 2)).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(mv0), target(mv1), target(mv2)], undefined, "auto", 2)));
    for (const id of [mv0, mv1, mv2]) expect(s.objects[id]!.zone).toBe("battlefield");
    for (const id of [mv2b, mv4]) expect(s.objects[id]!.zone).toBe("graveyard");
  });

  it("All Is Dust: every player sacrifices their colored permanents; colorless ones and lands stay", () => {
    const { s: s0, ap, ids } = setup([allIsDust]);
    const opp = nextAfter(s0, ap);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, giant);
    const pw = putOnBattlefield(s0, opp, ward);
    const thopter = putOnBattlefield(s0, opp, ornithopter);
    const art = putOnBattlefield(s0, ap, trinket);
    const land = putOnBattlefield(s0, opp, forest);
    const s = settle(cast(s0, ap, ids[0]!));
    for (const id of [mine, theirs, pw]) expect(s.objects[id]!.zone).toBe("graveyard");
    for (const id of [thopter, art, land]) expect(s.objects[id]!.zone).toBe("battlefield");
  });

  it("Epicenter with threshold: each player sacrifices all their lands", () => {
    const { s: s0, ap, ids } = setup([epicenter]);
    const opp = nextAfter(s0, ap);
    const theirs = [putOnBattlefield(s0, opp, forest), putOnBattlefield(s0, opp, forest)];
    for (let i = 0; i < 7; i++) to(s0, ap, "graveyard", bear());
    const s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    for (const id of theirs) expect(s.objects[id]!.zone).toBe("graveyard");
    expect(s.battlefield.some((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land"))).toBe(false);
  });

  it("Ugin's Construct: sacrifice a colored permanent", () => {
    const { s: s0, ap, ids } = setup([uginsConstruct]);
    const b = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, trinket);
    const s = settle(cast(s0, ap, ids[0]!));
    // The only colored one: the Bear.
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Moraug: a land in your first main phase adds a combat before the regular one, untapping your creatures only then", () => {
    const { s: s0, ap, ids } = setup([forest]);
    const opp = nextAfter(s0, ap);
    putOnBattlefield(s0, ap, moraug);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.tapped = true;
    s0.players[ap]!.landsPlayed = 0;
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }));
    expect(s.addedPhases).toEqual([{ combat: 1 }]);
    // The added combat: its beginning untaps the Bear.
    s = passUntil(s, "beginCombat", ap);
    s = settle(s);
    for (let i = 0; i < 10 && s.objects[b]!.tapped; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[b]!.tapped).toBe(false);
    s = settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] }));
    expect(power(s, s.objects[b]!)).toBe(3);
    // The regular combat: no untap this time, so the tapped Bear can't attack again.
    s = passUntil(s, "endCombat", ap);
    s = passUntil(s, "beginCombat", ap);
    s = settle(s);
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.step).toBe("beginCombat");
  });

  it("Chain of Vapor: the bounced permanent's controller may sacrifice a land to copy it, and choose its target", () => {
    const { s: s0, ap, ids } = setup([chainOfVapor]);
    const opp = nextAfter(s0, ap);
    const theirs = putOnBattlefield(s0, opp, giant);
    putOnBattlefield(s0, opp, forest);
    const mine = putOnBattlefield(s0, ap, hulk);
    let s = cast(s0, ap, ids[0]!, [target(theirs)]);
    expect(s.objects[theirs]!.zone).toBe("hand");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    // The one land is sacrificed without a choice, or picked.
    if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: opp, ids: s.pending.options.slice(0, 1) });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: opp });
    s = act(s, { type: "copyTargets", player: opp, targets: [target(mine)] });
    s = settle(s);
    expect(s.stack.find((x) => x.copy)?.controller ?? opp).toBe(opp);
    for (let i = 0; i < 20 && s.objects[mine]!.zone === "battlefield"; i++) {
      if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: false });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[mine]!.zone).toBe("hand");
    expect(s.players[opp]!.graveyard.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")).toBe(true);
  });

  it("Chain of Acid: the destroyed permanent's controller may copy it", () => {
    const { s: s0, ap, ids } = setup([chainOfAcid]);
    const opp = nextAfter(s0, ap);
    const theirs = putOnBattlefield(s0, opp, trinket);
    const mine = putOnBattlefield(s0, ap, ward);
    let s = cast(s0, ap, ids[0]!, [target(theirs)]);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: opp });
    s = act(s, { type: "copyTargets", player: opp, targets: [target(mine)] });
    for (let i = 0; i < 20 && s.objects[mine]!.zone === "battlefield"; i++) {
      if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: false });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[mine]!.zone).toBe("graveyard");
  });

  it("Brand and Gruul Charm: gain control of all permanents you own, and only those", () => {
    const { s: s0, ap, ids } = setup([brand, gruulCharm]);
    const opp = nextAfter(s0, ap);
    const lent = putOnBattlefield(s0, ap, giant);
    s0.objects[lent]!.controller = opp;
    const theirs = putOnBattlefield(s0, opp, bear());
    expect(controllerOf(s0, s0.objects[lent]!)).toBe(opp);
    const s = settle(cast(s0, ap, ids[0]!));
    expect(controllerOf(s, s.objects[lent]!)).toBe(ap);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
    const { s: t0, ap: tap, ids: tids } = setup([gruulCharm]);
    const topp = nextAfter(t0, tap);
    const lent2 = putOnBattlefield(t0, tap, giant);
    t0.objects[lent2]!.controller = topp;
    const t = settle(cast(t0, tap, tids[0]!, undefined, [1]));
    expect(controllerOf(t, t.objects[lent2]!)).toBe(tap);
  });
});
