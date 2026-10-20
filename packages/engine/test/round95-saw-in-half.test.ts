// Round 95: "Destroy target creature. If that creature dies this way, ..." (CR 700.4: put into a graveyard; rulings: not if
// it survives or a replacement effect exiles it instead). Saw in Half's two token copies with half its last-known power
// and toughness, rounded up (CR 707.9b, 107.1a); Kaervek's Purge's damage equal to its last-known power (CR 608.2h).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, cast, passAll, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, isFullySupported, planCast, power, toughness, type GameState } from "../src";

// Real oracle text (Scryfall).
const saw = card("Saw in Half", "Instant", "{2}{B}", { oracleText: "Destroy target creature. If that creature dies this way, its controller creates two tokens that are copies of that creature, except their power is half that creature's power and their toughness is half that creature's toughness. Round up each time." });
const purge = card("Kaervek's Purge", "Sorcery", "{X}{B}{R}", { oracleText: "Destroy target creature with mana value X. If that creature dies this way, Kaervek's Purge deals damage equal to the creature's power to the creature's controller." });
const rip = card("Rest in Peace", "Enchantment", "{1}{W}", { oracleText: "When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3", oracleText: "" });
const guard = card("Darksteel Myr", "Artifact Creature — Phyrexian Myr", "{3}", { power: "0", toughness: "1", keywords: ["Indestructible"], oracleText: "Indestructible (Damage and effects that say \"destroy\" don't destroy this.)" });

const tokensOf = (s: GameState, pid: number, name: string) => s.battlefield.map((id) => s.objects[id]!).filter((o) => o.isToken && o.controller === pid && characteristics(s, o).name === name);

describe("if that creature dies this way", () => {
  it("parse", () => {
    for (const d of [saw, purge]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Saw in Half: its controller gets two copies with half its power and toughness as it last was, rounded up", () => {
    const { s: s0, ap, ids, opp } = setup([saw]);
    const g = putOnBattlefield(s0, opp, giant);
    // A pumped 5/3 when it's destroyed: 3/2 tokens; the pump isn't copied, the halves come from it as it last existed.
    addEffect(s0, opp, [g], [{ kind: "modifyPT", power: 2, toughness: 0 }]);
    const s = cast(s0, ap, ids[0]!, [target(g)]);
    expect(s.objects[g]!.zone).toBe("graveyard");
    const toks = tokensOf(s, opp, "Hill Giant");
    expect(toks.length).toBe(2);
    for (const t of toks) expect([power(s, t), toughness(s, t)]).toEqual([3, 2]);
    expect(tokensOf(s, ap, "Hill Giant").length).toBe(0);
  });

  it("Saw in Half: no tokens if it doesn't die (indestructible) or is exiled instead (Rest in Peace)", () => {
    const { s: s0, ap, ids, opp } = setup([saw, saw]);
    const m = putOnBattlefield(s0, opp, guard);
    let s = cast(s0, ap, ids[0]!, [target(m)]);
    expect(s.objects[m]!.zone).toBe("battlefield");
    expect(tokensOf(s, opp, "Darksteel Myr").length).toBe(0);
    putOnBattlefield(s, ap, rip);
    const b = putOnBattlefield(s, opp, bear());
    s = cast(s, ap, ids[1]!, [target(b)]);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(tokensOf(s, opp, "Grizzly Bears").length).toBe(0);
  });

  it("Kaervek's Purge deals damage equal to the creature's last-known power to its controller", () => {
    const { s: s0, ap, ids, opp } = setup([purge]);
    const g = putOnBattlefield(s0, opp, card("Big", "Creature — Giant", "{1}{R}", { cmc: 2, power: "4", toughness: "4" }));
    addEffect(s0, opp, [g], [{ kind: "modifyPT", power: 2, toughness: 0 }]);
    const life = s0.players[opp]!.life;
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(g)], undefined, undefined, 2)!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 6);
  });
});
