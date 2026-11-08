// Lane B round B151: Dralnu's Pet (a kicker that discards a creature card: "it enters with flying and with X +1/+1
// counters on it, where X is the discarded card's mana value", CR 614.1c), Natural Balance (each player keeps five lands,
// then those with four or fewer may search for basic lands up to five, CR 701.23b), Nahiri's Sacrifice ("sacrifice an
// artifact or creature with mana value X", X announced as it's cast, CR 107.3a, 601.2b), Vizkopa Confessor ("pay any
// amount of life. Target opponent reveals that many cards from their hand. You choose one of them and exile it."), Tariff
// (each player's creature with the greatest mana value sacrificed unless they pay its mana cost, CR 107.3h, 118.6), Meddle
// and Quicksilver Dragon ("If target spell has only one target and that target is a creature / ~, change that spell's
// target to another creature", CR 115.7a).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, objHasKeyword, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const pet = (): CardDef => ({"oracleId":"ee626bd3-c18b-4d26-a9bd-8c23bdc02090","name":"Dralnu's Pet","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Kicker—{2}{B}, Discard a creature card. (You may pay {2}{B} and discard a creature card in addition to any other costs as you cast this spell.)\nIf this creature was kicked, it enters with flying and with X +1/+1 counters on it, where X is the discarded card's mana value.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["B","U"],"keywords":["Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/c/d/cd5f4daf-7b54-4425-a93a-19532dfb83ca.jpg?1783945626","artUrl":"https://cards.scryfall.io/art_crop/front/c/d/cd5f4daf-7b54-4425-a93a-19532dfb83ca.jpg?1783945626","commanderLegal":"legal","set":"pls","releasedAt":"2001-02-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const balance = (): CardDef => ({"oracleId":"69acaa6f-3ba2-420c-9069-02958f844121","name":"Natural Balance","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player who controls six or more lands chooses five lands they control and sacrifices the rest. Each player who controls four or fewer lands may search their library for up to X basic land cards and put them onto the battlefield, where X is five minus the number of lands they control. Then each player who searched their library this way shuffles.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/0/b0f7c47c-416e-4f73-89ec-024a29dfb5e9.jpg?1783947062","artUrl":"https://cards.scryfall.io/art_crop/front/b/0/b0f7c47c-416e-4f73-89ec-024a29dfb5e9.jpg?1783947062","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sacrifice = (): CardDef => ({"oracleId":"a84cc828-8d1b-4e61-a13f-60124e2ee35f","name":"Nahiri's Sacrifice","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, sacrifice an artifact or creature with mana value X.\nNahiri's Sacrifice deals X damage divided as you choose among any number of target creatures.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98395039-1353-4fa8-b51d-c4e1cadf9263.jpg?1783918025","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98395039-1353-4fa8-b51d-c4e1cadf9263.jpg?1783918025","commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const confessor = (): CardDef => ({"oracleId":"9db7cb7f-1309-4f1d-9c9d-423c91c0896c","name":"Vizkopa Confessor","manaCost":"{3}{W}{B}","cmc":5,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"Extort (Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain that much life.)\nWhen this creature enters, pay any amount of life. Target opponent reveals that many cards from their hand. You choose one of them and exile it.","power":"1","toughness":"3","colors":["B","W"],"colorIdentity":["B","W"],"keywords":["Extort"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cac639b9-6c20-45ac-a61f-082bdcebdb83.jpg?1783940098","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cac639b9-6c20-45ac-a61f-082bdcebdb83.jpg?1783940098","commanderLegal":"legal","set":"gtc","releasedAt":"2013-02-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const tariff = (): CardDef => ({"oracleId":"e96b0560-1d91-48df-b42f-3b7d9c6d94bd","name":"Tariff","manaCost":"{1}{W}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player sacrifices the creature they control with the greatest mana value unless they pay that creature's mana cost. If two or more creatures a player controls are tied for greatest, that player chooses one.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24333832-2a87-4810-9443-ec993468d103.jpg?1783946745","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24333832-2a87-4810-9443-ec993468d103.jpg?1783946745","commanderLegal":"legal","set":"wth","releasedAt":"1997-06-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const meddle = (): CardDef => ({"oracleId":"67d6fbcb-2df7-4b5a-8464-158f6b720a2e","name":"Meddle","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"If target spell has only one target and that target is a creature, change that spell's target to another creature.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/8/685edfe8-9770-47c6-95fb-0816f3126f04.jpg?1783945082","artUrl":"https://cards.scryfall.io/art_crop/front/6/8/685edfe8-9770-47c6-95fb-0816f3126f04.jpg?1783945082","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const qdragon = (): CardDef => ({"oracleId":"f9701c1f-66c7-4ac7-8106-074d6f557ad6","name":"Quicksilver Dragon","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{U}: If target spell has only one target and that target is this creature, change that spell's target to another creature.\nMorph {4}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)","power":"5","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Morph"],"imageUrl":"https://cards.scryfall.io/normal/front/e/9/e93577bd-2711-443c-aa88-a235345d7800.jpg?1783945078","artUrl":"https://cards.scryfall.io/art_crop/front/e/9/e93577bd-2711-443c-aa88-a235345d7800.jpg?1783945078","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const arcTrail = (): CardDef => ({"oracleId":"f1c26b25-371e-4fbf-a43d-7fd59a364d3a","name":"Arc Trail","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Arc Trail deals 2 damage to any target and 1 damage to any other target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/445e3a0a-29a7-4dc0-80fe-569b9e751db3.jpg?1783941727","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/445e3a0a-29a7-4dc0-80fe-569b9e751db3.jpg?1783941727","commanderLegal":"legal","set":"som","releasedAt":"2010-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string) => ({ kind: "object" as const, id });
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
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone === "hand" ? "hand" : "graveyard"].push(id);
  invalidateCharacteristics(s);
  return id;
};
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const landsOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);

describe("Lane B round B151", () => {
  it("compiles the cards", () => supported(pet(), balance(), sacrifice(), confessor(), tariff(), meddle(), qdragon()));

  it("Dralnu's Pet: kicked, it enters with flying and as many +1/+1 counters as the discarded card's mana value", () => {
    const { s: s0, ap } = setup([]);
    const me = toZone(s0, ap, pet(), "hand");
    const big = toZone(s0, ap, bear({ name: "Big Bear", manaCost: "{3}{G}{G}", cmc: 5 }), "hand");
    let s = settle(run(s0, planCast(s0, ap, me, [], undefined, "auto", undefined, { kicks: [0], discard: [big] })));
    expect(s.objects[big]!.zone).toBe("graveyard");
    expect(s.objects[me]!.zone).toBe("battlefield");
    expect(s.objects[me]!.counters["+1/+1"]).toBe(5);
    expect(compileCard(pet()).entersKicked?.length).toBe(1);
    const flying = (st: GameState, id: string) => objHasKeyword(st, st.objects[id]!, "Flying");
    expect(flying(s, me)).toBe(true);
    // Not kicked: no discard, no counters, no flying.
    const { s: s1, ap: ap1 } = setup([]);
    const plain = toZone(s1, ap1, pet(), "hand");
    s = settle(run(s1, planCast(s1, ap1, plain)));
    expect(s.objects[plain]!.zone).toBe("battlefield");
    expect(s.objects[plain]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(flying(s, plain)).toBe(false);
  });

  it("Natural Balance: each player keeps five lands, then those with four or fewer may search for basics up to five", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2, o3] = others(s0, ap);
    const forest = card("Forest", "Basic Land — Forest");
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, o1!, forest);
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, o2!, forest);
    for (let i = 0; i < 6; i++) putOnBattlefield(s0, o3!, forest);
    const me = toZone(s0, ap, balance(), "hand");
    let s = run(s0, planCast(s0, ap, me));
    s = settle(s);
    // You (14 lands) keep five; the active player first (CR 101.4).
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "keep", count: 5 });
    const kept = landsOf(s, ap).slice(0, 5);
    s = act(s, { type: "pickPermanents", player: ap, ids: kept });
    // The player with six keeps five too.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: o3, action: "keep", count: 5 });
    s = act(s, { type: "pickPermanents", player: o3!, ids: landsOf(s, o3!).slice(1) });
    // Then the searches: only the player with two lands (X = 3); the others have five now.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: o1 });
    s = act(s, { type: "chooseMay", player: o1!, yes: true });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: o1, max: 3 });
    const found = (s.pending as { cards: string[] }).cards.filter((id) => nameOf(s, id) === "Forest").slice(0, 2);
    s = act(s, { type: "searchLibrary", player: o1!, found });
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.stack.length).toBe(0);
    expect(landsOf(s, ap)).toHaveLength(5);
    expect(kept.every((id) => s.objects[id]!.zone === "battlefield")).toBe(true);
    expect(landsOf(s, o1!)).toHaveLength(4); // found fewer than X: allowed (rulings)
    expect(landsOf(s, o2!)).toHaveLength(5);
    expect(landsOf(s, o3!)).toHaveLength(5);
  });

  it("Nahiri's Sacrifice: X announced, a creature or artifact with exactly that mana value sacrificed, X damage divided", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = toZone(s0, ap, sacrifice(), "hand");
    const three = putOnBattlefield(s0, ap, bear({ name: "Three Bear", manaCost: "{2}{G}", cmc: 3 }));
    const rock = putOnBattlefield(s0, ap, card("Mind Stone", "Artifact", "{2}", { cmc: 2 }));
    const a = putOnBattlefield(s0, opp, bear({ name: "Bear A", toughness: "2" }));
    const b = putOnBattlefield(s0, opp, bear({ name: "Bear B", toughness: "2" }));
    const split = [{ ...tgt(a), amount: 2 }, { ...tgt(b), amount: 1 }];
    // X 3 with the 2-mana artifact: not that mana value.
    expect(planCast(s0, ap, me, split, undefined, "auto", 3, { sacrifice: [rock] })).toBeNull();
    // More targets than X can't be chosen (each at least 1, CR 601.2d).
    expect(planCast(s0, ap, me, [{ ...tgt(a), amount: 2 }, { ...tgt(b), amount: 2 }], undefined, "auto", 3, { sacrifice: [three] })).toBeNull();
    let s = settle(run(s0, planCast(s0, ap, me, split, undefined, "auto", 3, { sacrifice: [three] })));
    expect(s.objects[three]!.zone).toBe("graveyard");
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.damage).toBe(1);
    // X 2 with the artifact: an artifact counts too.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const me1 = toZone(s1, ap1, sacrifice(), "hand");
    const rock1 = putOnBattlefield(s1, ap1, card("Mind Stone", "Artifact", "{2}", { cmc: 2 }));
    const c = putOnBattlefield(s1, opp1, bear({ name: "Bear C" }));
    s = settle(run(s1, planCast(s1, ap1, me1, [{ ...tgt(c), amount: 2 }], undefined, "auto", 2, { sacrifice: [rock1] })));
    expect(s.objects[rock1]!.zone).toBe("graveyard");
    expect(s.objects[c]!.zone).toBe("graveyard");
  });

  it("Vizkopa Confessor: pay any amount of life, that many cards of the opponent's choice revealed, you exile one", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = toZone(s0, ap, confessor(), "hand");
    const theirs = [...s0.players[opp]!.hand];
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planCast(s0, ap, me)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    // The amount as it resolves, at most your life.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "payLife", numberRange: { min: 0, max: life } });
    s = act(s, { type: "chooseOption", player: ap, choice: "2" });
    expect(s.players[ap]!.life).toBe(life - 2);
    // The opponent picks which two they reveal.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, min: 2, max: 2, fromHand: true });
    const shown = theirs.slice(0, 2);
    s = act(s, { type: "searchLibrary", player: opp, found: shown });
    // You choose one of those two.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1 });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([...shown].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [shown[1]!] }));
    expect(s.objects[shown[1]!]!.zone).toBe("exile");
    expect(s.objects[shown[0]!]!.zone).toBe("hand");
    expect(s.players[opp]!.hand).toHaveLength(theirs.length - 1);
    // Paying 0: nothing revealed or exiled (rulings).
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const me1 = toZone(s1, ap1, confessor(), "hand");
    const n1 = s1.players[opp1]!.hand.length;
    s = settle(run(s1, planCast(s1, ap1, me1)));
    s = settle(act(s, { type: "chooseTargets", player: ap1, targets: [{ kind: "player", id: opp1 }] }));
    s = settle(act(s, { type: "chooseOption", player: ap1, choice: "0" }));
    expect(s.pending).toBeNull();
    expect(s.players[opp1]!.hand).toHaveLength(n1);
    expect(s.players[ap1]!.life).toBe(s1.players[ap1]!.life);
  });

  it("Vizkopa Confessor: a bot pays to see the opponent's whole hand while it has life to spare", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = toZone(s0, ap, confessor(), "hand");
    let s = settle(run(s0, planCast(s0, ap, me)));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    s.players[opp]!.hand = s.players[opp]!.hand.slice(0, 3);
    const [a] = botActions(s, ap);
    expect(a).toEqual({ type: "chooseOption", player: ap, choice: "3" });
  });

  it("Tariff: each player in turn picks their greatest creature, then pays its mana cost or it's sacrificed with the others", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2, o3] = others(s0, ap);
    const me = toZone(s0, ap, tariff(), "hand");
    const big = putOnBattlefield(s0, ap, bear({ name: "Big Bear", manaCost: "{3}{G}{G}", cmc: 5 }));
    const small = putOnBattlefield(s0, ap, bear({ name: "Small Bear" }));
    const tieA = putOnBattlefield(s0, o1!, bear({ name: "Tie A", manaCost: "{2}{W}", cmc: 3 }));
    const tieB = putOnBattlefield(s0, o1!, bear({ name: "Tie B", manaCost: "{2}{W}", cmc: 3 }));
    // A token with no mana cost: an unpayable cost (CR 118.6), so it's sacrificed.
    const token = putOnBattlefield(s0, o3!, bear({ name: "Spirit Token", manaCost: "" }));
    s0.objects[token]!.isToken = true;
    let s = settle(run(s0, planCast(s0, ap, me)));
    // You first: Big Bear is the only one with the greatest, so straight to its mana cost.
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{3}{G}{G}" });
    s = act(s, { type: "payUnless", player: ap, pay: false });
    // Then the next player chooses between the tied ones, and only then pays.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: o1, action: "sacrifice" });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([tieA, tieB].sort());
    s = act(s, { type: "pickPermanents", player: o1!, ids: [tieB] });
    expect(s.pending).toMatchObject({ kind: "payUnless", player: o1, cost: "{2}{W}" });
    s.players[o1!]!.manaPool = { W: 1, U: 0, B: 0, R: 0, G: 0, C: 2 };
    s = settle(act(s, { type: "payUnless", player: o1!, pay: true }));
    expect(s.pending).toBeNull();
    expect(s.objects[big]!.zone).toBe("graveyard");
    expect(s.objects[small]!.zone).toBe("battlefield");
    expect(s.objects[tieA]!.zone).toBe("battlefield");
    expect(s.objects[tieB]!.zone).toBe("battlefield");
    expect(s.objects[token]?.zone ?? "gone").not.toBe("battlefield");
    expect(s.players[o1!]!.manaPool.W + s.players[o1!]!.manaPool.C).toBe(0);
    void o2;
  });

  it("Tariff: an {X} in the mana cost is paid as 0 (CR 107.3h)", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = toZone(s0, ap, tariff(), "hand");
    const hydra = putOnBattlefield(s0, opp, bear({ name: "X Hydra", manaCost: "{X}{G}{G}", cmc: 2 }));
    let s = settle(run(s0, planCast(s0, ap, me)));
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp, cost: "{G}{G}" });
    s.players[opp]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 2, C: 0 };
    s = settle(act(s, { type: "payUnless", player: opp, pay: true }));
    expect(s.objects[hydra]!.zone).toBe("battlefield");
  });

  const bolt = () => card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." });
  /** You cast `spell` with these targets, then `answer` (holding priority, CR 117.3c) targeting it. */
  const respond = (s0: GameState, ap: PlayerId, spellDef: CardDef, targets: TargetChoice[], answer: string) => {
    const spell = toZone(s0, ap, spellDef, "hand");
    let s = run(s0, planCast(s0, ap, spell, targets));
    const item = s.stack.at(-1)!;
    s = run(s, planCast(s, ap, answer, [{ kind: "stack", id: item.id }]));
    return { s, item: item.id };
  };

  it("Meddle: a spell whose only target is a creature gets another creature as its target", () => {
    const { s: s0, ap, opp } = setup([]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const other = putOnBattlefield(s0, opp, bear({ name: "Other Bear" }));
    const m = toZone(s0, ap, meddle(), "hand");
    let { s } = respond(s0, ap, bolt(), [tgt(mine)], m);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "changeTarget", player: ap });
    // Only creatures: no player is offered (the bolt could target one).
    expect((s.pending as { options: TargetChoice[] }).options.every((t) => t.kind === "object")).toBe(true);
    s = settle(act(s, { type: "changeTarget", player: ap, target: tgt(theirs) }));
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[other]!.zone).toBe("battlefield");
  });

  it("Meddle: nothing changes for a spell targeting a player, or with two targets", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const m = toZone(s0, ap, meddle(), "hand");
    let { s } = respond(s0, ap, bolt(), [{ kind: "player", id: opp }], m);
    const life = s.players[opp]!.life;
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.life).toBe(life - 3);
    // Arc Trail: a creature and another target, two targets (rulings).
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const a = putOnBattlefield(s1, opp1, bear({ name: "Bear A", toughness: "3" }));
    putOnBattlefield(s1, opp1, bear({ name: "Bear B" }));
    const m1 = toZone(s1, ap1, meddle(), "hand");
    const life1 = s1.players[opp1]!.life;
    ({ s } = respond(s1, ap1, arcTrail(), [tgt(a), { kind: "player", id: opp1 }], m1));
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.objects[a]!.damage).toBe(2);
    expect(s.players[opp1]!.life).toBe(life1 - 1);
  });

  it("Quicksilver Dragon: a spell whose only target is it gets another creature as its target; not one targeting another", () => {
    const { s: s0, ap, opp } = setup([]);
    const dragon = putOnBattlefield(s0, ap, qdragon());
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const spell = toZone(s0, ap, bolt(), "hand");
    let s = run(s0, planCast(s0, ap, spell, [tgt(dragon)]));
    const item = s.stack.at(-1)!;
    s = run(s, planActivate(s, ap, dragon, 0, [{ kind: "stack", id: item.id }]));
    s = settle(s);
    // The bear is the only other creature: no question.
    expect(s.pending).toBeNull();
    expect(s.objects[dragon]!.damage).toBe(0);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    // Its ability with the bolt aimed at the bear: nothing changes.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const dragon1 = putOnBattlefield(s1, ap1, qdragon());
    const bear1 = putOnBattlefield(s1, opp1, bear({ name: "Their Bear" }));
    const spell1 = toZone(s1, ap1, bolt(), "hand");
    s = run(s1, planCast(s1, ap1, spell1, [tgt(bear1)]));
    const item1 = s.stack.at(-1)!;
    s = settle(run(s, planActivate(s, ap1, dragon1, 0, [{ kind: "stack", id: item1.id }])));
    expect(s.objects[bear1]!.zone).toBe("graveyard");
    expect(s.objects[dragon1]!.damage).toBe(0);
  });
});
