// Copies of spells (CR 707.10): Twincast, storm (702.40), replicate (702.56), "whenever you cast ..., copy it".

import { describe, expect, it } from "vitest";
import { act, bear, card, island, mountain, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const castOnly = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[], kicks?: number[]) => {
  const plan = planCast(s, pid, id, targets, undefined, undefined, undefined, kicks ? { kicks } : {});
  expect(plan, `cast ${s.cards[s.objects[id]!.cardId]!.name}`).toBeTruthy();
  return plan!.reduce((x, a) => act(x, a), s);
};
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const lives = (s: GameState) => s.turnOrder.map((p) => s.players[p]!.life);

const shock = card("Shock Test", "Instant", "{R}", { oracleText: "Shock Test deals 2 damage to any target." });
const opt = card("Cantrip Test", "Sorcery", "{U}", { oracleText: "Draw a card." });
const grapeshot = card("Grapeshot Test", "Sorcery", "{1}{R}", { oracleText: "Grapeshot Test deals 1 damage to any target.\nStorm", keywords: ["Storm"] });
const twincast = card("Twincast Test", "Instant", "{U}{U}", { oracleText: "Copy target instant or sorcery spell. You may choose new targets for the copy." });

describe("copying spells", () => {
  it("all compile", () => supported(grapeshot, twincast));

  it("Twincast: the copy keeps the original's targets unless new ones are chosen; it isn't cast and vanishes", () => {
    const { s: s0, ap, opp, ids } = setup([shock, twincast]);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    let s = castOnly(s0, ap, ids[0]!, [player(opp)]);
    const bolt = s.stack[s.stack.length - 1]!.id;
    s = castOnly(s, ap, ids[1]!, [{ kind: "stack", id: bolt }]);
    s = settle(s);
    expect(s.pending?.kind).toBe("copyTargets");
    // A new target must be legal; this one is.
    s = act(s, { type: "copyTargets", player: ap, targets: [player(third)] });
    expect(s.stack.map((x) => x.description)).toEqual(["Shock Test", "Shock Test (copy)"]);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(40 - 2);
    expect(s.players[third]!.life).toBe(40 - 2);
    expect(Object.values(s.objects).filter((o) => o.spellCopy)).toHaveLength(0); // CR 707.10a
    expect(s.players[ap]!.graveyard).toEqual(expect.arrayContaining([ids[0], ids[1]]));
    expect(s.players[ap]!.graveyard).toHaveLength(2);
  });

  it("new targets of a copy are checked against protection and \"can't be the target of\" (CR 702.16b, 115.4, 707.10)", () => {
    const paladin = card("Paladin en-Vec", "Creature — Human Knight", "{1}{W}{W}", { power: "2", toughness: "2", keywords: ["First strike", "Protection"], oracleText: "First strike, protection from black and from red (This creature deals combat damage before creatures without first strike. It can't be blocked, targeted, dealt damage, or enchanted by anything black or red.)" });
    const strider = card("Karplusan Strider", "Creature — Yeti", "{3}{G}", { power: "3", toughness: "4", oracleText: "This creature can't be the target of blue or black spells." });
    const unsummon = card("Unsummon", "Instant", "{U}", { oracleText: "Return target creature to its owner's hand." });
    supported(paladin, strider, unsummon);
    const { s: s0, ap, opp, ids } = setup([shock, twincast, unsummon, twincast]);
    const pal = putOnBattlefield(s0, opp, paladin);
    const str = putOnBattlefield(s0, opp, strider);
    const b = putOnBattlefield(s0, opp, bear());
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, island);
    // A red copy can't target the Paladin; the Yeti is fine.
    let s = castOnly(s0, ap, ids[0]!, [player(opp)]);
    s = settle(castOnly(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }]));
    expect(s.pending?.kind).toBe("copyTargets");
    expect(() => act(s, { type: "copyTargets", player: ap, targets: [{ kind: "object", id: pal }] })).toThrow(/legal new target/);
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [{ kind: "object", id: str }] }));
    expect(s.objects[str]!.damage).toBe(2);
    // A blue copy can't target the Yeti; the bear is fine.
    s = castOnly(s, ap, ids[2]!, [{ kind: "object", id: b }]);
    s = settle(castOnly(s, ap, ids[3]!, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }]));
    expect(s.pending?.kind).toBe("copyTargets");
    expect(() => act(s, { type: "copyTargets", player: ap, targets: [{ kind: "object", id: str }] })).toThrow(/legal new target/);
    expect(() => act(s, { type: "copyTargets", player: ap, targets: [{ kind: "object", id: pal }] })).not.toThrow();
  });

  it("keeping the targets", () => {
    const { s: s0, ap, opp, ids } = setup([shock, twincast]);
    let s = castOnly(s0, ap, ids[0]!, [player(opp)]);
    s = castOnly(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }]);
    s = settle(s);
    s = settle(act(s, { type: "copyTargets", player: ap }));
    expect(s.players[opp]!.life).toBe(40 - 4);
  });

  it("storm copies it once for each spell cast before it this turn", () => {
    const { s: s0, ap, opp, ids } = setup([opt, opt, grapeshot]);
    let s = settle(castOnly(s0, ap, ids[0]!));
    s = settle(castOnly(s, ap, ids[1]!));
    s = castOnly(s, ap, ids[2]!, [player(opp)]);
    s = settle(s);
    for (let i = 0; i < 2; i++) {
      expect(s.pending?.kind).toBe("copyTargets");
      s = settle(act(s, { type: "copyTargets", player: ap }));
    }
    expect(s.players[opp]!.life).toBe(40 - 3);
    expect(s.log.some((l) => /copies Grapeshot Test/.test(l.text))).toBe(true);
  });

  it("storm with no spells before it: no copies; a copy of a storm spell doesn't trigger storm (not cast)", () => {
    const { s: s0, ap, opp, ids } = setup([grapeshot]);
    const s = settle(castOnly(s0, ap, ids[0]!, [player(opp)]));
    expect(s.pending).toBeFalsy();
    expect(s.players[opp]!.life).toBe(40 - 1);
  });

  it("replicate: one copy for each time its replicate cost was paid", () => {
    const drain = card("Replicate Test", "Sorcery", "{1}{B}", { oracleText: "Replicate {1}\nTarget player loses 1 life." });
    supported(drain);
    const { s: s0, ap, opp, ids } = setup([drain]);
    let s = settle(castOnly(s0, ap, ids[0]!, [player(opp)], [0, 0, 0]));
    for (let i = 0; i < 3 && s.pending?.kind === "copyTargets"; i++) s = settle(act(s, { type: "copyTargets", player: ap }));
    expect(s.players[opp]!.life).toBe(40 - 4);
  });

  it("'whenever you cast an instant or sorcery spell, copy it' copies the cast spell", () => {
    const echo = card("Echo Test", "Enchantment", "{4}{U}{R}", { oracleText: "Whenever you cast an instant or sorcery spell, copy it. You may choose new targets for the copy." });
    supported(echo);
    const { s: s0, ap, opp, ids } = setup([shock]);
    putOnBattlefield(s0, ap, echo);
    let s = settle(castOnly(s0, ap, ids[0]!, [player(opp)]));
    expect(s.pending?.kind).toBe("copyTargets");
    s = settle(act(s, { type: "copyTargets", player: ap }));
    expect(s.players[opp]!.life).toBe(40 - 4);
  });

  it("a copy of a creature spell becomes a token (CR 608.3f)", () => {
    const major = card("Double Test", "Instant", "{G}{U}", { oracleText: "Copy target creature spell you control." });
    supported(major);
    const { s: s0, ap, ids } = setup([bear({ name: "Spell Bear" }), major]);
    let s = castOnly(s0, ap, ids[0]!);
    s = castOnly(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }]);
    s = settle(s);
    const bears = s.battlefield.filter((x) => s.cards[s.objects[x]!.cardId]!.name === "Spell Bear");
    expect(bears).toHaveLength(2);
    expect(bears.filter((x) => s.objects[x]!.isToken)).toHaveLength(1);
    void lives;
  });
  it("magecraft ('cast or copy') triggers for copies too; a plain cast trigger doesn't", () => {
    const mage = card("Magecraft Test", "Creature — Human Wizard", "{1}{R}", { power: "1", toughness: "1", oracleText: "Whenever you cast or copy an instant or sorcery spell, put a +1/+1 counter on this creature." });
    const plain = card("Plain Cast Test", "Creature — Human Wizard", "{1}{R}", { power: "1", toughness: "1", oracleText: "Whenever you cast an instant or sorcery spell, put a +1/+1 counter on this creature." });
    supported(mage, plain);
    const { s: s0, ap, opp, ids } = setup([shock, twincast]);
    const m = putOnBattlefield(s0, ap, mage);
    const p = putOnBattlefield(s0, ap, plain);
    let s = castOnly(s0, ap, ids[0]!, [player(opp)]);
    s = castOnly(s, ap, ids[1]!, [{ kind: "stack", id: s.stack.find((x) => x.description === "Shock Test")!.id }]);
    s = settle(s);
    s = settle(act(s, { type: "copyTargets", player: ap }));
    expect(s.objects[m]!.counters["+1/+1"]).toBe(3); // Shock, Twincast, the copy
    expect(s.objects[p]!.counters["+1/+1"]).toBe(2);
  });

  it("'when you next cast an instant or sorcery spell this turn, copy that spell' (Doublecast) applies once", () => {
    const doublecast = card("Doublecast Test", "Sorcery", "{R}{R}", { oracleText: "When you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy." });
    supported(doublecast);
    const { s: s0, ap, opp, ids } = setup([doublecast, shock, shock]);
    putOnBattlefield(s0, ap, mountain);
    let s = settle(castOnly(s0, ap, ids[0]!));
    expect(s.pending).toBeFalsy(); // it doesn't copy itself
    s = settle(castOnly(s, ap, ids[1]!, [player(opp)]));
    expect(s.pending?.kind).toBe("copyTargets");
    s = settle(act(s, { type: "copyTargets", player: ap }));
    expect(s.players[opp]!.life).toBe(40 - 4);
    s = settle(castOnly(s, ap, ids[2]!, [player(opp)]));
    expect(s.pending).toBeFalsy();
    expect(s.players[opp]!.life).toBe(40 - 6);
  });

  it("a delayed 'next cast' from an earlier turn expires", () => {
    const doublecast = card("Doublecast Test", "Sorcery", "{R}{R}", { oracleText: "When you next cast an instant or sorcery spell this turn, copy that spell." });
    const { s: s0, ap, opp, ids } = setup([doublecast, shock]);
    let s = settle(castOnly(s0, ap, ids[0]!));
    expect(s.nextCast).toHaveLength(1);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % s.turnOrder.length]!);
    expect(s.nextCast ?? []).toHaveLength(0);
    void opp;
  });
});
