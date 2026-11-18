// Lane B round B254: Cultivator Drone ("Spend this mana only to cast a colorless spell, activate an ability of a colorless
// permanent, or pay a cost that contains {C}.", CR 106.6, 105.2c, 107.4c, rulings), Rhystic Cave ("{T}: Choose a color. Add one
// mana of that color unless any player pays {1}. Activate only as an instant.", CR 605.1a, 605.3b, 602.5e, rulings) and Peace
// Talks ("This turn and next turn, creatures can't attack, and players and permanents can't be the targets of spells or
// activated abilities.", rulings).

import { describe, expect, it } from "vitest";
import { act, bear, mountain, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, applyAction, botActions, castProblem, compileCard, invalidateCharacteristics, isFullySupported, manaAbilitiesOn, parseManaCost, planActivate, planCast, potentialAttackers, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { spendAllows } from "../src/spend";

// Real card data (Scryfall).
const cultivatorDrone = (): CardDef => ({"oracleId":"6e62d553-d0d0-400e-a423-f0c3c1fdc911","name":"Cultivator Drone","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Eldrazi Drone","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi","Drone"],"oracleText":"Devoid (This card has no color.)\n{T}: Add {C}. Spend this mana only to cast a colorless spell, activate an ability of a colorless permanent, or pay a cost that contains {C}. ({C} represents colorless mana.)","power":"2","toughness":"3","colors":[],"colorIdentity":["U"],"keywords":["Devoid"],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/b/b/bbe4bb6f-bec6-49d2-99d7-e3750a0ea03f.jpg?1783937921","artUrl":"https://cards.scryfall.io/art_crop/front/b/b/bbe4bb6f-bec6-49d2-99d7-e3750a0ea03f.jpg?1783937921","layout":"normal"});
const rhysticCave = (): CardDef => ({"oracleId":"609fbc2c-514a-4feb-aaad-b9e6dcfd335c","name":"Rhystic Cave","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Choose a color. Add one mana of that color unless any player pays {1}. Activate only as an instant.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/4/a/4ae74463-4426-4ad4-b7a2-324694854245.jpg?1783945766","artUrl":"https://cards.scryfall.io/art_crop/front/4/a/4ae74463-4426-4ad4-b7a2-324694854245.jpg?1783945766","layout":"normal"});
const peaceTalks = (): CardDef => ({"oracleId":"b0f87e25-6604-4723-9467-1e4fedc1157a","name":"Peace Talks","manaCost":"{1}{W}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This turn and next turn, creatures can't attack, and players and permanents can't be the targets of spells or activated abilities.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/4/d4200017-5b26-40fe-9a0d-2872aa3b017e.jpg?1783947029","artUrl":"https://cards.scryfall.io/art_crop/front/d/4/d4200017-5b26-40fe-9a0d-2872aa3b017e.jpg?1783947029","layout":"normal"});
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","layout":"normal"});
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});
const utterInsignificance = (): CardDef => ({"oracleId":"44074791-da32-498b-879f-22192b94a9b0","name":"Utter Insignificance","manaCost":"{1}{U}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Flash\nEnchant creature\nEnchanted creature loses all abilities and has base power and toughness 1/1.\n{2}{C}: Exile enchanted creature.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant","Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/3/0/3050ac06-4c16-4155-a97f-f6bc92709ee4.jpg?1783911286","artUrl":"https://cards.scryfall.io/art_crop/front/3/0/3050ac06-4c16-4155-a97f-f6bc92709ee4.jpg?1783911286","layout":"normal"});
const bearerOfSilence = (): CardDef => ({"oracleId":"d69c8c55-6433-4cc5-bdc7-9722f121b8e2","name":"Bearer of Silence","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Eldrazi","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"Devoid (This card has no color.)\nWhen you cast this spell, you may pay {1}{C}. If you do, target opponent sacrifices a creature. ({C} represents colorless mana.)\nFlying\nThis creature can't block.","power":"2","toughness":"1","colors":[],"colorIdentity":["B"],"keywords":["Flying","Devoid"],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50460cce-ee1c-4384-bb0c-d90616e0d2e9.jpg?1783937916","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50460cce-ee1c-4384-bb0c-d90616e0d2e9.jpg?1783937916","layout":"normal"});
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","layout":"normal"});
const manaFlare = (): CardDef => ({"oracleId":"97159138-c34b-416e-b079-5c952383a243","name":"Mana Flare","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a player taps a land for mana, that player adds one mana of any type that land produced.","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/3/f/3f0b8b24-7272-4d1a-af4a-c3a1b89a7e04.jpg?1783914921","artUrl":"https://cards.scryfall.io/art_crop/front/3/f/3f0b8b24-7272-4d1a-af4a-c3a1b89a7e04.jpg?1783914921","layout":"normal"});
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","layout":"normal"});
const prodigalPyromancer = (): CardDef => ({"oracleId":"29b3cb3e-aeb1-43eb-8095-9f7881aa34bd","name":"Prodigal Pyromancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","layout":"normal"});
const flametongueKavu = (): CardDef => ({"oracleId":"b215196a-3716-451f-bdbd-d16c05ace5b4","name":"Flametongue Kavu","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Kavu","supertypes":[],"types":["Creature"],"subtypes":["Kavu"],"oracleText":"When this creature enters, it deals 4 damage to target creature.","power":"4","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/5/150047e1-32f8-4aff-b311-0f6d58ce36fe.jpg?1783918328","artUrl":"https://cards.scryfall.io/art_crop/front/1/5/150047e1-32f8-4aff-b311-0f6d58ce36fe.jpg?1783918328","layout":"normal"});
const abzanGuide = (): CardDef => ({"oracleId":"85b2fb89-5ebe-4c13-bc12-38d1417e5880","name":"Abzan Guide","manaCost":"{3}{W}{B}{G}","cmc":6,"typeLine":"Creature — Human Warrior","supertypes":[],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"Lifelink (Damage dealt by this creature also causes you to gain that much life.)\nMorph {2}{W}{B}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)","power":"4","toughness":"4","colors":["B","G","W"],"colorIdentity":["B","G","W"],"keywords":["Lifelink","Morph"],"imageUrl":"https://cards.scryfall.io/normal/front/1/b/1b7f7158-4a31-4a1c-bf3b-574c0b09276a.jpg?1783939061","artUrl":"https://cards.scryfall.io/art_crop/front/1/b/1b7f7158-4a31-4a1c-bf3b-574c0b09276a.jpg?1783939061","layout":"normal"});
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","layout":"normal"});

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or one of `me` has a question. */
const settle = (s: GameState, me: PlayerId[] = []) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && !me.includes(p.player)) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const pool = (s: GameState, pid: PlayerId) => Object.entries(s.players[pid]!.manaPool).filter(([, n]) => n > 0).map(([m, n]) => `${m}${n}`).join(" ");
/** Untaps every land `pid` controls but these, which are tapped (so only the cards under test make mana). */
function tapLandsBut(s: GameState, pid: PlayerId, keep: string[] = []) {
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (o.controller === pid && s.cards[o.cardId]!.types.includes("Land") && !keep.includes(id)) o.tapped = true;
  }
}

describe("Lane B round B254", () => {
  it("are fully supported", () => {
    supported(cultivatorDrone(), rhysticCave(), peaceTalks());
    expect(compileCard(cultivatorDrone()).mana[0]!.spendOnly?.costsWithC).toBe(true);
    const cave = compileCard(rhysticCave()).mana[0]!;
    expect(cave.unlessAnyPays).toBe("{1}");
    expect(cave.instantOnly).toBe(true);
    expect(cave.produces.kind).toBe("oneOf");
  });
});

describe("Lane B round B254: Cultivator Drone", () => {
  it("its {C} casts a colorless spell (Sol Ring), not a colored one's generic mana (Grizzly Bears)", () => {
    const { s: s0, ap, ids } = setup([solRing(), grizzlyBears()]);
    const drone = putOnBattlefield(s0, ap, cultivatorDrone());
    let s = applyAction(s0, { type: "activateMana", player: ap, objectId: drone, mana: "C" });
    expect(pool(s, ap)).toBe("C1");
    // The Bears' {1} is paid with a land: the Drone's mana stays.
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(pool(s, ap)).toBe("C1");
    // Sol Ring is colorless: paid from the pool alone.
    const plan = planCast(s, ap, ids[0]!);
    expect(plan?.filter((a) => a.type === "activateMana")).toEqual([]);
    s = settle(run(s, plan));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(pool(s, ap)).toBe("");
  });

  it("with only its mana, a colored spell can't be cast", () => {
    const { s: s0, ap, ids } = setup([grizzlyBears()]);
    const drone = putOnBattlefield(s0, ap, cultivatorDrone());
    const forestId = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest" && s0.objects[id]!.controller === ap)!;
    tapLandsBut(s0, ap, [forestId]);
    let s = applyAction(s0, { type: "activateMana", player: ap, objectId: drone, mana: "C" });
    s = applyAction(s, { type: "activateMana", player: ap, objectId: forestId, mana: "G" });
    expect(planCast(s, ap, ids[0]!)).toBeNull();
  });

  it("pays a colored permanent's ability whose cost contains {C}, all of it (Utter Insignificance's {2}{C})", () => {
    const { s: s0, ap, opp } = setup([]);
    const victim = putOnBattlefield(s0, opp, bear());
    const aura = putOnBattlefield(s0, ap, utterInsignificance());
    s0.objects[aura]!.attachedTo = victim;
    invalidateCharacteristics(s0);
    const drones = [putOnBattlefield(s0, ap, cultivatorDrone()), putOnBattlefield(s0, ap, cultivatorDrone()), putOnBattlefield(s0, ap, cultivatorDrone())];
    tapLandsBut(s0, ap);
    let s = s0;
    for (const d of drones) s = applyAction(s, { type: "activateMana", player: ap, objectId: d, mana: "C" });
    expect(pool(s, ap)).toBe("C3");
    expect(abilityProblem(s, ap, aura, 0)).toBeNull();
    s = settle(run(s, planActivate(s, ap, aura, 0)));
    expect(s.objects[victim]!.zone).toBe("exile");
    expect(pool(s, ap)).toBe("");
  });

  it("pays a colorless permanent's ability (Mind Stone), not a colored permanent's that has no {C}", () => {
    const { s: s0, ap } = setup([]);
    const stone = putOnBattlefield(s0, ap, mindStone());
    const drone = putOnBattlefield(s0, ap, cultivatorDrone());
    tapLandsBut(s0, ap);
    let s = applyAction(s0, { type: "activateMana", player: ap, objectId: drone, mana: "C" });
    const only = compileCard(cultivatorDrone()).mana[0]!.spendOnly!;
    // Grizzly Bears as a stand-in colored permanent: an ability of it costing {1} can't use the Drone's mana.
    const bears = putOnBattlefield(s, ap, bear());
    expect(spendAllows(s, ap, only, { ability: s.objects[bears]! }, parseManaCost("{1}"))).toBe(false);
    expect(spendAllows(s, ap, only, { ability: s.objects[stone]! }, parseManaCost("{1}"))).toBe(true);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, stone, 0)));
    expect(s.objects[stone]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("pays a cost with {C} paid as a trigger resolves (rulings: Bearer of Silence's {1}{C}, with two Drones)", () => {
    const { s: s0, ap, opp, ids } = setup([bearerOfSilence()]);
    const victim = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // The Drones arrive after Bearer of Silence is cast, so its own cost didn't use them.
    const drones = [putOnBattlefield(s, ap, cultivatorDrone()), putOnBattlefield(s, ap, cultivatorDrone())];
    // The cast trigger's opponent: the one with the creature.
    s = settle(s, [ap]);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = settle(s, [ap]);
    expect(s.pending?.kind).toBe("chooseMay");
    tapLandsBut(s, ap);
    for (const d of drones) s = applyAction(s, { type: "activateMana", player: ap, objectId: d, mana: "C" });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(pool(s, ap)).toBe("");
    s = settle(s, [ap]);
    expect(s.objects[victim]!.zone).toBe("graveyard");
  });

  it("a face-down spell is colorless (CR 708.2a, rulings); a cost with no {C} paid as something resolves isn't one of its uses", () => {
    const { s, ap } = setup([]);
    const only = compileCard(cultivatorDrone()).mana[0]!.spendOnly!;
    expect(spendAllows(s, ap, only, { spell: abzanGuide(), faceDown: true }, parseManaCost("{3}"))).toBe(true);
    expect(spendAllows(s, ap, only, { spell: abzanGuide() }, parseManaCost("{3}{W}{B}{G}"))).toBe(false);
    expect(spendAllows(s, ap, only, "other", parseManaCost("{1}"))).toBe(false);
    expect(spendAllows(s, ap, only, "other", parseManaCost("{1}{C}"))).toBe(true);
  });
});

describe("Lane B round B254: Rhystic Cave", () => {
  it("each other player in turn order is asked; when none pays, its mana is added", () => {
    const { s: s0, ap } = setup([]);
    const cave = putOnBattlefield(s0, ap, rhysticCave());
    let s = applyAction(s0, { type: "activateMana", player: ap, objectId: cave, mana: "R" });
    expect(s.objects[cave]!.tapped).toBe(true);
    const order = s.turnOrder.slice(s.turnOrder.indexOf(ap) + 1).concat(s.turnOrder.slice(0, s.turnOrder.indexOf(ap)));
    const asked: PlayerId[] = [];
    for (let i = 0; i < 4 && s.pending; i++) {
      expect(s.pending.kind).toBe("payUnless");
      expect(pool(s, ap)).toBe("");
      asked.push(s.pending.player);
      for (const a of botActions(s, s.pending.player)) s = act(s, a);
    }
    expect(asked).toEqual(order);
    expect(pool(s, ap)).toBe("R1");
    expect(logged(s, /doesn't pay \{1\} for Rhystic Cave/)).toBe(true);
  });

  it("a player who pays stops the mana, and no one after them is asked", () => {
    const { s: s0, ap } = setup([]);
    const cave = putOnBattlefield(s0, ap, rhysticCave());
    const next = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    const theirs = putOnBattlefield(s0, next, mountain);
    let s = applyAction(s0, { type: "activateMana", player: ap, objectId: cave, mana: "G" });
    expect(s.pending).toMatchObject({ kind: "payUnless", player: next, cost: "{1}", manaUnless: true });
    // The asked player may activate mana abilities first (CR 605.3a).
    s = applyAction(s, { type: "activateMana", player: next, objectId: theirs, mana: "R" });
    s = applyAction(s, { type: "payUnless", player: next, pay: true });
    expect(s.pending).toBeNull();
    expect(pool(s, ap)).toBe("");
    expect(pool(s, next)).toBe("");
    expect(s.objects[cave]!.tapped).toBe(true);
    expect(logged(s, /Rhystic Cave adds no mana/)).toBe(true);
  });

  it("isn't tapped for mana when someone pays (rulings: Mana Flare adds nothing then, one more mana otherwise)", () => {
    const { s: s0, ap } = setup([]);
    const cave = putOnBattlefield(s0, ap, rhysticCave());
    const cave2 = putOnBattlefield(s0, ap, rhysticCave());
    const next = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    putOnBattlefield(s0, next, manaFlare());
    let s = applyAction(s0, { type: "activateMana", player: ap, objectId: cave, mana: "U" });
    while (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
    expect(pool(s, ap)).toBe("U2");
    s = applyAction(s, { type: "activateMana", player: ap, objectId: cave2, mana: "U" });
    s.players[s.pending!.player]!.manaPool.C += 1; // something to pay with
    s = applyAction(s, { type: "payUnless", player: s.pending!.player, pay: true });
    expect(pool(s, ap)).toBe("U2");
  });

  it("only as an instant: not while another question is waiting, and automatic payment never uses it", () => {
    const { s: s0, ap, ids } = setup([lightningBolt()]);
    const cave = putOnBattlefield(s0, ap, rhysticCave());
    const cave2 = putOnBattlefield(s0, ap, rhysticCave());
    tapLandsBut(s0, ap, [cave, cave2]);
    expect(planCast(s0, ap, ids[0]!)).toBeNull();
    const s = applyAction(s0, { type: "activateMana", player: ap, objectId: cave, mana: "R" });
    expect(() => applyAction(s, { type: "activateMana", player: ap, objectId: cave2, mana: "R" })).toThrow();
    expect(manaAbilitiesOn(s, s.objects[cave2]!)[0]!.unlessAnyPays).toBe("{1}");
  });
});

describe("Lane B round B254: Peace Talks", () => {
  it("this turn: no player or permanent can be the target of a spell or an activated ability; no creature can attack", () => {
    const { s: s0, ap, opp, ids } = setup([peaceTalks(), lightningBolt()]);
    const victim = putOnBattlefield(s0, opp, bear());
    const pyro = putOnBattlefield(s0, ap, prodigalPyromancer());
    putOnBattlefield(s0, ap, bear());
    expect(planCast(s0, ap, ids[1]!, [tgt(victim)])).not.toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(castProblem(s, ap, ids[1]!, [tgt(victim)])).toMatch(/target/);
    expect(planCast(s, ap, ids[1]!, [tgt(victim)])).toBeNull();
    expect(planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])).toBeNull();
    expect(planCast(s, ap, ids[1]!, [tgt(pyro)])).toBeNull();
    expect(planCast(s, ap, ids[1]!)).toBeNull();
    expect(abilityProblem(s, ap, pyro, 0, [tgt(victim)])).not.toBeNull();
    expect(abilityProblem(s, ap, pyro, 0, [{ kind: "player", id: opp }])).not.toBeNull();
    expect(potentialAttackers(s, ap)).toEqual([]);
  });

  it("a triggered ability can still target (Flametongue Kavu), and a spell can still target a spell", () => {
    const { s: s0, ap, opp, ids } = setup([peaceTalks(), flametongueKavu()]);
    const victim = putOnBattlefield(s0, opp, { ...bear(), name: "Victim" });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = run(s, planCast(s, ap, ids[1]!));
    s = settle(s, [ap]);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(victim)] }), [ap]);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.objects[victim]!.zone).toBe("graveyard");
    // Counterspell's target is a spell on the stack, neither a player nor a permanent.
    const { s: t0, ap: a2, ids: i2 } = setup([peaceTalks(), counterspell(), grizzlyBears()]);
    let t = settle(run(t0, planCast(t0, a2, i2[0]!)));
    t = run(t, planCast(t, a2, i2[2]!));
    const spell = t.stack[t.stack.length - 1]!;
    expect(planCast(t, a2, i2[1]!, [{ kind: "stack", id: spell.id }])).not.toBeNull();
  });

  it("lasts exactly this turn and the next one, whoever's (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([peaceTalks()]);
    const victim = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const turn = s.turn;
    expect(s.peaceTalksTurns).toEqual([turn, turn + 1]);
    // The next turn (the next player's): still on.
    s = passUntil(s, "main1", opp);
    expect(s.turn).toBe(turn + 1);
    const pyro = putOnBattlefield(s, opp, prodigalPyromancer(), { sick: false });
    expect(abilityProblem(s, opp, pyro, 0, [tgt(victim)])).not.toBeNull();
    expect(potentialAttackers(s, opp)).toEqual([]);
    // The turn after: over.
    const third = s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!;
    s = passUntil(s, "main1", third);
    expect(s.turn).toBe(turn + 2);
    expect(abilityProblem(s, opp, pyro, 0, [tgt(victim)])).not.toBe("no legal targets");
    expect(potentialAttackers(s, third).length).toBeGreaterThanOrEqual(0);
    const attacker = putOnBattlefield(s, third, bear(), { sick: false });
    expect(potentialAttackers(s, third).map((o) => o.id)).toContain(attacker);
  });
});
