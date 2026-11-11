// Round 340 (Lane A): Nomad Mythmaker (an Aura from any graveyard onto the battlefield under your control, attached to a
// creature you control), Archmage's Newt (flashback until end of turn, {0} if it's saddled), Hoarder's Overflow ("When ~
// enters and whenever you expend 4"), Watcher of Hours ("whenever you remove a time counter from ~ while it's exiled") and
// Paranormal Analyst ("whenever you manifest dread") and Stumpsquall Hydra ("distribute X +1/+1 counters among it and any
// number of commanders").

import { describe, expect, it } from "vitest";
import { act, bear as grizzlyBearsLike, mountain, passUntil, plainsCard, putOnBattlefield, setup } from "./helpers";
import { chooseTargets } from "../src/bot";
import { applyAction, botActions, castProblem, compileCard, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PendingDecision, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pend = <K extends PendingDecision["kind"]>(s: GameState, kind: K) => {
  expect(s.pending?.kind).toBe(kind);
  return s.pending as Extract<PendingDecision, { kind: K }>;
};
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
/** A copy of `def` in `pid`'s `zone` (hand, graveyard or exile). */
const put = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "hand") s.players[pid]!.hand.push(id);
  else if (zone === "graveyard") s.players[pid]!.graveyard.push(id);
  else s.players[pid]!.exile.push(id);
  invalidateCharacteristics(s);
  return id;
};

// Real oracle text (Scryfall).
const nomadMythmaker = (): CardDef => ({"oracleId":"591ce7dc-8407-43ed-acfc-e3d8fd547125","name":"Nomad Mythmaker","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human Nomad Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Nomad","Cleric"],"oracleText":"{W}, {T}: Put target Aura card from a graveyard onto the battlefield under your control attached to a creature you control.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/4/0468f109-8020-4a74-8ffd-bba771362f76.jpg?1783943076","artUrl":"https://cards.scryfall.io/art_crop/front/0/4/0468f109-8020-4a74-8ffd-bba771362f76.jpg?1783943076","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const archmagesNewt = (): CardDef => ({"oracleId":"75ffebc4-8db9-4de6-a330-e3f41cdccecc","name":"Archmage's Newt","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Salamander Mount","supertypes":[],"types":["Creature"],"subtypes":["Salamander","Mount"],"oracleText":"Whenever this creature deals combat damage to a player, target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost. That card gains flashback {0} until end of turn instead if this creature is saddled. (You may cast that card from your graveyard for its flashback cost. Then exile it.)\nSaddle 3","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Saddle"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a440bbd6-8e51-4db1-90d9-7fa9fc327ad5.jpg?1783911850","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a440bbd6-8e51-4db1-90d9-7fa9fc327ad5.jpg?1783911850","commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hoardersOverflow = (): CardDef => ({"oracleId":"75f7d9c7-5d52-4bfe-a730-62fef187b8b8","name":"Hoarder's Overflow","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters and whenever you expend 4, put a stash counter on it. (You expend 4 as you spend your fourth total mana to cast spells during a turn.)\n{1}{R}, Sacrifice this enchantment: Discard your hand, then draw cards equal to the number of stash counters on this enchantment.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/2/c2ed5079-07b4-4575-a2c8-5f0cbff888c3.jpg?1783910820","artUrl":"https://cards.scryfall.io/art_crop/front/c/2/c2ed5079-07b4-4575-a2c8-5f0cbff888c3.jpg?1783910820","commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const regenerationsRestored = (): CardDef => ({"oracleId":"a1e691f3-a3e9-4cfa-a761-d7e020364dfa","name":"Regenerations Restored","manaCost":"{W}{U}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Vanishing 12 (This enchantment enters with twelve time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)\nWhenever one or more time counters are removed from this enchantment, scry 1 and you gain 1 life. Then if this enchantment has no time counters on it, exile it. When you do, take an extra turn after this one.","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Vanishing","Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/44d38ec3-5028-42ac-97c3-af2aa04314ae.jpg?1783914387","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/44d38ec3-5028-42ac-97c3-af2aa04314ae.jpg?1783914387","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const watcherOfHours = (): CardDef => ({"oracleId":"b2354092-7a4c-4e69-9c0a-0a2e146dc00c","name":"Watcher of Hours","manaCost":"{5}{U}","cmc":6,"typeLine":"Creature — Sphinx","supertypes":[],"types":["Creature"],"subtypes":["Sphinx"],"oracleText":"Flying, ward {3}\nWhenever you remove a time counter from this card while it's exiled, surveil 1.\nSuspend 6—{1}{U} (Rather than cast this card from your hand, you may pay {1}{U} and exile it with six time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost. It has haste.)","power":"6","toughness":"6","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Surveil","Suspend","Ward"],"imageUrl":"https://cards.scryfall.io/normal/front/d/8/d827fc3c-bc86-4ee9-9db9-461cb0276f6b.jpg?1783913045","artUrl":"https://cards.scryfall.io/art_crop/front/d/8/d827fc3c-bc86-4ee9-9db9-461cb0276f6b.jpg?1783913045","commanderLegal":"legal","set":"mkc","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const paranormalAnalyst = (): CardDef => ({"oracleId":"8cbe71d3-b77b-49a7-9c51-ed308011b8b0","name":"Paranormal Analyst","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Human Detective","supertypes":[],"types":["Creature"],"subtypes":["Human","Detective"],"oracleText":"Whenever you manifest dread, put a card you put into your graveyard this way into your hand.","power":"1","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Manifest","Manifest dread"],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/60cf954a-5503-460c-8720-8960842eea47.jpg?1783909490","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/60cf954a-5503-460c-8720-8960842eea47.jpg?1783909490","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const rancor = (): CardDef => ({"oracleId":"9d2d6479-531c-4ce1-b52b-00e36fa63b64","name":"Rancor","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/4073ecc9-5d3a-452f-b708-0572fa27a6f0.jpg?1783912355","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/4073ecc9-5d3a-452f-b708-0572fa27a6f0.jpg?1783912355","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const fireball = (): CardDef => ({"oracleId":"aa7714b0-2bfb-458a-8ebf-37ec2c53383e","name":"Fireball","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ethrimikImaginedFiend = (): CardDef => ({"oracleId":"7c48aa73-4576-4a21-ba0f-d5253128ee7c","name":"Ethrimik, Imagined Fiend","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Legendary Creature — Illusion Beast","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Illusion","Beast"],"oracleText":"When Ethrimik enters, manifest dread.\nOther creatures you control get +1/+1.\nAs long as you control another creature, Ethrimik can't attack or block.","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Manifest","Manifest dread"],"imageUrl":"https://cards.scryfall.io/normal/front/d/3/d31a8561-84a0-49a2-9e05-d6bd72b35385.jpg?1783909202","artUrl":"https://cards.scryfall.io/art_crop/front/d/3/d31a8561-84a0-49a2-9e05-d6bd72b35385.jpg?1783909202","commanderLegal":"not_legal","set":"ydsk","releasedAt":"2024-10-15","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const timecrafting = (): CardDef => ({"oracleId":"57939644-6f9a-4653-920b-f2d28559a9ca","name":"Timecrafting","manaCost":"{X}{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Remove X time counters from target permanent or suspended card.\n• Put X time counters on target permanent with a time counter on it or suspended card.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd6da5ef-7e5b-4536-ad28-6fe66f3e0438.jpg?1783943146","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd6da5ef-7e5b-4536-ad28-6fe66f3e0438.jpg?1783943146","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ancestralVision = (): CardDef => ({"oracleId":"9728dec9-d482-4c7a-8cdc-44d010dc878d","name":"Ancestral Vision","manaCost":"","cmc":0,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Suspend 4—{U} (Rather than cast this card from your hand, pay {U} and exile it with four time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)\nTarget player draws three cards.","colors":["U"],"colorIdentity":["U"],"keywords":["Suspend"],"imageUrl":"https://cards.scryfall.io/normal/front/a/5/a5dc736d-7e61-4909-973f-61f7adb82b64.jpg?1783935551","artUrl":"https://cards.scryfall.io/art_crop/front/a/5/a5dc736d-7e61-4909-973f-61f7adb82b64.jpg?1783935551","commanderLegal":"legal","set":"ima","releasedAt":"2017-11-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("round 340: compiles", () => {
  it("every card of the round", () => supported(nomadMythmaker(), archmagesNewt(), hoardersOverflow(), watcherOfHours(), paranormalAnalyst(), stumpsquallHydra()));
});

const stumpsquallHydra = (): CardDef => ({"oracleId":"9b157b9a-92da-4054-8441-04fb4e415d77","name":"Stumpsquall Hydra","manaCost":"{X}{G}{G}{G}","cmc":3,"typeLine":"Creature — Hydra","supertypes":[],"types":["Creature"],"subtypes":["Hydra"],"oracleText":"When this creature enters, distribute X +1/+1 counters among it and any number of commanders.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/f/8fe8096b-332a-4832-b957-7a35bb350e4e.jpg?1783928734","artUrl":"https://cards.scryfall.io/art_crop/front/8/f/8fe8096b-332a-4832-b957-7a35bb350e4e.jpg?1783928734","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

/** Passes priority until `pid` has it (the stack unchanged by the others). */
const toPriority = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
/** `ap` attacks `defender` with `attackers`, nobody blocks; stops at a question of `me`'s or once combat damage is over and the stack is empty. */
const swing = (s: GameState, ap: PlayerId, attackers: string[], defender: PlayerId, me?: PlayerId) => {
  s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 300; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p && p.player === me) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else if ((s.step === "combatDamage" || s.step === "endCombat") && !s.stack.length && !s.triggerQueue.length) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error("combat never ended");
};

describe("round 340: Nomad Mythmaker", () => {
  it("an opponent's Aura comes back under your control on a creature you control, chosen as it resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const nomad = putOnBattlefield(s, ap, nomadMythmaker());
    const bears = putOnBattlefield(s, ap, grizzlyBears());
    putOnBattlefield(s, opp, grizzlyBears());
    const aura = put(s, opp, pacifism(), "graveyard");
    s = settle(run(s, planActivate(s, ap, nomad, 0, [{ kind: "object", id: aura }])), ap);
    // Two of yours it could enchant (Nomad, the Bears): you choose, never the opponent's creature (rulings).
    const p = pend(s, "chooseOption");
    expect(p.player).toBe(ap);
    expect([...p.options].sort()).toEqual([nomad, bears].sort());
    s = settle(act(s, { type: "chooseOption", player: ap, choice: bears }), ap);
    expect(s.objects[aura]!.zone).toBe("battlefield");
    expect(s.objects[aura]!.controller).toBe(ap);
    expect(s.objects[aura]!.owner).toBe(opp);
    expect(s.objects[aura]!.attachedTo).toBe(bears);
  });
  it("with no creature of yours to enchant as it resolves, the Aura stays in the graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const nomad = putOnBattlefield(s, ap, nomadMythmaker());
    putOnBattlefield(s, opp, grizzlyBears());
    putOnBattlefield(s, opp, mountain);
    const bolt = put(s, opp, lightningBolt(), "hand");
    const aura = put(s, ap, rancor(), "graveyard");
    s = run(s, planActivate(s, ap, nomad, 0, [{ kind: "object", id: aura }]));
    s = toPriority(s, opp);
    s = run(s, planCast(s, opp, bolt, [{ kind: "object", id: nomad }]));
    s = settle(s, ap);
    expect(s.objects[nomad]?.zone ?? "graveyard").not.toBe("battlefield");
    expect(s.objects[aura]!.zone).toBe("graveyard");
    expect(s.pending).toBeNull();
  });
});

describe("round 340: Archmage's Newt", () => {
  /** Newt hits `opp`; its trigger targets `card` in `ap`'s graveyard. */
  const hit = (s: GameState, ap: PlayerId, opp: PlayerId, newt: string, card: string) => {
    s = swing(s, ap, [newt], opp, ap);
    if (s.pending?.kind === "chooseTargets" && s.pending.player === ap) s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: card }] }), ap);
    expect(s.pending).toBeNull();
    return s;
  };
  it("unsaddled: the card gains flashback with its mana cost until end of turn, and is exiled after", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const newt = putOnBattlefield(s, ap, archmagesNewt());
    const div = put(s, ap, divination(), "graveyard");
    s = hit(s, ap, opp, newt, div);
    expect(s.log.some((l) => /Divination gains flashback until end of turn/.test(l.text))).toBe(true);
    s = passUntil(s, "main2", ap);
    const untapped = s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length;
    const hand = s.players[ap]!.hand.length;
    const plan = planCast(s, ap, div, undefined, undefined, undefined, undefined, { via: "grantedFlashback" });
    expect(plan).not.toBeNull();
    s = settle(run(s, plan), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.objects[div]!.zone).toBe("exile");
    // {2}{U} was paid: three lands tapped.
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length).toBe(untapped - 3);
  });
  it("saddled: flashback {0} instead, so an {X} spell's X is 0 and a card with no mana cost can be cast", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const newt = putOnBattlefield(s, ap, archmagesNewt());
    s.objects[newt]!.saddled = true;
    s.objects[newt]!.saddledTurn = s.turn;
    const vision = put(s, ap, ancestralVision(), "graveyard");
    s = hit(s, ap, opp, newt, vision);
    expect(s.log.some((l) => /Ancestral Vision gains flashback \{0\} until end of turn/.test(l.text))).toBe(true);
    s = passUntil(s, "main2", ap);
    const untapped = s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length;
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, vision, [{ kind: "player", id: ap }], undefined, undefined, undefined, { via: "grantedFlashback" })), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
    expect(s.objects[vision]!.zone).toBe("exile");
    // Nothing was paid.
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length).toBe(untapped);
  });
  it("a card with no mana cost gains no castable flashback when Newt isn't saddled", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const newt = putOnBattlefield(s, ap, archmagesNewt());
    const vision = put(s, ap, ancestralVision(), "graveyard");
    s = hit(s, ap, opp, newt, vision);
    s = passUntil(s, "main2", ap);
    expect(planCast(s, ap, vision, [{ kind: "player", id: ap }], undefined, undefined, undefined, { via: "grantedFlashback" })).toBeNull();
  });
  it("saddled as it last existed: gone before its trigger resolves, flashback {0} all the same", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const newt = putOnBattlefield(s, ap, archmagesNewt());
    s.objects[newt]!.saddled = true;
    s.objects[newt]!.saddledTurn = s.turn;
    putOnBattlefield(s, opp, mountain);
    const bolt = put(s, opp, lightningBolt(), "hand");
    const fb = put(s, ap, fireball(), "graveyard");
    s = swing(s, ap, [newt], opp, ap);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: fb }] });
    // The trigger is on the stack: the opponent bolts Newt in response.
    s = toPriority(s, opp);
    s = run(s, planCast(s, opp, bolt, [{ kind: "object", id: newt }]));
    s = settle(s, ap);
    expect(s.objects[newt]?.zone).not.toBe("battlefield");
    expect(s.log.some((l) => /Fireball gains flashback \{0\} until end of turn/.test(l.text))).toBe(true);
    // Flashback {0}: X can only be 0 (rulings, CR 107.3b).
    s = passUntil(s, "main2", ap);
    const via = { via: "grantedFlashback" as const };
    expect(castProblem(s, ap, fb, [{ kind: "player", id: opp }], undefined, undefined, undefined, 3, via)).toMatch(/X is 0/);
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, fb, [{ kind: "player", id: opp }], undefined, undefined, 0, via)), ap);
    expect(s.players[opp]!.life).toBe(life);
    expect(s.objects[fb]!.zone).toBe("exile");
  });
});

describe("round 340: Hoarder's Overflow", () => {
  it("a stash counter as it enters and when you expend 4 (its own cost counted); the sacrifice draws that many", () => {
    const { s: s0, ap, ids } = setup([hoardersOverflow(), divination(), grizzlyBears(), grizzlyBears()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    const ov = ids[0]!;
    expect(s.objects[ov]!.counters.stash).toBe(1);
    // {1}{R} spent so far; Divination's {2}{U} makes 5, crossing 4.
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    expect(s.objects[ov]!.counters.stash).toBe(2);
    // Only once each turn (rulings).
    s = settle(run(s, planCast(s, ap, ids[2]!)), ap);
    expect(s.objects[ov]!.counters.stash).toBe(2);
    const hand = s.players[ap]!.hand.length;
    expect(hand).toBeGreaterThan(0);
    s = settle(run(s, planActivate(s, ap, ov, 0)), ap);
    expect(s.objects[ov]!.zone).toBe("graveyard");
    // The hand discarded, then two cards drawn (its counters as it last existed, CR 608.2h).
    expect(s.players[ap]!.hand.length).toBe(2);
  });
  it("four mana spent before it entered: the expend 4 trigger can't happen that turn (rulings)", () => {
    const { s: s0, ap, ids } = setup([divination(), hoardersOverflow(), grizzlyBears()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    expect(s.objects[ids[1]!]!.counters.stash).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[2]!)), ap);
    expect(s.objects[ids[1]!]!.counters.stash).toBe(1);
  });
});

describe("round 340: Watcher of Hours", () => {
  it("suspended, its owner's upkeep removes a time counter: surveil 1", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const w = put(s, ap, watcherOfHours(), "exile");
    s.objects[w]!.counters.time = 3;
    s = act(passUntil(s, "end", ap), { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 400 && !(s.pending?.kind === "arrangeTop" && s.pending.player === ap); i++) {
      const p = s.pending;
      if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const p = pend(s, "arrangeTop");
    expect(p.how).toBe("surveil");
    expect(s.activePlayer).toBe(ap);
    expect(s.step).toBe("upkeep");
    expect(s.objects[w]!.counters.time).toBe(2);
  });
  it("a time counter you remove with a spell triggers it; one an opponent removes doesn't", () => {
    const { s: s0, ap, ids, opp } = setup([timecrafting()]);
    let s = s0;
    const w = put(s, ap, watcherOfHours(), "exile");
    s.objects[w]!.counters.time = 4;
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: w }], [0], undefined, 1)), ap);
    expect(s.objects[w]!.counters.time).toBe(3);
    expect(pend(s, "arrangeTop").how).toBe("surveil");
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [], away: [...pend(s, "arrangeTop").cards] }), ap);
    expect(s.pending).toBeNull();
    // The opponent's Timecrafting: their effect removes it, so not "you remove".
    const theirs = put(s, opp, timecrafting(), "hand");
    for (const l of [mountain, mountain]) putOnBattlefield(s, opp, l);
    s = toPriority(s, opp);
    const surveils = s.log.filter((l) => /surveil/i.test(l.text)).length;
    s = settle(run(s, planCast(s, opp, theirs, [{ kind: "object", id: w }], [0], undefined, 1)), ap);
    expect(s.objects[w]!.counters.time).toBe(2);
    expect(s.pending).toBeNull();
    expect(s.log.filter((l) => /surveil/i.test(l.text)).length).toBe(surveils);
  });
});

describe("round 340: Paranormal Analyst", () => {
  it("whenever you manifest dread: the card put into your graveyard goes to your hand", () => {
    const { s: s0, ap, ids } = setup([ethrimikImaginedFiend()]);
    let s = s0;
    putOnBattlefield(s, ap, paranormalAnalyst());
    const [a, b] = s.players[ap]!.library.slice(0, 2) as [string, string];
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    expect(pend(s, "searchLibrary").cards).toEqual([a, b]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [a] }), ap);
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(s.objects[a]!.faceDown).toBeTruthy();
    expect(s.objects[b]!.zone).toBe("hand");
  });
  it("with one card in the library it's manifested and nothing comes back; an opponent's manifest dread doesn't trigger it", () => {
    const { s: s0, ap, ids, opp } = setup([ethrimikImaginedFiend()]);
    let s = s0;
    putOnBattlefield(s, ap, paranormalAnalyst());
    const lib = s.players[ap]!.library;
    for (const id of lib.splice(1)) s.objects[id]!.zone = "exile";
    const only = lib[0]!;
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    expect(s.objects[only]!.zone).toBe("battlefield");
    // It triggered (rulings) and found nothing to return.
    expect(s.log.some((l) => /Paranormal Analyst/.test(l.text) && /trigger|ability/i.test(l.text))).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });
  it("an opponent manifesting dread doesn't trigger yours", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, paranormalAnalyst());
    s = passUntil(s, "main1", opp);
    for (const l of [plainsCard, plainsCard, plainsCard]) putOnBattlefield(s, opp, l);
    const theirs = put(s, opp, ethrimikImaginedFiend(), "hand");
    const hand = s.players[ap]!.hand.length;
    const oppYard = s.players[opp]!.graveyard.length;
    s = settle(run(s, planCast(s, opp, theirs)));
    expect(s.players[opp]!.graveyard.length).toBe(oppYard + 1);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.log.some((l) => /Paranormal Analyst/.test(l.text))).toBe(false);
  });
});

describe("round 340: Stumpsquall Hydra", () => {
  it("X counters divided as it resolves among it and commanders, anyone's", () => {
    const { s: s0, ap, ids, opp } = setup([stumpsquallHydra()]);
    let s = s0;
    const mine = putOnBattlefield(s, ap, grizzlyBearsLike({ name: "My Commander" }), { commander: true });
    const theirs = putOnBattlefield(s, opp, grizzlyBearsLike({ name: "Their Commander" }), { commander: true });
    putOnBattlefield(s, opp, grizzlyBears());
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, 3)), ap);
    const p = pend(s, "distribute");
    expect(p.total).toBe(3);
    expect(p.upTo).toBeUndefined();
    expect([...p.options].sort()).toEqual([ids[0]!, mine, theirs].sort());
    // All of them must be given out while the Hydra is there.
    expect(() => act(s, { type: "distribute", player: ap, parts: { [mine]: 1 } })).toThrow();
    s = settle(act(s, { type: "distribute", player: ap, parts: { [ids[0]!]: 1, [mine]: 1, [theirs]: 1 } }), ap);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(1);
  });
  it("gone before its ability resolves: up to X among commanders, none included (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([stumpsquallHydra()]);
    let s = s0;
    const mine = putOnBattlefield(s, ap, grizzlyBearsLike({ name: "My Commander" }), { commander: true });
    putOnBattlefield(s, opp, mountain);
    const bolt = put(s, opp, lightningBolt(), "hand");
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, 2));
    for (let i = 0; i < 20 && s.objects[ids[0]!]!.zone !== "battlefield"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // The trigger waits on the stack: the opponent bolts the Hydra (a 3/3) in response.
    s = toPriority(s, opp);
    s = run(s, planCast(s, opp, bolt, [{ kind: "object", id: ids[0]! }]));
    s = settle(s, ap);
    const p = pend(s, "distribute");
    expect(p.upTo).toBe(true);
    expect(p.options).toEqual([mine]);
    s = settle(act(s, { type: "distribute", player: ap, parts: {} }), ap);
    expect(s.objects[mine]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.pending).toBeNull();
  });
  it("a bot gives the counters to its own permanents only", () => {
    const { s: s0, ap, ids, opp } = setup([stumpsquallHydra()]);
    let s = s0;
    const mine = putOnBattlefield(s, ap, grizzlyBearsLike({ name: "My Commander" }), { commander: true });
    const theirs = putOnBattlefield(s, opp, grizzlyBearsLike({ name: "Their Commander" }), { commander: true });
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, 4)), ap);
    pend(s, "distribute");
    s = settle(s);
    expect((s.objects[ids[0]!]!.counters["+1/+1"] ?? 0) + (s.objects[mine]!.counters["+1/+1"] ?? 0)).toBe(4);
    expect(s.objects[theirs]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("round 340: bots", () => {
  /** The bot `pid` acts until its turn's end step (or the permanent `watch` leaves the battlefield). */
  const botTurn = (s: GameState, pid: PlayerId, watch: string) => {
    for (let i = 0; i < 400 && s.objects[watch]!.zone === "battlefield" && !(s.step === "end" && s.activePlayer === pid); i++) {
      const who = s.pending ? s.pending.player : waitingOn(s)!;
      for (const a of botActions(s, who)) s = act(s, a);
    }
    return s;
  };
  it("a bot sacrifices Hoarder's Overflow in its second main phase once the draw beats its hand by two", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const h = putOnBattlefield(s, ap, hoardersOverflow());
    s.objects[h]!.counters.stash = 3;
    for (const id of s.players[ap]!.hand.splice(1)) s.objects[id]!.zone = "exile";
    s = botTurn(s, ap, h);
    expect(s.objects[h]!.zone).toBe("graveyard");
    expect(s.step).toBe("main2");
  });
  it("not when its hand is as big as the draw", () => {
    const { s: s0, ap } = setup([grizzlyBears(), grizzlyBears(), grizzlyBears()]);
    let s = s0;
    const h = putOnBattlefield(s, ap, hoardersOverflow());
    s.objects[h]!.counters.stash = 2;
    s = botTurn(s, ap, h);
    expect(s.objects[h]!.zone).toBe("battlefield");
  });
  it("a bot returns only an Aura that helps with Nomad Mythmaker", () => {
    // (Targets only: whether it activates is the bot's call.)
    const { s, ap, opp } = setup([]);
    const nomad = putOnBattlefield(s, ap, nomadMythmaker());
    putOnBattlefield(s, ap, grizzlyBears());
    const bad = put(s, opp, pacifism(), "graveyard");
    const good = put(s, opp, rancor(), "graveyard");
    const chosen = JSON.stringify(chooseTargets(s, ap, compileCard(nomadMythmaker()).activated[0]!.body, false, nomad));
    expect(chosen).toContain(good);
    expect(chosen).not.toContain(bad);
  });
});
