// Impulse draw: "Exile the top card of your library. Until the end of your next turn, you may play
// that card." (CR 406.3, 400.7), and "You may play an additional land on each of your turns" (CR 305.2a).

import { describe, expect, it } from "vitest";
import { act, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, legalActions, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const castIt = (s: GameState, pid: PlayerId, id: string) => settle(planCast(s, pid, id)!.reduce((x, a) => act(x, a), s));
/** Make the top card of the library this card. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = s.players[pid]!.library[0]!;
  s.cards[`top-${def.name}`] = { ...def, oracleId: `top-${def.name}` } as never;
  s.objects[id]!.cardId = `top-${def.name}`;
  return id;
};

describe("impulse draw", () => {
  const impulse = card("Impulse Test", "Sorcery", "{1}", { oracleText: "Exile the top card of your library. Until the end of your next turn, you may play that card." });
  const bolt = card("Shock Test", "Instant", "{1}", { oracleText: "Shock Test deals 2 damage to any target." });

  it("the exiled card can be cast from exile, paying its costs", () => {
    supported(impulse);
    const { s, ap, opp, ids } = setup([impulse]);
    const top = onTop(s, ap, card("Gain Test", "Sorcery", "{1}", { oracleText: "You gain 3 life." }));
    let t = castIt(s, ap, ids[0]!);
    expect(t.objects[top]!.zone).toBe("exile");
    const life = t.players[ap]!.life;
    t = castIt(t, ap, top);
    expect(t.players[ap]!.life).toBe(life + 3);
    expect(t.objects[top]!.zone).toBe("graveyard");
    void opp;
  });

  it("an exiled land can be played as the land for the turn", () => {
    const { s, ap, ids } = setup([impulse]);
    const top = onTop(s, ap, forest);
    let t = castIt(s, ap, ids[0]!);
    expect(legalActions(t, ap).some((a) => a.type === "playLand" && a.objectId === top)).toBe(true);
    t = act(t, { type: "playLand", player: ap, objectId: top });
    expect(t.objects[top]!.zone).toBe("battlefield");
  });

  it("the permission ends after your next turn, and doesn't let others play it", () => {
    const { s, ap, opp, ids } = setup([impulse]);
    const top = onTop(s, ap, bolt);
    let t = castIt(s, ap, ids[0]!);
    t = passUntil(t, "upkeep", opp);
    expect(t.objects[top]!.mayPlay).toBeDefined(); // still there on an opponent's turn
    t = passUntil(t, "main1", ap); // your next turn: still playable
    expect(t.objects[top]!.mayPlay).toBeDefined();
    t = passUntil(passUntil(t, "end", ap), "upkeep", opp);
    expect(t.objects[top]!.mayPlay).toBeUndefined();
    expect(t.objects[top]!.zone).toBe("exile");
  });

  it("'you may play that card this turn' ends at this turn's cleanup", () => {
    const now = card("Now Test", "Sorcery", "{1}", { oracleText: "Exile the top card of your library. You may play that card this turn." });
    supported(now);
    const { s, ap, opp, ids } = setup([now]);
    const top = onTop(s, ap, bolt);
    let t = castIt(s, ap, ids[0]!);
    expect(t.objects[top]!.mayPlay).toBeDefined();
    t = passUntil(t, "upkeep", opp);
    expect(t.objects[top]!.mayPlay).toBeUndefined();
  });
});

describe("additional land drops", () => {
  it("'you may play an additional land on each of your turns'", () => {
    const explore = card("Exploration Test", "Enchantment", "{G}", { oracleText: "You may play an additional land on each of your turns." });
    supported(explore);
    const { s, ap, ids } = setup([forest, forest, forest]);
    putOnBattlefield(s, ap, explore);
    let t = act(s, { type: "playLand", player: ap, objectId: ids[0]! });
    t = act(t, { type: "playLand", player: ap, objectId: ids[1]! });
    expect(() => act(t, { type: "playLand", player: ap, objectId: ids[2]! })).toThrow(/already played/);
  });
});

describe("'one or more' attack and combat damage triggers", () => {
  const attackWith = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
    act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
  const toDamage = (s: GameState) => {
    for (let i = 0; i < 40 && s.step !== "endCombat"; i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };
  const bear = (name: string) => card(name, "Creature — Bear", "{1}", { power: "2", toughness: "2" });

  it("'whenever you attack' triggers once however many attack", () => {
    const k = card("Rally Test", "Enchantment", "{1}", { oracleText: "Whenever you attack, you gain 1 life." });
    supported(k);
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, k);
    const a = putOnBattlefield(s, ap, bear("A Bear"));
    const b = putOnBattlefield(s, ap, bear("B Bear"));
    const life = s.players[ap]!.life;
    const t = settle(attackWith(s, ap, [{ attacker: a, defender: opp }, { attacker: b, defender: opp }]));
    expect(t.players[ap]!.life).toBe(life + 1);
  });

  it("combat damage to two players triggers once for each, and only matching creatures count", () => {
    const k = card("Breaker Test", "Enchantment", "{1}", { oracleText: "Whenever one or more Rogues you control deal combat damage to a player, that player loses 1 life." });
    supported(k);
    const { s, ap, opp } = setup([]);
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    putOnBattlefield(s, ap, k);
    const r1 = putOnBattlefield(s, ap, card("Rogue One", "Creature — Rogue", "{1}", { power: "1", toughness: "1" }));
    const r2 = putOnBattlefield(s, ap, card("Rogue Two", "Creature — Rogue", "{1}", { power: "1", toughness: "1" }));
    const b = putOnBattlefield(s, ap, bear("Plain Bear"));
    const fourth = s.turnOrder.find((p) => p !== ap && p !== opp && p !== third)!;
    const life = { opp: s.players[opp]!.life, third: s.players[third]!.life, fourth: s.players[fourth]!.life };
    let t = attackWith(s, ap, [{ attacker: r1, defender: opp }, { attacker: r2, defender: third }, { attacker: b, defender: fourth }]);
    t = settle(toDamage(t));
    expect(t.players[opp]!.life).toBe(life.opp - 1 - 1);
    expect(t.players[third]!.life).toBe(life.third - 1 - 1);
    expect(t.players[fourth]!.life).toBe(life.fourth - 2); // only the Bear: no trigger
  });
});
