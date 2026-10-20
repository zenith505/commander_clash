// Round 93: Sevinne's Reclamation. "Return target permanent card with mana value 3 or less from your graveyard to the
// battlefield. If this spell was cast from a graveyard, you may copy this spell and may choose a new target for the
// copy." The copy is made as it resolves and wasn't cast, so it makes no copy of its own (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, setup, target } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const sevinne = card("Sevinne's Reclamation", "Sorcery", "{2}{W}", { oracleText: "Return target permanent card with mana value 3 or less from your graveyard to the battlefield. If this spell was cast from a graveyard, you may copy this spell and may choose a new target for the copy.\nFlashback {4}{W} (You may cast this card from your graveyard for its flashback cost. Then exile it.)", keywords: ["Flashback"] });

const toGraveyard = (s: GameState, pid: PlayerId, id: string) => {
  const p = s.players[pid]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  p.graveyard.push(id);
  s.objects[id]!.zone = "graveyard";
};
const step = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });

describe("Sevinne's Reclamation", () => {
  it("parse", () => expect(isFullySupported(sevinne)).toBe(true));

  it("cast from your hand: no copy", () => {
    const { s: s0, ap, ids } = setup([sevinne, bear(), bear()]);
    toGraveyard(s0, ap, ids[1]!);
    toGraveyard(s0, ap, ids[2]!);
    let s = planCast(s0, ap, ids[0]!, [target(ids[1]!)])!.reduce((x, a) => act(x, a), s0);
    for (let i = 0; i < 10 && s.stack.length && !s.pending; i++) s = step(s);
    expect(s.pending).toBeNull();
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[2]!]!.zone).toBe("graveyard");
  });

  it("flashed back: you may copy it with a new target; the copy returns that card too", () => {
    const { s: s0, ap, ids } = setup([sevinne, bear(), bear()]);
    for (const id of ids) toGraveyard(s0, ap, id);
    let s = planCast(s0, ap, ids[0]!, [target(ids[1]!)], undefined, undefined, undefined, { via: "flashback" })!.reduce((x, a) => act(x, a), s0);
    for (let i = 0; i < 10 && !s.pending; i++) s = step(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending?.kind).toBe("copyTargets");
    s = act(s, { type: "copyTargets", player: ap, targets: [target(ids[2]!)] });
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    for (let i = 0; i < 10 && s.stack.length && !s.pending; i++) s = step(s);
    expect(s.pending).toBeNull();
    expect(s.objects[ids[2]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    s = passAll(s);
  });
});
