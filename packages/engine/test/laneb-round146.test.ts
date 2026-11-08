// Lane B round B146: Bullseye, Death Dealer and Tidal Control (an activated ability whose last cost is a choice of two,
// made as it's activated, CR 602.2b, 601.2b: one ability per cost, as The Shards), Tester of the Tangential ("you may pay
// {X}. When you do, move X +1/+1 counters from ~ onto another target creature": all of them if it has fewer, rulings on
// Blaster, Morale Booster), Isareth the Awakener (the reflexive ability's target "with mana value X" is the X paid), Molten
// Sentry (a coin flip as it enters picks its form, CR 705.2, 707.2), Wargling ("until end of turn, ~ gets +1/+0 and
// creatures you control gain trample") and Case the Joint ("look at the top card of each player's library").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, applyAction, botActions, compileCard, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const bullseye = (): CardDef => ({"oracleId":"10db57b4-f895-4514-b610-2252ba676353","name":"Bullseye, Death Dealer","manaCost":"{2}{B/R}","cmc":3,"typeLine":"Legendary Creature — Human Assassin Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Assassin","Villain"],"oracleText":"When Bullseye enters, you may sacrifice an artifact or discard a nonland card. When you do, Bullseye deals 2 damage to any target.\n{3}, {T}, Sacrifice an artifact or discard a nonland card: Bullseye deals 2 damage to any target.","power":"2","toughness":"3","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f0b5f-5e0e-4da1-ab54-a62db5af3591.jpg?1783902903","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f0b5f-5e0e-4da1-ab54-a62db5af3591.jpg?1783902903","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const tidal = (): CardDef => ({"oracleId":"855e200e-5375-4aac-b1f7-5113162e7e14","name":"Tidal Control","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Cumulative upkeep {2} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nPay 2 life or {2}: Counter target red or green spell. Any player may activate this ability.","colors":["U"],"colorIdentity":["U"],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/c/b/cb9a7b7d-3d37-4bb6-ab48-1fec2bfb4fdc.jpg?1783947189","artUrl":"https://cards.scryfall.io/art_crop/front/c/b/cb9a7b7d-3d37-4bb6-ab48-1fec2bfb4fdc.jpg?1783947189","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tester = (): CardDef => ({"oracleId":"a30a2b96-4a8c-4d18-b276-5005b8aff7ed","name":"Tester of the Tangential","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Djinn Wizard","supertypes":[],"types":["Creature"],"subtypes":["Djinn","Wizard"],"oracleText":"Increment (Whenever you cast a spell, if the amount of mana you spent is greater than this creature's power or toughness, put a +1/+1 counter on this creature.)\nAt the beginning of combat on your turn, you may pay {X}. When you do, move X +1/+1 counters from this creature onto another target creature.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Increment"],"imageUrl":"https://cards.scryfall.io/normal/front/b/b/bbd708ec-eef4-4f45-99dd-60e1cec4b991.jpg?1783903685","artUrl":"https://cards.scryfall.io/art_crop/front/b/b/bbd708ec-eef4-4f45-99dd-60e1cec4b991.jpg?1783903685","commanderLegal":"legal","set":"sos","releasedAt":"2026-04-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const isareth = (): CardDef => ({"oracleId":"7af0e2da-9163-42d9-bf69-439cc61cd28d","name":"Isareth the Awakener","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Deathtouch\nWhenever Isareth attacks, you may pay {X}. When you do, return target creature card with mana value X from your graveyard to the battlefield with a corpse counter on it. If that creature would leave the battlefield, exile it instead of putting it anywhere else.","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch"],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9a129db8-e2ba-4a40-b218-e43d3b9e59f3.jpg?1783908849","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9a129db8-e2ba-4a40-b218-e43d3b9e59f3.jpg?1783908849","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sentry = (): CardDef => ({"oracleId":"66742e88-88cd-4c89-b04b-806577fe5f67","name":"Molten Sentry","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"As this creature enters, flip a coin. If the coin comes up heads, this creature enters as a 5/2 creature with haste. If it comes up tails, this creature enters as a 2/5 creature with defender.","power":"*","toughness":"*","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a9eb6c92-b385-4ef4-83ac-65a1a23e3d22.jpg?1783943649","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a9eb6c92-b385-4ef4-83ac-65a1a23e3d22.jpg?1783943649","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wargling = (): CardDef => ({"oracleId":"ce107656-f222-4d9a-9ba2-b33b4d47bdb5","name":"Wargling","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Wolf","supertypes":[],"types":["Creature"],"subtypes":["Wolf"],"oracleText":"Ferocious — Whenever this creature attacks while you control a creature with power 4 or greater, until end of turn, this creature gets +1/+0 and creatures you control gain trample.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Ferocious"],"imageUrl":"https://cards.scryfall.io/normal/front/1/c/1ccbf823-846f-4f09-9c67-1deebb5d1d92.jpg?1785497175","artUrl":"https://cards.scryfall.io/art_crop/front/1/c/1ccbf823-846f-4f09-9c67-1deebb5d1d92.jpg?1785497175","commanderLegal":"legal","set":"hob","releasedAt":"2026-08-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const caseJoint = (): CardDef => ({"oracleId":"575d067a-83a0-49e7-8a74-e3e46a946c8c","name":"Case the Joint","manaCost":"{3}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Draw two cards, then look at the top card of each player's library.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/f/0f9edf04-681d-45f9-975f-704154040506.jpg?1783923149","artUrl":"https://cards.scryfall.io/art_crop/front/0/f/0f9edf04-681d-45f9-975f-704154040506.jpg?1783923149","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const clone = (): CardDef => ({"oracleId":"42226b87-0746-4ebf-9fd0-108d508462af","name":"Clone","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"You may have this creature enter as a copy of any creature on the battlefield.","power":"0","toughness":"0","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const thumb = (): CardDef => ({"oracleId":"a97c8482-775c-4f11-9872-25b4f9bfcb1a","name":"Krark's Thumb","manaCost":"{2}","cmc":2,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"If you would flip a coin, instead flip two coins and ignore one.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/8/78a5d49a-747e-4ec8-a20a-ca917c315774.jpg?1783944517","artUrl":"https://cards.scryfall.io/art_crop/front/7/8/78a5d49a-747e-4ec8-a20a-ca917c315774.jpg?1783944517","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const artifact = card("Test Trinket", "Artifact", "{1}");
const ogre = bear({ name: "Test Ogre", manaCost: "{3}{G}", power: "4", toughness: "4" });
const twoDrop = bear({ name: "Test Two Drop", manaCost: "{1}{B}", colors: ["B"], colorIdentity: ["B"] });
const threeDrop = bear({ name: "Test Three Drop", manaCost: "{2}{B}", colors: ["B"], colorIdentity: ["B"], power: "3", toughness: "3" });
const blueSpell = card("Test Blue Bolt", "Instant", "{U}", { oracleText: "Test Blue Bolt deals 3 damage to any target.", colors: ["U"], colorIdentity: ["U"] });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** As settle, but bots answer every question. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const attackWith = (s: GameState, attackers: ObjectId[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  s = act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 50 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Give `pid` priority now (players pass until it reaches them). */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 4 && s.priority !== pid; i++) s = act(s, { type: "passPriority", player: s.priority! });
  return s;
};

describe("Lane B round B146", () => {
  it("compiles all seven cards", () => supported(bullseye(), tidal(), tester(), isareth(), sentry(), wargling(), caseJoint()));

  it("Bullseye: its {3}, {T} ability costs a sacrificed artifact or a discarded nonland card, either one, not both", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bullseye());
    const abs = compileCard(bullseye()).activated;
    expect(abs.map((a) => a.text)).toEqual(["{3}, {T}, Sacrifice an artifact: ~ deals 2 damage to any target.", "{3}, {T}, Discard a nonland card: ~ deals 2 damage to any target."]);
    const trinket = putOnBattlefield(s0, ap, artifact);
    const spell = into(s0, ap, blueSpell, "hand");
    const life = s0.players[opp]!.life;
    // The sacrifice: the artifact goes; the hand stays.
    let s = settle(run(s0, planActivate(s0, ap, b, 0, [{ kind: "player", id: opp }], undefined, undefined, undefined, { sacrifice: [trinket] })));
    expect(s.objects[trinket]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.players[ap]!.hand).toContain(spell);
    // The discard: a land card can't pay it, a nonland card can.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const b1 = putOnBattlefield(s1, ap1, bullseye());
    const land1 = into(s1, ap1, card("Test Land", "Land"), "hand");
    const spell1 = into(s1, ap1, blueSpell, "hand");
    expect(planActivate(s1, ap1, b1, 1, [{ kind: "player", id: opp1 }], undefined, undefined, undefined, { discard: [land1] })).toBeNull();
    s = settle(run(s1, planActivate(s1, ap1, b1, 1, [{ kind: "player", id: opp1 }], undefined, undefined, undefined, { discard: [spell1] })));
    expect(s.objects[spell1]!.zone).toBe("graveyard");
    expect(s.players[opp1]!.life).toBe(life - 2);
    // With no artifact to sacrifice, only the discard is open.
    const { s: s2, ap: ap2 } = setup([]);
    const b2 = putOnBattlefield(s2, ap2, bullseye());
    expect(abilityProblem(s2, ap2, b2, 0, [{ kind: "player", id: next(s2, ap2) }])).toMatch(/sacrifice/);
  });

  it("Tidal Control: any player may pay 2 life or {2} to counter a red or green spell; the activator controls the ability", () => {
    const { s: s0, ap, ids } = setup([bolt(), blueSpell]);
    const opp = next(s0, ap);
    const tc = putOnBattlefield(s0, opp, tidal());
    expect(compileCard(tidal()).activated.map((a) => [a.manaCost, a.lifeCost ?? 0, a.anyPlayer])).toEqual([["", 2, true], ["{2}", 0, true]]);
    // Ap casts a red spell; ap (not Tidal Control's controller) counters it, paying 2 life.
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    const item = s.stack[s.stack.length - 1]!;
    const life = s.players[ap]!.life;
    s = run(s, planActivate(s, ap, tc, 0, [{ kind: "stack", id: item.id }]));
    expect(s.stack[s.stack.length - 1]!.controller).toBe(ap);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(s0.players[opp]!.life);
    // A blue spell isn't a legal target; Tidal Control's controller pays {2} the other way.
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    const blue = s.stack[s.stack.length - 1]!;
    s = priorityTo(s, opp);
    expect(abilityProblem(s, opp, tc, 1, [{ kind: "stack", id: blue.id }])).not.toBeNull();
    s = settle(s);
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
  });

  it("Tidal Control: {2} from the controller counters a green spell", () => {
    const { s: s0, ap } = setup([]);
    const opp = next(s0, ap);
    const tc = putOnBattlefield(s0, ap, tidal());
    const elf = into(s0, opp, bear({ name: "Test Green Flash", oracleText: "Flash", keywords: ["Flash"] }), "hand");
    s0.players[opp]!.manaPool.G = 2;
    let s = priorityTo(s0, opp);
    s = run(s, planCast(s, opp, elf));
    s = priorityTo(s, ap);
    const item = s.stack[s.stack.length - 1]!;
    s = settle(run(s, planActivate(s, ap, tc, 1, [{ kind: "stack", id: item.id }])));
    expect(s.objects[elf]!.zone).toBe("graveyard");
    expect(s.battlefield).not.toContain(elf);
  });

  it("Tester of the Tangential: pay X at the beginning of combat to move X +1/+1 counters onto another target creature; all of them if it has fewer", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tester());
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Friend" }));
    s0.objects[t]!.counters["+1/+1"] = 3;
    let s = passUntil(s0, "beginCombat", ap);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "2" }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s.players[ap]!.manaPool.C = 2;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    // "Another target creature": not Tester itself.
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [tgt(t)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] }));
    expect(s.objects[t]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
    expect(pt(s, b)).toBe("4/4");
  });

  it("Tester of the Tangential: X greater than its counters moves all of them", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tester());
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Friend" }));
    s0.objects[t]!.counters["+1/+1"] = 1;
    let s = settle(passUntil(s0, "beginCombat", ap));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "3" }));
    s.players[ap]!.manaPool.C = 3;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { targets: [tgt(b)] });
    expect(s.objects[t]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(s.players[ap]!.manaPool.C).toBe(0);
  });

  it("Tester of the Tangential: a bot pays as many as it has counters and moves them onto its other creature", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tester());
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Friend" }));
    s0.objects[t]!.counters["+1/+1"] = 2;
    let s = settle(passUntil(s0, "beginCombat", ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX" });
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "2" }]);
    s = settleBots(s);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[t]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Isareth the Awakener: pay X as it attacks to return a creature card with mana value exactly X, which is exiled if it would leave", () => {
    const { s: s0, ap, opp } = setup([]);
    const i = putOnBattlefield(s0, ap, isareth());
    const two = into(s0, ap, twoDrop, "graveyard");
    const three = into(s0, ap, threeDrop, "graveyard");
    const theirs = into(s0, opp, twoDrop, "graveyard");
    let s = attackWith(passUntil(s0, "main1", ap), [i], opp);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "2" }));
    s.players[ap]!.manaPool.C = 2;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    // Mana value 3 isn't the X paid; another player's graveyard isn't yours.
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [tgt(three)] })).toThrow();
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(two)] }));
    const back = s.battlefield.find((id) => s.objects[id]!.cardId === twoDrop.oracleId && s.objects[id]!.owner === ap)!;
    expect(back).toBeDefined();
    expect(s.objects[back]!.counters.corpse).toBe(1);
    // It can't attack in this combat (rulings): it wasn't declared.
    expect(s.objects[back]!.attacking).toBeFalsy();
    // Dying, it's exiled instead.
    s.objects[back]!.damage = 5;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[back]?.zone ?? s.players[ap]!.exile.some((x) => s.objects[x]!.cardId === twoDrop.oracleId) ? "exile" : "?").toBe("exile");
    expect(s.players[ap]!.graveyard.some((x) => s.objects[x]!.cardId === twoDrop.oracleId)).toBe(false);
  });

  it("Isareth the Awakener: a bot pays the mana value of its best creature card in its graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const i = putOnBattlefield(s0, ap, isareth());
    into(s0, ap, twoDrop, "graveyard");
    into(s0, ap, threeDrop, "graveyard");
    let s = settle(attackWith(passUntil(s0, "main1", ap), [i], opp));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX" });
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "3" }]);
  });

  it("Molten Sentry: a coin flip as it enters makes it a 5/2 with haste (heads) or a 2/5 with defender (tails)", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const { s: s0, ap, ids } = setup([sentry()], seed);
      const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      const o = s.objects[ids[0]!]!;
      expect(o.zone).toBe("battlefield");
      const heads = s.log.some((l) => /flips a coin for Molten Sentry: it comes up heads/.test(l.text));
      const tails = s.log.some((l) => /flips a coin for Molten Sentry: it comes up tails/.test(l.text));
      expect(heads !== tails).toBe(true);
      expect(pt(s, o.id)).toBe(heads ? "5/2" : "2/5");
      expect(objHasKeyword(s, o, "Haste")).toBe(heads);
      expect(objHasKeyword(s, o, "Defender")).toBe(!heads);
      seen.add(heads ? "heads" : "tails");
    }
    expect([...seen].sort()).toEqual(["heads", "tails"]);
  });

  it("Molten Sentry: with Krark's Thumb's two coins showing heads and tails, its controller keeps either", () => {
    let asked = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { s: s0, ap, ids } = setup([sentry()], seed);
      putOnBattlefield(s0, ap, thumb());
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      if (s.pending?.kind !== "chooseOption") {
        expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
        continue;
      }
      asked++;
      expect(s.pending).toMatchObject({ what: "form", player: ap, options: ["0", "1"] });
      s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
      expect(pt(s, ids[0]!)).toBe("2/5");
      expect(objHasKeyword(s, s.objects[ids[0]!]!, "Defender")).toBe(true);
    }
    expect(asked).toBeGreaterThan(0);
  });

  // The copy has the copied Sentry's form (copiable values, CR 707.2) and its own flip's on top: its power and toughness
  // from its own flip, the keywords of both (as the rulings on Primal Plasma and Corrupted Shapeshifter spell out).
  it("Molten Sentry: a Clone entering as a copy flips for itself; its own flip sets its power and toughness", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { s: s0, ap, ids } = setup([sentry(), clone()], seed);
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      s = run(s, planCast(s, ap, ids[1]!));
      for (let i = 0; i < 20 && !(s.pending?.kind === "chooseOption" && s.pending.what === "copy"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy" });
      s = settle(act(s, { type: "chooseOption", player: ap, choice: ids[0]! }));
      const flips = s.log.filter((l) => /flips a coin for (Molten Sentry|Clone): it comes up (heads|tails)/.test(l.text));
      expect(flips.length).toBe(2);
      expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
      expect(pt(s, ids[0]!)).toBe(/heads/.test(flips[0]!.text) ? "5/2" : "2/5");
      expect(pt(s, ids[1]!)).toBe(/heads/.test(flips[1]!.text) ? "5/2" : "2/5");
      expect(objHasKeyword(s, s.objects[ids[1]!]!, "Haste")).toBe(flips.some((f) => /heads/.test(f.text)));
      expect(objHasKeyword(s, s.objects[ids[1]!]!, "Defender")).toBe(flips.some((f) => /tails/.test(f.text)));
    }
  });

  it("Wargling: attacking while you control a creature with power 4 or greater, it gets +1/+0 and your creatures gain trample", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, wargling());
    const big = putOnBattlefield(s0, ap, ogre);
    const other = putOnBattlefield(s0, ap, bear({ name: "Test Other" }));
    let s = settle(attackWith(passUntil(s0, "main1", ap), [w], opp));
    expect(pt(s, w)).toBe("3/2");
    for (const id of [w, big, other]) expect(objHasKeyword(s, s.objects[id]!, "Trample"), id).toBe(true);
    // Another player's creature doesn't gain it.
    const theirs = putOnBattlefield(s, opp, bear({ name: "Test Theirs" }));
    expect(objHasKeyword(s, s.objects[theirs]!, "Trample")).toBe(false);
  });

  it("Wargling: without a creature with power 4 or greater it doesn't trigger", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, wargling());
    let s = settle(attackWith(passUntil(s0, "main1", ap), [w], opp));
    expect(pt(s, w)).toBe("2/2");
    expect(objHasKeyword(s, s.objects[w]!, "Trample")).toBe(false);
  });

  it("Case the Joint: draw two cards, then look at the top card of each player's library, seen only by you", () => {
    const { s: s0, ap, ids } = setup([caseJoint()]);
    const hand = s0.players[ap]!.hand.length;
    const tops = s0.turnOrder.map((p) => s0.players[p]!.library[2 * Number(p === ap)]!);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    const seen = s.log.filter((l) => /^The top card of .+'s library: /.test(l.text));
    expect(seen.length).toBe(4);
    expect(seen.every((l) => l.to === ap)).toBe(true);
    // The cards stay on top.
    s.turnOrder.forEach((p, i) => expect(s.players[p]!.library[0]).toBe(tops[i]));
  });
});
