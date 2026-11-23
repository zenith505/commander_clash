// Lane B round B305: Shaman's Trance ("Other players can't play lands or cast spells from their graveyards this turn. You may
// play lands and cast spells from other players' graveyards this turn as though those cards were in your graveyard."): its
// rulings (flashback works on those cards; their activated abilities don't), for the rest of the turn.

import { describe, expect, it } from "vitest";
import { act, forest, putOnBattlefield, setup } from "./helpers";
import { applyAction, castProblem, isFullySupported, mayPlayLandFromGraveyard, planCast, playsFromAnyGraveyard, tranced, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const trance = (): CardDef => ({"oracleId":"619d8d81-9e10-4353-b30d-a0f9c3451cd2","name":"Shaman's Trance","manaCost":"{2}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Other players can't play lands or cast spells from their graveyards this turn. You may play lands and cast spells from other players' graveyards this turn as though those cards were in your graveyard.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const thinkTwice = (): CardDef => ({"oracleId":"fa85c5a2-8e83-4624-a35a-a0bbf17ecbb4","name":"Think Twice","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["U"],"colorIdentity":["U"],"keywords":["Flashback"],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const crucible = (): CardDef => ({"oracleId":"33c722cf-b4bf-431f-aefd-ee96241a7fbf","name":"Crucible of Worlds","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"You may play lands from your graveyard.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","set":"mps","releasedAt":"2016-09-30","rarity":"special","layout":"normal","gameChanger":false}) as CardDef;
const yawgmoth = (): CardDef => ({"oracleId":"322f0459-f394-44f0-977b-55fd0cbe0712","name":"Yawgmoth's Will","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Until end of turn, you may play lands and cast spells from your graveyard.\nIf a card would be put into your graveyard from anywhere this turn, exile that card instead.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
/** You (the active player) cast Shaman's Trance and it resolves. */
const tranceUp = (extraHand: CardDef[] = []) => {
  const { s: s0, ap, ids, opp } = setup([trance(), ...extraHand]);
  const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
  expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  return { s, ap, ids, opp };
};

describe("Lane B round B305: Shaman's Trance", () => {
  it("is fully supported", () => {
    expect(isFullySupported(trance())).toBe(true);
  });

  it("you flash back an opponent's Think Twice from their graveyard; it's exiled after", () => {
    const { s: s0, ap, opp } = setup([trance()]);
    const tt = toYard(s0, opp, thinkTwice());
    expect(castProblem(s0, ap, tt, undefined, undefined, undefined, undefined, undefined, { via: "flashback" })).not.toBeNull();
    const ids0 = s0.players[ap]!.hand;
    let s = settle(run(s0, planCast(s0, ap, ids0[ids0.length - 1]!, undefined, undefined, "auto")));
    expect(tranced(s, ap)).toBe(true);
    expect(playsFromAnyGraveyard(s, ap)).toBe(true);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, tt, undefined, undefined, "auto", undefined, { via: "flashback" })));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[tt]!.zone).toBe("exile");
    expect(s.objects[tt]!.owner).toBe(opp);
  });

  it("other players can't cast spells from their own graveyards this turn, flashback included", () => {
    const { s, opp } = tranceUp();
    const tt = toYard(s, opp, thinkTwice());
    expect(castProblem(s, opp, tt, undefined, undefined, undefined, undefined, undefined, { via: "flashback" })).toMatch(/can't be cast from your graveyard this turn \(Shaman's Trance\)/);
  });

  it("your own graveyard is still yours; a card there isn't barred", () => {
    const { s, ap } = tranceUp();
    const tt = toYard(s, ap, thinkTwice());
    expect(planCast(s, ap, tt, undefined, undefined, "auto", undefined, { via: "flashback" })).not.toBeNull();
  });

  it("with your Crucible of Worlds you play a land from an opponent's graveyard; their Crucible doesn't let them", () => {
    const { s: s0, ap, opp } = tranceUp();
    let s = s0;
    const land = toYard(s, opp, forest);
    expect(mayPlayLandFromGraveyard(s, s.objects[land]!, ap)).toBe(false);
    putOnBattlefield(s, ap, crucible());
    putOnBattlefield(s, opp, crucible());
    expect(mayPlayLandFromGraveyard(s, s.objects[land]!, ap)).toBe(true);
    expect(mayPlayLandFromGraveyard(s, s.objects[land]!, opp)).toBe(false);
    s = act(s, { type: "playLand", player: ap, objectId: land });
    expect(s.objects[land]!.zone).toBe("battlefield");
    expect(s.objects[land]!.controller).toBe(ap);
  });

  it("with Yawgmoth's Will you cast a creature from an opponent's graveyard; without a permission you can't", () => {
    const { s: s0, ap, ids, opp } = setup([trance(), yawgmoth()]);
    const bear = toYard(s0, opp, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
    expect(planCast(s, ap, bear, undefined, undefined, "auto")).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[1]!, undefined, undefined, "auto")));
    putOnBattlefield(s, ap, forest);
    putOnBattlefield(s, ap, forest);
    s = settle(run(s, planCast(s, ap, bear, undefined, undefined, "auto", undefined, { via: "permission" })));
    expect(s.objects[bear]!.zone).toBe("battlefield");
    expect(s.objects[bear]!.controller).toBe(ap);
  });

  it("it lasts only this turn", () => {
    const { s: s0, ap, opp } = tranceUp();
    let s = s0;
    for (let i = 0; i < 400 && s.activePlayer === ap; i++) {
      const w = waitingOn(s)!;
      if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: w, attacks: [] });
      else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: w, objectIds: s.players[w]!.hand.slice(0, s.pending.count) });
      else s = act(s, { type: "passPriority", player: w });
    }
    expect(tranced(s, ap)).toBe(false);
    const tt = toYard(s, opp, thinkTwice());
    expect(castProblem(s, opp, tt, undefined, undefined, undefined, undefined, undefined, { via: "flashback" }) ?? "").not.toMatch(/Shaman's Trance/);
  });
});
