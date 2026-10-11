// The beginning of combat step (CR 507) and end of combat step (CR 511): "at the beginning of combat on your
// turn", "at end of combat" delayed triggers (CR 603.7), "whenever ~ attacks or blocks", myriad (CR 702.116).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));
/** Every defending player declares these blocks (or none), then the active player has priority. */
const blocks = (s: GameState, b: { blocker: string; attacker: string }[] = []) => {
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  while (s.pending?.kind === "declareBlockers") {
    const pid = s.pending.player;
    s = act(s, { type: "declareBlockers", player: pid, blocks: b.filter((x) => s.objects[x.blocker]!.controller === pid) });
  }
  return settle(s);
};
const named = (s: GameState, name: string) => s.battlefield.filter((x) => s.cards[s.objects[x]!.cardId]!.name === name);
const nextTurnOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;

describe("beginning of combat", () => {
  const aspirant = card("Aspirant Test", "Creature — Human Cleric", "{1}{W}", { power: "1", toughness: "1", oracleText: "At the beginning of combat on your turn, put a +1/+1 counter on target creature you control." });
  const each = card("Each Combat Test", "Enchantment", "{2}{R}", { oracleText: "At the beginning of each combat, this enchantment deals 1 damage to each opponent." });

  it("'on your turn' triggers as your beginning of combat step starts, not on other turns", () => {
    supported(aspirant, each);
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, aspirant);
    let s = passUntil(s0, "beginCombat", ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: a }] }));
    expect(pt(s, a)).toBe("2/2");
    // The next player's combat: nothing.
    s = passUntil(passUntil(s, "main2", ap), "main2", nextTurnOf(s, ap));
    expect(pt(s, a)).toBe("2/2");
  });

  it("'each combat' triggers on every player's turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const third = nextTurnOf(s0, opp);
    putOnBattlefield(s0, opp, each);
    const life = s0.players[ap]!.life;
    let s = settle(passUntil(s0, "beginCombat", ap));
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(s.players[opp]!.life).toBe(40);
    s = settle(passUntil(s, "beginCombat", opp));
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(s.players[third]!.life).toBe(40 - 2);
  });
});

describe("at end of combat", () => {
  const blazer = card("Blazer Test", "Creature — Goblin", "{1}{R}", { power: "4", toughness: "1", oracleText: "When this creature attacks or blocks, sacrifice it at end of combat." });
  const basilisk = card("Basilisk Test", "Creature — Basilisk", "{4}{G}", { power: "1", toughness: "4", oracleText: "Whenever this creature blocks or becomes blocked by a non-Wall creature, destroy that creature at end of combat." });
  const beetle = card("Beetle Test", "Artifact Creature — Insect", "{2}", {
    power: "0",
    toughness: "0",
    oracleText: "This creature enters with three +1/+1 counters on it.\nWhenever this creature attacks or blocks, remove a +1/+1 counter from it at end of combat.",
  });

  it("'sacrifice it at end of combat': after damage, at the end of combat step, whether it attacked or blocked", () => {
    supported(blazer);
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, blazer);
    const life = s0.players[opp]!.life;
    let s = blocks(attack(s0, ap, [{ attacker: b, defender: opp }]));
    s = settle(passUntil(s, "combatDamage", ap));
    expect(s.players[opp]!.life).toBe(life - 4);
    expect(s.objects[b]!.zone).toBe("battlefield");
    s = settle(passUntil(s, "main2", ap));
    expect(s.objects[b]!.zone).toBe("graveyard");

    // Blocking.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const theirs = putOnBattlefield(s1, opp1, blazer);
    const att = putOnBattlefield(s1, ap1, bear({ name: "Pacifist Bear", power: "0", toughness: "3" }));
    s = blocks(attack(s1, ap1, [{ attacker: att, defender: opp1 }]), [{ blocker: theirs, attacker: att }]);
    s = settle(passUntil(s, "combatDamage", ap1));
    expect(s.objects[att]!.zone).toBe("graveyard"); // 4 damage to a 0/3
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    s = settle(passUntil(s, "main2", ap1));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("basilisk: the creature it blocks survives damage and is destroyed at end of combat; not a Wall", () => {
    supported(basilisk);
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const wall = putOnBattlefield(s0, ap, card("Wall Test", "Creature — Wall", "{1}", { power: "1", toughness: "5", oracleText: "" }));
    const bas = putOnBattlefield(s0, opp, basilisk);
    let s = blocks(attack(s0, ap, [{ attacker: b, defender: opp }]), [{ blocker: bas, attacker: b }]);
    s = settle(passUntil(s, "combatDamage", ap));
    expect(s.objects[b]!.zone).toBe("battlefield"); // 1 damage to a 2/2
    s = settle(passUntil(s, "main2", ap));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[bas]!.zone).toBe("battlefield");
    // Next time, a Wall attacks into it (with defender it couldn't, so pretend it's not a defender).
    s = passUntil(s, "main1", ap, 4000);
    s = blocks(attack(s, ap, [{ attacker: wall, defender: opp }]), [{ blocker: bas, attacker: wall }]);
    s = settle(passUntil(s, "main2", ap));
    expect(s.objects[wall]!.zone).toBe("battlefield");
  });

  it("'remove a +1/+1 counter from it at end of combat' (Clockwork Beetle)", () => {
    supported(beetle);
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, beetle);
    s0.objects[b]!.counters["+1/+1"] = 3;
    let s = blocks(attack(s0, ap, [{ attacker: b, defender: opp }]));
    s = settle(passUntil(s, "combatDamage", ap));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(3);
    s = settle(passUntil(s, "main2", ap));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
  });

  it("'defending player' in an attack trigger is the player it attacked", () => {
    const k = card("Defender Drain Test", "Creature — Horror", "{2}{B}", { power: "1", toughness: "1", oracleText: "Whenever this creature attacks, defending player loses 2 life." });
    supported(k);
    const { s: s0, ap, opp } = setup([]);
    const third = nextTurnOf(s0, opp);
    const a = putOnBattlefield(s0, ap, k);
    const s = attack(s0, ap, [{ attacker: a, defender: third }]);
    expect(s.players[third]!.life).toBe(40 - 2);
    expect(s.players[opp]!.life).toBe(40);
  });
});

describe("myriad", () => {
  const viper = card("Myriad Test", "Creature — Snake", "{3}{B}", { power: "3", toughness: "2", oracleText: "Deathtouch\nMyriad", keywords: ["Deathtouch", "Myriad"] });

  it("copies attack each other opponent, chosen one at a time; they're exiled at end of combat", () => {
    supported(viper);
    const { s: s0, ap, opp } = setup([]);
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    const v = putOnBattlefield(s0, ap, viper);
    let s = attack(s0, ap, [{ attacker: v, defender: opp }]);
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    const toks = named(s, "Myriad Test").filter((x) => s.objects[x]!.isToken);
    expect(toks).toHaveLength(1);
    const t = s.objects[toks[0]!]!;
    expect(t.tapped).toBe(true);
    expect(others).toContain(t.attacking);
    const target = t.attacking!;
    s = settle(passUntil(blocks(s), "combatDamage", ap));
    expect(s.players[target]!.life).toBe(40 - 3);
    expect(s.players[opp]!.life).toBe(40 - 3);
    s = settle(passUntil(s, "main2", ap));
    expect(named(s, "Myriad Test").filter((x) => s.objects[x]?.isToken)).toHaveLength(0);
    expect(s.objects[v]!.zone).toBe("battlefield");
  });

  it("with only the defending player as an opponent, no tokens (myriad rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    for (const p of s0.turnOrder) if (p !== ap && p !== opp) s0.players[p]!.lost = true;
    const v = putOnBattlefield(s0, ap, viper);
    const s = attack(s0, ap, [{ attacker: v, defender: opp }]);
    expect(s.pending).toBeFalsy();
    expect(named(s, "Myriad Test")).toHaveLength(1);
  });
});
