// Lane B round B97: characteristic-defining power and toughness outside the battlefield (CR 604.3), and the round's cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, defOf, invalidateCharacteristics, isFullySupported, manaOptions, planActivate, planCast, planTurnFaceUp, power, toughness, turnFaceUpProblem, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = []) => run(s, planCast(s, pid, id, targets, undefined, "auto"));
/** Moves a new card for `def` from the battlefield into `pid`'s `zone`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const godspeaker = (): CardDef => ({"oracleId":"891e9a08-35ec-422f-87a8-1f3f5c705699","name":"Sacellum Godspeaker","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Reveal any number of creature cards with power 5 or greater from your hand. Add {G} for each card revealed this way.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad80819-22d4-43a8-97b2-7cf20f61bca5.jpg?1783942551","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad80819-22d4-43a8-97b2-7cf20f61bca5.jpg?1783942551","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const serraAvatar = (): CardDef => ({"oracleId":"c363725f-15cf-4955-aaf1-536b1f8daaed","name":"Serra Avatar","manaCost":"{4}{W}{W}{W}","cmc":7,"typeLine":"Creature — Avatar","supertypes":[],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"Serra Avatar's power and toughness are each equal to your life total.\nWhen Serra Avatar is put into a graveyard from anywhere, shuffle it into its owner's library.","power":"*","toughness":"*","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/5041dcfd-c1af-448c-91f7-75fd1d34e93e.jpg?1783918508","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/5041dcfd-c1af-448c-91f7-75fd1d34e93e.jpg?1783918508","commanderLegal":"legal","set":"dmr","releasedAt":"2023-01-13","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const lhurgoyf = (): CardDef => ({"oracleId":"0fe76004-b2f4-4b11-abce-75fd76f68b4d","name":"Lhurgoyf","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Creature — Lhurgoyf","supertypes":[],"types":["Creature"],"subtypes":["Lhurgoyf"],"oracleText":"Lhurgoyf's power is equal to the number of creature cards in all graveyards and its toughness is equal to that number plus 1.","power":"*","toughness":"1+*","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/e/fee6d385-d44b-4f1a-beb1-13aeebde063e.jpg?1783947475","artUrl":"https://cards.scryfall.io/art_crop/front/f/e/fee6d385-d44b-4f1a-beb1-13aeebde063e.jpg?1783947475","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tinStreetGossip = (): CardDef => ({"oracleId":"19dc29a7-8ccc-4e54-829b-86cc102b082d","name":"Tin Street Gossip","manaCost":"{2}{R}{G}","cmc":4,"typeLine":"Creature — Lizard Advisor","supertypes":[],"types":["Creature"],"subtypes":["Lizard","Advisor"],"oracleText":"Vigilance\n{T}: Add {R}{G}. Spend this mana only to cast face-down spells or to turn creatures face up.","power":"4","toughness":"4","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Vigilance"],"producedMana":["G","R"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/4094b13f-28d4-48b6-8cce-3c44656745b7.jpg?1783912834","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/4094b13f-28d4-48b6-8cce-3c44656745b7.jpg?1783912834","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const qarsiDeceiver = (): CardDef => ({"oracleId":"e12681cc-c66e-4dac-882c-bd8638a2e12c","name":"Qarsi Deceiver","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Snake Wizard","supertypes":[],"types":["Creature"],"subtypes":["Snake","Wizard"],"oracleText":"{T}: Add {C}. Spend this mana only to cast a face-down creature spell, pay a mana cost to turn a manifested creature face up, or pay a morph cost. (A megamorph cost is a morph cost.)","power":"0","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/6/4/64d64264-895f-4d4d-8e5c-ab1d0d6e340b.jpg?1783938604","artUrl":"https://cards.scryfall.io/art_crop/front/6/4/64d64264-895f-4d4d-8e5c-ab1d0d6e340b.jpg?1783938604","commanderLegal":"legal","set":"dtk","releasedAt":"2015-03-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const quinjetTechnician = (): CardDef => ({"oracleId":"e8025c63-80b4-4cce-bf2d-df294450070d","name":"Quinjet Technician","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Human Artificer","supertypes":[],"types":["Creature"],"subtypes":["Human","Artificer"],"oracleText":"{T}: Add {R}.\n{T}: Add {R}{R}. Spend this mana only to activate power-up abilities.","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/a/6/a65b9024-fcca-497d-afb9-5ce9466d796f.jpg?1783903046","artUrl":"https://cards.scryfall.io/art_crop/front/a/6/a65b9024-fcca-497d-afb9-5ce9466d796f.jpg?1783903046","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const adarkarUnicorn = (): CardDef => ({"oracleId":"287cd5e8-51e2-42a4-a139-c112ff89706d","name":"Adarkar Unicorn","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Creature — Unicorn","supertypes":[],"types":["Creature"],"subtypes":["Unicorn"],"oracleText":"{T}: Add {U} or {C}{U}. Spend this mana only to pay cumulative upkeep costs.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["U","W"],"keywords":[],"producedMana":["C","U"],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0ba7526f-dba8-4483-b925-946164fc0ae9.jpg?1783947531","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0ba7526f-dba8-4483-b925-946164fc0ae9.jpg?1783947531","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const morphProp = card("Test Morpher", "Creature — Beast", "{4}{G}", { power: "4", toughness: "4", oracleText: "Morph {2}", keywords: ["Morph"] });
const megaProp = card("Test Megamorpher", "Creature — Beast", "{4}{G}", { power: "4", toughness: "4", oracleText: "Megamorph {1}", keywords: ["Megamorph"] });
const disguiseProp = card("Test Disguiser", "Creature — Beast", "{4}{G}", { power: "4", toughness: "4", oracleText: "Disguise {1}", keywords: ["Disguise"] });
const cheap = card("Test Cub", "Creature — Bear", "{1}", { power: "1", toughness: "1" });
const powerUpProp = card("Test Powerup", "Creature — Human Hero", "{1}{R}", { power: "2", toughness: "2", keywords: ["Power-up"], oracleText: "Power-up — {2}: Put a +1/+1 counter on this creature." });
const pumpProp = card("Test Pumper", "Creature — Human", "{1}{R}", { power: "2", toughness: "2", oracleText: "{2}: This creature gets +1/+1 until end of turn." });
const ageing = card("Test Ageing", "Enchantment", "{1}", { oracleText: "Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)" });
const blueBolt = card("Test Splash", "Instant", "{U}", { oracleText: "Draw a card.", colors: ["U"] });
/** Removes `pid`'s lands: what's left to pay with is what a test puts there. */
const noLands = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
};
/** Puts `def` onto the battlefield face down this way (a manifested or cloaked card, a face-down morph). */
const faceDownOn = (s: GameState, pid: PlayerId, def: CardDef, how: "morph" | "megamorph" | "disguise" | "manifest" | "cloak") => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.faceDown = how;
  invalidateCharacteristics(s);
  return id;
};
const bortukBonerattle = (): CardDef => ({"oracleId":"d965e8c2-34b1-42eb-9647-59951d9fc06b","name":"Bortuk Bonerattle","manaCost":"{4}{B}{G}","cmc":6,"typeLine":"Legendary Creature — Troll Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Troll","Shaman"],"oracleText":"Domain — When Bortuk Bonerattle enters, if you cast it, choose target creature card in your graveyard. Return that card to the battlefield if its mana value is less than or equal to the number of basic land types among lands you control. Otherwise, put it into your hand.","power":"4","toughness":"4","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Domain"],"imageUrl":"https://cards.scryfall.io/normal/front/6/f/6f342de7-f179-4894-96e4-56339d32f801.jpg?1783921239","artUrl":"https://cards.scryfall.io/art_crop/front/6/f/6f342de7-f179-4894-96e4-56339d32f801.jpg?1783921239","commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const circleOfConfinement = (): CardDef => ({"oracleId":"d1cd7a93-4b83-4755-90bc-17cb64bfb131","name":"Circle of Confinement","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, exile target creature an opponent controls with mana value 3 or less until this enchantment leaves the battlefield.\nWhenever an opponent casts a Vampire spell with the same name as a card exiled with this enchantment, you gain 2 life.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/3/f346860f-a70a-4bc6-b7a2-9a2c74d9c4d8.jpg?1783924315","artUrl":"https://cards.scryfall.io/art_crop/front/f/3/f346860f-a70a-4bc6-b7a2-9a2c74d9c4d8.jpg?1783924315","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const blueLoyalRaptor = (): CardDef => ({"oracleId":"4f13ed2e-7790-499f-87bf-07480b567811","name":"Blue, Loyal Raptor","manaCost":"{2}{G}{U}","cmc":4,"typeLine":"Legendary Creature — Dinosaur","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dinosaur"],"oracleText":"Partner with Owen Grady, Raptor Trainer (When this creature enters, target player may put Owen into their hand from their library, then shuffle.)\nFor each kind of counter on Blue, Loyal Raptor, each other Dinosaur you control enters with a counter of that kind on it.","power":"5","toughness":"4","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Partner with","Partner"],"imageUrl":"https://cards.scryfall.io/normal/front/0/a/0a764ec9-6a30-4df3-91b4-c64fd8e32fa0.jpg?1783913638","artUrl":"https://cards.scryfall.io/art_crop/front/0/a/0a764ec9-6a30-4df3-91b4-c64fd8e32fa0.jpg?1783913638","commanderLegal":"legal","set":"rex","releasedAt":"2023-11-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const spikeshellHarrier = (): CardDef => ({"oracleId":"23102d8a-3a93-4e83-af5b-401c85ba9dbc","name":"Spikeshell Harrier","manaCost":"{4}{U}","cmc":5,"typeLine":"Artifact Creature — Robot Turtle","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Robot","Turtle"],"oracleText":"When this creature enters, return target creature or Vehicle an opponent controls to its owner's hand. If that opponent's speed is greater than each other player's speed, reduce that opponent's speed by 1. This effect can't reduce their speed below 1.","power":"4","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/f/8f1ece22-ca32-45bb-b5f4-480f9b366cb5.jpg?1783907901","artUrl":"https://cards.scryfall.io/art_crop/front/8/f/8f1ece22-ca32-45bb-b5f4-480f9b366cb5.jpg?1783907901","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ogre = card("Test Ogre", "Creature — Ogre", "{3}{R}", { power: "4", toughness: "3", colors: ["R"] });
const giant = card("Test Giant", "Creature — Giant", "{5}{G}", { power: "6", toughness: "6", colors: ["G"] });
const vampire = card("Test Vampire", "Creature — Vampire", "{2}{B}", { power: "2", toughness: "2", keywords: ["Flash"], oracleText: "Flash", colors: ["B"] });
const otherVampire = card("Test Nosferatu", "Creature — Vampire", "{2}{B}", { power: "2", toughness: "2", keywords: ["Flash"], oracleText: "Flash", colors: ["B"] });
const dino = card("Test Raptor", "Creature — Dinosaur", "{1}{G}", { power: "2", toughness: "2", colors: ["G"] });
const skophosMazeWarden = (): CardDef => ({"oracleId":"7d9b7fca-9514-4aea-be51-b6c8debb3de4","name":"Skophos Maze-Warden","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Minotaur Warrior","supertypes":[],"types":["Creature"],"subtypes":["Minotaur","Warrior"],"oracleText":"{1}: This creature gets +1/-1 until end of turn.\nWhenever another creature becomes the target of an ability of a land you control named Labyrinth of Skophos, you may have this creature fight that creature. (Each deals damage equal to its power to the other.)","power":"3","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Fight"],"imageUrl":"https://cards.scryfall.io/normal/front/0/f/0f470a7b-63ef-4efa-855e-f8a3ce1ab534.jpg?1783931546","artUrl":"https://cards.scryfall.io/art_crop/front/0/f/0f470a7b-63ef-4efa-855e-f8a3ce1ab534.jpg?1783931546","commanderLegal":"legal","set":"thb","releasedAt":"2020-01-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const labyrinthOfSkophos = (): CardDef => ({"oracleId":"9ec5a487-d8ed-459a-8f58-56f6e9a2dfe8","name":"Labyrinth of Skophos","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{4}, {T}: Remove target attacking or blocking creature from combat.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/f/f/ff0dd221-2660-43f6-8e28-8000e3fe72a4.jpg?1783931509","artUrl":"https://cards.scryfall.io/art_crop/front/f/f/ff0dd221-2660-43f6-8e28-8000e3fe72a4.jpg?1783931509","commanderLegal":"legal","set":"thb","releasedAt":"2020-01-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const testZap = card("Test Zap", "Instant", "{R}", { oracleText: "Target creature gets +1/+0 until end of turn.", colors: ["R"] });
const brillianceUnleashed = (): CardDef => ({"oracleId":"b047cd3f-9129-41cc-8b91-b0dc970f5068","name":"Brilliance Unleashed","manaCost":"{4}{U}{R}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose one or both —\n• Brilliance Unleashed deals 5 damage to target creature.\n• Choose target artifact card in your graveyard. Return it to the battlefield if it's an artifact creature card. Otherwise, return it to the battlefield and it's a 3/3 Robot artifact creature with flying.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/7/b7ab2110-5aad-46c9-8dc4-1eac24b6f46b.jpg?1783904079","artUrl":"https://cards.scryfall.io/art_crop/front/b/7/b7ab2110-5aad-46c9-8dc4-1eac24b6f46b.jpg?1783904079","commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const relic = card("Test Relic", "Artifact Land", "", { oracleText: "{T}: Add {C}." });
const golem = card("Test Golem", "Artifact Creature — Golem", "{4}", { power: "4", toughness: "4" });
const raise = card("Test Raise", "Sorcery", "{B}", { oracleText: "Return target creature card with power 2 or less from your graveyard to your hand.", colors: ["B"] });

describe("Lane B round 97", () => {
  it("a */* creature card in hand has the power its characteristic-defining ability gives it (CR 604.3)", () => {
    const { s, ap } = setup([bear()]);
    const avatar = into(s, ap, serraAvatar(), "hand");
    s.players[ap]!.life = 37;
    invalidateCharacteristics(s);
    expect(power(s, s.objects[avatar]!)).toBe(37);
    expect(toughness(s, s.objects[avatar]!)).toBe(37);
    // Sacellum Godspeaker reveals it: Serra Avatar's power is 5 or greater in your hand too.
    const gs = putOnBattlefield(s, ap, godspeaker());
    expect(manaOptions(s, s.objects[gs]!).map((x) => x.adds.length)).toEqual([0, 1]);
    // At 4 life it isn't.
    s.players[ap]!.life = 4;
    invalidateCharacteristics(s);
    expect(manaOptions(s, s.objects[gs]!).map((x) => x.adds.length)).toEqual([0]);
  });

  it("a Lhurgoyf in a graveyard counts itself, and a power filter there reads that (CR 604.3)", () => {
    let { s, ap, ids, opp } = setup([raise]);
    s.players[ap]!.manaPool.B = 1;
    const goyf = into(s, ap, lhurgoyf(), "graveyard");
    expect(power(s, s.objects[goyf]!)).toBe(1);
    expect(toughness(s, s.objects[goyf]!)).toBe(2);
    expect(planCast(s, ap, ids[0]!, [tgt(goyf)], undefined, "auto")).not.toBeNull();
    into(s, opp, bear(), "graveyard");
    into(s, opp, bear(), "graveyard");
    expect(characteristics(s, s.objects[goyf]!).power).toBe(3);
    expect(planCast(s, ap, ids[0]!, [tgt(goyf)], undefined, "auto")).toBeNull();
  });

  it("compiles the round's spend-restricted mana abilities", () => {
    supported(tinStreetGossip(), qarsiDeceiver(), quinjetTechnician(), adarkarUnicorn());
  });

  it("Tin Street Gossip: its mana casts face-down spells and turns creatures face up any way, nothing else", () => {
    const { s, ap, ids } = setup([morphProp, bear(), cheap]);
    noLands(s, ap);
    putOnBattlefield(s, ap, tinStreetGossip());
    putOnBattlefield(s, ap, card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." }));
    // A face-down spell costs {3} (CR 702.37c): {R}{G} from it and {C} from the land.
    expect(planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true })).not.toBeNull();
    noLands(s, ap);
    // Not a face-up creature spell, even one it could pay for ({1}{G}, {1}).
    expect(planCast(s, ap, ids[1]!, undefined, undefined, "auto")).toBeNull();
    expect(planCast(s, ap, ids[2]!, undefined, undefined, "auto")).toBeNull();
    // Turning face up: a morph cost, a megamorph cost, a disguise cost, a manifested or a cloaked creature's mana cost.
    for (const [d, how] of [[morphProp, "morph"], [megaProp, "megamorph"], [disguiseProp, "disguise"], [cheap, "manifest"], [cheap, "cloak"]] as const) {
      const fd = faceDownOn(s, ap, d, how);
      const plan = planTurnFaceUp(s, ap, fd);
      expect(plan, how).not.toBeNull();
      expect(plan!.some((a) => a.type === "activateMana" && s.objects[a.objectId]!.cardId === s.objects[s.battlefield.find((x) => defOf(s, s.objects[x]!).name === "Tin Street Gossip")!]!.cardId), how).toBe(true);
    }
    // Its mana in the pool turns a morph face up.
    const g = s.battlefield.find((x) => defOf(s, s.objects[x]!).name === "Tin Street Gossip")!;
    const opt = manaOptions(s, s.objects[g]!)[0]!;
    const s2 = act(s, { type: "activateMana", player: ap, objectId: g, mana: opt.mana, ability: opt.ability, ...(opt.combo !== undefined ? { combo: opt.combo } : {}) });
    const fd2 = faceDownOn(s2, ap, morphProp, "morph");
    expect(turnFaceUpProblem(s2, ap, fd2)).toBeNull();
    const s3 = act(s2, { type: "turnFaceUp", player: ap, objectId: fd2 });
    expect(s3.objects[fd2]!.faceDown).toBeUndefined();
  });

  it("Qarsi Deceiver: a face-down creature spell, a manifested creature's mana cost or a morph cost; not a disguise cost or a cloaked one", () => {
    const { s, ap, ids } = setup([morphProp, cheap]);
    noLands(s, ap);
    putOnBattlefield(s, ap, qarsiDeceiver());
    putOnBattlefield(s, ap, card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." }));
    putOnBattlefield(s, ap, card("Test Barren", "Land", "", { oracleText: "{T}: Add {C}." }));
    expect(planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true })).not.toBeNull();
    noLands(s, ap);
    // {1} for a face-up creature spell: not with its mana.
    expect(planCast(s, ap, ids[1]!, undefined, undefined, "auto")).toBeNull();
    expect(planTurnFaceUp(s, ap, faceDownOn(s, ap, megaProp, "megamorph"))).not.toBeNull();
    expect(planTurnFaceUp(s, ap, faceDownOn(s, ap, cheap, "manifest"))).not.toBeNull();
    expect(planTurnFaceUp(s, ap, faceDownOn(s, ap, disguiseProp, "disguise"))).toBeNull();
    expect(planTurnFaceUp(s, ap, faceDownOn(s, ap, cheap, "cloak"))).toBeNull();
  });

  it("Quinjet Technician: {R}{R} only for power-up abilities", () => {
    const { s, ap } = setup([]);
    noLands(s, ap);
    putOnBattlefield(s, ap, quinjetTechnician());
    const pu = putOnBattlefield(s, ap, powerUpProp);
    const pump = putOnBattlefield(s, ap, pumpProp);
    const plan = planActivate(s, ap, pu, 0, []);
    expect(plan).not.toBeNull();
    expect(planActivate(s, ap, pump, 0, [])).toBeNull();
    const s2 = settle(run(s, plan));
    expect(s2.objects[pu]!.counters["+1/+1"]).toBe(1);
  });

  it("Adarkar Unicorn: {U} or {C}{U} only for cumulative upkeep costs; a bot keeps its enchantment with it", () => {
    let { s, opp } = setup([]);
    const uni = putOnBattlefield(s, opp, adarkarUnicorn());
    const ench = putOnBattlefield(s, opp, ageing);
    s.objects[ench]!.counters.age = 1;
    s.players[opp]!.hand = [];
    // Not for a spell.
    const splash = putOnBattlefield(s, opp, blueBolt);
    s.battlefield.splice(s.battlefield.indexOf(splash), 1);
    s.objects[splash]!.zone = "hand";
    s.players[opp]!.hand.push(splash);
    invalidateCharacteristics(s);
    expect(manaOptions(s, s.objects[uni]!).map((o) => o.adds.join(""))).toEqual(expect.arrayContaining(["U", "CU"]));
    s = passUntil(s, "upkeep", opp);
    expect(planCast(s, opp, splash, undefined, undefined, "auto")).toBeNull();
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseMay");
    expect((s.pending as { upkeepOf?: string }).upkeepOf).toBe(ench);
    // Two age counters: {2}, paid with {C}{U}.
    s = settle(s);
    expect(s.objects[ench]!.zone).toBe("battlefield");
    expect(s.objects[ench]!.counters.age).toBe(2);
    expect(s.objects[uni]!.tapped).toBe(true);
  });

  it("compiles the round's other cards", () => {
    supported(bortukBonerattle(), circleOfConfinement(), blueLoyalRaptor(), spikeshellHarrier());
  });

  it("Bortuk Bonerattle: cast, the creature card returns if its mana value is at most your domain count, else to your hand", () => {
    for (const [d, dest] of [[ogre, "battlefield"], [giant, "hand"]] as const) {
      let { s, ap, ids } = setup([bortukBonerattle()]);
      const c = into(s, ap, d, "graveyard");
      s = castNow(s, ap, ids[0]!);
      s = settle(s, { me: [ap] });
      expect(s.pending?.kind).toBe("chooseTargets");
      s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(c)] } as Action);
      s = settle(s);
      // Five basic land types among lands you control: mana value 4 comes back, 6 goes to your hand.
      expect(s.objects[c]!.zone, d.name).toBe(dest);
    }
    // Not cast: no trigger.
    const { s, ap } = setup([]);
    into(s, ap, ogre, "graveyard");
    const before = s.stack.length + s.triggerQueue.length;
    putOnBattlefield(s, ap, bortukBonerattle());
    expect(s.stack.length + s.triggerQueue.length).toBe(before);
  });

  it("Circle of Confinement: exiles until it leaves; an opponent's Vampire spell with that card's name gains you 2 life", () => {
    let { s, ap, ids, opp } = setup([circleOfConfinement()]);
    const v = putOnBattlefield(s, opp, vampire);
    s = castNow(s, ap, ids[0]!);
    s = settle(s, { me: [ap] });
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(v)] } as Action);
    s = settle(s);
    expect(s.objects[v]!.zone).toBe("exile");
    let life = s.players[ap]!.life;
    // The opponent casts a Vampire with that name (it has flash): you gain 2; one with another name: nothing.
    for (const [d, gain] of [[vampire, 2], [otherVampire, 0]] as const) {
      const id = into(s, opp, d, "hand");
      s.players[opp]!.manaPool.B = 3;
      s = act(s, { type: "passPriority", player: ap });
      s = run(s, planCast(s, opp, id, [], undefined, "auto"));
      s = settle(s);
      life += gain;
      expect(s.players[ap]!.life, d.name).toBe(life);
    }
  });

  it("Blue, Loyal Raptor: each other Dinosaur you control enters with a counter of each kind on it", () => {
    let { s, ap, ids } = setup([dino, bear(), dino]);
    const blue = putOnBattlefield(s, ap, blueLoyalRaptor());
    s = castNow(s, ap, ids[2]!);
    s = settle(s);
    // No counters on it yet: none.
    expect(Object.values(s.objects[ids[2]!]!.counters).filter((n) => (n ?? 0) > 0)).toEqual([]);
    s.objects[blue]!.counters = { "+1/+1": 2, flying: 1, "-1/-1": 0 };
    invalidateCharacteristics(s);
    s = castNow(s, ap, ids[0]!);
    s = settle(s);
    expect(s.objects[ids[0]!]!.counters).toMatchObject({ "+1/+1": 1, flying: 1 });
    expect(s.objects[ids[0]!]!.counters["-1/-1"] ?? 0).toBe(0);
    expect(characteristics(s, s.objects[ids[0]!]!).keywords).toContain("Flying");
    // Not a Dinosaur: none.
    s = castNow(s, ap, ids[1]!);
    s = settle(s);
    expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Spikeshell Harrier: returns the creature; that opponent's speed drops by 1 only if it's greater than everyone else's, never below 1", () => {
    for (const [mine, theirs, after] of [[1, 3, 2], [2, 2, 2], [0, 1, 1]] as const) {
      let { s, ap, ids, opp } = setup([spikeshellHarrier()]);
      const b = putOnBattlefield(s, opp, bear());
      s.players[ap]!.speed = mine;
      s.players[opp]!.speed = theirs;
      s = castNow(s, ap, ids[0]!);
      s = settle(s, { me: [ap] });
      s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] } as Action);
      s = settle(s);
      expect(s.objects[b]!.zone).toBe("hand");
      expect(s.players[opp]!.speed, `${mine} vs ${theirs}`).toBe(after);
    }
  });

  it("Skophos Maze-Warden: may fight another creature an ability of your Labyrinth of Skophos targets, not one a spell targets", () => {
    let { s, ap, ids, opp } = setup([testZap]);
    supported(skophosMazeWarden());
    const warden = putOnBattlefield(s, ap, skophosMazeWarden());
    const maze = putOnBattlefield(s, ap, labyrinthOfSkophos());
    const a = putOnBattlefield(s, ap, bear());
    const b = putOnBattlefield(s, ap, bear({ name: "Test Cub Two" }));
    s = attackWith(s, [a, b], opp);
    // A spell targeting one: nothing.
    s = castNow(s, ap, ids[0]!, [tgt(b)]);
    s = settle(s, { me: [ap] });
    expect(s.pending).toBeNull();
    expect(s.objects[warden]!.damage ?? 0).toBe(0);
    // The Labyrinth's ability: Maze-Warden may fight it, before that ability resolves.
    s = run(s, planActivate(s, ap, maze, 0, [tgt(a)]));
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s);
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[warden]!.damage).toBe(2);
  });

  it("Brilliance Unleashed: an artifact creature card comes back as it is; another artifact card as a 3/3 Robot artifact creature with flying, keeping its types", () => {
    supported(brillianceUnleashed());
    for (const [d, pt, types] of [[golem, "4/4", ["Artifact", "Creature"]], [relic, "3/3", ["Artifact", "Land", "Creature"]]] as const) {
      let { s, ap, ids } = setup([brillianceUnleashed()]);
      const c = into(s, ap, d, "graveyard");
      s = run(s, planCast(s, ap, ids[0]!, [tgt(c)], [1], "auto"));
      s = settle(s);
      const o = s.objects[c]!;
      expect(o.zone, d.name).toBe("battlefield");
      expect(`${power(s, o)}/${toughness(s, o)}`, d.name).toBe(pt);
      expect([...characteristics(s, o).types].sort(), d.name).toEqual([...types].sort());
      const robot = d === relic;
      expect(characteristics(s, o).subtypes.includes("Robot"), d.name).toBe(robot);
      expect(characteristics(s, o).keywords.includes("Flying"), d.name).toBe(robot);
    }
  });
});
