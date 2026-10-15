// Provoke (CR 702.39), firebending (CR 702.189) and the Phantom creatures' damage prevention.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { blockRequirementProblem, botActions, isFullySupported, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
type Answer = (s: GameState) => Action | null;
const bot: Answer = (s) => botActions(s, waitingOn(s)!)[0]!;

/** Attack, then answer everything with `answer` (falling back on the bot), stopping at `until` or the end of combat. */
function attack(s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], answer: Answer = bot, until?: (s: GameState) => boolean) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  return play(s, answer, until);
}
/** Keep playing, answering with `answer`, until `until` or the end of combat. */
function play(s: GameState, answer: Answer = bot, until?: (s: GameState) => boolean) {
  for (let i = 0; i < 200 && !(s.step === "endCombat" && !s.pending && !s.stack.length); i++) {
    if (until?.(s)) return s;
    const pend = s.pending;
    if (pend) s = act(s, answer(s) ?? bot(s)!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}
const noBlocks: Answer = (s) => (s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : null);

// Real oracle text (Scryfall).
const goblinGrappler = card("Goblin Grappler", "Creature — Goblin", "{R}", { power: "1", toughness: "1", keywords: ["Provoke"], oracleText: "Provoke (Whenever this creature attacks, you may have target creature defending player controls untap and block it if able.)" });
const brontotherium = card("Brontotherium", "Creature — Beast", "{4}{G}{G}", { power: "5", toughness: "3", keywords: ["Trample", "Provoke"], oracleText: "Trample\nProvoke (Whenever this creature attacks, you may have target creature defending player controls untap and block it if able.)" });
const krosanVorine = card("Krosan Vorine", "Creature — Cat Beast", "{3}{G}", { power: "3", toughness: "2", keywords: ["Provoke"], oracleText: "Provoke (Whenever this creature attacks, you may have target creature defending player controls untap and block it if able.)\nThis creature can't be blocked by more than one creature." });
const flyer = card("Wind Drake", "Creature — Drake", "{2}{U}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });

const fireSages = card("Fire Sages", "Creature — Human Cleric", "{1}{R}", { power: "2", toughness: "2", keywords: ["Firebending"], oracleText: "Firebending 1 (Whenever this creature attacks, add {R}. This mana lasts until end of combat.)\n{1}{R}{R}: Put a +1/+1 counter on this creature." });
const zuko = card("Zuko, Exiled Prince", "Legendary Creature — Human Noble", "{3}{R}", { power: "4", toughness: "3", keywords: ["Firebending"], oracleText: "Firebending 3 (Whenever this creature attacks, add {R}{R}{R}. This mana lasts until end of combat.)\n{3}: Exile the top card of your library. You may play that card this turn." });
const studentOfFire = card("Firebending Student", "Creature — Human Monk", "{1}{R}", { power: "1", toughness: "2", keywords: ["Prowess", "Firebending"], oracleText: "Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nFirebending X, where X is this creature's power. (Whenever this creature attacks, add X {R}. This mana lasts until end of combat.)" });
const sunWarriors = card("Sun Warriors", "Creature — Human Warrior Ally", "{2}{R}{W}", { power: "3", toughness: "5", keywords: ["Firebending"], oracleText: "Firebending X, where X is the number of creatures you control. (Whenever this creature attacks, add X {R}. This mana lasts until end of combat.)\n{5}: Create a 1/1 white Ally creature token." });

const phantomCentaur = card("Phantom Centaur", "Creature — Centaur Spirit", "{2}{G}{G}", { power: "2", toughness: "0", keywords: ["Protection"], oracleText: "Protection from black\nThis creature enters with three +1/+1 counters on it.\nIf damage would be dealt to this creature, prevent that damage. Remove a +1/+1 counter from this creature." });
const phantomNomad = card("Phantom Nomad", "Creature — Spirit Nomad", "{1}{W}", { power: "0", toughness: "0", oracleText: "This creature enters with two +1/+1 counters on it.\nIf damage would be dealt to this creature, prevent that damage. Remove a +1/+1 counter from this creature." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

describe("provoke", () => {
  it("untaps the target, which must then block the provoker if able (CR 702.39a)", () => {
    supported(goblinGrappler, brontotherium, krosanVorine);
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, goblinGrappler);
    const big = putOnBattlefield(s0, opp, bear({ name: "Big Bear", power: "4", toughness: "4" }));
    const other = putOnBattlefield(s0, opp, bear());
    s0.objects[big]!.tapped = true;
    const answer: Answer = (s) => {
      const p = s.pending;
      if (p?.kind === "chooseTargets") return { type: "chooseTargets", player: p.player, targets: [{ kind: "object", id: big }] };
      if (p?.kind === "chooseMay") return { type: "chooseMay", player: p.player, yes: true };
      return null;
    };
    const s = attack(s0, ap, [{ attacker: g, defender: opp }], answer, (x) => x.pending?.kind === "declareBlockers");
    expect(s.pending?.kind).toBe("declareBlockers");
    expect(s.objects[big]!.tapped).toBe(false);
    // Blocking with the other creature only, or not at all, breaks the requirement.
    expect(blockRequirementProblem(s, opp, [])).toMatch(/must block Goblin Grappler/);
    expect(blockRequirementProblem(s, opp, [{ blocker: other, attacker: g }])).toMatch(/must block/);
    expect(blockRequirementProblem(s, opp, [{ blocker: big, attacker: g }])).toBeNull();
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow();
    // The bot obeys it.
    const b = botActions(s, opp)[0]!;
    expect(b.type === "declareBlockers" && b.blocks.some((x) => x.blocker === big && x.attacker === g)).toBe(true);
  });

  it("a creature that can't block it (flying) isn't required to; the requirement ends with combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const drake = putOnBattlefield(s0, ap, { ...goblinGrappler, oracleText: "Flying\n" + goblinGrappler.oracleText, keywords: ["Flying", "Provoke"], oracleId: "grappler-flying" });
    const bearId = putOnBattlefield(s0, opp, bear());
    const answer: Answer = (s) => {
      const p = s.pending;
      if (p?.kind === "chooseTargets") return { type: "chooseTargets", player: p.player, targets: [{ kind: "object", id: bearId }] };
      if (p?.kind === "chooseMay") return { type: "chooseMay", player: p.player, yes: true };
      return null;
    };
    let s = attack(s0, ap, [{ attacker: drake, defender: opp }], answer, (x) => x.pending?.kind === "declareBlockers");
    expect(blockRequirementProblem(s, opp, [])).toBeNull();
    s = play(s, noBlocks);
    s = passUntil(s, "main2", ap);
    expect(s.objects[bearId]!.provokedBy).toBeUndefined();
  });

  it("declining the may does nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, goblinGrappler);
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[b]!.tapped = true;
    const answer: Answer = (s) => {
      const p = s.pending;
      if (p?.kind === "chooseTargets") return { type: "chooseTargets", player: p.player, targets: [{ kind: "object", id: b }] };
      if (p?.kind === "chooseMay") return { type: "chooseMay", player: p.player, yes: false };
      return null;
    };
    const s = attack(s0, ap, [{ attacker: g, defender: opp }], answer, (x) => x.pending?.kind === "declareBlockers");
    expect(s.objects[b]!.tapped).toBe(true);
    expect(blockRequirementProblem(s, opp, [])).toBeNull();
  });

  it("the target must be a creature the defending player controls", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, goblinGrappler);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const elsewhere = putOnBattlefield(s0, third, bear());
    putOnBattlefield(s0, opp, flyer);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] });
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: elsewhere }] })).toThrow();
  });
});

describe("firebending", () => {
  it("adds red mana that lasts through combat's steps and empties as combat ends (CR 702.189a)", () => {
    supported(fireSages, zuko, studentOfFire, sunWarriors);
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, zuko);
    let s = attack(s0, ap, [{ attacker: r, defender: opp }], noBlocks, (x) => x.step === "declareBlockers" && !x.pending);
    expect(s.players[ap]!.manaPool.R).toBe(3);
    s = play(s, noBlocks, (x) => x.step === "endCombat");
    expect(s.players[ap]!.manaPool.R).toBe(3);
    s = passUntil(s, "main2", ap);
    expect(s.players[ap]!.manaPool.R).toBe(0);
  });

  it("only firebending's mana is kept: other red mana still empties between steps", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, fireSages);
    let s = attack(s0, ap, [{ attacker: f, defender: opp }], noBlocks, (x) => x.step === "declareAttackers" && !x.pending && !x.stack.length && x.players[ap]!.manaPool.R === 1);
    const mountain = s.battlefield.find((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === "Mountain")!;
    s = act(s, { type: "activateMana", player: ap, objectId: mountain, mana: "R" });
    expect(s.players[ap]!.manaPool.R).toBe(2);
    s = play(s, noBlocks, (x) => x.step === "declareBlockers");
    expect(s.players[ap]!.manaPool.R).toBe(1);
  });

  it("firebending X counts as the ability resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, sunWarriors);
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, bear());
    const s = attack(s0, ap, [{ attacker: w, defender: opp }], noBlocks, (x) => x.step === "declareBlockers" && !x.pending);
    expect(s.players[ap]!.manaPool.R).toBe(3);
  });
});

describe("Phantom creatures", () => {
  it("prevent all damage dealt to them and remove a +1/+1 counter each time", () => {
    supported(phantomCentaur, phantomNomad);
    const { s: s0, ap, ids, opp } = setup([shock, shock]);
    const p = putOnBattlefield(s0, opp, phantomNomad);
    s0.objects[p]!.counters["+1/+1"] = 2;
    let s = s0;
    for (const id of ids) s = cast(s, ap, id, [{ kind: "object", id: p }]);
    // Two Shocks: no damage, two counters gone, and it dies as a 0/0.
    expect(s.objects[p]!.zone).toBe("graveyard");
    expect(s.log.filter((e) => /prevented/.test(e.text)).length).toBe(2);
  });

  it("damage from several blockers at once removes only one counter (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, phantomCentaur);
    s0.objects[p]!.counters["+1/+1"] = 3;
    const b1 = putOnBattlefield(s0, opp, bear());
    const b2 = putOnBattlefield(s0, opp, bear());
    const blocks: Answer = (s) => (s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: s.pending.player === opp ? [{ blocker: b1, attacker: p }, { blocker: b2, attacker: p }] : [] } : null);
    const s = attack(s0, ap, [{ attacker: p, defender: opp }], blocks);
    expect(s.objects[p]!.zone).toBe("battlefield");
    expect(s.objects[p]!.damage).toBe(0);
    expect(s.objects[p]!.counters["+1/+1"]).toBe(2);
  });
});
