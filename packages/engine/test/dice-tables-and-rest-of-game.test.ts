// More results tables (CR 706.3a): "Choose an opponent. That player ..." chosen as it resolves (CR 608.2d), "Those creatures
// don't untap" for the creatures just tapped (CR 502.3), "Until your next turn, creatures your opponents control enter
// tapped" (a replacement effect that lasts, CR 614.1c, 611.2b), a mana ability that rolls (CR 605.1a), an ability that
// works only while its card is in your graveyard (CR 113.6j). "You have no maximum hand size for the rest of the game"
// (CR 402.2), and "Return all cards from your graveyard to your hand".

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";
import { nextRandom } from "../src/rng";
import { hasNoMaxHandSize, moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** The next dice rolled come up `values`, in order (the game's seeded random numbers, CR 706.1b). */
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
/** A card in `pid`'s graveyard. */
function inYard(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
}

// Real oracle text (Scryfall).
const edict = card("Myrkul's Edict", "Sorcery", "{1}{B}", { oracleText: "Roll a d20.\n1—9 | Choose an opponent. That player sacrifices a creature of their choice.\n10—19 | Each opponent sacrifices a creature of their choice.\n20 | Each opponent sacrifices a creature with the greatest power among creatures that player controls." });
const cone = card("Cone of Cold", "Sorcery", "{3}{U}", { oracleText: "Roll a d20.\n1—9 | Tap all creatures your opponents control.\n10—19 | Tap all creatures your opponents control. Those creatures don't untap during their controllers' next untap steps.\n20 | Tap all creatures your opponents control. Those creatures don't untap during their controllers' next untap steps. Until your next turn, creatures your opponents control enter tapped." });
const scion = card("Scion of Stygia", "Creature — Tiefling Shaman", "{2}{U}", { power: "2", toughness: "1", keywords: ["Flash"], oracleText: "Flash\nCone of Cold — When this creature enters, choose target creature an opponent controls, then roll a d20.\n1—9 | Tap that creature.\n10—20 | Tap that creature. It doesn't untap during its controller's next untap step." });
const silver = card("Ancient Silver Dragon", "Creature — Elder Dragon", "{6}{U}{U}", { power: "8", toughness: "8", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature deals combat damage to a player, roll a d20. Draw cards equal to the result. You have no maximum hand size for the rest of the game." });
const counsel = card("Praetor's Counsel", "Sorcery", "{5}{G}{G}{G}", { oracleText: "Return all cards from your graveyard to your hand. Exile Praetor's Counsel. You have no maximum hand size for the rest of the game." });
const wisdom = card("Wisdom of Ages", "Sorcery", "{4}{U}{U}{U}", { oracleText: "Return all instant and sorcery cards from your graveyard to your hand. You have no maximum hand size for the rest of the game.\nExile Wisdom of Ages." });
const troll = card("Loathsome Troll", "Creature — Troll", "{3}{G}{G}", { power: "6", toughness: "2", oracleText: "{3}{G}: Roll a d20. Activate only if this card is in your graveyard.\n1—9 | Put this card on top of your library.\n10—19 | Return this card to your hand.\n20 | Return this card to the battlefield tapped." });
const puzzlebox = card("Vexing Puzzlebox", "Artifact", "{3}", { oracleText: "Whenever you roll one or more dice, put a number of charge counters on this artifact equal to the result.\n{T}: Add one mana of any color. Roll a d20.\n{T}, Remove 100 charge counters from this artifact: Search your library for an artifact card, put that card onto the battlefield, then shuffle." });

const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const big = bear({ name: "Test Giant", power: "5", toughness: "5" });

describe("dice tables", () => {
  it("parse", () => {
    supported(edict, cone, scion, silver, counsel, wisdom, troll, puzzlebox);
    expect(compileCard(troll).activated[0]).toMatchObject({ zone: "graveyard" });
    expect(compileCard(troll).activated[0]!.exileSelf).toBeUndefined();
    expect(compileCard(puzzlebox).activated[0]!.mana).toBeTruthy();
  });

  it("Myrkul's Edict 1-9: you choose an opponent as it resolves, and that player sacrifices a creature", () => {
    const { s: s0, ap, ids } = setup([edict]);
    const [o1, o2] = s0.turnOrder.filter((p) => p !== ap) as [PlayerId, PlayerId];
    const theirs = putOnBattlefield(s0, o2, bear());
    const other = putOnBattlefield(s0, o1, bear());
    rig(s0, 20, [4]);
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "opponent", player: ap });
    expect((s.pending as { options: string[] }).options).toHaveLength(3);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(o2) }));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[other]!.zone).toBe("battlefield");
    expect(s.log.some((l) => l.text === `${s.players[ap]!.name} chooses ${s.players[o2]!.name} for Myrkul's Edict.`)).toBe(true);
  });

  it("Myrkul's Edict 20: each opponent sacrifices the creature with the greatest power", () => {
    const { s: s0, ap, ids, opp } = setup([edict]);
    const small = putOnBattlefield(s0, opp, bear());
    const giant = putOnBattlefield(s0, opp, big);
    rig(s0, 20, [20]);
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.objects[giant]!.zone).toBe("graveyard");
    expect(s.objects[small]!.zone).toBe("battlefield");
  });

  it("Cone of Cold 20: tapped, they don't untap, and until your next turn their creatures enter tapped", () => {
    const { s: s0, ap, ids, opp } = setup([cone]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const mine = putOnBattlefield(s0, ap, bear());
    const later = inYard(s0, opp, bear({ name: "Late Bear" }));
    const myLater = inYard(s0, ap, bear({ name: "My Late Bear" }));
    rig(s0, 20, [20]);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.objects[theirs]).toMatchObject({ tapped: true, skipNextUntap: true });
    expect(s.objects[mine]!.tapped).toBe(false);
    moveObject(s, later, "battlefield");
    moveObject(s, myLater, "battlefield");
    expect(s.objects[later]!.tapped).toBe(true);
    expect(s.objects[myLater]!.tapped).toBe(false);
    // Over at the start of your next turn (CR 611.2b).
    s = passUntil(passUntil(s, "upkeep", opp), "upkeep", ap);
    expect(s.entersTappedUntil).toBeUndefined();
    const again = inYard(s, opp, bear({ name: "Last Bear" }));
    moveObject(s, again, "battlefield");
    expect(s.objects[again]!.tapped).toBe(false);
  });

  it("Cone of Cold 10-19: only tapped and not untapping; 1-9: only tapped", () => {
    for (const [roll, skips] of [[15, true], [3, false]] as const) {
      const { s: s0, ap, ids, opp } = setup([cone]);
      const theirs = putOnBattlefield(s0, opp, bear());
      rig(s0, 20, [roll]);
      const s = settle(cast(s0, ap, ids[0]!));
      expect(s.objects[theirs]!.tapped, `rolled ${roll}`).toBe(true);
      expect(!!s.objects[theirs]!.skipNextUntap, `rolled ${roll}`).toBe(skips);
      expect(s.entersTappedUntil).toBeUndefined();
    }
  });

  it("Scion of Stygia: the target chosen as it triggers, then the roll", () => {
    const { s: s0, ap, ids, opp } = setup([scion]);
    const theirs = putOnBattlefield(s0, opp, bear());
    rig(s0, 20, [12]);
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: theirs }] }));
    expect(s.objects[theirs]).toMatchObject({ tapped: true, skipNextUntap: true });
  });
});

describe("for the rest of the game", () => {
  it("Ancient Silver Dragon: draw cards equal to the result, and no maximum hand size", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, silver);
    rig(s0, 20, [11]);
    const hand = s0.players[ap]!.hand.length;
    expect(hasNoMaxHandSize(s0, ap)).toBe(false);
    s0.triggerQueue.push({ sourceId: d, sourceCardId: silver.oracleId, controller: ap, index: 0, sourceZc: 0, event: { player: opp } });
    const s = settle(s0);
    expect(s.players[ap]!.hand.length).toBe(hand + 11);
    expect(hasNoMaxHandSize(s, ap)).toBe(true);
    // Even once the Dragon is gone.
    moveObject(s, d, "graveyard");
    expect(hasNoMaxHandSize(s, ap)).toBe(true);
    expect(hasNoMaxHandSize(s, opp)).toBe(false);
  });

  it("Praetor's Counsel: every card from your graveyard, then it exiles itself", () => {
    const { s: s0, ap, ids } = setup([counsel]);
    const yard = [inYard(s0, ap, bear()), inYard(s0, ap, shock)];
    const s = cast(s0, ap, ids[0]!);
    for (const id of yard) expect(s.objects[id]!.zone).toBe("hand");
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(hasNoMaxHandSize(s, ap)).toBe(true);
  });

  it("Wisdom of Ages: only instants and sorceries", () => {
    const { s: s0, ap, ids } = setup([wisdom]);
    const b = inYard(s0, ap, bear());
    const sh = inYard(s0, ap, shock);
    const s = cast(s0, ap, ids[0]!);
    expect(s.objects[sh]!.zone).toBe("hand");
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });
});

describe("Loathsome Troll and Vexing Puzzlebox", () => {
  it("Loathsome Troll: only from your graveyard; each row moves the card", () => {
    for (const [roll, zone] of [[5, "library"], [12, "hand"], [20, "battlefield"]] as const) {
      const { s: s0, ap } = setup([]);
      const t = inYard(s0, ap, troll);
      rig(s0, 20, [roll]);
      const s = activate(s0, ap, t, 0);
      expect(s.objects[t]!.zone, `rolled ${roll}`).toBe(zone);
      if (zone === "library") expect(s.players[ap]!.library[0]).toBe(t);
      if (zone === "battlefield") expect(s.objects[t]!.tapped).toBe(true);
    }
    const { s: s1, ap } = setup([]);
    const onField = putOnBattlefield(s1, ap, troll);
    expect(() => activate(s1, ap, onField, 0)).toThrow();
  });

  it("Vexing Puzzlebox: a mana ability that rolls, and the roll puts charge counters on it", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, puzzlebox);
    rig(s0, 20, [17]);
    let s = act(s0, { type: "activateAbility", player: ap, objectId: p, index: 0, mana: "R" });
    expect(s.players[ap]!.manaPool.R).toBe(1);
    expect(s.stack).toHaveLength(0); // it didn't use the stack (CR 605.3b)
    s = settle(s);
    expect(s.objects[p]!.counters.charge).toBe(17);
  });
});
