// Protection, shroud, infect, wither, toxic and poison, exalted, landfall, attack and block
// requirements/restrictions, and regeneration.
// CR 702.16, 702.18, 702.90, 702.80, 702.164, 704.5c, 702.83, 508.1d, 509.1b, 701.19.

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, forest, passAll, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, characteristics, modifications, compileCard, isFullySupported, planCast, waitingOn, type GameState, type PlayerId } from "../src";

const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const logged = (s: GameState, re: RegExp) => s.log.some((e) => re.test(e.text));
const counters = (s: GameState, id: string) => s.objects[id]!.counters["-1/-1"] ?? 0;

/** From the active player's main 1: attack with `attacks`, then `blocks` by the defender, then deal damage. */
function fight(s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], blocks: { blocker: string; attacker: string }[] = []) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 12 && s.pending?.kind !== "declareBlockers" && s.step !== "endCombat"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  while (s.pending?.kind === "declareBlockers") {
    const pid = s.pending.player;
    s = act(s, { type: "declareBlockers", player: pid, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === pid) });
  }
  return passUntil(s, "endCombat", ap);
}

const bolt = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const pro = (color: string, extra: Partial<Parameters<typeof card>[3]> = {}) =>
  bear({ name: `Pro-${color} Bear`, oracleText: `Protection from ${color}`, keywords: ["Protection"], ...extra });

describe("protection from a color (CR 702.16)", () => {
  it("reads the color from the text, replacing the card data's generic keyword", () => {
    const { s, opp } = setup([]);
    const id = putOnBattlefield(s, opp, pro("red"));
    expect(characteristics(s, s.objects[id]!).keywords).toEqual(["Protection from red"]);
    expect(modifications(s, s.objects[id]!).grantedKeywords).toEqual([]); // printed, not granted
    expect(isFullySupported(pro("red"))).toBe(true);
    const two = card("Knight", "Creature — Knight", "{B}{B}", { power: "2", toughness: "2", oracleText: "First strike, protection from white and from red", keywords: ["First strike", "Protection"] });
    expect(compileCard(two).textKeywords).toEqual(["Protection from white", "Protection from red"]);
  });

  it("can't be targeted by spells of that color (702.16b), but other colors are fine", () => {
    const pump = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
    const { s, ap, ids, opp } = setup([bolt, pump]);
    const id = putOnBattlefield(s, opp, pro("red"));
    expect(planCast(s, ap, ids[0]!, [target(id)])).toBeNull();
    const after = cast(s, ap, ids[1]!, [target(id)]);
    expect(pt(after, id)).toBe("5/5");
  });

  it("can't be targeted by abilities from a source of that color", () => {
    const pinger = card("Red Pinger", "Creature — Human", "{R}", { power: "1", toughness: "1", oracleText: "{T}: Red Pinger deals 1 damage to any target.", colors: ["R"] });
    const { s, ap, opp } = setup([]);
    const p = putOnBattlefield(s, ap, pinger);
    const id = putOnBattlefield(s, opp, pro("red"));
    expect(() => activate(s, ap, p, 0, [target(id)])).toThrow();
  });

  it("prevents damage from sources of that color, including untargeted damage", () => {
    const quake = card("Quake", "Sorcery", "{R}", { oracleText: "Quake deals 3 damage to each creature." });
    const { s: s0, ap, ids, opp } = setup([quake]);
    const id = putOnBattlefield(s0, opp, pro("red"));
    const other = putOnBattlefield(s0, opp, bear());
    const s = cast(s0, ap, ids[0]!);
    expect(zone(s, id)).toBe("battlefield");
    expect(s.objects[id]!.damage).toBe(0);
    expect(zone(s, other)).toBe("graveyard");
    expect(logged(s, /prevented \(protection\)/)).toBe(true);
  });

  it("can't be blocked by creatures of that color (702.16f), and its combat damage to them happens", () => {
    const { s: s0, ap, opp } = setup([]);
    const knight = putOnBattlefield(s0, ap, pro("red"));
    const redBlocker = putOnBattlefield(s0, opp, bear({ name: "Red Bear", colors: ["R"] }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: knight, defender: opp }] });
    for (let i = 0; i < 12 && !(s.pending?.kind === "declareBlockers" && s.pending.player === opp); i++)
      s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: redBlocker, attacker: knight }] })).toThrow(/protection/);
  });

  it("an Aura of that color falls off (702.16c); Equipment of that color becomes unattached (702.16d)", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, bear());
    const aura = putOnBattlefield(s0, ap, card("Red Aura", "Enchantment — Aura", "{R}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+1.", colors: ["R"] }));
    const sword = putOnBattlefield(s0, ap, card("Red Sword", "Artifact — Equipment", "{R}", { oracleText: "Equipped creature gets +1/+1.\nEquip {1}", colors: ["R"] }));
    s0.objects[aura]!.attachedTo = id;
    s0.objects[sword]!.attachedTo = id;
    // The creature gains protection from red.
    s0.effects.push({ id: "x", timestamp: s0.nextTimestamp++, controller: ap, sourceName: "test", duration: "endOfTurn", affected: [id], mods: [{ kind: "addKeywords", keywords: ["Protection from red"] }] });
    const s = act(s0, { type: "passPriority", player: ap });
    expect(zone(s, aura)).toBe("graveyard");
    expect(zone(s, sword)).toBe("battlefield");
    expect(s.objects[sword]!.attachedTo).toBeUndefined();
  });
});

describe("shroud (CR 702.18)", () => {
  it("can't be targeted, even by its own controller", () => {
    const pump = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
    const { s, ap, ids } = setup([pump]);
    const id = putOnBattlefield(s, ap, bear({ name: "Shrouded", oracleText: "Shroud", keywords: ["Shroud"] }));
    expect(planCast(s, ap, ids[0]!, [target(id)])).toBeNull();
  });
});

describe("infect, wither, toxic and poison counters", () => {
  const infect = (n = 2, extra = {}) => bear({ name: "Infector", power: String(n), oracleText: "Infect", keywords: ["Infect"], ...extra });

  it("infect: combat damage to a player gives poison counters instead of life loss (702.90b)", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, infect(3));
    const s = fight(s0, ap, [{ attacker: a, defender: opp }]);
    expect(s.players[opp]!.life).toBe(40);
    expect(s.players[opp]!.poison).toBe(3);
  });

  it("infect: damage to a creature is -1/-1 counters, not marked damage (702.90c)", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, infect(2));
    const b = putOnBattlefield(s0, opp, bear({ name: "Big", power: "1", toughness: "4" }));
    const s = fight(s0, ap, [{ attacker: a, defender: opp }], [{ blocker: b, attacker: a }]);
    expect(counters(s, b)).toBe(2);
    expect(s.objects[b]!.damage).toBe(0);
    expect(pt(s, b)).toBe("-1/2");
  });

  it("ten or more poison counters loses the game (704.5c)", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[opp]!.poison = 8;
    const a = putOnBattlefield(s0, ap, infect(2));
    const s = fight(s0, ap, [{ attacker: a, defender: opp }]);
    expect(s.players[opp]!.lost).toBe(true);
    expect(s.players[opp]!.lossReason).toMatch(/poison/);
  });

  it("infect with lifelink still gains life: damage was dealt (702.15b)", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, infect(2, { oracleText: "Infect, lifelink", keywords: ["Infect", "Lifelink"] }));
    const s = fight(s0, ap, [{ attacker: a, defender: opp }]);
    expect(s.players[ap]!.life).toBe(42);
  });

  it("noncombat infect damage from a spell-like ability works the same (702.90e)", () => {
    const pinger = card("Infect Pinger", "Creature — Horror", "{B}", { power: "1", toughness: "1", oracleText: "Infect\n{T}: Infect Pinger deals 1 damage to any target.", keywords: ["Infect"] });
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, pinger);
    const s = activate(s0, ap, p, 0, [{ kind: "player", id: opp }]);
    expect(s.players[opp]!.poison).toBe(1);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("wither: -1/-1 counters on creatures, but ordinary life loss for players (702.80a)", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, bear({ name: "Witherer", power: "3", oracleText: "Wither", keywords: ["Wither"] }));
    const b = putOnBattlefield(s0, opp, bear({ name: "Big", power: "0", toughness: "5" }));
    let s = fight(s0, ap, [{ attacker: a, defender: opp }], [{ blocker: b, attacker: a }]);
    expect(counters(s, b)).toBe(3);
    // Counters stay after cleanup, unlike damage.
    s = passUntil(s, "upkeep");
    expect(pt(s, b)).toBe("-3/2");
  });

  it("toxic: combat damage to a player also gives that many poison counters (702.164c)", () => {
    const toxic = bear({ name: "Toxic Bear", oracleText: "Toxic 2", keywords: ["Toxic"] });
    const { s: s0, ap, opp } = setup([]);
    expect(isFullySupported(toxic)).toBe(true);
    const a = putOnBattlefield(s0, ap, toxic);
    const s = fight(s0, ap, [{ attacker: a, defender: opp }]);
    expect(s.players[opp]!.life).toBe(38);
    expect(s.players[opp]!.poison).toBe(2);
  });
});

describe("exalted (CR 702.83)", () => {
  const exalted = bear({ name: "Squire", power: "1", toughness: "1", oracleText: "Exalted", keywords: ["Exalted"] });

  it("each instance triggers when a creature attacks alone, pumping that creature", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, exalted);
    putOnBattlefield(s0, ap, exalted);
    const a = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    expect(s.stack.filter((x) => /Exalted/.test(x.description))).toHaveLength(2);
    s = passAll(passAll(s));
    expect(pt(s, a)).toBe("4/4");
  });

  it("doesn't trigger when two creatures attack", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, exalted);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: opp }] });
    expect(s.stack).toHaveLength(0);
  });
});

describe("landfall and self-referencing triggers", () => {
  it("landfall: pumps when a land you control enters, not an opponent's", () => {
    const fall = bear({ name: "Landfaller", oracleText: "Landfall — Whenever a land you control enters, Landfaller gets +2/+2 until end of turn." });
    const land = card("Forest", "Basic Land — Forest");
    const { s: s0, ap, ids } = setup([land]);
    const id = putOnBattlefield(s0, ap, fall);
    expect(isFullySupported(fall)).toBe(true);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    s = passAll(s);
    expect(pt(s, id)).toBe("4/4");
  });

  it('"When ~ enters, it deals 2 damage to any target" means the permanent deals it', () => {
    const c = bear({ name: "Flamekin", oracleText: "When Flamekin enters, it deals 2 damage to any target." });
    expect(isFullySupported(c)).toBe(true);
    expect(compileCard(c).triggers[0]!.body.effects[0]).toMatchObject({ type: "damage", amount: 2 });
  });
});

describe("attack requirements and block restrictions (CR 508.1d, 509.1b)", () => {
  const berserker = bear({ name: "Berserker", oracleText: "Berserker attacks each combat if able." });

  it("a creature that attacks each combat if able has to attack when it can", () => {
    const { s: s0, ap, opp } = setup([]);
    const id = putOnBattlefield(s0, ap, berserker);
    const s = passUntil(s0, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow(/attacks each combat if able/);
    act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: id, defender: opp }] });
    // Bots obey it too.
    const bot = botActions(s, ap)[0]!;
    expect(bot.type === "declareAttackers" && bot.attacks.some((a) => a.attacker === id)).toBe(true);
  });

  it("isn't required when it can't attack (summoning sick)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, bear()); // so there's a declare attackers step this turn
    putOnBattlefield(s0, ap, berserker, { sick: true });
    const s = passUntil(s0, "declareAttackers", ap);
    expect(s.turn).toBe(s0.turn);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).not.toThrow();
  });

  it("a creature that can block only creatures with flying can't block a ground creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, bear());
    const flyer = putOnBattlefield(s0, ap, bear({ name: "Bird", keywords: ["Flying"] }));
    const wall = putOnBattlefield(s0, opp, bear({ name: "Wall", oracleText: "Wall can block only creatures with flying.", keywords: ["Reach"] }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: flyer, defender: opp }] });
    for (let i = 0; i < 12 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: wall, attacker: a }] })).toThrow(/only creatures with flying/);
    act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: wall, attacker: flyer }] });
  });
});

describe("regeneration (CR 701.19)", () => {
  const troll = bear({ name: "Troll", oracleText: "{G}: Regenerate Troll." });
  const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
  const finalMurder = card("Final Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature. It can't be regenerated." });

  it("a shield replaces the next destruction: it stays, tapped, with damage removed", () => {
    const { s: s0, ap, ids } = setup([murder]);
    expect(isFullySupported(troll)).toBe(true);
    const id = putOnBattlefield(s0, ap, troll);
    let s = activate(s0, ap, id, 0);
    expect(s.objects[id]!.regenShields).toBe(1);
    s = cast(s, ap, ids[0]!, [target(id)]);
    expect(zone(s, id)).toBe("battlefield");
    expect(s.objects[id]!.tapped).toBe(true);
    expect(s.objects[id]!.regenShields).toBe(0);
    expect(logged(s, /Troll regenerates/)).toBe(true);
  });

  it('"It can\'t be regenerated" ignores the shield', () => {
    const { s: s0, ap, ids } = setup([finalMurder]);
    expect(isFullySupported(finalMurder)).toBe(true);
    const id = putOnBattlefield(s0, ap, troll);
    let s = activate(s0, ap, id, 0);
    s = cast(s, ap, ids[0]!, [target(id)]);
    expect(zone(s, id)).toBe("graveyard");
  });

  it("saves a creature from lethal combat damage and removes it from combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, bear({ name: "Big", power: "5", toughness: "5" }));
    const t = putOnBattlefield(s0, opp, troll);
    s0.objects[t]!.regenShields = 1;
    const s = fight(s0, ap, [{ attacker: a, defender: opp }], [{ blocker: t, attacker: a }]);
    expect(zone(s, t)).toBe("battlefield");
    expect(s.objects[t]!.blocking).toBeUndefined();
    expect(s.objects[t]!.damage).toBe(0);
    expect(s.players[opp]!.life).toBe(40); // the attacker stays blocked
  });

  it("bots regenerate a creature that would lose its fight, once blocks are declared", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, bear({ name: "Big", power: "5", toughness: "5" }));
    const t = putOnBattlefield(s0, opp, troll);
    putOnBattlefield(s0, opp, forest);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    for (let i = 0; i < 12 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    while (s.pending?.kind === "declareBlockers") {
      const pid = s.pending.player;
      s = act(s, { type: "declareBlockers", player: pid, blocks: pid === opp ? [{ blocker: t, attacker: a }] : [] });
    }
    for (let i = 0; i < 12 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("declareBlockers");
    for (const x of botActions(s, opp)) s = act(s, x);
    s = passUntil(s, "endCombat", ap);
    expect(zone(s, t)).toBe("battlefield");
    expect(logged(s, /Troll regenerates/)).toBe(true);
  });

  it("doesn't save a creature with 0 toughness (not destruction), and shields end at cleanup", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, troll);
    s0.objects[id]!.regenShields = 1;
    s0.objects[id]!.counters["-1/-1"] = 2;
    const s = act(s0, { type: "passPriority", player: ap });
    expect(zone(s, id)).toBe("graveyard");
    const { s: s1, ap: ap1 } = setup([]);
    const id2 = putOnBattlefield(s1, ap1, troll);
    s1.objects[id2]!.regenShields = 1;
    const later = passUntil(s1, "upkeep");
    expect(later.objects[id2]!.regenShields).toBeUndefined();
  });
});
