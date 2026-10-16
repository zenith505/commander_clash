// Rolling dice (CR 706): results tables (706.3a), modifiers and natural results (706.2), "roll that many dice plus one and
// ignore the lowest roll" (706.6: the ignored roll never happened), and the abilities that trigger on rolls (rulings on
// Mr. House and Netherese Puzzle-Ward: once for each die that does).

import { describe, expect, it } from "vitest";
import { act, activate, card, cast, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";
import { nextRandom } from "../src/rng";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** The next dice rolled come up `values`, in order (the game's seeded random numbers, CR 706.1b). */
function rig(s: GameState, sides: number, values: number[]) {
  for (let st = 1; st < 50_000_000; st++) {
    const t = { rngState: st };
    if (values.every((v) => 1 + Math.floor(nextRandom(t) * sides) === v)) {
      s.rngState = st;
      return;
    }
  }
  throw new Error("no such seed");
}
const tokens = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]?.name === `${name} Token`);

// Real oracle text (Scryfall).
const contact = card("Contact Other Plane", "Instant", "{3}{U}", { keywords: ["Scry"], oracleText: "Roll a d20.\n1—9 | Draw two cards.\n10—19 | Scry 2, then draw two cards.\n20 | Scry 3, then draw three cards." });
const drive = card("Recruitment Drive", "Sorcery", "{2}{W}", { oracleText: "Roll a d20.\n1—9 | Create two 1/1 white Soldier creature tokens.\n10—19 | Create two 2/2 white Knight creature tokens.\n20 | Create three 2/2 white Knight creature tokens." });
const house = card("Mr. House, President and CEO", "Legendary Artifact Creature — Human", "{R}{W}{B}", { power: "0", toughness: "4", oracleText: "Whenever you roll a 4 or higher, create a 3/3 colorless Robot artifact creature token. If you rolled 6 or higher, instead create that token and a Treasure token.\n{4}, {T}: Roll a six-sided die plus an additional six-sided die for each mana from Treasures spent to activate this ability." });
const pixie = card("Pixie Guide", "Creature — Faerie", "{1}{U}", { power: "1", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nGrant an Advantage — If you would roll one or more dice, instead roll that many dice plus one and ignore the lowest roll." });
const dwarf = card("Brazen Dwarf", "Creature — Dwarf Shaman", "{1}{R}", { power: "1", toughness: "3", oracleText: "Whenever you roll one or more dice, this creature deals 1 damage to each opponent." });
const crit = card("Critical Hit", "Instant", "{1}{R}", { oracleText: "Target creature gains double strike until end of turn.\nWhen you roll a natural 20, return this card from your graveyard to your hand. (A natural 20 is a roll that displays 20 on the die.)" });
const goblins = card("Swarming Goblins", "Creature — Goblin", "{4}{R}", { power: "4", toughness: "3", oracleText: "When this creature enters, roll a d20.\n1—9 | Create a 1/1 red Goblin creature token.\n10—19 | Create two of those tokens.\n20 | Create three of those tokens." });
const copper = card("Ancient Copper Dragon", "Creature — Elder Dragon", "{4}{R}{R}", { power: "6", toughness: "5", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature deals combat damage to a player, roll a d20. You create a number of Treasure tokens equal to the result." });
const ward = card("Netherese Puzzle-Ward", "Enchantment", "{3}{U}", { keywords: ["Scry"], oracleText: "Focus Beam — At the beginning of your upkeep, roll a d4. Scry X, where X is the result.\nPerfect Illumination — Whenever you roll a die's highest natural result, draw a card." });
const portent = card("Diviner's Portent", "Instant", "{X}{U}{U}{U}", { keywords: ["Scry"], oracleText: "Roll a d20 and add the number of cards in your hand.\n1—14 | Draw X cards.\n15+ | Scry X, then draw X cards." });
const wyll = card("Wyll, Blade of Frontiers", "Legendary Creature — Human Warlock", "{1}{R}", { power: "1", toughness: "1", keywords: ["Choose a background"], oracleText: "If you would roll one or more dice, instead roll that many dice plus one and ignore the lowest roll.\nWhenever you roll one or more dice, put a +1/+1 counter on Wyll.\nChoose a Background (You can have a Background as a second commander.)" });
const morningstar = card("Goblin Morningstar", "Artifact — Equipment", "{1}{R}", { keywords: ["Equip"], oracleText: "Equipped creature gets +1/+0 and has trample.\nEquip {1}{R}\nWhen this Equipment enters, roll a d20.\n1—9 | Create a 1/1 red Goblin creature token.\n10—20 | Create a 1/1 red Goblin creature token, then attach this Equipment to it." });
const treasure = card("Treasure", "Token Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this token: Add one mana of any color." });

/** Push `def`'s trigger `index` from `id` and let it resolve. */
function trigger(s: GameState, pid: PlayerId, id: string, index = 0, def?: CardDef) {
  s.triggerQueue.push({ sourceId: id, sourceCardId: (def ?? s.cards[s.objects[id]!.cardId]!).oracleId, controller: pid, index, sourceZc: s.objects[id]!.zoneChanges ?? 0 });
  return settle(s);
}

describe("rolling dice", () => {
  it("parse", () => {
    supported(contact, drive, house, pixie, dwarf, crit, goblins, copper, ward, portent, wyll, morningstar);
    expect(compileCard(house).triggers[0]).toMatchObject({ event: "youRollDie", rolls: { min: 4 } });
    expect(compileCard(crit).triggers[0]).toMatchObject({ event: "youRollDie", rolls: { natural: 20 }, zone: "graveyard" });
    expect(compileCard(pixie).rollAdvantage).toBe(true);
  });

  it("a results table: the row the result is in (CR 706.3a)", () => {
    for (const [roll, soldiers, knights] of [[9, 2, 0], [10, 0, 2], [20, 0, 3]] as const) {
      const { s: s0, ap, ids } = setup([drive]);
      rig(s0, 20, [roll]);
      const s = cast(s0, ap, ids[0]!);
      expect(tokens(s, ap, "Soldier"), `rolled ${roll}`).toHaveLength(soldiers);
      expect(tokens(s, ap, "Knight"), `rolled ${roll}`).toHaveLength(knights);
      expect(s.log.some((l) => l.text.includes(`rolls a d20 for Recruitment Drive: ${roll}.`))).toBe(true);
    }
  });

  it("a row's instructions in order, with choices: scry 3, then draw three", () => {
    const { s: s0, ap, ids } = setup([contact]);
    rig(s0, 20, [20]);
    const hand = s0.players[ap]!.hand.length;
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "scry", player: ap });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: (s.pending as { cards: string[] }).cards, away: [] }));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });

  it("a modifier: the result is the roll plus the cards in your hand; X is the spell's", () => {
    const { s: s0, ap, ids } = setup([portent]);
    rig(s0, 20, [10]);
    // 10 + the cards in hand once it's cast (seven, with Diviner's Portent on the stack) = 17: "15+".
    const hand = s0.players[ap]!.hand.length - 1;
    expect(hand).toBeGreaterThanOrEqual(5);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, undefined, undefined, undefined, 2)!) s = act(s, a);
    s = settle(s);
    expect(s.log.some((l) => l.text.includes(`10 + ${hand} = ${10 + hand}`))).toBe(true);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "scry", player: ap });
  });

  it("Swarming Goblins: 'two of those tokens' are the row above's", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, goblins);
    rig(s0, 20, [15]);
    const s = trigger(s0, ap, g);
    const made = tokens(s, ap, "Goblin");
    expect(made).toHaveLength(2);
    expect(s.cards[s.objects[made[0]!]!.cardId]).toMatchObject({ power: "1", toughness: "1", colors: ["R"] });
  });

  it("Goblin Morningstar on 10 or more: the token, and the Equipment attached to it", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, morningstar);
    rig(s0, 20, [12]);
    const s = trigger(s0, ap, m);
    const [gob] = tokens(s, ap, "Goblin");
    expect(s.objects[m]!.attachedTo).toBe(gob);
  });

  it("Ancient Copper Dragon: Treasures equal to the result", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, copper);
    rig(s0, 20, [7]);
    const s = trigger(s0, ap, d);
    expect(tokens(s, ap, "Treasure")).toHaveLength(7);
  });

  it("Mr. House: a 4 makes a Robot, a 6 a Robot and a Treasure, a 3 nothing", () => {
    for (const [roll, robots, treasures] of [[3, 0, 0], [4, 1, 0], [6, 1, 1]] as const) {
      const { s: s0, ap } = setup([]);
      const h = putOnBattlefield(s0, ap, house);
      rig(s0, 6, [roll]);
      const s = settle(activate(s0, ap, h, 0));
      expect(tokens(s, ap, "Robot"), `rolled ${roll}`).toHaveLength(robots);
      expect(tokens(s, ap, "Treasure"), `rolled ${roll}`).toHaveLength(treasures);
    }
  });

  it("Mr. House: an additional die for each mana from Treasures spent, each die triggering on its own", () => {
    const { s: s0, ap } = setup([]);
    // No lands: four Treasures pay for it.
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap) moveObject(s0, id, "graveyard");
    const h = putOnBattlefield(s0, ap, house);
    for (let i = 0; i < 4; i++) {
      const t = putOnBattlefield(s0, ap, treasure);
      s0.objects[t]!.isToken = true;
    }
    rig(s0, 6, [6, 4, 2, 5, 1]);
    const s = settle(activate(s0, ap, h, 0));
    expect(s.log.some((l) => /rolls 5 d6 for .*: 6 \+ 4 \+ 2 \+ 5 \+ 1 = 18/.test(l.text))).toBe(true);
    expect(tokens(s, ap, "Robot")).toHaveLength(3);
    expect(tokens(s, ap, "Treasure")).toHaveLength(1);
  });

  it("Pixie Guide: one more die, the lowest ignored; the roll triggers 'one or more dice' once", () => {
    const { s: s0, ap, ids, opp } = setup([drive]);
    putOnBattlefield(s0, ap, pixie);
    putOnBattlefield(s0, ap, dwarf);
    rig(s0, 20, [3, 17]);
    const life = s0.players[opp]!.life;
    const s = settle(cast(s0, ap, ids[0]!));
    expect(tokens(s, ap, "Knight")).toHaveLength(2); // 17
    expect(s.players[opp]!.life).toBe(life - 1);
  });

  it("Wyll and Pixie Guide: two more dice, the two lowest ignored", () => {
    const { s: s0, ap, ids } = setup([drive]);
    putOnBattlefield(s0, ap, pixie);
    const w = putOnBattlefield(s0, ap, wyll);
    rig(s0, 20, [20, 2, 5]);
    const s = settle(cast(s0, ap, ids[0]!));
    expect(tokens(s, ap, "Knight")).toHaveLength(3);
    expect(s.objects[w]!.counters["+1/+1"]).toBe(1);
  });

  it("Critical Hit returns from the graveyard on a natural 20, not on a modified 20", () => {
    const { s: s0, ap, ids } = setup([drive]);
    const c = putOnBattlefield(s0, ap, crit);
    moveObject(s0, c, "graveyard");
    rig(s0, 20, [20]);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.objects[c]!.zone).toBe("hand");
    // Diviner's Portent: a 13 plus six cards in hand is 19, not a natural 20.
    const { s: t0, ap: bp, ids: pids } = setup([portent]);
    const c2 = putOnBattlefield(t0, bp, crit);
    moveObject(t0, c2, "graveyard");
    rig(t0, 20, [13]);
    s = settle(cast(t0, bp, pids[0]!));
    while (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: bp, top: s.pending.cards, away: [] }));
    expect(s.objects[c2]!.zone).toBe("graveyard");
  });

  it("Netherese Puzzle-Ward: a natural 4 on the d4, scry 4 and then draw", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, ward);
    rig(s0, 4, [4]);
    const hand = s0.players[ap]!.hand.length;
    let s = trigger(s0, ap, w);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "scry", player: ap });
    expect((s.pending as { cards: string[] }).cards).toHaveLength(4);
    s = settle(act(s, { type: "arrangeTop", player: ap, top: (s.pending as { cards: string[] }).cards, away: [] }));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});
