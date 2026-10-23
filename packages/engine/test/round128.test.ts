// Round 128: round 127's gaps (bots hold Misleading Signpost for an attack, Windshaper Planetar, ...), then the most
// played cards.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, compileCard, isFullySupported, nextRandom, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Bots answer every choice and everyone passes until the stack and trigger queue are empty. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const who = s.pending ? s.pending.player : waitingOn(s)!;
    const acts = s.pending ? botActions(s, who) : [];
    s = acts.length ? acts.reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: who });
  }
  return s;
};
const logText = (s: GameState) => s.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n");

const signpost = card("Misleading Signpost", "Artifact", "{2}{U}", {
  keywords: ["Flash"],
  oracleText: "Flash\nWhen this artifact enters during the declare attackers step, you may reselect which player or permanent target attacking creature is attacking. (It can't attack its controller or their permanents.)\n{T}: Add {U}.",
});
const planetar = card("Windshaper Planetar", "Creature — Angel", "{4}{W}", {
  power: "4",
  toughness: "4",
  keywords: ["Flash", "Flying"],
  oracleText: "Flash\nFlying\nWhen this creature enters during the declare attackers step, for each attacking creature, you may reselect which player or permanent that creature is attacking. (It can't attack its controller or their permanents.)",
});
const testBear = () => card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

/** `opp` attacks `ap` with two Bears; `ap` holds `hand`, with priority in the declare attackers step. */
const attacked = (hand: CardDef[]) => {
  const { s: s0, ap, ids, opp } = setup(hand);
  const bears = [putOnBattlefield(s0, opp, testBear()), putOnBattlefield(s0, opp, testBear())];
  let s = passUntil(s0, "declareAttackers", opp);
  s = act(s, { type: "declareAttackers", player: opp, attacks: bears.map((b) => ({ attacker: b, defender: ap })) });
  for (let i = 0; i < 8 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return { s, ap, opp, bears, ids };
};

describe("Misleading Signpost: bots hold it for an attack", () => {
  it("not cast in the bot's own main phase", () => {
    const { s, ap } = setup([signpost]);
    expect(botActions(s, ap).some((a) => a.type === "castSpell")).toBe(false);
  });
  it("flashed in when attacked, turning an attacker away", () => {
    const { s: s0, ap, bears } = attacked([signpost]);
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "castSpell")).toBe(true);
    const s = settleBots(acts.reduce((x, a) => act(x, a), s0));
    expect(bears.filter((b) => s.objects[b]!.attacking !== ap)).toHaveLength(1);
  });
});

describe("Windshaper Planetar: reselect each attacking creature's attack (rulings)", () => {
  it("each attacker in turn, each one may be kept", () => {
    supported(planetar);
    expect(compileCard(planetar).triggers[0]!.body.effects).toEqual([{ type: "reselectAttack", what: { ref: "allCreatures", attacking: true }, each: true }]);
    const { s: s0, ap, opp, bears, ids } = attacked([planetar]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "reselectAttack", player: ap });
    const first = s.pending?.kind === "chooseOption" ? s.pending.about! : "";
    const second = bears.find((b) => b !== first)!;
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(options[0]).toBe("keep");
    expect(options).not.toContain(String(opp));
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    s = act(s, { type: "chooseOption", player: ap, choice: String(other) });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "reselectAttack", about: second });
    s = act(s, { type: "chooseOption", player: ap, choice: "keep" });
    expect(s.pending).toBeFalsy();
    expect(s.objects[first]!.attacking).toBe(other);
    expect(s.objects[second]!.attacking).toBe(ap);
    expect(s.objects[first]!.attacked?.players).toEqual([ap]);
  });
  it("cast in a main phase it doesn't trigger", () => {
    const { s: s0, ap, ids } = setup([planetar]);
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(logText(s)).not.toMatch(/Windshaper Planetar's ability triggers/);
  });
  it("a bot turns both attacks away from itself", () => {
    const { s: s0, ap, bears, ids } = attacked([planetar]);
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(bears.every((b) => s.objects[b]!.attacking !== ap)).toBe(true);
  });
});

const study = card("Stinging Study", "Instant", "{4}{B}", {
  oracleText: "You draw X cards and you lose X life, where X is the mana value of a commander you own on the battlefield or in the command zone.",
});

describe("Stinging Study: X is a commander's mana value (rulings)", () => {
  it("one commander in the command zone: its mana value", () => {
    supported(study);
    const { s: s0, ap, ids } = setup([study]);
    const cmd = s0.players[ap]!.command[0]!;
    s0.objects[cmd]!.cardId = s0.objects[putOnBattlefield(s0, ap, card("Big Commander", "Legendary Creature — Giant", "{3}{B}{B}", { power: "5", toughness: "5" }))]!.cardId;
    s0.battlefield.pop();
    const hand = s0.players[ap]!.hand.length;
    const life = s0.players[ap]!.life;
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 5);
    expect(s.players[ap]!.life).toBe(life - 5);
  });
  it("two commanders: its controller chooses one as it resolves", () => {
    const { s: s0, ap, ids } = setup([study]);
    const second = putOnBattlefield(s0, ap, card("Small Commander", "Legendary Creature — Elf", "{1}{G}", { power: "1", toughness: "1" }), { commander: true });
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "commander", player: ap });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toContain(second);
    s = act(s, { type: "chooseOption", player: ap, choice: second });
    expect(s.players[ap]!.life).toBe(life - 2);
  });
  it("a bot at 6 life doesn't cast it for its 5-mana-value commander", () => {
    const { s, ap } = setup([study]);
    const cmd = s.players[ap]!.command[0]!;
    s.objects[cmd]!.cardId = s.objects[putOnBattlefield(s, ap, card("Big Commander", "Legendary Creature — Giant", "{3}{B}{B}", { power: "5", toughness: "5" }))]!.cardId;
    s.battlefield.pop();
    s.players[ap]!.life = 6;
    expect(botActions(s, ap).some((a) => a.type === "castSpell" && s.objects[a.objectId]?.zone === "hand")).toBe(false);
  });
});

const skaab = card("Hordewing Skaab", "Creature — Zombie Horror", "{4}{U}", {
  power: "3",
  toughness: "3",
  keywords: ["Flying"],
  oracleText: "Flying\nOther Zombies you control have flying.\nWhenever one or more Zombies you control deal combat damage to one or more of your opponents, you may draw cards equal to the number of opponents dealt damage this way. If you do, discard that many cards.",
});

describe("Hordewing Skaab: once for the combat damage, that many opponents (rulings)", () => {
  /** `ap` attacks the next three players with two Zombies and a Bear; nobody blocks; until the end step. */
  const combat = (zombiePinger = false) => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, skaab);
    const zombie = (n: string) => putOnBattlefield(s0, ap, card(n, "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2", ...(zombiePinger ? { oracleText: "{T}: This creature deals 1 damage to each opponent." } : {}) }));
    const [a, b, c] = [zombie("Zombie A"), zombie("Zombie B"), putOnBattlefield(s0, ap, testBear())];
    const [o1, o2, o3] = [1, 2, 3].map((n) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + n) % 4]!);
    return { s0, ap, a, b, c, o1: o1!, o2: o2!, o3: o3! };
  };
  it("two Zombies hit two opponents, a Bear a third: one trigger, draw two and discard two", () => {
    supported(skaab);
    const { s0, ap, a, b, c, o1, o2, o3 } = combat();
    let s = passUntil(s0, "declareAttackers", ap);
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: o1 }, { attacker: b, defender: o2 }, { attacker: c, defender: o3 }] });
    for (let i = 0; i < 80 && s.step !== "end"; i++) {
      const pid = waitingOn(s)!;
      s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: pid, blocks: [] }) : s.pending ? botActions(s, pid).reduce((x, y) => act(x, y), s) : act(s, { type: "passPriority", player: pid });
    }
    expect(logText(s).match(/Hordewing Skaab's ability triggers/g)).toHaveLength(1);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.graveyard.length).toBe(2);
  });
  it("not for noncombat damage", () => {
    const { s0, ap, a } = combat(true);
    const s = settleBots(run(s0, planActivate(s0, ap, a, 0)));
    expect(logText(s)).not.toMatch(/Hordewing Skaab's ability triggers/);
  });
});

const breeches = card("Breeches, the Blastmaker", "Legendary Creature — Goblin Pirate", "{1}{U}{R}", {
  power: "3",
  toughness: "3",
  keywords: ["Menace"],
  oracleText: "Menace\nWhenever you cast your second spell each turn, you may sacrifice an artifact. If you do, flip a coin. When you win the flip, copy that spell. You may choose new targets for the copy. When you lose the flip, Breeches deals damage equal to that spell's mana value to any target.",
});

describe("Breeches, the Blastmaker: sacrifice, flip, then one of two reflexive triggers (rulings)", () => {
  const study2 = card("Test Study", "Sorcery", "{1}{U}", { oracleText: "Draw a card." });
  /** Two spells cast; Breeches' trigger resolving, an artifact sacrificed, the coin set to come up `win`. */
  const flip = (win: boolean) => {
    const { s: s0, ap, ids } = setup([study2, study2]);
    putOnBattlefield(s0, ap, breeches);
    const rock = putOnBattlefield(s0, ap, card("Test Rock", "Artifact", "{1}", { oracleText: "{T}: Add {C}." }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 8 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, ap, ids[1]!));
    expect(s.stack).toHaveLength(2);
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    for (let st = 1; ; st++) {
      if (nextRandom({ rngState: st }) < 0.5 === win) {
        s.rngState = st;
        break;
      }
    }
    // The only artifact: sacrificed without a pick.
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.objects[rock]!.zone).toBe("graveyard");
    return { s, ap, spell: ids[1]! };
  };
  it("won: a copy of the second spell (not cast)", () => {
    supported(breeches);
    const { s: s0, ap } = flip(true);
    const hand = s0.players[ap]!.hand.length;
    let s = s0;
    for (let i = 0; i < 12 && (s.stack.length || s.triggerQueue.length); i++) s = s.pending ? s : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(logText(s)).toMatch(/wins the flip/);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect((s.castThisTurn ?? []).filter((c) => c.player === ap)).toHaveLength(2);
  });
  it("lost: 2 damage, its target chosen as the reflexive trigger goes on the stack", () => {
    const { s: s0, ap } = flip(false);
    let s = s0;
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(logText(s)).toMatch(/loses the flip/);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const opp = s.turnOrder.find((p) => p !== ap)!;
    const life = s.players[opp]!.life;
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] } as Action);
    for (let i = 0; i < 8 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[opp]!.life).toBe(life - 2);
  });
});

const vantress = card("Court of Vantress", "Enchantment", "{2}{U}{U}", {
  oracleText: "When this enchantment enters, you become the monarch.\nAt the beginning of your upkeep, choose up to one other target enchantment or artifact. If you're the monarch, you may create a token that's a copy of it. If you're not the monarch, you may have this enchantment become a copy of it, except it has this ability.",
});

describe("Court of Vantress: a token copy as the monarch, else it becomes a copy with this ability (rulings)", () => {
  const rock = card("Test Rock", "Artifact", "{1}", { oracleText: "{T}: Add {C}." });
  /** Court and a Test Rock on `ap`'s battlefield, `monarch` the monarch; on to `ap`'s next upkeep, the trigger's target asked. */
  const upkeep = (monarch: "ap" | "opp") => {
    const { s: s0, ap, opp } = setup([]);
    const court = putOnBattlefield(s0, ap, vantress);
    const r = putOnBattlefield(s0, ap, rock);
    s0.monarch = monarch === "ap" ? ap : opp;
    let s = passUntil(s0, "upkeep", opp);
    s.monarch = monarch === "ap" ? ap : opp;
    for (let i = 0; i < 400 && !(s.activePlayer === ap && s.pending?.kind === "chooseTargets"); i++) s = s.pending?.kind === "discardToHandSize" ? act(s, { type: "discard", player: waitingOn(s)!, objectIds: s.players[waitingOn(s)!]!.hand.slice(0, s.pending.count) }) : s.pending?.kind === "declareAttackers" ? act(s, { type: "declareAttackers", player: waitingOn(s)!, attacks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    s.monarch = monarch === "ap" ? ap : opp;
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: r }] } as Action);
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    return { s: act(s, { type: "chooseMay", player: ap, yes: true }), ap, court, r };
  };
  it("the monarch: a token copy of the artifact", () => {
    supported(vantress);
    const { s, ap } = upkeep("ap");
    const rocks = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Test Rock" && s.objects[id]!.controller === ap);
    expect(rocks).toHaveLength(2);
  });
  it("not the monarch: Court becomes a Test Rock that still has the upkeep ability", () => {
    const { s, court } = upkeep("opp");
    const c = characteristics(s, s.objects[court]!);
    expect(c.name).toBe("Test Rock");
    expect(c.types).toEqual(["Artifact"]);
    expect(abilitiesOf(s, s.objects[court]!).triggers.some((t) => t.event === "yourUpkeep")).toBe(true);
    expect(abilitiesOf(s, s.objects[court]!).mana.length).toBe(1);
  });
});
