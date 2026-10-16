// Auras coming back from exile (CR 303.4f): "until ~ leaves" (Banishing Light, Angel of Sanctions), the older
// "when ~ leaves, return the exiled card" (Oblivion Ring), flickers (Flicker of Fate) and delayed returns (Flickerwisp).
// The Aura's owner, or whoever it returns under, chooses what it enchants as it returns; it isn't targeted, so hexproof
// doesn't matter. With nothing it can enchant it stays in exile (303.4g), and it can't enchant something returning at
// the same time (CR 610.3d; Replenish rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
/** Cast it and resolve it, choosing `targets` for its enters trigger if it asks. */
function castIt(s: GameState, pid: PlayerId, id: string, targets: string[] = [], triggerTargets: string[] = []) {
  s = settle(run(s, planCast(s, pid, id, targets.map(target))));
  if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: pid, targets: triggerTargets.map(target) }));
  if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: pid, yes: true }));
  return s;
}
const untapAll = (s: GameState) => s.battlefield.forEach((id) => (s.objects[id]!.tapped = false));
const enchant = (s: GameState, aura: string, host: string) => {
  s.objects[aura]!.attachedTo = host;
  invalidateCharacteristics(s);
};
const options = (s: GameState) => (s.pending?.kind === "chooseOption" ? s.pending.options : []);

// Real oracle text (Scryfall).
const pacifism = card("Pacifism", "Enchantment — Aura", "{1}{W}", { oracleText: "Enchant creature\nEnchanted creature can't attack or block." });
const holyStrength = card("Holy Strength", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+2." });
const banishingLight = card("Banishing Light", "Enchantment", "{2}{W}", { oracleText: "When this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield." });
const angel = card("Angel of Sanctions", "Creature — Angel", "{3}{W}{W}", {
  power: "3",
  toughness: "4",
  keywords: ["Flying", "Embalm"],
  oracleText:
    "Flying\nWhen this creature enters, you may exile target nonland permanent an opponent controls until this creature leaves the battlefield.\nEmbalm {5}{W} ({5}{W}, Exile this card from your graveyard: Create a token that's a copy of it, except it's a white Zombie Angel with no mana cost. Embalm only as a sorcery.)",
});
const priest = card("Banisher Priest", "Creature — Human Cleric", "{1}{W}{W}", { power: "2", toughness: "2", oracleText: "When this creature enters, exile target creature an opponent controls until this creature leaves the battlefield." });
const oRing = card("Oblivion Ring", "Enchantment", "{2}{W}", { oracleText: "When this enchantment enters, exile another target nonland permanent.\nWhen this enchantment leaves the battlefield, return the exiled card to the battlefield under its owner's control." });
const flickerOfFate = card("Flicker of Fate", "Instant", "{1}{W}", { oracleText: "Exile target creature or enchantment, then return it to the battlefield under its owner's control." });
const flickerwisp = card("Flickerwisp", "Creature — Elemental", "{1}{W}{W}", { power: "3", toughness: "1", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, exile another target permanent. Return that card to the battlefield under its owner's control at the beginning of the next end step." });
const disenchant = card("Disenchant", "Instant", "{1}{W}", { oracleText: "Destroy target artifact or enchantment." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const vengeance = card("Akroma's Vengeance", "Sorcery", "{4}{W}{W}", { keywords: ["Cycling"], oracleText: "Destroy all artifacts, creatures, and enchantments.\nCycling {3} ({3}, Discard this card: Draw a card.)" });
const myr = card("Darksteel Myr", "Artifact Creature — Myr", "{3}", { power: "0", toughness: "1", keywords: ["Indestructible"], oracleText: 'Indestructible (Damage and effects that say "destroy" don\'t destroy this creature. If its toughness is 0 or less, it still dies.)' });
const hexproofBear = bear({ name: "Hexproof Bear", keywords: ["Hexproof"], oracleText: "Hexproof" });

describe("Auras returning from exile choose what they enchant", () => {
  it("parses", () => {
    supported(banishingLight, angel, priest, oRing, flickerOfFate, flickerwisp, vengeance);
  });

  it("Banishing Light leaves: the Aura's owner chooses its host, hexproof or not, as part of Disenchant resolving", () => {
    const { s: s0, ap, opp, ids } = setup([banishingLight, disenchant]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, hexproofBear);
    const p = putOnBattlefield(s0, opp, pacifism);
    enchant(s0, p, mine);
    let s = castIt(s0, ap, ids[0]!, [], [p]);
    expect(s.objects[p]!.zone).toBe("exile");
    const light = s.battlefield.find((id) => s.objects[id]!.cardId === banishingLight.oracleId)!;
    untapAll(s);
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(light)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "enchant", source: "Banishing Light", prompt: "choose what Pacifism enchants as it returns" });
    expect(options(s)).toEqual(expect.arrayContaining([mine, theirs]));
    expect(s.objects[p]!.zone).toBe("exile"); // not back until it's chosen
    s = settle(act(s, { type: "chooseOption", player: opp, choice: theirs }));
    expect(s.objects[p]).toMatchObject({ zone: "battlefield", controller: opp, attachedTo: theirs });
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
  });

  it("Angel of Sanctions dies to damage: the Aura comes back once its owner chooses, before anything else happens", () => {
    const { s: s0, ap, opp, ids } = setup([angel, bolt]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    const h = putOnBattlefield(s0, opp, holyStrength);
    enchant(s0, h, theirs);
    let s = castIt(s0, ap, ids[0]!, [], [h]);
    expect(s.objects[h]!.zone).toBe("exile");
    const a = s.battlefield.find((id) => s.objects[id]!.cardId === angel.oracleId)!;
    s.objects[a]!.damage = 1;
    untapAll(s);
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(a)])));
    // The Angel dies as state-based actions are checked; Holy Strength's owner is asked then.
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "enchant", source: "Angel of Sanctions" });
    expect(options(s)).toEqual(expect.arrayContaining([mine, theirs]));
    // The bot puts a +1/+2 Aura on its own creature.
    s = settle(act(s, botActions(s, opp)[0]!));
    expect(s.objects[h]).toMatchObject({ zone: "battlefield", controller: opp, attachedTo: theirs });
  });

  it("returns at the same time can't enchant each other (CR 610.3d); with one legal host there's no question", () => {
    const { s: s0, ap, opp, ids } = setup([banishingLight, priest, vengeance]);
    const m = putOnBattlefield(s0, ap, myr);
    const x = putOnBattlefield(s0, opp, bear({ name: "Exiled Bear" }));
    const h = putOnBattlefield(s0, opp, holyStrength);
    enchant(s0, h, x);
    let s = castIt(s0, ap, ids[0]!, [], [h]);
    untapAll(s);
    s = castIt(s, ap, ids[1]!, [], [x]);
    expect(s.objects[h]!.zone).toBe("exile");
    expect(s.objects[x]!.zone).toBe("exile");
    untapAll(s);
    s = settle(run(s, planCast(s, ap, ids[2]!)));
    // Both come back; Holy Strength can't go on the bear returning with it, so on the indestructible Myr.
    expect(s.pending).toBeFalsy();
    expect(s.objects[x]).toMatchObject({ zone: "battlefield", controller: opp });
    expect(s.objects[h]).toMatchObject({ zone: "battlefield", controller: opp, attachedTo: m });
  });

  it("with nothing it can enchant, it stays in exile (CR 303.4g)", () => {
    const { s: s0, ap, opp, ids } = setup([banishingLight, disenchant]);
    const only = putOnBattlefield(s0, opp, bear());
    const p = putOnBattlefield(s0, opp, pacifism);
    enchant(s0, p, only);
    let s = castIt(s0, ap, ids[0]!, [], [p]);
    s.battlefield.splice(s.battlefield.indexOf(only), 1); // the bear is gone too
    s.objects[only]!.zone = "graveyard";
    s.players[opp]!.graveyard.push(only);
    invalidateCharacteristics(s);
    const light = s.battlefield.find((id) => s.objects[id]!.cardId === banishingLight.oracleId)!;
    untapAll(s);
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(light)])));
    expect(s.pending).toBeFalsy();
    expect(s.objects[p]!.zone).toBe("exile");
  });

  it("Oblivion Ring's leaves trigger returns an Aura where its owner chooses", () => {
    const { s: s0, ap, opp, ids } = setup([oRing, disenchant]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    const p = putOnBattlefield(s0, opp, pacifism);
    enchant(s0, p, mine);
    let s = castIt(s0, ap, ids[0]!, [], [p]);
    expect(s.objects[p]!.zone).toBe("exile");
    const ring = s.battlefield.find((id) => s.objects[id]!.cardId === oRing.oracleId)!;
    untapAll(s);
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(ring)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "enchant", prompt: "choose what Pacifism enchants as it enters" });
    s = settle(act(s, { type: "chooseOption", player: opp, choice: mine }));
    expect(s.objects[p]).toMatchObject({ zone: "battlefield", controller: opp, attachedTo: mine });
    void theirs;
  });

  it("Flicker of Fate on an Aura: its owner chooses again, and it may move to another creature", () => {
    const { s: s0, ap, opp, ids } = setup([flickerOfFate]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    const p = putOnBattlefield(s0, opp, pacifism);
    enchant(s0, p, mine);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(p)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "enchant", source: "Flicker of Fate" });
    expect(s.objects[p]!.zone).toBe("exile");
    s = settle(act(s, { type: "chooseOption", player: opp, choice: theirs }));
    expect(s.objects[p]).toMatchObject({ zone: "battlefield", controller: opp, attachedTo: theirs });
  });

  it("Flickerwisp: the Aura comes back at the next end step, and its owner chooses then", () => {
    const { s: s0, ap, opp, ids } = setup([flickerwisp]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    const p = putOnBattlefield(s0, opp, pacifism);
    enchant(s0, p, mine);
    let s = castIt(s0, ap, ids[0]!, [], [p]);
    expect(s.objects[p]!.zone).toBe("exile");
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "enchant", prompt: "choose what Pacifism enchants as it enters" });
    s = settle(act(s, { type: "chooseOption", player: opp, choice: mine }));
    expect(s.objects[p]).toMatchObject({ zone: "battlefield", controller: opp, attachedTo: mine });
    void theirs;
  });
});
