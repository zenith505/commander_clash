// Lane B round B268: Selective Adaptation (a card for each of twelve keywords there's one for, one of them onto the
// battlefield, the others into the hand), Supper for Spiders (opponents' creature cards that died this turn returned as
// Food artifacts under your control) and Brilliant Ultimatum (five cards exiled, an opponent's two piles, lands played and
// spells cast free from the one you choose).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, doesNothingNow, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const brilliantUltimatum = (): CardDef => ({"oracleId":"a9d58cad-c1c2-4bd2-80f2-da9ce60801df","name":"Brilliant Ultimatum","manaCost":"{W}{W}{U}{U}{U}{B}{B}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile the top five cards of your library. An opponent separates those cards into two piles. You may play lands and cast spells from one of those piles. If you cast a spell this way, you cast it without paying its mana cost.","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/9/593409fd-26ef-463e-9101-ec5ad53dfd67.jpg?1783942547","artUrl":"https://cards.scryfall.io/art_crop/front/5/9/593409fd-26ef-463e-9101-ec5ad53dfd67.jpg?1783942547","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"rare","layout":"normal","gameChanger":false});
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false});
const elvishVisionary = (): CardDef => ({"oracleId":"c6a3a882-a127-4590-93d7-679ef4313efe","name":"Elvish Visionary","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Shaman","supertypes":[],"types":["Creature"],"subtypes":["Elf","Shaman"],"oracleText":"When this creature enters, draw a card.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false});
const fencingAce = (): CardDef => ({"oracleId":"2f810936-2ba6-4c2b-84a0-ff4c1deb026b","name":"Fencing Ace","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Double strike (This creature deals both first-strike and regular combat damage.)","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Double strike"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a42d3066-f4ec-4d28-83ab-e48141206c72.jpg?1783940376","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a42d3066-f4ec-4d28-83ab-e48141206c72.jpg?1783940376","commanderLegal":"legal","set":"rtr","releasedAt":"2012-10-05","rarity":"uncommon","layout":"normal","gameChanger":false});
const giantSpider = (): CardDef => ({"oracleId":"e740ce2f-2134-473c-afa1-1b6d2d1e38ef","name":"Giant Spider","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Spider","supertypes":[],"types":["Creature"],"subtypes":["Spider"],"oracleText":"Reach (This creature can block creatures with flying.)","power":"2","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Reach"],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48a84e56-bed3-4f55-a41f-3aafa392ad16.jpg?1783934626","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48a84e56-bed3-4f55-a41f-3aafa392ad16.jpg?1783934626","commanderLegal":"legal","set":"gs1","releasedAt":"2018-06-22","rarity":"common","layout":"normal","gameChanger":false});
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false});
const isamaru = (): CardDef => ({"oracleId":"cfb756dd-6fe1-430a-8f04-8b10cac62a86","name":"Isamaru, Hound of Konda","manaCost":"{W}","cmc":1,"typeLine":"Legendary Creature — Dog","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dog"],"oracleText":"","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2e7f9919-0713-4ef9-96eb-3e0c444e47f4.jpg?1783944338","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2e7f9919-0713-4ef9-96eb-3e0c444e47f4.jpg?1783944338","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"rare","layout":"normal","gameChanger":false});
const islandCard = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false});
const knightOfGrace = (): CardDef => ({"oracleId":"7b51a979-47e0-4b98-8ec5-8064c83422e1","name":"Knight of Grace","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nHexproof from black (This creature can't be the target of black spells or abilities your opponents control.)\nThis creature gets +1/+0 as long as any player controls a black permanent.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Hexproof from","Hexproof","First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/7/b/7bbbddc0-f8b3-4255-bd82-d50f829ca009.jpg?1783935041","artUrl":"https://cards.scryfall.io/art_crop/front/7/b/7bbbddc0-f8b3-4255-bd82-d50f829ca009.jpg?1783935041","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"uncommon","layout":"normal","gameChanger":false});
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false});
const ragingGoblin = (): CardDef => ({"oracleId":"30997b43-fc13-41d3-8064-1ccc2cb6fd2b","name":"Raging Goblin","manaCost":"{R}","cmc":1,"typeLine":"Creature — Goblin Berserker","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Berserker"],"oracleText":"Haste (This creature can attack and {T} as soon as it comes under your control.)","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/e/6/e6df5a36-7bd4-4456-a462-54f65089826c.jpg?1783946461","artUrl":"https://cards.scryfall.io/art_crop/front/e/6/e6df5a36-7bd4-4456-a462-54f65089826c.jpg?1783946461","commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"common","layout":"normal","gameChanger":false});
const selectiveAdaptation = (): CardDef => ({"oracleId":"b68df6d7-d69e-446f-9b1b-7a6ca56efbec","name":"Selective Adaptation","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Reveal the top seven cards of your library. Choose from among them a card with flying, a card with first strike, and so on for double strike, deathtouch, haste, hexproof, indestructible, lifelink, menace, reach, trample, and vigilance. Put one of the chosen cards onto the battlefield, the other chosen cards into your hand, and the rest into your graveyard.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/d/adbd8ffa-c7d3-4ef6-b3a7-8a967b50ce49.jpg?1783931208","artUrl":"https://cards.scryfall.io/art_crop/front/a/d/adbd8ffa-c7d3-4ef6-b3a7-8a967b50ce49.jpg?1783931208","commanderLegal":"legal","set":"c20","releasedAt":"2020-04-17","rarity":"rare","layout":"normal","gameChanger":false});
const serraAngel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false});
const supperForSpiders = (): CardDef => ({"oracleId":"4d891515-39da-492e-ac19-1aa524245449","name":"Supper for Spiders","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Put onto the battlefield under your control all creature cards in your opponents' graveyards that were put there from the battlefield this turn. They are Food artifacts with \"{2}, {T}, Sacrifice this artifact: You gain 3 life.\" (They lose all other types and subtypes.)","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/b/5b25e454-06bb-43ca-9a9f-57164f7a70c4.jpg?1784376962","artUrl":"https://cards.scryfall.io/art_crop/front/5/b/5b25e454-06bb-43ca-9a9f-57164f7a70c4.jpg?1784376962","commanderLegal":"legal","set":"hob","releasedAt":"2026-08-14","rarity":"rare","layout":"normal","gameChanger":false});
const vampireNighthawk = (): CardDef => ({"oracleId":"feb244f8-bcb1-44cf-9940-2719221a7309","name":"Vampire Nighthawk","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Vampire Shaman","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Shaman"],"oracleText":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)","power":"2","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch","Flying","Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/44f19fe3-7a17-4c45-adfa-590f73dfebfa.jpg?1783942148","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/44f19fe3-7a17-4c45-adfa-590f73dfebfa.jpg?1783942148","commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"uncommon","layout":"normal","gameChanger":false});
const windDrake = (): CardDef => ({"oracleId":"d6ffdaf0-ac08-4de9-bbce-2eab2f86bcca","name":"Wind Drake","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Drake","supertypes":[],"types":["Creature"],"subtypes":["Drake"],"oracleText":"Flying","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/5/e/5e227a63-abea-494e-9d66-6ff0a3da14ca.jpg?1783937211","artUrl":"https://cards.scryfall.io/art_crop/front/5/e/5e227a63-abea-494e-9d66-6ff0a3da14ca.jpg?1783937211","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"common","layout":"normal","gameChanger":false});
const youthfulKnight = (): CardDef => ({"oracleId":"ef2a24f5-ce5e-4054-843a-2cae0c66318a","name":"Youthful Knight","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/3/d/3d1a3fec-39de-4223-9da2-22749a58cd62.jpg?1783932662","artUrl":"https://cards.scryfall.io/art_crop/front/3/d/3d1a3fec-39de-4223-9da2-22749a58cd62.jpg?1783932662","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"common","layout":"normal","gameChanger":false});

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
/** Fresh copies of `defs` on top of `pid`'s library, the first on top. */
const onTop = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  return ids;
};
/** Answers every question with the bots' answers until none is left. */
const bots = (s: GameState, max = 30) => {
  for (let i = 0; i < max && s.pending; i++) for (const a of botActions(s, s.pending.player)) s = act(s, a);
  return s;
};

describe("round B268 cards", () => {
  it("are supported", () => supported(selectiveAdaptation(), supperForSpiders(), brilliantUltimatum()));
});

describe("Selective Adaptation", () => {
  /** Selective Adaptation cast with `top` on top of the library, up to its first question. */
  const adapt = (top: CardDef[]) => {
    const { s: s0, ap, ids } = setup([selectiveAdaptation()]);
    const cards = onTop(s0, ap, top);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    return { s, ap, cards, spell: ids[0]! };
  };

  it("a card for each keyword there's one for; one of them onto the battlefield, the others into the hand, the rest into the graveyard", () => {
    let { s, ap, cards } = adapt([serraAngel(), ragingGoblin(), grizzlyBears(), youthfulKnight(), fencingAce(), giantSpider(), lightningBolt()]);
    const [angel, goblin, bears, knight, ace, spider, bolt] = cards as [string, string, string, string, string, string, string];
    expect(logged(s, /reveals the top 7 cards/)).toBe(true);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, oneOfEachAll: true });
    if (s.pending?.kind !== "searchLibrary") throw new Error("no search");
    // Only the cards with one of the keywords can be chosen.
    expect([...s.pending.cards].sort()).toEqual([angel, goblin, knight, ace, spider].sort());
    // Not "up to one": leaving Raging Goblin out leaves haste with no card chosen for it.
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [angel, knight, ace, spider] })).toThrow(/there's one for/);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [angel, goblin, knight, ace, spider] }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "oneOnto", player: ap });
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    expect([...s.pending.options].sort()).toEqual([angel, goblin, knight, ace, spider].sort());
    s = settle(act(s, { type: "chooseOption", player: ap, choice: angel }));
    expect(zone(s, angel)).toBe("battlefield");
    expect(controllerOf(s, s.objects[angel]!)).toBe(ap);
    for (const id of [goblin, knight, ace, spider]) expect(zone(s, id)).toBe("hand");
    for (const id of [bears, bolt]) expect(zone(s, id)).toBe("graveyard");
  });

  it("a card with several keywords is chosen for any one of them (rulings)", () => {
    const { s, ap, cards } = adapt([vampireNighthawk(), windDrake(), grizzlyBears(), grizzlyBears(), grizzlyBears(), grizzlyBears(), grizzlyBears()]);
    const [hawk, drake] = cards as [string, string];
    // Nighthawk alone, chosen for flying: no other card has deathtouch or lifelink, so that's a full choice.
    const alone = settle(act(s, { type: "searchLibrary", player: ap, found: [hawk] }));
    expect(zone(alone, hawk)).toBe("battlefield");
    expect(zone(alone, drake)).toBe("graveyard");
    // Both: Nighthawk for deathtouch or lifelink, Wind Drake for flying.
    let both = settle(act(s, { type: "searchLibrary", player: ap, found: [hawk, drake] }));
    both = settle(act(both, { type: "chooseOption", player: ap, choice: drake }));
    expect(zone(both, drake)).toBe("battlefield");
    expect(zone(both, hawk)).toBe("hand");
    // Wind Drake alone isn't: Nighthawk would be left over with deathtouch and lifelink, none chosen for them.
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [drake] })).toThrow(/there's one for/);
  });

  it("hexproof from a quality is hexproof (CR 702.11e); a single chosen card goes onto the battlefield with no question", () => {
    const { s: s0, ap, cards } = adapt([knightOfGrace(), isamaru(), grizzlyBears(), grizzlyBears(), grizzlyBears(), grizzlyBears(), grizzlyBears()]);
    const [knight, dog] = cards as [string, string];
    expect(s0.pending).toMatchObject({ kind: "searchLibrary" });
    if (s0.pending?.kind !== "searchLibrary") throw new Error("no search");
    expect(s0.pending.cards).toEqual([knight]);
    expect(() => act(s0, { type: "searchLibrary", player: ap, found: [] })).toThrow(/there's one for/);
    const s = settle(act(s0, { type: "searchLibrary", player: ap, found: [knight] }));
    expect(s.pending).toBeNull();
    expect(zone(s, knight)).toBe("battlefield");
    expect(zone(s, dog)).toBe("graveyard");
  });

  it("bots choose a card for every keyword they can and put the most expensive onto the battlefield", () => {
    const { s: s0, cards } = adapt([ragingGoblin(), serraAngel(), vampireNighthawk(), windDrake(), grizzlyBears(), lightningBolt(), divination()]);
    const [goblin, angel, hawk, drake] = cards as [string, string, string, string];
    const s = settle(bots(s0));
    expect(zone(s, angel)).toBe("battlefield");
    for (const id of [goblin, hawk, drake]) expect(zone(s, id)).toBe("hand");
  });
});

describe("Supper for Spiders", () => {
  /** Lightning Bolt kills each of `victims` (their controllers' creatures) this turn, then Supper for Spiders is in hand. */
  const dinner = () => {
    const { s: s0, ap, ids, opp } = setup([supperForSpiders(), lightningBolt(), lightningBolt(), lightningBolt()]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    const dog = putOnBattlefield(s0, third, isamaru());
    const mine = putOnBattlefield(s0, ap, grizzlyBears());
    // A creature card already in an opponent's graveyard from an earlier turn.
    const old = putOnBattlefield(s0, opp, serraAngel());
    s0.battlefield.splice(s0.battlefield.indexOf(old), 1);
    s0.objects[old]!.zone = "graveyard";
    s0.players[opp]!.graveyard.push(old);
    let s = s0;
    for (const [i, t] of [bears, dog, mine].entries()) s = settle(run(s, planCast(s, ap, ids[i + 1]!, [target(t)])));
    for (const id of [bears, dog, mine]) expect(zone(s, id)).toBe("graveyard");
    return { s, ap, opp, supper: ids[0]!, bears, dog, mine, old };
  };

  it("opponents' creature cards put into their graveyards from the battlefield this turn come back under your control as Food artifacts", () => {
    let { s, ap, opp, supper, bears, dog, mine, old } = dinner();
    s = settle(run(s, planCast(s, ap, supper)));
    for (const id of [bears, dog]) {
      expect(zone(s, id)).toBe("battlefield");
      expect(controllerOf(s, s.objects[id]!)).toBe(ap);
      const ch = characteristics(s, s.objects[id]!);
      expect(ch.types).toEqual(["Artifact"]);
      expect(ch.subtypes).toEqual(["Food"]);
    }
    // Isamaru stays legendary (rulings).
    expect(characteristics(s, s.objects[dog]!).supertypes).toContain("Legendary");
    // Your own creature and the one that died on an earlier turn stay where they are.
    expect(zone(s, mine)).toBe("graveyard");
    expect(zone(s, old)).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(old);
    // The Food ability: {2}, {T}, sacrifice it: gain 3 life.
    const life = s.players[ap]!.life;
    s = settle(run(s, planActivate(s, ap, bears, 0)));
    expect(s.players[ap]!.life).toBe(life + 3);
    expect(zone(s, bears)).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(bears);
  });

  it("the effect lasts past the turn (rulings)", () => {
    let { s, ap, supper, bears } = dinner();
    s = settle(run(s, planCast(s, ap, supper)));
    for (let i = 0; i < 400 && s.turn === s.turn && s.activePlayer === ap; i++) {
      const pid = waitingOn(s)!;
      const p = s.pending;
      if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
      else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
      else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
      else if (p) break;
      else s = act(s, { type: "passPriority", player: pid });
    }
    expect(s.activePlayer).not.toBe(ap);
    expect(characteristics(s, s.objects[bears]!).subtypes).toEqual(["Food"]);
    expect(characteristics(s, s.objects[bears]!).types).toEqual(["Artifact"]);
  });

  it("bots don't cast it while nothing would come back", () => {
    const { s, ap, ids } = setup([supperForSpiders()]);
    expect(doesNothingNow(s, ids[0]!, { targets: [], effects: [{ type: "returnAllFromGraveyard", who: { ref: "eachOpponent" }, filter: { kind: "card", types: ["Creature"], fromBattlefieldThisTurn: true, text: "creature card" } }], text: "" })).toBe(true);
    void ap;
    const d = dinner();
    expect(doesNothingNow(d.s, d.supper, { targets: [], effects: [{ type: "returnAllFromGraveyard", who: { ref: "eachOpponent" }, filter: { kind: "card", types: ["Creature"], fromBattlefieldThisTurn: true, text: "creature card" } }], text: "" })).toBe(false);
  });
});

describe("Brilliant Ultimatum", () => {
  /** Brilliant Ultimatum cast with `top` on top of the library, up to the separation (the opponent chosen is `opp`). */
  const ultimatum = (top: CardDef[]) => {
    const { s: s0, ap, ids, opp } = setup([brilliantUltimatum()]);
    const cards = onTop(s0, ap, top);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "opponent", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    return { s, ap, opp, cards, spell: ids[0]! };
  };

  it("the top five are exiled, the opponent separates them, and you play a land and cast spells free from the pile you choose", () => {
    let { s, ap, opp, cards, spell } = ultimatum([grizzlyBears(), lightningBolt(), islandCard(), divination(), serraAngel()]);
    const [bears, bolt, isl, div, angel] = cards as [string, string, string, string, string];
    for (const id of cards) expect(zone(s, id)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, piles: true, exiled: true, forPlayer: ap });
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [bears, bolt, isl] }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "pile", player: ap, pileMode: "play" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }));
    // Only the chosen pile's cards are offered.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    expect(s.pending.options).toEqual(expect.arrayContaining([bears, bolt, isl, "none"]));
    expect(s.pending.options).not.toContain(div);
    expect(s.pending.options).not.toContain(angel);
    // The land is played (the turn's land play, CR 305.2).
    const played = s.players[ap]!.landsPlayedThisTurn;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: isl }));
    expect(zone(s, isl)).toBe("battlefield");
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(played + 1);
    // A creature cast free during the resolution, timing ignored (rulings).
    s = act(s, { type: "chooseOption", player: ap, choice: bears });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: bears });
    s = run(s, planCast(s, ap, bears));
    expect(zone(s, bears)).toBe("stack");
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    s = settle(s);
    expect(zone(s, bears)).toBe("battlefield");
    expect(zone(s, spell)).toBe("graveyard");
    // The other pile and the card not cast stay exiled (rulings).
    for (const id of [bolt, div, angel]) expect(zone(s, id)).toBe("exile");
  });

  it("an empty pile can be chosen; a second land can't be played (rulings)", () => {
    let { s, ap, opp, cards } = ultimatum([islandCard(), islandCard(), grizzlyBears(), grizzlyBears(), grizzlyBears()]);
    const [i1, i2] = cards as [string, string];
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [] }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "pile" });
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    expect(s.pending.piles?.[0]).toEqual([]);
    const empty = settle(act(s, { type: "chooseOption", player: ap, choice: "0" }));
    expect(empty.pending).toBeNull();
    for (const id of cards) expect(zone(empty, id)).toBe("exile");
    let full = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    full = settle(act(full, { type: "chooseOption", player: ap, choice: i1 }));
    expect(zone(full, i1)).toBe("battlefield");
    if (full.pending?.kind !== "chooseOption") throw new Error("no choice");
    expect(full.pending.options).not.toContain(i2);
  });

  it("bots separate the cards, choose a pile and cast from it", () => {
    let { s, ap, opp, cards } = ultimatum([serraAngel(), grizzlyBears(), giantSpider(), ragingGoblin(), windDrake()]);
    s = settle(bots(s, 60));
    for (let i = 0; i < 20 && (s.pending || s.stack.length); i++) s = settle(bots(s, 60));
    void opp;
    expect(cards.some((id) => zone(s, id) === "battlefield" && controllerOf(s, s.objects[id]!) === ap)).toBe(true);
    expect(logged(s, /separates them into two piles/)).toBe(true);
  });
});
