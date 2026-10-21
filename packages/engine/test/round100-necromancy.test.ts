// Round 100: Necromancy (rulings: it enters as an enchantment, becomes an Aura as its trigger resolves, then follows the
// rules for Auras; "sacrifice at the next cleanup step" only when cast at instant speed with its own permission).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { characteristics, isFullySupported, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const necromancy = card("Necromancy", "Enchantment", "{2}{B}", { oracleText: "You may cast this spell as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step.\nWhen this enchantment enters, if it's on the battlefield, it becomes an Aura with \"enchant creature put onto the battlefield with Necromancy.\" Put target creature card from a graveyard onto the battlefield under your control and attach this enchantment to it. When this enchantment leaves the battlefield, that creature's controller sacrifices it." });
const disenchant = card("Disenchant", "Instant", "{1}{W}", { oracleText: "Destroy target artifact or enchantment." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't cast");
  for (const a of plan) s = act(s, a);
  return s;
};
/** A creature card in `pid`'s graveyard. */
function buried(s: GameState, pid: PlayerId, name = "Grizzly Bears") {
  const id = putOnBattlefield(s, pid, bear({ name }));
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
}
/** Answer the enters trigger's target with `card`. */
function aim(s: GameState, cardId: string) {
  for (let i = 0; i < 50; i++) {
    if (s.pending?.kind === "chooseTargets") return settle(act(s, { type: "chooseTargets", player: s.pending.player, targets: [{ kind: "object", id: cardId }] }));
    if (!s.stack.length && !s.triggerQueue.length) break;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}
const onField = (s: GameState, name: string) => s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === name);

describe("round 100: Necromancy", () => {
  it("parse", () => expect(isFullySupported(necromancy)).toBe(true));

  it("puts an opponent's creature card onto the battlefield under your control and becomes an Aura attached to it; when it leaves, the creature is sacrificed", () => {
    const { s: s0, ap, ids, opp } = setup([necromancy, disenchant]);
    const dead = buried(s0, opp, "Runeclaw Bear");
    let s = aim(run(s0, planCast(s0, ap, ids[0]!)), dead);
    const bearId = onField(s, "Runeclaw Bear")!;
    expect(s.objects[bearId]!.controller).toBe(ap);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(bearId);
    expect(characteristics(s, s.objects[ids[0]!]!).subtypes).toContain("Aura");
    // Cast at sorcery speed: it stays past the cleanup step.
    s = passUntil(s, "upkeep");
    expect(onField(s, "Necromancy")).toBeDefined();
    expect(onField(s, "Runeclaw Bear")).toBeDefined();
  });

  it("destroyed, the creature goes too", () => {
    const { s: s0, ap, ids, opp } = setup([necromancy, disenchant]);
    const dead = buried(s0, opp, "Runeclaw Bear");
    let s = aim(run(s0, planCast(s0, ap, ids[0]!)), dead);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: ids[0]! }])));
    expect(onField(s, "Necromancy")).toBeUndefined();
    expect(onField(s, "Runeclaw Bear")).toBeUndefined();
    expect(s.players[opp]!.graveyard.map((id) => s.cards[s.objects[id]!.cardId]!.name)).toContain("Runeclaw Bear");
  });

  it("cast at instant speed, it's sacrificed at the next cleanup step and takes the creature with it", () => {
    const { s: s0, ap, ids } = setup([necromancy]);
    const dead = buried(s0, ap);
    let s = passUntil(s0, "end", ap);
    s = aim(run(s, planCast(s, ap, ids[0]!)), dead);
    expect(onField(s, "Grizzly Bears")).toBeDefined();
    s = passUntil(s, "upkeep");
    expect(onField(s, "Necromancy")).toBeUndefined();
    expect(onField(s, "Grizzly Bears")).toBeUndefined();
  });
});
