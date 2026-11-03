// Lane B, round 92: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): one-line
// templates. Lands tapped for mana producing another type (Infernal Darkness, Contamination, Ritual of Subdual, Pale Moon,
// Deep Water, Quarum Trench Gnomes); Virtual Assistant (spells cast using teamwork); Mist of Stagnation; Omen of Fire;
// Memory Theft; Temporal Firestorm; Sheltered Valley; Ms. Marvel, Elastic Ally; No Quarter.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, tapPermanent, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PendingDecision, type PlayerId, type TargetChoice } from "../src";
import { landCouldProduce } from "../src/manaabilities";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { may?: boolean; me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay" && !opts.me?.includes(p.player)) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes priority until a question of this kind comes up. */
const toPending = (s: GameState, kind: PendingDecision["kind"]) => {
  for (let i = 0; i < 100; i++) {
    if (s.pending?.kind === kind) return s;
    if (s.pending) throw new Error(`asked ${s.pending.kind} first`);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never asked ${kind}`);
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}, x?: number) => run(s, planCast(s, pid, id, targets, undefined, "auto", x, choices));
/** Moves a new card for `def` into `pid`'s hand, library (on top), graveyard or exile. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Empties `pid`'s hand (into exile), then gives them `defs`. */
const handOf = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  for (const id of [...s.players[pid]!.hand]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
  return defs.map((d) => toZone(s, pid, d, "hand"));
};
/** `pid`'s land with this name. */
const landOf = (s: GameState, pid: PlayerId, name: string) => s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === name && controllerOf(s, s.objects[id]!) === pid)!;
const pool = (s: GameState, pid: PlayerId) => Object.fromEntries(Object.entries(s.players[pid]!.manaPool).filter(([k, v]) => typeof v === "number" && v > 0 && k.length === 1));
const emptyPool = (s: GameState, pid: PlayerId) => {
  for (const k of ["W", "U", "B", "R", "G", "C"] as const) s.players[pid]!.manaPool[k] = 0;
};
const opp = (s: GameState, ap: PlayerId) => s.turnOrder.find((p) => p !== ap)!;

const darkness = (): CardDef => ({"oracleId":"dd821fca-79a0-48a9-b1cf-5a496bc04f65","name":"Infernal Darkness","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Cumulative upkeep—Pay {B} and 1 life. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nIf a land is tapped for mana, it produces {B} instead of any other type.","colors":["B"],"colorIdentity":["B"],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/f/3/f3475eb3-909d-450b-9597-b241b259b425.jpg?1783947501","artUrl":"https://cards.scryfall.io/art_crop/front/f/3/f3475eb3-909d-450b-9597-b241b259b425.jpg?1783947501","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const contamination = (): CardDef => ({"oracleId":"4013b4c2-c9ed-4d14-90f0-97214ec1fded","name":"Contamination","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, sacrifice this enchantment unless you sacrifice a creature.\nIf a land is tapped for mana, it produces {B} instead of any other type and amount.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/6/86067dfe-65c3-4c96-bccd-b3915d6663f9.jpg?1783946347","artUrl":"https://cards.scryfall.io/art_crop/front/8/6/86067dfe-65c3-4c96-bccd-b3915d6663f9.jpg?1783946347","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const subdual = (): CardDef => ({"oracleId":"e0587218-206e-41ed-af3c-f06b7a668e90","name":"Ritual of Subdual","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Cumulative upkeep {2} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nIf a land is tapped for mana, it produces colorless mana instead of any other type.","colors":["G"],"colorIdentity":["G"],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5c5c01e7-8116-45fc-afc3-d52a31a635cb.jpg?1783947472","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5c5c01e7-8116-45fc-afc3-d52a31a635cb.jpg?1783947472","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const paleMoon = (): CardDef => ({"oracleId":"78e3a3c3-3091-46ab-a47a-86b7db68ced4","name":"Pale Moon","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Until end of turn, if a player taps a nonbasic land for mana, it produces colorless mana instead of any other type.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/aeb282bb-d0b8-4822-8197-ff0523549309.jpg?1783945834","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/aeb282bb-d0b8-4822-8197-ff0523549309.jpg?1783945834","commanderLegal":"legal","set":"nem","releasedAt":"2000-02-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const deepWater = (): CardDef => ({"oracleId":"cf9ef041-5396-4f18-8233-42d667db0888","name":"Deep Water","manaCost":"{U}{U}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{U}: Until end of turn, if you tap a land you control for mana, it produces {U} instead of any other type.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/d/9dd6a230-6bc0-499c-b7fd-4aaa2569f98f.jpg?1783947945","artUrl":"https://cards.scryfall.io/art_crop/front/9/d/9dd6a230-6bc0-499c-b7fd-4aaa2569f98f.jpg?1783947945","commanderLegal":"legal","set":"drk","releasedAt":"1994-08-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const gnomes = (): CardDef => ({"oracleId":"ce5e52c9-4cb1-42aa-8403-bcd143d68704","name":"Quarum Trench Gnomes","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Gnome","supertypes":[],"types":["Creature"],"subtypes":["Gnome"],"oracleText":"{T}: If target Plains is tapped for mana, it produces colorless mana instead of white mana. (This effect lasts indefinitely.)","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/c/1c3b33bf-3074-406e-86f3-2a9843cf4862.jpg?1783948053","artUrl":"https://cards.scryfall.io/art_crop/front/1/c/1c3b33bf-3074-406e-86f3-2a9843cf4862.jpg?1783948053","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const assistant = (): CardDef => ({"oracleId":"69db9cb8-9152-4d1b-9ac9-16aac42c0908","name":"Virtual Assistant","manaCost":"{1}{U}","cmc":2,"typeLine":"Artifact Creature — Illusion Advisor","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Illusion","Advisor"],"oracleText":"Defender\nWhenever you cast a spell using teamwork, create a 1/1 colorless Robot Hero artifact creature token with flying.","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/89d43d64-eb3b-4152-90f7-2fca851499c6.jpg?1783903067","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/89d43d64-eb3b-4152-90f7-2fca851499c6.jpg?1783903067","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mist = (): CardDef => ({"oracleId":"e78673c4-a969-443f-b1a4-0eb37b8111af","name":"Mist of Stagnation","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Permanents don't untap during their controllers' untap steps.\nAt the beginning of each player's upkeep, that player chooses a permanent for each card in their graveyard, then untaps those permanents.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/76d03121-9515-4101-9d60-e01225533f44.jpg?1783945127","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/76d03121-9515-4101-9d60-e01225533f44.jpg?1783945127","commanderLegal":"legal","set":"jud","releasedAt":"2002-05-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const omen = (): CardDef => ({"oracleId":"5935e9b3-b9b9-413c-ba17-103f5792131a","name":"Omen of Fire","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return all Islands to their owners' hands. Each player sacrifices a Plains or a white permanent of their choice for each white permanent they control.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/c/9c724b46-6e17-4bee-9bc6-e9fc5a379dd7.jpg?1783947176","artUrl":"https://cards.scryfall.io/art_crop/front/9/c/9c724b46-6e17-4bee-9bc6-e9fc5a379dd7.jpg?1783947176","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const theft = (): CardDef => ({"oracleId":"1d60e2a7-2059-48cb-a6ab-36ba25b80b3a","name":"Memory Theft","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target opponent reveals their hand. You choose a nonland card from it. That player discards that card. You may put a card that has an Adventure that player owns from exile into that player's graveyard.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/9/397fd49b-a520-4b0e-9ab9-71675ab5969d.jpg?1783932634","artUrl":"https://cards.scryfall.io/art_crop/front/3/9/397fd49b-a520-4b0e-9ab9-71675ab5969d.jpg?1783932634","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const firestorm = (): CardDef => ({"oracleId":"a0f25ffa-0e53-4e38-8001-d595fd2c2045","name":"Temporal Firestorm","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Kicker {1}{W} and/or {1}{U} (You may pay an additional {1}{W} and/or {1}{U} as you cast this spell.)\nChoose up to X creatures and/or planeswalkers you control, where X is the number of times this spell was kicked. Those permanents phase out.\nTemporal Firestorm deals 5 damage to each creature and each planeswalker.","colors":["R"],"colorIdentity":["R","U","W"],"keywords":["Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/9/d/9d690340-75f1-4733-bde5-2d60fd02f060.jpg?1783921309","artUrl":"https://cards.scryfall.io/art_crop/front/9/d/9d690340-75f1-4733-bde5-2d60fd02f060.jpg?1783921309","commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const valley = (): CardDef => ({"oracleId":"cd535fa3-6fd8-4227-97fd-3ef07cb0598d","name":"Sheltered Valley","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"If this land would enter, instead sacrifice each other permanent named Sheltered Valley you control, then put this land onto the battlefield.\nAt the beginning of your upkeep, if you control three or fewer lands, you gain 1 life.\n{T}: Add {C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/0/4/049d7a08-1605-4ce2-b8c5-634ce2a261e0.jpg?1783947157","artUrl":"https://cards.scryfall.io/art_crop/front/0/4/049d7a08-1605-4ce2-b8c5-634ce2a261e0.jpg?1783947157","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const marvel = (): CardDef => ({"oracleId":"26a1b36c-3c27-4eb4-b85f-63459653b773","name":"Ms. Marvel, Elastic Ally","manaCost":"{2}{G/W}","cmc":3,"typeLine":"Legendary Creature — Mutant Inhuman Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Mutant","Inhuman","Hero"],"oracleText":"Reach\nWhen Ms. Marvel enters, target creature gets +2/+0 until end of turn.\nWhenever a creature you control with power greater than its base power deals combat damage to a player, draw a card. This ability triggers only once each turn.","power":"2","toughness":"2","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Reach"],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bf9ce355-f472-4f0f-8d8e-96df363e1b02.jpg?1783903031","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bf9ce355-f472-4f0f-8d8e-96df363e1b02.jpg?1783903031","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const noQuarter = (): CardDef => ({"oracleId":"d238a5c1-f992-4f89-851a-de75b59f6793","name":"No Quarter","manaCost":"{3}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a creature becomes blocked by a creature with lesser power, destroy the blocking creature.\nWhenever a creature blocks a creature with lesser power, destroy the attacking creature.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/c/7c317ee7-ed92-4e3e-92bb-502099caccf8.jpg?1783946626","artUrl":"https://cards.scryfall.io/art_crop/front/7/c/7c317ee7-ed92-4e3e-92bb-502099caccf8.jpg?1783946626","commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const reflection = (): CardDef => ({"oracleId":"a3a8a044-283d-443e-bc40-c2f826d70c22","name":"Mana Reflection","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If you tap a permanent for mana, it produces twice as much of that mana instead.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81e0d739-990f-4ba5-b456-165c033014cf.jpg?1783930143","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81e0d739-990f-4ba5-b456-165c033014cf.jpg?1783930143","commanderLegal":"legal","set":"2xm","releasedAt":"2020-08-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const beastMode = (): CardDef => ({"oracleId":"a465f8a9-d5aa-4dfa-b674-7aa1798cb0bd","name":"Beast Mode","manaCost":"{1}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Teamwork 1 (As an additional cost to cast this spell, you may tap any number of creatures you control with total power 1 or more.)\nTarget creature gets +2/+2 and gains trample until end of turn. Also put a +1/+1 counter on that creature if this spell was cast using teamwork.","colors":["G"],"colorIdentity":["G"],"keywords":["Teamwork"],"imageUrl":"https://cards.scryfall.io/normal/front/3/9/39191f85-7698-487e-afad-07648a7cb695.jpg?1783903042","artUrl":"https://cards.scryfall.io/art_crop/front/3/9/39191f85-7698-487e-afad-07648a7cb695.jpg?1783903042","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"d6d72f5f-8f5d-4180-b514-f22ff5482902","name":"Bonecrusher Giant // Stomp","manaCost":"{2}{R} // {1}{R}","cmc":3,"typeLine":"Creature — Giant // Instant — Adventure","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09fd2d9c-1793-4beb-a3fb-7a869f660cd4.jpg?1783932628","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"rare","layout":"adventure","gameChanger":false,"faces":[{"name":"Bonecrusher Giant","manaCost":"{2}{R}","typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"]},{"name":"Stomp","manaCost":"{1}{R}","typeLine":"Instant — Adventure","supertypes":[],"types":["Instant"],"subtypes":["Adventure"],"oracleText":"Damage can't be prevented this turn. Stomp deals 2 damage to any target.","colors":["R"]}]}) as CardDef;

const solLand = card("Test Sol Land", "Land", "", { oracleText: "{T}: Add {C}{C}." });
const elf = card("Test Mana Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const tundra = card("Test Tundra", "Land — Plains Island");
const knight = (n = "Test White Knight") => card(n, "Creature — Knight", "{1}{W}", { power: "2", toughness: "2" });
const giantCard = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const goblin = card("Test Goblin", "Creature — Goblin", "{R}", { power: "1", toughness: "1" });
const sorcery = card("Test Sorcery", "Sorcery", "{1}{B}", { cmc: 2, oracleText: "Draw a card." });

describe("round B92: lands tapped for mana produce another type", () => {
  it("are supported", () => supported(darkness(), contamination(), subdual(), paleMoon(), deepWater(), gnomes()));

  it("Infernal Darkness: any player's land makes {B}, as much as it would have", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, opp(s, ap), darkness());
    const sol = putOnBattlefield(s, ap, solLand);
    emptyPool(s, ap);
    s = act(s, { type: "activateMana", player: ap, objectId: landOf(s, ap, "Island"), mana: "U" });
    s = act(s, { type: "activateMana", player: ap, objectId: sol, mana: "C" });
    expect(pool(s, ap)).toEqual({ B: 3 });
    // What a land "could produce" counts the replacement (CR 106.7).
    expect(landCouldProduce(s, s.objects[landOf(s, ap, "Forest")]!)).toEqual(["B"]);
  });

  it("Infernal Darkness doesn't touch mana from a creature", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, darkness());
    const e = putOnBattlefield(s, ap, elf);
    emptyPool(s, ap);
    s = act(s, { type: "activateMana", player: ap, objectId: e, mana: "G" });
    expect(pool(s, ap)).toEqual({ G: 1 });
  });

  it("Contamination: one {B} whatever the land makes; with Mana Reflection, Contamination first, then doubled", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, contamination());
    const sol = putOnBattlefield(s, ap, solLand);
    emptyPool(s, ap);
    s = act(s, { type: "activateMana", player: ap, objectId: sol, mana: "C" });
    expect(pool(s, ap)).toEqual({ B: 1 });
    putOnBattlefield(s, ap, reflection());
    s = act(s, { type: "activateMana", player: ap, objectId: landOf(s, ap, "Mountain"), mana: "R" });
    // The player picks the order (CR 616.1): the one with the most mana.
    expect(pool(s, ap)).toEqual({ B: 3 });
  });

  it("Ritual of Subdual: lands make colorless mana; autopay uses it for generic costs only", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, subdual());
    emptyPool(s, ap);
    s = act(s, { type: "activateMana", player: ap, objectId: landOf(s, ap, "Plains"), mana: "W" });
    expect(pool(s, ap)).toEqual({ C: 1 });
    const [k] = handOf(s, ap, [knight()]);
    // {1}{W} can't be paid: every land makes {C} now.
    emptyPool(s, ap);
    expect(planCast(s, ap, k!)).toBeNull();
    const [g] = handOf(s, ap, [card("Test Golem", "Artifact Creature — Golem", "{2}", { power: "2", toughness: "2" })]);
    s = castNow(s, ap, g!);
    expect(s.stack.length).toBe(1);
  });

  it("Pale Moon: until end of turn, nonbasic lands make colorless mana; basic lands don't change", () => {
    let { s, ap } = setup([]);
    const [pm] = handOf(s, ap, [paleMoon()]);
    const t = putOnBattlefield(s, ap, tundra);
    s = settle(castNow(s, ap, pm!));
    expect(zone(s, pm!)).toBe("graveyard");
    emptyPool(s, ap);
    s = act(s, { type: "activateMana", player: ap, objectId: t, mana: "W" });
    s = act(s, { type: "activateMana", player: ap, objectId: landOf(s, ap, "Forest"), mana: "G" });
    expect(pool(s, ap)).toEqual({ C: 1, G: 1 });
    // Gone at the next turn.
    s = passUntil(s, "upkeep", opp(s, ap));
    expect(s.landManaRules).toBeUndefined();
  });

  it("Deep Water: until end of turn, lands you control make {U}; other players' lands don't", () => {
    let { s, ap } = setup([]);
    const dw = putOnBattlefield(s, ap, deepWater());
    const o = opp(s, ap);
    const theirs = putOnBattlefield(s, o, card("Forest", "Basic Land — Forest"));
    s = settle(run(s, planActivate(s, ap, dw, 0)));
    emptyPool(s, ap);
    s = act(s, { type: "activateMana", player: ap, objectId: landOf(s, ap, "Mountain"), mana: "R" });
    expect(pool(s, ap)).toEqual({ U: 1 });
    expect(landCouldProduce(s, s.objects[theirs]!)).toEqual(["G"]);
  });

  it("Quarum Trench Gnomes: the target Plains makes {C} instead of {W} from now on, and only its white mana changes", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, gnomes());
    const t = putOnBattlefield(s, ap, tundra);
    s = settle(run(s, planActivate(s, ap, g, 0, [tgt(t)])));
    expect(s.objects[t]!.manaReplaced).toEqual([{ from: "W", to: "C" }]);
    expect(landCouldProduce(s, s.objects[t]!)).toEqual(["U", "C"]);
    emptyPool(s, ap);
    s = act(s, { type: "activateMana", player: ap, objectId: t, mana: "W" });
    expect(pool(s, ap)).toEqual({ C: 1 });
    // A Plains only: not an Island.
    const p = planActivate(s, ap, g, 0, [tgt(landOf(s, ap, "Island"))]);
    expect(p).toBeNull();
  });
});

describe("round B92: Virtual Assistant", () => {
  it("is supported", () => supported(assistant(), beastMode()));

  it("a spell cast using teamwork makes a Robot Hero; one cast without it doesn't", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, assistant());
    const b = putOnBattlefield(s, ap, bear());
    const robots = (st: GameState) => st.battlefield.filter((id) => characteristics(st, st.objects[id]!).name === "Robot Hero Token").length;
    const [m1, m2] = handOf(s, ap, [beastMode(), beastMode()]);
    s = settle(castNow(s, ap, m1!, [tgt(b)]));
    expect(robots(s)).toBe(0);
    s = settle(castNow(s, ap, m2!, [tgt(b)], { teamwork: [b] }));
    expect(robots(s)).toBe(1);
  });
});

describe("round B92: Mist of Stagnation", () => {
  it("is supported", () => supported(mist()));

  it("at each player's upkeep, that player chooses a permanent for each card in their graveyard (anyone's) and untaps them", () => {
    let { s, ap } = setup([]);
    const o = opp(s, ap);
    putOnBattlefield(s, ap, mist());
    const mine = [putOnBattlefield(s, o, bear()), putOnBattlefield(s, o, bear()), putOnBattlefield(s, o, bear())];
    const yours = putOnBattlefield(s, ap, giantCard);
    for (const id of [...mine, yours]) tapPermanent(s, s.objects[id]!);
    s.players[o]!.graveyard = [];
    toZone(s, o, goblin, "graveyard");
    toZone(s, o, goblin, "graveyard");
    s = passUntil(s, "upkeep", o);
    // Nothing untapped in the untap step.
    expect(mine.every((id) => s.objects[id]!.tapped)).toBe(true);
    s = toPending(s, "pickPermanents");
    const p = s.pending as Extract<PendingDecision, { kind: "pickPermanents" }>;
    expect(p.player).toBe(o);
    expect(p.count).toBe(2);
    expect(p.options).toContain(yours);
    s = settle(act(s, { type: "pickPermanents", player: o, ids: [mine[0]!, yours] }));
    expect(s.objects[mine[0]!]!.tapped).toBe(false);
    expect(s.objects[yours]!.tapped).toBe(false);
    expect(s.objects[mine[1]!]!.tapped).toBe(true);
    expect(s.objects[mine[2]!]!.tapped).toBe(true);
  });
});

describe("round B92: Omen of Fire", () => {
  it("is supported", () => supported(omen()));

  it("returns all Islands; each player sacrifices a Plains or a white permanent for each white permanent they control", () => {
    let { s, ap } = setup([]);
    const [o1, o2] = s.turnOrder.filter((p) => p !== ap);
    const [om] = handOf(s, ap, [omen()]);
    const isl = putOnBattlefield(s, o1!, card("Island", "Basic Land — Island"));
    const k1 = putOnBattlefield(s, o1!, knight());
    const k2 = putOnBattlefield(s, o1!, knight("Test Other Knight"));
    const pl = putOnBattlefield(s, o1!, card("Plains", "Basic Land — Plains"));
    const b2 = putOnBattlefield(s, o2!, bear());
    const pl2 = putOnBattlefield(s, o2!, card("Plains", "Basic Land — Plains"));
    s.players[ap]!.manaPool.R = 5;
    s = settle(castNow(s, ap, om!));
    expect(zone(s, isl)).toBe("hand");
    // Two white permanents: two of the Knights and the Plains.
    expect([k1, k2, pl].filter((id) => zone(s, id) === "graveyard").length).toBe(2);
    // No white permanents: nothing to sacrifice.
    expect(zone(s, b2)).toBe("battlefield");
    expect(zone(s, pl2)).toBe("battlefield");
    // Ours: the Islands went back to hand; three Plains and no white permanents, so none of them goes.
    expect(s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === "Island" && controllerOf(s, s.objects[id]!) === ap)).toEqual([]);
    expect(s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === "Plains" && controllerOf(s, s.objects[id]!) === ap).length).toBe(3);
  });
});

describe("round B92: Memory Theft", () => {
  it("is supported", () => supported(theft(), giant()));

  it("then you may put a card with an Adventure that player owns from exile into their graveyard (face-up ones only)", () => {
    let { s, ap } = setup([]);
    const o = opp(s, ap);
    const [mt] = handOf(s, ap, [theft()]);
    handOf(s, o, [sorcery]);
    const adv = toZone(s, o, giant(), "exile");
    const plain = toZone(s, o, goblin, "exile");
    s = settle(castNow(s, ap, mt!, [player(o)]), { me: [ap] });
    // The discard first: their one nonland card.
    const discard = s.pending as Extract<PendingDecision, { kind: "searchLibrary" }>;
    expect(discard.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: discard.cards });
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    const p = s.pending as Extract<PendingDecision, { kind: "searchLibrary" }>;
    expect(p.kind).toBe("searchLibrary");
    expect(p.cards).toEqual([adv]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [adv] }));
    expect(zone(s, adv)).toBe("graveyard");
    expect(zone(s, plain)).toBe("exile");
  });

  it("with no such card in exile, nothing is asked", () => {
    let { s, ap } = setup([]);
    const o = opp(s, ap);
    const [mt] = handOf(s, ap, [theft()]);
    handOf(s, o, [sorcery]);
    toZone(s, o, goblin, "exile");
    s = settle(castNow(s, ap, mt!, [player(o)]));
    expect(zone(s, mt!)).toBe("graveyard");
  });
});

describe("round B92: Temporal Firestorm", () => {
  it("is supported", () => supported(firestorm()));

  it("kicked twice: up to two creatures and/or planeswalkers you control phase out, then 5 damage to each", () => {
    let { s, ap } = setup([]);
    const o = opp(s, ap);
    const [tf] = handOf(s, ap, [firestorm()]);
    const [b1, b2, b3] = [putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear())];
    const theirs = putOnBattlefield(s, o, bear());
    s.players[ap]!.manaPool.R = 2;
    s = settle(castNow(s, ap, tf!, [], { kicks: [0, 1] }), { me: [ap] });
    const p = s.pending as Extract<PendingDecision, { kind: "pickPermanents" }>;
    expect(p.kind).toBe("pickPermanents");
    expect(p.count).toBe(2);
    expect(p.options).not.toContain(theirs);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b1] }));
    expect(s.objects[b1]!.phased).toBeTruthy();
    expect(zone(s, b2)).toBe("graveyard");
    expect(zone(s, b3)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("not kicked: nothing to choose, and everything takes the damage", () => {
    let { s, ap } = setup([]);
    const [tf] = handOf(s, ap, [firestorm()]);
    const b = putOnBattlefield(s, ap, bear());
    s = settle(castNow(s, ap, tf!), { me: [ap] });
    expect(s.pending).toBeFalsy();
    expect(zone(s, b)).toBe("graveyard");
  });
});

describe("round B92: Sheltered Valley", () => {
  it("is supported", () => supported(valley()));

  it("entering, the other Sheltered Valleys you control are sacrificed first; with none, it just enters", () => {
    let { s, ap } = setup([]);
    const old = putOnBattlefield(s, ap, valley());
    const theirs = putOnBattlefield(s, opp(s, ap), valley());
    const [v] = handOf(s, ap, [valley()]);
    s = settle(act(s, { type: "playLand", player: ap, objectId: v! }));
    expect(zone(s, v!)).toBe("battlefield");
    expect(zone(s, old)).toBe("graveyard");
    // Only yours.
    expect(zone(s, theirs)).toBe("battlefield");
    // The bot doesn't play one while it has one.
    const [v2] = handOf(s, ap, [valley()]);
    expect(botActions(s, ap).some((a) => a.type === "playLand" && a.objectId === v2)).toBe(false);
  });
});

/** `ap` attacks `o` with `attackers`; then `blocks` (blocker, attacker) by `o`; returns at the first combat damage step. */
const fight = (s: GameState, ap: PlayerId, o: PlayerId, attackers: string[], blocks: { blocker: string; attacker: string }[] = []) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((a) => ({ attacker: a, defender: o })) });
  for (let i = 0; i < 50 && s.step !== "declareBlockers"; i++) s = s.pending ? settle(s) : act(s, { type: "passPriority", player: waitingOn(s)! });
  while (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: s.pending.player === o ? blocks : [] });
  return s;
};

describe("round B92: Ms. Marvel, Elastic Ally", () => {
  it("is supported", () => supported(marvel()));

  it("a creature you control with power greater than its base power deals combat damage to a player: draw, once each turn", () => {
    let { s, ap } = setup([]);
    const o = opp(s, ap);
    putOnBattlefield(s, ap, marvel());
    const [b1, b2, b3] = [putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear())];
    // Two of them pumped above their base power.
    for (const id of [b1, b2]) s.objects[id]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    s.players[ap]!.hand = [];
    s = fight(s, ap, o, [b1, b2, b3]);
    for (let i = 0; i < 100 && s.step !== "endCombat" && s.step !== "main2"; i++) s = s.pending || s.stack.length ? settle(s) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.hand.length).toBe(1);
  });

  it("only base power: no card", () => {
    let { s, ap } = setup([]);
    const o = opp(s, ap);
    putOnBattlefield(s, ap, marvel());
    const b = putOnBattlefield(s, ap, bear());
    s.players[ap]!.hand = [];
    s = fight(s, ap, o, [b]);
    for (let i = 0; i < 100 && s.step !== "endCombat" && s.step !== "main2"; i++) s = s.pending || s.stack.length ? settle(s) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[o]!.life).toBeLessThan(40);
    expect(s.players[ap]!.hand.length).toBe(0);
  });
});

describe("round B92: No Quarter", () => {
  it("is supported", () => supported(noQuarter()));

  it("blocked by a creature with lesser power, the blocker is destroyed; blocking one with greater power, the attacker is", () => {
    let { s, ap } = setup([]);
    const o = opp(s, ap);
    putOnBattlefield(s, o, noQuarter());
    const big = putOnBattlefield(s, ap, giantCard);
    const small = putOnBattlefield(s, ap, goblin);
    const even = putOnBattlefield(s, ap, bear());
    const [b1, b2, b3] = [putOnBattlefield(s, o, bear()), putOnBattlefield(s, o, bear()), putOnBattlefield(s, o, bear())];
    s = fight(s, ap, o, [big, small, even], [{ blocker: b1, attacker: big }, { blocker: b2, attacker: small }, { blocker: b3, attacker: even }]);
    s = settle(s);
    // The Bears blocking the Giant have lesser power: destroyed. The Goblin attacking into Bears has lesser power: destroyed.
    expect(zone(s, b1)).toBe("graveyard");
    expect(zone(s, small)).toBe("graveyard");
    // Equal powers: neither (before damage).
    expect(zone(s, even)).toBe("battlefield");
    expect(zone(s, b3)).toBe("battlefield");
    expect(s.step).toBe("declareBlockers");
  });
});

describe("round B92: the bots' choices", () => {
  it("Mist of Stagnation: a bot untaps its own tapped permanents, not an opponent's", () => {
    let { s, ap } = setup([]);
    const o = opp(s, ap);
    putOnBattlefield(s, ap, mist());
    const mine = putOnBattlefield(s, o, bear());
    const yours = putOnBattlefield(s, ap, giantCard);
    for (const id of [mine, yours]) tapPermanent(s, s.objects[id]!);
    s.players[o]!.graveyard = [];
    toZone(s, o, goblin, "graveyard");
    s = passUntil(s, "upkeep", o);
    s = toPending(s, "pickPermanents");
    expect(botActions(s, o)).toEqual([{ type: "pickPermanents", player: o, ids: [mine] }]);
  });

  it("Temporal Firestorm: a bot phases out its best creatures, as many as it may", () => {
    let { s, ap } = setup([]);
    const [tf] = handOf(s, ap, [firestorm()]);
    const small = putOnBattlefield(s, ap, goblin);
    const big = putOnBattlefield(s, ap, giantCard);
    putOnBattlefield(s, opp(s, ap), bear());
    s.players[ap]!.manaPool.W = 2;
    s = settle(castNow(s, ap, tf!, [], { kicks: [0] }), { me: [ap] });
    expect(s.pending?.kind).toBe("pickPermanents");
    expect(botActions(s, ap)).toEqual([{ type: "pickPermanents", player: ap, ids: [big] }]);
    expect(small).toBeTruthy();
  });
});
