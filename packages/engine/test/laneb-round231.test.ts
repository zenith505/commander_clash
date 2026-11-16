// Lane B round B231: Rain of Gore (a gain a spell or ability causes for its controller becomes a loss), Kheru Mind-Eater
// (a card the damaged player exiles face down, played by whoever controls it), Cyclopean Tomb (lands it made Swamps
// return to normal one per upkeep after it's gone) and Back from the Brink (a token copy of a creature card exiled from
// your graveyard, paying its mana cost).

import { describe, expect, it } from "vitest";
import { act, bear, forest, putOnBattlefield, setup, target } from "./helpers";
import { botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const rainOfGore = (): CardDef => ({"oracleId":"d12b4b66-9453-4494-9547-c737f48277ed","name":"Rain of Gore","manaCost":"{B}{R}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If a spell or ability would cause its controller to gain life, that player loses that much life instead.","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/d/9dd62003-e345-48b6-9f93-fc111924c318.jpg?1783943395","artUrl":"https://cards.scryfall.io/art_crop/front/9/d/9dd62003-e345-48b6-9f93-fc111924c318.jpg?1783943395","commanderLegal":"legal","set":"dis","releasedAt":"2006-05-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kheru = (): CardDef => ({"oracleId":"dfea918b-5702-4c12-ba36-e6aa4ace09c7","name":"Kheru Mind-Eater","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Vampire","supertypes":[],"types":["Creature"],"subtypes":["Vampire"],"oracleText":"Menace\nWhenever this creature deals combat damage to a player, that player exiles a card from their hand face down.\nYou may look at cards exiled with this creature, and you may play lands and cast spells from among those cards.","power":"1","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/e/6/e6246cf3-76bd-476b-9cd9-789b6ad48887.jpg?1783935948","artUrl":"https://cards.scryfall.io/art_crop/front/e/6/e6246cf3-76bd-476b-9cd9-789b6ad48887.jpg?1783935948","commanderLegal":"legal","set":"c17","releasedAt":"2017-08-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tomb = (): CardDef => ({"oracleId":"1edee40f-d153-4d67-aee7-ef08e11e4a79","name":"Cyclopean Tomb","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}, {T}: Put a mire counter on target non-Swamp land. That land is a Swamp for as long as it has a mire counter on it. Activate only during your upkeep.\nWhen this artifact is put into a graveyard from the battlefield, at the beginning of each of your upkeeps for the rest of the game, remove all mire counters from a land that a mire counter was put onto with this artifact but that a mire counter has not been removed from with this artifact.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/894c5cf2-8ae2-427a-bcbc-67df0bdfee9d.jpg?1783948668","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/894c5cf2-8ae2-427a-bcbc-67df0bdfee9d.jpg?1783948668","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const brink = (): CardDef => ({"oracleId":"704aaf92-590f-46d3-8b39-4ab84e1c766d","name":"Back from the Brink","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Exile a creature card from your graveyard and pay its mana cost: Create a token that's a copy of that card. Activate only as a sorcery.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/4/b4bba140-5c06-4542-9ae0-b2517104ab7c.jpg?1783940981","artUrl":"https://cards.scryfall.io/art_crop/front/b/4/b4bba140-5c06-4542-9ae0-b2517104ab7c.jpg?1783940981","commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const soulWarden = (): CardDef => ({"oracleId":"f3fad295-1af2-4ecc-8546-b121ad6be27b","name":"Soul Warden","manaCost":"{W}","cmc":1,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"Whenever another creature enters, you gain 1 life.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/3/53b54485-37e2-4ae0-be91-c77ec02c5fe0.jpg?1786456647","artUrl":"https://cards.scryfall.io/art_crop/front/5/3/53b54485-37e2-4ae0-be91-c77ec02c5fe0.jpg?1786456647","commanderLegal":"legal","set":"sld","releasedAt":"2026-08-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const swords = (): CardDef => ({"oracleId":"b1544f21-7e98-461b-aed5-e748b0168c52","name":"Swords to Plowshares","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target creature. Its controller gains life equal to its power.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/4/84a4a532-538e-428c-bd62-d0b997895c31.jpg?1790743598","artUrl":"https://cards.scryfall.io/art_crop/front/8/4/84a4a532-538e-428c-bd62-d0b997895c31.jpg?1790743598","commanderLegal":"legal","set":"sld","releasedAt":"2026-09-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const revitalize = (): CardDef => ({"oracleId":"b1385b03-cb4b-4812-857f-7421f1df39af","name":"Revitalize","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"You gain 3 life.\nDraw a card.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3a9fb75e-c8e5-417b-83d4-5105af9c66c1.jpg?1783928280","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3a9fb75e-c8e5-417b-83d4-5105af9c66c1.jpg?1783928280","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const nighthawk = (): CardDef => ({"oracleId":"feb244f8-bcb1-44cf-9940-2719221a7309","name":"Vampire Nighthawk","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Vampire Shaman","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Shaman"],"oracleText":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)","power":"2","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch","Flying","Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/44f19fe3-7a17-4c45-adfa-590f73dfebfa.jpg?1783942148","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/44f19fe3-7a17-4c45-adfa-590f73dfebfa.jpg?1783942148","commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const hangarback = (): CardDef => ({"oracleId":"dde55256-5259-44e7-a267-fca45a7f0d04","name":"Hangarback Walker","manaCost":"{X}{X}","cmc":0,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"This creature enters with X +1/+1 counters on it.\nWhen this creature dies, create a 1/1 colorless Thopter artifact creature token with flying for each +1/+1 counter on this creature.\n{1}, {T}: Put a +1/+1 counter on this creature.","power":"0","toughness":"0","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/2/c246b845-dfca-47a3-aa56-074d30590320.jpg?1783937251","artUrl":"https://cards.scryfall.io/art_crop/front/c/2/c246b845-dfca-47a3-aa56-074d30590320.jpg?1783937251","commanderLegal":"legal","set":"mps","releasedAt":"2016-09-30","rarity":"special","layout":"normal","gameChanger":false}) as CardDef;
const serraAngel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shatter = (): CardDef => ({"oracleId":"84d32e68-72b9-432d-a023-7bc6a26b8ad0","name":"Shatter","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/2/929a41f7-f52d-4190-a80c-5ceb3e368a31.jpg?1783935294","artUrl":"https://cards.scryfall.io/art_crop/front/9/2/929a41f7-f52d-4190-a80c-5ceb3e368a31.jpg?1783935294","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const actOfTreason = (): CardDef => ({"oracleId":"9d08af23-9f4a-4097-9abc-3b17475ab744","name":"Act of Treason","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. (It can attack and {T} this turn.)","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1f2328c4-7344-48bf-b515-977499bcfd1c.jpg?1783933686","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1f2328c4-7344-48bf-b515-977499bcfd1c.jpg?1783933686","commanderLegal":"legal","set":"rna","releasedAt":"2019-01-25","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
/** Everyone passes (questions answered the way a bot would, blocks and attacks declared empty) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 5000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never stopped");
};
/** Everything on the stack resolves (questions answered the way a bot would). */
const settle = (s: GameState) => goUntil(s, (x) => !x.pending && !x.stack.length && !x.triggerQueue.length);
const toZone = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  (z === "graveyard" ? s.players[pid]!.graveyard : s.players[pid]!.hand).push(id);
  invalidateCharacteristics(s);
  return id;
};
/** `pid`'s next upkeep, with priority (any upkeep triggers resolved). */
const nextUpkeep = (s: GameState, pid: PlayerId) => {
  const turn = s.turn;
  return goUntil(s, (x) => x.turn > turn && x.step === "upkeep" && x.activePlayer === pid && !x.pending && !x.stack.length && !x.triggerQueue.length && waitingOn(x) === pid);
};

describe("round B231 cards", () => {
  it("are fully supported", () => supported(rainOfGore(), kheru(), tomb(), brink()));
});

describe("Rain of Gore", () => {
  it("turns a gain a spell causes for its own controller into a loss", () => {
    const { s: s0, ap, opp, ids } = setup([revitalize()]);
    putOnBattlefield(s0, opp, rainOfGore());
    const before = life(s0, ap);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(life(s, ap)).toBe(before - 3);
  });

  it("leaves a gain alone when the spell's controller isn't the one gaining", () => {
    const { s: s0, ap, opp, ids } = setup([swords()]);
    putOnBattlefield(s0, ap, rainOfGore());
    const angel = putOnBattlefield(s0, opp, serraAngel());
    const before = life(s0, opp);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(angel)]));
    s = settle(s);
    expect(zone(s, angel)).toBe("exile");
    expect(life(s, opp)).toBe(before + 4);
  });

  it("applies to a triggered ability's gain for its controller", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    putOnBattlefield(s0, ap, rainOfGore());
    putOnBattlefield(s0, ap, soulWarden());
    const before = life(s0, ap);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(life(s, ap)).toBe(before - 1);
  });

  it("doesn't apply to lifelink (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, rainOfGore());
    const hawk = putOnBattlefield(s0, ap, nighthawk());
    const before = life(s0, ap);
    let s = goUntil(s0, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: hawk, defender: opp }] });
    s = goUntil(s, (x) => x.step === "main2");
    expect(life(s, ap)).toBe(before + 2);
  });
});

describe("Kheru Mind-Eater", () => {
  const hit = () => {
    const { s: s0, ap, opp } = setup([]);
    const eater = putOnBattlefield(s0, ap, kheru());
    const card = toZone(s0, opp, bear({ name: "Hidden Bear" }), "hand");
    let s = goUntil(s0, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: eater, defender: opp }] });
    s = goUntil(s, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === opp);
    return { s, ap, opp, eater, card };
  };

  it("has the damaged player exile a card of their choice from their hand face down, which you may cast", () => {
    const { s: s1, ap, opp, card } = hit();
    const p = s1.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.cards).toContain(card);
    let s = act(s1, { type: "searchLibrary", player: opp, found: [card] });
    s = goUntil(s, (x) => x.step === "main2" && !x.stack.length && waitingOn(x) === ap);
    const o = s.objects[card]!;
    expect(o.zone).toBe("exile");
    expect(o.hiddenExile).toBeDefined();
    expect(o.hiddenExile!.seen).toContain(ap);
    s = run(s, planCast(s, ap, card));
    s = settle(s);
    expect(zone(s, card)).toBe("battlefield");
    expect(controllerOf(s, s.objects[card]!)).toBe(ap);
    expect(s.objects[card]!.owner).toBe(opp);
  });

  it("lets only whoever controls it play the cards, and none once it's gone", () => {
    const { s: s1, ap, opp, eater, card } = hit();
    let s = act(s1, { type: "searchLibrary", player: opp, found: [card] });
    s = goUntil(s, (x) => x.step === "main2" && !x.stack.length && waitingOn(x) === ap);
    // The owner can't cast it.
    expect(planCast(s, opp, card)).toBeNull();
    s.battlefield.splice(s.battlefield.indexOf(eater), 1);
    s.objects[eater]!.zone = "graveyard";
    s.objects[eater]!.zoneChanges = (s.objects[eater]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(eater);
    invalidateCharacteristics(s);
    expect(planCast(s, ap, card)).toBeNull();
  });

  it("a bot exiles the card of its hand worth least", () => {
    const { s: s1, opp } = hit();
    const p = s1.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    const [a] = botActions(s1, opp);
    expect(a?.type).toBe("searchLibrary");
    expect((a as { found: string[] }).found).toHaveLength(1);
    expect(p.cards).toContain((a as { found: string[] }).found[0]);
  });
});

describe("Cyclopean Tomb", () => {
  const types = (s: GameState, id: string) => characteristics(s, s.objects[id]!).subtypes;
  const mire = (s0: GameState, ap: PlayerId, lands: string[]) => {
    const t = putOnBattlefield(s0, ap, tomb());
    let s = s0;
    for (const land of lands) {
      s = nextUpkeep(s, ap);
      s = run(s, planActivate(s, ap, t, 0, [target(land)]));
      s = settle(s);
    }
    return { s, t };
  };
  const destroy = (s: GameState, id: string, by: PlayerId) => {
    const shatter = toZone(s, by, shatterDef(), "hand");
    return settle(run(s, planCast(s, by, shatter, [target(id)])));
  };
  const shatterDef = shatter;

  it("only during your upkeep, makes the land a Swamp while it has a mire counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, opp, forest);
    const t = putOnBattlefield(s0, ap, tomb());
    expect(planActivate(s0, ap, t, 0, [target(f)])).toBeNull();
    const { s } = mire(s0, ap, [f]);
    void t;
    expect(s.objects[f]!.counters.mire).toBe(1);
    expect(types(s, f)).toEqual(["Swamp"]);
  });

  it("once it's gone, removes the mire counters from one such land at each of your upkeeps", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, opp, forest);
    const { s: s1, t } = mire(s0, ap, [f]);
    let s = goUntil(s1, (x) => x.step === "main1" && x.activePlayer === ap && waitingOn(x) === ap && !x.stack.length);
    s = destroy(s, t, ap);
    expect(zone(s, t)).toBe("graveyard");
    // Still a Swamp without the Tomb (rulings).
    expect(types(s, f)).toEqual(["Swamp"]);
    s = nextUpkeep(s, ap);
    expect(s.objects[f]!.counters.mire ?? 0).toBe(0);
    expect(types(s, f)).toEqual(["Forest"]);
    // For the rest of the game: it triggers again, with nothing left to do.
    expect(s.delayed?.some((d) => d.when === "eachYourUpkeep" && d.controller === ap)).toBe(true);
  });

  it("asks which land when there are several, one at a time", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, opp, forest);
    const g = putOnBattlefield(s0, ap, forest);
    const { s: s1, t } = mire(s0, ap, [f, g]);
    expect(types(s1, f)).toEqual(["Swamp"]);
    expect(types(s1, g)).toEqual(["Swamp"]);
    let s = goUntil(s1, (x) => x.step === "main1" && x.activePlayer === ap && waitingOn(x) === ap && !x.stack.length);
    s = destroy(s, t, ap);
    const turn = s.turn;
    s = goUntil(s, (x) => x.turn > turn && x.pending?.kind === "chooseOption" && x.pending.what === "mireLand");
    const p = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect(p.player).toBe(ap);
    expect([...p.options].sort()).toEqual([f, g].sort());
    // A bot gives its own land back its types first.
    const [a] = botActions(s, ap);
    expect(a).toEqual({ type: "chooseOption", player: ap, choice: g });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: f }));
    expect(types(s, f)).toEqual(["Forest"]);
    expect(types(s, g)).toEqual(["Swamp"]);
    // The next upkeep: the one left, with no question.
    s = nextUpkeep(s, ap);
    expect(types(s, g)).toEqual(["Forest"]);
  });
});

describe("Back from the Brink", () => {
  it("exiles a creature card from your graveyard and pays its mana cost for a token copy of it", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, brink());
    const angel = toZone(s0, ap, serraAngel(), "graveyard");
    const plan = planActivate(s0, ap, b, 0, undefined, undefined, undefined, undefined, { exileCards: [angel] });
    expect(plan).not.toBeNull();
    // Five lands tapped for {3}{W}{W}.
    expect(plan!.filter((a) => a.type === "activateMana" || (a.type === "activateAbility" && a.objectId !== b)).length).toBe(5);
    let s = run(s0, plan);
    expect(zone(s, angel)).toBe("exile");
    s = settle(s);
    const token = s.battlefield.find((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === "Serra Angel");
    expect(token).toBeDefined();
    expect(controllerOf(s, s.objects[token!]!)).toBe(ap);
  });

  it("can't be activated without the mana for that card's cost", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, brink());
    const angel = toZone(s0, ap, serraAngel(), "graveyard");
    for (const id of s0.battlefield) if (controllerOf(s0, s0.objects[id]!) === ap && characteristics(s0, s0.objects[id]!).types.includes("Land") && characteristics(s0, s0.objects[id]!).subtypes.includes("Plains")) s0.objects[id]!.tapped = true;
    expect(planActivate(s0, ap, b, 0, undefined, undefined, undefined, undefined, { exileCards: [angel] })).toBeNull();
  });

  it("counts {X} as 0 (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, brink());
    const walker = toZone(s0, ap, hangarback(), "graveyard");
    const plan = planActivate(s0, ap, b, 0, undefined, undefined, undefined, undefined, { exileCards: [walker] });
    expect(plan).toHaveLength(1);
    const s = run(s0, plan);
    expect(zone(s, walker)).toBe("exile");
  });

  it("a bot copies the costliest creature card it can pay for", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, brink());
    toZone(s0, ap, bear(), "graveyard");
    const angel = toZone(s0, ap, serraAngel(), "graveyard");
    // Bots play the whole turn (its commander first, the ability after combat).
    let s = s0;
    let used: { type: string; objectId?: string; costs?: { exileCards?: string[] } } | undefined;
    for (let i = 0; i < 80 && s.activePlayer === ap && !used; i++) {
      const w = s.pending ? s.pending.player : waitingOn(s)!;
      const acts = botActions(s, w);
      if (w === ap) used = acts.find((a) => a.type === "activateAbility" && a.objectId === b) as typeof used;
      for (const a of acts) s = act(s, a);
    }
    expect(used?.costs?.exileCards).toEqual([angel]);
  });
});
