// The Lairs: "When this land enters, sacrifice it unless you return a non-Lair land you control to its owner's hand."
// Any non-Lair land, tapped or not (rulings); with none, it's sacrificed.

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const catacombs = card("Crosis's Catacombs", "Land — Lair", "", { oracleText: "When this land enters, sacrifice it unless you return a non-Lair land you control to its owner's hand.\n{T}: Add {U}, {B}, or {R}.", producedMana: ["B", "R", "U"] });

const toTrigger = (s: GameState) => {
  for (let i = 0; i < 10 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("Lairs", () => {
  it("is supported", () => expect(isFullySupported(catacombs)).toBe(true));

  it("returning a land keeps it; declining sacrifices it", () => {
    const { s: s0, ap, ids } = setup([catacombs]);
    let s = toTrigger(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "bounce" });
    if (s.pending?.kind !== "pickPermanents") throw new Error();
    expect(s.pending.options).not.toContain(ids[0]); // not itself: it's a Lair
    const land = s.pending.options[0]!;
    s = toTrigger(act(s, { type: "pickPermanents", player: ap, ids: [land] }));
    expect(s.objects[land]!.zone).toBe("hand");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");

    const t0 = setup([catacombs]);
    let t = toTrigger(act(t0.s, { type: "playLand", player: t0.ap, objectId: t0.ids[0]! }));
    t = toTrigger(act(t, { type: "chooseMay", player: t0.ap, yes: false }));
    expect(t.objects[t0.ids[0]!]!.zone).toBe("graveyard");
  });

  it("with no other land to return, it's sacrificed without asking", () => {
    const { s: s0, ap, ids } = setup([catacombs]);
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap) {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      delete s0.objects[id];
    }
    putOnBattlefield(s0, ap, card("Other Lair", "Land — Lair", "", { oracleText: "" }));
    const s = toTrigger(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }));
    expect(s.pending).toBeNull();
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});
