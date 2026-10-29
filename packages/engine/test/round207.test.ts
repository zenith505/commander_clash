// Round 207: graveyard keyword grants, "each creature card in your graveyard has unearth {2}{B}" (Sedris, the Traitor King,
// Mishra, Tamer of Mak Fawa, Solemn Doomguide) and "has encore {X}, where X is its mana value" (Graywater's Fixer); ward
// costs "discard a card at random" (Alpharael, Stonechosen) and "get five poison counters" (The Serpent Society); "return
// X cards at random from your graveyard" (Reap the Past); "if it was a token, draw a card" (Sunpearl Kirin); "loses all
// abilities for as long as ~ remains on the battlefield" (The Wondrous Wasp); "creatures enchanted player controls enter
// tapped" (Radiant Grace // Radiant Restraints); "choose a creature or planeswalker, then destroy all other creatures and
// planeswalkers" (Selfless Glyphweaver // Deadly Vanity); "return up to one creature card and up to one land card"
// (Druidic Ritual); "target player and each creature and planeswalker they control" (Chandra, Bold Pyromancer); "populate.
// The token enters tapped and attacking" (Ghired, Conclave Exile); "you may pay that much life. If you do, draw that many
// cards" (Niv-Mizzet, Ghost Counsel); "unless any player pays {2}, search your library" (Rhystic Tutor); "target artifact,
// enchantment, or legendary card" (Crystal Dragon // Rob the Hoard); "whenever a creature with skulk deals combat damage to
// one of your opponents" (The Master, Mesmerist); "if this spell's sneak cost was paid, they enter tapped and attacking"
// (The Last Ronin's Technique); "add one mana of that color for each different power among creatures you control" (Selvala,
// Eager Trailblazer, Loot, the Nexus).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const attack = (s: GameState, ap: PlayerId, defender: PlayerId, attackers: ObjectId[]) => {
  s = passUntil(s, "declareAttackers", ap);
  return act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
};
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
};
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const kill = card("Test Kill", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const rock = (n = "Test Rock") => card(n, "Artifact", "{2}", { cmc: 2 });
const zombie = (n = "Test Zombie") => card(n, "Creature — Zombie", "{1}{B}", { cmc: 2, power: "2", toughness: "2" });
const rogue = (n = "Test Rogue") => card(n, "Creature — Human Rogue", "{2}{B}", { cmc: 3, power: "2", toughness: "2" });

// Real oracle text (Scryfall).
const mishraTamerOfMakFawa = card("Mishra, Tamer of Mak Fawa", "Legendary Creature — Human Artificer", "{3}{B}{R}", {"cmc":5,"power":"4","toughness":"4","keywords":[],"oracleText":"Permanents you control have \"Ward—Sacrifice a permanent.\"\nEach artifact card in your graveyard has unearth {1}{B}{R}. ({1}{B}{R}: Return the card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.)","colors":["B","R"],"colorIdentity":["B","R"],"layout":"normal"});
const sedrisTheTraitorKing = card("Sedris, the Traitor King", "Legendary Creature — Zombie Warrior", "{3}{U}{B}{R}", {"cmc":6,"power":"5","toughness":"5","keywords":[],"oracleText":"Each creature card in your graveyard has unearth {2}{B}. ({2}{B}: Return the card to the battlefield. The creature gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.)","colors":["B","R","U"],"colorIdentity":["B","R","U"],"layout":"normal"});
const solemnDoomguide = card("Solemn Doomguide", "Creature — Tiefling Cleric", "{3}{B}{B}", {"cmc":5,"power":"4","toughness":"5","keywords":["Flying"],"oracleText":"Flying\nEach creature card in your graveyard that's a Cleric, Rogue, Warrior, and/or Wizard has unearth {1}{B}. ({1}{B}: Return the card to the battlefield. The creature gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.)","colors":["B"],"colorIdentity":["B"],"layout":"normal"});
const graywatersFixer = card("Graywater's Fixer", "Creature — Lizard Mercenary", "{2}{B}{R}", {"cmc":4,"power":"4","toughness":"4","keywords":[],"oracleText":"Each outlaw creature card in your graveyard has encore {X}, where X is its mana value. (Exile it and pay its encore cost: For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)","colors":["B","R"],"colorIdentity":["B","R"],"layout":"normal"});
const alpharaelStonechosen = card("Alpharael, Stonechosen", "Legendary Creature — Human Cleric", "{3}{B}{B}", {"cmc":5,"power":"3","toughness":"3","keywords":["Ward","Void"],"oracleText":"Ward—Discard a card at random.\nVoid — Whenever Alpharael attacks, if a nonland permanent left the battlefield this turn or a spell was warped this turn, defending player loses half their life, rounded up.","colors":["B"],"colorIdentity":["B"],"layout":"normal"});
const theSerpentSociety = card("The Serpent Society", "Legendary Creature — Human Snake Villain", "{1}{B}{G}", {"cmc":3,"power":"3","toughness":"4","keywords":["Ward","Deathtouch"],"oracleText":"Deathtouch\nWard—Get five poison counters. (A player with ten or more poison counters loses the game.)\nWhenever another creature you control with deathtouch dies, each opponent sacrifices a nontoken creature of their choice.","colors":["B","G"],"colorIdentity":["B","G"],"layout":"normal"});
const reapThePast = card("Reap the Past", "Sorcery", "{X}{R}{G}", {"cmc":2,"keywords":[],"oracleText":"Return X cards at random from your graveyard to your hand. Exile Reap the Past.","colors":["G","R"],"colorIdentity":["G","R"],"layout":"normal"});
const sunpearlKirin = card("Sunpearl Kirin", "Creature — Kirin", "{1}{W}", {"cmc":2,"power":"2","toughness":"1","keywords":["Flying","Flash"],"oracleText":"Flash\nFlying\nWhen this creature enters, return up to one other target nonland permanent you control to its owner's hand. If it was a token, draw a card.","colors":["W"],"colorIdentity":["W"],"layout":"normal"});
const theWondrousWasp = card("The Wondrous Wasp", "Legendary Creature — Human Hero", "{1}{U}", {"cmc":2,"power":"2","toughness":"1","keywords":["Flying","Wasp's Sting","Flash"],"oracleText":"Flash\nFlying\nWasp's Sting — When The Wondrous Wasp enters, tap up to one target creature. It loses all abilities for as long as The Wondrous Wasp remains on the battlefield.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const radiantGrace = scry("transform", [{"name":"Radiant Grace","type_line":"Enchantment — Aura","mana_cost":"{W}","oracle_text":"Enchant creature\nEnchanted creature gets +1/+0 and has vigilance.\nWhen enchanted creature dies, return this card to the battlefield transformed under your control attached to target opponent."},{"name":"Radiant Restraints","type_line":"Enchantment — Aura Curse","oracle_text":"Enchant player\nCreatures enchanted player controls enter tapped."}], { keywords: ["Transform","Enchant"], color_identity: ["W"] });
const selflessGlyphweaver = scry("modal_dfc", [{"name":"Selfless Glyphweaver","type_line":"Creature — Human Cleric","mana_cost":"{2}{W}","oracle_text":"Exile this creature: Creatures you control gain indestructible until end of turn.","power":"2","toughness":"3"},{"name":"Deadly Vanity","type_line":"Sorcery","mana_cost":"{5}{B}{B}{B}","oracle_text":"Choose a creature or planeswalker, then destroy all other creatures and planeswalkers."}], { keywords: [], color_identity: ["B","W"] });
const druidicRitual = card("Druidic Ritual", "Sorcery", "{2}{G}", {"cmc":3,"keywords":["Mill"],"oracleText":"You may mill three cards. Then return up to one creature card and up to one land card from your graveyard to your hand. (To mill a card, put the top card of your library into your graveyard.)","colors":["G"],"colorIdentity":["G"],"layout":"normal"});
const chandraBoldPyromancer = card("Chandra, Bold Pyromancer", "Legendary Planeswalker — Chandra", "{4}{R}{R}", {"cmc":6,"loyalty":"5","keywords":[],"oracleText":"+1: Add {R}{R}. Chandra deals 2 damage to target player.\n−3: Chandra deals 3 damage to target creature or planeswalker.\n−7: Chandra deals 10 damage to target player and each creature and planeswalker they control.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});
const ghiredConclaveExile = card("Ghired, Conclave Exile", "Legendary Creature — Human Shaman", "{2}{R}{G}{W}", {"cmc":5,"power":"2","toughness":"5","keywords":["Populate"],"oracleText":"When Ghired enters, create a 4/4 green Rhino creature token with trample.\nWhenever Ghired attacks, populate. The token enters tapped and attacking. (To populate, create a token that's a copy of a creature token you control.)","colors":["G","R","W"],"colorIdentity":["G","R","W"],"layout":"normal"});
const nivmizzetGhostCounsel = card("Niv-Mizzet, Ghost Counsel", "Legendary Creature — Spirit Dragon", "{2}{W}{W}{B}{B}", {"cmc":6,"power":"4","toughness":"4","keywords":["Flying"],"oracleText":"Flying\nWhenever you gain life, you may pay that much life. If you do, draw that many cards.\n{T}: Each opponent loses 1 life and you gain 1 life.","colors":["B","W"],"colorIdentity":["B","W"],"layout":"normal"});
const rhysticTutor = card("Rhystic Tutor", "Sorcery", "{2}{B}", {"cmc":3,"keywords":[],"oracleText":"Unless any player pays {2}, search your library for a card, put that card into your hand, then shuffle.","colors":["B"],"colorIdentity":["B"],"layout":"normal"});
const crystalDragon = scry("adventure", [{"name":"Crystal Dragon","type_line":"Creature — Dragon","mana_cost":"{4}{W}{W}","oracle_text":"Flying, vigilance","power":"4","toughness":"4"},{"name":"Rob the Hoard","type_line":"Sorcery — Adventure","mana_cost":"{1}{W}","oracle_text":"Return target artifact, enchantment, or legendary card from your graveyard to your hand. (Then exile this card. You may cast the creature later from exile.)"}], { keywords: ["Flying","Vigilance"], color_identity: ["W"] });
const theMasterMesmerist = card("The Master, Mesmerist", "Legendary Creature — Time Lord Rogue", "{2}{U}{B}", {"cmc":4,"power":"3","toughness":"3","keywords":["Goad"],"oracleText":"{T}: Target creature an opponent controls with power less than or equal to The Master's power gains skulk until end of turn. Goad it. (A creature with skulk can't be blocked by creatures with greater power.)\nWhenever a creature with skulk deals combat damage to one of your opponents, put a +1/+1 counter on The Master and draw a card.","colors":["B","U"],"colorIdentity":["B","U"],"layout":"normal"});
const theLastRoninsTechnique = card("The Last Ronin's Technique", "Instant", "{3}{W}", {"cmc":4,"keywords":["Sneak"],"oracleText":"Sneak {1}{W} (You may cast this spell for {1}{W} if you also return an unblocked attacker you control to hand during the declare blockers step.)\nCreate three 1/1 white Ninja Turtle Spirit creature tokens. If this spell's sneak cost was paid, they enter tapped and attacking.","colors":["W"],"colorIdentity":["W"],"layout":"normal"});
const selvalaEagerTrailblazer = card("Selvala, Eager Trailblazer", "Legendary Creature — Elf Scout", "{2}{G}{W}", {"cmc":4,"power":"4","toughness":"5","keywords":["Vigilance"],"oracleText":"Vigilance\nWhenever you cast a creature spell, create a 1/1 red Mercenary creature token with \"{T}: Target creature you control gets +1/+0 until end of turn. Activate only as a sorcery.\"\n{T}: Choose a color. Add one mana of that color for each different power among creatures you control.","colors":["G","W"],"colorIdentity":["G","W"],"layout":"normal"});
const lootTheNexus = card("Loot, the Nexus", "Legendary Creature — Beast Noble", "{2}{G}", {"cmc":3,"power":"2","toughness":"1","keywords":[],"oracleText":"{T}: Choose a color. Add one mana of that color for each different power among creatures you control.","colors":["G"],"colorIdentity":["G"],"layout":"normal"});

const handOf = (s: GameState, pid: PlayerId) => s.players[pid]!.hand;
const tapped = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.tapped).length;

describe("graveyard cards have unearth or encore", () => {
  it("compile", () => supported(mishraTamerOfMakFawa, sedrisTheTraitorKing, solemnDoomguide, graywatersFixer));

  it("Sedris: a creature card in your graveyard unearths for {2}{B}; not while Sedris is gone, not an opponent's Sedris", () => {
    const { s: s0, ap, opp } = setup([]);
    const sed = putOnBattlefield(s0, ap, sedrisTheTraitorKing);
    const z = into(s0, ap, zombie(), "graveyard");
    const theirs = into(s0, opp, zombie("Their Zombie"), "graveyard");
    expect(planActivate(s0, opp, theirs, 0)).toBeNull();
    const s = settle(run(structuredClone(s0), planActivate(s0, ap, z, 0)));
    expect(s.objects[z]!.zone).toBe("battlefield");
    expect(objHasKeyword(s, s.objects[z]!, "Haste")).toBe(true);
    expect(tapped(s, ap)).toBe(3);
    // Unearth's "exile it if it would leave the battlefield" came with it (CR 702.84a).
    const t = run(s, planCast(s, ap, into(s, ap, kill, "hand"), [tgt(z)]));
    expect(settle(t).objects[z]!.zone).toBe("exile");
    // Without Sedris, the card has no unearth.
    s0.battlefield.splice(s0.battlefield.indexOf(sed), 1);
    s0.objects[sed]!.zone = "graveyard";
    s0.players[ap]!.graveyard.push(sed);
    invalidateCharacteristics(s0);
    expect(planActivate(s0, ap, z, 0)).toBeNull();
  });

  it("Solemn Doomguide: only a Cleric, Rogue, Warrior, or Wizard creature card", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, solemnDoomguide);
    const z = into(s, ap, zombie(), "graveyard");
    const r = into(s, ap, rogue(), "graveyard");
    expect(planActivate(s, ap, z, 0)).toBeNull();
    const t = settle(run(s, planActivate(s, ap, r, 0)));
    expect(t.objects[r]!.zone).toBe("battlefield");
  });

  it("Mishra: an artifact card unearths for {1}{B}{R}; a creature card doesn't", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, mishraTamerOfMakFawa);
    const r = into(s, ap, rock(), "graveyard");
    const z = into(s, ap, zombie(), "graveyard");
    expect(planActivate(s, ap, z, 0)).toBeNull();
    const t = settle(run(s, planActivate(s, ap, r, 0)));
    expect(t.objects[r]!.zone).toBe("battlefield");
    expect(tapped(t, ap)).toBe(3);
  });

  it("Graywater's Fixer: an outlaw creature card has encore {X}, X its mana value", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, graywatersFixer);
    const r = into(s, ap, rogue(), "graveyard");
    const z = into(s, ap, zombie(), "graveyard");
    expect(planActivate(s, ap, z, 0)).toBeNull();
    const t = settle(run(s, planActivate(s, ap, r, 0)));
    expect(t.objects[r]!.zone).toBe("exile");
    expect(tapped(t, ap)).toBe(3);
    expect(named(t, ap, "Test Rogue")).toHaveLength(3);
  });
});

describe("ward—discard a card at random, ward—get five poison counters", () => {
  it("compile", () => supported(alpharaelStonechosen, theSerpentSociety));

  it("Alpharael: the caster may discard a card at random; then the spell resolves", () => {
    const { s: s0, ap, opp, ids } = setup([kill]);
    const a = putOnBattlefield(s0, opp, alpharaelStonechosen);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, discardRandom: 1 });
    const no = settle(act(structuredClone(s), { type: "payUnless", player: ap, pay: false }));
    expect(no.objects[a]!.zone).toBe("battlefield");
    expect(no.objects[ids[0]!]!.zone).toBe("graveyard");
    const hand = handOf(s, ap).length;
    const yard = s.players[ap]!.graveyard.length;
    s = settle(act(s, { type: "payUnless", player: ap, pay: true }));
    expect(handOf(s, ap)).toHaveLength(hand - 1);
    expect(s.players[ap]!.graveyard.length).toBe(yard + 2);
    expect(s.objects[a]!.zone).toBe("graveyard");
  });

  it("Alpharael: with an empty hand the cost can't be paid and the spell is countered", () => {
    const { s: s0, ap, opp, ids } = setup([kill]);
    const a = putOnBattlefield(s0, opp, alpharaelStonechosen);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(a)]));
    emptyHand(s, ap);
    s = settle(s);
    expect(s.pending?.kind).not.toBe("payUnless");
    expect(s.objects[a]!.zone).toBe("battlefield");
  });

  it("The Serpent Society: the caster may get five poison counters", () => {
    const { s: s0, ap, opp, ids } = setup([kill]);
    const ss = putOnBattlefield(s0, opp, theSerpentSociety);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(ss)])));
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, poison: 5 });
    const no = settle(act(structuredClone(s), { type: "payUnless", player: ap, pay: false }));
    expect(no.objects[ss]!.zone).toBe("battlefield");
    expect(no.players[ap]!.poison ?? 0).toBe(0);
    s = settle(act(s, { type: "payUnless", player: ap, pay: true }));
    expect(s.players[ap]!.poison).toBe(5);
    expect(s.objects[ss]!.zone).toBe("graveyard");
  });
});

describe("return X cards at random, if it was a token, loses all abilities while ~ remains", () => {
  it("compile", () => supported(reapThePast, sunpearlKirin, theWondrousWasp));

  it("Reap the Past: X cards at random from your graveyard to your hand, then it's exiled", () => {
    const { s: s0, ap, ids } = setup([reapThePast]);
    const yard = [zombie("Z1"), zombie("Z2"), zombie("Z3"), rock()].map((d) => into(s0, ap, d, "graveyard"));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2)));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(yard.filter((id) => s.objects[id]!.zone === "hand")).toHaveLength(2);
    expect(yard.filter((id) => s.objects[id]!.zone === "graveyard")).toHaveLength(2);
    // X = 0: nothing comes back.
    const { s: t0, ap: p, ids: t } = setup([reapThePast]);
    const y = into(t0, p, zombie(), "graveyard");
    const t1 = settle(run(t0, planCast(t0, p, t[0]!, undefined, undefined, "auto", 0)));
    expect(t1.objects[y]!.zone).toBe("graveyard");
  });

  it("Sunpearl Kirin: returning a token draws a card; a nontoken doesn't", () => {
    const { s: s0, ap, ids } = setup([sunpearlKirin]);
    const tok = putOnBattlefield(s0, ap, bear({ name: "Bear Token" }));
    s0.objects[tok]!.isToken = true;
    const nt = putOnBattlefield(s0, ap, bear());
    const hand = handOf(s0, ap).length;
    const a = settle(run(structuredClone(s0), planCast(s0, ap, ids[0]!)), { targets: [tgt(tok)] });
    expect(a.objects[tok]?.zone ?? "gone").not.toBe("battlefield");
    expect(handOf(a, ap)).toHaveLength(hand - 1 + 1);
    const b = settle(run(s0, planCast(s0, ap, ids[0]!)), { targets: [tgt(nt)] });
    expect(b.objects[nt]!.zone).toBe("hand");
    expect(handOf(b, ap)).toHaveLength(hand - 1 + 1);
    expect(b.players[ap]!.library.length).toBe(a.players[ap]!.library.length + 1);
  });

  it("The Wondrous Wasp: taps the creature, which loses its abilities until the Wasp leaves", () => {
    const { s: s0, ap, opp, ids } = setup([theWondrousWasp, kill]);
    const f = putOnBattlefield(s0, opp, card("Test Bird", "Creature — Bird", "{1}{U}", { cmc: 2, power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { targets: [tgt(f)] });
    expect(s.objects[f]!.tapped).toBe(true);
    expect(objHasKeyword(s, s.objects[f]!, "Flying")).toBe(false);
    // Still without them next turn.
    s = passUntil(s, "upkeep", opp);
    s = settle(s);
    expect(objHasKeyword(s, s.objects[f]!, "Flying")).toBe(false);
    const w = named(s, ap, "The Wondrous Wasp")[0]!;
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(w)])));
    expect(s.objects[w]!.zone).toBe("graveyard");
    expect(objHasKeyword(s, s.objects[f]!, "Flying")).toBe(true);
  });
});

describe("Radiant Restraints, Deadly Vanity, Druidic Ritual", () => {
  it("compile", () => supported(radiantGrace, selflessGlyphweaver, druidicRitual));

  it("Radiant Grace returns as Radiant Restraints on an opponent, whose creatures enter tapped", () => {
    const { s: s0, ap, opp, ids } = setup([radiantGrace, kill]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    expect(power(s, s.objects[b]!)).toBe(3);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])), { targets: [{ kind: "player", id: opp }] });
    const g = s.objects[ids[0]!]!;
    expect(g.zone).toBe("battlefield");
    expect(g.attachedToPlayer).toBe(opp);
    expect(characteristics(s, g).name).toBe("Radiant Restraints");
    // The opponent's creature enters tapped; ours doesn't.
    s = passUntil(s, "main1", opp);
    s.players[opp]!.manaPool.G = 2;
    const ob = into(s, opp, bear({ name: "Their Bear" }), "hand");
    s = settle(run(s, planCast(s, opp, ob)));
    expect(s.objects[ob]!.zone).toBe("battlefield");
    expect(s.objects[ob]!.tapped).toBe(true);
  });

  it("Deadly Vanity: exactly one creature or planeswalker is chosen and spared", () => {
    const { s: s0, ap, opp, ids } = setup([selflessGlyphweaver]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const other = putOnBattlefield(s0, opp, bear({ name: "Other Bear" }));
    s0.players[ap]!.manaPool.B = 3;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 })));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, count: 1 });
    expect((s.pending as { min?: number }).min).toBeUndefined();
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [] })).toThrow();
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [theirs] }));
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.objects[other]!.zone).toBe("graveyard");
  });

  it("Druidic Ritual: may mill three, then up to one creature card and up to one land card", () => {
    const { s: s0, ap, ids } = setup([druidicRitual]);
    const z = into(s0, ap, zombie(), "graveyard");
    const l = into(s0, ap, card("Test Land", "Land", "", {}), "graveyard");
    const lib = s0.players[ap]!.library.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { may: true });
    expect(s.players[ap]!.library.length).toBe(lib - 3);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
    expect((s.pending as { cards: ObjectId[] }).cards).toContain(z);
    expect((s.pending as { cards: ObjectId[] }).cards).not.toContain(l);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [z] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
    expect((s.pending as { cards: ObjectId[] }).cards).toContain(l);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [l] }));
    expect(s.objects[z]!.zone).toBe("hand");
    expect(s.objects[l]!.zone).toBe("hand");
  });

  it("Druidic Ritual: with fewer than three cards in the library it can't mill (CR 701.17b)", () => {
    const { s: s0, ap, ids } = setup([druidicRitual]);
    const lib = s0.players[ap]!.library;
    for (const id of lib.splice(2)) delete s0.objects[id];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { may: true });
    expect(s.players[ap]!.library).toHaveLength(2);
  });
});

describe("Chandra's −7, Ghired's populate, Niv-Mizzet, Rhystic Tutor", () => {
  it("compile", () => supported(chandraBoldPyromancer, ghiredConclaveExile, nivmizzetGhostCounsel, rhysticTutor));

  it("Chandra, Bold Pyromancer −7: 10 damage to the player and each creature and planeswalker they control, none of yours", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, chandraBoldPyromancer);
    s0.objects[c]!.counters = { loyalty: 7 };
    const theirs = putOnBattlefield(s0, opp, card("Test Giant", "Creature — Giant", "{5}", { cmc: 5, power: "9", toughness: "9" }));
    const pw = putOnBattlefield(s0, opp, card("Test Walker", "Legendary Planeswalker — Test", "{3}", { cmc: 3, loyalty: "11", oracleText: "+1: Draw a card." }));
    s0.objects[pw]!.counters = { loyalty: 11 };
    const mine = putOnBattlefield(s0, ap, bear());
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const other = putOnBattlefield(s0, third, bear({ name: "Third Bear" }));
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planActivate(s0, ap, c, 2, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 10);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[pw]!.counters.loyalty ?? 0).toBe(1);
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[other]!.zone).toBe("battlefield");
  });

  it("Ghired: populate as it attacks, the copy entering tapped and attacking a player you choose", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, ghiredConclaveExile);
    const rhino = putOnBattlefield(s0, ap, card("Rhino Token", "Token Creature — Rhino", "", { power: "4", toughness: "4", keywords: ["Trample"], oracleText: "Trample", colors: ["G"] }));
    s0.objects[rhino]!.isToken = true;
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    let s = attack(s0, ap, opp, [g]);
    for (let i = 0; i < 50 && !(s.pending?.kind === "chooseOption" && s.pending.what === "attackWhom"); i++) {
      if (s.pending) throw new Error(`unexpected ${s.pending.kind}`);
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attackWhom", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(third) }));
    const copies = named(s, ap, "Rhino Token").filter((id) => id !== rhino);
    expect(copies).toHaveLength(1);
    expect(s.objects[copies[0]!]).toMatchObject({ tapped: true, attacking: third });
    expect(s.objects[rhino]!.attacking).toBeUndefined();
    const life = s.players[third]!.life;
    s = passUntil(s, "endCombat", ap);
    expect(s.players[third]!.life).toBe(life - 4);
  });

  it("Niv-Mizzet, Ghost Counsel: gaining life, you may pay that much life to draw that many cards", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, nivmizzetGhostCounsel);
    const gain = card("Test Gain", "Instant", "{W}", { cmc: 1, oracleText: "You gain 3 life." });
    const id = into(s0, ap, gain, "hand");
    const life = s0.players[ap]!.life;
    const hand = handOf(s0, ap).length;
    const yes = settle(run(structuredClone(s0), planCast(s0, ap, id)), { may: true });
    expect(yes.players[ap]!.life).toBe(life);
    expect(handOf(yes, ap)).toHaveLength(hand - 1 + 3);
    const no = settle(run(s0, planCast(s0, ap, id)), { may: false });
    expect(no.players[ap]!.life).toBe(life + 3);
    expect(handOf(no, ap)).toHaveLength(hand - 1);
  });

  it("Rhystic Tutor: if any player pays {2}, no search; otherwise search for a card", () => {
    for (const someone of [true, false]) {
      let { s, ap, ids } = setup([rhysticTutor]);
      s = run(s, planCast(s, ap, ids[0]!));
      for (let i = 0; i < 50 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      const order = [ap, ...s.turnOrder.filter((p) => p !== ap)];
      const payer = order[2]!;
      for (let i = 0; i < 10 && s.pending?.kind === "chooseOption"; i++) {
        const p = s.pending.player;
        if (someone && p === payer) {
          s.players[p]!.manaPool.C = 2;
          s = act(s, { type: "chooseOption", player: p, choice: s.pending.options[0]! });
          expect(s.pending).toMatchObject({ kind: "payUnless", player: payer, cost: "{2}" });
          s = act(s, { type: "payUnless", player: p, pay: true });
        } else s = act(s, { type: "chooseOption", player: p, choice: "none" });
      }
      s = settle(s);
      if (someone) expect(s.pending).toBeFalsy();
      else expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    }
  });
});

const noBlocks = (s: GameState) => {
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  while (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return s;
};

describe("Rob the Hoard, The Master, The Last Ronin's Technique, Selvala", () => {
  it("compile", () => supported(crystalDragon, theMasterMesmerist, theLastRoninsTechnique, selvalaEagerTrailblazer, lootTheNexus));

  it("Rob the Hoard: an artifact, enchantment, or legendary card; not a nonlegendary creature card", () => {
    const { s: s0, ap, ids } = setup([crystalDragon]);
    const leg = into(s0, ap, card("Test Legend", "Legendary Creature — Human", "{2}", { cmc: 2, power: "2", toughness: "2" }), "graveyard");
    const r = into(s0, ap, rock(), "graveyard");
    const z = into(s0, ap, zombie(), "graveyard");
    expect(planCast(s0, ap, ids[0]!, [tgt(z)], undefined, "auto", undefined, { face: 1 })).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [tgt(r)], undefined, "auto", undefined, { face: 1 })).not.toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(leg)], undefined, "auto", undefined, { face: 1 })));
    expect(s.objects[leg]!.zone).toBe("hand");
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });

  it("The Master, Mesmerist: skulk and goad; a creature with skulk dealing combat damage to an opponent grows it and draws", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, theMasterMesmerist);
    const small = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const big = putOnBattlefield(s0, opp, card("Their Giant", "Creature — Giant", "{4}", { cmc: 4, power: "4", toughness: "4" }));
    expect(planActivate(s0, ap, m, 0, [tgt(big)])).toBeNull();
    let s = settle(run(structuredClone(s0), planActivate(s0, ap, m, 0, [tgt(small)])));
    expect(objHasKeyword(s, s.objects[small]!, "Skulk")).toBe(true);
    expect(characteristics(s, s.objects[small]!).goadedBy).toEqual([ap]);
    // Our own skulk creature hits an opponent: a counter and a card. A creature without skulk doesn't.
    const sk = putOnBattlefield(s0, ap, card("Test Skulker", "Creature — Spirit", "{1}{B}", { cmc: 2, power: "1", toughness: "1", keywords: ["Skulk"], oracleText: "Skulk" }));
    const plain = putOnBattlefield(s0, ap, bear());
    const hand = handOf(s0, ap).length;
    s = attack(s0, ap, opp, [sk, plain]);
    s = settle(passUntil(s, "main2", ap));
    expect(s.objects[m]!.counters["+1/+1"]).toBe(1);
    expect(handOf(s, ap)).toHaveLength(hand + 1);
  });

  it("The Last Ronin's Technique: three Ninja Turtle Spirits, tapped and attacking only if its sneak cost was paid", () => {
    const { s: s0, ap, opp, ids } = setup([theLastRoninsTechnique]);
    const b = putOnBattlefield(s0, ap, bear());
    // Cast normally (it's an instant): three untapped tokens.
    const n = settle(run(structuredClone(s0), planCast(s0, ap, ids[0]!)));
    const plain = named(n, ap, "Ninja Turtle Spirit Token");
    expect(plain).toHaveLength(3);
    expect(plain.every((id) => !n.objects[id]!.tapped && n.objects[id]!.attacking === undefined)).toBe(true);
    // For its sneak cost: each token attacks the player or planeswalker you choose (rulings).
    let s = noBlocks(attack(s0, ap, opp, [b]));
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "sneak", returnToHand: [b] }));
    expect(s.objects[b]!.zone).toBe("hand");
    for (let i = 0; i < 50 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseOption" && p.what === "attackWhom") s = act(s, { type: "chooseOption", player: p.player, choice: p.options[0]! });
      else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const toks = named(s, ap, "Ninja Turtle Spirit Token");
    expect(toks).toHaveLength(3);
    expect(toks.every((id) => s.objects[id]!.tapped && s.objects[id]!.attacking !== undefined)).toBe(true);
  });

  it("Selvala, Eager Trailblazer: one mana of the chosen color for each different power", () => {
    const { s: s0, ap } = setup([]);
    const sel = putOnBattlefield(s0, ap, selvalaEagerTrailblazer);
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, bear({ name: "Bear Two" }));
    putOnBattlefield(s0, ap, card("Test Elf", "Creature — Elf", "{G}", { cmc: 1, power: "1", toughness: "1" }));
    // Powers 4, 2, 2, 1: three different powers.
    const s = act(s0, { type: "activateMana", player: ap, objectId: sel, mana: "W" });
    expect(s.players[ap]!.manaPool.W).toBe(3);
  });
});

describe("bots answer the new ward costs", () => {
  it("a bot pays a random discard with cards in hand, and refuses poison that would get it close to dying", () => {
    const { s: s0, ap, opp, ids } = setup([kill]);
    s0.players[ap]!.isBot = true;
    const a = putOnBattlefield(s0, opp, alpharaelStonechosen);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    expect(botActions(s, ap)).toEqual([expect.objectContaining({ type: "payUnless", pay: true })]);
    const { s: t0, ap: p, opp: o, ids: t } = setup([kill]);
    t0.players[p]!.isBot = true;
    t0.players[p]!.poison = 4;
    const ss = putOnBattlefield(t0, o, theSerpentSociety);
    const t1 = settle(run(t0, planCast(t0, p, t[0]!, [tgt(ss)])));
    expect(botActions(t1, p)).toEqual([expect.objectContaining({ type: "payUnless", pay: false })]);
  });
});
