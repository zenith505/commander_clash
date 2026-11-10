// Lane B round B175: Seton's Desire (a threshold Lure on an Aura), Grand Master of Flowers (a 7/7 Dragon God creature, not
// a planeswalker, while he has seven or more loyalty counters), Torrent Elemental (an ability that works only from exile),
// Sevinne, the Chronoclasm ("your first instant or sorcery spell from your graveyard each turn"), Ian the Reckless (damage
// to you and any target at once), Thrill-Kill Disciple ("Squad—{1}, Discard a card."), Fatal Fissure ("When that creature
// dies this turn, you earthbend 4") and Outpace Oblivion ("each player who doesn't have max speed").

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const seton = (): CardDef => ({"oracleId":"76fe7cfa-c3db-4122-b262-f7c5c90fcdd7","name":"Seton's Desire","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+2.\nThreshold — As long as there are seven or more cards in your graveyard, all creatures able to block enchanted creature do so.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant","Threshold"],"imageUrl":"https://cards.scryfall.io/normal/front/7/0/70d05b6a-5c7e-4e08-88d3-98f2b5b054bc.jpg?1783945212","artUrl":"https://cards.scryfall.io/art_crop/front/7/0/70d05b6a-5c7e-4e08-88d3-98f2b5b054bc.jpg?1783945212","commanderLegal":"legal","set":"ody","releasedAt":"2001-10-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const master = (): CardDef => ({"oracleId":"1f3dbc53-4075-40b8-b70d-ce74d3ff5f6d","name":"Grand Master of Flowers","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Legendary Planeswalker — Bahamut","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Bahamut"],"oracleText":"As long as Grand Master of Flowers has seven or more loyalty counters on him, he's a 7/7 Dragon God creature with flying and indestructible.\n+1: Target creature without first strike, double strike, or vigilance can't attack or block until your next turn.\n+1: Search your library and/or graveyard for a card named Monk of the Open Hand, reveal it, and put it into your hand. If you search your library this way, shuffle.","loyalty":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/c/8ca4ffff-404e-4e8e-8fd6-4e64d4828fc7.jpg?1783926531","artUrl":"https://cards.scryfall.io/art_crop/front/8/c/8ca4ffff-404e-4e8e-8fd6-4e64d4828fc7.jpg?1783926531","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const torrent = (): CardDef => ({"oracleId":"0335e7db-5e0e-4271-8ae7-437a1d2c16ac","name":"Torrent Elemental","manaCost":"{4}{U}","cmc":5,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"Flying\nWhenever this creature attacks, tap all creatures defending player controls.\n{3}{B/G}{B/G}: Put this card from exile onto the battlefield tapped. Activate only as a sorcery.","power":"3","toughness":"5","colors":["U"],"colorIdentity":["B","G","U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/c/dc4850e4-acb9-458d-952f-b3952cab2a5b.jpg?1783938700","artUrl":"https://cards.scryfall.io/art_crop/front/d/c/dc4850e4-acb9-458d-952f-b3952cab2a5b.jpg?1783938700","commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const sevinne = (): CardDef => ({"oracleId":"869c9bc4-2b21-40c3-8b1c-c83269c856d0","name":"Sevinne, the Chronoclasm","manaCost":"{2}{U}{R}{W}","cmc":5,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Prevent all damage that would be dealt to Sevinne.\nWhenever you cast your first instant or sorcery spell from your graveyard each turn, copy that spell. You may choose new targets for the copy.","power":"2","toughness":"2","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c209efe-b4dc-44a3-bd45-d647f5680cbe.jpg?1783932797","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c209efe-b4dc-44a3-bd45-d647f5680cbe.jpg?1783932797","commanderLegal":"legal","set":"c19","releasedAt":"2019-08-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const ian = (): CardDef => ({"oracleId":"0727ce6a-aae2-4ddc-9e6c-b18011c5bd37","name":"Ian the Reckless","manaCost":"{1}{R}","cmc":2,"typeLine":"Legendary Creature — Human Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"Whenever Ian the Reckless attacks, if it's modified, you may have it deal damage equal to its power to you and any target. (Equipment, Auras you control, and counters are modifications.)","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/c/4cd46b6a-eb20-4ffa-94e0-47d1d2d46087.jpg?1783912404","artUrl":"https://cards.scryfall.io/art_crop/front/4/c/4cd46b6a-eb20-4ffa-94e0-47d1d2d46087.jpg?1783912404","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const thrill = (): CardDef => ({"oracleId":"7273118b-08af-41cd-a316-6bf61dc45b6c","name":"Thrill-Kill Disciple","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Mercenary","supertypes":[],"types":["Creature"],"subtypes":["Human","Mercenary"],"oracleText":"Squad—{1}, Discard a card. (As an additional cost to cast this spell, you may pay its squad cost any number of times. When this creature enters, create that many tokens that are copies of it.)\nWhen this creature dies, create a Junk token.","power":"3","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Squad"],"imageUrl":"https://cards.scryfall.io/normal/front/5/6/5628e781-9f12-49ed-a575-6b467d39510b.jpg?1783912400","artUrl":"https://cards.scryfall.io/art_crop/front/5/6/5628e781-9f12-49ed-a575-6b467d39510b.jpg?1783912400","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fissure = (): CardDef => ({"oracleId":"202e45d6-8c7a-46db-85fb-634aa77b4097","name":"Fatal Fissure","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose target creature. When that creature dies this turn, you earthbend 4. (Target land you control becomes a 0/0 creature with haste that's still a land. Put four +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)","colors":["B"],"colorIdentity":["B"],"keywords":["Earthbend"],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/3343933d-4425-4ede-8d92-876bd0c6df60.jpg?1783904973","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/3343933d-4425-4ede-8d92-876bd0c6df60.jpg?1783904973","commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const outpace = (): CardDef => ({"oracleId":"4d92f48d-c851-4b71-b7fa-916459928d59","name":"Outpace Oblivion","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Start your engines! (If you have no speed, it starts at 1. It increases once on each of your turns when an opponent loses life. Max speed is 4.)\nWhen this enchantment enters, it deals 5 damage to up to one target creature or planeswalker.\n{2}, Sacrifice this enchantment: It deals 2 damage to each player who doesn't have max speed.","colors":["R"],"colorIdentity":["R"],"keywords":["Start your engines!"],"imageUrl":"https://cards.scryfall.io/normal/front/c/2/c22e415f-636f-4394-9b21-600ab720ac98.jpg?1783907878","artUrl":"https://cards.scryfall.io/art_crop/front/c/2/c22e415f-636f-4394-9b21-600ab720ac98.jpg?1783907878","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const think = (): CardDef => ({"oracleId":"fa85c5a2-8e83-4624-a35a-a0bbf17ecbb4","name":"Think Twice","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["U"],"colorIdentity":["U"],"keywords":["Flashback"],"imageUrl":"https://cards.scryfall.io/normal/front/8/5/85835de4-66ea-4ba1-87ca-6bcec2a8660a.jpg?1783903015","artUrl":"https://cards.scryfall.io/art_crop/front/8/5/85835de4-66ea-4ba1-87ca-6bcec2a8660a.jpg?1783903015","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const doom = (): CardDef => ({"oracleId":"59e7f2ae-4535-4191-98be-3e65b6b2befa","name":"Doom Blade","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target nonblack creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/d/5dcd0c4e-4047-47a2-8969-c62616d457c2.jpg?1783903090","artUrl":"https://cards.scryfall.io/art_crop/front/5/d/5dcd0c4e-4047-47a2-8969-c62616d457c2.jpg?1783903090","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty; `targets` answers a question about targets, `yes` a "may", the bots the
 * rest.
 */
const settle = (s: GameState, opts: { targets?: TargetChoice[]; yes?: boolean } = {}) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets } as Action);
    else if (p?.kind === "chooseMay" && opts.yes !== undefined) s = act(s, { type: "chooseMay", player: p.player, yes: opts.yes });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** A fresh copy of `def` in `zone` of `pid`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Declares `attacks` and gets to the declare blockers step, the other players declaring no blocks before `opp`. */
const toBlocks = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], opp: PlayerId) => {
  s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 40 && s.pending?.kind !== "declareBlockers" && s.step !== "endCombat"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  while (s.pending?.kind === "declareBlockers" && s.pending.player !== opp) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return s;
};

describe("Lane B round B175: cards", () => {
  it("compile", () => supported(seton(), master(), torrent(), sevinne(), ian(), thrill(), fissure(), outpace()));
});

describe("Seton's Desire", () => {
  it("+2/+2 always; all creatures able to block the enchanted creature do so only with seven or more cards in your graveyard", () => {
    for (const cards of [6, 7]) {
      const { s: s0, ap, ids, opp } = setup([seton()]);
      const a = putOnBattlefield(s0, ap, bears());
      putOnBattlefield(s0, opp, bears());
      for (let i = 0; i < cards; i++) into(s0, ap, giant(), "graveyard");
      let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
      expect(s.objects[ids[0]!]!.attachedTo).toBe(a);
      expect(pt(s, a)).toBe("4/4");
      s = toBlocks(s, ap, [{ attacker: a, defender: opp }], opp);
      expect(s.pending?.kind).toBe("declareBlockers");
      if (cards === 7) expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow(/must block/);
      else expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).not.toThrow();
    }
  });
  it("a creature that can't block it (tapped) doesn't have to (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([seton()]);
    const a = putOnBattlefield(s0, ap, bears());
    const b = putOnBattlefield(s0, opp, bears());
    s0.objects[b]!.tapped = true;
    for (let i = 0; i < 7; i++) into(s0, ap, giant(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    s = toBlocks(s, ap, [{ attacker: a, defender: opp }], opp);
    if (s.pending?.kind === "declareBlockers") expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).not.toThrow();
  });
});

describe("Grand Master of Flowers", () => {
  it("with seven or more loyalty counters he's a legendary 7/7 Dragon God creature with flying and indestructible, not a planeswalker", () => {
    const { s: s0, ap } = setup([]);
    const gm = putOnBattlefield(s0, ap, master());
    s0.objects[gm]!.counters.loyalty = 6;
    invalidateCharacteristics(s0);
    let c = characteristics(s0, s0.objects[gm]!);
    expect(c.types).toEqual(["Planeswalker"]);
    expect(c.subtypes).toEqual(["Bahamut"]);
    // His +1 (the search) takes him to seven: a creature before anyone could respond (rulings), and the ability still works.
    let s = run(s0, planActivate(s0, ap, gm, 1));
    expect(s.objects[gm]!.counters.loyalty).toBe(7);
    c = characteristics(s, s.objects[gm]!);
    expect(c.types).toEqual(["Creature"]);
    expect(c.subtypes).toEqual(["Dragon", "God"]);
    expect(c.supertypes).toContain("Legendary");
    expect(c.keywords).toEqual(expect.arrayContaining(["Flying", "Indestructible"]));
    expect(pt(s, gm)).toBe("7/7");
    s = settle(s);
    expect(s.stack.length).toBe(0);
    // Loyalty abilities can still be activated, once a turn as before (CR 606.3).
    expect(planActivate(s, ap, gm, 1)).toBeNull();
  });
  it("damage dealt to him while he's a creature is marked on him and doesn't remove loyalty (rulings)", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    const gm = putOnBattlefield(s0, ap, master());
    s0.objects[gm]!.counters.loyalty = 8;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(gm)])));
    expect(s.objects[gm]!.zone).toBe("battlefield");
    expect(s.objects[gm]!.counters.loyalty).toBe(8);
    expect(s.objects[gm]!.damage).toBe(3);
  });
  it("as a planeswalker his loyalty takes the damage; as a creature he can't be attacked", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    const gm = putOnBattlefield(s0, ap, master());
    s0.objects[gm]!.counters.loyalty = 3;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(gm)])));
    expect(s.objects[gm]!.zone).toBe("graveyard");
    // An opponent's creature can attack him as a planeswalker, not as a creature (CR 506.2, 508.1b).
    const { s: s1, ap: ap1, opp } = setup([]);
    const walker = putOnBattlefield(s1, ap1, master());
    s1.objects[walker]!.counters.loyalty = 6;
    const bear = putOnBattlefield(s1, opp, bears());
    let t = passUntil(s1, "declareAttackers", opp);
    t.objects[walker]!.counters.loyalty = 7;
    invalidateCharacteristics(t);
    expect(() => act(t, { type: "declareAttackers", player: opp, attacks: [{ attacker: bear, defender: ap1, planeswalker: walker }] })).toThrow(/planeswalker/);
    t.objects[walker]!.counters.loyalty = 6;
    invalidateCharacteristics(t);
    t = act(t, { type: "declareAttackers", player: opp, attacks: [{ attacker: bear, defender: ap1, planeswalker: walker }] });
    // He becomes a creature while it's attacking him: it stays attacking but deals no combat damage (CR 506.4, rulings).
    t.objects[walker]!.counters.loyalty = 7;
    invalidateCharacteristics(t);
    const life = t.players[ap1]!.life;
    for (let i = 0; i < 200 && t.step !== "endCombat"; i++) {
      const p = t.pending;
      if (p?.kind === "declareBlockers") t = act(t, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) for (const a of botActions(t, p.player)) t = act(t, a);
      else t = act(t, { type: "passPriority", player: waitingOn(t)! });
    }
    expect(t.objects[walker]!.counters.loyalty).toBe(7);
    expect(t.objects[walker]!.damage ?? 0).toBe(0);
    expect(t.players[ap1]!.life).toBe(life);
  });
});

describe("Torrent Elemental", () => {
  it("from exile: onto the battlefield tapped, as a sorcery, by its owner; not from the graveyard or the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = into(s0, ap, torrent(), "exile");
    const s = settle(run(s0, planActivate(s0, ap, t, 0)));
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(s.objects[t]!.tapped).toBe(true);
    expect(s.objects[t]!.controller).toBe(ap);
    // Its ability on the battlefield and in the graveyard does nothing (CR 113.6m).
    expect(planActivate(s, ap, t, 0)).toBeNull();
    const { s: s1 } = setup([]);
    const y = into(s1, ap, torrent(), "graveyard");
    expect(planActivate(s1, ap, y, 0)).toBeNull();
    // Only its owner may activate it; a face-down exiled card has no abilities (CR 406.3, 708.2).
    const theirs = into(s1, opp, torrent(), "exile");
    expect(planActivate(s1, ap, theirs, 0)).toBeNull();
    const hidden = into(s1, ap, torrent(), "exile");
    s1.objects[hidden]!.faceDown = true;
    invalidateCharacteristics(s1);
    expect(planActivate(s1, ap, hidden, 0)).toBeNull();
  });
  it("only as a sorcery", () => {
    const { s: s0, ap } = setup([]);
    const t = into(s0, ap, torrent(), "exile");
    const s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(planActivate(s, ap, t, 0)).toBeNull();
  });
});

describe("Sevinne, the Chronoclasm", () => {
  it("copies your first instant or sorcery spell cast from your graveyard each turn, not the second", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, sevinne());
    const t1 = into(s0, ap, think(), "graveyard");
    const t2 = into(s0, ap, think(), "graveyard");
    const hand0 = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, t1, undefined, undefined, undefined, undefined, { via: "flashback" }));
    expect(s.triggerQueue.length + s.stack.length).toBe(2);
    s = settle(s);
    // Think Twice and its copy: two cards.
    expect(s.players[ap]!.hand.length).toBe(hand0 + 2);
    s = run(s, planCast(s, ap, t2, undefined, undefined, undefined, undefined, { via: "flashback" }));
    expect(s.stack.length).toBe(1);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand0 + 3);
  });
  it("one cast from the hand doesn't count, and one cast from the graveyard before it entered does (rulings)", () => {
    const { s: s0, ap, ids } = setup([think()]);
    const t1 = into(s0, ap, think(), "graveyard");
    // From the hand first: the one from the graveyard after it is still the first from there.
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    putOnBattlefield(s, ap, sevinne());
    s = run(s, planCast(s, ap, t1, undefined, undefined, undefined, undefined, { via: "flashback" }));
    expect(s.triggerQueue.length + s.stack.length).toBe(2);
    s = settle(s);
    const { s: s1, ap: ap1 } = setup([]);
    const a = into(s1, ap1, think(), "graveyard");
    const b = into(s1, ap1, think(), "graveyard");
    let t = settle(run(s1, planCast(s1, ap1, a, undefined, undefined, undefined, undefined, { via: "flashback" })));
    putOnBattlefield(t, ap1, sevinne());
    t = run(t, planCast(t, ap1, b, undefined, undefined, undefined, undefined, { via: "flashback" }));
    expect(t.triggerQueue.length + t.stack.length).toBe(1);
  });
  it("prevents all damage that would be dealt to it", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    const sv = putOnBattlefield(s0, ap, sevinne());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(sv)])));
    expect(s.objects[sv]!.zone).toBe("battlefield");
    expect(s.objects[sv]!.damage ?? 0).toBe(0);
  });
});

describe("Ian the Reckless", () => {
  it("modified: it deals damage equal to its power to you and to any target", () => {
    const { s: s0, ap, opp } = setup([]);
    const i = putOnBattlefield(s0, ap, ian());
    s0.objects[i]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s0);
    const [mine, theirs] = [s0.players[ap]!.life, s0.players[opp]!.life];
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: i, defender: opp }] });
    s = settle(s, { targets: [{ kind: "player", id: opp }], yes: true });
    expect(s.players[ap]!.life).toBe(mine - 4);
    expect(s.players[opp]!.life).toBe(theirs - 4);
  });
  it("declining does nothing; not modified, it doesn't trigger", () => {
    const { s: s0, ap, opp } = setup([]);
    const i = putOnBattlefield(s0, ap, ian());
    s0.objects[i]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const [mine, theirs] = [s0.players[ap]!.life, s0.players[opp]!.life];
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: i, defender: opp }] });
    s = settle(s, { targets: [{ kind: "player", id: opp }], yes: false });
    expect(s.players[ap]!.life).toBe(mine);
    expect(s.players[opp]!.life).toBe(theirs);
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const plain = putOnBattlefield(s1, ap1, ian());
    const t = act(passUntil(s1, "declareAttackers", ap1), { type: "declareAttackers", player: ap1, attacks: [{ attacker: plain, defender: opp1 }] });
    expect(t.triggerQueue.length + t.stack.length).toBe(0);
    expect(t.pending?.kind).not.toBe("chooseTargets");
  });
});

describe("Thrill-Kill Disciple", () => {
  it("squad twice: {1} and a discarded card for each, two token copies", () => {
    const { s: s0, ap, ids } = setup([thrill(), bears(), giant(), bolt()]);
    const [tk, b, g] = ids as [string, string, string];
    expect(castProblem(s0, ap, tk, [], undefined, undefined, undefined, undefined, { kicks: [0, 0], discard: [b] })).not.toBeNull();
    let s = run(s0, planCast(s0, ap, tk, [], undefined, "auto", undefined, { kicks: [0, 0], discard: [b, g] }));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[g]!.zone).toBe("graveyard");
    s = settle(s);
    expect(s.objects[tk]!.zone).toBe("battlefield");
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.name === "Thrill-Kill Disciple");
    expect(tokens.length).toBe(2);
    expect(s.objects[ids[3]!]!.zone).toBe("hand");
  });
  it("not paid: no discard, no tokens", () => {
    const { s: s0, ap, ids } = setup([thrill(), bears()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [])));
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken).length).toBe(0);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });
});

describe("Fatal Fissure", () => {
  it("when the chosen creature dies this turn, you earthbend 4 (a land you control, chosen then)", () => {
    const { s: s0, ap, ids, opp } = setup([fissure(), doom()]);
    const b = putOnBattlefield(s0, opp, bears());
    const land = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.objects[land]!.counters["+1/+1"] ?? 0).toBe(0);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])), { targets: [tgt(land)] });
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[land]!.counters["+1/+1"]).toBe(4);
    const c = characteristics(s, s.objects[land]!);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.keywords).toContain("Haste");
    expect(pt(s, land)).toBe("4/4");
  });
  it("only this turn", () => {
    const { s: s0, ap, ids, opp } = setup([fissure()]);
    const b = putOnBattlefield(s0, opp, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    s = passUntil(s, "upkeep", opp);
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land"));
    s.objects[b]!.damage = 2;
    invalidateCharacteristics(s);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(lands.every((l) => !s.objects[l]!.counters["+1/+1"])).toBe(true);
  });
});

describe("Outpace Oblivion", () => {
  it("2 damage to each player who doesn't have max speed", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, outpace());
    s0.players[ap]!.speed = 3;
    s0.players[opp]!.speed = 4;
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    const life0 = Object.fromEntries(s0.turnOrder.map((p) => [p, s0.players[p]!.life]));
    const s = settle(run(s0, planActivate(s0, ap, o, 0)));
    expect(s.objects[o]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life0[ap]! - 2);
    expect(s.players[opp]!.life).toBe(life0[opp]!);
    for (const p of others) expect(s.players[p]!.life).toBe(life0[p]! - 2);
  });
});
