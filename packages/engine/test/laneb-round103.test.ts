// Lane B round B103: Karona, False God, Illicit Masquerade, Vadrok, Apex of Thunder, Rose Tyler, Chaos Shrine's Black
// Crystal, Confession Dial, Desdemona, Freedom's Edge, Genestealer Patriarch and Leonardo, Sewer Samurai.

import { describe, expect, it } from "vitest";
import { legalTargets } from "../src/effects/targeting";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, closeZoneBatch, controllerOf, destroyPermanent, graveyardWays, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice, type TargetSpec } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[]; may?: boolean } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay" && opts.may !== undefined) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may });
    else if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
/** Moves a new card for `def` from the battlefield into `pid`'s `zone`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const trimHand = (s: GameState, pid: PlayerId) => {
  const p = s.players[pid]!;
  for (const id of p.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
};
/** Taps everything a player controls, then gives them exactly this mana. */
const poolOnly = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid) s.objects[id]!.tapped = true;
  Object.assign(s.players[pid]!.manaPool, mana);
};
const next = (s: GameState, pid: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % s.turnOrder.length]!;
/** Declares the attack, then everyone passes until the stack is empty (questions of `me` stop it). */
const attackWith = (s: GameState, me: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[]) => {
  s = passUntil(s, "declareAttackers", me);
  s = act(s, { type: "declareAttackers", player: me, attacks });
  return settle(s, { me: [me] });
};
const pendingSpecs = (s: GameState): TargetSpec[] => (s.pending as { specs: TargetSpec[] }).specs;

// Real oracle text (Scryfall).
const karona = (): CardDef => ({"oracleId":"9ea1f10c-5ceb-4ac0-84c6-29046dea649a","name":"Karona, False God","manaCost":"{1}{W}{U}{B}{R}{G}","cmc":6,"typeLine":"Legendary Creature — Avatar","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"Haste\nAt the beginning of each player's upkeep, that player untaps Karona and gains control of it.\nWhenever Karona attacks, creatures of the creature type of your choice get +3/+3 until end of turn.","power":"5","toughness":"5","colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/0/3/03988a88-090d-4daf-bb0a-ca0dabee917f.jpg?1783911481","artUrl":"https://cards.scryfall.io/art_crop/front/0/3/03988a88-090d-4daf-bb0a-ca0dabee917f.jpg?1783911481","commanderLegal":"legal","set":"sld","releasedAt":"2024-05-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const masquerade = (): CardDef => ({"oracleId":"fa2a275a-a28b-45cd-b8ca-a93247ff59bc","name":"Illicit Masquerade","manaCost":"{3}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Flash\nWhen this enchantment enters, put an impostor counter on each creature you control.\nWhenever a creature you control with an impostor counter on it dies, exile it. Return up to one other target creature card from your graveyard to the battlefield.","colors":["B"],"colorIdentity":["B"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a7a3ec4-afaa-45e1-8cde-f15bf4bd7379.jpg?1783912896","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a7a3ec4-afaa-45e1-8cde-f15bf4bd7379.jpg?1783912896","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const vadrok = (): CardDef => ({"oracleId":"775c41fa-2316-43c9-af34-ac9c9b0db7e2","name":"Vadrok, Apex of Thunder","manaCost":"{U}{R}{W}","cmc":3,"typeLine":"Legendary Creature — Elemental Dinosaur Cat","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elemental","Dinosaur","Cat"],"oracleText":"Mutate {1}{W/U}{R}{R} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)\nFlying, first strike\nWhenever this creature mutates, you may cast target noncreature card with mana value 3 or less from your graveyard without paying its mana cost.","power":"3","toughness":"3","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":["Flying","Mutate","First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/e/d/ed7b0256-d342-4523-9516-6a007bf51825.jpg?1783931014","artUrl":"https://cards.scryfall.io/art_crop/front/e/d/ed7b0256-d342-4523-9516-6a007bf51825.jpg?1783931014","commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"mythic","layout":"mutate","gameChanger":false}) as CardDef;
const rose = (): CardDef => ({"oracleId":"2f56de72-80d7-48c6-9b57-84fbd252c699","name":"Rose Tyler","manaCost":"{1}{W}","cmc":2,"typeLine":"Legendary Creature — Human","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human"],"oracleText":"Rose Tyler gets +1/+1 for each time counter on it.\nBad Wolf — Whenever Rose Tyler attacks, put a time counter on it for each suspended card you own and each other permanent you control with a time counter on it.\nDoctor's companion (You can have two commanders if the other is the Doctor.)","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Bad Wolf","Doctor's companion"],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3aa8d034-f98c-4e27-b6af-850eadf59941.jpg?1783914686","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3aa8d034-f98c-4e27-b6af-850eadf59941.jpg?1783914686","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const crystal = (): CardDef => ({"oracleId":"b1ffba56-1c1b-44a5-ad8c-097c417ab276","name":"Chaos Shrine's Black Crystal","manaCost":"{3}{B}","cmc":4,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever a nontoken creature you control dies, exile it.\nAt the beginning of your upkeep, you may put a creature card exiled with Chaos Shrine's Black Crystal onto the battlefield under your control with a finality counter on it.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/1/417d0d15-4c90-45dc-86f8-4c17fc2dd3f4.jpg?1783904656","artUrl":"https://cards.scryfall.io/art_crop/front/4/1/417d0d15-4c90-45dc-86f8-4c17fc2dd3f4.jpg?1783904656","commanderLegal":"legal","set":"fic","releasedAt":"2025-12-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dial = (): CardDef => ({"oracleId":"6316158c-2f66-4dc4-b78c-c6ff7c39bb77","name":"Confession Dial","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, surveil 3.\n{T}: Target legendary creature card in your graveyard gains escape until end of turn. The escape cost is equal to its mana cost plus exile three other cards from your graveyard. (You may cast it from your graveyard for its escape cost this turn.)","colors":[],"colorIdentity":[],"keywords":["Surveil"],"imageUrl":"https://cards.scryfall.io/normal/front/d/f/df2e0de7-e29d-432e-8782-766c0c31c05d.jpg?1783914617","artUrl":"https://cards.scryfall.io/art_crop/front/d/f/df2e0de7-e29d-432e-8782-766c0c31c05d.jpg?1783914617","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const desdemona = (): CardDef => ({"oracleId":"fd06d110-417c-42f5-a7b2-fd032f631dd2","name":"Desdemona, Freedom's Edge","manaCost":"{2}{R}{W}","cmc":4,"typeLine":"Legendary Creature — Human Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"Vigilance\nWhenever Desdemona attacks, target creature card in your graveyard that's an artifact or that has mana value 3 or less gains escape until end of turn. The escape cost is equal to its mana cost plus exile two other cards from your graveyard. (You may cast it from your graveyard for its escape cost this turn.)","power":"3","toughness":"4","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/2/3/23145616-8f99-4269-8875-9bb7e24ace04.jpg?1783912193","artUrl":"https://cards.scryfall.io/art_crop/front/2/3/23145616-8f99-4269-8875-9bb7e24ace04.jpg?1783912193","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const patriarch = (): CardDef => ({"oracleId":"785ef850-4cd7-4e7d-88f2-7b6368c91a9c","name":"Genestealer Patriarch","manaCost":"{4}{U}","cmc":5,"typeLine":"Creature — Tyranid","supertypes":[],"types":["Creature"],"subtypes":["Tyranid"],"oracleText":"Genestealer's Kiss — Whenever this creature attacks, put an infection counter on target creature defending player controls.\nChildren of the Cult — Whenever a creature with an infection counter on it dies, you create a token that's a copy of that creature, except it's a Tyranid in addition to its other types.","power":"4","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Genestealer's Kiss","Children of the Cult"],"imageUrl":"https://cards.scryfall.io/normal/front/a/0/a0df01d1-6131-4ef7-abea-ba084f3b0954.jpg?1783920938","artUrl":"https://cards.scryfall.io/art_crop/front/a/0/a0df01d1-6131-4ef7-abea-ba084f3b0954.jpg?1783920938","commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const leonardo = (): CardDef => ({"oracleId":"74e3243b-6707-4769-8767-7cf2ef71009a","name":"Leonardo, Sewer Samurai","manaCost":"{3}{W}","cmc":4,"typeLine":"Legendary Creature — Mutant Ninja Turtle Samurai","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Mutant","Ninja","Turtle","Samurai"],"oracleText":"Sneak {2}{W}{W}\nDouble strike\nDuring your turn, you may cast creature spells with power or toughness 1 or less from your graveyard. If you cast a spell this way, that creature enters with a finality counter on it. (If a creature with a finality counter on it would die, exile it instead.)","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Double strike","Sneak"],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0e3a0a26-c163-4f31-bed8-1be52a35feea.jpg?1783904123","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0e3a0a26-c163-4f31-bed8-1be52a35feea.jpg?1783904123","commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3", colors: ["R"] });
const giant = card("Test Giant", "Creature — Giant", "{4}{R}", { power: "5", toughness: "5", colors: ["R"] });
const golem = card("Test Golem", "Artifact Creature — Golem", "{5}", { power: "4", toughness: "4" });
const hero = card("Test Hero", "Legendary Creature — Human", "{1}{W}{W}", { power: "3", toughness: "3", colors: ["W"] });
const pebble = card("Test Pebble", "Artifact", "{1}");
const wastes = card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target.", colors: ["R"] });
const blast = card("Test Blast", "Sorcery", "{3}{R}", { oracleText: "Test Blast deals 4 damage to any target.", colors: ["R"] });
const clock = card("Test Clock", "Artifact", "{2}");
const rift = card("Test Rift", "Sorcery", "{2}{R}", { oracleText: "Suspend 3—{R}\nTest Rift deals 1 damage to any target.", keywords: ["Suspend"], colors: ["R"] });
const mouse = card("Test Mouse", "Creature — Mouse", "{1}{W}", { power: "1", toughness: "4", colors: ["W"] });
const wall = card("Test Wall", "Creature — Wall", "{1}{W}", { power: "0", toughness: "1", colors: ["W"] });

describe("Lane B round B103", () => {
  it("all nine cards are supported", () => supported(karona(), masquerade(), vadrok(), rose(), crystal(), dial(), desdemona(), patriarch(), leonardo()));

  it("Karona, False God: at the beginning of each player's upkeep, that player untaps it and gains control of it", () => {
    let { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, karona());
    s.objects[k]!.tapped = true;
    for (const n of [1, 2]) trimHand(s, next(s, ap, n - 1));
    s = passUntil(s, "upkeep", next(s, ap));
    s = settle(s);
    expect(controllerOf(s, s.objects[k]!)).toBe(next(s, ap));
    expect(s.objects[k]!.tapped).toBe(false);
    // The next player's upkeep: theirs now, the newest control effect winning (CR 613.7).
    s.objects[k]!.tapped = true;
    trimHand(s, next(s, ap));
    s = passUntil(s, "upkeep", next(s, ap, 2));
    s = settle(s);
    expect(controllerOf(s, s.objects[k]!)).toBe(next(s, ap, 2));
    expect(s.objects[k]!.tapped).toBe(false);
  });

  it("Illicit Masquerade: as it enters, an impostor counter on each creature you control, not the opponents'", () => {
    let { s, ap, opp, ids } = setup([masquerade()]);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto")));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[mine]!.counters.impostor).toBe(1);
    expect(s.objects[theirs]!.counters.impostor).toBeUndefined();
  });

  it("Illicit Masquerade: a creature with an impostor counter dies: it's exiled and up to one other creature card returns", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, masquerade());
    const b = putOnBattlefield(s, ap, bear());
    s.objects[b]!.counters.impostor = 1;
    const o = into(s, ap, ogre, "graveyard");
    destroyPermanent(s, s.objects[b]!, "Grizzly Bears is destroyed.");
    closeZoneBatch(s);
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // "Other": not the card that died, though it's in the graveyard as the trigger is put on the stack.
    const legal = legalTargets(s, pendingSpecs(s)[0]!, ap).map((t) => t.id);
    expect(legal).toContain(o);
    expect(legal).not.toContain(b);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(o)] }));
    expect(zone(s, b)).toBe("exile");
    expect(zone(s, o)).toBe("battlefield");
  });

  it("Illicit Masquerade: a creature without an impostor counter dying does nothing", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, masquerade());
    const b = putOnBattlefield(s, ap, bear());
    const o = into(s, ap, ogre, "graveyard");
    destroyPermanent(s, s.objects[b]!, "Grizzly Bears is destroyed.");
    closeZoneBatch(s);
    s = settle(s, { me: [ap] });
    expect(s.pending).toBeFalsy();
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, o)).toBe("graveyard");
  });

  it("Vadrok: when it mutates, you may cast target noncreature card with mana value 3 or less from your graveyard free", () => {
    let { s, ap, opp, ids } = setup([vadrok()]);
    const host = putOnBattlefield(s, ap, bear());
    const sh = into(s, ap, shock, "graveyard");
    const bl = into(s, ap, blast, "graveyard");
    const cr = into(s, ap, bear({ name: "Graveyard Bear" }), "graveyard");
    s = run(s, planCast(s, ap, ids[0]!, [tgt(host)], undefined, "auto", undefined, { alt: "mutate" }));
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "mutate" });
    s = act(s, { type: "chooseOption", player: ap, choice: "top" });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const legal = legalTargets(s, pendingSpecs(s)[0]!, ap).map((t) => t.id);
    expect(legal).toContain(sh);
    expect(legal).not.toContain(bl); // mana value 4
    expect(legal).not.toContain(cr); // a creature card
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(sh)] }), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: sh });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "castSpell", player: ap, objectId: sh, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 2);
    // No rider: the spell goes to its owner's graveyard as usual (rulings).
    expect(zone(s, sh)).toBe("graveyard");
    expect(characteristics(s, s.objects[host]!).name).toBe("Vadrok, Apex of Thunder");
  });

  it("Vadrok: a land card can be the target (mana value 0) but can't be cast (CR 305.9): nothing happens", () => {
    let { s, ap, ids } = setup([vadrok()]);
    const host = putOnBattlefield(s, ap, bear());
    const land = into(s, ap, wastes, "graveyard");
    s = run(s, planCast(s, ap, ids[0]!, [tgt(host)], undefined, "auto", undefined, { alt: "mutate" }));
    s = settle(s, { me: [ap] });
    s = act(s, { type: "chooseOption", player: ap, choice: "bottom" });
    expect(legalTargets(s, pendingSpecs(s)[0]!, ap).map((t) => t.id)).toContain(land);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(land)] }), { me: [ap] });
    expect(s.pending).toBeFalsy();
    expect(zone(s, land)).toBe("graveyard");
  });

  it("Vadrok: a bot aims it at a spell it can cast, not a land", () => {
    let { s, ap, opp, ids } = setup([vadrok()]);
    const host = putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    const sh = into(s, ap, shock, "graveyard");
    const land = into(s, ap, wastes, "graveyard");
    s = run(s, planCast(s, ap, ids[0]!, [tgt(host)], undefined, "auto", undefined, { alt: "mutate" }));
    s = settle(s, { me: [ap] });
    s = act(s, { type: "chooseOption", player: ap, choice: "top" });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.stack.at(-1)?.targets).toEqual([expect.objectContaining({ id: sh })]);
    void land;
  });

  it("Rose Tyler: attacking, a time counter for each suspended card you own and each other permanent you control with one", () => {
    let { s, ap, opp } = setup([]);
    const r = putOnBattlefield(s, ap, rose());
    s.objects[r]!.counters.time = 1; // its own doesn't count
    const c1 = putOnBattlefield(s, ap, clock);
    s.objects[c1]!.counters.time = 2;
    putOnBattlefield(s, ap, clock); // no time counter
    const theirs = putOnBattlefield(s, opp, clock);
    s.objects[theirs]!.counters.time = 1; // not yours
    const sus = into(s, ap, rift, "exile");
    s.objects[sus]!.counters.time = 3;
    const notSus = into(s, ap, shock, "exile");
    s.objects[notSus]!.counters.time = 1; // no suspend: not a suspended card (CR 702.62b)
    const theirSus = into(s, opp, rift, "exile");
    s.objects[theirSus]!.counters.time = 1; // not yours
    invalidateCharacteristics(s);
    s = attackWith(s, ap, [{ attacker: r, defender: opp }]);
    expect(s.objects[r]!.counters.time).toBe(3);
    expect(power(s, s.objects[r]!)).toBe(5);
  });

  it("Chaos Shrine's Black Crystal: a nontoken creature you control that dies is exiled; at your upkeep it may return with a finality counter", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, crystal());
    const b = putOnBattlefield(s, ap, bear());
    const tok = putOnBattlefield(s, ap, bear({ name: "Bear Token" }));
    s.objects[tok]!.isToken = true;
    destroyPermanent(s, s.objects[b]!, "Grizzly Bears is destroyed.");
    closeZoneBatch(s);
    s = settle(s);
    expect(zone(s, b)).toBe("exile");
    destroyPermanent(s, s.objects[tok]!, "Bear Token is destroyed.");
    closeZoneBatch(s);
    s = settle(s);
    expect(s.stack.length).toBe(0);
    for (const n of [0, 1, 2, 3]) trimHand(s, next(s, ap, n));
    s = passUntil(s, "main2", ap);
    s = passUntil(s, "upkeep", ap);
    s = settle(s, { may: true });
    expect(zone(s, b)).toBe("battlefield");
    expect(s.objects[b]!.counters.finality).toBe(1);
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
  });

  it("Confession Dial: target legendary creature card gains escape for its mana cost plus exiling three other cards", () => {
    let { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, dial());
    const h = into(s, ap, hero, "graveyard");
    const o = into(s, ap, ogre, "graveyard");
    const fodder = [pebble, pebble, pebble].map((x) => into(s, ap, x, "graveyard"));
    expect(planActivate(s, ap, d, 0, [tgt(o)])).toBeNull(); // not legendary
    s = settle(run(s, planActivate(s, ap, d, 0, [tgt(h)])));
    expect(graveyardWays(s, s.objects[h]!)).toMatchObject([{ kind: "grantedEscape", mana: "{1}{W}{W}", costs: [{ kind: "exileFromGraveyard", n: 3 }] }]);
    expect(graveyardWays(s, s.objects[o]!)).toEqual([]);
    poolOnly(s, ap, { W: 2, C: 1 });
    expect(planCast(s, ap, h, undefined, undefined, undefined, undefined, { via: "grantedEscape", exileCards: fodder.slice(0, 2) })).toBeNull();
    s = run(s, planCast(s, ap, h, undefined, undefined, undefined, undefined, { via: "grantedEscape", exileCards: fodder }));
    expect(fodder.map((id) => zone(s, id))).toEqual(["exile", "exile", "exile"]);
    s = settle(s);
    expect(zone(s, h)).toBe("battlefield");
    expect(s.objects[h]!.escaped).toBe(true);
  });

  it("Confession Dial: the escape lasts only this turn (CR 514.2)", () => {
    let { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, dial());
    const h = into(s, ap, hero, "graveyard");
    s = settle(run(s, planActivate(s, ap, d, 0, [tgt(h)])));
    expect(graveyardWays(s, s.objects[h]!)).toHaveLength(1);
    trimHand(s, ap);
    s = passUntil(s, "upkeep");
    expect(graveyardWays(s, s.objects[h]!)).toEqual([]);
  });

  it("Desdemona: attacking, target creature card that's an artifact or has mana value 3 or less gains escape (two other cards)", () => {
    let { s, ap, opp } = setup([]);
    const des = putOnBattlefield(s, ap, desdemona());
    const small = into(s, ap, ogre, "graveyard");
    const art = into(s, ap, golem, "graveyard");
    const big = into(s, ap, giant, "graveyard");
    const notCreature = into(s, ap, pebble, "graveyard");
    s = attackWith(s, ap, [{ attacker: des, defender: opp }]);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const legal = legalTargets(s, pendingSpecs(s)[0]!, ap).map((t) => t.id);
    expect(legal).toEqual(expect.arrayContaining([small, art]));
    expect(legal).not.toContain(big);
    expect(legal).not.toContain(notCreature);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(art)] }), { me: [ap] });
    expect(graveyardWays(s, s.objects[art]!)).toMatchObject([{ kind: "grantedEscape", mana: "{5}", costs: [{ kind: "exileFromGraveyard", n: 2 }] }]);
    expect(graveyardWays(s, s.objects[small]!)).toEqual([]);
  });

  it("Genestealer Patriarch: a creature with an infection counter dies: you create a token copy that's also a Tyranid", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, patriarch());
    const infected = putOnBattlefield(s, opp, ogre);
    s.objects[infected]!.counters.infection = 1;
    const clean = putOnBattlefield(s, opp, giant);
    destroyPermanent(s, s.objects[infected]!, "Test Ogre is destroyed.");
    destroyPermanent(s, s.objects[clean]!, "Test Giant is destroyed.");
    closeZoneBatch(s);
    s = settle(s);
    const copies = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(copies).toHaveLength(1);
    const c = characteristics(s, s.objects[copies[0]!]!);
    expect(c.name).toBe("Test Ogre");
    expect(c.subtypes).toEqual(expect.arrayContaining(["Ogre", "Tyranid"]));
    expect(controllerOf(s, s.objects[copies[0]!]!)).toBe(ap);
  });

  it("Genestealer Patriarch: attacking, it puts an infection counter on target creature defending player controls", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, patriarch());
    const theirs = putOnBattlefield(s, opp, ogre);
    s = attackWith(s, ap, [{ attacker: g, defender: opp }]);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] }), { me: [ap] });
    expect(s.objects[theirs]!.counters.infection).toBe(1);
  });

  it("Leonardo, Sewer Samurai: during your turn, creature spells with power or toughness 1 or less from your graveyard, entering with a finality counter", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, leonardo());
    const m = into(s, ap, mouse, "graveyard"); // power 1
    const w = into(s, ap, wall, "graveyard"); // toughness 1
    const b = into(s, ap, bear(), "graveyard"); // 2/2
    expect(graveyardWays(s, s.objects[m]!)).toMatchObject([{ kind: "permission" }]);
    expect(graveyardWays(s, s.objects[w]!)).toMatchObject([{ kind: "permission" }]);
    expect(graveyardWays(s, s.objects[b]!)).toEqual([]);
    poolOnly(s, ap, { W: 1, C: 1 });
    s = settle(run(s, planCast(s, ap, m, undefined, undefined, undefined, undefined, { via: "permission" })));
    expect(zone(s, m)).toBe("battlefield");
    expect(s.objects[m]!.counters.finality).toBe(1);
    // Not during another player's turn.
    trimHand(s, ap);
    s = passUntil(s, "main1", opp);
    expect(graveyardWays(s, s.objects[w]!)).toEqual([]);
  });
});
