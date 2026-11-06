// Lane B round B115: Volcanic Eruption (damage equal to the Mountains put into a graveyard this way), Builder's Bane (each
// player's own artifacts put into a graveyard this way), Elephant Resurgence (each player's Elephant counting its controller's
// graveyard), Imperial Mask (no teammates in this game), Hipparion (a cost to block a creature with power 3 or greater),
// Stench of Evil (a punisher for each Plains destroyed), Superior Foes of Spider-Man (a "may" exile you may play until
// another is exiled), Goblin Researcher and Boros Strike-Captain (a card you may play during a turn you attacked with it, or
// with three or more creatures), Hiveheart Shaman (a basic land card that doesn't share a land type with your lands).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { blockCost, blockRequirementProblem, botActions, characteristics, invalidateCharacteristics, isFullySupported, mayPlayFromExile, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
/** Takes `pid`'s lands off the battlefield and leaves exactly `pool` to pay with. */
const poolOnly = (s: GameState, pid: PlayerId, pool: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...pool };
  invalidateCharacteristics(s);
};

// Real oracle text (Scryfall).
const eruption = (): CardDef => ({"oracleId":"4c15889e-3172-413b-b805-a2b7ad05f636","name":"Volcanic Eruption","manaCost":"{X}{U}{U}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy X target Mountains. Volcanic Eruption deals damage to each creature and each player equal to the number of Mountains put into a graveyard this way.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const bane = (): CardDef => ({"oracleId":"814adb99-6100-4c36-96d9-763bc20dca5d","name":"Builder's Bane","manaCost":"{X}{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy X target artifacts. Builder's Bane deals damage to each player equal to the number of artifacts they controlled that were put into a graveyard this way.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const resurgence = (): CardDef => ({"oracleId":"e2d54c59-7722-4520-adca-cd02a0871ab2","name":"Elephant Resurgence","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player creates a green Elephant creature token. Those creatures have \"This token's power and toughness are each equal to the number of creature cards in its controller's graveyard.\"","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const mask = (): CardDef => ({"oracleId":"e4c92768-00a1-450f-8fca-81b28b353bb6","name":"Imperial Mask","manaCost":"{4}{W}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, if it's not a token, each of your teammates creates a token that's a copy of this enchantment.\nYou have hexproof. (You can't be the target of spells or abilities your opponents control.)","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const hipparion = (): CardDef => ({"oracleId":"306fd9d2-5ded-4857-90f4-e62d73c6aed2","name":"Hipparion","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Horse","supertypes":[],"types":["Creature"],"subtypes":["Horse"],"oracleText":"This creature can't block creatures with power 3 or greater unless you pay {1}.","power":"1","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const stench = (): CardDef => ({"oracleId":"14062abe-14df-4dbe-ad7b-530e5f6c4988","name":"Stench of Evil","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all Plains. For each land destroyed this way, Stench of Evil deals 1 damage to that land's controller unless they pay {2}.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const foes = (): CardDef => ({"oracleId":"a6a7af21-e52c-4f7f-a57f-bd365d075966","name":"Superior Foes of Spider-Man","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Rogue Villain","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue","Villain"],"oracleText":"Trample\nWhenever you cast a spell with mana value 4 or greater, you may exile the top card of your library. If you do, you may play that card until you exile another card with this creature.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Trample"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const researcher = (): CardDef => ({"oracleId":"c8762dfa-a027-4e1c-a2fa-bfdab1de102a","name":"Goblin Researcher","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Goblin Wizard","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Wizard"],"oracleText":"When this creature enters, exile the top card of your library. During any turn you attacked with this creature, you may play that card.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const captain = (): CardDef => ({"oracleId":"30b20932-0d9a-447f-b934-1daa8c44a678","name":"Boros Strike-Captain","manaCost":"{1}{R/W}{R/W}","cmc":3,"typeLine":"Creature — Minotaur Soldier","supertypes":[],"types":["Creature"],"subtypes":["Minotaur","Soldier"],"oracleText":"Battalion — Whenever this creature and at least two other creatures attack, exile the top card of your library. During any turn you attacked with three or more creatures, you may play that card.","power":"3","toughness":"3","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Battalion"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const hiveheart = (): CardDef => ({"oracleId":"c3780529-d47e-48dc-86f6-c1a282c3b656","name":"Hiveheart Shaman","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Human Shaman","supertypes":[],"types":["Creature"],"subtypes":["Human","Shaman"],"oracleText":"Whenever this creature attacks, you may search your library for a basic land card that doesn't share a land type with a land you control, put that card onto the battlefield, then shuffle.\n{5}{G}: Create a 1/1 green Insect creature token. Put X +1/+1 counters on it, where X is the number of basic land types among lands you control. Activate only as a sorcery.","power":"3","toughness":"5","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;

// Test cards.
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3", colors: ["R"] });
const giant = card("Test Giant", "Creature — Giant", "{4}{G}", { cmc: 5, power: "4", toughness: "4", colors: ["G"] });
const lure = card("Test Lure Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3", colors: ["R"], oracleText: "All creatures able to block this creature do so." });
const lureBear = card("Test Lure Bear", "Creature — Bear", "{1}{G}", { cmc: 2, power: "2", toughness: "2", colors: ["G"], oracleText: "All creatures able to block this creature do so." });
const peak = card("Test Mountain", "Land — Mountain");
const stoutPeak = card("Test Stout Mountain", "Land — Mountain", "", { keywords: ["Indestructible"], oracleText: "Indestructible" });
const field = card("Test Plains", "Land — Plains");
const rock = card("Test Rock", "Artifact", "{1}", { cmc: 1 });
const stoutRock = card("Test Stout Rock", "Artifact", "{1}", { cmc: 1, keywords: ["Indestructible"], oracleText: "Indestructible" });
const big = card("Test Big Spell", "Sorcery", "{4}", { cmc: 4, oracleText: "Draw a card." });
const small = card("Test Small Spell", "Sorcery", "{3}", { cmc: 3, oracleText: "Draw a card." });
const shot = card("Test Shot", "Instant", "{0}", { oracleText: "Test Shot deals 1 damage to target player." });

/** To `pid`'s declare blockers question in this combat, after `ap` attacked. */
const toBlocks = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 200 && !(s.pending?.kind === "declareBlockers" && s.pending.player === pid); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("Lane B round B115", () => {
  it("all ten cards are supported", () => supported(eruption(), bane(), resurgence(), mask(), hipparion(), stench(), foes(), researcher(), captain(), hiveheart()));

  it("Volcanic Eruption: destroys X target Mountains, then deals damage equal to those put into a graveyard to each creature and each player", () => {
    let { s, ap, ids } = setup([eruption()]);
    poolOnly(s, ap, { U: 3, C: 2 });
    const opp = next(s, ap);
    const m1 = putOnBattlefield(s, opp, peak);
    const m2 = putOnBattlefield(s, next(s, ap, 2), peak);
    const m3 = putOnBattlefield(s, opp, peak);
    const o = putOnBattlefield(s, opp, ogre);
    const b = putOnBattlefield(s, ap, bear());
    const life = s.turnOrder.map((p) => s.players[p]!.life);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(m1), tgt(m2)], undefined, undefined, 2)));
    expect(zone(s, m1)).toBe("graveyard");
    expect(zone(s, m2)).toBe("graveyard");
    expect(zone(s, m3)).toBe("battlefield");
    expect(s.turnOrder.map((p) => s.players[p]!.life)).toEqual(life.map((l) => l - 2));
    expect(zone(s, b)).toBe("graveyard");
    expect(s.objects[o]!.damage).toBe(2);
  });

  it("Volcanic Eruption: an indestructible Mountain isn't put into a graveyard, so it doesn't count", () => {
    let { s, ap, ids } = setup([eruption()]);
    poolOnly(s, ap, { U: 3, C: 2 });
    const opp = next(s, ap);
    const m1 = putOnBattlefield(s, opp, peak);
    const m2 = putOnBattlefield(s, opp, stoutPeak);
    const o = putOnBattlefield(s, opp, ogre);
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(m1), tgt(m2)], undefined, undefined, 2)));
    expect(zone(s, m1)).toBe("graveyard");
    expect(zone(s, m2)).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(s.objects[o]!.damage).toBe(1);
  });

  it("Volcanic Eruption: X can be 0 (rulings)", () => {
    let { s, ap, ids } = setup([eruption()]);
    poolOnly(s, ap, { U: 3 });
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, undefined, 0)));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life);
  });

  it("Builder's Bane: each player is dealt damage for their own artifacts put into a graveyard this way", () => {
    let { s, ap, ids } = setup([bane()]);
    poolOnly(s, ap, { R: 1, C: 6 });
    const o1 = next(s, ap);
    const o2 = next(s, ap, 2);
    const r1 = putOnBattlefield(s, o1, rock);
    const r2 = putOnBattlefield(s, o1, rock);
    const r3 = putOnBattlefield(s, o2, stoutRock);
    const lives = s.turnOrder.map((p) => s.players[p]!.life);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(r1), tgt(r2), tgt(r3)], undefined, undefined, 3)));
    expect(zone(s, r1)).toBe("graveyard");
    expect(zone(s, r2)).toBe("graveyard");
    expect(zone(s, r3)).toBe("battlefield");
    const after = s.turnOrder.map((p) => s.players[p]!.life);
    s.turnOrder.forEach((p, i) => expect(after[i], s.players[p]!.name).toBe(lives[i]! - (p === o1 ? 2 : 0)));
  });

  it("Elephant Resurgence: each player gets an Elephant whose power and toughness keep counting its controller's creature cards in their graveyard", () => {
    let { s, ap, ids } = setup([resurgence()]);
    const opp = next(s, ap);
    into(s, ap, bear(), "graveyard");
    into(s, opp, bear(), "graveyard");
    into(s, opp, ogre, "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    const elephants = (p: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === p && characteristics(s, s.objects[id]!).subtypes.includes("Elephant"));
    expect(elephants(ap)).toHaveLength(1);
    expect(elephants(opp)).toHaveLength(1);
    expect(pt(s, elephants(ap)[0]!)).toBe("1/1");
    expect(pt(s, elephants(opp)[0]!)).toBe("2/2");
    expect(characteristics(s, s.objects[elephants(opp)[0]!]!).colors).toEqual(["G"]);
    // Not locked in (rulings).
    into(s, opp, giant, "graveyard");
    expect(pt(s, elephants(opp)[0]!)).toBe("3/3");
    // The other two players have no creature cards in their graveyards: theirs are 0/0 and die.
    expect(elephants(next(s, ap, 2))).toHaveLength(0);
  });

  it("Imperial Mask: no teammates here, so no tokens; you have hexproof", () => {
    let { s, ap, ids } = setup([mask(), shot]);
    poolOnly(s, ap, { W: 1, C: 4 });
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    const masks = Object.values(s.objects).filter((o) => o.zone === "battlefield" && characteristics(s, o).name === "Imperial Mask");
    expect(masks).toHaveLength(1);
    // An opponent can't target you.
    const opp = next(s, ap);
    const sh = into(s, opp, shot, "hand");
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    expect(planCast(s, opp, sh, [{ kind: "player", id: ap }])).toBeNull();
    expect(planCast(s, opp, sh, [{ kind: "player", id: next(s, ap, 2) }])).not.toBeNull();
  });

  it("Hipparion: blocking a creature with power 3 or greater costs {1}, a smaller one nothing", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const o = putOnBattlefield(s, ap, ogre);
    const b = putOnBattlefield(s, ap, bear());
    const h = putOnBattlefield(s, opp, hipparion());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: o, defender: opp }, { attacker: b, defender: opp }] });
    s = toBlocks(s, opp);
    expect(blockCost(s, 1, [h], [{ blocker: h, attacker: o }])).toBe("{1}");
    expect(blockCost(s, 1, [h], [{ blocker: h, attacker: b }])).toBe("");
    // Without the mana it can't block the Ogre.
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: h, attacker: o }] })).toThrow(/costs \{1\}/);
    const blockedBear = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: h, attacker: b }] });
    expect(blockedBear.objects[h]!.blocking).toEqual([b]);
    // With it, it can, and pays.
    s.players[opp]!.manaPool.C = 1;
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: h, attacker: o }] });
    expect(s.objects[h]!.blocking).toEqual([o]);
    expect(s.players[opp]!.manaPool.C ?? 0).toBe(0);
  });

  it("Hipparion: nothing obliges it to pay to block a big creature that must be blocked, but a small one it must block (CR 509.1c)", () => {
    const block = (attacker: CardDef) => {
      let { s, ap } = setup([]);
      const opp = next(s, ap);
      const a = putOnBattlefield(s, ap, attacker);
      const h = putOnBattlefield(s, opp, hipparion());
      s = passUntil(s, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
      return { s: toBlocks(s, opp), opp, a, h };
    };
    const big1 = block(lure);
    expect(blockRequirementProblem(big1.s, big1.opp, [])).toBeNull();
    const small1 = block(lureBear);
    expect(blockRequirementProblem(small1.s, small1.opp, [])).toMatch(/must block/);
    expect(blockRequirementProblem(small1.s, small1.opp, [{ blocker: small1.h, attacker: small1.a }])).toBeNull();
  });

  it("Stench of Evil: destroys all Plains; each controller pays {2} or takes 1 damage for each of theirs", () => {
    let { s, ap, ids } = setup([stench()]);
    poolOnly(s, ap, { B: 2, C: 2 });
    const o1 = next(s, ap);
    const o2 = next(s, ap, 2);
    const p1 = putOnBattlefield(s, o1, field);
    const p2 = putOnBattlefield(s, o1, field);
    const p3 = putOnBattlefield(s, o2, field);
    const m = putOnBattlefield(s, o2, peak);
    s.players[o1]!.manaPool.C = 2;
    const l1 = s.players[o1]!.life;
    const l2 = s.players[o2]!.life;
    s = run(s, planCast(s, ap, ids[0]!, []));
    s = settle(s, { me: [o1] });
    expect([p1, p2, p3].map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(zone(s, m)).toBe("battlefield");
    // The first player (APNAP: o1 before o2) is asked twice: pays once, then declines.
    expect(s.pending?.kind === "payUnless" && s.pending.cost === "{2}" && s.pending.player === o1).toBe(true);
    s = act(s, { type: "payUnless", player: o1, pay: true });
    s = settle(s, { me: [o1] });
    expect(s.pending?.kind === "payUnless" && s.pending.player === o1).toBe(true);
    s = act(s, { type: "payUnless", player: o1, pay: false });
    s = settle(s, { me: [o1] });
    expect(s.players[o1]!.life).toBe(l1 - 1);
    expect(s.players[o1]!.manaPool.C ?? 0).toBe(0);
    // The other player can't pay: 1 damage.
    expect(s.players[o2]!.life).toBe(l2 - 1);
  });

  it("Superior Foes of Spider-Man: casting a spell with mana value 4 or more lets you exile the top card and play it until another is exiled", () => {
    let { s, ap, ids } = setup([big, small, big, big]);
    putOnBattlefield(s, ap, foes());
    const second = into(s, ap, bear(), "library");
    const first = into(s, ap, ogre, "library");
    poolOnly(s, ap, { C: 4 });
    s = run(s, planCast(s, ap, ids[0]!, []));
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, { me: [ap] });
    expect(zone(s, first)).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[first]!, ap)).toBe(true);
    // A spell with mana value 3 doesn't trigger it.
    s.players[ap]!.manaPool.C = 3;
    s = settle(run(s, planCast(s, ap, ids[1]!, [])), { me: [ap] });
    expect(s.pending).toBeNull();
    // The small spell drew the next card ("second"); put a fresh card on top, then cast the other big one and decline.
    const third = into(s, ap, giant, "library");
    void second;
    s.players[ap]!.manaPool.C = 4;
    s = settle(run(s, planCast(s, ap, ids[2]!, [])), { me: [ap] });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s, { me: [ap] });
    expect(zone(s, third)).not.toBe("exile");
    expect(mayPlayFromExile(s, s.objects[first]!, ap)).toBe(true);
    // Once it exiles another card, the first can't be played any more.
    const fourth = into(s, ap, giant, "library");
    s.players[ap]!.manaPool.C = 4;
    s = settle(run(s, planCast(s, ap, ids[3]!, [])), { me: [ap] });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, { me: [ap] });
    expect(zone(s, fourth)).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[fourth]!, ap)).toBe(true);
    expect(mayPlayFromExile(s, s.objects[first]!, ap)).toBe(false);
  });

  it("Goblin Researcher: the exiled card may be played only during a turn you attacked with that Researcher", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const top = into(s, ap, card("Test Land", "Land"), "library");
    const r = into(s, ap, researcher(), "hand");
    poolOnly(s, ap, { R: 1, C: 3 });
    s = settle(run(s, planCast(s, ap, r, [])));
    expect(zone(s, r)).toBe("battlefield");
    expect(zone(s, top)).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(false);
    // Next turn of yours, it attacks: now the card may be played, even once the Researcher is gone (rulings).
    const other = putOnBattlefield(s, ap, bear());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: other, defender: opp }] });
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(false);
    const t0 = s.turn;
    s = passUntil(s, "main1", ap);
    expect(s.turn).toBeGreaterThan(t0);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: opp }] });
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(true);
    s.battlefield.splice(s.battlefield.indexOf(r), 1);
    s.objects[r]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(r);
    invalidateCharacteristics(s);
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(true);
  });

  it("Boros Strike-Captain: battalion exiles the top card, which may be played during a turn you attacked with three or more creatures", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const c = putOnBattlefield(s, ap, captain());
    const b1 = putOnBattlefield(s, ap, bear());
    const b2 = putOnBattlefield(s, ap, bear());
    const top = into(s, ap, card("Test Land", "Land"), "library");
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [c, b1, b2].map((attacker) => ({ attacker, defender: opp })) });
    s = settle(s);
    expect(zone(s, top)).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(true);
    // A later turn of yours with only two attackers: not then.
    s = passUntil(s, "main1", ap);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [b1, b2].map((attacker) => ({ attacker, defender: opp })) });
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(false);
  });

  it("Hiveheart Shaman: only a basic land card that shares no land type with a land you control can be found", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    poolOnly(s, ap, {});
    putOnBattlefield(s, ap, card("Test Bayou", "Land — Swamp Forest"));
    const h = putOnBattlefield(s, ap, hiveheart());
    const basics = [card("Forest", "Basic Land — Forest", "", { supertypes: ["Basic"] }), card("Swamp", "Basic Land — Swamp", "", { supertypes: ["Basic"] }), card("Plains", "Basic Land — Plains", "", { supertypes: ["Basic"] })].map((d) => into(s, ap, d, "library"));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: h, defender: opp }] });
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, { me: [ap] });
    const p = s.pending;
    expect(p?.kind).toBe("searchLibrary");
    if (p?.kind !== "searchLibrary") return;
    const offered = p.cards;
    expect(offered).toContain(basics[2]);
    expect(offered).not.toContain(basics[0]);
    expect(offered).not.toContain(basics[1]);
  });
});
