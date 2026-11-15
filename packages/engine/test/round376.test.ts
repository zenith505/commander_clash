// Round 376 (Lane A): a search an opponent splits, one card shuffled back and the others cast for free (Emergent
// Ultimatum), a draft of every exiled permanent card (Thieves' Auction), every permanent shuffled away and replaced from
// the top of the library (Warp World), and an alternative cost of a discard for every player's spells (Dream Halls).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { altCostsFor, applyAction, botActions, castProblem, controllerOf, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions are answered as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 2000 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const moveTo = (zone: "graveyard" | "hand" | "library" | "exile") => (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const toHand = moveTo("hand");
const toLibrary = moveTo("library");
const zone = (s: GameState, id: ObjectId) => s.objects[id]?.zone;
/** Every permanent `pid` controls goes to the graveyard (so the board holds only what a test puts there). */
const clearBoard = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield.filter((b) => s.objects[b]!.controller === pid)) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "graveyard";
    s.players[pid]!.graveyard.push(id);
  }
  invalidateCharacteristics(s);
};
const token = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.isToken = true;
  return id;
};

const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3", colors: ["R"] });
const giant = card("Test Giant", "Creature — Giant", "{5}{R}", { cmc: 6, power: "6", toughness: "6", colors: ["R"] });
const elf = card("Test Elf", "Creature — Elf", "{G}", { cmc: 1, power: "1", toughness: "1", colors: ["G"] });
const growth = card("Test Growth", "Sorcery", "{1}{G}", { cmc: 2, oracleText: "You gain 3 life.", colors: ["G"] });
const golem = card("Test Golem", "Artifact Creature — Golem", "{3}", { cmc: 3, power: "3", toughness: "3" });
const hybrid = card("Test Hybrid", "Creature — Elf Wizard", "{G}{U}", { cmc: 2, power: "2", toughness: "2", colors: ["G", "U"] });
const rock = card("Test Rock", "Artifact", "{1}", { cmc: 1 });
const shrine = card("Test Shrine", "Enchantment", "{1}{W}", { cmc: 2, colors: ["W"] });

// Real oracle text (Scryfall).
const emergent = (): CardDef => ({"oracleId":"0eecdfb3-3b05-4051-a660-060ff6df80ef","name":"Emergent Ultimatum","manaCost":"{B}{B}{G}{G}{G}{U}{U}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for up to three monocolored cards with different names and exile them. An opponent chooses one of those cards. Shuffle that card into your library. You may cast the other cards without paying their mana costs. Exile Emergent Ultimatum.","colors":["B","G","U"],"colorIdentity":["B","G","U"],"keywords":[],"commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const auction = (): CardDef => ({"oracleId":"230ee0b4-eb75-457f-b171-72d585cfb5aa","name":"Thieves' Auction","manaCost":"{4}{R}{R}{R}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile all nontoken permanents. Starting with you, each player chooses one of the exiled cards and puts it onto the battlefield tapped under their control. Repeat this process until all cards exiled this way have been chosen.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const warp = (): CardDef => ({"oracleId":"50a228a2-c8b6-4416-b0ab-417926a9b9b6","name":"Warp World","manaCost":"{5}{R}{R}{R}","cmc":8,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player shuffles all permanents they own into their library, then reveals that many cards from the top of their library. Each player puts all artifact, creature, and land cards revealed this way onto the battlefield, then does the same for enchantment cards, then puts all cards revealed this way that weren't put onto the battlefield on the bottom of their library.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const halls = (): CardDef => ({"oracleId":"d901e17f-a5f4-49d9-8a6d-ab771949af24","name":"Dream Halls","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Rather than pay the mana cost for a spell, its controller may discard a card that shares a color with that spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"sth","releasedAt":"1998-03-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sprawl = (): CardDef => ({"oracleId":"00d8efa6-a2d9-4249-8da7-b45173675329","name":"Utopia Sprawl","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant Forest\nAs this Aura enters, choose a color.\nWhenever enchanted Forest is tapped for mana, its controller adds an additional one mana of the chosen color.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

describe("round 376: compiles", () => {
  it("every card of the round", () => supported(emergent(), auction(), warp(), halls()));
});

describe("Emergent Ultimatum", () => {
  const begin = () => {
    const { s: s0, ap, ids } = setup([emergent()]);
    const lib = { ogre: toLibrary(s0, ap, ogre), giant: toLibrary(s0, ap, giant), elf: toLibrary(s0, ap, elf), golem: toLibrary(s0, ap, golem), hybrid: toLibrary(s0, ap, hybrid) };
    return { s0, ap, e: ids[0]!, lib };
  };

  it("finds only monocolored cards; the opponent shuffles one back; the others are cast for free; then it's exiled", () => {
    const { s0, ap, e, lib } = begin();
    let s = settle(run(s0, planCast(s0, ap, e)), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 3 });
    const offered = (s.pending as { cards: string[] }).cards;
    // Colorless and multicolored cards aren't monocolored (CR 105.2).
    expect(offered).toContain(lib.ogre);
    expect(offered).not.toContain(lib.golem);
    expect(offered).not.toContain(lib.hybrid);
    s = act(s, { type: "searchLibrary", player: ap, found: [lib.ogre, lib.giant, lib.elf] });
    expect(zone(s, lib.ogre)).toBe("exile");
    expect(zone(s, lib.giant)).toBe("exile");
    // We choose the opponent, who chooses (a bot sends back the best of them, the Giant).
    if (s.pending?.kind === "chooseOption" && s.pending.player === ap) s = act(s, { type: "chooseOption", player: ap, choice: (s.pending as { options: string[] }).options[0]! });
    s = settle(s, ap);
    expect(zone(s, lib.giant)).toBe("library");
    // The other two may be cast, one at a time, for free.
    for (let i = 0; i < 2; i++) {
      const p = s.pending;
      if (p?.kind === "chooseOption" && p.what === "castFromAmong") s = act(s, { type: "chooseOption", player: ap, choice: p.options.find((o) => o === lib.ogre || o === lib.elf)! });
      expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
      const id = (s.pending as { objectId: string }).objectId;
      s = settle(run(s, planCast(s, ap, id)), ap);
    }
    expect(zone(s, lib.ogre)).toBe("battlefield");
    expect(zone(s, lib.elf)).toBe("battlefield");
    expect(zone(s, e)).toBe("exile");
  });

  it("with only one card found, that card is shuffled back and nothing is cast", () => {
    const { s0, ap, e, lib } = begin();
    let s = settle(run(s0, planCast(s0, ap, e)), ap);
    s = act(s, { type: "searchLibrary", player: ap, found: [lib.ogre] });
    s = settle(s, ap);
    expect(s.pending).toBeFalsy();
    expect(zone(s, lib.ogre)).toBe("library");
    expect(zone(s, e)).toBe("exile");
  });

  it("a card not cast stays in exile", () => {
    const { s0, ap, e, lib } = begin();
    let s = settle(run(s0, planCast(s0, ap, e)), ap);
    s = act(s, { type: "searchLibrary", player: ap, found: [lib.ogre, lib.elf] });
    if (s.pending?.kind === "chooseOption" && s.pending.player === ap) s = act(s, { type: "chooseOption", player: ap, choice: (s.pending as { options: string[] }).options[0]! });
    s = settle(s, ap);
    // One went back; the other is offered and declined.
    const kept = zone(s, lib.ogre) === "exile" ? lib.ogre : lib.elf;
    // The one left is offered, and we're done without casting it.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong", options: [kept, "none"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }), ap);
    expect(zone(s, kept)).toBe("exile");
    expect(zone(s, e)).toBe("exile");
  });
});

describe("Thieves' Auction", () => {
  it("exiles every nontoken permanent; the players take turns, from the caster, putting them onto the battlefield tapped", () => {
    const { s: s0, ap, ids } = setup([auction()]);
    const order = [...s0.turnOrder.slice(s0.turnOrder.indexOf(ap)), ...s0.turnOrder.slice(0, s0.turnOrder.indexOf(ap))];
    const theirs = putOnBattlefield(s0, order[1]!, giant);
    const tok = token(s0, order[2]!, elf);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const before = s.battlefield.filter((b) => !s.objects[b]!.isToken).length;
    expect(before).toBe(15);
    s = settle(s);
    expect(s.pending).toBeFalsy();
    // The token stayed; every card is back, tapped.
    expect(zone(s, tok)).toBe("battlefield");
    const back = s.battlefield.filter((b) => !s.objects[b]!.isToken);
    expect(back.length).toBe(before);
    expect(back.every((b) => s.objects[b]!.tapped)).toBe(true);
    // 15 cards, 4 players from the caster: 4, 4, 4 and 3.
    const n = (pid: PlayerId) => back.filter((b) => controllerOf(s, s.objects[b]!) === pid).length;
    expect(order.map(n)).toEqual([4, 4, 4, 3]);
    // The caster chose first, and a bot takes the Giant.
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(s.players[ap]!.graveyard).toContain(ids[0]!);
  });

  it("an Aura can be chosen only once there's something it could enchant", () => {
    const { s: s0, ap, ids } = setup([auction()]);
    // Our Forests are the only Forests: Utopia Sprawl on one of them.
    const forest = s0.battlefield.find((b) => s0.cards[s0.objects[b]!.cardId]!.name === "Forest")!;
    const aura = putOnBattlefield(s0, ap, sprawl());
    s0.objects[aura]!.attachedTo = forest;
    s0.objects[aura]!.chosen = { color: "G" };
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, exiled: true });
    const offered = (s.pending as { cards: string[] }).cards;
    expect(offered).toContain(forest);
    expect(offered).not.toContain(aura);
    s = act(s, { type: "searchLibrary", player: ap, found: [forest] });
    // Once a Forest is back, the Aura can be chosen (a bot takes it): it enters attached to a Forest, tapped.
    s = settle(s);
    expect(zone(s, aura)).toBe("battlefield");
    expect(s.objects[aura]!.tapped).toBe(true);
    expect(s.cards[s.objects[s.objects[aura]!.attachedTo!]!.cardId]!.name).toBe("Forest");
  });

  it("an Aura with nothing to enchant stays exiled, and so does a card that can't be a permanent", () => {
    const { s: s0, ap, ids } = setup([auction()]);
    clearBoard(s0, ap);
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 3, G: 0, C: 4 };
    // A manifested Lightning Bolt with Pacifism on it: exiled, the Bolt is an instant card (CR 403.4), and nothing is left
    // for Pacifism to enchant.
    const fd = putOnBattlefield(s0, ap, bolt());
    s0.objects[fd]!.faceDown = "manifest";
    const p = putOnBattlefield(s0, ap, pacifism());
    s0.objects[p]!.attachedTo = fd;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeFalsy();
    expect(zone(s, p)).toBe("exile");
    expect(zone(s, fd)).toBe("exile");
    expect(s.log.some((l) => /stay exiled/.test(l.text))).toBe(true);
  });
});

describe("Warp World", () => {
  const begin = (lib: CardDef[], tokens: number) => {
    const { s: s0, ap, ids } = setup([warp()]);
    clearBoard(s0, ap);
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 3, G: 0, C: 5 };
    s0.players[ap]!.library = [];
    const put = lib.map((d) => toLibrary(s0, ap, d));
    for (let i = 0; i < tokens; i++) token(s0, ap, elf);
    return { s0, ap, w: ids[0]!, put };
  };

  it("tokens count but aren't revealed; creatures, then enchantments enter, an Aura on a creature; the rest goes on the bottom", () => {
    const { s0, ap, w, put } = begin([ogre, shrine, pacifism(), bolt()], 4);
    let s = settle(run(s0, planCast(s0, ap, w)), ap);
    // Two cards left for the bottom: we order them.
    if (s.pending?.kind === "arrangeTop") s = settle(s);
    expect(s.pending).toBeFalsy();
    const [o, sh, pac, b] = put;
    expect(zone(s, o!)).toBe("battlefield");
    expect(zone(s, sh!)).toBe("battlefield");
    expect(zone(s, pac!)).toBe("battlefield");
    expect(s.objects[pac!]!.attachedTo).toBe(o);
    expect(zone(s, b!)).toBe("library");
    expect(s.battlefield.filter((x) => s.objects[x]!.isToken)).toEqual([]);
  });

  it("an Aura with no creature to enchant goes on the bottom with the sorcery", () => {
    const { s0, ap, w, put } = begin([pacifism(), bolt(), rock], 3);
    let s = run(s0, planCast(s0, ap, w));
    s = settle(s);
    expect(s.pending).toBeFalsy();
    const [pac, b, r] = put;
    expect(zone(s, r!)).toBe("battlefield");
    expect(zone(s, pac!)).toBe("library");
    expect(zone(s, b!)).toBe("library");
    expect(s.players[ap]!.library.length).toBe(2);
  });

  it("a commander goes to the command zone instead, and still counts", () => {
    const { s0, ap, w, put } = begin([ogre, giant], 0);
    const cmd = Object.values(s0.objects).find((o) => o.isCommander && o.owner === ap && o.zone === "command")!;
    s0.players[ap]!.command = s0.players[ap]!.command.filter((x) => x !== cmd.id);
    cmd.zone = "battlefield";
    s0.battlefield.push(cmd.id);
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, w)));
    expect(zone(s, cmd.id)).toBe("command");
    // One permanent counted: one of the two library cards is revealed and enters.
    expect(put.filter((id) => zone(s, id) === "battlefield").length).toBe(1);
  });
});

describe("Dream Halls", () => {
  const begin = () => {
    const { s: s0, ap, ids, opp } = setup([giant, ogre, elf, rock]);
    // Dream Halls is an opponent's: it works for every player.
    putOnBattlefield(s0, opp, halls());
    // No mana at all.
    for (const b of s0.battlefield) if (s0.objects[b]!.controller === ap) s0.objects[b]!.tapped = true;
    invalidateCharacteristics(s0);
    const [g, o, e, r] = ids as [string, string, string, string];
    return { s0, ap, opp, g, o, e, r };
  };

  it("a spell is cast by discarding a card that shares a color with it, instead of its mana cost", () => {
    const { s0, ap, g, o } = begin();
    expect(altCostsFor(s0, ap, s0.objects[g]!).some((a) => a.kind === "dreamHalls")).toBe(true);
    let s = run(s0, planCast(s0, ap, g, undefined, undefined, "auto", undefined, { alt: "dreamHalls", discard: [o] }));
    expect(zone(s, o)).toBe("graveyard");
    s = settle(s, ap);
    expect(zone(s, g)).toBe("battlefield");
  });

  it("not with a card of another color, nor for a colorless spell, nor once Dream Halls is gone", () => {
    const { s0, ap, g, e, r, opp } = begin();
    expect(castProblem(s0, ap, g, undefined, undefined, undefined, undefined, undefined, { alt: "dreamHalls", discard: [e] })).toBeTruthy();
    expect(altCostsFor(s0, ap, s0.objects[r]!).some((a) => a.kind === "dreamHalls")).toBe(false);
    const hallsId = s0.battlefield.find((b) => s0.objects[b]!.controller === opp && s0.cards[s0.objects[b]!.cardId]!.name === "Dream Halls")!;
    s0.battlefield.splice(s0.battlefield.indexOf(hallsId), 1);
    s0.objects[hallsId]!.zone = "graveyard";
    s0.players[opp]!.graveyard.push(hallsId);
    invalidateCharacteristics(s0);
    expect(altCostsFor(s0, ap, s0.objects[g]!).some((a) => a.kind === "dreamHalls")).toBe(false);
  });

  it("additional costs are still paid: a commander's tax", () => {
    const { s0, ap } = begin();
    const cmd = Object.values(s0.objects).find((o) => o.isCommander && o.owner === ap && o.zone === "command")!;
    s0.players[ap]!.commanderCasts = { ...s0.players[ap]!.commanderCasts, [cmd.id]: 1 };
    const e = s0.players[ap]!.hand.find((h) => s0.cards[s0.objects[h]!.cardId]!.name === "Test Elf")!;
    // Tax {2} and no mana: can't.
    expect(planCast(s0, ap, cmd.id, undefined, undefined, "auto", undefined, { alt: "dreamHalls", discard: [e] })).toBeNull();
  });

  it("a bot uses it when it can't pay the mana cost", () => {
    const { s0, ap, g, o } = begin();
    // Only the Giant, the Ogre to discard and nothing else to do.
    for (const h of s0.players[ap]!.hand.filter((x) => x !== g && x !== o)) {
      s0.objects[h]!.zone = "graveyard";
      s0.players[ap]!.graveyard.push(h);
    }
    s0.players[ap]!.hand = [g, o];
    const acts = botActions(s0, ap);
    const castIt = acts.find((a) => a.type === "castSpell" && a.objectId === g);
    expect(castIt?.type === "castSpell" && castIt.alt).toBe("dreamHalls");
  });
});
