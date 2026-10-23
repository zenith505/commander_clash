// Round 124: round 123's gaps (ward—waterbend, ...), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";
import { invalidateCharacteristics } from "../src/layers";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes });
    else if (p) s = botActions(s, p.player).reduce((x, a) => act(x, a), s);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Pass priority until something waits on a choice or the stack is empty. */
const untilChoice = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Tap all of `pid`'s lands but `keep` of them. */
const tapLands = (s: GameState, pid: string, keep: number) => {
  let left = keep;
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (o.controller !== pid || !s.cards[o.cardId]!.types.includes("Land")) continue;
    if (left > 0 && s.cards[o.cardId]!.name === "Mountain") left--;
    else o.tapped = true;
  }
};

// Real oracle text (Scryfall).
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const unagi = card("The Unagi of Kyoshi Island", "Legendary Creature — Serpent", "{3}{U}{U}", {
  power: "5",
  toughness: "5",
  keywords: ["Ward", "Flash", "Waterbend"],
  oracleText: "Flash\nWard—Waterbend {4}. (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {4}. They can tap their artifacts and creatures to help. Each one pays for {1}.)\nWhenever an opponent draws their second card each turn, you draw two cards.",
});

describe("ward—waterbend (The Unagi of Kyoshi Island)", () => {
  const scene = (creatures: number, lands: number) => {
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const u = putOnBattlefield(s0, opp, unagi);
    const mine = Array.from({ length: creatures }, (_, i) => putOnBattlefield(s0, ap, bear({ name: `Bear ${i}` })));
    tapLands(s0, ap, lands + 1);
    invalidateCharacteristics(s0);
    const s = untilChoice(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: u }])));
    return { s, ap, opp, u, mine };
  };

  it("the targeting player is asked to pay {4}, and may tap artifacts and creatures for up to {4} of it", () => {
    supported(unagi);
    const { s: s0, ap } = scene(4, 0);
    expect(s0.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{4}", waterbend: 4 });
  });

  it("a bot taps four creatures to pay it with no mana left, and the spell resolves", () => {
    const { s: s0, u, mine } = scene(4, 0);
    const s = settle(s0);
    expect(mine.every((id) => s.objects[id]!.tapped)).toBe(true);
    expect(s.objects[u]!.damage).toBe(3);
  });

  it("two lands and two creatures: mana first, then two creatures (CR 701.67a)", () => {
    const { s: s0, mine } = scene(4, 2);
    const s = settle(s0);
    expect(mine.filter((id) => s.objects[id]!.tapped)).toHaveLength(2);
  });

  it("only three creatures and no mana: it can't be paid, and Lightning Bolt is countered", () => {
    const { s: s0, u, mine } = scene(3, 0);
    const s = settle(s0);
    expect(mine.some((id) => s.objects[id]!.tapped)).toBe(false);
    expect(s.objects[u]!.damage).toBe(0);
  });

  it("tapping more than four, or a tapped creature, is refused", () => {
    const { s: s0, ap, mine } = scene(5, 0);
    expect(() => act(s0, { type: "payUnless", player: ap, pay: true, tap: mine })).toThrow(/no more than 4/);
    s0.objects[mine[0]!]!.tapped = true;
    expect(() => act(s0, { type: "payUnless", player: ap, pay: true, tap: mine.slice(0, 4) })).toThrow(/already tapped/);
    const s = act(s0, { type: "payUnless", player: ap, pay: true, tap: mine.slice(1, 5) });
    expect(s.log.some((l) => /taps .* to waterbend/.test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
  });
});
