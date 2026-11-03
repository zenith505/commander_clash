// Round 272, earlier skips from the top of the popularity list: targets in exile (CR 406), whoever exiled the card, and
// only face up (a face-down card has no characteristics, CR 406.3, rulings on Runic Repetition): Rootcoil Creeper ("target
// card with flashback you own from exile"), Runic Repetition ("target exiled card with flashback you own"), Sorceress's
// Schemes (a card from your graveyard or an exiled one, one target), Pull from Eternity and Riftsweeper ("target face-up
// exiled card"), Blade of the Swarm ("target exiled card with warp"); and giving a permanent away: Stiltzkin, Moogle
// Merchant ("If they do, you draw a card"; Bill Ferny, Bree Swindler came with it) and Discerning Financier ("Choose another player. That player gains control of
// target Treasure you control"); Proteus Staff ("the rest on the bottom of their library in any order").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, canChooseTarget, compileCard, controllerOf, harmfulTargets, invalidateCharacteristics, isFullySupported, legalTargets, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const C = {
  rootcoil: {"oracleId":"101f06f8-7980-41d1-98fa-3cb959380737","name":"Rootcoil Creeper","manaCost":"{G}{U}","cmc":2,"typeLine":"Creature — Plant Horror","supertypes":[],"types":["Creature"],"subtypes":["Plant","Horror"],"oracleText":"{T}: Add one mana of any color.\n{T}: Add two mana of any one color. Spend this mana only to cast spells from your graveyard.\n{G}{U}, {T}, Exile this creature: Return target card with flashback you own from exile to your hand.","power":"2","toughness":"2","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/8/d/8d36f995-a8f2-4a61-8e79-867a70b2a499.jpg?1783924335","artUrl":"https://cards.scryfall.io/art_crop/front/8/d/8d36f995-a8f2-4a61-8e79-867a70b2a499.jpg?1783924335","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  schemes: {"oracleId":"945e56b9-709f-4bb3-8a6b-0a04d9202a03","name":"Sorceress's Schemes","manaCost":"{3}{R}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return target instant or sorcery card from your graveyard or exiled card with flashback you own to your hand. Add {R}.\nFlashback {4}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["R"],"colorIdentity":["R"],"keywords":["Flashback"],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/7/e/7efd7627-0754-4685-9d04-8f5f82f45632.jpg?1783906596","artUrl":"https://cards.scryfall.io/art_crop/front/7/e/7efd7627-0754-4685-9d04-8f5f82f45632.jpg?1783906596","commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  runic: {"oracleId":"8ab99b5e-c9e0-45c2-8df2-864ab0ad1caf","name":"Runic Repetition","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return target exiled card with flashback you own to your hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/3/53e47ba6-3a55-41b4-b8fe-580041669408.jpg?1783940967","artUrl":"https://cards.scryfall.io/art_crop/front/5/3/53e47ba6-3a55-41b4-b8fe-580041669408.jpg?1783940967","commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  pull: {"oracleId":"2903bd66-6948-445b-a18a-12e2ce1a86c3","name":"Pull from Eternity","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Put target face-up exiled card into its owner's graveyard.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/d/3d218091-d218-41ad-b666-c8ab3de7160a.jpg?1783943250","artUrl":"https://cards.scryfall.io/art_crop/front/3/d/3d218091-d218-41ad-b666-c8ab3de7160a.jpg?1783943250","commanderLegal":"legal","set":"tsp","releasedAt":"2006-10-06","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  rift: {"oracleId":"1ba0dce5-e767-47cc-9967-174e52bce120","name":"Riftsweeper","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Shaman","supertypes":[],"types":["Creature"],"subtypes":["Elf","Shaman"],"oracleText":"When this creature enters, choose target face-up exiled card. Its owner shuffles it into their library.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/4/847dbbbc-e069-4a90-bc47-c28418bb8540.jpg?1783943097","artUrl":"https://cards.scryfall.io/art_crop/front/8/4/847dbbbc-e069-4a90-bc47-c28418bb8540.jpg?1783943097","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  blade: {"oracleId":"33042d12-f08b-4b3e-b106-c424ef868c13","name":"Blade of the Swarm","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Insect Assassin","supertypes":[],"types":["Creature"],"subtypes":["Insect","Assassin"],"oracleText":"When this creature enters, choose one —\n• Put two +1/+1 counters on this creature.\n• Put target exiled card with warp on the bottom of its owner's library.","power":"3","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/1/b157330a-2652-4ed9-b8fa-8e72b4eda15c.jpg?1783905970","artUrl":"https://cards.scryfall.io/art_crop/front/b/1/b157330a-2652-4ed9-b8fa-8e72b4eda15c.jpg?1783905970","commanderLegal":"legal","set":"eoe","releasedAt":"2025-08-01","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  thinkTwice: {"oracleId":"fa85c5a2-8e83-4624-a35a-a0bbf17ecbb4","name":"Think Twice","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["U"],"colorIdentity":["U"],"keywords":["Flashback"],"imageUrl":"https://cards.scryfall.io/normal/front/8/5/85835de4-66ea-4ba1-87ca-6bcec2a8660a.jpg?1783903015","artUrl":"https://cards.scryfall.io/art_crop/front/8/5/85835de4-66ea-4ba1-87ca-6bcec2a8660a.jpg?1783903015","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  bloom: {"oracleId":"04cf02dc-f053-414e-87d8-1537f25bcbf4","name":"Lotus Bloom","manaCost":"","cmc":0,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Suspend 3—{0} (Rather than cast this card from your hand, pay {0} and exile it with three time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)\n{T}, Sacrifice this artifact: Add three mana of any one color.","colors":[],"colorIdentity":[],"keywords":["Suspend"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73127ee0-9a0c-48fa-9c60-b4c600ace8f7.jpg?1783943197","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73127ee0-9a0c-48fa-9c60-b4c600ace8f7.jpg?1783943197","commanderLegal":"legal","set":"tsp","releasedAt":"2006-10-06","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  sawIt: {"oracleId":"90edaf33-d0ab-47e0-8f6a-6fba38286e6e","name":"Saw It Coming","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.\nForetell {1}{U} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)","colors":["U"],"colorIdentity":["U"],"keywords":["Foretell"],"imageUrl":"https://cards.scryfall.io/normal/front/8/7/877a1bb9-5eae-453a-bec0-a9de20ea6815.jpg?1783928256","artUrl":"https://cards.scryfall.io/art_crop/front/8/7/877a1bb9-5eae-453a-bec0-a9de20ea6815.jpg?1783928256","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  bolt: {"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  stalker: {"oracleId":"da9ec010-8b42-4927-b602-4e96bced4e99","name":"All-Fates Stalker","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Drix Assassin","supertypes":[],"types":["Creature"],"subtypes":["Drix","Assassin"],"oracleText":"When this creature enters, exile up to one target non-Assassin creature until this creature leaves the battlefield.\nWarp {1}{W} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)","power":"2","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Warp"],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82ae4f7b-8122-4af6-8079-888eabf1a11e.jpg?1783906001","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82ae4f7b-8122-4af6-8079-888eabf1a11e.jpg?1783906001","commanderLegal":"legal","set":"eoe","releasedAt":"2025-08-01","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  stiltzkin: {"oracleId":"958c2a27-9fb1-42b4-a0ef-296584763a98","name":"Stiltzkin, Moogle Merchant","manaCost":"{W}","cmc":1,"typeLine":"Legendary Creature — Moogle","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Moogle"],"oracleText":"Lifelink\n{2}, {T}: Target opponent gains control of another target permanent you control. If they do, you draw a card.","power":"1","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/0/6/06a972a4-0c1b-4f12-a5a5-fdea47c4cd35.jpg?1783906644","artUrl":"https://cards.scryfall.io/art_crop/front/0/6/06a972a4-0c1b-4f12-a5a5-fdea47c4cd35.jpg?1783906644","commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  financier: {"oracleId":"734a5186-caa6-4811-b6d7-91b7b32fc403","name":"Discerning Financier","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human Noble","supertypes":[],"types":["Creature"],"subtypes":["Human","Noble"],"oracleText":"At the beginning of your upkeep, if an opponent controls more lands than you, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\n{2}{W}: Choose another player. That player gains control of target Treasure you control. You draw a card.","power":"2","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Treasure"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/5/8/584774b5-640f-45e0-810b-f5faf119645b.jpg?1783915133","artUrl":"https://cards.scryfall.io/art_crop/front/5/8/584774b5-640f-45e0-810b-f5faf119645b.jpg?1783915133","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  staff: {"oracleId":"97024e8e-dfde-4769-bc27-c3d6fad19e7c","name":"Proteus Staff","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}{U}, {T}: Put target creature on the bottom of its owner's library. That creature's controller reveals cards from the top of their library until they reveal a creature card. The player puts that card onto the battlefield and the rest on the bottom of their library in any order. Activate only as a sorcery.","colors":[],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/5/55e5c69c-43d0-4f5b-8720-40074eb122bb.jpg?1783944506","artUrl":"https://cards.scryfall.io/art_crop/front/5/5/55e5c69c-43d0-4f5b-8720-40074eb122bb.jpg?1783944506","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  bill: {"oracleId":"ebbe5d82-a7a4-4f4b-b038-095021d9a6a8","name":"Bill Ferny, Bree Swindler","manaCost":"{1}{U}","cmc":2,"typeLine":"Legendary Creature — Human Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"Whenever Bill Ferny becomes blocked, choose one —\n• Create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\n• Target opponent gains control of target Horse you control. If they do, remove Bill Ferny from combat and create three Treasure tokens.","power":"2","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Treasure"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/2/0/20ac63cb-fa4d-4340-8062-1029c8bd5ec8.jpg?1783916321","artUrl":"https://cards.scryfall.io/art_crop/front/2/0/20ac63cb-fa4d-4340-8062-1029c8bd5ec8.jpg?1783916321","commanderLegal":"legal","set":"ltr","releasedAt":"2023-06-23","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
};

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; the bots answer every question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", undefined, choices));
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** The ids a spell's or ability's first target could be. */
const choices = (s: GameState, def: CardDef, pid: PlayerId, which: "spell" | number = "spell") => {
  const c = compileCard(def);
  const body = which === "spell" ? c.spell! : c.activated[which]!.body;
  return legalTargets(s, body.targets[0]!, pid).map((t) => t.id);
};

describe("round 272 cards", () => {
  it("all compile fully", () => {
    for (const def of [C.rootcoil, C.schemes, C.runic, C.pull, C.rift, C.blade, C.stiltzkin, C.financier, C.staff, C.bill]) expect(isFullySupported(def), def.name).toBe(true);
  });
});

describe("Runic Repetition: target exiled card with flashback you own", () => {
  it("returns your own face-up exiled card with flashback to your hand", () => {
    const { s: s0, ap, ids } = setup([C.runic]);
    const twice = into(s0, ap, C.thinkTwice, "exile");
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(twice)]));
    expect(zone(s, twice)).toBe("hand");
    expect(s.players[ap]!.hand).toContain(twice);
    expect(s.players[ap]!.exile).not.toContain(twice);
  });

  it("can't target a card without flashback, one another player owns, one in a graveyard, or a face-down one (rulings)", () => {
    const { s, ap, opp } = setup([C.runic]);
    const mine = into(s, ap, C.thinkTwice, "exile");
    const bolt = into(s, ap, C.bolt, "exile");
    const theirs = into(s, opp, C.thinkTwice, "exile");
    const yard = into(s, ap, C.thinkTwice, "graveyard");
    const hidden = into(s, ap, C.thinkTwice, "exile");
    s.objects[hidden]!.hiddenExile = { by: bolt, seen: [ap] };
    const foretold = into(s, ap, C.thinkTwice, "exile");
    s.objects[foretold]!.foretold = true;
    expect(choices(s, C.runic, ap)).toEqual([mine]);
    void [theirs, yard];
  });

  it("the target is gone if the card left exile before it resolves (CR 400.7, 608.2b)", () => {
    const { s: s0, ap, ids } = setup([C.runic]);
    const twice = into(s0, ap, C.thinkTwice, "exile");
    let s = castNow(s0, ap, ids[0]!, [tgt(twice)]);
    // It moves to the graveyard and back to exile: a new object.
    s.players[ap]!.exile.splice(s.players[ap]!.exile.indexOf(twice), 1);
    s.objects[twice]!.zoneChanges = (s.objects[twice]!.zoneChanges ?? 0) + 2;
    s.players[ap]!.exile.push(twice);
    s = settle(s);
    expect(zone(s, twice)).toBe("exile");
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

describe("Sorceress's Schemes: a card from your graveyard or an exiled one", () => {
  it("offers instants and sorceries from your graveyard and your exiled cards with flashback, in one target", () => {
    const { s, ap, opp } = setup([C.schemes]);
    const yardBolt = into(s, ap, C.bolt, "graveyard");
    const yardBear = into(s, ap, card("Bear Card", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }), "graveyard");
    const exiledTwice = into(s, ap, C.thinkTwice, "exile");
    const exiledBolt = into(s, ap, C.bolt, "exile");
    const theirYard = into(s, opp, C.bolt, "graveyard");
    expect(choices(s, C.schemes, ap).sort()).toEqual([yardBolt, exiledTwice].sort());
    void [yardBear, exiledBolt, theirYard];
  });

  it("returns an exiled card with flashback to your hand and adds {R}", () => {
    const { s: s0, ap, ids } = setup([C.schemes]);
    const twice = into(s0, ap, C.thinkTwice, "exile");
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(twice)]));
    expect(zone(s, twice)).toBe("hand");
    expect(s.players[ap]!.manaPool.R ?? 0).toBe(1);
  });

  it("returns an instant from your graveyard too", () => {
    const { s: s0, ap, ids } = setup([C.schemes]);
    const bolt = into(s0, ap, C.bolt, "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(bolt)]));
    expect(zone(s, bolt)).toBe("hand");
  });
});

describe("Rootcoil Creeper: return target card with flashback you own from exile", () => {
  it("exiles itself as a cost and returns the card to your hand", () => {
    const { s: s0, ap } = setup([]);
    const creeper = putOnBattlefield(s0, ap, C.rootcoil);
    const twice = into(s0, ap, C.thinkTwice, "exile");
    const bolt = into(s0, ap, C.bolt, "exile");
    expect(choices(s0, C.rootcoil, ap, 0)).toEqual([twice]);
    void bolt;
    const s = settle(run(s0, planActivate(s0, ap, creeper, 0, [tgt(twice)])));
    expect(zone(s, creeper)).toBe("exile");
    expect(zone(s, twice)).toBe("hand");
  });
});

describe("Pull from Eternity: target face-up exiled card into its owner's graveyard", () => {
  it("puts an opponent's suspended card into their graveyard, its time counters gone (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([C.pull]);
    const bloom = into(s0, opp, C.bloom, "exile");
    s0.objects[bloom]!.counters.time = 3;
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(bloom)]));
    expect(zone(s, bloom)).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(bloom);
    expect(s.objects[bloom]!.counters.time ?? 0).toBe(0);
  });

  it("any player's face-up exiled card, but not a foretold one", () => {
    const { s, ap, opp } = setup([C.pull]);
    const mine = into(s, ap, C.bolt, "exile");
    const theirs = into(s, opp, C.bloom, "exile");
    const foretold = into(s, opp, C.sawIt, "exile");
    s.objects[foretold]!.foretold = true;
    expect(choices(s, C.pull, ap).sort()).toEqual([mine, theirs].sort());
  });

  it("bots aim it at an opponent's exiled card", () => {
    expect(harmfulTargets(compileCard(C.pull).spell!)).toEqual([true]);
  });
});

describe("Riftsweeper: choose target face-up exiled card; its owner shuffles it into their library", () => {
  it("shuffles an opponent's exiled card into their library as it enters (the bot picks theirs over its own)", () => {
    const { s: s0, ap, opp, ids } = setup([C.rift]);
    const mine = into(s0, ap, C.bolt, "exile");
    const theirs = into(s0, opp, C.bloom, "exile");
    s0.objects[theirs]!.counters.time = 2;
    const lib = s0.players[opp]!.library.length;
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(zone(s, theirs)).toBe("library");
    expect(s.players[opp]!.library.length).toBe(lib + 1);
    expect(zone(s, mine)).toBe("exile");
  });
});

describe("Blade of the Swarm: put target exiled card with warp on the bottom of its owner's library", () => {
  it("only cards with warp can be the second mode's target, from any exile", () => {
    const { s, ap, opp } = setup([C.blade]);
    const stalker = into(s, opp, C.stalker, "exile");
    const bolt = into(s, opp, C.bolt, "exile");
    const mode = compileCard(C.blade).triggers[0]!.body.modal!.modes[1]!;
    expect(legalTargets(s, mode.targets[0]!, ap).map((t) => t.id)).toEqual([stalker]);
    void bolt;
  });

  it("the chosen mode puts the warp card on the bottom of its owner's library", () => {
    const { s: s0, ap, opp, ids } = setup([C.blade]);
    const stalker = into(s0, opp, C.stalker, "exile");
    let s = castNow(s0, ap, ids[0]!);
    for (let i = 0; i < 50 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: ap, legal: [true, true] });
    s = act(s, { type: "chooseModes", player: ap, modes: [1] });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(stalker)] }));
    expect(zone(s, stalker)).toBe("library");
    expect(s.players[opp]!.library.at(-1)).toBe(stalker);
  });

  it("with no card with warp in exile, only the counters mode can be chosen", () => {
    const { s: s0, ap, opp, ids } = setup([C.blade]);
    into(s0, opp, C.bolt, "exile");
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
  });
});

describe("Stiltzkin, Moogle Merchant: target opponent gains control of another target permanent you control; if they do, draw", () => {
  it("gives the permanent away for the rest of the game and draws a card", () => {
    const { s: s0, ap, opp } = setup([]);
    const stiltzkin = putOnBattlefield(s0, ap, C.stiltzkin);
    const bears = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, stiltzkin, 0, [{ kind: "player", id: opp }, tgt(bears)])));
    expect(controllerOf(s, s.objects[bears]!)).toBe(opp);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("can't give itself away (another target)", () => {
    const { s, ap } = setup([]);
    const stiltzkin = putOnBattlefield(s, ap, C.stiltzkin);
    const bears = putOnBattlefield(s, ap, bear());
    const specs = compileCard(C.stiltzkin).activated[0]!.body.targets;
    const them: TargetChoice = { kind: "player", id: s.turnOrder.find((p) => p !== ap)! };
    expect(canChooseTarget(s, specs, [them], 1, tgt(bears), ap, undefined, stiltzkin)).toBe(true);
    expect(canChooseTarget(s, specs, [them], 1, tgt(stiltzkin), ap, undefined, stiltzkin)).toBe(false);
  });

  it("no card if the permanent left the battlefield first (they didn't gain control of it)", () => {
    const { s: s0, ap, opp } = setup([]);
    const stiltzkin = putOnBattlefield(s0, ap, C.stiltzkin);
    const bears = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planActivate(s0, ap, stiltzkin, 0, [{ kind: "player", id: opp }, tgt(bears)]));
    s.battlefield.splice(s.battlefield.indexOf(bears), 1);
    s.objects[bears]!.zone = "graveyard";
    s.objects[bears]!.zoneChanges = (s.objects[bears]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(bears);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("bots don't give their permanents away with it", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, C.stiltzkin);
    putOnBattlefield(s, ap, bear());
    expect(botActions(s, ap).some((a) => a.type === "activate")).toBe(false);
  });
});

describe("Discerning Financier: choose another player; that player gains control of target Treasure you control", () => {
  it("the chosen opponent gets the Treasure and you draw a card", () => {
    const { s: s0, ap } = setup([]);
    const financier = putOnBattlefield(s0, ap, C.financier);
    const treasure = putOnBattlefield(s0, ap, card("Treasure", "Artifact — Treasure"));
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planActivate(s0, ap, financier, 0, [tgt(treasure)]));
    for (let i = 0; i < 50 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.player).toBe(ap);
    s = settle(s);
    const to = controllerOf(s, s.objects[treasure]!);
    expect(to).not.toBe(ap);
    expect(s.turnOrder).toContain(to);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("Proteus Staff: put target creature on the bottom; its controller reveals until a creature card and puts it onto the battlefield", () => {
  /** `pid`'s library starts with two lands and then a creature card; returns their ids. */
  const stack = (s: GameState, pid: PlayerId) => {
    const lib = s.players[pid]!.library;
    const lands = lib.filter((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Land")).slice(0, 2);
    const beast = lib.find((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Creature"))!;
    s.players[pid]!.library = [...lands, beast, ...lib.filter((id) => !lands.includes(id) && id !== beast)];
    return { lands, beast };
  };

  it("an opponent's creature goes to the bottom, they put their first creature card onto the battlefield and order the rest under it", () => {
    const { s: s0, ap, opp } = setup([]);
    const staff = putOnBattlefield(s0, ap, C.staff);
    const victim = putOnBattlefield(s0, opp, bear({ name: "Victim Bear" }));
    const { lands, beast } = stack(s0, opp);
    let s = run(s0, planActivate(s0, ap, staff, 0, [tgt(victim)]));
    for (let i = 0; i < 50 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // The two lands are ordered by the player who revealed them (CR 401.4).
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: opp, how: "bottom" });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([...lands].sort());
    s = settle(s);
    expect(zone(s, beast)).toBe("battlefield");
    expect(controllerOf(s, s.objects[beast]!)).toBe(opp);
    const lib = s.players[opp]!.library;
    expect(lib.slice(-3, -2)).toEqual([victim]);
    expect([...lib.slice(-2)].sort()).toEqual([...lands].sort());
  });

  it("a creature you control but don't own goes to its owner's library; you reveal from yours", () => {
    const { s: s0, ap, opp } = setup([]);
    const staff = putOnBattlefield(s0, ap, C.staff);
    const stolen = putOnBattlefield(s0, opp, bear({ name: "Stolen Bear" }));
    s0.objects[stolen]!.controller = ap;
    invalidateCharacteristics(s0);
    const { beast } = stack(s0, ap);
    const s = settle(run(s0, planActivate(s0, ap, staff, 0, [tgt(stolen)])));
    expect(s.players[opp]!.library.at(-1)).toBe(stolen);
    expect(zone(s, beast)).toBe("battlefield");
    expect(controllerOf(s, s.objects[beast]!)).toBe(ap);
  });

  it("bots aim it at an opponent's creature", () => {
    expect(harmfulTargets(compileCard(C.staff).activated[0]!.body)).toEqual([true]);
  });
});

describe("Bill Ferny, Bree Swindler: target opponent gains control of target Horse you control; if they do, remove it from combat", () => {
  it("blocked, the second mode gives the Horse away, removes Bill Ferny from combat and makes three Treasures", () => {
    const { s: s0, ap, opp } = setup([]);
    const bill = putOnBattlefield(s0, ap, C.bill);
    const horse = putOnBattlefield(s0, ap, card("Test Horse", "Creature — Horse", "{1}", { power: "1", toughness: "1" }));
    const blocker = putOnBattlefield(s0, opp, bear({ name: "Blocking Bear" }));
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: bill, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    while (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: s.pending.player === opp ? [{ blocker, attacker: bill }] : [] });
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: ap });
    s = act(s, { type: "chooseModes", player: ap, modes: [1] });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }, tgt(horse)] }));
    expect(controllerOf(s, s.objects[horse]!)).toBe(opp);
    expect(s.objects[bill]!.attacking).toBeUndefined();
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === ap && s.objects[id]!.cardId.startsWith("token:Treasure:")).length).toBe(3);
  });
});
