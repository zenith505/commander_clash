// Round 363 (Lane A): a creature that may become a copy of the creature card on top of its controller's library at each
// combat, with flying (Vesuvan Drifter), or that may make its controller's other creatures copies of it (Deceiver of Form);
// a permanent phased out for as long as its controller keeps a Saga (The Phasing of Zhalfir); a vote that sends the cards a
// Saga exiled to the bottom of their owners' libraries (Trial of a Time Lord); and a spell exiled from the stack, castable
// later with mana of any color or for free by a d20 roll (Gale's Redirection).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

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
/** Passes (answering other players' questions as bots, declaring no attacks) until `me` has a question of `kind`. */
const until = (s: GameState, me: PlayerId, kind: string, max = 3000) => {
  for (let i = 0; i < max; i++) {
    const p = s.pending;
    if (p?.player === me && p.kind === kind) return s;
    const who = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: who, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: who, objectIds: s.players[who]!.hand.slice(0, p.count) });
    else if (p) for (const a of botActions(s, who)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: who });
  }
  throw new Error(`no ${kind} for ${me}`);
};
const toTop = (s: GameState, pid: PlayerId, def: CardDef, at = 0) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.splice(at, 0, id);
  invalidateCharacteristics(s);
  return id;
};
const nameOf = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
const ptOf = (s: GameState, id: ObjectId) => `${characteristics(s, s.objects[id]!).power}/${characteristics(s, s.objects[id]!).toughness}`;

// Real oracle text (Scryfall).
const drifter = (): CardDef => ({"oracleId":"727ef984-1643-4a09-8283-a665508e85dd","name":"Vesuvan Drifter","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Flying\nYou may look at the top card of your library any time.\nAt the beginning of each combat, you may reveal the top card of your library. If you reveal a creature card this way, this creature becomes a copy of that card until end of turn, except it has flying.","power":"2","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09b6a634-0a9c-4e96-84cc-16a6c70b669d.jpg?1783916431","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09b6a634-0a9c-4e96-84cc-16a6c70b669d.jpg?1783916431","commanderLegal":"legal","set":"mat","releasedAt":"2023-05-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const deceiver = (): CardDef => ({"oracleId":"18c58328-518f-4228-bb1b-2433f3fb21f2","name":"Deceiver of Form","manaCost":"{6}{C}","cmc":7,"typeLine":"Creature — Eldrazi","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"({C} represents colorless mana.)\nAt the beginning of combat on your turn, reveal the top card of your library. If a creature card is revealed this way, you may have creatures you control other than this creature become copies of that card until end of turn. You may put that card on the bottom of your library.","power":"8","toughness":"8","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a416d54b-ac84-48ac-92f8-eeb348f26016.jpg?1783937931","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a416d54b-ac84-48ac-92f8-eeb348f26016.jpg?1783937931","commanderLegal":"legal","set":"ogw","releasedAt":"2016-01-22","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const zhalfir = (): CardDef => ({"oracleId":"6b92a5f4-a241-48c8-9aec-c8e9d5b01fa5","name":"The Phasing of Zhalfir","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"Read ahead (Choose a chapter and start with that many lore counters. Add one after your draw step. Skipped chapters don't trigger. Sacrifice after III.)\nI, II — Another target nonland permanent phases out. It can't phase in for as long as you control this Saga.\nIII — Destroy all creatures. For each creature destroyed this way, its controller creates a 2/2 black Phyrexian creature token.","colors":["U"],"colorIdentity":["U"],"keywords":["Read Ahead"],"imageUrl":"https://cards.scryfall.io/normal/front/0/7/0770eb6a-4f01-4677-a401-14c1b30692c9.jpg?1783921347","artUrl":"https://cards.scryfall.io/art_crop/front/0/7/0770eb6a-4f01-4677-a401-14c1b30692c9.jpg?1783921347","commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const trial = (): CardDef => ({"oracleId":"a5425d4f-cd6c-4240-89a4-dd13e0e1a95f","name":"Trial of a Time Lord","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI, II, III — Exile target nontoken creature an opponent controls until this Saga leaves the battlefield.\nIV — Starting with you, each player votes for innocent or guilty. If guilty gets more votes, the owner of each card exiled with this Saga puts that card on the bottom of their library.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/2/52b68ed3-0d26-4334-8d0c-2d28ced8ee4c.jpg?1783914675","artUrl":"https://cards.scryfall.io/art_crop/front/5/2/52b68ed3-0d26-4334-8d0c-2d28ced8ee4c.jpg?1783914675","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const gale = (): CardDef => ({"oracleId":"8676f007-bf5f-4312-968c-59f4549f7d51","name":"Gale's Redirection","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target spell, then roll a d20 and add that spell's mana value.\n1—14 | You may cast the exiled card for as long as it remains exiled, and you may spend mana as though it were mana of any color to cast that spell.\n15+ | You may cast the exiled card without paying its mana cost for as long as it remains exiled.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1f5ddcf8-c87b-4a26-b226-8593f517a74a.jpg?1783922788","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1f5ddcf8-c87b-4a26-b226-8593f517a74a.jpg?1783922788","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const anthem = (): CardDef => ({"oracleId":"e3886fe8-9b76-4613-8891-4ec74657c087","name":"Glorious Anthem","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures you control get +1/+1.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ogre = (): CardDef => ({"oracleId":"83c8a3a6-2e1a-4e26-8847-6d066f42d906","name":"Gray Ogre","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Ogre","supertypes":[],"types":["Creature"],"subtypes":["Ogre"],"oracleText":"","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const seer_ = (): CardDef => ({"oracleId":"cef7396d-2168-4282-bf38-670ca9eebd91","name":"Thought-Knot Seer","manaCost":"{3}{C}","cmc":4,"typeLine":"Creature — Eldrazi","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"({C} represents colorless mana.)\nWhen this creature enters, target opponent reveals their hand. You choose a nonland card from it and exile that card.\nWhen this creature leaves the battlefield, target opponent draws a card.","power":"4","toughness":"4","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bffc360e-db41-48f3-9365-680d55046e04.jpg?1783937929","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bffc360e-db41-48f3-9365-680d55046e04.jpg?1783937929","commanderLegal":"legal","set":"ogw","releasedAt":"2016-01-22","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const blaze = (): CardDef => ({"oracleId":"0596920f-9946-42f4-a03b-24aab67f9f1b","name":"Blaze","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Blaze deals X damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/9/3940d0ca-0ca2-4446-9330-a554c3e89824.jpg?1783946468","artUrl":"https://cards.scryfall.io/art_crop/front/3/9/3940d0ca-0ca2-4446-9330-a554c3e89824.jpg?1783946468","commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const treason = (): CardDef => ({"oracleId":"9d08af23-9f4a-4097-9abc-3b17475ab744","name":"Act of Treason","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. (It can attack and {T} this turn.)","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1f2328c4-7344-48bf-b515-977499bcfd1c.jpg?1783933686","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1f2328c4-7344-48bf-b515-977499bcfd1c.jpg?1783933686","commanderLegal":"legal","set":"rna","releasedAt":"2019-01-25","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("round 363: compiles", () => {
  it("every card of the round", () => supported(drifter(), deceiver(), zhalfir(), trial(), gale()));
});

describe("Vesuvan Drifter", () => {
  it("at the beginning of combat, may reveal the top card: a creature card makes it a copy of that card with flying until end of turn", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, drifter());
    const top = toTop(s0, ap, ogre());
    let s = until(s0, ap, "chooseMay");
    expect(s.step).toBe("beginCombat");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    // Gray Ogre as printed, with flying as a copiable value of its own (CR 707.9b); the card stays on top.
    expect(nameOf(s, d)).toBe("Gray Ogre");
    expect(ptOf(s, d)).toBe("2/2");
    expect(characteristics(s, s.objects[d]!).keywords).toContain("Flying");
    expect(s.players[ap]!.library[0]).toBe(top);
    expect(s.objects[top]!.zone).toBe("library");
    // Until end of turn: Vesuvan Drifter again in the next turn.
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(nameOf(s, d)).toBe("Vesuvan Drifter");
    expect(ptOf(s, d)).toBe("2/4");
  });

  it("a noncreature card changes nothing, and declining reveals nothing; it triggers at each player's combat", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, drifter());
    toTop(s0, ap, anthem());
    let s = until(s0, ap, "chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(nameOf(s, d)).toBe("Vesuvan Drifter");
    expect(s.log.some((l) => /reveals Glorious Anthem/.test(l.text))).toBe(true);
    // The next player's combat: it triggers again ("each combat").
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "main1", next);
    s = until(s, ap, "chooseMay");
    expect(s.activePlayer).toBe(next);
    const logged = s.log.length;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.log.slice(logged).some((l) => /reveals/.test(l.text))).toBe(false);
    expect(nameOf(s, d)).toBe("Vesuvan Drifter");
  });
});

describe("Deceiver of Form", () => {
  it("reveals the top card; a creature card: you may have your other creatures become copies of it until end of turn, then may put it on the bottom", () => {
    const { s: s0, ap, opp } = setup([]);
    const dec = putOnBattlefield(s0, ap, deceiver());
    const ogreA = putOnBattlefield(s0, ap, ogre());
    s0.objects[ogreA]!.counters["+1/+1"] = 1;
    const theirs = putOnBattlefield(s0, opp, ogre());
    const top = toTop(s0, ap, serra());
    let s = until(s0, ap, "chooseMay");
    expect(s.step).toBe("beginCombat");
    expect(s.log.some((l) => /reveals Serra Angel/.test(l.text))).toBe(true);
    s = until(act(s, { type: "chooseMay", player: ap, yes: true }), ap, "chooseMay");
    // Copies of the card as printed, keeping their counters (rulings); not ~ itself, not another player's creature.
    expect(nameOf(s, ogreA)).toBe("Serra Angel");
    expect(ptOf(s, ogreA)).toBe("5/5");
    expect(nameOf(s, dec)).toBe("Deceiver of Form");
    expect(nameOf(s, theirs)).toBe("Gray Ogre");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.players[ap]!.library.at(-1)).toBe(top);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(nameOf(s, ogreA)).toBe("Gray Ogre");
  });

  it("declining the copy still offers the bottom; a noncreature card offers only the bottom (rulings)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, deceiver());
    const ogreA = putOnBattlefield(s0, ap, ogre());
    const top = toTop(s0, ap, serra());
    let s = until(s0, ap, "chooseMay");
    s = until(act(s, { type: "chooseMay", player: ap, yes: false }), ap, "chooseMay");
    expect(nameOf(s, ogreA)).toBe("Gray Ogre");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.players[ap]!.library[0]).toBe(top);

    const { s: t0, ap: me } = setup([]);
    putOnBattlefield(t0, me, deceiver());
    const mine = putOnBattlefield(t0, me, ogre());
    const card = toTop(t0, me, anthem());
    let t = until(t0, me, "chooseMay");
    expect((t.pending as { prompt?: string }).prompt).toMatch(/bottom/);
    t = settle(act(t, { type: "chooseMay", player: me, yes: true }), me);
    expect(nameOf(t, mine)).toBe("Gray Ogre");
    expect(t.players[me]!.library.at(-1)).toBe(card);
  });
});

describe("The Phasing of Zhalfir", () => {
  /** The Saga with no lore counter yet: its first chapter triggers in `ap`'s next precombat main phase, targeting the opponent's Serra Angel. */
  const chapterOne = () => {
    const { s: s0, ap, opp } = setup([]);
    const saga = putOnBattlefield(s0, ap, zhalfir());
    s0.objects[saga]!.counters.lore = 0;
    const angel = putOnBattlefield(s0, opp, serra());
    let s = passUntil(passUntil(s0, "upkeep", opp), "main1", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: angel }] }), ap);
    expect(s.objects[angel]!.zone).toBe("phasedOut");
    return { s, ap, opp, saga, angel };
  };

  it("I: another target nonland permanent phases out and doesn't phase in while you control the Saga", () => {
    const { s: s1, ap, opp, angel } = chapterOne();
    // Its controller's untap step comes and goes: it stays phased out (rulings).
    let s = passUntil(s1, "main1", opp);
    expect(s.objects[angel]!.zone).toBe("phasedOut");
    s = passUntil(passUntil(s, "upkeep", ap), "upkeep", opp);
    expect(s.objects[angel]!.zone).toBe("phasedOut");
  });

  it("once the Saga leaves, it phases in at its controller's next untap step as usual", () => {
    const { s: s1, ap, opp, saga, angel } = chapterOne();
    moveObject(s1, saga, "graveyard");
    let s = act(s1, { type: "passPriority", player: waitingOn(s1)! });
    expect(s.objects[angel]!.zone).toBe("phasedOut");
    s = passUntil(s, "main1", opp);
    expect(s.objects[angel]!.zone).toBe("battlefield");
    void ap;
  });

  it("losing control of the Saga ends it for good, even after getting it back (CR 611.2b)", () => {
    const { s: s1, opp, saga, angel } = chapterOne();
    s1.objects[saga]!.controller = opp;
    invalidateCharacteristics(s1);
    let s = act(s1, { type: "passPriority", player: waitingOn(s1)! });
    s.objects[saga]!.controller = s.objects[saga]!.owner;
    invalidateCharacteristics(s);
    s = passUntil(s, "main1", opp);
    expect(controllerOf(s, s.objects[saga]!)).toBe(s.objects[saga]!.owner);
    expect(s.objects[angel]!.zone).toBe("battlefield");
  });
});

describe("Trial of a Time Lord", () => {
  /** Chapter III exiles the opponent's Serra Angel until the Saga leaves; then chapter IV's vote, `votes` by player in turn order from you. */
  const trialVote = (votes: (pid: PlayerId, ap: PlayerId, opp: PlayerId, i: number) => string) => {
    const { s: s0, ap, opp } = setup([]);
    const saga = putOnBattlefield(s0, ap, trial());
    s0.objects[saga]!.counters.lore = 2;
    const angel = putOnBattlefield(s0, opp, serra());
    let s = passUntil(passUntil(s0, "upkeep", opp), "main1", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: angel }] }), ap);
    expect(s.objects[angel]!.zone).toBe("exile");
    s = passUntil(passUntil(s, "upkeep", opp), "main1", ap);
    const voters: PlayerId[] = [];
    for (let i = 0; i < 40; i++) {
      const p = s.pending;
      if (p?.kind === "chooseOption" && p.what === "vote") {
        expect(p.options).toEqual(["innocent", "guilty"]);
        voters.push(p.player);
        s = act(s, { type: "chooseOption", player: p.player, choice: votes(p.player, ap, opp, voters.length - 1) });
      } else if (p) break;
      else if (s.stack.length || s.triggerQueue.length || voters.length === 0) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      else break;
    }
    return { s: settle(s, ap), ap, opp, saga, angel, voters };
  };

  it("IV: if guilty gets more votes, the exiled card goes to the bottom of its owner's library and doesn't return", () => {
    const { s, ap, opp, saga, angel, voters } = trialVote((pid, _ap, opp) => (pid === opp ? "innocent" : "guilty"));
    // Starting with you (CR 701.38a).
    expect(voters[0]).toBe(ap);
    expect(voters.length).toBe(4);
    expect(s.objects[angel]!.zone).toBe("library");
    expect(s.players[opp]!.library.at(-1)).toBe(angel);
    // The Saga is sacrificed after IV (CR 714.4); nothing comes back.
    expect(s.objects[saga]!.zone).toBe("graveyard");
    expect(s.objects[angel]!.zone).toBe("library");
  });

  it("a tie (or more innocent votes) leaves it exiled, and it returns as the Saga leaves", () => {
    // You and the next player vote guilty, the other two innocent.
    const { s, opp, saga, angel } = trialVote((_pid, _ap, _opp, i) => (i < 2 ? "guilty" : "innocent"));
    expect(s.objects[saga]!.zone).toBe("graveyard");
    // Back on the battlefield under its owner's control (CR 610.3c).
    const back = s.battlefield.find((id) => s.objects[id]!.cardId === s.objects[angel]!.cardId);
    expect(back).toBeDefined();
    expect(controllerOf(s, s.objects[back!]!)).toBe(opp);
  });
});

describe("Gale's Redirection", () => {
  const untapAll = (s: GameState, pid: PlayerId) => {
    for (const id of s.battlefield) if (controllerOf(s, s.objects[id]!) === pid) s.objects[id]!.tapped = false;
  };
  /** You cast Blaze with X = `x` at an opponent, then Gale's Redirection exiling it; the d20 result plus its mana value. */
  const redirect = (seed: number, x = 1) => {
    const { s: s0, ap, opp, ids } = setup([blaze(), gale()], seed);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, x));
    const spell = s.stack.find((i) => i.objectId === ids[0])!;
    untapAll(s, ap);
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: spell.id }]));
    const before = s.log.length;
    s = settle(s, ap);
    const line = s.log.slice(before).find((l) => /rolls a d20 for Gale's Redirection/.test(l.text))!.text;
    const total = Number(/= (\d+)\.$/.exec(line)?.[1] ?? /: (\d+)\.$/.exec(line)![1]);
    return { s, ap, opp, blazeId: ids[0]!, total, line };
  };

  it("exiles the spell (it doesn't resolve), adds its mana value, X included, to the roll; the table decides how it may be cast", () => {
    let low = false;
    let high = false;
    for (let seed = 1; seed <= 40 && !(low && high); seed++) {
      const { s, opp, blazeId, total, line } = redirect(seed, 3);
      // Blaze with X = 3 has mana value 4 on the stack (rulings).
      expect(line).toMatch(/\+ 4 = /);
      expect(s.objects[blazeId]!.zone).toBe("exile");
      expect(s.players[opp]!.life).toBe(40);
      const may = s.objects[blazeId]!.mayPlay;
      if (total >= 15) {
        high = true;
        expect(may).toMatchObject({ until: "exiled", free: true, castOnly: true });
      } else {
        low = true;
        expect(may).toMatchObject({ until: "exiled", anyColor: true, castOnly: true });
        expect(may?.free).toBeUndefined();
      }
    }
    expect(low && high).toBe(true);
  });

  it("1-14: cast it later paying its cost with mana of any color, but {C} still needs colorless mana (CR 609.4b)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = redirect(seed, 1);
      if (r.total >= 15) continue;
      let { s } = r;
      const { ap, opp, blazeId } = r;
      // Only Islands untapped: blue mana pays Blaze's {R}.
      for (const id of s.battlefield) {
        const o = s.objects[id]!;
        if (controllerOf(s, o) === ap) o.tapped = !characteristics(s, o).subtypes.includes("Island");
      }
      s = settle(run(s, planCast(s, ap, blazeId, [{ kind: "player", id: opp }], undefined, undefined, 1)), ap);
      expect(s.players[opp]!.life).toBe(39);
      expect(s.objects[blazeId]!.zone).toBe("graveyard");
      // A {C} symbol: mana as though of any color doesn't pay it (it's not a color, CR 105.1).
      const seer = toTop(s, ap, seer_());
      moveObject(s, seer, "exile");
      s.objects[seer]!.mayPlay = { player: ap, zc: s.objects[seer]!.zoneChanges ?? 0, until: "exiled", turn: s.turn, castOnly: true, anyColor: true };
      untapAll(s, ap);
      expect(planCast(s, ap, seer)).toBeNull();
      putOnBattlefield(s, ap, solRing());
      expect(planCast(s, ap, seer)).not.toBeNull();
      return;
    }
    throw new Error("no low roll");
  });

  it("15+: cast it later without paying its mana cost (X is 0)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = redirect(seed, 1);
      if (r.total < 15) continue;
      let { s } = r;
      const { ap, opp } = r;
      for (const id of s.battlefield) if (controllerOf(s, s.objects[id]!) === ap) s.objects[id]!.tapped = true;
      s = settle(run(s, planCast(s, ap, r.blazeId, [{ kind: "player", id: opp }])), ap);
      expect(s.objects[r.blazeId]!.zone).toBe("graveyard");
      expect(s.players[opp]!.life).toBe(40);
      return;
    }
    throw new Error("no high roll");
  });
});

describe("round 363: bots", () => {
  it("Vesuvan Drifter's bot reveals only for a better creature on top (it may look at it); Deceiver of Form's copies only if they gain", () => {
    for (const [top, yes] of [[serra(), true], [elves(), false]] as const) {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, drifter());
      toTop(s0, ap, top);
      const s = until(s0, ap, "chooseMay");
      expect(botActions(s, ap)[0], top.name).toMatchObject({ type: "chooseMay", yes });
    }
    for (const [top, yes] of [[serra(), true], [elves(), false]] as const) {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, deceiver());
      putOnBattlefield(s0, ap, ogre());
      toTop(s0, ap, top);
      const s = until(s0, ap, "chooseMay");
      expect(botActions(s, ap)[0], top.name).toMatchObject({ type: "chooseMay", yes });
    }
  });
});

describe("round 363: bots choose targets", () => {
  it("The Phasing of Zhalfir's bot phases out an opponent's permanent, not its own", () => {
    const { s: s0, ap, opp } = setup([]);
    const saga = putOnBattlefield(s0, ap, zhalfir());
    s0.objects[saga]!.counters.lore = 0;
    putOnBattlefield(s0, ap, ogre());
    const angel = putOnBattlefield(s0, opp, serra());
    let s = passUntil(passUntil(s0, "upkeep", opp), "main1", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const [a] = botActions(s, ap);
    expect(a).toMatchObject({ type: "chooseTargets" });
    const t = (a as { targets: { kind: string; id: string }[] }).targets[0]!;
    expect(controllerOf(s, s.objects[t.id]!)).not.toBe(ap);
    void angel;
  });
});
