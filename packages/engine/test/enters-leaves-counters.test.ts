// "Whenever a creature enters" and "when ~ leaves the battlefield" triggers, linked exile (CR 607.2a),
// stun and shield counters (CR 122.1c-d), "put a counter on a creature you control", draw triggers,
// raid and other intervening "if" clauses (CR 603.4), connive (CR 701.50), and "if that creature would
// die this turn, exile it instead" (CR 614.1a).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { compileCard, invalidateCharacteristics, isFullySupported, moveObject, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const logged = (s: GameState, re: RegExp) => s.log.some((e) => re.test(e.text));
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return settle(plan!.reduce((x, a) => act(x, a), s));
};
const castIt = (s: GameState, pid: PlayerId, id: string, targets?: Parameters<typeof planCast>[3]) => run(s, planCast(s, pid, id, targets));
const creature = (name: string, text: string, p = "2", t = "2") => card(name, "Creature — Wizard", "{1}{U}", { power: p, toughness: t, oracleText: text });
const spell = (name: string, text: string, type = "Sorcery") => card(name, type, "{1}", { oracleText: text });

const kill = spell("Kill Test", "Destroy target creature.", "Instant");
const shock = spell("Shock Test", "Shock Test deals 2 damage to target creature.", "Instant");

describe("enters and leaves triggers", () => {
  it("whenever another creature you control enters", () => {
    const { s, ap, ids } = setup([bear({ name: "Bear Entering" })]);
    putOnBattlefield(s, ap, creature("Welcome Test", "Whenever another creature you control enters, you gain 1 life."));
    const life = s.players[ap]!.life;
    const after = castIt(s, ap, ids[0]!);
    expect(after.players[ap]!.life).toBe(life + 1);
  });

  it("a linked exile comes back when the exiler leaves (Fiend Hunter)", () => {
    const hunter = creature(
      "Hunter Test",
      "When this creature enters, exile target creature an opponent controls.\nWhen this creature leaves the battlefield, return the exiled card to the battlefield under its owner's control.",
    );
    supported(hunter);
    const { s, ap, opp, ids } = setup([hunter, kill]);
    const victim = putOnBattlefield(s, opp, bear({ name: "Victim Bear" }));
    let t = castIt(s, ap, ids[0]!);
    if (t.pending?.kind === "chooseTargets") t = settle(act(t, { type: "chooseTargets", player: ap, targets: [target(victim)] }));
    expect(t.objects[victim]!.zone).toBe("exile");
    const h = t.battlefield.find((id) => t.objects[id]!.cardId === hunter.oracleId)!;
    t = castIt(t, ap, ids[1]!, [target(h)]);
    expect(t.objects[victim]!.zone).toBe("battlefield");
    expect(t.objects[victim]!.controller).toBe(opp);
  });
});

describe("stun and shield counters (CR 122.1c-d)", () => {
  it("a stun counter is removed instead of untapping, in the untap step and for untap effects", () => {
    const untap = spell("Untap Test", "Untap target creature.", "Instant");
    const { s, ap, ids } = setup([untap]);
    const b = putOnBattlefield(s, ap, bear());
    s.objects[b]!.tapped = true;
    s.objects[b]!.counters.stun = 2;
    let t = castIt(s, ap, ids[0]!, [target(b)]);
    expect(t.objects[b]!.tapped).toBe(true);
    expect(t.objects[b]!.counters.stun).toBe(1);
    t = passUntil(passUntil(t, "upkeep", t.turnOrder[(t.turnOrder.indexOf(ap) + 1) % 4]), "upkeep", ap);
    expect(t.objects[b]!.tapped).toBe(true);
    expect(t.objects[b]!.counters.stun).toBe(0);
    t = passUntil(passUntil(t, "upkeep", t.turnOrder[(t.turnOrder.indexOf(ap) + 1) % 4]), "upkeep", ap);
    expect(t.objects[b]!.tapped).toBe(false);
  });

  it("tap and stun templates, and entering tapped with stun counters", () => {
    const freeze = spell("Freeze Test", "Tap target creature an opponent controls and put three stun counters on it.", "Instant");
    const out = spell("Out Cold Test", "Tap up to two target creatures and put a stun counter on each of them.", "Instant");
    const sleeper = creature("Sleeper Test", "This creature enters tapped with three stun counters on it.", "5", "5");
    supported(freeze, out, sleeper);
    expect(compileCard(sleeper).entersTapped).toBe(true);
    const { s, ap, opp, ids } = setup([freeze, sleeper]);
    const b = putOnBattlefield(s, opp, bear());
    let t = castIt(s, ap, ids[0]!, [target(b)]);
    expect(t.objects[b]!.tapped).toBe(true);
    expect(t.objects[b]!.counters.stun).toBe(3);
    t = castIt(t, ap, ids[1]!);
    const slept = t.objects[ids[1]!]!;
    expect(slept.zone).toBe("battlefield");
    expect(slept.tapped).toBe(true);
    expect(slept.counters.stun).toBe(3);
  });

  it("a shield counter is removed instead of damage or destruction", () => {
    const { s, ap, opp, ids } = setup([shock, kill, shock]);
    const b = putOnBattlefield(s, opp, bear());
    s.objects[b]!.counters.shield = 1;
    let t = castIt(s, ap, ids[0]!, [target(b)]);
    expect(t.objects[b]!.damage).toBe(0);
    expect(t.objects[b]!.counters.shield).toBe(0);
    t.objects[b]!.counters.shield = 1;
    t = castIt(t, ap, ids[1]!, [target(b)]);
    expect(t.objects[b]!.zone).toBe("battlefield");
    expect(t.objects[b]!.counters.shield).toBe(0);
    t = castIt(t, ap, ids[2]!, [target(b)]);
    expect(t.objects[b]!.zone).toBe("graveyard");
  });

  it("'as long as it has a shield counter on it' and putting a counter on a creature you control", () => {
    const rhox = creature("Rhox Test", "This creature enters with a shield counter on it.\nThis creature has trample as long as it has a shield counter on it.", "4", "4");
    const bless = spell("Bless Test", "Put a shield counter on a creature you control.");
    supported(rhox, bless);
    const { s, ap, ids } = setup([bless]);
    const a = putOnBattlefield(s, ap, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s, ap, bear({ name: "Bear B" }));
    let t = castIt(s, ap, ids[0]!);
    expect(t.pending).toMatchObject({ kind: "pickPermanents", action: "counters", counter: "shield", count: 1 });
    t = settle(act(t, { type: "pickPermanents", player: ap, ids: [b] }));
    expect(t.objects[b]!.counters.shield).toBe(1);
    expect(t.objects[a]!.counters.shield ?? 0).toBe(0);
  });
});

describe("draw triggers", () => {
  it("'your second card each turn' triggers on the second card only", () => {
    const twice = spell("Twice Test", "Draw two cards.");
    const once = spell("Once Test", "Draw a card.");
    const { s, ap, ids } = setup([twice, once]);
    const m = putOnBattlefield(s, ap, creature("Marvel Test", "Whenever you draw your second card each turn, put a +1/+1 counter on this creature."));
    s.players[ap]!.draws = { turn: s.turn, n: 0 };
    let t = castIt(s, ap, ids[0]!);
    expect(t.objects[m]!.counters["+1/+1"]).toBe(1);
    t = castIt(t, ap, ids[1]!);
    expect(t.objects[m]!.counters["+1/+1"]).toBe(1);
  });

  it("'whenever an opponent draws a card' and 'that player'", () => {
    const gift = spell("Gift Test", "Target player draws two cards.");
    const { s, ap, opp, ids } = setup([gift]);
    putOnBattlefield(s, ap, creature("Unraveler Test", "Whenever an opponent draws a card, this creature deals 1 damage to that player."));
    const life = s.players[opp]!.life;
    const t = castIt(s, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(t.players[opp]!.life).toBe(life - 2);
  });
});

describe("raid and intervening 'if' (CR 603.4)", () => {
  it("enters with a counter and triggers only if you attacked this turn", () => {
    // Generic costs: four of these need more blue than the test lands have.
    const counter = { ...creature("Raid Counter Test", "Raid — This creature enters with a +1/+1 counter on it if you attacked this turn."), manaCost: "{2}" };
    const draw = { ...creature("Raid Draw Test", "Raid — When this creature enters, if you attacked this turn, draw a card."), manaCost: "{2}" };
    supported(counter, draw);
    const { s, ap, opp, ids } = setup([counter, draw, counter, draw]);
    let t = castIt(s, ap, ids[0]!);
    const hand = t.players[ap]!.hand.length;
    t = castIt(t, ap, ids[1]!);
    expect(t.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(t.players[ap]!.hand.length).toBe(hand - 1);
    const attacker = putOnBattlefield(t, ap, bear({ name: "Attacker" }));
    t = passUntil(t, "declareAttackers", ap);
    t = act(t, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
    t = passUntil(t, "main2", ap);
    t = castIt(t, ap, ids[2]!);
    expect(t.objects[ids[2]!]!.counters["+1/+1"]).toBe(1);
    const before = t.players[ap]!.hand.length;
    t = castIt(t, ap, ids[3]!);
    expect(t.players[ap]!.hand.length).toBe(before); // cast one, drew one
  });

  it("does nothing if the condition is false as it resolves", () => {
    const metal = creature("Metal Test", "When this creature enters, if you control three or more artifacts, you gain 5 life.");
    supported(metal);
    const { s, ap, ids } = setup([metal]);
    const arts = [1, 2, 3].map((i) => putOnBattlefield(s, ap, card(`Trinket ${i}`, "Artifact", "{1}")));
    const life = s.players[ap]!.life;
    // Cast it, and let it resolve so the trigger goes on the stack.
    let t = (planCast(s, ap, ids[0]!) ?? []).reduce((x, a) => act(x, a), s);
    for (let i = 0; i < 8 && !t.stack.some((x) => x.kind === "ability"); i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    expect(t.stack.some((x) => x.kind === "ability")).toBe(true);
    moveObject(t, arts[0]!, "graveyard");
    invalidateCharacteristics(t);
    t = settle(t);
    expect(t.players[ap]!.life).toBe(life);
    expect(logged(t, /no longer true/)).toBe(true);
  });

  it("a spell's 'If you attacked this turn, ...' is checked as it resolves", () => {
    const loot = spell("Treasure Test", "Draw a card. If you attacked this turn, draw a card.");
    supported(loot);
    const { s, ap, ids } = setup([loot]);
    const hand = s.players[ap]!.hand.length;
    const t = castIt(s, ap, ids[0]!);
    expect(t.players[ap]!.hand.length).toBe(hand); // cast one, drew one
  });
});

describe("connive (CR 701.50)", () => {
  it("draws, discards, and gets a counter only for a nonland card", () => {
    const sly = creature("Sly Test", "When this creature enters, it connives.");
    supported(sly);
    const extraBear = bear({ name: "Spare Bear" });
    const { s, ap, ids } = setup([sly, sly, extraBear, forest]);
    let t = castIt(s, ap, ids[0]!);
    expect(t.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    t = settle(act(t, { type: "discard", player: ap, objectIds: [ids[2]!] }));
    expect(t.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    t = castIt(t, ap, ids[1]!);
    t = settle(act(t, { type: "discard", player: ap, objectIds: [ids[3]!] }));
    expect(t.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(t.objects[ids[3]!]!.zone).toBe("graveyard");
  });
});

describe("'if it would die this turn, exile it instead' (CR 614.1a)", () => {
  it("exiles a creature the spell targeted or damaged, and its dies triggers don't happen", () => {
    const flame = spell("Flame Test", "Flame Test deals 3 damage to target creature. If that creature would die this turn, exile it instead.", "Instant");
    const fire = spell("Fire Test", "Fire Test deals 3 damage to any target. If a creature dealt damage this way would die this turn, exile it instead.", "Instant");
    supported(flame, fire);
    const { s, ap, opp, ids } = setup([flame, fire, fire]);
    const a = putOnBattlefield(s, opp, creature("Dying Test", "When this creature dies, draw a card."));
    const b = putOnBattlefield(s, opp, bear());
    const hand = s.players[opp]!.hand.length;
    let t = castIt(s, ap, ids[0]!, [target(a)]);
    expect(t.objects[a]!.zone).toBe("exile");
    expect(t.players[opp]!.hand.length).toBe(hand);
    t = castIt(t, ap, ids[1]!, [target(b)]);
    expect(t.objects[b]!.zone).toBe("exile");
    const life = t.players[opp]!.life;
    t = castIt(t, ap, ids[2]!, [{ kind: "player", id: opp }]);
    expect(t.players[opp]!.life).toBe(life - 3);
  });

  it("lasts only for the turn", () => {
    const { s, ap, opp, ids } = setup([kill]);
    const b = putOnBattlefield(s, opp, bear());
    s.objects[b]!.exileIfDiesTurn = s.turn - 1;
    const t = castIt(s, ap, ids[0]!, [target(b)]);
    expect(t.objects[b]!.zone).toBe("graveyard");
  });
});
