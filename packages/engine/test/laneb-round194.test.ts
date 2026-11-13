// Lane B round B194: Farsight Ritual ("Look at the top four cards of your library. If this spell was bargained, look at
// the top eight cards of your library instead. Put two of them into your hand and the rest on the bottom of your library
// in a random order."), Rubble Rouser ("{T}, Exile a card from your graveyard: Add {R}. When you do, this creature deals 1
// damage to each opponent."), Shaun & Rebecca, Agents ("When Shaun & Rebecca enters, search your graveyard, hand, and
// library for a card named The Animus and put it onto the battlefield, then shuffle." "{T}: Add {C}. When you do, mill two
// cards."), Surtland Flinger ("Whenever this creature attacks, you may sacrifice another creature. When you do, this
// creature deals damage equal to the sacrificed creature's power to any target. If the sacrificed creature was a Giant,
// this creature deals twice that much damage instead."), Cephalid Constable ("Whenever this creature deals combat damage to
// a player, return up to that many target permanents that player controls to their owner's hand."), Spark of Creativity
// ("Choose target creature. Exile the top card of your library. You may have Spark of Creativity deal damage to that
// creature equal to the exiled card's mana value. If you don't, you may play that card until end of turn.") and Karfell
// Harbinger ("{T}: Add {U}. Spend this mana only to foretell a card from your hand or cast an instant or sorcery spell.").

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, characteristics, compileCard, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const farsight = (): CardDef => ({"oracleId":"7de66ba3-6e97-4e0a-928e-7ce45dee278b","name":"Farsight Ritual","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.)\nLook at the top four cards of your library. If this spell was bargained, look at the top eight cards of your library instead. Put two of them into your hand and the rest on the bottom of your library in a random order.","colors":["U"],"colorIdentity":["U"],"keywords":["Bargain"],"imageUrl":"https://cards.scryfall.io/normal/front/c/9/c958257e-fa70-4fa3-90a1-0497967abef3.jpg?1783915120","artUrl":"https://cards.scryfall.io/art_crop/front/c/9/c958257e-fa70-4fa3-90a1-0497967abef3.jpg?1783915120","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rouser = (): CardDef => ({"oracleId":"f35aa497-bd0f-4642-8713-820b9f014da5","name":"Rubble Rouser","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Dwarf Sorcerer","supertypes":[],"types":["Creature"],"subtypes":["Dwarf","Sorcerer"],"oracleText":"When this creature enters, you may discard a card. If you do, draw a card.\n{T}, Exile a card from your graveyard: Add {R}. When you do, this creature deals 1 damage to each opponent.","power":"1","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/a/f/afe61957-a9bb-42b0-98e8-b5fa418cbaff.jpg?1783903665","artUrl":"https://cards.scryfall.io/art_crop/front/a/f/afe61957-a9bb-42b0-98e8-b5fa418cbaff.jpg?1783903665","commanderLegal":"legal","set":"sos","releasedAt":"2026-04-24","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shaun = (): CardDef => ({"oracleId":"795a2b09-2ed1-4bc8-b6c9-fb26a81e6790","name":"Shaun & Rebecca, Agents","manaCost":"{1}{G}{W}{U}","cmc":4,"typeLine":"Legendary Creature — Human Assassin Scientist","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Assassin","Scientist"],"oracleText":"Vigilance\nWhen Shaun & Rebecca enters, search your graveyard, hand, and library for a card named The Animus and put it onto the battlefield, then shuffle.\n{T}: Add {C}. When you do, mill two cards.","power":"4","toughness":"4","colors":["G","U","W"],"colorIdentity":["G","U","W"],"keywords":["Vigilance","Mill"],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/d/9/d90080ea-062b-4b92-89e7-b6dcb2c70a8c.jpg?1783910969","artUrl":"https://cards.scryfall.io/art_crop/front/d/9/d90080ea-062b-4b92-89e7-b6dcb2c70a8c.jpg?1783910969","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const flinger = (): CardDef => ({"oracleId":"f701ada1-e9e1-42ce-9a62-c11bcec03da7","name":"Surtland Flinger","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Creature — Giant Berserker","supertypes":[],"types":["Creature"],"subtypes":["Giant","Berserker"],"oracleText":"Whenever this creature attacks, you may sacrifice another creature. When you do, this creature deals damage equal to the sacrificed creature's power to any target. If the sacrificed creature was a Giant, this creature deals twice that much damage instead.","power":"4","toughness":"6","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/a/4a628052-8175-495f-bfab-eeb3a0388e4e.jpg?1783928121","artUrl":"https://cards.scryfall.io/art_crop/front/4/a/4a628052-8175-495f-bfab-eeb3a0388e4e.jpg?1783928121","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const constable = (): CardDef => ({"oracleId":"a5236bf7-c84f-4c64-bf6b-3a89c05e161a","name":"Cephalid Constable","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Creature — Octopus Wizard","supertypes":[],"types":["Creature"],"subtypes":["Octopus","Wizard"],"oracleText":"Whenever this creature deals combat damage to a player, return up to that many target permanents that player controls to their owner's hand.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/d/6d98f05b-ddfe-4b93-b247-dbd1a89e0731.jpg?1783945130","artUrl":"https://cards.scryfall.io/art_crop/front/6/d/6d98f05b-ddfe-4b93-b247-dbd1a89e0731.jpg?1783945130","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const spark = (): CardDef => ({"oracleId":"22504fd0-0353-4ef0-baf4-4b7be28d1a66","name":"Spark of Creativity","manaCost":"{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose target creature. Exile the top card of your library. You may have Spark of Creativity deal damage to that creature equal to the exiled card's mana value. If you don't, you may play that card until end of turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/1/718bf224-5e1b-439c-a998-ceec5c0a8903.jpg?1783937188","artUrl":"https://cards.scryfall.io/art_crop/front/7/1/718bf224-5e1b-439c-a998-ceec5c0a8903.jpg?1783937188","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const harbinger = (): CardDef => ({"oracleId":"0507a9d2-cbad-4a7b-b888-fbd5ac1ed02f","name":"Karfell Harbinger","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Zombie Wizard","supertypes":[],"types":["Creature"],"subtypes":["Zombie","Wizard"],"oracleText":"{T}: Add {U}. Spend this mana only to foretell a card from your hand or cast an instant or sorcery spell.","power":"1","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/4/9/4911016c-b92a-47cc-9553-b424d7be196a.jpg?1783928260","artUrl":"https://cards.scryfall.io/art_crop/front/4/9/4911016c-b92a-47cc-9553-b424d7be196a.jpg?1783928260","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

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
const attack = (s: GameState, ap: PlayerId, attacker: ObjectId, defender: PlayerId) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] });
const lifeOf = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const opponents = (s: GameState, pid: PlayerId) => s.turnOrder.filter((p) => p !== pid);

describe("Round B194 cards are supported", () => {
  it("compiles all seven", () => supported(farsight(), rouser(), shaun(), flinger(), constable(), spark(), harbinger()));
});

describe("Rubble Rouser: its mana ability adds {R} at once; the reflexive trigger deals 1 damage to each opponent from the stack", () => {
  it("is a mana ability (rulings): the mana is there right away and the damage waits for the stack", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, rouser());
    const fodder = into(s0, ap, card("Test Fodder", "Instant", "{U}"), "graveyard");
    const i = compileCard(rouser()).activated.findIndex((a) => a.mana);
    expect(i).toBeGreaterThanOrEqual(0);
    const lives = opponents(s0, ap).map((p) => lifeOf(s0, p));
    let s = run(s0, planActivate(s0, ap, r, i, undefined, undefined, undefined, undefined, { exileCards: [fodder] }, { mana: "R" }));
    expect(s.players[ap]!.manaPool.R).toBe(1);
    expect(s.objects[fodder]!.zone).toBe("exile");
    expect(s.objects[r]!.tapped).toBe(true);
    // Not yet dealt: the reflexive trigger uses the stack (CR 603.12, 605.5a).
    expect(opponents(s, ap).map((p) => lifeOf(s, p))).toEqual(lives);
    expect(s.stack.length + s.triggerQueue.length).toBe(1);
    s = settle(s);
    expect(opponents(s, ap).map((p) => lifeOf(s, p))).toEqual(lives.map((l) => l - 1));
  });

  it("can't be activated without a card in your graveyard to exile", () => {
    const { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, rouser());
    s.players[ap]!.graveyard = [];
    const i = compileCard(rouser()).activated.findIndex((a) => a.mana);
    expect(planActivate(s, ap, r, i, undefined, undefined, undefined, undefined, { exileCards: [] }, { mana: "R" })).toBeNull();
  });
});

const animus = card("The Animus", "Legendary Artifact", "{2}", { cmc: 2 });
const noLands = (s: GameState, pid: PlayerId) => {
  s.battlefield = s.battlefield.filter((id) => !(controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land")));
  invalidateCharacteristics(s);
};

describe("Shaun & Rebecca, Agents: The Animus from graveyard, hand or library; {T}: Add {C} and mill two from the stack", () => {
  it("as it enters, finds The Animus in its owner's graveyard and puts it onto the battlefield", () => {
    const { s: s0, ap, ids } = setup([shaun()]);
    const a = into(s0, ap, animus, "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [a] }));
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[a]!)).toBe(ap);
  });

  it("finds it in hand too; with none anywhere, nothing is found (CR 701.23b)", () => {
    const { s: s0, ap, ids } = setup([shaun(), animus]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] }));
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    const { s: t0, ap: ap2, ids: ids2 } = setup([shaun()]);
    let t = settle(run(t0, planCast(t0, ap2, ids2[0]!)));
    if (t.pending?.kind === "searchLibrary") t = settle(act(t, { type: "searchLibrary", player: ap2, found: [] }));
    expect(t.objects[ids2[0]!]!.zone).toBe("battlefield");
    expect(t.pending).toBeFalsy();
  });

  it("its {C} is a mana ability (the mill is the reflexive trigger's, CR 605.1a): mana now, two cards milled after", () => {
    const { s: s0, ap } = setup([]);
    const sh = putOnBattlefield(s0, ap, shaun());
    const i = abilitiesOf(s0, s0.objects[sh]!).activated.findIndex((a) => a.mana);
    expect(i).toBeGreaterThanOrEqual(0);
    const yard = s0.players[ap]!.graveyard.length;
    const lib = s0.players[ap]!.library.length;
    let s = run(s0, planActivate(s0, ap, sh, i, undefined, undefined, undefined, undefined, undefined, { mana: "C" }));
    expect(s.players[ap]!.manaPool.C).toBe(1);
    expect(s.players[ap]!.library.length).toBe(lib);
    s = settle(s);
    expect(s.players[ap]!.library.length).toBe(lib - 2);
    expect(s.players[ap]!.graveyard.length).toBe(yard + 2);
  });

  it("pays for a spell, the mill going on the stack once the spell is cast (rulings)", () => {
    const { s: s0, ap, ids } = setup([card("Test Trinket", "Artifact", "{1}", { cmc: 1 })]);
    noLands(s0, ap);
    putOnBattlefield(s0, ap, shaun());
    const lib = s0.players[ap]!.library.length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // The spell, with the mill trigger above it.
    expect(s.stack.length).toBe(2);
    expect(s.stack[0]!.objectId).toBe(ids[0]);
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.players[ap]!.library.length).toBe(lib - 2);
  });
});

describe("Farsight Ritual: four cards, or eight if it was bargained; two of them into your hand, the rest on the bottom", () => {
  const cast = (bargain: boolean) => {
    const { s: s0, ap, ids } = setup([farsight()]);
    const rock = putOnBattlefield(s0, ap, card("Test Rock", "Artifact", "{1}", { cmc: 1 }));
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, bargain ? { bargain: rock } : undefined));
    for (let i = 0; i < 10 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, rock };
  };
  it("not bargained: the top four, two of them chosen", () => {
    const { s: s0, ap } = cast(false);
    const top = s0.players[ap]!.library.slice(0, 4);
    expect(s0.pending).toMatchObject({ kind: "searchLibrary", min: 2, max: 2 });
    expect(s0.pending?.kind === "searchLibrary" && [...s0.pending.cards].sort()).toEqual([...top].sort());
    const hand = s0.players[ap]!.hand.length;
    const s = settle(act(s0, { type: "searchLibrary", player: ap, found: top.slice(1, 3) }));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([top[0]!, top[3]!].sort());
  });
  it("bargained (a sacrificed artifact): the top eight, still two of them (rulings)", () => {
    const { s: s0, ap, rock } = cast(true);
    expect(s0.objects[rock]!.zone).toBe("graveyard");
    const top = s0.players[ap]!.library.slice(0, 8);
    expect(s0.pending).toMatchObject({ kind: "searchLibrary", min: 2, max: 2 });
    expect(s0.pending?.kind === "searchLibrary" && [...s0.pending.cards].sort()).toEqual([...top].sort());
    const s = settle(act(s0, { type: "searchLibrary", player: ap, found: [top[6]!, top[7]!] }));
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([top[6], top[7]]));
    expect(s.players[ap]!.library.slice(-6).sort()).toEqual(top.slice(0, 6).sort());
  });
});

const giant = (name = "Test Giant", p = "3") => card(name, "Creature — Giant", "{2}{R}", { power: p, toughness: "3" });
const elf = card("Test Elf", "Creature — Elf", "{1}{G}", { power: "4", toughness: "1" });

describe("Surtland Flinger: sacrifice another creature as the attack trigger resolves; the reflexive damage is its power, twice for a Giant", () => {
  const go = (fodder: CardDef, sac: boolean) => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, flinger());
    const g = putOnBattlefield(s0, ap, fodder);
    let s = settle(attack(s0, ap, f, opp));
    expect(s.pending).toMatchObject({ kind: "chooseMay", prompt: "sacrifice another creature" });
    s = act(s, { type: "chooseMay", player: ap, yes: sac });
    // The target is chosen after the sacrifice, as the reflexive trigger is put on the stack (rulings).
    s = settle(s, { targets: [{ kind: "player", id: opp }] });
    return { s, opp, g };
  };
  it("a Giant: twice its power", () => {
    const { s, opp, g } = go(giant(), true);
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(lifeOf(s, opp)).toBe(40 - 6);
  });
  it("another creature: its power", () => {
    const { s, opp, g } = go(elf, true);
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(lifeOf(s, opp)).toBe(40 - 4);
  });
  it("a changeling is a Giant (CR 702.73a); declining does nothing", () => {
    const shifter = card("Test Shifter", "Creature — Shapeshifter", "{1}", { power: "2", toughness: "2", keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" });
    const { s, opp } = go(shifter, true);
    expect(lifeOf(s, opp)).toBe(40 - 4);
    const { s: t, opp: o2, g } = go(elf, false);
    expect(t.objects[g]!.zone).toBe("battlefield");
    expect(lifeOf(t, o2)).toBe(40);
  });
  it("the power as it was sacrificed (rulings): a pumped Giant counts its pumped power", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, flinger());
    const g = putOnBattlefield(s0, ap, giant("Test Big Giant", "1"));
    s0.objects[g]!.counters = { "+1/+1": 2 };
    invalidateCharacteristics(s0);
    let s = settle(attack(s0, ap, f, opp));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { targets: [{ kind: "player", id: opp }] });
    expect(lifeOf(s, opp)).toBe(40 - 6);
  });
});

describe("Cephalid Constable: up to as many target permanents that player controls as the combat damage dealt", () => {
  const hit = (power: string) => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, { ...constable(), power });
    const rocks = [1, 2, 3, 4].map((n) => putOnBattlefield(s0, opp, card(`Test Rock ${n}`, "Artifact", "{1}")));
    const mine = putOnBattlefield(s0, ap, card("Test Mine", "Artifact", "{1}"));
    let s = attack(s0, ap, c, opp);
    for (let i = 0; i < 40 && s.pending?.kind !== "chooseTargets"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return { s, ap, opp, rocks, mine };
  };
  it("three damage: up to three of that player's permanents, chosen as it triggers (CR 603.3d)", () => {
    const { s: s0, ap, opp, rocks, mine } = hit("3");
    expect(s0.pending).toMatchObject({ kind: "chooseTargets", x: 3 });
    // Not one of yours, nor four of theirs.
    expect(() => act(s0, { type: "chooseTargets", player: ap, targets: [tgt(rocks[0]!), tgt(mine)] })).toThrow();
    expect(() => act(s0, { type: "chooseTargets", player: ap, targets: rocks.map(tgt) })).toThrow();
    const s = settle(act(s0, { type: "chooseTargets", player: ap, targets: rocks.slice(0, 3).map(tgt) }));
    expect(rocks.map((r) => s.objects[r]!.zone)).toEqual(["hand", "hand", "hand", "battlefield"]);
    expect(s.players[opp]!.hand).toEqual(expect.arrayContaining(rocks.slice(0, 3)));
  });
  it("one damage: one; none chosen is allowed (up to)", () => {
    const { s: s0, ap, rocks } = hit("1");
    expect(s0.pending).toMatchObject({ kind: "chooseTargets", x: 1 });
    expect(() => act(s0, { type: "chooseTargets", player: ap, targets: rocks.slice(0, 2).map(tgt) })).toThrow();
    const s = settle(act(s0, { type: "chooseTargets", player: ap, targets: [] }));
    expect(rocks.every((r) => s.objects[r]!.zone === "battlefield")).toBe(true);
  });
});

describe("Spark of Creativity: damage equal to the exiled card's mana value, or else you may play that card this turn", () => {
  const go = () => {
    const { s: s0, ap, opp, ids } = setup([spark()]);
    const ogre = putOnBattlefield(s0, opp, card("Test Ogre", "Creature — Ogre", "{4}{R}", { power: "5", toughness: "5" }));
    const top = into(s0, ap, card("Test Cube", "Artifact", "{3}", { cmc: 3 }), "library");
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(ogre)]));
    for (let i = 0; i < 10 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, ogre, top };
  };
  it("dealing the damage: 3 to the creature, and no permission to play the card", () => {
    const { s: s0, ap, ogre, top } = go();
    expect(s0.objects[top]!.zone).toBe("exile");
    expect(s0.pending).toMatchObject({ kind: "chooseMay", source: "Spark of Creativity" });
    const s = act(s0, { type: "chooseMay", player: ap, yes: true });
    expect(s.objects[ogre]!.damage).toBe(3);
    expect(s.objects[top]!.mayPlay).toBeUndefined();
    expect(planCast(s, ap, top)).toBeNull();
  });
  it("declining: no damage, and the card may be played this turn with its usual cost", () => {
    const { s: s0, ap, ogre, top } = go();
    let s = act(s0, { type: "chooseMay", player: ap, yes: false });
    expect(s.objects[ogre]!.damage).toBe(0);
    expect(s.objects[top]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn" });
    s = settle(run(s, planCast(s, ap, top)));
    expect(s.objects[top]!.zone).toBe("battlefield");
  });
  it("the permission ends with the turn (CR 514.2)", () => {
    const { s: s0, ap, top } = go();
    let s = act(s0, { type: "chooseMay", player: ap, yes: false });
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.objects[top]!.mayPlay?.until === "thisTurn" && s.objects[top]!.mayPlay?.turn === s.turn).toBe(false);
  });
});

const sawItComing = card("Saw It Coming", "Instant", "{1}{U}{U}", { keywords: ["Foretell"], oracleText: "Counter target spell.\nForetell {1}{U} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)" });
const foretoldBeast = card("Test Foretold Beast", "Creature — Beast", "{3}{G}", { cmc: 4, power: "4", toughness: "4", keywords: ["Foretell"], oracleText: "Foretell {1}{U} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)" });

describe("Karfell Harbinger: its {U} only foretells a card or casts an instant or sorcery spell", () => {
  const two = (hand: CardDef[]) => {
    const { s: s0, ap, ids } = setup(hand);
    noLands(s0, ap);
    const hs = [putOnBattlefield(s0, ap, harbinger()), putOnBattlefield(s0, ap, harbinger())];
    let s = s0;
    for (const h of hs) s = act(s, { type: "activateMana", player: ap, objectId: h, mana: "U" });
    expect(s.players[ap]!.manaPool.U).toBe(2);
    return { s, ap, ids };
  };
  it("pays the {2} to foretell a card from your hand (CR 702.143a)", () => {
    const { s: s0, ap, ids } = two([sawItComing]);
    const s = act(s0, { type: "foretell", player: ap, objectId: ids[0]! });
    expect(s.objects[ids[0]!]!.foretold).toBe(true);
    expect(s.players[ap]!.manaPool.U).toBe(0);
  });
  it("casts an instant, not a creature spell", () => {
    const instant = card("Test Quick Study", "Instant", "{1}{U}", { cmc: 2, oracleText: "Draw a card." });
    const creature = card("Test Drake", "Creature — Drake", "{1}{U}", { cmc: 2, power: "2", toughness: "2" });
    const { s: s0, ap, ids } = two([instant, creature]);
    expect(planCast(s0, ap, ids[1]!)).toBeNull();
    // With unrestricted {U}{U} it could be cast.
    const free = structuredClone(s0);
    free.players[ap]!.manaLots = [];
    expect(planCast(free, ap, ids[1]!)).not.toBeNull();
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.stack.at(-1)?.objectId).toBe(ids[0]);
  });
  it("not a foretold creature card cast for its foretell cost (only foretelling itself)", () => {
    const { s: s0, ap, ids } = two([foretoldBeast]);
    supported(foretoldBeast);
    const s = act(s0, { type: "foretell", player: ap, objectId: ids[0]! });
    expect(s.objects[ids[0]!]!.foretold).toBe(true);
    // A later turn: two more {U} from it can't cast the beast for {1}{U}.
    let t = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    t = passUntil(t, "main1", ap);
    noLands(t, ap);
    for (const h of t.battlefield.filter((id) => t.objects[id]!.cardId === harbinger().oracleId)) t = act(t, { type: "activateMana", player: ap, objectId: h, mana: "U" });
    expect(planCast(t, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "foretell" })).toBeNull();
    const free = structuredClone(t);
    free.players[ap]!.manaLots = [];
    expect(planCast(free, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "foretell" })).not.toBeNull();
  });
});
