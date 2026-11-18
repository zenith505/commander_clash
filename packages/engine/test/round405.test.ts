// Round 405 (Lane A): Eye of Duskmantle (lands and spells from among cards in your graveyard you've surveilled this turn,
// spells only for life equal to their mana value, CR 701.25a, 118.9, 118.6a), Glorious Purpose (connive's plan counters,
// then "When the sixth plan counter is put on this enchantment, sacrifice it. If you do, ...", CR 608.2c), Lazav, Wearer of
// Faces and Spirit of Resilience (becoming a copy of a card, as printed, until end of turn: one exiled with it, CR 607.2a,
// or one of the cards that just left your graveyard, CR 603.2c, 707.2).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { applyAction, botActions, castProblem, characteristics, isFullySupported, mayPlayLandFromGraveyard, planCast, planActivate, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const eye = (): CardDef => ({"oracleId":"04e7f739-fe50-440d-aa3d-e547295044a8","name":"Eye of Duskmantle","manaCost":"{5}{B}{B}","cmc":7,"typeLine":"Creature — Eye","supertypes":[],"types":["Creature"],"subtypes":["Eye"],"oracleText":"Flying, lifelink\nYou may play lands and cast spells from among cards in your graveyard you've surveilled this turn. If you cast a spell this way, you pay life equal to its mana value rather than paying its mana cost.","power":"3","toughness":"8","colors":["B"],"colorIdentity":["B"],"keywords":["Flying","Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/9/0/905fa4ed-e496-43d8-9c4a-38e85d9b7651.jpg?1783913045","artUrl":"https://cards.scryfall.io/art_crop/front/9/0/905fa4ed-e496-43d8-9c4a-38e85d9b7651.jpg?1783913045","commanderLegal":"legal","set":"mkc","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const purpose = (): CardDef => ({"oracleId":"182baad0-ec6e-4e93-9dfc-7c80b37005de","name":"Glorious Purpose","manaCost":"{1}{U}","cmc":2,"typeLine":"Enchantment — Plan","supertypes":[],"types":["Enchantment"],"subtypes":["Plan"],"oracleText":"Whenever a creature you control connives, put a +1/+1 counter on that creature and a plan counter on this enchantment.\nWhen the sixth plan counter is put on this enchantment, sacrifice it. If you do, exile the top four cards of your library. You may cast any number of spells from among them without paying their mana costs. Put the rest into your hand.","colors":["U"],"colorIdentity":["U"],"keywords":["Connive"],"imageUrl":"https://cards.scryfall.io/normal/front/d/7/d78f2105-030f-4951-aa02-0d4db3d34f59.jpg?1783903293","artUrl":"https://cards.scryfall.io/art_crop/front/d/7/d78f2105-030f-4951-aa02-0d4db3d34f59.jpg?1783903293","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const lazav = (): CardDef => ({"oracleId":"4ec0b64d-c793-47a6-9c26-9ad4d9e9c182","name":"Lazav, Wearer of Faces","manaCost":"{U}{B}","cmc":2,"typeLine":"Legendary Creature — Shapeshifter Detective","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Shapeshifter","Detective"],"oracleText":"Whenever Lazav attacks, exile target card from a graveyard, then investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nWhenever you sacrifice a Clue, you may have Lazav become a copy of a creature card exiled with it until end of turn.","power":"2","toughness":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Investigate"],"imageUrl":"https://cards.scryfall.io/normal/front/a/7/a7f43e9f-8a0e-4534-ba4d-14cde33df864.jpg?1783912802","artUrl":"https://cards.scryfall.io/art_crop/front/a/7/a7f43e9f-8a0e-4534-ba4d-14cde33df864.jpg?1783912802","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const spirit = (): CardDef => ({"oracleId":"ddc85b23-113a-46e9-ab09-fae9312c72fa","name":"Spirit of Resilience","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Spirit Warrior","supertypes":[],"types":["Creature"],"subtypes":["Spirit","Warrior"],"oracleText":"Whenever one or more cards leave your graveyard, put a +1/+1 counter on this creature, then you may have this creature become a copy of an artifact or creature card from among those cards until end of turn.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/60584e5b-4138-405b-bd02-612cf175184e.jpg?1783903856","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/60584e5b-4138-405b-bd02-612cf175184e.jpg?1783903856","commanderLegal":"legal","set":"soc","releasedAt":"2026-04-24","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const consider = (): CardDef => ({"oracleId":"4c9bcba6-87b5-4fb3-97ee-6fe5b739337d","name":"Consider","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Surveil 1. (Look at the top card of your library. You may put it into your graveyard.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Surveil"],"imageUrl":"https://cards.scryfall.io/normal/front/8/f/8fcce60c-6baa-4f55-907a-4acc2a597030.jpg?1790866133","artUrl":"https://cards.scryfall.io/art_crop/front/8/f/8fcce60c-6baa-4f55-907a-4acc2a597030.jpg?1790866133","commanderLegal":"legal","set":"spg","releasedAt":"2026-10-02","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const informant = (): CardDef => ({"oracleId":"838c4831-7d5c-4025-92b3-46eee59d6b34","name":"Raffine's Informant","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"When this creature enters, it connives. (Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on this creature.)","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Connive"],"imageUrl":"https://cards.scryfall.io/normal/front/4/e/4e64ff87-2099-4360-94f6-164277b7b514.jpg?1783923153","artUrl":"https://cards.scryfall.io/art_crop/front/4/e/4e64ff87-2099-4360-94f6-164277b7b514.jpg?1783923153","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const raise = (): CardDef => ({"oracleId":"cbc9c731-181a-4f00-a7b0-eb7e56eac2ea","name":"Raise Dead","manaCost":"{B}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return target creature card from your graveyard to your hand.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/9/99ec4a57-003e-40fd-9998-ed10b38eeed7.jpg?1783946471","artUrl":"https://cards.scryfall.io/art_crop/front/9/9/99ec4a57-003e-40fd-9998-ed10b38eeed7.jpg?1783946471","commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const vision = (): CardDef => ({"oracleId":"9728dec9-d482-4c7a-8cdc-44d010dc878d","name":"Ancestral Vision","manaCost":"","cmc":0,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Suspend 4—{U} (Rather than cast this card from your hand, pay {U} and exile it with four time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)\nTarget player draws three cards.","colors":["U"],"colorIdentity":["U"],"keywords":["Suspend"],"imageUrl":"https://cards.scryfall.io/normal/front/a/5/a5dc736d-7e61-4909-973f-61f7adb82b64.jpg?1783935551","artUrl":"https://cards.scryfall.io/art_crop/front/a/5/a5dc736d-7e61-4909-973f-61f7adb82b64.jpg?1783935551","commanderLegal":"legal","set":"ima","releasedAt":"2017-11-17","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const crypt = (): CardDef => ({"oracleId":"1573f7f9-672c-421a-b1ac-3d0d8aea59ca","name":"Tormod's Crypt","manaCost":"{0}","cmc":0,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}, Sacrifice this artifact: Exile target player's graveyard.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/f/0f9668ba-d26d-4484-b4b8-6fb91fbfb617.jpg?1783947925","artUrl":"https://cards.scryfall.io/art_crop/front/0/f/0f9668ba-d26d-4484-b4b8-6fb91fbfb617.jpg?1783947925","commanderLegal":"legal","set":"drk","releasedAt":"1994-08-01","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const agenda = (): CardDef => ({"oracleId":"72177c93-ed1f-47bd-99a6-ad229a292d46","name":"Yawgmoth's Agenda","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"You can't cast more than one spell each turn.\nYou may play lands and cast spells from your graveyard.\nIf a card would be put into your graveyard from anywhere, exile it instead.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50f7ea7f-4f17-4f78-b68e-693e265ca829.jpg?1783945688","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50f7ea7f-4f17-4f78-b68e-693e265ca829.jpg?1783945688","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const sewers = (): CardDef => ({"oracleId":"08d80efc-9542-4ba2-824c-c8615d8d07f2","name":"Undercity Sewers","manaCost":"","cmc":0,"typeLine":"Land — Island Swamp","supertypes":[],"types":["Land"],"subtypes":["Island","Swamp"],"oracleText":"({T}: Add {U} or {B}.)\nThis land enters tapped.\nWhen this land enters, surveil 1. (Look at the top card of your library. You may put it into your graveyard.)","colors":[],"colorIdentity":["B","U"],"keywords":["Surveil"],"producedMana":["B","U"],"imageUrl":"https://cards.scryfall.io/normal/front/2/b/2b5801fb-2026-4f25-98bc-ebb2f99684b9.jpg?1786507741","artUrl":"https://cards.scryfall.io/art_crop/front/2/b/2b5801fb-2026-4f25-98bc-ebb2f99684b9.jpg?1786507741","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: ObjectId): TargetChoice => ({ kind: "object", id });
/** Everyone passes until the stack is empty or a question other than a "you may" (answered yes) comes up. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
    else if (s.pending) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** `pid`'s card in a zone of theirs: library (on top, the first one on top), graveyard or hand. */
function place(s: GameState, pid: PlayerId, zone: "library" | "graveyard" | "hand", defs: CardDef[]) {
  const ids = defs.map((def) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = zone;
    return id;
  });
  if (zone === "library") s.players[pid]!.library.unshift(...ids);
  else s.players[pid]![zone].push(...ids);
  invalidateCharacteristics(s);
  return ids;
}
const name = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;

describe("round 405: parse", () => {
  it("every card of the round is fully supported", () => {
    for (const d of [eye(), purpose(), lazav(), spirit()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

/** Casts Consider, putting the top card of the library into the graveyard with its surveil. */
function surveilAway(s0: GameState, ap: PlayerId, considerId: ObjectId) {
  let s = run(s0, planCast(s0, ap, considerId));
  s = settle(s);
  expect(s.pending?.kind).toBe("arrangeTop");
  const top = (s.pending as { cards: ObjectId[] }).cards[0]!;
  s = act(s, { type: "arrangeTop", player: ap, top: [], away: [top] });
  return settle(s);
}

describe("round 405: Eye of Duskmantle", () => {
  it("a spell you surveilled into your graveyard this turn is cast for life equal to its mana value, never for mana", () => {
    const { s: s0, ap, ids } = setup([consider()]);
    putOnBattlefield(s0, ap, eye());
    const [div] = place(s0, ap, "library", [divination()]);
    let s = surveilAway(s0, ap, ids[0]!);
    expect(s.objects[div!]!.zone).toBe("graveyard");
    // Its mana cost can't be paid this way (rulings), only the life.
    expect(castProblem(s, ap, div!, undefined, undefined, undefined, undefined, undefined, { via: "permission" })).toMatch(/only by paying life equal to its mana value/);
    const before = life(s, ap);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, div!, undefined, undefined, "auto", undefined, { via: "permission", alt: "citadel" })));
    expect(life(s, ap)).toBe(before - 3);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.objects[div!]!.zone).toBe("graveyard");
  });

  it("a card put there another way, or surveilled on an earlier turn, can't be cast this way", () => {
    const { s: s0, ap, ids } = setup([consider()]);
    putOnBattlefield(s0, ap, eye());
    const [other] = place(s0, ap, "graveyard", [divination()]);
    s0.objects[other!]!.toGraveyardTurn = s0.turn;
    expect(castProblem(s0, ap, other!, undefined, undefined, undefined, undefined, undefined, { via: "permission", alt: "citadel" })).not.toBeNull();
    const [div] = place(s0, ap, "library", [divination()]);
    const s = surveilAway(s0, ap, ids[0]!);
    expect(castProblem(s, ap, div!, undefined, undefined, undefined, undefined, undefined, { via: "permission", alt: "citadel" })).toBeNull();
    s.turn += 1;
    invalidateCharacteristics(s);
    expect(castProblem(s, ap, div!, undefined, undefined, undefined, undefined, undefined, { via: "permission", alt: "citadel" })).not.toBeNull();
  });

  it("surveilled before the Eye was there counts too; a card with no mana cost is cast for 0 life (CR 118.6a)", () => {
    const { s: s0, ap, ids } = setup([consider()]);
    const [vis] = place(s0, ap, "library", [vision()]);
    let s = surveilAway(s0, ap, ids[0]!);
    putOnBattlefield(s, ap, eye());
    const before = life(s, ap);
    const hand = s.players[ap]!.hand.length;
    s = run(s, planCast(s, ap, vis!, [{ kind: "player", id: ap }], undefined, "auto", undefined, { via: "permission", alt: "citadel" }));
    s = settle(s);
    expect(life(s, ap)).toBe(before);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });

  it("a land card you surveilled into your graveyard this turn may be played, with a land play", () => {
    const { s: s0, ap, ids } = setup([consider()]);
    putOnBattlefield(s0, ap, eye());
    const [land] = place(s0, ap, "library", [forest()]);
    let s = surveilAway(s0, ap, ids[0]!);
    expect(mayPlayLandFromGraveyard(s, s.objects[land!]!, ap)).toBe(true);
    s = act(s, { type: "playLand", player: ap, objectId: land! });
    expect(s.objects[land!]!.zone).toBe("battlefield");
  });

  it("without the Eye, nothing lets you cast it", () => {
    const { s: s0, ap, ids } = setup([consider()]);
    const [div] = place(s0, ap, "library", [divination()]);
    const s = surveilAway(s0, ap, ids[0]!);
    expect(castProblem(s, ap, div!, undefined, undefined, undefined, undefined, undefined, { via: "permission", alt: "citadel" })).not.toBeNull();
  });
});

describe("round 405: Glorious Purpose", () => {
  it("each time a creature you control connives: a +1/+1 counter on it and a plan counter on Glorious Purpose", () => {
    const { s: s0, ap, ids } = setup([informant()]);
    const gp = putOnBattlefield(s0, ap, purpose());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // Connive's discard.
    if (s.pending?.kind === "discard") s = settle(act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand.find((id) => characteristics(s, s.objects[id]!).types.includes("Land")) ?? s.players[ap]!.hand[0]!] }));
    const inf = s.battlefield.find((id) => name(s, id) === "Raffine's Informant")!;
    expect(s.objects[gp]!.counters.plan).toBe(1);
    expect(s.objects[inf]!.counters["+1/+1"] ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("the sixth plan counter: sacrifice it, exile the top four, cast any number free, the rest into your hand", () => {
    const { s: s0, ap, ids } = setup([informant()]);
    const gp = putOnBattlefield(s0, ap, purpose());
    s0.objects[gp]!.counters.plan = 5;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind === "discard") s = settle(act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand[0]!] }));
    // The top four now (connive drew one card before the counter went on).
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    const offered = (s.pending as { options: string[] }).options;
    expect(s.objects[gp]!.zone).toBe("graveyard");
    const exiled = s.players[ap]!.exile.slice(-4);
    expect(exiled.length).toBe(4);
    const spell = offered.find((o) => o !== "none")!;
    s = act(s, { type: "chooseOption", player: ap, choice: spell });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: spell });
    s = run(s, planCast(s, ap, spell));
    for (let i = 0; i < 10 && s.pending?.kind === "chooseOption" && (s.pending as { what: string }).what === "castFromAmong"; i++) s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(s.objects[spell]!.zone).toBe("stack");
    for (const id of exiled.filter((id) => id !== spell)) expect(s.objects[id]!.zone).toBe("hand");
  });

  it("if it's gone before the sixth counter's ability resolves, it isn't sacrificed and nothing is exiled", () => {
    const { s: s0, ap, ids } = setup([informant()]);
    const gp = putOnBattlefield(s0, ap, purpose());
    s0.objects[gp]!.counters.plan = 5;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 100; i++) {
      if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand[0]!] });
      else if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
      else if (s.stack.some((x) => x.sourceId === gp && /sixth|sacrifice/i.test(x.description ?? ""))) break;
      else if (s.pending) throw new Error(s.pending.kind);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[gp]!.counters.plan).toBe(6);
    const exile = s.players[ap]!.exile.length;
    // Gone (bounced) before its ability resolves.
    s.battlefield.splice(s.battlefield.indexOf(gp), 1);
    s.objects[gp]!.zone = "hand";
    s.players[ap]!.hand.push(gp);
    s.objects[gp]!.zoneChanges = (s.objects[gp]!.zoneChanges ?? 0) + 1;
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.exile.length).toBe(exile);
  });
});

describe("round 405: Eye of Duskmantle with another permission", () => {
  it("with Yawgmoth's Agenda too, the surveilled card may be cast for its mana cost or for life", () => {
    const { s: s0, ap, ids } = setup([sewers()]);
    putOnBattlefield(s0, ap, eye());
    const [div] = place(s0, ap, "library", [divination()]);
    // Undercity Sewers' enters trigger surveils (no spell cast: Agenda allows one each turn).
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }));
    expect(s.pending?.kind).toBe("arrangeTop");
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [], away: [div!] }));
    // After the surveil (its replacement would have exiled the card instead).
    putOnBattlefield(s, ap, agenda());
    // For its mana cost (lands untapped: "not enough mana" only until they're tapped), or for life.
    expect(planCast(s, ap, div!, undefined, undefined, "auto", undefined, { via: "permission" })).not.toBeNull();
    expect(castProblem(s, ap, div!, undefined, undefined, undefined, undefined, undefined, { via: "permission", alt: "citadel" })).toBeNull();
    const before = life(s, ap);
    const paid = settle(run(s, planCast(s, ap, div!, undefined, undefined, "auto", undefined, { via: "permission", alt: "citadel" })));
    expect(life(paid, ap)).toBe(before - 3);
  });
});

/** Lazav attacks `opp`, exiling `card` from a graveyard with its trigger, then investigates. */
function lazavAttack(s0: GameState, ap: PlayerId, opp: PlayerId, lz: ObjectId, card: ObjectId) {
  let s = s0;
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: lz, defender: opp }] });
  for (let i = 0; i < 50 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(card)] });
  for (let i = 0; i < 50 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const clueOf = (s: GameState, pid: PlayerId) => s.battlefield.find((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).subtypes.includes("Clue"))!;
const copyChoice = (s: GameState) => (s.pending?.kind === "chooseOption" && s.pending.what === "copyAmong" ? s.pending.options : undefined);

describe("round 405: Lazav, Wearer of Faces", () => {
  it("sacrificing a Clue: Lazav may become a copy of a creature card exiled with it until end of turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const lz = putOnBattlefield(s0, ap, lazav());
    const [b] = place(s0, opp, "graveyard", [bears()]);
    let s = lazavAttack(s0, ap, opp, lz, b!);
    expect(s.objects[b!]!.zone).toBe("exile");
    const clue = clueOf(s, ap);
    s = run(s, planActivate(s, ap, clue, 0));
    for (let i = 0; i < 50 && !copyChoice(s); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(copyChoice(s)).toEqual([b, "none"]);
    expect(botActions(s, ap)[0]).toMatchObject({ type: "chooseOption", choice: "none" });
    s = act(s, { type: "chooseOption", player: ap, choice: b! });
    expect(name(s, lz)).toBe("Grizzly Bears");
    expect(characteristics(s, s.objects[lz]!).power).toBe(2);
    // Until end of turn: Lazav again on the next turn.
    const turn = s.turn;
    for (let i = 0; i < 400 && s.turn === turn; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
      else if (p) throw new Error(p.kind);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(name(s, lz)).toBe("Lazav, Wearer of Faces");
  });

  it("it may stay Lazav; a noncreature card exiled with it can't be chosen", () => {
    const { s: s0, ap, opp } = setup([]);
    const lz = putOnBattlefield(s0, ap, lazav());
    const [d] = place(s0, opp, "graveyard", [divination()]);
    let s = lazavAttack(s0, ap, opp, lz, d!);
    s = run(s, planActivate(s, ap, clueOf(s, ap), 0));
    for (let i = 0; i < 50 && (s.stack.length || s.pending); i++) {
      expect(copyChoice(s)).toBeUndefined();
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(name(s, lz)).toBe("Lazav, Wearer of Faces");
  });
});

describe("round 405: Spirit of Resilience", () => {
  it("cards leaving your graveyard at once: one trigger, a counter, then a copy of an artifact or creature card among them", () => {
    const { s: s0, ap } = setup([]);
    const sp = putOnBattlefield(s0, ap, spirit());
    const [g, d, o] = place(s0, ap, "graveyard", [giant(), divination(), ornithopter()]);
    const tc = putOnBattlefield(s0, ap, crypt());
    let s = run(s0, planActivate(s0, ap, tc, 0, [{ kind: "player", id: ap }]));
    for (let i = 0; i < 50 && !copyChoice(s); i++) {
      if (s.pending) throw new Error(s.pending.kind);
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[d!]!.zone).toBe("exile");
    expect(s.objects[sp]!.counters["+1/+1"]).toBe(1);
    // Tormod's Crypt itself, sacrificed to pay the cost, is exiled with the rest.
    expect(copyChoice(s)).toEqual([g, o, tc, "none"]);
    expect(botActions(s, ap)[0]).toMatchObject({ type: "chooseOption", choice: g });
    s = act(s, { type: "chooseOption", player: ap, choice: g! });
    expect(name(s, sp)).toBe("Hill Giant");
    // Hill Giant's 3/3 with its +1/+1 counter.
    expect(characteristics(s, s.objects[sp]!).power).toBe(4);
    expect(s.stack.length).toBe(0);
  });

  it("only a noncreature, nonartifact card leaving: the counter, and nothing to copy", () => {
    const { s: s0, ap } = setup([raise()]);
    const sp = putOnBattlefield(s0, ap, spirit());
    const [b] = place(s0, ap, "graveyard", [bears()]);
    let s = run(s0, planCast(s0, ap, ids0(s0, ap), [tgt(b!)]));
    s = settle(s);
    expect(s.objects[b!]!.zone).toBe("hand");
    expect(s.objects[sp]!.counters["+1/+1"]).toBe(1);
    // Grizzly Bears is a creature card: the choice comes up.
    expect(copyChoice(s)).toEqual([b, "none"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(name(s, sp)).toBe("Spirit of Resilience");
  });
});
const ids0 = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.find((id) => name(s, id) === "Raise Dead")!;
