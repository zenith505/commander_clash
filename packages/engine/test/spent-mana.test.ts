// What mana was spent to cast a spell (CR 601.2h): "if {U} was spent to cast ~" in a spell or its permanent's enters
// trigger (an intervening if there, CR 603.4), "sacrifice it unless {U} was spent", adamant, opus ("five or more mana was
// spent to cast that spell"), and "no mana was spent" (Nix, Vexing Bauble). A copy has no mana spent on it (CR 707.10).
// Autopay spends the colors a card hopes for where its generic or hybrid mana allows.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, pt, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const herald = card("Azorius Herald", "Creature — Spirit", "{2}{W}", { power: "2", toughness: "1", oracleText: "This creature can't be blocked.\nWhen this creature enters, you gain 4 life.\nWhen this creature enters, sacrifice it unless {U} was spent to cast it." });
const weird = card("Steamcore Weird", "Creature — Weird", "{3}{U}", { power: "1", toughness: "3", oracleText: "When this creature enters, if {R} was spent to cast it, it deals 2 damage to any target." });
const ardenvale = card("Ardenvale Paladin", "Creature — Human Knight", "{3}{W}", { power: "2", toughness: "5", keywords: ["Adamant"], oracleText: "Adamant — If at least three white mana was spent to cast this spell, this creature enters with a +1/+1 counter on it." });
const henge = card("Henge Walker", "Artifact Creature — Golem", "{3}", { power: "2", toughness: "2", keywords: ["Adamant"], oracleText: "Adamant — If at least three mana of the same color was spent to cast this spell, this creature enters with a +1/+1 counter on it." });
const rally = card("Rally for the Throne", "Instant", "{2}{W}", { keywords: ["Adamant"], oracleText: "Create two 1/1 white Human creature tokens.\nAdamant — If at least three white mana was spent to cast this spell, you gain 1 life for each creature you control." });
const virtuoso = card("Deluge Virtuoso", "Creature — Human Wizard", "{2}{U}", { power: "2", toughness: "2", keywords: ["Opus"], oracleText: "When this creature enters, tap target creature an opponent controls and put a stun counter on it. (If a permanent with a stun counter would become untapped, remove one from it instead.)\nOpus — Whenever you cast an instant or sorcery spell, this creature gets +1/+1 until end of turn. If five or more mana was spent to cast that spell, this creature gets +2/+2 until end of turn instead." });
const nix = card("Nix", "Instant", "{U}", { oracleText: "Counter target spell if no mana was spent to cast it." });
const bauble = card("Vexing Bauble", "Artifact", "{1}", { oracleText: "Whenever a player casts a spell, if no mana was spent to cast it, counter that spell.\n{1}, {T}, Sacrifice this artifact: Draw a card." });
const dawnglow = card("Dawnglow Infusion", "Sorcery", "{X}{G/W}", { oracleText: "You gain X life if {G} was spent to cast this spell and X life if {W} was spent to cast this spell. (Do both if {G}{W} was spent.)" });
const firespout = card("Firespout", "Sorcery", "{2}{R/G}", { oracleText: "Firespout deals 3 damage to each creature without flying if {R} was spent to cast this spell and 3 damage to each creature with flying if {G} was spent to cast this spell. (Do both if {R}{G} was spent.)" });
const seedSpark = card("Seed Spark", "Instant", "{3}{W}", { oracleText: "Destroy target artifact or enchantment. If {G} was spent to cast this spell, create two 1/1 green Saproling creature tokens." });
const twincast = card("Twincast", "Instant", "{U}{U}", { oracleText: "Copy target instant or sorcery spell. You may choose new targets for the copy." });
const mindSpring = card("Mind Spring", "Sorcery", "{X}{U}{U}", { oracleText: "Draw X cards." });
const recall = card("Ancestral Recall", "Instant", "{U}", { oracleText: "Target player draws three cards." });
const ornithopter = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });

const name = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const counters = (s: GameState, id: string) => s.objects[id]!.counters["+1/+1"] ?? 0;
/** Lands autopay taps to cast it. */
const tapped = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[], x?: number) =>
  (planCast(s, pid, id, targets, undefined, undefined, x) ?? []).flatMap((a) => (a.type === "activateMana" ? [name(s, a.objectId)] : [])).sort();
/** Cast it paying with new basic lands of these names, not autopay. */
function castWith(s: GameState, pid: PlayerId, id: string, lands: string[], targets?: TargetChoice[]): GameState {
  for (const l of lands) {
    const land = putOnBattlefield(s, pid, card(l, `Basic Land — ${l}`));
    const mana = ({ Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" } as const)[l as "Plains"];
    s = act(s, { type: "activateMana", player: pid, objectId: land, mana });
  }
  return act(s, { type: "castSpell", player: pid, objectId: id, targets });
}
/** Resolve the stack, choosing these targets for triggers that ask. */
function settle(s: GameState, pid: PlayerId, triggerTargets: TargetChoice[] = []): GameState {
  for (let i = 0; i < 20 && (s.stack.length || s.pending); i++)
    s = s.pending?.kind === "chooseTargets" ? act(s, { type: "chooseTargets", player: pid, targets: triggerTargets }) : passAll(s);
  return s;
}

describe("mana spent to cast it", () => {
  it("compiles them", () => supported(herald, weird, ardenvale, henge, rally, virtuoso, nix, bauble, dawnglow, firespout, seedSpark));

  it("Azorius Herald: autopay spends {U} on its generic mana, so it stays; paid with Plains only, it's sacrificed", () => {
    let { s, ap, ids } = setup([herald, { ...herald }]);
    expect(tapped(s, ap, ids[0]!)).toContain("Island");
    s = settle(cast(s, ap, ids[0]!), ap);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(life(s, ap)).toBe(44);
    s = settle(castWith(s, ap, ids[1]!, ["Plains", "Plains", "Plains"]), ap);
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(life(s, ap)).toBe(48);
  });

  it("Steamcore Weird: with {R} spent it deals 2 damage; without, its trigger never goes on the stack", () => {
    let { s, ap, opp, ids } = setup([weird, { ...weird }]);
    expect(tapped(s, ap, ids[0]!)).toContain("Mountain");
    s = settle(cast(s, ap, ids[0]!), ap, [{ kind: "player", id: opp }]);
    expect(life(s, opp)).toBe(38);
    s = castWith(s, ap, ids[1]!, ["Island", "Island", "Forest", "Forest"]);
    s = passAll(s);
    expect(s.pending).toBeFalsy();
    expect(s.stack).toHaveLength(0);
    expect(life(s, opp)).toBe(38);
  });

  it("adamant: three white mana for Ardenvale Paladin, three of any one color for Henge Walker", () => {
    let { s, ap, ids } = setup([ardenvale, henge, { ...henge }]);
    expect(tapped(s, ap, ids[0]!)).toEqual(["Plains", "Plains", "Plains", expect.any(String)].sort());
    s = settle(cast(s, ap, ids[0]!), ap);
    expect(counters(s, ids[0]!)).toBe(1);
    s = settle(cast(s, ap, ids[1]!), ap);
    expect(counters(s, ids[1]!)).toBe(1);
    s = settle(castWith(s, ap, ids[2]!, ["Island", "Mountain", "Swamp"]), ap);
    expect(counters(s, ids[2]!)).toBe(0);
  });

  it("Rally for the Throne: three white mana, then 1 life for each creature you control", () => {
    let { s, ap, ids } = setup([rally]);
    const before = life(s, ap);
    s = settle(cast(s, ap, ids[0]!), ap);
    expect(life(s, ap)).toBe(before + 2);
  });

  it("Dawnglow Infusion pays its hybrid and X with both {G} and {W}: X life twice", () => {
    let { s, ap, ids } = setup([dawnglow]);
    expect(tapped(s, ap, ids[0]!, undefined, 2)).toEqual(expect.arrayContaining(["Forest", "Plains"]));
    const plan = planCast(s, ap, ids[0]!, undefined, undefined, undefined, 2)!;
    for (const a of plan) s = act(s, a);
    s = settle(s, ap);
    expect(life(s, ap)).toBe(44);
  });

  it("Firespout paid with {R} and {G} hits creatures with and without flying; paid with {R} only, just those without", () => {
    let { s, ap, opp, ids } = setup([firespout, { ...firespout }]);
    const b = putOnBattlefield(s, opp, bear());
    const flier = putOnBattlefield(s, opp, bear({ name: "Flying Bear", keywords: ["Flying"] }));
    s = settle(cast(s, ap, ids[0]!), ap);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[flier]!.zone).toBe("graveyard");
    const b2 = putOnBattlefield(s, opp, bear());
    const flier2 = putOnBattlefield(s, opp, bear({ name: "Flying Bear", keywords: ["Flying"] }));
    s = settle(castWith(s, ap, ids[1]!, ["Mountain", "Island", "Island"]), ap);
    expect(s.objects[b2]!.zone).toBe("graveyard");
    expect(s.objects[flier2]!.zone).toBe("battlefield");
  });

  it("opus: Deluge Virtuoso gets +2/+2 for a five-mana spell, +1/+1 for a one-mana spell", () => {
    let { s, ap, ids } = setup([mindSpring, recall]);
    const v = putOnBattlefield(s, ap, virtuoso);
    for (const a of planCast(s, ap, ids[0]!, undefined, undefined, undefined, 3)!) s = act(s, a);
    s = settle(s, ap);
    expect(pt(s, v)).toBe("4/4");
    s = settle(cast(s, ap, ids[1]!, [{ kind: "player", id: ap }]), ap);
    expect(pt(s, v)).toBe("5/5");
  });

  it("Nix counters a spell cast without spending mana, not one paid for", () => {
    let { s, ap, ids } = setup([ornithopter, nix, bear(), { ...nix }]);
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]! });
    for (const a of planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[0]!.id }])!) s = act(s, a);
    s = settle(s, ap);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    for (const a of planCast(s, ap, ids[2]!)!) s = act(s, a);
    for (const a of planCast(s, ap, ids[3]!, [{ kind: "stack", id: s.stack[0]!.id }])!) s = act(s, a);
    s = settle(s, ap);
    expect(s.objects[ids[2]!]!.zone).toBe("battlefield");
  });

  it("Vexing Bauble counters spells cast for no mana, whoever casts them", () => {
    let { s, ap, ids } = setup([ornithopter, bear()]);
    putOnBattlefield(s, ap, bauble);
    s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[0]! }), ap);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    s = settle(cast(s, ap, ids[1]!), ap);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
  });

  it("Seed Spark: autopay spends {G}; a copy of it has no mana spent, so it makes no Saprolings", () => {
    let { s, ap, opp, ids } = setup([seedSpark, twincast]);
    const r1 = putOnBattlefield(s, opp, ornithopter);
    const r2 = putOnBattlefield(s, opp, ornithopter);
    expect(tapped(s, ap, ids[0]!, [target(r1)])).toContain("Forest");
    for (const a of planCast(s, ap, ids[0]!, [target(r2)])!) s = act(s, a);
    const spark = s.stack[s.stack.length - 1]!.id;
    for (const a of planCast(s, ap, ids[1]!, [{ kind: "stack", id: spark }])!) s = act(s, a);
    s = passAll(s);
    // The copy gets a new target, so the original still has its own.
    expect(s.pending?.kind).toBe("copyTargets");
    s = act(s, { type: "copyTargets", player: ap, targets: [target(r1)] });
    s = settle(s, ap);
    expect(s.objects[r1]!.zone).toBe("graveyard");
    expect(s.objects[r2]!.zone).toBe("graveyard");
    const saprolings = s.battlefield.filter((b) => /Saproling/.test(name(s, b)));
    expect(saprolings).toHaveLength(2);
  });
});
