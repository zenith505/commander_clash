// Round 356 (Lane A): a hideaway card cast for free that sends its Vehicle home (Smuggler's Buggy), a once-a-turn historic
// land or spell from the top of the library that makes a Food (The Fourth Doctor), an opponent's card cast free below
// your artifact count or else cast this turn (Rashmi and Ragavan), an opponent's cards exiled until a creature, instant
// or sorcery card, cast free with haste and a sacrifice for a creature (Strago and Relm), and a random opponent's top card
// played this turn, its owner losing life as it's cast (The Ruinous Powers), and a top card exiled at upkeep, cast from
// exile once you've cast another spell that turn (Monk Class, level 3).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, characteristics, botActions, isFullySupported, mayPlayFromExile, mayPlayFromTop, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions are answered as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const nameOf = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
const named = (s: GameState, name: string, zone = "battlefield") => Object.values(s.objects).filter((o) => o.zone === zone && (s.cards[o.cardId]!.name === name || s.cards[o.cardId]!.name === `${name} Token`)).map((o) => o.id);
const moveTo = (zone: "graveyard" | "hand" | "library") => (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
const toHand = moveTo("hand");
const onTop = moveTo("library");

// Real oracle text (Scryfall).
const buggy = (): CardDef => ({"oracleId":"e19e1e83-75e5-4cfa-8d50-8ed0b027a202","name":"Smuggler's Buggy","manaCost":"{4}","cmc":4,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Hideaway 4 (When this artifact enters, look at the top four cards of your library, exile one face down, then put the rest on the bottom in a random order.)\nWhenever this Vehicle deals combat damage to a player, you may cast the exiled card without paying its mana cost. If you do, return this Vehicle to its owner's hand.\nCrew 2","power":"5","toughness":"5","colors":[],"colorIdentity":[],"keywords":["Crew","Hideaway"],"commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const doctor = (): CardDef => ({"oracleId":"c19fdee3-5fbc-4e2d-ac23-85b46eacafdc","name":"The Fourth Doctor","manaCost":"{2}{G}{U}","cmc":4,"typeLine":"Legendary Creature — Time Lord Doctor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Time Lord","Doctor"],"oracleText":"You may look at the top card of your library any time.\nWould You Like A...? — Once each turn, you may play a historic land or cast a historic spell from the top of your library. When you do, create a Food token. (Artifacts, legendaries, and Sagas are historic.)","power":"4","toughness":"4","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Food"],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const rashmi = (): CardDef => ({"oracleId":"bdef246c-cf66-40a1-aae4-a591846e73ca","name":"Rashmi and Ragavan","manaCost":"{1}{G}{U}{R}","cmc":4,"typeLine":"Legendary Creature — Elf Monkey","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Monkey"],"oracleText":"Whenever you cast your first spell during each of your turns, exile the top card of target opponent's library and create a Treasure token. Then you may cast the exiled card without paying its mana cost if it's a spell with mana value less than the number of artifacts you control. If you don't cast it this way, you may cast it this turn.","power":"2","toughness":"4","colors":["G","R","U"],"colorIdentity":["G","R","U"],"keywords":["Treasure"],"commanderLegal":"legal","set":"moc","releasedAt":"2023-04-21","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const ruinous = (): CardDef => ({"oracleId":"283054ed-5fbd-4202-bc02-294079aaff03","name":"The Ruinous Powers","manaCost":"{2}{B}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, choose an opponent at random. Exile the top card of that player's library. Until end of turn, you may play that card and you may spend mana as though it were mana of any color to cast it. When you cast a spell this way, its owner loses life equal to its mana value.","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const strago = (): CardDef => ({"oracleId":"316e7c28-2b7a-40ae-961b-909644109fe4","name":"Strago and Relm","manaCost":"{2}{R}","cmc":3,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Sketch and Lore — {2}{R}, {T}: Target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card. You may cast that card without paying its mana cost. If you cast a creature spell this way, it gains haste and \"At the beginning of the end step, sacrifice this creature.\" Activate only as a sorcery.","power":"1","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Sketch and Lore"],"commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ruins = (): CardDef => ({"oracleId":"a3da7d5b-2c2b-45fe-b9c5-413b8c8fc0a2","name":"Academy Ruins","manaCost":"","cmc":0,"typeLine":"Legendary Land","supertypes":["Legendary"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}{U}, {T}: Put target artifact card from your graveyard on top of your library.","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"drc","releasedAt":"2025-02-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const monk = (): CardDef => ({"oracleId":"65b28ec7-1099-4f9d-8d57-2ffd8a5b0e91","name":"Monk Class","manaCost":"{W}{U}","cmc":2,"typeLine":"Enchantment — Class","supertypes":[],"types":["Enchantment"],"subtypes":["Class"],"oracleText":"(Gain the next level as a sorcery to add its ability.)\nThe second spell you cast each turn costs {1} less to cast.\n{W}{U}: Level 2\nWhen this Class becomes level 2, return up to one target nonland permanent to its owner's hand.\n{1}{W}{U}: Level 3\nAt the beginning of your upkeep, exile the top card of your library. For as long as it remains exiled, it has \"You may cast this card from exile as long as you've cast another spell this turn.\"","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"rare","layout":"class","gameChanger":false}) as CardDef;

describe("round 356: compiles", () => {
  it("every card of the round", () => supported(buggy(), doctor(), rashmi(), ruinous(), strago(), monk()));
});

describe("Smuggler's Buggy", () => {
  /** Buggy cast, its hideaway exiling `hidden` (put on top first), then crewed by Hill Giant and attacking an opponent. */
  const attacking = (hidden: CardDef) => {
    const { s: s0, ap, ids, opp } = setup([buggy()]);
    const card = onTop(s0, ap, hidden);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [card] }), ap);
    expect(s.objects[card]!.zone).toBe("exile");
    const car = ids[0]!;
    s.objects[car]!.controlledSinceTurn = -1; // as if it had been there since the turn began
    const giantId = putOnBattlefield(s, ap, giant());
    const crew = abilitiesOf(s, s.objects[car]!).activated.findIndex((a) => a.crew !== undefined);
    s = settle(run(s, planActivate(s, ap, car, crew, [], undefined, [giantId])), ap);
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: car, defender: opp }] });
    return { s, ap, opp, car, card };
  };
  const toDamage = (s: GameState, ap: PlayerId) => {
    for (let i = 0; i < 40 && !(s.pending?.kind === "castFree" && s.pending.player === ap) && s.step !== "end"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p && p.player !== ap) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };

  it("combat damage to a player: you may cast the hidden card free; if you do, the Buggy returns to its owner's hand", () => {
    const { s: s0, ap, opp, car, card } = attacking(divination());
    const life = s0.players[opp]!.life;
    let s = toDamage(s0, ap);
    expect(s.players[opp]!.life).toBe(life - 5);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: card });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: card }), ap);
    expect(s.objects[car]!.zone).toBe("hand");
    expect(s.objects[card]!.zone).toBe("graveyard");
  });

  it("declined: the card stays hidden and the Buggy stays", () => {
    const { s: s0, ap, car, card } = attacking(divination());
    let s = toDamage(s0, ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.objects[car]!.zone).toBe("battlefield");
    expect(s.objects[card]!.zone).toBe("exile");
  });

  it("a hidden land can't be cast: nothing happens", () => {
    const { s: s0, ap, car, card } = attacking(ruins());
    const s = toDamage(s0, ap);
    expect(s.pending?.kind === "castFree").toBe(false);
    expect(s.objects[car]!.zone).toBe("battlefield");
    expect(s.objects[card]!.zone).toBe("exile");
  });
});

describe("The Fourth Doctor", () => {
  it("once each turn, a historic spell from the top of your library; casting it makes a Food first", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, doctor());
    const thopter = onTop(s0, ap, ornithopter());
    const ring = onTop(s0, ap, solRing());
    expect(mayPlayFromTop(s0, s0.objects[ring]!, ap)).toBe(true);
    let s = run(s0, planCast(s0, ap, ring));
    // The Food's trigger is above Sol Ring.
    expect(s.triggerQueue.length + s.stack.length).toBe(2);
    s = settle(s, ap);
    expect(named(s, "Food").length).toBe(1);
    expect(s.objects[ring]!.zone).toBe("battlefield");
    // Ornithopter is on top now, historic too, but the permission is used this turn.
    expect(s.players[ap]!.library[0]).toBe(thopter);
    expect(mayPlayFromTop(s, s.objects[thopter]!, ap)).toBe(false);
    // Next turn it's back.
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "main1", ap);
    expect(s.players[ap]!.library[0]).not.toBe(thopter); // drawn
    const elf = onTop(s, ap, elves());
    expect(mayPlayFromTop(s, s.objects[elf]!, ap)).toBe(false);
  });

  it("or a historic land: playing it from the top makes a Food and uses the turn's permission", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, doctor());
    s0.players[ap]!.landsPlayedThisTurn = 0;
    const ring = onTop(s0, ap, solRing());
    const land = onTop(s0, ap, ruins());
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: land }), ap);
    expect(s.objects[land]!.zone).toBe("battlefield");
    expect(named(s, "Food").length).toBe(1);
    expect(mayPlayFromTop(s, s.objects[ring]!, ap)).toBe(false);
  });

  it("a nonhistoric card on top can't be played", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, doctor());
    s0.players[ap]!.landsPlayedThisTurn = 0;
    const elf = onTop(s0, ap, elves());
    expect(mayPlayFromTop(s0, s0.objects[elf]!, ap)).toBe(false);
    const forest = s0.players[ap]!.library.find((id) => nameOf(s0, id) === "Forest")!;
    const lib = s0.players[ap]!.library;
    lib.splice(lib.indexOf(forest), 1);
    lib.unshift(forest);
    expect(mayPlayFromTop(s0, s0.objects[forest]!, ap)).toBe(false);
  });
});

describe("Rashmi and Ragavan", () => {
  const ready = (top: CardDef, rings: number) => {
    const { s, ap, ids, opp } = setup([bolt(), divination()]);
    putOnBattlefield(s, ap, rashmi());
    for (let i = 0; i < rings; i++) putOnBattlefield(s, ap, solRing());
    const card = onTop(s, opp, top);
    return { s, ap, opp, ids, card };
  };
  /** Casts Lightning Bolt at `opp` and aims the trigger at `opp`. */
  const trigger = (s0: GameState, ap: PlayerId, opp: PlayerId, boltId: ObjectId) => {
    let s = settle(run(s0, planCast(s0, ap, boltId, [{ kind: "player", id: opp }])), ap);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }), ap);
    return s;
  };

  it("your first spell: the opponent's top card exiled and a Treasure; cast free if its mana value is less than your artifacts", () => {
    const { s: s0, ap, opp, ids, card } = ready(divination(), 2);
    let s = trigger(s0, ap, opp, ids[0]!);
    // Two Sol Rings and the Treasure: three artifacts, so Divination (3) can't be cast free; it may be cast this turn.
    expect(s.objects[card]!.zone).toBe("exile");
    expect(named(s, "Treasure").length).toBe(1);
    expect(s.pending).toBeNull();
    expect(mayPlayFromExile(s, s.objects[card]!, ap)).toBe(true);
    s = settle(run(s, planCast(s, ap, card)), ap);
    expect(s.objects[card]!.zone).toBe("graveyard");
    expect(s.objects[card]!.owner).toBe(opp);
  });

  it("with enough artifacts it's offered free as the trigger resolves, before the spell that triggered it", () => {
    const { s: s0, ap, opp, ids, card } = ready(divination(), 3);
    let s = trigger(s0, ap, opp, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: card });
    s = act(s, { type: "castSpell", player: ap, objectId: card });
    expect(s.stack.map((x) => nameOf(s, x.objectId!))).toEqual(["Lightning Bolt", "Divination"]);
    s = settle(s, ap);
    // Cast this way, no permission is left for later.
    expect(s.objects[card]!.zone).toBe("graveyard");
  });

  it("declined free: still castable this turn, not on a later turn", () => {
    const { s: s0, ap, opp, ids, card } = ready(divination(), 3);
    let s = trigger(s0, ap, opp, ids[0]!);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(mayPlayFromExile(s, s.objects[card]!, ap)).toBe(true);
    s = passUntil(s, "main1", opp);
    expect(mayPlayFromExile(s, s.objects[card]!, ap)).toBe(false);
  });

  it("only the first spell during your turn; a land stays exiled", () => {
    const { s: s0, ap, opp, ids, card } = ready(ruins(), 3);
    let s = trigger(s0, ap, opp, ids[0]!);
    expect(s.pending).toBeNull();
    expect(s.objects[card]!.zone).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[card]!, ap)).toBe(false);
    const treasures = named(s, "Treasure").length;
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    expect(named(s, "Treasure").length).toBe(treasures);
  });
});

describe("Strago and Relm", () => {
  const ready = (top: CardDef[]) => {
    const { s, ap, opp } = setup([]);
    const sr = putOnBattlefield(s, ap, strago());
    const cards = top.reverse().map((d) => onTop(s, opp, d)).reverse();
    return { s, ap, opp, sr, cards };
  };

  it("the target opponent exiles until a creature card; you cast it free, and it gains haste and is sacrificed at the end step", () => {
    const { s: s0, ap, opp, sr, cards } = ready([ruins(), ruins(), giant(), divination()]);
    let s = run(s0, planActivate(s0, ap, sr, 0, [{ kind: "player", id: opp }]));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: cards[2] });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: cards[2]! }), ap);
    const g = s.objects[cards[2]!]!;
    expect(g.zone).toBe("battlefield");
    expect(g.controller).toBe(ap);
    expect(characteristics(s, g).keywords).toContain("Haste");
    // The lands stay exiled; the card under the creature card is untouched.
    expect(s.objects[cards[0]!]!.zone).toBe("exile");
    expect(s.objects[cards[1]!]!.zone).toBe("exile");
    expect(s.objects[cards[3]!]!.zone).toBe("library");
    s = settle(passUntil(s, "end", ap), ap);
    expect(s.objects[cards[2]!]!.zone).toBe("graveyard");
  });

  it("an instant or sorcery is cast free with no haste or sacrifice; declined, it stays exiled", () => {
    const { s: s0, ap, opp, sr, cards } = ready([ruins(), divination()]);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planActivate(s0, ap, sr, 0, [{ kind: "player", id: opp }])), ap);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: cards[1] });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: cards[1]! }), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    const again = ready([divination()]);
    let t = settle(run(again.s, planActivate(again.s, again.ap, again.sr, 0, [{ kind: "player", id: again.opp }])), again.ap);
    t = settle(act(t, { type: "chooseMay", player: again.ap, yes: false }), again.ap);
    expect(t.objects[again.cards[0]!]!.zone).toBe("exile");
  });
});

describe("The Ruinous Powers", () => {
  it("at your upkeep, a random opponent's top card exiled; you may play it this turn with any color, and casting it costs its owner life", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ruinous());
    const opps = s0.turnOrder.filter((p) => p !== ap);
    // The cards go on top after every opponent's draw step.
    const s1 = passUntil(s0, "end", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 3) % 4]!);
    const tops = opps.map((p) => onTop(s1, p, divination()));
    // To your next upkeep.
    let s = settle(passUntil(s1, "upkeep", ap), ap);
    const exiled = tops.filter((id) => s.objects[id]!.zone === "exile");
    expect(exiled.length).toBe(1);
    const card = exiled[0]!;
    const owner = s.objects[card]!.owner;
    expect(mayPlayFromExile(s, s.objects[card]!, ap)).toBe(true);
    s = passUntil(s, "main1", ap);
    const life = s.players[owner]!.life;
    // Divination ({2}{U}) paid with mana of any color: only red mana here.
    for (const id of s.battlefield) {
      const o = s.objects[id]!;
      if (o.controller === ap && /Island/.test(nameOf(s, id))) o.tapped = true;
    }
    s = run(s, planCast(s, ap, card));
    s = settle(s, ap);
    expect(s.players[owner]!.life).toBe(life - 3);
    expect(s.objects[card]!.zone).toBe("graveyard");
  });

  it("a land exiled this way may be played as your land play; that's not a spell, so no life is lost", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ruinous());
    const opps = s0.turnOrder.filter((p) => p !== ap);
    // The cards go on top after every opponent's draw step.
    const s1 = passUntil(s0, "end", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 3) % 4]!);
    const tops = opps.map((p) => onTop(s1, p, ruins()));
    let s = settle(passUntil(s1, "upkeep", ap), ap);
    const card = tops.find((id) => s.objects[id]!.zone === "exile")!;
    const owner = s.objects[card]!.owner;
    const life = s.players[owner]!.life;
    s = passUntil(s, "main1", ap);
    s = settle(act(s, { type: "playLand", player: ap, objectId: card }), ap);
    expect(s.objects[card]!.zone).toBe("battlefield");
    expect(s.players[owner]!.life).toBe(life);
  });
});

describe("Monk Class, level 3", () => {
  it("at your upkeep, the top card is exiled; it may be cast from exile once you've cast another spell that turn, on any later turn too", () => {
    const { s: s0, ap } = setup([]);
    const monkId = putOnBattlefield(s0, ap, monk());
    s0.objects[monkId]!.classLevel = 3;
    const s1 = passUntil(s0, "end", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 3) % 4]!);
    const top = onTop(s1, ap, divination());
    let s = settle(passUntil(s1, "upkeep", ap), ap);
    expect(s.objects[top]!.zone).toBe("exile");
    s = passUntil(s, "main1", ap);
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(false);
    // Another spell first (cheaper as the second spell this turn, from the first level).
    const opt0 = toHand(s, ap, bolt());
    s = settle(run(s, planCast(s, ap, opt0, [{ kind: "player", id: s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]! }])), ap);
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(true);
    // Not on an opponent's turn without a spell of yours that turn; on your next turn it waits for another spell again.
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(s.objects[top]!.zone).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(false);
  });

  it("cast from exile, paying its costs", () => {
    const { s: s0, ap } = setup([]);
    const monkId = putOnBattlefield(s0, ap, monk());
    s0.objects[monkId]!.classLevel = 3;
    const s1 = passUntil(s0, "end", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 3) % 4]!);
    const top = onTop(s1, ap, divination());
    let s = settle(passUntil(s1, "upkeep", ap), ap);
    s = passUntil(s, "main1", ap);
    expect(planCast(s, ap, top)).toBeNull();
    const b = toHand(s, ap, bolt());
    s = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]! }])), ap);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, top)), ap);
    expect(s.objects[top]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("a land exiled this way can't be cast, so it stays", () => {
    const { s: s0, ap } = setup([]);
    const monkId = putOnBattlefield(s0, ap, monk());
    s0.objects[monkId]!.classLevel = 3;
    const s1 = passUntil(s0, "end", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 3) % 4]!);
    const top = onTop(s1, ap, ruins());
    let s = settle(passUntil(s1, "upkeep", ap), ap);
    s = passUntil(s, "main1", ap);
    const b = toHand(s, ap, bolt());
    s = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]! }])), ap);
    expect(s.objects[top]!.zone).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(false);
  });
});
