// Lane B round B282: Shared Fate ("If a player would draw a card, that player exiles the top card of one of their opponents'
// libraries face down instead. Each player may look at cards they exiled with this enchantment, and they may play lands and
// cast spells from among those cards."; CR 614.1a, 406.3 and its rulings).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, invalidateCharacteristics, isFullySupported, legalActions, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const fate = (): CardDef => ({"oracleId":"e23bf5fe-e494-473e-8502-606106ee1820","name":"Shared Fate","manaCost":"{4}{U}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If a player would draw a card, that player exiles the top card of one of their opponents' libraries face down instead.\nEach player may look at cards they exiled with this enchantment, and they may play lands and cast spells from among those cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const named = (s: GameState, pid: PlayerId, name: string) => s.players[pid]!.hand.find((x) => s.cards[s.objects[x]!.cardId]!.name === name)!;
const drawPending = (s: GameState) => s.pending as Extract<GameState["pending"], { kind: "drawInstead" }>;
/** Shared Fate on `ap`'s battlefield, and Divination cast (it pauses at the first draw). */
const divine = () => {
  const { s: s0, ap, opp } = setup([divination()]);
  const s1 = structuredClone(s0);
  const f = putOnBattlefield(s1, ap, fate());
  invalidateCharacteristics(s1);
  const s = settle(run(s1, planCast(s1, ap, named(s1, ap, "Divination"))));
  return { s, ap, opp, f };
};

describe("Shared Fate", () => {
  it("is supported", () => {
    expect(isFullySupported(fate())).toBe(true);
  });

  it("each draw instead exiles the top card of an opponent's library, face down, chosen by the drawing player", () => {
    const { s: s2, ap, opp, f } = divine();
    const pend = drawPending(s2);
    expect(pend?.kind).toBe("drawInstead");
    expect(pend.player).toBe(ap);
    // One choice for each opponent, and no drawing from your own library (rulings).
    expect(pend.options).toHaveLength(3);
    expect(pend.options.every((k) => k.startsWith(`fate:${f}:`))).toBe(true);
    expect(pend.options).not.toContain("draw");
    const hand = s2.players[ap]!.hand.length;
    const top = s2.players[opp]!.library[0]!;
    const s3 = act(s2, { type: "drawInstead", player: ap, choice: `fate:${f}:${opp}` });
    expect(s3.objects[top]!.zone).toBe("exile");
    expect(s3.objects[top]!.hiddenExile?.seen).toEqual([ap]);
    expect(s3.objects[top]!.mayPlay?.player).toBe(ap);
    // The second draw asks again.
    expect(drawPending(s3)?.kind).toBe("drawInstead");
    const other = s3.turnOrder.find((p) => p !== ap && p !== opp)!;
    const top2 = s3.players[other]!.library[0]!;
    const s4 = settle(act(s3, { type: "drawInstead", player: ap, choice: `fate:${f}:${other}` }));
    expect(s4.objects[top2]!.zone).toBe("exile");
    expect(s4.players[ap]!.hand.length).toBe(hand);
    expect(s4.pending).toBeNull();
  });

  it("the player who exiled the cards may play a land and cast a spell from among them, paying for it, while Shared Fate stays", () => {
    const { s: s2, ap, opp, f } = divine();
    // The opponent's library: a Forest on top, then a Grizzly Bears (setup's decks are Forests and Bears).
    const s3 = structuredClone(s2);
    const lib = s3.players[opp]!.library;
    const forestId = lib.find((id) => s3.cards[s3.objects[id]!.cardId]!.name === "Forest")!;
    const bearId = lib.find((id) => s3.cards[s3.objects[id]!.cardId]!.name === "Grizzly Bears")!;
    s3.players[opp]!.library = [forestId, bearId, ...lib.filter((id) => id !== forestId && id !== bearId)];
    const s4 = settle(act(act(s3, { type: "drawInstead", player: ap, choice: `fate:${f}:${opp}` }), { type: "drawInstead", player: ap, choice: `fate:${f}:${opp}` }));
    expect(s4.objects[forestId]!.zone).toBe("exile");
    expect(s4.objects[bearId]!.zone).toBe("exile");
    // Not the owner, nor anyone else.
    expect(legalActions(s4, ap).some((a) => a.type === "playLand" && a.objectId === forestId)).toBe(true);
    const s5 = act(s4, { type: "playLand", player: ap, objectId: forestId });
    expect(s5.objects[forestId]!.zone).toBe("battlefield");
    expect(s5.objects[forestId]!.controller).toBe(ap);
    const s6 = settle(run(s5, planCast(s5, ap, bearId)));
    expect(s6.objects[bearId]!.zone).toBe("battlefield");
    expect(s6.objects[bearId]!.controller).toBe(ap);
    expect(s6.objects[bearId]!.owner).toBe(opp);
    expect(s6.objects[f]!.zone).toBe("battlefield");
  });

  it("once Shared Fate is gone, the cards it exiled can't be played (rulings)", () => {
    const { s: s2, ap, opp, f } = divine();
    const top = s2.players[opp]!.library[0]!;
    const s3 = settle(act(act(s2, { type: "drawInstead", player: ap, choice: `fate:${f}:${opp}` }), { type: "drawInstead", player: ap, choice: `fate:${f}:${opp}` }));
    const s4 = structuredClone(s3);
    s4.battlefield.splice(s4.battlefield.indexOf(f), 1);
    s4.objects[f]!.zone = "graveyard";
    s4.objects[f]!.zoneChanges = (s4.objects[f]!.zoneChanges ?? 0) + 1;
    s4.players[ap]!.graveyard.push(f);
    invalidateCharacteristics(s4);
    expect(legalActions(s4, ap).some((a) => (a.type === "playLand" || a.type === "castSpell") && a.objectId === top)).toBe(false);
  });

  it("an empty library: the draw is still replaced, nothing is exiled and nobody loses", () => {
    const { s: s2, ap, opp, f } = divine();
    const s3 = structuredClone(s2);
    s3.players[opp]!.library = [];
    const s4 = settle(act(act(s3, { type: "drawInstead", player: ap, choice: `fate:${f}:${opp}` }), { type: "drawInstead", player: ap, choice: `fate:${f}:${opp}` }));
    const s5 = act(s4, { type: "passPriority", player: waitingOn(s4)! });
    expect(s5.players[ap]!.lost).toBeFalsy();
    expect(s4.log.some((l) => /but it's empty/.test(l.text))).toBe(true);
  });

  it("other players' draws too: the opponent's own Divination exiles from someone else's library, Ana's among them", () => {
    const { s: s0, ap, opp } = setup([]);
    const s1 = structuredClone(s0);
    const f = putOnBattlefield(s1, ap, fate());
    s1.players[opp]!.hand = [];
    invalidateCharacteristics(s1);
    // The opponent's Divination resolving (put on the stack by hand).
    const s2 = structuredClone(s1);
    const d = putOnBattlefield(s2, opp, divination());
    s2.battlefield.splice(s2.battlefield.indexOf(d), 1);
    s2.objects[d]!.zone = "stack";
    s2.stack.push({ id: `s${s2.nextId++}`, kind: "spell", objectId: d, controller: opp, description: "Divination", body: compileCard(divination()).spell });
    const s3 = settle(s2);
    const pend = drawPending(s3);
    expect(pend?.player).toBe(opp);
    expect(pend.options).toContain(`fate:${f}:${ap}`);
    const top = s3.players[ap]!.library[0]!;
    const s4 = act(s3, { type: "drawInstead", player: opp, choice: `fate:${f}:${ap}` });
    expect(s4.objects[top]!.zone).toBe("exile");
    expect(s4.objects[top]!.mayPlay?.player).toBe(opp);
  });

  it("a bot exiles from the opponent with the most cards in their library", () => {
    const { s: s2, ap, opp, f } = divine();
    const s3 = structuredClone(s2);
    for (const p of s3.turnOrder) if (p !== ap && p !== opp) s3.players[p]!.library = s3.players[p]!.library.slice(0, 5);
    const acts = botActions(s3, ap);
    expect(acts).toEqual([{ type: "drawInstead", player: ap, choice: `fate:${f}:${opp}` }]);
  });
});
