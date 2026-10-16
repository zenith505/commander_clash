// "You may cast a spell with mana value N or less from your hand without paying its mana cost" (the Expertises,
// Electrodominance's "X or less", Omnispell Adept's "an instant or sorcery spell"): one card, cast as it resolves,
// ignoring timing based on its card type; X is 0; lands can't be cast (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, isFullySupported, planActivate, planCast, waitingOn, type Action, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const sram = card("Sram's Expertise", "Sorcery", "{2}{W}{W}", { oracleText: "Create three 1/1 colorless Servo artifact creature tokens.\nYou may cast a spell with mana value 3 or less from your hand without paying its mana cost." });
const electro = card("Electrodominance", "Instant", "{X}{R}{R}", { oracleText: "Electrodominance deals X damage to any target. You may cast a spell with mana value X or less from your hand without paying its mana cost." });
const adept = card("Omnispell Adept", "Creature — Human Wizard", "{4}{U}", { power: "3", toughness: "4", oracleText: "{2}{U}, {T}: You may cast an instant or sorcery spell from your hand without paying its mana cost." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const blaze = card("Blaze", "Sorcery", "{X}{R}", { oracleText: "Blaze deals X damage to any target." });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tapped = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.tapped).length;
function priorityTo(s: GameState, pid: PlayerId) {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
}

describe("cast a spell from your hand without paying its mana cost", () => {
  it("parses", () => [sram, electro, adept].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Sram's Expertise: offers only nonland cards with mana value 3 or less, and casts the one picked for free", () => {
    const { s: s0, ap, ids } = setup([sram, bear(), giant]);
    const [, b, g] = ids as [string, string, string];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromHand" });
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(options).toContain(b);
    expect(options).not.toContain(g);
    expect(options.every((o) => o === "none" || s.cards[s.objects[o]!.cardId]!.typeLine !== "Basic Land — Forest")).toBe(true);
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: b });
    const before = tapped(s, ap);
    s = run(s, planCast(s, ap, b));
    expect(tapped(s, ap)).toBe(before);
    s = settle(s);
    expect(s.battlefield).toContain(b);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken)).toHaveLength(3);
  });

  it("choosing none casts nothing", () => {
    const { s: s0, ap, ids } = setup([sram, bear()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(s.players[ap]!.hand).toContain(ids[1]);
    expect(s.pending).toBeFalsy();
  });

  it("Electrodominance: mana value X or less, a sorcery on an opponent's turn, and X is 0 for an X spell", () => {
    const { s: s0, ap, ids, opp } = setup([electro, divination, giant, blaze]);
    let s = priorityTo(passUntil(s0, "upkeep", opp), ap);
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", 3)));
    expect(s.players[opp]!.life).toBe(37);
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(options).toEqual(expect.arrayContaining([ids[1], ids[3]]));
    expect(options).not.toContain(ids[2]); // mana value 4
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "chooseOption", player: ap, choice: ids[1]! });
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("Omnispell Adept: only an instant or sorcery; bots take the biggest one", () => {
    const { s: s0, ap, ids } = setup([divination, bear(), blaze]);
    const a = putOnBattlefield(s0, ap, adept);
    const i = abilitiesOf(s0, s0.objects[a]!).activated.findIndex((ab) => /cast/.test(ab.body.text));
    let s = settle(run(s0, planActivate(s0, ap, a, i)));
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(options).toEqual(expect.arrayContaining([ids[0], ids[2]]));
    expect(options).not.toContain(ids[1]);
    const bot = botActions(s, ap);
    expect(bot).toEqual([{ type: "chooseOption", player: ap, choice: ids[0] }]);
  });
});
