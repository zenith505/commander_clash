// Round 101: Skyclave Apparition and Severance Priest: "When ~ leaves the battlefield, the exiled card's owner creates an
// X/X blue Illusion creature token, where X is the mana value of the exiled card." Linked to its own exile ability
// (CR 607.2a); no exiled card, no token (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, waitingOn, type Action, type GameState, type PlayerId } from "../src";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
function castIt(s: GameState, pid: PlayerId, id: string, targets: string[] = [], triggerTargets: string[] = []) {
  s = settle(run(s, planCast(s, pid, id, targets.map(target))));
  if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: pid, targets: triggerTargets.length ? triggerTargets.map(target) : [{ kind: "none" }] }));
  return s;
}
const untapAll = (s: GameState) => s.battlefield.forEach((id) => (s.objects[id]!.tapped = false));
const illusions = (s: GameState, pid: PlayerId) =>
  s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === "Illusion Token");

// Real oracle text (Scryfall).
const skyclave = card("Skyclave Apparition", "Creature — Kor Spirit", "{1}{W}{W}", {
  power: "2",
  toughness: "2",
  oracleText:
    "When this creature enters, exile up to one target nonland, nontoken permanent you don't control with mana value 4 or less.\nWhen this creature leaves the battlefield, the exiled card's owner creates an X/X blue Illusion creature token, where X is the mana value of the exiled card.",
});
const priest = card("Severance Priest", "Creature — Human Cleric", "{W}{B}", {
  power: "3",
  toughness: "1",
  keywords: ["Deathtouch"],
  oracleText:
    "Deathtouch\nWhen this creature enters, target opponent reveals their hand. You may choose a nonland card from it. If you do, exile that card.\nWhen this creature leaves the battlefield, the exiled card's owner creates an X/X white Spirit creature token, where X is the mana value of the exiled card.",
});
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const ogre = card("Gray Ogre", "Creature — Ogre", "{2}{R}", { power: "2", toughness: "2" });

describe("round 101: Skyclave Apparition", () => {
  it("parses", () => {
    expect(isFullySupported(skyclave)).toBe(true);
    expect(isFullySupported(priest)).toBe(true);
  });

  it("exiles a permanent, and when it leaves the card's owner gets an X/X Illusion, X its mana value", () => {
    const { s: s0, ap, opp, ids } = setup([skyclave, murder]);
    const o = putOnBattlefield(s0, opp, ogre);
    let s = castIt(s0, ap, ids[0]!, [], [o]);
    expect(s.objects[o]!.zone).toBe("exile");
    const sky = s.battlefield.find((id) => s.objects[id]!.cardId === skyclave.oracleId)!;
    untapAll(s);
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(sky)])));
    expect(s.objects[sky]!.zone).toBe("graveyard");
    // The card stays exiled; its owner gets the token.
    expect(s.objects[o]!.zone).toBe("exile");
    const t = illusions(s, opp);
    expect(t.length).toBe(1);
    expect(s.cards[s.objects[t[0]!]!.cardId]!.power).toBe("3");
    expect(illusions(s, ap).length).toBe(0);
  });

  it("with no exiled card, nobody gets a token", () => {
    const { s: s0, ap, ids } = setup([skyclave, murder]);
    let s = castIt(s0, ap, ids[0]!, [], []);
    const sky = s.battlefield.find((id) => s.objects[id]!.cardId === skyclave.oracleId)!;
    untapAll(s);
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(sky)])));
    expect(s.objects[sky]!.zone).toBe("graveyard");
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken).length).toBe(0);
  });

  it("a bear of mana value 2 makes a 2/2", () => {
    const { s: s0, ap, opp, ids } = setup([skyclave, murder]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = castIt(s0, ap, ids[0]!, [], [b]);
    const sky = s.battlefield.find((id) => s.objects[id]!.cardId === skyclave.oracleId)!;
    untapAll(s);
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(sky)])));
    const t = illusions(s, opp)[0]!;
    expect(s.cards[s.objects[t]!.cardId]!.toughness).toBe("2");
  });
});
