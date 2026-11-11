// Lane B round B179: Drain Life and Consume Spirit ("Spend only black mana on X" in a spell with more than {X}), Countersculpt
// and Theorist's Sanctum (behold a Jace, a planeswalker type), Ancestral Communion (copied when cast while you control your
// commander).

import { describe, expect, it } from "vitest";
import { act, island, mountain, passUntil, plainsCard, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, invalidateCharacteristics, moveObject, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const drain = (): CardDef => ({"oracleId":"e75ba79f-4cc2-4ede-8641-559ab94e7e36","name":"Drain Life","manaCost":"{X}{1}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Spend only black mana on X.\nDrain Life deals X damage to any target. You gain life equal to the damage dealt, but not more life than the player's life total before the damage was dealt, the planeswalker's loyalty before the damage was dealt, or the creature's toughness.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/8/e8f030a5-62c6-439d-93b6-43f2cf927a7f.jpg?1783947094","artUrl":"https://cards.scryfall.io/art_crop/front/e/8/e8f030a5-62c6-439d-93b6-43f2cf927a7f.jpg?1783947094","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const consume = (): CardDef => ({"oracleId":"861fa80d-99e0-4332-a2b8-5aa959fd41a4","name":"Consume Spirit","manaCost":"{X}{1}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Spend only black mana on X.\nConsume Spirit deals X damage to any target and you gain X life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/d/5db2f958-947b-4b52-a5cd-e8f8b5576803.jpg?1783942385","artUrl":"https://cards.scryfall.io/art_crop/front/5/d/5db2f958-947b-4b52-a5cd-e8f8b5576803.jpg?1783942385","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sculpt = (): CardDef => ({"oracleId":"fc3353e9-fe24-4ca7-bff8-9da767f2903a","name":"Countersculpt","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, behold a Jace or pay {1}. (To behold a Jace, choose a Jace you control or reveal a Jace card from your hand.)\nCounter target spell. Empower Jace 1. (Put a loyalty counter on a Jace token you control. If you don't control one, first create a blue Jace planeswalker token with \"[−1]: Surveil 1\" and \"[−3]: Draw a card.\")","colors":["U"],"colorIdentity":["U"],"keywords":["Surveil","Empower Jace","Behold"],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/145b928d-a7ff-4fe5-ae4d-bbae7b1d955b.jpg?1788878107","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/145b928d-a7ff-4fe5-ae4d-bbae7b1d955b.jpg?1788878107","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sanctum = (): CardDef => ({"oracleId":"37513bd8-7303-4ac6-a7a7-224184faf758","name":"Theorist's Sanctum","manaCost":"","cmc":0,"typeLine":"Land — Island","supertypes":[],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)\nAs this land enters, you may behold a Jace. If you don't, this land enters tapped. (To behold a Jace, choose a Jace you control or reveal a Jace card from your hand.)\n{2}{U}, {T}: Empower Jace 2.","colors":[],"colorIdentity":["U"],"keywords":["Empower Jace","Behold"],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/22db5bba-46c9-4a26-821d-303ddb386ea4.jpg?1788878256","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/22db5bba-46c9-4a26-821d-303ddb386ea4.jpg?1788878256","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const communion = (): CardDef => ({"oracleId":"a45bb088-16fd-4d91-8fd6-3c52f1c24748","name":"Ancestral Communion","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"When you cast this spell while you control your commander, copy this spell. You may choose a new target for the copy.\nReturn target permanent card from your graveyard to your hand.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/d/ad4224f8-ee83-4833-99a1-71e3ecbe9718.jpg?1783903279","artUrl":"https://cards.scryfall.io/art_crop/front/a/d/ad4224f8-ee83-4833-99a1-71e3ecbe9718.jpg?1783903279","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const jace = (): CardDef => ({"oracleId":"bf0e9e00-fba5-448a-9052-ae730aea4bf8","name":"Jace, Reality Sculptor","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+1: Empower Jace X, where X is the number of Islands you control.\n−3: Until your next turn, whenever a creature attacks you or a planeswalker you control, it gets -5/-0 until end of turn.\n0: Exile all but the bottom card of each opponent's library. Activate only if there are twenty-five or more loyalty counters among Jaces you control.","loyalty":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Empower Jace"],"imageUrl":"https://cards.scryfall.io/normal/front/7/4/74087795-0b38-4fd2-9841-147583baca41.jpg?1790075861","artUrl":"https://cards.scryfall.io/art_crop/front/7/4/74087795-0b38-4fd2-9841-147583baca41.jpg?1790075861","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const jaceB = (): CardDef => ({"oracleId":"cc2b6e58-2d6f-495e-95f3-9496105c4cba","name":"Jace Beleren","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.","loyalty":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","commanderLegal":"legal","set":"dd2","releasedAt":"2008-11-07","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const baral = (): CardDef => ({"oracleId":"baf80db7-2ca8-4bfc-b5b6-25ed51878dd7","name":"Baral, Chief of Compliance","manaCost":"{1}{U}","cmc":2,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Instant and sorcery spells you cast cost {1} less to cast.\nWhenever a spell or ability you control counters a spell, you may draw a card. If you do, discard a card.","power":"1","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/7/47eb1fa4-a332-4618-a400-c082719f7d5f.jpg?1783916876","artUrl":"https://cards.scryfall.io/art_crop/front/4/7/47eb1fa4-a332-4618-a400-c082719f7d5f.jpg?1783916876","commanderLegal":"legal","set":"mul","releasedAt":"2023-04-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const salve = (): CardDef => ({"oracleId":"8da8644c-75a1-4fe9-8e94-900d948d631c","name":"Healing Salve","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Target player gains 3 life.\n• Prevent the next 3 damage that would be dealt to any target this turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/89146f6a-583f-4ed1-8b43-75e9a55892c6.jpg?1783946374","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/89146f6a-583f-4ed1-8b43-75e9a55892c6.jpg?1783946374","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const warden = (): CardDef => ({"oracleId":"981138d0-bf61-406a-85be-68cc5e58796c","name":"Tapestry Warden","manaCost":"{3}{G}","cmc":4,"typeLine":"Artifact Creature — Robot Soldier","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Robot","Soldier"],"oracleText":"Vigilance\nEach creature you control with toughness greater than its power assigns combat damage equal to its toughness rather than its power.\nEach creature you control with toughness greater than its power stations permanents using its toughness rather than its power.","power":"3","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/7/c/7cbbab6c-43ae-4e50-97ce-532a3316591a.jpg?1783905930","artUrl":"https://cards.scryfall.io/art_crop/front/7/c/7cbbab6c-43ae-4e50-97ce-532a3316591a.jpg?1783905930","commanderLegal":"legal","set":"eoe","releasedAt":"2025-08-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sawship = (): CardDef => ({"oracleId":"dfe8f77a-cc26-438b-92ae-2ca7a91f813b","name":"Galvanizing Sawship","manaCost":"{5}{R}","cmc":6,"typeLine":"Artifact — Spacecraft","supertypes":[],"types":["Artifact"],"subtypes":["Spacecraft"],"oracleText":"Station (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It's an artifact creature at 3+.)\n3+ | Flying, haste","power":"6","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Station"],"imageUrl":"https://cards.scryfall.io/normal/front/5/b/5bbce9fb-401f-4e78-acd5-9d3b506687fd.jpg?1783905955","artUrl":"https://cards.scryfall.io/art_crop/front/5/b/5bbce9fb-401f-4e78-acd5-9d3b506687fd.jpg?1783905955","commanderLegal":"legal","set":"eoe","releasedAt":"2025-08-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const wallStone = (): CardDef => ({"oracleId":"cd4cadb4-3156-49bd-b36e-12ba5c85938b","name":"Wall of Stone","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Creature — Wall","supertypes":[],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Defender (This creature can't attack.)","power":"0","toughness":"8","colors":["R"],"colorIdentity":["R"],"keywords":["Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/140e567c-6e4a-42b0-8084-d6c9695ae802.jpg?1783948680","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/140e567c-6e4a-42b0-8084-d6c9695ae802.jpg?1783948680","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const lash = (): CardDef => ({"oracleId":"16de96d0-a58e-42a7-9a13-45358542a246","name":"Counterlash","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell. You may cast a spell that shares a card type with it from your hand without paying its mana cost.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/3/d3ec2c57-8e67-472d-8f2e-0492d311f130.jpg?1783940844","artUrl":"https://cards.scryfall.io/art_crop/front/d/3/d3ec2c57-8e67-472d-8f2e-0492d311f130.jpg?1783940844","commanderLegal":"legal","set":"dka","releasedAt":"2012-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const decay = (): CardDef => ({"oracleId":"1c747fe2-289e-492a-a846-aa77707e2dc3","name":"Abrupt Decay","manaCost":"{B}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"This spell can't be countered.\nDestroy target nonland permanent with mana value 3 or less.","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/f/9f5a5d37-fbf7-4c3d-b0f2-f6bc139ef2cd.jpg?1783903510","artUrl":"https://cards.scryfall.io/art_crop/front/9/f/9f5a5d37-fbf7-4c3d-b0f2-f6bc139ef2cd.jpg?1783903510","commanderLegal":"legal","set":"sld","releasedAt":"2026-04-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
/** The card definition of `pid`'s commander. */
const commanderDef = (s: GameState, pid: PlayerId): CardDef => s.cards[Object.values(s.objects).find((o) => o.isCommander && o.owner === pid)!.cardId]!;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or a question is asked. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** A fresh copy of `def` in `zone` of `pid`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** `hand` in hand and only these lands on the battlefield for the active player. */
const withLands = (hand: CardDef[], lands: CardDef[]) => {
  const { s, ap, ids, opp } = setup(hand);
  for (const id of [...s.battlefield]) if (s.objects[id]!.controller === ap) s.battlefield.splice(s.battlefield.indexOf(id), 1), delete s.objects[id];
  for (const l of lands) putOnBattlefield(s, ap, l);
  invalidateCharacteristics(s);
  return { s, ap, ids, opp };
};
const lands = (b: number, r: number) => [...Array.from({ length: b }, () => swamp), ...Array.from({ length: r }, () => mountain)];

describe("Lane B round B179: cards", () => {
  it("compile", () => supported(drain(), consume(), sculpt(), sanctum(), communion(), warden(), lash()));
});

describe("Drain Life and Consume Spirit: Spend only black mana on X", () => {
  it("X is paid with black mana only; the {1} can be any", () => {
    const { s, ap, ids, opp } = withLands([drain()], lands(3, 2));
    const p = { kind: "player", id: opp } as TargetChoice;
    // X 3 needs four black mana with the {B}: only three Swamps.
    expect(planCast(s, ap, ids[0]!, [p], undefined, undefined, 3)).toBeNull();
    // X 2: the Swamps pay X and {B}, a Mountain pays {1}.
    expect(planCast(s, ap, ids[0]!, [p], undefined, undefined, 2)).not.toBeNull();
    // Mountains alone never pay X.
    const red = withLands([drain()], lands(1, 4));
    expect(planCast(red.s, red.ap, red.ids[0]!, [p], undefined, undefined, 1)).toBeNull();
    expect(planCast(red.s, red.ap, red.ids[0]!, [p], undefined, undefined, 0)).not.toBeNull();
  });

  it("a cost reduction can take off X's part, so less of it needs black mana (rulings)", () => {
    const { s, ap, ids, opp } = withLands([drain()], lands(3, 1));
    const p = { kind: "player", id: opp } as TargetChoice;
    expect(planCast(s, ap, ids[0]!, [p], undefined, undefined, 3)).toBeNull();
    putOnBattlefield(s, ap, baral());
    // {X}{1}{B} with X 3 less {1}: {B} and three generic, two of them X's, paid by three Swamps and a Mountain.
    expect(planCast(s, ap, ids[0]!, [p], undefined, undefined, 3)).not.toBeNull();
    expect(planCast(s, ap, ids[0]!, [p], undefined, undefined, 4)).toBeNull();
  });

  it("Drain Life gains the damage dealt to a player, no more than their life total before it", () => {
    let { s, ap, ids, opp } = withLands([drain(), drain()], lands(10, 2));
    const before = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, 3)));
    expect(s.players[opp]!.life).toBe(37);
    expect(s.players[ap]!.life).toBe(before + 3);
    s.players[opp]!.life = 2;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }], undefined, undefined, 5)));
    expect(s.players[ap]!.life).toBe(before + 3 + 2);
  });

  it("Drain Life on a creature gains no more than its toughness, even if it was already damaged (rulings)", () => {
    let { s, ap, ids, opp } = withLands([drain()], lands(10, 2));
    const b = putOnBattlefield(s, opp, bears());
    s.objects[b]!.damage = 1;
    const before = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)], undefined, undefined, 5)));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(before + 2);
  });

  it("Drain Life on a planeswalker gains no more than its loyalty before the damage", () => {
    let { s, ap, ids, opp } = withLands([drain()], lands(10, 2));
    const j = putOnBattlefield(s, opp, jaceB());
    s.objects[j]!.counters.loyalty = 3;
    const before = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(j)], undefined, undefined, 6)));
    expect(s.objects[j]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(before + 3);
  });

  it("Drain Life gains only the damage really dealt: prevented damage gives no life", () => {
    let { s, ap, ids, opp } = withLands([drain()], lands(10, 2));
    const b = putOnBattlefield(s, opp, bears());
    const salveId = into(s, opp, salve(), "hand");
    putOnBattlefield(s, opp, plainsCard);
    const before = s.players[ap]!.life;
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b)], undefined, undefined, 3));
    // The opponent prevents the next 3 damage to the Bears in response.
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, opp, salveId, [tgt(b)], [1]));
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(before);
  });

  it("Consume Spirit deals X damage and you gain X life", () => {
    let { s, ap, ids, opp } = withLands([consume()], lands(5, 1));
    const before = s.players[ap]!.life;
    expect(planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, 5)).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, 4)));
    expect(s.players[opp]!.life).toBe(36);
    expect(s.players[ap]!.life).toBe(before + 4);
  });

  it("a bot casts Drain Life for no more X than its black mana pays", () => {
    const { s, ap, ids } = withLands([drain()], lands(3, 3));
    s.players[ap]!.landsPlayedThisTurn = 1;
    const plan = botActions(s, ap).find((a) => a.type === "castSpell" && a.objectId === ids[0]);
    expect(plan).toMatchObject({ type: "castSpell", x: 2 });
  });
});

describe("Countersculpt: behold a Jace or pay {1}", () => {
  const boltAtYou = (hand: CardDef[], landsFor: CardDef[]) => {
    let { s, ap, ids, opp } = withLands([sculpt(), ...hand], landsFor);
    putOnBattlefield(s, opp, mountain);
    const b = into(s, opp, bolt(), "hand");
    // Pass to the opponent with the stack empty: they cast the Bolt during your main phase as an instant.
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, opp, b, [{ kind: "player", id: ap }]));
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(waitingOn(s)).toBe(ap);
    return { s, ap, ids, opp, b, item: s.stack.find((x) => x.objectId === b)! };
  };

  it("beholding a Jace card from your hand costs only {U}{U}; then it counters the spell and empowers Jace 1", () => {
    let { s, ap, ids, b, item } = boltAtYou([jaceB()], [island, island]);
    const at = [{ kind: "stack", id: item.id } as TargetChoice];
    // Paying {1} instead needs a third land.
    expect(planCast(s, ap, ids[0]!, at, undefined, undefined, undefined, { costOr: 1 })).toBeNull();
    s = run(s, planCast(s, ap, ids[0]!, at, undefined, undefined, undefined, { costOr: 0, reveal: [ids[1]!] }));
    // The Jace card stays in your hand.
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("graveyard");
    const token = s.battlefield.map((id) => s.objects[id]!).find((o) => o.isToken && o.controller === ap);
    expect(token?.counters.loyalty).toBe(1);
  });

  it("a Jace you control can be beheld; without one, it costs {1} more", () => {
    let { s, ap, ids } = boltAtYou([], [island, island, island]);
    const jace = putOnBattlefield(s, ap, jaceB());
    const item = s.stack[s.stack.length - 1]!;
    const at = [{ kind: "stack", id: item.id } as TargetChoice];
    // Not a non-Jace card.
    expect(() => run(s, planCast(s, ap, ids[0]!, at, undefined, undefined, undefined, { costOr: 0, reveal: [s.battlefield.find((id) => s.objects[id]!.cardId !== s.objects[jace]!.cardId && s.objects[id]!.controller === ap)!] }))).toThrow();
    expect(planCast(s, ap, ids[0]!, at, undefined, undefined, undefined, { costOr: 0, reveal: [jace] })).not.toBeNull();
    const without = boltAtYou([], [island, island, island]);
    const at2 = [{ kind: "stack", id: without.item.id } as TargetChoice];
    expect(planCast(without.s, without.ap, without.ids[0]!, at2, undefined, undefined, undefined, { costOr: 0, reveal: [] })).toBeNull();
    expect(planCast(without.s, without.ap, without.ids[0]!, at2, undefined, undefined, undefined, { costOr: 1 })).not.toBeNull();
  });
});

describe("Theorist's Sanctum: you may behold a Jace", () => {
  const play = (prep: (s: GameState, ap: PlayerId) => void, untapped?: boolean) => {
    const { s: s0, ap, ids } = setup([sanctum()]);
    prep(s0, ap);
    const s = act(s0, { type: "playLand", player: ap, objectId: ids[0]!, ...(untapped ? { untapped } : {}) });
    return s.objects[ids[0]!]!.tapped;
  };
  it("enters untapped if you reveal a Jace card or control a Jace, tapped otherwise", () => {
    expect(play(() => {})).toBe(true);
    expect(play((s, ap) => void into(s, ap, jaceB(), "hand"), true)).toBe(false);
    expect(play((s, ap) => void into(s, ap, jaceB(), "hand"))).toBe(true);
    expect(play((s, ap) => void putOnBattlefield(s, ap, jaceB()))).toBe(false);
    // A non-Jace card can't be revealed for it.
    expect(() => play((s, ap) => void into(s, ap, bears(), "hand"), true)).toThrow();
  });
  it("{2}{U}, {T}: Empower Jace 2", () => {
    let { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, sanctum());
    s = settle(run(s, planActivate(s, ap, l, 0)));
    const token = s.battlefield.map((id) => s.objects[id]!).find((o) => o.isToken && o.controller === ap);
    expect(token?.counters.loyalty).toBe(2);
  });
});

describe("Ancestral Communion", () => {
  it("cast while you control your commander, it's copied: a new target for the copy", () => {
    let { s, ap, ids } = setup([communion()]);
    putOnBattlefield(s, ap, commanderDef(s, ap), { commander: true });
    const a = into(s, ap, bears(), "graveyard");
    const c = into(s, ap, elves(), "graveyard");
    s = run(s, planCast(s, ap, ids[0]!, [tgt(a)]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [tgt(c)] }));
    expect(s.objects[a]!.zone).toBe("hand");
    expect(s.objects[c]!.zone).toBe("hand");
  });
  it("without your commander on the battlefield (or with someone else's), no copy", () => {
    let { s, ap, ids, opp } = setup([communion()]);
    const theirs = putOnBattlefield(s, opp, commanderDef(s, opp), { commander: true });
    s.objects[theirs]!.controller = ap;
    invalidateCharacteristics(s);
    const a = into(s, ap, bears(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    expect(s.pending).toBeNull();
    expect(s.stack.some((x) => x.copy)).toBe(false);
    expect(s.objects[a]!.zone).toBe("hand");
  });
});

describe("Tapestry Warden: stations permanents using toughness", () => {
  const station = (s: GameState, ap: PlayerId, ship: string, by: string) => {
    const plan = planActivate(s, ap, ship, 0, undefined, undefined, [by]);
    if (!plan) throw new Error("can't station");
    return plan.reduce((x, a) => act(x, a), s);
  };
  const charge = (s: GameState, id: string) => s.objects[id]!.counters.charge ?? 0;

  it("a creature you control with toughness greater than its power stations with its toughness; others with their power", () => {
    let { s, ap } = setup([]);
    const ship = putOnBattlefield(s, ap, sawship());
    const wall = putOnBattlefield(s, ap, wallStone());
    const bear = putOnBattlefield(s, ap, bears());
    s = settle(station(s, ap, ship, wall));
    expect(charge(s, ship)).toBe(0);
    putOnBattlefield(s, ap, warden());
    s.objects[wall]!.tapped = false;
    s = settle(station(s, ap, ship, wall));
    expect(charge(s, ship)).toBe(8);
    // The Bears' toughness isn't greater than their power.
    s = settle(station(s, ap, ship, bear));
    expect(charge(s, ship)).toBe(10);
    // Its power doesn't change (rulings).
    expect(pt(s, wall)).toBe("0/8");
  });

  it("checked as the ability resolves: the Warden gone means power; the creature gone, as it last existed (rulings)", () => {
    let { s, ap } = setup([]);
    const ship = putOnBattlefield(s, ap, sawship());
    const w = putOnBattlefield(s, ap, warden());
    const wall = putOnBattlefield(s, ap, wallStone());
    s = station(s, ap, ship, wall);
    moveObject(s, w, "graveyard");
    s = settle(s);
    expect(charge(s, ship)).toBe(0);
    putOnBattlefield(s, ap, warden());
    const wall2 = putOnBattlefield(s, ap, wallStone());
    s = station(s, ap, ship, wall2);
    moveObject(s, wall2, "graveyard");
    s = settle(s);
    expect(charge(s, ship)).toBe(8);
  });

  it("an opponent's Warden doesn't help you", () => {
    let { s, ap, opp } = setup([]);
    const ship = putOnBattlefield(s, ap, sawship());
    putOnBattlefield(s, opp, warden());
    const wall = putOnBattlefield(s, ap, wallStone());
    s = settle(station(s, ap, ship, wall));
    expect(charge(s, ship)).toBe(0);
  });
});

describe("Counterlash", () => {
  /** The opponent casts `spell` (at `at`) while you hold priority with Counterlash and `hand`. */
  const respond = (hand: CardDef[], spell: CardDef, at: (s: GameState, ap: PlayerId) => TargetChoice[] | undefined) => {
    let { s, ap, ids, opp } = setup([lash(), ...hand]);
    const theirs = into(s, opp, spell, "hand");
    s.players[opp]!.manaPool = { W: 0, U: 3, B: 1, R: 1, G: 1, C: 0 };
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, opp, theirs, at(s, ap)));
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(waitingOn(s)).toBe(ap);
    return { s, ap, ids, opp, theirs, item: s.stack.find((x) => x.objectId === theirs)! };
  };

  it("counters the spell, then offers only cards sharing a card type with it, cast for free", () => {
    let { s, ap, ids, opp, theirs, item } = respond([shock(), bears(), divination()], bolt(), (_s, ap) => [{ kind: "player", id: ap }]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: item.id }])));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromHand", player: ap });
    expect(s.pending?.kind === "chooseOption" ? s.pending.options : []).toEqual([ids[1], "none"]);
    s = act(s, { type: "chooseOption", player: ap, choice: ids[1]! });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: ids[1] });
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("a spell that can't be countered is still \"it\": an instant from your hand for free", () => {
    let { s, ap, ids, theirs, item } = respond([shock()], decay(), (s, ap) => [tgt(putOnBattlefield(s, ap, bears()))]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: item.id }])));
    expect(s.objects[theirs]!.zone).toBe("stack");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromHand" });
    expect(s.pending?.kind === "chooseOption" ? s.pending.options : []).toEqual([ids[1], "none"]);
  });

  it("countering a sorcery lets you cast a sorcery from your hand even at instant speed (rulings)", () => {
    let { s, ap, ids, opp } = setup([lash(), divination(), shock()]);
    // The opponent's main phase: they cast Divination; you respond.
    s = passUntil(s, "main1", opp);
    const theirs = into(s, opp, divination(), "hand");
    s.players[opp]!.manaPool = { W: 0, U: 3, B: 0, R: 0, G: 0, C: 0 };
    s = run(s, planCast(s, opp, theirs));
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const item = s.stack.find((x) => x.objectId === theirs)!;
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: item.id }])));
    expect(s.pending?.kind === "chooseOption" ? s.pending.options : []).toEqual([ids[1], "none"]);
    s = act(s, { type: "chooseOption", player: ap, choice: ids[1]! });
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });
});
