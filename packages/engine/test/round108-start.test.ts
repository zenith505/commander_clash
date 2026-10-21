// Round 108, the first cards: Jaxis, the Troublemaker (a token copy that gains a quoted dies trigger), Delina, Wild Mage
// ("except it's not legendary"; "You may roll again", CR 706.3c), Ancient Brass Dragon (targets with total mana value X
// or less, X the roll's result, CR 603.12), Firemane Commando ("whenever another player attacks with two or more
// creatures, they draw a card if none of those creatures attacked you") and Matzalantli ("four or more permanent types
// among cards in your graveyard").

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, controllerOf, isFullySupported, planActivate, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";
import { nextRandom } from "../src/rng";

// Real oracle text (Scryfall).
const jaxis = card("Jaxis, the Troublemaker", "Legendary Creature — Human Warrior", "{3}{R}", {
  power: "2",
  toughness: "3",
  keywords: ["Blitz"],
  oracleText:
    '{R}, {T}, Discard a card: Create a token that\'s a copy of another target creature you control. It gains haste and "When this token dies, draw a card." Sacrifice it at the beginning of the next end step. Activate only as a sorcery.\nBlitz {1}{R} (If you cast this spell for its blitz cost, it gains haste and "When this creature dies, draw a card." Sacrifice it at the beginning of the next end step.)',
});
const delina = card("Delina, Wild Mage", "Legendary Creature — Elf Shaman", "{3}{R}", {
  power: "3",
  toughness: "2",
  oracleText:
    'Whenever Delina attacks, choose target creature you control, then roll a d20.\n1—14 | Create a tapped and attacking token that\'s a copy of that creature, except it\'s not legendary and it has "At end of combat, exile this token."\n15—20 | Create one of those tokens. You may roll again.',
});
const brass = card("Ancient Brass Dragon", "Creature — Elder Dragon", "{5}{B}{B}", {
  power: "7",
  toughness: "6",
  keywords: ["Flying"],
  oracleText:
    "Flying\nWhenever this creature deals combat damage to a player, roll a d20. When you do, put any number of target creature cards with total mana value X or less from graveyards onto the battlefield under your control, where X is the result.",
});
const firemane = card("Firemane Commando", "Creature — Angel Soldier", "{3}{W}", {
  power: "4",
  toughness: "3",
  keywords: ["Flying"],
  oracleText: "Flying\nWhenever you attack with two or more creatures, draw a card.\nWhenever another player attacks with two or more creatures, they draw a card if none of those creatures attacked you.",
});
const matzalantli = card("Matzalantli, the Great Door", "Legendary Artifact", "{3}", {
  oracleText:
    "{T}: Draw a card, then discard a card.\n{4}, {T}: Transform Matzalantli. Activate only if there are four or more permanent types among cards in your graveyard. (Artifact, battle, creature, enchantment, land, and planeswalker are permanent types.)",
});
// Test cards.
const legend = card("Test Legend", "Legendary Creature — Elf", "{2}{G}", { power: "2", toughness: "2" });
const walker = card("Test Walker", "Legendary Planeswalker — Test", "{3}", { loyalty: "5", oracleText: "+1: Draw a card." });
const relic = card("Test Relic", "Artifact", "{1}");
const aura = card("Test Charm", "Enchantment", "{1}");
const bolt = card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." });
const forestCard = card("Test Grove", "Land");
const big = (name: string, mv: number) => card(name, "Creature — Beast", `{${mv - 1}}{B}`, { power: "4", toughness: "4", cmc: mv });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attackers: string[], defender: PlayerId, planeswalker?: string) =>
  act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender, ...(planeswalker ? { planeswalker } : {}) })) });
const named = (s: GameState, name: string) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === name);
const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
/** The next dice rolled come up `values`, in order (the game's seeded random numbers, CR 706.1b). */
function rig(s: GameState, sides: number, values: number[]) {
  for (let st = 1; st < 50_000_000; st++) {
    const t = { rngState: st };
    if (values.every((v) => 1 + Math.floor(nextRandom(t) * sides) === v)) {
      s.rngState = st;
      return;
    }
  }
  throw new Error("no such seed");
}
/** Put a card into its owner's graveyard straight from nowhere (a test shortcut). */
const inGraveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};

describe("Jaxis, the Troublemaker", () => {
  it("copies another creature you control: the token gains haste and a dies trigger, and is sacrificed at the next end step", () => {
    supported(jaxis);
    const { s: s0, ap, ids } = setup([bolt]);
    let s = s0;
    const j = putOnBattlefield(s, ap, jaxis);
    const b = putOnBattlefield(s, ap, bear());
    // Not Jaxis itself ("another target creature").
    expect(planActivate(s, ap, j, 0, [target(j)])).toBeNull();
    const plan = planActivate(s, ap, j, 0, [target(b)])!;
    for (const a of plan) s = act(s, a.type === "activateAbility" ? { ...a, costs: { discard: [ids[0]!] } } : a);
    s = settle(s);
    expect(s.players[ap]!.graveyard).toContain(ids[0]); // discarded as a cost
    const tok = named(s, "Grizzly Bears").find((id) => s.objects[id]!.isToken)!;
    expect(tok).toBeDefined();
    const ch = characteristics(s, s.objects[tok]!);
    expect(ch.keywords).toContain("Haste");
    // The granted ability isn't copiable (rulings): the token has it, the bear doesn't.
    expect(characteristics(s, s.objects[b]!).keywords).not.toContain("Haste");
    const before = hand(s, ap);
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[tok]?.zone).not.toBe("battlefield");
    // "When this token dies, draw a card": sacrificed, it died.
    expect(hand(s, ap)).toBe(before + 1);
    expect(s.objects[b]!.zone).toBe("battlefield");
  });
});

describe("Delina, Wild Mage", () => {
  // Each token attacks what you choose (round 109): here, the player Delina attacks, offered first.
  const settleAttack = (s0: GameState) => {
    let s = settle(s0);
    while (s.pending?.kind === "chooseOption" && s.pending.what === "attackWhom") s = settle(act(s, { type: "chooseOption", player: s.pending.player, choice: s.pending.options[0]! }));
    return s;
  };
  const scene = () => {
    const { s: s0, ap, opp } = setup([]);
    const s = s0;
    const d = putOnBattlefield(s, ap, delina);
    const l = putOnBattlefield(s, ap, legend);
    return { s, ap, opp, d, l };
  };

  it("1—14: a tapped and attacking copy that isn't legendary, exiled at end of combat", () => {
    supported(delina);
    const { s: s0, ap, opp, d, l } = scene();
    let s = attack(s0, ap, [d], opp);
    // The trigger's target: the legendary creature (it didn't attack).
    rig(s, 20, [7]);
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(l)] } as never);
    s = settleAttack(s);
    const toks = named(s, "Test Legend").filter((id) => s.objects[id]!.isToken);
    expect(toks).toHaveLength(1);
    const t = s.objects[toks[0]!]!;
    expect(t.tapped).toBe(true);
    expect(t.attacking).toBe(opp);
    expect(characteristics(s, t).supertypes).not.toContain("Legendary");
    // Not legendary, so the legend rule doesn't apply: both stay.
    expect(s.objects[l]!.zone).toBe("battlefield");
    s = settle(passUntil(s, "main2", ap));
    expect(s.objects[toks[0]!]?.zone).not.toBe("battlefield");
  });

  it("15—20: one of those tokens, then you may roll again, and the table applies to the new roll (CR 706.3c)", () => {
    const { s: s0, ap, opp, d, l } = scene();
    let s = attack(s0, ap, [d], opp);
    rig(s, 20, [17, 18, 3]);
    s = settleAttack(act(s, { type: "chooseTargets", player: ap, targets: [target(l)] } as never));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, prompt: "roll again" });
    s = settleAttack(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", prompt: "roll again" });
    s = settleAttack(act(s, { type: "chooseMay", player: ap, yes: true }));
    // 17, 18, then 3: three tokens, and no more asking after the 1—14 row.
    expect(s.pending).toBeNull();
    expect(named(s, "Test Legend").filter((id) => s.objects[id]!.isToken)).toHaveLength(3);
  });

  it("declining to roll again stops", () => {
    const { s: s0, ap, opp, d, l } = scene();
    let s = attack(s0, ap, [d], opp);
    rig(s, 20, [20]);
    s = settleAttack(act(s, { type: "chooseTargets", player: ap, targets: [target(l)] } as never));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(named(s, "Test Legend").filter((id) => s.objects[id]!.isToken)).toHaveLength(1);
  });
});

describe("Ancient Brass Dragon", () => {
  it("puts creature cards from any graveyards with total mana value up to the roll onto the battlefield under your control", () => {
    supported(brass);
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const dragon = putOnBattlefield(s, ap, brass);
    const three = inGraveyard(s, opp, big("Three", 3));
    const four = inGraveyard(s, ap, big("Four", 4));
    const five = inGraveyard(s, opp, big("Five", 5));
    s = attack(s, ap, [dragon], opp);
    rig(s, 20, [8]);
    s = settle(passUntil(s, "combatDamage", ap));
    // The reflexive trigger's targets, chosen with the result known: 8 allows Three and Five, not all three.
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(three), target(four), target(five)] } as never)).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(three), target(five)] } as never));
    for (const id of [three, five]) {
      expect(s.objects[id]!.zone).toBe("battlefield");
      expect(controllerOf(s, s.objects[id]!)).toBe(ap);
    }
    expect(s.objects[four]!.zone).toBe("graveyard");
  });
});

describe("Firemane Commando", () => {
  it("another player's attack with two or more creatures at someone else: they draw; one at you: they don't", () => {
    supported(firemane);
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, firemane);
    const opp = next(s, ap);
    const other = next(s, opp);
    const theirs = [0, 1].map((i) => putOnBattlefield(s, opp, bear({ name: `Bear ${i}` })));
    s = passUntil(s, "upkeep", opp);
    s = settle(passUntil(s, "main1", opp));
    const before = hand(s, opp);
    s = settle(attack(s, opp, theirs, other));
    expect(hand(s, opp)).toBe(before + 1);
    // Next time one of them attacks us: no card.
    s = passUntil(s, "upkeep", opp);
    s = settle(passUntil(s, "main1", opp));
    const again = hand(s, opp);
    s = settle(act(passUntil(s, "declareAttackers", opp), { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs[0]!, defender: other }, { attacker: theirs[1]!, defender: ap }] }));
    expect(hand(s, opp)).toBe(again);
  });

  it("attacking a planeswalker of yours isn't attacking you (rulings); your own attack draws you a card instead", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, firemane);
    const pw = putOnBattlefield(s, ap, walker);
    s.objects[pw]!.counters.loyalty = 5;
    const opp = next(s, ap);
    const theirs = [0, 1].map((i) => putOnBattlefield(s, opp, bear({ name: `Bear ${i}` })));
    // Our own attack: the first ability.
    const mine = [0, 1].map((i) => putOnBattlefield(s, ap, bear({ name: `Mine ${i}` })));
    const h0 = hand(s, ap);
    s = settle(attack(s, ap, mine, opp));
    expect(hand(s, ap)).toBe(h0 + 1);
    s = passUntil(s, "upkeep", opp);
    s = settle(passUntil(s, "main1", opp));
    const before = hand(s, opp);
    s = settle(attack(s, opp, theirs, ap, pw));
    expect(hand(s, opp)).toBe(before + 1);
  });
});

describe("Matzalantli, the Great Door", () => {
  it("transforms only with four or more permanent types among cards in your graveyard (an instant doesn't count)", () => {
    supported(matzalantli);
    const { s: s0, ap } = setup([]);
    const s = s0;
    const m = putOnBattlefield(s, ap, matzalantli);
    for (const d of [relic, aura, bear(), bolt]) inGraveyard(s, ap, d);
    expect(planActivate(s, ap, m, 1)).toBeNull();
    inGraveyard(s, ap, forestCard);
    expect(planActivate(s, ap, m, 1)).not.toBeNull();
  });
});
