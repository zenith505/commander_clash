// Lane B round B259: Divine Intervention (the game is a draw when its controller removes the last intervention counter,
// CR 104.4c, rulings), Benthic Explorers (untapping a tapped land an opponent controls as a mana ability's cost, a type that
// land could produce, CR 106.7, 605.1a, rulings) and Hollow Warrior (tapping another creature to attack or block, CR 508.1g-h,
// 509.1c-d, rulings).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, applyAction, botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, tapCostCandidates, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const divineIntervention = (): CardDef => ({"oracleId":"0158a440-6573-4f12-958b-a5f0cf190d5b","name":"Divine Intervention","manaCost":"{6}{W}{W}","cmc":8,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"This enchantment enters with two intervention counters on it.\nAt the beginning of your upkeep, remove an intervention counter from this enchantment.\nWhen you remove the last intervention counter from this enchantment, the game is a draw.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/e/9eae0ba1-1383-4505-b4e7-4f17dd8f20c5.jpg?1783948087","artUrl":"https://cards.scryfall.io/art_crop/front/9/e/9eae0ba1-1383-4505-b4e7-4f17dd8f20c5.jpg?1783948087","layout":"normal"});
const benthicExplorers = (): CardDef => ({"oracleId":"bc0518fc-d34b-474a-92c5-2cb013828396","name":"Benthic Explorers","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Merfolk Scout","supertypes":[],"types":["Creature"],"subtypes":["Merfolk","Scout"],"oracleText":"{T}, Untap a tapped land an opponent controls: Add one mana of any type that land could produce.","power":"2","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/3/9/397d7602-d374-484c-aab2-3e57f12ceaa4.jpg?1783947196","artUrl":"https://cards.scryfall.io/art_crop/front/3/9/397d7602-d374-484c-aab2-3e57f12ceaa4.jpg?1783947196","layout":"normal"});
const hollowWarrior = (): CardDef => ({"oracleId":"18ca77d9-4740-4be4-913a-e21c9ed9e43f","name":"Hollow Warrior","manaCost":"{4}","cmc":4,"typeLine":"Artifact Creature — Golem Warrior","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem","Warrior"],"oracleText":"This creature can't attack or block unless you tap an untapped creature you control not declared as an attacking or blocking creature this combat. (This cost is paid as attackers or blockers are declared.)","power":"4","toughness":"4","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/163add05-9ee9-4a8f-8838-3c4143ddc2f5.jpg?1783945767","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/163add05-9ee9-4a8f-8838-3c4143ddc2f5.jpg?1783945767","layout":"normal"});
const undergroundSea = (): CardDef => ({"oracleId":"4b22be3a-8ce1-47d1-b82e-6c3ccfb0548b","name":"Underground Sea","manaCost":"","cmc":0,"typeLine":"Land — Island Swamp","supertypes":[],"types":["Land"],"subtypes":["Island","Swamp"],"oracleText":"({T}: Add {U} or {B}.)","colors":[],"colorIdentity":["B","U"],"keywords":[],"producedMana":["B","U"],"imageUrl":"https://cards.scryfall.io/normal/front/f/f/ff76ac86-8a8a-47fe-9388-8950ca3e26c3.jpg?1783948658","artUrl":"https://cards.scryfall.io/art_crop/front/f/f/ff76ac86-8a8a-47fe-9388-8950ca3e26c3.jpg?1783948658","layout":"normal"});
const contamination = (): CardDef => ({"oracleId":"4013b4c2-c9ed-4d14-90f0-97214ec1fded","name":"Contamination","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, sacrifice this enchantment unless you sacrifice a creature.\nIf a land is tapped for mana, it produces {B} instead of any other type and amount.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/6/86067dfe-65c3-4c96-bccd-b3915d6663f9.jpg?1783946347","artUrl":"https://cards.scryfall.io/art_crop/front/8/6/86067dfe-65c3-4c96-bccd-b3915d6663f9.jpg?1783946347","layout":"normal"});
const vampireHexmage = (): CardDef => ({"oracleId":"fcb2a95b-cef0-4b29-8b2b-538f380aff2b","name":"Vampire Hexmage","manaCost":"{B}{B}","cmc":2,"typeLine":"Creature — Vampire Shaman","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Shaman"],"oracleText":"First strike\nSacrifice this creature: Remove all counters from target permanent.","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/9/3/93d2c4d1-6205-404a-b03d-995b90a3a33a.jpg?1783942148","artUrl":"https://cards.scryfall.io/art_crop/front/9/3/93d2c4d1-6205-404a-b03d-995b90a3a33a.jpg?1783942148","layout":"normal"});
const serraAngel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","layout":"normal"});
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"});
const llanowarElves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","layout":"normal"});

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
const answer = (s: GameState, choice: string) => act(s, { type: "chooseOption", player: s.pending!.player, choice } as Action);
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const leftOf = (s: GameState, pid: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % s.turnOrder.length]!;
const pool = (s: GameState, pid: PlayerId) => Object.fromEntries(Object.entries(s.players[pid]!.manaPool).filter(([, n]) => n));

describe("Divine Intervention", () => {
  it("is supported", () => supported(divineIntervention(), benthicExplorers(), hollowWarrior()));

  it("enters with two intervention counters; its controller's upkeep removes one, and removing the last makes the game a draw", () => {
    const { s: s0, ap, ids } = setup([divineIntervention()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters.intervention).toBe(2);
    s = passUntil(s, "upkeep", leftOf(s, ap));
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(s.objects[ids[0]!]!.counters.intervention).toBe(1);
    expect(s.over).toBeFalsy();
    s = passUntil(s, "upkeep", leftOf(s, ap));
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(s.objects[ids[0]!]!.counters.intervention ?? 0).toBe(0);
    expect(s.over).toBe(true);
    expect(s.winner).toBeNull();
    expect(s.players.every((p) => !p.lost)).toBe(true);
    expect(logged(s, /The game is a draw \(Divine Intervention\)/)).toBe(true);
  });

  it("another player's effect removing the last counter doesn't trigger it, and it never will (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const di = putOnBattlefield(s0, ap, divineIntervention());
    s0.objects[di]!.counters = { intervention: 1 };
    const hex = putOnBattlefield(s0, opp, vampireHexmage());
    invalidateCharacteristics(s0);
    let s = act(s0, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = settle(run(s, planActivate(s, opp, hex, 0, [tgt(di)])));
    expect(s.objects[hex]!.zone).toBe("graveyard");
    expect(s.objects[di]!.counters.intervention ?? 0).toBe(0);
    expect(s.over).toBeFalsy();
    // Its upkeep ability has no counter to remove: nothing more happens.
    s = passUntil(s, "upkeep", leftOf(s, ap));
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(s.over).toBeFalsy();
  });

  it("its controller's own effect removing the last counter triggers it (rulings: it doesn't matter how)", () => {
    const { s: s0, ap } = setup([]);
    const di = putOnBattlefield(s0, ap, divineIntervention());
    s0.objects[di]!.counters = { intervention: 2 };
    const hex = putOnBattlefield(s0, ap, vampireHexmage());
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planActivate(s0, ap, hex, 0, [tgt(di)])));
    expect(s.over).toBe(true);
    expect(s.winner).toBeNull();
  });

  it("bots cast it only when they're losing: 10 life or less and less than every opponent", () => {
    const { s: s0, ap, ids } = setup([divineIntervention()]);
    // The bot's own main phase: what it does until it passes (a land first, say).
    const casts = (s: GameState) => {
      for (let i = 0; i < 20 && !s.pending; i++) {
        const acts = botActions(s, ap);
        if (acts.some((a) => a.type === "castSpell" && a.objectId === ids[0])) return true;
        if (acts[0]?.type === "passPriority") return false;
        for (const a of acts) s = act(s, a);
      }
      return false;
    };
    expect(casts(s0)).toBe(false);
    const low = structuredClone(s0);
    low.players[ap]!.life = 6;
    expect(casts(low)).toBe(true);
  });
});

describe("Benthic Explorers", () => {
  /** Ap's Benthic Explorers, an opponent's tapped Underground Sea. */
  const board = () => {
    const { s, ap, opp } = setup([]);
    const ben = putOnBattlefield(s, ap, benthicExplorers());
    const sea = putOnBattlefield(s, opp, undergroundSea());
    s.objects[sea]!.tapped = true;
    invalidateCharacteristics(s);
    return { s, ap, opp, ben, sea };
  };

  it("untaps a tapped land an opponent controls and adds one mana of a type that land could produce, chosen as it resolves", () => {
    const { s: s0, ap, ben, sea } = board();
    expect(tapCostCandidates(s0, ap, s0.objects[ben]!, { kind: "tap", filter: { kind: "object", types: ["Land"], notTypes: [], notColors: [], text: "" }, n: 1, untap: true, opponents: true })).toEqual([sea]);
    let s = run(s0, planActivate(s0, ap, ben, 0, undefined, undefined, undefined, undefined, { tap: [sea] }));
    expect(s.objects[sea]!.tapped).toBe(false);
    expect(s.objects[ben]!.tapped).toBe(true);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "either", labels: ["Add {U}", "Add {B}"] });
    s = answer(s, "1");
    expect(pool(s, ap)).toEqual({ B: 1 });
    // It's a mana ability: nothing went on the stack (CR 605.3a).
    expect(s.stack.length).toBe(0);
  });

  it("can't be activated without a tapped land an opponent controls: its own tapped lands don't count (rulings)", () => {
    const { s: s0, ap, ben, sea } = board();
    s0.objects[sea]!.tapped = false;
    const mine = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Island")!;
    s0.objects[mine]!.tapped = true;
    expect(abilityProblem(s0, ap, ben, 0)).toMatch(/untap a tapped land an opponent controls/);
    expect(() => run(s0, planActivate(s0, ap, ben, 0, undefined, undefined, undefined, undefined, { tap: [mine] }))).toThrow();
  });

  it("bots use it when the mana lets them cast a card they couldn't otherwise", () => {
    const { s: s0, ap, opp, ben } = board();
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap && id !== ben) s0.objects[id]!.tapped = true;
    const forestId = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    s0.battlefield.splice(s0.battlefield.indexOf(forestId), 1);
    s0.battlefield.push(forestId);
    s0.objects[forestId]!.controller = opp;
    s0.players[ap]!.hand = [];
    const elves = putOnBattlefield(s0, ap, llanowarElves());
    s0.battlefield.splice(s0.battlefield.indexOf(elves), 1);
    s0.objects[elves]!.zone = "hand";
    s0.players[ap]!.hand.push(elves);
    invalidateCharacteristics(s0);
    const acts = botActions(s0, ap);
    expect(acts[0]).toMatchObject({ type: "activateAbility", objectId: ben, costs: { tap: [forestId] } });
    let s = s0;
    for (const a of acts) s = act(s, a);
    expect(pool(s, ap)).toEqual({ G: 1 });
  });

  it("counts replacement effects on the land's mana (rulings: Contamination makes it {B} only)", () => {
    const { s: s0, ap, opp, ben, sea } = board();
    putOnBattlefield(s0, opp, contamination());
    invalidateCharacteristics(s0);
    const s = run(s0, planActivate(s0, ap, ben, 0, undefined, undefined, undefined, undefined, { tap: [sea] }));
    expect(s.pending).toBeFalsy();
    expect(pool(s, ap)).toEqual({ B: 1 });
  });
});

describe("Hollow Warrior", () => {
  /** Ap's Hollow Warrior and the creatures given, and an opponent with theirs; ap's declare attackers step. */
  const board = (mine: CardDef[], theirs: CardDef[] = []) => {
    const { s: s0, ap, opp } = setup([]);
    const hw = putOnBattlefield(s0, ap, hollowWarrior());
    const own = mine.map((d) => putOnBattlefield(s0, ap, d));
    const opps = theirs.map((d) => putOnBattlefield(s0, opp, d));
    const s = passUntil(s0, "declareAttackers", ap);
    return { s, ap, opp, hw, own, opps };
  };

  it("attacks only by tapping another untapped creature that isn't attacking (rulings: not itself), paid as attackers are declared", () => {
    const { s: s0, ap, opp, hw, own } = board([grizzlyBears(), serraAngel()]);
    const [bears, angel] = own as [string, string];
    let s = act(s0, { type: "declareAttackers", player: ap, attacks: [{ attacker: hw, defender: opp }, { attacker: angel, defender: opp }] } as Action);
    // Serra Angel has vigilance and stays untapped, but it's attacking: only the Bears can pay.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, attackCost: true, action: "tap", objectId: hw, options: [bears], count: 1 });
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [angel] })).toThrow();
    s = act(s, { type: "pickPermanents", player: ap, ids: [bears] });
    expect(s.objects[bears]!.tapped).toBe(true);
    expect(s.objects[hw]!.attacking).toBe(opp);
    expect(s.objects[angel]!.attacking).toBe(opp);
    expect(logged(s, /taps Grizzly Bears to attack with Hollow Warrior/)).toBe(true);
  });

  it("can't attack with nothing else to tap: a tapped creature or only attackers don't do", () => {
    const { s: s0, ap, opp, hw, own } = board([grizzlyBears()]);
    const [bears] = own as [string];
    expect(() => act(s0, { type: "declareAttackers", player: ap, attacks: [{ attacker: hw, defender: opp }, { attacker: bears, defender: opp }] } as Action)).toThrow(/costs to attack/);
    const tapped = structuredClone(s0);
    tapped.objects[bears]!.tapped = true;
    expect(() => act(tapped, { type: "declareAttackers", player: ap, attacks: [{ attacker: hw, defender: opp }] } as Action)).toThrow(/can't attack unless you tap/);
  });

  it("a summoning-sick creature can pay it: the cost isn't {T} (CR 302.6)", () => {
    const { s: s0, ap, opp, hw } = board([]);
    const sick = putOnBattlefield(s0, ap, grizzlyBears(), { sick: true });
    invalidateCharacteristics(s0);
    const s = act(s0, { type: "declareAttackers", player: ap, attacks: [{ attacker: hw, defender: opp }] } as Action);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", options: [sick] });
  });

  it("blocks only by tapping another untapped creature of its controller's that isn't blocking", () => {
    const { s: s0, ap, opp } = setup([]);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const hw = putOnBattlefield(s0, opp, hollowWarrior());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: giant, defender: opp }] } as Action);
    for (let i = 0; i < 50 && !(s.pending?.kind === "declareBlockers" && s.pending.player === opp); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: opp });
    // Both blocking: nothing is left to tap.
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: hw, attacker: giant }, { blocker: bears, attacker: giant }] } as Action)).toThrow(/costs to block/);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: hw, attacker: giant }] } as Action);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, blockCost: true, action: "tap", objectId: hw, options: [bears] });
    s = act(s, { type: "pickPermanents", player: opp, ids: [bears] });
    expect(s.objects[bears]!.tapped).toBe(true);
    expect(s.objects[hw]!.blocking).toEqual([giant]);
    expect(s.objects[giant]!.blockedBy).toEqual([hw]);
    expect(logged(s, /taps Grizzly Bears to block with Hollow Warrior/)).toBe(true);
  });

  it("bots block with it only when they can pay, and tap their least valuable creature to block or attack", () => {
    const { s: s0, ap, opp } = setup([]);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const hw = putOnBattlefield(s0, opp, hollowWarrior());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: giant, defender: opp }] } as Action);
    for (let i = 0; i < 50 && !(s.pending?.kind === "declareBlockers" && s.pending.player === opp); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // Alone, it can't pay: the bot's blocks leave it out.
    const alone = botActions(s, opp);
    expect(alone.find((a) => a.type === "declareBlockers")).toMatchObject({ blocks: [] });
    // With a Bears to tap, its pick is the Bears.
    const bears = putOnBattlefield(s, opp, grizzlyBears());
    invalidateCharacteristics(s);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: hw, attacker: giant }] } as Action);
    expect(botActions(s, opp)).toEqual([{ type: "pickPermanents", player: opp, ids: [bears] }]);
  });
});
