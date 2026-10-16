// More "if {C} was spent to cast this spell" cards (CR 601.2h): Mythos of Nethroi's "if it's a creature or if {G}{W} was
// spent" (decided as it resolves, rulings), Vigor Mortis's "that creature enters with an additional +1/+1 counter"
// (CR 614.1c), Boros Fury-Shield's damage equal to the creature's power, Induce Paranoia's "mills X cards, where X is
// the spell's mana value". And "that spell's controller" after countering it (Ionize: damage even if it's countered).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Cast it paying with new basic lands of these names, not autopay. */
function castWith(s: GameState, pid: PlayerId, id: string, lands: string[], targets?: TargetChoice[]): GameState {
  for (const l of lands) {
    const land = putOnBattlefield(s, pid, card(l, `Basic Land — ${l}`));
    const mana = ({ Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" } as const)[l as "Plains"];
    s = act(s, { type: "activateMana", player: pid, objectId: land, mana });
  }
  return act(s, { type: "castSpell", player: pid, objectId: id, targets });
}
/** Move a permanent the helpers made into its owner's graveyard. */
function toGraveyard(s: GameState, id: string) {
  const o = s.objects[id]!;
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  o.zone = "graveyard";
  s.players[o.owner]!.graveyard.push(id);
}

// Real oracle text (Scryfall).
const mythos = card("Mythos of Nethroi", "Instant", "{2}{B}", { oracleText: "Destroy target nonland permanent if it's a creature or if {G}{W} was spent to cast this spell." });
const vigor = card("Vigor Mortis", "Sorcery", "{2}{B}{B}", { oracleText: "Return target creature card from your graveyard to the battlefield. If {G} was spent to cast this spell, that creature enters with an additional +1/+1 counter on it." });
const furyShield = card("Boros Fury-Shield", "Instant", "{2}{W}", { oracleText: "Prevent all combat damage that would be dealt by target attacking or blocking creature this turn. If {R} was spent to cast this spell, Boros Fury-Shield deals damage to that creature's controller equal to the creature's power." });
const paranoia = card("Induce Paranoia", "Instant", "{2}{U}{U}", { oracleText: "Counter target spell. If {B} was spent to cast this spell, that spell's controller mills X cards, where X is the spell's mana value." });
const ionize = card("Ionize", "Instant", "{1}{U}{R}", { oracleText: "Counter target spell. Ionize deals 2 damage to that spell's controller." });
const mindswipe = card("Mindswipe", "Instant", "{X}{U}{R}", { oracleText: "Counter target spell unless its controller pays {X}. Mindswipe deals X damage to that spell's controller." });
const ambitions = card("Broken Ambitions", "Instant", "{X}{U}", { oracleText: "Counter target spell unless its controller pays {X}. Clash with an opponent. If you win, that spell's controller mills four cards. (Each clashing player reveals the top card of their library, then puts that card on their choice of the top or bottom. A player wins if their card had a greater mana value.)" });
const rock = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}." });

describe("Mythos of Nethroi", () => {
  it("compiles them", () => supported(mythos, vigor, furyShield, paranoia, ionize, mindswipe, ambitions));

  it("without {G}{W}: a creature is destroyed, a noncreature permanent isn't", () => {
    let { s, ap, opp, ids } = setup([mythos, mythos]);
    const b = putOnBattlefield(s, opp, bear());
    const r = putOnBattlefield(s, opp, rock);
    s = settle(castWith(s, ap, ids[0]!, ["Swamp", "Swamp", "Swamp"], [target(b)]));
    s = settle(castWith(s, ap, ids[1]!, ["Swamp", "Swamp", "Swamp"], [target(r)]));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[r]!.zone).toBe("battlefield");
  });

  it("with {G}{W}: any nonland permanent", () => {
    let { s, ap, opp, ids } = setup([mythos]);
    const r = putOnBattlefield(s, opp, rock);
    s = settle(castWith(s, ap, ids[0]!, ["Swamp", "Forest", "Plains"], [target(r)]));
    expect(s.objects[r]!.zone).toBe("graveyard");
  });

  it("autopay spends {G} and {W} on it when it can", () => {
    const { s: s0, ap, opp, ids } = setup([mythos]);
    const r = putOnBattlefield(s0, opp, rock);
    const plan = planCast(s0, ap, ids[0]!, [target(r)])!;
    const s = settle(cast(s0, ap, ids[0]!, [target(r)]));
    expect(plan.length).toBeGreaterThan(0);
    expect(s.objects[r]!.zone).toBe("graveyard");
  });
});

describe("Vigor Mortis", () => {
  it("with {G}: the creature enters with a +1/+1 counter; without, it doesn't", () => {
    let { s, ap, ids } = setup([vigor, vigor]);
    const a = putOnBattlefield(s, ap, bear());
    const b = putOnBattlefield(s, ap, bear());
    toGraveyard(s, a);
    toGraveyard(s, b);
    s = settle(castWith(s, ap, ids[0]!, ["Swamp", "Swamp", "Forest", "Swamp"], [target(a)]));
    s = settle(castWith(s, ap, ids[1]!, ["Swamp", "Swamp", "Swamp", "Swamp"], [target(b)]));
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Boros Fury-Shield", () => {
  /** `opp` attacks `ap` with a 3/3; then `ap` has priority in the declare attackers step. */
  function attacked() {
    const { s: s0, ap, opp, ids } = setup([furyShield]);
    const att = putOnBattlefield(s0, opp, bear({ power: "3", toughness: "3" }));
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: att, defender: ap }] });
    for (let i = 0; i < 8 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, opp, att, id: ids[0]! };
  }

  it("with {R}: no combat damage from it, and it deals damage equal to the creature's power to its controller", () => {
    let { s, ap, opp, att, id } = attacked();
    const [apLife, oppLife] = [s.players[ap]!.life, s.players[opp]!.life];
    s = settle(castWith(s, ap, id, ["Plains", "Mountain", "Plains"], [target(att)]));
    expect(s.players[opp]!.life).toBe(oppLife - 3);
    s = passUntil(s, "endCombat", opp);
    expect(s.players[ap]!.life).toBe(apLife);
  });

  it("without {R}: only the prevention", () => {
    let { s, ap, opp, att, id } = attacked();
    const [apLife, oppLife] = [s.players[ap]!.life, s.players[opp]!.life];
    s = settle(castWith(s, ap, id, ["Plains", "Plains", "Plains"], [target(att)]));
    s = passUntil(s, "endCombat", opp);
    expect(s.players[opp]!.life).toBe(oppLife);
    expect(s.players[ap]!.life).toBe(apLife);
  });
});

describe("that spell's controller", () => {
  it("Induce Paranoia with {B}: the countered spell's controller mills its mana value", () => {
    const { s: s0, ap, opp, ids } = setup([paranoia]);
    // The opponent's spell on the stack: a 2-mana bear they cast.
    let s = passUntil(s0, "main1", opp);
    const theirs = putOnBattlefield(s, opp, bear());
    s.battlefield.splice(s.battlefield.indexOf(theirs), 1);
    s.objects[theirs]!.zone = "hand";
    s.players[opp]!.hand.push(theirs);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    for (const a of planCast(s, opp, theirs)!) s = act(s, a);
    for (let i = 0; i < 8 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const lib = s.players[opp]!.library.length;
    s = settle(castWith(s, ap, ids[0]!, ["Island", "Island", "Swamp", "Island"], [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }]));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.players[opp]!.library.length).toBe(lib - 2);
  });

  it("Ionize: counters your own spell and deals 2 damage to you, its controller", () => {
    const { s: s0, ap, ids } = setup([bear(), ionize]);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    const life = s.players[ap]!.life;
    s = settle(castWith(s, ap, ids[1]!, ["Island", "Mountain", "Island"], [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }]));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life - 2);
  });
});
