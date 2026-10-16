// Cover of Winter: "If a creature would deal combat damage to you and/or one or more creatures you control, prevent X of
// that damage, where X is the number of age counters on this enchantment." A prevention effect (CR 615.1a) applied
// creature by creature: X of each one's combat damage in each combat damage step (double strike gets it twice), and
// when one creature's damage goes to several of them (trample), Cover's controller divides the X (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const cover = card("Cover of Winter", "Snow Enchantment", "{2}{W}", { oracleText: "Cumulative upkeep {S} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it. {S} can be paid with one mana from a snow source.)\nIf a creature would deal combat damage to you and/or one or more creatures you control, prevent X of that damage, where X is the number of age counters on this enchantment.\n{S}: Put an age counter on this enchantment." });
const trampler = card("Trample Test", "Creature — Beast", "{4}{G}", { power: "5", toughness: "5", keywords: ["Trample"], oracleText: "Trample" });
const giant = card("Giant Test", "Creature — Giant", "{3}{G}", { power: "4", toughness: "4" });
const elf = card("Elf Test", "Creature — Elf", "{G}", { power: "1", toughness: "1" });
const fencer = card("Double Test", "Creature — Human Knight", "{1}{W}", { power: "2", toughness: "2", keywords: ["Double strike"], oracleText: "Double strike" });

const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
/** `ap` attacks `opp` with `attackers`; `opp` blocks as given; then everyone passes until the end of combat, answering nothing. */
function fight(s0: GameState, ap: PlayerId, opp: PlayerId, attackers: string[], blocks: { blocker: string; attacker: string }[] = []): GameState {
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((a) => ({ attacker: a, defender: opp })) });
  for (let i = 0; i < 60 && s.step !== "endCombat" && s.pending?.kind !== "chooseOption"; i++) {
    const p = s.pending;
    s = act(s, p?.kind === "declareBlockers" ? { type: "declareBlockers", player: p.player, blocks: p.player === opp ? blocks : [] } : { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}
const toEndOfCombat = (s: GameState) => {
  for (let i = 0; i < 60 && s.step !== "endCombat" && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("Cover of Winter", () => {
  it("is supported", () => expect(isFullySupported(cover)).toBe(true));

  it("prevents X of each creature's combat damage: an unblocked 1/1 and 4/4 deal 2 with two age counters (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, opp, cover);
    s0.objects[c]!.counters = { age: 2 };
    const before = life(s0, opp);
    const s = toEndOfCombat(fight(s0, ap, opp, [putOnBattlefield(s0, ap, elf), putOnBattlefield(s0, ap, giant)]));
    expect(s.step).toBe("endCombat");
    expect(life(s, opp)).toBe(before - 2);
  });

  it("with no age counters it prevents nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, cover);
    const before = life(s0, opp);
    const s = toEndOfCombat(fight(s0, ap, opp, [putOnBattlefield(s0, ap, giant)]));
    expect(life(s, opp)).toBe(before - 4);
  });

  it("double strike: X in each combat damage step", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, opp, cover);
    s0.objects[c]!.counters = { age: 1 };
    const before = life(s0, opp);
    const s = toEndOfCombat(fight(s0, ap, opp, [putOnBattlefield(s0, ap, fencer)]));
    expect(life(s, opp)).toBe(before - 2);
  });

  it("a trampler's damage to a blocker and to you: Cover's controller divides the X", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, opp, cover);
    s0.objects[c]!.counters = { age: 2 };
    const t = putOnBattlefield(s0, ap, trampler);
    const b = putOnBattlefield(s0, opp, bear());
    const before = life(s0, opp);
    let s = fight(s0, ap, opp, [t], [{ blocker: b, attacker: t }]);
    // 2 to the bear, 3 to its controller: which of them each prevented point goes to.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "damageShield" });
    const pick = (st: GameState, name: RegExp) => {
      const p = st.pending as { labels: string[]; options: string[] };
      return act(st, { type: "chooseOption", player: opp, choice: p.options[p.labels.findIndex((l) => name.test(l))]! });
    };
    s = pick(s, /Grizzly Bears/);
    s = pick(s, /Grizzly Bears/);
    s = toEndOfCombat(s);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.damage).toBe(0);
    expect(life(s, opp)).toBe(before - 3);
  });

  it("only for its controller: damage to another player isn't prevented", () => {
    const { s: s0, ap, opp } = setup([]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const c = putOnBattlefield(s0, third, cover);
    s0.objects[c]!.counters = { age: 3 };
    const before = life(s0, opp);
    const s = toEndOfCombat(fight(s0, ap, opp, [putOnBattlefield(s0, ap, giant)]));
    expect(life(s, opp)).toBe(before - 4);
  });
});
