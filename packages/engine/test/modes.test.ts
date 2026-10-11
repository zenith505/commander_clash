// Modal spells and abilities, CR 700.2: modes are chosen as the spell is cast or the trigger is
// put on the stack, a mode that can't have legal targets can't be chosen, only the chosen modes'
// targets are chosen, and the modes happen in printed order.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, compileCard, isFullySupported, planActivate, planCast, waitingOn, withModes, type GameState } from "../src";

const charm = card("Test Charm", "Instant", "{1}{G}", {
  oracleText: "Choose one —\n• Destroy target artifact.\n• Draw two cards.",
});
const command = card("Test Command", "Sorcery", "{2}{R}", {
  oracleText: "Choose two —\n• Target creature gets +2/+0 until end of turn.\n• This spell deals 2 damage to any target.\n• You gain 3 life.",
});
const either = card("Test Either", "Instant", "{1}{W}", {
  oracleText: "Choose one or both —\n• Target creature gets +1/+1 until end of turn.\n• Draw a card.",
});
const relic = card("Relic", "Artifact", "{1}");

const handSize = (s: GameState, pid: number) => s.players[pid]!.hand.length;

describe("compiling modal text", () => {
  it("reads the number of modes and each mode's own text", () => {
    const c = compileCard(command).spell!;
    expect(c.modal).toMatchObject({ min: 2, max: 2 });
    expect(c.modal!.modes.map((m) => m.text)).toEqual(["Target creature gets +2/+0 until end of turn.", "~ deals 2 damage to any target.", "You gain 3 life."]);
    expect(compileCard(either).spell!.modal).toMatchObject({ min: 1, max: 2 });
    expect(isFullySupported(charm)).toBe(true);
  });

  it("a card with any mode we can't run isn't supported", () => {
    const odd = card("Odd Charm", "Instant", "{U}", { oracleText: "Choose one —\n• Draw a card.\n• Transmogrify target creature." });
    expect(isFullySupported(odd)).toBe(false);
  });

  it("joins the chosen modes in printed order and renumbers their targets", () => {
    const body = withModes(compileCard(command).spell!, [1, 0]);
    expect(body.targets.map((t) => t.text)).toEqual(["target creature", "any target"]);
    expect(body.effects).toMatchObject([
      { type: "continuous", what: { ref: "target", index: 0 } },
      { type: "damage", to: { ref: "anyTarget", index: 1 } },
    ]);
  });
});

describe("casting a modal spell (CR 700.2a, 601.2b-c)", () => {
  it("must choose a mode, and only the chosen mode's targets", () => {
    const { s, ap, ids } = setup([charm]);
    s.players[ap]!.manaPool.G = 2;
    expect(() => act(s, { type: "castSpell", player: ap, objectId: ids[0]! })).toThrow(/choose one mode/);
    s.players[ap]!.manaPool.G = 0;
    // No artifacts anywhere: the destroy mode can't be chosen, the draw mode can, with no targets.
    expect(castProblem(s, ap, ids[0]!, undefined, [0])).toMatch(/no legal targets/);
    const before = handSize(s, ap);
    const after = cast(s, ap, ids[0]!, undefined, [1]);
    expect(handSize(after, ap)).toBe(before - 1 + 2);
  });

  it("rejects the wrong number of modes and repeated modes (CR 700.2d)", () => {
    const { s, ap, ids } = setup([either]);
    expect(castProblem(s, ap, ids[0]!, undefined, [])).toMatch(/one or both/);
    expect(castProblem(s, ap, ids[0]!, undefined, [1, 1])).toMatch(/only once/);
    expect(planCast(s, ap, ids[0]!, undefined, [0, 1])).toBeNull(); // mode 0 needs a creature target and there is none
    putOnBattlefield(s, ap, bear());
    expect(planCast(s, ap, ids[0]!, undefined, [0, 1])).not.toBeNull();
  });

  it("a spell with no mode that can be chosen can't be cast", () => {
    const onlyArtifacts = card("Shatter Charm", "Instant", "{R}", { oracleText: "Choose one —\n• Destroy target artifact.\n• Destroy target enchantment." });
    const { s, ap, ids } = setup([onlyArtifacts]);
    expect(castProblem(s, ap, ids[0]!)).toMatch(/no mode that can be chosen/);
    putOnBattlefield(s, ap, relic);
    expect(planCast(s, ap, ids[0]!, undefined, [0])).not.toBeNull();
  });

  it("modes happen in printed order, each with its own target", () => {
    const { s: s0, ap, ids, opp } = setup([command]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    // Chosen out of order; targets follow the printed order: pump mine, then 2 damage to theirs.
    const s = cast(s0, ap, ids[0]!, [target(mine), target(theirs)], [1, 0]);
    expect(pt(s, mine)).toBe("4/2");
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.log.some((e) => /casts Test Command choosing "Target creature gets \+2\/\+0 until end of turn\. Test Command deals 2 damage to any target"/.test(e.text))).toBe(true);
  });

  it("modes happen in sequence with no state-based actions in between (CR 608.2c, 704.3)", () => {
    // "Target creature gets -1/-1" then "put a +1/+1 counter on target creature", both on a 1/1:
    // it's never checked as a 0/0, so it survives as a 1/1 with a counter.
    const azula = card("Both Ways", "Instant", "{B}", { oracleText: "Choose one or both —\n• Target creature gets -1/-1 until end of turn.\n• Put a +1/+1 counter on target creature." });
    const { s: s0, ap, ids } = setup([azula]);
    const elf = putOnBattlefield(s0, ap, bear({ name: "Tiny Elf", power: "1", toughness: "1" }));
    const s = cast(s0, ap, ids[0]!, [target(elf), target(elf)], [0, 1]);
    expect(s.objects[elf]!.zone).toBe("battlefield");
    expect(pt(s, elf)).toBe("1/1");
  });

  it("if every target is gone, none of the chosen modes happen, even untargeted ones (CR 608.2b)", () => {
    const { s: s0, ap, ids, opp } = setup([either, card("Murder", "Instant", "{B}", { oracleText: "Destroy target creature." })]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(b)], [0, 1])!) s = act(s, a);
    // Respond by killing the target ourselves.
    for (const a of planCast(s, ap, ids[1]!, [target(b)])!) s = act(s, a);
    const before = handSize(s, ap);
    s = passAll(s); // Murder resolves
    s = passAll(s); // Test Either resolves with no legal target
    expect(handSize(s, ap)).toBe(before);
    expect(s.log.some((e) => /Test Either does nothing/.test(e.text))).toBe(true);
  });
});

describe("modal triggered abilities (CR 603.3c, 700.2b)", () => {
  const sporesinger = card("Spore Singer", "Creature — Fungus", "{2}{G}", {
    power: "2",
    toughness: "2",
    oracleText: "When this creature enters, choose one —\n• Target creature gets +2/+2 until end of turn.\n• You gain 2 life.",
  });
  const killer = card("Strict Singer", "Creature — Elf", "{2}{B}", {
    power: "2",
    toughness: "2",
    oracleText: "When this creature enters, choose one —\n• Destroy target artifact.\n• Destroy target enchantment.",
  });

  it("asks its controller to choose a mode as it's put on the stack, then targets", () => {
    const { s: s0, ap, ids } = setup([sporesinger]);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = passAll(s); // creature resolves, trigger waits for a mode
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: ap, min: 1, max: 1, legal: [true, true] });
    expect(() => act(s, { type: "chooseModes", player: ap, modes: [0, 1] })).toThrow(/one mode/);
    s = act(s, { type: "chooseModes", player: ap, modes: [0] });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", specs: [{ text: "target creature" }] });
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(ids[0]!)] });
    s = passAll(s);
    expect(pt(s, ids[0]!)).toBe("4/4");
  });

  it("with a mode chosen that needs no targets, it goes straight on the stack", () => {
    const { s: s0, ap, ids } = setup([sporesinger]);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = passAll(s);
    const life = s.players[ap]!.life;
    s = act(s, { type: "chooseModes", player: ap, modes: [1] });
    expect(s.pending).toBeNull();
    s = passAll(s);
    expect(s.players[ap]!.life).toBe(life + 2);
  });

  it("is removed from the stack when no mode can be chosen", () => {
    const { s: s0, ap, ids } = setup([killer]);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = passAll(s);
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
    expect(s.log.some((e) => /no mode that can be chosen and is removed/.test(e.text))).toBe(true);
  });

  it("when only one mode can be chosen, that's the choice", () => {
    const { s: s0, ap, ids, opp } = setup([killer]);
    const r = putOnBattlefield(s0, opp, relic);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", specs: [{ text: "target artifact" }] });
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(r)] });
    s = passAll(s);
    expect(s.objects[r]!.zone).toBe("graveyard");
  });
});

describe("other modal abilities", () => {
  it("a modal activated ability chooses its mode when activated (CR 700.2a)", () => {
    const totem = card("Totem", "Artifact", "{2}", { oracleText: "{1}, {T}: Choose one —\n• Target creature gets +1/+1 until end of turn.\n• You gain 1 life." });
    const { s: s0, ap } = setup([]);
    const t0 = putOnBattlefield(s0, ap, totem);
    const b = putOnBattlefield(s0, ap, bear());
    expect(() => act(s0, { type: "activateAbility", player: ap, objectId: t0, index: 0 })).toThrow(/choose one mode|not enough mana/);
    let s = s0;
    for (const a of planActivate(s, ap, t0, 0, [target(b)], [0])!) s = act(s, a);
    expect(s.stack[s.stack.length - 1]).toMatchObject({ modes: [0], description: "Totem: Target creature gets +1/+1 until end of turn." });
    s = passAll(s);
    expect(pt(s, b)).toBe("3/3");
  });

  it("'choose up to one': choosing no mode removes the ability (CR 603.3c)", () => {
    const maybe = card("Maybe Elf", "Creature — Elf", "{G}", {
      power: "1",
      toughness: "1",
      oracleText: "When this creature enters, choose up to one —\n• You gain 2 life.\n• Draw a card.",
    });
    const { s: s0, ap, ids } = setup([maybe]);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseModes", min: 0, max: 1 });
    s = act(s, { type: "chooseModes", player: ap, modes: [] });
    expect(s.stack).toHaveLength(0);
    expect(s.log.some((e) => /no modes chosen and is removed/.test(e.text))).toBe(true);
  });
});

describe("bots and modes", () => {
  it("a bot casting a charm picks a mode it can use", () => {
    const { s: s0, ap, opp } = setup([charm]);
    const r = putOnBattlefield(s0, opp, relic);
    s0.players[ap]!.isBot = true;
    s0.players[ap]!.command = [];
    s0.players[ap]!.hand = s0.players[ap]!.hand.filter((id) => s0.objects[id]!.cardId === charm.oracleId);
    const actions = botActions(s0, ap);
    const last = actions[actions.length - 1]!;
    expect(last).toMatchObject({ type: "castSpell", modes: [0], targets: [target(r)] });
    let s = s0;
    for (const a of actions) s = act(s, a);
    while (s.stack.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[r]!.zone).toBe("graveyard");
  });
});
