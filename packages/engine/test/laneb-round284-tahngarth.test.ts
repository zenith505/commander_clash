// Lane B round B284: Tahngarth, First Mate ("Whenever an opponent attacks with one or more creatures, if Tahngarth is
// tapped, you may have that opponent gain control of Tahngarth until end of combat. If you do, choose a player or
// planeswalker that opponent is attacking. Tahngarth is attacking that player or planeswalker."; CR 500.5a, 506.3, 506.4,
// 508.4, 603.4, 613.1b and its rulings).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, controllerOf, isFullySupported, moveObject, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const tahngarth = (): CardDef => ({"oracleId":"1a8a41a1-6fc5-4dc8-bd28-9bf404c777d7","name":"Tahngarth, First Mate","manaCost":"{2}{R}{G}","cmc":4,"typeLine":"Legendary Creature — Minotaur Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Minotaur","Warrior"],"oracleText":"Tahngarth can't be blocked by more than one creature.\nWhenever an opponent attacks with one or more creatures, if Tahngarth is tapped, you may have that opponent gain control of Tahngarth until end of combat. If you do, choose a player or planeswalker that opponent is attacking. Tahngarth is attacking that player or planeswalker.","power":"5","toughness":"5","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"layout":"normal"}) as CardDef;
const ajani = (): CardDef => ({"oracleId":"dfb5f660-fd8b-4b7b-934c-6a71cd182f15","name":"Ajani Goldmane","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Legendary Planeswalker — Ajani","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Ajani"],"oracleText":"+1: You gain 2 life.\n−1: Put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn.\n−6: Create a white Avatar creature token. It has \"This token's power and toughness are each equal to your life total.\"","loyalty":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;

/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const seat = (s: GameState, ap: PlayerId, k: number) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % 4]!;

/**
 * The active player `ap` with two Grizzly Bears; Tahngarth under the next player's (`t`) control, tapped unless `untapped`,
 * Ajani Goldmane under `t` too when `walker`. In the declare attackers step, ready to declare.
 */
const board = (opts: { untapped?: boolean; walker?: boolean } = {}) => {
  const { s: s0, ap } = setup([]);
  const t = seat(s0, ap, 1);
  const x = seat(s0, ap, 2);
  const tg = putOnBattlefield(s0, t, tahngarth());
  s0.objects[tg]!.tapped = !opts.untapped;
  const b1 = putOnBattlefield(s0, ap, bear());
  const b2 = putOnBattlefield(s0, ap, bear());
  const aj = opts.walker ? putOnBattlefield(s0, t, ajani()) : undefined;
  if (aj) s0.objects[aj]!.counters = { loyalty: 4 };
  const s = passUntil(s0, "declareAttackers", ap);
  return { s, ap, t, x, tg, b1, b2, aj };
};

describe("Tahngarth, First Mate", () => {
  it("is supported", () => {
    expect(isFullySupported(tahngarth())).toBe(true);
  });

  it("goes to the attacking opponent until end of combat, attacking the player you choose, without being declared", () => {
    const { s: s0, ap, t, x, tg, b1, b2 } = board();
    let s = act(s0, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: x }, { attacker: b2, defender: t }] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: t });
    s = act(s, { type: "chooseMay", player: t, yes: true });
    // The players that opponent's creatures attack, the owner too (rulings), in turn order.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: t, what: "attackWhom", options: [String(t), String(x)] });
    s = settle(act(s, { type: "chooseOption", player: t, choice: String(x) }));
    const o = s.objects[tg]!;
    expect(controllerOf(s, o)).toBe(ap);
    expect(o.attacking).toBe(x);
    expect(o.attackingPermanent).toBeUndefined();
    // It stays tapped (rulings).
    expect(o.tapped).toBe(true);
    const life = s.players[x]!.life;
    s = passUntil(s, "endCombat", ap);
    // 5 from Tahngarth and 2 from the Bears attacking that player.
    expect(s.players[x]!.life).toBe(life - 7);
    s = passUntil(s, "main2", ap);
    // Back to its owner as combat ends (CR 500.5a), no longer attacking (CR 511.3).
    expect(controllerOf(s, s.objects[tg]!)).toBe(t);
    expect(s.objects[tg]!.attacking).toBeUndefined();
  });

  it("may attack its owner", () => {
    const { s: s0, ap, t, x, tg, b1, b2 } = board();
    let s = settle(act(s0, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: x }, { attacker: b2, defender: t }] }));
    s = act(s, { type: "chooseMay", player: t, yes: true });
    s = settle(act(s, { type: "chooseOption", player: t, choice: String(t) }));
    expect(s.objects[tg]!.attacking).toBe(t);
    const life = s.players[t]!.life;
    s = passUntil(s, "endCombat", ap);
    expect(s.players[t]!.life).toBe(life - 7);
  });

  it("with one player attacked there's nothing to choose", () => {
    const { s: s0, ap, x, tg, b1, b2, t } = board();
    let s = settle(act(s0, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: x }, { attacker: b2, defender: x }] }));
    s = settle(act(s, { type: "chooseMay", player: t, yes: true }));
    expect(s.pending).toBeNull();
    expect(controllerOf(s, s.objects[tg]!)).toBe(ap);
    expect(s.objects[tg]!.attacking).toBe(x);
  });

  it("can attack a planeswalker that opponent attacks, but not its controller when only the planeswalker is attacked", () => {
    const { s: s0, ap, t, tg, b1, aj } = board({ walker: true });
    let s = settle(act(s0, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: t, planeswalker: aj }] }));
    s = settle(act(s, { type: "chooseMay", player: t, yes: true }));
    // Ajani alone: no choice.
    expect(s.pending).toBeNull();
    expect(s.objects[tg]!.attacking).toBe(t);
    expect(s.objects[tg]!.attackingPermanent?.id).toBe(aj);
  });

  it("declined, nothing happens", () => {
    const { s: s0, ap, x, tg, b1 } = board();
    let s = settle(act(s0, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: x }] }));
    const t = controllerOf(s, s.objects[tg]!);
    s = settle(act(s, { type: "chooseMay", player: t, yes: false }));
    expect(controllerOf(s, s.objects[tg]!)).toBe(t);
    expect(s.objects[tg]!.attacking).toBeUndefined();
  });

  it("doesn't trigger while it's untapped", () => {
    const { s: s0, ap, x, b1 } = board({ untapped: true });
    const s = settle(act(s0, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: x }] }));
    expect(s.pending).toBeNull();
    expect(s.log.some((l) => /Tahngarth/.test(l.text) && /attacking/.test(l.text))).toBe(false);
  });

  it("does nothing if it untapped before the trigger resolves (CR 603.4)", () => {
    const { s: s0, ap, x, tg, b1 } = board();
    let s = act(s0, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: x }] });
    s.objects[tg]!.tapped = false;
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(controllerOf(s, s.objects[tg]!)).not.toBe(ap);
  });

  it("with no creature attacking any more, control still changes but it isn't attacking (rulings)", () => {
    const { s: s0, ap, t, x, tg, b1 } = board();
    let s = act(s0, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: x }] });
    // Let the trigger go on the stack, then the Bears leave.
    for (let i = 0; i < 5 && !s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    moveObject(s, b1, "graveyard");
    s = settle(s);
    s = settle(act(s, { type: "chooseMay", player: t, yes: true }));
    expect(controllerOf(s, s.objects[tg]!)).toBe(ap);
    expect(s.objects[tg]!.attacking).toBeUndefined();
  });

  it("a bot lends it only to attack someone else, the player with the least life first", () => {
    const { s: s0, ap, t, x, tg, b1, b2 } = board();
    const y = seat(s0, ap, 3);
    let s = settle(act(s0, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: x }, { attacker: b2, defender: y }] }));
    s.players[y]!.life = 12;
    expect(botActions(s, t)).toEqual([{ type: "chooseMay", player: t, yes: true }]);
    s = act(s, { type: "chooseMay", player: t, yes: true });
    expect(botActions(s, t)).toEqual([{ type: "chooseOption", player: t, choice: String(y) }]);
    // Only its owner attacked: no.
    const b = board();
    const only = settle(act(b.s, { type: "declareAttackers", player: b.ap, attacks: [{ attacker: b.b1, defender: b.t }] }));
    expect(botActions(only, b.t)).toEqual([{ type: "chooseMay", player: b.t, yes: false }]);
    void tg;
  });
});
