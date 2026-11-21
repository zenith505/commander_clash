// Round 432: Lara Croft, Tomb Raider ("Whenever Lara Croft attacks, exile up to one target legendary artifact card or
// legendary land card from a graveyard and put a discovery counter on it. You may play a card from exile with a discovery
// counter on it this turn.").
import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, canPlayLandNow, castProblem, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const lara = (): CardDef => ({"oracleId":"ddfd9dca-c886-4e13-b467-990469c31a61","name":"Lara Croft, Tomb Raider","manaCost":"{G}{U}{R}","cmc":3,"typeLine":"Legendary Creature — Human Ranger","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Ranger"],"oracleText":"First strike, reach\nWhenever Lara Croft attacks, exile up to one target legendary artifact card or legendary land card from a graveyard and put a discovery counter on it. You may play a card from exile with a discovery counter on it this turn.\nRaid — At end of combat on your turn, if you attacked this turn, create a Treasure token.","power":"3","toughness":"4","colors":["G","R","U"],"colorIdentity":["G","R","U"],"keywords":["Reach","First strike","Treasure","Raid"],"layout":"normal"}) as CardDef;
const mox = (): CardDef => ({"oracleId":"7a43bd27-fdd8-41f0-9bc4-92568f3408f1","name":"Mox Amber","manaCost":"{0}","cmc":0,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add one mana of any color among legendary creatures and planeswalkers you control.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"layout":"normal"}) as CardDef;
const cradle = (): CardDef => ({"oracleId":"7c427c3d-ecd8-45ef-bebd-8f10f4a311db","name":"Gaea's Cradle","manaCost":"","cmc":0,"typeLine":"Legendary Land","supertypes":["Legendary"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {G} for each creature you control.","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const weapon = (): CardDef => ({"oracleId":"aa1a248d-2f76-4f15-b065-08f299af07b9","name":"Legacy Weapon","manaCost":"{7}","cmc":7,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"{W}{U}{B}{R}{G}: Exile target permanent.\nIf Legacy Weapon would be put into a graveyard from anywhere, reveal Legacy Weapon and shuffle it into its owner's library instead.","colors":[],"colorIdentity":["B","G","R","U","W"],"keywords":[],"layout":"normal"}) as CardDef;

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
/** A new card for `def` in `pid`'s graveyard. */
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** A new card for `def` in `pid`'s exile, with these counters on it. */
const inExile = (s: GameState, pid: PlayerId, def: CardDef, counters: Record<string, number>) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "exile";
  s.objects[id]!.counters = { ...counters };
  s.players[pid]!.exile.push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** Lara on the battlefield, with Mox Amber and Sol Ring in the next player's graveyard and Gaea's Cradle in yours. */
const board = () => {
  const { s, ap, opp } = setup([]);
  const l = putOnBattlefield(s, ap, lara());
  const moxId = inYard(s, opp, mox());
  const ring = inYard(s, opp, solRing());
  const cr = inYard(s, ap, cradle());
  return { s, ap, opp, l, moxId, ring, cr };
};
/** Lara attacks the next player; stops at her trigger's targets. */
const attack = (s: GameState, ap: PlayerId, opp: PlayerId, l: ObjectId) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: l, defender: opp }] });
  return settle(s, ap);
};
const toMain2 = (s: GameState, ap: PlayerId) => settle(passUntil(settle(s, ap), "main2", ap), ap);

describe("round 432: Lara Croft, Tomb Raider", () => {
  it("is fully supported", () => {
    expect(isFullySupported(lara())).toBe(true);
  });

  it("targets only legendary artifact and legendary land cards in graveyards", () => {
    const r = board();
    const s = attack(r.s, r.ap, r.opp, r.l);
    expect(s.pending?.kind).toBe("chooseTargets");
    // Sol Ring isn't legendary.
    expect(() => act(s, { type: "chooseTargets", player: r.ap, targets: [{ kind: "object", id: r.ring }] })).toThrow();
    for (const id of [r.moxId, r.cr]) expect(() => act(s, { type: "chooseTargets", player: r.ap, targets: [{ kind: "object", id }] })).not.toThrow();
  });

  it("exiles another player's Mox Amber with a discovery counter, and you cast it this turn", () => {
    const r = board();
    let s = attack(r.s, r.ap, r.opp, r.l);
    s = settle(act(s, { type: "chooseTargets", player: r.ap, targets: [{ kind: "object", id: r.moxId }] }), r.ap);
    expect(zone(s, r.moxId)).toBe("exile");
    expect(s.objects[r.moxId]!.counters.discovery).toBe(1);
    s = toMain2(s, r.ap);
    expect(castProblem(s, r.ap, r.moxId)).toBeNull();
    s = settle(run(s, planCast(s, r.ap, r.moxId)), r.ap);
    expect(zone(s, r.moxId)).toBe("battlefield");
    expect(s.objects[r.moxId]!.controller).toBe(r.ap);
    expect(s.objects[r.moxId]!.owner).toBe(r.opp);
  });

  it("plays a legendary land from exile as the turn's land play", () => {
    const r = board();
    let s = attack(r.s, r.ap, r.opp, r.l);
    s = settle(act(s, { type: "chooseTargets", player: r.ap, targets: [{ kind: "object", id: r.cr }] }), r.ap);
    s = toMain2(s, r.ap);
    expect(canPlayLandNow(s, r.ap, r.cr)).toBe(true);
    const played = s.players[r.ap]!.landsPlayedThisTurn;
    s = act(s, { type: "playLand", player: r.ap, objectId: r.cr });
    expect(zone(s, r.cr)).toBe("battlefield");
    expect(s.players[r.ap]!.landsPlayedThisTurn).toBe(played + 1);
  });

  it("one card each time it resolves: a second card with a discovery counter can't be played too", () => {
    const r = board();
    const ring = inExile(r.s, r.opp, weapon(), { discovery: 1 });
    let s = attack(r.s, r.ap, r.opp, r.l);
    s = settle(act(s, { type: "chooseTargets", player: r.ap, targets: [{ kind: "object", id: r.moxId }] }), r.ap);
    s = toMain2(s, r.ap);
    expect(planCast(s, r.ap, ring)).not.toBeNull();
    s = settle(run(s, planCast(s, r.ap, r.moxId)), r.ap);
    expect(zone(s, r.moxId)).toBe("battlefield");
    expect(planCast(s, r.ap, ring)).toBeNull();
    expect(castProblem(s, r.ap, ring)).toMatch(/only cast spells from your hand/);
  });

  it("with no target, a card exiled earlier with a discovery counter can be played; the permission ends with the turn", () => {
    const r = board();
    const earlier = inExile(r.s, r.opp, mox(), { discovery: 1 });
    const plain = inExile(r.s, r.opp, mox(), {});
    let s = attack(r.s, r.ap, r.opp, r.l);
    s = settle(act(s, { type: "chooseTargets", player: r.ap, targets: [{ kind: "none" }] }), r.ap);
    s = toMain2(s, r.ap);
    expect(castProblem(s, r.ap, earlier)).toBeNull();
    expect(castProblem(s, r.ap, plain)).not.toBeNull();
    // Next turn, it's gone.
    s = passUntil(s, "main1", r.opp);
    s = passUntil(s, "main1", r.ap);
    expect(castProblem(s, r.ap, earlier)).not.toBeNull();
  });

  it("the permission is the trigger's: it lasts after Lara has left the battlefield", () => {
    const r = board();
    let s = attack(r.s, r.ap, r.opp, r.l);
    s = settle(act(s, { type: "chooseTargets", player: r.ap, targets: [{ kind: "object", id: r.moxId }] }), r.ap);
    s = toMain2(s, r.ap);
    s.battlefield.splice(s.battlefield.indexOf(r.l), 1);
    s.objects[r.l]!.zone = "graveyard";
    s.players[r.ap]!.graveyard.push(r.l);
    invalidateCharacteristics(s);
    expect(castProblem(s, r.ap, r.moxId)).toBeNull();
  });

  it("a bot attacking with Lara exiles a legendary card and plays it", () => {
    const r = board();
    let s = passUntil(r.s, "declareAttackers", r.ap);
    for (let i = 0; i < 400 && !(s.step === "end" && s.activePlayer === r.ap); i++) {
      const p = waitingOn(s)!;
      for (const a of botActions(s, p)) s = act(s, a);
    }
    expect([r.moxId, r.cr].some((id) => zone(s, id) === "battlefield")).toBe(true);
  });

  it("before Lara's trigger resolves, there's no permission", () => {
    const r = board();
    const earlier = inExile(r.s, r.opp, mox(), { discovery: 1 });
    expect(castProblem(r.s, r.ap, earlier)).not.toBeNull();
  });
});
