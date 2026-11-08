// Round 301: harder cards from the "Out after round N" lists, most played first: "the next spell you cast this turn"
// permissions (an alternative cost, flash, can't be countered, an extra counter), and more.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { castProblem, spellCost, altCostsFor } from "../src/game";
import { putCounters, withPutter } from "../src/counters";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, objHasKeyword, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes priority only while something is on the stack or waiting to go there (no step is left). */
const drain = (s: GameState) => {
  for (let i = 0; i < 60 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const generic = (c: ReturnType<typeof spellCost>) => c.extra + c.cost.symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount : 0), 0);
/** A fresh copy of `def` in `pid`'s `where`. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const untappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")).length;

// Real oracle text (Scryfall).
const worldWarHulk = (): CardDef => ({"oracleId":"8c4da760-8913-46ca-b00c-bba6d877d482","name":"World War Hulk","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — The next red or green creature spell you cast this turn can be cast without paying its mana cost.\nII — Put three +1/+1 counters on target creature you control.\nIII — Choose target creature you control. Until end of turn, double its power and toughness and it gains trample.","colors":["G"],"colorIdentity":["G"],"keywords":["Double"],"imageUrl":"https://cards.scryfall.io/normal/front/9/0/9032f05b-5c21-4996-90c1-268dc6dffbaa.jpg?1784182994","artUrl":"https://cards.scryfall.io/art_crop/front/9/0/9032f05b-5c21-4996-90c1-268dc6dffbaa.jpg?1784182994","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"rare","layout":"saga","gameChanger":false} as CardDef);
const marshlandBloodcaster = (): CardDef => ({"oracleId":"5ecf35b1-0bfd-4c60-a791-5a3b918dd630","name":"Marshland Bloodcaster","manaCost":"{4}{B}","cmc":5,"typeLine":"Creature — Vampire Warlock","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Warlock"],"oracleText":"Flying\n{1}{B}, {T}: Rather than pay the mana cost of the next spell you cast this turn, you may pay life equal to that spell's mana value.","power":"3","toughness":"5","colors":["B"],"colorIdentity":["B"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/0/2/024ab7f9-1891-4c71-9fcf-cf124b1c6d10.jpg?1783927597","artUrl":"https://cards.scryfall.io/art_crop/front/0/2/024ab7f9-1891-4c71-9fcf-cf124b1c6d10.jpg?1783927597","commanderLegal":"legal","set":"c21","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const savageSummoning = (): CardDef => ({"oracleId":"30c09562-0bca-4382-ae84-aca00e0eb89b","name":"Savage Summoning","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"This spell can't be countered.\nThe next creature spell you cast this turn can be cast as though it had flash. That spell can't be countered. That creature enters with an additional +1/+1 counter on it.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/5/b5346ed7-2e17-4d8c-9c4b-b5efdd26380d.jpg?1783939900","artUrl":"https://cards.scryfall.io/art_crop/front/b/5/b5346ed7-2e17-4d8c-9c4b-b5efdd26380d.jpg?1783939900","commanderLegal":"legal","set":"m14","releasedAt":"2013-07-19","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const elminster = (): CardDef => ({"oracleId":"56773795-bd8b-4ac4-8f2c-a9d6275989bb","name":"Elminster","manaCost":"{3}{W}{U}","cmc":5,"typeLine":"Legendary Planeswalker — Elminster","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Elminster"],"oracleText":"Whenever you scry, the next instant or sorcery spell you cast this turn costs {X} less to cast, where X is the number of cards looked at while scrying this way.\n+2: Draw a card, then scry 2.\n−3: Exile the top card of your library. Create a number of 1/1 blue Faerie Dragon creature tokens with flying equal to that card's mana value.\nElminster can be your commander.","loyalty":"5","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/4/e/4eac2b49-6cb6-4ff4-8fac-2ba669326640.jpg?1783922693","artUrl":"https://cards.scryfall.io/art_crop/front/4/e/4eac2b49-6cb6-4ff4-8fac-2ba669326640.jpg?1783922693","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const kidLoki = (): CardDef => ({"oracleId":"19ef0329-08de-4835-8079-2e791e19f3a6","name":"Kid Loki","manaCost":"{U}","cmc":1,"typeLine":"Legendary Creature — God Hero Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["God","Hero","Villain"],"oracleText":"Each creature you control that you've put one or more +1/+1 counters on this turn has hexproof.\nWhenever you draw your second card each turn, put a +1/+1 counter on Kid Loki.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5c9ff69e-6489-49f3-b401-64856f0b7c11.jpg?1783902956","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5c9ff69e-6489-49f3-b401-64856f0b7c11.jpg?1783902956","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const tameshi = (): CardDef => ({"oracleId":"b47b3cfe-7005-4b33-9d41-83b60808e12b","name":"Tameshi, Reality Architect","manaCost":"{2}{U}","cmc":3,"typeLine":"Legendary Creature — Moonfolk Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Moonfolk","Wizard"],"oracleText":"Whenever one or more noncreature permanents are returned to hand, draw a card. This ability triggers only once each turn.\n{X}{W}, Return a land you control to its owner's hand: Return target artifact or enchantment card with mana value X or less from your graveyard to the battlefield. Activate only as a sorcery.","power":"2","toughness":"3","colors":["U"],"colorIdentity":["U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/6/26594b52-3e9c-4cde-88df-1f4e9e16676e.jpg?1783923894","artUrl":"https://cards.scryfall.io/art_crop/front/2/6/26594b52-3e9c-4cde-88df-1f4e9e16676e.jpg?1783923894","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const eldraziMimic = (): CardDef => ({"oracleId":"cddb3ec4-01a2-4f4d-a690-3486c73c3df8","name":"Eldrazi Mimic","manaCost":"{2}","cmc":2,"typeLine":"Creature — Eldrazi","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"Whenever another colorless creature you control enters, you may have this creature's base power and toughness become equal to that creature's power and toughness until end of turn.","power":"2","toughness":"1","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/1/311a05b1-042d-47e7-9fd7-6e8abe8fc578.jpg?1783937930","artUrl":"https://cards.scryfall.io/art_crop/front/3/1/311a05b1-042d-47e7-9fd7-6e8abe8fc578.jpg?1783937930","commanderLegal":"legal","set":"ogw","releasedAt":"2016-01-22","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const friendlyRivalry = (): CardDef => ({"oracleId":"e6850561-3c57-4354-8850-c467a6449563","name":"Friendly Rivalry","manaCost":"{R}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature you control and up to one other target legendary creature you control each deal damage equal to their power to target creature you don't control.","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24076763-88ba-4dee-b548-9c27bd34fdb7.jpg?1783916255","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24076763-88ba-4dee-b548-9c27bd34fdb7.jpg?1783916255","commanderLegal":"legal","set":"ltr","releasedAt":"2023-06-23","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const dakraMystic = (): CardDef => ({"oracleId":"63f05280-74de-4fe3-a507-07fb125685c0","name":"Dakra Mystic","manaCost":"{U}","cmc":1,"typeLine":"Creature — Merfolk Wizard","supertypes":[],"types":["Creature"],"subtypes":["Merfolk","Wizard"],"oracleText":"{U}, {T}: Each player reveals the top card of their library. You may put the revealed cards into their owners' graveyards. If you don't, each player draws a card.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8e5f71ca-e7d9-4f9a-adf1-40353693deea.jpg?1783939449","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8e5f71ca-e7d9-4f9a-adf1-40353693deea.jpg?1783939449","commanderLegal":"legal","set":"jou","releasedAt":"2014-05-02","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const grenzo = (): CardDef => ({"oracleId":"a374f99e-6443-486c-8026-8eba4c7e6ad7","name":"Grenzo, Dungeon Warden","manaCost":"{X}{B}{R}","cmc":2,"typeLine":"Legendary Creature — Goblin Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Goblin","Rogue"],"oracleText":"Grenzo enters with X +1/+1 counters on it.\n{2}: Put the bottom card of your library into your graveyard. If it's a creature card with power less than or equal to Grenzo's power, put it onto the battlefield.","power":"2","toughness":"2","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/43f09945-6098-4bc5-a9e7-03eb56b18030.jpg?1783913068","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/43f09945-6098-4bc5-a9e7-03eb56b18030.jpg?1783913068","commanderLegal":"legal","set":"sld","releasedAt":"2024-02-05","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const indulge = (): CardDef => ({"oracleId":"abcb5b99-bf5e-402f-97a2-abb1ab39dd72","name":"Indulge // Excess","manaCost":"{2}{R} // {1}{R}","cmc":5,"typeLine":"Sorcery // Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Whenever a creature you control attacks this turn, create a 1/1 green and white Citizen creature token that's tapped and attacking.","colors":["R"],"colorIdentity":["R"],"keywords":["Treasure","Aftermath"],"imageUrl":"https://cards.scryfall.io/normal/front/d/6/d653b755-1e09-45c4-8d44-8a950151ca51.jpg?1783923360","artUrl":"https://cards.scryfall.io/art_crop/front/d/6/d653b755-1e09-45c4-8d44-8a950151ca51.jpg?1783923360","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"split","gameChanger":false,"faces":[{"name":"Indulge","manaCost":"{2}{R}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Whenever a creature you control attacks this turn, create a 1/1 green and white Citizen creature token that's tapped and attacking.","colors":["R"]},{"name":"Excess","manaCost":"{1}{R}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Aftermath (Cast this spell only from your graveyard. Then exile it.)\nCreate a Treasure token for each creature you controlled that dealt combat damage to a player this turn.","colors":["R"]}]} as CardDef);

const opt = () => card("Test Opt", "Instant", "{U}", { oracleText: "Draw a card." });
const redBeast = () => card("Test Red Beast", "Creature — Beast", "{3}{R}", { power: "4", toughness: "4" });
const blueBeast = () => card("Test Blue Beast", "Creature — Beast", "{3}{U}", { power: "4", toughness: "4" });
const xSpell = () => card("Test X Burn", "Sorcery", "{X}{R}", { oracleText: "Test X Burn deals X damage to each opponent." });
const counterSpell = () => card("Test Cancel", "Instant", "{1}{U}{U}", { oracleText: "Counter target spell." });

describe("the next spell you cast this turn: an alternative cost (CR 118.9)", () => {
  it("Marshland Bloodcaster: the next spell for life equal to its mana value, only that one, X at 0", () => {
    supported(marshlandBloodcaster());
    const { s: s0, ap, ids } = setup([redBeast(), blueBeast(), xSpell()]);
    const [red, blue, xs] = ids as [string, string, string];
    const mb = putOnBattlefield(s0, ap, marshlandBloodcaster());
    // Not before the ability resolved.
    expect(altCostsFor(s0, ap, s0.objects[red]!).some((a) => a.kind === "nextLife")).toBe(false);
    let s = drain(run(s0, planActivate(s0, ap, mb, 0)));
    expect(altCostsFor(s, ap, s.objects[red]!).find((a) => a.kind === "nextLife")).toMatchObject({ costs: [{ kind: "payLife", n: 4 }] });
    // X is 0 when paying life rather than the mana cost (rulings, CR 107.3b).
    expect(castProblem(s, ap, xs, undefined, undefined, undefined, undefined, 3, { alt: "nextLife" })).toBeTruthy();
    const life = s.players[ap]!.life;
    const lands = untappedLands(s, ap);
    s = drain(run(s, planCast(s, ap, red, undefined, undefined, "auto", undefined, { alt: "nextLife" })));
    expect(s.objects[red]!.zone).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life - 4);
    expect(untappedLands(s, ap)).toBe(lands);
    // Used up: the spell after it pays its mana cost.
    expect(altCostsFor(s, ap, s.objects[blue]!).some((a) => a.kind === "nextLife")).toBe(false);
    expect(castProblem(s, ap, blue, undefined, undefined, undefined, undefined, undefined, { alt: "nextLife" })).toBeTruthy();
  });

  it("Marshland Bloodcaster: casting the next spell for its mana cost uses it up too (rulings)", () => {
    const { s: s0, ap, ids } = setup([opt(), redBeast()]);
    const [o, red] = ids as [string, string];
    const mb = putOnBattlefield(s0, ap, marshlandBloodcaster());
    let s = drain(run(s0, planActivate(s0, ap, mb, 0)));
    s = drain(run(s, planCast(s, ap, o)));
    expect(altCostsFor(s, ap, s.objects[red]!).some((a) => a.kind === "nextLife")).toBe(false);
  });

  it("World War Hulk: chapter I's next red or green creature spell for nothing, not a blue one; chapter II's counters", () => {
    supported(worldWarHulk());
    const { s: s0, ap, ids } = setup([worldWarHulk(), blueBeast(), redBeast()]);
    const [hulk, blue, red] = ids as [string, string, string];
    let s = drain(run(s0, planCast(s0, ap, hulk)));
    expect(s.objects[hulk]!.counters.lore).toBe(1);
    // A blue creature spell isn't the kind it names, so it isn't offered, and doesn't use it up.
    expect(altCostsFor(s, ap, s.objects[blue]!).some((a) => a.kind === "nextFree")).toBe(false);
    s = drain(run(s, planCast(s, ap, blue)));
    const lands = untappedLands(s, ap);
    expect(castProblem(s, ap, red, undefined, undefined, undefined, undefined, undefined, { alt: "nextFree" })).toBeNull();
    s = drain(run(s, planCast(s, ap, red, undefined, undefined, "auto", undefined, { alt: "nextFree" })));
    expect(s.objects[red]!.zone).toBe("battlefield");
    expect(untappedLands(s, ap)).toBe(lands);
    expect(s.nextCast ?? []).toEqual([]);
  });

  it("World War Hulk: chapter III doubles the target's power and toughness and gives it trample until end of turn", () => {
    const { s: s0, ap } = setup([]);
    const hulk = putOnBattlefield(s0, ap, worldWarHulk());
    s0.objects[hulk]!.counters.lore = 2;
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const next = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    let s = passUntil(s0, "main1", next);
    s = passUntil(s, "main1", ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = drain(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] }));
    expect(`${power(s, s.objects[b]!)}/${toughness(s, s.objects[b]!)}`).toBe("6/6");
    expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(true);
    expect(s.objects[hulk]!.zone).toBe("graveyard");
  });
});

describe("the bot and the next-spell alternative costs", () => {
  it("after World War Hulk's chapter I, the bot casts its red creature for nothing", () => {
    const { s: s0, ap, ids } = setup([worldWarHulk(), redBeast()]);
    const [hulk, red] = ids as [string, string];
    let s = drain(run(s0, planCast(s0, ap, hulk)));
    // No mana left for the Beast's own cost.
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")) s.objects[id]!.tapped = true;
    s.players[ap]!.hand = [red];
    const castIt = botActions(s, ap).find((a) => a.type === "castSpell" && a.objectId === red);
    expect(castIt).toMatchObject({ alt: "nextFree" });
  });
});

describe("Savage Summoning: flash, can't be countered and an extra counter for the next creature spell", () => {
  it("the next creature spell may be cast as though it had flash, can't be countered and enters with a +1/+1 counter", () => {
    supported(savageSummoning());
    const { s: s0, ap, ids, opp } = setup([savageSummoning(), opt(), bear(), bear({ name: "Test Second Bear" })]);
    const [ss, o, b1, b2] = ids as [string, string, string, string];
    let s = drain(run(s0, planCast(s0, ap, ss)));
    // With a spell on the stack, the bear can be cast as though it had flash.
    s = run(s, planCast(s, ap, o));
    expect(s.stack.length).toBe(1);
    expect(castProblem(s, ap, b1) ?? "").not.toMatch(/sorcery speed/);
    s = run(s, planCast(s, ap, b1));
    const item = s.stack.find((x) => x.objectId === b1)!;
    // Can't be countered: an opponent's counterspell does nothing to it (rulings: it can still be cast).
    const c = toZone(s, opp, counterSpell(), "hand");
    Object.assign(s.players[opp]!.manaPool, { U: 3 });
    s = act(s, { type: "passPriority", player: ap });
    s = run(s, planCast(s, opp, c, [{ kind: "stack", id: item.id }]));
    s = drain(s);
    expect(s.objects[b1]!.zone).toBe("battlefield");
    expect(s.objects[b1]!.counters["+1/+1"]).toBe(1);
    // Used up: the next one has neither.
    s = run(s, planCast(s, ap, toZone(s, ap, opt(), "hand")));
    expect(castProblem(s, ap, b2)).toMatch(/sorcery speed/);
  });

  it("two of them: one creature spell gets both counters (rulings), and it applies at normal timing too", () => {
    const { s: s0, ap, ids } = setup([savageSummoning(), savageSummoning(), bear()]);
    const [a, b, c] = ids as [string, string, string];
    let s = drain(run(s0, planCast(s0, ap, a)));
    s = drain(run(s, planCast(s, ap, b)));
    s = drain(run(s, planCast(s, ap, c)));
    expect(s.objects[c]!.counters["+1/+1"]).toBe(2);
  });
});

describe("Elminster: whenever you scry, the next instant or sorcery spell costs {X} less", () => {
  it("X is the number of cards looked at while scrying, for the next instant or sorcery spell only", () => {
    supported(elminster());
    const { s: s0, ap, ids } = setup([card("Test Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." }), card("Test Ponder", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." })]);
    const [d1, d2] = ids as [string, string];
    const el = putOnBattlefield(s0, ap, elminster());
    s0.objects[el]!.counters.loyalty = 5;
    let s = run(s0, planActivate(s0, ap, el, 0));
    s = drain(s);
    expect(s.pending).toMatchObject({ kind: "arrangeTop" });
    const pend = s.pending as Extract<GameState["pending"], { kind: "arrangeTop" }>;
    s = drain(act(s, { type: "arrangeTop", player: ap, top: pend.cards, away: [] }));
    expect(generic(spellCost(s, ap, s.objects[d1]!))).toBe(0);
    s = drain(run(s, planCast(s, ap, d1)));
    expect(generic(spellCost(s, ap, s.objects[d2]!))).toBe(2);
  });
});

describe("more cards back off the skip lists", () => {
  it("Kid Loki: hexproof for each creature you control that you put a +1/+1 counter on this turn, until the turn ends", () => {
    supported(kidLoki());
    const growth = () => card("Test Growth", "Instant", "{G}", { oracleText: "Put a +1/+1 counter on target creature." });
    const { s: s0, ap, ids, opp } = setup([growth(), growth()]);
    const [g1, g2] = ids as [string, string];
    putOnBattlefield(s0, ap, kidLoki());
    const mine = putOnBattlefield(s0, ap, bear());
    const other = putOnBattlefield(s0, ap, bear({ name: "Test Other Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Test Their Bear" }));
    let s = drain(run(s0, planCast(s0, ap, g1, [tgt(mine)])));
    s = drain(run(s, planCast(s, ap, g2, [tgt(theirs)])));
    expect(objHasKeyword(s, s.objects[mine]!, "Hexproof")).toBe(true);
    expect(objHasKeyword(s, s.objects[other]!, "Hexproof")).toBe(false);
    // Not a creature you control.
    expect(objHasKeyword(s, s.objects[theirs]!, "Hexproof")).toBe(false);
    // A counter an opponent put on your creature isn't one you put; one you put is.
    withPutter(opp, () => putCounters(s, s.objects[other]!, "+1/+1", 1));
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[other]!, "Hexproof")).toBe(false);
    withPutter(ap, () => putCounters(s, s.objects[other]!, "+1/+1", 1));
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[other]!, "Hexproof")).toBe(true);
    s = passUntil(s, "upkeep", opp);
    expect(objHasKeyword(s, s.objects[mine]!, "Hexproof")).toBe(false);
  });

  it("Tameshi: a card for the first noncreature permanent returned to hand each turn, not for creatures", () => {
    supported(tameshi());
    const bounce = () => card("Test Bounce", "Instant", "{U}", { oracleText: "Return target nonland permanent to its owner's hand." });
    const { s: s0, ap, ids, opp } = setup([bounce(), bounce(), bounce()]);
    const [b1, b2, b3] = ids as [string, string, string];
    putOnBattlefield(s0, ap, tameshi());
    const creature = putOnBattlefield(s0, opp, bear());
    const relic = putOnBattlefield(s0, opp, card("Test Relic", "Artifact", "{2}"));
    const charm = putOnBattlefield(s0, ap, card("Test Charm", "Enchantment", "{1}"));
    const hand = () => s.players[ap]!.hand.length;
    let s = drain(run(s0, planCast(s0, ap, b1, [tgt(creature)])));
    let before = hand();
    s = drain(run(s, planCast(s, ap, b2, [tgt(relic)])));
    // The bounce spell left the hand (-1), Tameshi drew one (+1).
    expect(hand()).toBe(before);
    before = hand();
    s = drain(run(s, planCast(s, ap, b3, [tgt(charm)])));
    // Only once each turn: the Charm came back (+1), the spell left (-1), no draw.
    expect(hand()).toBe(before);
  });

  it("Eldrazi Mimic: its base power and toughness become another colorless creature's until end of turn, if you want", () => {
    supported(eldraziMimic());
    const golem = () => card("Test Golem", "Artifact Creature — Golem", "{4}", { power: "4", toughness: "5" });
    const { s: s0, ap, ids } = setup([golem(), golem(), bear()]);
    const [g1, g2, b] = ids as [string, string, string];
    const mimic = putOnBattlefield(s0, ap, eldraziMimic());
    let s = drain(run(s0, planCast(s0, ap, b)));
    // A green creature isn't colorless: no trigger.
    expect(s.pending).toBeFalsy();
    s = drain(run(s, planCast(s, ap, g1)));
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    s = drain(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(`${power(s, s.objects[mimic]!)}/${toughness(s, s.objects[mimic]!)}`).toBe("4/5");
    // Counters still apply on top (rulings).
    s.objects[mimic]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    expect(`${power(s, s.objects[mimic]!)}/${toughness(s, s.objects[mimic]!)}`).toBe("5/6");
    s.objects[mimic]!.counters["+1/+1"] = 0;
    s = drain(run(s, planCast(s, ap, g2)));
    s = drain(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(`${power(s, s.objects[mimic]!)}/${toughness(s, s.objects[mimic]!)}`).toBe("4/5");
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "upkeep", opp);
    expect(`${power(s, s.objects[mimic]!)}/${toughness(s, s.objects[mimic]!)}`).toBe("2/1");
  });

  it("Friendly Rivalry: both creatures deal damage equal to their power; with no second target, just the first", () => {
    supported(friendlyRivalry());
    const legend = () => card("Test Legend", "Legendary Creature — Human", "{2}{R}", { power: "3", toughness: "3" });
    const wall = () => card("Test Wall", "Creature — Wall", "{4}", { power: "0", toughness: "9" });
    const { s: s0, ap, ids, opp } = setup([friendlyRivalry(), friendlyRivalry()]);
    const [f1, f2] = ids as [string, string];
    const b = putOnBattlefield(s0, ap, bear());
    const l = putOnBattlefield(s0, ap, legend());
    const w = putOnBattlefield(s0, opp, wall());
    const w2 = putOnBattlefield(s0, opp, wall());
    // The second target must be legendary, and other than the first.
    expect(castProblem(s0, ap, f1, [tgt(l), tgt(b), tgt(w)])).toBeTruthy();
    expect(castProblem(s0, ap, f1, [tgt(l), tgt(l), tgt(w)])).toBeTruthy();
    let s = drain(run(s0, planCast(s0, ap, f1, [tgt(b), tgt(l), tgt(w)])));
    expect(s.objects[w]!.damage).toBe(5);
    s = drain(run(s, planCast(s, ap, f2, [tgt(b), { kind: "none" }, tgt(w2)])));
    expect(s.objects[w2]!.damage).toBe(2);
  });

  it("Dakra Mystic: everyone reveals; mill those cards, or else each player draws", () => {
    supported(dakraMystic());
    const { s: s0, ap } = setup([]);
    const dm = putOnBattlefield(s0, ap, dakraMystic());
    const tops = s0.turnOrder.map((p) => s0.players[p]!.library[0]!);
    const yards = s0.turnOrder.map((p) => s0.players[p]!.graveyard.length);
    let s = drain(run(s0, planActivate(s0, ap, dm, 0)));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = drain(act(s, { type: "chooseMay", player: ap, yes: true }));
    s.turnOrder.forEach((p, i) => {
      expect(s.objects[tops[i]!]!.zone).toBe("graveyard");
      expect(s.players[p]!.graveyard.length).toBe(yards[i]! + 1);
    });
    // Next turn: no, and each player draws the revealed card (rulings).
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(passUntil(s, "main1", next), "main1", ap);
    const tops2 = s.turnOrder.map((p) => s.players[p]!.library[0]!);
    s = drain(run(s, planActivate(s, ap, dm, 0)));
    s = drain(act(s, { type: "chooseMay", player: ap, yes: false }));
    s.turnOrder.forEach((p, i) => expect(s.objects[tops2[i]!]!.zone, `player ${p}`).toBe("hand"));
  });

  it("Grenzo: the bottom card into your graveyard, and onto the battlefield if it's a creature with power no greater than Grenzo's", () => {
    supported(grenzo());
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, grenzo());
    s0.objects[g]!.counters["+1/+1"] = 1; // 3/3
    invalidateCharacteristics(s0);
    const small = putOnBattlefield(s0, ap, card("Test Small", "Creature — Goblin", "{2}", { power: "3", toughness: "1" }));
    const big = putOnBattlefield(s0, ap, card("Test Big", "Creature — Giant", "{5}", { power: "4", toughness: "4" }));
    for (const id of [small, big]) {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
    }
    s0.players[ap]!.library.push(big, small); // Small on the bottom, Big just above it
    invalidateCharacteristics(s0);
    let s = drain(run(s0, planActivate(s0, ap, g, 0)));
    expect(s.objects[small]!.zone).toBe("battlefield");
    s = drain(run(s, planActivate(s, ap, g, 0)));
    expect(s.objects[big]!.zone).toBe("graveyard");
  });

  it("Grenzo: a card a replacement exiles instead is still put onto the battlefield (rulings)", () => {
    const leyline = () => card("Leyline of the Void", "Enchantment", "{2}{B}{B}", { oracleText: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nIf a card would be put into an opponent's graveyard from anywhere, exile it instead." });
    supported(leyline());
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, grenzo());
    putOnBattlefield(s0, opp, leyline());
    const small = putOnBattlefield(s0, ap, card("Test Small", "Creature — Goblin", "{2}", { power: "2", toughness: "1" }));
    s0.battlefield.splice(s0.battlefield.indexOf(small), 1);
    s0.objects[small]!.zone = "library";
    s0.players[ap]!.library.push(small);
    invalidateCharacteristics(s0);
    const s = drain(run(s0, planActivate(s0, ap, g, 0)));
    expect(s.objects[small]!.zone).toBe("battlefield");
  });

  it("Excess: a Treasure for each creature you controlled that dealt combat damage to a player this turn", () => {
    supported(indulge());
    const { s: s0, ap, opp } = setup([]);
    const ex = toZone(s0, ap, indulge(), "graveyard");
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Second Bear" }));
    putOnBattlefield(s0, ap, bear({ name: "Test Home Bear" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: opp }] } as Action);
    s = passUntil(s, "main2", ap);
    const treasures = () => s.battlefield.filter((id) => /^Treasure/.test(s.cards[s.objects[id]!.cardId]!.name)).length;
    s = drain(run(s, planCast(s, ap, ex, undefined, undefined, "auto", undefined, { face: 1, via: "aftermath" })));
    expect(treasures()).toBe(2);
  });
});
