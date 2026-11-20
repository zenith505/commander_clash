// Round 430: C.A.M.P. ("Whenever fortified land is tapped for mana, put a +1/+1 counter on target creature you control. If that
// creature shares a color with the mana that land produced, create a Junk token.").
import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, defOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const camp = (): CardDef => ({"oracleId":"9bf498ce-6d6d-462f-9ec3-b36a2184aff7","name":"C.A.M.P.","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Fortification","supertypes":[],"types":["Artifact"],"subtypes":["Fortification"],"oracleText":"Whenever fortified land is tapped for mana, put a +1/+1 counter on target creature you control. If that creature shares a color with the mana that land produced, create a Junk token. (It's an artifact with \"{T}, Sacrifice this token: Exile the top card of your library. You may play that card this turn. Activate only as a sorcery.\")\nFortify {3} ({3}: Attach to target land you control. Fortify only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Fortify"],"layout":"normal"}) as CardDef;
const contamination = (): CardDef => ({"oracleId":"4013b4c2-c9ed-4d14-90f0-97214ec1fded","name":"Contamination","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, sacrifice this enchantment unless you sacrifice a creature.\nIf a land is tapped for mana, it produces {B} instead of any other type and amount.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const ragingGoblin = (): CardDef => ({"oracleId":"30997b43-fc13-41d3-8064-1ccc2cb6fd2b","name":"Raging Goblin","manaCost":"{R}","cmc":1,"typeLine":"Creature — Goblin Berserker","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Berserker"],"oracleText":"Haste (This creature can attack and {T} as soon as it comes under your control.)","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"layout":"normal"}) as CardDef;
const wastes = (): CardDef => ({"oracleId":"05d24b0c-904a-46b6-b42a-96a4d91a0dd4","name":"Wastes","manaCost":"","cmc":0,"typeLine":"Basic Land","supertypes":["Basic"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const wildGrowth = (): CardDef => ({"oracleId":"706ae742-1807-44b7-a4fa-f2e26f61519a","name":"Wild Growth","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"producedMana":["G"],"layout":"normal"}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or a question is asked; bots answer the questions of anyone but `me`. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && me !== undefined && p.player === me) return s;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const logText = (s: GameState) => s.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n");
/** A new card for `def` in `pid`'s `zone` (on top of the library). */
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Only these cards stay in `pid`'s hand; the rest go to the bottom of the library. */
const onlyInHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !keep.includes(x))) (s.objects[id]!.zone = "library"), p.library.push(id);
  p.hand = p.hand.filter((x) => keep.includes(x));
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => defOf(s, s.objects[id]!).name === name);
/** Token names read "Junk Token". */
const tokens = (s: GameState, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && defOf(s, s.objects[id]!).name === `${name} Token`);
const plusOnes = (s: GameState, id: string) => s.objects[id]!.counters["+1/+1"] ?? 0;
/** `ap` controls C.A.M.P. attached to `land` (a Mountain unless given) and `creature`. */
const game = (creature: CardDef, land?: CardDef) => {
  const { s, ap, opp } = setup([]);
  s.players[ap]!.hand = [];
  const ground = land ? putOnBattlefield(s, ap, land) : named(s, "Mountain")[0]!;
  const camp0 = putOnBattlefield(s, ap, camp());
  s.objects[camp0]!.attachedTo = ground;
  const c = putOnBattlefield(s, ap, creature);
  invalidateCharacteristics(s);
  return { s, ap, opp, land: ground, camp: camp0, c };
};
const tapFor = (s: GameState, pid: PlayerId, id: string, mana: string) => act(s, { type: "activateMana", player: pid, objectId: id, ability: 0, mana } as Action);

describe("Round 430: C.A.M.P.", () => {
  it("is fully supported", () => supported(camp()));

  it("fortify {3} attaches it to a land you control, only as a sorcery (CR 702.67a)", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, camp());
    const land = named(s0, "Mountain")[0]!;
    const fortify = compileCard(camp()).activated.findIndex((a) => /^Fortify/.test(a.text));
    expect(compileCard(camp()).activated[fortify]!.sorcerySpeed).toBe(true);
    const s = settle(run(s0, planActivate(s0, ap, c, fortify, [tgt(land)])));
    expect(s.objects[c]!.attachedTo).toBe(land);
  });

  it("the fortified Mountain tapped for {R}: a +1/+1 counter on the red creature, and a Junk token (it shares a color)", () => {
    const { s: s0, ap, land, c } = game(ragingGoblin());
    let s = tapFor(s0, ap, land, "R");
    expect(s.players[ap]!.manaPool.R).toBe(1);
    s = settle(s);
    expect(plusOnes(s, c)).toBe(1);
    expect(tokens(s, "Junk")).toHaveLength(1);
  });

  it("a green creature: the counter, but no Junk", () => {
    const { s: s0, ap, land, c } = game(grizzlyBears());
    const s = settle(tapFor(s0, ap, land, "R"));
    expect(plusOnes(s, c)).toBe(1);
    expect(tokens(s, "Junk")).toHaveLength(0);
  });

  it("colorless mana (Wastes) shares no color with anything", () => {
    const { s: s0, ap, land, c } = game(ragingGoblin(), wastes());
    const s = settle(tapFor(s0, ap, land, "C"));
    expect(plusOnes(s, c)).toBe(1);
    expect(tokens(s, "Junk")).toHaveLength(0);
  });

  it("another land tapped for mana doesn't trigger it", () => {
    const { s: s0, ap, land, c } = game(ragingGoblin());
    const other = named(s0, "Mountain").find((id) => id !== land)!;
    const s = settle(tapFor(s0, ap, other, "R"));
    expect(plusOnes(s, c)).toBe(0);
  });

  it("the mana the land produced, as a replacement made it: Contamination's {B} shares no color with a red creature", () => {
    const { s: s0, ap, opp, land, c } = game(ragingGoblin());
    putOnBattlefield(s0, opp, contamination());
    invalidateCharacteristics(s0);
    let s = tapFor(s0, ap, land, "R");
    expect(s.players[ap]!.manaPool.B).toBe(1);
    s = settle(s);
    expect(plusOnes(s, c)).toBe(1);
    expect(tokens(s, "Junk")).toHaveLength(0);
  });

  it("not the mana other abilities add for its tapping: Wild Growth's {G} isn't the land's (rulings: the land's own mana)", () => {
    const { s: s0, ap, land, c } = game(grizzlyBears());
    const wg = putOnBattlefield(s0, ap, wildGrowth());
    s0.objects[wg]!.attachedTo = land;
    invalidateCharacteristics(s0);
    let s = tapFor(s0, ap, land, "R");
    expect(s.players[ap]!.manaPool.G).toBe(1);
    s = settle(s);
    expect(plusOnes(s, c)).toBe(1);
    expect(tokens(s, "Junk")).toHaveLength(0);
  });

  it("the target gone by the time it resolves: nothing happens, no Junk (rulings)", () => {
    const { s: s0, ap, land, c } = game(ragingGoblin());
    let s = tapFor(s0, ap, land, "R");
    // Put the trigger on the stack, then the Goblin leaves.
    for (let i = 0; i < 10 && !s.stack.length; i++) s = s.pending ? botActions(s, s.pending.player).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack).toHaveLength(1);
    const p = s.players[ap]!;
    s.battlefield.splice(s.battlefield.indexOf(c), 1);
    s.objects[c]!.zone = "graveyard";
    p.graveyard.push(c);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(tokens(s, "Junk")).toHaveLength(0);
  });
});
