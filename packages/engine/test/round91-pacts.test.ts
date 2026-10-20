// The Pacts (round 91): "At the beginning of your next upkeep, pay {2}{B}. If you don't, you lose the game." A delayed
// trigger made as the spell resolves (CR 603.7a): none if it's countered or its target is gone (rulings), one even if the
// target isn't destroyed (rulings). Paying is optional; not paying, or not being able to, loses the game (CR 104.3e).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, isFullySupported, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const slaughter = card("Slaughter Pact", "Instant", "{0}", { colors: ["B"], oracleText: "Destroy target nonblack creature.\nAt the beginning of your next upkeep, pay {2}{B}. If you don't, you lose the game." });
const summoner = card("Summoner's Pact", "Instant", "{0}", { colors: ["G"], oracleText: "Search your library for a green creature card, reveal it, put it into your hand, then shuffle.\nAt the beginning of your next upkeep, pay {2}{G}{G}. If you don't, you lose the game." });
const negation = card("Pact of Negation", "Instant", "{0}", { colors: ["U"], oracleText: "Counter target spell.\nAt the beginning of your next upkeep, pay {3}{U}{U}. If you don't, you lose the game." });
const titan = card("Pact of the Titan", "Instant", "{0}", { colors: ["R"], oracleText: "Create a 4/4 red Giant creature token.\nAt the beginning of your next upkeep, pay {4}{R}. If you don't, you lose the game." });

/** On to `ap`'s next upkeep, with the Pact's trigger asking. */
function toUpkeep(s: GameState, ap: PlayerId): GameState {
  s = passUntil(s, "upkeep", ap);
  for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay" && !s.players[ap]!.lost; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("Pacts", () => {
  it("parse", () => {
    for (const d of [slaughter, summoner, negation, titan]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Slaughter Pact: pay at your next upkeep and the game goes on", () => {
    const { s: s0, ap, ids, opp } = setup([slaughter]);
    const victim = putOnBattlefield(s0, opp, bear());
    let s = cast(s0, ap, ids[0]!, [target(victim)]);
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(s.delayed?.length).toBe(1);
    s = toUpkeep(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { mana: "{2}{B}" } });
    // The bot pays whenever it can.
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.players[ap]!.lost).toBe(false);
    expect(s.delayed?.length ?? 0).toBe(0);
  });

  it("not paying loses the game", () => {
    const { s: s0, ap, ids, opp } = setup([slaughter]);
    const victim = putOnBattlefield(s0, opp, bear());
    let s = toUpkeep(cast(s0, ap, ids[0]!, [target(victim)]), ap);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.players[ap]!.lost).toBe(true);
  });

  it("with no way to pay, you lose without being asked", () => {
    const { s: s0, ap, ids, opp } = setup([slaughter]);
    const victim = putOnBattlefield(s0, opp, bear());
    let s = cast(s0, ap, ids[0]!, [target(victim)]);
    // No lands left by the next upkeep.
    s.battlefield = s.battlefield.filter((id) => !(s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")));
    s = toUpkeep(s, ap);
    expect(s.players[ap]!.lost).toBe(true);
  });

  it("a Pact whose target is gone makes no trigger (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([slaughter]);
    const victim = putOnBattlefield(s0, opp, bear());
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(victim)])!) s = act(s, a);
    // The target leaves before the Pact resolves.
    s.battlefield.splice(s.battlefield.indexOf(victim), 1);
    s.objects[victim]!.zone = "graveyard";
    for (let i = 0; i < 8 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.length).toBe(0);
    expect(s.delayed?.length ?? 0).toBe(0);
  });

  it("Pact of the Titan on an opponent's turn: the trigger waits for your own upkeep", () => {
    const { s: s0, ap, ids } = setup([titan]);
    let s = cast(s0, ap, ids[0]!);
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Giant Token")).toBe(true);
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "main1", next);
    expect(s.pending?.kind).not.toBe("chooseMay");
    s = toUpkeep(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { mana: "{4}{R}" } });
  });

  it("bots cast a Pact only when their lands can pay for it", () => {
    const { s, ap, ids } = setup([titan]);
    s.players[ap]!.hand = [ids[0]!];
    s.players[ap]!.command = [];
    const castsIt = (st: GameState) => botActions(st, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0]);
    // Fourteen lands: yes, it's worth a 4/4 for free.
    expect(castsIt(s)).toBe(true);
    // Four lands: no.
    let lands = 0;
    s.battlefield = s.battlefield.filter((id) => !(s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land") && lands++ >= 4));
    expect(castsIt(s)).toBe(false);
  });
});
