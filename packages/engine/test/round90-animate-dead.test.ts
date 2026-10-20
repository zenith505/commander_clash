// Animate Dead (round 90): an Aura spell that targets a creature card in a graveyard (CR 303.4a) and enters attached to
// it; its enters trigger, if it's still on the battlefield, returns that card under your control and attaches itself to
// the creature it became (a new object, CR 400.7). When it leaves, that creature's controller sacrifices it. A creature it
// can't enchant (protection from black) comes back, the Aura goes to the graveyard and the creature is sacrificed
// (rulings).

import { describe, expect, it } from "vitest";
import { act, card, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const animateDead = card("Animate Dead", "Enchantment — Aura", "{1}{B}", { oracleText: "Enchant creature card in a graveyard\nWhen this Aura enters, if it's on the battlefield, it loses \"enchant creature card in a graveyard\" and gains \"enchant creature put onto the battlefield with this Aura.\" Return enchanted creature card to the battlefield under your control and attach this Aura to it. When this Aura leaves the battlefield, that creature's controller sacrifices it.\nEnchanted creature gets -1/-0." });
const dragon = card("Big Dragon", "Creature — Dragon", "{5}{R}{R}", { power: "6", toughness: "6", keywords: ["Flying"], oracleText: "Flying" });
const pfb = card("White Knight", "Creature — Human Knight", "{W}{W}", { power: "2", toughness: "2", keywords: ["First strike", "Protection"], oracleText: "First strike\nProtection from black" });
const disenchant = card("Disenchant", "Instant", "{1}{W}", { oracleText: "Destroy target artifact or enchantment." });
const exhume = card("Bury Card", "Instant", "{B}", { oracleText: "Exile target card from a graveyard." });

function toGraveyard(s: GameState, pid: PlayerId, def: CardDef): string {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
}
function settle(s: GameState): GameState {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
function castAt(s: GameState, pid: PlayerId, id: string, t: string) {
  const plan = planCast(s, pid, id, [target(t)]);
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
}

describe("Animate Dead", () => {
  it("parses", () => expect(isFullySupported(animateDead)).toBe(true));

  it("returns an opponent's creature card under your control, attached and -1/-0; leaving, it takes the creature with it", () => {
    const { s: s0, ap, ids, opp } = setup([animateDead, disenchant]);
    const d = toGraveyard(s0, opp, dragon);
    let s = settle(castAt(s0, ap, ids[0]!, d));
    expect(s.objects[d]!).toMatchObject({ zone: "battlefield", controller: ap });
    expect(s.objects[ids[0]!]!).toMatchObject({ zone: "battlefield", attachedTo: d });
    expect(pt(s, d)).toBe("5/6");
    s = settle(castAt(s, ap, ids[1]!, ids[0]!));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    // Sacrificed: back to its owner's graveyard.
    expect(s.objects[d]!.zone).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(d);
  });

  it("does nothing if the card leaves the graveyard first; the Aura goes to the graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([animateDead, exhume]);
    const d = toGraveyard(s0, opp, dragon);
    let s = castAt(s0, ap, ids[0]!, d);
    // Animate Dead resolves; its trigger waits on the stack.
    for (let i = 0; i < 10 && s.objects[ids[0]!]!.zone !== "battlefield"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && !s.stack.some((x) => x.sourceId === ids[0]); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.some((x) => x.sourceId === ids[0])).toBe(true);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    // In response to the trigger, the card is exiled.
    s = settle(castAt(s, ap, ids[1]!, d));
    expect(s.objects[d]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("a creature with protection from black comes back, but the Aura falls off and it's sacrificed", () => {
    const { s: s0, ap, ids } = setup([animateDead]);
    const k = toGraveyard(s0, ap, pfb);
    const s = settle(castAt(s0, ap, ids[0]!, k));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[k]!.zone).toBe("graveyard");
  });

  it("a bot animates the biggest creature card it can", () => {
    const { s: s0, ap, ids, opp } = setup([animateDead]);
    const d = toGraveyard(s0, opp, dragon);
    toGraveyard(s0, ap, card("Small Guy", "Creature — Human", "{W}", { power: "1", toughness: "1" }));
    s0.players[ap]!.hand = [ids[0]!];
    s0.players[ap]!.command = [];
    const acts = botActions(s0, ap);
    const castIt = acts.find((a) => a.type === "castSpell" && a.objectId === ids[0]);
    expect(castIt).toBeDefined();
    expect((castIt as { targets?: { id: string }[] }).targets?.[0]?.id).toBe(d);
  });
});
