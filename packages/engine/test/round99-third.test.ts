// Round 99, the third batch: Mishra's Bauble, "When ~ enters and whenever ..." (Up the Beanstalk), "Whenever you lose
// life" (Vilis), "with no counters on them" (Damning Verdict), "Blue spells and red spells" (Nightscape Familiar, a
// spell that's both costs {1} less, not {2}), Twilight Prophet, "each of up to two other targets" (Drakuseth), Shalai,
// Teferi, Time Raveler (CR 307.1), Silent Arbiter (CR 508.1c, 509.1b), City of Traitors, Haven of the Spirit Dragon,
// Crackle with Power, Great Train Heist, and "you may pay {X}" (Well of Lost Dreams, Flameblast Dragon; CR 107.1c).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, characteristics, gainLife, isFullySupported, loseLife, objHasKeyword, planCast, spellCost, targetProblem, waitingOn, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const bauble = card("Mishra's Bauble", "Artifact", "{0}", { oracleText: "{T}, Sacrifice this artifact: Look at the top card of target player's library. Draw a card at the beginning of the next turn's upkeep." });
const beanstalk = card("Up the Beanstalk", "Enchantment", "{1}{G}", { oracleText: "When this enchantment enters and whenever you cast a spell with mana value 5 or greater, draw a card." });
const vilis = card("Vilis, Broker of Blood", "Legendary Creature — Demon", "{5}{B}{B}{B}", { power: "8", toughness: "8", keywords: ["Flying"], oracleText: "Flying\n{B}, Pay 2 life: Target creature gets -1/-1 until end of turn.\nWhenever you lose life, draw that many cards. (Damage causes loss of life.)" });
const verdict = card("Damning Verdict", "Sorcery", "{3}{W}{W}", { oracleText: "Destroy all creatures with no counters on them." });
const familiar = card("Nightscape Familiar", "Creature — Zombie", "{1}{B}", { power: "1", toughness: "1", keywords: ["Regenerate"], oracleText: "Blue spells and red spells you cast cost {1} less to cast.\n{1}{B}: Regenerate this creature." });
const prophet = card("Twilight Prophet", "Creature — Vampire Cleric", "{2}{B}{B}", { power: "2", toughness: "4", keywords: ["Flying", "Ascend"], oracleText: "Flying\nAscend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)\nAt the beginning of your upkeep, if you have the city's blessing, reveal the top card of your library and put it into your hand. Each opponent loses X life and you gain X life, where X is that card's mana value." });
const drakuseth = card("Drakuseth, Maw of Flames", "Legendary Creature — Dragon", "{4}{R}{R}{R}", { power: "7", toughness: "7", keywords: ["Flying"], oracleText: "Flying\nWhenever Drakuseth attacks, Drakuseth deals 4 damage to any target and 3 damage to each of up to two other targets." });
const shalai = card("Shalai, Voice of Plenty", "Legendary Creature — Angel", "{3}{W}", { power: "3", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nYou, planeswalkers you control, and other creatures you control have hexproof.\n{4}{G}{G}: Put a +1/+1 counter on each creature you control." });
const teferi = card("Teferi, Time Raveler", "Legendary Planeswalker — Teferi", "{1}{W}{U}", { loyalty: "4", oracleText: "Each opponent can cast spells only any time they could cast a sorcery.\n+1: Until your next turn, you may cast sorcery spells as though they had flash.\n−3: Return up to one target artifact, creature, or enchantment to its owner's hand. Draw a card." });
const arbiter = card("Silent Arbiter", "Artifact Creature — Construct", "{4}", { power: "1", toughness: "5", oracleText: "No more than one creature can attack each combat.\nNo more than one creature can block each combat." });
const traitors = card("City of Traitors", "Land", "", { oracleText: "When you play another land, sacrifice this land.\n{T}: Add {C}{C}." });
const haven = card("Haven of the Spirit Dragon", "Land", "", { oracleText: "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a Dragon creature spell.\n{2}, {T}, Sacrifice this land: Return target Dragon creature card or Ugin planeswalker card from your graveyard to your hand." });
const crackle = card("Crackle with Power", "Sorcery", "{X}{X}{X}{R}{R}", { oracleText: "Crackle with Power deals five times X damage to each of up to X targets." });
const heist = card("Great Train Heist", "Instant", "{R}", { keywords: ["Treasure", "Spree"], oracleText: "Spree (Choose one or more additional costs.)\n+ {2}{R} — Untap all creatures you control. If it's your combat phase, there is an additional combat phase after this phase.\n+ {2} — Creatures you control get +1/+0 and gain first strike until end of turn.\n+ {R} — Choose target opponent. Whenever a creature you control deals combat damage to that player this turn, create a tapped Treasure token." });
const well = card("Well of Lost Dreams", "Artifact", "{4}", { oracleText: "Whenever you gain life, you may pay {X}, where X is less than or equal to the amount of life you gained. If you do, draw X cards." });
const flameblast = card("Flameblast Dragon", "Creature — Dragon", "{4}{R}{R}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature attacks, you may pay {X}{R}. If you do, it deals X damage to any target." });
const banneret = card("Ballyrush Banneret", "Creature — Kithkin Soldier", "{1}{W}", { power: "2", toughness: "1", oracleText: "Kithkin spells and Soldier spells you cast cost {1} less to cast." });

const big = card("Big Sorcery", "Sorcery", "{5}", { oracleText: "Draw a card." });
const growth = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
const izzet = card("Izzet Charm Test", "Instant", "{U}{R}", { oracleText: "Draw a card." });
const dragonCard = card("Shivan Dragon", "Creature — Dragon", "{4}{R}{R}", { power: "5", toughness: "5", keywords: ["Flying"] });
const ugin = card("Ugin, the Spirit Dragon", "Legendary Planeswalker — Ugin", "{8}", { loyalty: "7", oracleText: "+2: Ugin, the Spirit Dragon deals 3 damage to any target." });
const forest = card("Forest", "Basic Land — Forest");

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const nextAfter = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % 4]!;
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });

/** Resolve the stack, choosing `targets` when asked, answering "may" prompts with `may`, and options with `option`. */
function drive(s: GameState, targets: TargetChoice[], may: boolean, option?: string) {
  for (let i = 0; i < 200; i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: may });
    else if (p?.kind === "chooseOption" && option !== undefined) s = act(s, { type: "chooseOption", player: p.player, choice: option });
    else if (p) break;
    else if (s.stack.length || s.triggerQueue.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    else break;
  }
  return s;
}

describe("round 99, third batch", () => {
  it("parse", () => {
    supported(bauble, beanstalk, vilis, verdict, familiar, prophet, drakuseth, shalai, teferi, arbiter, traitors, haven, crackle, heist, well, flameblast, banneret);
  });

  it("Mishra's Bauble: look at the top card, and draw at the next turn's upkeep", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextAfter(s0, ap);
    const b = putOnBattlefield(s0, ap, bauble);
    let s = activate(s0, ap, b, 0, [player(opp)]);
    s = drive(s, [], false);
    // Looking at one card: an "order the top" prompt with one card, kept.
    if (s.pending?.kind === "arrangeTop") s = drive(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }), [], false);
    expect(s.objects[b]!.zone).toBe("graveyard");
    // (Past the cleanup step's discard down to seven.)
    s = passUntil(s, "upkeep", opp);
    const hand = s.players[ap]!.hand.length;
    s = drive(s, [], false);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Up the Beanstalk: a card when it enters, and for each spell with mana value 5 or more", () => {
    const { s: s0, ap, ids } = setup([beanstalk, big, growth]);
    const h0 = s0.players[ap]!.hand.length;
    let s = drive(cast(s0, ap, ids[0]!), [], false);
    expect(s.players[ap]!.hand.length).toBe(h0 - 1 + 1);
    s = drive(cast(s, ap, ids[1]!), [], false);
    // The Big Sorcery's own draw and the Beanstalk's.
    expect(s.players[ap]!.hand.length).toBe(h0 - 2 + 1 + 2);
  });

  it("Vilis: drawing that many whenever you lose life", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, vilis);
    const hand = s0.players[ap]!.hand.length;
    loseLife(s0, ap, 3);
    const s = drive(s0, [], false);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
    // An opponent losing life doesn't.
    loseLife(s, nextAfter(s, ap), 2);
    expect(drive(s, [], false).players[ap]!.hand.length).toBe(hand + 3);
  });

  it("Damning Verdict: only creatures with no counters on them", () => {
    const { s: s0, ap, ids } = setup([verdict]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, nextAfter(s0, ap), bear());
    s0.objects[b]!.counters["+1/+1"] = 1;
    const s = drive(cast(s0, ap, ids[0]!), [], false);
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("Nightscape Familiar and Ballyrush Banneret: {1} less once for a spell that's both", () => {
    const { s: s0, ap, ids } = setup([izzet, card("Kithkin Soldier", "Creature — Kithkin Soldier", "{2}{W}", { power: "2", toughness: "2" })]);
    putOnBattlefield(s0, ap, familiar);
    putOnBattlefield(s0, ap, banneret);
    const show = (id: string) => {
      const c = spellCost(s0, ap, s0.objects[id]!);
      return `${c.extra || ""}${c.cost.symbols.map((x) => (x.kind === "generic" ? x.amount : x.kind === "colored" ? x.color : "?")).join("")}`;
    };
    // {U}{R} has no generic to take off.
    expect(show(ids[0]!)).toBe("UR");
    expect(show(ids[1]!)).toBe("1W");
  });

  it("Twilight Prophet: with the city's blessing, the top card to hand, and a drain of its mana value", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextAfter(s0, ap);
    putOnBattlefield(s0, ap, prophet);
    s0.players[ap]!.citysBlessing = true;
    let s = passUntil(s0, "end", ap);
    const top = s.players[ap]!.library[0]!;
    const mv = name(s, top) === "Grizzly Bears" ? 2 : 0;
    const [mine, theirs] = [s.players[ap]!.life, s.players[opp]!.life];
    s = drive(passUntil(s, "upkeep", ap), [], false);
    expect(s.players[ap]!.hand).toContain(top);
    expect([s.players[ap]!.life, s.players[opp]!.life]).toEqual([mine + mv, theirs - mv]);
  });

  it("Drakuseth: 4 damage to one target, 3 to each of up to two others, all different", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2, o3] = [nextAfter(s0, ap), nextAfter(s0, nextAfter(s0, ap)), nextAfter(s0, nextAfter(s0, nextAfter(s0, ap)))];
    const d = putOnBattlefield(s0, ap, drakuseth);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: d, defender: o1 }] });
    const specs = s.pending?.kind === "chooseTargets" ? s.pending.specs : [];
    expect(specs).toHaveLength(3);
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [player(o1), player(o1), { kind: "none" }] })).toThrow();
    const life = [o1, o2, o3].map((p) => s.players[p]!.life);
    s = drive(s, [player(o1), player(o2), { kind: "none" }], false);
    expect([o1, o2, o3].map((p) => s.players[p]!.life)).toEqual([life[0]! - 4, life[1]! - 3, life[2]!]);
  });

  it("Shalai: you, your planeswalkers and your other creatures have hexproof, not Shalai", () => {
    const { s: s0, ap } = setup([]);
    const sh = putOnBattlefield(s0, ap, shalai);
    const b = putOnBattlefield(s0, ap, bear());
    expect(objHasKeyword(s0, s0.objects[b]!, "Hexproof")).toBe(true);
    expect(objHasKeyword(s0, s0.objects[sh]!, "Hexproof")).toBe(false);
    expect(abilitiesOf(s0, s0.objects[sh]!).youHave).toBe("hexproof");
    const opp = nextAfter(s0, ap);
    expect(targetProblem(s0, [{ kind: "player", text: "target player" }], [player(ap)], opp)).toBeTruthy();
  });

  it("Teferi, Time Raveler: opponents cast spells only at sorcery speed; his +1 gives your sorceries flash until your next turn", () => {
    const { s: s0, ap, ids } = setup([big]);
    const opp = nextAfter(s0, ap);
    const t = putOnBattlefield(s0, ap, teferi);
    s0.objects[t]!.counters.loyalty = 4;
    // An opponent's instant on your turn: not now.
    const g = putOnBattlefield(s0, opp, growth);
    s0.objects[g]!.zone = "hand";
    s0.battlefield = s0.battlefield.filter((id) => id !== g);
    s0.players[opp]!.hand.push(g);
    for (const l of [forest, forest]) putOnBattlefield(s0, opp, l);
    let s = activate(s0, ap, t, 0);
    // With his +1 on the stack, the opponent gets priority but can't cast the instant.
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(waitingOn(s)).toBe(opp);
    expect(planCast(s, opp, g, [target(putOnBattlefield(s, opp, bear()))])).toBeNull();
    s = drive(s, [], false);
    // On the opponent's turn, your sorcery has flash.
    s = passUntil(s, "upkeep", opp);
    for (let i = 0; i < 8 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
  });

  it("Silent Arbiter: one attacker and one blocker each combat", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextAfter(s0, ap);
    putOnBattlefield(s0, opp, arbiter);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    const x = putOnBattlefield(s0, opp, bear());
    const y = putOnBattlefield(s0, opp, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: opp }] })).toThrow(/no more than one creature can attack/);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    s = passUntil(s, "declareBlockers", ap);
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: opp });
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: x, attacker: a }, { blocker: y, attacker: a }] })).toThrow(/no more than one creature can block/);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: x, attacker: a }] });
    expect(s.objects[x]!.blocking).toEqual([a]);
  });

  it("City of Traitors: sacrificed when you play another land, not for itself", () => {
    const { s: s0, ap, ids } = setup([traitors, forest]);
    let s = drive(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }), [], false);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    s = passUntil(s, "main1", ap, 4000);
    s = passUntil(passUntil(s, "upkeep", nextAfter(s, ap)), "main1", ap);
    s = drive(act(s, { type: "playLand", player: ap, objectId: ids[1]! }), [], false);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("Haven of the Spirit Dragon: returns a Dragon creature card or an Ugin planeswalker card", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, haven);
    const yard = (d: CardDef) => {
      const id = putOnBattlefield(s0, ap, d);
      s0.battlefield = s0.battlefield.filter((x) => x !== id);
      s0.objects[id]!.zone = "graveyard";
      s0.players[ap]!.graveyard.push(id);
      return id;
    };
    const dragon = yard(dragonCard);
    const walker = yard(ugin);
    const other = yard(bear());
    const spec = abilitiesOf(s0, s0.objects[h]!).activated[0]!.body.targets;
    expect(targetProblem(s0, spec, [target(dragon)], ap, undefined, h)).toBeNull();
    expect(targetProblem(s0, spec, [target(walker)], ap, undefined, h)).toBeNull();
    expect(targetProblem(s0, spec, [target(other)], ap, undefined, h)).toBeTruthy();
    const s = drive(activate(s0, ap, h, 0, [target(walker)]), [], false);
    expect(s.players[ap]!.hand).toContain(walker);
  });

  it("Crackle with Power: X = 1, five damage to up to one target", () => {
    const { s: s0, ap, ids } = setup([crackle]);
    const opp = nextAfter(s0, ap);
    const plan = planCast(s0, ap, ids[0]!, [player(opp)], undefined, undefined, 1);
    expect(plan).not.toBeNull();
    let s = s0;
    for (const a of plan!) s = act(s, a);
    const life = s.players[opp]!.life;
    s = drive(s, [], false);
    expect(s.players[opp]!.life).toBe(life - 5);
  });

  it("Great Train Heist: a tapped Treasure for each creature's combat damage to the chosen opponent", () => {
    const { s: s0, ap, ids } = setup([heist]);
    const opp = nextAfter(s0, ap);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    let s = drive(cast(s0, ap, ids[0]!, [player(opp)], [2]), [], false);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: nextAfter(s, opp) }] });
    s = passUntil(s, "combatDamage", ap);
    s = drive(s, [], false);
    const treasures = s.battlefield.filter((id) => name(s, id) === "Treasure Token");
    // Only the one that hit the chosen opponent.
    expect(treasures).toHaveLength(1);
    expect(s.objects[treasures[0]!]!.tapped).toBe(true);
  });

  it("Well of Lost Dreams: pay X up to the life gained, draw X", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, well);
    gainLife(s0, ap, 3);
    let s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    s = drive(s, [], true);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX", options: ["none", "0", "1", "2", "3"] });
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "chooseOption", player: ap, choice: "2" });
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{2}" } });
    // Paid from the pool: add it first, as the UI's autopay does.
    for (const id of s.battlefield.filter((x) => name(s, x) === "Forest").slice(0, 2)) s = act(s, { type: "activateMana", player: ap, objectId: id, mana: "G" });
    s = drive(act(s, { type: "chooseMay", player: ap, yes: true }), [], false);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("Flameblast Dragon: you may pay {X}{R} as it attacks, and it deals X damage", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextAfter(s0, ap);
    const d = putOnBattlefield(s0, ap, flameblast);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: d, defender: opp }] });
    s = drive(s, [player(opp)], false);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX" });
    const life = s.players[opp]!.life;
    s = act(s, { type: "chooseOption", player: ap, choice: "3" });
    for (const id of s.battlefield.filter((x) => name(s, x) === "Mountain").slice(0, 3)) s = act(s, { type: "activateMana", player: ap, objectId: id, mana: "R" });
    s = act(s, { type: "activateMana", player: ap, objectId: s.battlefield.find((x) => name(s, x) === "Island")!, mana: "U" });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.players[opp]!.life).toBe(life - 3);
  });
});
