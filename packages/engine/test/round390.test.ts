// Round 390: Glimpse of Tomorrow's "Shuffle all permanents you own into your library, then reveal that many cards ... Put
// all non-Aura permanent cards revealed this way onto the battlefield, then do the same for Aura cards, then put the rest on
// the bottom of your library in a random order." (CR 110.4a, 303.4f, 903.9b); Regenerations Restored's "Then if ~ has no
// time counters on it, exile it. When you do, take an extra turn after this one." before vanishing's sacrifice (CR 603.3b,
// 603.12, 500.7); and Verdant Mastery's three places for the lands it finds (CR 118.9, 701.23).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup, island, plainsCard, swamp, forest } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const glimpse = (): CardDef => ({"oracleId":"12778951-7b11-400b-98ed-06434d7ecc11","name":"Glimpse of Tomorrow","manaCost":"","cmc":0,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Suspend 3—{R}{R}\nShuffle all permanents you own into your library, then reveal that many cards from the top of your library. Put all non-Aura permanent cards revealed this way onto the battlefield, then do the same for Aura cards, then put the rest on the bottom of your library in a random order.","colors":["R"],"colorIdentity":["R"],"keywords":["Suspend"],"imageUrl":"https://cards.scryfall.io/normal/front/3/9/39d332ab-67bf-4db8-953a-6843efbb455c.jpg?1783926711","artUrl":"https://cards.scryfall.io/art_crop/front/3/9/39d332ab-67bf-4db8-953a-6843efbb455c.jpg?1783926711","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const regen = (): CardDef => ({"oracleId":"a1e691f3-a3e9-4cfa-a761-d7e020364dfa","name":"Regenerations Restored","manaCost":"{W}{U}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Vanishing 12 (This enchantment enters with twelve time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)\nWhenever one or more time counters are removed from this enchantment, scry 1 and you gain 1 life. Then if this enchantment has no time counters on it, exile it. When you do, take an extra turn after this one.","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Vanishing","Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/44d38ec3-5028-42ac-97c3-af2aa04314ae.jpg?1783914387","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/44d38ec3-5028-42ac-97c3-af2aa04314ae.jpg?1783914387","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const verdant = (): CardDef => ({"oracleId":"b392fabc-51f2-4ae4-b21c-1c662e4c6953","name":"Verdant Mastery","manaCost":"{5}{G}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You may pay {3}{G} rather than pay this spell's mana cost.\nSearch your library for up to four basic land cards and reveal them. Put one of them onto the battlefield tapped under an opponent's control if the {3}{G} cost was paid. Put two of them onto the battlefield tapped under your control and the rest into your hand. Then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/9/197455e5-7929-47b8-ad00-8d3918949eb7.jpg?1783927333","artUrl":"https://cards.scryfall.io/art_crop/front/1/9/197455e5-7929-47b8-ad00-8d3918949eb7.jpg?1783927333","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ajani = (): CardDef => ({"oracleId":"dfb5f660-fd8b-4b7b-934c-6a71cd182f15","name":"Ajani Goldmane","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Legendary Planeswalker — Ajani","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Ajani"],"oracleText":"+1: You gain 2 life.\n−1: Put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn.\n−6: Create a white Avatar creature token. It has \"This token's power and toughness are each equal to your life total.\"","loyalty":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a1470a6-d09d-4a2a-84a6-d56e32ed237a.jpg?1783942919","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a1470a6-d09d-4a2a-84a6-d56e32ed237a.jpg?1783942919","commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const timecrafting = (): CardDef => ({"oracleId":"57939644-6f9a-4653-920b-f2d28559a9ca","name":"Timecrafting","manaCost":"{X}{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Remove X time counters from target permanent or suspended card.\n• Put X time counters on target permanent with a time counter on it or suspended card.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd6da5ef-7e5b-4536-ad28-6fe66f3e0438.jpg?1783943146","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd6da5ef-7e5b-4536-ad28-6fe66f3e0438.jpg?1783943146","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const rancor = (): CardDef => ({"oracleId":"9d2d6479-531c-4ce1-b52b-00e36fa63b64","name":"Rancor","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/4073ecc9-5d3a-452f-b708-0572fa27a6f0.jpg?1783912355","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/4073ecc9-5d3a-452f-b708-0572fa27a6f0.jpg?1783912355","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const blade = (): CardDef => ({"oracleId":"ab0dd461-25bc-4374-bed8-72fc2d51b5e1","name":"Sanctuary Blade","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"As this Equipment becomes attached to a creature, choose a color.\nEquipped creature gets +2/+0 and has protection from the last chosen color.\nEquip {3}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/c/9/c9cf2480-10cd-4200-a47e-cc7f49182692.jpg?1783931208","artUrl":"https://cards.scryfall.io/art_crop/front/c/9/c9cf2480-10cd-4200-a47e-cc7f49182692.jpg?1783931208","commanderLegal":"legal","set":"c20","releasedAt":"2020-04-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const named = (s: GameState, name: string) => Object.values(s.objects).filter((o) => s.cards[o.cardId]?.name === name).map((o) => o.id);
/** Pass, and let bots answer every other choice, until the stack and trigger queue are empty; `answer` gives the test's own answer. */
function settle(s: GameState, answer?: (s: GameState) => Action | Action[] | undefined) {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    const mine = answer?.(s);
    if (mine) for (const a of Array.isArray(mine) ? mine : [mine]) s = act(s, a);
    else if (s.pending) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
}
/** Plays on (no attacks or blocks, other questions answered as bots) until `done`. */
function playUntil(s: GameState, done: (s: GameState) => boolean, answer?: (s: GameState) => Action | undefined, max = 3000) {
  for (let i = 0; i < max; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    const p = s.pending;
    const mine = answer?.(s);
    if (mine) s = act(s, mine);
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
    else if (p) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never done");
}
/** A card of `pid`'s moved to `zone` (library: on top). */
function put(s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "library" | "exile" | "graveyard") {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
}
/** Empties `pid`'s library (its cards removed from the game, for a library of known cards). */
function emptyLibrary(s: GameState, pid: PlayerId) {
  for (const id of s.players[pid]!.library) delete s.objects[id];
  s.players[pid]!.library = [];
}
const opponentsOf = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);

describe("round 390", () => {
  it("Glimpse of Tomorrow, Regenerations Restored, Verdant Mastery and Sanctuary Blade are fully supported", () => {
    for (const d of [glimpse(), regen(), verdant(), blade()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

/** Glimpse of Tomorrow suspended with one time counter; play on to `ap`'s next upkeep and cast it for free. */
function castGlimpseFromSuspend(s0: GameState, ap: PlayerId, answer?: (s: GameState) => Action | undefined) {
  const g = put(s0, ap, glimpse(), "exile");
  s0.objects[g]!.counters.time = 1;
  let s = playUntil(s0, (x) => x.pending?.kind === "castFree" && x.pending.player === ap);
  s = act(s, { type: "castSpell", player: ap, objectId: g, targets: [] });
  return settle(s, answer);
}

describe("round 390: Glimpse of Tomorrow", () => {
  it("every permanent you own goes, whoever controls it, tokens too; as many cards are revealed; the non-Aura permanent cards enter, then the Auras, the rest to the bottom", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    emptyLibrary(s0, ap);
    const pac = put(s0, ap, pacifism(), "library");
    const boltId = put(s0, ap, bolt(), "library");
    const aj = put(s0, ap, ajani(), "library");
    const bear = putOnBattlefield(s0, ap, bears());
    // A Hill Giant you own that an opponent controls.
    const g = putOnBattlefield(s0, ap, giant());
    s0.objects[g]!.controller = b!;
    for (let i = 0; i < 3; i++) s0.objects[putOnBattlefield(s0, ap, solRing())]!.isToken = true;
    const theirs = putOnBattlefield(s0, b!, bears());
    invalidateCharacteristics(s0);
    const owned = s0.battlefield.filter((id) => s0.objects[id]!.owner === ap).length;
    expect(owned).toBe(14 + 2 + 3);
    let asked: string[] = [];
    const s = castGlimpseFromSuspend(s0, ap, (x) => {
      const p = x.pending;
      if (p?.kind === "chooseOption" && p.what === "enchant" && p.player === ap) {
        asked = [...p.options];
        return { type: "chooseOption", player: ap, choice: p.options.find((o) => o.includes(g))! };
      }
      return undefined;
    });
    // 19 permanents counted; 14 lands, the bear, the giant, Pacifism, Ajani and Lightning Bolt are all the library had
    // (the tokens are never revealed), so all of them are revealed.
    expect(s.players[ap]!.library).toEqual([boltId]);
    for (const id of [bear, g, aj, pac]) expect(s.objects[id]!.zone).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.objects[id]!.owner === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land"))).toHaveLength(14);
    // Under your control now (CR 110.2a), the giant too.
    for (const id of [bear, g, aj, pac]) expect(s.objects[id]!.controller).toBe(ap);
    // Ajani enters with its loyalty (CR 306.5b).
    expect(s.objects[aj]!.counters.loyalty).toBe(4);
    // Pacifism enchants something already there (the creatures that entered first, or the opponent's bear).
    expect(asked.some((o) => o.includes(theirs))).toBe(true);
    expect(s.objects[pac]!.attachedTo).toBe(g);
    // No tokens left; the opponent's bear stays.
    expect(named(s, "Sol Ring").filter((id) => s.objects[id]?.zone === "battlefield")).toHaveLength(0);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });

  it("only that many cards are revealed; the rest stay in the library, and the instants and sorceries revealed go to the bottom", () => {
    const { s: s0, ap } = setup([]);
    emptyLibrary(s0, ap);
    // Only the lands: 14 permanents; the library holds 30 Lightning Bolts besides once they're shuffled in.
    const bolts = Array.from({ length: 30 }, () => put(s0, ap, bolt(), "library"));
    const s = castGlimpseFromSuspend(s0, ap);
    const lib = s.players[ap]!.library;
    const landsBack = s.battlefield.filter((id) => s.objects[id]!.owner === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
    expect(lib).toHaveLength(44 - landsBack.length);
    // The 14 revealed: the lands among them entered; the Bolts among them are now the bottom ones.
    const boltsRevealed = 14 - landsBack.length;
    expect(lib.slice(lib.length - boltsRevealed).every((id) => bolts.includes(id))).toBe(true);
    expect(s.log.some((l) => /shuffles 14 permanents into their library and reveals/.test(l.text))).toBe(true);
  });

  it("an Aura card with nothing to enchant stays with the rest and goes to the bottom (CR 303.4g)", () => {
    const { s: s0, ap } = setup([]);
    emptyLibrary(s0, ap);
    const pac = put(s0, ap, pacifism(), "library");
    const s = castGlimpseFromSuspend(s0, ap);
    // 14 permanents (lands) for 15 cards: with every creature card missing, Pacifism can't enter even if revealed.
    expect(s.objects[pac]!.zone).toBe("library");
    expect(s.battlefield.some((id) => s.objects[id]!.attachedTo !== undefined)).toBe(false);
  });

  it("a bot casts it from suspend only when its library's permanent cards are worth more than what it has", () => {
    for (const rich of [true, false]) {
      const { s: s0, ap } = setup([]);
      emptyLibrary(s0, ap);
      for (let i = 0; i < 20; i++) put(s0, ap, rich ? crawWurm() : bolt(), "library");
      const g = put(s0, ap, glimpse(), "exile");
      s0.objects[g]!.counters.time = 1;
      const s = playUntil(s0, (x) => x.pending?.kind === "castFree" && x.pending.player === ap);
      const answer = botActions(s, ap)[0]!;
      expect(answer.type === "castSpell", rich ? "a library of Craw Wurms" : "a library of Lightning Bolts").toBe(rich);
    }
  });

  it("a commander that goes to the command zone instead still counts (rulings, CR 903.9b)", () => {
    const { s: s0, ap } = setup([]);
    emptyLibrary(s0, ap);
    const cmd = s0.players[ap]!.command.find((id) => s0.objects[id]!.isCommander)!;
    s0.players[ap]!.command = s0.players[ap]!.command.filter((id) => id !== cmd);
    s0.objects[cmd]!.zone = "battlefield";
    s0.battlefield.push(cmd);
    const boltId = put(s0, ap, bolt(), "library");
    invalidateCharacteristics(s0);
    const s = castGlimpseFromSuspend(s0, ap);
    expect(s.log.some((l) => /shuffles 15 permanents into their library/.test(l.text))).toBe(true);
    expect(s.objects[cmd]!.zone).toBe("command");
    // 15 revealed: all 15 cards (14 lands, a Bolt), so every land comes back.
    expect(s.battlefield.filter((id) => s.objects[id]!.owner === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land"))).toHaveLength(14);
    expect(s.players[ap]!.library).toEqual([boltId]);
  });
});

describe("round 390: Regenerations Restored", () => {
  const withRegen = (counters: number) => {
    const { s: s0, ap, ids } = setup([timecrafting()]);
    const r = putOnBattlefield(s0, ap, regen());
    s0.objects[r]!.counters.time = counters;
    invalidateCharacteristics(s0);
    return { s0, ap, r, tc: ids[0]! };
  };

  it("the last time counter removed: it exiles itself before vanishing's sacrifice, and you take an extra turn (CR 603.3b, 603.12)", () => {
    const { s0, ap, r, tc } = withRegen(1);
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, tc, [{ kind: "object", id: r }], [0], undefined, 1));
    s = settle(s);
    expect(s.objects[r]!.zone).toBe("exile");
    expect(s.players[ap]!.life).toBe(life + 1);
    expect(s.extraTurns?.map((e) => e.player)).toEqual([ap]);
    expect(s.log.some((l) => /Scry|scry/.test(l.text) || /looks at the top/.test(l.text))).toBe(true);
  });

  it("two counters removed at once is one trigger: scry 1 and 1 life, and with counters left it stays", () => {
    const { s0, ap, r, tc } = withRegen(3);
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, tc, [{ kind: "object", id: r }], [0], undefined, 2));
    s = settle(s);
    expect(s.objects[r]!.zone).toBe("battlefield");
    expect(s.objects[r]!.counters.time).toBe(1);
    expect(s.players[ap]!.life).toBe(life + 1);
    expect(s.extraTurns ?? []).toEqual([]);
  });

  it("vanishing at your upkeep: each counter it removes gains 1 life; the last one exiles it and gives you the extra turn", () => {
    const { s0, ap, r } = withRegen(2);
    const life = s0.players[ap]!.life;
    let s = playUntil(s0, (x) => x.activePlayer === ap && x.step === "draw");
    expect(s.objects[r]!.counters.time).toBe(1);
    expect(s.players[ap]!.life).toBe(life + 1);
    s = playUntil(s, (x) => x.activePlayer === ap && x.step === "draw" && x.turn > s.turn);
    expect(s.objects[r]!.zone).toBe("exile");
    expect(s.players[ap]!.life).toBe(life + 2);
    // Its extra turn comes right after this one.
    const turn = s.turn;
    s = playUntil(s, (x) => x.turn > turn && x.step === "upkeep");
    expect(s.activePlayer).toBe(ap);
  });
});

describe("round 390: Verdant Mastery", () => {
  const start = () => {
    const { s: s0, ap, ids } = setup([verdant()]);
    const lands = { plains: put(s0, ap, plainsCard, "library"), island: put(s0, ap, island, "library"), swamp: put(s0, ap, swamp, "library"), forest: put(s0, ap, forest, "library") };
    return { s0, ap, v: ids[0]!, lands };
  };
  const where = (s: GameState, id: string) => `${s.objects[id]!.zone}${s.objects[id]!.zone === "battlefield" ? `:${s.objects[id]!.controller}:${s.objects[id]!.tapped ? "tapped" : "untapped"}` : ""}`;

  it("for {3}{G}: the first land found goes onto the battlefield tapped under the opponent you choose, the next two under yours, the rest into your hand", () => {
    const { s0, ap, v, lands } = start();
    const [, c] = opponentsOf(s0, ap);
    let s = run(s0, planCast(s0, ap, v, [], undefined, undefined, undefined, { alt: "alternative" }));
    let prompt: { firstTo?: string; secondTo?: string; othersTo?: string; max?: number } = {};
    s = settle(s, (x) => {
      const p = x.pending;
      if (p?.kind === "chooseOption" && p.what === "opponent") return { type: "chooseOption", player: ap, choice: String(c) };
      if (p?.kind === "searchLibrary" && p.player === ap) {
        prompt = p;
        return { type: "searchLibrary", player: ap, found: [lands.plains, lands.island, lands.swamp, lands.forest] };
      }
      return undefined;
    });
    expect(prompt.max).toBe(4);
    expect(prompt.firstTo).toBe(`onto the battlefield tapped under ${s0.players[c!]!.name}'s control`);
    expect(prompt.secondTo).toBe("onto the battlefield tapped under your control");
    expect(prompt.othersTo).toBe("into your hand");
    expect(where(s, lands.plains)).toBe(`battlefield:${c}:tapped`);
    expect(where(s, lands.island)).toBe(`battlefield:${ap}:tapped`);
    expect(where(s, lands.swamp)).toBe(`battlefield:${ap}:tapped`);
    expect(where(s, lands.forest)).toBe("hand");
    expect(s.players[ap]!.hand).toContain(lands.forest);
  });

  it("for {3}{G} with two found: one for the opponent, one for you, none to the hand", () => {
    const { s0, ap, v, lands } = start();
    const [b] = opponentsOf(s0, ap);
    let s = run(s0, planCast(s0, ap, v, [], undefined, undefined, undefined, { alt: "alternative" }));
    s = settle(s, (x) => {
      const p = x.pending;
      if (p?.kind === "chooseOption" && p.what === "opponent") return { type: "chooseOption", player: ap, choice: String(b) };
      if (p?.kind === "searchLibrary" && p.player === ap) return { type: "searchLibrary", player: ap, found: [lands.island, lands.swamp] };
      return undefined;
    });
    expect(where(s, lands.island)).toBe(`battlefield:${b}:tapped`);
    expect(where(s, lands.swamp)).toBe(`battlefield:${ap}:tapped`);
  });

  it("for its mana cost: no opponent is chosen; two lands onto the battlefield tapped under your control, the rest into your hand", () => {
    const { s0, ap, v, lands } = start();
    let s = run(s0, planCast(s0, ap, v, []));
    let asked = false;
    s = settle(s, (x) => {
      const p = x.pending;
      if (p?.kind === "chooseOption" && p.what === "opponent") asked = true;
      if (p?.kind === "searchLibrary" && p.player === ap) return { type: "searchLibrary", player: ap, found: [lands.plains, lands.island, lands.swamp, lands.forest] };
      return undefined;
    });
    expect(asked).toBe(false);
    expect(where(s, lands.plains)).toBe(`battlefield:${ap}:tapped`);
    expect(where(s, lands.island)).toBe(`battlefield:${ap}:tapped`);
    expect(where(s, lands.swamp)).toBe("hand");
    expect(where(s, lands.forest)).toBe("hand");
  });

  it("with a bot answering its choices for {3}{G}: one land goes to an opponent and two stay", () => {
    const { s0, ap, v } = start();
    const before = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap).length;
    let s = run(s0, planCast(s0, ap, v, [], undefined, undefined, undefined, { alt: "alternative" }));
    s = settle(s);
    const mine = s.battlefield.filter((id) => s.objects[id]!.controller === ap).length;
    expect(mine - before).toBe(2);
    expect(opponentsOf(s, ap).reduce((n, p) => n + s.battlefield.filter((id) => s.objects[id]!.controller === p && s.objects[id]!.owner === ap).length, 0)).toBe(1);
  });
});

describe("round 390: Sanctuary Blade", () => {
  const kws = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords;
  const ptOf = (s: GameState, id: string) => `${characteristics(s, s.objects[id]!).power}/${characteristics(s, s.objects[id]!).toughness}`;
  /** Equip `blade` to `to`, answering the color question with `color` (none: the test checks there's no question). */
  const equip = (s0: GameState, ap: PlayerId, b: string, to: string, color?: string) => {
    let asked: { options: string[]; objectId?: string } | undefined;
    const s = settle(run(s0, planActivate(s0, ap, b, 0, [{ kind: "object", id: to }])), (x) => {
      const p = x.pending;
      if (p?.kind === "chooseOption" && p.what === "color" && p.player === ap) {
        asked = { options: [...p.options], objectId: p.objectId };
        return { type: "chooseOption", player: ap, choice: color ?? p.options[0]! };
      }
      return undefined;
    });
    return { s, asked };
  };
  const start = () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    const b = putOnBattlefield(s0, ap, blade());
    const bear = putOnBattlefield(s0, ap, bears());
    const g = putOnBattlefield(s0, ap, giant());
    return { s0, ap, b, bear, g, boltId: ids[0]! };
  };

  it("as it becomes attached by its equip ability, a color is chosen: +2/+0 and protection from that color", () => {
    const { s0, ap, b, bear, boltId } = start();
    const { s, asked } = equip(s0, ap, b, bear, "Red");
    expect(asked?.objectId).toBe(b);
    expect(asked?.options).toEqual(["White", "Blue", "Black", "Red", "Green"]);
    expect(s.objects[b]!.attachedTo).toBe(bear);
    expect(ptOf(s, bear)).toBe("4/2");
    expect(kws(s, bear).some((k) => /^Protection from red$/i.test(k))).toBe(true);
    // Lightning Bolt can't target it now.
    expect(planCast(s, ap, boltId, [{ kind: "object", id: bear }])).toBeNull();
  });

  it("moved to another creature, a new color is chosen; the last chosen color is the one that counts", () => {
    const { s0, ap, b, bear, g } = start();
    let { s } = equip(s0, ap, b, bear, "Red");
    const second = equip(s, ap, b, g, "Black");
    s = second.s;
    expect(second.asked?.objectId).toBe(b);
    expect(kws(s, g).some((k) => /^Protection from black$/i.test(k))).toBe(true);
    expect(kws(s, g).some((k) => /^Protection from red$/i.test(k))).toBe(false);
    expect(kws(s, bear).some((k) => /^Protection from/i.test(k))).toBe(false);
    expect(ptOf(s, bear)).toBe("2/2");
    expect(ptOf(s, g)).toBe("5/3");
  });

  it("equipped again to the creature it's already attached to: no new color (rulings, CR 701.3b)", () => {
    const { s0, ap, b, bear } = start();
    let { s } = equip(s0, ap, b, bear, "Red");
    const again = equip(s, ap, b, bear);
    s = again.s;
    expect(again.asked).toBeUndefined();
    expect(kws(s, bear).some((k) => /^Protection from red$/i.test(k))).toBe(true);
  });

  it("entering the battlefield attached to a creature is becoming attached: the color is asked then too", () => {
    const { s: s0, ap } = setup([]);
    const bear = putOnBattlefield(s0, ap, bears());
    const b = put(s0, ap, blade(), "hand");
    moveObject(s0, b, "battlefield", { attachTo: bear });
    // State-based actions are checked as a player would next receive priority; the question comes before them.
    let s = playUntil(s0, (x) => !!x.pending);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color", objectId: b, player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: "Green" });
    expect(s.objects[b]!.attachedTo).toBe(bear);
    expect(kws(s, bear).some((k) => /^Protection from green$/i.test(k))).toBe(true);
  });

  it("not attached, nothing has protection; a bot equipping it picks the color of what its opponents have", () => {
    const { s0, ap, b, bear } = start();
    const [opp] = opponentsOf(s0, ap);
    // An opponent's red creatures.
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp!, giant());
    expect(kws(s0, bear).some((k) => /^Protection from/i.test(k))).toBe(false);
    const s = settle(run(s0, planActivate(s0, ap, b, 0, [{ kind: "object", id: bear }])));
    expect(kws(s, bear).some((k) => /^Protection from red$/i.test(k))).toBe(true);
  });
});
