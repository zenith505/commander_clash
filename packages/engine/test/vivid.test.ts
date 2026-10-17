// Vivid: "the number of colors among permanents you control" counts white, blue, black, red and green among the colors
// of your permanents; lands are normally colorless and colorless isn't a color (CR 105.2c, rulings). X is worked out
// as the ability resolves (rulings), and Squawkroaster's power is a characteristic-defining ability (CR 604.3).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, power, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const shimmercreep = card("Shimmercreep", "Creature — Elemental", "{4}{B}", { power: "3", toughness: "5", keywords: ["Menace", "Vivid"], oracleText: "Menace (This creature can't be blocked except by two or more creatures.)\nVivid — When this creature enters, each opponent loses X life and you gain X life, where X is the number of colors among permanents you control." });
const squawkroaster = card("Squawkroaster", "Creature — Elemental", "{3}{R}", { power: "*", toughness: "4", keywords: ["Double strike", "Vivid"], oracleText: "Double strike\nVivid — Squawkroaster's power is equal to the number of colors among permanents you control." });
const kithkeeper = card("Kithkeeper", "Creature — Elemental", "{6}{W}", { power: "3", toughness: "3", keywords: ["Vivid"], oracleText: "Vivid — When this creature enters, create X 1/1 green and white Kithkin creature tokens, where X is the number of colors among permanents you control.\nTap three untapped creatures you control: This creature gets +3/+0 and gains flying until end of turn." });
const prodigy = card("Explosive Prodigy", "Creature — Elemental Sorcerer", "{1}{R}", { power: "1", toughness: "1", keywords: ["Vivid"], oracleText: "Vivid — When this creature enters, it deals X damage to target creature an opponent controls, where X is the number of colors among permanents you control." });
const spectacle = card("Elemental Spectacle", "Sorcery", "{5}{G}", { keywords: ["Vivid"], oracleText: "Vivid — Create a number of 5/5 red and green Elemental creature tokens equal to the number of colors among permanents you control. Then you gain life equal to the number of creatures you control." });

const azorius = card("Azorius Guildmage", "Creature — Vedalken Wizard", "{W}{U}", { power: "2", toughness: "2" });
const stone = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}." });

/** Resolves the stack, answering a trigger's target with `t` if it asks. */
function resolve(s: GameState, t?: string) {
  for (let i = 0; i < 30 && (s.stack.length || s.pending); i++) {
    const pend = s.pending;
    if (pend?.kind === "chooseTargets" && t) s = passAll(act(s, { type: "chooseTargets", player: pend.player, targets: [target(t)] }));
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}

describe("Vivid", () => {
  it("compiles them", () => {
    for (const d of [shimmercreep, squawkroaster, kithkeeper, prodigy, spectacle]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Shimmercreep counts each color once, itself included; lands and colorless artifacts add nothing", () => {
    let { s, ap, opp, ids } = setup([shimmercreep]);
    putOnBattlefield(s, ap, azorius); // white and blue
    putOnBattlefield(s, ap, bear()); // green
    putOnBattlefield(s, ap, bear({ name: "Another Bear" })); // green again
    putOnBattlefield(s, ap, stone);
    putOnBattlefield(s, opp, card("Their Goblin", "Creature — Goblin", "{R}", { power: "1", toughness: "1" })); // not yours
    const life = s.players[ap]!.life;
    const theirs = s.players[opp]!.life;
    s = resolve(cast(s, ap, ids[0]!));
    // White, blue, green and Shimmercreep's black: 4.
    expect(s.players[ap]!.life).toBe(life + 4);
    expect(s.players[opp]!.life).toBe(theirs - 4);
  });

  it("Squawkroaster's power is the number of colors among your permanents, changing as they do", () => {
    let { s, ap } = setup([]);
    const sq = putOnBattlefield(s, ap, squawkroaster);
    expect(power(s, s.objects[sq]!)).toBe(1);
    putOnBattlefield(s, ap, azorius);
    expect(power(s, s.objects[sq]!)).toBe(3);
  });

  it("Kithkeeper creates that many Kithkin; Explosive Prodigy deals that much damage", () => {
    let { s, ap, opp, ids } = setup([kithkeeper, prodigy]);
    putOnBattlefield(s, ap, azorius);
    s = resolve(cast(s, ap, ids[0]!));
    const kithkin = s.battlefield.filter((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.name === "Kithkin Token");
    expect(kithkin).toHaveLength(2); // white and blue (Kithkeeper is white too)
    const big = putOnBattlefield(s, opp, bear({ name: "Big Bear", power: "5", toughness: "5" }));
    s = resolve(cast(s, ap, ids[1]!), big);
    // White, blue, and the green and white tokens' green, and the Prodigy's red: 4.
    expect(s.objects[big]!.damage).toBe(4);
  });

  it("Elemental Spectacle counts as it resolves", () => {
    let { s, ap, ids } = setup([spectacle]);
    putOnBattlefield(s, ap, azorius);
    s = resolve(cast(s, ap, ids[0]!));
    const elementals = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(elementals).toHaveLength(2);
  });
});
