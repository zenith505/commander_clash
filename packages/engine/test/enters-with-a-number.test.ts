// "~ enters with a number of [kind] counters on it equal to [count]" (CR 614.1c: a replacement effect, counted before it's on
// the battlefield): the greatest number of creatures a player controls (Investigator's Journal), the greatest number of
// cards an opponent drew this turn (Thought Sponge), the amount of mana spent to cast it (Kurbis), and counts that already
// work elsewhere (creatures that died this turn, creature cards in graveyards, "one plus the number of other creatures").

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, putOnBattlefield, setup } from "./helpers";
import { moveObject } from "../src/game";
import { isFullySupported, planCast, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const journal = card("Investigator's Journal", "Artifact — Book Clue", "{2}", { oracleText: "This artifact enters with a number of suspect counters on it equal to the greatest number of creatures a player controls.\n{2}, {T}, Remove a suspect counter from this artifact: Draw a card.\n{2}, Sacrifice this artifact: Draw a card." });
const sponge = card("Thought Sponge", "Creature — Sponge", "{3}{U}", { power: "1", toughness: "1", keywords: ["Flash"], oracleText: "Flash\nThis creature enters with a number of +1/+1 counters on it equal to the greatest number of cards an opponent has drawn this turn.\nWhen this creature dies, draw cards equal to its power." });
const chauffeur = card("Boss's Chauffeur", "Creature — Elf Citizen", "{4}{W}", { power: "0", toughness: "0", keywords: ["Alliance"], oracleText: "This creature enters with a number of +1/+1 counters on it equal to one plus the number of other creatures you control.\nAlliance — Whenever another creature you control enters, put a +1/+1 counter on this creature.\nWhen this creature dies, create a 1/1 green and white Citizen creature token for each +1/+1 counter on it." });
const devourer = card("Bone Devourer", "Creature — Dragon", "{3}{B}", { power: "2", toughness: "2", keywords: ["Flying", "Flash"], oracleText: "Flash\nFlying\nThis creature enters with a number of +1/+1 counters on it equal to the number of creatures that died this turn.\nWhen this creature dies, you draw X cards and you lose X life, where X is the number of +1/+1 counters on it." });
const lurcher = card("Rhizome Lurcher", "Creature — Fungus Zombie", "{2}{B}{G}", { power: "2", toughness: "2", keywords: ["Undergrowth"], oracleText: "Undergrowth — This creature enters with a number of +1/+1 counters on it equal to the number of creature cards in your graveyard." });
const scavenger = card("Undergrowth Scavenger", "Creature — Fungus Horror", "{3}{G}", { power: "0", toughness: "0", oracleText: "This creature enters with a number of +1/+1 counters on it equal to the number of creature cards in all graveyards." });
// Kurbis' first line (its second, a prevention ability, isn't supported yet).
const kurbisLine = card("Kurbis, Harvest Celebrant", "Legendary Creature — Treefolk", "{X}{G}{G}", { power: "0", toughness: "0", supertypes: ["Legendary"], oracleText: "Kurbis enters with a number of +1/+1 counters on it equal to the amount of mana spent to cast it." });

const plus = (s: GameState, id: string) => s.objects[id]!.counters["+1/+1"] ?? 0;
const castX = (s: GameState, pid: PlayerId, id: string, x: number) => {
  const plan = planCast(s, pid, id, undefined, undefined, undefined, x);
  if (!plan) throw new Error("can't cast");
  for (const a of plan) s = act(s, a);
  return passAll(s);
};

describe("enters with a number of counters equal to ...", () => {
  it("compiles them", () => supported(journal, sponge, chauffeur, devourer, lurcher, scavenger, kurbisLine));

  it("Investigator's Journal: the most creatures any one player controls, whoever it is", () => {
    let { s, ap, opp, ids } = setup([journal]);
    putOnBattlefield(s, ap, bear());
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, bear());
    s = cast(s, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.counters.suspect).toBe(3);
  });

  it("Thought Sponge: the most cards one opponent drew this turn", () => {
    let { s, ap, ids } = setup([sponge]);
    const [b, c] = s.turnOrder.filter((p) => p !== ap);
    s.players[b!]!.draws = { turn: s.turn, n: 2 };
    s.players[c!]!.draws = { turn: s.turn, n: 4 };
    s.players[ap]!.draws = { turn: s.turn, n: 6 }; // our own don't count
    s = cast(s, ap, ids[0]!);
    expect(plus(s, ids[0]!)).toBe(4);
  });

  it("Boss's Chauffeur counts the others, not itself; Bone Devourer the creatures that died", () => {
    let { s, ap, ids } = setup([chauffeur]);
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, bear());
    s = cast(s, ap, ids[0]!);
    expect(plus(s, ids[0]!)).toBe(3);
    const two = setup([devourer, devourer]);
    s = cast(two.s, two.ap, two.ids[0]!);
    expect(plus(s, two.ids[0]!)).toBe(0); // nothing died this turn
    const b = putOnBattlefield(s, two.opp, bear());
    s.objects[b]!.damage = 5;
    for (const id of s.battlefield) s.objects[id]!.tapped = false;
    s = cast(s, two.ap, two.ids[1]!); // the bear dies to state-based actions first (CR 704.5g)
    expect(plus(s, two.ids[1]!)).toBe(1);
  });

  it("Rhizome Lurcher counts your graveyard, Undergrowth Scavenger all of them (cards only)", () => {
    let { s, ap, opp, ids } = setup([lurcher, scavenger]);
    moveObject(s, putOnBattlefield(s, ap, bear()), "graveyard");
    moveObject(s, putOnBattlefield(s, opp, bear()), "graveyard");
    moveObject(s, putOnBattlefield(s, opp, bear()), "graveyard");
    s = cast(s, ap, ids[0]!);
    expect(plus(s, ids[0]!)).toBe(1);
    s = cast(s, ap, ids[1]!);
    expect(plus(s, ids[1]!)).toBe(3);
  });

  it("Kurbis: the mana spent to cast it, X included; none when it isn't cast", () => {
    let { s, ap, ids } = setup([kurbisLine]);
    s = castX(s, ap, ids[0]!, 3);
    expect(plus(s, ids[0]!)).toBe(5);
    const again = putOnBattlefield(s, ap, kurbisLine);
    moveObject(s, again, "graveyard");
    moveObject(s, again, "battlefield");
    expect(plus(s, again)).toBe(0);
  });
});
