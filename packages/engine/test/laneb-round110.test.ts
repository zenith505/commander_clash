// Lane B round B110: "target ... of their choice" triggers (The Abyss, Magus of the Abyss, Erithizon, Mausoleum Turnkey,
// Ley Line, Death Match); "becomes blocked" by an effect (Dazzling Beauty, Curtain of Light, Trap Runner, Fog Patch,
// Choking Vines); "blocked or was blocked by a Zombie / a legendary creature this turn" (Time to Reflect, You Cannot Pass!).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[]; may?: boolean } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay" && opts.may !== undefined) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may });
    else if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** Moves a new card for `def` from the battlefield into `pid`'s `zone`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Passes until `ap`'s postcombat main phase, everyone else doing nothing. */
const toMain2 = (s: GameState, ap: PlayerId) => {
  for (let i = 0; i < 200 && !(s.step === "main2" && s.activePlayer === ap && !s.stack.length && !s.pending); i++) {
    if (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Moves a new card for `def` from the battlefield into `pid`'s graveyard. */
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};

// Real oracle text (Scryfall).
const abyss = (): CardDef => ({"oracleId":"a02a7816-c967-4503-bb08-f8db44915250","name":"The Abyss","manaCost":"{3}{B}","cmc":4,"typeLine":"World Enchantment","supertypes":["World"],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each player's upkeep, destroy target nonartifact creature that player controls of their choice. It can't be regenerated.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/6/86a27d68-3e58-4ade-976d-36381beed451.jpg?1783948063","artUrl":"https://cards.scryfall.io/art_crop/front/8/6/86a27d68-3e58-4ade-976d-36381beed451.jpg?1783948063","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const magus = (): CardDef => ({"oracleId":"66958c48-3ac7-4f41-aa3e-adacaa24ea4f","name":"Magus of the Abyss","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"At the beginning of each player's upkeep, destroy target nonartifact creature that player controls of their choice. It can't be regenerated.","power":"4","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/0/1005a22c-491b-4969-befb-406c42fcec68.jpg?1783943114","artUrl":"https://cards.scryfall.io/art_crop/front/1/0/1005a22c-491b-4969-befb-406c42fcec68.jpg?1783943114","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const erithizon = (): CardDef => ({"oracleId":"45645a97-f41d-47fb-b943-293ffc18fc82","name":"Erithizon","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"Whenever this creature attacks, put a +1/+1 counter on target creature of defending player's choice.","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/c/ec4ea4e2-2102-4b99-bea5-6fc4203f2b26.jpg?1783945927","artUrl":"https://cards.scryfall.io/art_crop/front/e/c/ec4ea4e2-2102-4b99-bea5-6fc4203f2b26.jpg?1783945927","commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const turnkey = (): CardDef => ({"oracleId":"d4a61685-7149-4d14-bc17-85b060945687","name":"Mausoleum Turnkey","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Ogre Rogue","supertypes":[],"types":["Creature"],"subtypes":["Ogre","Rogue"],"oracleText":"When this creature enters, return target creature card of an opponent's choice from your graveyard to your hand.","power":"3","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/51b6dc7d-fc8a-4842-bf30-3dc9fec708c4.jpg?1783943667","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/51b6dc7d-fc8a-4842-bf30-3dc9fec708c4.jpg?1783943667","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const leyLine = (): CardDef => ({"oracleId":"230d79dd-15dd-431d-af22-bdc6eaf86341","name":"Ley Line","manaCost":"{3}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each player's upkeep, that player may put a +1/+1 counter on target creature of their choice.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/8/f8990efd-708a-4019-bce0-2d6409ecc004.jpg?1783945923","artUrl":"https://cards.scryfall.io/art_crop/front/f/8/f8990efd-708a-4019-bce0-2d6409ecc004.jpg?1783945923","commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const deathMatch = (): CardDef => ({"oracleId":"68d11f97-da97-4738-bb3e-e6730bd014e8","name":"Death Match","manaCost":"{3}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a creature enters, that creature's controller may have target creature of their choice get -3/-3 until end of turn.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/143e9057-267a-4c78-b72a-4f8018b627a8.jpg?1783945071","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/143e9057-267a-4c78-b72a-4f8018b627a8.jpg?1783945071","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const beauty = (): CardDef => ({"oracleId":"de96ef93-a2e0-409d-9d25-fcb2405039b5","name":"Dazzling Beauty","manaCost":"{2}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only during the declare blockers step.\nTarget unblocked attacking creature becomes blocked. (This spell works on creatures that can't be blocked.)\nDraw a card at the beginning of the next turn's upkeep.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/d/ad0ece98-5506-4a18-b900-8d1a6cd87385.jpg?1783947124","artUrl":"https://cards.scryfall.io/art_crop/front/a/d/ad0ece98-5506-4a18-b900-8d1a6cd87385.jpg?1783947124","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const curtain = (): CardDef => ({"oracleId":"d6efbbf9-1449-45ce-b187-30041eb36d93","name":"Curtain of Light","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only during combat after blockers are declared.\nTarget unblocked attacking creature becomes blocked. (This spell works on creatures that can't be blocked.)\nDraw a card.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/c/fc382831-e338-49bd-a37f-931bf611b165.jpg?1783944172","artUrl":"https://cards.scryfall.io/art_crop/front/f/c/fc382831-e338-49bd-a37f-931bf611b165.jpg?1783944172","commanderLegal":"legal","set":"sok","releasedAt":"2005-06-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const trapRunner = (): CardDef => ({"oracleId":"730fbd6a-096c-4d25-9372-c05f90088f83","name":"Trap Runner","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"{T}: Target unblocked attacking creature becomes blocked. Activate only during combat after blockers are declared. (This ability works on creatures that can't be blocked.)","power":"2","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/b/eba97681-1d1f-4ab6-a21b-fbbbe63a1c74.jpg?1783945972","artUrl":"https://cards.scryfall.io/art_crop/front/e/b/eba97681-1d1f-4ab6-a21b-fbbbe63a1c74.jpg?1783945972","commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const fogPatch = (): CardDef => ({"oracleId":"eb8ff6c1-f9b4-4dae-8f46-0f1ad4c05355","name":"Fog Patch","manaCost":"{1}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only during the declare blockers step.\nAttacking creatures become blocked. (This spell works on creatures that can't be blocked.)","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/3/133f9e4f-2b1b-4a24-ad19-285a2c5845b5.jpg?1783945816","artUrl":"https://cards.scryfall.io/art_crop/front/1/3/133f9e4f-2b1b-4a24-ad19-285a2c5845b5.jpg?1783945816","commanderLegal":"legal","set":"nem","releasedAt":"2000-02-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const vines = (): CardDef => ({"oracleId":"3b6b565e-c0b5-48f9-b3e0-4d5d4b065402","name":"Choking Vines","manaCost":"{X}{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only during the declare blockers step.\nX target attacking creatures become blocked. Choking Vines deals 1 damage to each of those creatures. (This spell works on creatures that can't be blocked.)","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/c/6cc4a7ee-f6f0-454a-9074-5988fdee1f34.jpg?1783946721","artUrl":"https://cards.scryfall.io/art_crop/front/6/c/6cc4a7ee-f6f0-454a-9074-5988fdee1f34.jpg?1783946721","commanderLegal":"legal","set":"wth","releasedAt":"1997-06-09","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const reflect = (): CardDef => ({"oracleId":"7ce28a3c-5f93-4434-918e-1e74f9fc71d8","name":"Time to Reflect","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target creature that blocked or was blocked by a Zombie this turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/6/b60ec4f7-7cf1-4b97-906b-536ab89b12be.jpg?1783936533","artUrl":"https://cards.scryfall.io/art_crop/front/b/6/b60ec4f7-7cf1-4b97-906b-536ab89b12be.jpg?1783936533","commanderLegal":"legal","set":"akh","releasedAt":"2017-04-28","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const cannotPass = (): CardDef => ({"oracleId":"8e94ccdb-5978-440b-b7cd-11c7ca6b2c98","name":"You Cannot Pass!","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature that blocked or was blocked by a legendary creature this turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/1/116d4030-acd2-4aa2-8254-aaaff1264459.jpg?1783916325","artUrl":"https://cards.scryfall.io/art_crop/front/1/1/116d4030-acd2-4aa2-8254-aaaff1264459.jpg?1783916325","commanderLegal":"legal","set":"ltr","releasedAt":"2023-06-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

// Test cards.
const vanilla = (name: string, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, "Creature — Beast", "{2}{G}", { cmc: 3, power: String(p), toughness: String(t), colors: ["G"], ...extra });
const golem = () => card("Test Golem", "Artifact Creature — Golem", "{4}", { cmc: 4, power: "3", toughness: "3" });
const shrouded = () => vanilla("Test Hexproof Beast", 4, 4, { oracleText: "Hexproof", keywords: ["Hexproof"] });

describe("Lane B round B110: targets chosen by another player", () => {
  it("compiles all six cards", () => supported(abyss(), magus(), erithizon(), turnkey(), leyLine(), deathMatch()));

  it("The Abyss: on another player's upkeep that player chooses which of their nonartifact creatures is destroyed", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const b = next(s, ap);
    putOnBattlefield(s, ap, abyss());
    const mine = putOnBattlefield(s, ap, vanilla("Test Own Beast", 2, 2));
    const little = putOnBattlefield(s, b, bear({ name: "Test Little Bear" }));
    const big = putOnBattlefield(s, b, vanilla("Test Big Beast", 5, 5));
    const art = putOnBattlefield(s, b, golem());
    s = passUntil(s, "upkeep", b);
    const p = s.pending;
    expect(p?.kind === "chooseTargets" && p.player === b && p.controller === ap).toBe(true);
    // Only a nonartifact creature that player controls.
    expect(() => applyAction(s, { type: "chooseTargets", player: b, targets: [tgt(art)] })).toThrow();
    expect(() => applyAction(s, { type: "chooseTargets", player: b, targets: [tgt(mine)] })).toThrow();
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [tgt(big)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: b, targets: [tgt(big)] });
    expect(s.stack.at(-1)?.controller).toBe(ap);
    s = settle(s);
    expect(zone(s, big)).toBe("graveyard");
    expect(zone(s, little)).toBe("battlefield");
    expect(zone(s, mine)).toBe("battlefield");
  });

  it("Magus of the Abyss: a bot chooses its own least valuable creature", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const b = next(s, ap);
    putOnBattlefield(s, ap, magus());
    const little = putOnBattlefield(s, b, bear({ name: "Test Little Bear" }));
    const big = putOnBattlefield(s, b, vanilla("Test Big Beast", 5, 5));
    s = passUntil(s, "upkeep", b);
    expect(s.pending?.kind === "chooseTargets" && s.pending.player === b).toBe(true);
    s = settle(s);
    expect(zone(s, little)).toBe("graveyard");
    expect(zone(s, big)).toBe("battlefield");
  });

  it("The Abyss: the controller targets, so another player's hexproof creature can't be chosen, but the controller's own can", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const b = next(s, ap);
    putOnBattlefield(s, ap, abyss());
    const theirs = putOnBattlefield(s, b, shrouded());
    s = passUntil(s, "upkeep", b);
    // No legal target: the ability is removed (CR 603.3d).
    expect(s.pending?.kind === "chooseTargets").toBe(false);
    expect(s.stack.length).toBe(0);
    expect(zone(s, theirs)).toBe("battlefield");
    // Around to the controller's own upkeep: their hexproof creature can be targeted by their own ability.
    const own = putOnBattlefield(s, ap, shrouded());
    s = passUntil(s, "main1", b);
    s = passUntil(s, "upkeep", ap);
    const p = s.pending;
    expect(p?.kind === "chooseTargets" && p.player === ap && p.controller === undefined).toBe(true);
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(own)] });
    s = settle(s);
    expect(zone(s, own)).toBe("graveyard");
  });

  it("Erithizon: the defending player chooses which creature gets the +1/+1 counter, their own best one as a bot", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const b = next(s, ap);
    const eri = putOnBattlefield(s, ap, erithizon());
    const little = putOnBattlefield(s, b, bear({ name: "Test Little Bear" }));
    const big = putOnBattlefield(s, b, vanilla("Test Big Beast", 5, 5));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: eri, defender: b }] });
    const p = s.pending;
    expect(p?.kind === "chooseTargets" && p.player === b && p.controller === ap).toBe(true);
    for (const a of botActions(s, b)) s = act(s, a);
    s = settle(s);
    expect(s.objects[big]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, big)).toBe("6/6");
    expect(s.objects[little]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[eri]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Erithizon: the defending player may choose any creature, Erithizon itself too", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const b = next(s, ap);
    const eri = putOnBattlefield(s, ap, erithizon());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: eri, defender: b }] });
    s = act(s, { type: "chooseTargets", player: b, targets: [tgt(eri)] });
    s = settle(s);
    expect(pt(s, eri)).toBe("5/5");
  });

  it("Mausoleum Turnkey: its controller chooses an opponent, who chooses the creature card returned", () => {
    const { s: s0, ap, ids } = setup([turnkey()]);
    let s = s0;
    const c = next(s, ap, 2);
    const cheap = toYard(s, ap, bear({ name: "Test Cheap Bear" }));
    const dear = toYard(s, ap, vanilla("Test Dear Beast", 6, 6, { manaCost: "{5}{G}", cmc: 6 }));
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { me: [ap] });
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what === "targetChooser" && p.player === ap).toBe(true);
    if (p?.kind !== "chooseOption") throw new Error("no choice");
    expect(p.options).toHaveLength(3);
    expect(p.options).not.toContain(String(ap));
    s = act(s, { type: "chooseOption", player: ap, choice: String(c) });
    const q = s.pending;
    expect(q?.kind === "chooseTargets" && q.player === c && q.controller === ap).toBe(true);
    // From the controller's graveyard ("your graveyard" is the controller's).
    s = settle(s);
    expect(zone(s, cheap)).toBe("hand");
    expect(zone(s, dear)).toBe("graveyard");
  });

  it("Mausoleum Turnkey: with no creature card in the graveyard, the ability is removed without a question", () => {
    const { s: s0, ap, ids } = setup([turnkey()]);
    let s = s0;
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { me: [ap] });
    expect(s.pending).toBe(null);
    expect(s.stack.length).toBe(0);
  });

  it("Ley Line: on each upkeep that player chooses the creature, then may put the counter on it", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const b = next(s, ap);
    putOnBattlefield(s, ap, leyLine());
    const mine = putOnBattlefield(s, ap, bear({ name: "Test Own Bear" }));
    const theirs = putOnBattlefield(s, b, vanilla("Test Big Beast", 5, 5));
    s = passUntil(s, "upkeep", b);
    const p = s.pending;
    expect(p?.kind === "chooseTargets" && p.player === b && p.controller === ap).toBe(true);
    // A bot chooses its own creature and puts the counter on it.
    s = settle(s);
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[mine]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Ley Line: the player may decline after choosing", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const b = next(s, ap);
    putOnBattlefield(s, ap, leyLine());
    const mine = putOnBattlefield(s, ap, bear({ name: "Test Own Bear" }));
    s = passUntil(s, "upkeep", b);
    s = act(s, { type: "chooseTargets", player: b, targets: [tgt(mine)] });
    s = settle(s, { me: [b] });
    const p = s.pending;
    expect(p?.kind === "chooseMay" && p.player === b).toBe(true);
    s = act(s, { type: "chooseMay", player: b, yes: false });
    s = settle(s);
    expect(s.objects[mine]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Death Match: the entering creature's controller chooses the target and may give it -3/-3", () => {
    const { s: s0, ap, ids } = setup([bear({ name: "Test Entering Bear" })]);
    let s = s0;
    const b = next(s, ap);
    const c = next(s, ap, 2);
    putOnBattlefield(s, b, deathMatch());
    const victim = putOnBattlefield(s, c, vanilla("Test Victim", 3, 3));
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { me: [ap] });
    const p = s.pending;
    expect(p?.kind === "chooseTargets" && p.player === ap && p.controller === b).toBe(true);
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(victim)] });
    expect(s.stack.at(-1)?.controller).toBe(b);
    s = settle(s, { may: true });
    expect(zone(s, victim)).toBe("graveyard");
  });

  it("Death Match: a bot aims it at an opponent's creature, not its own", () => {
    const { s: s0, ap, ids } = setup([bear({ name: "Test Entering Bear" })]);
    let s = s0;
    const b = next(s, ap);
    const c = next(s, ap, 2);
    putOnBattlefield(s, b, deathMatch());
    const victim = putOnBattlefield(s, c, vanilla("Test Victim", 3, 3));
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(zone(s, victim)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });
});

/** `ap` attacks with `attacks`; every defending player blocks as `blocks` says (none by default); then priority goes round to `to`. */
const combatTo = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], blocks: { blocker: string; attacker: string }[], to: PlayerId) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 60 && !(s.step === "declareBlockers" && !s.pending && waitingOn(s) === to); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === p.player) });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  expect(s.step).toBe("declareBlockers");
  return s;
};
/** Passes until the end of combat (each prompt answered by the bots). */
const toEndCombat = (s: GameState) => {
  for (let i = 0; i < 100 && s.step !== "endCombat"; i++) {
    if (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const rager = () => vanilla("Test Rager", 2, 2, { oracleText: "Whenever Test Rager becomes blocked, it gets +2/+2 until end of turn." });
const byCreature = () => vanilla("Test Duelist", 2, 2, { oracleText: "Whenever Test Duelist becomes blocked by a creature, it gets +5/+5 until end of turn." });
const trampler = () => vanilla("Test Trampler", 4, 4, { oracleText: "Trample", keywords: ["Trample"] });
const zombie = () => card("Test Zombie", "Creature — Zombie", "{1}{B}", { cmc: 2, power: "2", toughness: "2", colors: ["B"] });
const legend = () => card("Test Legend", "Legendary Creature — Human Knight", "{1}{W}", { cmc: 2, power: "1", toughness: "4", colors: ["W"], supertypes: ["Legendary"] });

describe("Lane B round B110: creatures that become blocked", () => {
  it("compiles all five cards", () => supported(beauty(), curtain(), trapRunner(), fogPatch(), vines()));

  it("Dazzling Beauty: the unblocked attacker becomes blocked, deals no combat damage, and its 'becomes blocked' ability triggers", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    let s = s0;
    const r = putOnBattlefield(s, ap, rager());
    const d = putOnBattlefield(s, ap, byCreature());
    const db = into(s, b, beauty(), "hand");
    s = combatTo(s, ap, [{ attacker: r, defender: b }, { attacker: d, defender: b }], [], b);
    s.players[b]!.manaPool = { ...s.players[b]!.manaPool, W: 1, C: 2 };
    const life = s.players[b]!.life;
    s = run(s, planCast(s, b, db, [tgt(r)]));
    s = settle(s);
    expect(s.objects[r]!.blockedBy).toEqual([]);
    // "Whenever ~ becomes blocked" triggered (CR 509.3c), "becomes blocked by a creature" didn't (509.3d).
    expect(pt(s, r)).toBe("4/4");
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = toEndCombat(s);
    // Only the unblocked Test Duelist's 2 damage.
    expect(s.players[b]!.life).toBe(life - 2);
    // Its delayed draw is still to come at the next turn's upkeep.
    expect(s.delayed?.some((x) => x.when === "nextTurnUpkeep")).toBe(true);
  });

  it("Dazzling Beauty can't target a blocked attacker, and a 'becomes blocked by a creature' ability doesn't trigger", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    let s = s0;
    const d = putOnBattlefield(s, ap, byCreature());
    const r = putOnBattlefield(s, ap, rager());
    const wall = putOnBattlefield(s, b, vanilla("Test Wall", 0, 6));
    const db = into(s, b, beauty(), "hand");
    s = combatTo(s, ap, [{ attacker: d, defender: b }, { attacker: r, defender: b }], [{ blocker: wall, attacker: r }], b);
    // Test Rager's own trigger (blocked by Test Wall), then priority round to the defender again.
    s = settle(s, { me: [b] });
    for (let i = 0; i < 10 && waitingOn(s) !== b; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s.players[b]!.manaPool = { ...s.players[b]!.manaPool, W: 1, C: 2 };
    expect(planCast(s, b, db, [tgt(r)])).toBe(null);
    s = run(s, planCast(s, b, db, [tgt(d)]));
    s = settle(s);
    expect(s.objects[d]!.blockedBy).toEqual([]);
    expect(pt(s, d)).toBe("2/2");
  });

  it("Curtain of Light: a trampler that becomes blocked still deals all its damage to the player (CR 702.19d)", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    let s = s0;
    const t = putOnBattlefield(s, ap, trampler());
    const cl = into(s, b, curtain(), "hand");
    s = combatTo(s, ap, [{ attacker: t, defender: b }], [], b);
    s.players[b]!.manaPool = { ...s.players[b]!.manaPool, W: 1, C: 1 };
    const [life, hand] = [s.players[b]!.life, s.players[b]!.hand.length];
    s = run(s, planCast(s, b, cl, [tgt(t)]));
    s = settle(s);
    expect(s.objects[t]!.blockedBy).toEqual([]);
    expect(s.players[b]!.hand.length).toBe(hand); // cast one, drew one
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = toEndCombat(s);
    expect(s.players[b]!.life).toBe(life - 4);
  });

  it("Trap Runner: tap it to make an unblocked attacker blocked, only after blockers are declared", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    let s = s0;
    const a = putOnBattlefield(s, ap, vanilla("Test Attacker", 3, 3));
    const tr = putOnBattlefield(s, b, trapRunner());
    s = combatTo(s, ap, [{ attacker: a, defender: b }], [], b);
    const life = s.players[b]!.life;
    const plan = planActivate(s, b, tr, 0, [tgt(a)]);
    s = run(s, plan);
    s = settle(s);
    expect(s.objects[tr]!.tapped).toBe(true);
    expect(s.objects[a]!.blockedBy).toEqual([]);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = toEndCombat(s);
    expect(s.players[b]!.life).toBe(life);
  });

  it("Fog Patch: every attacking creature becomes blocked", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const c = next(s0, ap, 2);
    let s = s0;
    const x = putOnBattlefield(s, ap, vanilla("Test Attacker", 3, 3));
    const y = putOnBattlefield(s, ap, rager());
    const fp = into(s, b, fogPatch(), "hand");
    s = combatTo(s, ap, [{ attacker: x, defender: b }, { attacker: y, defender: c }], [], b);
    s.players[b]!.manaPool = { ...s.players[b]!.manaPool, G: 1, C: 1 };
    const [lb, lc] = [s.players[b]!.life, s.players[c]!.life];
    s = run(s, planCast(s, b, fp));
    s = settle(s);
    expect(s.objects[x]!.blockedBy).toEqual([]);
    expect(s.objects[y]!.blockedBy).toEqual([]);
    expect(pt(s, y)).toBe("4/4");
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = toEndCombat(s);
    expect([s.players[b]!.life, s.players[c]!.life]).toEqual([lb, lc]);
  });

  it("Choking Vines: X attackers become blocked and are dealt 1 damage each; a blocked one is only dealt the damage", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    let s = s0;
    const x = putOnBattlefield(s, ap, vanilla("Test Attacker", 3, 3));
    const y = putOnBattlefield(s, ap, bear({ name: "Test Blocked Bear" }));
    const wall = putOnBattlefield(s, b, vanilla("Test Wall", 0, 6));
    const cv = into(s, b, vines(), "hand");
    s = combatTo(s, ap, [{ attacker: x, defender: b }, { attacker: y, defender: b }], [{ blocker: wall, attacker: y }], b);
    s = settle(s, { me: [b] });
    s.players[b]!.manaPool = { ...s.players[b]!.manaPool, G: 1, C: 2 };
    s = run(s, planCast(s, b, cv, [tgt(x), tgt(y)], undefined, "auto", 2));
    s = settle(s);
    expect(s.objects[x]!.blockedBy).toEqual([]);
    expect(s.objects[y]!.blockedBy).toEqual([wall]);
    expect(s.objects[x]!.damage).toBe(1);
    expect(s.objects[y]!.damage).toBe(1);
  });
});

describe("Lane B round B110: blocked or was blocked by a Zombie or a legendary creature", () => {
  it("compiles both cards", () => supported(reflect(), cannotPass()));

  it("Time to Reflect: exiles a creature a Zombie blocked this turn, but not one in another block", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    let s = s0;
    const x = putOnBattlefield(s, ap, vanilla("Test Attacker", 3, 3));
    const y = putOnBattlefield(s, ap, vanilla("Test Other Attacker", 3, 3));
    const z = putOnBattlefield(s, b, zombie());
    const w = putOnBattlefield(s, b, vanilla("Test Wall", 0, 6));
    const tr = into(s, b, reflect(), "hand");
    s = combatTo(s, ap, [{ attacker: x, defender: b }, { attacker: y, defender: b }], [{ blocker: z, attacker: x }, { blocker: w, attacker: y }], b);
    s = settle(s, { me: [b] });
    s.players[b]!.manaPool = { ...s.players[b]!.manaPool, W: 1 };
    expect(planCast(s, b, tr, [tgt(y)])).toBe(null);
    expect(planCast(s, b, tr, [tgt(w)])).toBe(null);
    // The Zombie itself blocked the attacker, which isn't a Zombie: it can't be targeted either.
    expect(planCast(s, b, tr, [tgt(z)])).toBe(null);
    s = run(s, planCast(s, b, tr, [tgt(x)]));
    s = settle(s);
    expect(zone(s, x)).toBe("exile");
  });

  it("You Cannot Pass!: after combat, a creature that blocked a legendary creature this turn, even once that one is gone", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    let s = s0;
    const l = putOnBattlefield(s, ap, legend());
    const blocker = putOnBattlefield(s, b, vanilla("Test Blocker", 0, 5));
    s = combatTo(s, ap, [{ attacker: l, defender: b }], [{ blocker, attacker: l }], b);
    s = toMain2(s, ap);
    const yc = into(s, ap, cannotPass(), "hand");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 1 };
    // The legendary attacker blocked by a nonlegendary creature isn't a target.
    expect(planCast(s, ap, yc, [tgt(l)])).toBe(null);
    // The legendary creature has left the battlefield: it was legendary as the block was declared (rulings).
    moveObject(s, l, "graveyard");
    s = run(s, planCast(s, ap, yc, [tgt(blocker)]));
    s = settle(s);
    expect(zone(s, blocker)).toBe("graveyard");
  });

  it("You Cannot Pass!: the legendary attacker itself, blocked by a legendary creature", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    let s = s0;
    const x = putOnBattlefield(s, ap, vanilla("Test Attacker", 3, 3));
    const l = putOnBattlefield(s, b, legend());
    s = combatTo(s, ap, [{ attacker: x, defender: b }], [{ blocker: l, attacker: x }], b);
    s = toMain2(s, ap);
    const yc = into(s, ap, cannotPass(), "hand");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 1 };
    s = run(s, planCast(s, ap, yc, [tgt(x)]));
    s = settle(s);
    expect(zone(s, x)).toBe("graveyard");
  });
});
