// Round 128: round 127's gaps (bots hold Misleading Signpost for an attack, Windshaper Planetar, ...), then the most
// played cards.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, abilityProblem, botActions, characteristics, compileCard, isFullySupported, nextRandom, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";

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

const lathiel = card("Lathiel, the Bounteous Dawn", "Legendary Creature — Unicorn", "{2}{G}{W}", {
  power: "2",
  toughness: "2",
  keywords: ["Lifelink"],
  oracleText: "Lifelink\nAt the beginning of each end step, if you gained life this turn, distribute up to that many +1/+1 counters among any number of other target creatures.",
});

describe("Lathiel, the Bounteous Dawn: up to that many counters, at least one each (rulings)", () => {
  const heal = card("Test Heal", "Sorcery", "{W}", { oracleText: "You gain 3 life." });
  /** `ap` gained 3 life with Lathiel and two Bears out; at the end step, Lathiel's trigger asking for targets. */
  const endStep = () => {
    const { s: s0, ap, ids } = setup([heal]);
    const l = putOnBattlefield(s0, ap, lathiel);
    const bears = [putOnBattlefield(s0, ap, testBear()), putOnBattlefield(s0, ap, testBear())];
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 60 && !(s.pending?.kind === "chooseTargets"); i++) s = s.pending?.kind === "declareAttackers" ? act(s, { type: "declareAttackers", player: ap, attacks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, l, bears };
  };
  it("two counters among two Bears out of three: fine; Lathiel can't be one", () => {
    supported(lathiel);
    const { s: s0, ap, l, bears } = endStep();
    expect(s0.step).toBe("end");
    expect(s0.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s0, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: l, amount: 1 }] } as Action)).toThrow();
    expect(() => act(s0, { type: "chooseTargets", player: ap, targets: bears.map((id) => ({ kind: "object", id, amount: 2 })) } as Action)).toThrow();
    let s = act(s0, { type: "chooseTargets", player: ap, targets: bears.map((id) => ({ kind: "object", id, amount: 1 })) } as Action);
    for (let i = 0; i < 8 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(bears.map((id) => s.objects[id]!.counters["+1/+1"])).toEqual([1, 1]);
  });
  it("no life gained this turn: no trigger", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, lathiel);
    putOnBattlefield(s0, ap, testBear());
    const s = passUntil(s0, "cleanup", ap);
    expect(logText(s)).not.toMatch(/Lathiel, the Bounteous Dawn's ability triggers/);
  });
  it("a bot puts all three on its creatures", () => {
    const { s: s0, ap, bears } = endStep();
    const s = settleBots(botActions(s0, ap).reduce((x, a) => act(x, a), s0));
    expect(bears.reduce((n, id) => n + (s.objects[id]!.counters["+1/+1"] ?? 0), 0)).toBe(3);
  });
});

const pakpatiq = scry("transform", [
  { name: "Ojer Pakpatiq, Deepest Epoch", mana_cost: "{2}{U}{U}", type_line: "Legendary Creature — God", power: "4", toughness: "3", oracle_text: "Flying\nWhenever you cast an instant spell from your hand, it gains rebound. (Exile it as it resolves. At the beginning of your next upkeep, you may cast it from exile without paying its mana cost.)\nWhen Ojer Pakpatiq dies, return it to the battlefield tapped and transformed under its owner's control with three time counters on it." },
  { name: "Temple of Cyclical Time", type_line: "Land", oracle_text: "(Transforms from Ojer Pakpatiq, Deepest Epoch.)\n{T}: Add {U}. Remove a time counter from this land.\n{2}{U}, {T}: Transform this land. Activate only if it has no time counters on it and only as a sorcery." },
], { keywords: ["Transform", "Flying"] });

describe("Ojer Pakpatiq, Deepest Epoch // Temple of Cyclical Time: time counters gate the transform", () => {
  const murder = card("Test Murder", "Instant", "{1}{B}", { oracleText: "Destroy target creature." });
  it("dies, returns as the Temple with three time counters; tapping for {U} removes one; transforms only at none", () => {
    supported(pakpatiq);
    const { s: s0, ap, ids } = setup([murder]);
    const o = putOnBattlefield(s0, ap, pakpatiq);
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: o }])));
    const temple = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Temple of Cyclical Time")!;
    expect(temple).toBeDefined();
    expect(s.objects[temple]!.tapped).toBe(true);
    expect(s.objects[temple]!.counters.time).toBe(3);
    const transform = abilitiesOf(s, s.objects[temple]!).activated.findIndex((a) => /Transform/.test(a.text));
    s.objects[temple]!.tapped = false;
    expect(abilityProblem(s, ap, temple, transform)).toMatch(/can.t be activated/);
    expect(planActivate(s, ap, temple, transform)).toBeNull();
    // A mana ability with another effect (CR 605.1a): activated like any other ability, no stack.
    s = run(s, planActivate(s, ap, temple, 0));
    expect(s.players[ap]!.manaPool.U).toBe(1);
    expect(s.objects[temple]!.counters.time).toBe(2);
    s.objects[temple]!.tapped = false;
    s.objects[temple]!.counters.time = 0;
    s = run(s, planActivate(s, ap, temple, transform));
    s = settleBots(s);
    expect(characteristics(s, s.objects[temple]!).name).toBe("Ojer Pakpatiq, Deepest Epoch");
  });
});

const roxanne = card("Roxanne, Starfall Savant", "Legendary Creature — Cat Druid", "{3}{R}{G}", {
  power: "4",
  toughness: "3",
  oracleText: 'Whenever Roxanne enters or attacks, create a tapped colorless artifact token named Meteorite with "When this token enters, it deals 2 damage to any target" and "{T}: Add one mana of any color."\nWhenever you tap an artifact token for mana, add one mana of any type that artifact token produced.',
});

describe("Roxanne, Starfall Savant: a tapped Meteorite with two abilities", () => {
  it("enters: a tapped Meteorite token, whose own trigger deals 2 damage", () => {
    supported(roxanne);
    const { s: s0, ap, ids } = setup([roxanne]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const meteor = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Meteorite")!;
    expect(s.objects[meteor]!.tapped).toBe(true);
    expect(abilitiesOf(s, s.objects[meteor]!).mana).toHaveLength(1);
    const opp = s.turnOrder.find((p) => p !== ap)!;
    const life = s.players[opp]!.life;
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] } as Action);
    s = settleBots(s);
    expect(s.players[opp]!.life).toBe(life - 2);
  });
});

const hope = card("Hope of Ghirapur", "Legendary Artifact Creature — Thopter", "{1}", {
  power: "1",
  toughness: "1",
  keywords: ["Flying"],
  oracleText: "Flying\nSacrifice Hope of Ghirapur: Until your next turn, target player who was dealt combat damage by Hope of Ghirapur this turn can't cast noncreature spells.",
});

describe("Hope of Ghirapur: only a player it dealt combat damage this turn, until your next turn (rulings)", () => {
  it("hits Ana; Ana (not Ben) is the target; Ana can't cast noncreature spells until your next turn", () => {
    supported(hope);
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, hope);
    const [ana, ben] = [1, 2].map((n) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + n) % 4]!);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: h, defender: ana! }] });
    for (let i = 0; i < 60 && s.step !== "main2"; i++) {
      const pid = waitingOn(s)!;
      s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: pid, blocks: [] }) : act(s, { type: "passPriority", player: pid });
    }
    expect(planActivate(s, ap, h, 0, [{ kind: "player", id: ben! }])).toBeNull();
    s = settleBots(run(s, planActivate(s, ap, h, 0, [{ kind: "player", id: ana! }])));
    expect(s.objects[h]!.zone).toBe("graveyard");
    const sorcery = card("Test Sorcery", "Sorcery", "{G}", { oracleText: "Draw a card." });
    const spell = putOnBattlefield(s, ana!, sorcery);
    s.battlefield.splice(s.battlefield.indexOf(spell), 1);
    s.objects[spell]!.zone = "hand";
    s.players[ana!]!.hand.push(spell);
    putOnBattlefield(s, ana!, card("Forest", "Basic Land — Forest"));
    s = passUntil(s, "main1", ana);
    expect(planCast(s, ana!, spell)).toBeNull();
    s = passUntil(s, "upkeep", ap);
    expect(s.cantCastThisTurn ?? []).toHaveLength(0);
  });
});

const advokist = card("Orzhov Advokist", "Creature — Human Advisor", "{2}{W}", {
  power: "1",
  toughness: "4",
  oracleText: "At the beginning of your upkeep, each player may put two +1/+1 counters on a creature they control. If a player does, creatures that player controls can't attack you or planeswalkers you control until your next turn.",
});

describe("Orzhov Advokist: each player may take two counters; those who do can't attack you until your next turn (rulings)", () => {
  it("you, then each other player in turn order; Ana takes them and can't attack you, Ben declines", () => {
    supported(advokist);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, advokist);
    const mine = putOnBattlefield(s0, ap, testBear());
    const [ana, ben, cy] = [1, 2, 3].map((n) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + n) % 4]!);
    const [anaBear, benBear] = [putOnBattlefield(s0, ana!, testBear()), putOnBattlefield(s0, ben!, testBear())];
    let s = passUntil(s0, "upkeep", ana);
    for (let i = 0; i < 400 && !(s.activePlayer === ap && s.pending); i++) s = s.pending?.kind === "declareAttackers" ? act(s, { type: "declareAttackers", player: waitingOn(s)!, attacks: [] }) : s.pending?.kind === "discardToHandSize" ? act(s, { type: "discard", player: waitingOn(s)!, objectIds: s.players[waitingOn(s)!]!.hand.slice(0, s.pending.count) }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, min: 0, count: 1 });
    s = act(s, { type: "pickPermanents", player: ap, ids: [mine] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ana });
    s = act(s, { type: "pickPermanents", player: ana!, ids: [anaBear] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ben });
    expect(s.objects[anaBear]!.counters["+1/+1"]).toBeUndefined(); // all at once, after everyone chose
    s = act(s, { type: "pickPermanents", player: ben!, ids: [] });
    // Cy has no creature: not asked.
    expect(s.pending).toBeFalsy();
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[anaBear]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[benBear]!.counters["+1/+1"]).toBeUndefined();
    expect(s.players[ap]!.attackBansUntil).toEqual([ana]);
    // On Ana's turn: her Bears can attack Ben or Cy, not you.
    s = passUntil(s, "declareAttackers", ana);
    expect(() => act(s, { type: "declareAttackers", player: ana!, attacks: [{ attacker: anaBear, defender: ap }] })).toThrow();
    expect(() => act(s, { type: "declareAttackers", player: ana!, attacks: [{ attacker: anaBear, defender: cy! }] })).not.toThrow();
    // Your next turn: over.
    s = passUntil(s, "upkeep", ap);
    expect(s.players[ap]!.attackBansUntil).toBeUndefined();
  });
});

const pilgrim = card("Teferi, Temporal Pilgrim", "Legendary Planeswalker — Teferi", "{3}{U}{U}", {
  loyalty: "4",
  oracleText:
    'Whenever you draw a card, put a loyalty counter on Teferi.\n0: Draw a card.\n−2: Create a 2/2 blue Spirit creature token with vigilance and "Whenever you draw a card, put a +1/+1 counter on this token."\n−12: Target opponent chooses a permanent they control and returns it to its owner\'s hand. Then they shuffle each nonland permanent they control into its owner\'s library.',
});

describe("Teferi, Temporal Pilgrim", () => {
  it("0: draw a card, and the draw puts a loyalty counter on Teferi", () => {
    supported(pilgrim);
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, pilgrim);
    s0.objects[t]!.counters.loyalty = 4;
    const hand = s0.players[ap]!.hand.length;
    const s = settleBots(run(s0, planActivate(s0, ap, t, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[t]!.counters.loyalty).toBe(5);
  });
  it("−12: the opponent returns the land they choose, then shuffles each nonland permanent they control into its owner's library", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, pilgrim);
    s0.objects[t]!.counters.loyalty = 12;
    const opp = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    const [bear1, bear2] = [putOnBattlefield(s0, opp, testBear()), putOnBattlefield(s0, opp, testBear())];
    const land = putOnBattlefield(s0, opp, card("Forest", "Basic Land — Forest", "", { oracleText: "({T}: Add {G}.)" }));
    const lib = s0.players[opp]!.library.length;
    let s = run(s0, planActivate(s0, ap, t, 2, [{ kind: "player", id: opp }]));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, count: 1 });
    s = act(s, { type: "pickPermanents", player: opp, ids: [land] });
    expect(s.objects[land]!.zone).toBe("hand");
    expect([s.objects[bear1]!.zone, s.objects[bear2]!.zone]).toEqual(["library", "library"]);
    expect(s.players[opp]!.library.length).toBe(lib + 2);
    expect(s.objects[t]!.zone).toBe("graveyard"); // no loyalty left
  });
});

const whitePlume = card("White Plume Adventurer", "Creature — Orc Cleric", "{2}{W}", {
  power: "3",
  toughness: "3",
  oracleText: "When this creature enters, you take the initiative.\nAt the beginning of each opponent's upkeep, untap a creature you control. If you've completed a dungeon, untap all creatures you control instead.",
});

describe("White Plume Adventurer: at each opponent's upkeep, untap a creature you control (all of them after a dungeon)", () => {
  const atOppUpkeep = (completed: boolean) => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, whitePlume);
    const bears = [putOnBattlefield(s0, ap, testBear()), putOnBattlefield(s0, ap, testBear())];
    if (completed) s0.players[ap]!.completedDungeons = ["Lost Mine of Phandelver"];
    const opp = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    let s = passUntil(s0, "upkeep", opp);
    for (const b of bears) s.objects[b]!.tapped = true;
    for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length || i === 0); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, bears };
  };
  it("you choose one of your tapped creatures", () => {
    supported(whitePlume);
    let { s, ap, bears } = atOppUpkeep(false);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "untap", count: 1 });
    s = act(s, { type: "pickPermanents", player: ap, ids: [bears[1]!] });
    expect(bears.map((b) => s.objects[b]!.tapped)).toEqual([true, false]);
  });
  it("after a dungeon, all of them, with no choice", () => {
    const { s, bears } = atOppUpkeep(true);
    expect(s.pending).toBeFalsy();
    expect(bears.map((b) => s.objects[b]!.tapped)).toEqual([false, false]);
  });
});

const daredevil = card("Dire Fleet Daredevil", "Creature — Human Pirate", "{1}{R}", {
  power: "2",
  toughness: "1",
  keywords: ["First strike"],
  oracleText:
    "First strike\nWhen this creature enters, exile target instant or sorcery card from an opponent's graveyard. You may cast it this turn, and mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it instead.",
});

describe("Dire Fleet Daredevil: an opponent's instant or sorcery card, cast this turn with any type of mana, then exiled (rulings)", () => {
  it("casts the exiled sorcery with mana of any type; it's exiled after it resolves", () => {
    supported(daredevil);
    const { s: s0, ap, ids, opp } = setup([daredevil]);
    const sorcery = putOnBattlefield(s0, opp, card("Deep Study", "Sorcery", "{U}{U}{U}{U}", { oracleText: "Draw two cards." }));
    s0.battlefield.splice(s0.battlefield.indexOf(sorcery), 1);
    s0.objects[sorcery]!.zone = "graveyard";
    s0.players[opp]!.graveyard.push(sorcery);
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: sorcery }])));
    expect(s.objects[sorcery]!.zone).toBe("exile");
    // Four blue mana from three Islands and anything else.
    const hand = s.players[ap]!.hand.length;
    s = settleBots(run(s, planCast(s, ap, sorcery)));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.objects[sorcery]!.zone).toBe("exile");
    expect(s.players[opp]!.graveyard).not.toContain(sorcery);
  });
  it("not cast this turn: the permission ends", () => {
    const { s: s0, ap, ids, opp } = setup([daredevil]);
    const instant = putOnBattlefield(s0, opp, card("Quick Study", "Instant", "{U}", { oracleText: "Draw a card." }));
    s0.battlefield.splice(s0.battlefield.indexOf(instant), 1);
    s0.objects[instant]!.zone = "graveyard";
    s0.players[opp]!.graveyard.push(instant);
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: instant }])));
    expect(planCast(s, ap, instant)).not.toBeNull();
    s = passUntil(s, "upkeep", opp);
    expect(planCast(s, ap, instant)).toBeNull();
  });
});

const recruiter = card("Goblin Recruiter", "Creature — Goblin", "{1}{R}", {
  power: "1",
  toughness: "1",
  oracleText: "When this creature enters, search your library for any number of Goblin cards, reveal them, then shuffle and put those cards on top in any order.",
});

describe("Goblin Recruiter: any number of Goblin cards, shuffled, then on top in the order you choose", () => {
  it("finds two Goblins and puts them on top, in your order", () => {
    supported(recruiter);
    const { s: s0, ap, ids } = setup([recruiter]);
    const gob = (name: string) => {
      const id = putOnBattlefield(s0, ap, card(name, "Creature — Goblin", "{R}", { power: "1", toughness: "1" }));
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      s0.players[ap]!.library.push(id);
      return id;
    };
    const [a, b] = [gob("Goblin A"), gob("Goblin B")];
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0 });
    s = act(s, { type: "searchLibrary", player: ap, found: [a, b] });
    expect(s.pending).toMatchObject({ kind: "orderLibrary", player: ap });
    expect(s.pending?.kind === "orderLibrary" && [...s.pending.cards].sort()).toEqual([a, b].sort());
    s = act(s, { type: "orderLibrary", player: ap, order: [b, a] });
    expect(s.players[ap]!.library.slice(0, 2)).toEqual([b, a]);
    expect(logText(s)).toMatch(/Goblin A/);
  });
});
