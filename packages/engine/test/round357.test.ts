// Round 357 (Lane A): a copy of the next instant or sorcery spell bought as Najal attacks (Najal, the Storm Runner), cards
// exiled until a nonland card, that one cast free up to Ryan's power (Ryan Sinclair), a counterspell's clash that may add
// {C} at your next main phase (Scattering Stroke), a Saga that wins or is exiled to be cast again this turn (Heaven Sent),
// an artifact or Human spell from the graveyard each turn up to the quest counters (Arcade Gannon), and a historic land or
// permanent spell from the graveyard each turn that gains an exile replacement (The Eighth Doctor).

import { describe, expect, it } from "vitest";
import { act, addEffect, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, characteristics, isFullySupported, legalActions, mayPlayFromExile, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

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
const moveTo = (zone: "graveyard" | "hand" | "library") => (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
const toYard = moveTo("graveyard");
const onTop = moveTo("library");
const legalLand = (s: GameState, pid: PlayerId, id: string) => legalActions(s, pid).some((a) => a.type === "playLand" && a.objectId === id);
const via = { via: "turnPermission" as const };

// Real oracle text (Scryfall).
const najal = (): CardDef => ({"oracleId":"2a7504b9-220d-412e-9381-b6a8a3750241","name":"Najal, the Storm Runner","manaCost":"{2}{U}{U}{R}","cmc":5,"typeLine":"Legendary Creature — Efreet Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Efreet","Wizard"],"oracleText":"You may cast sorcery spells as though they had flash.\nWhenever Najal attacks, you may pay {2}. If you do, when you next cast an instant or sorcery spell this turn, copy it. You may choose new targets for the copy.","power":"5","toughness":"4","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ryan = (): CardDef => ({"oracleId":"6c06e2d5-1473-4ce6-bcf6-10dfbbe5f801","name":"Ryan Sinclair","manaCost":"{2}{R}","cmc":3,"typeLine":"Legendary Creature — Human","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human"],"oracleText":"Whenever Ryan attacks, exile cards from the top of your library until you exile a nonland card. You may cast the exiled card without paying its mana cost if it's a spell with mana value less than or equal to Ryan's power. Put the exiled cards not cast this way on the bottom of your library in a random order.\nDoctor's companion (You can have two commanders if the other is the Doctor.)","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Doctor's companion"],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const stroke = (): CardDef => ({"oracleId":"314a9604-34ec-4529-bd14-7b63be28669f","name":"Scattering Stroke","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell. Clash with an opponent. If you win, at the beginning of your next main phase, you may add an amount of {C} equal to that spell's mana value. (Each clashing player reveals the top card of their library, then puts that card on their choice of the top or bottom. A player wins if their card had a greater mana value.)","colors":["U"],"colorIdentity":["U"],"keywords":["Clash"],"producedMana":["C"],"commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const heaven = (): CardDef => ({"oracleId":"1863ba60-f786-4e52-90fc-f3135ca0257f","name":"Heaven Sent","manaCost":"{U}{R}","cmc":2,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Investigate.\nIII — This Saga deals 1 damage to each opponent. Then if an opponent has 0 or less life, draw seven cards. Otherwise, exile this Saga and you may cast it this turn.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Investigate"],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const gannon = (): CardDef => ({"oracleId":"e001d7e6-71c9-42fa-9d5c-9455da66e4ec","name":"Arcade Gannon","manaCost":"{2}{W}{U}","cmc":4,"typeLine":"Legendary Creature — Human Doctor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Doctor"],"oracleText":"{T}: Draw a card, then discard a card. Put a quest counter on Arcade Gannon.\nFor Auld Lang Syne — Once during each of your turns, you may cast an artifact or Human spell from your graveyard with mana value less than or equal to the number of quest counters on Arcade Gannon.","power":"2","toughness":"3","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["For Auld Lang Syne"],"commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const eighth = (): CardDef => ({"oracleId":"0956bc16-ff04-4e96-8059-ef62afa2405f","name":"The Eighth Doctor","manaCost":"{4}{W}{U}","cmc":6,"typeLine":"Legendary Creature — Time Lord Doctor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Time Lord","Doctor"],"oracleText":"When The Eighth Doctor enters, mill three cards.\nOnce during each of your turns, you may play a historic land or cast a historic permanent spell from your graveyard. If you do, it gains \"If this permanent would leave the battlefield, exile it instead of putting it anywhere else.\"","power":"4","toughness":"4","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Mill"],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ruins = (): CardDef => ({"oracleId":"a3da7d5b-2c2b-45fe-b9c5-413b8c8fc0a2","name":"Academy Ruins","manaCost":"","cmc":0,"typeLine":"Legendary Land","supertypes":["Legendary"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}{U}, {T}: Put target artifact card from your graveyard on top of your library.","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"drc","releasedAt":"2025-02-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const vanguard = (): CardDef => ({"oracleId":"b3b9a87d-cb95-435c-90b6-037406cab32e","name":"Elite Vanguard","manaCost":"{W}","cmc":1,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const fireball = (): CardDef => ({"oracleId":"aa7714b0-2bfb-458a-8ebf-37ec2c53383e","name":"Fireball","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sagaland = (): CardDef => ({"oracleId":"4c6a0c30-b547-4eff-8ff4-0ca25803c076","name":"Urza's Saga","manaCost":"","cmc":0,"typeLine":"Enchantment Land — Urza's Saga","supertypes":[],"types":["Enchantment","Land"],"subtypes":["Urza's","Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — This Saga gains \"{T}: Add {C}.\"\nII — This Saga gains \"{2}, {T}: Create a 0/0 colorless Construct artifact creature token with 'This token gets +1/+1 for each artifact you control.'\"\nIII — Search your library for an artifact card with mana cost {0} or {1}, put it onto the battlefield, then shuffle.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const isamaru = (): CardDef => ({"oracleId":"cfb756dd-6fe1-430a-8f04-8b10cac62a86","name":"Isamaru, Hound of Konda","manaCost":"{W}","cmc":1,"typeLine":"Legendary Creature — Dog","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dog"],"oracleText":"","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rampant = (): CardDef => ({"oracleId":"8539f295-5d58-4436-a73a-b9277c4c7795","name":"Rampant Growth","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wrath = (): CardDef => ({"oracleId":"34515b16-c9a4-4f98-8c77-416a7a523407","name":"Wrath of God","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all creatures. They can't be regenerated.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"v14","releasedAt":"2014-08-22","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const cancel = (): CardDef => ({"oracleId":"7d00fb28-ea6c-49a9-b4af-ffb38860a9a7","name":"Cancel","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bonder = (): CardDef => ({"oracleId":"caa02547-66e3-4e27-a2d3-5e94f3e7a069","name":"Thraben Inspector","manaCost":"{W}","cmc":1,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"When this creature enters, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")","power":"1","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Investigate"],"commanderLegal":"legal","set":"soi","releasedAt":"2016-04-08","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

describe("round 357: compiles", () => {
  it("every card of the round", () => supported(najal(), ryan(), stroke(), heaven(), gannon(), eighth()));
});

/** `attacker` attacks `opp` from the active player's side; stops at the first question of the active player's. */
const attack = (s0: GameState, ap: PlayerId, opp: PlayerId, attacker: ObjectId) => {
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
  for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("Najal, the Storm Runner", () => {
  /** Najal attacks `opp`; its trigger asks whether to pay {2}. */
  const attacking = (pay: boolean) => {
    const { s: s0, ap, ids, opp } = setup([bolt(), bolt()]);
    const n = putOnBattlefield(s0, ap, najal());
    let s = attack(s0, ap, opp, n);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { mana: "{2}" } });
    if (pay) s.players[ap]!.manaPool.C = 2;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: pay }), ap);
    expect(s.step).toBe("declareAttackers");
    return { s, ap, ids, opp };
  };

  it("paid: the next instant or sorcery spell you cast this turn is copied, new targets allowed; only that one", () => {
    const { s: s0, ap, ids, opp } = attacking(true);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const life = s0.players[opp]!.life;
    const other = s0.players[third]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap, copyOf: "Lightning Bolt" });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [{ kind: "player", id: third }] }), ap);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.players[third]!.life).toBe(other - 3);
    // The delayed trigger is used up: the second Bolt isn't copied.
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])), ap);
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.life).toBe(life - 6);
  });

  it("not paid: no copy", () => {
    const { s: s0, ap, ids, opp } = attacking(false);
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.life).toBe(life - 3);
  });
});

describe("Ryan Sinclair", () => {
  /** Ryan attacks with `tops` put on top of your library (the last one on top). */
  const attacking = (...tops: CardDef[]) => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, ryan());
    const cards = tops.map((t) => onTop(s0, ap, t));
    return { s0, ap, opp, r, cards };
  };

  it("exiles down to a nonland card and casts it free if its mana value is at most Ryan's power; the lands go to the bottom", () => {
    const { s0, ap, opp, r, cards } = attacking(bears(), ruins());
    const [bear, land] = cards as [ObjectId, ObjectId];
    const size = s0.players[ap]!.library.length;
    let s = attack(s0, ap, opp, r);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: bear, mv: { max: 2 } });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: bear }), ap);
    expect(s.objects[bear]!.zone).toBe("battlefield");
    expect(s.objects[land]!.zone).toBe("library");
    expect(s.players[ap]!.library.at(-1)).toBe(land);
    expect(s.players[ap]!.library.length).toBe(size - 1);
  });

  it("a spell costing more than Ryan's power isn't offered and goes to the bottom with the rest", () => {
    const { s0, ap, opp, r, cards } = attacking(divination(), ruins());
    const [div, land] = cards as [ObjectId, ObjectId];
    const size = s0.players[ap]!.library.length;
    const s = attack(s0, ap, opp, r);
    expect(s.pending?.kind === "castFree").toBe(false);
    expect(s.objects[div]!.zone).toBe("library");
    expect(s.objects[land]!.zone).toBe("library");
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([div, land].sort());
    expect(s.players[ap]!.library.length).toBe(size);
  });

  it("Ryan's power as the trigger resolves: pumped to 3, a three-mana spell can be cast; declined, it goes to the bottom", () => {
    const { s0, ap, opp, r, cards } = attacking(divination());
    const [div] = cards as [ObjectId];
    addEffect(s0, ap, [r], [{ kind: "modifyPT", power: 1, toughness: 0 }]);
    let s = attack(s0, ap, opp, r);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: div, mv: { max: 3 } });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.objects[div]!.zone).toBe("library");
    expect(s.players[ap]!.library.at(-1)).toBe(div);
  });
});

describe("Scattering Stroke", () => {
  /** Divination cast, Scattering Stroke cast on it; your top card Hill Giant (4) against each opponent's `theirs`. */
  const countered = (theirs: () => CardDef) => {
    const { s: s0, ap, ids } = setup([divination(), stroke()]);
    onTop(s0, ap, giant());
    for (const pid of s0.turnOrder) if (pid !== ap) onTop(s0, pid, theirs());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const item = s.stack.find((x) => x.objectId === ids[0])!.id;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: item }]));
    for (let i = 0; i < 60 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      // The clash's questions (which opponent, top or bottom) answered as the bots would.
      if (p) s = run(s, botActions(s, p.player));
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    return { s, ap };
  };

  it("you win the clash: at your next main phase you may add {C} equal to the countered spell's mana value", () => {
    const { s: s0, ap } = countered(elves);
    expect(s0.players[ap]!.manaPool.C).toBe(0);
    let s = passUntil(s0, "main2", ap);
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.step).toBe("main2");
    expect(s.players[ap]!.manaPool.C).toBe(3);
  });

  it("declined: no mana", () => {
    const { s: s0, ap } = countered(elves);
    let s = settle(passUntil(s0, "main2", ap), ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.players[ap]!.manaPool.C).toBe(0);
  });

  it("you lose the clash: the spell is still countered, and no mana comes", () => {
    const { s: s0, ap } = countered(giant);
    const s = settle(passUntil(s0, "main2", ap), ap);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.manaPool.C).toBe(0);
  });
});

describe("Heaven Sent", () => {
  /** Heaven Sent with two lore counters; chapter III triggers at your next precombat main phase. */
  const third = (lowLife: boolean) => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, heaven());
    s0.objects[h]!.counters.lore = 2;
    let s = passUntil(s0, "main1", opp);
    s = passUntil(s, "main1", ap);
    if (lowLife) s.players[opp]!.life = 1;
    const hand = s.players[ap]!.hand.length;
    const lives = s.turnOrder.filter((p) => p !== ap).map((p) => s.players[p]!.life);
    s = settle(s, ap);
    return { s, ap, opp, h, hand, lives };
  };

  it("an opponent at 0 or less life: you draw seven, and the Saga is sacrificed", () => {
    const { s, ap, h, hand, lives } = third(true);
    expect(s.turnOrder.filter((p) => p !== ap).map((p) => s.players[p]!.life)).toEqual(lives.map((l) => l - 1));
    expect(s.players[ap]!.hand.length).toBe(hand + 7);
    expect(s.objects[h]!.zone).toBe("graveyard");
  });

  it("otherwise the Saga is exiled and you may cast it again this turn, starting over at chapter I", () => {
    const { s: s0, ap, h, hand } = third(false);
    expect(s0.players[ap]!.hand.length).toBe(hand);
    expect(s0.objects[h]!.zone).toBe("exile");
    expect(mayPlayFromExile(s0, s0.objects[h]!, ap)).toBe(true);
    const clues = Object.values(s0.objects).filter((o) => o.zone === "battlefield" && nameOf(s0, o.id).startsWith("Clue")).length;
    let s = settle(run(s0, planCast(s0, ap, h)), ap);
    expect(s.objects[h]!.zone).toBe("battlefield");
    expect(s.objects[h]!.counters.lore).toBe(1);
    expect(Object.values(s.objects).filter((o) => o.zone === "battlefield" && nameOf(s, o.id).startsWith("Clue")).length).toBe(clues + 1);
  });

  it("the permission ends with the turn", () => {
    const { s: s0, ap, opp, h } = third(false);
    const s = passUntil(s0, "main1", opp);
    expect(s.objects[h]!.zone).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[h]!, ap)).toBe(false);
  });
});

describe("Arcade Gannon", () => {
  it("once each turn, an artifact or Human spell from your graveyard with mana value up to its quest counters", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, gannon());
    s0.objects[g]!.counters.quest = 1;
    const ring = toYard(s0, ap, solRing());
    const stone = toYard(s0, ap, mindStone());
    const human = toYard(s0, ap, vanguard());
    const bear = toYard(s0, ap, bears());
    // Mind Stone is 2, more than one quest counter; Grizzly Bears is neither an artifact nor a Human.
    expect(planCast(s0, ap, stone, undefined, undefined, "auto", undefined, via)).toBeNull();
    expect(planCast(s0, ap, bear, undefined, undefined, "auto", undefined, via)).toBeNull();
    expect(planCast(s0, ap, human, undefined, undefined, "auto", undefined, via)).not.toBeNull();
    let s = settle(run(s0, planCast(s0, ap, ring, undefined, undefined, "auto", undefined, via)), ap);
    expect(s.objects[ring]!.zone).toBe("battlefield");
    // Used this turn.
    expect(planCast(s, ap, human, undefined, undefined, "auto", undefined, via)).toBeNull();
    // A second quest counter, next turn: Mind Stone now.
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "main1", ap);
    s.objects[g]!.counters.quest = 2;
    expect(planCast(s, ap, stone, undefined, undefined, "auto", undefined, via)).not.toBeNull();
  });

  it("an X spell's X counts toward its mana value", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, gannon());
    s0.objects[g]!.counters.quest = 2;
    const human = toYard(s0, ap, { ...vanguard(), oracleId: "x-vanguard", name: "X Vanguard", manaCost: "{X}{W}", cmc: 1 } as CardDef);
    expect(planCast(s0, ap, human, undefined, undefined, "auto", 1, via)).not.toBeNull();
    expect(planCast(s0, ap, human, undefined, undefined, "auto", 2, via)).toBeNull();
  });
});

describe("The Eighth Doctor", () => {
  it("a historic land from the graveyard, once each turn shared with spells; it gains the exile replacement", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, eighth());
    s0.players[ap]!.landsPlayedThisTurn = 0;
    const land = toYard(s0, ap, ruins());
    const ring = toYard(s0, ap, solRing());
    const forest = s0.players[ap]!.library.find((id) => nameOf(s0, id) === "Forest")!;
    const lib = s0.players[ap]!.library;
    lib.splice(lib.indexOf(forest), 1);
    s0.players[ap]!.graveyard.push(forest);
    s0.objects[forest]!.zone = "graveyard";
    // A Forest isn't historic.
    expect(legalLand(s0, ap, forest)).toBe(false);
    expect(legalLand(s0, ap, land)).toBe(true);
    const s = act(s0, { type: "playLand", player: ap, objectId: land });
    expect(s.objects[land]!.zone).toBe("battlefield");
    expect(abilitiesOf(s, s.objects[land]!).exileIfLeavesSelf).toBe(true);
    expect(planCast(s, ap, ring, undefined, undefined, "auto", undefined, via)).toBeNull();
  });

  it("a historic permanent spell from the graveyard: a legendary creature that, destroyed, is exiled instead", () => {
    const { s: s0, ap, ids } = setup([wrath()]);
    putOnBattlefield(s0, ap, eighth());
    const dog = toYard(s0, ap, isamaru());
    const bear = toYard(s0, ap, bears());
    expect(planCast(s0, ap, bear, undefined, undefined, "auto", undefined, via)).toBeNull();
    let s = settle(run(s0, planCast(s0, ap, dog, undefined, undefined, "auto", undefined, via)), ap);
    expect(s.objects[dog]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[dog]!).grantedAbilities.join("\n")).toContain("exile it instead");
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    expect(s.objects[dog]!.zone).toBe("exile");
  });
});
