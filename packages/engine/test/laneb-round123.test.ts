// Lane B round B123: upkeep payments and their consequences (Cyclone, Rogue Skycaptain, Gargantuan Gorilla, Demonic
// Hordes), Hedron Alignment's win, linked tokens (Stangg, Splintering Wind), "until its controller's next untap step"
// (Orcish Farmer), a choice of keywords with rampage until your next upkeep (Gabriel Angelfire) and Wellspring's control
// of the enchanted land.

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const life = (s: GameState, p: PlayerId) => s.players[p]!.life;
const zone = (s: GameState, id: string) => s.objects[id]?.zone ?? "gone";
const pool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...mana };
};
/** A new card for `def`, owned by `pid`, in that zone. */
const inZone = (s: GameState, pid: PlayerId, def: CardDef, z: "hand" | "graveyard" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** From `ap`'s first main phase to the start of their next upkeep, with their upkeep triggers waiting. */
const toMyUpkeep = (s: GameState, ap: PlayerId) => {
  s.players[ap]!.hand = [];
  for (const p of s.players) p.hand = [];
  return passUntil(act(s, { type: "passPriority", player: ap }), "upkeep", ap);
};
const answer = (s: GameState, pid: PlayerId, a: Action) => {
  expect(s.pending?.player).toBe(pid);
  return act(s, a);
};

// Real oracle text (Scryfall).
const cyclone = (): CardDef => ({"oracleId":"fc9e82b2-f148-431b-9312-97b7101cffe4","name":"Cyclone","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, put a wind counter on this enchantment, then sacrifice this enchantment unless you pay {G} for each wind counter on it. If you pay, this enchantment deals damage equal to the number of wind counters on it to each creature and each player.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const skycaptain = (): CardDef => ({"oracleId":"e600136a-8b4f-4725-a29e-021e0cfc7d0a","name":"Rogue Skycaptain","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Rogue Mercenary","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue","Mercenary"],"oracleText":"Flying\nAt the beginning of your upkeep, put a wage counter on this creature. You may pay {2} for each wage counter on it. If you don't, remove all wage counters from this creature and an opponent gains control of it.","power":"3","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const gorilla = (): CardDef => ({"oracleId":"8314bdf5-1539-4215-949e-f46584cb43bb","name":"Gargantuan Gorilla","manaCost":"{4}{G}{G}{G}","cmc":7,"typeLine":"Creature — Ape","supertypes":[],"types":["Creature"],"subtypes":["Ape"],"oracleText":"At the beginning of your upkeep, you may sacrifice a Forest. If you sacrifice a snow Forest this way, this creature gains trample until end of turn. If you don't sacrifice a Forest, sacrifice this creature and it deals 7 damage to you.\n{T}: This creature deals damage equal to its power to another target creature. That creature deals damage equal to its power to this creature.","power":"7","toughness":"7","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const hedron = (): CardDef => ({"oracleId":"7cdc9df9-ac6c-49c7-a521-921588696b17","name":"Hedron Alignment","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Hexproof\nAt the beginning of your upkeep, you may reveal your hand. If you do, you win the game if you own a card named Hedron Alignment in exile, in your hand, in your graveyard, and on the battlefield.\n{1}{U}: Scry 1.","colors":["U"],"colorIdentity":["U"],"keywords":["Hexproof","Scry"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const stangg = (): CardDef => ({"oracleId":"739eac91-3029-4ce7-9885-0af3ddea472e","name":"Stangg","manaCost":"{4}{R}{G}","cmc":6,"typeLine":"Legendary Creature — Human Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"When Stangg enters, create Stangg Twin, a legendary 3/4 red and green Human Warrior creature token. Exile that token when Stangg leaves the battlefield. Sacrifice Stangg when that token leaves the battlefield.","power":"3","toughness":"4","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const splinter = (): CardDef => ({"oracleId":"184f68a1-0c13-42f4-aee6-3ca744f6a30b","name":"Splintering Wind","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{2}{G}: This enchantment deals 1 damage to target creature. Create a 1/1 green Splinter creature token. It has flying and \"Cumulative upkeep {G}.\" When it leaves the battlefield, it deals 1 damage to you and each creature you control. (At the beginning of its controller's upkeep, that player puts an age counter on it, then sacrifices it unless they pay its upkeep cost for each age counter on it.)","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const farmer = (): CardDef => ({"oracleId":"c3039d19-8c98-4953-8943-9922b6ab45ef","name":"Orcish Farmer","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Creature — Orc","supertypes":[],"types":["Creature"],"subtypes":["Orc"],"oracleText":"{T}: Target land becomes a Swamp until its controller's next untap step.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const gabriel = (): CardDef => ({"oracleId":"e8521fdf-0896-4747-8c66-ea3bb69eb876","name":"Gabriel Angelfire","manaCost":"{3}{G}{G}{W}{W}","cmc":7,"typeLine":"Legendary Creature — Angel","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Angel"],"oracleText":"At the beginning of your upkeep, choose flying, first strike, trample, or rampage 3. Gabriel Angelfire gains that ability until your next upkeep. (Whenever a creature with rampage 3 becomes blocked, it gets +3/+3 until end of turn for each creature blocking it beyond the first.)","power":"4","toughness":"4","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const hordes = (): CardDef => ({"oracleId":"2847c8a0-f6aa-4e4a-a7b8-fc116436a264","name":"Demonic Hordes","manaCost":"{3}{B}{B}{B}","cmc":6,"typeLine":"Creature — Demon","supertypes":[],"types":["Creature"],"subtypes":["Demon"],"oracleText":"{T}: Destroy target land.\nAt the beginning of your upkeep, unless you pay {B}{B}{B}, tap this creature and sacrifice a land of an opponent's choice.","power":"5","toughness":"5","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const wellspring = (): CardDef => ({"oracleId":"8650bd97-ecf6-420f-9b72-a749970afcd4","name":"Wellspring","manaCost":"{1}{G}{W}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant land\nWhen this Aura enters, gain control of enchanted land until end of turn.\nAt the beginning of your upkeep, untap enchanted land. You gain control of that land until end of turn.","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Enchant"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const snowForest = (): CardDef => ({"oracleId":"5f0d3be8-e63e-4ade-ae58-6b0c14f2ce6d","name":"Snow-Covered Forest","manaCost":"","cmc":0,"typeLine":"Basic Snow Land — Forest","supertypes":["Basic","Snow"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const plains = (): CardDef => ({"oracleId":"bc71ebf6-2056-41f7-be35-b2e5c34afa99","name":"Plains","manaCost":"","cmc":0,"typeLine":"Basic Land — Plains","supertypes":["Basic"],"types":["Land"],"subtypes":["Plains"],"oracleText":"({T}: Add {W}.)","colors":[],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;

describe("Lane B round B123", () => {
  it("compiles every card of the round", () => {
    supported(cyclone(), skycaptain(), gorilla(), hedron(), stangg(), splinter(), farmer(), gabriel(), hordes(), wellspring());
  });

  describe("upkeep payments", () => {
    it("Cyclone: a wind counter, then {G} for each; paying deals that much damage to each creature and each player", () => {
      const { s, ap, opp } = setup([]);
      const c = putOnBattlefield(s, ap, cyclone());
      s.objects[c]!.counters.wind = 1;
      const mine = putOnBattlefield(s, ap, bears());
      const theirs = putOnBattlefield(s, opp, bears());
      let s1 = settle(toMyUpkeep(s, ap), { me: [ap] });
      expect(s1.pending?.kind).toBe("chooseMay");
      const [a0, o0] = [life(s1, ap), life(s1, opp)];
      pool(s1, ap, { G: 2 });
      s1 = settle(answer(s1, ap, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
      expect(s1.objects[c]!.counters.wind).toBe(2);
      expect(zone(s1, c)).toBe("battlefield");
      expect(life(s1, ap)).toBe(a0 - 2);
      expect(life(s1, opp)).toBe(o0 - 2);
      expect(zone(s1, mine)).toBe("graveyard");
      expect(zone(s1, theirs)).toBe("graveyard");
    });

    it("Cyclone: not paying sacrifices it and deals no damage", () => {
      const { s, ap, opp } = setup([]);
      const c = putOnBattlefield(s, ap, cyclone());
      const theirs = putOnBattlefield(s, opp, bears());
      let s1 = settle(toMyUpkeep(s, ap), { me: [ap] });
      const o0 = life(s1, opp);
      s1 = settle(answer(s1, ap, { type: "chooseMay", player: ap, yes: false }), { me: [ap] });
      expect(zone(s1, c)).toBe("graveyard");
      expect(life(s1, opp)).toBe(o0);
      expect(s1.objects[theirs]!.damage).toBe(0);
    });

    it("Rogue Skycaptain: {2} for each wage counter keeps it", () => {
      const { s, ap } = setup([]);
      const r = putOnBattlefield(s, ap, skycaptain());
      s.objects[r]!.counters.wage = 1;
      let s1 = settle(toMyUpkeep(s, ap), { me: [ap] });
      expect(s1.pending?.kind).toBe("chooseMay");
      pool(s1, ap, { C: 4 });
      s1 = settle(answer(s1, ap, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
      expect(s1.objects[r]!.counters.wage).toBe(2);
      expect(controllerOf(s1, s1.objects[r]!)).toBe(ap);
      expect(s1.players[ap]!.manaPool.C ?? 0).toBe(0);
    });

    it("Rogue Skycaptain: unpaid, its wage counters go and the opponent you choose gains control of it", () => {
      const { s, ap } = setup([]);
      const r = putOnBattlefield(s, ap, skycaptain());
      s.objects[r]!.counters.wage = 2;
      let s1 = settle(toMyUpkeep(s, ap), { me: [ap] });
      s1 = answer(s1, ap, { type: "chooseMay", player: ap, yes: false });
      expect(s1.pending?.kind).toBe("chooseOption");
      const other = s1.turnOrder.find((p) => p !== ap && s1.turnOrder.indexOf(p) === (s1.turnOrder.indexOf(ap) + 2) % 4)!;
      s1 = settle(answer(s1, ap, { type: "chooseOption", player: ap, choice: String(other) }), { me: [ap] });
      expect(s1.objects[r]!.counters.wage ?? 0).toBe(0);
      expect(controllerOf(s1, s1.objects[r]!)).toBe(other);
    });

    it("Gargantuan Gorilla: sacrificing a snow Forest gives it trample until end of turn", () => {
      const { s, ap } = setup([]);
      const g = putOnBattlefield(s, ap, gorilla());
      const snow = putOnBattlefield(s, ap, snowForest());
      let s1 = settle(toMyUpkeep(s, ap), { me: [ap] });
      s1 = answer(s1, ap, { type: "chooseMay", player: ap, yes: true });
      expect(s1.pending?.kind).toBe("pickPermanents");
      s1 = settle(answer(s1, ap, { type: "pickPermanents", player: ap, ids: [snow] }), { me: [ap] });
      expect(zone(s1, snow)).toBe("graveyard");
      expect(zone(s1, g)).toBe("battlefield");
      expect(characteristics(s1, s1.objects[g]!).keywords).toContain("Trample");
    });

    it("Gargantuan Gorilla: a Forest that isn't snow keeps it without trample; none sacrificed, it goes and deals 7 damage to you", () => {
      const { s, ap } = setup([]);
      const g = putOnBattlefield(s, ap, gorilla());
      putOnBattlefield(s, ap, snowForest());
      let s1 = settle(toMyUpkeep(s, ap), { me: [ap] });
      s1 = answer(s1, ap, { type: "chooseMay", player: ap, yes: true });
      const plain = s1.battlefield.find((id) => s1.cards[s1.objects[id]!.cardId]!.name === "Forest" && controllerOf(s1, s1.objects[id]!) === ap)!;
      s1 = settle(answer(s1, ap, { type: "pickPermanents", player: ap, ids: [plain] }), { me: [ap] });
      expect(zone(s1, g)).toBe("battlefield");
      expect(characteristics(s1, s1.objects[g]!).keywords).not.toContain("Trample");

      let s2 = settle(toMyUpkeep(s, ap), { me: [ap] });
      const before = life(s2, ap);
      s2 = settle(answer(s2, ap, { type: "chooseMay", player: ap, yes: false }), { me: [ap] });
      expect(zone(s2, g)).toBe("graveyard");
      expect(life(s2, ap)).toBe(before - 7);
    });

    it("Demonic Hordes: unpaid, it taps and an opponent you choose picks one of your lands for you to sacrifice", () => {
      const { s, ap } = setup([]);
      const h = putOnBattlefield(s, ap, hordes());
      let s1 = toMyUpkeep(s, ap);
      pool(s1, ap, { B: 3 });
      s1 = settle(s1, { me: [ap] });
      expect(s1.pending?.kind).toBe("chooseMay");
      const lands = s1.battlefield.filter((id) => controllerOf(s1, s1.objects[id]!) === ap && characteristics(s1, s1.objects[id]!).types.includes("Land")).length;
      s1 = answer(s1, ap, { type: "chooseMay", player: ap, yes: false });
      expect(s1.pending?.kind).toBe("chooseOption");
      const other = s1.turnOrder[(s1.turnOrder.indexOf(ap) + 1) % 4]!;
      s1 = answer(s1, ap, { type: "chooseOption", player: ap, choice: String(other) });
      expect(s1.pending).toMatchObject({ kind: "pickPermanents", player: other });
      s1 = settle(s1, { me: [ap] });
      expect(s1.objects[h]!.tapped).toBe(true);
      expect(s1.battlefield.filter((id) => controllerOf(s1, s1.objects[id]!) === ap && characteristics(s1, s1.objects[id]!).types.includes("Land")).length).toBe(lands - 1);
      expect(s1.players[ap]!.graveyard.some((id) => characteristics(s1, s1.objects[id]!).types.includes("Land"))).toBe(true);
    });

    it("Demonic Hordes: paying {B}{B}{B} keeps it untapped and the lands; with no way to pay, it's not asked", () => {
      const { s, ap } = setup([]);
      const h = putOnBattlefield(s, ap, hordes());
      let s1 = toMyUpkeep(s, ap);
      pool(s1, ap, { B: 3 });
      s1 = settle(s1, { me: [ap] });
      const yard = s1.players[ap]!.graveyard.length;
      s1 = settle(answer(s1, ap, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
      expect(s1.objects[h]!.tapped).toBe(false);
      expect(s1.players[ap]!.graveyard.length).toBe(yard);
    });
  });

  describe("Hedron Alignment (rulings: face up in exile)", () => {
    const four = (faceDown = false) => {
      const { s, ap } = setup([]);
      putOnBattlefield(s, ap, hedron());
      inZone(s, ap, hedron(), "graveyard");
      const ex = inZone(s, ap, hedron(), "exile");
      if (faceDown) s.objects[ex]!.hiddenExile = { by: "", seen: [ap] };
      return { s, ap };
    };
    it("revealing your hand with one in exile, in hand, in the graveyard and on the battlefield wins the game", () => {
      const { s, ap } = four();
      let s1 = toMyUpkeep(s, ap);
      inZone(s1, ap, hedron(), "hand");
      s1 = settle(s1, { me: [ap] });
      expect(s1.pending?.kind).toBe("chooseMay");
      s1 = settle(answer(s1, ap, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
      expect(s1.winner).toBe(ap);
    });
    it("not with one missing from a zone, nor with the exiled one face down", () => {
      const { s, ap } = four();
      let s1 = settle(toMyUpkeep(s, ap), { me: [ap] });
      s1 = settle(answer(s1, ap, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
      expect(s1.winner).toBe(null);
      const d = four(true);
      let s2 = toMyUpkeep(d.s, d.ap);
      inZone(s2, d.ap, hedron(), "hand");
      s2 = settle(s2, { me: [d.ap] });
      s2 = settle(answer(s2, d.ap, { type: "chooseMay", player: d.ap, yes: true }), { me: [d.ap] });
      expect(s2.winner).toBe(null);
    });
  });

  describe("linked tokens", () => {
    const castStangg = () => {
      const { s, ap, ids } = setup([stangg()]);
      let s1 = settle(run(s, planCast(s, ap, ids[0]!)));
      const twin = s1.battlefield.find((id) => s1.objects[id]!.isToken)!;
      return { s1, ap, me: ids[0]!, twin };
    };
    it("Stangg: creates Stangg Twin, a legendary 3/4; Stangg is sacrificed when the token leaves", () => {
      const { s1, me, twin } = castStangg();
      const ch = characteristics(s1, s1.objects[twin]!);
      expect(ch).toMatchObject({ name: "Stangg Twin", power: 3, toughness: 4 });
      expect(ch.supertypes).toContain("Legendary");
      expect(ch.colors.sort()).toEqual(["G", "R"]);
      moveObject(s1, twin, "graveyard");
      const s2 = settle(s1);
      expect(zone(s2, me)).toBe("graveyard");
    });
    it("Stangg: the token is exiled when Stangg leaves", () => {
      const { s1, me, twin } = castStangg();
      moveObject(s1, me, "hand");
      const s2 = settle(s1);
      expect(zone(s2, twin)).not.toBe("battlefield");
      expect(zone(s2, me)).toBe("hand");
    });
    it("Stangg: a Stangg that left and came back isn't sacrificed for the old token (CR 400.7)", () => {
      const { s1, ap, me, twin } = castStangg();
      // The old Stangg left; its token is exiled by then, so set up a lone token by hand: none of the new Stangg's.
      moveObject(s1, me, "hand");
      let s2 = settle(s1);
      expect(zone(s2, twin)).not.toBe("battlefield");
      s2 = settle(run(s2, planCast(s2, ap, me)));
      const twin2 = s2.battlefield.find((id) => s2.objects[id]!.isToken)!;
      expect(twin2).toBeDefined();
      expect(zone(s2, me)).toBe("battlefield");
    });

    it("Splintering Wind: 1 damage to the target, a 1/1 flying Splinter with cumulative upkeep; it leaving deals 1 damage to you and each creature you control", () => {
      const { s, ap, opp } = setup([]);
      const w = putOnBattlefield(s, ap, splinter());
      const theirs = putOnBattlefield(s, opp, bears());
      const mine = putOnBattlefield(s, ap, bears());
      const oppBear2 = putOnBattlefield(s, opp, bears());
      let s1 = settle(run(s, planActivate(s, ap, w, 0, [tgt(theirs)])));
      expect(s1.objects[theirs]!.damage).toBe(1);
      const token = s1.battlefield.find((id) => s1.objects[id]!.isToken)!;
      const ch = characteristics(s1, s1.objects[token]!);
      expect(ch).toMatchObject({ name: "Splinter Token", power: 1, toughness: 1 });
      expect(ch.keywords).toContain("Flying");
      expect(abilitiesOf(s1, s1.objects[token]!).triggers.some((x) => x.body.effects.some((e) => e.type === "cumulativeUpkeep" && e.pay.mana === "{G}"))).toBe(true);
      const before = life(s1, ap);
      moveObject(s1, token, "graveyard");
      const s2 = settle(s1);
      expect(life(s2, ap)).toBe(before - 1);
      expect(s2.objects[mine]!.damage).toBe(1);
      expect(s2.objects[oppBear2]!.damage).toBe(0);
    });
  });

  describe("Orcish Farmer: until its controller's next untap step", () => {
    it("an opponent's land is a Swamp until that player's next untap step begins", () => {
      const { s, ap, opp } = setup([]);
      const f = putOnBattlefield(s, ap, farmer());
      const land = putOnBattlefield(s, opp, forest());
      let s1 = settle(run(s, planActivate(s, ap, f, 0, [tgt(land)])));
      expect(characteristics(s1, s1.objects[land]!).subtypes).toEqual(["Swamp"]);
      s1 = passUntil(s1, "end", ap);
      expect(characteristics(s1, s1.objects[land]!).subtypes).toEqual(["Swamp"]);
      s1 = passUntil(s1, "upkeep", opp);
      expect(characteristics(s1, s1.objects[land]!).subtypes).toEqual(["Forest"]);
    });
    it("your own land, on your turn, stays a Swamp through the other turns until your next untap step", () => {
      const { s, ap } = setup([]);
      const f = putOnBattlefield(s, ap, farmer());
      const land = putOnBattlefield(s, ap, forest());
      let s1 = settle(run(s, planActivate(s, ap, f, 0, [tgt(land)])));
      const third = s1.turnOrder[(s1.turnOrder.indexOf(ap) + 3) % 4]!;
      s1 = passUntil(s1, "end", third);
      expect(characteristics(s1, s1.objects[land]!).subtypes).toEqual(["Swamp"]);
      s1 = passUntil(s1, "upkeep", ap);
      expect(characteristics(s1, s1.objects[land]!).subtypes).toEqual(["Forest"]);
    });
  });

  it("Gabriel Angelfire: rampage 3 chosen lasts until your next upkeep, then you choose again", () => {
    const { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, gabriel());
    let s1 = settle(toMyUpkeep(s, ap), { me: [ap] });
    expect(s1.pending).toMatchObject({ kind: "chooseOption", player: ap });
    expect((s1.pending as { options: string[] }).options).toEqual(["Flying", "First strike", "Trample", "Rampage 3"]);
    s1 = settle(answer(s1, ap, { type: "chooseOption", player: ap, choice: "Rampage 3" }), { me: [ap] });
    expect(characteristics(s1, s1.objects[g]!).keywords).toContain("Rampage");
    const third = s1.turnOrder[(s1.turnOrder.indexOf(ap) + 3) % 4]!;
    s1 = passUntil(s1, "end", third);
    expect(characteristics(s1, s1.objects[g]!).keywords).toContain("Rampage");
    s1 = passUntil(s1, "upkeep", ap);
    s1 = settle(s1, { me: [ap] });
    expect(s1.pending?.kind).toBe("chooseOption");
    expect(characteristics(s1, s1.objects[g]!).keywords).not.toContain("Rampage");
    s1 = settle(answer(s1, ap, { type: "chooseOption", player: ap, choice: "Flying" }), { me: [ap] });
    expect(characteristics(s1, s1.objects[g]!).keywords).toContain("Flying");
  });

  it("Wellspring: you control the enchanted land until end of turn as it enters, and at each of your upkeeps it untaps and is yours until end of turn", () => {
    const { s, ap, opp, ids } = setup([wellspring()]);
    const land = putOnBattlefield(s, opp, forest());
    s.objects[land]!.tapped = true;
    let s1 = settle(run(s, planCast(s, ap, ids[0]!, [tgt(land)])));
    expect(s1.objects[ids[0]!]!.attachedTo).toBe(land);
    expect(controllerOf(s1, s1.objects[land]!)).toBe(ap);
    s1 = passUntil(s1, "upkeep", opp);
    expect(controllerOf(s1, s1.objects[land]!)).toBe(opp);
    s1.objects[land]!.tapped = true;
    s1 = settle(passUntil(s1, "upkeep", ap));
    expect(controllerOf(s1, s1.objects[land]!)).toBe(ap);
    expect(s1.objects[land]!.tapped).toBe(false);
    s1 = passUntil(s1, "upkeep", opp);
    expect(controllerOf(s1, s1.objects[land]!)).toBe(opp);
  });

  describe("bots", () => {
    it("Wellspring: a bot puts it on an opponent's land", () => {
      const { s, ap, opp } = setup([]);
      const id = putOnBattlefield(s, opp, wellspring());
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "hand";
      s.players[opp]!.hand = [id];
      for (const l of [forest(), forest(), plains()]) putOnBattlefield(s, opp, l);
      invalidateCharacteristics(s);
      s.players[ap]!.hand = [];
      let s1 = passUntil(act(s, { type: "passPriority", player: ap }), "main1", opp);
      s1.players[opp]!.hand = [id];
      for (let i = 0; i < 60 && s1.objects[id]!.zone === "hand" && s1.activePlayer === opp && s1.step === "main1"; i++) {
        const p = s1.pending?.player ?? waitingOn(s1)!;
        for (const a of botActions(s1, p)) s1 = act(s1, a);
      }
      s1 = settle(s1);
      expect(s1.objects[id]!.zone).toBe("battlefield");
      const host = s1.objects[s1.objects[id]!.attachedTo!]!;
      expect(host.owner).not.toBe(opp);
      expect(controllerOf(s1, host)).toBe(opp);
    });

    it("Rogue Skycaptain: a bot that can't pay gives it to the opponent with the least power", () => {
      const { s, ap } = setup([]);
      const [b, c, d] = [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % 4]!) as [number, number, number];
      const r = putOnBattlefield(s, b, skycaptain());
      for (const p of [ap, c, d]) putOnBattlefield(s, p, bears());
      putOnBattlefield(s, ap, bears());
      putOnBattlefield(s, d, bears());
      for (const p of s.players) p.hand = [];
      let s1 = passUntil(act(s, { type: "passPriority", player: ap }), "upkeep", b);
      s1 = settle(s1);
      expect(controllerOf(s1, s1.objects[r]!)).toBe(c);
    });
  });
});
