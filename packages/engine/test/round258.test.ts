// Round 258: the top of the popularity list. Underdark Rift (roll a d10, then a target goes just beneath the top X cards
// of its owner's library), Chaos Defiler (one permanent chosen for each opponent, one of them destroyed at random),
// Command the Dreadhorde (any number of creature and planeswalker cards from graveyards, damage equal to their total
// mana value first), Winnowing (one creature kept for each player, and those sharing a creature type with it),
// Omenpath Journey (lands with different names exiled, one at random put onto the battlefield each end step), Blood for
// Bones (one creature card to the battlefield, another to your hand) and Fiery Gambit (flip until you lose or stop).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, chooseTargets, compileCard, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** The opponents in turn order, starting with the next player (APNAP order on your turn). */
const opps = (s: GameState, ap: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % s.turnOrder.length]!);
const answerBot = (s: GameState) => botActions(s, s.pending!.player).reduce((x, a) => act(x, a), s);

// Real oracle text (Scryfall).
const underdark = (): CardDef => ({"oracleId":"199c7604-6b4b-4cec-b6c2-b6b2918b11c8","name":"Underdark Rift","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{5}, {T}, Exile this land: Roll a d10. Put target artifact, creature, or planeswalker into its owner's library just beneath the top X cards of that library, where X is the result. Activate only as a sorcery.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/d/a/da7b5c5b-fba1-4993-9779-bef96bcb0064.jpg?1783926233","artUrl":"https://cards.scryfall.io/art_crop/front/d/a/da7b5c5b-fba1-4993-9779-bef96bcb0064.jpg?1783926233","commanderLegal":"legal","set":"afc","releasedAt":"2021-07-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const defiler = (): CardDef => ({"oracleId":"eba7ef08-f444-4d23-92b8-29d2ac08b156","name":"Chaos Defiler","manaCost":"{3}{B}{R}","cmc":5,"typeLine":"Artifact Creature — Demon Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Demon","Construct"],"oracleText":"Trample\nBattle Cannon — When this creature enters or dies, for each opponent, choose a nonland permanent that player controls. Destroy one of them chosen at random.","power":"5","toughness":"4","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Battle Cannon","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/1/c/1c0f2873-5849-4cab-855a-2fbbc41dbb6c.jpg?1783920860","artUrl":"https://cards.scryfall.io/art_crop/front/1/c/1c0f2873-5849-4cab-855a-2fbbc41dbb6c.jpg?1783920860","commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dreadhorde = (): CardDef => ({"oracleId":"198d31e4-1ae1-4bf9-a05a-7fa45c0aeddb","name":"Command the Dreadhorde","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose any number of target creature and/or planeswalker cards in graveyards. Command the Dreadhorde deals damage to you equal to the total mana value of those cards. Put them onto the battlefield under your control.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/e/de7ec307-45e0-4853-85fe-9ce859b188c2.jpg?1783933449","artUrl":"https://cards.scryfall.io/art_crop/front/d/e/de7ec307-45e0-4853-85fe-9ce859b188c2.jpg?1783933449","commanderLegal":"legal","set":"war","releasedAt":"2019-05-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const winnowing = (): CardDef => ({"oracleId":"8b834f83-951b-4b5c-b9f1-3d860baa3c0e","name":"Winnowing","manaCost":"{4}{W}{W}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nFor each player, you choose a creature that player controls. Then each player sacrifices all other creatures they control that don't share a creature type with the chosen creature they control.","colors":["W"],"colorIdentity":["W"],"keywords":["Convoke"],"imageUrl":"https://cards.scryfall.io/normal/front/f/9/f943a7d8-9550-427e-8c45-ef834329d345.jpg?1783904492","artUrl":"https://cards.scryfall.io/art_crop/front/f/9/f943a7d8-9550-427e-8c45-ef834329d345.jpg?1783904492","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const omenpath = (): CardDef => ({"oracleId":"8b067e44-2001-4b49-aa4a-2c86f8929751","name":"Omenpath Journey","manaCost":"{3}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, search your library for up to five land cards that have different names, exile them, then shuffle.\nAt the beginning of your end step, choose a card at random exiled with this enchantment and put it onto the battlefield tapped.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/8/385e6c23-0eab-4bc9-8b30-524879051ce9.jpg?1783911988","artUrl":"https://cards.scryfall.io/art_crop/front/3/8/385e6c23-0eab-4bc9-8b30-524879051ce9.jpg?1783911988","commanderLegal":"legal","set":"big","releasedAt":"2024-04-19","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bones = (): CardDef => ({"oracleId":"fc7439ec-32e3-47db-9ff4-6eb84cb33d89","name":"Blood for Bones","manaCost":"{3}{B}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, sacrifice a creature.\nReturn a creature card from your graveyard to the battlefield, then return another creature card from your graveyard to your hand.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/8/7892b516-0dce-491f-8b42-031d64397e26.jpg?1783932999","artUrl":"https://cards.scryfall.io/art_crop/front/7/8/7892b516-0dce-491f-8b42-031d64397e26.jpg?1783932999","commanderLegal":"legal","set":"m20","releasedAt":"2019-07-12","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const gambit = (): CardDef => ({"oracleId":"78497c54-7179-41b7-9454-7b915fd96cd5","name":"Fiery Gambit","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Flip a coin until you lose a flip or choose to stop flipping. If you lose a flip, Fiery Gambit has no effect. If you win one or more flips, Fiery Gambit deals 3 damage to target creature. If you win two or more flips, Fiery Gambit deals 6 damage to each opponent. If you win three or more flips, draw nine cards and untap all lands you control.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a91376ed-5868-4887-8389-5ef5b9471786.jpg?1783944541","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a91376ed-5868-4887-8389-5ef5b9471786.jpg?1783944541","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const elf = (name: string, sub: string) => card(name, `Creature — Elf ${sub}`, "{1}{G}", { power: "1", toughness: "1" });
const goblin = card("Test Goblin", "Creature — Goblin", "{R}", { cmc: 1, power: "1", toughness: "1" });
const human = card("Test Human", "Creature — Human", "{W}", { cmc: 1, power: "1", toughness: "1" });
const shifter = card("Test Shifter", "Creature — Shapeshifter", "{1}{U}", { cmc: 2, power: "1", toughness: "1", oracleText: "Changeling (This card is every creature type.)", keywords: ["Changeling"] });
const golem = card("Test Golem", "Artifact Creature", "{3}", { cmc: 3, power: "3", toughness: "3" });
const relic = card("Test Relic", "Artifact", "{2}", { cmc: 2 });
const wall = card("Test Wall", "Artifact", "{2}", { cmc: 2, oracleText: "Indestructible", keywords: ["Indestructible"] });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, colors: ["R"], power: "3", toughness: "3" });
const walker = card("Test Walker", "Legendary Planeswalker — Testy", "{2}{U}{U}", { cmc: 4, colors: ["U"], loyalty: "3", oracleText: "+1: Draw a card." });
const land = (name: string) => card(name, "Land", "", { oracleText: "{T}: Add {C}." });

describe("round 258", () => {
  it("every card of the round compiles fully", () => {
    supported(underdark(), defiler(), dreadhorde(), winnowing(), omenpath(), bones(), gambit());
  });
});

describe("Underdark Rift", () => {
  const rift = (libSize: number, seed: number) => {
    const { s, ap, opp } = setup([]);
    const r = putOnBattlefield(s, ap, underdark());
    const golemId = putOnBattlefield(s, opp, golem);
    s.players[opp]!.library = s.players[opp]!.library.slice(0, libSize);
    s.rngState = seed;
    return { s, ap, opp, r, golemId };
  };
  it("rolls a d10 as it resolves and puts the target just beneath that many cards of its owner's library; the land is exiled for the cost", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed < 40; seed++) {
      const { s: s0, ap, opp, r, golemId } = rift(20, seed);
      const s = settle(run(s0, planActivate(s0, ap, r, 0, [tgt(golemId)])));
      expect(zone(s, r)).toBe("exile");
      expect(zone(s, golemId)).toBe("library");
      const at = s.players[opp]!.library.indexOf(golemId);
      expect(at).toBeGreaterThanOrEqual(1);
      expect(at).toBeLessThanOrEqual(10);
      expect(s.log.some((l) => l.text.endsWith(`rolls a d10 for Underdark Rift: ${at}.`))).toBe(true);
      seen.add(at);
    }
    expect(seen.size).toBeGreaterThan(5);
  });
  it("with fewer cards in that library than the result, on the bottom (rulings)", () => {
    for (let seed = 1; seed < 20; seed++) {
      const { s: s0, ap, opp, r, golemId } = rift(1, seed);
      const s = settle(run(s0, planActivate(s0, ap, r, 0, [tgt(golemId)])));
      expect(s.players[opp]!.library.indexOf(golemId)).toBe(1);
    }
  });
  it("only as a sorcery", () => {
    const { s: s0, ap, opp, r, golemId } = rift(20, 3);
    const s = passUntil(s0, "upkeep", opp);
    expect(planActivate(s, ap, r, 0, [tgt(golemId)])).toBeNull();
  });
});

describe("Chaos Defiler", () => {
  /** Each opponent controls two nonland permanents (the first opponent's are `walls` if given), plus lands. */
  const defile = (walls = false) => {
    const { s, ap, ids } = setup([defiler()]);
    const [o1, o2, o3] = opps(s, ap);
    const perms: Record<PlayerId, ObjectId[]> = {
      [o1!]: [putOnBattlefield(s, o1!, walls ? wall : relic), putOnBattlefield(s, o1!, golem)],
      [o2!]: [putOnBattlefield(s, o2!, walls ? wall : relic), putOnBattlefield(s, o2!, bear())],
      [o3!]: [putOnBattlefield(s, o3!, relic)],
    };
    putOnBattlefield(s, o1!, land("Test Wastes"));
    return { s, ap, ids, o1: o1!, o2: o2!, o3: o3!, perms };
  };
  it("enters: you choose a nonland permanent of each opponent (not targeted), then one of those is destroyed at random", () => {
    const { s: s0, ap, ids, o1, o2, o3, perms } = defile();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // Opponents in turn order; the third has only one, chosen with no question.
    const p1 = s.pending;
    expect(p1).toMatchObject({ kind: "pickPermanents", player: ap, of: o1, count: 1 });
    if (p1?.kind !== "pickPermanents") return;
    expect([...p1.options].sort()).toEqual([...perms[o1]!].sort());
    expect(p1.prompt).toMatch(/destroys one of the chosen permanents at random/);
    s = act(s, { type: "pickPermanents", player: ap, ids: [perms[o1]![1]!] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, of: o2 });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [perms[o2]![0]!] }));
    expect(s.pending).toBeNull();
    const chosen = [perms[o1]![1]!, perms[o2]![0]!, perms[o3]![0]!];
    const gone = chosen.filter((id) => zone(s, id) === "graveyard");
    expect(gone.length).toBe(1);
    // The others aren't touched.
    expect([perms[o1]![0]!, perms[o2]![1]!].every((id) => zone(s, id) === "battlefield")).toBe(true);
  });
  it("the one destroyed is chosen at random", () => {
    const hit = new Set<ObjectId>();
    for (let seed = 1; seed < 30; seed++) {
      const { s: s0, ap, ids, o1, o2, o3, perms } = defile();
      s0.rngState = seed;
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      s = act(s, { type: "pickPermanents", player: ap, ids: [perms[o1]![1]!] });
      s = settle(act(s, { type: "pickPermanents", player: ap, ids: [perms[o2]![1]!] }));
      for (const id of [perms[o1]![1]!, perms[o2]![1]!, perms[o3]![0]!]) if (zone(s, id) === "graveyard") hit.add(id);
    }
    expect(hit.size).toBe(3);
  });
  it("one without indestructible is destroyed while any chosen lacks it (rulings)", () => {
    for (let seed = 1; seed < 15; seed++) {
      const { s: s0, ap, ids, o1, o2, o3, perms } = defile(true);
      s0.rngState = seed;
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      s = act(s, { type: "pickPermanents", player: ap, ids: [perms[o1]![0]!] });
      s = settle(act(s, { type: "pickPermanents", player: ap, ids: [perms[o2]![0]!] }));
      expect(zone(s, perms[o3]![0]!)).toBe("graveyard");
      expect([zone(s, perms[o1]![0]!), zone(s, perms[o2]![0]!)]).toEqual(["battlefield", "battlefield"]);
    }
  });
  it("dies: the same again; a bot picks each opponent's most useful permanent", () => {
    const { s: s0, ap, o1, o2, perms } = defile();
    const d = putOnBattlefield(s0, ap, defiler());
    s0.objects[d]!.damage = 10;
    invalidateCharacteristics(s0);
    let s = settle(act(s0, { type: "passPriority", player: ap }));
    expect(zone(s, d)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, of: o1 });
    s = answerBot(s);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, of: o2 });
    // The golem, not the relic; the bear, not the relic.
    const chosen = s.resolving?.scratch?.chosen;
    expect(chosen?.[o1]).toEqual([perms[o1]![1]!]);
    s = settle(answerBot(s));
    // The relics weren't chosen, so they're never the one destroyed.
    expect([zone(s, perms[o1]![0]!), zone(s, perms[o2]![0]!)]).toEqual(["battlefield", "battlefield"]);
    expect(s.log.some((l) => /Chaos Defiler destroys .+, chosen at random/.test(l.text))).toBe(true);
  });
});

describe("Command the Dreadhorde", () => {
  const dread = () => {
    const { s, ap, opp, ids } = setup([dreadhorde()]);
    const theirOgre = into(s, opp, ogre, "graveyard");
    const myWalker = into(s, ap, walker, "graveyard");
    const myBear = into(s, ap, bear({ cmc: 2 }), "graveyard");
    const theirRelic = into(s, opp, relic, "graveyard");
    return { s, ap, opp, ids, theirOgre, myWalker, myBear, theirRelic };
  };
  it("deals you damage equal to the targets' total mana value, then puts them onto the battlefield under your control", () => {
    const { s: s0, ap, opp, ids, theirOgre, myWalker } = dread();
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirOgre), tgt(myWalker)])));
    expect(s.players[ap]!.life).toBe(life - 7);
    for (const id of [theirOgre, myWalker]) {
      expect(zone(s, id)).toBe("battlefield");
      expect(controllerOf(s, s.objects[id]!)).toBe(ap);
    }
    expect(s.objects[theirOgre]!.owner).toBe(opp);
  });
  it("only creature and planeswalker cards can be chosen, and none at all is fine", () => {
    const { s: s0, ap, ids, theirRelic } = dread();
    expect(planCast(s0, ap, ids[0]!, [tgt(theirRelic)])).toBeNull();
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [])));
    expect(s.players[ap]!.life).toBe(life);
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
  it("a target gone before it resolves isn't counted and doesn't come back", () => {
    const { s: s0, ap, ids, theirOgre, myBear } = dread();
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(theirOgre), tgt(myBear)]));
    // The bear is exiled in response.
    const bearObj = s.objects[myBear]!;
    s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(myBear), 1);
    bearObj.zone = "exile";
    bearObj.zoneChanges = (bearObj.zoneChanges ?? 0) + 1;
    s.players[ap]!.exile.push(myBear);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life - 3);
    expect(zone(s, theirOgre)).toBe("battlefield");
    expect(zone(s, myBear)).toBe("exile");
  });
  it("a bot keeps the total well below its life", () => {
    const { s, ap, ids } = dread();
    s.players[ap]!.life = 12;
    const body = compileCard(s.cards[s.objects[ids[0]!]!.cardId]!).spell!;
    const t = chooseTargets(s, ap, body, false, ids[0]!) ?? [];
    const picked = t.filter((x): x is { kind: "object"; id: string } => x.kind === "object").map((x) => x.id);
    const total = picked.reduce((n, id) => n + (s.cards[s.objects[id]!.cardId]!.cmc ?? 0), 0);
    expect(picked.length).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(5);
  });
});

describe("Winnowing", () => {
  const winnow = () => {
    const { s, ap, opp, ids } = setup([winnowing()]);
    const mine = { warrior: putOnBattlefield(s, ap, elf("Test Elf Warrior", "Warrior")), druid: putOnBattlefield(s, ap, elf("Test Elf Druid", "Druid")), goblin: putOnBattlefield(s, ap, goblin) };
    const theirs = { bear1: putOnBattlefield(s, opp, bear()), bear2: putOnBattlefield(s, opp, bear()), shifter: putOnBattlefield(s, opp, shifter), human: putOnBattlefield(s, opp, human), golem: putOnBattlefield(s, opp, golem) };
    return { s, ap, opp, ids, mine, theirs };
  };
  it("you choose a creature for each player; each sacrifices the other creatures sharing no creature type with it", () => {
    const { s: s0, ap, opp, ids, mine, theirs } = winnow();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "keep", count: 1 });
    s = act(s, { type: "pickPermanents", player: ap, ids: [mine.warrior] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "keep", of: opp });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [theirs.bear1] }));
    expect(s.pending).toBeNull();
    // Elves share Elf; the Goblin goes. The other Bear and the changeling share Bear; the Human and the typeless Golem go.
    expect([zone(s, mine.warrior), zone(s, mine.druid), zone(s, mine.goblin)]).toEqual(["battlefield", "battlefield", "graveyard"]);
    expect([zone(s, theirs.bear1), zone(s, theirs.bear2), zone(s, theirs.shifter), zone(s, theirs.human), zone(s, theirs.golem)]).toEqual(["battlefield", "battlefield", "battlefield", "graveyard", "graveyard"]);
  });
  it("a changeling chosen spares every creature with a creature type, but not one with none", () => {
    const { s: s0, ap, opp, ids, mine, theirs } = winnow();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "pickPermanents", player: ap, ids: [mine.goblin] });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [theirs.shifter] }));
    expect([zone(s, mine.warrior), zone(s, mine.druid), zone(s, mine.goblin)]).toEqual(["graveyard", "graveyard", "battlefield"]);
    expect([zone(s, theirs.bear1), zone(s, theirs.bear2), zone(s, theirs.shifter), zone(s, theirs.human), zone(s, theirs.golem)]).toEqual(["battlefield", "battlefield", "battlefield", "battlefield", "graveyard"]);
    void opp;
  });
  it("a bot keeps its own creature that saves the most, and an opponent's that saves the least", () => {
    const { s: s0, ap, ids, mine, theirs } = winnow();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(botActions(s, ap)).toEqual([{ type: "pickPermanents", player: ap, ids: [expect.stringMatching(new RegExp(`^(${mine.warrior}|${mine.druid})$`))] }]);
    s = answerBot(s);
    // The typeless Golem spares nothing but itself (a Bear would spare the other Bear and the changeling).
    expect(botActions(s, ap)).toEqual([{ type: "pickPermanents", player: ap, ids: [expect.stringMatching(new RegExp(`^(${theirs.golem}|${theirs.human})$`))] }]);
  });
});

describe("Omenpath Journey", () => {
  const journey = () => {
    const { s, ap, ids } = setup([omenpath()]);
    const lib = [land("Test Mire"), land("Test Mire"), land("Test Peak"), land("Test Grove"), bear()].map((d) => into(s, ap, d, "library"));
    return { s, ap, ids, lib };
  };
  it("enters: up to five land cards with different names are exiled; at each of your end steps one at random enters tapped", () => {
    const { s: s0, ap, ids, lib } = journey();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // The cast Journey resolves, then its enters trigger asks.
    for (let i = 0; i < 5 && s.pending?.kind !== "searchLibrary"; i++) s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    const p = s.pending;
    expect(p?.kind).toBe("searchLibrary");
    if (p?.kind !== "searchLibrary") return;
    expect(p.cards).not.toContain(lib[4]);
    // Four names among the lands there (the deck's Forests too): no more than four can be found.
    expect([p.max, p.min]).toEqual([4, 0]);
    // One card of each name is offered: two Mires can't both be found.
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [lib[0]!, lib[1]!] })).toThrow();
    const mire = p.cards.includes(lib[0]!) ? lib[0]! : lib[1]!;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [mire, lib[2]!, lib[3]!] }));
    expect([zone(s, mire), zone(s, lib[2]!), zone(s, lib[3]!)]).toEqual(["exile", "exile", "exile"]);
    s = settle(passUntil(s, "end", ap));
    const out = [mire, lib[2]!, lib[3]!].filter((id) => zone(s, id) === "battlefield");
    expect(out.length).toBe(1);
    expect(s.objects[out[0]!]!.tapped).toBe(true);
    expect(controllerOf(s, s.objects[out[0]!]!)).toBe(ap);
  });
});

describe("Blood for Bones", () => {
  it("sacrifice a creature to cast it; one creature card from your graveyard to the battlefield, another to your hand", () => {
    const { s: s0, ap, ids } = setup([bones()]);
    const fodder = putOnBattlefield(s0, ap, ogre);
    const a = into(s0, ap, golem, "graveyard");
    const b = into(s0, ap, bear(), "graveyard");
    into(s0, ap, relic, "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { sacrifice: [fodder] })));
    expect(zone(s, fodder)).toBe("graveyard");
    let p = s.pending;
    expect(p?.kind).toBe("searchLibrary");
    if (p?.kind !== "searchLibrary") return;
    // The sacrificed one can be returned too (rulings).
    expect([...p.cards].sort()).toEqual([a, b, fodder].sort());
    s = act(s, { type: "searchLibrary", player: ap, found: [fodder] });
    p = s.pending;
    expect(p?.kind).toBe("searchLibrary");
    if (p?.kind !== "searchLibrary") return;
    expect([...p.cards].sort()).toEqual([a, b].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [a] }));
    expect([zone(s, fodder), zone(s, a), zone(s, b)]).toEqual(["battlefield", "hand", "graveyard"]);
  });
  it("the card chosen for the battlefield can't be the one for the hand even if it stayed in the graveyard", () => {
    const { s: s0, ap, ids } = setup([bones()]);
    const fodder = putOnBattlefield(s0, ap, ogre);
    const a = into(s0, ap, golem, "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { sacrifice: [fodder] })));
    s = act(s, { type: "searchLibrary", player: ap, found: [a] });
    // Only the sacrificed Ogre is left for the hand.
    const p = s.pending;
    expect(p?.kind === "searchLibrary" ? p.cards : []).toEqual([fodder]);
  });
});

describe("Fiery Gambit", () => {
  /** Cast it at an opponent's Ogre, flipping again until `stopAt` wins (a lost flip ends it sooner). */
  const gamble = (seed: number, stopAt: number) => {
    const { s: s0, ap, opp, ids } = setup([gambit()]);
    const target = putOnBattlefield(s0, opp, card("Test Brute", "Creature — Ogre", "{4}", { power: "4", toughness: "4" }));
    for (const id of s0.battlefield) if (controllerOf(s0, s0.objects[id]!) === ap) s0.objects[id]!.tapped = true;
    s0.players[ap]!.manaPool.R = 3;
    s0.rngState = seed;
    const hand = s0.players[ap]!.hand.length - 1;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(target)])));
    const asked: number[] = [];
    while (s.pending?.kind === "chooseMay" && s.pending.flipAgain) {
      asked.push(s.pending.flipAgain.wins);
      expect(s.pending.player).toBe(ap);
      s = settle(act(s, { type: "chooseMay", player: ap, yes: s.pending.flipAgain.wins < stopAt }));
    }
    const lost = s.log.some((l) => /loses flip/.test(l.text));
    return { s, ap, opp, target, asked, lost, hand, life: s0.players[opp]!.life };
  };
  const find = (stopAt: number, want: (g: ReturnType<typeof gamble>) => boolean) => {
    for (let seed = 1; seed < 400; seed++) {
      const g = gamble(seed, stopAt);
      if (want(g)) return g;
    }
    throw new Error("no seed");
  };
  it("asked after each flip won; stopping after one win: 3 damage to the target only", () => {
    const g = find(1, (g) => !g.lost);
    expect(g.asked).toEqual([1]);
    expect(g.s.objects[g.target]!.damage).toBe(3);
    expect(g.s.players[g.opp]!.life).toBe(g.life);
    expect(g.s.players[g.ap]!.hand.length).toBe(g.hand);
  });
  it("two wins: also 6 damage to each opponent; three: also draw nine cards and untap all your lands", () => {
    const two = find(2, (g) => !g.lost);
    expect(two.asked).toEqual([1, 2]);
    expect(two.s.objects[two.target]!.damage).toBe(3);
    for (const p of opps(two.s, two.ap)) expect(two.s.players[p]!.life).toBe(two.life - 6);
    expect(two.s.players[two.ap]!.hand.length).toBe(two.hand);
    const three = find(3, (g) => !g.lost);
    expect(three.asked).toEqual([1, 2, 3]);
    expect(three.s.players[three.ap]!.hand.length).toBe(three.hand + 9);
    const lands = three.s.battlefield.filter((id) => controllerOf(three.s, three.s.objects[id]!) === three.ap && characteristics(three.s, three.s.objects[id]!).types.includes("Land"));
    expect(lands.length).toBeGreaterThan(0);
    expect(lands.every((id) => !three.s.objects[id]!.tapped)).toBe(true);
  });
  it("losing any flip: no effect at all, and no more flips", () => {
    const g = find(5, (g) => g.lost && g.asked.length >= 1);
    expect(g.s.objects[g.target]!.damage ?? 0).toBe(0);
    expect(g.s.players[g.opp]!.life).toBe(g.life);
    expect(g.s.pending).toBeNull();
    const first = find(5, (g) => g.lost && g.asked.length === 0);
    expect(first.s.objects[first.target]!.damage ?? 0).toBe(0);
  });
  it("a bot flips again until three wins, then stops", () => {
    const { s: s0, ap } = setup([gambit()]);
    const may = (wins: number): GameState => ({ ...s0, pending: { kind: "chooseMay", player: ap, prompt: "flip again?", source: "Fiery Gambit", flipAgain: { wins, enough: 3 } } });
    expect(botActions(may(1), ap)).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
    expect(botActions(may(2), ap)).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
    expect(botActions(may(3), ap)).toEqual([{ type: "chooseMay", player: ap, yes: false }]);
  });
});
