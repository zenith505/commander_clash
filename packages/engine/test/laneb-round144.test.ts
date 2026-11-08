// Lane B round B144: Viashino Bey and Ekundu Cyclops (attack requirements once a creature is declared as an attacker, CR
// 508.1d), Barbed Foliage ("it loses flanking": the keyword and its triggered ability, CR 702.25a), Sideswipe ("change any
// targets", CR 115.7c), Pyramids (a land's one-turn destruction shield that removes its damage, CR 614.1a), Cunning Giant
// (an unblocked attacker assigning its combat damage to a creature defending player controls, CR 510.1a, 508.5), Farrel's
// Mantle and Gaze of Pain (an unblocked attacker dealing damage to a target creature instead of combat damage).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { addEffect } from "./helpers";
import { runStateBasedActions } from "../src/game";
import { applyAction, botActions, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const bey = (): CardDef => ({"oracleId":"d9c9b933-74f4-4898-bbb8-2da76b86ccda","name":"Viashino Bey","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Creature — Lizard","supertypes":[],"types":["Creature"],"subtypes":["Lizard"],"oracleText":"If this creature attacks, all creatures you control attack if able.","power":"4","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/6/26cc07c6-60c7-4abe-8197-7544887ec64d.jpg?1783946233","artUrl":"https://cards.scryfall.io/art_crop/front/2/6/26cc07c6-60c7-4abe-8197-7544887ec64d.jpg?1783946233","commanderLegal":"legal","set":"ulg","releasedAt":"1999-02-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const cyclops = (): CardDef => ({"oracleId":"6c89e4e6-c4d7-416c-b985-41739c6f5b50","name":"Ekundu Cyclops","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Cyclops","supertypes":[],"types":["Creature"],"subtypes":["Cyclops"],"oracleText":"If a creature you control attacks, this creature also attacks if able.","power":"3","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/0/9047d292-8f5c-4a6b-b74e-c8dbf3e0ab24.jpg?1783947080","artUrl":"https://cards.scryfall.io/art_crop/front/9/0/9047d292-8f5c-4a6b-b74e-c8dbf3e0ab24.jpg?1783947080","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const foliage = (): CardDef => ({"oracleId":"f9275c99-0616-44b3-a19e-98c683e87ad3","name":"Barbed Foliage","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a creature attacks you, it loses flanking until end of turn.\nWhenever a creature without flying attacks you, this enchantment deals 1 damage to it.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/2/1220fdd1-e4b0-4175-9b8a-178f6a84b8e6.jpg?1783947069","artUrl":"https://cards.scryfall.io/art_crop/front/1/2/1220fdd1-e4b0-4175-9b8a-178f6a84b8e6.jpg?1783947069","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sideswipe = (): CardDef => ({"oracleId":"07180afc-5c63-42e0-907b-0ed52f777165","name":"Sideswipe","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"You may change any targets of target Arcane spell.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/b/6bd611b7-7bd3-4a76-bd69-34a7235965ae.jpg?1783944296","artUrl":"https://cards.scryfall.io/art_crop/front/6/b/6bd611b7-7bd3-4a76-bd69-34a7235965ae.jpg?1783944296","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const pyramids = (): CardDef => ({"oracleId":"da2f0d16-3cb4-492d-8535-52a31dbae95e","name":"Pyramids","manaCost":"{6}","cmc":6,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}: Choose one —\n• Destroy target Aura attached to a land.\n• The next time target land would be destroyed this turn, remove all damage marked on it instead.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/2/d2e9decf-47b7-44e0-b380-8055b6011021.jpg?1783948377","artUrl":"https://cards.scryfall.io/art_crop/front/d/2/d2e9decf-47b7-44e0-b380-8055b6011021.jpg?1783948377","commanderLegal":"legal","set":"arn","releasedAt":"1993-12-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"4f94ce97-5b2d-42fb-ac8e-c64075fe1af2","name":"Cunning Giant","manaCost":"{5}{R}","cmc":6,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"If this creature is unblocked, you may have it assign its combat damage to a creature defending player controls.","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/a/0aa284a7-3aac-4e88-becb-548a28c77401.jpg?1783946468","artUrl":"https://cards.scryfall.io/art_crop/front/0/a/0aa284a7-3aac-4e88-becb-548a28c77401.jpg?1783946468","commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mantle = (): CardDef => ({"oracleId":"ffae3ff4-67f7-4e41-b166-c63f88c7aa08","name":"Farrel's Mantle","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nWhenever enchanted creature attacks and isn't blocked, its controller may have it deal damage equal to its power plus 2 to another target creature. If that player does, the attacking creature assigns no combat damage this turn.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/a/f/af092da3-8713-4a59-86d3-827b942d6456.jpg?1783947921","artUrl":"https://cards.scryfall.io/art_crop/front/a/f/af092da3-8713-4a59-86d3-827b942d6456.jpg?1783947921","commanderLegal":"legal","set":"fem","releasedAt":"1994-11-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const gaze = (): CardDef => ({"oracleId":"b3a479d4-3e36-496b-abf8-b83231628d76","name":"Gaze of Pain","manaCost":"{1}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Until end of turn, whenever a creature you control attacks and isn't blocked, you may choose to have it deal damage equal to its power to a target creature. If you do, it assigns no combat damage this turn.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48401643-ec4b-444a-8f9a-1a5ea471ff4a.jpg?1783947502","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48401643-ec4b-444a-8f9a-1a5ea471ff4a.jpg?1783947502","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const knight = (name = "Test Knight") => bear({ name, oracleText: "Flanking", keywords: ["Flanking"] });
const flier = bear({ name: "Test Flier", oracleText: "Flying", keywords: ["Flying"] });
const arcaneBolt = card("Test Arcane Bolt", "Instant — Arcane", "{R}", { oracleText: "Test Arcane Bolt deals 2 damage to any target." });
const landCreature = card("Test Land Creature", "Land Creature — Forest Dryad", "", { power: "1", toughness: "3", oracleText: "({T}: Add {G}.)" });
const landAura = card("Test Land Aura", "Enchantment — Aura", "{G}", { oracleText: "Enchant land" });
const razeNoRegen = card("Test Land Raze", "Sorcery", "{R}", { oracleText: "Destroy target land. It can't be regenerated." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; chooseMay answered with `may`, questions of `me` stop it, bots answer the rest. */
const settle = (s: GameState, opts: { me?: PlayerId[]; may?: boolean } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    if (p?.kind === "chooseMay" && opts.may !== undefined) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const declare = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
/** Passes priority until a question comes up or the step changes to `step`. */
const until = (s: GameState, pred: (s: GameState) => boolean, opts: { blocks?: { blocker: string; attacker: string }[] } = {}) => {
  for (let i = 0; i < 300 && !pred(s); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: opts.blocks?.filter((b) => controllerOf(s, s.objects[b.blocker]!) === p.player) ?? [] });
    else if (p) throw new Error(`unexpected ${p.kind}`);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("Lane B round B144", () => {
  it("compiles all eight cards", () => supported(bey(), cyclops(), foliage(), sideswipe(), pyramids(), giant(), mantle(), gaze()));

  it("Viashino Bey: once it attacks, every creature its controller controls that can attack has to", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bey());
    const x = putOnBattlefield(s0, ap, bear({ name: "Test Own Bear" }));
    putOnBattlefield(s0, ap, bear({ name: "Test Sick Bear" }), { sick: true });
    const s = passUntil(s0, "declareAttackers", ap);
    expect(() => applyAction(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] })).toThrow(/has to attack too/);
    // The others can attack without it (it's not a requirement on Bey itself, rulings), and no attack at all is fine.
    expect(() => applyAction(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: x, defender: opp }] })).not.toThrow();
    expect(() => applyAction(s, { type: "declareAttackers", player: ap, attacks: [] })).not.toThrow();
    // Each can attack a different player; the summoning-sick bear can't attack, so it isn't required to.
    const t = applyAction(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }, { attacker: x, defender: next(s, ap, 2) }] });
    expect(t.objects[x]!.attacking).toBe(next(s, ap, 2));
  });

  it("Ekundu Cyclops: it has to attack once another creature its controller controls does", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, cyclops());
    const x = putOnBattlefield(s0, ap, bear({ name: "Test Own Bear" }));
    const y = putOnBattlefield(s0, ap, bear({ name: "Test Other Bear" }));
    const s = passUntil(s0, "declareAttackers", ap);
    expect(() => applyAction(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: x, defender: opp }] })).toThrow(/Ekundu Cyclops has to attack too/);
    // Only the Cyclops is bound: the other bear can stay home; the Cyclops can attack alone; nobody attacking is fine.
    expect(() => applyAction(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: x, defender: opp }, { attacker: c, defender: opp }] })).not.toThrow();
    expect(() => applyAction(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }] })).not.toThrow();
    expect(() => applyAction(s, { type: "declareAttackers", player: ap, attacks: [] })).not.toThrow();
    // A tapped Cyclops can't attack, so it isn't required to.
    const t = structuredClone(s);
    t.objects[c]!.tapped = true;
    invalidateCharacteristics(t);
    expect(() => applyAction(t, { type: "declareAttackers", player: ap, attacks: [{ attacker: y, defender: opp }] })).not.toThrow();
  });

  it("bots bring every creature along with Viashino Bey, and the Cyclops along with any attack", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.command = [];
    const b = putOnBattlefield(s0, ap, bey());
    const x = putOnBattlefield(s0, ap, bear({ name: "Test Own Bear" }));
    const c = putOnBattlefield(s0, ap, cyclops());
    const s = passUntil(s0, "declareAttackers", ap);
    const acts = botActions(s, ap);
    const decl = acts.find((a) => a.type === "declareAttackers");
    expect(decl?.type).toBe("declareAttackers");
    const ids = decl?.type === "declareAttackers" ? decl.attacks.map((a) => a.attacker) : [];
    // Nobody can block, so the bot attacks; whatever it picks is a legal declaration.
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toEqual(expect.arrayContaining([b, x, c]));
    expect(() => run(s, acts)).not.toThrow();
  });

  it("Barbed Foliage: a creature attacking you loses flanking, so its blocker gets no -1/-1; one without flying is dealt 1 damage", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, foliage());
    const k = putOnBattlefield(s0, ap, knight());
    const blocker = putOnBattlefield(s0, opp, bear({ name: "Test Blocker" }));
    let s = declare(s0, ap, [{ attacker: k, defender: opp }]);
    s = settle(s);
    expect(s.objects[k]!.damage).toBe(1);
    s = until(s, (x) => x.step === "declareBlockers" && !x.pending && x.stack.length === 0 && x.triggerQueue.length === 0 && waitingOn(x) === ap, { blocks: [{ blocker, attacker: k }] });
    s = settle(s);
    // No flanking trigger: the blocker is still 2/2.
    expect(`${power(s, s.objects[blocker]!)}/${toughness(s, s.objects[blocker]!)}`).toBe("2/2");
  });

  it("Barbed Foliage: only creatures attacking its controller; a flier takes no damage; flanking granted afterwards works", () => {
    const { s: s0, ap, opp } = setup([]);
    const third = next(s0, ap, 2);
    putOnBattlefield(s0, opp, foliage());
    const k = putOnBattlefield(s0, ap, knight());
    const f = putOnBattlefield(s0, ap, flier);
    const blocker = putOnBattlefield(s0, third, bear({ name: "Test Blocker" }));
    let s = declare(s0, ap, [{ attacker: k, defender: third }, { attacker: f, defender: opp }]);
    s = settle(s);
    expect(s.objects[k]!.damage).toBe(0);
    expect(s.objects[f]!.damage).toBe(0);
    s = until(s, (x) => x.step === "declareBlockers" && !x.pending && x.stack.length === 0 && x.triggerQueue.length === 0 && waitingOn(x) === ap, { blocks: [{ blocker, attacker: k }] });
    s = settle(s);
    // The knight wasn't attacking Barbed Foliage's controller: flanking still works.
    expect(`${power(s, s.objects[blocker]!)}/${toughness(s, s.objects[blocker]!)}`).toBe("1/1");
    // Flanking granted after it lost it works (CR 613.7): the flier gains it now.
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    putOnBattlefield(t0, opp2, foliage());
    const k2 = putOnBattlefield(t0, ap2, knight());
    const b2 = putOnBattlefield(t0, opp2, bear({ name: "Test Blocker" }));
    let t = settle(declare(t0, ap2, [{ attacker: k2, defender: opp2 }]));
    addEffect(t, ap2, [k2], [{ kind: "addAbility", text: "Flanking" }, { kind: "addKeywords", keywords: ["Flanking"] }]);
    t = until(t, (x) => x.step === "declareBlockers" && !x.pending && x.stack.length === 0 && x.triggerQueue.length === 0 && waitingOn(x) === ap2, { blocks: [{ blocker: b2, attacker: k2 }] });
    t = settle(t);
    expect(`${power(t, t.objects[b2]!)}/${toughness(t, t.objects[b2]!)}`).toBe("1/1");
  });

  it("Sideswipe: changes any of an Arcane spell's targets, each to another legal one, never to none (CR 115.7c)", () => {
    const { s: s0, ap, opp, ids } = setup([arcaneBolt, sideswipe()]);
    const [boltId, swipeId] = ids;
    const a = putOnBattlefield(s0, opp, bear({ name: "Test Target A" }));
    const b = putOnBattlefield(s0, opp, bear({ name: "Test Target B" }));
    let s = run(s0, planCast(s0, ap, boltId!, [tgt(a)]));
    const boltItem = s.stack[s.stack.length - 1]!;
    s = run(s, planCast(s, ap, swipeId!, [{ kind: "stack", id: boltItem.id }]));
    s = settle(s, { me: [ap] });
    const p = s.pending;
    expect(p?.kind === "newTargets" && p.changeAny).toBe(true);
    expect(() => applyAction(s, { type: "newTargets", player: ap, targets: [{ kind: "none" }] })).toThrow();
    s = act(s, { type: "newTargets", player: ap, targets: [tgt(b)] });
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[a]!.zone).toBe("battlefield");
  });

  it("Sideswipe targets only Arcane spells", () => {
    const plain = card("Test Plain Bolt", "Instant", "{R}", { oracleText: "Test Plain Bolt deals 2 damage to any target." });
    const { s: s0, ap, opp, ids } = setup([plain, sideswipe()]);
    const a = putOnBattlefield(s0, opp, bear({ name: "Test Target A" }));
    const s = run(s0, planCast(s0, ap, ids[0]!, [tgt(a)]));
    expect(planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }])).toBeNull();
  });

  it("Pyramids: the next destruction of the target land this turn removes its damage instead, even if it can't be regenerated, and doesn't tap it", () => {
    const { s: s0, ap, ids } = setup([razeNoRegen]);
    const py = putOnBattlefield(s0, ap, pyramids());
    const land = putOnBattlefield(s0, ap, landCreature);
    let s = run(s0, planActivate(s0, ap, py, 0, [tgt(land)], [1]));
    s = settle(s);
    expect(s.objects[land]!.removeDamageShields).toBe(1);
    s.objects[land]!.damage = 2;
    s = run(s, planCast(s, ap, ids[0]!, [tgt(land)]));
    s = settle(s);
    expect(s.objects[land]!.zone).toBe("battlefield");
    expect(s.objects[land]!.damage).toBe(0);
    expect(s.objects[land]!.tapped).toBe(false);
    // Used up: lethal damage now destroys it.
    s.objects[land]!.damage = 3;
    invalidateCharacteristics(s);
    runStateBasedActions(s);
    expect(s.objects[land]!.zone).toBe("graveyard");
  });

  it("Pyramids: lethal damage on a land creature is removed once; the shield ends with the turn", () => {
    const { s: s0, ap } = setup([]);
    const py = putOnBattlefield(s0, ap, pyramids());
    const land = putOnBattlefield(s0, ap, landCreature);
    let s = run(s0, planActivate(s0, ap, py, 0, [tgt(land)], [1]));
    s = settle(s);
    s.objects[land]!.damage = 3;
    invalidateCharacteristics(s);
    runStateBasedActions(s);
    expect(s.objects[land]!.zone).toBe("battlefield");
    expect(s.objects[land]!.damage).toBe(0);
    // A second shield this turn, then the turn ends: gone.
    s = run(s, planActivate(s, ap, py, 0, [tgt(land)], [1]));
    s = settle(s);
    s = passUntil(s, "upkeep", next(s, ap));
    expect(s.objects[land]!.removeDamageShields).toBeUndefined();
  });

  it("Pyramids: destroys an Aura attached to a land, not one on a creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const py = putOnBattlefield(s0, ap, pyramids());
    const forestId = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest" && controllerOf(s0, s0.objects[id]!) === ap)!;
    const aura = putOnBattlefield(s0, opp, landAura);
    s0.objects[aura]!.attachedTo = forestId;
    const creatureAura = putOnBattlefield(s0, opp, card("Test Creature Aura", "Enchantment — Aura", "{G}", { oracleText: "Enchant creature" }));
    const victim = putOnBattlefield(s0, ap, bear({ name: "Test Enchanted Bear" }));
    s0.objects[creatureAura]!.attachedTo = victim;
    invalidateCharacteristics(s0);
    expect(planActivate(s0, ap, py, 0, [tgt(creatureAura)], [0])).toBeNull();
    let s = run(s0, planActivate(s0, ap, py, 0, [tgt(aura)], [0]));
    s = settle(s);
    expect(s.objects[aura]!.zone).toBe("graveyard");
  });

  it("Cunning Giant: unblocked, its controller may have it assign its combat damage to a creature defending player controls", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, giant());
    const victim = putOnBattlefield(s0, opp, bear({ name: "Test Victim" }));
    putOnBattlefield(s0, next(s0, ap, 2), bear({ name: "Test Bystander" }));
    const life = s0.players[opp]!.life;
    let s = settle(declare(s0, ap, [{ attacker: g, defender: opp }]));
    s = until(s, (x) => !!x.pending && x.pending.kind === "pickPermanents");
    const p = s.pending;
    // Only creatures the player it's attacking controls.
    expect(p?.kind === "pickPermanents" && p.action === "damageCreature" && p.player === ap && p.options.length === 1 && p.options[0] === victim).toBe(true);
    s = act(s, { type: "pickPermanents", player: ap, ids: [victim] });
    s = settle(s);
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life);
  });

  it("Cunning Giant: declining damages the player; with no creature there, nothing is asked; blocked, nothing is asked", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, giant());
    const victim = putOnBattlefield(s0, opp, bear({ name: "Test Victim" }));
    const life = s0.players[opp]!.life;
    let s = settle(declare(s0, ap, [{ attacker: g, defender: opp }]));
    s = until(s, (x) => !!x.pending && x.pending.kind === "pickPermanents");
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }));
    expect(s.objects[victim]!.zone).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(life - 4);
    // Attacking a player with no creatures.
    const { s: t0, ap: ap2 } = setup([]);
    const g2 = putOnBattlefield(t0, ap2, giant());
    const third = next(t0, ap2, 2);
    putOnBattlefield(t0, next(t0, ap2), bear({ name: "Test Elsewhere" }));
    const life2 = t0.players[third]!.life;
    let t = settle(declare(t0, ap2, [{ attacker: g2, defender: third }]));
    t = until(t, (x) => x.step === "end" || (!!x.pending && x.pending.kind === "pickPermanents"));
    expect(t.pending).toBeFalsy();
    expect(t.players[third]!.life).toBe(life2 - 4);
    // Blocked: it isn't unblocked.
    const { s: u0, ap: ap3, opp: opp3 } = setup([]);
    const g3 = putOnBattlefield(u0, ap3, giant());
    const blocker = putOnBattlefield(u0, opp3, bear({ name: "Test Blocker" }));
    let u = settle(declare(u0, ap3, [{ attacker: g3, defender: opp3 }]));
    u = until(u, (x) => x.step === "end" || (!!x.pending && x.pending.kind === "pickPermanents"), { blocks: [{ blocker, attacker: g3 }] });
    expect(u.pending).toBeFalsy();
    expect(u.objects[blocker]!.zone).toBe("graveyard");
  });

  it("Cunning Giant: a bot kills a creature with it, but finishes a player who'd die to the damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, giant());
    const victim = putOnBattlefield(s0, opp, bear({ name: "Test Victim" }));
    let s = settle(declare(s0, ap, [{ attacker: g, defender: opp }]));
    s = until(s, (x) => !!x.pending && x.pending.kind === "pickPermanents");
    const a = botActions(s, ap)[0]!;
    expect(a.type === "pickPermanents" && a.ids[0] === victim).toBe(true);
    s.players[opp]!.life = 4;
    const b = botActions(s, ap)[0]!;
    expect(b.type === "pickPermanents" && b.ids.length === 0).toBe(true);
  });

  it("Farrel's Mantle: the enchanted creature's controller may have it deal its power plus 2 to another target creature; then it assigns no combat damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const x = putOnBattlefield(s0, ap, bear({ name: "Test Enchanted Bear" }));
    const m = putOnBattlefield(s0, ap, mantle());
    s0.objects[m]!.attachedTo = x;
    const big = putOnBattlefield(s0, opp, card("Test Big", "Creature — Beast", "{3}", { power: "1", toughness: "4" }));
    invalidateCharacteristics(s0);
    const life = s0.players[opp]!.life;
    let s = settle(declare(s0, ap, [{ attacker: x, defender: opp }]));
    s = until(s, (y) => !!y.pending && y.pending.kind !== "declareBlockers");
    const p = s.pending;
    expect(p?.kind).toBe("chooseTargets");
    // Not the enchanted creature itself (rulings).
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [tgt(x)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(big)] });
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind === "chooseMay" && s.pending.player === ap).toBe(true);
    s = settle(s, { may: true });
    expect(s.objects[big]!.zone).toBe("graveyard");
    s = until(s, (y) => y.step === "end");
    expect(s.players[opp]!.life).toBe(life);
  });

  it("Farrel's Mantle on an opponent's creature: that creature's controller decides; declining, it deals combat damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const x = putOnBattlefield(s0, ap, bear({ name: "Test Enchanted Bear" }));
    const m = putOnBattlefield(s0, opp, mantle());
    s0.objects[m]!.attachedTo = x;
    const other = putOnBattlefield(s0, ap, bear({ name: "Test Own Other" }));
    invalidateCharacteristics(s0);
    const life = s0.players[opp]!.life;
    let s = settle(declare(s0, ap, [{ attacker: x, defender: opp }]));
    s = until(s, (y) => !!y.pending && y.pending.kind !== "declareBlockers");
    // The Aura's controller chooses the target.
    expect(s.pending?.kind === "chooseTargets" && s.pending.player === opp).toBe(true);
    s = act(s, { type: "chooseTargets", player: opp, targets: [tgt(other)] });
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind === "chooseMay" && s.pending.player === ap).toBe(true);
    // A bot wouldn't hurt its own creature.
    const bot = botActions(s, ap)[0]!;
    expect(bot.type === "chooseMay" && !bot.yes).toBe(true);
    s = settle(s, { may: false });
    expect(s.objects[other]!.zone).toBe("battlefield");
    s = until(s, (y) => y.step === "end");
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("Gaze of Pain: this turn, each unblocked creature you control may deal damage equal to its power to a target creature instead of combat damage", () => {
    const { s: s0, ap, opp, ids } = setup([gaze()]);
    const x = putOnBattlefield(s0, ap, bear({ name: "Test Attacker" }));
    const y = putOnBattlefield(s0, ap, bear({ name: "Test Second" }));
    const victim = putOnBattlefield(s0, opp, bear({ name: "Test Victim" }));
    const life = s0.players[opp]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(declare(s, ap, [{ attacker: x, defender: opp }, { attacker: y, defender: opp }]));
    s = until(s, (z) => !!z.pending && z.pending.kind !== "declareBlockers");
    // One trigger for each unblocked creature: the first goes for the victim, the second is declined.
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(victim)] });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(x)] });
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind === "chooseMay" && s.pending.player === ap).toBe(true);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind === "chooseMay" && s.pending.player === ap).toBe(true);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s);
    expect(s.objects[victim]!.zone).toBe("graveyard");
    s = until(s, (z) => z.step === "end");
    // Only the creature that declined dealt combat damage.
    expect(s.players[opp]!.life).toBe(life - 2);
  });
});
