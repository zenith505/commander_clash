// Cards about battles from round 86 (CR 310), and what they needed: "attacked a battle this turn", "each battle they
// protect", "battle that player protects", "if it's attacking a battle", "a spell that has convoke"; putting cards from
// the hand on the bottom of the library, "you may choose a ... card from it" with "If you don't", "If they do" after
// "unless its controller pays", "loses all counters", doubling power and toughness (CR 701.10b-c), "look at that many
// cards", transforming an Incubator token (CR 701.27a, 111.10i), and "as long as it entered this turn".

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, pt, putOnBattlefield, scry, setup, target } from "./helpers";
import { botActions, isFullySupported, objHasKeyword, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const warHistorian = card("War Historian", "Creature — Human Monk", "{2}{G}", { power: "3", toughness: "3", keywords: ["Reach"], oracleText: "Reach\nThis creature has indestructible as long as it attacked a battle this turn." });
const joyfulStormsculptor = card("Joyful Stormsculptor", "Creature — Human Shaman", "{3}{U}{R}", { power: "2", toughness: "3", oracleText: "When this creature enters, create two 1/1 blue and red Elemental creature tokens.\nWhenever you cast a spell that has convoke, this creature deals 1 damage to each opponent and each battle they protect." });
const rampagingRaptor = card("Rampaging Raptor", "Creature — Dinosaur", "{2}{R}{R}", { power: "4", toughness: "4", keywords: ["Haste","Trample"], oracleText: "Trample, haste\n{2}{R}: This creature gets +2/+0 until end of turn.\nWhenever this creature deals combat damage to an opponent, it deals that much damage to target planeswalker that player controls or battle that player protects." });
const rampagingGeoderm = card("Rampaging Geoderm", "Creature — Dinosaur Beast", "{2}{R}{G}", { power: "3", toughness: "3", keywords: ["Haste","Trample"], oracleText: "Trample, haste\nWhenever you attack, target attacking creature gets +1/+1 until end of turn. If it's attacking a battle, put a +1/+1 counter on it instead." });
const volcanicSpite = card("Volcanic Spite", "Instant", "{1}{R}", { oracleText: "Volcanic Spite deals 3 damage to target creature, planeswalker, or battle. You may put a card from your hand on the bottom of your library. If you do, draw a card." });
const intoTheFire = card("Into the Fire", "Sorcery", "{2}{R}", { oracleText: "Choose one —\n• Into the Fire deals 2 damage to each creature, planeswalker, and battle.\n• Put any number of cards from your hand on the bottom of your library, then draw that many cards plus one." });
const valakutAwakening = scry("modal_dfc", [
  { name: "Valakut Awakening", mana_cost: "{2}{R}", type_line: "Instant", oracle_text: "Put any number of cards from your hand on the bottom of your library, then draw that many cards plus one." },
  { name: "Valakut Stoneforge", type_line: "Land", oracle_text: "This land enters tapped.\n{T}: Add {R}." },
]);
const traumaticRevelation = card("Traumatic Revelation", "Sorcery", "{1}{B}", { keywords: ["Incubate","Transform"], oracleText: "Target opponent reveals their hand. You may choose a creature or battle card from it. If you do, that player discards that card. If you don't, incubate 3. (Create an Incubator token with three +1/+1 counters on it and \"{2}: Transform this token.\" It transforms into a 0/0 Phyrexian artifact creature.)" });
const assimilateEssence = card("Assimilate Essence", "Instant", "{1}{U}", { keywords: ["Incubate","Transform"], oracleText: "Counter target creature or battle spell unless its controller pays {4}. If they do, you incubate 2. (Create an Incubator token with two +1/+1 counters on it and \"{2}: Transform this token.\" It transforms into a 0/0 Phyrexian artifact creature.)" });
const finalAct = card("Final Act", "Sorcery", "{4}{B}{B}", { oracleText: "Choose one or more —\n• Destroy all creatures.\n• Destroy all planeswalkers.\n• Destroy all battles.\n• Exile all graveyards.\n• Each opponent loses all counters." });
const halochargedSkaab = card("Halo-Charged Skaab", "Creature — Zombie", "{4}{U}", { power: "4", toughness: "4", keywords: ["Mill"], oracleText: "When this creature enters, each player mills two cards. Then you may put an instant, sorcery, or battle card from your graveyard on top of your library. (To mill two cards, a player puts the top two cards of their library into their graveyard.)" });
const dragonclawStrike = card("Dragonclaw Strike", "Sorcery", "{2/G}{2/U}{2/R}", { keywords: ["Fight","Double"], oracleText: "Double the power and toughness of target creature you control until end of turn. Then it fights up to one target creature an opponent controls. (Each deals damage equal to its power to the other.)" });
const grunnTheLonelyKing = card("Grunn, the Lonely King", "Legendary Creature — Ape Warrior", "{4}{G}{G}", { power: "5", toughness: "5", keywords: ["Double","Kicker"], oracleText: "Kicker {3} (You may pay an additional {3} as you cast this spell.)\nIf Grunn was kicked, it enters with five +1/+1 counters on it.\nWhenever Grunn attacks alone, double its power and toughness until end of turn." });
const doomskarWarrior = card("Doomskar Warrior", "Creature — Human Warrior", "{2}{G}{G}", { power: "4", toughness: "3", keywords: ["Backup","Trample"], oracleText: "Backup 1\nTrample\nWhenever this creature deals combat damage to a player or battle, look at that many cards from the top of your library. You may reveal a creature or land card from among them and put it into your hand. Put the rest on the bottom of your library in a random order." });
const attentiveSkywarden = card("Attentive Skywarden", "Creature — Phyrexian Kor", "{2}{W}", { power: "2", toughness: "2", keywords: ["Flying","Transform"], oracleText: "Flying\nWhenever this creature deals combat damage to a player or battle, transform up to one target Incubator token you control." });
const mutagenConnoisseur = card("Mutagen Connoisseur", "Creature — Vedalken Mutant", "{1}{G}{U}", { power: "0", toughness: "5", keywords: ["Flying","Vigilance","Transform"], oracleText: "Flying, vigilance\nThis creature gets +1/+0 for each transformed permanent you control." });
const drownyardBehemoth = card("Drownyard Behemoth", "Creature — Eldrazi Crab", "{9}", { power: "5", toughness: "7", keywords: ["Emerge","Flash"], oracleText: "Flash (You may cast this spell any time you could cast an instant.)\nEmerge {7}{U} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nThis creature has hexproof as long as it entered this turn." });

const SIEGE = "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\n";
const belenon = scry("transform", [
  { name: "Invasion of Belenon", mana_cost: "{2}{W}", type_line: "Battle — Siege", defense: "5", oracle_text: `${SIEGE}When this Siege enters, create a 2/2 white and blue Knight creature token with vigilance.` },
  { name: "Belenon War Anthem", type_line: "Enchantment", color_indicator: ["W"], oracle_text: "Creatures you control get +1/+1." },
]);
const stoke = card("Stoke the Flames", "Instant", "{2}{R}{R}", { keywords: ["Convoke"], oracleText: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nStoke the Flames deals 4 damage to any target." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const ALL = [warHistorian, joyfulStormsculptor, rampagingRaptor, rampagingGeoderm, volcanicSpite, intoTheFire, valakutAwakening, traumaticRevelation, assimilateEssence, finalAct, halochargedSkaab, dragonclawStrike, grunnTheLonelyKing, doomskarWarrior, attentiveSkywarden, mutagenConnoisseur, drownyardBehemoth];

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** A battle on the battlefield as it would have entered: its defense counters and protector. */
const battleFor = (s: GameState, pid: PlayerId, protector: PlayerId, defense = 5) => {
  const id = putOnBattlefield(s, pid, belenon);
  s.objects[id]!.counters.defense = defense;
  s.objects[id]!.protector = protector;
  return id;
};
const inZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
/** Attack, no blocks, through combat damage; triggers waiting for targets are left pending. */
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId; planeswalker?: string }[]) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 200 && s.step !== "endCombat" && !(s.pending && s.pending.kind !== "declareBlockers"); i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const other = (s: GameState, ap: PlayerId, k: number) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % 4]!;

describe("cards about battles (round 86)", () => {
  it("compiles them", () => {
    for (const d of ALL) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("War Historian has indestructible only once it attacked a battle this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, warHistorian);
    const b = battleFor(s0, ap, opp, 20);
    expect(objHasKeyword(s0, s0.objects[h]!, "Indestructible")).toBe(false);
    const atPlayer = attack(structuredClone(s0), ap, [{ attacker: h, defender: opp }]);
    expect(objHasKeyword(atPlayer, atPlayer.objects[h]!, "Indestructible")).toBe(false);
    const s = attack(s0, ap, [{ attacker: h, defender: opp, planeswalker: b }]);
    expect(objHasKeyword(s, s.objects[h]!, "Indestructible")).toBe(true);
  });

  it("Joyful Stormsculptor: a convoke spell deals 1 to each opponent and each battle an opponent protects", () => {
    const { s: s0, ap, ids, opp } = setup([stoke]);
    putOnBattlefield(s0, ap, joyfulStormsculptor);
    const mine = battleFor(s0, ap, opp);
    const theirs = battleFor(s0, opp, ap);
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: other(s0, ap, 2) }]);
    s = settle(s);
    for (const p of [opp, other(s, ap, 2), other(s, ap, 3)]) expect(s.players[p]!.life).toBeLessThan(40);
    expect(s.players[opp]!.life).toBe(39);
    expect(s.players[ap]!.life).toBe(40);
    expect(s.objects[mine]!.counters.defense).toBe(4);
    expect(s.objects[theirs]!.counters.defense).toBe(5);
  });

  it("Rampaging Raptor: that much damage to a planeswalker that player controls or a battle that player protects", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rampagingRaptor);
    const theirs = battleFor(s0, ap, opp, 9);
    const elsewhere = battleFor(s0, ap, other(s0, ap, 2), 9);
    let s = attack(s0, ap, [{ attacker: r, defender: opp }]);
    expect(s.players[opp]!.life).toBe(36);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(elsewhere)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(theirs)] }));
    expect(s.objects[theirs]!.counters.defense).toBe(5);
  });

  it("Rampaging Geoderm: a +1/+1 counter instead if the creature is attacking a battle", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, rampagingGeoderm);
    const b = battleFor(s0, ap, opp, 20);
    const answer = (s: GameState) => (s.pending?.kind === "chooseTargets" ? settle(act(s, { type: "chooseTargets", player: ap, targets: [target(g)] })) : s);
    const s = answer(attack(structuredClone(s0), ap, [{ attacker: g, defender: opp, planeswalker: b }]));
    expect(s.objects[g]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, g)).toBe("4/4");
    let t = passUntil(s0, "declareAttackers", ap);
    t = act(t, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] });
    t = answer(t);
    expect(t.objects[g]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(pt(t, g)).toBe("4/4");
  });

  it("Volcanic Spite: 3 damage to a battle, then you may put a card from your hand on the bottom to draw a card", () => {
    const { s: s0, ap, ids, opp } = setup([volcanicSpite, bear()]);
    const b = battleFor(s0, ap, opp);
    let s = cast(s0, ap, ids[0]!, [target(b)]);
    expect(s.objects[b]!.counters.defense).toBe(2);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "handToTop", player: ap, count: 1, bottom: true });
    s = settle(act(s, { type: "handToTop", player: ap, objectIds: [ids[1]!] }));
    const lib = s.players[ap]!.library;
    expect(lib[lib.length - 1]).toBe(ids[1]!);
    expect(s.players[ap]!.hand).toHaveLength(hand);
    expect(s.players[ap]!.hand).not.toContain(ids[1]!);
  });

  it("Valakut Awakening: any number of cards on the bottom, the first lowest, then draw that many plus one", () => {
    const { s: s0, ap, ids } = setup([valakutAwakening, bear(), bear(), shock]);
    const hand = s0.players[ap]!.hand.length - 1;
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromHand: true, bottom: true, min: 0, max: hand });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!, ids[3]!] }));
    const lib = s.players[ap]!.library;
    expect(lib.slice(-2)).toEqual([ids[3]!, ids[1]!]);
    expect(s.players[ap]!.hand).toHaveLength(hand + 1);
    // None: draw one.
    let t = cast(s0, ap, ids[0]!);
    t = settle(act(t, { type: "searchLibrary", player: ap, found: [] }));
    expect(t.players[ap]!.hand).toHaveLength(hand + 1);
  });

  it("Into the Fire: 2 damage to each creature, planeswalker and battle", () => {
    const { s: s0, ap, ids, opp } = setup([intoTheFire]);
    const b = battleFor(s0, ap, opp);
    const x = putOnBattlefield(s0, opp, bear());
    const s = cast(s0, ap, ids[0]!, undefined, [0]);
    expect(s.objects[b]!.counters.defense).toBe(3);
    expect(s.objects[x]!.zone).toBe("graveyard");
  });

  it("Traumatic Revelation: a creature or battle card discarded, or if you choose none, incubate 3", () => {
    const { s: s0, ap, ids, opp } = setup([traumaticRevelation]);
    const c = inZone(s0, opp, bear(), "hand");
    const sh = inZone(s0, opp, shock, "hand");
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", hand: opp, min: 0 });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect(s.pending.cards).toContain(c);
    expect(s.pending.cards).not.toContain(sh);
    const none = settle(act(structuredClone(s), { type: "searchLibrary", player: ap, found: [] }));
    const incubator = none.battlefield.find((id) => none.objects[id]!.isToken);
    expect(incubator && none.objects[incubator]!.counters["+1/+1"]).toBe(3);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [c] }));
    expect(s.objects[c]!.zone).toBe("graveyard");
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
  });

  it("Assimilate Essence: if they pay, you incubate 2; if they don't, the spell is countered", () => {
    const { s: s0, ap, ids } = setup([assimilateEssence, bear()]);
    // Our own creature spell on the stack, and Assimilate Essence aimed at it.
    let s = s0;
    for (const a of planCast(s, ap, ids[1]!)!) s = act(s, a);
    const spell = s.stack[s.stack.length - 1]!;
    for (const a of planCast(s, ap, ids[0]!, [{ kind: "stack", id: spell.id }])!) s = act(s, a);
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{4}" });
    const no = settle(act(structuredClone(s), { type: "payUnless", player: ap, pay: false }));
    expect(no.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(no.battlefield.some((id) => no.objects[id]!.isToken)).toBe(false);
    // Paying: the mana first, as the bot does it.
    const pay = botActions(s, ap);
    expect(pay[pay.length - 1]).toMatchObject({ type: "payUnless", pay: true });
    for (const a of pay) s = act(s, a);
    s = settle(s);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    const inc = s.battlefield.find((id) => s.objects[id]!.isToken);
    expect(inc && s.objects[inc]!.counters["+1/+1"]).toBe(2);
  });

  it("Final Act: destroys battles, and each opponent loses all their counters", () => {
    const { s: s0, ap, ids, opp } = setup([finalAct]);
    const b = battleFor(s0, ap, opp);
    s0.players[opp]!.poison = 3;
    s0.players[opp]!.energy = 2;
    s0.players[ap]!.energy = 4;
    const s = cast(s0, ap, ids[0]!, undefined, [2, 4]);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[opp]!.poison ?? 0).toBe(0);
    expect(s.players[opp]!.energy ?? 0).toBe(0);
    expect(s.players[ap]!.energy).toBe(4);
  });

  it("Halo-Charged Skaab: after the mills, you may put an instant, sorcery or battle card from your graveyard on top", () => {
    const { s: s0, ap, ids } = setup([halochargedSkaab]);
    const sh = inZone(s0, ap, shock, "graveyard");
    const b = inZone(s0, ap, bear(), "graveyard");
    let s = cast(s0, ap, ids[0]!);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromGraveyard: "libraryTop", min: 0, max: 1 });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect(s.pending.cards).toContain(sh);
    expect(s.pending.cards).not.toContain(b);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [sh] }));
    expect(s.players[ap]!.library[0]).toBe(sh);
  });

  it("Dragonclaw Strike and Grunn double power and toughness (CR 701.10b)", () => {
    const { s: s0, ap, ids, opp } = setup([dragonclawStrike]);
    const x = putOnBattlefield(s0, ap, bear({ power: "3", toughness: "2" }));
    const y = putOnBattlefield(s0, opp, bear({ power: "3", toughness: "3" }));
    const s = cast(s0, ap, ids[0]!, [target(x), target(y)]);
    expect(pt(s, x)).toBe("6/4");
    expect(s.objects[x]!.damage).toBe(3);
    expect(s.objects[y]!.zone).toBe("graveyard");
    const { s: t0, ap: a2, opp: o2 } = setup([]);
    const g = putOnBattlefield(t0, a2, grunnTheLonelyKing);
    const other2 = putOnBattlefield(t0, a2, bear());
    let t = passUntil(structuredClone(t0), "declareAttackers", a2);
    t = settle(act(t, { type: "declareAttackers", player: a2, attacks: [{ attacker: g, defender: o2 }] }));
    expect(pt(t, g)).toBe("10/10");
    let u = passUntil(t0, "declareAttackers", a2);
    u = settle(act(u, { type: "declareAttackers", player: a2, attacks: [{ attacker: g, defender: o2 }, { attacker: other2, defender: o2 }] }));
    expect(pt(u, g)).toBe("5/5");
  });

  it("Doomskar Warrior looks at as many cards as the combat damage it dealt", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, doomskarWarrior);
    const s = attack(s0, ap, [{ attacker: w, defender: opp }]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect(s.pending.dig?.looked).toHaveLength(4);
  });

  it("Attentive Skywarden transforms an Incubator token, which Mutagen Connoisseur counts as transformed", () => {
    const { s: s0, ap, ids, opp } = setup([traumaticRevelation]);
    const sky = putOnBattlefield(s0, ap, attentiveSkywarden);
    const m = putOnBattlefield(s0, ap, mutagenConnoisseur);
    // An Incubator from Traumatic Revelation, choosing nothing.
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    const inc = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(pt(s, m)).toBe("0/5");
    s = attack(s, ap, [{ attacker: sky, defender: opp }]);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(inc)] }));
    expect(pt(s, inc)).toBe("3/3");
    expect(pt(s, m)).toBe("1/5");
  });

  it("Drownyard Behemoth has hexproof only the turn it entered", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, drownyardBehemoth);
    s0.objects[d]!.enteredTurn = s0.turn;
    expect(objHasKeyword(s0, s0.objects[d]!, "Hexproof")).toBe(true);
    const s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(objHasKeyword(s, s.objects[d]!, "Hexproof")).toBe(false);
  });
});
