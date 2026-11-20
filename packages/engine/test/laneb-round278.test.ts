// Lane B round B278: Land Equilibrium ("If an opponent who controls at least as many lands as you do would put a land onto
// the battlefield, that player instead puts that land onto the battlefield then sacrifices a land of their choice."; CR
// 614.1a, 614.5, 614.12, rulings).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions } from "../src/bot";
import { applyAction, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const landEquilibrium = (): CardDef => ({"oracleId":"a3711453-b17d-4b1c-b726-9b41f36d07ab","name":"Land Equilibrium","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If an opponent who controls at least as many lands as you do would put a land onto the battlefield, that player instead puts that land onto the battlefield then sacrifices a land of their choice.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const rampantGrowth = (): CardDef => ({"oracleId":"8539f295-5d58-4436-a73a-b9277c4c7795","name":"Rampant Growth","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const explosiveVegetation = (): CardDef => ({"oracleId":"a0abd957-01a0-4aa9-8fc8-0e6840d21606","name":"Explosive Vegetation","manaCost":"{3}{G}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const sacredGround = (): CardDef => ({"oracleId":"b18e773c-611b-4c18-8b2d-8d3a7e5ddc93","name":"Sacred Ground","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a spell or ability an opponent controls causes a land to be put into your graveyard from the battlefield, return that card to the battlefield.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const ofName = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
/** Basic lands in `pid`'s library (setup's decks are Forests and Bears). */
const libraryForests = (s: GameState, pid: PlayerId) => s.players[pid]!.library.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest");
/** `n` Forests for `pid` (no summoning sickness to worry about: lands). */
const giveLands = (s: GameState, pid: PlayerId, n: number) => {
  for (let i = 0; i < n; i++) putOnBattlefield(s, pid, forest());
  invalidateCharacteristics(s);
};

describe("Land Equilibrium", () => {
  it("is supported", () => {
    expect(isFullySupported(landEquilibrium())).toBe(true);
    expect(isFullySupported(rampantGrowth())).toBe(true);
    expect(isFullySupported(explosiveVegetation())).toBe(true);
  });

  /** You (14 lands) have a Forest in hand; the next player controls Land Equilibrium and `oppLands` lands. */
  const board = (oppLands: number, extra: CardDef[] = []) => {
    const { s, ap, opp, ids } = setup([forest(), ...extra]);
    putOnBattlefield(s, opp, landEquilibrium());
    giveLands(s, opp, oppLands);
    return { s, ap, opp, forestId: ids[0]!, ids };
  };

  it("an opponent with at least as many lands who plays a land puts it there, then sacrifices a land of their choice", () => {
    const { s: s0, ap, opp, forestId } = board(3);
    expect(lands(s0, ap)).toBe(14);
    let s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    // The land is on the battlefield as the sacrifice is chosen; it's one of the choices (rulings).
    expect(zone(s, forestId)).toBe("battlefield");
    expect(s.pending?.kind).toBe("pickPermanents");
    const pend = s.pending as Extract<GameState["pending"], { kind: "pickPermanents" }>;
    expect(pend.player).toBe(ap);
    expect(pend.equilibrium).toBe(true);
    expect(pend.options).toContain(forestId);
    expect(pend.options.length).toBe(15);
    expect(waitingOn(s)).toBe(ap);
    const swamp = ofName(s, ap, "Swamp")[0]!;
    s = act(s, { type: "pickPermanents", player: ap, ids: [swamp] });
    expect(s.pending).toBeNull();
    expect(zone(s, swamp)).toBe("graveyard");
    expect(zone(s, forestId)).toBe("battlefield");
    expect(lands(s, ap)).toBe(14);
    expect(lands(s, opp)).toBe(3);
    expect(logged(s, /sacrifices Swamp \(Land Equilibrium\)/)).toBe(true);
    // Then the game goes on: you have priority in your main phase.
    expect(waitingOn(s)).toBe(ap);
    expect(s.stack.length).toBe(0);
  });

  it("may sacrifice the land just played", () => {
    const { s: s0, ap, forestId } = board(0);
    let s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    s = act(s, { type: "pickPermanents", player: ap, ids: [forestId] });
    expect(zone(s, forestId)).toBe("graveyard");
    expect(lands(s, ap)).toBe(14);
  });

  it("only one land offered at a time: two of its lands or a land of another player's can't be chosen", () => {
    const { s: s0, ap, opp, forestId } = board(0);
    const s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    const swamps = ofName(s, ap, "Swamp");
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: swamps.slice(0, 2) })).toThrow();
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [ofName(s, opp, "Forest")[0] ?? "none"] })).toThrow();
  });

  it("no sacrifice when the opponent controls fewer lands than its controller", () => {
    const { s: s0, ap, forestId } = board(15);
    const s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    expect(s.pending).toBeNull();
    expect(lands(s, ap)).toBe(15);
  });

  it("the same number of lands is enough (at least as many)", () => {
    const { s: s0, ap, forestId } = board(14);
    const s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    expect(s.pending?.kind).toBe("pickPermanents");
  });

  it("doesn't affect its own controller", () => {
    const { s: s0, ap, ids } = setup([forest()]);
    const forestId = ids[0]!;
    putOnBattlefield(s0, ap, landEquilibrium());
    invalidateCharacteristics(s0);
    const s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    expect(s.pending).toBeNull();
    expect(lands(s, ap)).toBe(15);
  });

  it("with only the new land, that land is sacrificed without a question", () => {
    const { s: s0, ap, forestId } = board(0);
    // You control no other land.
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Land")) {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      delete s0.objects[id];
    }
    invalidateCharacteristics(s0);
    const s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    expect(s.pending).toBeNull();
    expect(zone(s, forestId)).toBe("graveyard");
    expect(lands(s, ap)).toBe(0);
  });

  it("applies to a land a spell puts onto the battlefield, before the spell finishes resolving", () => {
    const { s: s0, ap, opp, ids } = board(2, [rampantGrowth()]);
    let s = run(s0, planCast(s0, ap, ids[1]!, []));
    s = settle(s);
    expect(s.pending?.kind).toBe("searchLibrary");
    const found = libraryForests(s, ap)[0]!;
    s = act(s, { type: "searchLibrary", player: ap, found: [found] });
    expect(zone(s, found)).toBe("battlefield");
    expect(s.pending?.kind).toBe("pickPermanents");
    expect((s.pending as { equilibrium?: true }).equilibrium).toBe(true);
    // Still resolving: Rampant Growth hasn't gone to the graveyard yet.
    expect(s.resolving).not.toBeNull();
    expect(zone(s, ids[1]!)).toBe("stack");
    const island = ofName(s, ap, "Island")[0]!;
    s = act(s, { type: "pickPermanents", player: ap, ids: [island] });
    expect(zone(s, island)).toBe("graveyard");
    s = settle(s);
    expect(zone(s, ids[1]!)).toBe("graveyard");
    expect(zone(s, found)).toBe("battlefield");
    expect(lands(s, opp)).toBe(2);
  });

  it("lands entering together are counted before the event: none owes a sacrifice when you had fewer lands", () => {
    const { s: s0, ap, ids } = board(15, [explosiveVegetation()]);
    let s = settle(run(s0, planCast(s0, ap, ids[1]!, [])));
    expect(s.pending?.kind).toBe("searchLibrary");
    const two = libraryForests(s, ap).slice(0, 2);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: two }));
    expect(s.pending).toBeNull();
    expect(two.map((id) => zone(s, id))).toEqual(["battlefield", "battlefield"]);
    expect(lands(s, ap)).toBe(16);
  });

  it("lands entering together with as many lands: one sacrifice for each of them", () => {
    const { s: s0, ap, ids } = board(14, [explosiveVegetation()]);
    let s = settle(run(s0, planCast(s0, ap, ids[1]!, [])));
    const two = libraryForests(s, ap).slice(0, 2);
    s = act(s, { type: "searchLibrary", player: ap, found: two });
    expect(s.pending?.kind).toBe("pickPermanents");
    const [m1, m2] = ofName(s, ap, "Mountain");
    s = act(s, { type: "pickPermanents", player: ap, ids: [m1!] });
    expect(s.pending?.kind).toBe("pickPermanents");
    expect((s.pending as { options: string[] }).options).not.toContain(m1);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [m2!] }));
    expect(lands(s, ap)).toBe(14);
    expect([zone(s, m1!), zone(s, m2!)]).toEqual(["graveyard", "graveyard"]);
  });

  it("two opponents' Land Equilibriums: a sacrifice for each", () => {
    const { s: s0, ap, forestId } = board(0);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    putOnBattlefield(s0, third, landEquilibrium());
    invalidateCharacteristics(s0);
    let s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    const [a, b] = ofName(s, ap, "Plains");
    s = act(s, { type: "pickPermanents", player: ap, ids: [a!] });
    expect(s.pending?.kind).toBe("pickPermanents");
    s = act(s, { type: "pickPermanents", player: ap, ids: [b!] });
    expect(s.pending).toBeNull();
    expect(lands(s, ap)).toBe(13);
  });

  it("with Sacred Ground returning each land it makes you sacrifice, the choice of land doesn't break the mandatory loop's count (CR 104.4b)", () => {
    const { s: s0, ap, forestId } = board(0);
    putOnBattlefield(s0, ap, sacredGround());
    invalidateCharacteristics(s0);
    let s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    let picks = 0;
    for (let i = 0; i < 200 && !s.over; i++) {
      const w = waitingOn(s);
      if (w === null || w === undefined) break;
      if (s.pending?.kind === "pickPermanents") picks++;
      s = act(s, botActions(s, w)[0]!);
    }
    expect(logged(s, /Sacred Ground puts .* onto the battlefield/)).toBe(true);
    expect(picks).toBeGreaterThan(10);
    // Every Sacred Ground return counted as one more resolution in a row of the same loop, the sacrifices' choices too
    // (the game is a draw once it's seen to repeat, or after shortcuts.ts MAX_UNBROKEN resolutions).
    expect(s.loopWatch?.resolutions ?? 0).toBeGreaterThan(10);
  });

  it("a bot sacrifices one of the lands offered", () => {
    const { s: s0, ap, forestId } = board(0);
    const s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    const acts = botActions(s, ap);
    expect(acts.length).toBe(1);
    expect(acts[0]!.type).toBe("pickPermanents");
    const picked = (acts[0] as { ids: string[] }).ids;
    expect(picked.length).toBe(1);
    expect((s.pending as { options: string[] }).options).toContain(picked[0]);
    const after = act(s, acts[0]!);
    expect(after.pending).toBeNull();
    expect(lands(after, ap)).toBe(14);
  });
});

// Noxious Vapors ("Each player reveals their hand, chooses one card of each color from it, then discards all other nonland
// cards."; CR 101.4, 105.1, 701.9b, 701.20a; the rulings on Conflux and Selective Adaptation for a card of several colors).
const noxiousVapors = (): CardDef => ({"oracleId":"cd16634e-b894-4cff-9d5b-408932863c1f","name":"Noxious Vapors","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player reveals their hand, chooses one card of each color from it, then discards all other nonland cards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const lightningHelix = (): CardDef => ({"oracleId":"800c258a-cfc4-4a54-a667-065ea8dea69e","name":"Lightning Helix","manaCost":"{R}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Helix deals 3 damage to any target and you gain 3 life.","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"layout":"normal"}) as CardDef;
const llanowarElves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"}) as CardDef;
const dryadArbor = (): CardDef => ({"oracleId":"e996cd67-739c-40f4-b276-0042acf26c71","name":"Dryad Arbor","manaCost":"","cmc":0,"typeLine":"Land Creature — Forest Dryad","supertypes":[],"types":["Land","Creature"],"subtypes":["Forest","Dryad"],"oracleText":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const shivanDragon = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"layout":"normal"}) as CardDef;

/** `pid`'s hand becomes exactly these cards (the old ones go to the library); their ids, in order. */
const giveHand = (s: GameState, pid: PlayerId, defs: CardDef[]): string[] => {
  const p = s.players[pid]!;
  for (const id of p.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "hand";
    p.hand.push(id);
    return id;
  });
  invalidateCharacteristics(s);
  return ids;
};
type Search = Extract<NonNullable<GameState["pending"]>, { kind: "searchLibrary" }>;

describe("Noxious Vapors", () => {
  it("is supported", () => expect(isFullySupported(noxiousVapors())).toBe(true));

  /** You cast Noxious Vapors with `yours` in hand; the next player holds `theirs`, the other two nothing. */
  const cast = (yours: CardDef[], theirs: CardDef[]) => {
    const { s: s0, ap, opp, ids } = setup([noxiousVapors()]);
    const mine = giveHand(s0, ap, [noxiousVapors(), ...yours]);
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    const their = giveHand(s0, opp, theirs);
    for (const p of others) giveHand(s0, p, []);
    void ids;
    const s = settle(run(s0, planCast(s0, ap, mine[0]!, [])));
    return { s, ap, opp, mine: mine.slice(1), their };
  };

  it("each player keeps one card of each color, in turn order, then discards the other nonland cards together", () => {
    const { s: s0, ap, opp, mine, their } = cast([lightningBolt(), shivanDragon(), counterspell(), solRing(), forest()], [grizzlyBears(), llanowarElves(), forest()]);
    const [bolt, dragon, counter, ring, land] = mine;
    let s = s0;
    expect(logged(s, /reveals their hand \(Lightning Bolt, Shivan Dragon, Counterspell, Sol Ring, Forest\)/)).toBe(true);
    expect(s.pending?.kind).toBe("searchLibrary");
    const p1 = s.pending as Search;
    expect(p1.player).toBe(ap);
    expect(p1.keepColors).toBe(true);
    expect(p1.fromHand).toBe(true);
    // Only colored cards can be chosen: not Sol Ring, not the Forest.
    expect([...p1.cards].sort()).toEqual([bolt, dragon, counter].sort());
    // Two red cards can't both be kept; the blue card can't be left out while it's the only blue one.
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [bolt!, dragon!] })).toThrow();
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [bolt!] })).toThrow();
    s = act(s, { type: "searchLibrary", player: ap, found: [bolt!, counter!] });
    // Nothing is discarded until everyone has chosen.
    expect(zone(s, dragon!)).toBe("hand");
    expect(s.pending?.kind).toBe("searchLibrary");
    expect((s.pending as Search).player).toBe(opp);
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [their[1]!] }));
    expect(s.pending).toBeNull();
    expect([bolt, counter, land].map((id) => zone(s, id!))).toEqual(["hand", "hand", "hand"]);
    expect([dragon, ring].map((id) => zone(s, id!))).toEqual(["graveyard", "graveyard"]);
    expect(their.map((id) => zone(s, id))).toEqual(["graveyard", "hand", "hand"]);
  });

  it("a multicolored card counts for one of its colors, which its player picks", () => {
    const { s: s0, ap, mine } = cast([lightningHelix(), lightningBolt()], []);
    const [helix, bolt] = mine;
    // The Helix as the white card and the Bolt as the red card.
    const both = settle(act(s0, { type: "searchLibrary", player: ap, found: [helix!, bolt!] }));
    expect([zone(both, helix!), zone(both, bolt!)]).toEqual(["hand", "hand"]);
    // Or the Helix as the red card: there's no other white card, so the Bolt is discarded.
    const one = settle(act(s0, { type: "searchLibrary", player: ap, found: [helix!] }));
    expect([zone(one, helix!), zone(one, bolt!)]).toEqual(["hand", "graveyard"]);
    // The Bolt alone leaves the Helix, a white card, unchosen while no card was chosen as white.
    expect(() => act(s0, { type: "searchLibrary", player: ap, found: [bolt!] })).toThrow();
  });

  it("no question when each color has at most one card and none is multicolored; land cards and colorless cards", () => {
    const { s, mine, their } = cast([lightningBolt(), counterspell(), solRing(), forest()], [shivanDragon()]);
    expect(s.pending).toBeNull();
    const [bolt, counter, ring, land] = mine;
    expect([bolt, counter, ring, land].map((id) => zone(s, id!))).toEqual(["hand", "hand", "graveyard", "hand"]);
    expect(zone(s, their[0]!)).toBe("hand");
  });

  it("a green land card may be the card kept for green: the green nonland card is discarded then", () => {
    const { s: s0, opp, their } = cast([], [dryadArbor(), grizzlyBears(), shivanDragon()]);
    const [arbor, bears, dragon] = their;
    expect(s0.pending?.kind).toBe("searchLibrary");
    expect((s0.pending as Search).player).toBe(opp);
    const s = settle(act(s0, { type: "searchLibrary", player: opp, found: [arbor!, dragon!] }));
    expect([zone(s, arbor!), zone(s, bears!), zone(s, dragon!)]).toEqual(["hand", "graveyard", "hand"]);
  });

  it("a bot keeps a card for each color there's one for", () => {
    const { s: s0, ap, mine } = cast([lightningHelix(), lightningBolt(), shivanDragon(), counterspell()], []);
    const acts = botActions(s0, ap);
    expect(acts.length).toBe(1);
    const found = (acts[0] as { found: string[] }).found;
    expect(found.length).toBe(3); // Helix (white), a red card, Counterspell
    expect(found).toContain(mine[0]);
    expect(found).toContain(mine[3]);
    const s = settle(act(s0, acts[0]!));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand.length).toBe(3);
  });
});
