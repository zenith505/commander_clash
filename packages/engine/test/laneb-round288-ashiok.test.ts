// Lane B round B288: Ashiok, Wicked Manipulator's "If you would pay life while your library has at least that many cards
// in it, exile that many cards from the top of your library instead." (a replacement effect, CR 614.1a, 614.6; the life
// total still limits what can be paid, rulings, CR 119.4; a card entering from the library is left out, CR 614.13c), its
// +1 ("Exile one of them and put the other into your hand"), −2 (Nightmares with "if a card was put into exile this
// turn") and −7 ("the total mana value of cards you own in exile").

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, legalActions, planActivate, planCast, power, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const ashiokWickedManipulator = (): CardDef => ({"oracleId":"67d66678-a8e6-4f80-bade-1f1daf4b0610","name":"Ashiok, Wicked Manipulator","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Legendary Planeswalker — Ashiok","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Ashiok"],"oracleText":"If you would pay life while your library has at least that many cards in it, exile that many cards from the top of your library instead.\n+1: Look at the top two cards of your library. Exile one of them and put the other into your hand.\n−2: Create two 1/1 black Nightmare creature tokens with \"At the beginning of combat on your turn, if a card was put into exile this turn, put a +1/+1 counter on this token.\"\n−7: Target player exiles the top X cards of their library, where X is the total mana value of cards you own in exile.","loyalty":"5","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/c/6c4d0db1-74a5-42c0-ac95-e696585d8022.jpg?1783915111","artUrl":"https://cards.scryfall.io/art_crop/front/6/c/6c4d0db1-74a5-42c0-ac95-e696585d8022.jpg?1783915111","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const arguelSBloodFastTempleOfAclazotz = (): CardDef => ({"oracleId":"be2a4bc4-8af6-48c5-9421-32d26272e71a","name":"Arguel's Blood Fast // Temple of Aclazotz","manaCost":"{1}{B}","cmc":2,"typeLine":"Legendary Enchantment // Legendary Land","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}{B}, Pay 2 life: Draw a card.\nAt the beginning of your upkeep, if you have 5 or less life, you may transform Arguel's Blood Fast.","colors":["B"],"colorIdentity":["B"],"keywords":["Transform"],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/c/4/c4ac7570-e74e-4081-ac53-cf41e695b7eb.jpg?1783935780","artUrl":"https://cards.scryfall.io/art_crop/front/c/4/c4ac7570-e74e-4081-ac53-cf41e695b7eb.jpg?1783935780","commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Arguel's Blood Fast","manaCost":"{1}{B}","typeLine":"Legendary Enchantment","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}{B}, Pay 2 life: Draw a card.\nAt the beginning of your upkeep, if you have 5 or less life, you may transform Arguel's Blood Fast.","colors":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/c/4/c4ac7570-e74e-4081-ac53-cf41e695b7eb.jpg?1783935780","artUrl":"https://cards.scryfall.io/art_crop/front/c/4/c4ac7570-e74e-4081-ac53-cf41e695b7eb.jpg?1783935780"},{"name":"Temple of Aclazotz","manaCost":"","typeLine":"Legendary Land","supertypes":["Legendary"],"types":["Land"],"subtypes":[],"oracleText":"(Transforms from Arguel's Blood Fast.)\n{T}: Add {B}.\n{T}, Sacrifice a creature: You gain life equal to the sacrificed creature's toughness.","colors":[],"imageUrl":"https://cards.scryfall.io/normal/back/c/4/c4ac7570-e74e-4081-ac53-cf41e695b7eb.jpg?1783935780","artUrl":"https://cards.scryfall.io/art_crop/back/c/4/c4ac7570-e74e-4081-ac53-cf41e695b7eb.jpg?1783935780"}]}) as CardDef;
const toxicDeluge = (): CardDef => ({"oracleId":"afaef788-34d1-460b-b884-9d7ae6ddeb18","name":"Toxic Deluge","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/e/de5afccc-8d42-4bd6-b068-b9ea2361655e.jpg?1783903236","artUrl":"https://cards.scryfall.io/art_crop/front/d/e/de5afccc-8d42-4bd6-b068-b9ea2361655e.jpg?1783903236","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gitaxianProbe = (): CardDef => ({"oracleId":"1d67f5ff-1fce-45e5-b6a1-416c569351e2","name":"Gitaxian Probe","manaCost":"{U/P}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"({U/P} can be paid with either {U} or 2 life.)\nLook at target player's hand.\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1fbb4493-23db-4c91-a3e0-17b139f5d00f.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1fbb4493-23db-4c91-a3e0-17b139f5d00f.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fontOfAgonies = (): CardDef => ({"oracleId":"ab44c6fe-6a66-42f0-9e75-8b25641e1f13","name":"Font of Agonies","manaCost":"{B}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever you pay life, put that many blood counters on this enchantment.\n{1}{B}, Remove four blood counters from this enchantment: Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/7/d7c02aec-4a89-4ccc-8525-6f979c10d799.jpg?1783933694","artUrl":"https://cards.scryfall.io/art_crop/front/d/7/d7c02aec-4a89-4ccc-8525-6f979c10d799.jpg?1783933694","commanderLegal":"legal","set":"rna","releasedAt":"2019-01-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const breedingPool = (): CardDef => ({"oracleId":"20283c4a-f1f0-42f0-bc08-6da87474426b","name":"Breeding Pool","manaCost":"","cmc":0,"typeLine":"Land — Forest Island","supertypes":[],"types":["Land"],"subtypes":["Forest","Island"],"oracleText":"({T}: Add {G} or {U}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.","colors":[],"colorIdentity":["G","U"],"keywords":[],"producedMana":["G","U"],"imageUrl":"https://cards.scryfall.io/normal/front/6/3/63e4dc07-c742-41bd-8301-861637908fd1.jpg?1784036820","artUrl":"https://cards.scryfall.io/art_crop/front/6/3/63e4dc07-c742-41bd-8301-861637908fd1.jpg?1784036820","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const courserOfKruphix = (): CardDef => ({"oracleId":"46779609-4fa7-4fd2-b5b4-7d4d749339e6","name":"Courser of Kruphix","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Enchantment Creature — Centaur","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Centaur"],"oracleText":"Play with the top card of your library revealed.\nYou may play lands from the top of your library.\nLandfall — Whenever a land you control enters, you gain 1 life.","power":"2","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Landfall"],"imageUrl":"https://cards.scryfall.io/normal/front/e/8/e8383d6a-0f26-4afe-88e0-9b14c8e9122d.jpg?1783938659","artUrl":"https://cards.scryfall.io/art_crop/front/e/8/e8383d6a-0f26-4afe-88e0-9b14c8e9122d.jpg?1783938659","commanderLegal":"legal","set":"cp2","releasedAt":"2015-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A fresh copy of `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef): ObjectId => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
/** A fresh copy of `def` in `pid`'s exile. */
const exiled = (s: GameState, pid: PlayerId, def: CardDef): ObjectId => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "exile";
  s.players[pid]!.exile.push(id);
  return id;
};
/** Ashiok (5 loyalty) and Arguel's Blood Fast on the battlefield. */
const board = (hand: CardDef[] = []) => {
  const { s, ap, ids, opp } = setup(hand);
  const ashiok = putOnBattlefield(s, ap, ashiokWickedManipulator());
  s.objects[ashiok]!.counters.loyalty = 5;
  const fast = putOnBattlefield(s, ap, arguelSBloodFastTempleOfAclazotz());
  return { s, ap, ids, opp, ashiok, fast };
};

describe("Ashiok, Wicked Manipulator", () => {
  it("compiles", () => expect(isFullySupported(ashiokWickedManipulator())).toBe(true));

  it("a life payment exiles that many cards from the top of the library instead: no life paid, no 'whenever you pay life'", () => {
    const { s: s0, ap, fast } = board();
    const font = putOnBattlefield(s0, ap, fontOfAgonies());
    const top = s0.players[ap]!.library.slice(0, 3);
    const life = s0.players[ap]!.life;
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, fast, 0)));
    expect(s.players[ap]!.life).toBe(life);
    expect([s.objects[top[0]!]!.zone, s.objects[top[1]!]!.zone]).toEqual(["exile", "exile"]);
    // The draw is the card under them.
    expect(s.objects[top[2]!]!.zone).toBe("hand");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // Font of Agonies doesn't see a payment (CR 614.6).
    expect(s.objects[font]!.counters.blood ?? 0).toBe(0);
  });

  it("with fewer cards in the library than the payment, life is paid as usual", () => {
    const { s: s0, ap, fast } = board();
    const font = putOnBattlefield(s0, ap, fontOfAgonies());
    const p = s0.players[ap]!;
    for (const id of p.library.slice(1)) s0.objects[id]!.zone = "exile";
    p.exile.push(...p.library.slice(1));
    p.library.splice(1);
    const life = p.life;
    const s = settle(run(s0, planActivate(s0, ap, fast, 0)));
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(s.objects[font]!.counters.blood).toBe(2);
  });

  it("it doesn't let you pay more life than you have (rulings); Toxic Deluge's X life is X cards", () => {
    const { s: s0, ap, fast, ids } = board([toxicDeluge()]);
    s0.players[ap]!.life = 1;
    expect(planActivate(s0, ap, fast, 0)).toBeNull();
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2)).toBeNull();
    s0.players[ap]!.life = 40;
    const top = s0.players[ap]!.library.slice(0, 4);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 3)));
    expect(s.players[ap]!.life).toBe(40);
    expect(top.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile", "library"]);
  });

  it("Phyrexian mana paid with life exiles cards too", () => {
    const { s: s0, ap, opp, ids } = board([gitaxianProbe()]);
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap) s0.objects[id]!.tapped = true;
    s0.players[ap]!.manaPool.C = 1;
    const top = s0.players[ap]!.library.slice(0, 2);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(40);
    expect(s.objects[top[0]!]!.zone).toBe("exile");
  });

  it("a shock land played from the top of the library isn't one of the cards exiled (CR 614.13c)", () => {
    const { s: s0, ap } = board();
    putOnBattlefield(s0, ap, courserOfKruphix());
    const [a, b] = s0.players[ap]!.library.slice(0, 2);
    const pool = onTop(s0, ap, breedingPool());
    expect(legalActions(s0, ap).some((x) => x.type === "playLand" && x.objectId === pool)).toBe(true);
    const s = settle(act(s0, { type: "playLand", player: ap, objectId: pool, untapped: true }));
    expect(s.objects[pool]!.zone).toBe("battlefield");
    expect(s.objects[pool]!.tapped).toBe(false);
    expect([s.objects[a!]!.zone, s.objects[b!]!.zone]).toEqual(["exile", "exile"]);
    // Courser's landfall: 1 life gained, none paid.
    expect(s.players[ap]!.life).toBe(41);
  });

  it("+1: look at the top two, exile the one chosen and put the other into your hand", () => {
    const { s: s0, ap, ashiok } = board();
    const giant = onTop(s0, ap, hillGiant());
    const bolt = onTop(s0, ap, lightningBolt());
    let s = settle(run(s0, planActivate(s0, ap, ashiok, 0)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([bolt, giant].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [giant] }));
    expect(s.objects[giant]!.zone).toBe("exile");
    expect(s.objects[bolt]!.zone).toBe("hand");
    expect(s.objects[ashiok]!.counters.loyalty).toBe(6);
  });

  it("a bot's +1 exiles the card it wants less", () => {
    const { s: s0, ap, ashiok } = board();
    const giant = onTop(s0, ap, hillGiant());
    const bolt = onTop(s0, ap, lightningBolt());
    let s = settle(run(s0, planActivate(s0, ap, ashiok, 0)));
    for (const x of botActions(s, ap)) s = act(s, x);
    s = settle(s);
    expect([s.objects[giant]!.zone, s.objects[bolt]!.zone].sort()).toEqual(["exile", "hand"]);
    expect(s.players[ap]!.hand.length).toBe(s0.players[ap]!.hand.length + 1);
  });

  it("−2: two Nightmares that grow at the beginning of combat on your turn only if a card was put into exile this turn", () => {
    for (const exiling of [false, true]) {
      const { s: s0, ap, ashiok, fast } = board();
      let s = settle(run(s0, planActivate(s0, ap, ashiok, 1)));
      const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
      expect(tokens.length).toBe(2);
      expect(s.objects[ashiok]!.counters.loyalty).toBe(3);
      // Blood Fast's 2 life become two cards exiled from the library.
      if (exiling) s = settle(run(s, planActivate(s, ap, fast, 0)));
      s = passUntil(s, "beginCombat", ap);
      s = settle(s);
      expect(tokens.map((id) => power(s, s.objects[id]!))).toEqual(exiling ? [2, 2] : [1, 1]);
    }
  });

  it("−7: target player exiles the top X cards, X the total mana value of cards you own in exile (face down as 0)", () => {
    const { s: s0, ap, opp, ashiok } = board();
    s0.objects[ashiok]!.counters.loyalty = 7;
    exiled(s0, ap, lightningBolt());
    exiled(s0, ap, hillGiant());
    const down = exiled(s0, ap, hillGiant());
    s0.objects[down]!.hiddenExile = { by: ashiok, seen: [ap], label: "Face down" };
    // Another player's card in exile doesn't count.
    exiled(s0, opp, hillGiant());
    const top = s0.players[opp]!.library.slice(0, 6);
    const s = settle(run(s0, planActivate(s0, ap, ashiok, 2, [{ kind: "player", id: opp }])));
    expect(top.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile", "exile", "exile", "library"]);
  });
});
