// Auras put onto the battlefield without being cast (CR 303.4f): the player it enters under chooses what it enchants as
// it enters, among what its enchant ability allows (it isn't targeted, so hexproof doesn't matter; protection does,
// 702.16c). With nothing it can enchant, it stays in the zone it was in (303.4g). Auras returned together can't enchant
// what enters with them (Replenish rulings); with several players' Auras, the active player chooses first (Open the
// Vaults rulings, CR 101.4).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

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
/** A card of `pid`'s in their graveyard (or library). */
function put(s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "library" = "graveyard") {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
}
const choose = (s: GameState, pid: PlayerId, choice: string) => settle(act(s, { type: "chooseOption", player: pid, choice }));

// Real oracle text (Scryfall).
const pacifism = card("Pacifism", "Enchantment — Aura", "{1}{W}", { oracleText: "Enchant creature\nEnchanted creature can't attack or block." });
const holyStrength = card("Holy Strength", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+2." });
const exhaustion = card("Curse of Exhaustion", "Enchantment — Aura Curse", "{2}{W}{W}", { oracleText: "Enchant player\nEnchanted player can't cast more than one spell each turn." });
const anthem = card("Glorious Anthem", "Enchantment", "{1}{W}{W}", { oracleText: "Creatures you control get +1/+1." });
const aid = card("Obzedat's Aid", "Sorcery", "{3}{W}{B}", { oracleText: "Return target permanent card from your graveyard to the battlefield." });
const replenish = card("Replenish", "Sorcery", "{3}{W}", { oracleText: "Return all enchantment cards from your graveyard to the battlefield. (Auras with nothing to enchant remain in your graveyard.)" });
const vaults = card("Open the Vaults", "Sorcery", "{4}{W}{W}", { oracleText: "Return all artifact and enchantment cards from all graveyards to the battlefield under their owners' control. (Auras with nothing to enchant remain in graveyards.)" });
const bridge = card("Planar Bridge", "Legendary Artifact", "{6}", { oracleText: "{8}, {T}: Search your library for a permanent card, put it onto the battlefield, then shuffle." });
const sunTitan = card("Sun Titan", "Creature — Giant", "{4}{W}{W}", { power: "6", toughness: "6", keywords: ["Vigilance"], oracleText: "Vigilance\nWhenever this creature enters or attacks, you may return target permanent card with mana value 3 or less from your graveyard to the battlefield." });
const hexproofBear = bear({ name: "Hexproof Bear", keywords: ["Hexproof"], oracleText: "Hexproof" });
const proWhite = bear({ name: "White Ward Bear", keywords: ["Protection"], oracleText: "Protection from white" });

describe("Auras put onto the battlefield without being cast", () => {
  it("parses", () => {
    supported(aid, replenish, vaults, bridge, sunTitan);
  });

  it("the player chooses what the Aura enchants, hexproof or not; protection from it rules a creature out", () => {
    const { s: s0, ap, opp, ids } = setup([aid]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, hexproofBear);
    const warded = putOnBattlefield(s0, opp, proWhite);
    const p = put(s0, ap, pacifism);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: p }])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "enchant" });
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(options).toContain(mine);
    expect(options).toContain(theirs);
    expect(options).not.toContain(warded);
    s = choose(s, ap, theirs);
    expect(s.objects[p]).toMatchObject({ zone: "battlefield", attachedTo: theirs, controller: ap });
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("with only one thing it can enchant there's no question; with nothing, it stays in the graveyard (CR 303.4g)", () => {
    const { s: s0, ap, ids } = setup([aid, aid]);
    const p = put(s0, ap, pacifism);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: p }])));
    expect(s.pending).toBeFalsy();
    expect(s.objects[p]!.zone).toBe("graveyard");

    const only = putOnBattlefield(s, ap, bear());
    for (const id of s.battlefield) s.objects[id]!.tapped = false; // mana for the second one
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: p }])));
    expect(s.pending).toBeFalsy();
    expect(s.objects[p]).toMatchObject({ zone: "battlefield", attachedTo: only });
  });

  it("an Aura with enchant player enchants the player chosen", () => {
    const { s: s0, ap, opp, ids } = setup([aid]);
    const c = put(s0, ap, exhaustion);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: c }])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant" });
    expect(s.pending?.kind === "chooseOption" && s.pending.options.length).toBe(4); // any player, you too
    s = choose(s, ap, `player:${opp}`);
    expect(s.objects[c]).toMatchObject({ zone: "battlefield", attachedToPlayer: opp });
  });

  it("Replenish: each Aura is asked in turn, never onto something entering with it; one with nothing stays", () => {
    const { s: s0, ap, opp, ids } = setup([replenish]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    const p = put(s0, ap, pacifism);
    const h = put(s0, ap, holyStrength);
    const a = put(s0, ap, anthem);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant", prompt: "choose what Pacifism enchants as it enters" });
    s = act(s, { type: "chooseOption", player: ap, choice: theirs });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant", prompt: "choose what Holy Strength enchants as it enters" });
    expect(s.objects[p]!.zone).toBe("graveyard"); // they all enter together, after the choices
    s = choose(s, ap, mine);
    expect(s.objects[p]).toMatchObject({ zone: "battlefield", attachedTo: theirs });
    expect(s.objects[h]).toMatchObject({ zone: "battlefield", attachedTo: mine });
    expect(s.objects[a]!.zone).toBe("battlefield");
  });

  it("Open the Vaults: each owner chooses for their own Auras, the active player first", () => {
    const { s: s0, ap, opp, ids } = setup([vaults]);
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, bear());
    const mineAura = put(s0, ap, pacifism);
    const theirAura = put(s0, opp, holyStrength);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant", player: ap });
    s = act(s, botActions(s, ap)[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant", player: opp });
    s = settle(act(s, botActions(s, opp)[0]!));
    // The bots: Pacifism on an opponent's creature, Holy Strength on their own.
    expect(s.objects[mineAura]).toMatchObject({ zone: "battlefield", controller: ap });
    expect(s.objects[s.objects[mineAura]!.attachedTo!]!.controller).toBe(opp);
    expect(s.objects[theirAura]).toMatchObject({ zone: "battlefield", controller: opp });
    expect(s.objects[s.objects[theirAura]!.attachedTo!]!.controller).toBe(opp);
  });

  it("a search that finds an Aura for the battlefield asks what it enchants; with nothing, it stays in the library", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bridge);
    for (const id of [...s0.players[ap]!.library]) s0.objects[id]!.zone = "exile";
    s0.players[ap]!.exile.push(...s0.players[ap]!.library);
    s0.players[ap]!.library = [];
    const p = put(s0, ap, pacifism, "library");
    let s = settle(run(s0, planActivate(s0, ap, b, 0)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [p] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [p] }));
    expect(s.objects[p]!.zone).toBe("library");
    expect(s.players[ap]!.library).toEqual([p]);

    const x = putOnBattlefield(s, ap, bear());
    const y = putOnBattlefield(s, ap, bear());
    for (const id of s.battlefield) s.objects[id]!.tapped = false; // untap it and the lands
    s = settle(run(s, planActivate(s, ap, b, 0)));
    s = act(s, { type: "searchLibrary", player: ap, found: [p] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant" });
    s = choose(s, ap, y);
    expect(s.objects[p]).toMatchObject({ zone: "battlefield", attachedTo: y });
    expect(s.players[ap]!.library).toEqual([]);
    void x;
  });
});
