// Cost counters (Devoted Druid), counter replacement that subtracts one (Vizier of Remedies, CR 614.1a, 616.1),
// wither through that replacement, flashback granted until end of turn (Snapcaster Mage, Past in Flames; CR 702.34a)
// and "has hexproof as long as it's untapped" (Paradise Druid).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { castProblem, compileCard, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const druid = card("Devoted Druid", "Creature — Elf Druid", "{1}{G}", {
  power: "0",
  toughness: "2",
  oracleText: "{T}: Add {G}.\nPut a -1/-1 counter on this creature: Untap this creature.",
});
const vizier = card("Vizier of Remedies", "Creature — Human Cleric", "{1}{W}", {
  power: "2",
  toughness: "1",
  oracleText: "If one or more -1/-1 counters would be put on a creature you control, that many -1/-1 counters minus one are put on it instead.",
});
const snapcaster = card("Snapcaster Mage", "Creature — Human Wizard", "{1}{U}", {
  power: "2",
  toughness: "1",
  oracleText:
    "Flash\nWhen this creature enters, target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost. (You may cast that card from your graveyard for its flashback cost. Then exile it.)",
});
const pastInFlames = card("Past in Flames", "Sorcery", "{3}{R}", {
  oracleText:
    "Each instant and sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost.\nFlashback {4}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)",
});
const paradise = card("Paradise Druid", "Creature — Elf Druid", "{1}{G}", {
  power: "2",
  toughness: "1",
  oracleText:
    "This creature has hexproof as long as it's untapped. (It can't be the target of spells or abilities your opponents control.)\n{T}: Add one mana of any color.",
});
const ramGang = card("Boggart Ram-Gang", "Creature — Goblin Warrior", "{R/G}{R/G}{R/G}", {
  power: "3",
  toughness: "3",
  oracleText: "Haste\nWither (This deals damage to creatures in the form of -1/-1 counters.)",
  keywords: ["Haste", "Wither"],
});
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const noCost = card("Costless Sorcery", "Sorcery", "", { oracleText: "Draw two cards." });

const minus = (s: GameState, id: string) => s.objects[id]!.counters["-1/-1"] ?? 0;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(passAll(s));
};
const toGraveyard = (s: GameState, pid: PlayerId, id: string) => {
  const p = s.players[pid]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  p.graveyard.push(id);
  s.objects[id]!.zone = "graveyard";
};
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const untapIndex = () => compileCard(druid).activated.findIndex((a) => a.putCounters);

describe("Devoted Druid and Vizier of Remedies", () => {
  it("compiles", () => {
    supported(druid, vizier, ramGang);
    expect(compileCard(druid).activated[untapIndex()]).toMatchObject({ putCounters: { counter: "-1/-1", n: 1 } });
  });

  it("putting the counter is the cost: it untaps and shrinks, and a second time kills it", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, druid);
    s0.objects[d]!.tapped = true;
    let s = activate(s0, ap, d, untapIndex());
    expect(s.objects[d]!.tapped).toBe(false);
    expect(minus(s, d)).toBe(1);
    s = activate(s, ap, d, untapIndex());
    expect(zone(s, d)).toBe("graveyard"); // 0/0 (CR 704.5f)
  });

  it("with Vizier of Remedies the cost puts no counter, so it untaps for free", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, vizier);
    const d = putOnBattlefield(s0, ap, druid);
    let s = s0;
    for (let i = 0; i < 5; i++) {
      s.objects[d]!.tapped = true;
      s = activate(s, ap, d, untapIndex());
    }
    expect(s.objects[d]!.tapped).toBe(false);
    expect(minus(s, d)).toBe(0);
    expect(zone(s, d)).toBe("battlefield");
  });

  it("Vizier only helps its controller's creatures", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, vizier);
    const d = putOnBattlefield(s0, ap, druid);
    s0.objects[d]!.tapped = true;
    const s = activate(s0, ap, d, untapIndex());
    expect(minus(s, d)).toBe(1);
  });

  it("wither damage under Vizier: one fewer counter for the batch", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, vizier);
    const a = putOnBattlefield(s0, ap, ramGang);
    const b = putOnBattlefield(s0, opp, bear({ name: "Wall", power: "0", toughness: "5" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    for (let i = 0; i < 12 && s.pending?.kind !== "declareBlockers" && s.step !== "endCombat"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    while (s.pending?.kind === "declareBlockers") {
      const pid = s.pending.player;
      s = act(s, { type: "declareBlockers", player: pid, blocks: pid === opp ? [{ blocker: b, attacker: a }] : [] });
    }
    s = passUntil(s, "endCombat", ap);
    expect(minus(s, b)).toBe(2);
  });
});

describe("granted flashback", () => {
  it("compiles", () => supported(snapcaster, pastInFlames));

  it("Snapcaster Mage: the targeted card can be cast for its mana cost, then it's exiled", () => {
    const { s: s0, ap, opp, ids } = setup([snapcaster, shock]);
    toGraveyard(s0, ap, ids[1]!);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    if (s.pending?.kind === "chooseTargets") s = settle(passAll(act(s, { type: "chooseTargets", player: ap, targets: [target(ids[1]!)] })));
    expect(s.log.some((e) => /Shock gains flashback until end of turn/.test(e.text))).toBe(true);
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }], undefined, undefined, undefined, { via: "grantedFlashback" }));
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.log.some((e) => /casts Shock from their graveyard \(flashback\)/.test(e.text))).toBe(true);
    expect(zone(s, ids[1]!)).toBe("exile");
  });

  it("the grant ends with the turn", () => {
    const { s: s0, ap, ids } = setup([snapcaster, divination]);
    toGraveyard(s0, ap, ids[1]!);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    if (s.pending?.kind === "chooseTargets") s = settle(passAll(act(s, { type: "chooseTargets", player: ap, targets: [target(ids[1]!)] })));
    expect(planCast(s, ap, ids[1]!, undefined, undefined, undefined, undefined, { via: "grantedFlashback" })).not.toBeNull();
    s = passUntil(s, "upkeep");
    expect(castProblem(s, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, { via: "grantedFlashback" })).toMatch(/doesn't have|choose how|can only/);
  });

  it("Past in Flames: the instants and sorceries there now gain it; a card with no mana cost still can't be cast", () => {
    const { s: s0, ap, ids } = setup([pastInFlames, divination, noCost]);
    toGraveyard(s0, ap, ids[1]!);
    toGraveyard(s0, ap, ids[2]!);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(planCast(s, ap, ids[1]!, undefined, undefined, undefined, undefined, { via: "grantedFlashback" })).not.toBeNull();
    expect(castProblem(s, ap, ids[2]!, undefined, undefined, undefined, undefined, undefined, { via: "grantedFlashback" })).toMatch(/no mana cost/);
    // Past in Flames itself was on the stack, not in the graveyard, when it resolved: only its own flashback.
    expect(planCast(s, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "grantedFlashback" })).toBeNull();
    expect(planCast(s, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "flashback" })).not.toBeNull();
  });
});

describe("hexproof as long as it's untapped", () => {
  it("opponents can target it only while it's tapped", () => {
    supported(paradise);
    const { s: s0, ap, opp, ids } = setup([shock]);
    const p = putOnBattlefield(s0, opp, paradise);
    expect(castProblem(s0, ap, ids[0]!, [target(p)])).toMatch(/hexproof|target/);
    expect(planCast(s0, ap, ids[0]!, [target(p)])).toBeNull();
    const s = structuredClone(s0);
    s.objects[p]!.tapped = true;
    expect(planCast(s, ap, ids[0]!, [target(p)])).not.toBeNull();
  });
});
