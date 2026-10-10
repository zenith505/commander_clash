// Protection from qualities other than a color (CR 702.16a): artifacts, creatures, creature types,
// multicolored, everything, and a color chosen as it resolves or enters. Attack and block restrictions
// and requirements (CR 506.5, 508.1c, 509.1b-c), mentor (CR 702.134), "target player or planeswalker",
// and putting a permanent on top of its owner's library.

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, passAll, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import {
  attackProblem,
  blockProblem,
  blockRequirementProblem,
  botActions,
  characteristics,
  compileCard,
  isFullySupported,
  objHasKeyword,
  planCast,
  potentialAttackers,
  protectedFrom,
  waitingOn,
  type Action,
  type CardDef,
  type GameState,
  type PlayerId,
} from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const unsupported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(false));
const logged = (s: GameState, re: RegExp) => s.log.some((e) => re.test(e.text));
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return settle(plan!.reduce((x, a) => act(x, a), s));
};
const creature = (name: string, text: string, p = "2", t = "2", extra: Partial<CardDef> = {}) =>
  card(name, "Creature — Soldier", "{1}{W}", { power: p, toughness: t, oracleText: text, ...extra });

/** From main 1: declare attackers, then get to the defender's block declaration. */
function toBlocks(s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers" && s.step !== "endCombat"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
/** Every defender but `pid` declares no blocks. */
function othersPass(s: GameState, pid: PlayerId) {
  while (s.pending?.kind === "declareBlockers" && s.pending.player !== pid) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return s;
}

const artifactBlade = card("Blade Test", "Artifact Creature — Construct", "{2}", { power: "2", toughness: "2", oracleText: "{T}: This creature deals 1 damage to any target." });
const goblin = card("Goblin Test", "Creature — Goblin", "{R}", { power: "2", toughness: "2", colors: ["R"] });

describe("protection from qualities (CR 702.16a)", () => {
  it("reads artifacts, creatures, creature types, multicolored, everything and each color", () => {
    const kws = (text: string) => compileCard(creature("Keyword Test", text, "2", "2", { keywords: ["Protection"] })).textKeywords;
    expect(kws("Protection from artifacts")).toEqual(["Protection from artifacts"]);
    expect(kws("Flying, protection from Demons and from Dragons")).toEqual(["Protection from Demons", "Protection from Dragons"]);
    expect(kws("Protection from multicolored")).toEqual(["Protection from multicolored"]);
    expect(protectedFrom(["Protection from artifacts"], { colors: [], types: ["Artifact", "Creature"] })).toBe(true);
    expect(protectedFrom(["Protection from artifacts"], { colors: [], types: ["Creature"] })).toBe(false);
    expect(protectedFrom(["Protection from Goblins"], { colors: ["R"], types: ["Creature"], subtypes: ["Goblin"] })).toBe(true);
    expect(protectedFrom(["Protection from Elves"], { colors: ["G"], types: ["Creature"], subtypes: ["Elf"] })).toBe(true);
    expect(protectedFrom(["Protection from multicolored"], { colors: ["W", "U"] })).toBe(true);
    expect(protectedFrom(["Protection from multicolored"], { colors: ["W"] })).toBe(false);
    expect(protectedFrom(["Protection from each color"], { colors: ["G"] })).toBe(true);
    expect(protectedFrom(["Protection from each color"], { colors: [] })).toBe(false);
    expect(protectedFrom(["Protection from everything"], { colors: [] })).toBe(true);
  });

  it("protection from artifacts: can't be targeted by an artifact's ability, or damaged or blocked by artifacts", () => {
    const { s, ap, opp } = setup([]);
    const blade = putOnBattlefield(s, ap, artifactBlade);
    const savage = putOnBattlefield(s, opp, creature("Savage Test", "Protection from artifacts", "2", "1", { keywords: ["Protection"] }));
    expect(() => activate(s, ap, blade, 0, [target(savage)])).toThrow();
    const after = activate(s, ap, blade, 0, [{ kind: "player", id: opp }]);
    expect(after.players[opp]!.life).toBe(39);
    expect(blockProblem(s, s.objects[blade]!, { ...s.objects[savage]!, attacking: ap })).toMatch(/protection/);
  });

  it("protection from creatures: unblockable by creatures and creature damage is prevented", () => {
    const { s: s0, ap, opp } = setup([]);
    const chaplain = putOnBattlefield(s0, ap, creature("Chaplain Test", "Protection from creatures", "1", "1", { keywords: ["Protection"] }));
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[chaplain]!.attacking = opp;
    expect(blockProblem(s0, s0.objects[b]!, s0.objects[chaplain]!)).toMatch(/protection/);
    s0.objects[chaplain]!.attacking = undefined;
  });

  it("protection from Goblins: a Goblin can't block it, other red creatures can", () => {
    const { s, ap, opp } = setup([]);
    const guide = putOnBattlefield(s, ap, creature("Guide Test", "Protection from Goblins", "2", "1", { keywords: ["Protection"] }));
    const g = putOnBattlefield(s, opp, goblin);
    const red = putOnBattlefield(s, opp, bear({ name: "Red Bear", colors: ["R"] }));
    s.objects[guide]!.attacking = opp;
    expect(blockProblem(s, s.objects[g]!, s.objects[guide]!)).toMatch(/protection/);
    expect(blockProblem(s, s.objects[red]!, s.objects[guide]!)).toBeNull();
  });

  it('"gains protection from the color of your choice": chosen as it resolves', () => {
    const soul = card("Soul Test", "Instant", "{W}", { oracleText: "Target creature you control gains protection from the color of your choice until end of turn." });
    supported(soul);
    const { s: s0, ap, ids } = setup([soul]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(b)]));
    s = settle(passAll(s));
    expect(s.pending?.kind).toBe("chooseOption");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Red" }));
    expect(objHasKeyword(s, s.objects[b]!, "Protection from red")).toBe(true);
    s = passUntil(s, "upkeep");
    expect(objHasKeyword(s, s.objects[b]!, "Protection from red")).toBe(false);
  });

  it("a bot protects against the color of the spell coming at it", () => {
    const soul = card("Soul Test", "Instant", "{W}", { oracleText: "Target creature you control gains protection from the color of your choice until end of turn." });
    const shock = card("Shock Test", "Instant", "{R}", { oracleText: "Shock Test deals 2 damage to any target.", colors: ["R"] });
    const { s: s0, ap, ids, opp } = setup([shock]);
    const b = putOnBattlefield(s0, opp, bear());
    const soulId = putOnBattlefield(s0, opp, soul);
    s0.battlefield.splice(s0.battlefield.indexOf(soulId), 1);
    s0.objects[soulId]!.zone = "hand";
    s0.players[opp]!.hand.push(soulId);
    for (const l of [card("Plains", "Basic Land — Plains")]) putOnBattlefield(s0, opp, l);
    let s = planCast(s0, ap, ids[0]!, [target(b)])!.reduce((x, a) => act(x, a), s0);
    // The bot answers with the protection spell, then chooses red as it resolves.
    s = act(s, { type: "passPriority", player: ap });
    for (let i = 0; i < 30 && s.stack.length; i++) {
      const who = s.pending ? (s.pending as { player: PlayerId }).player : waitingOn(s)!;
      if (who === opp) s = botActions(s, opp).reduce((x, a) => act(x, a), s);
      else s = act(s, { type: "passPriority", player: who });
    }
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(objHasKeyword(s, s.objects[b]!, "Protection from red")).toBe(true);
  });

  it('"as ~ enters, choose a color. ~ has protection from the chosen color"', () => {
    const order = creature("Order Test", "As this creature enters, choose a color.\nThis creature has protection from the chosen color.", "1", "1");
    supported(order);
    const { s, ap } = setup([]);
    const o = putOnBattlefield(s, ap, order);
    s.objects[o]!.chosen = { color: "B" };
    expect(characteristics(s, s.objects[o]!).keywords).toContain("Protection from black");
  });

  it("an Aura that also says the protection doesn't remove it isn't read yet", () => {
    unsupported(card("Ward Test", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature has protection from black. This effect doesn't remove this Aura.", keywords: ["Enchant"] }));
  });
});

describe("attack restrictions (CR 508.1c)", () => {
  const serpent = creature("Serpent Test", "This creature can't attack unless defending player controls an Island.", "5", "5");
  const island = card("Island", "Basic Land — Island");

  it("can attack only a player who controls an Island", () => {
    supported(serpent);
    const { s: s0, ap, opp } = setup([]);
    const sp = putOnBattlefield(s0, ap, serpent);
    const others = [opp, s0.turnOrder.find((p) => p !== ap && p !== opp)!];
    expect(potentialAttackers(s0, ap).some((o) => o.id === sp)).toBe(false);
    putOnBattlefield(s0, others[1]!, island);
    expect(potentialAttackers(s0, ap).some((o) => o.id === sp)).toBe(true);
    expect(attackProblem(s0, s0.objects[sp]!, opp)).toMatch(/Island/);
    expect(attackProblem(s0, s0.objects[sp]!, others[1]!)).toBeNull();
    const s = passUntil(s0, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: sp, defender: opp }] })).toThrow(/Island/);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: sp, defender: others[1]! }] })).not.toThrow();
  });

  it("can't attack alone; can with another attacker (CR 506.5)", () => {
    const flunkies = creature("Flunkies Test", "This creature can't attack or block alone.", "3", "3");
    supported(flunkies);
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, flunkies);
    const b = putOnBattlefield(s0, ap, bear());
    const s = passUntil(s0, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: f, defender: opp }] })).toThrow(/alone/);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: f, defender: opp }, { attacker: b, defender: opp }] })).not.toThrow();
  });
});

describe("block restrictions and requirements (CR 509.1b-c)", () => {
  it("creatures with power less than its power can't block it", () => {
    const wurm = creature("Wurm Test", "Creatures with power less than this creature's power can't block it.", "6", "6");
    supported(wurm);
    const { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, wurm);
    const b = putOnBattlefield(s, opp, bear());
    const big = putOnBattlefield(s, opp, bear({ name: "Big", power: "6", toughness: "6" }));
    s.objects[w]!.attacking = opp;
    expect(blockProblem(s, s.objects[b]!, s.objects[w]!)).toMatch(/power less/);
    expect(blockProblem(s, s.objects[big]!, s.objects[w]!)).toBeNull();
  });

  it('"all creatures able to block it do so": each able creature has to block it', () => {
    const lure = creature("Lure Test", "All creatures able to block this creature do so.", "1", "1");
    supported(lure);
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, lure);
    const b1 = putOnBattlefield(s0, opp, bear());
    const b2 = putOnBattlefield(s0, opp, bear({ name: "Other Bear" }));
    let s = othersPass(toBlocks(s0, ap, [{ attacker: l, defender: opp }]), opp);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow(/must block/);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: l }] })).toThrow(/must block/);
    // The bot blocks with both.
    const bot = botActions(s, opp)[0] as Extract<Action, { type: "declareBlockers" }>;
    expect(bot.blocks.map((x) => x.blocker).sort()).toEqual([b1, b2].sort());
    s = act(s, bot);
    expect(s.objects[l]!.blockedBy).toHaveLength(2);
  });

  it('"must be blocked if able": one blocker is enough; with no able blocker, nothing is required', () => {
    const fiend = creature("Fiend Test", "Flying\nThis creature must be blocked if able.", "1", "1", { keywords: ["Flying"] });
    supported(fiend);
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, fiend);
    const ground = putOnBattlefield(s0, opp, bear());
    const s = othersPass(toBlocks(s0, ap, [{ attacker: f, defender: opp }]), opp);
    // Only a flyer could block it: the bear can't, so no block is fine.
    expect(blockRequirementProblem(s, opp, [])).toBeNull();
    const flyer = putOnBattlefield(s, opp, bear({ name: "Bird", keywords: ["Flying"], oracleText: "Flying" }));
    expect(blockRequirementProblem(s, opp, [])).toMatch(/must be blocked/);
    expect(blockRequirementProblem(s, opp, [{ blocker: flyer, attacker: f }])).toBeNull();
    expect(ground).toBeDefined();
  });

  it("can't block alone", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const hulk = putOnBattlefield(s0, opp, creature("Hulk Test", "This creature can't block alone.", "4", "4"));
    const other = putOnBattlefield(s0, opp, bear({ name: "Other" }));
    const s = othersPass(toBlocks(s0, ap, [{ attacker: b, defender: opp }]), opp);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: hulk, attacker: b }] })).toThrow(/alone/);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: hulk, attacker: b }, { blocker: other, attacker: b }] })).not.toThrow();
  });

  it('"target creature can\'t be blocked this turn"', () => {
    const dodge = card("Dodge Test", "Instant", "{U}", { oracleText: "Target creature can't be blocked this turn." });
    supported(dodge);
    const { s: s0, ap, ids, opp } = setup([dodge]);
    const b = putOnBattlefield(s0, ap, bear());
    const blocker = putOnBattlefield(s0, opp, bear({ name: "Wall" }));
    const s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!, [target(b)]))));
    s.objects[b]!.attacking = opp;
    expect(blockProblem(s, s.objects[blocker]!, s.objects[b]!)).toMatch(/can't be blocked/);
  });
});

describe("mentor (CR 702.134a)", () => {
  const mentor = creature("Mentor Test", "Mentor", "3", "3", { keywords: ["Mentor"] });

  it("puts a +1/+1 counter on an attacking creature with lesser power", () => {
    supported(mentor);
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, mentor);
    const small = putOnBattlefield(s0, ap, bear());
    const big = putOnBattlefield(s0, ap, bear({ name: "Big", power: "3", toughness: "3" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [m, small, big].map((attacker) => ({ attacker, defender: opp })) });
    for (let i = 0; i < 10 && s.pending?.kind !== "declareBlockers"; i++)
      s = s.pending?.kind === "chooseTargets" ? act(s, { type: "chooseTargets", player: ap, targets: [target(small)] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    // Equal power isn't lesser, so the 2/2 was the only choice.
    expect(pt(s, big)).toBe("3/3");
    expect(pt(s, small)).toBe("3/3");
  });
});

describe("other new templates", () => {
  it('"target player or planeswalker": players, not creatures', () => {
    const axe = card("Axe Test", "Sorcery", "{4}{R}", { oracleText: "Axe Test deals 5 damage to target player or planeswalker." });
    supported(axe);
    const { s, ap, ids, opp } = setup([axe]);
    const b = putOnBattlefield(s, opp, bear());
    expect(planCast(s, ap, ids[0]!, [target(b)])).toBeNull();
    const after = settle(passAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }]))));
    expect(after.players[opp]!.life).toBe(35);
  });

  it("put target creature on top of its owner's library; a commander goes to the command zone (CR 903.9b)", () => {
    const tuck = card("Tuck Test", "Sorcery", "{2}{U}", { oracleText: "Put target creature on top of its owner's library." });
    supported(tuck);
    const { s: s0, ap, ids, opp } = setup([tuck, tuck]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(b)]));
    expect(s.players[opp]!.library[0]).toBe(b);
    const cmd = putOnBattlefield(s, opp, bear({ name: "Cmdr" }), { commander: true });
    s = settle(passAll(run(s, planCast(s, ap, ids[1]!, [target(cmd)]))));
    expect(s.objects[cmd]!.zone).toBe("command");
    expect(logged(s, /command zone instead/)).toBe(true);
  });

  it("Condemn: its controller gains life equal to its last known toughness", () => {
    const condemn = card("Condemn Test", "Instant", "{W}", { oracleText: "Put target attacking creature on the bottom of its owner's library. Its controller gains life equal to its toughness." });
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, opp, bear({ name: "Big", power: "4", toughness: "5" }));
    const cid = putOnBattlefield(s0, ap, condemn);
    s0.battlefield.splice(s0.battlefield.indexOf(cid), 1);
    s0.objects[cid]!.zone = "hand";
    s0.players[ap]!.hand.push(cid);
    s0.objects[b]!.attacking = ap;
    const life = s0.players[opp]!.life;
    const s = settle(passAll(run(s0, planCast(s0, ap, cid, [target(b)]))));
    const lib = s.players[opp]!.library;
    expect(lib[lib.length - 1]).toBe(b);
    expect(s.players[opp]!.life).toBe(life + 5);
  });

  it('"attacking creatures get +1/+1 until end of turn" affects only attackers', () => {
    const morale = card("Morale Test", "Instant", "{1}{W}{W}", { oracleText: "Attacking creatures get +1/+1 until end of turn." });
    supported(morale);
    const { s: s0, ap, ids, opp } = setup([morale]);
    const a = putOnBattlefield(s0, ap, bear());
    const home = putOnBattlefield(s0, ap, bear({ name: "Home" }));
    s0.objects[a]!.attacking = opp;
    const s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    expect(pt(s, a)).toBe("3/3");
    expect(pt(s, home)).toBe("2/2");
  });
});
