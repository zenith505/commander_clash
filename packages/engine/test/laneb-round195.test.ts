// Lane B round B195: Roving Actuator ("Void — When this creature enters, if a nonland permanent left the battlefield this
// turn or a spell was warped this turn, exile up to one target instant or sorcery card with mana value 2 or less from your
// graveyard. Copy it. You may cast the copy without paying its mana cost."), Keldon Flamesage ("Whenever this creature
// attacks, look at the top X cards of your library, where X is this creature's power. You may exile an instant or sorcery
// card with mana value X or less from among them. Put the rest on the bottom of your library in a random order. You may
// cast the exiled card without paying its mana cost."), Discover the Impossible ("Look at the top five cards of your
// library. Exile one of them face down and put the rest on the bottom of your library in a random order. You may cast the
// exiled card without paying its mana cost if it's an instant spell with mana value 2 or less. If you don't, put that card
// into your hand."), Abuelo's Awakening ("Return target artifact or non-Aura enchantment card from your graveyard to the
// battlefield with X additional +1/+1 counters on it. It's a 1/1 Spirit creature with flying in addition to its other
// types."), Unyielding Gatekeeper ("When this creature is turned face up, exile another target nonland permanent. If you
// controlled it, return it to the battlefield tapped. Otherwise, its controller creates a 2/2 white and blue Detective
// creature token.") and Elite Arcanist ("When this creature enters, you may exile an instant card from your hand." "{X},
// {T}: Copy the exiled card. You may cast the copy without paying its mana cost. X is the mana value of the exiled card.").

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, compileCard, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, planTurnFaceUp, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const actuator = (): CardDef => ({"oracleId":"78ac1e6c-2704-4844-9e87-642324c23997","name":"Roving Actuator","manaCost":"{3}{R}","cmc":4,"typeLine":"Artifact Creature — Robot","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Robot"],"oracleText":"Void — When this creature enters, if a nonland permanent left the battlefield this turn or a spell was warped this turn, exile up to one target instant or sorcery card with mana value 2 or less from your graveyard. Copy it. You may cast the copy without paying its mana cost.","power":"3","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Void"],"imageUrl":"https://cards.scryfall.io/normal/front/1/1/1111173b-ea49-4de4-b5b0-07d768c626b9.jpg?1783905948","artUrl":"https://cards.scryfall.io/art_crop/front/1/1/1111173b-ea49-4de4-b5b0-07d768c626b9.jpg?1783905948","commanderLegal":"legal","set":"eoe","releasedAt":"2025-08-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const flamesage = (): CardDef => ({"oracleId":"0efedec3-b57c-4395-ad72-19d79560c99f","name":"Keldon Flamesage","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Shaman","supertypes":[],"types":["Creature"],"subtypes":["Human","Shaman"],"oracleText":"Enlist\nWhenever this creature attacks, look at the top X cards of your library, where X is this creature's power. You may exile an instant or sorcery card with mana value X or less from among them. Put the rest on the bottom of your library in a random order. You may cast the exiled card without paying its mana cost.","power":"2","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Enlist"],"imageUrl":"https://cards.scryfall.io/normal/front/9/d/9dacef18-5c0d-4c99-8273-1f9c896552bf.jpg?1783921187","artUrl":"https://cards.scryfall.io/art_crop/front/9/d/9dacef18-5c0d-4c99-8273-1f9c896552bf.jpg?1783921187","commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const impossible = (): CardDef => ({"oracleId":"1c2a3f13-6bcb-42ad-98f6-642151ad54f1","name":"Discover the Impossible","manaCost":"{2}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Look at the top five cards of your library. Exile one of them face down and put the rest on the bottom of your library in a random order. You may cast the exiled card without paying its mana cost if it's an instant spell with mana value 2 or less. If you don't, put that card into your hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/c/8c201117-9850-4e92-9ecc-e4d71a70a959.jpg?1783923908","artUrl":"https://cards.scryfall.io/art_crop/front/8/c/8c201117-9850-4e92-9ecc-e4d71a70a959.jpg?1783923908","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const abuelo = (): CardDef => ({"oracleId":"2b22cf44-7b03-4919-9812-6796bf193484","name":"Abuelo's Awakening","manaCost":"{X}{3}{W}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return target artifact or non-Aura enchantment card from your graveyard to the battlefield with X additional +1/+1 counters on it. It's a 1/1 Spirit creature with flying in addition to its other types.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/9/f93b725e-2b9c-4830-ac54-b2562afe09bb.jpg?1783913817","artUrl":"https://cards.scryfall.io/art_crop/front/f/9/f93b725e-2b9c-4830-ac54-b2562afe09bb.jpg?1783913817","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gatekeeper = (): CardDef => ({"oracleId":"3c8fa799-7f30-4532-8317-f37a7ab787de","name":"Unyielding Gatekeeper","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Elephant Cleric","supertypes":[],"types":["Creature"],"subtypes":["Elephant","Cleric"],"oracleText":"Disguise {1}{W} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)\nWhen this creature is turned face up, exile another target nonland permanent. If you controlled it, return it to the battlefield tapped. Otherwise, its controller creates a 2/2 white and blue Detective creature token.","power":"3","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Disguise"],"imageUrl":"https://cards.scryfall.io/normal/front/f/3/f3a0d597-d2df-4aaf-8084-c8eeda64ce60.jpg?1783912917","artUrl":"https://cards.scryfall.io/art_crop/front/f/3/f3a0d597-d2df-4aaf-8084-c8eeda64ce60.jpg?1783912917","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const arcanist = (): CardDef => ({"oracleId":"5bc3c4e2-087d-4255-a576-0b17ed1e8c3f","name":"Elite Arcanist","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"When this creature enters, you may exile an instant card from your hand.\n{X}, {T}: Copy the exiled card. You may cast the copy without paying its mana cost. X is the mana value of the exiled card.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/9/99b225fe-c07d-4d8a-bf2b-c1777bd29061.jpg?1783939934","artUrl":"https://cards.scryfall.io/art_crop/front/9/9/99b225fe-c07d-4d8a-bf2b-c1777bd29061.jpg?1783939934","commanderLegal":"legal","set":"m14","releasedAt":"2013-07-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const noLands = (s: GameState, pid: PlayerId) => {
  s.battlefield = s.battlefield.filter((id) => !(controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land")));
  invalidateCharacteristics(s);
};
const attack = (s: GameState, ap: PlayerId, attacker: ObjectId, defender: PlayerId) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] });
const lifeOf = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pendingCast = (s: GameState) => (s.pending?.kind === "castFree" ? s.pending.objectId : "");
const ptOf = (s: GameState, id: ObjectId) => `${characteristics(s, s.objects[id]!).power}/${characteristics(s, s.objects[id]!).toughness}`;

const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Test Bolt deals 3 damage to any target." });
const shock = card("Test Shock", "Sorcery", "{1}{R}", { cmc: 2, oracleText: "Test Shock deals 2 damage to any target." });
const blast = card("Test Blast", "Instant", "{X}{R}", { cmc: 1, oracleText: "Test Blast deals X damage to any target." });
const divination = card("Test Divination", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw two cards." });
const big = card("Test Big Bolt", "Instant", "{2}{R}", { cmc: 3, oracleText: "Test Big Bolt deals 4 damage to any target." });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3" });

describe("Round B195 cards are supported", () => {
  it("compiles all six", () => supported(actuator(), flamesage(), impossible(), abuelo(), gatekeeper(), arcanist()));
});

describe("Roving Actuator: void, as it enters: exile up to one instant or sorcery card with mana value 2 or less from your graveyard and cast a copy free", () => {
  const enter = (voided: boolean, ...yard: CardDef[]) => {
    const { s: s0, ap, opp, ids } = setup([actuator()]);
    const cards = yard.map((d) => into(s0, ap, d, "graveyard"));
    if (voided) s0.voidThisTurn = true;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, opp, cards, actuator: ids[0]! };
  };
  it("the copy is cast without paying its mana cost as the trigger resolves; the card stays exiled", () => {
    const { s: s0, ap, opp, cards } = enter(true, bolt);
    expect(s0.pending).toMatchObject({ kind: "chooseTargets" });
    let s = settle(s0, { targets: [tgt(cards[0]!)] });
    expect(s.objects[cards[0]!]!.zone).toBe("exile");
    s = act(s, { type: "chooseOption", player: ap, choice: cards[0]! });
    expect(s.pending).toMatchObject({ kind: "castFree" });
    expect(s.pending?.kind === "castFree" && s.pending.how).toBeUndefined();
    const copy = pendingCast(s);
    expect(copy).not.toBe(cards[0]);
    noLands(s, ap);
    const life = lifeOf(s, opp);
    s = settle(run(s, planCast(s, ap, copy, [{ kind: "player", id: opp }])));
    expect(lifeOf(s, opp)).toBe(life - 3);
    expect(s.objects[cards[0]!]!.zone).toBe("exile");
    expect(s.players[ap]!.graveyard).not.toContain(copy);
  });
  it("a sorcery of mana value 2 too; one of mana value 3 isn't a legal target; X counts as 0 in the graveyard (rulings)", () => {
    const { s: s0, cards } = enter(true, shock, divination, blast);
    expect(() => act(s0, { type: "chooseTargets", player: s0.activePlayer, targets: [tgt(cards[1]!)] })).toThrow();
    const s = settle(s0, { targets: [tgt(cards[2]!)] });
    expect(s.objects[cards[2]!]!.zone).toBe("exile");
    const t = settle(s0, { targets: [tgt(cards[0]!)] });
    expect(t.objects[cards[0]!]!.zone).toBe("exile");
  });
  it("without void, nothing triggers (an intervening if, CR 603.4)", () => {
    const { s, cards, actuator: a } = enter(false, bolt);
    expect(s.pending).toBeNull();
    const t = settle(s);
    expect(t.objects[a]!.zone).toBe("battlefield");
    expect(t.objects[cards[0]!]!.zone).toBe("graveyard");
  });
  it("a nonland permanent that left the battlefield this turn turns void on", () => {
    const { s: s0, ap, opp, ids } = setup([card("Test Doom", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." }), actuator()]);
    const b = into(s0, ap, bolt, "graveyard");
    const victim = putOnBattlefield(s0, opp, ogre);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(victim)])));
    expect(s.objects[victim]!.zone).toBe("graveyard");
    s = run(s, planCast(s, ap, ids[1]!));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(s, { targets: [tgt(b)] });
    expect(s.objects[b]!.zone).toBe("exile");
  });
});

describe("Keldon Flamesage: as it attacks, look at the top X cards (its power), exile an instant or sorcery card with mana value X or less and cast it free", () => {
  const go = (top: CardDef[], counters = 0) => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, flamesage());
    if (counters) s0.objects[k]!.counters["+1/+1"] = counters;
    const ids = [...top].reverse().map((d) => into(s0, ap, d, "library")).reverse();
    let s = attack(s0, ap, k, opp);
    for (let i = 0; i < 40 && s.pending?.kind !== "searchLibrary"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p?.kind === "chooseOption" || p?.kind === "chooseMay") s = act(s, p.kind === "chooseMay" ? { type: "chooseMay", player: p.player, yes: false } : { type: "chooseOption", player: p.player, choice: "none" });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return { s, ap, opp, ids, k };
  };
  it("power 2: the top two; only an instant or sorcery card with mana value 2 or less is offered; it's cast free", () => {
    const { s: s0, ap, opp, ids } = go([big, bolt, divination]);
    expect(s0.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [ids[1]], min: 0, max: 1 });
    let s = act(s0, { type: "searchLibrary", player: ap, found: [ids[1]!] });
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
    // The other card looked at goes to the bottom; the third card was never looked at.
    expect(s.players[ap]!.library[0]).toBe(ids[2]);
    expect(s.players[ap]!.library[s.players[ap]!.library.length - 1]).toBe(ids[0]);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: ids[1] });
    noLands(s, ap);
    const life = lifeOf(s, opp);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(lifeOf(s, opp)).toBe(life - 3);
  });
  it("its power as the trigger resolves: with a +1/+1 counter, the top three and mana value 3 or less", () => {
    const { s, ap, ids } = go([big, ogre, divination], 1);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
    expect(s.pending?.kind === "searchLibrary" && [...s.pending.cards].sort()).toEqual([ids[0], ids[2]].sort());
  });
  it("declining the cast leaves it exiled (rulings)", () => {
    const { s: s0, ap, ids } = go([bolt, ogre]);
    let s = act(s0, { type: "searchLibrary", player: ap, found: [ids[0]!] });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });
});

describe("Discover the Impossible: exile one of the top five face down; cast it free if it's an instant spell with mana value 2 or less, or it goes to your hand", () => {
  const go = (top: CardDef[]) => {
    const { s: s0, ap, opp, ids } = setup([impossible()]);
    const lib = [...top].reverse().map((d) => into(s0, ap, d, "library")).reverse();
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, opp, lib, spell: ids[0]! };
  };
  const five = [bolt, divination, big, ogre, shock];
  it("one of the top five must be exiled; an instant with mana value 1 is cast free; the rest go to the bottom", () => {
    const { s: s0, ap, opp, lib } = go(five);
    expect(s0.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    expect(s0.pending?.kind === "searchLibrary" && [...s0.pending.cards].sort()).toEqual([...lib].sort());
    let s = act(s0, { type: "searchLibrary", player: ap, found: [lib[0]!] });
    expect(s.objects[lib[0]!]!.zone).toBe("exile");
    // Face down: only you may look at it (CR 406.3).
    expect(s.objects[lib[0]!]!.hiddenExile?.seen).toEqual([ap]);
    expect([...s.players[ap]!.library.slice(-4)].sort()).toEqual([...lib.slice(1)].sort());
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: lib[0], how: "orHand", types: ["Instant"], mv: { max: 2 } });
    noLands(s, ap);
    const life = lifeOf(s, opp);
    s = settle(run(s, planCast(s, ap, lib[0]!, [{ kind: "player", id: opp }])));
    expect(lifeOf(s, opp)).toBe(life - 3);
    expect(s.objects[lib[0]!]!.zone).toBe("graveyard");
  });
  it("not cast: into your hand", () => {
    const { s: s0, ap, lib } = go(five);
    let s = act(s0, { type: "searchLibrary", player: ap, found: [lib[0]!] });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[lib[0]!]!.zone).toBe("hand");
  });
  it("a sorcery, a creature or an instant of mana value 3 can't be cast this way: straight into your hand", () => {
    for (const i of [1, 2, 3, 4]) {
      const { s: s0, ap, lib } = go(five);
      const s = settle(act(s0, { type: "searchLibrary", player: ap, found: [lib[i]!] }));
      expect(s.pending).toBeNull();
      expect(s.objects[lib[i]!]!.zone).toBe("hand");
    }
  });
  it("a bot exiles a card it can cast free when there is one", () => {
    const { s, ap, lib } = go([divination, ogre, big, bolt, shock]);
    expect(botActions(s, ap)).toEqual([{ type: "searchLibrary", player: ap, found: [lib[3]] }]);
  });
  it("X is 0 cast this way (CR 107.3b): Test Blast deals no damage", () => {
    const { s: s0, ap, opp, lib } = go([blast, ogre, ogre, ogre, ogre]);
    let s = act(s0, { type: "searchLibrary", player: ap, found: [lib[0]!] });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: lib[0] });
    noLands(s, ap);
    const life = lifeOf(s, opp);
    s = settle(run(s, planCast(s, ap, lib[0]!, [{ kind: "player", id: opp }])));
    expect(lifeOf(s, opp)).toBe(life);
  });
});

describe("Abuelo's Awakening: an artifact or non-Aura enchantment card returns as a 1/1 Spirit creature with flying and X +1/+1 counters", () => {
  const rock = card("Test Rock", "Artifact", "{2}", { cmc: 2 });
  const charm = card("Test Charm", "Enchantment", "{1}{W}", { cmc: 2 });
  const aura = card("Test Aura", "Enchantment — Aura", "{W}", { cmc: 1, oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
  it("X is 2: an artifact enters with two +1/+1 counters, a 1/1 Spirit artifact creature with flying, so 3/3", () => {
    const { s: s0, ap, ids } = setup([abuelo()]);
    const r = into(s0, ap, rock, "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(r)], undefined, undefined, 2)));
    const o = s.objects[r]!;
    expect(o.zone).toBe("battlefield");
    expect(o.counters["+1/+1"]).toBe(2);
    const c = characteristics(s, o);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toContain("Spirit");
    expect(c.keywords).toContain("Flying");
    expect(ptOf(s, r)).toBe("3/3");
  });
  it("X is 0: a 1/1 enchantment creature with no counters", () => {
    const { s: s0, ap, ids } = setup([abuelo()]);
    const c = into(s0, ap, charm, "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(c)], undefined, undefined, 0)));
    expect(s.objects[c]!.zone).toBe("battlefield");
    expect(s.objects[c]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(ptOf(s, c)).toBe("1/1");
  });
  it("an Aura card, a creature card or another player's card isn't a legal target", () => {
    const { s, ap, opp, ids } = setup([abuelo()]);
    const a = into(s, ap, aura, "graveyard");
    const o = into(s, ap, ogre, "graveyard");
    const theirs = into(s, opp, rock, "graveyard");
    for (const t of [a, o, theirs]) expect(planCast(s, ap, ids[0]!, [tgt(t)], undefined, undefined, 1)).toBeNull();
  });
});

describe("Unyielding Gatekeeper: turned face up, exile another target nonland permanent; yours returns tapped, anyone else's gives them a Detective", () => {
  const faceDown = () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, gatekeeper());
    s0.objects[g]!.faceDown = "disguise";
    invalidateCharacteristics(s0);
    return { s0, ap, opp, g };
  };
  it("yours: it returns to the battlefield tapped under your control as a new object", () => {
    const { s0, ap, g } = faceDown();
    const mine = putOnBattlefield(s0, ap, card("Test Relic", "Artifact", "{3}", { cmc: 3 }));
    const s = settle(run(s0, planTurnFaceUp(s0, ap, g)), { targets: [tgt(mine)] });
    const back = s.battlefield.map((id) => s.objects[id]!).find((o) => characteristics(s, o).name === "Test Relic");
    expect(back).toBeTruthy();
    expect(back!.tapped).toBe(true);
    expect(controllerOf(s, back!)).toBe(ap);
    expect(s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === "Detective Token")).toHaveLength(0);
  });
  it("an opponent's: exiled, and that player creates a 2/2 white and blue Detective", () => {
    const { s0, ap, opp, g } = faceDown();
    const theirs = putOnBattlefield(s0, opp, card("Test Relic", "Artifact", "{3}", { cmc: 3 }));
    const s = settle(run(s0, planTurnFaceUp(s0, ap, g)), { targets: [tgt(theirs)] });
    expect(s.objects[theirs]!.zone).toBe("exile");
    const det = s.battlefield.map((id) => s.objects[id]!).filter((o) => characteristics(s, o).name === "Detective Token");
    expect(det).toHaveLength(1);
    expect(controllerOf(s, det[0]!)).toBe(opp);
    const c = characteristics(s, det[0]!);
    expect([c.power, c.toughness]).toEqual([2, 2]);
    expect([...c.colors].sort()).toEqual(["U", "W"]);
    expect(c.subtypes).toContain("Detective");
  });
  it("an opponent's you control (stolen): yours as this resolves, so it returns under your control (rulings)", () => {
    const { s0, ap, opp, g } = faceDown();
    const stolen = putOnBattlefield(s0, opp, card("Test Relic", "Artifact", "{3}", { cmc: 3 }));
    s0.objects[stolen]!.controller = ap;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planTurnFaceUp(s0, ap, g)), { targets: [tgt(stolen)] });
    const back = s.battlefield.map((id) => s.objects[id]!).find((o) => characteristics(s, o).name === "Test Relic");
    expect(back && controllerOf(s, back)).toBe(ap);
    expect(back!.owner).toBe(opp);
    expect(back!.tapped).toBe(true);
  });
  it("a land or the Gatekeeper itself isn't a legal target", () => {
    const { s0, ap, g } = faceDown();
    const land = s0.battlefield.find((id) => controllerOf(s0, s0.objects[id]!) === ap && characteristics(s0, s0.objects[id]!).types.includes("Land"))!;
    const rock = putOnBattlefield(s0, ap, card("Test Relic", "Artifact", "{3}", { cmc: 3 }));
    let s = run(s0, planTurnFaceUp(s0, ap, g));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(land)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(g)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(rock)] })).not.toThrow();
  });
});

describe("Elite Arcanist: exile an instant card from your hand as it enters; {X}, {T} with X its mana value: cast a copy free", () => {
  const imprint = (instant: CardDef) => {
    const { s: s0, ap, opp, ids } = setup([arcanist(), instant]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
      else if (p?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] });
      else if (p) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    // As if it had been there since the turn began (no summoning sickness for its {T} ability).
    s.objects[ids[0]!]!.controlledSinceTurn = -1;
    return { s, ap, opp, a: ids[0]!, inst: ids[1]! };
  };
  it("the instant is exiled; activating costs exactly its mana value; the copy is cast free and gone after", () => {
    const { s: s0, ap, opp, a, inst } = imprint(big);
    expect(s0.objects[inst]!.zone).toBe("exile");
    // X is 3 (Test Big Bolt): two lands' worth of mana isn't enough.
    const poor = structuredClone(s0);
    noLands(poor, ap);
    poor.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 };
    expect(planActivate(poor, ap, a, 0)).toBeNull();
    let s = structuredClone(s0);
    noLands(s, ap);
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 3 };
    s = settle(run(s, planActivate(s, ap, a, 0)));
    expect(s.players[ap]!.manaPool.C).toBe(0);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
    const copy = pendingCast(s);
    expect(copy).not.toBe(inst);
    const life = lifeOf(s, opp);
    s = settle(run(s, planCast(s, ap, copy, [{ kind: "player", id: opp }])));
    expect(lifeOf(s, opp)).toBe(life - 4);
    expect(s.objects[inst]!.zone).toBe("exile");
    expect(s.objects[copy]).toBeUndefined();
  });
  it("only an instant card can be exiled; with nothing exiled, X isn't defined and it can't be activated", () => {
    const { s, ap, a, inst } = imprint(shock);
    expect(s.objects[inst]!.zone).toBe("hand");
    expect(planActivate(s, ap, a, 0)).toBeNull();
  });
  it("an instant with {X} in its cost: its mana value counts X as 0, so X is 1; the copy's X is 0 (rulings)", () => {
    const { s: s0, ap, opp, a, inst } = imprint(blast);
    expect(s0.objects[inst]!.zone).toBe("exile");
    let s = structuredClone(s0);
    noLands(s, ap);
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 };
    s = settle(run(s, planActivate(s, ap, a, 0)));
    const life = lifeOf(s, opp);
    s = settle(run(s, planCast(s, ap, pendingCast(s), [{ kind: "player", id: opp }])));
    expect(lifeOf(s, opp)).toBe(life);
  });
});
