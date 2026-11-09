// Round 321 (Lane A, skip-list cards): artifacts destroyed, then a creature from the exiled top cards with haste until the
// end step (Anzrag's Rampage); a vote to return two cards each and exile the spell, or to wheel (Sail into the West); a
// Saga and/or a land from the milled cards onto the battlefield (Eivor, Wolf-Kissed); +X/+X for the equipped creature or
// Vecna, and an equip cost of life for each card in hand (Hand of Vecna); a stolen creature a land damages at the end
// step (Swooping Pteranodon).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, controllerOf, objHasKeyword, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes and lets bots answer until `done`, or until `me` is asked something. */
const until = (s: GameState, me: PlayerId, done: (s: GameState) => boolean) => {
  for (let i = 0; i < 2000 && !done(s); i++) {
    const p = s.pending;
    if (p && p.player === me && p.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: me, attacks: [] });
    else if (p && p.player === me) return s;
    else s = p ? act(s, botActions(s, p.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A copy of `def` in `pid`'s hand, graveyard or library (on top). */
const inZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const nextOf = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % s.turnOrder.length]!;

// Real oracle text (Scryfall).
const anzrag = (): CardDef => ({"oracleId":"ce690a21-8117-420e-be00-cd6d9923a812","name":"Anzrag's Rampage","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all artifacts you don't control, then exile the top X cards of your library, where X is the number of artifacts that were put into graveyards from the battlefield this turn. You may put a creature card exiled this way onto the battlefield. It gains haste. Return it to your hand at the beginning of the next end step.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14ba0604-3d9d-4f68-9086-6c7bf85a1354.jpg?1783912809","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14ba0604-3d9d-4f68-9086-6c7bf85a1354.jpg?1783912809","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const sail = (): CardDef => ({"oracleId":"0a8956d0-bd37-4305-8443-4df043796f6e","name":"Sail into the West","manaCost":"{2}{G}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Will of the council — Starting with you, each player votes for return or embark. If return gets more votes, each player returns up to two cards from their graveyard to their hand, then you exile Sail into the West. If embark gets more votes or the vote is tied, each player may discard their hand and draw seven cards.","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Will of the council"],"imageUrl":"https://cards.scryfall.io/normal/front/9/5/95d37419-7fff-4849-9725-3c79e44627a7.jpg?1783915975","artUrl":"https://cards.scryfall.io/art_crop/front/9/5/95d37419-7fff-4849-9725-3c79e44627a7.jpg?1783915975","commanderLegal":"legal","set":"ltc","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const eivor = (): CardDef => ({"oracleId":"cb8289e9-1e59-41f1-a994-6e34d2da2da2","name":"Eivor, Wolf-Kissed","manaCost":"{3}{R}{G}{W}","cmc":6,"typeLine":"Legendary Creature — Human Assassin Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Assassin","Warrior"],"oracleText":"Trample, haste\nWhenever Eivor deals combat damage to a player, you mill that many cards. You may put a Saga card and/or a land card from among them onto the battlefield.","power":"7","toughness":"6","colors":["G","R","W"],"colorIdentity":["G","R","W"],"keywords":["Haste","Trample","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/88667198-3bec-413c-b41e-de96abc8db7b.jpg?1783910972","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/88667198-3bec-413c-b41e-de96abc8db7b.jpg?1783910972","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const vecna = (): CardDef => ({"oracleId":"3b7f0dd3-5b4c-4ac0-a43a-ddc62a44663e","name":"Hand of Vecna","manaCost":"{3}","cmc":3,"typeLine":"Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"At the beginning of combat on your turn, equipped creature or a creature you control named Vecna gets +X/+X until end of turn, where X is the number of cards in your hand.\nEquip—Pay 1 life for each card in your hand.\nEquip {2}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/f/f/ff0502e4-508a-4d78-b987-0801e6b0978c.jpg?1783926383","artUrl":"https://cards.scryfall.io/art_crop/front/f/f/ff0502e4-508a-4d78-b987-0801e6b0978c.jpg?1783926383","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const ptera = (): CardDef => ({"oracleId":"0b1f6e77-55db-4638-9030-3f4e4d37eb1b","name":"Swooping Pteranodon","manaCost":"{3}{R}{W}","cmc":5,"typeLine":"Creature — Dinosaur","supertypes":[],"types":["Creature"],"subtypes":["Dinosaur"],"oracleText":"Flying, haste\nWhenever this creature or another Dinosaur you control with flying enters, gain control of target creature an opponent controls until end of turn. Untap that creature. It gains flying and haste until end of turn. At the beginning of the next end step, target land deals 3 damage to that creature.","power":"3","toughness":"3","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Flying","Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/43aa5d97-7483-4f90-998d-70732a7ae1dc.jpg?1783913633","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/43aa5d97-7483-4f90-998d-70732a7ae1dc.jpg?1783913633","commanderLegal":"legal","set":"rex","releasedAt":"2023-11-17","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const eldest = (): CardDef => ({"oracleId":"44ed4c0c-a012-4895-a547-b04150553bba","name":"The Eldest Reborn","manaCost":"{4}{B}","cmc":5,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Each opponent sacrifices a creature or planeswalker of their choice.\nII — Each opponent discards a card.\nIII — Put target creature or planeswalker card from a graveyard onto the battlefield under your control.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/8/c8318f40-ecd5-429e-8fe2-febf31f64841.jpg?1783935009","artUrl":"https://cards.scryfall.io/art_crop/front/c/8/c8318f40-ecd5-429e-8fe2-febf31f64841.jpg?1783935009","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"uncommon","layout":"saga","gameChanger":false} as CardDef);
const jace = (): CardDef => ({"oracleId":"2274c7ae-5a40-4fd4-a4ac-6f56b23034e4","name":"Jace, Architect of Thought","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+1: Until your next turn, whenever a creature an opponent controls attacks, it gets -1/-0 until end of turn.\n−2: Reveal the top three cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other on the bottom of your library in any order.\n−8: For each player, search that player's library for a nonland card and exile it, then that player shuffles. You may cast those cards without paying their mana costs.","loyalty":"4","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/4/5410254f-cf9d-46c2-acea-07298ae65924.jpg?1783939503","artUrl":"https://cards.scryfall.io/art_crop/front/5/4/5410254f-cf9d-46c2-acea-07298ae65924.jpg?1783939503","commanderLegal":"legal","set":"ddm","releasedAt":"2014-03-14","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const nuka = (): CardDef => ({"oracleId":"7fb88a5d-9b72-4da9-ade4-d09cadd7e1cb","name":"Nuka-Nuke Launcher","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +3/+0 and has intimidate. (It can't be blocked except by artifact creatures and/or creatures that share a color with it.)\nWhenever equipped creature attacks, until the end of defending player's next turn, that player gets two rad counters whenever they cast a spell.\nEquip {3}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/6/8/68d5835b-c206-4884-bdcf-38c7cdc703f4.jpg?1783912377","artUrl":"https://cards.scryfall.io/art_crop/front/6/8/68d5835b-c206-4884-bdcf-38c7cdc703f4.jpg?1783912377","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const surveil = (): CardDef => ({"oracleId":"4fd061f2-7269-4eea-bc7c-95a123893efa","name":"Curse of Surveillance","manaCost":"{4}{U}","cmc":5,"typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nAt the beginning of enchanted player's upkeep, any number of target players other than that player each draw cards equal to the number of Curses attached to that player.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/503e4738-9878-460e-890f-703b3c452cda.jpg?1783924450","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/503e4738-9878-460e-890f-703b3c452cda.jpg?1783924450","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bear = (name: string) => card(name, "Creature — Bear", "{1}{G}", { cmc: 2, power: "2", toughness: "2" });
const rock = (name: string) => card(name, "Artifact", "{2}", { cmc: 2 });

describe("round 321", () => {
  it("are fully supported", () => supported(anzrag(), sail(), eivor(), vecna(), ptera(), jace(), nuka(), surveil()));
});

describe("round 321: Anzrag's Rampage", () => {
  const scene = () => {
    const { s, ap, ids, opp } = setup([anzrag()]);
    const o2 = nextOf(s, opp);
    const mine = putOnBattlefield(s, ap, rock("My Rock"));
    const theirs = [putOnBattlefield(s, opp, rock("Rock A")), putOnBattlefield(s, o2, rock("Rock B"))];
    // The top of the library: a land, then a creature card (the top two are exiled: two artifacts went to graveyards).
    const giant = inZone(s, ap, bear("Hill Giant"), "library");
    const top = inZone(s, ap, card("Wastes", "Basic Land"), "library");
    return { s, ap, spell: ids[0]!, mine, theirs, giant, top };
  };

  it("destroys the artifacts you don't control, exiles that many cards and puts the creature onto the battlefield with haste until the end step", () => {
    const { s: s0, ap, spell, mine, theirs, giant, top } = scene();
    let s = settle(run(s0, planCast(s0, ap, spell, [])), ap);
    expect(theirs.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    expect(s.objects[mine]!.zone).toBe("battlefield");
    // X = 2: the top two cards exiled; only the creature card can be put onto the battlefield.
    expect([top, giant].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [giant], min: 0, max: 1 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [giant] }), ap);
    expect(s.objects[giant]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[giant]!)).toBe(ap);
    expect(objHasKeyword(s, s.objects[giant]!, "Haste")).toBe(true);
    expect(s.objects[top]!.zone).toBe("exile");
    // It can attack this turn (haste), then returns to its owner's hand at the beginning of the next end step.
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: giant, defender: nextOf(s, ap) }] });
    expect(s.objects[giant]!.attacking).toBeTruthy();
    s = until(s, ap, (x) => x.step === "end" && !x.stack.length && !x.triggerQueue.length && x.objects[giant]!.zone !== "battlefield");
    s = settle(s, ap);
    expect(s.objects[giant]!.zone).toBe("hand");
  });

  it("counts every artifact put into a graveyard from the battlefield this turn, and you may put none onto the battlefield", () => {
    const { s: s0, ap, spell, giant } = scene();
    s0.turnLog!.artifactsToYard = 1;
    let s = settle(run(s0, planCast(s0, ap, spell, [])), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [giant] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }), ap);
    expect(s.objects[giant]!.zone).toBe("exile");
  });
});

describe("round 321: Sail into the West", () => {
  /** Every player votes `option` (in turn order from you). */
  const voteAll = (s: GameState, option: string) => {
    for (let i = 0; i < 4; i++) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote" });
      s = act(s, { type: "chooseOption", player: s.pending!.player, choice: option });
    }
    return s;
  };

  it("return: each player returns up to two cards from their graveyard, then the spell is exiled", () => {
    const { s: s0, ap, ids, opp } = setup([sail()]);
    const mine = [inZone(s0, ap, bear("Bear A"), "graveyard"), inZone(s0, ap, bear("Bear B"), "graveyard"), inZone(s0, ap, bear("Bear C"), "graveyard")];
    const theirs = inZone(s0, opp, bear("Bear D"), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!, []));
    s = settle(s, ap);
    // Votes are cast in turn order, starting with you.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: ap });
    s = voteAll(s, "return");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 2 });
    s = act(s, { type: "searchLibrary", player: ap, found: [mine[0]!, mine[2]!] });
    s = settle(s, ap);
    expect(mine.map((id) => s.objects[id]!.zone)).toEqual(["hand", "graveyard", "hand"]);
    expect(s.objects[theirs]!.zone).toBe("hand");
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });

  it("embark (or a tie): each player may discard their hand and draw seven, and the spell goes to the graveyard", () => {
    const { s: s0, ap, ids } = setup([sail(), bear("Kept")]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [])), ap);
    s = voteAll(s, "embark");
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, ap);
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(7);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});

describe("round 321: Eivor, Wolf-Kissed", () => {
  const attack = () => {
    const { s, ap, opp } = setup([]);
    const eivorId = putOnBattlefield(s, ap, eivor());
    // The top cards: a Saga, a land, three bears, then the deck's.
    const cards = [inZone(s, ap, bear("Bear 3"), "library"), inZone(s, ap, bear("Bear 2"), "library"), inZone(s, ap, bear("Bear 1"), "library"), inZone(s, ap, card("Wastes", "Basic Land"), "library"), inZone(s, ap, eldest(), "library")];
    let x = passUntil(s, "declareAttackers", ap);
    x = act(x, { type: "declareAttackers", player: ap, attacks: [{ attacker: eivorId, defender: opp }] });
    x = until(x, ap, (y) => y.step === "main2");
    return { s: x, ap, opp, saga: cards[4]!, wastes: cards[3]!, bears: cards.slice(0, 3) };
  };

  it("mills that many cards, then a Saga card and a land card from among them enter together", () => {
    const { s: s0, ap, saga, wastes, bears } = attack();
    expect(s0.pending).toMatchObject({ kind: "searchLibrary", player: ap, what: "a Saga card", cards: [saga], min: 0, max: 1 });
    expect([saga, wastes, ...bears].map((id) => s0.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard", "graveyard", "graveyard"]);
    expect(s0.players[ap]!.graveyard.length).toBe(7);
    let s = act(s0, { type: "searchLibrary", player: ap, found: [saga] });
    // Every land card milled (Eivor deals its power, 7, so seven cards: the deck's Forests too).
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, what: "a land card" });
    expect((s.pending as { cards: string[] }).cards).toContain(wastes);
    // Nothing has entered yet.
    expect(s.objects[saga]!.zone).toBe("graveyard");
    s = act(s, { type: "searchLibrary", player: ap, found: [wastes] });
    expect(s.objects[saga]!.zone).toBe("battlefield");
    expect(s.objects[wastes]!.zone).toBe("battlefield");
    expect(bears.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
  });

  it("either or both may be left in the graveyard", () => {
    const { s: s0, ap, saga, wastes } = attack();
    let s = act(s0, { type: "searchLibrary", player: ap, found: [] });
    s = act(s, { type: "searchLibrary", player: ap, found: [wastes] });
    expect(s.objects[saga]!.zone).toBe("graveyard");
    expect(s.objects[wastes]!.zone).toBe("battlefield");
  });
});

describe("round 321: Hand of Vecna", () => {
  it("costs 1 life for each card in your hand to equip", () => {
    const { s: s0, ap } = setup([bear("H1"), bear("H2"), bear("H3")]);
    const hand = putOnBattlefield(s0, ap, vecna());
    const b = putOnBattlefield(s0, ap, bear("Holder"));
    const life = s0.players[ap]!.life;
    const cards = s0.players[ap]!.hand.length;
    const plan = planActivate(s0, ap, hand, 0, [target(b)]);
    const s = settle(run(s0, plan), ap);
    expect(s.objects[hand]!.attachedTo).toBe(b);
    expect(cards).toBeGreaterThan(3);
    expect(s.players[ap]!.life).toBe(life - cards);
  });

  it("at the beginning of combat on your turn, the equipped creature gets +X/+X for the cards in your hand", () => {
    const { s: s0, ap } = setup([bear("H1"), bear("H2")]);
    const hand = putOnBattlefield(s0, ap, vecna());
    const b = putOnBattlefield(s0, ap, bear("Holder"));
    s0.objects[hand]!.attachedTo = b;
    invalidateCharacteristics(s0);
    const n = s0.players[ap]!.hand.length;
    const s = until(s0, ap, (x) => x.step === "beginCombat" && !x.stack.length && !x.triggerQueue.length && pt(x, b) !== "2/2");
    expect(pt(s, b)).toBe(`${2 + n}/${2 + n}`);
  });

  it("with Vecna too, you choose which one gets it as it resolves", () => {
    const { s: s0, ap } = setup([bear("H1")]);
    const hand = putOnBattlefield(s0, ap, vecna());
    const b = putOnBattlefield(s0, ap, bear("Holder"));
    const v = putOnBattlefield(s0, ap, card("Vecna", "Legendary Creature — God", "", { power: "8", toughness: "8" }));
    s0.objects[hand]!.attachedTo = b;
    invalidateCharacteristics(s0);
    let s = until(s0, ap, (x) => x.step === "main2");
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "impulseChoice", options: [b, v] });
    const n = s.players[ap]!.hand.length;
    s = act(s, { type: "chooseOption", player: ap, choice: v });
    expect(pt(s, v)).toBe(`${8 + n}/${8 + n}`);
    expect(pt(s, b)).toBe("2/2");
  });
});

describe("round 321: Swooping Pteranodon", () => {
  it("steals a creature until end of turn, then a target land deals 3 damage to it at the beginning of the next end step", () => {
    const { s: s0, ap, ids, opp } = setup([ptera()]);
    const victim = putOnBattlefield(s0, opp, card("Big Cat", "Creature — Cat", "{3}", { power: "4", toughness: "4" }));
    s0.objects[victim]!.tapped = true;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [])), ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(victim)] });
    s = settle(s, ap);
    expect(controllerOf(s, s.objects[victim]!)).toBe(ap);
    expect(s.objects[victim]!.tapped).toBe(false);
    expect(objHasKeyword(s, s.objects[victim]!, "Flying")).toBe(true);
    expect(objHasKeyword(s, s.objects[victim]!, "Haste")).toBe(true);
    // The land is chosen as the delayed trigger is put on the stack (rulings).
    s = until(s, ap, (x) => x.step === "end" && !x.stack.length && !x.triggerQueue.length && x.objects[victim]!.damage > 0);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const mountain = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Mountain")!;
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(mountain)] });
    s = settle(s, ap);
    expect(s.objects[victim]!.damage).toBe(3);
    expect(s.log.some((l) => /Mountain deals 3 damage to Big Cat/.test(l.text))).toBe(true);
  });
});

describe("round 321: Jace, Architect of Thought", () => {
  it("+1: until your next turn, each creature an opponent controls that attacks gets -1/-0", () => {
    const { s: s0, ap, opp } = setup([]);
    const j = putOnBattlefield(s0, ap, jace());
    s0.objects[j]!.counters.loyalty = 4;
    const theirs = putOnBattlefield(s0, opp, card("Raider", "Creature — Human", "{2}", { power: "3", toughness: "3" }));
    const mine = putOnBattlefield(s0, ap, card("Guard", "Creature — Human", "{2}", { power: "3", toughness: "3" }));
    let s = settle(run(s0, planActivate(s0, ap, j, 0)), ap);
    expect(s.objects[j]!.counters.loyalty).toBe(5);
    s = passUntil(s, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs, defender: ap }] });
    s = settle(s, ap);
    expect(pt(s, theirs)).toBe("2/3");
    expect(s.floatingTriggers?.length).toBe(1);
    // Your own creatures aren't affected, and it ends as your next turn begins.
    expect(pt(s, mine)).toBe("3/3");
    s = passUntil(s, "upkeep", ap);
    expect(s.floatingTriggers?.length ?? 0).toBe(0);
  });

  it("−8: searches each player's library for a nonland card, exiles them all, then you may cast any of them free", () => {
    const { s: s0, ap } = setup([]);
    const j = putOnBattlefield(s0, ap, jace());
    s0.objects[j]!.counters.loyalty = 8;
    const order = [ap, nextOf(s0, ap), nextOf(s0, nextOf(s0, ap)), nextOf(s0, nextOf(s0, nextOf(s0, ap)))];
    const found = order.map((pid, i) => inZone(s0, pid, i === 1 ? divination() : bear(`Lib Bear ${i}`), "library"));
    let s = settle(run(s0, planActivate(s0, ap, j, 2)), ap);
    for (const [i, pid] of order.entries()) {
      expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
      const cards = (s.pending as { cards: string[] }).cards;
      // That player's library, nonland cards only.
      expect(cards).toContain(found[i]);
      expect(cards.every((id) => s.objects[id]!.owner === pid && !s.cards[s.objects[id]!.cardId]!.types.includes("Land"))).toBe(true);
      s = act(s, { type: "searchLibrary", player: ap, found: i === 3 ? [] : [found[i]!] });
    }
    expect(found.slice(0, 3).map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
    expect(s.objects[found[3]!]!.zone).toBe("library");
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong" });
    expect((s.pending as { options: string[] }).options).toEqual(expect.arrayContaining(found.slice(0, 3)));
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "chooseOption", player: ap, choice: found[1]! });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: found[1] });
    s = run(s, planCast(s, ap, found[1]!, []));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong" });
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    s = settle(s, ap);
    // Divination resolved for you (owned by another player, it goes to its owner's graveyard); the bears stay exiled.
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.objects[found[1]!]!.zone).toBe("graveyard");
    expect([found[0]!, found[2]!].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
  });
});

describe("round 321: Nuka-Nuke Launcher", () => {
  it("the defending player gets two rad counters for each spell they cast until the end of their next turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const launcher = putOnBattlefield(s0, ap, nuka());
    const b = putOnBattlefield(s0, ap, bear("Carrier"));
    s0.objects[launcher]!.attachedTo = b;
    invalidateCharacteristics(s0);
    const spell = (pid: PlayerId) => inZone(s0, pid, card(`Spark ${pid}`, "Instant", "{0}", { oracleText: "Draw a card." }), "hand");
    const theirs = [spell(opp), spell(opp)];
    const mine = spell(ap);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = settle(s, ap);
    expect(s.floatingTriggers?.length).toBe(1);
    // Another player's spell doesn't count.
    s = passUntil(s, "main2", ap);
    s = settle(run(s, planCast(s, ap, mine, [], undefined, "auto")), ap);
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.players[ap]!.rad ?? 0).toBe(0);
    expect(s.players[opp]!.rad ?? 0).toBe(0);
    // Their next turn: each spell they cast gives them two.
    s = passUntil(s, "main1", opp);
    for (const [i, id] of theirs.entries()) {
      s = settle(run(s, planCast(s, opp, id, [], undefined, "auto")), ap);
      expect(s.players[opp]!.rad).toBe(2 * (i + 1));
    }
    expect(s.floatingTriggers?.length).toBe(1);
    // It ends with their turn.
    s = passUntil(s, "upkeep", nextOf(s, opp));
    expect(s.floatingTriggers?.length ?? 0).toBe(0);
  });
});

describe("round 321: Curse of Surveillance", () => {
  it("at the enchanted player's upkeep, any number of other target players draw a card for each Curse attached to them", () => {
    const { s: s0, ap, opp } = setup([]);
    const o2 = nextOf(s0, opp);
    const curse = putOnBattlefield(s0, ap, surveil());
    s0.objects[curse]!.attachedToPlayer = opp;
    const other = putOnBattlefield(s0, ap, card("Other Curse", "Enchantment — Aura Curse", "{1}", { oracleText: "Enchant player" }));
    s0.objects[other]!.attachedToPlayer = opp;
    // No discarding at your cleanup: a short hand.
    for (const id of s0.players[ap]!.hand.splice(2)) {
      s0.objects[id]!.zone = "graveyard";
      s0.players[ap]!.graveyard.push(id);
    }
    invalidateCharacteristics(s0);
    let s = until(s0, ap, (x) => x.step === "upkeep" && x.activePlayer === opp && !!x.pending);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // Not the enchanted player.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: ap }, { kind: "player", id: opp }] })).toThrow();
    const hands = [ap, opp, o2].map((p) => s.players[p]!.hand.length);
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: ap }, { kind: "player", id: o2 }] });
    s = settle(s, ap);
    expect([ap, opp, o2].map((p) => s.players[p]!.hand.length)).toEqual([hands[0]! + 2, hands[1]!, hands[2]! + 2]);
  });
});

describe("round 321: bots", () => {
  it("a bot's Curse of Surveillance has only itself draw", () => {
    const { s: s0, ap, opp } = setup([]);
    const o2 = nextOf(s0, opp);
    const curse = putOnBattlefield(s0, o2, surveil());
    s0.objects[curse]!.attachedToPlayer = opp;
    for (const id of s0.players[ap]!.hand.splice(2)) {
      s0.objects[id]!.zone = "graveyard";
      s0.players[ap]!.graveyard.push(id);
    }
    invalidateCharacteristics(s0);
    let s = until(s0, ap, (x) => x.step === "upkeep" && x.activePlayer === opp && (!!x.pending || x.stack.length > 0));
    const hands = [ap, o2].map((p) => s.players[p]!.hand.length);
    s = settle(s, ap);
    expect([ap, o2].map((p) => s.players[p]!.hand.length)).toEqual([hands[0]!, hands[1]! + 1]);
  });
});
