// "If ~'s power is 7 or greater" as an ability resolves (Vincent, Vengeful Atoner; Witch-Maw Nephilim; Jor Kadeen):
// checked only then, with the power it last had on the battlefield once it has left (CR 608.2h; rulings on Vincent). The
// same for an intervening "if its power is 6 or greater" (CR 603.4: Angelic Sell-Sword). A creature that has left the
// battlefield also keeps a "can't be prevented" it had then as the source of its trigger's damage.

import { describe, expect, it } from "vitest";
import { act, addEffect, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Attack, then pass until an ability whose text includes `text` is on the stack (or the combat ends). */
const attackUntil = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], text: string) => {
  s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 100 && !s.stack.some((x) => x.kind === "ability" && JSON.stringify(x).includes(text)) && s.step !== "endCombat"; i++)
    s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const vincent = card("Vincent, Vengeful Atoner", "Legendary Creature — Assassin", "{2}{R}", { power: "3", toughness: "3", keywords: ["Menace", "Chaos"], oracleText: "Menace\nWhenever one or more creatures you control deal combat damage to a player, put a +1/+1 counter on Vincent.\nChaos — Whenever Vincent deals combat damage to an opponent, it deals that much damage to each other opponent if Vincent's power is 7 or greater." });
const nephilim = card("Witch-Maw Nephilim", "Creature — Nephilim", "{G}{W}{U}{B}", { power: "1", toughness: "1", oracleText: "Whenever you cast a spell, you may put two +1/+1 counters on this creature.\nWhenever this creature attacks, it gains trample until end of turn if its power is 10 or greater." });
const jor = card("Jor Kadeen, First Goldwarden", "Legendary Creature — Human Rebel", "{R}{W}", { power: "2", toughness: "2", keywords: ["Trample"], oracleText: "Trample\nWhenever Jor Kadeen attacks, it gets +X/+X until end of turn, where X is the number of equipped creatures you control. Then if Jor Kadeen's power is 4 or greater, draw a card." });
const sellSword = card("Angelic Sell-Sword", "Creature — Angel Mercenary", "{4}{W}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature or another nontoken creature you control dies, create a Treasure token.\nWhenever this creature attacks, if its power is 6 or greater, draw a card." });
const vengeance = card("Stalking Vengeance", "Creature — Avatar", "{5}{R}{R}", { power: "5", toughness: "5", keywords: ["Haste"], oracleText: "Haste\nWhenever another creature you control dies, it deals damage equal to its power to target player or planeswalker." });
const chasm = card("Test Sanctuary", "Enchantment", "{2}{W}", { oracleText: "Prevent all damage that would be dealt to you." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3", oracleText: "" });
const sword = card("Bonesplitter", "Artifact — Equipment", "{1}", { keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });

describe("power checked as the ability resolves, with last-known power", () => {
  it("compiles", () => supported(vincent, nephilim, jor, sellSword));

  it("Vincent with power 7: that much damage to each other opponent", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, vincent);
    addEffect(s0, ap, [v], [{ kind: "modifyPT", power: 4, toughness: 0 }]);
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    const s = settle(attackUntil(s0, ap, [{ attacker: v, defender: opp }], "each other opponent"));
    expect(s.players[opp]!.life).toBe(33);
    for (const p of others) expect(s.players[p]!.life).toBe(33);
  });

  it("Vincent with power 6: no damage to the other opponents", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, vincent);
    addEffect(s0, ap, [v], [{ kind: "modifyPT", power: 3, toughness: 0 }]);
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    let s = attackUntil(s0, ap, [{ attacker: v, defender: opp }], "each other opponent");
    // Its own +1/+1 counter trigger may resolve first: only the power as the Chaos ability resolves matters (rulings).
    const counterFirst = s.stack.findIndex((x) => JSON.stringify(x).includes("+1/+1 counter")) > s.stack.findIndex((x) => JSON.stringify(x).includes("each other opponent"));
    if (counterFirst) addEffect(s, ap, [v], [{ kind: "modifyPT", power: -1, toughness: 0 }]);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(34);
    for (const p of others) expect(s.players[p]!.life).toBe(40);
  });

  it("Vincent destroyed before the ability resolves: its last-known power 7 still deals the damage", () => {
    const { s: s0, ap, opp } = setup([murder]);
    const v = putOnBattlefield(s0, ap, vincent);
    addEffect(s0, ap, [v], [{ kind: "modifyPT", power: 4, toughness: 0 }]);
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    let s = attackUntil(s0, ap, [{ attacker: v, defender: opp }], "each other opponent");
    expect(waitingOn(s)).toBe(ap);
    const ids = s.players[ap]!.hand.filter((id) => s.objects[id]!.cardId === murder.oracleId);
    s = cast(s, ap, ids[0]!, [target(v)]);
    expect(s.objects[v]!.zone).toBe("graveyard");
    s = settle(s);
    expect(s.players[opp]!.life).toBe(33);
    for (const p of others) expect(s.players[p]!.life).toBe(33);
  });

  it("Vincent destroyed: it deals the damage as it last existed, with the lifelink an effect gave it (CR 608.2h)", () => {
    const { s: s0, ap, opp } = setup([murder]);
    const v = putOnBattlefield(s0, ap, vincent);
    addEffect(s0, ap, [v], [{ kind: "modifyPT", power: 4, toughness: 0 }, { kind: "addKeywords", keywords: ["Lifelink"] }]);
    let s = attackUntil(s0, ap, [{ attacker: v, defender: opp }], "each other opponent");
    const life = s.players[ap]!.life;
    const ids = s.players[ap]!.hand.filter((id) => s.objects[id]!.cardId === murder.oracleId);
    s = settle(cast(s, ap, ids[0]!, [target(v)]));
    expect(s.players[ap]!.life).toBe(life + 14);
  });

  it("Vincent destroyed with power 6 as it last existed: nothing more", () => {
    const { s: s0, ap, opp } = setup([murder]);
    const v = putOnBattlefield(s0, ap, vincent);
    addEffect(s0, ap, [v], [{ kind: "modifyPT", power: 3, toughness: 0 }]);
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    let s = attackUntil(s0, ap, [{ attacker: v, defender: opp }], "each other opponent");
    const ids = s.players[ap]!.hand.filter((id) => s.objects[id]!.cardId === murder.oracleId);
    s = settle(cast(s, ap, ids[0]!, [target(v)]));
    expect(s.objects[v]!.zone).toBe("graveyard");
    for (const p of others) expect(s.players[p]!.life).toBe(40);
  });

  it("Witch-Maw Nephilim gains trample only with power 10 or greater", () => {
    const { s: s0, ap, opp } = setup([]);
    const big = putOnBattlefield(s0, ap, nephilim);
    s0.objects[big]!.counters["+1/+1"] = 9;
    const small = putOnBattlefield(s0, ap, nephilim);
    s0.objects[small]!.counters["+1/+1"] = 8;
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: big, defender: opp }, { attacker: small, defender: opp }] });
    s = settle(s);
    const kw = (id: string) => JSON.stringify(s.effects.filter((e) => e.affected?.includes(id)));
    expect(kw(big)).toContain("Trample");
    expect(kw(small)).not.toContain("Trample");
  });

  it("Jor Kadeen: draws once the +X/+X makes its power 4 or greater", () => {
    const { s: s0, ap, opp } = setup([]);
    const j = putOnBattlefield(s0, ap, jor);
    const eq = putOnBattlefield(s0, ap, sword);
    s0.objects[eq]!.attachedTo = j;
    const hand = s0.players[ap]!.hand.length;
    // 2 + 2 from Bonesplitter + 1 (one equipped creature) = 5.
    const s = settle(act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: j, defender: opp }] }));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Jor Kadeen without equipment stays at 2 power: no card", () => {
    const { s: s0, ap, opp } = setup([]);
    const j = putOnBattlefield(s0, ap, jor);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: j, defender: opp }] }));
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("Angelic Sell-Sword's intervening if uses its last-known power once it has been destroyed", () => {
    const { s: s0, ap, opp } = setup([murder]);
    const a = putOnBattlefield(s0, ap, sellSword);
    addEffect(s0, ap, [a], [{ kind: "modifyPT", power: 2, toughness: 0 }]);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    expect(s.stack.some((x) => x.sourceId === a)).toBe(true);
    const hand = s.players[ap]!.hand.length;
    const ids = s.players[ap]!.hand.filter((id) => s.objects[id]!.cardId === murder.oracleId);
    s = settle(cast(s, ap, ids[0]!, [target(a)]));
    expect(s.objects[a]!.zone).toBe("graveyard");
    // Murder left the hand; the trigger drew one.
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("a creature that has left the battlefield keeps its \"can't be prevented\" as a damage source", () => {
  it("Stalking Vengeance: the dead creature's damage isn't prevented when it couldn't be as it last existed", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    putOnBattlefield(s0, ap, vengeance);
    putOnBattlefield(s0, opp, chasm);
    const g = putOnBattlefield(s0, ap, giant);
    addEffect(s0, ap, [g], [{ kind: "unpreventable" }]);
    let s = cast(s0, ap, ids[0]!, [target(g)]);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(37);
  });

  it("without it, the damage is prevented", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    putOnBattlefield(s0, ap, vengeance);
    putOnBattlefield(s0, opp, chasm);
    const g = putOnBattlefield(s0, ap, giant);
    let s = cast(s0, ap, ids[0]!, [target(g)]);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(40);
  });
});
