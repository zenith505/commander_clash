// Round 127: round 126's gaps (Hazel of the Rootbloom's mana in autopay, ...), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";

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
/** `ap`'s lands are only `lands`. */
const onlyLands = (s: GameState, ap: number, ...lands: CardDef[]) => {
  s.battlefield = s.battlefield.filter((id) => !s.cards[s.objects[id]!.cardId]!.types.includes("Land") || s.objects[id]!.controller !== ap);
  return lands.map((l) => putOnBattlefield(s, ap, l));
};

const hazel = card("Hazel of the Rootbloom", "Legendary Creature — Squirrel Druid", "{2}{B}{G}", {
  power: "3",
  toughness: "5",
  oracleText: "{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana in any combination of colors.\nAt the beginning of your end step, create a token that's a copy of target token you control. If that token is a Squirrel, instead create two tokens that are copies of it.",
});
const squirrel = card("Squirrel", "Token Creature — Squirrel", "", { power: "1", toughness: "1", colors: ["G"] });
const forest = card("Forest", "Basic Land — Forest");

describe("Hazel of the Rootbloom in autopay: only when the other sources can't pay (CR 107.3a, 605.1a)", () => {
  const scene = (lands: number, tokens: number, ...hand: CardDef[]) => {
    const { s, ap, ids } = setup(hand);
    onlyLands(s, ap, ...Array.from({ length: lands }, () => forest));
    const h = putOnBattlefield(s, ap, hazel);
    const toks = Array.from({ length: tokens }, () => {
      const id = putOnBattlefield(s, ap, squirrel);
      s.objects[id]!.isToken = true;
      return id;
    });
    return { s, ap, ids, h, toks };
  };
  const spell = card("Test Spell", "Sorcery", "{2}{B}{G}", { oracleText: "Draw a card." });
  it("two Forests and Hazel tapping two tokens pay {2}{B}{G}: 2 life, the black from Hazel", () => {
    supported(hazel);
    const { s: s0, ap, ids, h, toks } = scene(2, 3, spell);
    const life = s0.players[ap]!.life;
    const plan = planCast(s0, ap, ids[0]!);
    expect(plan?.some((a) => a.type === "activateAbility" && a.objectId === h && a.x === 2)).toBe(true);
    const s = run(s0, plan);
    expect(s.stack.at(-1)?.objectId).toBe(ids[0]);
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(toks.filter((id) => s.objects[id]!.tapped)).toHaveLength(2);
    expect(s.objects[h]!.tapped).toBe(true);
  });
  it("not when the lands can pay; nothing with too few tokens", () => {
    const four = scene(4, 3, card("Green Spell", "Sorcery", "{2}{G}{G}", { oracleText: "Draw a card." }));
    expect(planCast(four.s, four.ap, four.ids[0]!)?.some((a) => a.type === "activateAbility")).toBe(false);
    const short = scene(1, 2, spell);
    expect(planCast(short.s, short.ap, short.ids[0]!)).toBeNull();
  });
  it("not while Hazel is summoning sick", () => {
    const { s, ap, ids, h } = scene(2, 3, spell);
    s.objects[h]!.controlledSinceTurn = s.turn;
    expect(planCast(s, ap, ids[0]!)).toBeNull();
  });
});

const technician = card("Resonance Technician", "Creature — Weird Detective", "{3}{U/R}{U/R}", {
  power: "2",
  toughness: "4",
  keywords: ["Flying"],
  oracleText: "Flying\nWhen this creature enters, you may discard a card. If you do, investigate twice.\n{T}, Tap X untapped artifacts you control: Copy target instant or sorcery spell you control with mana value X. You may choose new targets for the copy.",
});
const clue = card("Clue", "Token Artifact — Clue", "", { oracleText: "{2}, Sacrifice this artifact: Draw a card." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

describe("Resonance Technician: tap X artifacts, copy a spell of yours with mana value X (CR 107.3a, 707.10)", () => {
  const scene = (clues: number, ...hand: CardDef[]) => {
    const { s, ap, ids } = setup(hand);
    const t = putOnBattlefield(s, ap, technician);
    const arts = Array.from({ length: clues }, () => {
      const id = putOnBattlefield(s, ap, clue);
      s.objects[id]!.isToken = true;
      return id;
    });
    return { s, ap, ids, t, arts };
  };
  it("three Clues copy Divination (mana value 3); two can't", () => {
    supported(technician);
    const { s: s0, ap, ids, t, arts } = scene(3, divination);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const spell = s.stack.at(-1)!;
    expect(planActivate(s, ap, t, 0, [{ kind: "stack", id: spell.id }], undefined, undefined, 2, { tap: arts.slice(0, 2) })).toBeNull();
    const hand = s.players[ap]!.hand.length;
    s = run(s, planActivate(s, ap, t, 0, [{ kind: "stack", id: spell.id }], undefined, undefined, 3, { tap: arts }));
    expect(arts.every((id) => s.objects[id]!.tapped) && s.objects[t]!.tapped).toBe(true);
    s = settleBots(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 4);
  });
  it("a bot copies its own Divination with three Clues", () => {
    const { s: s0, ap, ids, t } = scene(3, divination);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === t && a.x === 3)).toBe(true);
  });
});

const lightPaws = card("Light-Paws, Emperor's Voice", "Legendary Creature — Fox Advisor", "{1}{W}", {
  power: "2",
  toughness: "2",
  oracleText: "Whenever an Aura you control enters, if you cast it, you may search your library for an Aura card with mana value less than or equal to that Aura and with a different name than each Aura you control, put that card onto the battlefield attached to Light-Paws, then shuffle.",
});

describe("Light-Paws' search prompt says the mana value", () => {
  it("a two-mana Aura: \"with mana value 2 or less\"", () => {
    const blessing = card("Test Blessing", "Enchantment — Aura", "{1}{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
    const { s: s0, ap, ids } = setup([blessing]);
    const lp = putOnBattlefield(s0, ap, lightPaws);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: lp }]));
    for (let i = 0; i < 40 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const prompt = s.pending?.kind === "chooseMay" ? s.pending.prompt : "";
    expect(prompt).toContain("with mana value 2 or less and with a different name than each Aura you control");
  });
});

const malcolm = card("Malcolm, Keen-Eyed Navigator", "Legendary Creature — Siren Pirate", "{2}{U}", {
  power: "2",
  toughness: "1",
  keywords: ["Flying", "Partner"],
  oracleText: "Flying\nWhenever one or more Pirates you control deal damage to your opponents, you create a Treasure token for each opponent dealt damage. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nPartner (You can have two commanders if both have partner.)",
});
const francisco = card("Francisco, Fowl Marauder", "Legendary Creature — Bird Pirate", "{1}{U}{R}", {
  power: "1",
  toughness: "1",
  keywords: ["Flying", "Partner"],
  oracleText: "Flying\nFrancisco can't block.\nWhenever one or more Pirates you control deal damage to a player, Francisco explores.\nPartner (You can have two commanders if both have partner.)",
});
const pinger = (name: string, type: string) => card(name, `Creature — ${type}`, "{1}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to each opponent." });

describe("Malcolm, Keen-Eyed Navigator: one trigger for the damage Pirates deal at once (CR 603.2c)", () => {
  const treasures = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]?.name === "Treasure Token").length;
  it("a Pirate deals 1 damage to each opponent: one trigger, three Treasures", () => {
    supported(malcolm, francisco);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, malcolm);
    const p = putOnBattlefield(s0, ap, pinger("Test Corsair", "Human Pirate"));
    const s = settleBots(run(s0, planActivate(s0, ap, p, 0)));
    expect(logText(s).match(/Malcolm, Keen-Eyed Navigator's ability triggers/g)).toHaveLength(1);
    expect(treasures(s, ap)).toBe(3);
  });
  it("two Pirates' combat damage to two opponents: one trigger, two Treasures", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, malcolm);
    const [a, b] = [putOnBattlefield(s0, ap, pinger("Corsair A", "Human Pirate")), putOnBattlefield(s0, ap, pinger("Corsair B", "Human Pirate"))];
    const [o1, o2] = [1, 2].map((n) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + n) % 4]!);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: o1! }, { attacker: b, defender: o2! }] });
    for (let i = 0; i < 60 && s.step !== "end"; i++) {
      const pid = waitingOn(s)!;
      s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: pid, blocks: [] }) : s.pending ? botActions(s, pid).reduce((x, y) => act(x, y), s) : act(s, { type: "passPriority", player: pid });
    }
    expect(logText(s).match(/Malcolm, Keen-Eyed Navigator's ability triggers/g)).toHaveLength(1);
    expect(treasures(s, ap)).toBe(2);
  });
  it("not for a source that isn't a Pirate", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, malcolm);
    const p = putOnBattlefield(s0, ap, pinger("Test Goblin", "Goblin"));
    const s = settleBots(run(s0, planActivate(s0, ap, p, 0)));
    expect(treasures(s, ap)).toBe(0);
  });
  it("Francisco explores once for each player dealt damage (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, francisco);
    const p = putOnBattlefield(s0, ap, pinger("Test Corsair", "Human Pirate"));
    const s = settleBots(run(s0, planActivate(s0, ap, p, 0)));
    // Forests on top: each explore puts a land into the hand; nothing else changes Francisco.
    expect(logText(s).match(/Francisco, Fowl Marauder's ability triggers/g)).toHaveLength(3);
    expect(s.objects[f]!.zone).toBe("battlefield");
  });
});

const signpost = card("Misleading Signpost", "Artifact", "{2}{U}", {
  keywords: ["Flash"],
  oracleText: "Flash\nWhen this artifact enters during the declare attackers step, you may reselect which player or permanent target attacking creature is attacking. (It can't attack its controller or their permanents.)\n{T}: Add {U}.",
});

describe("Misleading Signpost: reselect what an attacking creature attacks (rulings)", () => {
  /** `opp` attacks `ap` with a Bear; `ap` has Misleading Signpost in hand, in the declare attackers step. */
  const attacked = () => {
    const { s: s0, ap, ids, opp } = setup([signpost]);
    const bear = putOnBattlefield(s0, opp, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: bear, defender: ap }] });
    for (let i = 0; i < 8 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, opp, bear, sp: ids[0]! };
  };
  it("flashed in as Ana's Bear attacks you: it attacks another player now, still declared at you", () => {
    supported(signpost);
    const { s: s0, ap, opp, bear, sp } = attacked();
    let s = run(s0, planCast(s0, ap, sp));
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: bear }] } as Action);
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "reselectAttack", player: ap });
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(options).not.toContain(String(opp)); // never its controller
    expect(options).not.toContain(String(ap)); // not what it attacks now
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    s = act(s, { type: "chooseOption", player: ap, choice: String(other) });
    expect(s.objects[bear]!.attacking).toBe(other);
    expect(s.objects[bear]!.attacked?.players).toEqual([ap]);
  });
  it("outside the declare attackers step it doesn't trigger", () => {
    const { s: s0, ap, ids } = setup([signpost]);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    const after = settleBots(s);
    expect(logText(after)).not.toMatch(/Misleading Signpost's ability triggers/);
  });
  it("a bot turns the attack away from itself", () => {
    const { s: s0, ap, bear, sp } = attacked();
    let s = run(s0, planCast(s0, ap, sp));
    s = settleBots(s);
    expect(s.objects[bear]!.attacking).not.toBe(ap);
  });
});

const oneRing = card("One Ring to Rule Them All", "Legendary Enchantment — Saga", "{2}{B}{B}", {
  oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — The Ring tempts you, then each player mills cards equal to your Ring-bearer's power.\nII — Destroy all nonlegendary creatures.\nIII — Each opponent loses 1 life for each creature card in that player's graveyard.",
});

describe("One Ring to Rule Them All", () => {
  it("I: the Ring tempts you, then each player mills cards equal to your Ring-bearer's power", () => {
    supported(oneRing);
    const { s: s0, ap, ids } = setup([oneRing]);
    const giant = putOnBattlefield(s0, ap, card("Test Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    const yards = (s: GameState) => s.turnOrder.map((p) => s.players[p]!.graveyard.length);
    const before = yards(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settleBots(s);
    expect(s.players[ap]!.ring?.bearer?.id).toBe(giant);
    expect(yards(s)).toEqual(before.map((n) => n + 3));
  });
  it("I without a creature: nobody mills", () => {
    const { s: s0, ap, ids } = setup([oneRing]);
    const before = s0.turnOrder.map((p) => s0.players[p]!.library.length);
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.turnOrder.map((p) => s.players[p]!.library.length)).toEqual(before);
  });
  it("III: each opponent loses 1 life for each creature card in their own graveyard", () => {
    const { s: s0, ap } = setup([]);
    const ring = putOnBattlefield(s0, ap, oneRing);
    s0.objects[ring]!.counters.lore = 2;
    const [o1, o2, o3] = [1, 2, 3].map((n) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + n) % 4]!);
    const bear = card("Yard Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
    const toYard = (pid: number, k: number) => {
      for (let i = 0; i < k; i++) {
        const id = putOnBattlefield(s0, pid, bear);
        s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
        s0.objects[id]!.zone = "graveyard";
        s0.players[pid]!.graveyard.push(id);
      }
    };
    toYard(o1!, 2);
    toYard(o2!, 0);
    toYard(o3!, 1);
    toYard(ap, 3);
    const order = [ap, o1!, o2!, o3!];
    const life = (s: GameState) => order.map((p) => s.players[p]!.life);
    // On ap's next turn, just before the lore counter is added (after the draw step, CR 714.3b).
    let s = passUntil(passUntil(s0, "main1", o1), "draw", ap);
    const creatures = order.map((p) => s.players[p]!.graveyard.filter((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Creature")).length);
    const start = life(s);
    s = settleBots(passUntil(s, "main1", ap));
    expect(life(s).map((n, i) => start[i]! - n)).toEqual([0, creatures[1], creatures[2], creatures[3]]);
    expect(creatures[1]).toBeGreaterThanOrEqual(2);
  });
});
