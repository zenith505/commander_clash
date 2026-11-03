// Lane B round B100: Hustle // Bustle, Flesh // Blood (fused), Dual Nature, Biolume Egg, Audacious Swap, Sift Through
// Sands, Reins of the Vinesteed, Stick, Fearless Mentor and Wake to Slaughter.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, compileCard, defOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (pid: PlayerId): TargetChoice => ({ kind: "player", id: pid });
/** Moves a new card for `def` from the battlefield into `pid`'s `zone`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const opp0 = (s: GameState, ap: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
const named = (s: GameState, name: string) => s.battlefield.filter((id) => defOf(s, s.objects[id]!).name === name);
const kill = card("Test Kill", "Instant", "{B}", { oracleText: "Destroy target creature.", colors: ["B"] });
const disenchant = card("Test Disenchant", "Instant", "{W}", { oracleText: "Destroy target enchantment.", colors: ["W"] });
const altar = card("Test Altar", "Artifact", "{0}", { oracleText: "Sacrifice a creature: You gain 1 life." });
const pain = card("Test Pain Rock", "Artifact", "{0}", { oracleText: "{T}: This artifact deals 1 damage to you." });
const pain2 = card("Test Other Pain Rock", "Artifact", "{0}", { oracleText: "{T}: This artifact deals 1 damage to you." });
const giant = card("Test Giant", "Creature — Giant", "{4}{R}", { power: "5", toughness: "5", colors: ["R"] });
const elf = card("Test Elf", "Creature — Elf Warrior", "{G}", { power: "1", toughness: "1", colors: ["G"] });
const morphProp = card("Test Morpher", "Creature — Beast", "{4}{G}", { power: "4", toughness: "4", oracleText: "Morph {2}", keywords: ["Morph"] });
const hustle = (): CardDef => ({"oracleId":"e294d85f-caf2-4939-99d3-7ca5bba2b8d1","name":"Hustle // Bustle","manaCost":"{U/R} // {4}{R/G}{R/G}","cmc":7,"typeLine":"Instant // Sorcery","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature attacks or blocks this turn if able.","colors":["G","R","U"],"colorIdentity":["G","R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/f/5f664827-e22e-43af-82f1-861b3c7607f1.jpg?1783912830","artUrl":"https://cards.scryfall.io/art_crop/front/5/f/5f664827-e22e-43af-82f1-861b3c7607f1.jpg?1783912830","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"uncommon","layout":"split","gameChanger":false,"faces":[{"name":"Hustle","manaCost":"{U/R}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature attacks or blocks this turn if able.","colors":["U","R"]},{"name":"Bustle","manaCost":"{4}{R/G}{R/G}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Creatures you control get +2/+2 and gain trample until end of turn. You may turn a creature you control face up.","colors":["R","G"]}]}) as CardDef;
const flesh = (): CardDef => ({"oracleId":"0741151a-fec0-4ed3-9295-0d0f56d24165","name":"Flesh // Blood","manaCost":"{3}{B}{G} // {R}{G}","cmc":7,"typeLine":"Sorcery // Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile target creature card from a graveyard. Put X +1/+1 counters on target creature, where X is the power of the card you exiled.\nFuse (You may cast one or both halves of this card from your hand.)","colors":["B","G","R"],"colorIdentity":["B","G","R"],"keywords":["Fuse"],"imageUrl":"https://cards.scryfall.io/normal/front/0/2/02b40fe4-901a-4832-8d52-a6bb5cc07b63.jpg?1783940015","artUrl":"https://cards.scryfall.io/art_crop/front/0/2/02b40fe4-901a-4832-8d52-a6bb5cc07b63.jpg?1783940015","commanderLegal":"legal","set":"dgm","releasedAt":"2013-05-03","rarity":"rare","layout":"split","gameChanger":false,"faces":[{"name":"Flesh","manaCost":"{3}{B}{G}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile target creature card from a graveyard. Put X +1/+1 counters on target creature, where X is the power of the card you exiled.\nFuse (You may cast one or both halves of this card from your hand.)","colors":["B","G"]},{"name":"Blood","manaCost":"{R}{G}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target creature you control deals damage equal to its power to any target.\nFuse (You may cast one or both halves of this card from your hand.)","colors":["R","G"]}]}) as CardDef;
const dualNature = (): CardDef => ({"oracleId":"7a8fcf6f-3bda-485c-b960-62a37112f0eb","name":"Dual Nature","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a nontoken creature enters, its controller creates a token that's a copy of that creature.\nWhenever a nontoken creature leaves the battlefield, exile all tokens with the same name as that creature.\nWhen this enchantment leaves the battlefield, exile all tokens created with this enchantment.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/8/6890e414-d7e1-4320-924c-083e65a2ae72.jpg?1783945773","artUrl":"https://cards.scryfall.io/art_crop/front/6/8/6890e414-d7e1-4320-924c-083e65a2ae72.jpg?1783945773","commanderLegal":"legal","set":"pcy","releasedAt":"2000-06-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const egg = (): CardDef => ({"oracleId":"7af3876e-5297-46e6-936e-6c8344f4b6ac","name":"Biolume Egg // Biolume Serpent","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Serpent Egg // Creature — Serpent","supertypes":[],"types":["Creature"],"subtypes":["Serpent","Egg"],"oracleText":"Defender\nWhen this creature enters, scry 2.\nWhen you sacrifice this creature, return it to the battlefield transformed under its owner's control at the beginning of the next end step.","power":"0","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Transform","Defender","Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/7/7/77f2c03a-21ba-489a-9d75-6afd30998589.jpg?1783924291","artUrl":"https://cards.scryfall.io/art_crop/front/7/7/77f2c03a-21ba-489a-9d75-6afd30998589.jpg?1783924291","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Biolume Egg","manaCost":"{2}{U}","typeLine":"Creature — Serpent Egg","supertypes":[],"types":["Creature"],"subtypes":["Serpent","Egg"],"oracleText":"Defender\nWhen this creature enters, scry 2.\nWhen you sacrifice this creature, return it to the battlefield transformed under its owner's control at the beginning of the next end step.","power":"0","toughness":"4","colors":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/7/7/77f2c03a-21ba-489a-9d75-6afd30998589.jpg?1783924291","artUrl":"https://cards.scryfall.io/art_crop/front/7/7/77f2c03a-21ba-489a-9d75-6afd30998589.jpg?1783924291"},{"name":"Biolume Serpent","manaCost":"","typeLine":"Creature — Serpent","supertypes":[],"types":["Creature"],"subtypes":["Serpent"],"oracleText":"Sacrifice two Islands: This creature can't be blocked this turn.","power":"4","toughness":"4","colors":["U"],"colorIndicator":["U"],"imageUrl":"https://cards.scryfall.io/normal/back/7/7/77f2c03a-21ba-489a-9d75-6afd30998589.jpg?1783924291","artUrl":"https://cards.scryfall.io/art_crop/back/7/7/77f2c03a-21ba-489a-9d75-6afd30998589.jpg?1783924291"}]}) as CardDef;
const swap = (): CardDef => ({"oracleId":"40b0b93d-4075-42d6-bcd8-b2f9910cc7d2","name":"Audacious Swap","manaCost":"{3}{R}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Casualty 2 (As you cast this spell, you may sacrifice a creature with power 2 or greater. When you do, copy this spell and you may choose a new target for the copy.)\nThe owner of target nonenchantment permanent shuffles it into their library, then exiles the top card of their library. If it's a land card, they put it onto the battlefield. Otherwise, they may cast it without paying its mana cost.","colors":["R"],"colorIdentity":["R"],"keywords":["Casualty"],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/816cb69f-8c9f-4a1e-90d4-8c304501876c.jpg?1783923364","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/816cb69f-8c9f-4a1e-90d4-8c304501876c.jpg?1783923364","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sift = (): CardDef => ({"oracleId":"4f5978a6-40c2-49df-8277-48a6d4f6f23e","name":"Sift Through Sands","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Instant — Arcane","supertypes":[],"types":["Instant"],"subtypes":["Arcane"],"oracleText":"Draw two cards, then discard a card.\nIf you've cast a spell named Peer Through Depths and a spell named Reach Through Mists this turn, you may search your library for a card named The Unspeakable, put it onto the battlefield, then shuffle.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/7/077bde4d-4cdb-42db-acc5-441ed8fa4a5b.jpg?1783944322","artUrl":"https://cards.scryfall.io/art_crop/front/0/7/077bde4d-4cdb-42db-acc5-441ed8fa4a5b.jpg?1783944322","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const peer = (): CardDef => ({"oracleId":"a61f5100-aa38-4996-b23c-3ce4ed25ed09","name":"Peer Through Depths","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant — Arcane","supertypes":[],"types":["Instant"],"subtypes":["Arcane"],"oracleText":"Look at the top five cards of your library. You may reveal an instant or sorcery card from among them and put it into your hand. Put the rest on the bottom of your library in any order.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/b/9be02570-b840-46cc-af54-5279463fdcab.jpg?1783944323","artUrl":"https://cards.scryfall.io/art_crop/front/9/b/9be02570-b840-46cc-af54-5279463fdcab.jpg?1783944323","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const reach = (): CardDef => ({"oracleId":"c81ca8ff-92f3-481e-82f7-0673b6c74ea0","name":"Reach Through Mists","manaCost":"{U}","cmc":1,"typeLine":"Instant — Arcane","supertypes":[],"types":["Instant"],"subtypes":["Arcane"],"oracleText":"Draw a card.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/d/9d63a2cd-dd67-4692-9baf-520ebf6ab331.jpg?1783944323","artUrl":"https://cards.scryfall.io/art_crop/front/9/d/9d63a2cd-dd67-4692-9baf-520ebf6ab331.jpg?1783944323","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const unspeakable = (): CardDef => ({"oracleId":"64e413c9-96e5-43c3-a182-84d53fef4327","name":"The Unspeakable","manaCost":"{6}{U}{U}{U}","cmc":9,"typeLine":"Legendary Creature — Spirit","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Flying, trample\nWhenever The Unspeakable deals combat damage to a player, you may return target Arcane card from your graveyard to your hand.","power":"6","toughness":"7","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/e/9/e956c695-bf0a-430c-a14e-196ae6ab7c9f.jpg?1783936574","artUrl":"https://cards.scryfall.io/art_crop/front/e/9/e956c695-bf0a-430c-a14e-196ae6ab7c9f.jpg?1783936574","commanderLegal":"legal","set":"dds","releasedAt":"2017-03-31","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const reins = (): CardDef => ({"oracleId":"db616096-ce15-4c32-b8ff-0fda4dd3b0de","name":"Reins of the Vinesteed","manaCost":"{3}{G}","cmc":4,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+2.\nWhen enchanted creature dies, you may return this card from your graveyard to the battlefield attached to a creature that shares a creature type with that creature.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/407a0ef5-a63e-4013-b3d9-b42f2c42c7a4.jpg?1783942777","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/407a0ef5-a63e-4013-b3d9-b42f2c42c7a4.jpg?1783942777","commanderLegal":"legal","set":"mor","releasedAt":"2008-02-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const stick = (): CardDef => ({"oracleId":"e7bd3882-a0f2-4706-80e7-1d3ec455801f","name":"Stick, Fearless Mentor","manaCost":"{1}{R}","cmc":2,"typeLine":"Legendary Creature — Human Monk Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Monk","Hero"],"oracleText":"First strike\nWhenever a source you control deals damage to you, exile the top card of your library. You may play it until the end of your next turn. This ability triggers only once each turn.","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/7/5/75147899-6eda-41dd-acec-cfe09dc38ba2.jpg?1783903045","artUrl":"https://cards.scryfall.io/art_crop/front/7/5/75147899-6eda-41dd-acec-cfe09dc38ba2.jpg?1783903045","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const wake = (): CardDef => ({"oracleId":"78eb5399-8c8b-4310-b585-e4ccd9d7c9cc","name":"Wake to Slaughter","manaCost":"{3}{B}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose up to two target creature cards in your graveyard. An opponent chooses one of them. Return that card to your hand. Return the other to the battlefield under your control. It gains haste. Exile it at the beginning of the next end step.\nFlashback {4}{B}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Flashback"],"imageUrl":"https://cards.scryfall.io/normal/front/9/9/998c6c59-085c-4188-85c1-4ba64fa64e4a.jpg?1783924329","artUrl":"https://cards.scryfall.io/art_crop/front/9/9/998c6c59-085c-4188-85c1-4ba64fa64e4a.jpg?1783924329","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("Lane B round 100", () => {
  it("Hustle: target creature attacks or blocks this turn if able, both requirements until end of turn", () => {
    supported(hustle());
    let { s, ap, opp, ids } = setup([hustle()]);
    const theirs = putOnBattlefield(s, opp, bear());
    s = run(s, planCast(s, ap, ids[0]!, [tgt(theirs)], undefined, "auto", undefined, { face: 0 }));
    s = settle(s);
    const fx = s.effects.filter((e) => e.affected?.includes(theirs)).flatMap((e) => e.mods.map((m) => m.kind));
    expect(fx).toEqual(expect.arrayContaining(["attacksIfAble", "mustBlock"]));
    expect(s.effects.find((e) => e.affected?.includes(theirs))!.duration).toBe("endOfTurn");
  });

  it("Bustle: creatures you control get +2/+2 and trample, and you may turn a face-down creature you control face up", () => {
    let { s, ap, ids } = setup([hustle()]);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, R: 3, G: 3 };
    const b = putOnBattlefield(s, ap, bear());
    const fd = putOnBattlefield(s, ap, morphProp);
    s.objects[fd]!.faceDown = "morph";
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, ids[0]!, [], undefined, "auto", undefined, { face: 1 }));
    s = settle(s, { me: [ap] });
    // The may first, then which face-down creature (only the one).
    while (s.pending?.player === ap) {
      const p = s.pending;
      if (p.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
      else s = run(s, botActions(s, ap));
      s = settle(s, { me: [ap] });
    }
    s = settle(s);
    expect(s.objects[fd]!.faceDown).toBeUndefined();
    expect(pt(s, b)).toBe("4/4");
    expect(characteristics(s, s.objects[b]!).keywords).toContain("Trample");
  });

  it("Flesh // Blood fused: the counters come from the exiled card's power, then Blood's creature deals damage equal to its power (rulings)", () => {
    supported(flesh());
    let { s, ap, opp, ids } = setup([flesh()]);
    const dead = into(s, opp, giant, "graveyard");
    const b = putOnBattlefield(s, ap, bear());
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, ids[0]!, [tgt(dead), tgt(b), tgt(b), player(opp)], undefined, "auto", undefined, { face: 2 }));
    s = settle(s);
    expect(s.objects[dead]!.zone).toBe("exile");
    expect(pt(s, b)).toBe("7/7");
    // Five counters were put first, so Blood's damage is 7 (rulings).
    expect(s.players[opp]!.life).toBe(life - 7);
  });

  it("Dual Nature: a nontoken creature entering makes a token copy for its controller; when it leaves, tokens with its name are exiled; when Dual Nature leaves, its tokens are", () => {
    supported(dualNature());
    let { s, ap, opp, ids } = setup([bear(), elf, kill, disenchant]);
    const dn = putOnBattlefield(s, ap, dualNature());
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    s = run(s, planCast(s, ap, ids[1]!));
    s = settle(s);
    // An opponent's creature: the token is theirs ("its controller creates").
    const theirBear = into(s, opp, bear({ oracleText: "Flash", keywords: ["Flash"] }), "hand");
    s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool, G: 2 };
    s.priority = opp;
    s = run(s, planCast(s, opp, theirBear));
    s = settle(s);
    const bears = named(s, "Grizzly Bears");
    expect(bears.length).toBe(4);
    expect(bears.filter((id) => s.objects[id]!.isToken).map((id) => s.objects[id]!.controller).sort()).toEqual([ap, opp].sort());
    expect(named(s, "Test Elf").filter((id) => s.objects[id]!.isToken).length).toBe(1);
    // Our original bear dies: every token named Grizzly Bears goes, whoever's (rulings: the name as it last existed); the
    // opponent's nontoken bear and the Elf token stay.
    const original = bears.find((id) => !s.objects[id]!.isToken && s.objects[id]!.controller === ap)!;
    s.priority = ap;
    s = run(s, planCast(s, ap, ids[2]!, [tgt(original)]));
    s = settle(s);
    expect(s.objects[original]!.zone).toBe("graveyard");
    expect(named(s, "Grizzly Bears")).toEqual([theirBear]);
    expect(named(s, "Test Elf").length).toBe(2);
    // Dual Nature leaves: the tokens it created are exiled.
    s = run(s, planCast(s, ap, ids[3]!, [tgt(dn)]));
    s = settle(s);
    expect(s.objects[dn]!.zone).toBe("graveyard");
    expect(named(s, "Test Elf").length).toBe(1);
    expect(named(s, "Grizzly Bears")).toEqual([theirBear]);
  });

  it("Biolume Egg: when you sacrifice it, it returns transformed at the beginning of the next end step; destroyed, it doesn't", () => {
    supported(egg());
    let { s, ap } = setup([]);
    s.players[ap]!.hand = [];
    const e = putOnBattlefield(s, ap, egg());
    const a = putOnBattlefield(s, ap, altar);
    s = run(s, planActivate(s, ap, a, 0, [], undefined, undefined, undefined, { sacrifice: [e] }));
    s = settle(s);
    expect(s.objects[e]!.zone).toBe("graveyard");
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.objects[e]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[e]!).name).toBe("Biolume Serpent");
    // Destroyed instead of sacrificed: no trigger, it stays in the graveyard.
    let t = setup([kill]);
    const e2 = putOnBattlefield(t.s, t.ap, egg());
    t.s = run(t.s, planCast(t.s, t.ap, t.ids[0]!, [tgt(e2)]));
    t.s = settle(t.s);
    t.s.players[t.ap]!.hand = [];
    t.s = passUntil(t.s, "end", t.ap);
    t.s = settle(t.s);
    expect(t.s.objects[e2]!.zone).toBe("graveyard");
  });

  it("Audacious Swap: the owner shuffles the permanent into their library and exiles the top card; a land enters under their control", () => {
    supported(swap());
    let { s, ap, opp, ids } = setup([swap()]);
    const land = putOnBattlefield(s, opp, card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." }));
    s.players[opp]!.library = [];
    s = run(s, planCast(s, ap, ids[0]!, [tgt(land)]));
    s = settle(s);
    // Its library was only that land: shuffled in, exiled, a land card, so onto the battlefield under its owner's control.
    expect(s.objects[land]!.zone).toBe("battlefield");
    expect(s.objects[land]!.controller).toBe(opp);
  });

  it("Audacious Swap: a nonland card exiled this way is the owner's to cast for free, not the caster's", () => {
    let { s, ap, opp, ids } = setup([swap()]);
    const theirs = putOnBattlefield(s, opp, giant);
    s.players[opp]!.library = [];
    s = run(s, planCast(s, ap, ids[0]!, [tgt(theirs)]));
    s = settle(s, { me: [opp] });
    expect(s.pending?.kind).toBe("castFree");
    expect(s.pending?.player).toBe(opp);
    s = settle(s);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(opp);
  });

  it("Sift Through Sands: after Peer Through Depths and Reach Through Mists this turn, you may search for The Unspeakable; otherwise only the draw and discard", () => {
    supported(sift());
    let { s, ap, ids } = setup([sift(), reach(), sift()]);
    const u = into(s, ap, unspeakable(), "library");
    // At the bottom, so the draws don't find it.
    s.players[ap]!.library = [...s.players[ap]!.library.filter((x) => x !== u), u];
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 10, C: 10 };
    // Only Reach Through Mists cast: no search.
    s = run(s, planCast(s, ap, ids[1]!));
    s = settle(s);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(s.objects[u]!.zone).toBe("library");
    // Both names cast this turn (Peer Through Depths too): the search, The Unspeakable onto the battlefield.
    const peerId = into(s, ap, peer(), "hand");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 10, C: 10 };
    s = run(s, planCast(s, ap, peerId));
    s = settle(s);
    s = run(s, planCast(s, ap, ids[2]!));
    s = settle(s, { me: [ap] });
    while (s.pending?.player === ap) {
      const p = s.pending;
      if (p.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
      else if (p.kind === "searchLibrary" && p.cards.includes(u)) s = act(s, { type: "searchLibrary", player: ap, found: [u] });
      else s = run(s, botActions(s, ap));
      s = settle(s, { me: [ap] });
    }
    expect(s.objects[u]!.zone).toBe("battlefield");
  });

  it("Reins of the Vinesteed: when the creature dies, it may return attached to a creature sharing a creature type with it; with none, it stays", () => {
    supported(reins());
    let { s, ap, ids } = setup([kill, kill]);
    const b1 = putOnBattlefield(s, ap, bear());
    const b2 = putOnBattlefield(s, opp0(s, ap), bear({ name: "Their Bear" }));
    const e = putOnBattlefield(s, ap, elf);
    const r = putOnBattlefield(s, ap, reins());
    s.objects[r]!.attachedTo = b1;
    invalidateCharacteristics(s);
    expect(pt(s, b1)).toBe("4/4");
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b1)]));
    s = settle(s);
    // A Bear like the dead one (an opponent's is fine, rulings), not the Elf.
    expect(s.objects[r]!.zone).toBe("battlefield");
    expect(s.objects[r]!.attachedTo).toBe(b2);
    expect(pt(s, b2)).toBe("4/4");
    expect(s.objects[r]!.controller).toBe(ap);
    // The other Bear dies: no creature shares a type with it now (the Elf doesn't), so Reins stays in the graveyard.
    s = run(s, planCast(s, ap, ids[1]!, [tgt(b2)]));
    s = settle(s);
    expect(s.objects[r]!.zone).toBe("graveyard");
    expect(s.objects[e]!.zone).toBe("battlefield");
  });

  it("Stick, Fearless Mentor: a source you control dealing damage to you exiles the top card to play until the end of your next turn, once each turn", () => {
    supported(stick());
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, stick());
    const a = putOnBattlefield(s, ap, pain);
    const b = putOnBattlefield(s, ap, pain2);
    const top = s.players[ap]!.library[0]!;
    const second = s.players[ap]!.library[1]!;
    s = run(s, planActivate(s, ap, a, 0));
    s = settle(s);
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.objects[top]!.mayPlay?.player).toBe(ap);
    s = run(s, planActivate(s, ap, b, 0));
    s = settle(s);
    expect(s.objects[second]!.zone).toBe("library");
  });

  it("Wake to Slaughter: an opponent picks which target goes to your hand; the other returns with haste and is exiled at the next end step", () => {
    supported(wake());
    let { s, ap, opp, ids } = setup([wake()]);
    s.players[ap]!.hand = [ids[0]!];
    const g = into(s, ap, giant, "graveyard");
    const b = into(s, ap, bear(), "graveyard");
    s = run(s, planCast(s, ap, ids[0]!, [tgt(g), tgt(b)]));
    s = settle(s, { me: [ap, opp] });
    // You choose the opponent, then they choose.
    expect(s.pending?.kind).toBe("chooseOption");
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    s = settle(s, { me: [opp] });
    const p = s.pending;
    expect(p?.kind).toBe("searchLibrary");
    if (p?.kind !== "searchLibrary") throw new Error("no pick");
    expect(p.player).toBe(opp);
    expect([...p.cards].sort()).toEqual([g, b].sort());
    s = act(s, { type: "searchLibrary", player: opp, found: [g] });
    s = settle(s);
    expect(s.objects[g]!.zone).toBe("hand");
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.controller).toBe(ap);
    expect(characteristics(s, s.objects[b]!).keywords).toContain("Haste");
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("exile");
  });

  it("Wake to Slaughter: with one target, that card goes to your hand (rulings)", () => {
    let { s, ap, ids } = setup([wake()]);
    const b = into(s, ap, bear(), "graveyard");
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b), { kind: "none" } as TargetChoice]));
    s = settle(s, { me: [ap] });
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: s.pending.options[0]! });
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("hand");
    expect(compileCard(wake()).spell!.targets.length).toBe(2);
  });
});
