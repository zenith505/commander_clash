// Round 398 (Lane A): Hurkyl, Master Wizard (one revealed card for each card type among the noncreature spells you've
// cast this turn), The Book of Vile Darkness (a token with all triggered abilities of the cards its cost exiled, part of
// its copiable values) and Grime Gorger (up to one card of each card type from the defending player's graveyard).

import { describe, expect, it } from "vitest";
import { act, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, compileCard, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";
import { loseLife } from "../src/game";
import { addCopyEffect, copyKey } from "../src/copies";
import { abilitiesOf, defOf } from "../src/cards";

// Real card data (Scryfall).
const hurkyl = (): CardDef => ({"oracleId":"957df9f4-73e9-4540-b838-52f65d0c62ee","name":"Hurkyl, Master Wizard","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Creature — Human Wizard Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard","Advisor"],"oracleText":"At the beginning of your end step, if you've cast a noncreature spell this turn, reveal the top five cards of your library. For each card type among noncreature spells you've cast this turn, you may put a card of that type from among the revealed cards into your hand. Put the rest on the bottom of your library in a random order.","power":"2","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/f/5fcee066-425f-4341-bde5-13a5bdf06f2a.jpg?1783920111","artUrl":"https://cards.scryfall.io/art_crop/front/5/f/5fcee066-425f-4341-bde5-13a5bdf06f2a.jpg?1783920111","commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const book = (): CardDef => ({"oracleId":"fcc666bc-6fea-44e0-94bc-462c742db528","name":"The Book of Vile Darkness","manaCost":"{B}{B}{B}","cmc":3,"typeLine":"Legendary Artifact — Book","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Book"],"oracleText":"At the beginning of your end step, if you lost 2 or more life this turn, create a 2/2 black Zombie creature token.\n{T}, Exile The Book of Vile Darkness and artifacts you control named Eye of Vecna and Hand of Vecna: Create Vecna, a legendary 8/8 black Zombie God creature token with indestructible and all triggered abilities of the exiled cards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/5/05dcff61-8c48-401f-a31f-5fc53a298356.jpg?1783926499","artUrl":"https://cards.scryfall.io/art_crop/front/0/5/05dcff61-8c48-401f-a31f-5fc53a298356.jpg?1783926499","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const eye = (): CardDef => ({"oracleId":"371a7bbf-5890-46d8-ae57-f020c103b465","name":"Eye of Vecna","manaCost":"{2}","cmc":2,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"When Eye of Vecna enters, you draw a card and you lose 2 life.\nAt the beginning of your upkeep, you may pay {2}. If you do, you draw a card and you lose 2 life.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/9/b91e2431-500e-441a-881d-094ebef62283.jpg?1783926440","artUrl":"https://cards.scryfall.io/art_crop/front/b/9/b91e2431-500e-441a-881d-094ebef62283.jpg?1783926440","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const hand = (): CardDef => ({"oracleId":"3b7f0dd3-5b4c-4ac0-a43a-ddc62a44663e","name":"Hand of Vecna","manaCost":"{3}","cmc":3,"typeLine":"Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"At the beginning of combat on your turn, equipped creature or a creature you control named Vecna gets +X/+X until end of turn, where X is the number of cards in your hand.\nEquip—Pay 1 life for each card in your hand.\nEquip {2}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/f/f/ff0502e4-508a-4d78-b987-0801e6b0978c.jpg?1783926383","artUrl":"https://cards.scryfall.io/art_crop/front/f/f/ff0502e4-508a-4d78-b987-0801e6b0978c.jpg?1783926383","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const gorger = (): CardDef => ({"oracleId":"7271c442-2bd1-4d78-a049-b28bd5ee6876","name":"Grime Gorger","manaCost":"{2}{B}{G}","cmc":4,"typeLine":"Creature — Horror","supertypes":[],"types":["Creature"],"subtypes":["Horror"],"oracleText":"Menace\nWhenever this creature attacks, exile up to one card of each card type from defending player's graveyard. Put a +1/+1 counter on this creature for each card exiled this way.","power":"3","toughness":"3","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/e/7/e72d9121-fd09-4035-bb3b-0eb6241107e0.jpg?1783923303","artUrl":"https://cards.scryfall.io/art_crop/front/e/7/e72d9121-fd09-4035-bb3b-0eb6241107e0.jpg?1783923303","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const anthem = (): CardDef => ({"oracleId":"e3886fe8-9b76-4613-8891-4ec74657c087","name":"Glorious Anthem","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures you control get +1/+1.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const arcane = (): CardDef => ({"oracleId":"0bc7f093-bef0-4f1a-852c-4b75ebf54838","name":"Arcane Signet","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add one mana of any color in your commander's color identity.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/c/6/c6b6117c-faab-4bbb-b851-07bd8061ef03.jpg?1789644435","artUrl":"https://cards.scryfall.io/art_crop/front/c/6/c6b6117c-faab-4bbb-b851-07bd8061ef03.jpg?1789644435","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const clone = (): CardDef => ({"oracleId":"42226b87-0746-4ebf-9fd0-108d508462af","name":"Clone","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"You may have this creature enter as a copy of any creature on the battlefield.","power":"0","toughness":"0","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const grizzly = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions are answered as the bots would, except `me`'s, where it stops. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const ch = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!);
const pt = (s: GameState, id: ObjectId) => `${ch(s, id).power}/${ch(s, id).toughness}`;
const play = (s: GameState, pid: PlayerId, def: CardDef) => putOnBattlefield(s, pid, def);
const moveTo = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "library"): ObjectId => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "graveyard") s.players[pid]!.graveyard.push(id);
  else s.players[pid]!.library.unshift(id);
  return id;
};
/** Cards put on top of `pid`'s library, the first one on top. */
const onTop = (s: GameState, pid: PlayerId, defs: CardDef[]): ObjectId[] => defs.reverse().map((d) => moveTo(s, pid, d, "library")).reverse();
/** Passes priority (answering others' questions as bots) until `step` of `ap`'s turn, stopping at `ap`'s own questions. */
const toStep = (s: GameState, step: GameState["step"], ap: PlayerId) => {
  for (let i = 0; i < 400 && !(s.step === step && s.activePlayer === ap && !s.stack.length && !s.triggerQueue.length && !s.pending); i++) {
    s = settle(s, ap);
    if (s.pending?.kind === "declareAttackers" && s.pending.player === ap) s = act(s, { type: "declareAttackers", player: ap, attacks: [] });
    else if (s.pending?.player === ap) return s;
    if (s.step === step && s.activePlayer === ap) break;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tokensNamed = (s: GameState, name: string) => s.battlefield.filter((id) => ch(s, id).name === name);

describe("round 398: compiles", () => {
  it("every card of the round is fully supported", () => {
    for (const d of [hurkyl(), book(), gorger()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("Hurkyl, Master Wizard", () => {
  /** Hurkyl on the battlefield, the given spells cast this turn, and five known cards on top of the library. */
  const begin = (spells: CardDef[], top: CardDef[]) => {
    const { s: s0, ap, ids } = setup(spells);
    play(s0, ap, hurkyl());
    const lib = onTop(s0, ap, top);
    let s = s0;
    for (const id of ids) s = settle(run(s, planCast(s, ap, id, defOf(s, s.objects[id]!).name === "Lightning Bolt" ? [{ kind: "player", id: s.turnOrder.find((p) => p !== ap)! }] : undefined)), ap);
    s = toStep(s, "end", ap);
    return { s, ap, lib };
  };

  it("offers one card for each card type among the noncreature spells you cast this turn", () => {
    const { s, ap, lib } = begin([bolt(), solRing(), grizzly()], [divination(), opt(), arcane(), anthem(), grizzly()]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 2 });
    // An instant (Opt) and an artifact (Arcane Signet); not the sorcery, the enchantment or the creature card.
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect([...p.cards].sort()).toEqual([lib[1]!, lib[2]!].sort());
    const done = settle(act(s, { type: "searchLibrary", player: ap, found: [lib[1]!, lib[2]!] }), ap);
    expect(done.players[ap]!.hand).toEqual(expect.arrayContaining([lib[1]!, lib[2]!]));
    // The rest on the bottom of the library.
    for (const id of [lib[0]!, lib[3]!, lib[4]!]) expect(done.players[ap]!.library.slice(-3)).toContain(id);
  });

  it("takes only one card of each of those types", () => {
    const { s, ap, lib } = begin([bolt()], [opt(), bolt(), divination(), anthem(), grizzly()]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1 });
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [lib[0]!, lib[1]!] })).toThrow();
  });

  it("an artifact creature card can be the artifact card", () => {
    const { s, ap, lib } = begin([solRing()], [ornithopter(), opt(), divination(), anthem(), grizzly()]);
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.cards).toEqual([lib[0]!]);
  });

  it("doesn't trigger with only creature spells cast this turn (an intervening if, CR 603.4)", () => {
    const { s, lib, ap } = begin([grizzly()], [opt(), bolt(), divination(), anthem(), solRing()]);
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.library.slice(0, 5)).toEqual(lib);
  });

  it("a bot takes the cards it may", () => {
    const { s: s0, ap, lib } = begin([bolt(), solRing()], [opt(), arcane(), divination(), anthem(), grizzly()]);
    let s = s0;
    for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s, ap);
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([lib[0]!, lib[1]!]));
  });
});

describe("The Book of Vile Darkness", () => {
  it("makes a 2/2 black Zombie at your end step if you lost 2 or more life this turn", () => {
    const { s: s0, ap } = setup([]);
    play(s0, ap, book());
    loseLife(s0, ap, 1);
    loseLife(s0, ap, 1);
    const s = toStep(s0, "cleanup", ap);
    expect(tokensNamed(s, "Zombie Token").length).toBe(1);
  });

  it("makes nothing after only 1 life lost", () => {
    const { s: s0, ap } = setup([]);
    play(s0, ap, book());
    loseLife(s0, ap, 1);
    const s = toStep(s0, "cleanup", ap);
    expect(tokensNamed(s, "Zombie Token").length).toBe(0);
  });

  /** The Book, Eye of Vecna and Hand of Vecna on the battlefield. */
  const trio = () => {
    const { s, ap } = setup([]);
    const b = play(s, ap, book());
    const e = play(s, ap, eye());
    const h = play(s, ap, hand());
    return { s, ap, b, e, h };
  };

  it("exiles itself, Eye of Vecna and Hand of Vecna to create Vecna with all their triggered abilities", () => {
    const { s: s0, ap, b, e, h } = trio();
    const hand0 = s0.players[ap]!.hand.length;
    const life0 = s0.players[ap]!.life;
    const s = settle(run(s0, planActivate(s0, ap, b, 0, undefined, undefined, undefined, undefined, { sacrifice: [e, h] })), ap);
    for (const id of [b, e, h]) expect(s.objects[id]!.zone).toBe("exile");
    const [v] = tokensNamed(s, "Vecna");
    expect(v).toBeDefined();
    const c = ch(s, v!);
    expect(c.supertypes).toContain("Legendary");
    expect(c.colors).toEqual(["B"]);
    expect(c.subtypes).toEqual(["Zombie", "God"]);
    expect(c.keywords).toContain("Indestructible");
    expect(pt(s, v!)).toBe("8/8");
    // The Book's end step ability, Eye of Vecna's two and Hand of Vecna's one.
    expect(compileCard(defOf(s, s.objects[v!]!)).triggers.length).toBe(4);
    // Eye of Vecna's enters ability triggers as Vecna is created (rulings): you draw a card and lose 2 life.
    expect(s.players[ap]!.hand.length).toBe(hand0 + 1);
    expect(s.players[ap]!.life).toBe(life0 - 2);
  });

  it("Vecna's abilities work: Hand of Vecna's bonus at combat, the Book's Zombie at the end step", () => {
    const { s: s0, ap, b, e, h } = trio();
    let s = settle(run(s0, planActivate(s0, ap, b, 0, undefined, undefined, undefined, undefined, { sacrifice: [e, h] })), ap);
    const [v] = tokensNamed(s, "Vecna");
    const cards = s.players[ap]!.hand.length;
    s = toStep(s, "beginCombat", ap);
    s = settle(s, ap);
    expect(pt(s, v!)).toBe(`${8 + cards}/${8 + cards}`);
    s = toStep(s, "cleanup", ap);
    // Eye of Vecna's 2 life lost this turn.
    expect(tokensNamed(s, "Zombie Token").length).toBe(1);
  });

  it("can't be activated without both of the others", () => {
    const { s, ap } = setup([]);
    const b = play(s, ap, book());
    const e = play(s, ap, eye());
    expect(planActivate(s, ap, b, 0, undefined, undefined, undefined, undefined, { sacrifice: [e] })).toBeNull();
  });

  it("a copy named Eye of Vecna pays the cost; Vecna gets the triggered abilities of the card that was exiled (rulings)", () => {
    const { s, ap } = setup([]);
    const b = play(s, ap, book());
    const h = play(s, ap, hand());
    const ring = play(s, ap, solRing());
    // Sol Ring becomes a copy of Eye of Vecna (no enters ability: it was already on the battlefield).
    addCopyEffect(s, s.objects[ring]!, copyKey(s, eye()));
    expect(ch(s, ring).name).toBe("Eye of Vecna");
    const hand0 = s.players[ap]!.hand.length;
    const done = settle(run(s, planActivate(s, ap, b, 0, undefined, undefined, undefined, undefined, { sacrifice: [ring, h] })), ap);
    const [v] = tokensNamed(done, "Vecna");
    // The Book's and Hand of Vecna's; Sol Ring has none.
    expect(compileCard(defOf(done, done.objects[v!]!)).triggers.length).toBe(2);
    expect(done.players[ap]!.hand.length).toBe(hand0);
  });

  it("the gained abilities are copiable values: a Clone of Vecna has them too, and its Eye ability triggers (rulings)", () => {
    const { s: s0, ap, b, e, h } = trio();
    const cloneId = moveTo(s0, ap, clone(), "library");
    s0.players[ap]!.library.splice(s0.players[ap]!.library.indexOf(cloneId), 1);
    s0.objects[cloneId]!.zone = "hand";
    s0.players[ap]!.hand.push(cloneId);
    let s = settle(run(s0, planActivate(s0, ap, b, 0, undefined, undefined, undefined, undefined, { sacrifice: [e, h] })), ap);
    const life1 = s.players[ap]!.life;
    const [v] = tokensNamed(s, "Vecna");
    s = settle(run(s, planCast(s, ap, cloneId)), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: v! }), ap);
    // The legend rule: keep the Clone (CR 704.5j).
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "legend" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: cloneId }), ap);
    expect(s.objects[cloneId]!.zone).toBe("battlefield");
    expect(ch(s, cloneId).name).toBe("Vecna");
    expect(abilitiesOf(s, s.objects[cloneId]!).triggers.length).toBe(4);
    // Eye of Vecna's enters ability, copied, triggered as the Clone entered: 2 more life lost.
    expect(s.players[ap]!.life).toBe(life1 - 2);
  });
});

describe("Grime Gorger", () => {
  /** Grime Gorger attacks an opponent with a graveyard full of card types. */
  const attack = () => {
    const { s: s0, ap } = setup([]);
    const g = play(s0, ap, gorger());
    const opp = s0.turnOrder.find((p) => p !== ap)!;
    const yard = {
      bolt: moveTo(s0, opp, bolt(), "graveyard"),
      bolt2: moveTo(s0, opp, bolt(), "graveyard"),
      divination: moveTo(s0, opp, divination(), "graveyard"),
      thopter: moveTo(s0, opp, ornithopter(), "graveyard"),
      bears: moveTo(s0, opp, grizzly(), "graveyard"),
      land: moveTo(s0, opp, forest, "graveyard"),
    };
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] });
    s = settle(s, ap);
    return { s, ap, g, opp, yard };
  };

  it("exiles up to one card of each card type from the defending player's graveyard, a counter for each", () => {
    const { s: s0, ap, g, yard } = attack();
    expect(s0.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0 });
    const found = [yard.bolt, yard.divination, yard.thopter, yard.bears, yard.land];
    const s = settle(act(s0, { type: "searchLibrary", player: ap, found }), ap);
    for (const id of found) expect(s.objects[id]!.zone).toBe("exile");
    expect(s.objects[yard.bolt2]!.zone).toBe("graveyard");
    expect(s.objects[g]!.counters?.["+1/+1"]).toBe(5);
    expect(pt(s, g)).toBe("8/8");
  });

  it("not two cards of one card type", () => {
    const { s, ap, yard } = attack();
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [yard.bolt, yard.bolt2] })).toThrow();
  });

  it("an artifact creature card counts as one of its types only", () => {
    const { s, ap, yard } = attack();
    // Ornithopter as the artifact and Grizzly Bears as the creature, fine; Ornithopter can't be both.
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [yard.thopter, yard.bears] })).not.toThrow();
  });

  it("none chosen, no counters", () => {
    const { s: s0, ap, g } = attack();
    const s = settle(act(s0, { type: "searchLibrary", player: ap, found: [] }), ap);
    expect(s.objects[g]!.counters?.["+1/+1"] ?? 0).toBe(0);
  });

  it("a bot exiles cards and gets a counter for each", () => {
    const { s: s0, ap, g, opp } = attack();
    let s = s0;
    for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s, ap);
    const exiled = 6 - s.players[opp]!.graveyard.length;
    expect(exiled).toBeGreaterThan(0);
    expect(s.objects[g]!.counters?.["+1/+1"]).toBe(exiled);
  });
});
