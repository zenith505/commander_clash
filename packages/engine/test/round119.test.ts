// Round 119: round 118's rules gaps (Powerbalance reads the spell's mana value as cast, a split card's half or a
// prototyped spell; Aminatou's Augury asks which type a card with two is cast as), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, putOnBattlefield, setup } from "./helpers";
import { botActions, byTypeChoices, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { moveObject } from "../src/game";

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const later = (s: GameState, ap: PlayerId, n: number) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % 4]!;
const toLibraryTop = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  moveObject(s, id, "library");
  s.players[pid]!.library = [id, ...s.players[pid]!.library.filter((x) => x !== id)];
  return id;
};

// Real oracle text (Scryfall).
const powerbalance = card("Powerbalance", "Enchantment", "{R}{R}", {
  oracleText:
    "Whenever an opponent casts a spell, you may reveal the top card of your library. If you do, you may cast that card without paying its mana cost if the two spells have the same mana value.",
});
const fireIce = card("Fire // Ice", "Instant // Instant", "{1}{R} // {1}{U}", {
  layout: "split",
  oracleText: "Fire deals 2 damage divided as you choose among one or two targets.",
  faces: [
    { name: "Fire", manaCost: "{1}{R}", typeLine: "Instant", supertypes: [], types: ["Instant"], subtypes: [], oracleText: "Fire deals 2 damage divided as you choose among one or two targets.", colors: ["R"] },
    { name: "Ice", manaCost: "{1}{U}", typeLine: "Instant", supertypes: [], types: ["Instant"], subtypes: [], oracleText: "Tap target permanent.\nDraw a card.", colors: ["U"] },
  ],
});
const fleshgorger = card("Phyrexian Fleshgorger", "Creature — Phyrexian Wurm", "{5}{B}", {
  power: "7",
  toughness: "5",
  keywords: ["Ward", "Menace", "Lifelink", "Prototype"],
  oracleText: "Prototype {1}{B}{B} — 3/3 (You can cast this spell with different mana cost, color, and size. It keeps its abilities and types.)\nMenace, lifelink\nWard—Pay life equal to Phyrexian Fleshgorger's power.",
});

describe("Powerbalance compares the spells as cast", () => {
  /** `caster` casts its first card; Powerbalance's controller has `top` on top and says yes to revealing it. */
  const reveal = (cast: CardDef, top: CardDef, targets?: (s: GameState) => Parameters<typeof planCast>[3], face?: number) => {
    const { s: s0, ap, ids } = setup([cast]);
    let s = s0;
    const b = later(s, ap, 1);
    putOnBattlefield(s, b, powerbalance);
    const t = toLibraryTop(s, b, top);
    s = run(s, planCast(s, ap, ids[0]!, targets?.(s), undefined, undefined, undefined, face !== undefined ? { face } : {}));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: b });
    s = act(s, { type: "chooseMay", player: b, yes: true });
    return { s, ap, b, t };
  };

  it("a split card on top is cast as the half with that mana value, though the card's is 4", () => {
    expect(isFullySupported(powerbalance)).toBe(true);
    let { s, b, t } = reveal(bear({ name: "Cast Bear" }), fireIce);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", player: b, options: [t, "none"] });
    s = act(s, { type: "chooseOption", player: b, choice: t });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: t, mv: { exact: 2 } });
    const land = s.battlefield.find((id) => s.objects[id]!.controller !== b)!;
    s = run(s, planCast(s, b, t, [{ kind: "object", id: land }], undefined, undefined, undefined, { face: 1 }));
    expect(s.objects[t]!.zone).toBe("stack");
    s = settle(s);
    expect(s.objects[land]!.tapped).toBe(true);
  });

  it("a split card isn't fused for free: the fused spell's mana value is 4", () => {
    let { s, b, t } = reveal(bear({ name: "Cast Bear" }), fireIce);
    s = act(s, { type: "chooseOption", player: b, choice: t });
    expect(planCast(s, b, t, undefined, undefined, undefined, undefined, { face: 2 })).toBeNull();
  });

  it("the opponent's split spell has the mana value of the half cast", () => {
    const { s, b, t } = reveal(fireIce, bear({ name: "Free Bear" }), (s) => [{ kind: "object", id: s.battlefield[0]! }], 1);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", player: b, options: [t, "none"] });
  });

  it("a prototype card on top may be cast prototyped when only the prototype's mana value matches", () => {
    let { s, b, t } = reveal(card("Three Drop", "Creature — Beast", "{2}{G}", { power: "3", toughness: "3" }), fleshgorger);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [t, "none"] });
    s = act(s, { type: "chooseOption", player: b, choice: t });
    expect(planCast(s, b, t)).toBeNull();
    s = run(s, planCast(s, b, t, undefined, undefined, undefined, undefined, { alt: "prototype" }));
    s = settle(s);
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(s.objects[t]!.prototyped).toBe(true);
  });

  it("the bot casts the revealed prototype card prototyped", () => {
    let { s, b, t } = reveal(card("Three Drop", "Creature — Beast", "{2}{G}", { power: "3", toughness: "3" }), fleshgorger);
    for (let i = 0; i < 4 && s.pending?.player === b; i++) s = run(s, botActions(s, b));
    s = settle(s);
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(s.objects[t]!.prototyped).toBe(true);
  });
});

const augury = card("Aminatou's Augury", "Sorcery", "{6}{U}{U}", {
  oracleText:
    "Exile the top eight cards of your library. You may put a land card from among them onto the battlefield. Until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost.",
});

describe("Aminatou's Augury: the type a card is cast as", () => {
  const exileEight = () => {
    const { s: s0, ap, ids } = setup([augury]);
    let s = s0;
    const golem = card("Test Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" });
    const top = [bear({ name: "Top Bear" }), golem, card("Relic A", "Artifact", "{2}"), forest, forest, forest, forest, forest].map((d) => {
      const id = putOnBattlefield(s, ap, d);
      moveObject(s, id, "library");
      return id;
    });
    s.players[ap]!.library = [...top, ...s.players[ap]!.library.filter((x) => !top.includes(x))];
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    return { s, ap, top };
  };

  it("an artifact creature cast as a creature: no other creature, but an artifact still", () => {
    let { s, ap, top } = exileEight();
    expect(byTypeChoices(s, s.objects[top[1]!]!, ap)).toEqual(["Artifact", "Creature"]);
    s = settle(run(s, planCast(s, ap, top[1]!, undefined, undefined, undefined, undefined, { asType: "Creature" })));
    expect(s.objects[top[1]!]!.zone).toBe("battlefield");
    expect(planCast(s, ap, top[0]!)).toBeNull();
    s = settle(run(s, planCast(s, ap, top[2]!)));
    expect(s.objects[top[2]!]!.zone).toBe("battlefield");
  });

  it("cast as an artifact, the creature can still be cast and the other artifact can't", () => {
    let { s, ap, top } = exileEight();
    s = settle(run(s, planCast(s, ap, top[1]!, undefined, undefined, undefined, undefined, { asType: "Artifact" })));
    expect(planCast(s, ap, top[2]!)).toBeNull();
    expect(byTypeChoices(s, s.objects[top[0]!]!, ap)).toEqual(["Creature"]);
    s = settle(run(s, planCast(s, ap, top[0]!)));
    expect(s.objects[top[0]!]!.zone).toBe("battlefield");
  });

  it("a type the card doesn't have, or one used already, can't be chosen", () => {
    let { s, ap, top } = exileEight();
    expect(planCast(s, ap, top[0]!, undefined, undefined, undefined, undefined, { asType: "Artifact" })).toBeNull();
    s = settle(run(s, planCast(s, ap, top[0]!)));
    expect(planCast(s, ap, top[1]!, undefined, undefined, undefined, undefined, { asType: "Creature" })).toBeNull();
    expect(planCast(s, ap, top[1]!, undefined, undefined, undefined, undefined, { asType: "Artifact" })).not.toBeNull();
  });
});
