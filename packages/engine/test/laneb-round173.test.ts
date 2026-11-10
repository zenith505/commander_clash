// Lane B round B173: Cryoshatter ("becomes tapped or is dealt damage", two events of one ability), Nullstone Gargoyle
// ("the first noncreature spell of a turn", by any player), Avenge ("if a player attacked you during their last turn"),
// Faith's Shield (fateful hour: one color, chosen as it resolves, for the target or for you and your permanents), Saw ("a
// permanent other than that creature or ~"), Key to the Side-Door (a discard cost "with the same name as a legendary
// permanent you control"), Skyblade's Boon (one ability that works on the battlefield or in the graveyard), Glimpse the
// Cosmos (cast from the graveyard for {U} while you control a Giant, exiled instead of going to the graveyard).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityCosts, abilityProblem, botActions, characteristics, compileCard, dealDamage, invalidateCharacteristics, isFullySupported, manaValue, objectSource, planActivate, planCast, power, spellCost, tapPermanent, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const cryoshatter = (): CardDef => ({"oracleId":"865715e9-6759-4e01-803d-702c959e386e","name":"Cryoshatter","manaCost":"{U}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets -5/-0.\nWhen enchanted creature becomes tapped or is dealt damage, destroy it.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/7/b/7b62b1e2-9e43-4a66-a647-7e5de2871f2a.jpg?1783905983","artUrl":"https://cards.scryfall.io/art_crop/front/7/b/7b62b1e2-9e43-4a66-a647-7e5de2871f2a.jpg?1783905983","commanderLegal":"legal","set":"eoe","releasedAt":"2025-08-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const nullstone = (): CardDef => ({"oracleId":"7b175a33-a05c-49fa-802a-36f7013c892a","name":"Nullstone Gargoyle","manaCost":"{9}","cmc":9,"typeLine":"Artifact Creature — Gargoyle","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Gargoyle"],"oracleText":"Flying\nWhenever the first noncreature spell of a turn is cast, counter that spell.","power":"4","toughness":"5","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/1/d/1dc3aa88-2555-4862-a771-e9d5b9eab3ad.jpg?1783943597","artUrl":"https://cards.scryfall.io/art_crop/front/1/d/1dc3aa88-2555-4862-a771-e9d5b9eab3ad.jpg?1783943597","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const avenge = (): CardDef => ({"oracleId":"65a64759-3a93-4542-84fc-3af5ccb741f4","name":"Avenge","manaCost":"{4}{W}{W}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {2} less to cast if a player attacked you during their last turn.\nDestroy all creatures. You gain 1 life for each creature destroyed this way.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/b/8b385779-bc6b-4f67-8724-d8ae136d1436.jpg?1783903299","artUrl":"https://cards.scryfall.io/art_crop/front/8/b/8b385779-bc6b-4f67-8724-d8ae136d1436.jpg?1783903299","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const faithsShield = (): CardDef => ({"oracleId":"dd3cc9e5-b99a-429c-baeb-663a7af70081","name":"Faith's Shield","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target permanent you control gains protection from the color of your choice until end of turn.\nFateful hour — If you have 5 or less life, instead you and each permanent you control gain protection from the color of your choice until end of turn.","colors":["W"],"colorIdentity":["W"],"keywords":["Fateful hour"],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/65eb5920-3b03-4300-bc77-0fba5e6abe69.jpg?1783940856","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/65eb5920-3b03-4300-bc77-0fba5e6abe69.jpg?1783940856","commanderLegal":"legal","set":"dka","releasedAt":"2012-02-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const saw = (): CardDef => ({"oracleId":"d88bfa98-6869-4d64-a9d2-07a308a67fe2","name":"Saw","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nWhenever equipped creature attacks, you may sacrifice a permanent other than that creature or this Equipment. If you do, draw a card.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/603c3ef4-4ef1-4db8-9ed2-e2b0926269d5.jpg?1783909430","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/603c3ef4-4ef1-4db8-9ed2-e2b0926269d5.jpg?1783909430","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const keyDoor = (): CardDef => ({"oracleId":"76c036df-44f5-4021-b7fc-656147351341","name":"Key to the Side-Door","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}, {T}: Target creature can't be blocked this turn.\n{1}, {T}, Discard a legendary card with the same name as a legendary permanent you control: Draw two cards.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/898c14a2-d897-4341-83ed-eee666df9648.jpg?1785412757","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/898c14a2-d897-4341-83ed-eee666df9648.jpg?1785412757","commanderLegal":"legal","set":"hob","releasedAt":"2026-08-14","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const skyblade = (): CardDef => ({"oracleId":"a03a9ddb-595a-4dff-b7cb-7ad60655f1ee","name":"Skyblade's Boon","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+1 and has flying.\n{2}{W}: Return Skyblade's Boon to its owner's hand. Activate only if Skyblade's Boon is on the battlefield or in your graveyard.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/e/5/e5705397-525b-4106-92ab-fe8ec9f561a2.jpg?1783926884","artUrl":"https://cards.scryfall.io/art_crop/front/e/5/e5705397-525b-4106-92ab-fe8ec9f561a2.jpg?1783926884","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const glimpse = (): CardDef => ({"oracleId":"27065d34-b22a-47af-aea2-980f47bafcea","name":"Glimpse the Cosmos","manaCost":"{1}{U}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Look at the top three cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order.\nAs long as you control a Giant, you may cast this card from your graveyard by paying {U} rather than paying its mana cost. If you cast this card this way and it would be put into your graveyard, exile it instead.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/c/dc96ebe8-f4b3-4788-a6f5-2a50b6c0d935.jpg?1783928262","artUrl":"https://cards.scryfall.io/art_crop/front/d/c/dc96ebe8-f4b3-4788-a6f5-2a50b6c0d935.jpg?1783928262","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const isamaru = (): CardDef => ({"oracleId":"cfb756dd-6fe1-430a-8f04-8b10cac62a86","name":"Isamaru, Hound of Konda","manaCost":"{W}","cmc":1,"typeLine":"Legendary Creature — Dog","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dog"],"oracleText":"","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2e7f9919-0713-4ef9-96eb-3e0c444e47f4.jpg?1783944338","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2e7f9919-0713-4ef9-96eb-3e0c444e47f4.jpg?1783944338","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const llanowar = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Settles, the bots answering every question (`me`'s too unless `stopFor`). */
const settleBots = (s: GameState, stopFor?: PlayerId) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) {
      if (s.pending.player === stopFor) return s;
      for (const a of botActions(s, s.pending.player)) s = act(s, a);
      continue;
    }
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** A fresh copy of `def` in `zone` of `pid`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library", top = false) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library" && top) s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const toGraveyard = (s: GameState, pid: PlayerId, id: string) => {
  const p = s.players[pid]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  p.graveyard.push(id);
  s.objects[id]!.zone = "graveyard";
  invalidateCharacteristics(s);
};
const kw = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords;

describe("Lane B round B173: cards", () => {
  it("compile", () => supported(cryoshatter(), nullstone(), avenge(), faithsShield(), saw(), keyDoor(), skyblade(), glimpse()));
});

describe("Cryoshatter", () => {
  it("gives -5/-0; when the enchanted creature becomes tapped, it's destroyed", () => {
    const { s: s0, ap, ids } = setup([cryoshatter()]);
    const elf = putOnBattlefield(s0, ap, llanowar());
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [tgt(elf)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(elf);
    expect(power(s, s.objects[elf]!)).toBe(-4);
    tapPermanent(s, s.objects[elf]!);
    s = settleBots(s);
    expect(s.objects[elf]!.zone).toBe("graveyard");
  });
  it("when the enchanted creature is dealt damage, it's destroyed (a 3/3 dealt 2)", () => {
    const { s: s0, ap, ids, opp } = setup([cryoshatter()]);
    const g = putOnBattlefield(s0, opp, giant());
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [tgt(g)])));
    expect(pt(s, g)).toBe("-2/3");
    dealDamage(s, objectSource(s, s.objects[g]!), { object: s.objects[g]! }, 2);
    s = settleBots(s);
    expect(s.objects[g]!.zone).toBe("graveyard");
  });
  it("an already tapped creature isn't destroyed until it becomes tapped again (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([cryoshatter()]);
    const g = putOnBattlefield(s0, opp, giant());
    s0.objects[g]!.tapped = true;
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [tgt(g)])));
    expect(s.objects[g]!.zone).toBe("battlefield");
    s.objects[g]!.tapped = false;
    tapPermanent(s, s.objects[g]!);
    s = settleBots(s);
    expect(s.objects[g]!.zone).toBe("graveyard");
  });
});

describe("Nullstone Gargoyle", () => {
  it("counters the first noncreature spell of the turn; a creature spell before it doesn't count, and the second noncreature spell resolves", () => {
    const { s: s0, ap, ids } = setup([bears(), divination(), shock()]);
    putOnBattlefield(s0, ap, nullstone());
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    const hand = s.players[ap]!.hand.length;
    s = settleBots(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    const opp = s.turnOrder.find((p) => p !== ap)!;
    const life = s.players[opp]!.life;
    s = settleBots(run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: opp } as TargetChoice])));
    expect(s.players[opp]!.life).toBe(life - 2);
  });
  it("a noncreature spell another player cast earlier this turn, before ~ was there, was the first: nothing is countered", () => {
    const { s: s0, ap, ids } = setup([divination()]);
    const opp = s0.turnOrder.find((p) => p !== ap)!;
    // An opponent's instant cast earlier this turn (with flash timing), before Nullstone Gargoyle entered.
    (s0.castThisTurn ??= []).push({ player: opp, card: shock().oracleId, name: "Shock", colors: ["R"], types: ["Instant"], from: "hand", mv: 1 });
    s0.cards[shock().oracleId] ??= shock();
    putOnBattlefield(s0, ap, nullstone());
    const hand = s0.players[ap]!.hand.length;
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("Avenge", () => {
  it("costs {2} less if a player attacked you during their last turn; destroys all creatures and you gain 1 life for each", () => {
    const { s: s0, ap, ids, opp } = setup([avenge()]);
    const cost = (s: GameState) => ((c) => manaValue(c.cost) + c.extra)(spellCost(s, ap, s.objects[ids[0]!]!));
    expect(cost(s0)).toBe(6);
    // An attack on you in an earlier turn of theirs doesn't count; one in their latest turn does.
    s0.players[opp]!.turnBegan = s0.turn - 1;
    s0.players[opp]!.attackedInTurn = { turn: s0.turn - 5, players: [ap] };
    expect(cost(s0)).toBe(6);
    s0.players[opp]!.attackedInTurn = { turn: s0.turn - 1, players: [ap] };
    expect(cost(s0)).toBe(4);
    // Attacking someone else doesn't count.
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    s0.players[opp]!.attackedInTurn = { turn: s0.turn - 1, players: [other] };
    expect(cost(s0)).toBe(6);
    s0.players[opp]!.attackedInTurn = { turn: s0.turn - 1, players: [ap] };
    for (const p of s0.turnOrder) putOnBattlefield(s0, p, bears());
    const life = s0.players[ap]!.life;
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.battlefield.filter((id) => characteristics(s, s.objects[id]!).types.includes("Creature"))).toEqual([]);
    expect(s.players[ap]!.life).toBe(life + 4);
  });
});

describe("Faith's Shield", () => {
  it("above 5 life: only the target gains protection from the color chosen as it resolves", () => {
    const { s: s0, ap, ids, opp } = setup([faithsShield()]);
    const b = putOnBattlefield(s0, ap, bears());
    const other = putOnBattlefield(s0, ap, bears());
    const g = putOnBattlefield(s0, opp, giant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("color");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Red" }));
    expect(kw(s, b)).toContain("Protection from red");
    expect(kw(s, other)).not.toContain("Protection from red");
    const life = s.players[ap]!.life;
    dealDamage(s, objectSource(s, s.objects[g]!), { player: ap }, 3);
    expect(s.players[ap]!.life).toBe(life - 3);
  });
  it("fateful hour (5 or less life): instead you and each permanent you control gain protection from that one color", () => {
    const { s: s0, ap, ids, opp } = setup([faithsShield()]);
    const b = putOnBattlefield(s0, ap, bears());
    const other = putOnBattlefield(s0, ap, bears());
    const g = putOnBattlefield(s0, opp, giant());
    s0.players[ap]!.life = 5;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("color");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Red" }));
    expect(kw(s, b)).toContain("Protection from red");
    expect(kw(s, other)).toContain("Protection from red");
    dealDamage(s, objectSource(s, s.objects[g]!), { player: ap }, 3);
    expect(s.players[ap]!.life).toBe(5);
    // Only red: a green source still deals damage.
    const greenBear = putOnBattlefield(s, opp, bears());
    dealDamage(s, objectSource(s, s.objects[greenBear]!), { player: ap }, 2);
    expect(s.players[ap]!.life).toBe(3);
  });
});

describe("Saw", () => {
  it("when the equipped creature attacks, you may sacrifice a permanent other than it or Saw; if you do, draw a card", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bears());
    const sw = putOnBattlefield(s0, ap, saw());
    s0.objects[sw]!.attachedTo = b;
    const fodder = putOnBattlefield(s0, ap, llanowar());
    invalidateCharacteristics(s0);
    expect(pt(s0, b)).toBe("4/2");
    let s = settle(act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] }));
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    const pend = s.pending;
    expect(pend?.kind).toBe("pickPermanents");
    const options = pend?.kind === "pickPermanents" ? pend.options : [];
    expect(options).toContain(fodder);
    expect(options).not.toContain(b);
    expect(options).not.toContain(sw);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [fodder] }));
    expect(s.objects[fodder]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("Key to the Side-Door", () => {
  it("discards only a legendary card with the name of a legendary permanent you control, to draw two", () => {
    const { s: s0, ap, ids } = setup([isamaru(), bears()]);
    const key = putOnBattlefield(s0, ap, keyDoor());
    // No Isamaru on the battlefield yet: nothing can be discarded for it.
    expect(abilityProblem(s0, ap, key, 1, undefined, undefined, undefined, undefined, { discard: [ids[0]!] })).toMatch(/discard|choose/);
    putOnBattlefield(s0, ap, isamaru());
    invalidateCharacteristics(s0);
    expect(abilityProblem(s0, ap, key, 1, undefined, undefined, undefined, undefined, { discard: [ids[1]!] })).toMatch(/discard|choose/);
    // Only the mana is left to pay (CR 602.2b: abilityProblem without a payment).
    expect(abilityProblem(s0, ap, key, 1, undefined, undefined, undefined, undefined, { discard: [ids[0]!] })).toMatch(/not enough mana/);
    const hand = s0.players[ap]!.hand.length;
    const s = settleBots(run(s0, planActivate(s0, ap, key, 1, undefined, undefined, undefined, undefined, { discard: [ids[0]!] })));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });
  it("a bot uses it to discard a second copy of its legendary creature", () => {
    const { s: s0, ap, ids } = setup([isamaru()]);
    const key = putOnBattlefield(s0, ap, keyDoor());
    putOnBattlefield(s0, ap, isamaru());
    for (let i = 0; i < 4; i++) into(s0, ap, bears(), "hand");
    const costs = abilityCosts(s0, ap, s0.objects[key]!, compileCard(keyDoor()).activated[1]!, []);
    expect(costs?.discard).toEqual([ids[0]]);
    const s = settleBots(run(s0, planActivate(s0, ap, key, 1, undefined, undefined, undefined, undefined, costs!)));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});

describe("Skyblade's Boon", () => {
  it("+1/+1 and flying; {2}{W} returns it to its owner's hand from the battlefield or from your graveyard", () => {
    const { s: s0, ap, ids } = setup([skyblade()]);
    const b = putOnBattlefield(s0, ap, bears());
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(pt(s, b)).toBe("3/3");
    expect(kw(s, b).map((k) => k.toLowerCase())).toContain("flying");
    expect(compileCard(skyblade()).activated.map((a) => a.zone ?? "battlefield")).toEqual(["battlefield", "graveyard"]);
    s = settleBots(run(s, planActivate(s, ap, ids[0]!, 0)));
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
    expect(pt(s, b)).toBe("2/2");
    toGraveyard(s, ap, ids[0]!);
    expect(planActivate(s, ap, ids[0]!, 0)).toBeNull();
    s = settleBots(run(s, planActivate(s, ap, ids[0]!, 1)));
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
  });
});

describe("Glimpse the Cosmos", () => {
  it("from the graveyard for {U} only while you control a Giant; then it's exiled instead of going to the graveyard", () => {
    const { s: s0, ap, ids } = setup([glimpse()]);
    toGraveyard(s0, ap, ids[0]!);
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "permission" })).toBeNull();
    putOnBattlefield(s0, ap, giant());
    invalidateCharacteristics(s0);
    const c = spellCost(s0, ap, s0.objects[ids[0]!]!, 0, [], { via: "permission" });
    expect(manaValue(c.cost) + c.extra).toBe(1);
    expect(JSON.stringify(c.cost)).toMatch(/"U"/);
    const hand = s0.players[ap]!.hand.length;
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "permission" })));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });
  it("cast from the hand, it goes to the graveyard as usual", () => {
    const { s: s0, ap, ids } = setup([glimpse()]);
    putOnBattlefield(s0, ap, giant());
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(planCast(s, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "permission" })).not.toBeNull();
  });
});
