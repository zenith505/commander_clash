// Alhammarret's Archive and dredge replacing the same draw: the player drawing chooses which applies first (CR 616.1,
// Alhammarret's Archive ruling). Dredge first: the draw is gone, so there's nothing to double. The Archive first: each
// of the two draws it makes can still be dredged. Each Archive is its own replacement (two make four, rulings).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, planCast, invalidateCharacteristics, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const archive = card("Alhammarret's Archive", "Legendary Artifact", "{5}", { oracleText: "If you would gain life, you gain twice that much life instead.\nIf you would draw a card except the first one you draw in each of your draw steps, draw two cards instead." });
const salvage = card("Dakmor Salvage", "Land", "", { keywords: ["Dredge", "Mill"], oracleText: "This land enters tapped.\n{T}: Add {B}.\nDredge 2 (If you would draw a card, you may mill two cards instead. If you do, return this card from your graveyard to your hand.)" });
const thug = card("Golgari Thug", "Creature — Human Warrior", "{1}{B}", { power: "1", toughness: "1", keywords: ["Dredge", "Mill"], oracleText: "When this creature dies, put target creature card from your graveyard on top of your library.\nDredge 4 (If you would draw a card, you may mill four cards instead. If you do, return this card from your graveyard to your hand.)" });
// A second Archive that isn't legendary, so both stay (the legend rule would put one into the graveyard).
const archive2 = card("Archive Test Copy", "Artifact", "{5}", { oracleText: archive.oracleText });
const cantrip = card("Draw Test", "Sorcery", "{0}", { oracleText: "Draw a card." });

function moveTo(s: GameState, id: string, zone: "hand" | "graveyard") {
  const o = s.objects[id]!;
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  o.zone = zone;
  s.players[o.owner]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
}
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** `archives` on `ap`'s battlefield, `yard` in their graveyard, and a cantrip in hand (it's their main phase). */
function table(archives: CardDef[], yard: CardDef[]) {
  const { s, ap } = setup([]);
  for (const d of archives) putOnBattlefield(s, ap, d);
  const dredgers = yard.map((d) => moveTo(s, putOnBattlefield(s, ap, d), "graveyard"));
  const spell = moveTo(s, putOnBattlefield(s, ap, cantrip), "hand");
  return { s, ap, spell, dredgers };
}
const cast = (s: GameState, pid: PlayerId, id: string) => ((before = [...s.players[pid]!.hand]), settle(planCast(s, pid, id)!.reduce((x, a) => act(x, a), s)));
let before: string[] = [];
/** The cards that came into `pid`'s hand since the cantrip was cast. */
const handNow = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.filter((id) => !before.includes(id));

describe("Alhammarret's Archive and dredge on the same draw (CR 616.1)", () => {
  it("is supported", () => [archive, salvage, thug].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("dredge first: mill and return the card; there's no draw, so nothing for the Archive to double", () => {
    let { s, ap, spell, dredgers } = table([archive], [salvage]);
    const d = dredgers[0]!;
    const top = s.players[ap]!.library.slice(0, 3);
    s = cast(s, ap, spell);
    expect(s.pending).toMatchObject({ kind: "dredge", player: ap, options: [d], left: 1, archive: 1 });
    s = settle(act(s, { type: "dredge", player: ap, objectId: d }));
    expect(s.pending).toBeNull();
    expect(handNow(s, ap)).toEqual([d]);
    expect(top.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "library"]);
  });

  it("the Archive first: two draws, and each can still be dredged", () => {
    let { s, ap, spell, dredgers } = table([archive], [salvage]);
    const d = dredgers[0]!;
    const top = s.players[ap]!.library.slice(0, 3);
    s = cast(s, ap, spell);
    s = act(s, { type: "dredge", player: ap });
    // The first of the two draws: dredge or draw, and no Archive left to apply to it.
    expect(s.pending).toMatchObject({ kind: "dredge", player: ap, options: [d], left: 2 });
    expect((s.pending as { archive?: number }).archive).toBeUndefined();
    s = settle(act(s, { type: "dredge", player: ap, objectId: d }));
    // The Salvage is in hand now, so the second draw just happens: the third card (the first two were milled).
    expect(s.pending).toBeNull();
    expect(handNow(s, ap)).toEqual([d, top[2]]);
    expect(top.slice(0, 2).map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  });

  it("the Archive first, then draw both: two cards", () => {
    let { s, ap, spell } = table([archive], [salvage]);
    const top = s.players[ap]!.library.slice(0, 2);
    s = cast(s, ap, spell);
    s = act(s, { type: "dredge", player: ap });
    s = act(s, { type: "dredge", player: ap });
    expect(s.pending).toMatchObject({ kind: "dredge", left: 1 });
    s = settle(act(s, { type: "dredge", player: ap }));
    expect(s.pending).toBeNull();
    expect(handNow(s, ap)).toEqual(top);
  });

  it("two Archives: one first, a dredge, then the other Archive doubles the second draw", () => {
    let { s, ap, spell, dredgers } = table([archive, archive2], [salvage]);
    const d = dredgers[0]!;
    const top = s.players[ap]!.library.slice(0, 4);
    s = cast(s, ap, spell);
    expect(s.pending).toMatchObject({ kind: "dredge", left: 1, archive: 2 });
    s = act(s, { type: "dredge", player: ap });
    // Two draws, each of which the other Archive can still replace.
    expect(s.pending).toMatchObject({ kind: "dredge", left: 2, archive: 1, made: [1] });
    s = settle(act(s, { type: "dredge", player: ap, objectId: d }));
    // The second draw: nothing can dredge now, so the other Archive makes it two.
    expect(s.pending).toBeNull();
    expect(handNow(s, ap)).toEqual([d, top[2], top[3]]);
  });

  it("two Archives and no dredge: four cards", () => {
    let { s, ap, spell } = table([archive, archive2], []);
    const top = s.players[ap]!.library.slice(0, 4);
    s = cast(s, ap, spell);
    expect(s.pending).toBeNull();
    expect(handNow(s, ap)).toEqual(top);
  });

  it("two cards that could dredge: each draw the Archive makes offers both", () => {
    let { s, ap, spell, dredgers } = table([archive], [salvage, thug]);
    const [d, t] = dredgers as [string, string];
    s = cast(s, ap, spell);
    expect(s.pending).toMatchObject({ kind: "dredge", options: [d, t], archive: 1 });
    s = act(s, { type: "dredge", player: ap });
    s = act(s, { type: "dredge", player: ap, objectId: t });
    expect(s.pending).toMatchObject({ kind: "dredge", options: [d], left: 1 });
    s = settle(act(s, { type: "dredge", player: ap, objectId: d }));
    expect(s.pending).toBeNull();
    expect(handNow(s, ap)).toEqual([t, d]);
  });

  it("a bot applies the Archive first, then decides on each draw", () => {
    let { s, ap, spell } = table([archive], [thug]);
    s = cast(s, ap, spell);
    expect(s.pending).toMatchObject({ kind: "dredge", archive: 1 });
    expect(botActions(s, ap)).toEqual([{ type: "dredge", player: ap }]);
    s = act(s, botActions(s, ap)[0]!);
    expect(s.pending).toMatchObject({ kind: "dredge", left: 2 });
    expect((s.pending as { archive?: number }).archive).toBeUndefined();
  });
});
