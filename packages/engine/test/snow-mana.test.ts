// Snow mana: {S} in a cost is paid with one mana of any type a snow source produced (CR 107.4h); the source of an
// ability's mana is the ability's source, of a spell's the spell (CR 106.3). The pool remembers which mana is snow until
// it's spent or empties. "If {S} was spent", "the amount of {S} spent to cast ~" count the snow mana spent to cast it (a
// copy or a spell cast without paying has none). Effects that reduce generic mana don't reduce {S} (CR 107.4h, 118.7g).
// "Until end of turn, you don't lose this mana as steps and phases end": the mana stays until the cleanup step ends.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { castProblem, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";
import { addMana, manaFromPool } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const snowForest = card("Snow-Covered Forest", "Basic Snow Land — Forest", "", { oracleText: "({T}: Add {G}.)" });
const snowIsland = card("Snow-Covered Island", "Basic Snow Land — Island", "", { oracleText: "({T}: Add {U}.)" });
const centaur = card("Boreal Centaur", "Snow Creature — Centaur Warrior", "{1}{G}", { power: "2", toughness: "2", oracleText: "{S}: This creature gets +1/+1 until end of turn. Activate only once each turn. ({S} can be paid with one mana from a snow source.)" });
const troll = card("Icehide Troll", "Snow Creature — Troll Warrior", "{2}{G}", { power: "2", toughness: "3", oracleText: "{S}{S}: This creature gets +2/+0 and gains indestructible until end of turn. Tap it. (Damage and effects that say \"destroy\" don't destroy it. {S} can be paid with one mana from a snow source.)" });
const strider = card("Berg Strider", "Snow Creature — Giant Wizard", "{4}{U}", { power: "4", toughness: "4", oracleText: "When this creature enters, tap target artifact or creature an opponent controls. If {S} was spent to cast this spell, that permanent doesn't untap during its controller's next untap step. ({S} is mana from a snow source.)" });
const lore = card("Graven Lore", "Snow Instant", "{3}{U}{U}", { oracleText: "Scry X, where X is the amount of {S} spent to cast this spell, then draw three cards. ({S} is mana from a snow source.)" });
const fumarole = card("Tundra Fumarole", "Snow Sorcery", "{1}{R}{R}", { oracleText: "Tundra Fumarole deals 4 damage to target creature or planeswalker. Add {C} for each {S} spent to cast this spell. Until end of turn, you don't lose this mana as steps and phases end. ({S} is mana from a snow source.)" });
const astrolabe = card("Arcum's Astrolabe", "Snow Artifact", "{S}", { oracleText: "({S} can be paid with one mana from a snow source.)\nWhen this artifact enters, draw a card.\n{1}, {T}: Add one mana of any color." });
const outrider = card("Boreal Outrider", "Snow Creature — Elf Warrior", "{2}{G}", { power: "3", toughness: "2", oracleText: "Whenever you cast a creature spell, if {S} of any of that spell's colors was spent to cast it, that creature enters with an additional +1/+1 counter on it. ({S} is mana from a snow source.)" });
const snowWastes = card("Snow-Covered Wastes", "Basic Snow Land", "", { oracleText: "{T}: Add {C}." });
const collector = card("Brazen Collector", "Creature — Raccoon Rogue", "{1}{R}", { power: "2", toughness: "1", keywords: ["First strike"], oracleText: "First strike\nWhenever this creature attacks, add {R}. Until end of turn, you don't lose this mana as steps and phases end." });

/** Just these lands for `pid`: the setup's other lands are taken away. */
function onlyLands(s: GameState, pid: PlayerId, lands: CardDef[]): string[] {
  for (const id of [...s.battlefield]) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")) s.battlefield.splice(s.battlefield.indexOf(id), 1);
  return lands.map((l) => putOnBattlefield(s, pid, l));
}

describe("snow mana", () => {
  it("parses", () => supported(centaur, troll, strider, lore, fumarole, astrolabe, collector, outrider));

  it("Boreal Outrider: only snow mana of one of the spell's colors gives the creature its counter", () => {
    for (const [lands, after] of [[[card("Forest", "Basic Land — Forest"), snowForest], "3/3"], [[card("Forest", "Basic Land — Forest"), snowWastes], "2/2"]] as const) {
      const { s: s0, ap, ids } = setup([bear()]);
      putOnBattlefield(s0, ap, outrider);
      onlyLands(s0, ap, [...lands]);
      const s = settle(passAll(planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0)));
      expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
      expect(pt(s, ids[0]!)).toBe(after);
    }
  });

  it("the pool remembers what a snow source made until it's spent or the step ends", () => {
    const { s: s0, ap } = setup([]);
    const [sf, , f] = onlyLands(s0, ap, [snowForest, snowIsland, card("Forest", "Basic Land — Forest")]);
    let s = act(s0, { type: "activateMana", player: ap, objectId: sf!, mana: "G" });
    s = act(s, { type: "activateMana", player: ap, objectId: f!, mana: "G" });
    expect(s.players[ap]!.manaPool.G).toBe(2);
    expect(manaFromPool(s, ap, "snow")).toMatchObject({ G: 1, W: 0, U: 0, B: 0, R: 0, C: 0 });
    s = passAll(s);
    expect(s.players[ap]!.manaLots).toBeUndefined();
  });

  it("{S} can only be paid with snow mana; other mana pays the rest of the cost", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, centaur);
    expect(planActivate(s0, ap, c, 0)).toBeNull(); // only nonsnow lands
    const [, sf] = onlyLands(s0, ap, [card("Forest", "Basic Land — Forest"), snowForest]);
    let s = s0;
    for (const a of planActivate(s, ap, c, 0)!) s = act(s, a);
    // The snow land paid; the other is still untapped.
    expect(s.objects[sf!]!.tapped).toBe(true);
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest" && s.objects[id]!.tapped)).toHaveLength(0);
    s = passAll(s);
    expect(pt(s, c)).toBe("3/3");
  });

  it("Arcum's Astrolabe costs {S}: castable only with snow mana", () => {
    const { s: s0, ap, ids } = setup([astrolabe]);
    expect(planCast(s0, ap, ids[0]!)).toBeNull();
    expect(castProblem(s0, ap, ids[0]!)).toMatch(/not enough mana/);
    onlyLands(s0, ap, [snowIsland]);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(passAll((planCast(s0, ap, ids[0]!) ?? []).reduce((x, a) => act(x, a), s0)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand); // cast one, drew one
  });

  it("Icehide Troll: {S}{S} gives +2/+0 and indestructible, then taps it", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, troll);
    onlyLands(s0, ap, [snowForest, snowIsland]);
    const s = activateAll(s0, ap, t);
    expect(pt(s, t)).toBe("4/3");
    expect(objHasKeyword(s, s.objects[t]!, "Indestructible")).toBe(true);
    expect(s.objects[t]!.tapped).toBe(true);
  });

  it("Berg Strider: with {S} spent, the tapped permanent skips its next untap; without, it doesn't", () => {
    for (const snow of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([strider]);
      onlyLands(s0, ap, snow ? [snowIsland, ...Array(4).fill(card("Island", "Basic Land — Island"))] : Array(5).fill(card("Island", "Basic Land — Island")));
      const b = putOnBattlefield(s0, opp, bear());
      let s = settle(passAll(planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0)));
      if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
      expect(s.objects[b]!.tapped).toBe(true);
      expect(!!s.objects[b]!.skipNextUntap).toBe(snow);
    }
  });

  it("Graven Lore scries once for each snow mana spent: autopay taps snow lands first", () => {
    const { s: s0, ap, ids } = setup([lore]);
    onlyLands(s0, ap, [card("Island", "Basic Land — Island"), card("Island", "Basic Land — Island"), snowIsland, snowForest, snowForest, card("Forest", "Basic Land — Forest")]);
    const s = settle(passAll(planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0)));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "scry" });
    expect((s.pending as { cards: string[] }).cards).toHaveLength(3);
  });

  it("Tundra Fumarole: {C} for each {S}, snow mana itself, kept until end of turn", () => {
    const { s: s0, ap, opp, ids } = setup([fumarole]);
    onlyLands(s0, ap, [card("Mountain", "Basic Land — Mountain"), card("Mountain", "Basic Land — Mountain"), card("Snow-Covered Mountain", "Basic Snow Land — Mountain")]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = settle(passAll(planCast(s0, ap, ids[0]!, [target(b)])!.reduce((x, a) => act(x, a), s0)));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[ap]!.manaPool.C).toBe(1);
    // A snow sorcery made it: it's snow mana (CR 106.3), so it pays {S}.
    expect(manaFromPool(s, ap, "snow")).toMatchObject({ C: 1, W: 0, U: 0, B: 0, R: 0, G: 0 });
    // Through the end of main phase 1 and the combat steps.
    s = passAll(s);
    expect(s.step).not.toBe("main1");
    expect(s.players[ap]!.manaPool.C).toBe(1);
    const c = putOnBattlefield(s, ap, centaur);
    expect(planActivate(s, ap, c, 0)).toEqual([expect.objectContaining({ type: "activateAbility" })]);
  });

  it("kept mana is gone after the turn ends", () => {
    const { s: s0, ap } = setup([]);
    const s = s0;
    addMana(s, ap, ["R"], { keep: "turn" });
    // Still there in the end step.
    let t = passUntil(s, "end", ap);
    expect(t.players[ap]!.manaPool.R).toBe(1);
    t = passUntil(t, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(t.players[ap]!.manaPool.R).toBe(0);
    expect(t.players[ap]!.manaLots).toBeUndefined();
  });
});

function activateAll(s: GameState, pid: PlayerId, id: string): GameState {
  const plan = planActivate(s, pid, id, 0);
  expect(plan).not.toBeNull();
  return passAll(plan!.reduce((x, a) => act(x, a), s));
}
