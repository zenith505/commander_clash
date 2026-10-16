// "Target creature and all other creatures with the same name as that creature" (Maelstrom Pulse, Bile Blight, Echoing
// Truth, Homing Lightning, Declaration in Stone, Legions to Ashes): only the first is targeted, so the others are affected
// even with hexproof; nothing happens if the target is illegal (CR 608.2b); a face-down permanent has no name and shares
// none (CR 708.2a). All from the rulings.

import { describe, expect, it } from "vitest";
import { act, activate, addEffect, bear, card, cast, pt, putOnBattlefield, setup, target } from "./helpers";
import { chooseTargets, compileCard, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tokensOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid);

// Real oracle text (Scryfall).
const pulse = card("Maelstrom Pulse", "Sorcery", "{1}{B}{G}", { oracleText: "Destroy target nonland permanent and all other permanents with the same name as that permanent." });
const blight = card("Bile Blight", "Instant", "{B}{B}", { oracleText: "Target creature and all other creatures with the same name as that creature get -3/-3 until end of turn." });
const truth = card("Echoing Truth", "Instant", "{1}{U}", { oracleText: "Return target nonland permanent and all other permanents with the same name as that permanent to their owners' hands." });
const homing = card("Homing Lightning", "Instant", "{2}{R}{R}", { oracleText: "Homing Lightning deals 4 damage to target creature and each other creature with the same name as that creature." });
const declaration = card("Declaration in Stone", "Sorcery", "{1}{W}", { oracleText: "Exile target creature and all other creatures its controller controls with the same name as that creature. That player investigates for each nontoken creature exiled this way." });
const legions = card("Legions to Ashes", "Sorcery", "{1}{W}{B}", { oracleText: "Exile target nonland permanent an opponent controls and all tokens that player controls with the same name as that permanent." });
const staticaster = card("Izzet Staticaster", "Creature — Human Wizard", "{1}{U}{R}", { power: "0", toughness: "3", keywords: ["Flash", "Haste"], oracleText: "Flash (You may cast this spell any time you could cast an instant.)\nHaste\n{T}: This creature deals 1 damage to target creature and each other creature with the same name as that creature." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const hexproofBear = (s: GameState, pid: PlayerId) => {
  const id = putOnBattlefield(s, pid, bear());
  addEffect(s, pid, [id], [{ kind: "addKeywords", keywords: ["Hexproof"] }], "game");
  return id;
};

describe("same name as that permanent", () => {
  it("compiles", () => supported(pulse, blight, truth, homing, declaration, legions, staticaster));

  it("Maelstrom Pulse destroys the target and every other permanent with its name, any controller, hexproof or not", () => {
    const { s: s0, ap, opp, ids } = setup([pulse]);
    const a = putOnBattlefield(s0, opp, bear());
    const b = hexproofBear(s0, opp);
    const mine = putOnBattlefield(s0, ap, bear());
    const g = putOnBattlefield(s0, opp, giant);
    expect(objHasKeyword(s0, s0.objects[b]!, "Hexproof")).toBe(true);
    const s = settle(cast(s0, ap, ids[0]!, [target(a)]));
    for (const id of [a, b, mine]) expect(s.objects[id]!.zone).toBe("graveyard");
    expect(s.objects[g]!.zone).toBe("battlefield");
  });

  it("an illegal target: nothing happens to the others either", () => {
    const { s: s0, ap, opp, ids } = setup([pulse]);
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp, bear());
    let s = planCast(s0, ap, ids[0]!, [target(a)])!.reduce((x, step) => act(x, step), s0);
    // The target leaves before it resolves.
    s.battlefield.splice(s.battlefield.indexOf(a), 1);
    s.objects[a]!.zone = "graveyard";
    s.players[opp]!.graveyard.push(a);
    s = settle(s);
    expect(s.stack).toHaveLength(0);
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("a face-down permanent has no name: it shares none, and as the target only it is affected", () => {
    const { s: s0, ap, opp, ids } = setup([blight, truth]);
    const a = putOnBattlefield(s0, opp, bear());
    const fd = putOnBattlefield(s0, opp, bear());
    s0.objects[fd]!.faceDown = "morph";
    const other = putOnBattlefield(s0, opp, bear({ name: "Face-down creature" }));
    let s = settle(cast(s0, ap, ids[0]!, [target(a)]));
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[fd]!.zone).toBe("battlefield");
    s = settle(cast(s, ap, ids[1]!, [target(fd)]));
    expect(s.objects[fd]!.zone).toBe("hand");
    expect(s.objects[other]!.zone).toBe("battlefield");
  });

  it("Bile Blight gives each of them -3/-3; Echoing Truth returns them to their owners' hands", () => {
    const { s: s0, ap, opp, ids } = setup([blight, truth]);
    const g1 = putOnBattlefield(s0, opp, card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4" }));
    const g2 = putOnBattlefield(s0, ap, card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4" }));
    let s = settle(cast(s0, ap, ids[0]!, [target(g1)]));
    expect([pt(s, g1), pt(s, g2)]).toEqual(["3/1", "3/1"]);
    s = settle(cast(s, ap, ids[1]!, [target(g2)]));
    expect(s.players[opp]!.hand).toContain(g1);
    expect(s.players[ap]!.hand).toContain(g2);
  });

  it("Homing Lightning and Izzet Staticaster damage each creature with the name", () => {
    const { s: s0, ap, opp, ids } = setup([homing]);
    const giants = [putOnBattlefield(s0, opp, giant), putOnBattlefield(s0, opp, giant), putOnBattlefield(s0, ap, giant)];
    const b = putOnBattlefield(s0, opp, bear());
    const st = putOnBattlefield(s0, ap, staticaster);
    const tokens = [putOnBattlefield(s0, opp, card("Saproling Token", "Token Creature — Saproling", "", { power: "1", toughness: "1" })), putOnBattlefield(s0, opp, card("Saproling Token", "Token Creature — Saproling", "", { power: "1", toughness: "1" }))];
    let s = settle(cast(s0, ap, ids[0]!, [target(giants[0]!)]));
    for (const g of giants) expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("battlefield");
    s = settle(activate(s, ap, st, 0, [target(tokens[0]!)]));
    for (const t of tokens) expect(s.battlefield).not.toContain(t);
  });

  it("Declaration in Stone: only its controller's; that player investigates for each nontoken creature exiled", () => {
    const { s: s0, ap, opp, ids } = setup([declaration]);
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp, bear());
    const tok = putOnBattlefield(s0, opp, bear());
    s0.objects[tok]!.isToken = true;
    const mine = putOnBattlefield(s0, ap, bear());
    const s = settle(cast(s0, ap, ids[0]!, [target(a)]));
    for (const id of [a, b]) expect(s.objects[id]!.zone).toBe("exile");
    expect(s.battlefield).not.toContain(tok);
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(tokensOf(s, opp).map((id) => s.cards[s.objects[id]!.cardId]!.name)).toEqual(["Clue Token", "Clue Token"]);
    expect(tokensOf(s, ap)).toHaveLength(0);
  });

  it("Legions to Ashes: the target and that player's tokens with its name, not their other nontoken copies", () => {
    const { s: s0, ap, opp, ids } = setup([legions]);
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp, bear());
    const tok = putOnBattlefield(s0, opp, bear());
    s0.objects[tok]!.isToken = true;
    const myTok = putOnBattlefield(s0, ap, bear());
    s0.objects[myTok]!.isToken = true;
    const s = settle(cast(s0, ap, ids[0]!, [target(a)]));
    expect(s.objects[a]!.zone).toBe("exile");
    expect(s.battlefield).not.toContain(tok);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.battlefield).toContain(myTok);
  });

  it("bots count their own permanents with the same name against the target", () => {
    const { s, ap, opp, ids } = setup([pulse, homing]);
    const theirs = putOnBattlefield(s, opp, giant);
    const bearOf = putOnBattlefield(s, opp, bear());
    const body = compileCard(pulse).spell!;
    // Alone, their Hill Giant is the best target.
    expect(chooseTargets(s, ap, body, false, ids[0])).toEqual([target(theirs)]);
    // With a Hill Giant of ours, that would cost us as much: their Grizzly Bears instead.
    const ours = putOnBattlefield(s, ap, giant);
    expect(chooseTargets(s, ap, body, false, ids[0])).toEqual([target(bearOf)]);
    // A second one of theirs makes the Giant worth it again (two of theirs for one of ours).
    const theirs2 = putOnBattlefield(s, opp, giant);
    expect([[target(theirs)], [target(theirs2)]]).toContainEqual(chooseTargets(s, ap, body, false, ids[0]));
    // Only things that cost us more than they gain: not cast.
    const { s: s2, ap: ap2, opp: opp2, ids: ids2 } = setup([pulse]);
    putOnBattlefield(s2, opp2, bear());
    putOnBattlefield(s2, ap2, bear());
    putOnBattlefield(s2, ap2, bear());
    expect(chooseTargets(s2, ap2, body, false, ids2[0])).toBeNull();
    // Damage that won't kill ours costs nothing: Homing Lightning still takes their Giant next to our 6/6 one.
    s.objects[ours]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s);
    expect(pt(s, ours)).toBe("6/6");
    expect([[target(theirs)], [target(theirs2)]]).toContainEqual(chooseTargets(s, ap, compileCard(homing).spell!, false, ids[1]));
  });
});
