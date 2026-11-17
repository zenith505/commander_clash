// Round 375 (Lane A): control for as long as a player is the monarch (Garland, Royal Kidnapper), a creature card put
// into an opponent's graveyard bought for life (Lorcan, Warlock Collector) and a granted dies trigger that gives the card
// to the target opponent at the next end step (Endless Whispers).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, planCast, becomeMonarch, closeZoneBatch, botActions, characteristics, controllerOf, defOf, destroyPermanent, invalidateCharacteristics, isFullySupported, power, toughness, waitingOn, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** Everyone passes until the stack is empty; other players' questions are answered as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const moveTo = (zone: "graveyard" | "hand" | "library") => (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const toHand = moveTo("hand");
const zone = (s: GameState, id: ObjectId) => s.objects[id]?.zone;
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const ctl = (s: GameState, id: ObjectId) => controllerOf(s, s.objects[id]!);

const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3", colors: ["R"] });
const bear2 = card("Test Bear", "Creature — Bear", "{1}{G}", { cmc: 2, power: "2", toughness: "2", colors: ["G"] });

// Real oracle text (Scryfall).
const garland = (): CardDef => ({"oracleId":"ab914053-4384-415f-b1e8-09fecb5a30b8","name":"Garland, Royal Kidnapper","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Legendary Creature — Human Knight","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"When Garland enters, target opponent becomes the monarch.\nWhenever an opponent becomes the monarch, gain control of target creature that player controls for as long as they're the monarch.\nCreatures you control but don't own get +2/+2 and can't be sacrificed.","power":"3","toughness":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/8/b81c3f08-9319-4265-a75b-5b12b09aba89.jpg?1783904658","artUrl":"https://cards.scryfall.io/art_crop/front/b/8/b81c3f08-9319-4265-a75b-5b12b09aba89.jpg?1783904658","commanderLegal":"legal","set":"fic","releasedAt":"2025-12-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lorcan = (): CardDef => ({"oracleId":"6c87c261-00a8-46f2-92c8-42009a0a2faf","name":"Lorcan, Warlock Collector","manaCost":"{5}{B}{B}","cmc":7,"typeLine":"Legendary Creature — Devil","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Devil"],"oracleText":"Flying\nWhenever a creature card is put into an opponent's graveyard from anywhere, you may pay life equal to its mana value. If you do, put it onto the battlefield under your control. It's a Warlock in addition to its other types.\nIf a Warlock you control would die, exile it instead.","power":"6","toughness":"6","colors":["B"],"colorIdentity":["B"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/5/f/5f6f90ae-340c-4eb7-b091-58db550be742.jpg?1783926248","artUrl":"https://cards.scryfall.io/art_crop/front/5/f/5f6f90ae-340c-4eb7-b091-58db550be742.jpg?1783926248","commanderLegal":"legal","set":"afc","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const jon = (): CardDef => ({"oracleId":"c5c19d6e-16d5-4d24-be2d-c63646bdf00c","name":"Jon Irenicus, Shattered One","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Legendary Creature — Elf Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Wizard"],"oracleText":"At the beginning of your end step, target opponent gains control of up to one target creature you control. Put two +1/+1 counters on it and tap it. It's goaded for the rest of the game and it gains \"This creature can't be sacrificed.\" (It attacks each combat if able and attacks a player other than you if able.)\nWhenever a creature you own but don't control attacks, you draw a card.","power":"3","toughness":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Goad"],"imageUrl":"https://cards.scryfall.io/normal/front/1/c/1ca5d83a-04d8-4828-a63a-432f8ef39b50.jpg?1783922628","artUrl":"https://cards.scryfall.io/art_crop/front/1/c/1ca5d83a-04d8-4828-a63a-432f8ef39b50.jpg?1783922628","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const whispers = (): CardDef => ({"oracleId":"47630b28-c0bc-4911-8d76-33c6fcabf2d7","name":"Endless Whispers","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Each creature has \"When this creature dies, choose target opponent. That player puts this card from its owner's graveyard onto the battlefield under their control at the beginning of the next end step.\"","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/6/266323da-9528-462e-a0a8-6ef2dda5f1ee.jpg?1783944400","artUrl":"https://cards.scryfall.io/art_crop/front/2/6/266323da-9528-462e-a0a8-6ef2dda5f1ee.jpg?1783944400","commanderLegal":"legal","set":"5dn","releasedAt":"2004-06-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("round 375: compiles", () => {
  it("every card of the round", () => supported(garland(), lorcan(), whispers(), jon()));
});

describe("Garland, Royal Kidnapper", () => {
  const begin = () => {
    const { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, garland());
    const b = putOnBattlefield(s, opp, bear2);
    return { s, ap, opp, g, b, third: s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]! };
  };

  it("its enters trigger makes the target opponent the monarch, and then it takes a creature of theirs, +2/+2", () => {
    const { s: s0, ids } = setup([garland()]);
    let s = s0;
    const me = s.activePlayer;
    const them = s.turnOrder[(s.turnOrder.indexOf(me) + 1) % 4]!;
    const b = putOnBattlefield(s, them, bear2);
    const plan = planCast(s, me, ids[0]!);
    for (const a of plan!) s = act(s, a);
    s = settle(s, me);
    // The enters trigger's target opponent.
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: me });
    s = settle(act(s, { type: "chooseTargets", player: me, targets: [{ kind: "player", id: them }] }), me);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: me, targets: [{ kind: "object", id: b }] }), me);
    expect(s.monarch).toBe(them);
    expect(ctl(s, b)).toBe(me);
    expect(pt(s, b)).toBe("4/4");
  });

  it("the creature comes back once that player isn't the monarch, and doesn't return to you if they become it again", () => {
    let { s, ap, opp, b, third } = begin();
    becomeMonarch(s, opp);
    s = settle(s);
    expect(ctl(s, b)).toBe(ap);
    expect(pt(s, b)).toBe("4/4");
    becomeMonarch(s, third);
    s = settle(s);
    expect(ctl(s, b)).toBe(opp);
    expect(pt(s, b)).toBe("2/2");
    expect(s.effects.some((e) => e.whileMonarch !== undefined)).toBe(false);
    // Becoming the monarch again triggers Garland anew (a new effect); the old one stays over (CR 611.2b).
    const third2 = putOnBattlefield(s, opp, ogre);
    becomeMonarch(s, opp);
    s = settle(s);
    expect(s.effects.filter((e) => e.whileMonarch !== undefined).length).toBe(1);
    expect([ctl(s, b), ctl(s, third2)].filter((c) => c === ap).length).toBe(1);
  });

  it("you becoming the monarch ends it too (the opponent stopped being it)", () => {
    let { s, ap, opp, b } = begin();
    becomeMonarch(s, opp);
    s = settle(s);
    expect(ctl(s, b)).toBe(ap);
    becomeMonarch(s, ap);
    s = settle(s);
    expect(ctl(s, b)).toBe(opp);
  });

  it("if that opponent stops being the monarch before it resolves, you don't gain control at all", () => {
    let { s, ap, opp, b, third } = begin();
    becomeMonarch(s, opp);
    // The trigger goes on the stack targeting their creature; a third player becomes the monarch in response.
    for (let i = 0; i < 20 && !s.stack.length; i++) s = s.pending ? botActions(s, s.pending.player).reduce(act, s) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.length).toBe(1);
    becomeMonarch(s, third);
    s = settle(s);
    expect(ctl(s, b)).toBe(opp);
    expect(ctl(s, b)).not.toBe(ap);
    expect(s.log.some((l) => /does nothing: that player isn't the monarch/.test(l.text))).toBe(true);
  });

  it("an opponent other than the one you took from becoming the monarch triggers again; the first creature goes back", () => {
    let { s, ap, opp, b, third } = begin();
    const c = putOnBattlefield(s, third, ogre);
    becomeMonarch(s, opp);
    s = settle(s);
    expect(ctl(s, b)).toBe(ap);
    becomeMonarch(s, third);
    s = settle(s);
    expect(ctl(s, b)).toBe(opp);
    expect(ctl(s, c)).toBe(ap);
    expect(pt(s, c)).toBe("5/5");
  });

  it("a creature you control but don't own can't be sacrificed while Garland is there", () => {
    let { s, ap, opp, b } = begin();
    becomeMonarch(s, opp);
    s = settle(s);
    expect(ctl(s, b)).toBe(ap);
    expect(characteristics(s, s.objects[b]!).cantBeSacrificed).toBe(true);
  });
});

describe("Lorcan, Warlock Collector", () => {
  const begin = () => {
    const { s, ap, opp } = setup([]);
    const l = putOnBattlefield(s, ap, lorcan());
    return { s, ap, opp, l };
  };

  it("an opponent's creature dies: pay life equal to its mana value to put it onto the battlefield under your control, a Warlock", () => {
    let { s, ap, opp } = begin();
    const o = putOnBattlefield(s, opp, ogre);
    destroyPermanent(s, s.objects[o]!, "test");
    closeZoneBatch(s);
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { life: 3 } });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.players[ap]!.life).toBe(37);
    expect(zone(s, o)).toBe("battlefield");
    expect(ctl(s, o)).toBe(ap);
    expect(characteristics(s, s.objects[o]!).subtypes).toEqual(["Ogre", "Warlock"]);
  });

  it("declining leaves the card in the graveyard and the life alone", () => {
    let { s, ap, opp } = begin();
    const o = putOnBattlefield(s, opp, ogre);
    destroyPermanent(s, s.objects[o]!, "test");
    closeZoneBatch(s);
    s = settle(s, ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.players[ap]!.life).toBe(40);
    expect(zone(s, o)).toBe("graveyard");
  });

  it("a creature card discarded from an opponent's hand triggers it too (from anywhere); your own cards don't", () => {
    let { s, ap, opp } = begin();
    const h = toHand(s, opp, bear2);
    const mine = putOnBattlefield(s, ap, ogre);
    s.players[opp]!.hand.splice(s.players[opp]!.hand.indexOf(h), 1);
    s.objects[h]!.zone = "graveyard";
    s.players[opp]!.graveyard.push(h);
    s.zoneBatch = [...(s.zoneBatch ?? []), { id: h, zc: s.objects[h]!.zoneChanges ?? 0, from: "hand", to: "graveyard", owner: opp, card: s.objects[h]!.cardId }];
    destroyPermanent(s, s.objects[mine]!, "test");
    closeZoneBatch(s);
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { life: 2 } });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.pending).toBeNull();
    expect(ctl(s, h)).toBe(ap);
    expect(zone(s, mine)).toBe("graveyard");
  });

  it("a Warlock it took is exiled instead of dying", () => {
    let { s, ap, opp } = begin();
    const o = putOnBattlefield(s, opp, ogre);
    destroyPermanent(s, s.objects[o]!, "test");
    closeZoneBatch(s);
    s = settle(s, ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    destroyPermanent(s, s.objects[o]!, "test");
    closeZoneBatch(s);
    s = settle(s, ap);
    expect(zone(s, o)).toBe("exile");
  });

  it("a card that left the graveyard before the trigger resolved isn't put onto the battlefield", () => {
    let { s, ap, opp } = begin();
    const o = putOnBattlefield(s, opp, ogre);
    destroyPermanent(s, s.objects[o]!, "test");
    closeZoneBatch(s);
    // Its trigger is waiting; the card is exiled from the graveyard first.
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const yard = s.players[opp]!.graveyard;
    yard.splice(yard.indexOf(o), 1);
    s.objects[o]!.zone = "exile";
    s.objects[o]!.zoneChanges = (s.objects[o]!.zoneChanges ?? 0) + 1;
    s.players[opp]!.exile.push(o);
    s = settle(s, ap);
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(zone(s, o)).toBe("exile");
  });
});

describe("Endless Whispers", () => {
  it("a creature dies: its controller targets an opponent, who puts the card onto the battlefield under their control at the next end step", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, whispers());
    const o = putOnBattlefield(s, ap, ogre);
    destroyPermanent(s, s.objects[o]!, "test");
    closeZoneBatch(s);
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }), ap);
    expect(zone(s, o)).toBe("graveyard");
    s = passUntil(s, "end");
    s = settle(s, ap);
    expect(zone(s, o)).toBe("battlefield");
    expect(ctl(s, o)).toBe(opp);
    expect(s.objects[o]!.putter ?? opp).toBe(opp);
  });

  it("an opponent's creature too, chosen by its controller among their opponents (you can be chosen)", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, whispers());
    const o = putOnBattlefield(s, opp, ogre);
    destroyPermanent(s, s.objects[o]!, "test");
    closeZoneBatch(s);
    s = settle(s, ap);
    // The bot that controlled it picks one of its opponents.
    s = passUntil(s, "end");
    s = settle(s, ap);
    expect(zone(s, o)).toBe("battlefield");
    expect(ctl(s, o)).not.toBe(opp);
  });

  it("a card that left the graveyard before the end step stays where it is; a token doesn't come back", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, whispers());
    const o = putOnBattlefield(s, ap, ogre);
    const t = putOnBattlefield(s, ap, bear2);
    s.objects[t]!.isToken = true;
    destroyPermanent(s, s.objects[o]!, "test");
    destroyPermanent(s, s.objects[t]!, "test");
    closeZoneBatch(s);
    s = settle(s, ap);
    while (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }), ap);
    const yard = s.players[ap]!.graveyard;
    yard.splice(yard.indexOf(o), 1);
    s.objects[o]!.zone = "exile";
    s.objects[o]!.zoneChanges = (s.objects[o]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.exile.push(o);
    s = passUntil(s, "end");
    s = settle(s, ap);
    expect(zone(s, o)).toBe("exile");
    expect(s.battlefield.some((id) => defOf(s, s.objects[id]!).name === "Test Bear" && s.objects[id]!.isToken)).toBe(false);
  });
});

describe("Jon Irenicus, Shattered One", () => {
  const atEnd = () => {
    const { s: s0, ap, opp } = setup([]);
    const j = putOnBattlefield(s0, ap, jon());
    const o = putOnBattlefield(s0, ap, ogre);
    const s = passUntil(s0, "end");
    return { s, ap, opp, j, o };
  };

  it("at your end step the target opponent gains control of up to one target creature you control: two counters, tapped, goaded for good, can't be sacrificed", () => {
    let { s, ap, opp, o } = atEnd();
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }, { kind: "object", id: o }] }), ap);
    expect(ctl(s, o)).toBe(opp);
    expect(s.objects[o]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[o]!.tapped).toBe(true);
    const c = characteristics(s, s.objects[o]!);
    expect(c.goadedBy).toEqual([ap]);
    expect(c.cantBeSacrificed).toBe(true);
    // Goaded for the rest of the game, not only until your next turn.
    expect(s.effects.find((e) => e.affected.includes(o) && e.mods.some((m) => m.kind === "goad"))?.duration).toBe("game");
  });

  it("up to one: no creature is fine", () => {
    let { s, ap, opp, o } = atEnd();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }, { kind: "none" }] }), ap);
    expect(ctl(s, o)).toBe(ap);
    expect(s.objects[o]!.counters["+1/+1"]).toBeUndefined();
  });

  it("a creature you own but don't control attacking draws you a card; yours or theirs don't", () => {
    let { s, ap, opp, o } = atEnd();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }, { kind: "object", id: o }] }), ap);
    const theirs = putOnBattlefield(s, opp, bear2);
    for (let i = 0; i < 400 && !(s.pending?.kind === "declareAttackers" && s.pending.player === opp); i++) {
      if (s.step === "untap" || s.step === "upkeep") s.objects[o]!.tapped = false;
      s = s.pending ? botActions(s, s.pending.player).reduce(act, s) : act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const hand = s.players[ap]!.hand.length;
    expect(s.pending).toMatchObject({ kind: "declareAttackers", player: opp });
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: o, defender: third }, { attacker: theirs, defender: third }] });
    s = settle(s, ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

