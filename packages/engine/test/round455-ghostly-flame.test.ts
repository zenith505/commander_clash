// Round 455: Ghostly Flame, "Black and/or red permanents and spells are colorless sources of damage." The damage is seen
// as from a colorless source wherever it's looked at (rulings): prevention shields recheck the source as the damage would
// be dealt (CR 609.7b), protection's prevention looks at the source's qualities (CR 702.16e), replacements too (CR 614.1a);
// the source keeps its colors, so what triggers on a red source dealing damage still triggers (rulings), and a red spell
// still can't target a creature with protection from red.

import { describe, expect, it } from "vitest";
import { act, passAll, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const ghostlyFlame = (): CardDef => ({"oracleId": "6a461ca3-7923-4df4-9f15-4072545da117", "name": "Ghostly Flame", "manaCost": "{B}{R}", "cmc": 2, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "Black and/or red permanents and spells are colorless sources of damage.", "colors": ["B", "R"], "colorIdentity": ["B", "R"], "keywords": [], "layout": "normal"}) as CardDef;
const circleRed = (): CardDef => ({"oracleId": "df2738fe-9cd1-4347-8808-105fcfde1190", "name": "Circle of Protection: Red", "manaCost": "{1}{W}", "cmc": 2, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "{1}: The next time a red source of your choice would deal damage to you this turn, prevent that damage.", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"}) as CardDef;
const firewalker = (): CardDef => ({"oracleId": "fb37ff1c-7461-4a16-b27f-6eef0db937fe", "name": "Kor Firewalker", "manaCost": "{W}{W}", "cmc": 2, "typeLine": "Creature — Kor Soldier", "supertypes": [], "types": ["Creature"], "subtypes": ["Kor", "Soldier"], "oracleText": "Protection from red\nWhenever a player casts a red spell, you may gain 1 life.", "power": "2", "toughness": "2", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Protection"], "layout": "normal"}) as CardDef;
const torbran = (): CardDef => ({"oracleId": "8c3495bf-02e7-4ad9-949d-92eb3d2b662a", "name": "Torbran, Thane of Red Fell", "manaCost": "{1}{R}{R}{R}", "cmc": 4, "typeLine": "Legendary Creature — Dwarf Noble", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Dwarf", "Noble"], "oracleText": "If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead.", "power": "2", "toughness": "4", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const pyromancer = (): CardDef => ({"oracleId": "29b3cb3e-aeb1-43eb-8095-9f7881aa34bd", "name": "Prodigal Pyromancer", "manaCost": "{2}{R}", "cmc": 3, "typeLine": "Creature — Human Wizard", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Wizard"], "oracleText": "{T}: This creature deals 1 damage to any target.", "power": "1", "toughness": "1", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId": "4457ed35-7c10-48c8-9776-456485fdf070", "name": "Lightning Bolt", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Lightning Bolt deals 3 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const redTerror = (): CardDef => ({"oracleId": "557bd3c9-1c60-480d-9650-30c317506097", "name": "The Red Terror", "manaCost": "{3}{R}", "cmc": 4, "typeLine": "Legendary Creature — Tyranid", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Tyranid"], "oracleText": "Advanced Species — Whenever a red source you control deals damage to one or more permanents and/or players, put a +1/+1 counter on The Red Terror.", "power": "4", "toughness": "3", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Advanced Species"], "layout": "normal"}) as CardDef;
const pyroclasm = (): CardDef => ({"oracleId":"e4bcd4ea-e7cd-4471-8f3b-18bb51d3d70c","name":"Pyroclasm","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Pyroclasm deals 2 damage to each creature.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  return plan.reduce((x, a) => act(x, a), s);
};
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const toHand = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
/** Pass until the top of the stack resolves (or a choice comes up). */
const resolveTop = (s: GameState) => {
  const n = s.stack.length;
  for (let i = 0; i < 20 && s.stack.length >= n && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Answer the damage source choice with the option whose label starts with `name`. */
const chooseSource = (s: GameState, name: string) => {
  const p = s.pending;
  if (p?.kind !== "chooseOption" || p.what !== "damageSource") throw new Error(`not choosing a source: ${JSON.stringify(p)}`);
  const i = p.labels!.findIndex((l) => l.startsWith(name));
  if (i < 0) throw new Error(`no ${name} in ${p.labels!.join(" | ")}`);
  return act(s, { type: "chooseOption", player: p.player, choice: p.options[i]! });
};

/**
 * I control Circle of Protection: Red and choose the next player's Prodigal Pyromancer with it; then the Pyromancer pings
 * me. With Ghostly Flame out, `flame`.
 */
function circleAgainstPyromancer(flame: boolean) {
  const { s: s0, ap, opp } = setup([]);
  const cop = putOnBattlefield(s0, ap, circleRed());
  const pyro = putOnBattlefield(s0, opp, pyromancer());
  if (flame) putOnBattlefield(s0, opp, ghostlyFlame());
  let s = passAll(run(s0, planActivate(s0, ap, cop, 0)));
  s = chooseSource(s, "Prodigal Pyromancer");
  expect(s.damageRules).toHaveLength(1);
  // The Pyromancer's controller pings me when they have priority.
  while (waitingOn(s) !== opp || s.pending) s = act(s, s.pending ? botActions(s, waitingOn(s)!)[0]! : { type: "passPriority", player: waitingOn(s)! });
  s = resolveTop(run(s, planActivate(s, opp, pyro, 0, [ply(ap)])));
  return { s, ap };
}

describe("Ghostly Flame (round 455)", () => {
  it("is fully supported", () => {
    expect(isFullySupported(ghostlyFlame())).toBe(true);
  });

  it("Circle of Protection: Red's shield rechecks its chosen red source as the damage would be dealt: with Ghostly Flame, the damage is from a colorless source and is dealt (CR 609.7b)", () => {
    const without = circleAgainstPyromancer(false);
    expect(life(without.s, without.ap)).toBe(40);
    const withFlame = circleAgainstPyromancer(true);
    expect(life(withFlame.s, withFlame.ap)).toBe(39);
    // The shield prevented nothing, so it isn't used up (CR 609.7b).
    expect(withFlame.s.damageRules).toHaveLength(1);
  });

  it("protection from red doesn't prevent a red spell's damage with Ghostly Flame out (CR 702.16e), and a Bolt still can't target the creature", () => {
    for (const flame of [false, true]) {
      const { s: s0, ap, ids, opp } = setup([pyroclasm(), bolt()]);
      const walker = putOnBattlefield(s0, opp, firewalker());
      if (flame) putOnBattlefield(s0, ap, ghostlyFlame());
      // Targeting isn't damage: protection from red still stops a red spell targeting it (rulings).
      expect(planCast(s0, ap, ids[1]!, [tgt(walker)])).toBeNull();
      // Kor Firewalker's "whenever a player casts a red spell" trigger resolves first, then Pyroclasm.
      let s = run(s0, planCast(s0, ap, ids[0]!));
      for (let i = 0; i < 40 && (s.stack.length || s.pending); i++) s = act(s, s.pending ? botActions(s, waitingOn(s)!)[0]! : { type: "passPriority", player: waitingOn(s)! });
      expect(s.stack).toHaveLength(0);
      expect(s.objects[walker]!.zone).toBe(flame ? "graveyard" : "battlefield");
    }
  });

  it("Torbran's \"a red source you control would deal damage\" replacement doesn't apply to damage seen as colorless (CR 614.1a)", () => {
    for (const flame of [false, true]) {
      const { s: s0, ap, ids, opp } = setup([bolt()]);
      putOnBattlefield(s0, ap, torbran());
      if (flame) putOnBattlefield(s0, opp, ghostlyFlame());
      const s = resolveTop(run(s0, planCast(s0, ap, ids[0]!, [ply(opp)])));
      expect(life(s, opp)).toBe(flame ? 37 : 35);
    }
  });

  it("the source keeps its colors for what triggers on it dealing damage: The Red Terror still gets its counter (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([bolt()]);
    const terror = putOnBattlefield(s0, ap, redTerror());
    putOnBattlefield(s0, opp, ghostlyFlame());
    let s = resolveTop(run(s0, planCast(s0, ap, ids[0]!, [ply(opp)])));
    expect(life(s, opp)).toBe(37);
    s = resolveTop(s);
    expect(s.objects[terror]!.counters["+1/+1"]).toBe(1);
  });
});
