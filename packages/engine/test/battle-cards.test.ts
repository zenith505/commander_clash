// Cards about battles (CR 310): damage to "target player or battle" and "another target battle or opponent", "a
// noncreature source ... would deal damage to a creature, battle, or opponent", "whenever ~ attacks a battle", Portent
// Tracker's defense counters (310.9e); and doubling a creature's power (CR 701.10b-c).

import { describe, expect, it } from "vitest";
import { act, activate, addEffect, bear, card, cast, passUntil, pt, putOnBattlefield, scry, setup, target } from "./helpers";
import { compileCard, isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

const SIEGE = "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\n";
const regatha = scry("transform", [
  { name: "Invasion of Regatha", mana_cost: "{2}{R}", type_line: "Battle — Siege", defense: "5", oracle_text: `${SIEGE}When this Siege enters, it deals 4 damage to another target battle or opponent and 1 damage to up to one target creature.` },
  {
    name: "Disciples of the Inferno",
    type_line: "Creature — Human Monk",
    color_indicator: ["R"],
    power: "4",
    toughness: "4",
    oracle_text: "Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nIf a noncreature source you control would deal damage to a creature, battle, or opponent, it deals that much damage plus 2 instead.",
  },
], { keywords: ["Prowess", "Transform"] });
const belenon = scry("transform", [
  { name: "Invasion of Belenon", mana_cost: "{2}{W}", type_line: "Battle — Siege", defense: "5", oracle_text: `${SIEGE}When this Siege enters, create a 2/2 white and blue Knight creature token with vigilance.` },
  { name: "Belenon War Anthem", type_line: "Enchantment", color_indicator: ["W"], oracle_text: "Creatures you control get +1/+1." },
]);
const javelineer = card("Onakke Javelineer", "Creature — Ogre Spirit", "{4}{R}", { power: "5", toughness: "4", keywords: ["Reach"], oracleText: "Reach\n{T}: This creature deals 2 damage to target player or battle." });
const frontliner = card("Thrashing Frontliner", "Creature — Phyrexian Lizard", "{1}{R}", { power: "2", toughness: "2", keywords: ["Trample"], oracleText: "Trample\nWhenever this creature attacks a battle, it gets +1/+1 until end of turn." });
const slasher = card("War-Trained Slasher", "Creature — Wolverine Dinosaur", "{3}{R}", {
  power: "4",
  toughness: "3",
  keywords: ["Menace", "Double"],
  oracleText: "Menace (This creature can't be blocked except by two or more creatures.)\nWhenever this creature attacks a battle, double its power until end of turn.",
});
const bulkUp = card("Bulk Up", "Instant", "{1}{R}", { keywords: ["Flashback", "Double"], oracleText: "Double target creature's power until end of turn.\nFlashback {4}{R}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const tracker = card("Portent Tracker", "Creature — Satyr Scout", "{1}{G}", {
  power: "1",
  toughness: "1",
  oracleText: "{T}: Untap target land.\n{T}: Choose target battle. If an opponent protects it, remove a defense counter from it. Otherwise, put a defense counter on it. Activate only as a sorcery.",
});
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** A battle on the battlefield, as it would have entered: its defense counters and protector. */
const battleFor = (s: GameState, pid: PlayerId, protector: PlayerId, defense = 5) => {
  const id = putOnBattlefield(s, pid, belenon);
  s.objects[id]!.counters.defense = defense;
  s.objects[id]!.protector = protector;
  return id;
};

describe("cards about battles", () => {
  it("compiles them", () => {
    for (const d of [regatha, javelineer, frontliner, slasher, bulkUp, tracker]) expect(isFullySupported(d), d.name).toBe(true);
    expect(compileCard(frontliner).triggers[0]!.attacksBattle).toBe(true);
  });

  it("Onakke Javelineer: 2 damage to target player or battle, not a creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const j = putOnBattlefield(s0, ap, javelineer);
    const b = battleFor(s0, ap, opp);
    const other = putOnBattlefield(s0, opp, bear());
    expect(() => activate(s0, ap, j, 0, [target(other)])).toThrow();
    const s = activate(structuredClone(s0), ap, j, 0, [target(b)]);
    expect(s.objects[b]!.counters.defense).toBe(3);
  });

  it("Invasion of Regatha: 4 damage to another battle or an opponent; Disciples of the Inferno adds 2 to noncreature damage to a battle", () => {
    const { s: s0, ap, ids, opp } = setup([regatha, shock]);
    const b = battleFor(s0, opp, ap); // an opponent's Siege, which we protect
    let s = cast(s0, ap, ids[0]!);
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // Not itself ("another target", CR 115.4), nor a creature or us.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(ids[0]!), { kind: "none" }] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: ap }, { kind: "none" }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b), { kind: "none" }] }));
    expect(s.objects[b]!.counters.defense).toBe(1);
    expect(s.objects[ids[0]!]!.counters.defense).toBe(5);
    // Shock our own Siege with Disciples of the Inferno out: 2 + 2 damage.
    putOnBattlefield(s, ap, card("Disciples of the Inferno", "Creature — Human Monk", "", { power: "4", toughness: "4", oracleText: regatha.faces![1]!.oracleText }));
    s = settle(cast(s, ap, ids[1]!, [target(ids[0]!)]));
    expect(s.objects[ids[0]!]!.counters.defense).toBe(1);
  });

  it("Thrashing Frontliner and War-Trained Slasher: their triggers when attacking a battle, not a player", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, frontliner);
    const w = putOnBattlefield(s0, ap, slasher);
    const b = battleFor(s0, ap, opp, 20);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: f, defender: opp, planeswalker: b }, { attacker: w, defender: opp }] });
    s = settle(s);
    expect(pt(s, f)).toBe("3/3");
    expect(pt(s, w)).toBe("4/3");
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const w2 = putOnBattlefield(t0, ap2, slasher);
    const b2 = battleFor(t0, ap2, opp2, 20);
    let t = passUntil(t0, "declareAttackers", ap2);
    t = settle(act(t, { type: "declareAttackers", player: ap2, attacks: [{ attacker: w2, defender: opp2, planeswalker: b2 }] }));
    expect(pt(t, w2)).toBe("8/3");
  });

  it("Bulk Up doubles power as it resolves (CR 701.10b), a negative power too (701.10c)", () => {
    const { s: s0, ap, ids } = setup([bulkUp, bulkUp]);
    const x = putOnBattlefield(s0, ap, bear({ power: "3", toughness: "5" }));
    let s = cast(s0, ap, ids[0]!, [target(x)]);
    expect(pt(s, x)).toBe("6/5");
    addEffect(s, ap, [x], [{ kind: "modifyPT", power: -8, toughness: 0 }]);
    expect(pt(s, x)).toBe("-2/5");
    s = cast(s, ap, ids[1]!, [target(x)]);
    expect(pt(s, x)).toBe("-4/5");
  });

  it("Two-Handed Axe: the equipped creature's power doubles as it attacks", () => {
    const { s: s0, ap, opp } = setup([]);
    const axe = putOnBattlefield(s0, ap, scry("adventure", [
      { name: "Two-Handed Axe", mana_cost: "{2}{R}", type_line: "Artifact — Equipment", oracle_text: "Whenever equipped creature attacks, double its power until end of turn.\nEquip {1}{R}" },
      { name: "Sweeping Cleave", mana_cost: "{1}{R}", type_line: "Instant — Adventure", oracle_text: "Target creature you control gains double strike until end of turn. (Then exile this card. You may cast the artifact later from exile.)" },
    ]));
    const x = putOnBattlefield(s0, ap, bear({ power: "3", toughness: "3" }));
    s0.objects[axe]!.attachedTo = x;
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: x, defender: opp }] }));
    expect(pt(s, x)).toBe("6/3");
  });

  it("Portent Tracker: a defense counter off a battle an opponent protects, or onto one we protect", () => {
    const { s: s0, ap, opp } = setup([]);
    const t1 = putOnBattlefield(s0, ap, tracker);
    const t2 = putOnBattlefield(s0, ap, tracker);
    const mine = battleFor(s0, ap, opp, 1);
    const theirs = battleFor(s0, opp, ap, 3);
    let s = activate(s0, ap, t1, 1, [target(theirs)]);
    expect(s.objects[theirs]!.counters.defense).toBe(4);
    s = settle(activate(s, ap, t2, 1, [target(mine)]));
    // Its last defense counter: our Siege is defeated and may be cast transformed (CR 310.12b).
    expect(s.objects[mine]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "castFree", how: "transformed" });
  });
});
