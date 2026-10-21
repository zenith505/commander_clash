// Round 109, earlier gaps: Delina, Wild Mage's tokens attack the player or planeswalker you choose as each is created
// (CR 508.4, rulings: not necessarily what Delina attacks); a permission to cast spells from your graveyard that names
// no cost (Yawgmoth's Will) lets you pay an alternative cost instead (CR 118.9, rulings on Muldrotha, Lurrus, Emry).

import { describe, expect, it } from "vitest";
import { act, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, characteristics, isFullySupported, nextRandom, planCast, waitingOn, type GameState, type PlayerId } from "../src";

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

const will = card("Yawgmoth's Will", "Sorcery", "{2}{B}", {
  oracleText: "Until end of turn, you may play lands and cast spells from your graveyard.\nIf a card would be put into your graveyard from anywhere this turn, exile that card instead.",
});
const drifter = card("Mulldrifter", "Creature — Elemental", "{4}{U}", {
  power: "2",
  toughness: "2",
  keywords: ["Flying", "Evoke"],
  oracleText: "Flying\nWhen this creature enters, draw two cards.\nEvoke {2}{U} (You may cast this spell for its evoke cost. If you do, it's sacrificed when it enters.)",
});
const flashy = card("Test Flashback", "Sorcery", "{1}{R}", {
  keywords: ["Flashback", "Overload"],
  oracleText: "Test Flashback deals 1 damage to target creature.\nFlashback {3}{R}\nOverload {4}{R}{R} (You may cast this spell for its overload cost. If you do, change \"target\" in its text to \"each.\")",
});

describe("Casting from the graveyard for an alternative cost", () => {
  const inGraveyard = (s: GameState, pid: PlayerId, def: typeof drifter) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "graveyard";
    s.players[pid]!.graveyard.push(id);
    return id;
  };
  const untapped = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped).length;

  it("Yawgmoth's Will: Mulldrifter evoked from the graveyard, for {2}{U}", () => {
    expect(isFullySupported(drifter)).toBe(true);
    const { s: s0, ap, ids } = setup([will]);
    let s = s0;
    const m = inGraveyard(s, ap, drifter);
    s = settle(cast(s, ap, ids[0]!));
    const before = untapped(s, ap);
    const hand = s.players[ap]!.hand.length;
    const plan = planCast(s, ap, m, undefined, undefined, "auto", undefined, { via: "permission", alt: "evoke" });
    expect(plan).not.toBeNull();
    s = settle(plan!.reduce((x, a) => act(x, a), s));
    // Three lands for {2}{U}, not five; it entered, drew two, and was sacrificed (exiled instead, Yawgmoth's Will).
    expect(before - untapped(s, ap)).toBe(3);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.objects[m]!.zone).toBe("exile");
  });

  it("not with flashback (an alternative cost itself, CR 118.9a), and not without a permission", () => {
    const { s: s0, ap, ids } = setup([will]);
    let s = s0;
    const f = inGraveyard(s, ap, flashy);
    const m = inGraveyard(s, ap, drifter);
    expect(castProblem(s, ap, m, undefined, undefined, undefined, undefined, undefined, { via: "permission", alt: "evoke" })).toMatch(/doesn't have/);
    s = settle(cast(s, ap, ids[0]!));
    expect(castProblem(s, ap, f, undefined, undefined, undefined, undefined, undefined, { via: "flashback", alt: "overload" })).toMatch(/can't be cast for its overload cost this way/);
    expect(planCast(s, ap, m, undefined, undefined, "auto", undefined, { via: "permission", alt: "evoke" })).not.toBeNull();
  });
});
