// Lane B round B152: Marvel Boy, Noh-Varr ("whenever you activate a power-up ability", CR 702.193a), Martyr of Bones
// ("Reveal X black cards from your hand": "Exile up to X target cards from a single graveyard", CR 107.3a, 602.2b),
// Grenzo's Rebuttal ("Starting with you, each player chooses an artifact, a creature, and a land from among the
// permanents controlled by the player to their left", CR 101.4), Gauntlets of Chaos (an exchange of two artifacts,
// creatures or lands, then the Auras on them destroyed, CR 701.12b), Muse Vessel ("Choose a card exiled with ~. You may
// play that card this turn.", CR 607.2a), Pardic Dragon ("that player may put a time counter on ~" while it's suspended,
// CR 702.62b), Dubious Challenge (the exiled cards split between an opponent and you), Death-Mask Duplicant (keywords,
// landwalk and protection of the cards it exiled, CR 607.2a).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const marvel = (): CardDef => ({"oracleId":"7a315db3-e66c-4648-b7a0-5aef2ce9b580","name":"Marvel Boy, Noh-Varr","manaCost":"{1}{R/W}","cmc":2,"typeLine":"Legendary Creature — Kree Soldier Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Kree","Soldier","Hero"],"oracleText":"Whenever another creature you control enters and whenever you activate a power-up ability, put a +1/+1 counter on Marvel Boy.","power":"1","toughness":"1","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/89abf5d4-d462-4f6c-aa47-3df67a5e1a6f.jpg?1783903031","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/89abf5d4-d462-4f6c-aa47-3df67a5e1a6f.jpg?1783903031","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const brawler = (): CardDef => ({"oracleId":"a1a791be-71e6-4c1f-8717-08ca62d40de2","name":"Brave Brawler","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Warrior Hero","supertypes":[],"types":["Creature"],"subtypes":["Human","Warrior","Hero"],"oracleText":"Lifelink\nPower-up — {4}{W}: Put two +1/+1 counters on this creature. (Activate each power-up ability only once. Reduce the cost by its mana cost if it entered this turn.)","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Power-up","Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/2242b5c3-42ef-4be0-a61f-65c93e56fcab.jpg?1783902978","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/2242b5c3-42ef-4be0-a61f-65c93e56fcab.jpg?1783902978","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bones = (): CardDef => ({"oracleId":"a099d8fa-d51e-4dbc-a03f-6f912097d41e","name":"Martyr of Bones","manaCost":"{B}","cmc":1,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{1}, Reveal X black cards from your hand, Sacrifice this creature: Exile up to X target cards from a single graveyard.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/b/8bba602e-5a81-4da2-99c0-6082f8a981e1.jpg?1783943347","artUrl":"https://cards.scryfall.io/art_crop/front/8/b/8bba602e-5a81-4da2-99c0-6082f8a981e1.jpg?1783943347","commanderLegal":"legal","set":"csp","releasedAt":"2006-07-21","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const rebuttal = (): CardDef => ({"oracleId":"afcfcb74-ee64-4528-8498-2e8109ad5142","name":"Grenzo's Rebuttal","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Create a 4/4 red Ogre creature token. Starting with you, each player chooses an artifact, a creature, and a land from among the permanents controlled by the player to their left. Destroy each permanent chosen this way.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/b/1b798ace-18e4-45fb-98ae-69528f7b5a2f.jpg?1783939375","artUrl":"https://cards.scryfall.io/art_crop/front/1/b/1b798ace-18e4-45fb-98ae-69528f7b5a2f.jpg?1783939375","commanderLegal":"legal","set":"cns","releasedAt":"2014-06-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gauntlets = (): CardDef => ({"oracleId":"924ef69f-9977-439c-ace9-353b429e4be6","name":"Gauntlets of Chaos","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{5}, Sacrifice this artifact: Exchange control of target artifact, creature, or land you control and target permanent an opponent controls that shares one of those types with it. If those permanents are exchanged this way, destroy all Auras attached to them.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/f/6f8f11b5-3ba8-4913-b76a-fb469a74864d.jpg?1783948029","artUrl":"https://cards.scryfall.io/art_crop/front/6/f/6f8f11b5-3ba8-4913-b76a-fb469a74864d.jpg?1783948029","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const vessel = (): CardDef => ({"oracleId":"f7dcb605-c48e-4e21-86e2-0d0bd4bd2ec7","name":"Muse Vessel","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{3}, {T}: Target player exiles a card from their hand. Activate only as a sorcery.\n{1}: Choose a card exiled with this artifact. You may play that card this turn.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/0/10482209-19b1-4941-9133-f2764eeba092.jpg?1783943382","artUrl":"https://cards.scryfall.io/art_crop/front/1/0/10482209-19b1-4941-9133-f2764eeba092.jpg?1783943382","commanderLegal":"legal","set":"dis","releasedAt":"2006-05-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pardic = (): CardDef => ({"oracleId":"a4fa2afe-52fc-4ad0-a694-693cb9c88096","name":"Pardic Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.\nSuspend 2—{R}{R}\nWhenever an opponent casts a spell, if this card is suspended, that player may put a time counter on this card.","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Suspend"],"imageUrl":"https://cards.scryfall.io/normal/front/a/d/ad47d954-dda8-412a-b69b-a213bbd2f309.jpg?1783943217","artUrl":"https://cards.scryfall.io/art_crop/front/a/d/ad47d954-dda8-412a-b69b-a213bbd2f309.jpg?1783943217","commanderLegal":"legal","set":"tsp","releasedAt":"2006-10-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dubious = (): CardDef => ({"oracleId":"f73bf7c5-e43d-4684-8588-2fb400f2ca31","name":"Dubious Challenge","manaCost":"{3}{G}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Look at the top ten cards of your library, exile up to two creature cards from among them, then shuffle. Target opponent may choose one of the exiled cards and put it onto the battlefield under their control. Put the rest onto the battlefield under your control.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/2/92965a78-277d-4a27-8174-fc2564bd1ee3.jpg?1783937180","artUrl":"https://cards.scryfall.io/art_crop/front/9/2/92965a78-277d-4a27-8174-fc2564bd1ee3.jpg?1783937180","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const duplicant = (): CardDef => ({"oracleId":"8bdaa661-861b-4f91-83ea-467e34e11cc3","name":"Death-Mask Duplicant","manaCost":"{7}","cmc":7,"typeLine":"Artifact Creature — Shapeshifter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Shapeshifter"],"oracleText":"Imprint — {1}: Exile target creature card from your graveyard.\nAs long as a card exiled with this creature has flying, this creature has flying. The same is true for fear, first strike, double strike, haste, landwalk, protection, and trample.","power":"5","toughness":"5","colors":[],"colorIdentity":[],"keywords":["Imprint"],"imageUrl":"https://cards.scryfall.io/normal/front/0/1/01e8d67d-3b49-4158-b2bf-8dd0607de51f.jpg?1783944426","artUrl":"https://cards.scryfall.io/art_crop/front/0/1/01e8d67d-3b49-4158-b2bf-8dd0607de51f.jpg?1783944426","commanderLegal":"legal","set":"dst","releasedAt":"2004-02-06","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const whiteKnight = (): CardDef => ({"oracleId":"ddb021df-ae4a-4ac1-8353-d0b375761714","name":"White Knight","manaCost":"{W}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything black.)","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["First strike","Protection"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/401c4880-5598-44e6-a54b-6ea18e542a72.jpg?1783942396","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/401c4880-5598-44e6-a54b-6ea18e542a72.jpg?1783942396","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bogWraith = (): CardDef => ({"oracleId":"508248d1-09a4-4e41-a4c9-286618e5061e","name":"Bog Wraith","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Wraith","supertypes":[],"types":["Creature"],"subtypes":["Wraith"],"oracleText":"Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Landwalk","Swampwalk"],"imageUrl":"https://cards.scryfall.io/normal/front/d/1/d1b39f2d-96f2-4cac-9f6d-a061dbef749b.jpg?1783943042","artUrl":"https://cards.scryfall.io/art_crop/front/d/1/d1b39f2d-96f2-4cac-9f6d-a061dbef749b.jpg?1783943042","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string) => ({ kind: "object" as const, id });
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
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone === "hand" ? "hand" : "graveyard"].push(id);
  invalidateCharacteristics(s);
  return id;
};
const others = (s: GameState, ap: PlayerId) => {
  const i = s.turnOrder.indexOf(ap);
  return [1, 2, 3].map((k) => s.turnOrder[(i + k) % 4]!);
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;

describe("Lane B round B152", () => {
  it("compiles the cards", () => supported(marvel(), bones(), rebuttal(), gauntlets(), vessel(), pardic(), dubious(), duplicant()));

  it("Marvel Boy, Noh-Varr: a +1/+1 counter when another creature of yours enters and when you activate a power-up ability", () => {
    const { s: s0, ap } = setup([]);
    const boy = putOnBattlefield(s0, ap, marvel());
    const hero = putOnBattlefield(s0, ap, brawler());
    // Another creature entering (cast from the hand): one counter.
    const bearCard = toZone(s0, ap, bear(), "hand");
    let s = settle(run(s0, planCast(s0, ap, bearCard)));
    expect(zone(s, bearCard)).toBe("battlefield");
    expect(s.objects[boy]!.counters["+1/+1"]).toBe(1);
    // A power-up ability: one more, the trigger resolving before the ability (it's put on the stack above it).
    s = settle(run(s, planActivate(s, ap, hero, 0)));
    expect(s.objects[boy]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[hero]!.counters["+1/+1"]).toBe(2);
    // Only once each: a power-up ability can't be activated again (CR 702.193a).
    expect(planActivate(s, ap, hero, 0)).toBeNull();
  });

  it("Martyr of Bones: X black cards revealed, up to X target cards exiled, all from a single graveyard", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2] = others(s0, ap);
    const martyr = putOnBattlefield(s0, ap, bones());
    const black = () => card("Black Card", "Creature — Zombie", "{B}", { power: "1", toughness: "1" });
    const blacks = [toZone(s0, ap, black(), "hand"), toZone(s0, ap, black(), "hand")];
    const a = toZone(s0, o1!, bear(), "graveyard");
    const b = toZone(s0, o1!, bear(), "graveyard");
    const c = toZone(s0, o1!, bear(), "graveyard");
    const d = toZone(s0, o2!, bear(), "graveyard");
    // Two from different graveyards: not allowed; three with X = 2: too many.
    expect(planActivate(s0, ap, martyr, 0, [tgt(a), tgt(d)], undefined, undefined, 2, { reveal: blacks })).toBeNull();
    expect(planActivate(s0, ap, martyr, 0, [tgt(a), tgt(b), tgt(c)], undefined, undefined, 2, { reveal: blacks })).toBeNull();
    // Up to X: one is fine too.
    expect(planActivate(s0, ap, martyr, 0, [tgt(a), { kind: "none" }], undefined, undefined, 2, { reveal: blacks })).not.toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, martyr, 0, [tgt(a), tgt(b)], undefined, undefined, 2, { reveal: blacks })));
    expect(zone(s, martyr)).toBe("graveyard");
    expect(zone(s, a)).toBe("exile");
    expect(zone(s, b)).toBe("exile");
    expect(zone(s, c)).toBe("graveyard");
    expect(zone(s, d)).toBe("graveyard");
    for (const id of blacks) expect(zone(s, id)).toBe("hand");
  });

  it("Grenzo's Rebuttal: an Ogre, then each player chooses an artifact, a creature and a land of the player to their left; all destroyed", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2, o3] = others(s0, ap);
    const me = toZone(s0, ap, rebuttal(), "hand");
    // o1 is to ap's left (the next in turn order): an artifact creature, another creature, a land.
    const golem = putOnBattlefield(s0, o1!, card("Test Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" }));
    const beast = putOnBattlefield(s0, o1!, bear({ name: "Test Beast" }));
    const land1 = putOnBattlefield(s0, o1!, card("Test Wastes", "Land"));
    // o2 has only a creature, o3 only an artifact; ap (to o3's left) has its lands and the Ogre to come.
    const bear2 = putOnBattlefield(s0, o2!, bear());
    const relic = putOnBattlefield(s0, o3!, card("Test Relic", "Artifact", "{1}"));
    const myArtifact = putOnBattlefield(s0, ap, card("My Relic", "Artifact", "{1}"));
    let s = run(s0, planCast(s0, ap, me));
    s = settle(s);
    const asked: PlayerId[] = [];
    for (let i = 0; i < 40 && s.pending; i++) {
      const p = s.pending;
      if (p.kind !== "pickPermanents") throw new Error(`unexpected ${p.kind}`);
      asked.push(p.player);
      // Only the permanents of the player to the chooser's left are offered.
      const left = others(s, p.player)[0]!;
      for (const id of p.options) expect(s.objects[id]!.controller).toBe(left);
      // ap takes the Golem as its artifact and the Beast as its creature (an artifact creature could be both).
      const pick = p.player === ap ? (p.options.includes(golem) && p.prompt?.includes("artifact") ? [golem] : p.options.includes(beast) ? [beast] : [p.options[0]!]) : botActions(s, p.player).find((x) => x.type === "pickPermanents") ? (botActions(s, p.player)[0] as Extract<Action, { type: "pickPermanents" }>).ids : [p.options[0]!];
      s = settle(act(s, { type: "pickPermanents", player: p.player, ids: pick }));
    }
    expect(s.pending ?? undefined).toBeUndefined();
    // Starting with you: ap was asked first.
    expect(asked[0]).toBe(ap);
    expect(zone(s, me)).toBe("graveyard");
    expect(zone(s, golem)).toBe("graveyard");
    expect(zone(s, beast)).toBe("graveyard");
    expect(zone(s, land1)).toBe("graveyard");
    expect(zone(s, bear2)).toBe("graveyard");
    expect(zone(s, relic)).toBe("graveyard");
    // o3 chose among ap's permanents: an artifact (ap's only one), a creature (the Ogre) and a land.
    expect(zone(s, myArtifact)).toBe("graveyard");
    const lines = s.log.map((l) => l.text);
    expect(lines).toContain("Grenzo's Rebuttal creates a 4/4 Ogre token.");
    expect(lines).toContain("Grenzo's Rebuttal destroys Ogre Token.");
    // All at once, after every choice (rulings).
    const lastChoice = lines.map((l, i) => (l.includes("chooses") ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    expect(lines.findIndex((l) => l.includes("destroys"))).toBeGreaterThan(lastChoice);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length).toBe(13);
  });
  it("Gauntlets of Chaos: exchanges two permanents sharing artifact, creature or land, then destroys the Auras on them", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const g = putOnBattlefield(s0, ap, gauntlets());
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, o1!, bear({ name: "Their Bear" }));
    const theirLand = putOnBattlefield(s0, o1!, card("Their Wastes", "Land"));
    const theirEnchantment = putOnBattlefield(s0, o1!, card("Their Charm", "Enchantment", "{1}"));
    const aura = putOnBattlefield(s0, o1!, card("Test Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature" }));
    s0.objects[aura]!.attachedTo = theirs;
    invalidateCharacteristics(s0);
    // A creature for a land, or for an enchantment, doesn't share one of those types.
    expect(planActivate(s0, ap, g, 0, [tgt(mine), tgt(theirLand)])).toBeNull();
    expect(planActivate(s0, ap, g, 0, [tgt(mine), tgt(theirEnchantment)])).toBeNull();
    // The first must be yours, the second an opponent's.
    expect(planActivate(s0, ap, g, 0, [tgt(theirs), tgt(mine)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, g, 0, [tgt(mine), tgt(theirs)])));
    expect(zone(s, g)).toBe("graveyard");
    expect(controllerOf(s, s.objects[mine]!)).toBe(o1);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(zone(s, aura)).toBe("graveyard");
  });

  it("Gauntlets of Chaos: no exchange (one target gone), no Aura destroyed", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const g = putOnBattlefield(s0, ap, gauntlets());
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, o1!, bear({ name: "Their Bear" }));
    const aura = putOnBattlefield(s0, ap, card("Test Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature" }));
    s0.objects[aura]!.attachedTo = mine;
    invalidateCharacteristics(s0);
    let s = run(s0, planActivate(s0, ap, g, 0, [tgt(mine), tgt(theirs)]));
    // Before it resolves, their Bear leaves the battlefield.
    const item = s.stack[s.stack.length - 1]!;
    expect(item.targets?.length).toBe(2);
    s.battlefield.splice(s.battlefield.indexOf(theirs), 1);
    s.objects[theirs]!.zone = "graveyard";
    s.objects[theirs]!.zoneChanges = (s.objects[theirs]!.zoneChanges ?? 0) + 1;
    s.players[o1!]!.graveyard.push(theirs);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(controllerOf(s, s.objects[mine]!)).toBe(ap);
    expect(zone(s, aura)).toBe("battlefield");
  });

  it("Muse Vessel: target player exiles a card from their hand; you may play a card exiled with it this turn", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const v = putOnBattlefield(s0, ap, vessel());
    const theirBear = toZone(s0, o1!, bear({ name: "Their Bear" }), "hand");
    const theirLand = toZone(s0, o1!, card("Their Wastes", "Land"), "hand");
    let s = settle(run(s0, planActivate(s0, ap, v, 0, [{ kind: "player", id: o1! }])));
    // They choose which card.
    expect(s.pending).toMatchObject({ kind: "discard", player: o1, exile: true });
    s = settle(act(s, { type: "discard", player: o1!, objectIds: [theirBear] }));
    expect(zone(s, theirBear)).toBe("exile");
    expect(zone(s, theirLand)).toBe("hand");
    // Not playable before the second ability says so.
    expect(planCast(s, ap, theirBear)).toBeNull();
    s = settle(run(s, planActivate(s, ap, v, 1)));
    // One card exiled with it: no choice to make.
    s = settle(run(s, planCast(s, ap, theirBear)));
    expect(zone(s, theirBear)).toBe("battlefield");
    expect(controllerOf(s, s.objects[theirBear]!)).toBe(ap);
  });

  it("Muse Vessel: with two cards exiled with it, you choose one; a card exiled another way isn't one of them", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const v = putOnBattlefield(s0, ap, vessel());
    const a = toZone(s0, o1!, bear({ name: "Bear A" }), "hand");
    const b = toZone(s0, o1!, bear({ name: "Bear B" }), "hand");
    const other = toZone(s0, o1!, bear({ name: "Bear C" }), "hand");
    // Exiled with Vessel: a, then b (activated twice; its {T} untapped by hand in between).
    let s = settle(run(s0, planActivate(s0, ap, v, 0, [{ kind: "player", id: o1! }])));
    s = settle(act(s, { type: "discard", player: o1!, objectIds: [a] }));
    s.objects[v]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, v, 0, [{ kind: "player", id: o1! }])));
    s = settle(act(s, { type: "discard", player: o1!, objectIds: [b] }));
    // Bear C goes to exile some other way.
    s.players[o1!]!.hand.splice(s.players[o1!]!.hand.indexOf(other), 1);
    s.objects[other]!.zone = "exile";
    s.players[o1!]!.exile.push(other);
    s = settle(run(s, planActivate(s, ap, v, 1)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "impulseChoice", player: ap });
    const p = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>;
    expect([...p.options].sort()).toEqual([a, b].sort());
    s = settle(act(s, { type: "chooseOption", player: ap, choice: b }));
    expect(planCast(s, ap, a)).toBeNull();
    expect(planCast(s, ap, other)).toBeNull();
    s = settle(run(s, planCast(s, ap, b)));
    expect(zone(s, b)).toBe("battlefield");
  });

  it("Pardic Dragon: while it's suspended, an opponent who casts a spell may put a time counter on it", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    // o1's Pardic Dragon, suspended in their exile with two time counters.
    const dragon = toZone(s0, o1!, pardic(), "hand");
    s0.players[o1!]!.hand.splice(s0.players[o1!]!.hand.indexOf(dragon), 1);
    s0.objects[dragon]!.zone = "exile";
    s0.objects[dragon]!.counters.time = 2;
    s0.players[o1!]!.exile.push(dragon);
    invalidateCharacteristics(s0);
    const b1 = toZone(s0, ap, bear(), "hand");
    const b2 = toZone(s0, ap, bear(), "hand");
    // ap (an opponent of the Dragon's owner) casts a spell: ap decides.
    let s = settle(run(s0, planCast(s0, ap, b1)));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[dragon]!.counters.time).toBe(3);
    expect(zone(s, b1)).toBe("battlefield");
    // Declined: no counter.
    s = settle(run(s, planCast(s, ap, b2)));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    // A bot in ap's seat would put one on (it keeps an opponent's card suspended longer).
    const bot = botActions(s, ap);
    expect(bot[0]).toMatchObject({ type: "chooseMay", yes: true });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[dragon]!.counters.time).toBe(3);
    // Not suspended (no time counters): no trigger.
    s.objects[dragon]!.counters.time = 0;
    invalidateCharacteristics(s);
    const b3 = toZone(s, ap, bear(), "hand");
    s = settle(run(s, planCast(s, ap, b3)));
    expect(s.pending ?? undefined).toBeUndefined();
    expect(s.objects[dragon]!.counters.time ?? 0).toBe(0);
  });

  it("Dubious Challenge: up to two creature cards exiled; the target opponent may take one, you get the rest", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const me = toZone(s0, ap, dubious(), "hand");
    const big = toZone(s0, ap, bear({ name: "Big Beast", manaCost: "{4}{G}", cmc: 5, power: "5", toughness: "5" }), "library");
    const small = toZone(s0, ap, bear({ name: "Small Bear" }), "library");
    let s = settle(run(s0, planCast(s0, ap, me, [{ kind: "player", id: o1! }])));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    // A bot exiles both (they come back onto the battlefield).
    expect([...((botActions(s, ap)[0] as Extract<Action, { type: "searchLibrary" }>).found)].sort()).toEqual([big, small].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [big, small] }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "takeExiled", player: o1 });
    // The bot takes the bigger one.
    const bot = botActions(s, o1!);
    expect(bot[0]).toMatchObject({ type: "chooseOption", choice: big });
    s = settle(act(s, { type: "chooseOption", player: o1!, choice: big }));
    expect(zone(s, big)).toBe("battlefield");
    expect(controllerOf(s, s.objects[big]!)).toBe(o1);
    expect(zone(s, small)).toBe("battlefield");
    expect(controllerOf(s, s.objects[small]!)).toBe(ap);
  });

  it("Dubious Challenge: the opponent may take none, and then you get them all", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const me = toZone(s0, ap, dubious(), "hand");
    const one = toZone(s0, ap, bear({ name: "Lone Bear" }), "library");
    let s = settle(run(s0, planCast(s0, ap, me, [{ kind: "player", id: o1! }])));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [one] }));
    s = settle(act(s, { type: "chooseOption", player: o1!, choice: "none" }));
    expect(zone(s, one)).toBe("battlefield");
    expect(controllerOf(s, s.objects[one]!)).toBe(ap);
  });

  it("Death-Mask Duplicant: has the keywords, landwalk and protection of the creature cards exiled with it", () => {
    const { s: s0, ap } = setup([]);
    const dup = putOnBattlefield(s0, ap, duplicant());
    const knight = toZone(s0, ap, whiteKnight(), "graveyard");
    const wraith = toZone(s0, ap, bogWraith(), "graveyard");
    const kw = (st: GameState, k: string) => objHasKeyword(st, st.objects[dup]!, k);
    expect(kw(s0, "First strike")).toBe(false);
    let s = settle(run(s0, planActivate(s0, ap, dup, 0, [tgt(knight)])));
    expect(zone(s, knight)).toBe("exile");
    expect(kw(s, "First strike")).toBe(true);
    expect(kw(s, "Protection from black")).toBe(true);
    expect(kw(s, "Swampwalk")).toBe(false);
    s = settle(run(s, planActivate(s, ap, dup, 0, [tgt(wraith)])));
    expect(kw(s, "Swampwalk")).toBe(true);
    // Its own keywords stay (the card exiled is still in exile); a card exiled some other way gives nothing.
    expect(kw(s, "Flying")).toBe(false);
  });
});
