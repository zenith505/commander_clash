// Round 263: delayed triggers work independently of their source (CR 603.7): a token's "When ~ dies, at the beginning
// of the next end step, ..." still makes its delayed trigger once the token has ceased to exist (CR 704.5d, 111.7), and
// a delayed "whenever that creature deals combat damage this turn" made by a token still triggers after the token left.
// Cards: Perception Bobblehead and Kiora, Sovereign of the Deep (look at the top X, cast a spell with mana value up to a
// number for free), Phyrexian Unlife (damage as though its source had infect at 0 or less life), Owlbear Cub (attacking a
// player who controls eight or more lands, a creature put onto the battlefield tapped and attacking that player) and
// Kellan, the Kid (a permanent spell with equal or lesser mana value from your hand, else a land).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, characteristics, controllerOf, dealDamageBatch, destroyPermanent, invalidateCharacteristics, isFullySupported, objectSource, planActivate, planCast, runStateBasedActions, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question but blockers (none declared). */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes until a question of this kind, declaring no attackers or blockers on the way. */
const passTo = (s: GameState, kind: string, max = 80) => {
  for (let i = 0; i < max && s.pending?.kind !== kind; i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
    else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: waitingOn(s)!, attacks: [] });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const opps = (s: GameState, ap: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % s.turnOrder.length]!);
const tokensNamed = (s: GameState, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === name);
const asToken = (s: GameState, id: ObjectId) => {
  s.objects[id]!.isToken = true;
  return id;
};

const bobblehead = (): CardDef => ({"oracleId":"f0bcdc43-c43d-4ce7-a283-b8dcab4fc497","name":"Perception Bobblehead","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Bobblehead","supertypes":[],"types":["Artifact"],"subtypes":["Bobblehead"],"oracleText":"{T}: Add one mana of any color.\n{3}, {T}: Look at the top X cards of your library, where X is the number of Bobbleheads you control. You may cast a spell with mana value 3 or less from among them without paying its mana cost. Put the rest on the bottom of your library in a random order.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const kiora = (): CardDef => ({"oracleId":"95df54e2-0196-4e54-8144-de5982ce07f5","name":"Kiora, Sovereign of the Deep","manaCost":"{3}{G}{U}","cmc":5,"typeLine":"Legendary Creature — Merfolk Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Merfolk","Noble"],"oracleText":"Vigilance, ward {3}\nWhenever you cast a Kraken, Leviathan, Octopus, or Serpent spell from your hand, look at the top X cards of your library, where X is that spell's mana value. You may cast a spell with mana value less than X from among them without paying its mana cost. Put the rest on the bottom of your library in a random order.","power":"4","toughness":"5","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Vigilance","Ward"],"commanderLegal":"legal","set":"mat","releasedAt":"2023-05-12","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const unlife = (): CardDef => ({"oracleId":"6598d988-d60e-4441-88b6-8d0995c4675a","name":"Phyrexian Unlife","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"You don't lose the game for having 0 or less life.\nAs long as you have 0 or less life, all damage is dealt to you as though its source had infect. (Damage is dealt to you in the form of poison counters.)","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"wot","releasedAt":"2023-09-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const owlbear = (): CardDef => ({"oracleId":"0c92432d-ac76-47d2-af7a-fdffd4b546a2","name":"Owlbear Cub","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Bird Bear","supertypes":[],"types":["Creature"],"subtypes":["Bird","Bear"],"oracleText":"Mama's Coming — Whenever this creature attacks a player who controls eight or more lands, look at the top eight cards of your library. You may put a creature card from among them onto the battlefield tapped and attacking that player. Put the rest on the bottom of your library in a random order.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Mama's Coming"],"commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kellan = (): CardDef => ({"oracleId":"afacc200-16ff-40f3-9d43-268438131d24","name":"Kellan, the Kid","manaCost":"{G}{W}{U}","cmc":3,"typeLine":"Legendary Creature — Human Faerie Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Faerie","Rogue"],"oracleText":"Flying, lifelink\nWhenever you cast a spell from anywhere other than your hand, you may cast a permanent spell with equal or lesser mana value from your hand without paying its mana cost. If you don't, you may put a land card from your hand onto the battlefield.","power":"3","toughness":"3","colors":["G","U","W"],"colorIdentity":["G","U","W"],"keywords":["Flying","Lifelink"],"commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const indexOf = (s: GameState, id: ObjectId, text: RegExp) => {
  const i = abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => text.test(a.text));
  if (i < 0) throw new Error(`no ability ${text}`);
  return i;
};
const sorcery = (name: string, cost: string, cmc: number) => card(name, "Sorcery", cost, { cmc, oracleText: "Draw a card." });
const options = (s: GameState) => (s.pending as { options?: string[] } | null)?.options ?? [];
const rukhEgg = (): CardDef => ({"oracleId":"98116aec-2ab1-4bee-b727-9feff6274825","name":"Rukh Egg","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Bird Egg","supertypes":[],"types":["Creature"],"subtypes":["Bird","Egg"],"oracleText":"When this creature dies, create a 4/4 red Bird creature token with flying at the beginning of the next end step.","power":"0","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"arn","releasedAt":"1993-12-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lurker = (): CardDef => ({"oracleId":"c65c4d01-29da-47e6-993c-a265cf1f198c","name":"Long River Lurker","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Frog Scout","supertypes":[],"types":["Creature"],"subtypes":["Frog","Scout"],"oracleText":"Ward {1}\nOther Frogs you control have ward {1}.\nWhen this creature enters, target creature you control can't be blocked this turn. Whenever that creature deals combat damage this turn, you may exile it. If you do, return it to the battlefield under its owner's control.","power":"2","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Ward"],"commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

describe("a token's dies trigger with a delayed trigger (CR 603.7, 704.5d)", () => {
  it("a token Rukh Egg that died still makes a Bird at the next end step", () => {
    expect(isFullySupported(rukhEgg())).toBe(true);
    const { s: s0, ap } = setup([]);
    const egg = asToken(s0, putOnBattlefield(s0, ap, rukhEgg()));
    destroyPermanent(s0, s0.objects[egg]!, "test");
    runStateBasedActions(s0);
    // The token has ceased to exist (CR 704.5d).
    expect(s0.objects[egg]).toBeUndefined();
    let s = settle(s0);
    expect(tokensNamed(s, "Bird Token")).toEqual([]);
    expect(s.delayed?.some((d) => d.when === "nextEndStep")).toBe(true);
    s = settle(passUntil(s, "end"));
    const birds = tokensNamed(s, "Bird Token");
    expect(birds.length).toBe(1);
    expect(characteristics(s, s.objects[birds[0]!]!).power).toBe(4);
  });

  it("a nontoken Rukh Egg still works as before", () => {
    const { s: s0, ap } = setup([]);
    const egg = putOnBattlefield(s0, ap, rukhEgg());
    destroyPermanent(s0, s0.objects[egg]!, "test");
    let s = settle(s0);
    expect(s.objects[egg]!.zone).toBe("graveyard");
    s = settle(passUntil(s, "end"));
    expect(tokensNamed(s, "Bird Token").length).toBe(1);
  });
});

describe("a delayed trigger whose token source has left the battlefield (CR 603.7)", () => {
  it("a token Long River Lurker that died: its target still may be blinked when it deals combat damage", () => {
    const { s: s0, ap, ids } = setup([lurker()]);
    const b = putOnBattlefield(s0, ap, bear());
    const opp = opps(s0, ap)[0]!;
    // Cast it, then make the permanent a token before its enters trigger resolves.
    let s = run(s0, planCast(s0, ap, ids[0]!, []));
    s = passTo(s, "chooseTargets");
    asToken(s, ids[0]!);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: b }] }));
    expect(characteristics(s, s.objects[b]!).cantBeBlocked).toBeTruthy();
    expect(s.floatingTriggers?.length).toBe(1);
    destroyPermanent(s, s.objects[ids[0]!]!, "test");
    runStateBasedActions(s);
    expect(s.objects[ids[0]!]).toBeUndefined();
    const zc = s.objects[b]!.zoneChanges ?? 0;
    const life = s.players[opp]!.life;
    s = passTo(s, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = passTo(s, "chooseMay");
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.zoneChanges ?? 0).toBeGreaterThan(zc);
  });
});

describe("Perception Bobblehead", () => {
  it("looks at the top X cards, X the Bobbleheads you control, and may cast one with mana value 3 or less for free", () => {
    expect(isFullySupported(bobblehead())).toBe(true);
    const { s: s0, ap } = setup([]);
    const bob = putOnBattlefield(s0, ap, bobblehead());
    putOnBattlefield(s0, ap, card("Test Bobblehead", "Artifact — Bobblehead", "{1}"));
    const deep = into(s0, ap, sorcery("Test Deep Spell", "{1}{U}", 2), "library");
    const big = into(s0, ap, sorcery("Test Big Spell", "{3}{U}", 4), "library");
    const three = into(s0, ap, sorcery("Test Three Spell", "{2}{U}", 3), "library");
    s0.players[ap]!.manaPool.C = 3;
    let s = run(s0, planActivate(s0, ap, bob, indexOf(s0, bob, /^\{3\}, \{T\}/)));
    s = settle(s);
    // Two Bobbleheads: the top two cards only; the 4-mana one can't be cast, so the 3-mana one is the only choice.
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: three });
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, three, [])));
    expect(s.objects[three]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // The 4-mana card went to the bottom; the one below it is drawn by Test Three Spell.
    expect(s.players[ap]!.library.at(-1)).toBe(big);
    expect(s.players[ap]!.hand).toContain(deep);
  });

  it("with three Bobbleheads, the top three: a choice of the two with mana value 3 or less", () => {
    const { s: s0, ap } = setup([]);
    const bob = putOnBattlefield(s0, ap, bobblehead());
    putOnBattlefield(s0, ap, card("Test Bobblehead", "Artifact — Bobblehead", "{1}"));
    putOnBattlefield(s0, ap, card("Test Bobblehead Two", "Artifact — Bobblehead", "{1}"));
    const deep = into(s0, ap, sorcery("Test Deep Spell", "{1}{U}", 2), "library");
    const big = into(s0, ap, sorcery("Test Big Spell", "{3}{U}", 4), "library");
    const three = into(s0, ap, sorcery("Test Three Spell", "{2}{U}", 3), "library");
    s0.players[ap]!.manaPool.C = 3;
    let s = settle(run(s0, planActivate(s0, ap, bob, indexOf(s0, bob, /^\{3\}, \{T\}/))));
    expect(s.pending?.kind).toBe("chooseOption");
    expect(options(s)).toEqual(expect.arrayContaining([three, deep]));
    expect(options(s)).not.toContain(big);
    s = act(s, { type: "chooseOption", player: ap, choice: deep });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: deep });
  });
});

describe("Kiora, Sovereign of the Deep", () => {
  const kraken = () => card("Test Kraken", "Creature — Kraken", "{4}{U}", { cmc: 5, power: "6", toughness: "6" });
  it("casting a Kraken from your hand looks at the top X, X its mana value, and casts one with lesser mana value for free", () => {
    expect(isFullySupported(kiora())).toBe(true);
    const { s: s0, ap, ids } = setup([kraken()]);
    putOnBattlefield(s0, ap, kiora());
    const five = into(s0, ap, sorcery("Test Five Spell", "{4}{U}", 5), "library");
    const four = into(s0, ap, sorcery("Test Four Spell", "{3}{U}", 4), "library");
    s0.players[ap]!.manaPool.U = 5;
    let s = run(s0, planCast(s0, ap, ids[0]!, []));
    for (let i = 0; i < 20 && !s.pending && s.stack.length > 1; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 20 && !s.pending && s.stack.some((x) => x.kind !== "spell"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // Mana value 5: the top five, only the 4-mana one with lesser mana value (setup's library holds no other spell).
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: four });
    s = settle(run(s, planCast(s, ap, four, [])));
    expect(s.objects[four]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("a non-Kraken spell doesn't trigger it", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    putOnBattlefield(s0, ap, kiora());
    s0.players[ap]!.manaPool.G = 2;
    const s = run(s0, planCast(s0, ap, ids[0]!, []));
    expect(s.stack.length + s.triggerQueue.length).toBe(1);
  });
});

describe("Phyrexian Unlife", () => {
  const hit = (s: GameState, from: ObjectId, to: PlayerId, ...ns: number[]) => dealDamageBatch(s, ns.map((n) => ({ src: objectSource(s, s.objects[from]!), to: { player: to }, n })));
  const ready = () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, unlife());
    const opp = opps(s, ap)[0]!;
    const b = putOnBattlefield(s, opp, bear());
    return { s, ap, b };
  };

  it("damage that takes you from positive to below 0 is life loss; at 0 or less, damage is poison counters and you don't lose", () => {
    expect(isFullySupported(unlife())).toBe(true);
    const { s, ap, b } = ready();
    s.players[ap]!.life = 3;
    hit(s, b, ap, 5);
    expect(s.players[ap]!.life).toBe(-2);
    expect(s.players[ap]!.poison ?? 0).toBe(0);
    runStateBasedActions(s);
    expect(s.players[ap]!.lost).toBeFalsy();
    hit(s, b, ap, 2);
    expect(s.players[ap]!.life).toBe(-2);
    expect(s.players[ap]!.poison).toBe(2);
    runStateBasedActions(s);
    expect(s.players[ap]!.lost).toBeFalsy();
  });

  it("damage dealt at the same time is all life loss when you were above 0 before it", () => {
    const { s, ap, b } = ready();
    s.players[ap]!.life = 3;
    hit(s, b, ap, 2, 4);
    expect(s.players[ap]!.life).toBe(-3);
    expect(s.players[ap]!.poison ?? 0).toBe(0);
  });

  it("only its controller's damage changes, and only while they're at 0 or less", () => {
    const { s, ap, b } = ready();
    const opp = s.objects[b]!.controller;
    const mine = putOnBattlefield(s, ap, bear());
    s.players[opp]!.life = -1;
    s.players[ap]!.life = 10;
    hit(s, mine, opp, 2);
    expect(s.players[opp]!.life).toBe(-3);
    hit(s, b, ap, 2);
    expect(s.players[ap]!.life).toBe(8);
    expect(s.players[ap]!.poison ?? 0).toBe(0);
  });

  it("once it leaves while you're at 0 or less life, you lose", () => {
    const { s, ap } = ready();
    s.players[ap]!.life = 0;
    runStateBasedActions(s);
    expect(s.players[ap]!.lost).toBeFalsy();
    const u = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Phyrexian Unlife")!;
    destroyPermanent(s, s.objects[u]!, "test");
    runStateBasedActions(s);
    expect(s.players[ap]!.lost).toBe(true);
  });
});

describe("Owlbear Cub", () => {
  const ready = (lands: number) => {
    const { s, ap } = setup([]);
    const cub = putOnBattlefield(s, ap, owlbear());
    const [opp, other] = opps(s, ap);
    for (let i = 0; i < lands; i++) putOnBattlefield(s, opp!, forest);
    const elk = into(s, ap, card("Test Elk", "Creature — Elk", "{3}{G}", { cmc: 4, power: "4", toughness: "4" }), "library");
    for (let i = 0; i < 3; i++) into(s, ap, sorcery(`Test Filler ${i}`, "{U}", 1), "library");
    return { s, ap, cub, opp: opp!, other: other!, elk };
  };
  const attack = (s: GameState, ap: PlayerId, cub: ObjectId, opp: PlayerId) => {
    s = passTo(s, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: cub, defender: opp }] });
    for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  };

  it("attacking a player with eight lands, a creature from the top eight enters tapped and attacking that player", () => {
    expect(isFullySupported(owlbear())).toBe(true);
    const { s: s0, ap, cub, opp, elk } = ready(8);
    let s = attack(s0, ap, cub, opp);
    // The top eight looked at; only the creature card can be put onto the battlefield.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1 });
    const p = s.pending as unknown as { cards: string[]; dig: { looked: string[] } };
    expect(p.dig.looked.length).toBe(8);
    expect(p.cards).toContain(elk);
    for (const id of p.cards) expect(characteristics(s, s.objects[id]!).types).toContain("Creature");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [elk] }));
    expect(s.objects[elk]!.zone).toBe("battlefield");
    expect(s.objects[elk]!.tapped).toBe(true);
    expect(s.objects[elk]!.attacking).toBe(opp);
    expect(controllerOf(s, s.objects[elk]!)).toBe(ap);
    // The other seven went to the bottom.
    expect(s.players[ap]!.library.slice(-7).sort()).toEqual(p.dig.looked.filter((id) => id !== elk).sort());
    // It deals combat damage to that player: 2 from the Cub, 4 from the Elk.
    const life = s.players[opp]!.life;
    s = passTo(s, "discardToHandSize", 40);
    expect(s.players[opp]!.life).toBeLessThanOrEqual(life - 6);
  });

  it("with another opponent having eight lands, attacking one with fewer doesn't trigger it", () => {
    const { s: s0, ap, cub, opp, other, elk } = ready(8);
    const s = attack(s0, ap, cub, other);
    expect(s.pending?.kind).not.toBe("searchLibrary");
    expect(s.objects[elk]!.zone).toBe("library");
    void opp;
  });

  it("attacking a player with seven lands, nothing happens", () => {
    const { s: s0, ap, cub, opp, elk } = ready(7);
    const s = attack(s0, ap, cub, opp);
    expect(s.pending?.kind).not.toBe("chooseCards");
    expect(s.objects[elk]!.zone).toBe("library");
    expect(s.log.some((l) => /Owlbear Cub's ability triggers/.test(l.text))).toBe(false);
  });
});

describe("Kellan, the Kid", () => {
  const flashy = () => card("Test Flash Spell", "Sorcery", "{1}{U}", { cmc: 2, keywords: ["Flashback"], oracleText: "Draw a card.\nFlashback {1}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
  const ready = () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, kellan());
    const fb = into(s, ap, flashy(), "graveyard");
    s.players[ap]!.hand = [];
    const two = into(s, ap, card("Test Two Drop", "Creature — Elk", "{1}{G}", { cmc: 2, power: "2", toughness: "2" }), "hand");
    const three = into(s, ap, card("Test Three Drop", "Creature — Elk", "{2}{G}", { cmc: 3, power: "3", toughness: "3" }), "hand");
    const land = into(s, ap, forest, "hand");
    s.players[ap]!.manaPool.U = 2;
    return { s, ap, fb, two, three, land };
  };
  it("casting a spell from your graveyard: cast a permanent spell with equal or lesser mana value from your hand for free", () => {
    expect(isFullySupported(kellan())).toBe(true);
    const { s: s0, ap, fb, two, three, land } = ready();
    let s = run(s0, planCast(s0, ap, fb, undefined, undefined, undefined, undefined, { via: "flashback" }));
    for (let i = 0; i < 20 && !s.pending && s.stack.some((x) => x.kind !== "spell"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // The 2-mana creature, not the 3-mana one (the flashback spell's mana value is 2).
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromHand" });
    expect(options(s)).toContain(two);
    expect(options(s)).not.toContain(three);
    s = act(s, { type: "chooseOption", player: ap, choice: two });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: two });
    s = settle(run(s, planCast(s, ap, two, [])));
    expect(s.objects[two]!.zone).toBe("battlefield");
    expect(s.objects[three]!.zone).toBe("hand");
    expect(s.objects[land]!.zone).toBe("hand");
  });

  it("not casting one, you may put a land card from your hand onto the battlefield instead", () => {
    const { s: s0, ap, fb, two, land } = ready();
    let s = run(s0, planCast(s0, ap, fb, undefined, undefined, undefined, undefined, { via: "flashback" }));
    for (let i = 0; i < 20 && !s.pending && s.stack.some((x) => x.kind !== "spell"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, cards: [land] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [land] }));
    expect(s.objects[land]!.zone).toBe("battlefield");
    expect(s.objects[two]!.zone).toBe("hand");
  });

  it("a spell cast from your hand doesn't trigger it", () => {
    const { s: s0, ap, two } = ready();
    s0.players[ap]!.manaPool.G = 2;
    const s = run(s0, planCast(s0, ap, two, []));
    expect(s.stack.length + s.triggerQueue.length).toBe(1);
  });
});
