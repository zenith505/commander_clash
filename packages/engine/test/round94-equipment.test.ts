// Round 94: "Whenever ~ or another Equipment you control enters, you may attach that Equipment to target creature you
// control" (Hammer of Nazahn), "Whenever an Equipment you control enters, you may attach it ..." (Sigarda's Aid): the
// Equipment that entered is attached (CR 701.3a), not the source of the ability.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, power, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const hammer = card("Hammer of Nazahn", "Legendary Artifact — Equipment", "{4}", { keywords: ["Equip"], oracleText: "Whenever Hammer of Nazahn or another Equipment you control enters, you may attach that Equipment to target creature you control.\nEquipped creature gets +2/+0 and has indestructible.\nEquip {4}" });
const aid = card("Sigarda's Aid", "Enchantment", "{W}", { oracleText: "You may cast Aura and Equipment spells as though they had flash.\nWhenever an Equipment you control enters, you may attach it to target creature you control." });
const bonesplitter = card("Bonesplitter", "Artifact — Equipment", "{1}", { keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    s = p?.kind === "chooseMay" ? act(s, { type: "chooseMay", player: p.player, yes: true }) : act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("attaching the Equipment that entered", () => {
  it("parse", () => {
    for (const d of [hammer, aid]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Hammer of Nazahn attaches itself as it enters, and another Equipment as that one enters", () => {
    const { s: s0, ap, ids } = setup([hammer, bonesplitter]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = cast(s0, ap, ids[0]!);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(b)] });
    s = settle(s);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    expect(power(s, s.objects[b]!)).toBe(4);
    s = cast(s, ap, ids[1]!);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(b)] });
    s = settle(s);
    expect(s.objects[ids[1]!]!.attachedTo).toBe(b);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    expect(power(s, s.objects[b]!)).toBe(6);
  });

  it("Sigarda's Aid attaches the Equipment, not itself", () => {
    const { s: s0, ap, ids } = setup([bonesplitter]);
    const a = putOnBattlefield(s0, ap, aid);
    const b = putOnBattlefield(s0, ap, bear());
    let s = cast(s0, ap, ids[0]!);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(b)] });
    s = settle(s);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    expect(s.objects[a]!.attachedTo).toBeUndefined();
    expect(power(s, s.objects[b]!)).toBe(4);
  });
});
