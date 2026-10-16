// Text hoping some color was spent to cast it, where meeting the hope would hurt the caster now (CR 601.2h: the caster
// chooses which mana pays): autopay and the payment keep that color off the spell, and spend it where it helps. Rolling
// Spoil's "all creatures get -1/-1" with the caster's own 1/1s on the battlefield, Firespout's damage to the caster's own
// creatures. Bots pay with the same autopay.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const spoil = card("Rolling Spoil", "Sorcery", "{2}{G}{G}", { oracleText: "Destroy target land. If {B} was spent to cast this spell, all creatures get -1/-1 until end of turn." });
const firespout = card("Firespout", "Sorcery", "{2}{R/G}", { oracleText: "Firespout deals 3 damage to each creature without flying if {R} was spent to cast this spell and 3 damage to each creature with flying if {G} was spent to cast this spell. (Do both if {R}{G} was spent.)" });
const hooligan = card("Tin Street Hooligan", "Creature — Goblin Rogue", "{1}{R}", { power: "2", toughness: "1", oracleText: "When this creature enters, if {G} was spent to cast it, destroy target artifact." });
const elf = (name = "Llanowar Elves") => card(name, "Creature — Elf Druid", "{G}", { power: "1", toughness: "1" });
const bird = () => card("Birds of Paradise", "Creature — Bird", "{G}", { power: "0", toughness: "1", keywords: ["Flying"], oracleText: "Flying" });
const giant = () => card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const rock = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}." });

const name = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const tapped = (s: GameState, plan: ReturnType<typeof planCast>) => (plan ?? []).flatMap((a) => (a.type === "activateMana" ? [name(s, a.objectId)] : [])).sort();
const landOf = (s: GameState, pid: PlayerId) => putOnBattlefield(s, pid, card("Wastes", "Basic Land"));
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  for (const a of plan!) s = act(s, a);
  for (let i = 0; i < 10 && (s.stack.length || s.pending); i++) s = passAll(s);
  return s;
};

describe("hopes about the mana spent that would hurt the caster", () => {
  it("compiles them", () => [spoil, firespout, hooligan].forEach((d: CardDef) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Rolling Spoil with the caster's own 1/1s: no Swamp, and the elves live", () => {
    let { s, ap, ids, opp } = setup([spoil]);
    const mine = [putOnBattlefield(s, ap, elf()), putOnBattlefield(s, ap, elf("Fyndhorn Elves"))];
    putOnBattlefield(s, opp, giant());
    const plan = planCast(s, ap, ids[0]!, [target(landOf(s, opp))]);
    expect(tapped(s, plan)).not.toContain("Swamp");
    s = run(s, plan);
    for (const id of mine) expect(s.objects[id]!.zone).toBe("battlefield");
  });

  it("Rolling Spoil with the opponents' 1/1s and none of the caster's: a Swamp pays, and their elves die", () => {
    let { s, ap, ids, opp } = setup([spoil]);
    const theirs = [putOnBattlefield(s, opp, elf()), putOnBattlefield(s, opp, elf("Fyndhorn Elves"))];
    putOnBattlefield(s, ap, giant());
    const plan = planCast(s, ap, ids[0]!, [target(landOf(s, opp))]);
    expect(tapped(s, plan)).toContain("Swamp");
    s = run(s, plan);
    for (const id of theirs) expect(s.objects[id]!.zone).toBe("graveyard");
  });

  it("with {B} already floating, the payment spends other mana on Rolling Spoil's generic part", () => {
    let { s, ap, ids, opp } = setup([spoil]);
    const mine = putOnBattlefield(s, ap, elf());
    const lands = (n: string) => s.battlefield.filter((id) => s.objects[id]!.controller === ap && name(s, id) === n);
    s = act(s, { type: "activateMana", player: ap, objectId: lands("Swamp")[0]!, mana: "B" });
    for (const f of lands("Forest")) s = act(s, { type: "activateMana", player: ap, objectId: f, mana: "G" });
    s = act(s, { type: "activateMana", player: ap, objectId: lands("Mountain")[0]!, mana: "R" });
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]!, targets: [target(landOf(s, opp))] });
    expect(s.objects[ids[0]!]!.spent?.B ?? 0).toBe(0);
    s = passAll(s);
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.players[ap]!.manaPool.B).toBe(1);
  });

  it("Firespout with the caster's ground creatures and the opponents' flyers: green for {R/G}, no red", () => {
    let { s, ap, ids, opp } = setup([firespout]);
    const mine = [putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear())];
    const theirs = [putOnBattlefield(s, opp, bird()), putOnBattlefield(s, opp, bird())];
    const plan = planCast(s, ap, ids[0]!);
    expect(tapped(s, plan)).not.toContain("Mountain");
    expect(tapped(s, plan)).toContain("Forest");
    s = run(s, plan);
    for (const id of mine) expect(s.objects[id]!.zone).toBe("battlefield");
    for (const id of theirs) expect(s.objects[id]!.zone).toBe("graveyard");
  });

  it("Firespout with the opponents' ground creatures and the caster's flyers: red, no green", () => {
    let { s, ap, ids, opp } = setup([firespout]);
    const mine = [putOnBattlefield(s, ap, bird())];
    const theirs = [putOnBattlefield(s, opp, bear()), putOnBattlefield(s, opp, bear())];
    const plan = planCast(s, ap, ids[0]!);
    expect(tapped(s, plan)).not.toContain("Forest");
    s = run(s, plan);
    expect(s.objects[mine[0]!]!.zone).toBe("battlefield");
    for (const id of theirs) expect(s.objects[id]!.zone).toBe("graveyard");
  });

  it("Tin Street Hooligan with only the caster's artifact around: no green, so the Mind Stone stays", () => {
    let { s, ap, ids } = setup([hooligan]);
    const stone = putOnBattlefield(s, ap, rock);
    s.objects[stone]!.tapped = true; // not a mana source for this
    const plan = planCast(s, ap, ids[0]!);
    expect(tapped(s, plan)).not.toContain("Forest");
    s = run(s, plan);
    expect(s.objects[stone]!.zone).toBe("battlefield");
  });

  it("Tin Street Hooligan with an opponent's artifact: green is spent", () => {
    const { s, ap, ids, opp } = setup([hooligan]);
    putOnBattlefield(s, opp, rock);
    expect(tapped(s, planCast(s, ap, ids[0]!))).toContain("Forest");
  });
});
