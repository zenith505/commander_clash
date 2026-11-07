// Round 298: harder cards from the "Out after round N" lists, most played first.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { mayPlayFromExile, spellCost } from "../src/game";
import { applyAction, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes priority until the stack and the trigger queue are empty or someone is asked something. */
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && !s.pending && (s.stack.length || s.triggerQueue.length || i === 0); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Passes priority only while something is on the stack or waiting to go there (no step is left). */
const drain = (s: GameState) => {
  for (let i = 0; i < 60 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** A fresh copy of `def` in `pid`'s `where` (the top of the library). */
const put = (s: GameState, pid: PlayerId, def: CardDef, where: "library" | "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const cast = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[]) => drain(run(s, planCast(s, pid, id, targets)));
const generic = (s: GameState, pid: PlayerId, id: string) => {
  const c = spellCost(s, pid, s.objects[id]!);
  return c.extra + c.cost.symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount : 0), 0);
};
/** Answers each "exile a card from your hand" with the first card of `pick` still in that player's hand, until none is asked. */
const answerExiles = (s: GameState, pick: Record<number, string>) => {
  for (let i = 0; i < 6 && s.pending?.kind === "discard"; i++) s = act(s, { type: "discard", player: s.pending.player, objectIds: [pick[s.pending.player]!] });
  return drain(s);
};
const kill = card("Test Kill", "Instant", "{0}", { oracleText: "Destroy target creature." });

// Real oracle text (Scryfall).
const intellectDevourer = (): CardDef => ({"oracleId":"a06fa827-900b-46d4-8f48-b4e15964951a","name":"Intellect Devourer","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Horror","supertypes":[],"types":["Creature"],"subtypes":["Horror"],"oracleText":"Devour Intellect — When this creature enters, each opponent exiles a card from their hand until this creature leaves the battlefield.\nBody Thief — You may play lands and cast spells from among cards exiled with this creature. If you cast a spell this way, you may spend mana as though it were mana of any color to cast it.","power":"2","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Devour Intellect","Body Thief"],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73342536-fd44-4958-b77e-56eec222252e.jpg?1783922560","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73342536-fd44-4958-b77e-56eec222252e.jpg?1783922560","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const lightstallInquisitor = (): CardDef => ({"oracleId":"57012049-06d7-4354-8125-9ea9e742f14d","name":"Lightstall Inquisitor","manaCost":"{W}","cmc":1,"typeLine":"Creature — Angel Wizard","supertypes":[],"types":["Creature"],"subtypes":["Angel","Wizard"],"oracleText":"Vigilance\nWhen this creature enters, each opponent exiles a card from their hand and may play that card for as long as it remains exiled. Each spell cast this way costs {1} more to cast. Each land played this way enters tapped.","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/6/3/635245e9-c27f-4a51-a6f1-bae62e696542.jpg?1783905994","artUrl":"https://cards.scryfall.io/art_crop/front/6/3/635245e9-c27f-4a51-a6f1-bae62e696542.jpg?1783905994","commanderLegal":"legal","set":"eoe","releasedAt":"2025-08-01","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const weRideAtDawn = (): CardDef => ({"oracleId":"5675ac63-b69b-41b9-a7ed-4085a4e431b2","name":"We Ride at Dawn","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Legendary creature spells you cast have convoke. (Your creatures can help cast those spells. Each creature you tap while casting a legendary creature spell pays for {1} or one mana of that creature's color.)\nWhenever your commander attacks, create a 1/1 red Mercenary creature token with \"{T}: Target creature you control gets +1/+0 until end of turn. Activate only as a sorcery.\"","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd95daa3-c1f6-4f4c-8dde-ad5a50bfea00.jpg?1783911970","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd95daa3-c1f6-4f4c-8dde-ad5a50bfea00.jpg?1783911970","commanderLegal":"legal","set":"otc","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const theTwelfthDoctor = (): CardDef => ({"oracleId":"9ecf19ba-754e-4bb3-b526-fe9df87a0f08","name":"The Twelfth Doctor","manaCost":"{3}{U}{R}","cmc":5,"typeLine":"Legendary Creature — Time Lord Doctor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Time Lord","Doctor"],"oracleText":"The first spell you cast from anywhere other than your hand each turn has demonstrate. (When you cast that spell, you may copy it. If you do, choose an opponent to also copy it. A copy of a permanent spell becomes a token.)\nWhenever you copy a spell, put a +1/+1 counter on The Twelfth Doctor.","power":"4","toughness":"4","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/2400d681-05ef-43b1-b720-c15ca4226c27.jpg?1783914621","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/2400d681-05ef-43b1-b720-c15ca4226c27.jpg?1783914621","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const dauntlessBodyguard = (): CardDef => ({"oracleId":"70973a2d-66e6-4662-ab10-99678775dda1","name":"Dauntless Bodyguard","manaCost":"{W}","cmc":1,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"As this creature enters, choose another creature you control.\nSacrifice this creature: The chosen creature gains indestructible until end of turn.","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/3/a3f82012-5c33-47bc-a3c8-56ae2eea1fb9.jpg?1783935048","artUrl":"https://cards.scryfall.io/art_crop/front/a/3/a3f82012-5c33-47bc-a3c8-56ae2eea1fb9.jpg?1783935048","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const tyrannicalPitlord = (): CardDef => ({"oracleId":"776ea0c7-fc5b-44b4-9302-5a3514ff843b","name":"Tyrannical Pitlord","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Creature — Demon","supertypes":[],"types":["Creature"],"subtypes":["Demon"],"oracleText":"Flying, trample\nAs this creature enters, choose another creature you control.\nThe chosen creature gets +3/+3 and has flying.\nWhen this creature leaves the battlefield, sacrifice the chosen creature.","power":"6","toughness":"6","colors":["B"],"colorIdentity":["B"],"keywords":["Flying","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/0/2/027ef1fc-4a7a-465c-9c25-dc19c771b5f5.jpg?1783921246","artUrl":"https://cards.scryfall.io/art_crop/front/0/2/027ef1fc-4a7a-465c-9c25-dc19c771b5f5.jpg?1783921246","commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const sentinelTower = (): CardDef => ({"oracleId":"49b86b51-e1ef-4e27-84d2-66166481e0a5","name":"Sentinel Tower","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever an instant or sorcery spell is cast during your turn, this artifact deals damage to any target equal to 1 plus the number of instant and sorcery spells cast before that spell this turn.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/5/25d9500e-a536-4f8e-bfdd-6cb08f709890.jpg?1783934852","artUrl":"https://cards.scryfall.io/art_crop/front/2/5/25d9500e-a536-4f8e-bfdd-6cb08f709890.jpg?1783934852","commanderLegal":"legal","set":"bbd","releasedAt":"2018-06-08","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const squeeSRevenge = (): CardDef => ({"oracleId":"3c9f3f26-339e-459e-9847-4e33aafb6f9b","name":"Squee's Revenge","manaCost":"{1}{U}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose a number. Flip a coin that many times or until you lose a flip, whichever comes first. If you win all the flips, draw two cards for each flip.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/b/2b391ee3-c1cd-47bc-9540-977cbc32913e.jpg?1783945330","artUrl":"https://cards.scryfall.io/art_crop/front/2/b/2b391ee3-c1cd-47bc-9540-977cbc32913e.jpg?1783945330","commanderLegal":"legal","set":"apc","releasedAt":"2001-06-04","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const gameOfChaos = (): CardDef => ({"oracleId":"b6756608-a618-4e26-a090-ea8fc992def1","name":"Game of Chaos","manaCost":"{R}{R}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Flip a coin. If you win the flip, you gain 1 life and target opponent loses 1 life, and you decide whether to flip again. If you lose the flip, you lose 1 life and that opponent gains 1 life, and that player decides whether to flip again. Double the life stakes with each flip.","colors":["R"],"colorIdentity":["R"],"keywords":["Double"],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08265332-2c0e-4c42-8c51-83ac20462eed.jpg?1783947490","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08265332-2c0e-4c42-8c51-83ac20462eed.jpg?1783947490","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

describe("Intellect Devourer: each opponent exiles a card from their hand until it leaves; you may play those cards with mana of any color", () => {
  it("each opponent chooses their own card; you may cast one paying red for green; when it leaves, the cards still exiled go back to their owners' hands", () => {
    supported(intellectDevourer());
    const { s: s0, ap, ids } = setup([intellectDevourer(), kill]);
    const opps = [1, 2, 3].map((i) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + i) % 4]!);
    const picks: Record<number, string> = {};
    for (const p of opps) picks[p] = put(s0, p, card(`Test Green Bear ${p}`, "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }), "hand");
    let s = cast(s0, ap, ids[0]!);
    // Each opponent in turn order chooses (CR 701.9b).
    expect(s.pending).toMatchObject({ kind: "discard", player: opps[0], exile: true });
    s = answerExiles(s, picks);
    for (const p of opps) expect(zone(s, picks[p]!)).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[picks[opps[0]!]!]!, ap)).toBe(true);
    // An opponent can't play their own card back.
    expect(mayPlayFromExile(s, s.objects[picks[opps[0]!]!]!, opps[0]!)).toBe(false);
    // No untapped lands, two red mana: red pays the {G} (CR 609.4b).
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = true;
    s.players[ap]!.manaPool.R = 2;
    s = cast(s, ap, picks[opps[0]!]!);
    expect(zone(s, picks[opps[0]!]!)).toBe("battlefield");
    expect(s.objects[picks[opps[0]!]!]!.controller).toBe(ap);
    // It leaves: the two cards still exiled return to their owners' hands (CR 610.3); the one cast stays where it is.
    const dev = ids[0]!;
    s = cast(s, ap, ids[1]!, [tgt(dev)]);
    expect(zone(s, dev)).toBe("graveyard");
    expect(zone(s, picks[opps[1]!]!)).toBe("hand");
    expect(s.players[opps[1]!]!.hand).toContain(picks[opps[1]!]!);
    expect(zone(s, picks[opps[2]!]!)).toBe("hand");
    expect(zone(s, picks[opps[0]!]!)).toBe("battlefield");
  });

  it("if it has left the battlefield before its ability resolves, nothing is exiled (rulings)", () => {
    const { s: s0, ap, ids } = setup([intellectDevourer(), kill]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // Resolve the creature spell only, then destroy it in response to its trigger.
    for (let i = 0; i < 8 && !s.triggerQueue.length && !s.stack.some((x) => x.kind === "ability"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(zone(s, ids[0]!)).toBe("battlefield");
    s = cast(s, ap, ids[1]!, [tgt(ids[0]!)]);
    expect(s.pending?.kind).not.toBe("discard");
    expect(s.log.some((l) => /Intellect Devourer has left the battlefield, so nothing is exiled/.test(l.text))).toBe(true);
  });
});

describe("Lightstall Inquisitor: each opponent exiles a card from their hand and may play it, a spell for {1} more, a land tapped", () => {
  it("the owner may play their own exiled card: a spell costs {1} more, a land played this way enters tapped", () => {
    supported(lightstallInquisitor());
    const { s: s0, ap, ids } = setup([lightstallInquisitor()]);
    const opps = [1, 2, 3].map((i) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + i) % 4]!);
    const opp = opps[0]!;
    const land = put(s0, opp, card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." }), "hand");
    const bear2 = put(s0, opps[1]!, card("Test Exiled Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }), "hand");
    let s = cast(s0, ap, ids[0]!);
    s = answerExiles(s, { [opp]: land, [opps[1]!]: bear2, [opps[2]!]: s0.players[opps[2]!]!.hand[0]! });
    expect(zone(s, land)).toBe("exile");
    expect(zone(s, bear2)).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[land]!, opp)).toBe(true);
    expect(mayPlayFromExile(s, s.objects[land]!, ap)).toBe(false);
    // {1}{G} plus {1}.
    expect(generic(s, opps[1]!, bear2)).toBe(2);
    s = passUntil(s, "main1", opp);
    s = act(s, { type: "playLand", player: opp, objectId: land });
    expect(zone(s, land)).toBe("battlefield");
    expect(s.objects[land]!.tapped).toBe(true);
  });
});

describe("We Ride at Dawn: legendary creature spells you cast have convoke", () => {
  it("a legendary creature spell is paid for by tapping creatures; a nonlegendary one isn't (CR 702.51a)", () => {
    supported(weRideAtDawn());
    const legend = card("Test Legend", "Legendary Creature — Elf", "{2}{G}", { power: "3", toughness: "3" });
    const plain = card("Test Plain Elf", "Creature — Elf", "{2}{G}", { power: "3", toughness: "3" });
    const { s: s0, ap, ids } = setup([legend, plain]);
    putOnBattlefield(s0, ap, weRideAtDawn());
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap) s0.objects[id]!.tapped = true;
    const helpers = [0, 1, 2].map((i) => putOnBattlefield(s0, ap, card("Test Green Helper " + i, "Creature — Elf", "{G}", { power: "1", toughness: "1", colors: ["G"] })));
    expect(() => act(s0, { type: "castSpell", player: ap, objectId: ids[1]!, convoke: helpers })).toThrow(/doesn't have convoke/);
    let s = act(s0, { type: "castSpell", player: ap, objectId: ids[0]!, convoke: helpers });
    s = drain(s);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    for (const h of helpers) expect(s.objects[h]!.tapped).toBe(true);
  });
});

describe("The Twelfth Doctor: the first spell you cast from anywhere other than your hand each turn has demonstrate", () => {
  const flash = card("Test Flashback Draw", "Sorcery", "{0}", { oracleText: "Draw a card.\nFlashback {0}", keywords: ["Flashback"] });
  const demonstrates = (s: GameState) => s.stack.filter((x) => x.kind === "ability" && /Demonstrate/.test(JSON.stringify(x))).length;
  it("a spell from the hand doesn't use it up; the first flashback spell demonstrates and the copies count for its counter ability; the second doesn't", () => {
    supported(theTwelfthDoctor());
    const { s: s0, ap, ids } = setup([card("Test Hand Draw", "Sorcery", "{0}", { oracleText: "Draw a card." })]);
    const doc = putOnBattlefield(s0, ap, theTwelfthDoctor());
    const f1 = put(s0, ap, flash, "graveyard");
    const f2 = put(s0, ap, { ...flash, oracleId: "test-flash-2", name: "Test Flashback Draw Two" }, "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(demonstrates(s)).toBe(0);
    s = drain(s);
    s = run(s, planCast(s, ap, f1, undefined, undefined, undefined, undefined, { via: "flashback" }));
    expect(demonstrates(s)).toBe(1);
    s = drain(s);
    // Copy it (yes), then choose the opponent who also copies it.
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "demonstrate" });
    s = act(s, { type: "chooseOption", player: ap, choice: (s.pending as { options: string[] }).options[0]! });
    s = drain(s);
    expect(s.objects[doc]!.counters["+1/+1"]).toBe(1);
    s = run(s, planCast(s, ap, f2, undefined, undefined, undefined, undefined, { via: "flashback" }));
    expect(demonstrates(s)).toBe(0);
  });
});

describe("Dauntless Bodyguard and Tyrannical Pitlord: as it enters, choose another creature you control", () => {
  const pend = (s: GameState) => s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
  it("Bodyguard: the creature chosen as it enters gains indestructible when it's sacrificed; another creature doesn't", () => {
    supported(dauntlessBodyguard());
    const { s: s0, ap, ids } = setup([dauntlessBodyguard(), kill, kill]);
    const guarded = putOnBattlefield(s0, ap, card("Test Guarded Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const other = putOnBattlefield(s0, ap, card("Test Other Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = drain(s);
    // Chosen as it enters (CR 614.12), from the creatures already there.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "chosenObject", player: ap });
    expect([...pend(s).options].sort()).toEqual([guarded, other].sort());
    s = drain(act(s, { type: "chooseOption", player: ap, choice: guarded }));
    expect(s.objects[ids[0]!]!.chosen?.object?.id).toBe(guarded);
    s = run(s, planActivate(s, ap, ids[0]!, 0));
    s = drain(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    s = cast(s, ap, ids[1]!, [tgt(guarded)]);
    expect(zone(s, guarded)).toBe("battlefield");
    s = cast(s, ap, ids[2]!, [tgt(other)]);
    expect(zone(s, other)).toBe("graveyard");
  });

  it("Bodyguard with no other creature: nothing is asked, and its ability does nothing", () => {
    const { s: s0, ap, ids } = setup([dauntlessBodyguard()]);
    let s = drain(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeFalsy();
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.chosen?.object).toBeUndefined();
  });

  it("Pitlord: the chosen creature gets +3/+3 and flying while it's there; when Pitlord leaves, the chosen creature is sacrificed", () => {
    supported(tyrannicalPitlord());
    const { s: s0, ap, ids } = setup([tyrannicalPitlord(), kill]);
    s0.players[ap]!.manaPool.B = 3;
    const chosen = putOnBattlefield(s0, ap, card("Test Pit Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const bystander = putOnBattlefield(s0, ap, card("Test Bystander", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    let s = drain(run(s0, planCast(s0, ap, ids[0]!)));
    s = drain(act(s, { type: "chooseOption", player: ap, choice: chosen }));
    expect(pt(s, chosen)).toBe("5/5");
    expect(characteristics(s, s.objects[chosen]!).keywords).toContain("Flying");
    expect(pt(s, bystander)).toBe("2/2");
    s = cast(s, ap, ids[1]!, [tgt(ids[0]!)]);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, chosen)).toBe("graveyard");
    expect(zone(s, bystander)).toBe("battlefield");
  });
});

describe("Sentinel Tower: an instant or sorcery cast during your turn deals 1 plus the number of instants and sorceries cast before it", () => {
  const instant = (n: number) => card("Test Instant " + n, "Instant", "{0}", { oracleText: "You gain 1 life." });
  /** Answers the trigger's target with that player. */
  const aim = (s: GameState, ap: PlayerId, whom: PlayerId) => {
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    return act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: whom }] });
  };
  it("the first deals 1, the second 2; a spell cast in response to the second trigger doesn't add to it, but its own trigger counts both", () => {
    supported(sentinelTower());
    const { s: s0, ap, ids, opp } = setup([instant(1), instant(2), instant(3)]);
    putOnBattlefield(s0, ap, sentinelTower());
    const life = s0.players[opp]!.life;
    let s = aim(run(s0, planCast(s0, ap, ids[0]!)), ap, opp);
    s = drain(s);
    expect(s.players[opp]!.life).toBe(life - 1);
    s = aim(run(s, planCast(s, ap, ids[1]!)), ap, opp);
    // In response to the second trigger, a third instant: its trigger deals 3 (two cast before it), the second still 2.
    s = aim(run(s, planCast(s, ap, ids[2]!)), ap, opp);
    s = drain(s);
    expect(s.players[opp]!.life).toBe(life - 1 - 3 - 2);
  });

  it("doesn't trigger during another player's turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, sentinelTower());
    let s = passUntil(s0, "main1", opp);
    const id = put(s, opp, instant(4), "hand");
    s = run(s, planCast(s, opp, id));
    expect(s.pending?.kind).not.toBe("chooseTargets");
    expect(s.triggerQueue.length + s.stack.filter((x) => x.kind === "ability").length).toBe(0);
  });
});

describe("Squee's Revenge: choose a number, flip that many coins or until a flip is lost; winning them all draws two cards a flip", () => {
  it("over several seeds: three flips won draw six cards; a lost flip ends the run and draws nothing", () => {
    supported(squeeSRevenge());
    let wonAll = 0;
    let lost = 0;
    for (let seed = 1; seed <= 60 && (!wonAll || !lost); seed++) {
      const { s: s0, ap, ids } = setup([squeeSRevenge()], seed);
      let s = run(s0, planCast(s0, ap, ids[0]!));
      s = drain(s);
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "number", player: ap, numberRange: { min: 0, max: 100 } });
      const hand = s.players[ap]!.hand.length;
      s = drain(act(s, { type: "chooseOption", player: ap, choice: "3" }));
      const flips = s.log.filter((l) => /flips up to 3 coins for Squee's Revenge until losing a flip/.test(l.text));
      expect(flips).toHaveLength(1);
      if (/\(all of them\)/.test(flips[0]!.text)) {
        wonAll++;
        expect(flips[0]!.text).toMatch(/3 won/);
        expect(s.players[ap]!.hand.length).toBe(hand + 6);
      } else {
        lost++;
        expect(s.players[ap]!.hand.length).toBe(hand);
      }
    }
    expect(lost).toBeGreaterThan(0);
    expect(wonAll).toBeGreaterThan(0);
  });
});

describe("Game of Chaos: flip, the winner gains and the loser loses the stakes, the winner decides whether to flip again for double", () => {
  it("each flip moves the stakes between you and the target opponent; the winner is asked; stopping ends it", () => {
    supported(gameOfChaos());
    const { s: s0, ap, ids, opp } = setup([gameOfChaos()]);
    const start = { me: s0.players[ap]!.life, them: s0.players[opp]!.life };
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = drain(s);
    const net = () => s.players[ap]!.life - start.me;
    // First flip: 1 life each way, the winner asked.
    expect(s.pending).toMatchObject({ kind: "chooseMay", chaosAgain: { stake: 2 } });
    expect(Math.abs(net())).toBe(1);
    expect(s.players[opp]!.life - start.them).toBe(-net());
    expect((s.pending as { player: PlayerId }).player).toBe(net() > 0 ? ap : opp);
    // Again: the second flip is for 2.
    s = drain(act(s, { type: "chooseMay", player: (s.pending as { player: PlayerId }).player, yes: true }));
    expect([3, 1, -1, -3]).toContain(net());
    expect(s.players[opp]!.life - start.them).toBe(-net());
    expect(s.pending).toMatchObject({ kind: "chooseMay", chaosAgain: { stake: 4 } });
    s = drain(act(s, { type: "chooseMay", player: (s.pending as { player: PlayerId }).player, yes: false }));
    expect(s.pending).toBeFalsy();
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});
