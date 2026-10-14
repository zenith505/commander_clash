// Soulbond (CR 702.95), Backgrounds and two commanders (CR 702.124), and creatures that can block more than one
// creature (CR 509.1a, 510.1d).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, commander, forest, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import {
  botActions,
  characteristics,
  commanderPairProblem,
  becomeMonarch,
  createGame,
  invalidateCharacteristics,
  isFullySupported,
  maxBlocks,
  objHasKeyword,
  pairedWith,
  planActivate,
  planCast,
  validateCommanderDeck,
  waitingOn,
  type CardDef,
  type GameState,
  type PlayerId,
} from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets?: Parameters<typeof planCast>[3]) => {
  const plan = planCast(s, pid, id, targets);
  if (!plan) throw new Error(`can't cast ${s.cards[s.objects[id]!.cardId]!.name}`);
  return plan.reduce((x, a) => act(x, a), s);
};
/** `ap` attacks `opp` with `attackers`; returns the state where `opp` declares blockers. */
const toBlocks = (s: GameState, ap: PlayerId, opp: PlayerId, attackers: string[]) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender: opp })) });
  for (let i = 0; i < 20 && !(s.pending?.kind === "declareBlockers" && s.pending.player === opp); i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const finishBlocks = (s: GameState) => {
  while (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return s;
};

// Real oracle text (Scryfall), with the keywords Scryfall lists.
const SOULBOND = "Soulbond (You may pair this creature with another unpaired creature when either enters. They remain paired for as long as you control both of them.)";
const wolfir = card("Wolfir Silverheart", "Creature — Wolf Warrior", "{3}{G}{G}", { power: "4", toughness: "4", keywords: ["Soulbond"], oracleText: `${SOULBOND}\nAs long as this creature is paired with another creature, each of those creatures gets +4/+4.` });
const paladin = card("Silverblade Paladin", "Creature — Human Knight", "{1}{W}{W}", { power: "2", toughness: "2", keywords: ["Soulbond"], oracleText: `${SOULBOND}\nAs long as this creature is paired with another creature, both creatures have double strike.` });
const navigator = card("Deadeye Navigator", "Creature — Spirit", "{4}{U}{U}", { power: "5", toughness: "5", keywords: ["Soulbond"], oracleText: `${SOULBOND}\nAs long as Deadeye Navigator is paired with another creature, each of those creatures has "{1}{U}: Exile this creature, then return it to the battlefield under your control."` });
const lumberknot = card("Flowering Lumberknot", "Creature — Treefolk", "{3}{G}", { power: "5", toughness: "5", oracleText: "This creature can't attack or block unless it's paired with a creature with soulbond." });
const jointAssault = card("Joint Assault", "Instant", "{G}", { oracleText: "Target creature gets +2/+2 until end of turn. If it's paired with a creature, that creature also gets +2/+2 until end of turn." });
const doomWeaver = card("Doom Weaver", "Creature — Spider Horror", "{4}{B}{B}", { power: "1", toughness: "8", keywords: ["Reach", "Soulbond"], oracleText: `Reach\n${SOULBOND}\nAs long as Doom Weaver is paired with another creature, each of those creatures has "When this creature dies, draw cards equal to its power."` });

const palaceGuard = card("Palace Guard", "Creature — Human Soldier", "{2}{W}", { power: "1", toughness: "4", oracleText: "This creature can block any number of creatures." });
const interceptor = card("Foriysian Interceptor", "Creature — Human Soldier", "{3}{W}", { power: "0", toughness: "5", keywords: ["Flash", "Defender"], oracleText: "Flash (You may cast this spell any time you could cast an instant.)\nDefender\nThis creature can block an additional creature each combat." });
const highGround = card("High Ground", "Enchantment", "{W}", { oracleText: "Each creature you control can block an additional creature each combat." });
const actOfHeroism = card("Act of Heroism", "Instant", "{1}{W}", { oracleText: "Untap target creature. It gets +2/+2 until end of turn and can block an additional creature this turn." });
const valorMadeReal = card("Valor Made Real", "Instant", "{W}", { oracleText: "Target creature can block any number of creatures this turn." });
const watcher = card("Watcher in the Web", "Creature — Spider", "{4}{G}", { power: "2", toughness: "5", keywords: ["Reach"], oracleText: "Reach (This creature can block creatures with flying.)\nThis creature can block an additional seven creatures each combat." });
const entourage = card("Entourage of Trest", "Creature — Elf Soldier", "{4}{G}", { power: "4", toughness: "4", oracleText: "When this creature enters, you become the monarch.\nThis creature can block an additional creature each combat as long as you're the monarch." });
const vanguardsShield = card("Vanguard's Shield", "Artifact — Equipment", "{2}", { oracleText: "Equipped creature gets +0/+3 and can block an additional creature each combat.\nEquip {3} ({3}: Attach to target creature you control. Equip only as a sorcery.)" });
const ionasBlessing = card("Iona's Blessing", "Enchantment — Aura", "{3}{W}", { oracleText: "Enchant creature\nEnchanted creature gets +2/+2, has vigilance, and can block an additional creature each combat." });

const BG = "Choose a Background (You can have a Background as a second commander.)";
const erinis = card("Erinis, Gloom Stalker", "Legendary Creature — Halfling Ranger", "{2}{G}", { power: "3", toughness: "3", keywords: ["Choose a background", "Deathtouch"], oracleText: `Deathtouch\nWhenever Erinis attacks, return target land card from your graveyard to the battlefield.\n${BG}` });
const wilson = card("Wilson, Refined Grizzly", "Legendary Creature — Bear Warrior", "{1}{G}", { power: "2", toughness: "2", keywords: ["Reach", "Vigilance", "Choose a background", "Trample", "Ward"], oracleText: `This spell can't be countered.\nReach, vigilance, trample\nWard {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\n${BG}` });
const cultist = card("Cultist of the Absolute", "Legendary Enchantment — Background", "{B}", { oracleText: 'Commander creatures you own get +3/+3 and have flying, deathtouch, "Ward—Pay 3 life," and "At the beginning of your upkeep, sacrifice a creature."' });
const flamingFist = card("Flaming Fist", "Legendary Enchantment — Background", "{2}{W}", { oracleText: 'Commander creatures you own have "Whenever this creature attacks, it gains double strike until end of turn."' });
const guildArtisan = card("Guild Artisan", "Legendary Enchantment — Background", "{R}", { oracleText: 'Commander creatures you own have "Whenever this creature attacks a player, if no opponent has more life than that player, you create two Treasure tokens." (They\'re artifacts with "{T}, Sacrifice this token: Add one mana of any color.")' });
const swordCoastSailor = card("Sword Coast Sailor", "Legendary Enchantment — Background", "{U}", { oracleText: 'Commander creatures you own have "Whenever this creature attacks a player, if no opponent has more life than that player, this creature can\'t be blocked this turn."' });
const legendA = card("Partner Test A", "Legendary Creature — Human", "{W}", { power: "1", toughness: "1", keywords: ["Partner"], oracleText: "Partner (You can have two commanders if both have partner.)" });
const legendB = card("Partner Test B", "Legendary Creature — Human", "{U}", { power: "1", toughness: "1", keywords: ["Partner"], oracleText: "Partner (You can have two commanders if both have partner.)" });

describe("soulbond (CR 702.95)", () => {
  it("pairs as it enters: both get the bonus; declining leaves them unpaired", () => {
    supported(wolfir, paladin, navigator, lumberknot, jointAssault, doomWeaver);
    const { s: s0, ap, ids } = setup([wolfir, wolfir]);
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, forest);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "pair", min: 0, count: 1, options: [b] });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    expect(pairedWith(s, s.objects[ids[0]!]!)?.id).toBe(b);
    expect(pt(s, ids[0]!)).toBe("8/8");
    expect(pt(s, b)).toBe("6/6");
    // The second one: nothing unpaired is left but itself... except it could pair with nobody, so no trigger at all.
    s = settle(castNow(s, ap, ids[1]!));
    expect(s.pending).toBeNull();
    expect(pt(s, ids[1]!)).toBe("4/4");
  });

  it("another creature entering offers to pair with an unpaired soulbond creature", () => {
    const { s: s0, ap, ids } = setup([bear(), bear()]);
    const w = putOnBattlefield(s0, ap, wolfir);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "pair", options: [ids[0]] });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }));
    expect(pairedWith(s, s.objects[w]!)).toBeUndefined();
    expect(pt(s, w)).toBe("4/4");
    s = settle(castNow(s, ap, ids[1]!));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [ids[1]!] }));
    expect(pt(s, ids[1]!)).toBe("6/6");
    expect(pt(s, ids[0]!)).toBe("2/2");
  });

  it("breaks when either leaves the battlefield or changes control (CR 702.95e)", () => {
    const { s: s0, ap, ids, opp } = setup([wolfir]);
    const b = putOnBattlefield(s0, ap, bear());
    const other = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    let s = settle(castNow(s0, ap, ids[0]!));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    expect(pt(s, b)).toBe("6/6");
    // An opponent gains control of the bear: unpaired, and staying so even when it comes back.
    const steal = addEffect(s, opp, [b], [{ kind: "control" }]);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(pairedWith(s, s.objects[ids[0]!]!)).toBeUndefined();
    expect(pt(s, ids[0]!)).toBe("4/4");
    s.effects = s.effects.filter((e) => e !== steal);
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("2/2");
    // Leaving the battlefield: pair with the other bear, then it dies.
    s.objects[ids[0]!]!.paired = { id: other, zc: s.objects[other]!.zoneChanges ?? 0, by: ap };
    s.objects[other]!.paired = { id: ids[0]!, zc: s.objects[ids[0]!]!.zoneChanges ?? 0, by: ap };
    invalidateCharacteristics(s);
    expect(pt(s, other)).toBe("6/6");
    s.objects[other]!.damage = 10;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[other]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.paired).toBeUndefined();
  });

  it("both creatures have the ability; Flowering Lumberknot needs a soulbond partner", () => {
    const { s: s0, ap, ids } = setup([paladin]);
    const knot = putOnBattlefield(s0, ap, lumberknot);
    expect(characteristics(s0, s0.objects[knot]!).cantAttack).toBe(true);
    let s = settle(castNow(s0, ap, ids[0]!));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [knot] }));
    expect(objHasKeyword(s, s.objects[knot]!, "Double strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Double strike")).toBe(true);
    expect(characteristics(s, s.objects[knot]!).cantAttack).toBe(false);
    expect(characteristics(s, s.objects[knot]!).cantBlock).toBe(false);
  });

  it("Joint Assault pumps the creature its target is paired with, as it resolves", () => {
    const { s: s0, ap, ids } = setup([jointAssault, jointAssault]);
    const p = putOnBattlefield(s0, ap, paladin);
    const b = putOnBattlefield(s0, ap, bear());
    const lone = putOnBattlefield(s0, ap, bear({ name: "Lone Bear" }));
    s0.objects[p]!.paired = { id: b, zc: 0, by: ap };
    s0.objects[b]!.paired = { id: p, zc: 0, by: ap };
    invalidateCharacteristics(s0);
    let s = settle(castNow(s0, ap, ids[0]!, [target(b)]));
    expect(pt(s, b)).toBe("4/4");
    expect(pt(s, p)).toBe("4/4");
    s = settle(castNow(s, ap, ids[1]!, [target(lone)]));
    expect(pt(s, lone)).toBe("4/4");
  });

  it("Deadeye Navigator: the flicker breaks the pair, and soulbond triggers again as it returns (rulings)", () => {
    const { s: s0, ap, ids } = setup([navigator]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(castNow(s0, ap, ids[0]!));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    const plan = planActivate(s, ap, b, 0);
    expect(plan).toBeTruthy();
    s = settle(plan!.reduce((x, a) => act(x, a), s));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect((s.objects[b]!.zoneChanges ?? 0) > 0).toBe(true);
    // The returned bear is a new object; Navigator's soulbond offers to pair them again.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "pair", options: [b] });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    expect(pairedWith(s, s.objects[ids[0]!]!)?.id).toBe(b);
  });

  it("a granted dies trigger uses the creature's last power (Doom Weaver)", () => {
    const { s: s0, ap, ids } = setup([doomWeaver]);
    const big = putOnBattlefield(s0, ap, bear({ name: "Big", power: "3", toughness: "3" }));
    let s = settle(castNow(s0, ap, ids[0]!));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [big] }));
    const hand = s.players[ap]!.hand.length;
    s.objects[big]!.damage = 5;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[big]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });

  it("bots pair", () => {
    const { s: s0, ap, ids } = setup([wolfir]);
    putOnBattlefield(s0, ap, bear());
    let s = settle(castNow(s0, ap, ids[0]!));
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(pairedWith(s, s.objects[ids[0]!]!)).toBeTruthy();
  });
});

describe("blocking more than one creature (CR 509.1a)", () => {
  it("can block any number; its damage is divided among them (CR 510.1d)", () => {
    supported(palaceGuard, interceptor, highGround, actOfHeroism, valorMadeReal, watcher, entourage, vanguardsShield, ionasBlessing);
    const { s: s0, ap, opp } = setup([]);
    const a1 = putOnBattlefield(s0, ap, bear({ name: "A1", power: "1", toughness: "1" }));
    const a2 = putOnBattlefield(s0, ap, bear({ name: "A2", power: "1", toughness: "1" }));
    const a3 = putOnBattlefield(s0, ap, bear({ name: "A3", power: "1", toughness: "1" }));
    const guard = putOnBattlefield(s0, opp, palaceGuard);
    let s = toBlocks(s0, ap, opp, [a1, a2, a3]);
    expect(maxBlocks(s, s.objects[guard]!)).toBe(Infinity);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [a1, a2, a3].map((attacker) => ({ blocker: guard, attacker })) });
    s = finishBlocks(s);
    expect(s.objects[guard]!.blocking).toEqual([a1, a2, a3]);
    for (const a of [a1, a2, a3]) expect(s.objects[a]!.blockedBy).toEqual([guard]);
    s = passUntil(s, "endCombat", ap);
    // 1 damage: lethal to the first; the guard takes 3.
    expect(s.objects[a1]!.zone).toBe("graveyard");
    expect(s.objects[a2]!.zone).toBe("battlefield");
    expect(s.objects[guard]!.damage).toBe(3);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("a creature blocks one attacker unless it can block more; additional ones add up (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const atk = [1, 2, 3, 4].map((i) => putOnBattlefield(s0, ap, bear({ name: `A${i}` })));
    const plainBlocker = putOnBattlefield(s0, opp, bear({ name: "Blocker" }));
    const ic = putOnBattlefield(s0, opp, interceptor);
    let s = toBlocks(s0, ap, opp, atk);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: plainBlocker, attacker: atk[0]! }, { blocker: plainBlocker, attacker: atk[1]! }] })).toThrow(/one creature/);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: atk.slice(0, 3).map((attacker) => ({ blocker: ic, attacker })) })).toThrow(/2 creatures/);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: ic, attacker: atk[0]! }, { blocker: ic, attacker: atk[0]! }] })).toThrow(/already blocks/);
    act(s, { type: "declareBlockers", player: opp, blocks: atk.slice(0, 2).map((attacker) => ({ blocker: ic, attacker })) });
    // High Ground: one more each.
    putOnBattlefield(s, opp, highGround);
    expect(maxBlocks(s, s.objects[ic]!)).toBe(3);
    expect(maxBlocks(s, s.objects[plainBlocker]!)).toBe(2);
    act(s, { type: "declareBlockers", player: opp, blocks: atk.slice(0, 3).map((attacker) => ({ blocker: ic, attacker })) });
  });

  it("until end of turn: Act of Heroism and Valor Made Real; Watcher in the Web; the monarch", () => {
    const { s: s0, ap, ids } = setup([actOfHeroism, valorMadeReal]);
    const b1 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear({ name: "Bear Two" }));
    let s = settle(castNow(s0, ap, ids[0]!, [target(b1)]));
    expect(maxBlocks(s, s.objects[b1]!)).toBe(2);
    expect(pt(s, b1)).toBe("4/4");
    s = settle(castNow(s, ap, ids[1]!, [target(b2)]));
    expect(maxBlocks(s, s.objects[b2]!)).toBe(Infinity);
    const w = putOnBattlefield(s, ap, watcher);
    expect(maxBlocks(s, s.objects[w]!)).toBe(8);
    const e = putOnBattlefield(s, ap, entourage);
    s.monarch = undefined;
    invalidateCharacteristics(s);
    expect(maxBlocks(s, s.objects[e]!)).toBe(1);
    becomeMonarch(s, ap);
    expect(maxBlocks(s, s.objects[e]!)).toBe(2);
  });

  it("'blocks' triggers once; 'blocks a creature' once for each (CR 509.3a-b)", () => {
    const { s: s0, ap, opp } = setup([]);
    const a1 = putOnBattlefield(s0, ap, bear({ name: "A1" }));
    const a2 = putOnBattlefield(s0, ap, bear({ name: "A2" }));
    const once = card("Once Wall", "Creature — Wall", "{W}", { power: "0", toughness: "6", oracleText: "This creature can block any number of creatures.\nWhenever this creature blocks, you gain 1 life." });
    const each = card("Each Wall", "Creature — Wall", "{W}", { power: "0", toughness: "6", oracleText: "This creature can block any number of creatures.\nWhenever this creature blocks a creature, you gain 1 life." });
    supported(once, each);
    const w1 = putOnBattlefield(s0, opp, once);
    const w2 = putOnBattlefield(s0, opp, each);
    let s = toBlocks(s0, ap, opp, [a1, a2]);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [a1, a2].flatMap((attacker) => [{ blocker: w1, attacker }, { blocker: w2, attacker }]) });
    s = settle(finishBlocks(s));
    expect(s.players[opp]!.life).toBe(43);
  });

  it("bots block extra attackers with a creature that can, when it survives them all", () => {
    const { s: s0, ap, opp } = setup([]);
    const a1 = putOnBattlefield(s0, ap, bear({ name: "A1", power: "1", toughness: "1" }));
    const a2 = putOnBattlefield(s0, ap, bear({ name: "A2", power: "1", toughness: "1" }));
    const guard = putOnBattlefield(s0, opp, palaceGuard);
    let s = toBlocks(s0, ap, opp, [a1, a2]);
    for (const a of botActions(s, opp)) s = act(s, a);
    expect(s.objects[guard]!.blocking?.length).toBe(2);
  });
});

describe("Backgrounds and two commanders (CR 702.124)", () => {
  it("'choose a Background' pairs with a legendary Background; partners pair with partners", () => {
    supported(erinis, wilson, cultist, flamingFist, guildArtisan, swordCoastSailor);
    expect(commanderPairProblem(erinis, cultist)).toBeNull();
    expect(commanderPairProblem(cultist, wilson)).toBeNull();
    expect(commanderPairProblem(legendA, legendB)).toBeNull();
    expect(commanderPairProblem(erinis, wilson)).toMatch(/702.124/);
    expect(commanderPairProblem(legendA, cultist)).toMatch(/702.124/);
    expect(commanderPairProblem(commander("Plain Legend"), commander("Other Legend"))).toMatch(/702.124/);
    const deck = Array.from({ length: 98 }, () => forest);
    expect(validateCommanderDeck(erinis, deck, new Set(), cultist)).toEqual([]);
    expect(validateCommanderDeck(erinis, [...deck, forest], new Set(), cultist).map((p) => p.problem)).toContain("deck has 101 cards including the commanders, needs 100");
    // A Background alone can't be a commander.
    expect(validateCommanderDeck(cultist, [...deck, forest]).map((p) => p.problem)).toContain("isn't a legendary creature");
    // The combined color identity (CR 702.124c): Cultist adds black.
    const swampCard = card("Swamp Thing", "Creature — Horror", "{B}", { power: "1", toughness: "1" });
    expect(validateCommanderDeck(erinis, [...deck.slice(1), swampCard], new Set(), cultist)).toEqual([]);
    expect(validateCommanderDeck(erinis, [...deck, swampCard])).toEqual([{ card: swampCard.name, problem: "outside the commander's color identity" }]);
  });

  it("both start in the command zone and are cast and taxed separately (CR 702.124b, d)", () => {
    const deck = Array.from({ length: 98 }, () => forest);
    const s = createGame(
      ["A", "B", "C", "D"].map((name, i) => (i === 0 ? { name, commander: erinis, secondCommander: cultist, deck } : { name, commander: commander(`C${i}`), deck: [...deck, forest] })),
      7,
    );
    const p = s.players[0]!;
    expect(p.command.length).toBe(2);
    expect(p.command.map((id) => s.cards[s.objects[id]!.cardId]!.name).sort()).toEqual([cultist.name, erinis.name]);
    expect(p.command.every((id) => s.objects[id]!.isCommander)).toBe(true);
    expect(Object.keys(p.commanderCasts).length).toBe(2);
    expect(p.library.length + p.hand.length).toBe(98);
  });

  it("a Background's abilities go to the commander creatures its controller owns, wherever they are controlled", () => {
    const { s, ap, opp } = setup([]);
    const mine = putOnBattlefield(s, ap, erinis, { commander: true });
    const notCommander = putOnBattlefield(s, ap, wilson);
    const theirs = putOnBattlefield(s, opp, commander("Their Commander"), { commander: true });
    putOnBattlefield(s, ap, cultist);
    expect(pt(s, mine)).toBe("6/6");
    expect(objHasKeyword(s, s.objects[mine]!, "Flying")).toBe(true);
    expect(characteristics(s, s.objects[mine]!).grantedAbilities.length).toBe(2);
    expect(pt(s, notCommander)).toBe("2/2");
    expect(pt(s, theirs)).toBe("3/3");
    addEffect(s, opp, [mine], [{ kind: "control" }], "game");
    expect(pt(s, mine)).toBe("6/6");
  });

  it("'whenever this creature attacks a player, if no opponent has more life than that player' (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const cmd = putOnBattlefield(s0, ap, erinis, { commander: true });
    putOnBattlefield(s0, ap, guildArtisan);
    putOnBattlefield(s0, ap, swordCoastSailor);
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    // The attacker's own life isn't compared: only its opponents'.
    s0.players[ap]!.life = 99;
    s0.players[others[0]!]!.life = 39;
    let s = passUntil(s0, "declareAttackers", ap);
    const treasures = () => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Treasure Token" && s.objects[id]!.controller === ap).length;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: cmd, defender: opp }] });
    // Erinis's own attack trigger has no target (no land in the graveyard); the two Background triggers resolve.
    s = settle(s);
    expect(treasures()).toBe(2);
    expect(characteristics(s, s.objects[cmd]!).cantBeBlocked).toBe(true);
  });

  it("attacking a player with less life than another opponent does nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const cmd = putOnBattlefield(s0, ap, erinis, { commander: true });
    putOnBattlefield(s0, ap, guildArtisan);
    s0.players[opp]!.life = 30;
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: cmd, defender: opp }] }));
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Treasure Token").length).toBe(0);
  });
});
