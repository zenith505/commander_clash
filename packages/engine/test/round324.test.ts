// Round 324 (Lane A, skip-list cards): split second only while kicked (Molten Disaster); a life floor of 7 while you have 7
// or more life, and a life total that becomes 7 (Elderscale Wurm); the number of different powers among your creatures
// (Celebrate the Harvest); "Sacrifice ~ and another green creature" (Magus of the Order); a creature card of the type
// chosen as it entered put from your hand (Belbe's Portal); tapped creatures that can block (Masako the Humorless); mana
// that makes a multicolored or non-Human creature spell enter with a counter (Guildmages' Forum, Animal Attendant); a
// delayed "next Bird creature spell" counter (Chocobo Camp); "can't be blocked if you had another Cleric, Rogue, Warrior,
// or Wizard enter" (Nimble Trapfinder); "if you attacked with a Hero this turn or a Hero entered" (Avengers Assemble!).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, blockProblem, botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, planActivate, planCast, splitSecondOnStack, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

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
/** Only these permanents of `pid` are untapped. */
const only = (s: GameState, pid: PlayerId, ids: string[]) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && !ids.includes(id)) s.objects[id]!.tapped = true;
};
/** `pid`'s untapped lands named `name`. */
const landsNamed = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && characteristics(s, s.objects[id]!).name === name);
/** A card in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const creature = (name: string, typeLine: string, manaCost: string, extra: Partial<CardDef> = {}) => card(name, typeLine, manaCost, { cmc: 2, power: "2", toughness: "2", ...extra });
const playerT = (id: PlayerId) => ({ kind: "player" as const, id });

// Real oracle text (Scryfall).
const belbe = (): CardDef => ({"oracleId":"46e50ee9-91f8-416e-82fa-f1a76e61fb73","name":"Belbe's Portal","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"As this artifact enters, choose a creature type.\n{3}, {T}: You may put a creature card of the chosen type from your hand onto the battlefield.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/b/fb4eeea1-693e-475c-a209-8a0464df8081.jpg?1783945811","artUrl":"https://cards.scryfall.io/art_crop/front/f/b/fb4eeea1-693e-475c-a209-8a0464df8081.jpg?1783945811","commanderLegal":"legal","set":"nem","releasedAt":"2000-02-14","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const magus = (): CardDef => ({"oracleId":"ff922641-142a-4774-be3e-36a5183fce2b","name":"Magus of the Order","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{G}, {T}, Sacrifice this creature and another green creature: Search your library for a green creature card, put it onto the battlefield, then shuffle.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a93e5fa9-cfe3-487b-af77-0dbf6c68ee04.jpg?1783928789","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a93e5fa9-cfe3-487b-af77-0dbf6c68ee04.jpg?1783928789","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const harvest = (): CardDef => ({"oracleId":"de3764b9-9572-4f5c-8c90-82dedec47557","name":"Celebrate the Harvest","manaCost":"{3}{G}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for up to X basic land cards, where X is the number of different powers among creatures you control. Put those cards onto the battlefield tapped, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/0/70432583-33c1-4d1a-bb94-765f6d71fed3.jpg?1783925375","artUrl":"https://cards.scryfall.io/art_crop/front/7/0/70432583-33c1-4d1a-bb94-765f6d71fed3.jpg?1783925375","commanderLegal":"legal","set":"mic","releasedAt":"2021-09-24","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const molten = (): CardDef => ({"oracleId":"21390513-1ed0-48f2-a7fa-020da8f803c0","name":"Molten Disaster","manaCost":"{X}{R}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Kicker {R} (You may pay an additional {R} as you cast this spell.)\nIf this spell was kicked, it has split second. (As long as this spell is on the stack, players can't cast spells or activate abilities that aren't mana abilities.)\nMolten Disaster deals X damage to each creature without flying and each player.","colors":["R"],"colorIdentity":["R"],"keywords":["Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/3/1/31e0713c-dbf4-4403-ae69-58fd483e2481.jpg?1783943106","artUrl":"https://cards.scryfall.io/art_crop/front/3/1/31e0713c-dbf4-4403-ae69-58fd483e2481.jpg?1783943106","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const wurm = (): CardDef => ({"oracleId":"1e81454a-ce30-4e41-9d09-3256ae30efc2","name":"Elderscale Wurm","manaCost":"{4}{G}{G}{G}","cmc":7,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"Trample\nWhen this creature enters, if your life total is less than 7, your life total becomes 7.\nAs long as you have 7 or more life, damage that would reduce your life total to less than 7 reduces it to 7 instead.","power":"7","toughness":"7","colors":["G"],"colorIdentity":["G"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/2/0/20f3f63d-0f04-4945-9895-940c916a2547.jpg?1783940473","artUrl":"https://cards.scryfall.io/art_crop/front/2/0/20f3f63d-0f04-4945-9895-940c916a2547.jpg?1783940473","commanderLegal":"legal","set":"m13","releasedAt":"2012-07-13","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const masako = (): CardDef => ({"oracleId":"bb9e77c0-eb94-4bba-9b71-1935be280b75","name":"Masako the Humorless","manaCost":"{2}{W}","cmc":3,"typeLine":"Legendary Creature — Human Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Advisor"],"oracleText":"Flash\nTapped creatures you control can block as though they were untapped.","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/d/6/d6b2507f-4035-47d5-8295-0a3773f187fb.jpg?1783944334","artUrl":"https://cards.scryfall.io/art_crop/front/d/6/d6b2507f-4035-47d5-8295-0a3773f187fb.jpg?1783944334","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const attendant = (): CardDef => ({"oracleId":"787e6cc6-d97a-4229-97d1-ec2377d138d3","name":"Animal Attendant","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Human Citizen","supertypes":[],"types":["Creature"],"subtypes":["Human","Citizen"],"oracleText":"{T}: Add one mana of any color. If that mana is spent to cast a non-Human creature spell, that creature enters with an additional +1/+1 counter on it.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/a/3/a3e6ff4d-bf7d-488f-a02f-f40e7f8761ca.jpg?1783904817","artUrl":"https://cards.scryfall.io/art_crop/front/a/3/a3e6ff4d-bf7d-488f-a02f-f40e7f8761ca.jpg?1783904817","commanderLegal":"legal","set":"tle","releasedAt":"2025-11-21","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const forum = (): CardDef => ({"oracleId":"ace6403d-9fac-4d0f-a6ea-eb2ff3da259d","name":"Guildmages' Forum","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}: Add one mana of any color. If that mana is spent on a multicolored creature spell, that creature enters with an additional +1/+1 counter on it.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","C","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/c/b/cba12bda-d460-4206-8469-4357c967b9b8.jpg?1783934102","artUrl":"https://cards.scryfall.io/art_crop/front/c/b/cba12bda-d460-4206-8469-4357c967b9b8.jpg?1783934102","commanderLegal":"legal","set":"grn","releasedAt":"2018-10-05","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const camp = (): CardDef => ({"oracleId":"ed77fdf2-59c0-4310-9b12-80d28beeaeef","name":"Chocobo Camp","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"This land enters tapped unless you control a legendary creature.\n{T}: Add {G}. When you next cast a Bird creature spell this turn, it enters with an additional +1/+1 counter on it.\n{2}{G}{G}, {T}: Create a 2/2 green Bird creature token with \"Whenever a land you control enters, this token gets +1/+0 until end of turn.\"","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fcd08ad-4dac-4236-9030-f59e473b3ec7.jpg?1783904649","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fcd08ad-4dac-4236-9030-f59e473b3ec7.jpg?1783904649","commanderLegal":"legal","set":"fic","releasedAt":"2025-12-05","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const trapfinder = (): CardDef => ({"oracleId":"e95a9488-3f86-4598-9c6e-6b1b959f8570","name":"Nimble Trapfinder","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Human Rogue","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"This creature can't be blocked if you had another Cleric, Rogue, Warrior, or Wizard enter the battlefield under your control this turn.\nAt the beginning of combat on your turn, if you have a full party, creatures you control gain \"Whenever this creature deals combat damage to a player, draw a card\" until end of turn.","power":"2","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/e/1ee1a550-b7e7-48e0-bd96-a41986dbd879.jpg?1783929391","artUrl":"https://cards.scryfall.io/art_crop/front/1/e/1ee1a550-b7e7-48e0-bd96-a41986dbd879.jpg?1783929391","commanderLegal":"legal","set":"znr","releasedAt":"2020-09-25","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const avengers = (): CardDef => ({"oracleId":"3477e1cc-46af-46f4-9ea2-bdf0bf1f880e","name":"Avengers Assemble!","manaCost":"{4}{W}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Flash\nHeroes you control get +2/+2.\nAt the beginning of each end step, if you attacked with a Hero this turn or a Hero entered the battlefield under your control this turn, draw a card.","colors":["W"],"colorIdentity":["W"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bf736399-af74-4f52-9159-67ea67d0cf83.jpg?1783902981","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bf736399-af74-4f52-9159-67ea67d0cf83.jpg?1783902981","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);

const shock = card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." });
const shockAt = (s0: GameState, pid: PlayerId, id: string, to: PlayerId) => settle(run(s0, planCast(s0, pid, id, [playerT(to)])), pid);

describe("round 324", () => {
  it("are fully supported", () => supported(belbe(), magus(), harvest(), molten(), wurm(), masako(), attendant(), forum(), camp(), trapfinder(), avengers()));
});

describe("round 324: Molten Disaster", () => {
  it("kicked, it has split second while it's on the stack; X damage to each creature without flying and each player", () => {
    const { s: s0, ap, opp, ids } = setup([molten()]);
    const flier = putOnBattlefield(s0, opp, creature("Sky Bird", "Creature — Bird", "{1}{U}", { keywords: ["Flying"], oracleText: "Flying" }));
    const walker = putOnBattlefield(s0, opp, creature("Ground Bear", "Creature — Bear", "{1}{G}"));
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2, { kicks: [0] }));
    expect(s.stack.at(-1)?.kind).toBe("spell");
    expect(splitSecondOnStack(s)).toBe(true);
    s = settle(s, ap);
    expect(splitSecondOnStack(s)).toBe(false);
    expect(s.objects[walker]!.zone).toBe("graveyard");
    expect(s.objects[flier]!.zone).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(38);
    expect(s.players[opp]!.life).toBe(38);
  });

  it("unkicked, no split second", () => {
    const { s: s0, ap, ids } = setup([molten()]);
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 1));
    expect(s.stack.at(-1)?.kind).toBe("spell");
    expect(splitSecondOnStack(s)).toBe(false);
  });
});

describe("round 324: Elderscale Wurm", () => {
  it("as it enters, a life total below 7 becomes 7; 7 or more stays", () => {
    const low = setup([wurm()]);
    low.s.players[low.ap]!.life = 5;
    const s = settle(run(low.s, planCast(low.s, low.ap, low.ids[0]!)), low.ap);
    expect(s.battlefield.some((id) => s.objects[id]!.cardId === wurm().oracleId)).toBe(true);
    expect(s.players[low.ap]!.life).toBe(7);
    const high = setup([wurm()]);
    high.s.players[high.ap]!.life = 10;
    const t = settle(run(high.s, planCast(high.s, high.ap, high.ids[0]!)), high.ap);
    expect(t.players[high.ap]!.life).toBe(10);
  });

  it("with 7 or more life, damage that would bring you below 7 brings you to 7; below 7, it reduces your life as normal (rulings)", () => {
    const { s: s0, ap, ids } = setup([shock, shock, shock]);
    putOnBattlefield(s0, ap, wurm());
    s0.players[ap]!.life = 8;
    let s = shockAt(s0, ap, ids[0]!, ap);
    expect(s.players[ap]!.life).toBe(7);
    s = shockAt(s, ap, ids[1]!, ap);
    expect(s.players[ap]!.life).toBe(7);
    s.players[ap]!.life = 6;
    s = shockAt(s, ap, ids[2]!, ap);
    expect(s.players[ap]!.life).toBe(4);
  });
});

describe("round 324: Celebrate the Harvest", () => {
  it("up to X basic lands, X the number of different powers among creatures you control as it resolves", () => {
    const { s: s0, ap, ids } = setup([harvest()]);
    putOnBattlefield(s0, ap, creature("Bear A", "Creature — Bear", "{1}{G}"));
    putOnBattlefield(s0, ap, creature("Bear B", "Creature — Bear", "{1}{G}"));
    putOnBattlefield(s0, ap, creature("Ox", "Creature — Ox", "{3}{G}", { power: "3", toughness: "3" }));
    putOnBattlefield(s0, ap, creature("Wall", "Creature — Wall", "{1}{G}", { power: "0", toughness: "4" }));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 3 });
    const pick = (s.pending as { cards: string[] }).cards.slice(0, 3);
    const t = settle(act(s, { type: "searchLibrary", player: ap, found: pick }), ap);
    for (const id of pick) expect(t.objects[id]).toMatchObject({ zone: "battlefield", tapped: true });
  });
});

describe("round 324: Magus of the Order", () => {
  it("sacrifices itself and another green creature, then searches for a green creature card onto the battlefield", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, magus());
    const green = putOnBattlefield(s0, ap, creature("Green Bear", "Creature — Bear", "{1}{G}"));
    const red = putOnBattlefield(s0, ap, creature("Red Bear", "Creature — Bear", "{1}{R}"));
    expect(planActivate(s0, ap, m, 0, undefined, undefined, undefined, undefined, { sacrifice: [red] })).toBeNull();
    expect(planActivate(s0, ap, m, 0, undefined, undefined, undefined, undefined, { sacrifice: [m] })).toBeNull();
    let s = run(s0, planActivate(s0, ap, m, 0, undefined, undefined, undefined, undefined, { sacrifice: [green] }));
    expect(s.objects[m]!.zone).toBe("graveyard");
    expect(s.objects[green]!.zone).toBe("graveyard");
    expect(s.objects[red]!.zone).toBe("battlefield");
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1 });
    const found = (s.pending as { cards: string[] }).cards[0]!;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [found] }), ap);
    expect(s.objects[found]!.zone).toBe("battlefield");
  });
});

describe("round 324: Belbe's Portal", () => {
  it("puts a creature card of the type chosen as it entered from your hand onto the battlefield, or none", () => {
    const { s: s0, ap } = setup([]);
    const portal = putOnBattlefield(s0, ap, belbe());
    s0.objects[portal]!.chosen = { type: "Elf" };
    const elf = inHand(s0, ap, creature("Llanowar Scout", "Creature — Elf Scout", "{G}"));
    const bear = inHand(s0, ap, creature("Hand Bear", "Creature — Bear", "{1}{G}"));
    let s = settle(run(s0, planActivate(s0, ap, portal, 0)), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1, cards: [elf] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [elf] }), ap);
    expect(s.objects[elf]!.zone).toBe("battlefield");
    expect(s.objects[bear]!.zone).toBe("hand");
  });

  it("with no type chosen, nothing fits; it needs its choice as it entered", () => {
    const { s: s0, ap } = setup([]);
    const portal = putOnBattlefield(s0, ap, belbe());
    inHand(s0, ap, creature("Hand Bear", "Creature — Bear", "{1}{G}"));
    const s = settle(run(s0, planActivate(s0, ap, portal, 0)), ap);
    expect(s.pending).toBeNull();
    const noChoice = { ...belbe(), oracleId: "belbe-no-choice", oracleText: "{3}, {T}: You may put a creature card of the chosen type from your hand onto the battlefield." };
    expect(compileCard(noChoice).unsupported.length).toBeGreaterThan(0);
  });

  it("a bot doesn't activate it without a card of the chosen type in hand", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    s0.players[ap]!.command = [];
    const portal = putOnBattlefield(s0, ap, belbe());
    s0.objects[portal]!.chosen = { type: "Elf" };
    inHand(s0, ap, creature("Hand Bear", "Creature — Bear", "{5}{G}{G}{G}{G}{G}{G}{G}{G}{G}", { cmc: 15 }));
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === portal)).toBe(false);
  });
});

describe("round 324: Masako the Humorless", () => {
  const attack = (withMasako: boolean, flying = false) => {
    const { s: s0, ap, opp } = setup([]);
    const at = putOnBattlefield(s0, ap, creature("Attacker", "Creature — Bear", "{1}{G}", flying ? { keywords: ["Flying"], oracleText: "Flying" } : {}));
    const b = putOnBattlefield(s0, opp, creature("Tired Guard", "Creature — Soldier", "{1}{W}", { power: "3", toughness: "3" }));
    s0.objects[b]!.tapped = true;
    if (withMasako) putOnBattlefield(s0, opp, masako());
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers");
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: at, defender: opp }] }), opp);
    while (!(s.pending?.kind === "declareBlockers" && s.pending.player === opp)) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, opp, at, b };
  };

  it("your tapped creatures can block as though they were untapped; it stays tapped and deals its damage", () => {
    const { s: s0, opp, at, b } = attack(true);
    expect(blockProblem(s0, s0.objects[b]!, s0.objects[at]!)).toBeNull();
    const s = passUntil(act(s0, { type: "declareBlockers", player: opp, blocks: [{ blocker: b, attacker: at }] }), "endCombat");
    expect(s.objects[at]!.zone).toBe("graveyard");
    expect(s.objects[b]).toMatchObject({ zone: "battlefield", tapped: true });
  });

  it("without it a tapped creature can't block; with it the other restrictions still apply (rulings)", () => {
    const plain = attack(false);
    expect(blockProblem(plain.s, plain.s.objects[plain.b]!, plain.s.objects[plain.at]!)).toMatch(/can't block/);
    expect(() => act(plain.s, { type: "declareBlockers", player: plain.opp, blocks: [{ blocker: plain.b, attacker: plain.at }] })).toThrow();
    const fly = attack(true, true);
    expect(blockProblem(fly.s, fly.s.objects[fly.b]!, fly.s.objects[fly.at]!)).not.toBeNull();
  });

  it("a bot blocks with a tapped creature under it", () => {
    const { s: s0, opp, at, b } = attack(true);
    const blocks = botActions(s0, opp)[0]!;
    expect(blocks).toMatchObject({ type: "declareBlockers", blocks: [{ blocker: b, attacker: at }] });
  });
});

describe("round 324: mana that adds a +1/+1 counter", () => {
  const bird = creature("Little Bird", "Creature — Bird", "{1}{G}");
  it("Animal Attendant: a non-Human creature spell its mana is spent on enters with a counter; a Human doesn't", () => {
    const { s: s0, ap, ids } = setup([creature("Hand Bear", "Creature — Bear", "{G}", { cmc: 1 }), creature("Farmer", "Creature — Human Peasant", "{G}", { cmc: 1 })]);
    const a = putOnBattlefield(s0, ap, attendant());
    only(s0, ap, [a]);
    let s = act(s0, { type: "activateMana", player: ap, objectId: a, mana: "G" });
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    s.objects[a]!.tapped = false;
    s = act(s, { type: "activateMana", player: ap, objectId: a, mana: "G" });
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Animal Attendant: a changeling is a Human, so no counter (CR 702.73a)", () => {
    const { s: s0, ap, ids } = setup([creature("Shapeshifter", "Creature — Shapeshifter", "{G}", { cmc: 1, keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" })]);
    const a = putOnBattlefield(s0, ap, attendant());
    only(s0, ap, [a]);
    let s = act(s0, { type: "activateMana", player: ap, objectId: a, mana: "G" });
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Guildmages' Forum: only a multicolored creature spell gets the counter", () => {
    const { s: s0, ap, ids } = setup([creature("Gold Bear", "Creature — Bear", "{G}{W}", { cmc: 2 }), creature("Green Bear", "Creature — Bear", "{G}{G}", { cmc: 2 })]);
    const f = putOnBattlefield(s0, ap, forum());
    const plains = landsNamed(s0, ap, "Plains")[0]!;
    const forests = landsNamed(s0, ap, "Forest");
    only(s0, ap, [f, plains, forests[0]!]);
    s0.players[ap]!.manaPool.C = 1;
    let s = act(s0, { type: "activateMana", player: ap, objectId: f, mana: "G", index: 1 } as Action);
    expect(s.players[ap]!.manaPool.G).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    s.objects[f]!.tapped = false;
    s.objects[forests[1]!]!.tapped = false;
    s.players[ap]!.manaPool.C = 1;
    s = act(s, { type: "activateMana", player: ap, objectId: f, mana: "G", index: 1 } as Action);
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Chocobo Camp: the next Bird creature spell you cast this turn enters with a counter, whatever mana it's cast with", () => {
    const { s: s0, ap, ids } = setup([creature("Hand Bear", "Creature — Bear", "{1}{G}"), bird, creature("Second Bird", "Creature — Bird", "{1}{G}")]);
    const c = putOnBattlefield(s0, ap, camp());
    let s = act(s0, { type: "activateMana", player: ap, objectId: c, mana: "G" });
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(1);
    // Used up by that Bird.
    s = settle(run(s, planCast(s, ap, ids[2]!)), ap);
    expect(s.objects[ids[2]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[2]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("round 324: Nimble Trapfinder", () => {
  it("can't be blocked once another Cleric, Rogue, Warrior, or Wizard entered under your control this turn, a changeling too", () => {
    for (const extra of [creature("Apprentice", "Creature — Human Wizard", "{1}{U}"), creature("Shapeshifter", "Creature — Shapeshifter", "{1}{U}", { keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" })]) {
      const { s: s0, ap, opp, ids } = setup([extra]);
      const t = putOnBattlefield(s0, ap, trapfinder());
      const guard = putOnBattlefield(s0, opp, creature("Guard", "Creature — Soldier", "{1}{W}"));
      expect(blockProblem(s0, s0.objects[guard]!, s0.objects[t]!, opp)).toBeNull();
      const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
      expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
      expect(blockProblem(s, s.objects[guard]!, s.objects[t]!, opp)).toMatch(/can't be blocked/);
    }
  });

  it("not for itself entering, nor a creature of another type", () => {
    const { s: s0, ap, opp, ids } = setup([trapfinder(), creature("Hand Bear", "Creature — Bear", "{1}{G}")]);
    const guard = putOnBattlefield(s0, opp, creature("Guard", "Creature — Soldier", "{1}{W}"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    expect(blockProblem(s, s.objects[guard]!, s.objects[ids[0]!]!, opp)).toBeNull();
  });
});

describe("round 324: Avengers Assemble!", () => {
  const hero = () => creature("Sidekick", "Creature — Human Hero", "{1}{W}");
  const endDraws = (s0: GameState, ap: PlayerId) => {
    const hand = s0.players[ap]!.hand.length;
    let s = passUntil(s0, "end");
    s = settle(s, ap);
    return s.players[ap]!.hand.length - hand;
  };

  it("at the end step, a card if a Hero entered under your control this turn", () => {
    const { s: s0, ap, ids } = setup([hero()]);
    putOnBattlefield(s0, ap, avengers());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(endDraws(s, ap)).toBe(1);
  });

  it("or if you attacked with a Hero this turn; otherwise nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, avengers());
    const h = putOnBattlefield(s0, ap, hero());
    expect(endDraws(s0, ap)).toBe(0);
    const again = setup([]);
    putOnBattlefield(again.s, again.ap, avengers());
    const h2 = putOnBattlefield(again.s, again.ap, hero());
    let s = passUntil(again.s, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: again.ap, attacks: [{ attacker: h2, defender: again.opp }] });
    expect(endDraws(s, again.ap)).toBe(1);
    void h;
    void opp;
  });
});
