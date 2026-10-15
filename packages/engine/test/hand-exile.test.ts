// Hand disruption that holds the card: "Exile that card until ~ leaves the battlefield" (Kitesail Freebooter, Brain
// Maggot; CR 610.3: it returns to the zone it came from, its owner's hand), Tidehollow Sculler's linked "When ~ leaves
// the battlefield, return the exiled card to its owner's hand" (CR 607.2a), and Lay Bare the Heart's "nonlegendary,
// nonland card".

import { describe, expect, it } from "vitest";
import { act, card, cast, forest, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, moveObject, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const freebooter = card("Kitesail Freebooter", "Creature — Human Pirate", "{1}{B}", {
  power: "1",
  toughness: "2",
  oracleText:
    "Flying\nWhen this creature enters, target opponent reveals their hand. You choose a noncreature, nonland card from it. Exile that card until this creature leaves the battlefield.",
});
const maggot = card("Brain Maggot", "Enchantment Creature — Insect", "{1}{B}", {
  power: "1",
  toughness: "1",
  oracleText: "When this creature enters, target opponent reveals their hand and you choose a nonland card from it. Exile that card until this creature leaves the battlefield.",
});
const sculler = card("Tidehollow Sculler", "Artifact Creature — Zombie", "{W}{B}", {
  power: "2",
  toughness: "2",
  oracleText: "When this creature enters, target opponent reveals their hand and you choose a nonland card from it. Exile that card.\nWhen this creature leaves the battlefield, return the exiled card to its owner's hand.",
});
const layBare = card("Lay Bare the Heart", "Sorcery", "{1}{B}", { oracleText: "Target opponent reveals their hand. You choose a nonlegendary, nonland card from it. That player discards that card." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const titan = card("Grave Titan", "Creature — Giant", "{4}{B}{B}", { power: "6", toughness: "6" });
const legend = card("Lord Windgrace", "Legendary Planeswalker — Windgrace", "{2}{B}{R}{G}", { loyalty: "5" });

function toHand(s: GameState, pid: PlayerId, d: CardDef) {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
}
function oppHand(s: GameState, opp: PlayerId, cards: CardDef[]) {
  const p = s.players[opp]!;
  for (const id of p.hand) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = [];
  return cards.map((d) => toHand(s, opp, d));
}
const at = (opp: PlayerId) => [{ kind: "player" as const, id: opp }];

/** Cast a creature with an enters trigger that targets `opp`, up to the trigger's choice. */
function castAndTrigger(s: GameState, ap: PlayerId, opp: PlayerId, id: string) {
  s = cast(s, ap, id);
  for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: at(opp) });
  return s;
}
const resolveTop = (s: GameState) => {
  for (let i = 0; i < 20 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("hand disruption that holds the card", () => {
  it("compiles", () => {
    for (const d of [freebooter, maggot, sculler, layBare]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Lay Bare the Heart can't take a legendary card", () => {
    const { s: s0, ap, opp, ids } = setup([layBare]);
    const [, bolt] = oppHand(s0, opp, [legend, shock, forest]);
    const s = cast(s0, ap, ids[0]!, at(opp));
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toEqual([bolt]);
  });

  it("Kitesail Freebooter: the card comes back to its owner's hand when it leaves", () => {
    const { s: s0, ap, opp, ids } = setup([freebooter]);
    const [bolt] = oppHand(s0, opp, [shock, titan, forest]);
    let s = castAndTrigger(s0, ap, opp, ids[0]!);
    s = resolveTop(s);
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toEqual([bolt]); // noncreature, nonland
    s = act(s, { type: "searchLibrary", player: ap, found: [bolt!] });
    expect(s.objects[bolt!]!.zone).toBe("exile");
    expect(s.players[opp]!.hand).not.toContain(bolt);
    s = structuredClone(s);
    moveObject(s, ids[0]!, "graveyard");
    expect(s.objects[bolt!]!.zone).toBe("hand");
    expect(s.players[opp]!.hand).toContain(bolt);
  });

  it("Kitesail Freebooter gone before its trigger resolves: nothing is exiled (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([maggot]);
    const [bolt] = oppHand(s0, opp, [shock]);
    let s = castAndTrigger(s0, ap, opp, ids[0]!);
    s = structuredClone(s);
    moveObject(s, ids[0]!, "graveyard");
    s = resolveTop(s);
    expect(s.pending).toBeNull();
    expect(s.objects[bolt!]!.zone).toBe("hand");
  });

  it("Tidehollow Sculler: its leaves ability returns the card to its owner's hand", () => {
    const { s: s0, ap, opp, ids } = setup([sculler]);
    const [big] = oppHand(s0, opp, [titan]);
    let s = castAndTrigger(s0, ap, opp, ids[0]!);
    s = resolveTop(s);
    s = act(s, { type: "searchLibrary", player: ap, found: [big!] });
    expect(s.objects[big!]!.zone).toBe("exile");
    s = structuredClone(s);
    moveObject(s, ids[0]!, "graveyard");
    s = resolveTop(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.log.some((e) => /returns Grave Titan to its owner's hand/.test(e.text))).toBe(true);
    expect(s.objects[big!]!.zone).toBe("hand");
  });

  it("Tidehollow Sculler gone before its enters ability resolves: the card stays exiled (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([sculler]);
    const [big] = oppHand(s0, opp, [titan]);
    let s = castAndTrigger(s0, ap, opp, ids[0]!);
    s = structuredClone(s);
    moveObject(s, ids[0]!, "graveyard");
    // Its leaves ability resolves first and does nothing; then the enters ability exiles the card for good.
    for (let i = 0; i < 40 && (s.stack.length || s.pending); i++) {
      if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [big!] });
      else if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[big!]!.zone).toBe("exile");
  });
});


