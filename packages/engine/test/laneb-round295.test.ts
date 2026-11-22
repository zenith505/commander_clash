// Lane B round B295: Harold and Bob, First Numens ("When ~ dies, if it was a creature, return it to the battlefield. It's an
// Aura enchantment with enchant Forest you control and "Enchanted Forest has '{T}: Add three mana of any one color. You get
// two rad counters.'" ~ loses all other abilities.", CR 303.4f, 605.3b, 728) and Nick Fury, Agent of S.H.I.E.L.D. (power-up:
// "... You may put a Hero, Equipment, or Vehicle card from among them onto the battlefield. If it's a double-faced card, you
// may transform it. ...", CR 702.190a, 712.9, 712.14).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, characteristics, defOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PendingDecision, type PlayerId } from "../src";

// Real card data (Scryfall).
const harold = (): CardDef => ({"oracleId":"d0ecea04-9768-4b09-8718-dd59135251e3","name":"Harold and Bob, First Numens","manaCost":"{2}{G}","cmc":3,"typeLine":"Legendary Creature — Treefolk Mutant","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Treefolk","Mutant"],"oracleText":"Reach, vigilance\nWhen Harold and Bob dies, if it was a creature, return it to the battlefield. It's an Aura enchantment with enchant Forest you control and \"Enchanted Forest has '{T}: Add three mana of any one color. You get two rad counters.'\" Harold and Bob loses all other abilities.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Reach","Vigilance"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8e0d4d40-9fd6-4550-a7c8-45aaf5a7e17f.jpg?1783912095","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8e0d4d40-9fd6-4550-a7c8-45aaf5a7e17f.jpg?1783912095","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fury = (): CardDef => ({"oracleId":"62916107-14c0-4516-9fed-a032b1a80e5d","name":"Nick Fury, Agent of S.H.I.E.L.D.","manaCost":"{W}","cmc":1,"typeLine":"Legendary Creature — Human Spy Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Spy","Hero"],"oracleText":"Power-up — {W}{U}{B}{R}{G}: Put two +1/+1 counters on Nick Fury, then look at the top seven cards of your library. You may put a Hero, Equipment, or Vehicle card from among them onto the battlefield. If it's a double-faced card, you may transform it. Put the rest on the bottom of your library in a random order. (Activate each power-up ability only once. Reduce the cost by his mana cost if he entered this turn.)","power":"2","toughness":"1","colors":["W"],"colorIdentity":["B","G","R","U","W"],"keywords":["Power-up","Transform"],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3aa6fc02-ef76-426b-accd-6c0ef88b2a5e.jpg?1783902971","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3aa6fc02-ef76-426b-accd-6c0ef88b2a5e.jpg?1783902971","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const parker = (): CardDef => ({"oracleId":"f1b7488c-c675-42e9-818a-24a50347ec2c","name":"Peter Parker // Amazing Spider-Man","manaCost":"{1}{W}","cmc":2,"typeLine":"Legendary Creature — Human Scientist Hero // Legendary Creature — Spider Human Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scientist","Hero"],"oracleText":"When Peter Parker enters, create a 2/1 green Spider creature token with reach.\n{1}{G}{W}{U}: Transform Peter Parker. Activate only as a sorcery.","power":"0","toughness":"1","colors":["W"],"colorIdentity":["G","U","W"],"keywords":["Reach","Vigilance","Transform"],"imageUrl":"https://cards.scryfall.io/normal/front/3/c/3ce33422-5dba-4a42-8375-dd8ccc692a7b.jpg?1783905367","artUrl":"https://cards.scryfall.io/art_crop/front/3/c/3ce33422-5dba-4a42-8375-dd8ccc692a7b.jpg?1783905367","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"mythic","layout":"modal_dfc","gameChanger":false,"faces":[{"name":"Peter Parker","manaCost":"{1}{W}","typeLine":"Legendary Creature — Human Scientist Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scientist","Hero"],"oracleText":"When Peter Parker enters, create a 2/1 green Spider creature token with reach.\n{1}{G}{W}{U}: Transform Peter Parker. Activate only as a sorcery.","power":"0","toughness":"1","colors":["W"],"imageUrl":"https://cards.scryfall.io/normal/front/3/c/3ce33422-5dba-4a42-8375-dd8ccc692a7b.jpg?1783905367","artUrl":"https://cards.scryfall.io/art_crop/front/3/c/3ce33422-5dba-4a42-8375-dd8ccc692a7b.jpg?1783905367"},{"name":"Amazing Spider-Man","manaCost":"{1}{G}{W}{U}","typeLine":"Legendary Creature — Spider Human Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spider","Human","Hero"],"oracleText":"Vigilance, reach\nEach legendary spell you cast that's one or more colors has web-slinging {G}{W}{U}. (You may cast a spell for its web-slinging cost if you also return a tapped creature you control to its owner's hand.)","power":"4","toughness":"4","colors":["G","U","W"],"imageUrl":"https://cards.scryfall.io/normal/back/3/c/3ce33422-5dba-4a42-8375-dd8ccc692a7b.jpg?1783905367","artUrl":"https://cards.scryfall.io/art_crop/back/3/c/3ce33422-5dba-4a42-8375-dd8ccc692a7b.jpg?1783905367"}]}) as CardDef;
const dagger = (): CardDef => ({"oracleId":"df34a6ad-ae1c-4470-8c9e-49815bba1973","name":"Dowsing Dagger // Lost Vale","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Equipment // Land","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"When this Equipment enters, target opponent creates two 0/2 green Plant creature tokens with defender.\nEquipped creature gets +2/+1.\nWhenever equipped creature deals combat damage to a player, you may transform this Equipment.\nEquip {2}","colors":[],"colorIdentity":[],"keywords":["Transform","Equip"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/514d53be-6ade-4f73-a844-e9ae2dafd6ce.jpg?1783935712","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/514d53be-6ade-4f73-a844-e9ae2dafd6ce.jpg?1783935712","commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Dowsing Dagger","manaCost":"{2}","typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"When this Equipment enters, target opponent creates two 0/2 green Plant creature tokens with defender.\nEquipped creature gets +2/+1.\nWhenever equipped creature deals combat damage to a player, you may transform this Equipment.\nEquip {2}","colors":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/514d53be-6ade-4f73-a844-e9ae2dafd6ce.jpg?1783935712","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/514d53be-6ade-4f73-a844-e9ae2dafd6ce.jpg?1783935712"},{"name":"Lost Vale","manaCost":"","typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"(Transforms from Dowsing Dagger.)\n{T}: Add three mana of any one color.","colors":[],"imageUrl":"https://cards.scryfall.io/normal/back/5/1/514d53be-6ade-4f73-a844-e9ae2dafd6ce.jpg?1783935712","artUrl":"https://cards.scryfall.io/art_crop/back/5/1/514d53be-6ade-4f73-a844-e9ae2dafd6ce.jpg?1783935712"}]}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const forestCard = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const brawler = (): CardDef => ({"oracleId":"a1a791be-71e6-4c1f-8717-08ca62d40de2","name":"Brave Brawler","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Warrior Hero","supertypes":[],"types":["Creature"],"subtypes":["Human","Warrior","Hero"],"oracleText":"Lifelink\nPower-up — {4}{W}: Put two +1/+1 counters on this creature. (Activate each power-up ability only once. Reduce the cost by its mana cost if it entered this turn.)","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Power-up","Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/2242b5c3-42ef-4be0-a61f-65c93e56fcab.jpg?1783902978","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/2242b5c3-42ef-4be0-a61f-65c93e56fcab.jpg?1783902978","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const pend = <K extends PendingDecision["kind"]>(s: GameState, kind: K) => {
  expect(s.pending?.kind).toBe(kind);
  return s.pending as Extract<PendingDecision, { kind: K }>;
};
/** A copy of `def` in `pid`'s hand, or on top of their library. */
const put = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "library" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "hand") s.players[pid]!.hand.push(id);
  else s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const name = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
/** Takes `pid`'s Forests off the battlefield, so only the ones a test puts there are. */
const noForests = (s: GameState, pid: PlayerId) => {
  s.battlefield = s.battlefield.filter((id) => !(s.objects[id]!.controller === pid && name(s, id) === "Forest"));
  invalidateCharacteristics(s);
};
const tokens = (s: GameState, pid: PlayerId, n: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && name(s, id).replace(/ Token$/, "") === n);

describe("Lane B round B295: compiles", () => {
  it("both cards and the cards the tests use", () => supported(harold(), fury(), parker(), dagger(), bonesplitter(), murder(), forestCard(), bears(), divination(), brawler()));
});

describe("Lane B round B295: Harold and Bob, First Numens", () => {
  it("dies, returns as an Aura on your Forest with only the granted ability: three mana of one color and two rad counters", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    noForests(s, ap);
    const forest = putOnBattlefield(s, ap, forestCard());
    const me = putOnBattlefield(s, ap, harold());
    const m = put(s, ap, murder());
    s = settle(run(s, planCast(s, ap, m, [target(me)])));
    const o = s.objects[me]!;
    expect(o.zone).toBe("battlefield");
    expect(o.attachedTo).toBe(forest);
    const c = characteristics(s, o);
    expect(c.types).toEqual(["Enchantment"]);
    expect(c.subtypes).toEqual(["Aura"]);
    // Its name, colors and supertypes stay (rulings); reach and vigilance are gone ("loses all other abilities").
    expect(c.name).toBe("Harold and Bob, First Numens");
    expect(c.colors).toEqual(["G"]);
    expect(c.supertypes).toEqual(["Legendary"]);
    expect(objHasKeyword(s, o, "Reach")).toBe(false);
    expect(objHasKeyword(s, o, "Vigilance")).toBe(false);
    // The Forest has its own {T}: Add {G} and the granted ability (CR 605.1a: a mana ability, its rider done at once).
    const before = s.players[ap]!.rad ?? 0;
    s = act(s, { type: "activateMana", player: ap, objectId: forest, mana: "U", ability: 1 });
    expect(s.players[ap]!.manaPool.U).toBe(3);
    expect(s.players[ap]!.rad ?? 0).toBe(before + 2);
    expect(s.objects[forest]!.tapped).toBe(true);
    expect(s.stack.length).toBe(0);
  });

  it("the Forest's own {T}: Add {G} gives no rad counters, and paying for a spell uses it before the granted one", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    noForests(s, ap);
    const forest = putOnBattlefield(s, ap, forestCard());
    const me = putOnBattlefield(s, ap, harold());
    s = settle(run(s, planCast(s, ap, put(s, ap, murder()), [target(me)])));
    expect(s.objects[me]!.attachedTo).toBe(forest);
    // Grizzly Bears ({1}{G}): the Forest's {G} and another land, not three mana and two rad counters.
    const b = put(s, ap, bears());
    s = settle(run(s, planCast(s, ap, b)));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.players[ap]!.rad ?? 0).toBe(0);
  });

  it("with no Forest of yours it stays in the graveyard; with two, its controller chooses", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    noForests(s, ap);
    const me = putOnBattlefield(s, ap, harold());
    s = settle(run(s, planCast(s, ap, put(s, ap, murder()), [target(me)])));
    expect(s.objects[me]!.zone).toBe("graveyard");
    expect(s.log.some((l) => /nothing it could enchant/.test(l.text))).toBe(true);

    const { s: t0, ap: ap2 } = setup([]);
    let t = t0;
    noForests(t, ap2);
    putOnBattlefield(t, ap2, forestCard());
    const second = putOnBattlefield(t, ap2, forestCard());
    const me2 = putOnBattlefield(t, ap2, harold());
    t = settle(run(t, planCast(t, ap2, put(t, ap2, murder()), [target(me2)])));
    const p = pend(t, "chooseOption");
    expect(p.what).toBe("enchant");
    expect(p.options.length).toBe(2);
    t = settle(act(t, { type: "chooseOption", player: ap2, choice: second }));
    expect(t.objects[me2]!.attachedTo).toBe(second);
  });

  it("as an Aura it isn't a creature, so it doesn't come back when its Forest goes and it's put into the graveyard", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    noForests(s, ap);
    const forest = putOnBattlefield(s, ap, forestCard());
    const me = putOnBattlefield(s, ap, harold());
    s = settle(run(s, planCast(s, ap, put(s, ap, murder()), [target(me)])));
    expect(s.objects[me]!.attachedTo).toBe(forest);
    s.battlefield.splice(s.battlefield.indexOf(forest), 1);
    s.objects[forest]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(forest);
    invalidateCharacteristics(s);
    // State-based actions put the unattached Aura into the graveyard (CR 704.5m).
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(s);
    expect(s.objects[me]!.zone).toBe("graveyard");
  });

  it("the rad counters mill at the beginning of its controller's next precombat main phase (CR 728)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    noForests(s, ap);
    const forest = putOnBattlefield(s, ap, forestCard());
    const me = putOnBattlefield(s, ap, harold());
    s = settle(run(s, planCast(s, ap, put(s, ap, murder()), [target(me)])));
    s = act(s, { type: "activateMana", player: ap, objectId: forest, mana: "G", ability: 1 });
    expect(s.players[ap]!.rad).toBe(2);
    const yard = s.players[ap]!.graveyard.length;
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "main2", ap);
    expect(s.players[ap]!.graveyard.length).toBeGreaterThanOrEqual(yard + 2);
  });
});

/** Nick Fury on the battlefield (not this turn's), `top` the top cards of the library in order, the rest Forests. */
const fury7 = (top: CardDef[]) => {
  const { s, ap } = setup([]);
  const nick = putOnBattlefield(s, ap, fury());
  const ids = [...top].reverse().map((d) => put(s, ap, d, "library")).reverse();
  return { s, ap, nick, ids };
};

describe("Lane B round B295: Nick Fury, Agent of S.H.I.E.L.D.", () => {
  it("puts Peter Parker (a modal double-faced Hero) onto the battlefield and transforms it: Amazing Spider-Man, his Spider still made", () => {
    const { s: s0, ap, nick, ids } = fury7([divination(), parker(), bonesplitter()]);
    let s = s0;
    s = settle(run(s, planActivate(s, ap, nick, 0)));
    expect(s.objects[nick]!.counters["+1/+1"]).toBe(2);
    const pick = pend(s, "searchLibrary");
    // Only the Hero and the Equipment can be taken.
    expect([...pick.cards].sort()).toEqual([ids[1]!, ids[2]!].sort());
    s = act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] });
    const may = pend(s, "chooseMay");
    expect(may.prompt).toBe("transform the double-faced card put onto the battlefield");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    const peter = s.objects[ids[1]!]!;
    expect(peter.zone).toBe("battlefield");
    expect(name(s, peter.id)).toBe("Amazing Spider-Man");
    // It entered front face up (CR 712.14): Peter Parker's enters trigger made the Spider.
    expect(tokens(s, ap, "Spider").length).toBe(1);
    // The rest are on the bottom (CR 401.4: in a random order).
    const lib = s.players[ap]!.library;
    expect(lib.slice(-6)).toContain(ids[0]!);
    expect(lib.slice(-6)).toContain(ids[2]!);
    // Power-up only once (CR 702.190a).
    expect(planActivate(s, ap, nick, 0)).toBeNull();
  });

  it("may leave it untransformed, and asks nothing for a card that isn't double-faced", () => {
    const { s: s0, ap, nick, ids } = fury7([dagger()]);
    let s = s0;
    s = settle(run(s, planActivate(s, ap, nick, 0)));
    s = act(s, { type: "searchLibrary", player: ap, found: [ids[0]!] });
    pend(s, "chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(name(s, ids[0]!)).toBe("Dowsing Dagger");

    const { s: t0, ap: ap2, nick: nick2, ids: ids2 } = fury7([bonesplitter()]);
    let t = t0;
    t = settle(run(t, planActivate(t, ap2, nick2, 0)));
    t = act(t, { type: "searchLibrary", player: ap2, found: [ids2[0]!] });
    expect(t.pending?.kind === "chooseMay").toBe(false);
    t = settle(t);
    expect(t.objects[ids2[0]!]!.zone).toBe("battlefield");
  });

  it("Dowsing Dagger transformed is the land Lost Vale; its enters trigger still resolves (CR 603.2, 603.10)", () => {
    const { s: s0, ap, opp, nick, ids } = ((x) => ({ ...x, opp: x.s.turnOrder[(x.s.turnOrder.indexOf(x.ap) + 1) % 4]! }))(fury7([dagger()]));
    let s = s0;
    s = settle(run(s, planActivate(s, ap, nick, 0)));
    s = act(s, { type: "searchLibrary", player: ap, found: [ids[0]!] });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(name(s, ids[0]!)).toBe("Lost Vale");
    expect(characteristics(s, s.objects[ids[0]!]!).types).toEqual(["Land"]);
    // "Target opponent creates two 0/2 green Plant creature tokens": its target chosen as it's put on the stack.
    for (let i = 0; i < 20 && (s.pending || s.stack.length || s.triggerQueue.length); i++) {
      if (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const plants = s.battlefield.filter((id) => s.objects[id]!.isToken && name(s, id).startsWith("Plant"));
    expect(plants.length).toBe(2);
    expect(plants.every((id) => s.objects[id]!.controller !== ap)).toBe(true);
    void opp;
  });

  it("the bot's answers take the Hero", () => {
    const { s: s0, ap, nick, ids } = fury7([divination(), parker()]);
    let s = s0;
    s = settle(run(s, planActivate(s, ap, nick, 0)));
    for (let i = 0; i < 10 && s.pending; i++) for (const a of botActions(s, s.pending.player)) s = act(s, a);
    s = settle(s);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(defOf(s, s.objects[ids[0]!]!).name).toBe("Divination");
    // And says yes to transforming it.
    expect(name(s, ids[1]!)).toBe("Amazing Spider-Man");
  });
});
