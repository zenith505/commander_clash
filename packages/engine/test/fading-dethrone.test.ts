// Afflict (CR 702.130), dethrone (702.105), training (702.149), fading (702.32), vanishing (702.63).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const creature = (name: string, text: string, p = "2", t = "2") => card(name, "Creature — Warrior", "{1}", { power: p, toughness: t, oracleText: text });
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));
const toBlocks = (s: GameState) => {
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** From the active player's main phase to the start of their next turn's upkeep, with its triggers resolved. */
const nextUpkeep = (s: GameState, ap: PlayerId) => settle(passUntil(passUntil(s, "end", ap), "upkeep", ap));

describe("combat keywords", () => {
  it("afflict: defending player loses life when it becomes blocked", () => {
    const k = creature("Afflict Test", "Afflict 2");
    supported(k);
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, k);
    const blocker = putOnBattlefield(s0, opp, bear());
    const life = s0.players[opp]!.life;
    let s = toBlocks(attack(s0, ap, [{ attacker: a, defender: opp }]));
    s = settle(act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: a }] }));
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("dethrone: a counter only when attacking the player with the most life (ties count)", () => {
    const k = creature("Dethrone Test", "Dethrone");
    supported(k);
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, k);
    const b = putOnBattlefield(s0, ap, creature("Dethrone Test 2", "Dethrone"));
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    s0.players[opp]!.life = 50;
    const s = attack(s0, ap, [{ attacker: a, defender: opp }, { attacker: b, defender: third }]);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("training: a counter when a creature with greater power attacks with it", () => {
    const k = creature("Training Test", "Training", "1", "1");
    supported(k);
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, k);
    const big = putOnBattlefield(s0, ap, bear());
    let s = attack(s0, ap, [{ attacker: a, defender: opp }, { attacker: big, defender: opp }]);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const alone = putOnBattlefield(s1, ap1, k);
    s = attack(s1, ap1, [{ attacker: alone, defender: opp1 }]);
    expect(s.objects[alone]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("fading and vanishing", () => {
  it("fading: loses a fade counter each upkeep, sacrificed when it can't", () => {
    const k = creature("Fading Test", "Fading 1");
    supported(k);
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, k);
    s0.objects[id]!.counters = { fade: 1 }; // as it would have entered
    let s = nextUpkeep(s0, ap);
    expect(s.objects[id]!.zone).toBe("battlefield");
    expect(s.objects[id]!.counters.fade).toBe(0);
    s = nextUpkeep(s, ap);
    expect(s.objects[id]!.zone).toBe("graveyard");
  });

  it("vanishing: the last time counter's removal triggers the sacrifice", () => {
    const k = creature("Vanishing Test", "Vanishing 2");
    supported(k);
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, k);
    s0.objects[id]!.counters = { time: 2 };
    let s = nextUpkeep(s0, ap);
    expect(s.objects[id]!.counters.time).toBe(1);
    s = nextUpkeep(s, ap);
    expect(s.objects[id]!.zone).toBe("graveyard");
  });

  it("enters with its fade or time counters", () => {
    const k = card("Vanish Spell Test", "Creature — Spirit", "{1}", { power: "2", toughness: "2", oracleText: "Vanishing 3" });
    const { s, ap, ids } = setup([k]);
    const t = settle(planCast(s, ap, ids[0]!)!.reduce((x, a) => act(x, a), s));
    expect(t.objects[ids[0]!]!.counters.time).toBe(3);
  });
});

describe("delayed draw and ward—pay life", () => {
  it("draws at the beginning of the next turn's upkeep, whoever's turn it is", () => {
    const k = card("Pigeon Test", "Sorcery", "{1}", { oracleText: "Draw a card at the beginning of the next turn's upkeep." });
    supported(k);
    const { s, ap, ids } = setup([k]);
    let t = settle(planCast(s, ap, ids[0]!)!.reduce((x, a) => act(x, a), s));
    const lib = t.players[ap]!.library.length;
    const next = t.turnOrder[(t.turnOrder.indexOf(ap) + 1) % 4]!;
    t = passUntil(t, "upkeep", next);
    t = settle(t);
    expect(t.players[ap]!.library.length).toBe(lib - 1);
    expect(t.delayed ?? []).toHaveLength(0);
  });

  it("ward—pay life asks the opponent for life, not mana", () => {
    const k = creature("Warded Test", "Ward—Pay 3 life");
    supported(k);
    const kill = card("Kill Test", "Instant", "{1}", { oracleText: "Destroy target creature." });
    const { s, ap, opp, ids } = setup([kill]);
    const w = putOnBattlefield(s, opp, k);
    const t = settle(planCast(s, ap, ids[0]!, [{ kind: "object", id: w }])!.reduce((x, a) => act(x, a), s));
    expect(t.pending).toMatchObject({ kind: "payUnless", player: ap, life: 3 });
  });
});

describe("each upkeep, draw step, upkeep costs", () => {
  it("'at the beginning of each player's upkeep, that player ...' is the active player", () => {
    const k = card("Tax Test", "Artifact", "{1}", { oracleText: "At the beginning of each player's upkeep, this artifact deals 1 damage to that player." });
    supported(k);
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, k);
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const life = { me: s.players[ap]!.life, them: s.players[next]!.life };
    const t = settle(passUntil(s, "upkeep", next));
    expect(t.players[next]!.life).toBe(life.them - 1);
    expect(t.players[ap]!.life).toBe(life.me);
  });

  it("'that player draws an additional card' at their draw step", () => {
    const k = card("Mine Test", "Artifact", "{1}", { oracleText: "At the beginning of each player's draw step, that player draws an additional card." });
    supported(k);
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, k);
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const lib = s.players[next]!.library.length;
    const t = settle(passUntil(s, "draw", next));
    expect(t.players[next]!.library.length).toBe(lib - 2);
  });

  it("'sacrifice ~ unless you pay {U}': declining sacrifices it", () => {
    const k = creature("Upkeep Test", "At the beginning of your upkeep, sacrifice this creature unless you pay {U}.");
    supported(k);
    const { s, ap } = setup([]);
    const id = putOnBattlefield(s, ap, k);
    let t = passUntil(passUntil(s, "end", ap), "upkeep", ap);
    for (let i = 0; i < 20 && t.pending?.kind !== "chooseMay"; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    expect(t.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{U}" } });
    t = settle(act(t, { type: "chooseMay", player: ap, yes: false }));
    expect(t.objects[id]!.zone).toBe("graveyard");
  });

  it("artifact creature lords and 'deals damage to itself equal to its power'", () => {
    const lord = creature("Etherium Test", "Other artifact creatures you control get +1/+1.");
    const struggle = card("Struggle Test", "Instant", "{1}", { oracleText: "Target creature deals damage to itself equal to its power." });
    supported(lord, struggle);
    const { s, ap, opp, ids } = setup([struggle]);
    putOnBattlefield(s, ap, lord);
    const art = putOnBattlefield(s, ap, card("Golem Test", "Artifact Creature — Golem", "{1}", { power: "1", toughness: "1" }));
    const plain = putOnBattlefield(s, ap, bear());
    const big = putOnBattlefield(s, opp, bear({ name: "Big Bear", power: "3", toughness: "3" }));
    expect(pt(s, art)).toBe("2/2");
    expect(pt(s, plain)).toBe("2/2");
    const t = settle(planCast(s, ap, ids[0]!, [{ kind: "object", id: big }])!.reduce((x, a) => act(x, a), s));
    expect(t.objects[big]!.zone).toBe("graveyard");
    expect(t.objects[plain]!.zone).toBe("battlefield");
  });
});

describe("mana abilities while casting (CR 601.2g)", () => {
  it("a death trigger from sacrificing for mana waits until the sorcery is cast", () => {
    const scion = card("Scion Test", "Creature — Eldrazi Scion", "", { power: "1", toughness: "1", oracleText: "Sacrifice this creature: Add {C}." });
    const harvester = creature("Harvester Test", "Whenever a creature dies, you gain 2 life.");
    const sorcery = card("Big Sorcery Test", "Sorcery", "{15}", { oracleText: "You gain 1 life." });
    const { s, ap, ids } = setup([sorcery]);
    const sc = putOnBattlefield(s, ap, scion);
    putOnBattlefield(s, ap, harvester);
    let t = act(s, { type: "activateMana", player: ap, objectId: sc, mana: "C" } as never);
    expect(t.stack).toHaveLength(0);
    expect(t.triggerQueue).toHaveLength(1);
    t = planCast(t, ap, ids[0]!)!.reduce((x, a) => act(x, a), t);
    expect(t.stack.map((x) => x.kind)).toEqual(["spell", "ability"]);
  });
});
