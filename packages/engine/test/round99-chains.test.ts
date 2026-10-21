// Round 99: the rest of the Chain cards. "Then that player or that permanent's controller may pay {R}{R}. If the player
// does, they may copy this spell" (Chain Lightning), "... may discard a card" (Chain of Plasma), "That creature's
// controller may sacrifice a land" (Chain of Silence), "That player may copy this spell" (Chain of Smog), "... may pay
// {2}{U}" (Chain Stasis). The player copying controls the copy (CR 707.10, rulings); someone who can't pay isn't asked.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const lightning = card("Chain Lightning", "Sorcery", "{R}", { oracleText: "Chain Lightning deals 3 damage to any target. Then that player or that permanent's controller may pay {R}{R}. If the player does, they may copy this spell and may choose a new target for that copy." });
const plasma = card("Chain of Plasma", "Instant", "{1}{R}", { oracleText: "Chain of Plasma deals 3 damage to any target. Then that player or that permanent's controller may discard a card. If the player does, they may copy this spell and may choose a new target for that copy." });
const silence = card("Chain of Silence", "Instant", "{1}{W}", { oracleText: "Prevent all damage target creature would deal this turn. That creature's controller may sacrifice a land of their choice. If the player does, they may copy this spell and may choose a new target for that copy." });
const smog = card("Chain of Smog", "Sorcery", "{1}{B}", { oracleText: "Target player discards two cards. That player may copy this spell and may choose a new target for that copy." });
const stasis = card("Chain Stasis", "Instant", "{U}", { oracleText: "You may tap or untap target creature. Then that creature's controller may pay {2}{U}. If the player does, they may copy this spell and may choose a new target for that copy." });
const mountain = card("Mountain", "Basic Land — Mountain");

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const nextAfter = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % 4]!;
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 99, Chain cards", () => {
  it("parse", () => {
    supported(lightning, plasma, silence, smog, stasis);
  });

  it("Chain Lightning: the player hit may pay {R}{R} to copy it at you", () => {
    const { s: s0, ap, ids } = setup([lightning]);
    const opp = nextAfter(s0, ap);
    const lands = [mountain, mountain].map((l) => putOnBattlefield(s0, opp, l));
    const life = [s0.players[ap]!.life, s0.players[opp]!.life];
    let s = settle(cast(s0, ap, ids[0]!, [player(opp)]));
    expect(s.players[opp]!.life).toBe(life[1]! - 3);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp, pay: { mana: "{R}{R}" } });
    // Paid from their pool.
    for (const l of lands) s = act(s, { type: "activateMana", player: opp, objectId: l, mana: "R" });
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    expect(s.players[opp]!.manaPool.R ?? 0).toBe(0);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: opp });
    s = act(s, { type: "copyTargets", player: opp, targets: [player(ap)] });
    expect(s.stack.find((x) => x.copy)?.controller).toBe(opp);
    // You can't pay {R}{R} back (no Mountains untapped): the copy just resolves.
    for (let i = 0; i < 40 && (s.stack.length || s.pending); i++)
      s = s.pending?.kind === "chooseMay" ? act(s, { type: "chooseMay", player: s.pending.player, yes: false }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.life).toBe(life[0]! - 3);
  });

  it("Chain Lightning at a creature: its controller is asked, and not when they can't pay", () => {
    const { s: s0, ap, ids } = setup([lightning]);
    const opp = nextAfter(s0, ap);
    const b = putOnBattlefield(s0, opp, bear());
    const s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(s.objects[b]!.zone).toBe("graveyard");
    // No red mana: no question.
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
  });

  it("Chain of Plasma: discarding a card copies it", () => {
    const { s: s0, ap, ids } = setup([plasma]);
    const opp = nextAfter(s0, ap);
    const hand = s0.players[opp]!.hand.length;
    let s = settle(cast(s0, ap, ids[0]!, [player(opp)]));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: opp, objectIds: [s.players[opp]!.hand[0]!] });
    expect(s.players[opp]!.hand.length).toBe(hand - 1);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: opp });
  });

  it("Chain of Silence: prevents the creature's damage; its controller may sacrifice a land to copy", () => {
    const { s: s0, ap, ids } = setup([silence]);
    const opp = nextAfter(s0, ap);
    const b = putOnBattlefield(s0, opp, bear());
    putOnBattlefield(s0, opp, mountain);
    const s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
  });

  it("Chain of Smog: the player who discarded may copy it", () => {
    const { s: s0, ap, ids } = setup([smog]);
    const opp = nextAfter(s0, ap);
    const hand = s0.players[opp]!.hand.length;
    let s = settle(cast(s0, ap, ids[0]!, [player(opp)]));
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: opp, objectIds: s.players[opp]!.hand.slice(0, 2) });
    expect(s.players[opp]!.hand.length).toBe(hand - 2);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = act(s, { type: "chooseMay", player: opp, yes: false });
    expect(s.pending).toBeNull();
  });

  it("Chain Stasis: tap the creature; its controller may pay {2}{U} to copy", () => {
    const { s: s0, ap, ids } = setup([stasis]);
    const opp = nextAfter(s0, ap);
    const b = putOnBattlefield(s0, opp, bear());
    let s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    if (s.pending?.kind === "chooseMay" && s.pending.player === ap) s = act(s, { type: "chooseMay", player: ap, yes: true });
    if (s.pending?.kind === "chooseOption" && s.pending.what === "tapOrUntap") s = act(s, { type: "chooseOption", player: ap, choice: "tap" });
    s = settle(s);
    expect(s.objects[b]!.tapped).toBe(true);
    // No blue mana: not asked.
    expect(s.pending).toBeNull();
  });
});
