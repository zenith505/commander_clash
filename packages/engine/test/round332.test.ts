// Round 332 (Lane A): Kellan, Planar Trailblazer (a granted trigger naming the creature that grants it to itself) and
// Guile (a spell exiled instead of countered, which its counterer may cast for free).

import { describe, expect, it } from "vitest";
import { act, card, mountain, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

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
    if (p && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};

// Real oracle text (Scryfall).
const guile = (): CardDef => ({"oracleId":"591bbf84-259d-4885-8b5f-b29c04222d41","name":"Guile","manaCost":"{3}{U}{U}{U}","cmc":6,"typeLine":"Creature — Elemental Incarnation","supertypes":[],"types":["Creature"],"subtypes":["Elemental","Incarnation"],"oracleText":"This creature can't be blocked except by three or more creatures.\nIf a spell or ability you control would counter a spell, instead exile that spell and you may play that card without paying its mana cost.\nWhen Guile is put into a graveyard from anywhere, shuffle it into its owner's library.","power":"6","toughness":"6","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2eec6ab7-afbe-46ea-a7a6-6b678256f33e.jpg?1783942902","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2eec6ab7-afbe-46ea-a7a6-6b678256f33e.jpg?1783942902","commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kellan = (): CardDef => ({"oracleId":"e8fd428f-7521-4e6a-86b7-835f20ee3c5c","name":"Kellan, Planar Trailblazer","manaCost":"{R}","cmc":1,"typeLine":"Legendary Creature — Human Faerie Scout","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Faerie","Scout"],"oracleText":"{1}{R}: If Kellan is a Scout, it becomes a Human Faerie Detective and gains \"Whenever Kellan deals combat damage to a player, exile the top card of your library. You may play that card this turn.\"\n{2}{R}: If Kellan is a Detective, it becomes a 3/2 Human Faerie Rogue and gains double strike.","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f46a9329-7b91-441d-8653-50c1152c9120.jpg?1783909101","artUrl":"https://cards.scryfall.io/art_crop/front/f/4/f46a9329-7b91-441d-8653-50c1152c9120.jpg?1783909101","commanderLegal":"legal","set":"fdn","releasedAt":"2024-11-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const manaLeak = (): CardDef => ({"oracleId":"c61fe162-2202-4e56-9ba0-393547f9875f","name":"Mana Leak","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell unless its controller pays {3}.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/7/a7c7757d-8036-4b33-a1cb-07795d392588.jpg?1783941824","artUrl":"https://cards.scryfall.io/art_crop/front/a/7/a7c7757d-8036-4b33-a1cb-07795d392588.jpg?1783941824","commanderLegal":"legal","set":"m11","releasedAt":"2010-07-16","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const delay = (): CardDef => ({"oracleId":"983caa3f-7089-4e66-825d-4086a5adb9bb","name":"Delay","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell. If the spell is countered this way, exile it with three time counters on it instead of putting it into its owner's graveyard. If it doesn't have suspend, it gains suspend. (At the beginning of its owner's upkeep, they remove a time counter. When the last is removed, they may play it without paying its mana cost. If it's a creature, it has haste.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/9/3906d538-f1ca-4799-b91c-2e0d2934f241.jpg?1783927858","artUrl":"https://cards.scryfall.io/art_crop/front/3/9/3906d538-f1ca-4799-b91c-2e0d2934f241.jpg?1783927858","commanderLegal":"legal","set":"tsr","releasedAt":"2021-03-19","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const decay = (): CardDef => ({"oracleId":"1c747fe2-289e-492a-a846-aa77707e2dc3","name":"Abrupt Decay","manaCost":"{B}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"This spell can't be countered.\nDestroy target nonland permanent with mana value 3 or less.","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/f/9f5a5d37-fbf7-4c3d-b0f2-f6bc139ef2cd.jpg?1783903510","artUrl":"https://cards.scryfall.io/art_crop/front/9/f/9f5a5d37-fbf7-4c3d-b0f2-f6bc139ef2cd.jpg?1783903510","commanderLegal":"legal","set":"sld","releasedAt":"2026-04-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;const mavinda = (): CardDef => ({"oracleId":"1c248187-0be3-4a03-a817-14f68f638ae7","name":"Mavinda, Students' Advocate","manaCost":"{2}{W}","cmc":3,"typeLine":"Legendary Creature — Bird Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Bird","Advisor"],"oracleText":"Flying\n{0}: You may cast target instant or sorcery card from your graveyard this turn. If that spell doesn't target a creature you control, it costs {8} more to cast this way. If that spell would be put into your graveyard, exile it instead. Activate only once each turn. (You still pay the spell's costs. Timing rules for the spell still apply.)","power":"2","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/8/b/8b3d521f-31cd-4bd2-b6b6-771c79252789.jpg?1783927388","artUrl":"https://cards.scryfall.io/art_crop/front/8/b/8b3d521f-31cd-4bd2-b6b6-771c79252789.jpg?1783927388","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const growth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const leori = (): CardDef => ({"oracleId":"ff94e2d5-8ba1-4f6c-916d-58235a60743e","name":"Leori, Sparktouched Hunter","manaCost":"{U}{R}{W}","cmc":3,"typeLine":"Legendary Creature — Elemental Cat","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elemental","Cat"],"oracleText":"Flying, vigilance\nWhenever Leori deals combat damage to a player, choose a planeswalker type. Until end of turn, whenever you activate an ability of a planeswalker of that type, copy that ability. You may choose new targets for the copies.","power":"3","toughness":"3","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/3/4/342979de-041e-4026-94c5-fc457ecde95d.jpg?1783915490","artUrl":"https://cards.scryfall.io/art_crop/front/3/4/342979de-041e-4026-94c5-fc457ecde95d.jpg?1783915490","commanderLegal":"legal","set":"cmm","releasedAt":"2023-08-04","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const jace = (): CardDef => ({"oracleId":"cc2b6e58-2d6f-495e-95f3-9496105c4cba","name":"Jace Beleren","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.","loyalty":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","commanderLegal":"legal","set":"dd2","releasedAt":"2008-11-07","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const chandra = (): CardDef => ({"oracleId":"12cc800c-c7be-4811-8207-fd01a99cc892","name":"Chandra, Torch of Defiance","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Legendary Planeswalker — Chandra","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Chandra"],"oracleText":"+1: Exile the top card of your library. You may cast that card. If you don't, Chandra deals 2 damage to each opponent.\n+1: Add {R}{R}.\n−3: Chandra deals 4 damage to target creature.\n−7: You get an emblem with \"Whenever you cast a spell, this emblem deals 5 damage to any target.\"","loyalty":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/40cb22c8-cb03-45c9-bb0e-b8cabdcc43cd.jpg?1788329325","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/40cb22c8-cb03-45c9-bb0e-b8cabdcc43cd.jpg?1788329325","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const eye = (): CardDef => ({"oracleId":"01f8db27-1191-488e-b0d5-172821613c15","name":"Eye of the Storm","manaCost":"{5}{U}{U}","cmc":7,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a player casts an instant or sorcery card, exile it. Then that player copies each instant or sorcery card exiled with this enchantment. For each copy, the player may cast the copy without paying its mana cost.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/9/49967eb9-5020-4f0a-8775-5114f6d96d75.jpg?1783943687","artUrl":"https://cards.scryfall.io/art_crop/front/4/9/49967eb9-5020-4f0a-8775-5114f6d96d75.jpg?1783943687","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const boltCard = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "2" });
const rock = card("Test Rock", "Artifact", "{1}");
const name = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;

describe("round 332: Kellan, Planar Trailblazer", () => {
  it("compiles", () => supported(kellan()));

  it("Scout to Detective with the combat damage trigger, then Detective to a 3/2 double strike Rogue", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kellan());
    // The second ability does nothing while it's a Scout (rulings: checked as it resolves).
    let s = settle(run(s0, planActivate(s0, ap, k, 1)));
    expect(characteristics(s, s.objects[k]!).subtypes).toEqual(["Human", "Faerie", "Scout"]);
    expect(power(s, s.objects[k]!)).toBe(2);
    s = settle(run(s, planActivate(s, ap, k, 0)));
    // Its creature types are replaced (rulings): no Scout any more.
    expect(characteristics(s, s.objects[k]!).subtypes).toEqual(["Human", "Faerie", "Detective"]);
    // Now a Detective, the first ability does nothing again.
    s = settle(run(s, planActivate(s, ap, k, 0)));
    expect(characteristics(s, s.objects[k]!).subtypes).toEqual(["Human", "Faerie", "Detective"]);
    // Combat damage to a player: exile the top card, playable this turn.
    const top = onTop(s, ap, ogre);
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }] });
    for (let i = 0; i < 80 && s.step !== "main2"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.objects[top]!.mayPlay?.player).toBe(ap);
    // (Red mana went on the activations: more Mountains for the rest.)
    for (let i = 0; i < 4; i++) putOnBattlefield(s, ap, mountain);
    expect(planCast(s, ap, top)).not.toBeNull();
    // The second ability: a 3/2 Human Faerie Rogue with double strike, keeping the trigger it gained.
    s = settle(run(s, planActivate(s, ap, k, 1)));
    const c = characteristics(s, s.objects[k]!);
    expect(c.subtypes).toEqual(["Human", "Faerie", "Rogue"]);
    expect([power(s, s.objects[k]!), toughness(s, s.objects[k]!)]).toEqual([3, 2]);
    expect(c.keywords).toContain("Double strike");
    expect(c.grantedAbilities?.some((g) => /deals combat damage to a player, exile the top card/.test(g))).toBe(true);
  });
});

describe("round 332: Guile", () => {
  it("compiles", () => supported(guile(), counterspell(), manaLeak(), delay()));

  it("your counterspell exiles the spell instead, and you may cast it without paying its mana cost", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, guile());
    const o = toHand(s0, ap, ogre);
    const cs = toHand(s0, ap, counterspell());
    let s = run(s0, planCast(s0, ap, o));
    s = run(s, planCast(s, ap, cs, [{ kind: "stack", id: s.stack[0]!.id }]));
    const yard = s.players[ap]!.graveyard.length;
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: o });
    expect(s.objects[o]!.zone).toBe("exile");
    s = settle(run(s, planCast(s, ap, o)), ap);
    expect(s.objects[o]!.zone).toBe("battlefield");
    // Counterspell went to the graveyard; the ogre never did.
    expect(s.players[ap]!.graveyard.length).toBe(yard + 1);
    expect(s.log.some((l) => /instead of being countered/.test(l.text))).toBe(true);
  });

  it("an opponent's spell: exiled, and Guile's controller casts it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, guile());
    const r = toHand(s0, opp, rock);
    const cs = toHand(s0, ap, counterspell());
    // The opponent's artifact on the stack as if they had cast it (their spell, with ap holding priority).
    let s = s0;
    s.objects[r]!.zone = "stack";
    s.players[opp]!.hand.splice(s.players[opp]!.hand.indexOf(r), 1);
    s.stack.push({ id: `s${s.nextId++}`, kind: "spell", objectId: r, controller: opp, description: "Test Rock", targets: [] } as GameState["stack"][number]);
    s = run(s, planCast(s, ap, cs, [{ kind: "stack", id: s.stack[0]!.id }]));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: r });
    s = settle(run(s, planCast(s, ap, r)), ap);
    expect(s.objects[r]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[r]!).controller).toBe(ap);
    expect(s.objects[r]!.owner).toBe(opp);
  });

  it("declining leaves it in exile for good, and Delay's suspend doesn't apply to a spell that wasn't countered", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, guile());
    const o = toHand(s0, ap, ogre);
    const d = toHand(s0, ap, delay());
    let s = run(s0, planCast(s0, ap, o));
    s = run(s, planCast(s, ap, d, [{ kind: "stack", id: s.stack[0]!.id }]));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: o });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.objects[o]!.zone).toBe("exile");
    expect(s.objects[o]!.counters.time ?? 0).toBe(0);
    expect(s.objects[o]!.mayPlay).toBeUndefined();
  });

  it("Mana Leak unpaid: exiled instead; paid: nothing happens", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, guile());
    const o = toHand(s0, ap, ogre);
    const ml = toHand(s0, ap, manaLeak());
    let s = run(s0, planCast(s0, ap, o));
    s = run(s, planCast(s, ap, ml, [{ kind: "stack", id: s.stack[0]!.id }]));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("payUnless");
    s = act(s, { type: "payUnless", player: ap, pay: false } as Action);
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: o });
    expect(s.objects[o]!.zone).toBe("exile");
  });

  it("only your own spells and abilities: an opponent's counterspell counters as usual", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, guile());
    const o = toHand(s0, ap, ogre);
    const cs = toHand(s0, ap, counterspell());
    let s = run(s0, planCast(s0, ap, o));
    s = settle(run(s, planCast(s, ap, cs, [{ kind: "stack", id: s.stack[0]!.id }])), ap);
    expect(s.objects[o]!.zone).toBe("graveyard");
    expect(s.pending).toBeNull();
  });

  it("a spell that can't be countered isn't exiled either (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, guile());
    const target = putOnBattlefield(s0, opp, rock);
    const dc = toHand(s0, ap, decay());
    const cs = toHand(s0, ap, counterspell());
    let s = run(s0, planCast(s0, ap, dc, [{ kind: "object", id: target }]));
    s = settle(run(s, planCast(s, ap, cs, [{ kind: "stack", id: s.stack[0]!.id }])), ap);
    expect(s.objects[dc]!.zone).toBe("graveyard");
    expect(s.objects[target]!.zone).toBe("graveyard");
    expect(s.pending).toBeNull();
  });

  it("a bot casts the exiled card", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, guile());
    const o = toHand(s0, ap, ogre);
    const cs = toHand(s0, ap, counterspell());
    let s = run(s0, planCast(s0, ap, o));
    s = settle(run(s, planCast(s, ap, cs, [{ kind: "stack", id: s.stack[0]!.id }])));
    expect(s.objects[o]!.zone).toBe("battlefield");
    expect(name(s, o)).toBe("Test Ogre");
  });
});

/** Puts a fresh copy of `def` into `pid`'s graveyard. */
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const untapped = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped).length;

describe("round 332: Mavinda, Students' Advocate", () => {
  it("compiles", () => supported(mavinda()));

  it("a spell targeting a creature you control costs its mana cost, and is exiled after", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, mavinda());
    const g = inYard(s0, ap, growth());
    let s = settle(run(s0, planActivate(s0, ap, m, 0, [{ kind: "object", id: g }])));
    expect(s.objects[g]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn" });
    const before = untapped(s, ap);
    s = settle(run(s, planCast(s, ap, g, [{ kind: "object", id: m }], undefined, undefined, undefined, { via: "permission" })));
    expect(before - untapped(s, ap)).toBe(1);
    expect(power(s, s.objects[m]!)).toBe(5);
    expect(s.objects[g]!.zone).toBe("exile");
  });

  it("one that doesn't target a creature you control costs {8} more: an opponent's creature, or no target at all", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, mavinda());
    const theirs = putOnBattlefield(s0, opp, ogre);
    const g = inYard(s0, ap, growth());
    let s = settle(run(s0, planActivate(s0, ap, m, 0, [{ kind: "object", id: g }])));
    const before = untapped(s, ap);
    s = settle(run(s, planCast(s, ap, g, [{ kind: "object", id: theirs }], undefined, undefined, undefined, { via: "permission" })));
    expect(before - untapped(s, ap)).toBe(9);
    expect(s.objects[g]!.zone).toBe("exile");
    // Only once each turn.
    const d = inYard(s, ap, divination());
    expect(planActivate(s, ap, m, 0, [{ kind: "object", id: d }])).toBeNull();
  });

  it("a sorcery with no target: {8} more, at sorcery speed; with too little mana it can't be cast", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, mavinda());
    const d = inYard(s0, ap, divination());
    let s = settle(run(s0, planActivate(s0, ap, m, 0, [{ kind: "object", id: d }])));
    const hand = s.players[ap]!.hand.length;
    const before = untapped(s, ap);
    s = settle(run(s, planCast(s, ap, d, undefined, undefined, undefined, undefined, { via: "permission" })));
    expect(before - untapped(s, ap)).toBe(11);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.objects[d]!.zone).toBe("exile");
    // Next turn, with only three lands untapped, eleven mana is out of reach.
    const { s: t0, ap: bp } = setup([]);
    const m2 = putOnBattlefield(t0, bp, mavinda());
    const d2 = inYard(t0, bp, divination());
    let t = settle(run(t0, planActivate(t0, bp, m2, 0, [{ kind: "object", id: d2 }])));
    for (const id of t.battlefield.filter((id) => t.objects[id]!.controller === bp).slice(0, 12)) t.objects[id]!.tapped = true;
    expect(planCast(t, bp, d2, undefined, undefined, undefined, undefined, { via: "permission" })).toBeNull();
  });
});

/** Attacks `opp` with `attacker` and plays on to the second main phase; `me`'s questions answered by `answer`, others' as bots would. */
const attackTo = (s: GameState, me: PlayerId, attacker: string, opp: PlayerId, answer: (s: GameState) => Action) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  s = act(s, { type: "declareAttackers", player: me, attacks: [{ attacker, defender: opp }] });
  for (let i = 0; i < 80 && s.step !== "main2"; i++) s = s.pending ? act(s, s.pending.player === me ? answer(s) : botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 332: Leori, Sparktouched Hunter", () => {
  it("compiles", () => supported(leori()));

  it("combat damage: choose a planeswalker type; that type's abilities are copied this turn, others' aren't", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, leori());
    const j = putOnBattlefield(s0, ap, jace());
    const c = putOnBattlefield(s0, ap, chandra());
    s0.objects[j]!.counters.loyalty = 3;
    s0.objects[c]!.counters.loyalty = 4;
    let asked: string[] = [];
    let s = attackTo(s0, ap, l, opp, (t) => {
      if (t.pending?.kind === "chooseOption" && t.pending.what === "planeswalkerType") {
        asked = t.pending.options;
        return { type: "chooseOption", player: ap, choice: "Jace" };
      }
      return botActions(t, t.pending!.player)[0]!;
    });
    // Every planeswalker type of CR 205.3j, Vronos and Comet too.
    expect(asked).toContain("Jace");
    expect(asked).toContain("Vronos");
    expect(asked).not.toContain("Elf");
    // Jace's +2 ("Each player draws a card"), copied: each player draws two, and Jace gains only 2 loyalty.
    const hands = s.turnOrder.map((p) => s.players[p]!.hand.length);
    s = settle(run(s, planActivate(s, ap, j, 0)));
    expect(s.turnOrder.map((p) => s.players[p]!.hand.length)).toEqual(hands.map((n) => n + 2));
    expect(s.objects[j]!.counters.loyalty).toBe(5);
    // Chandra isn't a Jace: her +1 ("Add {R}{R}") isn't copied.
    const logs = s.log.length;
    s = settle(run(s, planActivate(s, ap, c, 1)));
    expect(s.log.slice(logs).some((e) => /copies/.test(e.text))).toBe(false);
  });

  it("a bot picks the type of a planeswalker it controls, and it ends with the turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, leori());
    const c = putOnBattlefield(s0, ap, chandra());
    s0.objects[c]!.counters.loyalty = 4;
    let s = attackTo(s0, ap, l, opp, (t) => botActions(t, t.pending!.player)[0]!);
    expect(s.floatingTriggers?.some((f) => f.trigger.activates?.of?.subtypes?.includes("Chandra"))).toBe(true);
    // To the next turn: gone.
    for (let i = 0; i < 400 && s.activePlayer === ap; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.floatingTriggers?.some((f) => f.trigger.activates?.of?.subtypes?.includes("Chandra")) ?? false).toBe(false);
  });
});

describe("round 332: Eye of the Storm", () => {
  it("compiles", () => supported(eye()));

  it("the card cast is exiled, not resolved; its caster casts a copy of each card exiled with it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, eye());
    const b = toHand(s0, ap, boltCard());
    // First: Lightning Bolt at an opponent. It's exiled, and a copy of it (the only card there) is offered.
    let s = run(s0, planCast(s0, ap, b, [{ kind: "player", id: opp }]));
    s = settle(s, ap);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", player: ap });
    expect((s.pending as { options: string[] }).options).toContain(b);
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
    const copy = (s.pending as { objectId: string }).objectId;
    expect(s.objects[copy]!.spellCopy).toBe(true);
    s = settle(run(s, planCast(s, ap, copy, [{ kind: "player", id: opp }])), ap);
    expect(s.players[opp]!.life).toBe(37);
    // The copy cast didn't trigger it again (a copy isn't a card, rulings).
    expect(s.stack.length).toBe(0);
    expect(s.pending).toBeNull();
    expect(s.objects[b]!.zone).toBe("exile");
    // Second: Opt. Both exiled cards are offered, one at a time in the order chosen.
    const o = toHand(s, ap, opt());
    s = run(s, planCast(s, ap, o));
    s = settle(s, ap);
    expect(s.objects[o]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", player: ap });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual(["none", b, o].sort());
    // Opt's copy first, then Bolt's: Opt's copy resolves last (cast first, CR 405.2).
    s = act(s, { type: "chooseOption", player: ap, choice: o });
    s = run(s, planCast(s, ap, (s.pending as { objectId: string }).objectId));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual(["none", b].sort());
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    s = settle(run(s, planCast(s, ap, (s.pending as { objectId: string }).objectId, [{ kind: "player", id: opp }])), ap);
    expect(s.players[opp]!.life).toBe(34);
    expect(s.objects[o]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("exile");
  });

  it("another player's Eye: the caster copies and casts, and bots do it too", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, eye());
    const b = toHand(s0, ap, boltCard());
    let s = run(s0, planCast(s0, ap, b, [{ kind: "player", id: opp }]));
    s = settle(s, ap);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
    // Declined: the card stays exiled with it, and nothing was dealt.
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.players[opp]!.life).toBe(40);
    expect(s.objects[b]!.zone).toBe("exile");
    // A bot casting the copy: here a bot plays your seat.
    const g = toHand(s, ap, growth());
    const bear = putOnBattlefield(s, ap, ogre);
    s = settle(run(s, planCast(s, ap, g, [{ kind: "object", id: bear }])));
    expect(s.objects[g]!.zone).toBe("exile");
    expect(s.stack.length).toBe(0);
  });
});
