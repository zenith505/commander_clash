// Gate, Desert and Cave as land types in filters and counts ("for each Gate you control", "sacrifice a Desert", "if you
// control three or more Deserts", "a basic land card or a Desert card"), and "the number of opponents you have":
// opponents still in the game (CR 102.3, 800.4a).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, objHasKeyword, planActivate, power, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const archway = card("Archway Angel", "Creature — Angel", "{5}{W}", { power: "3", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, you gain 2 life for each Gate you control." });
const sergeant = card("Garrison Sergeant", "Creature — Lizard Soldier", "{3}{R}{W}", { power: "3", toughness: "3", oracleText: "This creature has double strike as long as you control a Gate." });
const promise = card("Hour of Promise", "Sorcery", "{4}{G}", { oracleText: "Search your library for up to two land cards, put them onto the battlefield tapped, then shuffle. Then if you control three or more Deserts, create two 2/2 black Zombie creature tokens." });
const dunes = card("Shefet Dunes", "Land — Desert", "", { oracleText: "{T}: Add {C}.\n{T}, Pay 1 life: Add {W}.\n{2}{W}{W}, {T}, Sacrifice a Desert: Creatures you control get +1/+1 until end of turn. Activate only as a sorcery." });
const greenblade = card("Outcaster Greenblade", "Creature — Human Mercenary", "{2}{G}", { power: "1", toughness: "2", oracleText: "When this creature enters, search your library for a basic land card or a Desert card, reveal it, put it into your hand, then shuffle.\nThis creature gets +1/+1 for each Desert you control." });
const sphinx = card("Inspired Sphinx", "Creature — Sphinx", "{5}{U}{U}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, draw cards equal to the number of opponents you have.\n{3}{U}: Create a 1/1 colorless Thopter artifact creature token with flying." });
const troll = card("Gluttonous Troll", "Creature — Troll", "{2}{B}{G}", { power: "3", toughness: "3", keywords: ["Food", "Trample"], oracleText: "Trample\nWhen this creature enters, create a number of Food tokens equal to the number of opponents you have. (Food tokens are artifacts with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\n{1}{G}, Sacrifice another nonland permanent: This creature gets +2/+2 until end of turn." });
const ablaze = card("Gates Ablaze", "Sorcery", "{2}{R}", { oracleText: "Gates Ablaze deals X damage to each creature, where X is the number of Gates you control." });
const guildgate = card("Azorius Guildgate", "Land — Gate", "", { oracleText: "This land enters tapped.\n{T}: Add {W} or {U}." });
const desert = card("Desert", "Land — Desert", "", { oracleText: "{T}: Add {C}.\n{T}: This land deals 1 damage to target attacking creature. Activate only during the end of combat step." });

const onField = (s: GameState, id: string) => s.battlefield.includes(id);
function resolve(s: GameState) {
  for (let i = 0; i < 30 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("Gates, Deserts and Caves", () => {
  it("compiles them", () => {
    for (const d of [archway, sergeant, promise, dunes, greenblade, sphinx, troll, ablaze]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Archway Angel gains 2 life for each Gate you control, only yours", () => {
    let { s, ap, opp, ids } = setup([archway]);
    putOnBattlefield(s, ap, guildgate);
    putOnBattlefield(s, ap, guildgate);
    putOnBattlefield(s, opp, guildgate);
    const life = s.players[ap]!.life;
    s = resolve(cast(s, ap, ids[0]!));
    expect(s.players[ap]!.life).toBe(life + 4);
  });

  it("Garrison Sergeant has double strike only while you control a Gate", () => {
    let { s, ap } = setup([]);
    const sg = putOnBattlefield(s, ap, sergeant);
    expect(objHasKeyword(s, s.objects[sg]!, "Double strike")).toBe(false);
    putOnBattlefield(s, ap, guildgate);
    expect(objHasKeyword(s, s.objects[sg]!, "Double strike")).toBe(true);
  });

  it("Gates Ablaze deals damage equal to your Gates to each creature", () => {
    let { s, ap, opp, ids } = setup([ablaze]);
    putOnBattlefield(s, ap, guildgate);
    putOnBattlefield(s, ap, guildgate);
    const b = putOnBattlefield(s, opp, bear());
    const big = putOnBattlefield(s, opp, bear({ name: "Big Bear", power: "5", toughness: "5" }));
    s = cast(s, ap, ids[0]!);
    expect(onField(s, b)).toBe(false);
    expect(s.objects[big]!.damage).toBe(2);
  });

  it("Hour of Promise makes Zombies only with three or more Deserts, counting the lands it found", () => {
    let { s, ap, ids } = setup([promise]);
    putOnBattlefield(s, ap, desert);
    // Two Deserts on top of the library to find.
    const lib = s.players[ap]!.library;
    const found = [desert, dunes].map((d) => {
      const id = putOnBattlefield(s, ap, d);
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "library";
      lib.unshift(id);
      return id;
    });
    s = cast(s, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = passAll(act(s, { type: "searchLibrary", player: ap, found }));
    const zombies = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(zombies).toHaveLength(2);
  });

  it("Hour of Promise with fewer than three Deserts makes none", () => {
    let { s, ap, ids } = setup([promise]);
    putOnBattlefield(s, ap, desert);
    s = cast(s, ap, ids[0]!);
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken)).toHaveLength(0);
  });

  it("Shefet Dunes can sacrifice itself as the Desert, and pumps your creatures", () => {
    let { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, dunes);
    const b = putOnBattlefield(s, ap, bear());
    const plan = planActivate(s, ap, d, 0, undefined, undefined, undefined, undefined, { sacrifice: [d] });
    expect(plan).not.toBeNull();
    for (const a of plan!) s = act(s, a);
    s = resolve(s);
    expect(onField(s, d)).toBe(false);
    expect(power(s, s.objects[b]!)).toBe(3);
    // A Gate isn't a Desert.
    const gate = putOnBattlefield(s, ap, guildgate);
    const d2 = putOnBattlefield(s, ap, dunes);
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: d2, index: 0, costs: { sacrifice: [gate] } })).toThrow();
  });

  it("Outcaster Greenblade gets +1/+1 for each Desert you control", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, greenblade);
    expect(power(s, s.objects[g]!)).toBe(1);
    putOnBattlefield(s, ap, desert);
    putOnBattlefield(s, ap, dunes);
    expect(power(s, s.objects[g]!)).toBe(3);
  });
});

describe("the number of opponents you have", () => {
  it("Inspired Sphinx draws one card for each opponent still in the game", () => {
    let { s, ap, ids } = setup([sphinx]);
    const hand = s.players[ap]!.hand.length;
    s = resolve(cast(s, ap, ids[0]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });

  it("an opponent who left the game isn't counted (Gluttonous Troll)", () => {
    let { s, ap, opp, ids } = setup([troll]);
    s.players[opp]!.lost = true;
    s = resolve(cast(s, ap, ids[0]!));
    const food = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(food).toHaveLength(2);
  });
});
