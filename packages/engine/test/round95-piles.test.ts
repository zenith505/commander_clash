// Round 95: separating cards into two piles (CR 700.3). Fact or Fiction (an opponent separates, you choose), Steam
// Augury (you separate, an opponent chooses), Epiphany at the Drownyard (X plus one), Sphinx of Uthuun and Unesh (enters
// triggers), Sphinx of Clear Skies (X counted as it resolves).

import { describe, expect, it } from "vitest";
import { act, card, passAll, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, isFullySupported, planCast, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const fof = card("Fact or Fiction", "Instant", "{3}{U}", { oracleText: "Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard." });
const augury = card("Steam Augury", "Instant", "{2}{U}{R}", { oracleText: "Reveal the top five cards of your library and separate them into two piles. An opponent chooses one of those piles. Put that pile into your hand and the other into your graveyard." });
const epiphany = card("Epiphany at the Drownyard", "Instant", "{X}{U}", { oracleText: "Reveal the top X plus one cards of your library and separate them into two piles. An opponent chooses one of those piles. Put that pile into your hand and the other into your graveyard." });
const uthuun = card("Sphinx of Uthuun", "Creature — Sphinx", "{5}{U}{U}", { power: "5", toughness: "6", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard." });
const unesh = card("Unesh, Criosphinx Sovereign", "Legendary Creature — Sphinx", "{4}{U}{U}", {
  power: "4",
  toughness: "4",
  keywords: ["Flying"],
  oracleText: "Flying\nSphinx spells you cast cost {2} less to cast.\nWhenever Unesh or another Sphinx you control enters, reveal the top four cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard.",
});
const clearSkies = card("Sphinx of Clear Skies", "Creature — Sphinx", "{3}{U}{U}", {
  power: "5",
  toughness: "5",
  keywords: ["Flying", "Ward"],
  oracleText: "Flying, ward {2}\nDomain — Whenever this creature deals combat damage to a player, reveal the top X cards of your library, where X is the number of basic land types among lands you control. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard. (Piles can be empty.)",
});
const intrude = card("Intrude on the Mind", "Instant", "{3}{U}{U}", {
  oracleText: "Reveal the top five cards of your library and separate them into two piles. An opponent chooses one of those piles. Put that pile into your hand and the other into your graveyard. Create a 0/0 colorless Thopter artifact creature token with flying, then put a +1/+1 counter on it for each card put into your graveyard this way.",
});

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return passAll(s);
};
const top = (s: GameState, pid: PlayerId, n: number) => s.players[pid]!.library.slice(0, n);
/** Answer "choose an opponent" with `opp`. */
const pickOpp = (s: GameState, opp: PlayerId) => (s.pending?.kind === "chooseOption" && s.pending.what === "opponent" ? act(s, { type: "chooseOption", player: s.pending.player, choice: String(opp) }) : s);

describe("two piles (CR 700.3)", () => {
  it("parse", () => {
    for (const d of [fof, augury, epiphany, uthuun, unesh, clearSkies] as CardDef[]) expect(isFullySupported(d), d.name).toBe(true);
    // Its other sentence counts the cards put into the graveyard this way: not done, so it stays out.
    expect(isFullySupported(intrude)).toBe(false);
    expect(compileCard(clearSkies).triggers.find((x) => x.body.effects[0]?.type === "piles")?.body.effects[0]).toMatchObject({ type: "piles", n: { count: { kind: "basicLandTypes" } } });
  });

  it("Fact or Fiction: the opponent you choose separates, you choose the pile for your hand; the other goes to the graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([fof]);
    const five = top(s0, ap, 5);
    let s = pickOpp(run(s0, planCast(s0, ap, ids[0]!)), opp);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, piles: true, forPlayer: ap, min: 0, max: 5 });
    // Still in the library while being separated (CR 700.3c).
    expect(five.every((id) => s.objects[id]!.zone === "library")).toBe(true);
    s = act(s, { type: "searchLibrary", player: opp, found: five.slice(0, 2) });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "pile", of: ap, piles: [five.slice(0, 2), five.slice(2)] });
    s = passAll(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(five.slice(2).every((id) => s.objects[id]!.zone === "hand")).toBe(true);
    expect(five.slice(0, 2).every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
  });

  it("Steam Augury: you separate, the opponent chooses; an empty pile can be the one for your hand (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([augury]);
    const five = top(s0, ap, 5);
    let s = pickOpp(run(s0, planCast(s0, ap, ids[0]!)), opp);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, piles: true });
    expect(s.pending?.kind === "searchLibrary" && s.pending.forPlayer).toBeUndefined();
    s = act(s, { type: "searchLibrary", player: ap, found: [] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "pile", of: ap });
    s = passAll(act(s, { type: "chooseOption", player: opp, choice: "0" }));
    expect(five.every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
  });

  it("Epiphany at the Drownyard reveals X plus one; Sphinx of Uthuun's enters trigger; the bots separate evenly and choose", () => {
    const e = setup([epiphany]);
    let s = pickOpp(run(e.s, planCast(e.s, e.ap, e.ids[0]!, undefined, undefined, undefined, 2)), e.opp);
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards.length).toBe(3);

    const u = setup([uthuun]);
    const five = top(u.s, u.ap, 5);
    s = run(u.s, planCast(u.s, u.ap, u.ids[0]!));
    s = pickOpp(s, u.opp);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: u.opp, piles: true });
    s = act(s, botActions(s, u.opp)[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "pile" });
    const piles = s.pending?.kind === "chooseOption" ? s.pending.piles! : [[], []];
    // The library is Forests and Grizzly Bears: no pile left empty when the cards can be split.
    expect(piles[0].length && piles[1].length).toBeTruthy();
    s = passAll(act(s, botActions(s, u.ap)[0]!));
    expect(five.every((id) => s.objects[id]!.zone === "hand" || s.objects[id]!.zone === "graveyard")).toBe(true);
  });

  it("Unesh triggers for itself, and a bot opponent separating a bot's cards", () => {
    const { s: s0, ap, ids } = setup([unesh]);
    const before = s0.players[ap]!.hand.length - 1 + s0.players[ap]!.graveyard.length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending; i++) s = passAll(act(s, botActions(s, s.pending.player)[0]!));
    expect(s.players[ap]!.hand.length + s.players[ap]!.graveyard.length - before).toBe(4);
    void putOnBattlefield;
  });
});
