// Round 432: The Fourteenth Doctor ("When you cast this spell, reveal the top fourteen cards of your library. Put all Doctor
// cards revealed this way into your graveyard and the rest on the bottom of your library in a random order." and "You may
// have The Fourteenth Doctor enter as a copy of a Doctor card in your graveyard that was put there from your library this
// turn. If you do, it gains haste until end of turn.").
import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const doctor = (): CardDef => ({"oracleId":"0afcf1eb-ac2c-4bb0-8823-9fe45968c2d9","name":"The Fourteenth Doctor","manaCost":"{R/G}{W}{U}","cmc":3,"typeLine":"Legendary Creature — Time Lord Doctor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Time Lord","Doctor"],"oracleText":"When you cast this spell, reveal the top fourteen cards of your library. Put all Doctor cards revealed this way into your graveyard and the rest on the bottom of your library in a random order.\nYou may have The Fourteenth Doctor enter as a copy of a Doctor card in your graveyard that was put there from your library this turn. If you do, it gains haste until end of turn.","power":"3","toughness":"4","colors":["G","R","U","W"],"colorIdentity":["G","R","U","W"],"keywords":[],"layout":"normal"}) as CardDef;
const orderly = (): CardDef => ({"oracleId":"94688e62-f39f-41fd-9309-f16b715ef724","name":"Sickbay Orderly","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Caitian Doctor","supertypes":[],"types":["Creature"],"subtypes":["Caitian","Doctor"],"oracleText":"Lifelink (Damage dealt by this creature also causes you to gain that much life.)","power":"3","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Lifelink"],"layout":"normal"}) as CardDef;
const hologram = (): CardDef => ({"oracleId":"8170dcbb-9879-414c-819d-ea2658ff770c","name":"Emergency Medical Hologram","manaCost":"{W}","cmc":1,"typeLine":"Artifact Creature — Illusion Doctor","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Illusion","Doctor"],"oracleText":"When this creature enters, put a +1/+1 counter on target creature. You gain 1 life.","power":"0","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or `me` is asked something; bots answer the others. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A new card for `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
/** A new card for `def` in `pid`'s graveyard, put there from their library on turn `turn`. */
const inYard = (s: GameState, pid: PlayerId, def: CardDef, turn?: number) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.objects[id]!.fromLibraryTurn = turn;
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
const keywords = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).keywords;
/** The Doctor cast with Sickbay Orderly, Divination and Emergency Medical Hologram on top of the library. */
const cast = () => {
  const { s: s0, ap, opp, ids } = setup([doctor()]);
  const holo = onTop(s0, ap, hologram());
  const div = onTop(s0, ap, divination());
  const ord = onTop(s0, ap, orderly());
  const d = ids[0]!;
  const s = run(s0, planCast(s0, ap, d));
  return { s, ap, opp, d, holo, div, ord };
};

describe("round 432: The Fourteenth Doctor", () => {
  it("is fully supported", () => {
    expect(isFullySupported(doctor())).toBe(true);
  });

  it("its cast trigger puts every Doctor card revealed into the graveyard and the rest on the bottom, before the spell resolves", () => {
    const r = cast();
    expect(r.s.objects[r.d]!.zone).toBe("stack");
    let s = r.s;
    // The trigger resolves first, above the spell.
    for (let i = 0; i < 50 && s.stack.length > 1; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[r.d]!.zone).toBe("stack");
    expect(s.objects[r.ord]!.zone).toBe("graveyard");
    expect(s.objects[r.holo]!.zone).toBe("graveyard");
    expect(s.objects[r.div]!.zone).toBe("library");
    // Fourteen cards were revealed: Divination and eleven more went to the bottom.
    const lib = s.players[r.ap]!.library;
    expect(lib.slice(-12)).toContain(r.div);
    expect(s.objects[r.ord]!.fromLibraryTurn).toBe(s.turn);
  });

  it("enters as a copy of a Doctor put into your graveyard from your library this turn, with haste until end of turn", () => {
    const r = cast();
    let s = settle(r.s, r.ap);
    expect(s.pending?.kind === "chooseOption" && s.pending.what === "copy").toBe(true);
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(options).toEqual(expect.arrayContaining([r.ord, r.holo, "none"]));
    s = act(s, { type: "chooseOption", player: r.ap, choice: r.ord });
    s = settle(s, r.ap);
    const c = characteristics(s, s.objects[r.d]!);
    expect(c.name).toBe("Sickbay Orderly");
    expect(c.keywords).toEqual(expect.arrayContaining(["Lifelink", "Haste"]));
    // Haste lasts until end of turn only.
    s = passUntil(s, "upkeep", r.opp);
    expect(keywords(s, r.d)).toContain("Lifelink");
    expect(keywords(s, r.d)).not.toContain("Haste");
  });

  it("not copying: it's The Fourteenth Doctor, without haste", () => {
    const r = cast();
    let s = settle(r.s, r.ap);
    s = act(s, { type: "chooseOption", player: r.ap, choice: "none" });
    s = settle(s, r.ap);
    const c = characteristics(s, s.objects[r.d]!);
    expect(c.name).toBe("The Fourteenth Doctor");
    expect(c.keywords).not.toContain("Haste");
  });

  it("only Doctor cards in your own graveyard put there from your library this turn are offered", () => {
    const { s: s0, ap, opp, ids } = setup([doctor()]);
    const old = inYard(s0, ap, orderly(), s0.turn - 1);
    const discarded = inYard(s0, ap, orderly());
    const theirs = inYard(s0, opp, hologram(), s0.turn);
    const notDoctor = inYard(s0, ap, divination(), s0.turn);
    const mine = inYard(s0, ap, hologram(), s0.turn);
    // Nothing on top of the library is a Doctor: the reveal adds none.
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    const options = s.pending?.kind === "chooseOption" && s.pending.what === "copy" ? s.pending.options : [];
    expect(options).toEqual([mine, "none"]);
    for (const id of [old, discarded, theirs, notDoctor]) expect(options).not.toContain(id);
    s = act(s, { type: "chooseOption", player: ap, choice: mine });
    s = settle(s, ap);
    expect(characteristics(s, s.objects[ids[0]!]!).name).toBe("Emergency Medical Hologram");
  });

  it("with no such card, it just enters as itself", () => {
    const { s: s0, ap, ids } = setup([doctor()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending).toBeFalsy();
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[ids[0]!]!).name).toBe("The Fourteenth Doctor");
  });

  it("a bot casting it answers the copy choice", () => {
    const r = cast();
    const s = settle(r.s);
    expect(s.pending).toBeFalsy();
    expect(s.objects[r.d]!.zone).toBe("battlefield");
  });
});
