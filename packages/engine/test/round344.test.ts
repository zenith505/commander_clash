// Round 344 (Lane A): Brimaz, Blight of Oreskos ("a Phyrexian creature or artifact creature spell", "if a Phyrexian died
// under your control this turn"); The Foretold Soldier ("exile it face down. It becomes foretold."); The Eagles Are
// Coming! (a kicker that changes the targets, then a delayed trigger counting what it returned); Identity Thief (exile a
// creature, become a copy of it until end of turn, the card back at the next end step); Bronzehide Lion and Old-Growth
// Troll (returned from the graveyard as an Aura enchantment with an enchant ability and abilities from the effect).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PendingDecision, type PlayerId } from "../src";

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
/** A copy of `def` in `pid`'s `zone` (hand, graveyard or library, on top). */
const put = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "hand") s.players[pid]!.hand.push(id);
  else if (zone === "graveyard") s.players[pid]!.graveyard.push(id);
  else s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const tgt = (id: string) => ({ kind: "object" as const, id });
const tokens = (s: GameState, pid: PlayerId, n: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && name(s, id).replace(/ Token$/, "") === n);

// Real oracle text (Scryfall).
const brimaz = (): CardDef => ({"oracleId":"a6e7cbfc-6d5a-4a67-9dad-d512d3c97bda","name":"Brimaz, Blight of Oreskos","manaCost":"{2}{W}{B}","cmc":4,"typeLine":"Legendary Creature — Phyrexian Cat","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Phyrexian","Cat"],"oracleText":"Whenever you cast a Phyrexian creature or artifact creature spell, incubate X, where X is that spell's mana value. (Create an Incubator token with X +1/+1 counters on it and \"{2}: Transform this token.\" It transforms into a 0/0 Phyrexian artifact creature.)\nAt the beginning of each end step, if a Phyrexian died under your control this turn, proliferate.","power":"3","toughness":"4","colors":["B","W"],"colorIdentity":["B","W"],"keywords":["Incubate","Transform","Proliferate"],"imageUrl":"https://cards.scryfall.io/normal/front/f/0/f0d31ae7-8580-402a-a917-3d626a9e1f49.jpg?1783917295","artUrl":"https://cards.scryfall.io/art_crop/front/f/0/f0d31ae7-8580-402a-a917-3d626a9e1f49.jpg?1783917295","commanderLegal":"legal","set":"moc","releasedAt":"2023-04-21","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const soldier = (): CardDef => ({"oracleId":"02a45719-ee4a-49c4-96ec-a140cd6e1547","name":"The Foretold Soldier","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Creature — Alien Zombie Soldier","supertypes":[],"types":["Creature"],"subtypes":["Alien","Zombie","Soldier"],"oracleText":"This creature must be blocked if able.\nThis creature can't be blocked by more than one creature.\nWhenever this creature deals damage, exile it face down. It becomes foretold.\nForetell {1}{G} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)","power":"6","toughness":"6","colors":["G"],"colorIdentity":["G"],"keywords":["Foretell"],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98a3e73e-9c81-4102-8163-4158e6e2f602.jpg?1783914542","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98a3e73e-9c81-4102-8163-4158e6e2f602.jpg?1783914542","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const eagles = (): CardDef => ({"oracleId":"169a4a77-12ff-4997-9550-bdcd456aa2f7","name":"The Eagles Are Coming!","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Kicker {2}{W}{W} (You may pay an additional {2}{W}{W} as you cast this spell.)\nChoose target creature you own. If this spell was kicked, instead choose any number of target creatures you own. Return each chosen creature to your hand. At the beginning of the next upkeep, create a 4/4 white Bird Soldier creature token with flying for each creature returned to your hand this way.","colors":["W"],"colorIdentity":["W"],"keywords":["Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0bda1b62-47fc-42c2-a841-ccad8ea0db48.jpg?1784376936","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0bda1b62-47fc-42c2-a841-ccad8ea0db48.jpg?1784376936","commanderLegal":"legal","set":"hob","releasedAt":"2026-08-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const thief = (): CardDef => ({"oracleId":"a200daec-983c-4ea6-ae98-1c963b50fbb1","name":"Identity Thief","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Whenever this creature attacks, you may exile another target nontoken creature. If you do, this creature becomes a copy of that creature until end of turn. Return the exiled card to the battlefield under its owner's control at the beginning of the next end step.","power":"0","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/9865100f-dddc-407e-a379-2c285475ec89.jpg?1783937499","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/9865100f-dddc-407e-a379-2c285475ec89.jpg?1783937499","commanderLegal":"legal","set":"emn","releasedAt":"2016-07-22","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lion = (): CardDef => ({"oracleId":"0db3b29e-e21c-4240-8e5e-959ba6bcf706","name":"Bronzehide Lion","manaCost":"{G}{W}","cmc":2,"typeLine":"Creature — Cat","supertypes":[],"types":["Creature"],"subtypes":["Cat"],"oracleText":"{G}{W}: This creature gains indestructible until end of turn.\nWhen this creature dies, return it to the battlefield. It's an Aura enchantment with enchant creature you control and \"{G}{W}: Enchanted creature gains indestructible until end of turn,\" and it loses all other abilities.","power":"3","toughness":"3","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/f/8fdafadb-fa04-4282-b576-b85e79c242c9.jpg?1783931524","artUrl":"https://cards.scryfall.io/art_crop/front/8/f/8fdafadb-fa04-4282-b576-b85e79c242c9.jpg?1783931524","commanderLegal":"legal","set":"thb","releasedAt":"2020-01-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const troll = (): CardDef => ({"oracleId":"11e3f1d3-9d78-4c00-b965-e14407fd5210","name":"Old-Growth Troll","manaCost":"{G}{G}{G}","cmc":3,"typeLine":"Creature — Troll Warrior","supertypes":[],"types":["Creature"],"subtypes":["Troll","Warrior"],"oracleText":"Trample\nWhen Old-Growth Troll dies, if it was a creature, return it to the battlefield. It's an Aura enchantment with enchant Forest you control and \"Enchanted Forest has '{T}: Add {G}{G}' and '{1}, {T}, Sacrifice this land: Create a tapped 4/4 green Troll Warrior creature token with trample.'\"","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Trample"],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/b/7/b759b0f6-342c-4bba-89f1-8451835d8c45.jpg?1783928208","artUrl":"https://cards.scryfall.io/art_crop/front/b/7/b759b0f6-342c-4bba-89f1-8451835d8c45.jpg?1783928208","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const forestCard = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const phyrexianRager = (): CardDef => ({"oracleId":"e409c9be-0c9a-43c3-adb4-8c47afc1d551","name":"Phyrexian Rager","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Phyrexian Horror","supertypes":[],"types":["Creature"],"subtypes":["Phyrexian","Horror"],"oracleText":"When this creature enters, you draw a card and you lose 1 life.","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/f/6fd574e7-705f-4a65-aad0-68ff6d63bf0f.jpg?1783921329","artUrl":"https://cards.scryfall.io/art_crop/front/6/f/6fd574e7-705f-4a65-aad0-68ff6d63bf0f.jpg?1783921329","commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const llanowar = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const wrath = (): CardDef => ({"oracleId":"34515b16-c9a4-4f98-8c77-416a7a523407","name":"Wrath of God","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all creatures. They can't be regenerated.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98890cd7-ebd5-4fea-814e-4f612abfe3a5.jpg?1783939131","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98890cd7-ebd5-4fea-814e-4f612abfe3a5.jpg?1783939131","commanderLegal":"legal","set":"v14","releasedAt":"2014-08-22","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const watchwolf = (): CardDef => ({"oracleId":"a35c2e20-eb90-4132-b65f-be1fcb569819","name":"Watchwolf","manaCost":"{G}{W}","cmc":2,"typeLine":"Creature — Wolf","supertypes":[],"types":["Creature"],"subtypes":["Wolf"],"oracleText":"","power":"3","toughness":"3","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/5/95e5828a-3e54-4b9c-9e84-21880930f2d5.jpg?1783943608","artUrl":"https://cards.scryfall.io/art_crop/front/9/5/95e5828a-3e54-4b9c-9e84-21880930f2d5.jpg?1783943608","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const revoker = (): CardDef => ({"oracleId":"786b3657-b595-4b38-83f2-d40915e51e2b","name":"Phyrexian Revoker","manaCost":"{2}","cmc":2,"typeLine":"Artifact Creature — Phyrexian Horror","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Phyrexian","Horror"],"oracleText":"As this creature enters, choose a nonland card name.\nActivated abilities of sources with the chosen name can't be activated.","power":"2","toughness":"1","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/8/28f4e755-7448-4a06-b76f-d4a03e06ccbc.jpg?1783919743","artUrl":"https://cards.scryfall.io/art_crop/front/2/8/28f4e755-7448-4a06-b76f-d4a03e06ccbc.jpg?1783919743","commanderLegal":"legal","set":"brr","releasedAt":"2022-11-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rager = (): CardDef => ({"oracleId":"e409c9be-0c9a-43c3-adb4-8c47afc1d551","name":"Phyrexian Rager","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Phyrexian Horror","supertypes":[],"types":["Creature"],"subtypes":["Phyrexian","Horror"],"oracleText":"When this creature enters, you draw a card and you lose 1 life.","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/f/6fd574e7-705f-4a65-aad0-68ff6d63bf0f.jpg?1783921329","artUrl":"https://cards.scryfall.io/art_crop/front/6/f/6fd574e7-705f-4a65-aad0-68ff6d63bf0f.jpg?1783921329","commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("round 344: compiles", () => {
  it("every card of the round", () => supported(brimaz(), soldier(), eagles(), thief(), lion(), troll()));
});

describe("round 344: Brimaz, Blight of Oreskos", () => {
  it("a Phyrexian creature spell or an artifact creature spell incubates its mana value; a Phyrexian artifact creature once", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, brimaz());
    const r = put(s, ap, rager(), "hand");
    const o = put(s, ap, ornithopter(), "hand");
    const v = put(s, ap, revoker(), "hand");
    const b = put(s, ap, bears(), "hand");
    s = settle(run(s, planCast(s, ap, r)), ap);
    const incubators = () => tokens(s, ap, "Incubator");
    expect(incubators().length).toBe(1);
    expect(s.objects[incubators()[0]!]!.counters["+1/+1"]).toBe(3);
    s = settle(run(s, planCast(s, ap, b)), ap);
    expect(incubators().length).toBe(1);
    s = settle(run(s, planCast(s, ap, o)), ap);
    expect(incubators().length).toBe(2);
    // Phyrexian Revoker names a card as it enters; the bot-style answer is fine here.
    s = settle(run(s, planCast(s, ap, v)));
    expect(incubators().length).toBe(3);
  });

  it("at the beginning of each end step, proliferates only if a Phyrexian died under its controller's control this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, brimaz());
    const mine = putOnBattlefield(s, ap, rager());
    const theirs = putOnBattlefield(s, opp, rager());
    const counted = putOnBattlefield(s, ap, bears());
    s.objects[counted]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    // An opponent's Phyrexian dying doesn't count.
    const m1 = put(s, ap, lightningBolt(), "hand");
    s = settle(run(s, planCast(s, ap, m1, [tgt(theirs)])), ap);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    let t = settle(passUntil(s, "end", ap), ap);
    t = settle(t, ap);
    expect(t.objects[counted]!.counters["+1/+1"]).toBe(1);
    // Its own Phyrexian dying does.
    const m2 = put(s, ap, murder(), "hand");
    s = settle(run(s, planCast(s, ap, m2, [tgt(mine)])), ap);
    s = passUntil(s, "end", ap);
    for (let i = 0; i < 40 && s.objects[counted]!.counters["+1/+1"] !== 2; i++) s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), ap);
    if (s.pending) s = settle(run(s, botActions(s, ap)), ap);
    expect(s.objects[counted]!.counters["+1/+1"]).toBe(2);
  });
});

describe("round 344: The Foretold Soldier", () => {
  it("dealing damage exiles it face down, foretold: its owner casts it on a later turn for its foretell cost", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const me = putOnBattlefield(s, ap, soldier());
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] });
    s = settle(passUntil(settle(s, ap), "combatDamage", ap), ap);
    const life = s.players[opp]!.life;
    for (let i = 0; i < 20 && s.objects[me]!.zone === "battlefield"; i++) s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), ap);
    expect(s.players[opp]!.life).toBeLessThanOrEqual(life);
    const o = s.objects[me]!;
    expect(o.zone).toBe("exile");
    expect(o.foretold).toBe(true);
    expect(o.mayPlay).toMatchObject({ player: ap, until: "foretell", turn: s.turn });
    expect(s.log.some((l) => /becomes foretold/.test(l.text))).toBe(true);
    // Not this turn (CR 702.143a); on its owner's next turn, for {1}{G}.
    s = passUntil(s, "main2", ap);
    expect(planCast(s, ap, me, undefined, undefined, "auto", undefined, { alt: "foretell" })).toBeNull();
    s = passUntil(s, "main1", opp);
    s = passUntil(s, "main1", ap);
    const plan = planCast(s, ap, me, undefined, undefined, "auto", undefined, { alt: "foretell" });
    expect(plan).not.toBeNull();
    s = settle(run(s, plan), ap);
    expect(s.objects[me]!.zone).toBe("battlefield");
  });

  it("a token Soldier is exiled and ceases to exist, never foretold (CR 111.7)", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const me = putOnBattlefield(s, ap, soldier());
    s.objects[me]!.isToken = true;
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] });
    s = settle(passUntil(settle(s, ap), "combatDamage", ap), ap);
    for (let i = 0; i < 20 && s.objects[me]?.zone === "battlefield"; i++) s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), ap);
    expect(s.objects[me]?.zone === "battlefield").toBe(false);
    expect(s.objects[me]?.foretold).toBeFalsy();
  });
});

describe("round 344: The Eagles Are Coming!", () => {
  it("unkicked: one creature you own back to your hand, a 4/4 flying Bird Soldier at the next upkeep", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const e = put(s, ap, eagles(), "hand");
    const mine = putOnBattlefield(s, ap, bears());
    const other = putOnBattlefield(s, ap, watchwolf());
    const theirs = putOnBattlefield(s, opp, bears());
    // Only one target unkicked; never a creature you don't own.
    expect(planCast(s, ap, e, [tgt(mine), tgt(other)])).toBeNull();
    expect(planCast(s, ap, e, [tgt(theirs)]) ?? planCast(s, ap, e, [tgt(theirs), { kind: "none" }])).toBeNull();
    s = settle(run(s, planCast(s, ap, e, [tgt(mine)]) ?? planCast(s, ap, e, [tgt(mine), { kind: "none" }])), ap);
    expect(s.objects[mine]!.zone).toBe("hand");
    expect(s.objects[other]!.zone).toBe("battlefield");
    expect(tokens(s, ap, "Bird Soldier").length).toBe(0);
    // The next upkeep is the next player's.
    s = settle(passUntil(s, "upkeep", opp), ap);
    s = settle(passUntil(s, "draw", opp), ap);
    const birds = tokens(s, ap, "Bird Soldier");
    expect(birds.length).toBe(1);
    expect(objHasKeyword(s, s.objects[birds[0]!]!, "Flying")).toBe(true);
  });

  it("kicked: any number of creatures you own, a token too, even one an opponent controls; a Bird for each", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const e = put(s, ap, eagles(), "hand");
    const a = putOnBattlefield(s, ap, bears());
    const b = putOnBattlefield(s, ap, watchwolf());
    b && (s.objects[b]!.isToken = true);
    const stolen = putOnBattlefield(s, opp, llanowar());
    s.objects[stolen]!.owner = ap;
    invalidateCharacteristics(s);
    const targets = [tgt(a), tgt(b), tgt(stolen)];
    const plan = planCast(s, ap, e, [{ kind: "none" }, ...targets], undefined, "auto", undefined, { kicks: [0] }) ?? planCast(s, ap, e, targets, undefined, "auto", undefined, { kicks: [0] });
    s = settle(run(s, plan), ap);
    expect(s.objects[a]!.zone).toBe("hand");
    expect(s.objects[stolen]!.zone).toBe("hand");
    expect(s.players[ap]!.hand).toContain(stolen);
    expect(s.objects[b]?.zone === "battlefield").toBe(false);
    s = settle(passUntil(s, "draw", opp), ap);
    expect(tokens(s, ap, "Bird Soldier").length).toBe(3);
  });
});

describe("round 344: Identity Thief", () => {
  it("exiles the target, becomes a copy of it until end of turn; the card comes back at the next end step", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const me = putOnBattlefield(s, ap, thief());
    const wolf = putOnBattlefield(s, opp, watchwolf());
    s.objects[wolf]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s);
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] });
    s = settle(s, ap);
    pend(s, "chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(wolf)] }), ap);
    pend(s, "chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.objects[wolf]!.zone).toBe("exile");
    // The copiable values only (CR 707.2): not the counters it had.
    expect(name(s, me)).toBe("Watchwolf");
    expect(characteristics(s, s.objects[me]!).power).toBe(3);
    expect(s.objects[me]!.attacking).toBe(opp);
    // At the beginning of the end step the card returns, under its owner's control; the Thief is still a copy then.
    s = passUntil(s, "end", ap);
    s = settle(s, ap);
    expect(s.objects[wolf]).toMatchObject({ zone: "battlefield", controller: opp });
    expect(s.objects[wolf]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(name(s, me)).toBe("Watchwolf");
    s = passUntil(s, "upkeep", opp);
    expect(name(s, me)).toBe("Identity Thief");
  });

  it("declined, nothing is exiled and it stays Identity Thief", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const me = putOnBattlefield(s, ap, thief());
    const wolf = putOnBattlefield(s, opp, watchwolf());
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] });
    s = settle(act(settle(s, ap), { type: "chooseTargets", player: ap, targets: [tgt(wolf)] }), ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.objects[wolf]!.zone).toBe("battlefield");
    expect(name(s, me)).toBe("Identity Thief");
  });
});

describe("round 344: Bronzehide Lion", () => {
  it("dies, returns as an Aura on a creature you control with only the granted ability, which gives indestructible", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const me = putOnBattlefield(s, ap, lion());
    const host = putOnBattlefield(s, ap, bears());
    const m = put(s, ap, murder(), "hand");
    s = settle(run(s, planCast(s, ap, m, [tgt(me)])), ap);
    const o = s.objects[me]!;
    expect(o.zone).toBe("battlefield");
    expect(o.attachedTo).toBe(host);
    const c = characteristics(s, o);
    expect(c.types).toEqual(["Enchantment"]);
    expect(c.subtypes).toEqual(["Aura"]);
    expect(c.name).toBe("Bronzehide Lion");
    expect(c.colors).toEqual(["G", "W"]);
    // Its own "{G}{W}: This creature gains indestructible" is gone; the granted one is its only activated ability.
    s = settle(run(s, planActivate(s, ap, me, 0)), ap);
    expect(objHasKeyword(s, s.objects[host]!, "Indestructible")).toBe(true);
    expect(objHasKeyword(s, s.objects[me]!, "Indestructible")).toBe(false);
    expect(planActivate(s, ap, me, 1)).toBeNull();
    // Its creature dying takes it to the graveyard as an Aura (CR 704.5m): it wasn't a creature, so it stays there.
    const b = put(s, ap, lightningBolt(), "hand");
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "main1", ap);
    s = settle(run(s, planCast(s, ap, b, [tgt(host)])), ap);
    expect(s.objects[host]!.zone).toBe("graveyard");
    expect(s.objects[me]!.zone).toBe("graveyard");
  });

  it("with no creature of yours to enchant it stays in the graveyard; with two, its controller chooses", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const me = putOnBattlefield(s, ap, lion());
    putOnBattlefield(s, opp, bears());
    const m = put(s, ap, murder(), "hand");
    s = settle(run(s, planCast(s, ap, m, [tgt(me)])), ap);
    expect(s.objects[me]!.zone).toBe("graveyard");
    expect(s.log.some((l) => /nothing it could enchant/.test(l.text))).toBe(true);

    const { s: t0, ap: ap2 } = setup([]);
    let t = t0;
    const me2 = putOnBattlefield(t, ap2, lion());
    putOnBattlefield(t, ap2, bears());
    const wolf = putOnBattlefield(t, ap2, watchwolf());
    const m2 = put(t, ap2, murder(), "hand");
    t = settle(run(t, planCast(t, ap2, m2, [tgt(me2)])), ap2);
    const p = pend(t, "chooseOption");
    expect(p.what).toBe("enchant");
    expect(p.options.length).toBe(2);
    t = settle(act(t, { type: "chooseOption", player: ap2, choice: wolf }), ap2);
    expect(t.objects[me2]!.attachedTo).toBe(wolf);
  });

  it("a token copy doesn't come back (rulings)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const me = putOnBattlefield(s, ap, lion());
    s.objects[me]!.isToken = true;
    putOnBattlefield(s, ap, bears());
    const m = put(s, ap, murder(), "hand");
    s = settle(run(s, planCast(s, ap, m, [tgt(me)])), ap);
    expect(s.objects[me]?.zone === "battlefield").toBe(false);
  });
});

describe("round 344: Old-Growth Troll", () => {
  it("returns enchanting a Forest you control, which taps for {G}{G} and can make a Troll Warrior; its own abilities stay", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    // One Forest only, so there's no choice.
    for (const id of [...s.battlefield]) if (s.objects[id]!.controller === ap && name(s, id) === "Forest") {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      delete s.objects[id];
    }
    const forest = putOnBattlefield(s, ap, forestCard());
    const me = putOnBattlefield(s, ap, troll());
    invalidateCharacteristics(s);
    const m = put(s, ap, murder(), "hand");
    s = settle(run(s, planCast(s, ap, m, [tgt(me)])), ap);
    const o = s.objects[me]!;
    expect(o.zone).toBe("battlefield");
    expect(o.attachedTo).toBe(forest);
    expect(characteristics(s, o).types).toEqual(["Enchantment"]);
    expect(objHasKeyword(s, o, "Trample")).toBe(true);
    // "{1}, {T}, Sacrifice this land: Create a tapped 4/4 green Troll Warrior creature token with trample."
    const plan = planActivate(s, ap, forest, 0) ?? planActivate(s, ap, forest, 1);
    expect(plan).not.toBeNull();
    s = settle(run(s, plan), ap);
    const made = tokens(s, ap, "Troll Warrior");
    expect(made.length).toBe(1);
    expect(s.objects[made[0]!]!.tapped).toBe(true);
    expect(s.objects[forest]!.zone).toBe("graveyard");
    // The Aura then goes to the graveyard (CR 704.5m), not as a creature: no return.
    expect(s.objects[me]!.zone).toBe("graveyard");
  });
});

describe("round 344: bots", () => {
  it("Identity Thief: a bot exiles an opponent's best creature, not its own", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const me = putOnBattlefield(s, ap, thief());
    const own = putOnBattlefield(s, ap, watchwolf());
    const theirs = putOnBattlefield(s, opp, watchwolf());
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] });
    s = settle(s);
    expect(s.objects[own]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.zone).toBe("exile");
    expect(name(s, me)).toBe("Watchwolf");
  });
});

describe("round 344: bots, The Eagles Are Coming!", () => {
  it("a bot doesn't cast it just to return its own creature in its main phase", () => {
    const { s: s0, ap } = setup([]);
    const s = s0;
    const e = put(s, ap, eagles(), "hand");
    putOnBattlefield(s, ap, bears());
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "castSpell" && a.objectId === e)).toBe(false);
  });
});
