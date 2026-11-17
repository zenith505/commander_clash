// Lane B round B240: Pure Intentions (a delayed trigger for the turn returning the cards an opponent's spell or ability
// made you discard), Bösium Strip (instants and sorceries cast from the top of your graveyard this turn, exiled after) and
// Abandoned Sarcophagus (spells with cycling cast from your graveyard; cards with cycling exiled unless they were cycled).

import { describe, expect, it } from "vitest";
import { act, passUntil, plainsCard, putOnBattlefield, setup, swamp } from "./helpers";
import { moveObject } from "../src/game";
import { botActions, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const pureIntentions = (): CardDef => ({"oracleId":"77ef82e6-16e3-44fa-9542-252060fa6c96","name":"Pure Intentions","manaCost":"{W}","cmc":1,"typeLine":"Instant — Arcane","supertypes":[],"types":["Instant"],"subtypes":["Arcane"],"oracleText":"Whenever a spell or ability an opponent controls causes you to discard cards this turn, return those cards from your graveyard to your hand.\nWhen a spell or ability an opponent controls causes you to discard this card, return this card from your graveyard to your hand at the beginning of the next end step.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/2/b231d818-df57-4e2d-9603-babe0c2c4568.jpg?1783944167","artUrl":"https://cards.scryfall.io/art_crop/front/b/2/b231d818-df57-4e2d-9603-babe0c2c4568.jpg?1783944167","commanderLegal":"legal","set":"sok","releasedAt":"2005-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bosiumStrip = (): CardDef => ({"oracleId":"2fa6f1b1-00af-433f-b8e1-36db99cd9bba","name":"Bösium Strip","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{3}, {T}: Until end of turn, you may cast instant and sorcery spells from the top of your graveyard. If a spell cast this way would be put into a graveyard, exile it instead.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/8/3884bede-df28-42e8-9ac9-ae03118b1985.jpg?1783946716","artUrl":"https://cards.scryfall.io/art_crop/front/3/8/3884bede-df28-42e8-9ac9-ae03118b1985.jpg?1783946716","commanderLegal":"legal","set":"wth","releasedAt":"1997-06-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const abandonedSarcophagus = (): CardDef => ({"oracleId":"a051dee0-60c8-4f58-84cb-55460c097115","name":"Abandoned Sarcophagus","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"You may cast spells that have a cycling ability from your graveyard.\nIf a card that has a cycling ability would be put into your graveyard from anywhere and it wasn't cycled, exile it instead.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/1/c191fb87-f111-4ac2-a52a-3af103a9314e.jpg?1783936003","artUrl":"https://cards.scryfall.io/art_crop/front/c/1/c191fb87-f111-4ac2-a52a-3af103a9314e.jpg?1783936003","commanderLegal":"legal","set":"hou","releasedAt":"2017-07-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mindRot = (): CardDef => ({"oracleId":"ad44cf74-b717-48fb-9fa2-77512024d76a","name":"Mind Rot","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player discards two cards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hieroglyphicIllumination = (): CardDef => ({"oracleId":"60e358ec-eb11-4a16-a0ae-b7c064a8ea6c","name":"Hieroglyphic Illumination","manaCost":"{3}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Draw two cards.\nCycling {U} ({U}, Discard this card: Draw a card.)","colors":["U"],"colorIdentity":["U"],"keywords":["Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/c/6/c60a0e75-53bb-43e4-890f-0e1972a7e0b9.jpg?1783936520","artUrl":"https://cards.scryfall.io/art_crop/front/c/6/c60a0e75-53bb-43e4-890f-0e1972a7e0b9.jpg?1783936520","commanderLegal":"legal","set":"akh","releasedAt":"2017-04-28","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const sandbarMerfolk = (): CardDef => ({"oracleId":"7d6e5a88-a7fd-466c-a9f8-5015e3400176","name":"Sandbar Merfolk","manaCost":"{U}","cmc":1,"typeLine":"Creature — Merfolk","supertypes":[],"types":["Creature"],"subtypes":["Merfolk"],"oracleText":"Cycling {2} ({2}, Discard this card: Draw a card.)","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/65ce3960-abf1-4f28-8434-ab3b27d3b7cb.jpg?1783946356","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/65ce3960-abf1-4f28-8434-ab3b27d3b7cb.jpg?1783946356","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const barkhideMauler = (): CardDef => ({"oracleId":"84a18b1f-5f9f-4e2b-87cd-c437bdf4d278","name":"Barkhide Mauler","manaCost":"{4}{G}","cmc":5,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"Cycling {2} ({2}, Discard this card: Draw a card.)","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/b/9/b9196ce7-3ff4-4dda-a628-559ada11c9ba.jpg?1783945046","artUrl":"https://cards.scryfall.io/art_crop/front/b/9/b9196ce7-3ff4-4dda-a628-559ada11c9ba.jpg?1783945046","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const restInPeace = (): CardDef => ({"oracleId":"087f9ad7-e74f-40e2-8102-1ed2925d0418","name":"Rest in Peace","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98040e14-8182-4a94-9322-bbd967dc4dfe.jpg?1783910962","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98040e14-8182-4a94-9322-bbd967dc4dfe.jpg?1783910962","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ravensCrime = (): CardDef => ({"oracleId":"a21c85f3-482b-47e5-9321-0ca21e110bd8","name":"Raven's Crime","manaCost":"{B}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player discards a card.\nRetrace (You may cast this card from your graveyard by discarding a land card in addition to paying its other costs.)","colors":["B"],"colorIdentity":["B"],"keywords":["Retrace"],"imageUrl":"https://cards.scryfall.io/normal/front/7/c/7ced5797-5de0-43ca-9dc9-e48912333a70.jpg?1783942686","artUrl":"https://cards.scryfall.io/art_crop/front/7/c/7ced5797-5de0-43ca-9dc9-e48912333a70.jpg?1783942686","commanderLegal":"legal","set":"eve","releasedAt":"2008-07-25","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hymnToTourach = (): CardDef => ({"oracleId":"992d9a72-d34d-47d7-96fb-37f0efb515ef","name":"Hymn to Tourach","manaCost":"{B}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player discards two cards at random.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f4089e6c-51eb-44c4-8395-68e43cbed93d.jpg?1783939881","artUrl":"https://cards.scryfall.io/art_crop/front/f/4/f4089e6c-51eb-44c4-8395-68e43cbed93d.jpg?1783939881","commanderLegal":"legal","set":"v13","releasedAt":"2013-08-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or a question is asked; bots answer the questions of anyone but `me`. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && me !== undefined && p.player === me) return s;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
/** Casting a card from a graveyard with a permission (CastFromGraveyard "permission"). */
const fromYard = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[]) => planCast(s, pid, id, targets, undefined, undefined, undefined, { via: "permission" });
/** A card put into `pid`'s `where` (the top of a library, the top of a graveyard, the hand). */
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  return id;
};
/** Passes priority until `pid` has it (the stack unchanged). */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};

describe("Lane B round B240", () => {
  it("are fully supported", () => supported(pureIntentions(), bosiumStrip(), abandonedSarcophagus()));
});

describe("Lane B round B240: Pure Intentions", () => {
  /** The next player (`opp`) holds Pure Intentions and two Bears with a Plains; you hold Mind Rot. */
  const game = () => {
    const { s, ap, opp } = setup([]);
    s.players[opp]!.hand = [];
    putOnBattlefield(s, opp, plainsCard);
    const pure = into(s, opp, pureIntentions(), "hand");
    const bears = [into(s, opp, grizzlyBears(), "hand"), into(s, opp, grizzlyBears(), "hand")];
    const rot = into(s, ap, mindRot(), "hand");
    return { s, ap, opp, pure, bears, rot };
  };

  it("returns the cards an opponent's spell made you discard this turn to your hand", () => {
    const { s: s0, ap, opp, pure, bears, rot } = game();
    let s = run(s0, planCast(s0, ap, rot, [ply(opp)]));
    s = priorityTo(s, opp);
    s = run(s, planCast(s, opp, pure));
    s = settle(s);
    expect(zone(s, rot)).toBe("graveyard");
    expect(zone(s, pure)).toBe("graveyard");
    // Both discarded at once (one event, one trigger), then returned together.
    for (const b of bears) expect(zone(s, b)).toBe("hand");
    expect(s.players[opp]!.hand.length).toBe(2);
  });

  it("does nothing for your own spell's discard", () => {
    const { s: s0, ap, rot } = game();
    s0.players[ap]!.hand = [rot];
    const pure = into(s0, ap, pureIntentions(), "hand");
    const bears = [into(s0, ap, grizzlyBears(), "hand"), into(s0, ap, grizzlyBears(), "hand")];
    let s = settle(run(s0, planCast(s0, ap, pure)));
    expect(zone(s, pure)).toBe("graveyard");
    s = settle(run(s, planCast(s, ap, rot, [ply(ap)])));
    for (const b of bears) expect(zone(s, b)).toBe("graveyard");
  });

  it("lasts only this turn", () => {
    const { s: s0, ap, opp } = game();
    s0.players[ap]!.hand = [];
    const pure = into(s0, ap, pureIntentions(), "hand");
    const bears = [into(s0, ap, grizzlyBears(), "hand"), into(s0, ap, grizzlyBears(), "hand")];
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, swamp);
    const theirRot = into(s0, opp, mindRot(), "hand");
    let s = settle(run(s0, planCast(s0, ap, pure)));
    expect(zone(s, pure)).toBe("graveyard");
    // The next turn, the next player's Mind Rot makes you discard: nothing comes back.
    s = passUntil(s, "main1", opp);
    s = settle(run(s, planCast(s, opp, theirRot, [ply(ap)])));
    expect(zone(s, theirRot)).toBe("graveyard");
    for (const b of bears) expect(zone(s, b)).toBe("graveyard");
  });

  it("leaves a discarded card that went elsewhere (Rest in Peace) where it is", () => {
    const { s: s0, ap, opp, pure, bears, rot } = game();
    putOnBattlefield(s0, ap, restInPeace());
    let s = run(s0, planCast(s0, ap, rot, [ply(opp)]));
    s = priorityTo(s, opp);
    s = settle(run(s, planCast(s, opp, pure)));
    for (const b of bears) expect(zone(s, b)).toBe("exile");
  });

  it("returns itself at the next end step when an opponent's spell makes you discard it", () => {
    const { s: s0, ap, opp, pure, bears, rot } = game();
    // Its hand is Pure Intentions and one Bears: both discarded.
    s0.players[opp]!.hand = [pure, bears[0]!];
    let s = settle(run(s0, planCast(s0, ap, rot, [ply(opp)])));
    expect(zone(s, pure)).toBe("graveyard");
    // Not cast: its first paragraph did nothing, so the discarded Bears stays.
    expect(zone(s, bears[0]!)).toBe("graveyard");
    s = settle(passUntil(s, "end"));
    expect(zone(s, pure)).toBe("hand");
    expect(zone(s, bears[0]!)).toBe("graveyard");
  });
});

describe("Lane B round B240: Bösium Strip", () => {
  /** Your Bösium Strip; your graveyard holds Shock, then Lightning Bolt on top. */
  const game = () => {
    const { s, ap, opp } = setup([]);
    const strip = putOnBattlefield(s, ap, bosiumStrip());
    const shockId = into(s, ap, shock(), "graveyard");
    const bolt = into(s, ap, lightningBolt(), "graveyard");
    return { s, ap, opp, strip, shockId, bolt };
  };

  it("lets you cast the instant or sorcery on top of your graveyard this turn, then the next, each exiled after", () => {
    const { s: s0, ap, opp, strip, shockId, bolt } = game();
    expect(fromYard(s0, ap, bolt, [ply(opp)])).toBeNull();
    let s = settle(run(s0, planActivate(s0, ap, strip, 0)));
    expect(fromYard(s, ap, bolt, [ply(opp)])).not.toBeNull();
    // Only the top card: Shock is under Lightning Bolt.
    expect(fromYard(s, ap, shockId, [ply(opp)])).toBeNull();
    const life = s.players[opp]!.life;
    s = settle(run(s, fromYard(s, ap, bolt, [ply(opp)])));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(zone(s, bolt)).toBe("exile");
    // Shock is on top now.
    s = settle(run(s, fromYard(s, ap, shockId, [ply(opp)])));
    expect(s.players[opp]!.life).toBe(life - 5);
    expect(zone(s, shockId)).toBe("exile");
  });

  it("doesn't reach an instant under a card of another type, and ends with the turn", () => {
    const { s: s0, ap, opp, strip, bolt } = game();
    const bears = into(s0, ap, grizzlyBears(), "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, strip, 0)));
    expect(fromYard(s, ap, bolt, [ply(opp)])).toBeNull();
    expect(fromYard(s, ap, bears)).toBeNull();
    // Bears leaves the graveyard: Lightning Bolt is on top, but only this turn.
    moveObject(s, bears, "exile");
    expect(fromYard(s, ap, bolt, [ply(opp)])).not.toBeNull();
    // An empty hand but a Shock, so nothing is discarded at cleanup.
    s.players[ap]!.hand = [];
    const inHand = into(s, ap, shock(), "hand");
    s = priorityTo(passUntil(s, "upkeep", opp), ap);
    expect(planCast(s, ap, inHand, [ply(opp)])).not.toBeNull();
    expect(fromYard(s, ap, bolt, [ply(opp)])).toBeNull();
  });

  it("casts a sorcery from the top only when you could cast a sorcery", () => {
    const { s: s0, ap, strip } = game();
    const div = into(s0, ap, divination(), "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, strip, 0)));
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, fromYard(s, ap, div)));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(zone(s, div)).toBe("exile");
  });
});

describe("Lane B round B240: Abandoned Sarcophagus", () => {
  const game = () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, abandonedSarcophagus());
    return { s, ap, opp };
  };

  it("casts a spell with cycling from your graveyard, which is exiled after it resolves (it wasn't cycled)", () => {
    const { s: s0, ap } = game();
    const ill = into(s0, ap, hieroglyphicIllumination(), "graveyard");
    const bolt = into(s0, ap, lightningBolt(), "graveyard");
    expect(fromYard(s0, ap, bolt, [ply(ap)])).toBeNull();
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, fromYard(s0, ap, ill)));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(zone(s, ill)).toBe("exile");
  });

  it("leaves a cycled card in your graveyard, castable from there", () => {
    const { s: s0, ap } = game();
    const merfolk = into(s0, ap, sandbarMerfolk(), "hand");
    let s = settle(run(s0, planActivate(s0, ap, merfolk, 0)));
    expect(zone(s, merfolk)).toBe("graveyard");
    s = settle(run(s, fromYard(s, ap, merfolk)));
    expect(zone(s, merfolk)).toBe("battlefield");
    // It dies: a card with cycling that wasn't cycled is exiled instead.
    const bolt = into(s, ap, lightningBolt(), "hand");
    s = settle(run(s, planCast(s, ap, bolt, [tgt(merfolk)])));
    expect(zone(s, merfolk)).toBe("exile");
    // Lightning Bolt has no cycling.
    expect(zone(s, bolt)).toBe("graveyard");
  });

  it("exiles a card with cycling you discard and another's going to an opponent's graveyard is left alone", () => {
    const { s: s0, ap, opp } = game();
    s0.players[ap]!.hand = [];
    const rot = into(s0, ap, mindRot(), "hand");
    const mauler = into(s0, ap, barkhideMauler(), "hand");
    const bears = into(s0, ap, grizzlyBears(), "hand");
    const theirs = putOnBattlefield(s0, opp, sandbarMerfolk());
    let s = settle(run(s0, planCast(s0, ap, rot, [ply(ap)])));
    expect(zone(s, mauler)).toBe("exile");
    expect(zone(s, bears)).toBe("graveyard");
    const bolt = into(s, ap, lightningBolt(), "hand");
    s = settle(run(s, planCast(s, ap, bolt, [tgt(theirs)])));
    expect(zone(s, theirs)).toBe("graveyard");
  });
});
