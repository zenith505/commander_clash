// Improvisation Capstone: "Exile cards from the top of your library until you exile cards with total mana value 4 or
// greater. You may cast any number of spells from among them without paying their mana costs." Cast as it resolves,
// ignoring timing; X is 0 (rulings). Lands count 0 toward the total.

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const capstone = card("Improvisation Capstone", "Sorcery — Lesson", "{5}{R}{R}", { keywords: ["Paradigm"], oracleText: "Exile cards from the top of your library until you exile cards with total mana value 4 or greater. You may cast any number of spells from among them without paying their mana costs.\nParadigm (Then exile this spell. After you first resolve a spell with this name, you may cast a copy of it from exile without paying its mana cost at the beginning of each of your first main phases.)" });

const four = card("Four Drop", "Creature — Ogre", "{3}{G}", { power: "4", toughness: "4" });
const three = card("Three Drop", "Creature — Elf", "{2}{G}", { power: "3", toughness: "3" });
const land = card("Forest", "Basic Land — Forest");

function onTop(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
}
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const offered = (s: GameState) => (s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong" ? s.pending.options : []);

describe("Improvisation Capstone", () => {
  it("parse", () => expect(isFullySupported(capstone)).toBe(true));

  it("exiles until the total reaches 4, then casts any of the spells among them for free", () => {
    const { s: s0, ap, ids } = setup([capstone]);
    const after = onTop(s0, ap, three);
    const big = onTop(s0, ap, four);
    const small = onTop(s0, ap, three);
    const forest = onTop(s0, ap, land);
    // Forest (0), Three Drop (3), Four Drop (7): stop there; the Three Drop under it stays in the library.
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 40 && !offered(s).length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[after]!.zone).toBe("library");
    expect(new Set(offered(s))).toEqual(new Set([big, small, "none"]));
    expect(s.objects[forest]!.zone).toBe("exile");
    for (const id of [big, small]) {
      s = act(s, { type: "chooseOption", player: ap, choice: id });
      s = run(s, planCast(s, ap, id));
    }
    for (let i = 0; i < 40 && (s.stack.length || s.pending); i++) s = act(s, s.pending?.kind === "chooseOption" ? { type: "chooseOption", player: ap, choice: "none" } : { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[big]!.zone).toBe("battlefield");
    expect(s.objects[small]!.zone).toBe("battlefield");
    expect(s.objects[forest]!.zone).toBe("exile");
  });
});
