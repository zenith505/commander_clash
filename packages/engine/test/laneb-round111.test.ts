// Lane B round B111: Legion's End (the target's name, from that player's hand and graveyard too), Aether Gust ("spell or
// permanent that's red or green"), Crackling Emergence and Harmonious Emergence (an Aura sacrificed instead of the land
// being destroyed), Triumph of Cruelty, Aspect of Wolf (+X/+Y, each half rounded its own way), Possessed Portal (every
// draw skipped), Earwig Squad (prowl, then three cards from an opponent's library), Roiling Horror (a power and toughness
// below 0), Undying Flames (the exiled nonland card's mana value), Royal Decree (one of four kinds becomes tapped),
// Glittering Lion and Glittering Lynx (losing a static ability until end of turn, any player activating it).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passAll, passUntil, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { abilityProblem, botActions, characteristics, dealDamage, invalidateCharacteristics, isFullySupported, objectSource, objHasKeyword, planCast, runStateBasedActions, waitingOn, type Action, type CardDef, type GameState, type ManaType, type PlayerId, type TargetChoice } from "../src";
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (pid: PlayerId): TargetChoice => ({ kind: "player", id: pid });
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** Moves a new card for `def` from the battlefield into `pid`'s `zone` (on top of a library). */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Attack `defender` with `attackers`, nobody blocks, through combat damage to the second main phase. */
function swing(s: GameState, ap: PlayerId, defender: PlayerId, attackers: string[]) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((a) => ({ attacker: a, defender })) });
  for (let i = 0; i < 80 && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}
/** Give `pid` priority now (the players before them pass). */
/** A red creature of the third player's to deal damage from. */
const src = (s: GameState) => objectSource(s, s.objects[putOnBattlefield(s, s.turnOrder[2]!, ogre)]!);
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 4 && s.priority !== pid; i++) s = act(s, { type: "passPriority", player: s.priority! });
  return s;
};

// Real oracle text (Scryfall).
const legionsEnd = (): CardDef => ({"oracleId":"7df8a8aa-1856-4fe6-a543-5de65da4f49f","name":"Legion's End","manaCost":"{1}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile target creature an opponent controls with mana value 2 or less and all other creatures that player controls with the same name as that creature. Then that player reveals their hand and exiles all cards with that name from their hand and graveyard.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/9/49a1cd92-9d75-4e22-a934-a26d84967015.jpg?1783932991","artUrl":"https://cards.scryfall.io/art_crop/front/4/9/49a1cd92-9d75-4e22-a934-a26d84967015.jpg?1783932991","commanderLegal":"legal","set":"m20","releasedAt":"2019-07-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gust = (): CardDef => ({"oracleId":"ecf1e378-d6bc-4ee0-800e-eb8a955d781f","name":"Aether Gust","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose target spell or permanent that's red or green. Its owner puts it on their choice of the top or bottom of their library.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/8/783da808-6698-4e55-9fac-430a6effe2b1.jpg?1783933018","artUrl":"https://cards.scryfall.io/art_crop/front/7/8/783da808-6698-4e55-9fac-430a6effe2b1.jpg?1783933018","commanderLegal":"legal","set":"m20","releasedAt":"2019-07-12","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const crackling = (): CardDef => ({"oracleId":"c984787c-f883-42c9-ae5d-9277c84dba01","name":"Crackling Emergence","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant land you control\nEnchanted land is a 3/3 red Spirit creature with haste. It's still a land.\nIf enchanted land would be destroyed, instead sacrifice this Aura and that land gains indestructible until end of turn.","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/6/f/6f77f987-ebb7-4105-a67c-0987f50fc676.jpg?1783923870","artUrl":"https://cards.scryfall.io/art_crop/front/6/f/6f77f987-ebb7-4105-a67c-0987f50fc676.jpg?1783923870","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const harmonious = (): CardDef => ({"oracleId":"ad8fd4e9-f6ae-4f24-b806-4509c8f4ee47","name":"Harmonious Emergence","manaCost":"{3}{G}","cmc":4,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant land you control\nEnchanted land is a 4/5 green Spirit creature with vigilance and haste. It's still a land.\nIf enchanted land would be destroyed, instead sacrifice this Aura and that land gains indestructible until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/c/9/c92ff968-b436-4313-8375-8a3bb41f9892.jpg?1783923848","artUrl":"https://cards.scryfall.io/art_crop/front/c/9/c92ff968-b436-4313-8375-8a3bb41f9892.jpg?1783923848","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const cruelty = (): CardDef => ({"oracleId":"87e88311-dbd2-42f7-a166-138f1d271686","name":"Triumph of Cruelty","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, target opponent discards a card if you control the creature with the greatest power or tied for the greatest power.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/0/906618e2-2638-4017-9d6e-e6f282967a81.jpg?1783940690","artUrl":"https://cards.scryfall.io/art_crop/front/9/0/906618e2-2638-4017-9d6e-e6f282967a81.jpg?1783940690","commanderLegal":"legal","set":"avr","releasedAt":"2012-05-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const wolf = (): CardDef => ({"oracleId":"77b7277d-90a1-4774-a998-8c35c3f94e4a","name":"Aspect of Wolf","manaCost":"{1}{G}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +X/+Y, where X is half the number of Forests you control, rounded down, and Y is half the number of Forests you control, rounded up.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd9ac9e6-1395-4fbd-80e2-645f0d910c29.jpg?1783948679","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd9ac9e6-1395-4fbd-80e2-645f0d910c29.jpg?1783948679","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const portal = (): CardDef => ({"oracleId":"33345c43-3e77-4d9c-a9b5-5d723e1e5c69","name":"Possessed Portal","manaCost":"{8}","cmc":8,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"If a player would draw a card, that player skips that draw instead.\nAt the beginning of each end step, each player sacrifices a permanent of their choice unless they discard a card.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/616836e6-caf4-4398-a772-9c67f84c73c5.jpg?1783944376","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/616836e6-caf4-4398-a772-9c67f84c73c5.jpg?1783944376","commanderLegal":"legal","set":"5dn","releasedAt":"2004-06-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const earwig = (): CardDef => ({"oracleId":"f8526509-2e14-4ac0-b1de-cf4ee7d4f875","name":"Earwig Squad","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Creature — Goblin Rogue","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Rogue"],"oracleText":"Prowl {2}{B} (You may cast this for its prowl cost if you dealt combat damage to a player this turn with a Goblin or Rogue.)\nWhen this creature enters, if its prowl cost was paid, search target opponent's library for three cards and exile them. Then that player shuffles.","power":"5","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Prowl"],"imageUrl":"https://cards.scryfall.io/normal/front/0/1/0116416b-ed95-4fa2-abc5-446de5c3106b.jpg?1783942794","artUrl":"https://cards.scryfall.io/art_crop/front/0/1/0116416b-ed95-4fa2-abc5-446de5c3106b.jpg?1783942794","commanderLegal":"legal","set":"mor","releasedAt":"2008-02-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const horror = (): CardDef => ({"oracleId":"52be9dd0-72f4-408b-ae3b-17a0362c2681","name":"Roiling Horror","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Creature — Horror","supertypes":[],"types":["Creature"],"subtypes":["Horror"],"oracleText":"Roiling Horror's power and toughness are each equal to your life total minus the life total of an opponent with the most life.\nSuspend X—{X}{B}{B}{B}. X can't be 0. (Rather than cast this card from your hand, you may pay {X}{B}{B}{B} and exile it with X time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost. It has haste.)\nWhenever a time counter is removed from this card while it's exiled, target player loses 1 life and you gain 1 life.","power":"*","toughness":"*","colors":["B"],"colorIdentity":["B"],"keywords":["Suspend"],"imageUrl":"https://cards.scryfall.io/normal/front/f/8/f83006a5-c42b-4083-a246-f46b25412150.jpg?1783943153","artUrl":"https://cards.scryfall.io/art_crop/front/f/8/f83006a5-c42b-4083-a246-f46b25412150.jpg?1783943153","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const flames = (): CardDef => ({"oracleId":"5db128ed-69c0-41f3-b8b4-fb7cefdb236c","name":"Undying Flames","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile cards from the top of your library until you exile a nonland card. Undying Flames deals damage to any target equal to that card's mana value.\nEpic (For the rest of the game, you can't cast spells. At the beginning of each of your upkeeps, copy this spell except for its epic ability. You may choose a new target for the copy.)","colors":["R"],"colorIdentity":["R"],"keywords":["Epic"],"imageUrl":"https://cards.scryfall.io/normal/front/6/0/606206c7-1a8a-46f4-b368-cf18e02f3df8.jpg?1783944142","artUrl":"https://cards.scryfall.io/art_crop/front/6/0/606206c7-1a8a-46f4-b368-cf18e02f3df8.jpg?1783944142","commanderLegal":"legal","set":"sok","releasedAt":"2005-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const decree = (): CardDef => ({"oracleId":"fca14cbd-5ffc-441f-bccb-7ec22b03acbb","name":"Royal Decree","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Cumulative upkeep {W} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhenever a Swamp, Mountain, black permanent, or red permanent becomes tapped, this enchantment deals 1 damage to that permanent's controller.","colors":["W"],"colorIdentity":["W"],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/d/2/d22231f5-30af-4f46-b2c9-0b71124c6939.jpg?1783947199","artUrl":"https://cards.scryfall.io/art_crop/front/d/2/d22231f5-30af-4f46-b2c9-0b71124c6939.jpg?1783947199","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lion = (): CardDef => ({"oracleId":"549e6de7-56e9-4f5c-8c88-30e446bc53bb","name":"Glittering Lion","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Cat","supertypes":[],"types":["Creature"],"subtypes":["Cat"],"oracleText":"Prevent all damage that would be dealt to this creature.\n{3}: Until end of turn, this creature loses \"Prevent all damage that would be dealt to this creature.\" Any player may activate this ability.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab4be296-33a6-46b1-9748-5b0d335f40ee.jpg?1783945797","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab4be296-33a6-46b1-9748-5b0d335f40ee.jpg?1783945797","commanderLegal":"legal","set":"pcy","releasedAt":"2000-06-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const lynx = (): CardDef => ({"oracleId":"890ffe31-642f-46e3-9f09-c744351653b5","name":"Glittering Lynx","manaCost":"{W}","cmc":1,"typeLine":"Creature — Cat","supertypes":[],"types":["Creature"],"subtypes":["Cat"],"oracleText":"Prevent all damage that would be dealt to this creature.\n{2}: Until end of turn, this creature loses \"Prevent all damage that would be dealt to this creature.\" Any player may activate this ability.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/3/a3f26c7e-c525-4191-a542-b81343ae95bb.jpg?1783945798","artUrl":"https://cards.scryfall.io/art_crop/front/a/3/a3f26c7e-c525-4191-a542-b81343ae95bb.jpg?1783945798","commanderLegal":"legal","set":"pcy","releasedAt":"2000-06-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

// Test cards.
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3", colors: ["R"] });
const drake = card("Test Drake", "Creature — Drake", "{1}{U}", { cmc: 2, power: "2", toughness: "2", colors: ["U"] });
const giant = card("Test Giant", "Creature — Giant", "{4}{G}", { cmc: 5, power: "6", toughness: "6", colors: ["G"] });
const growth = card("Test Growth", "Instant", "{G}", { cmc: 1, colors: ["G"], oracleText: "Draw a card." });
const draw = card("Test Draw", "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." });
const kill = card("Test Kill", "Instant", "{0}", { oracleText: "Destroy target creature." });
const shatter = card("Test Shatter", "Instant", "{0}", { oracleText: "Destroy target land." });
const land = card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });
const badlands = card("Test Badlands", "Land — Swamp Mountain", "", { oracleText: "({T}: Add {B} or {R}.)" });
const rogue = bear({ name: "Test Rogue", typeLine: "Creature — Human Rogue", subtypes: ["Human", "Rogue"] });

describe("Lane B round B111", () => {
  it("all thirteen cards are supported", () =>
    supported(legionsEnd(), gust(), crackling(), harmonious(), cruelty(), wolf(), portal(), earwig(), horror(), flames(), decree(), lion(), lynx()));

  it("Legion's End: exiles the target and that player's creatures with its name, then those cards from their hand and graveyard", () => {
    let { s, ap, opp, ids } = setup([legionsEnd()]);
    const other = next(s, ap, 2);
    const a = putOnBattlefield(s, opp, bear());
    const b = putOnBattlefield(s, opp, bear());
    const theirOgre = putOnBattlefield(s, opp, ogre);
    const elsewhere = putOnBattlefield(s, other, bear());
    const inHand = into(s, opp, bear(), "hand");
    const inYard = into(s, opp, bear(), "graveyard");
    const inLibrary = into(s, opp, bear(), "library");
    const otherYard = into(s, other, bear(), "graveyard");
    // Mana value 2 or less: a 3-drop isn't a legal target.
    expect(planCast(s, ap, ids[0]!, [tgt(theirOgre)])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    for (const id of [a, b, inHand, inYard]) expect(zone(s, id)).toBe("exile");
    // Not their library (no search), nor another player's creature or graveyard, nor a creature with another name.
    expect(zone(s, inLibrary)).toBe("library");
    expect(zone(s, elsewhere)).toBe("battlefield");
    expect(zone(s, otherYard)).toBe("graveyard");
    expect(zone(s, theirOgre)).toBe("battlefield");
  });

  it("Aether Gust: a red or green permanent or spell goes to the top or bottom of its owner's library, their choice", () => {
    let { s, ap, opp, ids } = setup([gust(), gust()]);
    const o = putOnBattlefield(s, opp, ogre);
    const blue = putOnBattlefield(s, opp, drake);
    expect(planCast(s, ap, ids[0]!, [tgt(blue)])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(o)])), { me: [opp] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "topOrBottom" });
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "top" }));
    expect(s.players[opp]!.library[0]).toBe(o);
    // A green spell on the stack: it leaves for its owner's library, not countered.
    const g = into(s, ap, growth, "hand");
    s = run(s, planCast(s, ap, g));
    const item = s.stack.at(-1)!;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: item.id }])), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "topOrBottom" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "bottom" }));
    expect(zone(s, g)).toBe("library");
    expect(s.players[ap]!.library.at(-1)).toBe(g);
  });

  for (const [name, make, size] of [["Crackling Emergence", crackling, "3/3"], ["Harmonious Emergence", harmonious, "4/5"]] as const)
    it(`${name}: the Aura is sacrificed instead of the land being destroyed, and the land is indestructible this turn`, () => {
      let { s, ap, opp, ids } = setup([kill, shatter]);
      const l = putOnBattlefield(s, ap, land);
      const aura = putOnBattlefield(s, ap, make());
      s.objects[aura]!.attachedTo = l;
      invalidateCharacteristics(s);
      expect(pt(s, l)).toBe(size);
      expect(characteristics(s, s.objects[l]!).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(l)])));
      expect(zone(s, l)).toBe("battlefield");
      expect(zone(s, aura)).toBe("graveyard");
      expect(objHasKeyword(s, s.objects[l]!, "Indestructible")).toBe(true);
      // Indestructible until end of turn: a land destruction spell does nothing now.
      s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(l)])));
      expect(zone(s, l)).toBe("battlefield");
      s = passUntil(s, "upkeep", opp);
      expect(objHasKeyword(s, s.objects[l]!, "Indestructible")).toBe(false);
    });

  it("Crackling Emergence: lethal damage to the land creature is replaced the same way", () => {
    let { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, land);
    const aura = putOnBattlefield(s, ap, crackling());
    s.objects[aura]!.attachedTo = l;
    invalidateCharacteristics(s);
    dealDamage(s, src(s), { object: s.objects[l]! }, 3);
    runStateBasedActions(s);
    expect(zone(s, l)).toBe("battlefield");
    expect(zone(s, aura)).toBe("graveyard");
  });

  it("Triumph of Cruelty: target opponent discards a card only if you control the creature with the greatest power, ties included", () => {
    for (const [mine, theirs, discards] of [[bear(), bear(), true], [bear(), giant, false]] as const) {
      let { s, ap, opp } = setup([]);
      putOnBattlefield(s, ap, cruelty());
      putOnBattlefield(s, ap, mine);
      putOnBattlefield(s, opp, theirs);
      const opps = [1, 2, 3].map((i) => next(s, ap, i));
      for (const p of opps) {
        s.players[p]!.hand = [];
        into(s, p, bear(), "hand");
      }
      // To your next upkeep: the trigger targets an opponent as it's put on the stack, and checks as it resolves.
      s = passUntil(s, "end", ap);
      s = passUntil(s, "upkeep", ap);
      s = settle(s);
      const discarded = opps.reduce((n, p) => n + s.players[p]!.graveyard.length, 0);
      expect(discarded, `${mine.name} vs ${theirs.name}`).toBe(discards ? 1 : 0);
    }
  });

  it("Aspect of Wolf: +X/+Y with X half your Forests rounded down and Y rounded up, counted continuously", () => {
    let { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const aura = putOnBattlefield(s, ap, wolf());
    s.objects[aura]!.attachedTo = b;
    invalidateCharacteristics(s);
    // setup() gives three Forests: +1/+2.
    expect(pt(s, b)).toBe("3/4");
    putOnBattlefield(s, ap, forest);
    expect(pt(s, b)).toBe("4/4");
    putOnBattlefield(s, ap, forest);
    expect(pt(s, b)).toBe("4/5");
  });

  it("Possessed Portal: every player's draws are skipped, a spell's and the draw step's, and an empty library loses nothing", () => {
    let { s, ap, opp, ids } = setup([draw]);
    putOnBattlefield(s, opp, portal());
    const hand = s.players[ap]!.hand.length;
    s.players[ap]!.library = [];
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    runStateBasedActions(s);
    expect(s.players[ap]!.lost).toBeFalsy();
    expect(s.log.some((l) => /skips that draw \(Possessed Portal\)/.test(l.text))).toBe(true);
    // The next player's draw step: no card.
    const fresh = setup([]);
    let s2 = passUntil(fresh.s, "upkeep", fresh.opp);
    putOnBattlefield(s2, fresh.ap, portal());
    const theirs = s2.players[fresh.opp]!.hand.length;
    s2 = passUntil(s2, "main1", fresh.opp);
    expect(s2.players[fresh.opp]!.hand.length).toBe(theirs);
    expect(s2.log.some((l) => l.text === `${s2.players[fresh.opp]!.name} skips that draw (Possessed Portal).`)).toBe(true);
  });

  it("Earwig Squad: cast for its prowl cost, it exiles three cards from target opponent's library; cast normally, nothing", () => {
    for (const prowl of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([earwig()]);
      const r = putOnBattlefield(s0, ap, rogue);
      let s = prowl ? swing(s0, ap, opp, [r]) : s0;
      const opps = [1, 2, 3].map((i) => next(s, ap, i));
      const lib = opps.reduce((n, p) => n + s.players[p]!.library.length, 0);
      s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, prowl ? { alt: "prowl" } : {})));
      expect(zone(s, ids[0]!)).toBe("battlefield");
      // One opponent, the target: three cards from their library into exile, face up.
      expect(opps.reduce((n, p) => n + s.players[p]!.library.length, 0), String(prowl)).toBe(lib - (prowl ? 3 : 0));
      const hit = opps.filter((p) => s.players[p]!.exile.length);
      expect(hit.length).toBe(prowl ? 1 : 0);
      if (prowl) expect(s.players[hit[0]!]!.exile.length).toBe(3);
    }
  });

  it("Roiling Horror: your life total minus the most life among your opponents, below 0 too, so it can die", () => {
    let { s, ap, opp } = setup([]);
    const h = putOnBattlefield(s, ap, horror());
    s.players[ap]!.life = 45;
    invalidateCharacteristics(s);
    expect(pt(s, h)).toBe("5/5");
    s.players[opp]!.life = 43;
    invalidateCharacteristics(s);
    expect(pt(s, h)).toBe("2/2");
    s.players[ap]!.life = 40;
    invalidateCharacteristics(s);
    expect(pt(s, h)).toBe("-3/-3");
    runStateBasedActions(s);
    expect(zone(s, h)).toBe("graveyard");
  });

  it("Undying Flames: exiles cards from the top until a nonland card, and deals damage equal to its mana value; then epic", () => {
    let { s, ap, opp, ids } = setup([flames()]);
    const o = into(s, ap, ogre, "library");
    const l1 = into(s, ap, land, "library");
    const l2 = into(s, ap, land, "library");
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    for (const id of [o, l1, l2]) expect(zone(s, id)).toBe("exile");
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.players[ap]!.cantCastSpells).toBeTruthy();
  });

  it("Royal Decree: a Swamp, Mountain, black or red permanent becoming tapped deals 1 damage to its controller, once each", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, decree());
    const sw = putOnBattlefield(s, opp, swamp);
    const both = putOnBattlefield(s, opp, badlands);
    const f = putOnBattlefield(s, opp, forest);
    s = priorityTo(s, opp);
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "activateMana", player: opp, objectId: f, mana: "G" }));
    expect(s.players[opp]!.life).toBe(life);
    s = priorityTo(s, opp);
    s = settle(act(s, { type: "activateMana", player: opp, objectId: sw, mana: "B" }));
    expect(s.players[opp]!.life).toBe(life - 1);
    // Badlands is both a Swamp and a Mountain: one trigger (rulings).
    s = priorityTo(s, opp);
    s = settle(act(s, { type: "activateMana", player: opp, objectId: both, mana: "B" }));
    expect(s.players[opp]!.life).toBe(life - 2);
    // A red creature attacking.
    const red = putOnBattlefield(s, ap, ogre);
    const apLife = s.players[ap]!.life;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: red, defender: opp }] });
    s = settle(s);
    expect(s.players[ap]!.life).toBe(apLife - 1);
  });

  for (const [name, make, cost, size] of [["Glittering Lion", lion, 3, 2], ["Glittering Lynx", lynx, 2, 1]] as const)
    it(`${name}: damage to it is prevented until any player pays {${cost}} for it to lose that ability this turn`, () => {
      let { s, ap, opp } = setup([]);
      const cat = putOnBattlefield(s, ap, make());
      dealDamage(s, src(s), { object: s.objects[cat]! }, 5);
      runStateBasedActions(s);
      expect(zone(s, cat)).toBe("battlefield");
      expect(s.objects[cat]!.damage).toBe(0);
      // An opponent pays for it; the ability is theirs (CR 113.8).
      s = priorityTo(s, opp);
      expect(abilityProblem(s, opp, cat, 0)).toMatch(/not enough mana/);
      addMana(s, opp, Array(cost).fill("C") as ManaType[], {});
      s = act(s, { type: "activateAbility", player: opp, objectId: cat, index: 0 });
      expect(s.stack.at(-1)!.controller).toBe(opp);
      s = settle(s);
      dealDamage(s, src(s), { object: s.objects[cat]! }, size);
      runStateBasedActions(s);
      expect(zone(s, cat)).toBe("graveyard");
    });

  it("Glittering Lion: a bot doesn't pay to make its own Lion lose its protection", () => {
    const { s, ap } = setup([]);
    const cat = putOnBattlefield(s, ap, lion());
    addMana(s, ap, ["C", "C", "C"] as ManaType[], {});
    expect(abilityProblem(s, ap, cat, 0)).toBeNull();
    expect(botActions(s, ap).some((a) => a.type === "activateAbility" && a.objectId === cat)).toBe(false);
  });

  it("Glittering Lion: the ability comes back at end of turn", () => {
    let { s, ap, opp } = setup([]);
    const cat = putOnBattlefield(s, ap, lion());
    addMana(s, ap, ["C", "C", "C"] as ManaType[], {});
    s = settle(act(s, { type: "activateAbility", player: ap, objectId: cat, index: 0 }));
    s = passUntil(s, "upkeep", opp);
    dealDamage(s, src(s), { object: s.objects[cat]! }, 5);
    runStateBasedActions(s);
    expect(zone(s, cat)).toBe("battlefield");
  });
});
