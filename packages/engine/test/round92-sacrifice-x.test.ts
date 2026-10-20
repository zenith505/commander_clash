// Round 92: "You may sacrifice another creature. If you do, ... where X is that creature's power" (Disciple of Freyalise,
// Feed the Pack, The Meep): X is the sacrificed creature as it last existed on the battlefield (CR 608.2h, rulings).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, pt, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type Action, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall); Disciple of Freyalise's front face.
const disciple = card("Disciple of Freyalise", "Creature — Elf Druid", "{3}{G}{G}{G}", { power: "3", toughness: "3", oracleText: "When this creature enters, you may sacrifice another creature. If you do, you gain X life and draw X cards, where X is that creature's power." });
const pack = card("Feed the Pack", "Enchantment", "{5}{G}", { oracleText: "At the beginning of your end step, you may sacrifice a nontoken creature. If you do, create X 2/2 green Wolf creature tokens, where X is the sacrificed creature's toughness." });
const meep = card("The Meep", "Legendary Creature — Alien", "{2}{B}", { power: "0", toughness: "4", oracleText: "Ward—Pay 3 life.\nWhenever The Meep attacks, you may sacrifice another creature. If you do, creatures you control have base power and toughness X/X until end of turn, where X is the sacrificed creature's mana value." });
const big = card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4" });

/** Pass (no attacks, no blocks) until `pid` is asked whether to do something. */
function untilMay(s: GameState, pid: PlayerId, attackers: string[] = []) {
  for (let i = 0; i < 300 && !(s.pending?.kind === "chooseMay" && s.pending.player === pid); i++) {
    const p = waitingOn(s)!;
    if (s.pending?.kind === "declareAttackers") {
      const def = s.turnOrder.find((x) => x !== p)!;
      s = act(s, { type: "declareAttackers", player: p, attacks: attackers.map((id) => ({ attacker: id, defender: def })) });
    } else if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p, blocks: [] });
    else s = act(s, { type: "passPriority", player: p });
  }
  expect(s.pending).toMatchObject({ kind: "chooseMay", player: pid });
  return s;
}
const sacrifice = (s: GameState, pid: PlayerId, id: string) => {
  s = act(s, { type: "chooseMay", player: pid, yes: true });
  if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: pid, ids: [id] });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => plan!.reduce((x, a) => act(x, a), s);

describe("sacrifice another creature, X is its power", () => {
  it("parse", () => [disciple, pack, meep].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Disciple of Freyalise: gain X life and draw X cards, X the sacrificed creature's power as it last existed", () => {
    const { s: s0, ap, ids } = setup([disciple]);
    const wurm = putOnBattlefield(s0, ap, big);
    addEffect(s0, ap, [wurm], [{ kind: "modifyPT", power: 1, toughness: 0 }]); // 7/4 now
    const hand = s0.players[ap]!.hand.length - 1;
    let s = untilMay(run(s0, planCast(s0, ap, ids[0]!)), ap);
    s = sacrifice(s, ap, wurm);
    expect(s.objects[wurm]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(47);
    expect(s.players[ap]!.hand.length).toBe(hand + 7);
  });

  it("Disciple of Freyalise: not sacrificing does nothing", () => {
    const { s: s0, ap, ids } = setup([disciple]);
    putOnBattlefield(s0, ap, big);
    let s = untilMay(run(s0, planCast(s0, ap, ids[0]!)), ap);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.players[ap]!.life).toBe(40);
  });

  it("Feed the Pack: X Wolves, X the sacrificed creature's toughness", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, pack);
    const wurm = putOnBattlefield(s0, ap, big);
    let s = untilMay(s0, ap);
    s = sacrifice(s, ap, wurm);
    const wolves = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Wolf Token");
    expect(wolves).toHaveLength(4);
  });

  it("The Meep: creatures you control have base power and toughness X/X, X the sacrificed creature's mana value", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, meep);
    const wurm = putOnBattlefield(s0, ap, big);
    const b = putOnBattlefield(s0, ap, bear());
    let s = untilMay(s0, ap, [m]);
    s = sacrifice(s, ap, wurm);
    expect(pt(s, m)).toBe("6/6");
    expect(pt(s, b)).toBe("6/6");
  });
});
