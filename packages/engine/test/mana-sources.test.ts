// What mana remembers about its source (CR 106.3: the source of an ability's mana is the ability's source). Mana a
// triggered mana ability adds comes from that ability's source, so it's snow mana only if that source is snow (Glittering
// Frost's extra mana is, Utopia Sprawl's isn't); restricted mana from a snow source is still snow mana (CR 106.6 doesn't
// change what the mana is); mana kept until end of turn keeps what its source was; a permanent with an ice counter
// under Rimefeather Owl is snow, so a Treasure's mana is then both snow mana and mana from a Treasure. A spell remembers
// how much mana from creatures and artifacts was spent to cast it.

import { describe, expect, it } from "vitest";
import { act, card, forest, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { invalidateCharacteristics, isFullySupported, manaOptions, waitingOn, type Action, type CardDef, type GameState, type ManaType, type PlayerId } from "../src";
import { addMana, manaFromPool } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const frost = card("Glittering Frost", "Snow Enchantment — Aura", "{2}{G}", { keywords: ["Enchant"], oracleText: "Enchant land\nEnchanted land is snow.\nWhenever enchanted land is tapped for mana, its controller adds an additional one mana of any color." });
const sprawl = card("Utopia Sprawl", "Enchantment — Aura", "{G}", { keywords: ["Enchant"], oracleText: "Enchant Forest\nAs this Aura enters, choose a color.\nWhenever enchanted Forest is tapped for mana, its controller adds an additional one mana of the chosen color." });
const snowForest = card("Snow-Covered Forest", "Basic Snow Land — Forest", "", { oracleText: "({T}: Add {G}.)" });
const ziggurat = card("Ancient Ziggurat", "Land", "", { oracleText: "{T}: Add one mana of any color. Spend this mana only to cast a creature spell." });
const golem = card("Icehide Golem", "Snow Artifact Creature — Golem", "{S}", { power: "2", toughness: "2", oracleText: "({S} can be paid with one mana from a snow source.)" });
const owl = card("Rimefeather Owl", "Snow Creature — Bird", "{5}{U}{U}", { power: "*", toughness: "*", keywords: ["Flying"], oracleText: "Flying\nRimefeather Owl's power and toughness are each equal to the number of snow permanents on the battlefield.\n{1}{S}: Put an ice counter on target permanent.\nPermanents with ice counters on them are snow." });
const dragon = card("Rimescale Dragon", "Snow Creature — Dragon", "{5}{R}{R}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\n{2}{S}: Tap target creature and put an ice counter on it. ({S} can be paid with one mana from a snow source.)\nCreatures with ice counters on them don't untap during their controllers' untap steps." });
const treasure = card("Treasure", "Token Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this token: Add one mana of any color." });
const elves = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const giant = card("Hill Giant Test", "Creature — Giant", "{2}{G}", { power: "3", toughness: "3" });

/** Just these lands for `pid`: the setup's other lands are taken away. */
function onlyLands(s: GameState, pid: PlayerId, lands: CardDef[]): string[] {
  for (const id of [...s.battlefield]) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")) s.battlefield.splice(s.battlefield.indexOf(id), 1);
  return lands.map((l) => putOnBattlefield(s, pid, l));
}
const enchant = (s: GameState, pid: PlayerId, aura: CardDef, land: string, color?: "W" | "U" | "B" | "R" | "G") => {
  const a = putOnBattlefield(s, pid, aura);
  s.objects[a]!.attachedTo = land;
  if (color) s.objects[a]!.chosen = { color };
  invalidateCharacteristics(s);
  return a;
};
const tapFor = (pid: PlayerId, id: string, mana: ManaType, extra?: ManaType[]): Action => ({ type: "activateMana", player: pid, objectId: id, mana, ...(extra ? { extra } : {}) });
const snowOf = (s: GameState, pid: PlayerId) => Object.values(manaFromPool(s, pid, "snow")).reduce((a, b) => a + b, 0);
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("what mana remembers about its source", () => {
  it("parses", () => supported(frost, sprawl, ziggurat, golem, owl, dragon));

  it("Glittering Frost: the enchanted land is snow, and the Aura's extra mana is snow mana too (it's a snow Aura)", () => {
    const { s: s0, ap } = setup([]);
    const [f] = onlyLands(s0, ap, [forest]);
    enchant(s0, ap, frost, f!);
    expect(s0.cards[s0.objects[f!]!.cardId]!.supertypes).not.toContain("Snow");
    expect(manaOptions(s0, s0.objects[f!]!).find((x) => x.extra?.[0] === "U")?.snow).toEqual(["G", "U"]);
    const s = act(s0, tapFor(ap, f!, "G", ["U"]));
    expect(manaFromPool(s, ap, "snow")).toMatchObject({ G: 1, U: 1 });
  });

  it("Utopia Sprawl on a Snow-Covered Forest: the land's mana is snow mana, the Aura's isn't (CR 106.3)", () => {
    const { s: s0, ap } = setup([]);
    const [f] = onlyLands(s0, ap, [snowForest]);
    enchant(s0, ap, sprawl, f!, "U");
    expect(manaOptions(s0, s0.objects[f!]!)[0]?.snow).toEqual(["G"]);
    const s = act(s0, tapFor(ap, f!, "G"));
    expect(s.players[ap]!.manaPool).toMatchObject({ G: 1, U: 1 });
    expect(manaFromPool(s, ap, "snow")).toMatchObject({ G: 1, U: 0 });
  });

  it("restricted mana from a snow source is snow mana: Ancient Ziggurat under Glittering Frost pays Icehide Golem's {S}", () => {
    const { s: s0, ap, ids } = setup([golem, card("Shock Test", "Instant", "{R}", { oracleText: "~ deals 2 damage to any target." })]);
    const [z] = onlyLands(s0, ap, [ziggurat]);
    enchant(s0, ap, frost, z!);
    let s = act(s0, tapFor(ap, z!, "G", ["R"]));
    expect(snowOf(s, ap)).toBe(2);
    expect(s.players[ap]!.manaLots).toEqual(expect.arrayContaining([expect.objectContaining({ mana: "G", n: 1, from: ["snow"], only: expect.objectContaining({ text: "Spend this mana only to cast a creature spell." }) })]));
    // The Golem takes the restricted snow {G}, leaving the free snow {R} for anything.
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]! });
    expect(s.objects[ids[0]!]!.spent).toEqual({ G: 1, snow: { G: 1 } });
    expect(s.players[ap]!.manaLots).toEqual([{ mana: "R", n: 1, from: ["snow"] }]);
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("Rimefeather Owl: a Treasure with an ice counter is snow, so its mana is snow mana and mana from a Treasure", () => {
    const { s: s0, ap, ids } = setup([golem]);
    onlyLands(s0, ap, []);
    putOnBattlefield(s0, ap, owl);
    const t = putOnBattlefield(s0, ap, treasure);
    s0.objects[t]!.counters.ice = 1;
    invalidateCharacteristics(s0);
    let s = act(s0, tapFor(ap, t, "B"));
    expect(manaFromPool(s, ap, "snow")).toMatchObject({ B: 1 });
    expect(manaFromPool(s, ap, "treasure")).toMatchObject({ B: 1 });
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]! });
    expect(s.objects[ids[0]!]!.treasureSpent).toBe(1);
    expect(s.objects[ids[0]!]!.spent).toMatchObject({ B: 1, snow: { B: 1 }, from: { treasure: 1, artifact: 1 } });
  });

  it("Rimescale Dragon: a creature with an ice counter doesn't untap", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, dragon);
    const bear = putOnBattlefield(s0, opp, card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    s0.objects[bear]!.tapped = true;
    s0.objects[bear]!.counters.ice = 1;
    invalidateCharacteristics(s0);
    const s = passUntil(s0, "main1", opp);
    expect(s.objects[bear]!.tapped).toBe(true);
  });

  it("mana kept until end of turn stays mana from a Treasure as steps end", () => {
    const { s: s0, ap } = setup([]);
    addMana(s0, ap, ["R"], { from: ["artifact", "treasure"], keep: "turn" });
    const s = passUntil(s0, "end", ap);
    expect(s.players[ap]!.manaPool.R).toBe(1);
    expect(manaFromPool(s, ap, "treasure")).toMatchObject({ R: 1 });
  });

  it("a spell remembers how much mana from creatures was spent to cast it", () => {
    const { s: s0, ap, ids } = setup([giant]);
    const [f, f2] = onlyLands(s0, ap, [forest, forest]);
    const e1 = putOnBattlefield(s0, ap, elves);
    let s = act(s0, tapFor(ap, e1, "G"));
    s = act(s, tapFor(ap, f!, "G"));
    s = act(s, tapFor(ap, f2!, "G"));
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]! });
    expect(s.objects[ids[0]!]!.spent).toMatchObject({ G: 3, from: { creature: 1 } });
    expect(passAll(s).players[ap]!.manaLots).toBeUndefined();
  });
});
