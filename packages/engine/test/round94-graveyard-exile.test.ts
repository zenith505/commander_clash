// Round 94: "If a card would be put into an opponent's graveyard from anywhere, exile it instead" (CR 614.1a: Leyline
// of the Void, Rest in Peace, Dryad Militant, Dauthi Voidwalker's void counters), and Dauthi Voidwalker's "Choose an
// exiled card an opponent owns with a void counter on it. You may play it this turn without paying its mana cost."

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, isFullySupported, moveObject, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const dauthi = card("Dauthi Voidwalker", "Creature — Dauthi Rogue", "{B}{B}", { power: "3", toughness: "2", keywords: ["Shadow"], oracleText: "Shadow (This creature can block or be blocked by only creatures with shadow.)\nIf a card would be put into an opponent's graveyard from anywhere, instead exile it with a void counter on it.\n{T}, Sacrifice this creature: Choose an exiled card an opponent owns with a void counter on it. You may play it this turn without paying its mana cost." });
const leyline = card("Leyline of the Void", "Enchantment", "{2}{B}{B}", { oracleText: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nIf a card would be put into an opponent's graveyard from anywhere, exile it instead." });
const rip = card("Rest in Peace", "Enchantment", "{1}{W}", { oracleText: "When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead." });
const militant = card("Dryad Militant", "Creature — Dryad Soldier", "{G/W}", { power: "2", toughness: "1", oracleText: "({G/W} can be paid with either {G} or {W}.)\nIf an instant or sorcery card would be put into a graveyard from anywhere, exile it instead." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const vengeance = card("Akroma's Vengeance", "Sorcery", "{4}{W}{W}", { oracleText: "Destroy all artifacts, creatures, and enchantments.\nCycling {3}" });
const disenchant = card("Disenchant", "Instant", "{1}{W}", { oracleText: "Destroy target artifact or enchantment." });
const titan = card("Grave Titan", "Creature — Giant", "{4}{B}{B}", { power: "6", toughness: "6", keywords: ["Deathtouch"] });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("cards exiled instead of going to a graveyard", () => {
  it("parse", () => {
    for (const d of [dauthi, leyline, rip, militant]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Leyline of the Void: an opponent's cards from anywhere are exiled, yours aren't; their tokens still die", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, leyline);
    const theirs = putOnBattlefield(s, opp, bear());
    const mine = putOnBattlefield(s, ap, bear());
    const top = s.players[opp]!.library[0]!;
    moveObject(s, theirs, "graveyard");
    moveObject(s, mine, "graveyard");
    moveObject(s, top, "graveyard"); // milled
    expect(s.objects[theirs]!.zone).toBe("exile");
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toHaveLength(0);
  });

  it("Rest in Peace: everyone's cards and tokens; destroyed by a spell, it's exiled and the spell goes to the graveyard", () => {
    const { s: s0, ap, opp, ids } = setup([shock, disenchant]);
    const r = putOnBattlefield(s0, opp, rip);
    const b = putOnBattlefield(s0, opp, bear());
    let s = cast(s0, ap, ids[0]!, [target(b)]);
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.zone).toBe("exile"); // the resolved Shock
    s = settle(cast(s, ap, ids[1]!, [target(r)]));
    expect(s.objects[r]!.zone).toBe("exile");
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
  });

  it("a board wipe that destroys Rest in Peace with the creatures exiles them all (they leave at the same time)", () => {
    const { s: s0, ap, opp, ids } = setup([vengeance]);
    const b = putOnBattlefield(s0, opp, bear());
    const r = putOnBattlefield(s0, ap, rip);
    const m = putOnBattlefield(s0, opp, militant);
    const s = settle(cast(s0, ap, ids[0]!));
    expect([b, r, m].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("Dryad Militant: only instant and sorcery cards", () => {
    const { s: s0, ap, opp, ids } = setup([shock]);
    putOnBattlefield(s0, opp, militant);
    const b = putOnBattlefield(s0, opp, bear());
    const s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Dauthi Voidwalker: void counters, then sacrifice it to play one of those cards free this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, dauthi);
    const t = putOnBattlefield(s0, opp, titan);
    moveObject(s0, t, "graveyard");
    expect(s0.objects[t]!.zone).toBe("exile");
    expect(s0.objects[t]!.counters.void).toBe(1);
    let s = activate(s0, ap, d, 0);
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: [t] });
    expect(s.objects[t]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn", free: true });
    s = settle(cast(s, ap, t));
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(s.objects[t]!.controller).toBe(ap);
    expect(s.players[ap]!.manaPool.B).toBe(0);
    expect(s.objects[d]!.zone).toBe("graveyard"); // yours: no void counter
  });

  it("a bot sacrifices Dauthi Voidwalker for a big spell with a void counter and casts it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, dauthi);
    const t = putOnBattlefield(s0, opp, titan);
    moveObject(s0, t, "graveyard");
    s0.players[ap]!.library.push(...s0.players[ap]!.hand.splice(0)); // nothing else to cast
    let s = passUntil(s0, "main2", ap); // bots activate abilities once they're done casting spells
    for (let i = 0; i < 30 && s.objects[t]!.zone !== "battlefield"; i++) {
      const pid = waitingOn(s)!;
      if (pid !== ap) break;
      const acts = botActions(s, pid);
      if (!acts.length || acts[0]!.type === "passPriority") break;
      for (const a of acts) s = act(s, a);
      s = settle(s);
    }
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(s.objects[t]!.controller).toBe(ap);
  });
});
