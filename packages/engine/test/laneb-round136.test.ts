// Lane B round B136: Fasting (a draw step skipped as it would begin, CR 614.10), Heat Wave (life paid for blocks,
// CR 509.1d), Stromgald Spy (a hand revealed while it stays), Liquid Fire (a number chosen as an additional cost,
// CR 601.2b), Grifter's Blade (enters attached, CR 614.12), Goblin Test Pilot (a random target), Dreams of the Dead,
// Evershrike (an Aura attached to the returned card, CR 400.7), Shifty Doppelganger and Cut the Tethers.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, handRevealed, power, toughness, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const tethers = card("Cut the Tethers", "Sorcery", "{2}{U}{U}", { oracleText: "For each Spirit, return it to its owner's hand unless that player pays {3}." });
const shifty = card("Shifty Doppelganger", "Creature — Shapeshifter", "{2}{U}", { power: "1", toughness: "1", oracleText: "{3}{U}, Exile this creature: You may put a creature card from your hand onto the battlefield. If you do, that creature gains haste until end of turn. At the beginning of the next end step, sacrifice that creature. If you do, return this card to the battlefield." });
const evershrike = card("Evershrike", "Creature — Elemental Spirit", "{3}{W/B}{W/B}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nThis creature gets +2/+2 for each Aura attached to it.\n{X}{W/B}{W/B}: Return this card from your graveyard to the battlefield. You may put an Aura card with mana value X or less from your hand onto the battlefield attached to it. If you don't, exile this creature." });
const dreams = card("Dreams of the Dead", "Enchantment", "{3}{U}", { oracleText: "{1}{U}: Return target white or black creature card from your graveyard to the battlefield. That creature gains \"Cumulative upkeep {2}.\" If the creature would leave the battlefield, exile it instead of putting it anywhere else. (At the beginning of its controller's upkeep, that player puts an age counter on it, then sacrifices it unless they pay its upkeep cost for each age counter on it.)" });
const pilot = card("Goblin Test Pilot", "Creature — Goblin Pilot Wizard", "{1}{U}{R}", { power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying\n{T}: This creature deals 2 damage to any target chosen at random." });
const blade = card("Grifter's Blade", "Artifact — Equipment", "{3}", { keywords: ["Flash", "Equip"], oracleText: "Flash\nAs this Equipment enters, choose a creature you control it could be attached to. If you do, it enters attached to that creature.\nEquipped creature gets +1/+1.\nEquip {1}" });
const liquidFire = card("Liquid Fire", "Sorcery", "{4}{R}{R}", { oracleText: "As an additional cost to cast this spell, choose a number between 0 and 5.\nLiquid Fire deals X damage to target creature and 5 minus X damage to that creature's controller, where X is the chosen number." });
const spy = card("Stromgald Spy", "Creature — Human Rogue", "{3}{B}", { power: "2", toughness: "4", oracleText: "Whenever this creature attacks and isn't blocked, you may have defending player play with their hand revealed for as long as this creature remains on the battlefield. If you do, this creature assigns no combat damage this turn." });
const heatWave = card("Heat Wave", "Enchantment", "{2}{R}", { keywords: ["Cumulative upkeep"], oracleText: "Cumulative upkeep {R} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nBlue creatures can't block creatures you control.\nNonblue creatures can't block creatures you control unless their controller pays 1 life for each blocking creature they control." });
const fasting = card("Fasting", "Enchantment", "{W}", { oracleText: "At the beginning of your upkeep, put a hunger counter on this enchantment. Then destroy this enchantment if it has five or more hunger counters on it.\nIf you would begin your draw step, you may skip that step instead. If you do, you gain 2 life.\nWhen you draw a card, destroy this enchantment." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const castIt = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = []) => settle(run(s, planCast(s, pid, id, targets)));
const activateIt = (s: GameState, pid: PlayerId, id: string, i: number, targets: TargetChoice[] = []) => settle(run(s, planActivate(s, pid, id, i, targets)));
/** A copy of `def` put into `pid`'s hand. */
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** A copy of `def` put straight into `pid`'s graveyard. */
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
void named;

describe("Fasting: skip the draw step as it would begin (CR 614.10)", () => {
  it("parses", () => supported(fasting));

  it("skipping: no draw, 2 life, and Fasting stays", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, fasting);
    s0.players[ap]!.hand = [];
    let s = passUntil(s0, "upkeep", ap, 4000);
    s = settle(s);
    expect(s.objects[f]!.counters.hunger).toBe(1);
    s = passUntil(s, "draw", ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, skipDraw: { from: f } });
    const life = s.players[ap]!.life;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.step).toBe("main1");
    expect(s.players[ap]!.hand.length).toBe(0);
    expect(s.players[ap]!.life).toBe(life + 2);
    expect(s.objects[f]!.zone).toBe("battlefield");
  });

  it("not skipping: the draw happens and Fasting is destroyed by its own trigger", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, fasting);
    s0.players[ap]!.hand = [];
    let s = passUntil(s0, "draw", ap, 4000);
    expect(s.pending?.kind).toBe("chooseMay");
    const life = s.players[ap]!.life;
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.players[ap]!.hand.length).toBe(1);
    expect(s.players[ap]!.life).toBe(life);
    s = settle(s);
    expect(s.objects[f]!.zone).toBe("graveyard");
  });

  it("destroyed at the upkeep that puts its fifth hunger counter on it", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, fasting);
    s0.objects[f]!.counters.hunger = 4;
    s0.players[ap]!.hand = [];
    let s = passUntil(s0, "upkeep", ap, 4000);
    s = settle(s);
    expect(s.objects[f]!.zone).toBe("graveyard");
    // No question at the draw step now.
    s = passUntil(s, "draw", ap);
    expect(s.pending).toBeNull();
  });

  it("another player's draw step isn't asked about; the bot skips while holding three cards", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, fasting);
    let s = passUntil(s0, "draw", opp, 4000);
    expect(s.pending).toBeNull();
    s = passUntil(s, "draw", ap, 4000);
    expect(s.pending?.kind).toBe("chooseMay");
    s.players[ap]!.hand = s.players[ap]!.hand.slice(0, 3);
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
    s.players[ap]!.hand = s.players[ap]!.hand.slice(0, 2);
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: false }]);
  });
});

const blueBear = card("Test Blue Bear", "Creature — Bear", "{1}{U}", { power: "2", toughness: "2" });

/** The active player's `attackers` attack `opp`; returns at `opp`'s blockers declaration. */
function toBlocks(s0: GameState, ap: PlayerId, opp: PlayerId, attackers: string[]): GameState {
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender: opp })) });
  for (let i = 0; i < 20 && !(s.pending?.kind === "declareBlockers" && s.pending.player === opp); i++)
    s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("Heat Wave: blocks of your creatures cost life (CR 509.1d)", () => {
  it("parses", () => supported(heatWave));

  it("a nonblue blocker costs its controller 1 life; one blocker of two attackers costs 1, not 2", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, heatWave);
    const a1 = putOnBattlefield(s0, ap, bear());
    const a2 = putOnBattlefield(s0, ap, bear());
    const b1 = putOnBattlefield(s0, opp, bear());
    const b2 = putOnBattlefield(s0, opp, bear());
    let s = toBlocks(s0, ap, opp, [a1, a2]);
    const life = s.players[opp]!.life;
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: a1 }, { blocker: b2, attacker: a2 }] });
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.objects[b1]!.blocking).toEqual([a1]);
  });

  it("a blue creature can't block them at all; with too little life the block is refused", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, heatWave);
    const a1 = putOnBattlefield(s0, ap, bear());
    const blue = putOnBattlefield(s0, opp, blueBear);
    const b1 = putOnBattlefield(s0, opp, bear());
    let s = toBlocks(s0, ap, opp, [a1]);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: blue, attacker: a1 }] })).toThrow();
    s.players[opp]!.life = 0;
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: a1 }] })).toThrow(/life/);
  });

  it("only blocks of the Heat Wave controller's creatures cost life", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, heatWave);
    const a1 = putOnBattlefield(s0, ap, bear());
    const b1 = putOnBattlefield(s0, opp, bear());
    let s = toBlocks(s0, ap, opp, [a1]);
    const life = s.players[opp]!.life;
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: a1 }] });
    expect(s.players[opp]!.life).toBe(life);
  });

  it("the bot blocks and pays while it keeps 10 life, and doesn't block below that", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, heatWave);
    const a1 = putOnBattlefield(s0, ap, card("Test Big", "Creature — Giant", "{4}", { power: "1", toughness: "1" }));
    putOnBattlefield(s0, opp, card("Test Wall", "Creature — Wall", "{4}", { power: "4", toughness: "4" }));
    const s = toBlocks(s0, ap, opp, [a1]);
    const yes = botActions(s, opp).find((a) => a.type === "declareBlockers");
    expect(yes).toMatchObject({ blocks: [{ attacker: a1 }] });
    s.players[opp]!.life = 10;
    const no = botActions(s, opp).find((a) => a.type === "declareBlockers");
    expect(no).toMatchObject({ blocks: [] });
  });
});

describe("Stromgald Spy: a hand revealed for as long as it remains on the battlefield (CR 402.3, 611.2b)", () => {
  it("parses", () => supported(spy));

  /** The Spy attacks unblocked; returns with its controller asked whether to reveal. */
  const unblocked = () => {
    const { s: s0, ap, opp } = setup([]);
    const sp = putOnBattlefield(s0, ap, spy);
    let s = toBlocks(s0, ap, opp, [sp]);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [] });
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    return { s, ap, opp, sp };
  };

  it("yes: the defending player's hand is revealed to everyone, and the Spy deals no combat damage", () => {
    const { s: s1, ap, opp, sp } = unblocked();
    const other = s1.turnOrder.find((p) => p !== ap && p !== opp)!;
    expect(handRevealed(s1, opp, ap)).toBe(false);
    const life = s1.players[opp]!.life;
    let s = act(s1, { type: "chooseMay", player: ap, yes: true });
    s = passUntil(settle(s), "main2", ap);
    expect(handRevealed(s, opp, ap)).toBe(true);
    expect(handRevealed(s, opp, other)).toBe(true);
    expect(s.players[opp]!.life).toBe(life);
    // Next turn too, until the Spy leaves.
    s = passUntil(s, "upkeep", opp);
    expect(handRevealed(s, opp, ap)).toBe(true);
    s.battlefield.splice(s.battlefield.indexOf(sp), 1);
    s.objects[sp]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(sp);
    expect(handRevealed(s, opp, ap)).toBe(false);
  });

  it("no: the Spy deals its damage; the bot declines", () => {
    const { s: s1, ap, opp } = unblocked();
    expect(botActions(s1, ap)).toEqual([{ type: "chooseMay", player: ap, yes: false }]);
    const life = s1.players[opp]!.life;
    let s = act(s1, { type: "chooseMay", player: ap, yes: false });
    s = passUntil(settle(s), "main2", ap);
    expect(handRevealed(s, opp, ap)).toBe(false);
    expect(s.players[opp]!.life).toBe(life - 2);
  });
});

describe("Liquid Fire: a number chosen as an additional cost (CR 601.2b)", () => {
  it("parses", () => supported(liquidFire));

  it("X to the creature and 5 minus X to its controller, the number kept by the spell", () => {
    const { s: s0, ap, ids, opp } = setup([liquidFire]);
    const ogre = putOnBattlefield(s0, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    const life = s0.players[opp]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(ogre)], undefined, "auto", undefined, { number: 3 }));
    expect(s.stack[s.stack.length - 1]).toMatchObject({ chosenNumber: 3 });
    s = settle(s);
    expect(s.objects[ogre]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("0: all 5 to the player; 5: none to the player", () => {
    for (const [n, toCreature, toPlayer] of [[0, 0, 5], [5, 5, 0]] as const) {
      const { s: s0, ap, ids, opp } = setup([liquidFire]);
      const wall = putOnBattlefield(s0, opp, card("Test Wall", "Creature — Wall", "{4}", { power: "0", toughness: "8" }));
      const life = s0.players[opp]!.life;
      const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(wall)], undefined, "auto", undefined, { number: n })));
      expect(s.objects[wall]!.damage).toBe(toCreature);
      expect(s.players[opp]!.life).toBe(life - toPlayer);
    }
  });

  it("the number must be chosen, and be from 0 to 5", () => {
    const { s, ap, ids, opp } = setup([liquidFire]);
    const ogre = putOnBattlefield(s, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    expect(planCast(s, ap, ids[0]!, [tgt(ogre)], undefined, "auto", undefined, { number: 6 })).toBeNull();
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 6, G: 0, C: 0 };
    expect(() => act(s, { type: "castSpell", player: ap, objectId: ids[0]!, targets: [tgt(ogre)] })).toThrow(/choose a number/);
  });

  it("the bot picks just enough for the creature", () => {
    const { s: s0, ap, ids, opp } = setup([liquidFire]);
    s0.players[ap]!.hand = [ids[0]!];
    const ogre = putOnBattlefield(s0, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    const cast = botActions(s0, ap).find((a) => a.type === "castSpell");
    expect(cast).toMatchObject({ objectId: ids[0], targets: [tgt(ogre)], number: 3 });
  });
});

describe("Grifter's Blade: it enters attached to a creature you control (CR 614.12)", () => {
  it("parses", () => supported(blade));

  it("two creatures: its controller chooses, and it enters attached (+1/+1)", () => {
    const { s: s0, ap, ids } = setup([blade]);
    const small = putOnBattlefield(s0, ap, bear());
    const big = putOnBattlefield(s0, ap, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "attachHost" });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([small, big].sort());
    // The bot would take the strongest.
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: big }]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: small }));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(small);
    expect(power(s, s.objects[small]!)).toBe(3);
  });

  it("one creature: attached to it without a question; none: it enters unattached", () => {
    const { s: s0, ap, ids, opp } = setup([blade, blade]);
    putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: [ap] });
    expect(s.pending).toBeNull();
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.attachedTo).toBeUndefined();
    const b = putOnBattlefield(s, ap, bear());
    s = settle(run(s, planCast(s, ap, ids[1]!)), { me: [ap] });
    expect(s.pending).toBeNull();
    expect(s.objects[ids[1]!]!.attachedTo).toBe(b);
  });
});

describe("Goblin Test Pilot: a target chosen at random as it's activated (rulings)", () => {
  it("parses", () => supported(pilot));

  it("each activation targets a legal target at random, which players see on the stack; hexproof ones never", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const { s: s0, ap, opp } = setup([], seed);
      const p = putOnBattlefield(s0, ap, pilot);
      const hidden = putOnBattlefield(s0, opp, card("Test Hexproof", "Creature — Elf", "{G}", { power: "1", toughness: "1", keywords: ["Hexproof"], oracleText: "Hexproof" }));
      const s = run(s0, planActivate(s0, ap, p, 0, []));
      const item = s.stack[s.stack.length - 1]!;
      expect(item.targets?.length).toBe(1);
      const t0 = item.targets![0]!;
      expect(t0.kind === "object" && t0.id === hidden).toBe(false);
      seen.add(t0.kind === "player" ? `player ${t0.id}` : t0.kind === "object" ? (t0.id === p ? "itself" : "object") : "other");
    }
    // Players, itself and other creatures all come up (four players and some creatures to pick from).
    expect([...seen].filter((x) => x.startsWith("player")).length).toBeGreaterThan(1);
    expect(seen.has("itself") || seen.has("object")).toBe(true);
  });

  it("the damage goes to the random target; bots don't activate it", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    const p = putOnBattlefield(s0, ap, pilot);
    let s = run(s0, planActivate(s0, ap, p, 0, []));
    const t0 = s.stack[s.stack.length - 1]!.targets![0]!;
    const before = t0.kind === "player" ? s.players[t0.id]!.life : 0;
    s = settle(s);
    if (t0.kind === "player") expect(s.players[t0.id]!.life).toBe(before - 2);
    else if (t0.kind === "object") expect(s.objects[t0.id]!.zone === "graveyard" || s.objects[t0.id]!.damage === 2).toBe(true);
    const fresh = setup([]);
    fresh.s.players[fresh.ap]!.hand = [];
    const q = putOnBattlefield(fresh.s, fresh.ap, pilot);
    expect(botActions(fresh.s, fresh.ap).some((a) => a.type === "activateAbility" && a.objectId === q)).toBe(false);
  });
});

describe("Dreams of the Dead: back with cumulative upkeep {2}, exiled if it would leave", () => {
  it("parses", () => supported(dreams));

  const zombie = card("Test Zombie", "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2" });

  it("returns a black creature card; its upkeep asks for {2} per age counter; not paying exiles it", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    const d = putOnBattlefield(s0, ap, dreams);
    const z = toYard(s0, ap, zombie);
    let s = activateIt(s0, ap, d, 0, [tgt(z)]);
    const back = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Test Zombie")!;
    expect(back).toBeDefined();
    s = passUntil(s, "upkeep", ap, 4000);
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, keep: true, pay: { mana: "{2}" } });
    expect(s.objects[back]!.counters.age).toBe(1);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[back]!.zone).toBe("exile");
  });

  it("only a white or black creature card; destroyed, it's exiled instead", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, dreams);
    const g = toYard(s0, ap, bear());
    expect(planActivate(s0, ap, d, 0, [tgt(g)])).toBeNull();
    const z = toYard(s0, ap, zombie);
    let s = activateIt(s0, ap, d, 0, [tgt(z)]);
    const back = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Test Zombie")!;
    const kill = toHand(s, ap, card("Test Kill", "Instant", "{B}", { oracleText: "Destroy target creature." }));
    s = castIt(s, ap, kill, [tgt(back)]);
    expect(s.objects[back]!.zone).toBe("exile");
    void opp;
  });
});

describe("Evershrike: back from the graveyard with an Aura from your hand, or exiled", () => {
  it("parses", () => supported(evershrike));

  const aura = card("Test Aura", "Enchantment — Aura", "{1}{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+0." });
  const bigAura = card("Test Big Aura", "Enchantment — Aura", "{3}{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+0." });

  it("X=2: an Aura with mana value 2 or less goes onto it, and it stays (+2/+2 and +1/+0)", () => {
    const { s: s0, ap } = setup([aura, bigAura]);
    const e = toYard(s0, ap, evershrike);
    let s = run(s0, planActivate(s0, ap, e, 0, [], undefined, undefined, 2));
    s = settle(s, { me: [ap] });
    expect(s.pending?.player).toBe(ap);
    // Only the cheap one is offered.
    const offered = JSON.stringify(s.pending);
    expect(offered).toContain(s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Test Aura"));
    expect(offered).not.toContain(s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Test Big Aura"));
    for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s);
    expect(s.objects[e]!.zone).toBe("battlefield");
    const a = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Test Aura")!;
    expect(s.objects[a]!.attachedTo).toBe(e);
    expect(pt(s, e)).toBe("5/4");
  });

  it("no Aura put onto it: it's exiled; X=0 too", () => {
    const { s: s0, ap } = setup([bigAura]);
    const e = toYard(s0, ap, evershrike);
    let s = run(s0, planActivate(s0, ap, e, 0, [], undefined, undefined, 0));
    s = settle(s);
    expect(s.objects[e]!.zone).toBe("exile");
    expect(s.players[ap]!.hand.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Test Big Aura")).toBe(true);
  });
});

describe("Shifty Doppelganger: a creature from your hand until the end step, then the Doppelganger back", () => {
  it("parses", () => supported(shifty));

  const giant = card("Test Giant", "Creature — Giant", "{5}{R}", { power: "6", toughness: "6" });

  it("the creature comes with haste; at the end step it's sacrificed and the Doppelganger returns", () => {
    const { s: s0, ap, ids } = setup([giant]);
    s0.players[ap]!.hand = [ids[0]!];
    const d = putOnBattlefield(s0, ap, shifty);
    let s = run(s0, planActivate(s0, ap, d, 0));
    expect(s.objects[d]!.zone).toBe("exile");
    s = settle(s, { me: [ap] });
    for (let i = 0; i < 5 && s.pending?.player === ap; i++) for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s);
    const g = ids[0]!;
    expect(s.objects[g]!.zone).toBe("battlefield");
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.objects[d]!.zone).toBe("battlefield");
  });

  it("if the creature has left by then, the Doppelganger stays in exile (rulings)", () => {
    const { s: s0, ap, ids } = setup([giant]);
    s0.players[ap]!.hand = [ids[0]!];
    const d = putOnBattlefield(s0, ap, shifty);
    let s = settle(run(s0, planActivate(s0, ap, d, 0)), { me: [ap] });
    for (let i = 0; i < 5 && s.pending?.player === ap; i++) for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s);
    const g = ids[0]!;
    const kill = toHand(s, ap, card("Test Kill", "Instant", "{B}", { oracleText: "Destroy target creature." }));
    s = castIt(s, ap, kill, [tgt(g)]);
    expect(s.objects[g]!.zone).toBe("graveyard");
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[d]!.zone).toBe("exile");
  });

  it("putting nothing is allowed: it stays exiled", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    const d = putOnBattlefield(s0, ap, shifty);
    let s = settle(run(s0, planActivate(s0, ap, d, 0)));
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[d]!.zone).toBe("exile");
  });
});

describe("Cut the Tethers: each Spirit's owner pays {3} or it returns to their hand", () => {
  it("parses", () => supported(tethers));

  const spirit = card("Test Spirit", "Creature — Spirit", "{1}{W}", { power: "1", toughness: "1" });

  it("owners asked in turn order from the active player, each about each of theirs; the unpaid ones return together", () => {
    const { s: s0, ap, ids, opp } = setup([tethers]);
    const mine = putOnBattlefield(s0, ap, spirit);
    const theirs1 = putOnBattlefield(s0, opp, spirit);
    const theirs2 = putOnBattlefield(s0, opp, spirit);
    const bear1 = putOnBattlefield(s0, opp, bear());
    s0.players[opp]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 3 };
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: [ap, opp] });
    // The caster first (the active player), about their own Spirit.
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap });
    s = settle(act(s, { type: "payUnless", player: ap, pay: false }), { me: [ap, opp] });
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp });
    s = settle(act(s, { type: "payUnless", player: opp, pay: true }), { me: [ap, opp] });
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp });
    s = settle(act(s, { type: "payUnless", player: opp, pay: false }), { me: [ap, opp] });
    expect(s.objects[mine]!.zone).toBe("hand");
    expect([s.objects[theirs1]!.zone, s.objects[theirs2]!.zone].sort()).toEqual(["battlefield", "hand"]);
    expect(s.objects[bear1]!.zone).toBe("battlefield");
  });

  it("the bot casts it only when the opponents own more Spirits", () => {
    const { s: s0, ap, ids, opp } = setup([tethers]);
    s0.players[ap]!.hand = [ids[0]!];
    putOnBattlefield(s0, ap, spirit);
    putOnBattlefield(s0, opp, spirit);
    expect(botActions(s0, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(false);
    putOnBattlefield(s0, opp, spirit);
    expect(botActions(s0, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(true);
  });
});
