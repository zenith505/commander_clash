// Round 109, earlier gaps: Delina, Wild Mage's tokens attack the player or planeswalker you choose as each is created
// (CR 508.4, rulings: not necessarily what Delina attacks).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, characteristics, nextRandom, waitingOn, type GameState, type PlayerId } from "../src";

const delina = card("Delina, Wild Mage", "Legendary Creature — Elf Shaman", "{3}{R}", {
  power: "3",
  toughness: "2",
  oracleText:
    'Whenever Delina attacks, choose target creature you control, then roll a d20.\n1—14 | Create a tapped and attacking token that\'s a copy of that creature, except it\'s not legendary and it has "At end of combat, exile this token."\n15—20 | Create one of those tokens. You may roll again.',
});
const elf = card("Test Elf", "Creature — Elf", "{2}{G}", { power: "2", toughness: "2" });
const walker = card("Test Walker", "Legendary Planeswalker — Test", "{3}", { loyalty: "5", oracleText: "+1: Draw a card." });

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
function rig(s: GameState, sides: number, values: number[]) {
  for (let st = 1; st < 50_000_000; st++) {
    const t = { rngState: st };
    if (values.every((v) => 1 + Math.floor(nextRandom(t) * sides) === v)) {
      s.rngState = st;
      return;
    }
  }
  throw new Error("no such seed");
}
const tokens = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === "Test Elf");

describe("Delina, Wild Mage: what each token attacks", () => {
  const start = () => {
    const { s: s0, ap } = setup([]);
    const opp = next(s0, ap);
    const third = next(s0, opp);
    const d = putOnBattlefield(s0, ap, delina);
    const e = putOnBattlefield(s0, ap, elf);
    const pw = putOnBattlefield(s0, third, walker);
    s0.objects[pw]!.counters.loyalty = 5;
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: d, defender: opp }] });
    return { s, ap, opp, third, d, e, pw, set: (x: GameState) => (s = x) };
  };

  it("you choose: another opponent, or a planeswalker; the one Delina attacks is offered first", () => {
    const { s: s0, ap, opp, third, e, pw } = start();
    let s = s0;
    rig(s, 20, [17, 5]);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(e)] } as never));
    let p = s.pending;
    if (p?.kind !== "chooseOption" || p.what !== "attackWhom") throw new Error("not asked");
    expect(p.player).toBe(ap);
    expect(p.options[0]).toBe(String(opp));
    expect(p.options).toContain(`${third}:${pw}`);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(third) }));
    // 17: roll again.
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    p = s.pending;
    if (p?.kind !== "chooseOption" || p.what !== "attackWhom") throw new Error("not asked again");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: `${third}:${pw}` }));
    const [a, b] = tokens(s).map((id) => s.objects[id]!).sort((x, y) => x.timestamp - y.timestamp);
    expect(a!.attacking).toBe(third);
    expect(a!.attackingPermanent).toBeUndefined();
    expect(b!.attacking).toBe(third);
    expect(b!.attackingPermanent?.id).toBe(pw);
  });

  it("a bot sends it where Delina attacks", () => {
    const { s: s0, ap, opp, e } = start();
    let s = s0;
    rig(s, 20, [3]);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(e)] } as never));
    s = settle(act(s, botActions(s, ap)[0]!));
    expect(s.objects[tokens(s)[0]!]!.attacking).toBe(opp);
  });
});
