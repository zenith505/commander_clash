// Round 198: targets "of the chosen type" on a permanent's abilities, the creature type chosen as it entered (Dawn-Blessed
// Pennant, Kindred Boon, From the Rubble), "unless its controller has ~ deal damage to them equal to ~'s power" (Combustion
// Man), "card not named ~" targets and "for each permanent you control but don't own" (Staff of Eden, Vault's Key), "can't
// be blocked as long as its power is 3 or less" (Thieves' Tools).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const choose = (s: GameState, targets: TargetChoice[]) => (s.pending?.kind === "chooseTargets" ? act(s, { type: "chooseTargets", player: s.pending.player, targets }) : s);
const pt = (s: GameState, id: ObjectId) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const creature = (name: string, sub: string, p: number, t = p, cost = "{G}") => card(name, `Creature — ${sub}`, cost, { cmc: cost.match(/\{/g)?.length ?? 0, power: String(p), toughness: String(t) });

// Real oracle text (Scryfall).
const combustionMan = card("Combustion Man", "Legendary Creature — Human Assassin", "{3}{R}{R}", {"cmc":5,"power":"4","toughness":"6","keywords":[],"oracleText":"Whenever Combustion Man attacks, destroy target permanent unless its controller has Combustion Man deal damage to them equal to his power.","colors":["R"],"colorIdentity":["R"]});
const dawnblessedPennant = card("Dawn-Blessed Pennant", "Artifact", "{1}", {"cmc":1,"keywords":[],"oracleText":"As this artifact enters, choose Elemental, Elf, Faerie, Giant, Goblin, Kithkin, Merfolk, or Treefolk.\nWhenever a permanent you control of the chosen type enters, you gain 1 life.\n{2}, {T}, Sacrifice this artifact: Return target card of the chosen type from your graveyard to your hand.","colors":[],"colorIdentity":[]});
const kindredBoon = card("Kindred Boon", "Enchantment", "{2}{W}{W}", {"cmc":4,"keywords":[],"oracleText":"As this enchantment enters, choose a creature type.\n{1}{W}: Put a divinity counter on target creature you control of the chosen type.\nEach creature you control with a divinity counter on it has indestructible.","colors":["W"],"colorIdentity":["W"]});
const fromTheRubble = card("From the Rubble", "Enchantment", "{4}{W}{W}", {"cmc":6,"keywords":[],"oracleText":"As this enchantment enters, choose a creature type.\nAt the beginning of your end step, return target creature card of the chosen type from your graveyard to the battlefield with a finality counter on it. (If a creature with a finality counter on it would die, exile it instead.)","colors":["W"],"colorIdentity":["W"]});
const staffOfEdenVaultsKey = card("Staff of Eden, Vault's Key", "Legendary Artifact", "{6}", {"cmc":6,"keywords":[],"oracleText":"When Staff of Eden enters, put target legendary permanent card not named Staff of Eden, Vault's Key from a graveyard onto the battlefield under your control.\n{T}: Draw a card for each permanent you control but don't own.","colors":[],"colorIdentity":[]});
const thievesTools = card("Thieves' Tools", "Artifact — Equipment", "{1}{B}", {"cmc":2,"keywords":["Treasure","Equip"],"oracleText":"When this Equipment enters, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nEquipped creature can't be blocked as long as its power is 3 or less.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)","colors":["B"],"colorIdentity":["B"]});
const ALL = [combustionMan, dawnblessedPennant, kindredBoon, fromTheRubble, staffOfEdenVaultsKey, thievesTools];

describe("Round 198", () => {
  it("all compile", () => supported(...ALL));

  it("Dawn-Blessed Pennant: the type is chosen as it enters, and only a card of that type can be returned", () => {
    const { s: s0, ap, ids } = setup([dawnblessedPennant]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("chooseOption");
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual(["Elemental", "Elf", "Faerie", "Giant", "Goblin", "Kithkin", "Merfolk", "Treefolk"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "Elf" });
    s = resolveAll(s);
    const pennant = ids[0]!;
    expect(s.objects[pennant]!.zone).toBe("battlefield");
    const elf = into(s, ap, creature("Test Elf", "Elf Druid", 1), "graveyard");
    const goblin = into(s, ap, creature("Test Goblin", "Goblin", 1), "graveyard");
    // A Kindred Elf card counts too: a card of that type (CR 205.3d).
    const kindred = into(s, ap, card("Test Elf Kindred", "Kindred Instant — Elf", "{G}", { cmc: 1 }), "graveyard");
    expect(planActivate(s, ap, pennant, 0, [tgt(goblin)])).toBeNull();
    expect(planActivate(s, ap, pennant, 0, [tgt(kindred)])).not.toBeNull();
    s = run(s, planActivate(s, ap, pennant, 0, [tgt(elf)]));
    s = resolveAll(s);
    expect(s.objects[elf]!.zone).toBe("hand");
    expect(s.objects[pennant]!.zone).toBe("graveyard");
  });

  it("Dawn-Blessed Pennant: with no type chosen, its ability can't be activated (rulings on Kindred Boon)", () => {
    const { s, ap } = setup([]);
    const pennant = putOnBattlefield(s, ap, dawnblessedPennant);
    const elf = into(s, ap, creature("Test Elf", "Elf", 1), "graveyard");
    expect(planActivate(s, ap, pennant, 0, [tgt(elf)])).toBeNull();
  });

  it("Kindred Boon: a divinity counter only on a creature you control of the chosen type, and it's indestructible", () => {
    const { s: s0, ap, opp } = setup([]);
    const boon = putOnBattlefield(s0, ap, kindredBoon);
    s0.objects[boon]!.chosen = { type: "Cat" };
    const cat = putOnBattlefield(s0, ap, creature("Test Cat", "Cat", 2));
    const ox = putOnBattlefield(s0, ap, creature("Test Ox", "Ox", 2));
    const theirCat = putOnBattlefield(s0, opp, creature("Test Their Cat", "Cat", 2));
    invalidateCharacteristics(s0);
    expect(planActivate(s0, ap, boon, 0, [tgt(ox)])).toBeNull();
    expect(planActivate(s0, ap, boon, 0, [tgt(theirCat)])).toBeNull();
    let s = run(s0, planActivate(s0, ap, boon, 0, [tgt(cat)]));
    s = resolveAll(s);
    expect(s.objects[cat]!.counters.divinity).toBe(1);
    s.objects[cat]!.damage = 5;
    invalidateCharacteristics(s);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[cat]!.zone).toBe("battlefield");
  });

  it("From the Rubble: at your end step, a creature card of the chosen type returns with a finality counter", () => {
    const { s: s0, ap } = setup([]);
    const rubble = putOnBattlefield(s0, ap, fromTheRubble);
    s0.objects[rubble]!.chosen = { type: "Soldier" };
    const soldier = into(s0, ap, creature("Test Soldier", "Human Soldier", 2), "graveyard");
    const ox = into(s0, ap, creature("Test Ox", "Ox", 2), "graveyard");
    let s = passUntil(s0, "end", ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => choose(s, [tgt(ox)])).toThrow();
    s = choose(s, [tgt(soldier)]);
    s = resolveAll(s);
    expect(s.objects[soldier]!.zone).toBe("battlefield");
    expect(s.objects[soldier]!.counters.finality).toBe(1);
    expect(s.objects[ox]!.zone).toBe("graveyard");
  });
  const combust = (pick: (s: GameState) => GameState) => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const man = putOnBattlefield(s0, ap, combustionMan);
    const theirs = putOnBattlefield(s0, opp, creature("Test Their Ox", "Ox", 3));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: man, defender: opp }] });
    s = choose(s, [tgt(theirs)]);
    s = resolveAll(s);
    expect(s.pending?.kind === "chooseOption" && s.pending.what === "punisher" && s.pending.player).toBe(opp);
    expect(s.pending?.kind === "chooseOption" && s.pending.labels).toEqual(["Be dealt 4 damage", "Let Combustion Man destroy it"]);
    s = resolveAll(pick(s));
    return { s, ap, opp, man, theirs };
  };

  it("Combustion Man: the permanent's controller takes damage equal to his power to save it", () => {
    const { s, opp, theirs } = combust((s) => act(s, { type: "chooseOption", player: s.pending!.player, choice: "0" }));
    expect(s.players[opp]!.life).toBe(36);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });

  it("Combustion Man: or the permanent is destroyed", () => {
    const { s, opp, theirs } = combust((s) => act(s, { type: "chooseOption", player: s.pending!.player, choice: "none" }));
    expect(s.players[opp]!.life).toBe(40);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("Combustion Man: a bot weighs the damage against the permanent", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const man = putOnBattlefield(s0, ap, combustionMan);
    const big = putOnBattlefield(s0, opp, creature("Test Their Wurm", "Wurm", 8));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: man, defender: opp }] });
    s = choose(s, [tgt(big)]);
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("chooseOption");
    for (const a of botActions(s, opp)) s = applyAction(s, a);
    s = resolveAll(s);
    expect(s.objects[big]!.zone).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(36);
  });

  it("Staff of Eden: returns a legendary permanent card not named Staff of Eden from any graveyard, then draws for each permanent you control but don't own", () => {
    const { s: s0, ap, opp, ids } = setup([staffOfEdenVaultsKey]);
    const legend = into(s0, opp, card("Test Legend", "Legendary Creature — Ox", "{2}", { cmc: 2, power: "2", toughness: "2" }), "graveyard");
    const otherStaff = into(s0, ap, staffOfEdenVaultsKey, "graveyard");
    const plain = into(s0, opp, creature("Test Ox", "Ox", 2), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => choose(s, [tgt(otherStaff)])).toThrow();
    expect(() => choose(s, [tgt(plain)])).toThrow();
    s = choose(s, [tgt(legend)]);
    s = resolveAll(s);
    expect(s.objects[legend]!.zone).toBe("battlefield");
    expect(s.objects[legend]!.controller).toBe(ap);
    expect(s.objects[legend]!.owner).toBe(opp);
    const hand = s.players[ap]!.hand.length;
    s = run(s, planActivate(s, ap, ids[0]!, 0));
    s = resolveAll(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Thieves' Tools: equipped creature with power 3 or less can't be blocked; with 4 it can", () => {
    for (const big of [false, true]) {
      const { s: s0, ap, opp } = setup([]);
      s0.players[ap]!.hand = [];
      const tools = putOnBattlefield(s0, ap, thievesTools);
      const rogue = putOnBattlefield(s0, ap, creature("Test Rogue", "Human Rogue", 3));
      s0.objects[tools]!.attachedTo = rogue;
      if (big) s0.objects[rogue]!.counters["+1/+1"] = 1;
      const wall = putOnBattlefield(s0, opp, creature("Test Wall", "Wall", 0, 8));
      invalidateCharacteristics(s0);
      let s = passUntil(s0, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: rogue, defender: opp }] });
      s = passUntil(s, "declareBlockers");
      const block = () => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: wall, attacker: rogue }] } as Action);
      if (big) expect(block().objects[wall]!.blocking).toBeTruthy();
      else expect(block).toThrow();
    }
  });
});
