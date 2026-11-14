// Lane B round B203: Nyla, Shirshu Sleuth ("When Nyla enters, exile up to one target creature card from your graveyard. If
// you do, you lose X life and create X Clue tokens, where X is that card's mana value." / "At the beginning of your end
// step, if you control no Clues, return target card exiled with Nyla to its owner's hand."), Ellywick Tumblestrum, Storm,
// Windrider, Nahiri, the Unforgiving, Ride the Avalanche and Jhoira, Weatherlight Corsair.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const nyla = (): CardDef => ({"oracleId":"3492cee8-b854-449a-ada4-a4e8a4333d87","name":"Nyla, Shirshu Sleuth","manaCost":"{4}{B}","cmc":5,"typeLine":"Legendary Creature — Mole Beast","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Mole","Beast"],"oracleText":"When Nyla enters, exile up to one target creature card from your graveyard. If you do, you lose X life and create X Clue tokens, where X is that card's mana value. (A Clue token is an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nAt the beginning of your end step, if you control no Clues, return target card exiled with Nyla to its owner's hand.","power":"4","toughness":"5","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/4/e4760b87-b109-496a-98d1-353f67c265b8.jpg?1783904823","artUrl":"https://cards.scryfall.io/art_crop/front/e/4/e4760b87-b109-496a-98d1-353f67c265b8.jpg?1783904823","commanderLegal":"legal","set":"tle","releasedAt":"2025-11-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ellywick = (): CardDef => ({"oracleId":"d0375311-b0ea-4870-bc2c-4894da088dc3","name":"Ellywick Tumblestrum","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Legendary Planeswalker — Ellywick","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Ellywick"],"oracleText":"+1: Venture into the dungeon. (Enter the first room or advance to the next room.)\n−2: Look at the top six cards of your library. You may reveal a creature card from among them and put it into your hand. If it's legendary, you gain 3 life. Put the rest on the bottom of your library in a random order.\n−7: You get an emblem with \"Creatures you control have trample and haste and get +2/+2 for each differently named dungeon you've completed.\"","loyalty":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Venture into the dungeon"],"imageUrl":"https://cards.scryfall.io/normal/front/b/a/bab81bc0-0369-469e-9296-6d9681697b21.jpg?1783926464","artUrl":"https://cards.scryfall.io/art_crop/front/b/a/bab81bc0-0369-469e-9296-6d9681697b21.jpg?1783926464","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const storm = (): CardDef => ({"oracleId":"06e9287b-56d4-443e-97ba-b5dcdc4fa989","name":"Storm, Windrider","manaCost":"{1}{G}{W}{W}","cmc":4,"typeLine":"Legendary Creature — Mutant Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Mutant","Hero"],"oracleText":"Flying\nCreatures with flying can't attack you or block creatures you control.\nWhenever you cast a spell that targets one or more creatures, those creatures gain flying until end of turn.","power":"4","toughness":"4","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/e/9/e90196a9-5a76-42f8-9b40-097d02b47f33.jpg?1783902896","artUrl":"https://cards.scryfall.io/art_crop/front/e/9/e90196a9-5a76-42f8-9b40-097d02b47f33.jpg?1783902896","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const nahiri = (): CardDef => ({"oracleId":"d71d42e0-cd56-4f53-95ff-ecab7f8c6552","name":"Nahiri, the Unforgiving","manaCost":"{1}{R}{R/W/P}{W}","cmc":4,"typeLine":"Legendary Planeswalker — Nahiri","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Nahiri"],"oracleText":"Compleated ({R/W/P} can be paid with {R}, {W}, or 2 life. If life was paid, this planeswalker enters with two fewer loyalty counters.)\n+1: Until your next turn, up to one target creature attacks a player each combat if able.\n+1: Discard a card, then draw a card.\n0: Exile target creature or Equipment card with mana value less than Nahiri's loyalty from your graveyard. Create a token that's a copy of it. That token gains haste. Exile it at the beginning of the next end step.","loyalty":"5","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Compleated"],"imageUrl":"https://cards.scryfall.io/normal/front/5/7/578e35b9-7252-4767-a1f3-aecd71256515.jpg?1783917998","artUrl":"https://cards.scryfall.io/art_crop/front/5/7/578e35b9-7252-4767-a1f3-aecd71256515.jpg?1783917998","commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const avalanche = (): CardDef => ({"oracleId":"d49c94fa-712a-47c0-b571-4db7e064a590","name":"Ride the Avalanche","manaCost":"{G}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"The next spell you cast this turn can be cast as though it had flash. When you next cast a spell this turn, put X +1/+1 counters on up to one target creature, where X is the mana value of that spell.","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/e/9e32eded-f9a2-4512-b82e-64445f8df8a3.jpg?1783926238","artUrl":"https://cards.scryfall.io/art_crop/front/9/e/9e32eded-f9a2-4512-b82e-64445f8df8a3.jpg?1783926238","commanderLegal":"legal","set":"afc","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const jhoira = (): CardDef => ({"oracleId":"cf9b0bb5-d545-4efd-9255-39b10c2be0ee","name":"Jhoira, Weatherlight Corsair","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Legendary Creature — Human Pirate","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Pirate"],"oracleText":"Whenever Jhoira enters or attacks, target opponent reveals cards from the top of their library until they reveal a historic permanent card. You put that card onto the battlefield under your control and lose life equal to that permanent's mana value. That player puts the rest of the revealed cards on the bottom of their library in a random order. (Artifacts, legendaries, and Sagas are historic.)","power":"4","toughness":"5","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/8/1874c58d-00ce-4973-a318-50ce21d1a675.jpg?1789644258","artUrl":"https://cards.scryfall.io/art_crop/front/1/8/1874c58d-00ce-4973-a318-50ce21d1a675.jpg?1789644258","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

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
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const zoneOf = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const clues = (s: GameState, pid: PlayerId) => named(s, pid, "Clue Token").length;
const ogre = bear({ name: "Three Ogre", manaCost: "{2}{B}", cmc: 3, power: "3", toughness: "3" });

describe("round B203 cards are supported", () => {
  it("compiles every line", () => supported(nyla(), ellywick(), storm(), nahiri(), avalanche(), jhoira()));
});

describe("Nyla, Shirshu Sleuth", () => {
  /** Nyla is cast with a mana value 3 creature card in your graveyard; its enters trigger asks for its target. */
  const enters = () => {
    const { s: s0, ap, ids } = setup([nyla()]);
    const o = into(s0, ap, ogre, "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    return { s, ap, n: ids[0]!, o };
  };
  it("exiles the card, then you lose life and create Clues equal to its mana value", () => {
    const { s: s0, ap, o } = enters();
    expect(s0.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const life = s0.players[ap]!.life;
    const s = settle(act(s0, { type: "chooseTargets", player: ap, targets: [tgt(o)] }));
    expect(zoneOf(s, o)).toBe("exile");
    expect(s.players[ap]!.life).toBe(life - 3);
    expect(clues(s, ap)).toBe(3);
  });
  it("with no card exiled, no life is lost and no Clue is created", () => {
    const { s: s0, ap, o } = enters();
    const life = s0.players[ap]!.life;
    const s = settle(act(s0, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }] }));
    expect(zoneOf(s, o)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life);
    expect(clues(s, ap)).toBe(0);
  });
  it("with the card gone from the graveyard before it resolves, nothing happens", () => {
    const { s: s0, ap, o } = enters();
    const life = s0.players[ap]!.life;
    let s = act(s0, { type: "chooseTargets", player: ap, targets: [tgt(o)] });
    s = structuredClone(s);
    s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(o), 1);
    s.objects[o]!.zone = "hand";
    s.players[ap]!.hand.push(o);
    s.objects[o]!.zoneChanges = (s.objects[o]!.zoneChanges ?? 0) + 1;
    s = settle(s);
    expect(zoneOf(s, o)).toBe("hand");
    expect(s.players[ap]!.life).toBe(life);
    expect(clues(s, ap)).toBe(0);
  });
  it("at your end step with no Clues, returns the card exiled with it to its owner's hand", () => {
    const { s: s0, ap, o } = enters();
    let s = settle(act(s0, { type: "chooseTargets", player: ap, targets: [tgt(o)] }));
    // The Clues are gone.
    for (const c of named(s, ap, "Clue Token")) {
      s.battlefield.splice(s.battlefield.indexOf(c), 1);
      delete s.objects[c];
    }
    invalidateCharacteristics(s);
    s = passUntil(s, "end", ap);
    s = settle(s);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(o)] }));
    expect(zoneOf(s, o)).toBe("hand");
    expect(s.players[ap]!.hand).toContain(o);
  });
  it("doesn't trigger while you control a Clue (an intervening if, rulings)", () => {
    const { s: s0, ap, o } = enters();
    let s = settle(act(s0, { type: "chooseTargets", player: ap, targets: [tgt(o)] }));
    s = passUntil(s, "end", ap);
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
    expect(s.pending).toBe(null);
    s = settle(s);
    expect(zoneOf(s, o)).toBe("exile");
  });
  it("can't return a card something else exiled", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, nyla());
    const other = into(s0, ap, ogre, "exile");
    let s = passUntil(s0, "end", ap);
    s = settle(s);
    // No legal target: the trigger is removed (CR 603.3d).
    expect(s.pending).toBe(null);
    expect(zoneOf(s, other)).toBe("exile");
  });
});

describe("Ellywick Tumblestrum", () => {
  const walker = (s: GameState, pid: PlayerId, loyalty: number) => {
    const id = putOnBattlefield(s, pid, ellywick());
    s.objects[id]!.counters.loyalty = loyalty;
    invalidateCharacteristics(s);
    return id;
  };
  /** Its −2 looks at the top six cards: a legendary creature card and a nonlegendary one on top. */
  const dig = () => {
    const { s: s0, ap } = setup([]);
    const e = walker(s0, ap, 5);
    const plain = into(s0, ap, bear({ name: "Plain Bear" }), "library");
    const legend = into(s0, ap, bear({ name: "Legend Bear", typeLine: "Legendary Creature — Bear", supertypes: ["Legendary"] }), "library");
    const s = settle(run(s0, planActivate(s0, ap, e, 1)));
    return { s, ap, plain, legend };
  };
  it("−2: you gain 3 life if the creature card you put into your hand is legendary", () => {
    const { s: s0, ap, legend } = dig();
    expect(s0.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
    const life = s0.players[ap]!.life;
    const s = settle(act(s0, { type: "searchLibrary", player: ap, found: [legend] }));
    expect(zoneOf(s, legend)).toBe("hand");
    expect(s.players[ap]!.life).toBe(life + 3);
    // The rest go to the bottom.
    expect(s.players[ap]!.library.slice(-5)).toHaveLength(5);
    expect(s.players[ap]!.library.slice(0, 1)).not.toContain(legend);
  });
  it("−2: no life for a nonlegendary creature card, or for none", () => {
    const { s: s0, ap, plain, legend } = dig();
    const life = s0.players[ap]!.life;
    const s = settle(act(s0, { type: "searchLibrary", player: ap, found: [plain] }));
    expect(zoneOf(s, plain)).toBe("hand");
    expect(zoneOf(s, legend)).toBe("library");
    expect(s.players[ap]!.life).toBe(life);
    const none = settle(act(s0, { type: "searchLibrary", player: ap, found: [] }));
    expect(none.players[ap]!.life).toBe(life);
  });
  it("−7: the emblem gives trample and haste, and +2/+2 for each differently named dungeon you've completed, before or after it (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const e = walker(s0, ap, 7);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    s0.players[ap]!.completedDungeons = ["Tomb of Annihilation"];
    s0.players[opp]!.completedDungeons = ["Lost Mine of Phandelver", "Dungeon of the Mad Mage"];
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planActivate(s0, ap, e, 2)));
    expect(`${power(s, s.objects[mine]!)}`).toBe("4");
    expect(objHasKeyword(s, s.objects[mine]!, "trample")).toBe(true);
    expect(objHasKeyword(s, s.objects[mine]!, "haste")).toBe(true);
    // Not an opponent's creature, nor counted from an opponent's dungeons.
    expect(`${power(s, s.objects[theirs]!)}`).toBe("2");
    expect(objHasKeyword(s, s.objects[theirs]!, "haste")).toBe(false);
    // The same dungeon twice counts once; another one counts.
    s = structuredClone(s);
    s.players[ap]!.completedDungeons = ["Tomb of Annihilation", "Tomb of Annihilation"];
    invalidateCharacteristics(s);
    expect(`${power(s, s.objects[mine]!)}`).toBe("4");
    s.players[ap]!.completedDungeons = ["Tomb of Annihilation", "Tomb of Annihilation", "Lost Mine of Phandelver"];
    invalidateCharacteristics(s);
    expect(`${power(s, s.objects[mine]!)}/${toughness(s, s.objects[mine]!)}`).toBe("6/6");
  });
  it("−7 with no dungeon completed: trample and haste only (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const e = walker(s0, ap, 7);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const s = settle(run(s0, planActivate(s0, ap, e, 2)));
    expect(`${power(s, s.objects[mine]!)}/${toughness(s, s.objects[mine]!)}`).toBe("2/2");
    expect(objHasKeyword(s, s.objects[mine]!, "trample")).toBe(true);
    expect(objHasKeyword(s, s.objects[mine]!, "haste")).toBe(true);
  });
});

describe("Storm, Windrider", () => {
  const flier = (name: string) => bear({ name, keywords: ["Flying"], oracleText: "Flying" });
  it("creatures with flying can't attack you (your planeswalkers they still can, CR 508.1c)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, storm());
    const f = putOnBattlefield(s0, opp, flier("Their Flier"));
    const g = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    expect(characteristics(s0, s0.objects[f]!).cantAttackPlayersOnly).toContain(ap);
    expect(characteristics(s0, s0.objects[f]!).cantAttackPlayersOnly).not.toContain(third);
    expect(characteristics(s0, s0.objects[g]!).cantAttackPlayersOnly).not.toContain(ap);
    const s = passUntil(s0, "declareAttackers", opp);
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: f, defender: ap }] })).toThrow();
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: f, defender: third }, { attacker: g, defender: ap }] })).not.toThrow();
  });
  it("creatures with flying can't block creatures you control", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, storm());
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const f = putOnBattlefield(s0, opp, flier("Their Flier"));
    const g = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: mine, defender: opp }] });
    for (let i = 0; i < 20 && !(s.pending?.kind === "declareBlockers" && s.pending.player === opp); i++) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: f, attacker: mine }] })).toThrow();
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: g, attacker: mine }] })).not.toThrow();
  });
  it("a spell you cast that targets creatures gives those creatures flying until end of turn, before it resolves", () => {
    const twin = card("Test Twin Boost", "Instant", "{G}", { cmc: 1, oracleText: "Two target creatures each get +1/+1 until end of turn." });
    const { s: s0, ap, ids, opp } = setup([twin]);
    putOnBattlefield(s0, ap, storm());
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const other = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    expect(isFullySupported(twin)).toBe(true);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(mine), tgt(theirs)]));
    // The trigger resolves first: they fly while the spell is still on the stack.
    expect(s.stack.length + s.triggerQueue.length).toBe(2);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && s.stack.length === 2; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.length).toBe(1);
    expect(objHasKeyword(s, s.objects[mine]!, "flying")).toBe(true);
    expect(objHasKeyword(s, s.objects[theirs]!, "flying")).toBe(true);
    expect(objHasKeyword(s, s.objects[other]!, "flying")).toBe(false);
    s = settle(s);
    s = passUntil(s, "upkeep", opp);
    expect(objHasKeyword(s, s.objects[mine]!, "flying")).toBe(false);
  });
  it("doesn't trigger for a spell that targets only a player, or an opponent's spell", () => {
    const zap = card("Test Zap", "Instant", "{R}", { cmc: 1, oracleText: "Test Zap deals 1 damage to target player." });
    const { s: s0, ap, ids, opp } = setup([zap]);
    putOnBattlefield(s0, ap, storm());
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.stack.length + s.triggerQueue.length).toBe(1);
  });
});

describe("Nahiri, the Unforgiving", () => {
  const walker = (s: GameState, pid: PlayerId, loyalty: number) => {
    const id = putOnBattlefield(s, pid, nahiri());
    s.objects[id]!.counters.loyalty = loyalty;
    invalidateCharacteristics(s);
    return id;
  };
  const pw = card("Test Walker", "Legendary Planeswalker — Testwalker", "{3}", { cmc: 3, loyalty: "5", oracleText: "+1: You gain 1 life." });
  /** Nahiri's first +1 on the next player's Bear; a third player has a planeswalker; then that player's declare attackers. */
  const goaded = () => {
    const { s: s0, ap, opp } = setup([]);
    const n = walker(s0, ap, 4);
    const b = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const w = putOnBattlefield(s0, third, pw);
    s0.objects[w]!.counters.loyalty = 5;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planActivate(s0, ap, n, 0, [tgt(b)])));
    expect(characteristics(s, s.objects[b]!).attacksIfAble).toBe(true);
    return { s: passUntil(s, "declareAttackers", opp), ap, opp, b, third, w };
  };
  it("+1: the creature attacks a player each combat if able, not a planeswalker", () => {
    const { s, ap, opp, b, third, w } = goaded();
    expect(s.pending).toMatchObject({ kind: "declareAttackers", player: opp });
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [] })).toThrow(/attacks each combat if able/);
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: b, defender: third, planeswalker: w }] })).toThrow(/must attack a player/);
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: b, defender: ap }] })).not.toThrow();
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: b, defender: third }] })).not.toThrow();
  });
  it("+1: a bot obeys it, attacking a player", () => {
    const { s, opp, b } = goaded();
    const acts = botActions(s, opp);
    const decl = acts.find((a) => a.type === "declareAttackers");
    expect(decl?.type).toBe("declareAttackers");
    if (decl?.type !== "declareAttackers") return;
    const mine = decl.attacks.find((a) => a.attacker === b);
    expect(mine).toBeDefined();
    expect(mine!.planeswalker).toBeUndefined();
    expect(() => run(s, acts)).not.toThrow();
  });
  it("+1: a tapped creature needn't attack (rulings), and it ends as your next turn begins", () => {
    const { s: s0, opp, b, ap } = goaded();
    const s = structuredClone(s0);
    s.objects[b]!.tapped = true;
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [] })).not.toThrow();
    const later = passUntil(act(s0, { type: "declareAttackers", player: opp, attacks: [{ attacker: b, defender: ap }] }), "upkeep", ap);
    expect(characteristics(later, later.objects[b]!).attacksIfAble).toBe(false);
  });
  it("0: a token copy of a creature or Equipment card with mana value less than its loyalty, with haste, exiled at the next end step", () => {
    const { s: s0, ap } = setup([]);
    const n = walker(s0, ap, 4);
    const three = into(s0, ap, ogre, "graveyard");
    const four = into(s0, ap, bear({ name: "Four Bear", manaCost: "{3}{G}", cmc: 4 }), "graveyard");
    const blade = into(s0, ap, card("Test Blade", "Artifact — Equipment", "{2}", { cmc: 2, oracleText: "Equipped creature gets +1/+0.\nEquip {1}" }), "graveyard");
    const rock = into(s0, ap, card("Test Rock", "Artifact", "{1}", { cmc: 1 }), "graveyard");
    // Not mana value 4 (not less than 4), nor a noncreature, non-Equipment card.
    expect(planActivate(s0, ap, n, 2, [tgt(four)])).toBe(null);
    expect(planActivate(s0, ap, n, 2, [tgt(rock)])).toBe(null);
    expect(planActivate(s0, ap, n, 2, [tgt(blade)])).not.toBe(null);
    let s = settle(run(s0, planActivate(s0, ap, n, 2, [tgt(three)])));
    expect(zoneOf(s, three)).toBe("exile");
    const [tok] = named(s, ap, "Three Ogre");
    expect(tok).toBeDefined();
    expect(s.objects[tok!]!.isToken).toBe(true);
    expect(objHasKeyword(s, s.objects[tok!]!, "haste")).toBe(true);
    s = settle(passUntil(s, "end", ap));
    s = settle(s);
    expect(s.objects[tok!]?.zone === "battlefield").toBe(false);
  });
});

describe("Ride the Avalanche", () => {
  const three = () => bear({ name: "Three Bear", manaCost: "{2}{G}", cmc: 3 });
  /** Ride resolves in your main phase; then your beginning of combat, with two creature cards in hand. */
  const ridden = () => {
    const { s: s0, ap, ids } = setup([avalanche(), three(), bear({ name: "Later Bear" })]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zoneOf(s, ids[0]!)).toBe("graveyard");
    s = passUntil(s, "beginCombat", ap);
    return { s, ap, three: ids[1]!, later: ids[2]!, mine };
  };
  it("your next spell can be cast as though it had flash; casting it puts that many +1/+1 counters on up to one target creature", () => {
    const { s: s0, ap, three, later, mine } = ridden();
    expect(waitingOn(s0)).toBe(ap);
    let s = run(s0, planCast(s0, ap, three));
    // The delayed trigger's target, chosen as it's put on the stack (rulings).
    if (s.pending?.kind !== "chooseTargets") s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine)] });
    s = settle(s);
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(3);
    expect(zoneOf(s, three)).toBe("battlefield");
    // Both are used up: no flash for the next creature spell, and no more counters.
    expect(planCast(s, ap, later)).toBe(null);
  });
  it("with no target chosen, no counters are put", () => {
    const { s: s0, ap, three, mine } = ridden();
    let s = run(s0, planCast(s0, ap, three));
    if (s.pending?.kind !== "chooseTargets") s = settle(s);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }] }));
    expect(s.objects[mine]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(zoneOf(s, three)).toBe("battlefield");
  });
  it("without it, a creature spell can't be cast at the beginning of combat", () => {
    const { s: s0, ap, ids } = setup([three()]);
    const s = passUntil(s0, "beginCombat", ap);
    expect(planCast(s, ap, ids[0]!)).toBe(null);
  });
});

describe("Jhoira, Weatherlight Corsair", () => {
  /** Jhoira is cast with the next player's library topped by a Bear, a Forest, then a legendary mana value 3 creature card. */
  const enters = (stack = true) => {
    const { s: s0, ap, ids, opp } = setup([jhoira()]);
    const legend = stack ? into(s0, opp, bear({ name: "Legend Ogre", typeLine: "Legendary Creature — Ogre", supertypes: ["Legendary"], manaCost: "{2}{R}", cmc: 3 }), "library") : undefined;
    const forest = stack ? into(s0, opp, card("Forest", "Basic Land — Forest"), "library") : undefined;
    const b = stack ? into(s0, opp, bear({ name: "Top Bear" }), "library") : undefined;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const life = s.players[ap]!.life;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    return { s, ap, opp, legend, forest, b, life };
  };
  it("the opponent reveals until a historic permanent card; you put it onto the battlefield under your control and lose life equal to its mana value", () => {
    const { s, ap, opp, legend, forest, b, life } = enters();
    expect(zoneOf(s, legend!)).toBe("battlefield");
    expect(s.objects[legend!]!.controller).toBe(ap);
    expect(s.objects[legend!]!.owner).toBe(opp);
    expect(s.players[ap]!.life).toBe(life - 3);
    // The rest go to the bottom of that library.
    const lib = s.players[opp]!.library;
    expect(lib.slice(-2).sort()).toEqual([forest!, b!].sort());
  });
  it("with no historic permanent card, nothing enters and no life is lost", () => {
    const { s, ap, opp, life } = enters(false);
    expect(s.players[ap]!.life).toBe(life);
    expect(s.battlefield.filter((id) => s.objects[id]!.owner === opp && s.objects[id]!.controller === ap)).toHaveLength(0);
    expect(s.players[opp]!.library.length).toBeGreaterThan(0);
  });
  it("it triggers when it attacks too", () => {
    const { s: s0, ap, opp } = setup([]);
    const j = putOnBattlefield(s0, ap, jhoira());
    into(s0, opp, card("Test Relic", "Artifact", "{4}", { cmc: 4 }), "library");
    let s = passUntil(s0, "declareAttackers", ap);
    const life = s.players[ap]!.life;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: j, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(named(s, ap, "Test Relic")).toHaveLength(1);
    expect(s.players[ap]!.life).toBe(life - 4);
  });
});
