// Round 92: Cloud Key. "As this artifact enters, choose artifact, creature, enchantment, instant, or sorcery. Spells you
// cast of the chosen type cost {1} less to cast." A card type chosen as it enters (CR 614.12).

import { describe, expect, it } from "vitest";
import { act, bear, card, setup } from "./helpers";
import { botActions, isFullySupported, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const key = card("Cloud Key", "Artifact", "{3}", { oracleText: "As this artifact enters, choose artifact, creature, enchantment, instant, or sorcery.\nSpells you cast of the chosen type cost {1} less to cast." });
const opt = card("Opt", "Instant", "{U}", { oracleText: "Scry 1.\nDraw a card." });
const growth = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

const taps = (s: GameState, ap: number, id: string) => planCast(s, ap, id)!.filter((a) => a.type === "activateMana").length;

describe("Cloud Key", () => {
  it("parse", () => expect(isFullySupported(key)).toBe(true));

  it("choose a card type as it enters; spells of that type cost {1} less", () => {
    const { s: s0, ap, ids } = setup([key, bear(), growth, opt]);
    let s = planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardType", options: ["Artifact", "Creature", "Enchantment", "Instant", "Sorcery"] });
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "Land" })).toThrow();
    s = act(s, { type: "chooseOption", player: ap, choice: "Sorcery" });
    expect(s.stack).toHaveLength(0);
    expect(s.objects[ids[0]!]!.chosen?.cardType).toBe("Sorcery");
    expect(taps(s, ap, ids[2]!)).toBe(2); // Divination: {1}{U}
    expect(taps(s, ap, ids[1]!)).toBe(2); // a creature: full price
  });

  it("a bot chooses one", () => {
    const { s: s0, ap, ids } = setup([key]);
    s0.players[ap]!.isBot = true;
    let s = planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(["Artifact", "Creature", "Enchantment", "Instant", "Sorcery"]).toContain(s.objects[ids[0]!]!.chosen?.cardType);
  });
});
