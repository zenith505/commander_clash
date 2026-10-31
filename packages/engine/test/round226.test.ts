// Round 226: unsupported cards from the top of the popularity list. Kagha, Shadow Archdruid and Banon, the Returners'
// Leader (once each turn, a card put into your graveyard this turn from your library / from anywhere but the
// battlefield), Shuri, Wakandan Inventor ("a second target artifact"), Zimone, Mystery Unraveler ("Otherwise, you may
// turn a permanent you control face up"), Shaun, Father of Synths, Mighty Servant of Leuk-o and Mindlink Mech ("becomes
// crewed for the first time each turn"), Errant, Street Artist ("a spell that wasn't cast"), Tawnos, the Toymaker, Fire
// Lord Ozai, Satya, Aetherflux Genius, Greenhouse // Rickety Gazebo, Rendmaw, Creaking Nest ("a card with two or more
// card types"), Ivy, Gleeful Spellthief ("The copy targets ~"), Arthur, Marigold Knight and The Apprentice's Folly.

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, pt, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, applyAction, compileCard, isLegalTarget, botActions, characteristics, invalidateCharacteristics, isFullySupported, legalActions, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/**
 * Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; other
 * players' questions are answered as the bots would. Stops at any other question of `me`'s.
 */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const emptyHand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.splice(0).forEach((id) => (s.objects[id]!.zone = "exile"));
/**
 * Attack with `attacks`; `blocks` decides the blocks; `me`'s trigger targets are answered with `targets`, "what does it
 * attack" with `whom`; other players answer as bots do. Runs until combat is over or `me` has another question.
 */
const attack = (s: GameState, me: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[], blocks: { blocker: ObjectId; attacker: ObjectId }[] = [], opts: { targets?: TargetChoice[]; whom?: PlayerId; may?: boolean } = {}) => {
  s = act(s, { type: "declareAttackers", player: me, attacks });
  for (let i = 0; i < 160 && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === p.player) });
    else if (p && p.player === me && p.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: me, targets: opts.targets });
    else if (p && p.player === me && p.kind === "chooseOption" && p.what === "attackWhom" && opts.whom !== undefined) s = act(s, { type: "chooseOption", player: me, choice: String(opts.whom) });
    else if (p && p.player === me && p.kind === "chooseMay" && opts.may !== undefined) s = act(s, { type: "chooseMay", player: me, yes: opts.may });
    else if (p && p.player === me) return s;
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const toAttack = (s: GameState, ap: PlayerId) => {
  for (const p of s.players) if (p.id !== ap) emptyHand(s, p.id);
  return passUntil(s, "declareAttackers", ap);
};
const nameNow = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
const tokensOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid);

// Real oracle text (Scryfall).
const kagha = card("Kagha, Shadow Archdruid", "Legendary Creature — Elf Druid", "{2}{B}{G}", {"power":"1","toughness":"4","keywords":["Mill"],"oracleText":"Whenever Kagha attacks, it gains deathtouch until end of turn. Mill two cards. (Put the top two cards of your library into your graveyard.)\nOnce during each of your turns, you may play a land or cast a permanent spell from among cards in your graveyard that were put there from your library this turn."});
const banon = card("Banon, the Returners' Leader", "Legendary Creature — Human Cleric Rebel", "{R}{W}", {"power":"1","toughness":"3","keywords":["Pray"],"oracleText":"Pray — Once during each of your turns, you may cast a creature spell from among cards in your graveyard that were put there from anywhere other than the battlefield this turn.\nWhenever you attack, you may pay {1} and discard a card. If you do, draw a card."});
const shuri = card("Shuri, Wakandan Inventor", "Legendary Creature — Human Artificer Hero", "{1}{U}", {"power":"2","toughness":"1","oracleText":"Artifact spells you cast cost {1} less to cast.\n{1}, {T}: Target artifact you control becomes a copy of a second target artifact you control until end of turn, except it isn't legendary. Activate only as a sorcery."});
const zimone = card("Zimone, Mystery Unraveler", "Legendary Creature — Human Wizard", "{2}{G}{U}", {"power":"3","toughness":"3","keywords":["Manifest","Manifest dread","Landfall"],"oracleText":"Landfall — Whenever a land you control enters, manifest dread if this is the first time this ability has resolved this turn. Otherwise, you may turn a permanent you control face up. (To manifest dread, look at the top two cards of your library. Put one onto the battlefield face down as a 2/2 creature and the other into your graveyard. Turn it face up any time for its mana cost if it's a creature card.)"});
const shaun = card("Shaun, Father of Synths", "Legendary Creature — Human Scientist", "{3}{U}{R}", {"power":"3","toughness":"4","oracleText":"Whenever you attack, you may create a tapped and attacking token that's a copy of target attacking legendary creature you control other than Shaun, except it's not legendary and it's a Synth artifact creature in addition to its other types.\nWhen Shaun leaves the battlefield, exile all Synth tokens you control."});
const servant = card("Mighty Servant of Leuk-o", "Artifact — Vehicle", "{3}", {"power":"6","toughness":"6","keywords":["Crew","Trample","Ward"],"oracleText":"Trample\nWard—Discard a card.\nWhenever this Vehicle becomes crewed for the first time each turn, if it was crewed by exactly two creatures, it gains \"Whenever this creature deals combat damage to a player, draw two cards\" until end of turn.\nCrew 4"});
const errant = card("Errant, Street Artist", "Legendary Creature — Human Rogue", "{U}", {"power":"0","toughness":"3","keywords":["Haste","Flash","Defender"],"oracleText":"Flash\nDefender, haste\n{1}{U}, {T}: Copy target spell you control that wasn't cast. You may choose new targets for the copy."});
const tawnos = card("Tawnos, the Toymaker", "Legendary Creature — Human Artificer", "{3}{G}{U}", {"power":"3","toughness":"5","oracleText":"Whenever you cast a Beast or Bird creature spell, you may copy it, except the copy is an artifact in addition to its other types. (The copy becomes a token.)"});
const ozai = card("Fire Lord Ozai", "Legendary Creature — Human Noble", "{3}{B}", {"power":"4","toughness":"4","oracleText":"Whenever Fire Lord Ozai attacks, you may sacrifice another creature. If you do, add an amount of {R} equal to the sacrificed creature's power. Until end of combat, you don't lose this mana as steps end.\n{6}: Exile the top card of each opponent's library. Until end of turn, you may play one of those cards without paying its mana cost."});
const satya = card("Satya, Aetherflux Genius", "Legendary Creature — Human Artificer", "{1}{U}{R}{W}", {"power":"3","toughness":"5","keywords":["Haste","Menace"],"oracleText":"Menace, haste\nWhenever Satya attacks, create a tapped and attacking token that's a copy of up to one other target nontoken creature you control. You get {E}{E} (two energy counters). At the beginning of the next end step, sacrifice that token unless you pay an amount of {E} equal to its mana value."});
const rendmaw = card("Rendmaw, Creaking Nest", "Legendary Artifact Creature — Scarecrow", "{3}{B}{G}", {"power":"5","toughness":"5","keywords":["Reach","Goad","Menace"],"oracleText":"Reach, menace\nWhen Rendmaw enters and whenever you play a card with two or more card types, each player creates a tapped 2/2 black Bird creature token with flying. The tokens are goaded for the rest of the game. (They attack each combat if able and attack a player other than you if able.)"});
const ivy = card("Ivy, Gleeful Spellthief", "Legendary Creature — Faerie Rogue", "{G}{U}", {"power":"2","toughness":"1","keywords":["Flying"],"oracleText":"Flying\nWhenever a player casts a spell that targets only a single creature other than Ivy, you may copy that spell. The copy targets Ivy. (A copy of an Aura spell becomes a token.)"});
const ROOM = "\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)";
const greenhouse = scry("split", [
  { name: "Greenhouse", mana_cost: "{2}{G}", type_line: "Enchantment — Room", oracle_text: `Lands you control have "{T}: Add one mana of any color."${ROOM}` },
  { name: "Rickety Gazebo", mana_cost: "{3}{G}", type_line: "Enchantment — Room", oracle_text: `When you unlock this door, mill four cards, then return up to two permanent cards from among them to your hand.${ROOM}` },
]);
const arthur = card("Arthur, Marigold Knight", "Legendary Creature — Mouse Knight", "{2}{U}{R}{W}", {"power":"4","toughness":"5","keywords":["Haste"],"oracleText":"Haste\nWhenever Arthur and at least one other creature attack, look at the top six cards of your library. You may put a creature card from among them onto the battlefield tapped and attacking. Put the rest on the bottom of your library in a random order. Return that creature to its owner's hand at end of combat."});
const folly = card("The Apprentice's Folly", "Enchantment — Saga", "{2}{U}{R}", {"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Choose target nontoken creature you control that doesn't have the same name as a token you control. Create a token that's a copy of it, except it isn't legendary, is a Reflection in addition to its other types, and has haste.\nIII — Sacrifice all Reflections you control."});

const isLegalTargetFor = (s: GameState, id: ObjectId, pid: PlayerId) => isLegalTarget(s, compileCard(folly).triggers[0]!.body.targets[0]!, { kind: "object", id }, pid);const mech = card("Mindlink Mech", "Artifact — Vehicle", "{2}{U}", {"power":"4","toughness":"3","keywords":["Flying","Crew"],"oracleText":"Flying\nWhenever this Vehicle becomes crewed for the first time each turn, until end of turn, this Vehicle becomes a copy of target nonlegendary creature that crewed it this turn, except it's 4/3, it's a Vehicle artifact in addition to its other types, and it has flying.\nCrew 1"});

const via = { via: "turnPermission" as const };
const legalLand = (s: GameState, pid: PlayerId, id: string) => legalActions(s, pid).some((a) => a.type === "playLand" && a.objectId === id);
const yardLand = card("Yard Wastes", "Land");
const yardBear = (name = "Yard Bear") => card(name, "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

describe("round 226", () => {
  it("parse", () => supported(kagha, banon, shuri, zimone, shaun, servant, errant, tawnos, ozai, satya, rendmaw, ivy, greenhouse, arthur, folly, mech));

  it("Kagha: one land or permanent spell each turn from among cards milled this turn, not older ones", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, kagha);
    s0.players[ap]!.landsPlayedThisTurn = 0;
    s0.players[ap]!.manaPool.G = 2;
    const old = into(s0, ap, yardBear("Old Bear"), "graveyard");
    const b = into(s0, ap, yardBear(), "library");
    const l = into(s0, ap, yardLand, "library");
    moveObject(s0, b, "graveyard");
    moveObject(s0, l, "graveyard");
    invalidateCharacteristics(s0);
    expect(zone(s0, b)).toBe("graveyard");
    // In the graveyard since an earlier turn: not this permission's.
    expect(planCast(s0, ap, old, undefined, undefined, "auto", undefined, via)).toBeNull();
    expect(legalLand(s0, ap, l)).toBe(true);
    const s = run(s0, planCast(s0, ap, b, undefined, undefined, "auto", undefined, via));
    // One use for a land or a spell.
    expect(legalLand(s, ap, l)).toBe(false);
    const s2 = settle(s);
    expect(zone(s2, b)).toBe("battlefield");
  });

  it("Kagha: the land played this way uses the turn's permission; a card put there from the battlefield doesn't qualify", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, kagha);
    s0.players[ap]!.landsPlayedThisTurn = 0;
    s0.players[ap]!.manaPool.G = 2;
    const l = into(s0, ap, yardLand, "library");
    moveObject(s0, l, "graveyard");
    const dead = putOnBattlefield(s0, ap, yardBear("Dead Bear"));
    moveObject(s0, dead, "graveyard");
    invalidateCharacteristics(s0);
    expect(planCast(s0, ap, dead, undefined, undefined, "auto", undefined, via)).toBeNull();
    const s = act(s0, { type: "playLand", player: ap, objectId: l });
    expect(zone(s, l)).toBe("battlefield");
    const b = into(s, ap, yardBear(), "library");
    moveObject(s, b, "graveyard");
    invalidateCharacteristics(s);
    expect(planCast(s, ap, b, undefined, undefined, "auto", undefined, via)).toBeNull();
  });

  it("Banon: a creature card discarded this turn can be cast once; one that died this turn can't", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, banon);
    s0.players[ap]!.manaPool.G = 4;
    const d1 = into(s0, ap, yardBear(), "hand");
    const d2 = into(s0, ap, yardBear("Second Bear"), "hand");
    moveObject(s0, d1, "graveyard");
    moveObject(s0, d2, "graveyard");
    const dead = putOnBattlefield(s0, ap, yardBear("Dead Bear"));
    moveObject(s0, dead, "graveyard");
    const old = into(s0, ap, yardBear("Old Bear"), "graveyard");
    invalidateCharacteristics(s0);
    expect(planCast(s0, ap, dead, undefined, undefined, "auto", undefined, via)).toBeNull();
    expect(planCast(s0, ap, old, undefined, undefined, "auto", undefined, via)).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, d1, undefined, undefined, "auto", undefined, via)));
    expect(zone(s, d1)).toBe("battlefield");
    expect(planCast(s, ap, d2, undefined, undefined, "auto", undefined, via)).toBeNull();
  });
  it("Shuri: an artifact becomes a nonlegendary copy of a second artifact you control until end of turn", () => {
    const { s: s0, ap } = setup([]);
    const sh = putOnBattlefield(s0, ap, shuri);
    const rock = putOnBattlefield(s0, ap, card("Plain Rock", "Artifact", "{1}"));
    const crown = putOnBattlefield(s0, ap, card("Golden Crown", "Legendary Artifact", "{4}", { oracleText: "{T}: You gain 1 life." }));
    s0.players[ap]!.manaPool.C = 1;
    // The same artifact can't be both targets.
    expect(planActivate(s0, ap, sh, 0, [tgt(rock), tgt(rock)])).toBeNull();
    let s = settle(run(s0, planActivate(s0, ap, sh, 0, [tgt(rock), tgt(crown)])));
    const c = characteristics(s, s.objects[rock]!);
    expect(c.name).toBe("Golden Crown");
    expect(c.supertypes).not.toContain("Legendary");
    // No legend rule: both stay.
    expect(zone(s, crown)).toBe("battlefield");
    s = passUntil(s, "upkeep");
    expect(nameNow(s, rock)).toBe("Plain Rock");
  });

  it("Zimone: the first landfall each turn manifests dread, a later one may turn a permanent face up", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, zimone);
    emptyHand(s0, ap);
    const l1 = into(s0, ap, card("First Wastes", "Land"), "hand");
    const l2 = into(s0, ap, card("Second Wastes", "Land"), "hand");
    const ogre = into(s0, ap, card("Hidden Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" }), "library");
    into(s0, ap, card("Spare Rock", "Artifact", "{1}"), "library");
    s0.players[ap]!.landsPlayedThisTurn = 0;
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: l1 }), { me: ap });
    // Manifest dread: the top two cards, one face down, the other into the graveyard.
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") return;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ogre] }), { me: ap });
    expect(s.objects[ogre]!.faceDown).toBeTruthy();
    expect(zone(s, ogre)).toBe("battlefield");
    s.players[ap]!.landsPlayedThisTurn = 0;
    const lib = s.players[ap]!.library.length;
    s = settle(act(s, { type: "playLand", player: ap, objectId: l2 }), { me: ap, may: true });
    if (s.pending) s = settle(act(s, botActions(s, ap)[0]!), { me: ap });
    // The second time: no new manifest (the library is untouched); the Ogre was turned face up.
    expect(s.players[ap]!.library.length).toBe(lib);
    expect(s.objects[ogre]!.faceDown).toBeFalsy();
    expect(nameNow(s, ogre)).toBe("Hidden Ogre");
  });

  it("Shaun: a tapped and attacking Synth copy of an attacking legendary creature; Synths are exiled when Shaun leaves", () => {
    const { s: s0, ap, opp } = setup([]);
    const sh = putOnBattlefield(s0, ap, shaun);
    const hero = putOnBattlefield(s0, ap, card("Test Hero", "Legendary Creature — Human", "{2}", { power: "2", toughness: "2" }));
    let s = toAttack(s0, ap);
    s = attack(s, ap, [{ attacker: hero, defender: opp }], [], { targets: [tgt(hero)], whom: opp, may: true });
    const tok = tokensOf(s, ap);
    expect(tok).toHaveLength(1);
    const c = characteristics(s, s.objects[tok[0]!]!);
    expect(c.name).toBe("Test Hero");
    expect(c.supertypes).not.toContain("Legendary");
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Synth", "Human"]));
    // The copy dealt its damage too.
    expect(s.players[opp]!.life).toBe(40 - 4);
    moveObject(s, sh, "graveyard");
    s = settle(s);
    expect(tokensOf(s, ap)).toHaveLength(0);
  });

  it("Shaun: Shaun itself and nonlegendary attackers can't be copied", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, shaun);
    const plain = putOnBattlefield(s0, ap, bear());
    let s = toAttack(s0, ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: plain, defender: (ap + 1) % 4 }] });
    // No legal target: the trigger is removed from the stack (CR 603.3d).
    s = settle(s);
    expect(tokensOf(s, ap)).toHaveLength(0);
  });

  it("Mighty Servant of Leuk-o: crewed by exactly two creatures the first time each turn, it draws two on combat damage", () => {
    for (const n of [2, 1]) {
      const { s: s0, ap, opp } = setup([]);
      const v = putOnBattlefield(s0, ap, servant);
      const crew = n === 2 ? [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear({ name: "Other Bear" }))] : [putOnBattlefield(s0, ap, card("Big Ogre", "Creature — Ogre", "{4}", { power: "4", toughness: "4" }))];
      const idx = abilitiesOf(s0, s0.objects[v]!).activated.findIndex((a) => /^Crew/.test(a.text));
      let s = settle(act(s0, { type: "activateAbility", player: ap, objectId: v, index: idx, tapCreatures: crew }), { me: ap });
      expect(characteristics(s, s.objects[v]!).types).toContain("Creature");
      const hand = s.players[ap]!.hand.length;
      s = toAttack(s, ap);
      s = attack(s, ap, [{ attacker: v, defender: opp }]);
      expect(s.players[opp]!.life).toBe(40 - 6);
      expect(s.players[ap]!.hand.length).toBe(hand + (n === 2 ? 2 : 0));
    }
  });

  it("Mighty Servant of Leuk-o: only the first crewing each turn counts", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, servant);
    const ogre = putOnBattlefield(s0, ap, card("Big Ogre", "Creature — Ogre", "{4}", { power: "4", toughness: "4" }));
    const pair = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear({ name: "Other Bear" }))];
    const idx = abilitiesOf(s0, s0.objects[v]!).activated.findIndex((a) => /^Crew/.test(a.text));
    let s = settle(act(s0, { type: "activateAbility", player: ap, objectId: v, index: idx, tapCreatures: [ogre] }), { me: ap });
    s = settle(act(s, { type: "activateAbility", player: ap, objectId: v, index: idx, tapCreatures: pair }), { me: ap });
    expect(characteristics(s, s.objects[v]!).grantedAbilities.join("\n")).not.toContain("draw two cards");
  });
  it("Tawnos copies a Bird spell as an artifact; Errant copies that copy (never cast) but not the spell that was cast", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, tawnos);
    const e = putOnBattlefield(s0, ap, errant);
    const bird = into(s0, ap, card("Test Owl", "Creature — Bird", "{1}{U}", { power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" }), "hand");
    s0.players[ap]!.manaPool.U = 4;
    let s = run(s0, planCast(s0, ap, bird));
    // Tawnos's trigger: copy it.
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    const copy = s.stack.find((it) => s.objects[it.objectId ?? ""]?.spellCopy);
    const orig = s.stack.find((it) => it.objectId === bird);
    expect(copy).toBeTruthy();
    expect(orig).toBeTruthy();
    // The original was cast: not Errant's target.
    expect(planActivate(s, ap, e, 0, [{ kind: "stack", id: orig!.id }])).toBeNull();
    s = run(s, planActivate(s, ap, e, 0, [{ kind: "stack", id: copy!.id }]));
    s = settle(s, { me: ap });
    const owls = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === "Test Owl");
    expect(owls).toHaveLength(3);
    const tokens = owls.filter((id) => s.objects[id]!.isToken);
    expect(tokens).toHaveLength(2);
    // The copy of the artifact copy is an artifact too (its copiable values, CR 707.9b, 707.10).
    for (const id of tokens) expect(characteristics(s, s.objects[id]!).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(characteristics(s, s.objects[bird]!).types).not.toContain("Artifact");
  });

  it("Tawnos doesn't copy other creature spells", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, tawnos);
    const b = into(s0, ap, bear(), "hand");
    s0.players[ap]!.manaPool.G = 2;
    const s = settle(run(s0, planCast(s0, ap, b)), { me: ap });
    expect(s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === "Grizzly Bears")).toHaveLength(1);
  });

  it("Fire Lord Ozai: sacrificing a creature as he attacks adds red mana equal to its power that lasts until end of combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const oz = putOnBattlefield(s0, ap, ozai);
    const ogre = putOnBattlefield(s0, ap, card("Big Ogre", "Creature — Ogre", "{4}", { power: "3", toughness: "3" }));
    let s = toAttack(s0, ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: oz, defender: opp }] });
    for (let i = 0; i < 40 && s.step === "declareAttackers"; i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay" && p.player === ap) s = act(s, { type: "chooseMay", player: ap, yes: true });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else if (!s.stack.length && s.players[ap]!.manaPool.R) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, ogre)).toBe("graveyard");
    expect(s.players[ap]!.manaPool.R).toBe(3);
    // Still there in a later combat step, gone after combat.
    s = passUntil(s, "combatDamage");
    expect(s.players[ap]!.manaPool.R).toBe(3);
    s = passUntil(s, "main2");
    expect(s.players[ap]!.manaPool.R ?? 0).toBe(0);
  });

  it("Fire Lord Ozai: {6} exiles each opponent's top card; one of them may be played for free this turn", () => {
    const { s: s0, ap } = setup([]);
    const oz = putOnBattlefield(s0, ap, ozai);
    const opps = s0.players.filter((p) => p.id !== ap).map((p) => p.id);
    const tops = opps.map((pid, i) => into(s0, pid, card(`Free Ogre ${i}`, "Creature — Ogre", "{5}{R}", { power: "5", toughness: "5" }), "library"));
    s0.players[ap]!.manaPool.C = 6;
    let s = settle(run(s0, planActivate(s0, ap, oz, 0)), { me: ap });
    for (const id of tops) expect(zone(s, id)).toBe("exile");
    // No mana left: cast for free.
    s = settle(run(s, planCast(s, ap, tops[0]!)), { me: ap });
    expect(zone(s, tops[0]!)).toBe("battlefield");
    expect(s.objects[tops[0]!]!.controller).toBe(ap);
    // Only one of those cards.
    expect(planCast(s, ap, tops[1]!)).toBeNull();
  });
  it("Satya: a tapped and attacking token copy and two energy; at the end step pay energy equal to its mana value or sacrifice it", () => {
    for (const mv of [2, 3]) {
      const { s: s0, ap, opp } = setup([]);
      const sa = putOnBattlefield(s0, ap, satya);
      const other = putOnBattlefield(s0, ap, card("Copy Me", "Creature — Ogre", mv === 2 ? "{1}{R}" : "{2}{R}", { power: "2", toughness: "2" }));
      let s = toAttack(s0, ap);
      s = attack(s, ap, [{ attacker: sa, defender: opp }], [], { targets: [tgt(other)], whom: opp });
      const tok = tokensOf(s, ap);
      expect(tok).toHaveLength(1);
      expect(s.players[ap]!.energy).toBe(2);
      // Satya's 3 and the token's 2.
      expect(s.players[opp]!.life).toBe(40 - 5);
      for (let i = 0; i < 200 && !(s.step === "end" && s.pending?.kind === "chooseMay") && s.step !== "cleanup"; i++) {
        const p = s.pending;
        if (p && p.player !== ap) s = act(s, botActions(s, p.player)[0]!);
        else if (p) break;
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: ap });
      else s = settle(s, { me: ap });
      // Two energy pays for mana value 2; not for 3.
      expect(tokensOf(s, ap)).toHaveLength(mv === 2 ? 1 : 0);
      expect(s.players[ap]!.energy ?? 0).toBe(mv === 2 ? 0 : 2);
    }
  });
  it("Rickety Gazebo: unlocking it mills four and returns up to two permanent cards from among them", () => {
    const { s: s0, ap } = setup([]);
    const room = into(s0, ap, greenhouse, "hand");
    const lib = [into(s0, ap, bear(), "library"), into(s0, ap, card("Mill Sorcery", "Sorcery", "{R}"), "library"), into(s0, ap, card("Mill Rock", "Artifact", "{1}"), "library"), into(s0, ap, card("Mill Wall", "Creature — Wall", "{1}", { power: "0", toughness: "4" }), "library")];
    s0.players[ap]!.manaPool.G = 4;
    let s = settle(run(s0, planCast(s0, ap, room, undefined, undefined, "auto", undefined, { face: 1 })), { me: ap });
    expect(s.pending?.kind).toBeTruthy();
    const p = s.pending!;
    // Only permanent cards from among the milled ones: the sorcery isn't offered.
    const offered = "cards" in p ? (p.cards as string[]) : "found" in p ? (p.found as string[]) : [];
    expect(offered).not.toContain(lib[1]);
    s = settle(act(s, botActions(s, ap)[0]!), { me: ap });
    const inHand = lib.filter((id) => zone(s, id) === "hand");
    expect(inHand.length).toBeGreaterThan(0);
    expect(inHand.length).toBeLessThanOrEqual(2);
    expect(zone(s, lib[1]!)).toBe("graveyard");
    expect(lib.filter((id) => zone(s, id) === "graveyard")).toHaveLength(4 - inHand.length);
  });

  it("Rendmaw: each player gets a tapped goaded Bird as it enters and when you play a card with two or more card types", () => {
    const { s: s0, ap } = setup([]);
    const r = into(s0, ap, rendmaw, "hand");
    const ac = into(s0, ap, card("Steel Hound", "Artifact Creature — Dog", "{2}", { power: "2", toughness: "2" }), "hand");
    const plain = into(s0, ap, bear(), "hand");
    const arbor = into(s0, ap, card("Test Arbor", "Land Creature — Forest Dryad", "", { power: "1", toughness: "1" }), "hand");
    s0.players[ap]!.manaPool.B = 1;
    s0.players[ap]!.manaPool.G = 8;
    const birds = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === "Bird Token");
    let s = settle(run(s0, planCast(s0, ap, r)), { me: ap });
    expect(birds(s)).toHaveLength(4);
    for (const b of birds(s)) {
      expect(s.objects[b]!.tapped).toBe(true);
      expect(characteristics(s, s.objects[b]!).goadedBy?.length ?? (characteristics(s, s.objects[b]!) as { goaded?: unknown }).goaded).toBeTruthy();
    }
    s = settle(run(s, planCast(s, ap, plain)), { me: ap });
    expect(birds(s)).toHaveLength(4);
    s = settle(run(s, planCast(s, ap, ac)), { me: ap });
    expect(birds(s)).toHaveLength(8);
    s.players[ap]!.landsPlayedThisTurn = 0;
    s = settle(act(s, { type: "playLand", player: ap, objectId: arbor }), { me: ap });
    expect(birds(s)).toHaveLength(12);
  });

  it("Ivy: a spell that targets only another creature can be copied to target Ivy; one that can't target Ivy makes no copy", () => {
    const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to target creature." });
    const pump = card("Test Growth", "Instant", "{G}", { oracleText: "Target creature you control gets +3/+3 until end of turn." });
    const { s: s0, ap, opp } = setup([]);
    const iv = putOnBattlefield(s0, ap, ivy);
    const b = putOnBattlefield(s0, opp, bear());
    // An opponent's spell at their own creature: Ivy's controller copies it, aimed at Ivy.
    const sh = into(s0, opp, shock, "hand");
    s0.players[opp]!.manaPool.R = 1;
    s0.priority = opp;
    let s = run(s0, planCast(s0, opp, sh, [tgt(b)]));
    s = settle(s, { me: ap, may: true });
    expect(zone(s, iv)).toBe("graveyard");
    expect(zone(s, b)).toBe("graveyard");
    // "Target creature you control" cast by me at My Bear: the copy is mine, so Ivy is a legal target.
    const { s: t0, ap: a2 } = setup([]);
    const iv2 = putOnBattlefield(t0, a2, ivy);
    const mb = putOnBattlefield(t0, a2, bear({ name: "My Bear" }));
    const pu = into(t0, a2, pump, "hand");
    t0.players[a2]!.manaPool.G = 1;
    const t1 = settle(run(t0, planCast(t0, a2, pu, [tgt(mb)])), { me: a2, may: true });
    expect(pt(t1, iv2)).toBe("5/4");
    expect(pt(t1, mb)).toBe("5/5");
  });

  it("Ivy: no trigger for a spell aimed at Ivy itself", () => {
    const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to target creature." });
    const { s: s0, ap } = setup([]);
    const ivyId = putOnBattlefield(s0, ap, ivy);
    const sh = into(s0, ap, shock, "hand");
    s0.players[ap]!.manaPool.R = 1;
    const s = run(s0, planCast(s0, ap, sh, [tgt(ivyId)]));
    expect(s.triggerQueue.length + s.stack.filter((x) => x.kind === "ability").length).toBe(0);
  });
  it("Arthur: with another attacker, a creature from the top six enters tapped and attacking and returns to hand at end of combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const ar = putOnBattlefield(s0, ap, arthur);
    const b = putOnBattlefield(s0, ap, bear());
    const ogre = into(s0, ap, card("Dug Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" }), "library");
    let s = toAttack(s0, ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ar, defender: opp }, { attacker: b, defender: opp }] });
    let sawAttacking = false;
    for (let i = 0; i < 200 && s.step !== "main2"; i++) {
      const p = s.pending;
      if (s.objects[ogre]!.zone === "battlefield" && s.objects[ogre]!.attacking) sawAttacking = true;
      if (p?.player === ap && p.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [ogre] });
      else if (p?.player === ap && p.kind === "chooseOption" && p.what === "attackWhom") s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
      else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(sawAttacking).toBe(true);
    expect(s.players[opp]!.life).toBe(40 - 4 - 2 - 3);
    expect(zone(s, ogre)).toBe("hand");
  });

  it("Arthur: attacking alone doesn't trigger", () => {
    const { s: s0, ap, opp } = setup([]);
    const ar = putOnBattlefield(s0, ap, arthur);
    let s = toAttack(s0, ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ar, defender: opp }] });
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
  });

  it("The Apprentice's Folly: a hasty nonlegendary Reflection copy; not of a creature that shares a token's name", () => {
    const { s: s0, ap } = setup([]);
    const hero = putOnBattlefield(s0, ap, card("Test Hero", "Legendary Creature — Human", "{2}", { power: "2", toughness: "2" }));
    const sg = into(s0, ap, folly, "hand");
    s0.players[ap]!.manaPool.U = 2;
    s0.players[ap]!.manaPool.R = 2;
    let s = settle(run(s0, planCast(s0, ap, sg)), { me: ap, targets: [tgt(hero)] });
    const tok = tokensOf(s, ap);
    expect(tok).toHaveLength(1);
    const c = characteristics(s, s.objects[tok[0]!]!);
    expect(c.name).toBe("Test Hero");
    expect(c.supertypes).not.toContain("Legendary");
    expect(c.subtypes).toContain("Reflection");
    expect(c.keywords).toContain("Haste");
    // For chapter II: Test Hero now shares a token's name, so it can't be chosen; another creature can.
    expect(isLegalTargetFor(s, hero, ap)).toBe(false);
    const other = putOnBattlefield(s, ap, bear());
    expect(isLegalTargetFor(s, other, ap)).toBe(true);
  });
  it("Mindlink Mech: the first crewing each turn makes it a 4/3 flying copy of a creature that crewed it", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, mech);
    const elf = putOnBattlefield(s0, ap, card("Test Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." }));
    const idx = abilitiesOf(s0, s0.objects[m]!).activated.findIndex((a) => /^Crew/.test(a.text));
    const s = settle(act(s0, { type: "activateAbility", player: ap, objectId: m, index: idx, tapCreatures: [elf] }), { me: ap, targets: [tgt(elf)] });
    const c = characteristics(s, s.objects[m]!);
    expect(c.name).toBe("Test Elf");
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Elf", "Vehicle"]));
    expect(c.keywords).toContain("Flying");
    expect(pt(s, m)).toBe("4/3");
  });

  it("Mindlink Mech: a copy of a permanent that isn't normally a creature has no 4/3, so it's 0/0 (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, mech);
    const rock = putOnBattlefield(s0, ap, card("Animated Rock", "Artifact", "{2}"));
    addEffect(s0, ap, [rock], [{ kind: "addTypes", types: ["Creature"], subtypes: [] }, { kind: "setPT", power: 2, toughness: 2 }]);
    const idx = abilitiesOf(s0, s0.objects[m]!).activated.findIndex((a) => /^Crew/.test(a.text));
    const s = settle(act(s0, { type: "activateAbility", player: ap, objectId: m, index: idx, tapCreatures: [rock] }), { me: ap, targets: [tgt(rock)] });
    expect(zone(s, m)).toBe("graveyard");
  });
});
