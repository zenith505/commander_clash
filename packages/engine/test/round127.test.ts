// Round 127: round 126's gaps (Hazel of the Rootbloom's mana in autopay, ...), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
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
