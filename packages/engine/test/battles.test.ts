// Battles (CR 310): the Invasion Sieges. A battle enters with defense counters (310.4b) and a protector its controller
// chooses (310.9a), an opponent for a Siege (310.12a); damage removes defense counters (310.6); its controller and the
// other players can attack it (310.9b); defeated, a Siege is exiled and may be cast transformed (310.12b).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, pt, putOnBattlefield, scry, setup, target } from "./helpers";
import { applyAction, botActions, isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

const SIEGE = "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\n";
const belenon = scry("transform", [
  { name: "Invasion of Belenon", mana_cost: "{2}{W}", type_line: "Battle — Siege", defense: "5", oracle_text: `${SIEGE}When this Siege enters, create a 2/2 white and blue Knight creature token with vigilance.` },
  { name: "Belenon War Anthem", type_line: "Enchantment", color_indicator: ["W"], oracle_text: "Creatures you control get +1/+1." },
]);
const dominaria = scry("transform", [
  { name: "Invasion of Dominaria", mana_cost: "{2}{W}", type_line: "Battle — Siege", defense: "5", oracle_text: `${SIEGE}When this Siege enters, you gain 4 life and draw a card.` },
  { name: "Serra Faithkeeper", type_line: "Creature — Angel", color_indicator: ["W"], power: "4", toughness: "4", oracle_text: "Flying, vigilance" },
]);
const wayfinder = card("Deeproot Wayfinder", "Creature — Merfolk Scout", "{1}{G}", {
  power: "2",
  toughness: "3",
  oracleText:
    "Whenever this creature deals combat damage to a player or battle, surveil 1, then you may return a land card from your graveyard to the battlefield tapped. (To surveil 1, look at the top card of your library. You may put that card into your graveyard.)",
});
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

/** What the bot whose turn it is to act does, all of it (mana first). */
const bot = (s: GameState) => {
  for (const a of botActions(s, waitingOn(s)!)) s = act(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Cast the Siege and choose its protector. */
const castSiege = (s: GameState, ap: PlayerId, id: string, protector: PlayerId) => {
  s = cast(s, ap, id);
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "protector", player: ap });
  return settle(act(s, { type: "chooseOption", player: ap, choice: String(protector) }));
};
/** Through combat, nobody blocking, everything else answered as the bots would. */
const toEndOfCombat = (s: GameState) => {
  for (let i = 0; i < 300 && !(s.step === "endCombat" && !s.pending && !s.stack.length) && !(s.pending?.kind === "castFree"); i++) {
    const pend = s.pending;
    if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pend.player, blocks: [] });
    else if (pend) s = bot(s);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("battles (CR 310)", () => {
  it("supports the Sieges whose text is understood", () => {
    expect(isFullySupported(belenon)).toBe(true);
    expect(isFullySupported(dominaria)).toBe(true);
    expect(isFullySupported(wayfinder)).toBe(true);
  });

  it("enters with defense counters and an opponent as its protector; its enters ability works", () => {
    const { s: s0, ap, ids, opp } = setup([belenon]);
    let s = cast(s0, ap, ids[0]!);
    // Only an opponent can protect a Siege (CR 310.12a).
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "protector" });
    if (s.pending?.kind !== "chooseOption") throw new Error("no protector prompt");
    expect(s.pending.options).toHaveLength(3);
    expect(s.pending.options).not.toContain(String(ap));
    expect(() => act(s, { type: "chooseOption", player: ap, choice: String(ap) })).toThrow();
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("battlefield");
    expect(o.counters.defense).toBe(5);
    expect(o.protector).toBe(opp);
    expect(s.battlefield.some((id) => /Knight/.test(s.cards[s.objects[id]!.cardId]?.name ?? ""))).toBe(true);
  });

  it("damage removes defense counters (CR 310.6), and any target includes battles (CR 115.4)", () => {
    const { s: s0, ap, ids, opp } = setup([belenon, shock]);
    let s = castSiege(s0, ap, ids[0]!, opp);
    s = cast(s, ap, ids[1]!, [target(ids[0]!)]);
    expect(s.objects[ids[0]!]!.counters.defense).toBe(3);
  });

  it("its controller attacks it; defeated, it's exiled and cast transformed (CR 310.12b)", () => {
    const { s: s0, ap, ids, opp } = setup([belenon]);
    let s = castSiege(s0, ap, ids[0]!, opp);
    const big = putOnBattlefield(s, ap, bear({ name: "Big Bear", power: "5", toughness: "5" }));
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    s = passUntil(s, "declareAttackers", ap);
    // Only as the battle's protector's attacker (CR 310.9b).
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: big, defender: other, planeswalker: ids[0]! }] })).toThrow(/battle that player protects/);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: big, defender: opp, planeswalker: ids[0]! }] });
    expect(s.objects[big]!.attacking).toBe(opp);
    const life = s.players[opp]!.life;
    s = toEndOfCombat(s);
    expect(s.players[opp]!.life).toBe(life);
    expect(s.pending).toMatchObject({ kind: "castFree", how: "transformed", objectId: ids[0], player: ap });
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    // Only transformed, and for free.
    expect(() => act(s, { type: "castSpell", player: ap, objectId: ids[0]! })).toThrow(/only be cast transformed/);
    s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[0]!, face: 1 }));
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("battlefield");
    expect(s.cards[o.cardId]!.name).toMatch(/Invasion of Belenon/);
    expect(pt(s, big)).toBe("6/6"); // Belenon War Anthem
  });

  it("the protector blocks for it; the other players can't (CR 310.9c)", () => {
    const { s: s0, ap, ids, opp } = setup([belenon]);
    let s = castSiege(s0, ap, ids[0]!, opp);
    const a = putOnBattlefield(s, ap, bear());
    const guard = putOnBattlefield(s, opp, bear());
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    const stranger = putOnBattlefield(s, other, bear());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp, planeswalker: ids[0]! }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: opp });
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: stranger, attacker: a }] })).toThrow();
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: guard, attacker: a }] });
    s = toEndOfCombat(s);
    expect(s.objects[ids[0]!]!.counters.defense).toBe(5);
  });

  it("\"deals combat damage to a player or battle\" triggers on a battle too", () => {
    const { s: s0, ap, ids, opp } = setup([belenon]);
    let s = castSiege(s0, ap, ids[0]!, opp);
    const w = putOnBattlefield(s, ap, wayfinder);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: w, defender: opp, planeswalker: ids[0]! }] });
    for (let i = 0; i < 300 && !(s.step === "endCombat" && !s.pending && !s.stack.length); i++) {
      const pend = s.pending;
      if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pend.player, blocks: [] });
      else if (pend) s = bot(s);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[ids[0]!]!.counters.defense).toBe(3);
    expect(s.log.some((l) => /surveils/.test(l.text))).toBe(true);
  });

  it("a protector who leaves the game is replaced by its controller's choice (CR 704.5x)", () => {
    const { s: s0, ap, ids, opp } = setup([dominaria]);
    let s = castSiege(s0, ap, ids[0]!, opp);
    s.players[opp]!.life = 0;
    s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[opp]!.lost).toBe(true);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "protector", player: ap });
    if (s.pending?.kind !== "chooseOption") throw new Error("no protector prompt");
    expect(s.pending.options).toHaveLength(2);
    const pick = s.pending.options[0]!;
    s = act(s, { type: "chooseOption", player: ap, choice: pick });
    expect(s.objects[ids[0]!]!.protector).toBe(Number(pick));
  });

  it("bots attack their own Siege when they can defeat it, choose a protector, and cast the back face", () => {
    const { s: s0, ap, ids } = setup([dominaria]);
    let s = cast(s0, ap, ids[0]!);
    s = settle(bot(s));
    const o = s.objects[ids[0]!]!;
    expect(o.protector).not.toBeUndefined();
    expect(o.protector).not.toBe(ap);
    const big = putOnBattlefield(s, ap, bear({ name: "Big Bear", power: "5", toughness: "5" }));
    s = passUntil(s, "declareAttackers", ap);
    s = bot(s);
    expect(s.objects[big]!.attackingPermanent?.id).toBe(ids[0]);
    s = toEndOfCombat(s);
    expect(s.pending?.kind).toBe("castFree");
    s = settle(bot(s));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(pt(s, ids[0]!)).toBe("4/4"); // Serra Faithkeeper
  });
});
