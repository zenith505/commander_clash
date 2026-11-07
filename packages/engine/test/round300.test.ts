// Round 300: harder cards from the "Out after round N" lists, most played first.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { castProblem, spellCost } from "../src/game";
import { planActivate } from "../src";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes priority only while something is on the stack or waiting to go there (no step is left). */
const drain = (s: GameState) => {
  for (let i = 0; i < 60 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && nameOf(s, id) === name);
const generic = (c: ReturnType<typeof spellCost>) => c.extra + c.cost.symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount : 0), 0);
/** Empties the battlefield of `pid`'s lands and gives them this mana instead. */
const onlyPool = (s: GameState, pid: PlayerId, pool: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of [...s.battlefield]) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")) s.battlefield.splice(s.battlefield.indexOf(id), 1);
  Object.assign(s.players[pid]!.manaPool, pool);
  invalidateCharacteristics(s);
};

/** A fresh copy of `def` in `pid`'s `where`. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};

// Real oracle text (Scryfall).
const broodguardElite = (): CardDef => ({"oracleId":"c90da077-de8c-4402-abfc-b63dd15853da","name":"Broodguard Elite","manaCost":"{X}{G}{G}","cmc":2,"typeLine":"Creature — Insect Knight","supertypes":[],"types":["Creature"],"subtypes":["Insect","Knight"],"oracleText":"This creature enters with X +1/+1 counters on it.\nWhen this creature leaves the battlefield, put its counters on target creature you control.\nWarp {X}{G} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)","power":"0","toughness":"0","colors":["G"],"colorIdentity":["G"],"keywords":["Warp"],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08b1d019-65ab-4dea-9076-041fd6338a35.jpg?1783905941","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08b1d019-65ab-4dea-9076-041fd6338a35.jpg?1783905941","commanderLegal":"legal","set":"eoe","releasedAt":"2025-08-01","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const fallOfTheTitans = (): CardDef => ({"oracleId":"55e564b4-7c08-4109-bd67-da5f31fe002e","name":"Fall of the Titans","manaCost":"{X}{X}{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Surge {X}{R} (You may cast this spell for its surge cost if you or a teammate has cast another spell this turn.)\nFall of the Titans deals X damage to each of up to two targets.","colors":["R"],"colorIdentity":["R"],"keywords":["Surge"],"imageUrl":"https://cards.scryfall.io/normal/front/8/c/8c21da73-0dad-4b2b-8cc6-61861bed9410.jpg?1783937906","artUrl":"https://cards.scryfall.io/art_crop/front/8/c/8c21da73-0dad-4b2b-8cc6-61861bed9410.jpg?1783937906","commanderLegal":"legal","set":"ogw","releasedAt":"2016-01-22","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const fromUnderTheFloorboards = (): CardDef => ({"oracleId":"a1fc4269-f3e4-4a59-849d-aa1727eef23a","name":"From Under the Floorboards","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Madness {X}{B}{B} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)\nCreate three tapped 2/2 black Zombie creature tokens and you gain 3 life. If this spell's madness cost was paid, instead create X of those tokens and you gain X life.","colors":["B"],"colorIdentity":["B"],"keywords":["Madness"],"imageUrl":"https://cards.scryfall.io/normal/front/3/e/3e644706-223d-4e56-9614-b224e281be2f.jpg?1783937776","artUrl":"https://cards.scryfall.io/art_crop/front/3/e/3e644706-223d-4e56-9614-b224e281be2f.jpg?1783937776","commanderLegal":"legal","set":"soi","releasedAt":"2016-04-08","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const starnheimUnleashed = (): CardDef => ({"oracleId":"495ebe60-f0e5-4f0f-9d99-b2c64c95dbf4","name":"Starnheim Unleashed","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Create a 4/4 white Angel Warrior creature token with flying and vigilance. If this spell was foretold, create X of those tokens instead.\nForetell {X}{X}{W} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)","colors":["W"],"colorIdentity":["W"],"keywords":["Foretell"],"imageUrl":"https://cards.scryfall.io/normal/front/e/a/ea660d42-a441-48d8-98c1-00933cde94a4.jpg?1783928275","artUrl":"https://cards.scryfall.io/art_crop/front/e/a/ea660d42-a441-48d8-98c1-00933cde94a4.jpg?1783928275","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const ranAndShaw = (): CardDef => ({"oracleId":"a728685f-8670-4db2-ae02-3cf74eb3c402","name":"Ran and Shaw","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Legendary Creature — Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying, firebending 2\nWhen Ran and Shaw enter, if you cast them and there are three or more Dragon and/or Lesson cards in your graveyard, create a token that's a copy of Ran and Shaw, except it's not legendary.\n{3}{R}: Dragons you control get +2/+0 until end of turn.","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Firebending"],"imageUrl":"https://cards.scryfall.io/normal/front/6/4/6436e2d0-989f-47e3-90bc-9cde82a2ddb4.jpg?1783904952","artUrl":"https://cards.scryfall.io/art_crop/front/6/4/6436e2d0-989f-47e3-90bc-9cde82a2ddb4.jpg?1783904952","commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const mutatedCultist = (): CardDef => ({"oracleId":"5168be9b-ffca-41c5-a944-92a1a2e30779","name":"Mutated Cultist","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Eldrazi Horror","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi","Horror"],"oracleText":"Devoid (This card has no color.)\nWhen you cast this spell, remove all counters from up to one target permanent or opponent. The next spell you cast this turn costs {1} less to cast for each counter removed this way.\nDeathtouch","power":"1","toughness":"3","colors":[],"colorIdentity":["B"],"keywords":["Devoid","Deathtouch"],"imageUrl":"https://cards.scryfall.io/normal/front/c/c/cc4bb871-cde9-43a9-8089-5987fa0dd4ef.jpg?1783911422","artUrl":"https://cards.scryfall.io/art_crop/front/c/c/cc4bb871-cde9-43a9-8089-5987fa0dd4ef.jpg?1783911422","commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const slumberingTrudge = (): CardDef => ({"oracleId":"d04bce9a-822b-4a52-8826-b503ef5f5b2e","name":"Slumbering Trudge","manaCost":"{X}{G}","cmc":1,"typeLine":"Creature — Plant Beast","supertypes":[],"types":["Creature"],"subtypes":["Plant","Beast"],"oracleText":"This creature enters with a number of stun counters on it equal to three minus X. If X is 2 or less, it enters tapped. (If a permanent with a stun counter would become untapped, remove one from it instead.)","power":"6","toughness":"6","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3a925370-58ac-4181-9acc-db7b0e0abf17.jpg?1783903653","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3a925370-58ac-4181-9acc-db7b0e0abf17.jpg?1783903653","commanderLegal":"legal","set":"sos","releasedAt":"2026-04-24","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const thiefOfBlood = (): CardDef => ({"oracleId":"97d61346-bd53-4eb8-a920-6ae0382eb20d","name":"Thief of Blood","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Creature — Vampire","supertypes":[],"types":["Creature"],"subtypes":["Vampire"],"oracleText":"Flying\nAs this creature enters, remove all counters from all permanents. This creature enters with a +1/+1 counter on it for each counter removed this way.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/6/d/6df10f38-6658-49ea-b996-45b33c02bd57.jpg?1783938112","artUrl":"https://cards.scryfall.io/art_crop/front/6/d/6df10f38-6658-49ea-b996-45b33c02bd57.jpg?1783938112","commanderLegal":"legal","set":"c15","releasedAt":"2015-11-13","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const gluttonousHellkite = (): CardDef => ({"oracleId":"3093796d-c429-4c79-a33a-31226e00b12c","name":"Gluttonous Hellkite","manaCost":"{X}{X}{B}{R}{G}","cmc":3,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"When you cast this spell, each player sacrifices X creatures. This creature enters with two +1/+1 counters on it for each creature sacrificed this way.\nFlying, trample","power":"3","toughness":"3","colors":["B","G","R"],"colorIdentity":["B","G","R"],"keywords":["Flying","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/6/3/63f6e8da-31ea-4edf-89a9-f2b7f2234d7e.jpg?1783911416","artUrl":"https://cards.scryfall.io/art_crop/front/6/3/63f6e8da-31ea-4edf-89a9-f2b7f2234d7e.jpg?1783911416","commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const wateryGrasp = (): CardDef => ({"oracleId":"520b2799-66bd-40bf-9bc0-9cd3aed321f5","name":"Watery Grasp","manaCost":"{U}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature doesn't untap during its controller's untap step.\nWaterbend {5}: Enchanted creature's owner shuffles it into their library. (While paying a waterbend cost, you can tap your artifacts and creatures to help. Each one pays for {1}.)","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant","Waterbend"],"imageUrl":"https://cards.scryfall.io/normal/front/2/6/26bcff57-428e-4f30-a153-a778fbfc437d.jpg?1783904978","artUrl":"https://cards.scryfall.io/art_crop/front/2/6/26bcff57-428e-4f30-a153-a778fbfc437d.jpg?1783904978","commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"common","layout":"normal","gameChanger":false} as CardDef);

describe("an {X} in an alternative cost (CR 107.3a)", () => {
  it("Broodguard Elite's warp {X}{G}: X is announced for the warp cost and it enters with X +1/+1 counters", () => {
    supported(broodguardElite());
    const { s: s0, ap, ids } = setup([broodguardElite()]);
    const o = s0.objects[ids[0]!]!;
    // Warp {X}{G} with X 3: {3}{G}, not the mana cost's {3}{G}{G}.
    expect(generic(spellCost(s0, ap, o, 3, [], { alt: "warp" }))).toBe(3);
    const s = drain(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 3, { alt: "warp" })));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters?.["+1/+1"]).toBe(3);
  });

  it("Fall of the Titans' surge {X}{R}: X once, after another spell this turn, and X damage to each target", () => {
    supported(fallOfTheTitans());
    const { s: s0, ap, ids, opp } = setup([fallOfTheTitans(), card("Test Opt", "Instant", "{U}", { oracleText: "Draw a card." })]);
    const [fall, opt] = ids as [string, string];
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp, bear({ name: "Test Big Bear", toughness: "5" }));
    // No other spell yet: no surge.
    expect(castProblem(s0, ap, fall, [tgt(a), tgt(b)], undefined, undefined, undefined, 3, { alt: "surge" })).toBeTruthy();
    let s = drain(run(s0, planCast(s0, ap, opt)));
    expect(generic(spellCost(s, ap, s.objects[fall]!, 3, [], { alt: "surge" }))).toBe(3);
    // Its mana cost {X}{X}{R} would pay X twice.
    expect(generic(spellCost(s, ap, s.objects[fall]!, 3, []))).toBe(6);
    s = drain(run(s, planCast(s, ap, fall, [tgt(a), tgt(b)], undefined, "auto", 3, { alt: "surge" })));
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[b]!.damage).toBe(3);
  });

  it("Starnheim Unleashed: foretold, X Angels for {X}{X}{W}; cast from the hand, one Angel and no X to choose", () => {
    supported(starnheimUnleashed());
    const { s: s0, ap, ids } = setup([starnheimUnleashed()]);
    const id = ids[0]!;
    // From the hand: its mana cost has no X (CR 107.3a), so X can't be chosen.
    expect(castProblem(s0, ap, id, undefined, undefined, undefined, undefined, 2)).toMatch(/no X/);
    let s = drain(run(s0, planCast(s0, ap, id)));
    expect(named(s, ap, "Angel Warrior Token")).toHaveLength(1);
    // Foretold (another copy), then cast on a later turn: {2}{W} for one, {4}{W} for two, {6}{W} for three (rulings).
    const { s: f0, ap: p, ids: fids } = setup([starnheimUnleashed()]);
    let f = f0;
    for (const l of f.battlefield.filter((x) => nameOf(f, x) === "Forest").slice(0, 2)) f = act(f, { type: "activateMana", player: p, objectId: l, mana: "G" });
    f = act(f, { type: "foretell", player: p, objectId: fids[0]! });
    f = passUntil(f, "main1", f.turnOrder[(f.turnOrder.indexOf(p) + 1) % 4]!);
    f = passUntil(f, "main1", p, 4000);
    const card0 = f.objects[fids[0]!]!;
    expect(generic(spellCost(f, p, card0, 3, [], { alt: "foretell" }))).toBe(6);
    f.players[p]!.manaPool.W = 7;
    for (const id of [...f.battlefield]) if (f.objects[id]!.controller === p && nameOf(f, id) !== "Plains" && f.cards[f.objects[id]!.cardId]!.typeLine.includes("Land")) f.objects[id]!.tapped = true;
    f = drain(run(f, planCast(f, p, fids[0]!, undefined, undefined, "auto", 3, { alt: "foretell" })));
    expect(named(f, p, "Angel Warrior Token")).toHaveLength(3);
  });

  it("the bot casts a foretold Starnheim Unleashed for its foretell cost with as big an X as it can pay", () => {
    const { s: f0, ap: p, ids } = setup([starnheimUnleashed()]);
    let f = f0;
    for (const l of f.battlefield.filter((x) => nameOf(f, x) === "Forest").slice(0, 2)) f = act(f, { type: "activateMana", player: p, objectId: l, mana: "G" });
    f = act(f, { type: "foretell", player: p, objectId: ids[0]! });
    f = passUntil(f, "main1", f.turnOrder[(f.turnOrder.indexOf(p) + 1) % 4]!);
    f = passUntil(f, "main1", p, 4000);
    // Only the Plains (3) and Islands (3) untapped: {X}{X}{W} with X 2 is the most.
    for (const id of [...f.battlefield]) if (f.objects[id]!.controller === p && !["Plains", "Island"].includes(nameOf(f, id)) && f.cards[f.objects[id]!.cardId]!.typeLine.includes("Land")) f.objects[id]!.tapped = true;
    f.players[p]!.hand = f.players[p]!.hand.filter((h) => nameOf(f, h) === "Starnheim Unleashed");
    const acts = botActions(f, p);
    const castIt = acts.find((a) => a.type === "castSpell" && a.objectId === ids[0]);
    expect(castIt).toMatchObject({ x: 2, alt: "foretell" });
  });

  it("From Under the Floorboards: cast for madness {X}{B}{B}, X tapped Zombies and X life; cast normally, three and 3", () => {
    supported(fromUnderTheFloorboards());
    const study = card("Test Careful Study", "Sorcery", "{U}", { oracleText: "Draw two cards, then discard two cards." });
    const { s: s0, ap, ids } = setup([study, fromUnderTheFloorboards()]);
    const [st, fl] = ids as [string, string];
    let s = drain(run(s0, planCast(s0, ap, st)));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    s = act(s, { type: "discard", player: ap, objectIds: [fl, s.players[ap]!.hand.find((x) => x !== fl)!] });
    s = drain(s);
    expect(s.pending).toMatchObject({ kind: "castFree", how: "madness", objectId: fl });
    // Madness {X}{B}{B} with X 4: {4}{B}{B}.
    expect(generic(spellCost(s, ap, s.objects[fl]!, 4, []))).toBe(4);
    const life = s.players[ap]!.life;
    s = drain(run(s, planCast(s, ap, fl, undefined, undefined, "auto", 4)));
    const zombies = named(s, ap, "Zombie Token");
    expect(zombies).toHaveLength(4);
    expect(zombies.every((z) => s.objects[z]!.tapped)).toBe(true);
    expect(s.players[ap]!.life).toBe(life + 4);
    // From the hand: three, 3 life, and no X.
    const { s: h0, ap: p, ids: hids } = setup([fromUnderTheFloorboards()]);
    expect(castProblem(h0, p, hids[0]!, undefined, undefined, undefined, undefined, 2)).toMatch(/no X/);
    const l2 = h0.players[p]!.life;
    const h = drain(run(h0, planCast(h0, p, hids[0]!)));
    expect(named(h, p, "Zombie Token")).toHaveLength(3);
    expect(h.players[p]!.life).toBe(l2 + 3);
  });
});

describe("Ran and Shaw: a token copy if you cast them and there are three or more Dragon and/or Lesson cards in your graveyard", () => {
  const lesson = (n: number) => card(`Test Lesson ${n}`, "Sorcery — Lesson", "{U}", { oracleText: "Draw a card." });
  const dragonCard = card("Test Dragon Card", "Creature — Dragon", "{4}{R}", { power: "4", toughness: "4" });
  const toGrave = (s: GameState, pid: PlayerId, def: CardDef) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "graveyard";
    s.players[pid]!.graveyard.push(id);
    invalidateCharacteristics(s);
  };
  it("a Dragon and two Lessons: a nonlegendary token copy; two of them, or not cast: none", () => {
    supported(ranAndShaw());
    const { s: s0, ap, ids } = setup([ranAndShaw()]);
    toGrave(s0, ap, dragonCard);
    toGrave(s0, ap, lesson(1));
    toGrave(s0, ap, lesson(2));
    const s = drain(run(s0, planCast(s0, ap, ids[0]!)));
    const both = named(s, ap, "Ran and Shaw");
    expect(both).toHaveLength(2);
    expect(both.filter((id) => s.objects[id]!.isToken)).toHaveLength(1);
    // The copy isn't legendary, so the legend rule leaves both (CR 704.5j).
    expect(both.every((id) => s.objects[id]!.zone === "battlefield")).toBe(true);
    // Only two such cards: no token.
    const { s: t0, ap: p, ids: tids } = setup([ranAndShaw()]);
    toGrave(t0, p, dragonCard);
    toGrave(t0, p, lesson(1));
    const t = drain(run(t0, planCast(t0, p, tids[0]!)));
    expect(named(t, p, "Ran and Shaw")).toHaveLength(1);
    // Put onto the battlefield without being cast: none (an intervening if, CR 603.4).
    const { s: u0, ap: q } = setup([]);
    for (const d of [dragonCard, lesson(1), lesson(2), lesson(3)]) toGrave(u0, q, d);
    putOnBattlefield(u0, q, ranAndShaw());
    expect(named(drain(u0), q, "Ran and Shaw")).toHaveLength(1);
  });
});

describe("Mutated Cultist: remove all counters from up to one target permanent or opponent; the next spell costs {1} less for each", () => {
  it("an opponent's poison, energy and rad counters all go, and the next spell costs that much less", () => {
    supported(mutatedCultist());
    const big = card("Test Big Spell", "Sorcery", "{6}{G}", { oracleText: "Draw a card." });
    const { s: s0, ap, ids, opp } = setup([mutatedCultist(), big]);
    const [cultist, spell] = ids as [string, string];
    Object.assign(s0.players[opp]!, { poison: 2, energy: 1, rad: 1 });
    let s = run(s0, planCast(s0, ap, cultist));
    s = drain(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    // Not you (rulings): only an opponent.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: ap }] })).toThrow();
    s = drain(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.poison ?? 0).toBe(0);
    expect(s.players[opp]!.energy ?? 0).toBe(0);
    expect(s.players[opp]!.rad ?? 0).toBe(0);
    expect(s.objects[cultist]!.zone).toBe("battlefield");
    // Four counters: {6}{G} costs {2}{G}.
    expect(generic(spellCost(s, ap, s.objects[spell]!))).toBe(2);
  });

  it("a permanent's counters of every kind; none chosen, nothing removed", () => {
    const { s: s0, ap, ids, opp } = setup([mutatedCultist(), card("Test Big Spell", "Sorcery", "{6}{G}", { oracleText: "Draw a card." })]);
    const victim = putOnBattlefield(s0, opp, bear());
    s0.objects[victim]!.counters = { "+1/+1": 2, shield: 1 };
    let s = drain(run(s0, planCast(s0, ap, ids[0]!)));
    s = drain(act(s, { type: "chooseTargets", player: ap, targets: [tgt(victim)] }));
    expect(Object.values(s.objects[victim]!.counters).reduce((a, n) => a + n, 0)).toBe(0);
    expect(generic(spellCost(s, ap, s.objects[ids[1]!]!))).toBe(3);
  });
});

describe("Slumbering Trudge: stun counters equal to three minus X; tapped if X is 2 or less", () => {
  it("X 1: two stun counters, tapped; X 3: none, untapped; put onto the battlefield: X is 0 (rulings)", () => {
    supported(slumberingTrudge());
    const { s: s0, ap, ids } = setup([slumberingTrudge()]);
    const a = drain(run(structuredClone(s0), planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 1)));
    expect(a.objects[ids[0]!]!.counters.stun).toBe(2);
    expect(a.objects[ids[0]!]!.tapped).toBe(true);
    const b = drain(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 3)));
    expect(b.objects[ids[0]!]!.counters.stun ?? 0).toBe(0);
    expect(b.objects[ids[0]!]!.tapped).toBe(false);
    // X 5: still none (never fewer than 0, CR 107.1b).
    const { s: c0, ap: p, ids: cids } = setup([slumberingTrudge()]);
    c0.players[p]!.manaPool.C = 6;
    const c = drain(run(c0, planCast(c0, p, cids[0]!, undefined, undefined, "auto", 5)));
    expect(c.objects[cids[0]!]!.counters.stun ?? 0).toBe(0);
    const { s: d, ap: q } = setup([]);
    const trudge = toZone(d, q, slumberingTrudge(), "graveyard");
    const reanimate = toZone(d, q, card("Test Reanimate", "Sorcery", "{B}", { oracleText: "Return target creature card from your graveyard to the battlefield." }), "hand");
    const back = drain(run(d, planCast(d, q, reanimate, [tgt(trudge)])));
    expect(back.objects[trudge]!.zone).toBe("battlefield");
    expect(back.objects[trudge]!.counters.stun).toBe(3);
    expect(back.objects[trudge]!.tapped).toBe(true);
  });
});

describe("Thief of Blood: as it enters, remove all counters from all permanents; a +1/+1 counter for each", () => {
  it("every kind from every permanent, a planeswalker's loyalty too; a player's counters stay (rulings)", () => {
    supported(thiefOfBlood());
    const { s: s0, ap, ids, opp } = setup([thiefOfBlood()]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test Mine" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Test Theirs" }));
    const walker = putOnBattlefield(s0, opp, card("Test Walker", "Legendary Planeswalker — Test", "{3}", { loyalty: "3" }));
    s0.objects[mine]!.counters = { "+1/+1": 2 };
    s0.objects[theirs]!.counters = { "-1/-1": 1, stun: 1 };
    s0.objects[walker]!.counters = { loyalty: 3 };
    s0.players[opp]!.poison = 3;
    s0.players[ap]!.experience = 2;
    const s = drain(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(7);
    expect(Object.values(s.objects[mine]!.counters).reduce((a, n) => a + n, 0)).toBe(0);
    expect(Object.values(s.objects[theirs]!.counters).reduce((a, n) => a + n, 0)).toBe(0);
    // No loyalty left: the planeswalker is put into its owner's graveyard (CR 704.5i).
    expect(s.objects[walker]!.zone).toBe("graveyard");
    expect(s.players[opp]!.poison).toBe(3);
    expect(s.players[ap]!.experience).toBe(2);
  });
});

describe("Gluttonous Hellkite: each player sacrifices X creatures as it's cast; two +1/+1 counters for each one sacrificed", () => {
  it("X 2: the creatures actually sacrificed count, not X (rulings)", () => {
    supported(gluttonousHellkite());
    const { s: s0, ap, ids, opp } = setup([gluttonousHellkite()]);
    s0.players[ap]!.manaPool.C = 4;
    const third = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    // The opponent has two creatures, the others one and none; we have one.
    putOnBattlefield(s0, opp, bear({ name: "Test Bear 1" }));
    putOnBattlefield(s0, opp, bear({ name: "Test Bear 2" }));
    putOnBattlefield(s0, third, bear({ name: "Test Bear 3" }));
    putOnBattlefield(s0, ap, bear({ name: "Test Bear 4" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2));
    for (let i = 0; i < 40 && (s.stack.length || s.pending); i++) {
      if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: s.pending.player, ids: s.pending.options.slice(0, s.pending.count) });
      else if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toBeNull();
    // 2 + 1 + 1 creatures sacrificed: eight counters.
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(8);
  });
});

describe("Watery Grasp: waterbend {5}: enchanted creature's owner shuffles it into their library", () => {
  it("the creature it enchants goes into its owner's library", () => {
    supported(wateryGrasp());
    const { s: s0, ap, ids, opp } = setup([wateryGrasp()]);
    const victim = putOnBattlefield(s0, opp, bear());
    let s = drain(run(s0, planCast(s0, ap, ids[0]!, [tgt(victim)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(victim);
    const lib = s.players[opp]!.library.length;
    s = drain(run(s, planActivate(s, ap, ids[0]!, 0)));
    expect(s.objects[victim]!.zone).toBe("library");
    expect(s.players[opp]!.library.length).toBe(lib + 1);
  });
});
