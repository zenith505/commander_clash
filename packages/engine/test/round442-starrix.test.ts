// Round 442 (Lane A): Auspicious Starrix ("Whenever this creature mutates, exile cards from the top of your library until
// you exile X permanent cards, where X is the number of times this creature has mutated. Put those permanent cards onto
// the battlefield.": CR 702.140d, 406.3, 608.2c, 303.4f-g; rulings).

import { describe, expect, it } from "vitest";
import { act, passAll, putOnBattlefield, setup, target } from "./helpers";
import { botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, planCast, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const starrix = (): CardDef => ({"oracleId":"8432df19-dbf4-457b-8c0b-1f4b3a0a37d2","name":"Auspicious Starrix","manaCost":"{4}{G}","cmc":5,"typeLine":"Creature — Elk Beast","supertypes":[],"types":["Creature"],"subtypes":["Elk","Beast"],"oracleText":"Mutate {5}{G} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)\nWhenever this creature mutates, exile cards from the top of your library until you exile X permanent cards, where X is the number of times this creature has mutated. Put those permanent cards onto the battlefield.","power":"6","toughness":"6","colors":["G"],"colorIdentity":["G"],"keywords":["Mutate"],"imageUrl":"https://cards.scryfall.io/normal/front/a/3/a39ae1e4-d4dd-4691-af5a-5fa25ace4ebe.jpg?1783931040","artUrl":"https://cards.scryfall.io/art_crop/front/a/3/a39ae1e4-d4dd-4691-af5a-5fa25ace4ebe.jpg?1783931040","commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"uncommon","layout":"mutate","gameChanger":false}) as CardDef;
const animateArtifact = (): CardDef => ({"oracleId":"2dd7a4dc-902a-4e85-8a3b-c96a898fba86","name":"Animate Artifact","manaCost":"{3}{U}","cmc":4,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant artifact\nAs long as enchanted artifact isn't a creature, it's an artifact creature with power and toughness each equal to its mana value.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/6/6/664b46f5-0424-4f4e-9f26-6bd2cf5e0357.jpg?1783948707","artUrl":"https://cards.scryfall.io/art_crop/front/6/6/664b46f5-0424-4f4e-9f26-6bd2cf5e0357.jpg?1783948707","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const rancor = (): CardDef => ({"oracleId":"9d2d6479-531c-4ce1-b52b-00e36fa63b64","name":"Rancor","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/4073ecc9-5d3a-452f-b708-0572fa27a6f0.jpg?1783912355","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/4073ecc9-5d3a-452f-b708-0572fa27a6f0.jpg?1783912355","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, actions: Action[] | null) => {
  if (!actions) throw new Error("no plan");
  return actions.reduce((x, a) => act(x, a), s);
};
/** Put these cards on top of `pid`'s library, the first one on top. */
const stack = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  invalidateCharacteristics(s);
  return ids;
};
/** Cast Starrix for its mutate cost onto `host`, on top, and resolve everything, questions answered as the bots would. */
const mutate = (s: GameState, pid: PlayerId, id: ObjectId, host: ObjectId) => {
  s = passAll(run(s, planCast(s, pid, id, [target(host)], undefined, "auto", undefined, { alt: "mutate" })));
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending?.kind === "chooseOption" && s.pending.what === "mutate") s = act(s, { type: "chooseOption", player: s.pending.player, choice: "top" });
    else if (s.pending) s = run(s, botActions(s, s.pending.player));
    else s = passAll(s);
  }
  return s;
};

describe("Auspicious Starrix", () => {
  it("parse: the mutate trigger exiles until X permanent cards and puts them onto the battlefield", () => {
    expect(isFullySupported(starrix())).toBe(true);
    const t = compileCard(starrix()).triggers.find((x) => x.event === "selfMutates");
    expect(t?.body.effects).toEqual([{ type: "revealUntil", filter: expect.objectContaining({ kind: "card" }), found: "battlefield", rest: "exile", exile: true, n: { count: { kind: "mutations" } } }]);
  });

  it("the first mutation: one permanent card, the cards above it stay exiled", () => {
    const { s: s0, ap, ids } = setup([starrix()]);
    const st = ids[0]!;
    const b = putOnBattlefield(s0, ap, bears());
    const [bl, bs, b2] = stack(s0, ap, [bolt(), bonesplitter(), bears()]);
    const s = mutate(s0, ap, st, b);
    expect(characteristics(s, s.objects[b]!).name).toBe("Auspicious Starrix");
    expect(s.objects[b]!.mutations).toBe(1);
    expect(s.objects[bl!]!.zone).toBe("exile"); // the instant stays exiled (rulings)
    expect(s.objects[bs!]!.zone).toBe("battlefield");
    expect(s.objects[b2!]!.zone).toBe("library");
    expect(s.players[ap]!.library[0]).toBe(b2);
  });

  it("the second mutation: two permanent cards, a land among them (not a land play)", () => {
    const { s: s0, ap, ids } = setup([starrix()]);
    const st = ids[0]!;
    const b = putOnBattlefield(s0, ap, bears());
    s0.objects[b]!.mutations = 1; // it has mutated once before
    const top = s0.players[ap]!.library[0]!; // a Forest or a Grizzly Bears from the test deck
    const [bl, bs] = stack(s0, ap, [bolt(), bonesplitter()]);
    const landsPlayed = s0.players[ap]!.landsPlayedThisTurn;
    const s = mutate(s0, ap, st, b);
    expect(s.objects[b]!.mutations).toBe(2);
    expect(s.objects[bl!]!.zone).toBe("exile");
    expect(s.objects[bs!]!.zone).toBe("battlefield");
    expect(s.objects[top]!.zone).toBe("battlefield");
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(landsPlayed);
  });

  it("an Aura with nothing to enchant stays exiled; one that can enchant something already there enters on it", () => {
    const { s: s0, ap, ids } = setup([starrix()]);
    const st = ids[0]!;
    const b = putOnBattlefield(s0, ap, bears());
    s0.objects[b]!.mutations = 2;
    const [aa, ra, b2] = stack(s0, ap, [animateArtifact(), rancor(), bears()]);
    const s = mutate(s0, ap, st, b);
    expect(s.objects[b]!.mutations).toBe(3);
    // No artifact on the battlefield (the Bears entering with it isn't one anyway): Animate Artifact stays exiled.
    expect(s.objects[aa!]!.zone).toBe("exile");
    expect(s.objects[ra!]!.zone).toBe("battlefield");
    // Rancor can't enchant the Bears entering at the same time (rulings).
    expect(s.objects[ra!]!.attachedTo).not.toBe(b2);
    expect(s.objects[ra!]!.attachedTo).toBeDefined();
    expect(s.objects[b2!]!.zone).toBe("battlefield");
  });

  it("fewer permanent cards than X: the whole library is exiled, and those it holds enter", () => {
    const { s: s0, ap, ids } = setup([starrix()]);
    const st = ids[0]!;
    const b = putOnBattlefield(s0, ap, bears());
    s0.objects[b]!.mutations = 3;
    const p = s0.players[ap]!;
    for (const id of p.library.splice(0)) delete s0.objects[id];
    const [bl, bs] = stack(s0, ap, [bolt(), bonesplitter()]);
    const s = mutate(s0, ap, st, b);
    expect(s.players[ap]!.library.length).toBe(0);
    expect(s.objects[bl!]!.zone).toBe("exile");
    expect(s.objects[bs!]!.zone).toBe("battlefield");
  });
});
