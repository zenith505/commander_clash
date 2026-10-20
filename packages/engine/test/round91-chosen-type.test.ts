// "This creature is the chosen type in addition to its other types" (round 91: Metallic Mimic, Roaming Throne): the
// creature type chosen as it entered (CR 614.12), added in the type-changing layer (CR 613.1d). Metallic Mimic's "Each
// other creature you control of the chosen type enters with an additional +1/+1 counter on it" (CR 614.1c), Roaming
// Throne's "If a triggered ability of another creature you control of the chosen type triggers, it triggers an
// additional time" (CR 603.2d).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const mimic = card("Metallic Mimic", "Artifact Creature — Shapeshifter", "{2}", { power: "2", toughness: "1", oracleText: "As this creature enters, choose a creature type.\nThis creature is the chosen type in addition to its other types.\nEach other creature you control of the chosen type enters with an additional +1/+1 counter on it." });
const throne = card("Roaming Throne", "Artifact Creature — Golem", "{4}", { power: "4", toughness: "4", keywords: ["Ward"], oracleText: "Ward {2}\nAs this creature enters, choose a creature type.\nThis creature is the chosen type in addition to its other types.\nIf a triggered ability of another creature you control of the chosen type triggers, it triggers an additional time." });
function settle(s: GameState): GameState {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const scout = (name: string, type: string) => card(name, `Creature — ${type}`, "{1}{G}", { power: "1", toughness: "1", oracleText: "When this creature enters, you gain 1 life." });

describe("the chosen creature type", () => {
  it("parse", () => {
    for (const d of [mimic, throne]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Metallic Mimic is the chosen type, and other creatures of it enter with a +1/+1 counter", () => {
    const { s: s0, ap, ids } = setup([bear(), card("Elvish Mystic", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1" })]);
    const m = putOnBattlefield(s0, ap, mimic);
    expect(characteristics(s0, s0.objects[m]!).subtypes).toEqual(["Shapeshifter"]);
    s0.objects[m]!.chosen = { type: "Bear" };
    invalidateCharacteristics(s0);
    expect(characteristics(s0, s0.objects[m]!).subtypes).toEqual(["Shapeshifter", "Bear"]);
    let s = cast(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    s = cast(s, ap, ids[1]!);
    expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("with no type chosen, nothing gets a counter", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    putOnBattlefield(s0, ap, mimic);
    const s = cast(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Roaming Throne: triggered abilities of other creatures of the chosen type trigger twice", () => {
    const elf = scout("Elf Scout", "Elf");
    const goblin = scout("Goblin Scout", "Goblin");
    const { s: s0, ap, ids } = setup([elf, goblin]);
    const t = putOnBattlefield(s0, ap, throne);
    s0.objects[t]!.chosen = { type: "Elf" };
    const life = s0.players[ap]!.life;
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.life).toBe(life + 2);
    s = settle(cast(s, ap, ids[1]!));
    expect(s.players[ap]!.life).toBe(life + 3);
  });
});
