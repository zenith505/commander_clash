// "The amount of life you gained this turn" (CR 119.3, 119.9: the total gained, whatever was lost): as X in "with mana
// value X or less" for a target (Celestine, Moseo: chosen as the trigger goes on the stack, rulings), "if you gained life
// this turn" as an intervening if (Moseo) or a condition checked as it resolves (Poisoner's Apprentice, Beza), and "up
// to one target creature card with mana value X or less" (Moseo, Here Comes a New Hero!).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, isFullySupported, planCast, power, toughness, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const inGraveyard = (s: GameState, pid: number, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
};
/** Records `n` life gained by `pid` this turn, and lost again, so the life total is the same (rulings: the total gained counts). */
const gainedThisTurn = (s: GameState, pid: PlayerId, n: number) => {
  s.turnLog = { ...(s.turnLog ?? {}), lifeGained: { ...(s.turnLog?.lifeGained ?? {}), [pid]: n }, gainedLife: [...(s.turnLog?.gainedLife ?? []), pid] };
};

// Real oracle text (Scryfall).
const celestine = card("Celestine, the Living Saint", "Legendary Creature — Human Warrior", "{4}{W}", { power: "3", toughness: "4", keywords: ["Flying", "Lifelink", "Healing Tears"], oracleText: "Flying, lifelink\nHealing Tears — At the beginning of your end step, return target creature card with mana value X or less from your graveyard to the battlefield, where X is the amount of life you gained this turn." });
const moseo = card("Moseo, Vein's New Dean", "Legendary Creature — Bird Skeleton Warlock", "{2}{B}", { power: "2", toughness: "1", keywords: ["Infusion", "Flying"], oracleText: "Flying\nWhen Moseo enters, create a 1/1 black and green Pest creature token with \"Whenever this token attacks, you gain 1 life.\"\nInfusion — At the beginning of your end step, if you gained life this turn, return up to one target creature card with mana value X or less from your graveyard to the battlefield, where X is the amount of life you gained this turn." });
const wurm = card("Voracious Wurm", "Creature — Wurm", "{1}{G}", { power: "2", toughness: "2", oracleText: "This creature enters with X +1/+1 counters on it, where X is the amount of life you've gained this turn." });
const apprentice = card("Poisoner's Apprentice", "Creature — Orc Warlock", "{2}{B}", { power: "2", toughness: "2", keywords: ["Infusion"], oracleText: "Infusion — When this creature enters, target creature an opponent controls gets -4/-4 until end of turn if you gained life this turn." });
const hero = card("Here Comes a New Hero!", "Sorcery", "{X}{2}{U}", { oracleText: "Target player draws X cards. Create a token that's a copy of up to one target creature with mana value X or less." });
const beza = card("Beza, the Bounding Spring", "Legendary Creature — Elemental Elk", "{2}{W}{W}", { power: "4", toughness: "5", keywords: ["Treasure"], oracleText: "When Beza enters, create a Treasure token if an opponent controls more lands than you. You gain 4 life if an opponent has more life than you. Create two 1/1 blue Fish creature tokens if an opponent controls more creatures than you. Draw a card if an opponent has more cards in hand than you." });
const thirst = card("Nightmare's Thirst", "Instant", "{B}", { oracleText: "You gain 1 life. Target creature gets -X/-X until end of turn, where X is the amount of life you gained this turn." });
const troll = card("Test Troll", "Creature — Troll", "{2}{G}{G}", { power: "4", toughness: "4" });
const giant = card("Test Giant", "Creature — Giant", "{5}{R}", { power: "6", toughness: "6" });

describe("the amount of life you gained this turn", () => {
  it("parse", () => supported(celestine, moseo, wurm, apprentice, hero, beza, thirst));

  it("Celestine: the target's mana value is at most the life gained, even if it was lost again", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, celestine);
    const t = inGraveyard(s0, ap, troll);
    const b = inGraveyard(s0, ap, bear());
    gainedThisTurn(s0, ap, 3);
    let s = passUntil(s0, "end", ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [target(t)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    expect([s.objects[b]!.zone, s.objects[t]!.zone]).toEqual(["battlefield", "graveyard"]);
  });

  it("Celestine with 4 life gained can return the Troll", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, celestine);
    const t = inGraveyard(s0, ap, troll);
    gainedThisTurn(s0, ap, 4);
    let s = passUntil(s0, "end", ap);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(t)] });
    s = settle(s);
    expect(s.objects[t]!.zone).toBe("battlefield");
  });

  it("Moseo: no trigger without life gained; with it, up to one target", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, moseo);
    const t = inGraveyard(s0, ap, troll);
    const quiet = passUntil(structuredClone(s0), "end", ap);
    expect(quiet.pending).toBeFalsy();
    expect(quiet.stack).toHaveLength(0);
    gainedThisTurn(s0, ap, 5);
    let s = passUntil(s0, "end", ap);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(t)] });
    s = settle(s);
    expect(s.objects[t]!.zone).toBe("battlefield");
  });

  it("Moseo: the target may be left out", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, moseo);
    const g = inGraveyard(s0, ap, giant);
    gainedThisTurn(s0, ap, 2);
    let s = passUntil(s0, "end", ap);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }] });
    s = settle(s);
    expect(s.objects[g]!.zone).toBe("graveyard");
  });

  it("Voracious Wurm enters with a counter for each life gained", () => {
    const { s: s0, ap, ids } = setup([wurm]);
    gainedThisTurn(s0, ap, 3);
    const s = cast(s0, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
  });

  it("Poisoner's Apprentice: the target is chosen either way, and -4/-4 only with life gained as it resolves (rulings)", () => {
    for (const gained of [0, 1]) {
      const { s: s0, ap, opp, ids } = setup([apprentice]);
      const victim = putOnBattlefield(s0, opp, giant);
      if (gained) gainedThisTurn(s0, ap, gained);
      let s = settle(cast(s0, ap, ids[0]!));
      if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(victim)] }));
      expect(`${power(s, s.objects[victim]!)}/${toughness(s, s.objects[victim]!)}`).toBe(gained ? "2/2" : "6/6");
    }
  });

  it("Here Comes a New Hero!: a copy of up to one target creature with mana value X or less", () => {
    const { s: s0, ap, opp, ids } = setup([hero]);
    const t = putOnBattlefield(s0, opp, troll);
    const hand = s0.players[opp]!.hand.length;
    expect(planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }, target(t)], undefined, "auto", 3)).toBeNull();
    const plan = planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }, target(t)], undefined, "auto", 4)!;
    let s = s0;
    for (const a of plan) s = act(s, a);
    s = settle(s);
    expect(s.players[opp]!.hand.length).toBe(hand + 4);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === "Test Troll")).toHaveLength(1);
  });

  it("Beza checks each comparison as it resolves (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([beza]);
    s0.players[opp]!.life = 41;
    const before = s0.players[ap]!.life;
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, bear());
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.life).toBe(before + 4);
    const tokens = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.objects[id]!.isToken);
    expect(tokens.map((id) => s.cards[s.objects[id]!.cardId]!.name).sort()).toEqual(["Fish Token", "Fish Token"]);
  });

  it("Nightmare's Thirst counts the life it gains too", () => {
    const { s: s0, ap, opp, ids } = setup([thirst]);
    const victim = putOnBattlefield(s0, opp, troll);
    gainedThisTurn(s0, ap, 2);
    const s = settle(cast(s0, ap, ids[0]!, [target(victim)]));
    expect(s.objects[victim]!.zone).toBe("battlefield");
    expect(`${power(s, s.objects[victim]!)}/${toughness(s, s.objects[victim]!)}`).toBe("1/1");
  });
});
