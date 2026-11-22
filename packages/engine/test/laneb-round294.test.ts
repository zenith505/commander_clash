// Lane B round B294: Yavimaya Bloomsage // Channel (Channel: "Until end of turn, any time you could activate a mana ability,
// you may pay 1 life. If you do, add {C}.", CR 605.3a, 119.4, 514.2) and False Dawn ("Until end of turn, spells and
// abilities you control that would add colored mana instead add that much white mana. Until end of turn, you may spend white
// mana as though it were mana of any color. Draw a card.", CR 614.1a, 106.6a, 609.4b).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, channelProblem, characteristics, defOf, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const bloomsage = (): CardDef => ({"oracleId":"d9068051-b51c-4700-b492-30b148e3a72c","name":"Yavimaya Bloomsage // Channel","manaCost":"{2}{G} // {G}{G}","cmc":3,"typeLine":"Creature — Dryad Druid // Sorcery","supertypes":[],"types":["Creature"],"subtypes":["Dryad","Druid"],"oracleText":"At the beginning of your end step, put a +1/+1 counter on target creature you control. Then if that creature has power 7 or greater, this creature becomes prepared. (While it's prepared, you may cast a copy of its spell. Doing so unprepares it.)","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Prepared"],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/f/c/fc962e45-ab71-47e2-b736-644901ffe7d6.jpg?1783903851","artUrl":"https://cards.scryfall.io/art_crop/front/f/c/fc962e45-ab71-47e2-b736-644901ffe7d6.jpg?1783903851","commanderLegal":"legal","set":"soc","releasedAt":"2026-04-24","rarity":"rare","layout":"prepare","gameChanger":false,"faces":[{"name":"Yavimaya Bloomsage","manaCost":"{2}{G}","typeLine":"Creature — Dryad Druid","supertypes":[],"types":["Creature"],"subtypes":["Dryad","Druid"],"oracleText":"At the beginning of your end step, put a +1/+1 counter on target creature you control. Then if that creature has power 7 or greater, this creature becomes prepared. (While it's prepared, you may cast a copy of its spell. Doing so unprepares it.)","power":"2","toughness":"2","colors":["G"]},{"name":"Channel","manaCost":"{G}{G}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}.","colors":["G"]}]}) as CardDef;
const channel = (): CardDef => ({"oracleId":"d1b815d1-2848-40d4-a555-66822d1becbc","name":"Channel","manaCost":"{G}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}.","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0e07a16f-d836-40f9-85e3-a78582a97109.jpg?1783927427","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0e07a16f-d836-40f9-85e3-a78582a97109.jpg?1783927427","commanderLegal":"banned","set":"sta","releasedAt":"2021-04-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const falseDawn = (): CardDef => ({"oracleId":"efd9cc25-f445-4de0-9a69-adab9f8878f4","name":"False Dawn","manaCost":"{1}{W}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Until end of turn, spells and abilities you control that would add colored mana instead add that much white mana. Until end of turn, you may spend white mana as though it were mana of any color.\nDraw a card.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/1695e0ba-005a-4652-aea7-e1d1f9ff5d66.jpg?1783945357","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/1695e0ba-005a-4652-aea7-e1d1f9ff5d66.jpg?1783945357","commanderLegal":"legal","set":"apc","releasedAt":"2001-06-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const manaFlare = (): CardDef => ({"oracleId":"97159138-c34b-416e-b079-5c952383a243","name":"Mana Flare","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a player taps a land for mana, that player adds one mana of any type that land produced.","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/3/f/3f0b8b24-7272-4d1a-af4a-c3a1b89a7e04.jpg?1783914921","artUrl":"https://cards.scryfall.io/art_crop/front/3/f/3f0b8b24-7272-4d1a-af4a-c3a1b89a7e04.jpg?1783914921","commanderLegal":"legal","set":"wot","releasedAt":"2023-09-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const darkRitual = (): CardDef => ({"oracleId":"53f7c868-b03e-4fc2-8dcf-a75bbfa3272b","name":"Dark Ritual","manaCost":"{B}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Add {B}{B}{B}.","colors":["B"],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/1/1/11e12a84-e7be-4afc-a230-c2e644743fa8.jpg?1783903013","artUrl":"https://cards.scryfall.io/art_crop/front/1/1/11e12a84-e7be-4afc-a230-c2e644743fa8.jpg?1783903013","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sphere = (): CardDef => ({"oracleId":"0b67c4e2-f88b-4e01-85a1-9d5f5b8db13b","name":"Commander's Sphere","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add one mana of any color in your commander's color identity.\nSacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/0851660f-fa02-4f08-b28b-10279c58d4e4.jpg?1783906242","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/0851660f-fa02-4f08-b28b-10279c58d4e4.jpg?1783906242","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const emperion = (): CardDef => ({"oracleId":"bcd2f70c-36c2-44b2-9d4b-1000e9bb62b6","name":"Platinum Emperion","manaCost":"{8}","cmc":8,"typeLine":"Artifact Creature — Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"Your life total can't change. (You can't gain or lose life. You can't pay any amount of life except 0.)","power":"8","toughness":"8","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/1/71b03143-9e85-4061-88e6-ad621f75ec3b.jpg?1783933762","artUrl":"https://cards.scryfall.io/art_crop/front/7/1/71b03143-9e85-4061-88e6-ad621f75ec3b.jpg?1783933762","commanderLegal":"legal","set":"uma","releasedAt":"2018-12-07","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rhysticStudy = (): CardDef => ({"oracleId":"53236dd7-845a-444c-96d5-f41ed7325d8f","name":"Rhystic Study","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/f/9f37c5b6-a59c-45cd-9a99-e9357fe9ea1b.jpg?1783919146","artUrl":"https://cards.scryfall.io/art_crop/front/9/f/9f37c5b6-a59c-45cd-9a99-e9357fe9ea1b.jpg?1783919146","commanderLegal":"legal","set":"j22","releasedAt":"2022-12-02","rarity":"rare","layout":"normal","gameChanger":true}) as CardDef;
const exquisiteBlood = (): CardDef => ({"oracleId":"8f933fae-6c0c-42d7-a817-14760d8285cd","name":"Exquisite Blood","manaCost":"{4}{B}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever an opponent loses life, you gain that much life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/8/a83dad59-27a4-4dbb-bec8-f0683d6e2a67.jpg?1783924590","artUrl":"https://cards.scryfall.io/art_crop/front/a/8/a83dad59-27a4-4dbb-bec8-f0683d6e2a67.jpg?1783924590","commanderLegal":"legal","set":"sld","releasedAt":"2021-11-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const into = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Takes `pid`'s lands off the battlefield, so only what a test puts there pays. */
const noLands = (s: GameState, pid: PlayerId) => {
  s.battlefield = s.battlefield.filter((id) => !(s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).types.includes("Land")));
  invalidateCharacteristics(s);
};
const land = (s: GameState, pid: PlayerId, name: string) => s.battlefield.find((id) => s.objects[id]!.controller === pid && defOf(s, s.objects[id]!).name === name && !s.objects[id]!.tapped)!;
const tapFor = (s: GameState, pid: PlayerId, id: ObjectId, mana: "W" | "U" | "B" | "R" | "G" | "C") => act(s, { type: "activateMana", player: pid, objectId: id, mana });
const channelOn = (s: GameState, pid: PlayerId) => (s.turnRules ??= []).push({ turn: s.turn, player: pid, rule: "channel" });
const channelOnce = (s: GameState, pid: PlayerId) => act(s, { type: "channelMana", player: pid });

describe("Lane B round B294: Yavimaya Bloomsage // Channel", () => {
  it("compiles fully", () => {
    supported(bloomsage(), channel(), falseDawn(), manaFlare(), darkRitual(), bolt(), counterspell(), divination(), solRing(), sphere(), crawWurm(), emperion(), elves(), rhysticStudy(), exquisiteBlood());
  });

  it("at power 7 Bloomsage becomes prepared; its Channel copy lets its controller pay 1 life for {C} the rest of the turn", () => {
    const { s: s0, ap } = setup([]);
    const sage = putOnBattlefield(s0, ap, bloomsage());
    const wurm = putOnBattlefield(s0, ap, crawWurm());
    invalidateCharacteristics(s0);
    // The end step trigger: a +1/+1 counter on the Wurm (6/4 to 7/5), then the Bloomsage becomes prepared.
    let s = s0;
    for (let i = 0; i < 400 && !(s.pending?.kind === "chooseTargets" && s.pending.player === ap); i++) {
      if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: s.pending.player, attacks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.step).toBe("end");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(wurm)] }));
    expect(characteristics(s, s.objects[wurm]!).power).toBe(7);
    const copy = s.objects[sage]!.prepared?.copy;
    expect(copy && s.objects[copy]!.zone).toBe("exile");
    expect(defOf(s, s.objects[copy!]!).name).toBe("Channel");
    // Its next turn: cast the copy with two Forests, then pay life for {C} three times and cast Commander's Sphere from the pool.
    s = passUntil(passUntil(s, "upkeep"), "main1", ap);
    const sphereId = into(s, ap, sphere());
    expect(channelProblem(s, ap)).not.toBeNull();
    s = settle(run(s, planCast(s, ap, copy!)));
    expect(s.objects[sage]!.prepared).toBeUndefined();
    expect(channelProblem(s, ap)).toBeNull();
    expect(s.log.some((l) => /may pay 1 life to add \{C\}/.test(l.text))).toBe(true);
    const life = s.players[ap]!.life;
    for (let i = 0; i < 3; i++) s = channelOnce(s, ap);
    expect(s.players[ap]!.life).toBe(life - 3);
    expect(s.players[ap]!.manaPool.C).toBe(3);
    expect(s.log.filter((l) => l.text.endsWith("pays 1 life for {C} (Channel).")).length).toBe(3);
    // The pool pays all of it: no land is tapped.
    const plan = planCast(s, ap, sphereId);
    expect(plan?.map((a) => a.type)).toEqual(["castSpell"]);
    s = settle(run(s, plan));
    expect(s.objects[sphereId]!.zone).toBe("battlefield");
    expect(s.players[ap]!.manaPool.C).toBe(0);
  });

  it("only its controller, only when they could activate a mana ability, and only with life they can pay (CR 119.4, 119.8)", () => {
    const { s: s0, ap, opp, ids } = setup([bolt()]);
    channelOn(s0, ap);
    expect(channelProblem(s0, ap)).toBeNull();
    // Not another player's: and not while someone else has priority.
    expect(channelProblem(s0, opp)).not.toBeNull();
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).not.toBe(ap);
    expect(channelProblem(s, ap)).not.toBeNull();
    expect(() => channelOnce(s, ap)).toThrow();
    // With 0 life nothing can be paid; with 1 life, 1 can (and then the player has 0 and loses, CR 704.5a).
    const z = structuredClone(s0);
    z.players[ap]!.life = 0;
    expect(channelProblem(z, ap)).not.toBeNull();
    const one = structuredClone(s0);
    one.players[ap]!.life = 1;
    expect(channelProblem(one, ap)).toBeNull();
    expect(channelOnce(one, ap).players[ap]!.lost).toBe(true);
    // "Your life total can't change": no life can be paid (CR 119.8).
    const pe = structuredClone(s0);
    putOnBattlefield(pe, ap, emperion());
    invalidateCharacteristics(pe);
    expect(channelProblem(pe, ap)).not.toBeNull();
  });

  it("works while a payment is asked of its controller mid-resolution (Rhystic Study's {1})", () => {
    const { s: s0, ap, opp, ids } = setup([solRing()]);
    putOnBattlefield(s0, opp, rhysticStudy());
    noLands(s0, ap);
    channelOn(s0, ap);
    let s = channelOnce(s0, ap);
    s = run(s, planCast(s, ap, ids[0]!));
    const hand = s.players[opp]!.hand.length;
    for (let i = 0; i < 100 && !(s.pending?.kind === "payUnless" && s.pending.player === ap); i++) {
      if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending?.kind).toBe("payUnless");
    const life = s.players[ap]!.life;
    s = channelOnce(s, ap);
    expect(s.players[ap]!.life).toBe(life - 1);
    s = settle(act(s, { type: "payUnless", player: ap, pay: true }));
    expect(s.players[opp]!.hand.length).toBe(hand);
    expect(s.players[ap]!.manaPool.C).toBe(0);
  });

  it("the life paid is life lost: Exquisite Blood's trigger waits, then gains its controller 1 life", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, exquisiteBlood());
    channelOn(s0, ap);
    const life = s0.players[opp]!.life;
    let s = channelOnce(s0, ap);
    expect(s.stack.length).toBe(0);
    s = settle(act(s, { type: "passPriority", player: ap }));
    expect(s.players[opp]!.life).toBe(life + 1);
  });

  it("ends with the turn's cleanup step (CR 514.2)", () => {
    const { s: s0, ap } = setup([]);
    channelOn(s0, ap);
    const s = passUntil(s0, "upkeep");
    expect(s.activePlayer).not.toBe(ap);
    expect(s.turnRules?.some((r) => r.rule === "channel")).toBeFalsy();
  });

  it("a bot pays life for {C} only to cast a card it couldn't otherwise, keeping at least 10 life", () => {
    const { s, ap, ids } = setup([solRing()]);
    noLands(s, ap);
    s.players[ap]!.hand = [...ids];
    channelOn(s, ap);
    expect(botActions(s, ap)).toEqual([{ type: "channelMana", player: ap }]);
    const low = structuredClone(s);
    low.players[ap]!.life = 10;
    expect(botActions(low, ap).some((a) => a.type === "channelMana")).toBe(false);
  });
});

describe("Lane B round B294: False Dawn", () => {
  it("its controller's spells and abilities add white mana instead of colored, colorless stays, and white pays any color", () => {
    const { s: s0, ap, opp, ids } = setup([falseDawn(), darkRitual(), bolt()]);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const ring = putOnBattlefield(s, ap, solRing());
    const elf = putOnBattlefield(s, ap, elves());
    invalidateCharacteristics(s);
    // Draw a card (False Dawn itself left the hand).
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.log.some((l) => /add that much white mana instead, and .* may spend white mana as though it were mana of any color/.test(l.text))).toBe(true);
    // A Mountain and Llanowar Elves add {W}; Sol Ring still adds {C}{C}.
    s = tapFor(s, ap, land(s, ap, "Mountain"), "R");
    expect(s.players[ap]!.manaPool).toMatchObject({ W: 1, R: 0 });
    s = tapFor(s, ap, elf, "G");
    expect(s.players[ap]!.manaPool).toMatchObject({ W: 2, G: 0 });
    s = tapFor(s, ap, ring, "C");
    expect(s.players[ap]!.manaPool).toMatchObject({ W: 2, C: 2 });
    // It changes no permanent's color or land type (rulings).
    expect(characteristics(s, s.objects[elf]!).colors).toEqual(["G"]);
    expect(characteristics(s, s.objects[land(s, ap, "Mountain")]!).subtypes).toEqual(["Mountain"]);
    // Dark Ritual is paid with {W} as though it were {B} (CR 609.4b), and adds {W}{W}{W}.
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.manaPool).toMatchObject({ W: 4, B: 0, C: 2 });
    // Lightning Bolt's {R} too.
    s = settle(run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(40 - 3);
    expect(s.players[ap]!.manaPool).toMatchObject({ W: 3, C: 2 });
  });

  it("only spells and abilities its controller controls: another player's land adds its own color, their mana from its controller's Mana Flare is white", () => {
    const { s: s0, ap, opp, ids } = setup([falseDawn(), bolt()]);
    putOnBattlefield(s0, ap, manaFlare());
    const theirs = putOnBattlefield(s0, opp, { ...defOf(s0, s0.objects[land(s0, ap, "Mountain")]!) });
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // Yours: the Mountain makes {W}, and Mana Flare adds one more of the type it produced, {W}.
    s = tapFor(s, ap, land(s, ap, "Mountain"), "R");
    expect(s.players[ap]!.manaPool).toMatchObject({ W: 2, R: 0 });
    // Give the opponent priority: they tap their Mountain for {R}; your Mana Flare's ability adds {W}.
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(waitingOn(s)).toBe(opp);
    s = tapFor(s, opp, theirs, "R");
    expect(s.players[opp]!.manaPool).toMatchObject({ R: 1, W: 1 });
  });

  it("ends with the turn: the next turn a Mountain adds {R} again", () => {
    const { s: s0, ap, ids } = setup([falseDawn()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = passUntil(passUntil(s, "upkeep"), "main1", ap);
    expect(s.turnRules?.some((r) => r.rule === "whiteMana" || r.rule === "whiteAnyColor")).toBeFalsy();
    s = tapFor(s, ap, land(s, ap, "Mountain"), "R");
    expect(s.players[ap]!.manaPool).toMatchObject({ R: 1, W: 0 });
  });
});
