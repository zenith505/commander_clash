// Lane B, round 65: unsupported cards no earlier round wrote down, from EDHREC rank about 19,700 up, least played first
// (`npm run popular -- --least`).


import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, botActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering choices as the bots would; the choices a test makes stop it. */
const settle = (s: GameState, stopAt: (s: GameState) => boolean = () => false) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (stopAt(s)) break;
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Plays on (no attacks or blocks unless asked, the bots answering other questions) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const at = (kind: string, pid: PlayerId) => (s: GameState) => s.pending?.kind === kind && s.pending.player === pid;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const spell = (s: GameState, id: string): TargetChoice => ({ kind: "stack", id: s.stack.find((x) => x.objectId === id)!.id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}, x?: number) => run(s, planCast(s, pid, id, targets, undefined, undefined, x, choices));
/** Moves a new card for `def` into `pid`'s hand, library (on top) or graveyard. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Leaves only `keep` in `pid`'s hand (setup's hand also holds the seven cards drawn). */
const onlyHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((id) => !keep.includes(id))) {
    s.objects[id]!.zone = "exile";
    p.exile.push(id);
  }
  p.hand = p.hand.filter((id) => keep.includes(id));
};
const counters = (s: GameState, id: string, kind = "+1/+1") => s.objects[id]!.counters?.[kind] ?? 0;
/** Answers each "may" with `yes(prompt)`, the bots answering other questions, until the stack is empty. */
const settleMay = (s: GameState, pid: PlayerId, yes: (prompt: string) => boolean) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay" && p.player === pid) s = act(s, { type: "chooseMay", player: pid, yes: yes(p.prompt) });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
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
const tokensNamed = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && nameOf(s, id).replace(/ Token$/, "") === name);
const defOfTest = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]! as CardDef;
const kw = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords;

// Real oracle text (Scryfall).

const feldon = (): CardDef => ({"oracleId":"76c97e3d-a9be-4ed7-a2ef-f97870d8f58a","name":"Feldon, Ronom Excavator","manaCost":"{1}{R}","cmc":2,"typeLine":"Legendary Creature — Human Artificer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Artificer"],"oracleText":"Haste\nFeldon can't block.\nWhenever Feldon is dealt damage, exile that many cards from the top of your library. Choose one of them. Until the end of your next turn, you may play that card.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"set":"bro","releasedAt":"2022-11-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fury = (): CardDef => ({"oracleId":"e5f83bfc-ff74-4bb9-82c8-a07fedc6e916","name":"Fire Giant's Fury","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target Giant you control gets +2/+2 and gains trample until end of turn. Whenever it deals combat damage to a player this turn, exile that many cards from the top of your library. Until the end of your next turn, you may play those cards.","colors":["R"],"colorIdentity":["R"],"keywords":[],"set":"khm","releasedAt":"2021-02-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const rotisserie = (): CardDef => ({"oracleId":"e33c1744-843f-438f-a8c3-2d9f60120776","name":"Rotisserie Elemental","manaCost":"{R}","cmc":1,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"Menace\nWhenever this creature deals combat damage to a player, put a skewer counter on this creature. Then you may sacrifice it. If you do, exile the top X cards of your library, where X is the number of skewer counters on this creature. You may play those cards this turn.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Menace"],"set":"woe","releasedAt":"2023-09-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const carah = (): CardDef => ({"oracleId":"c3da0550-b816-4aed-8174-ddde199b6589","name":"Syr Carah, the Bold","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Legendary Creature — Human Knight","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"Whenever Syr Carah or an instant or sorcery spell you control deals damage to a player, exile the top card of your library. You may play that card this turn.\n{T}: Syr Carah deals 1 damage to any target.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"set":"eld","releasedAt":"2019-10-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const seifer = (): CardDef => ({"oracleId":"417b9d9c-0a67-4554-a275-a6ae15a04bfb","name":"Seifer, Balamb Rival","manaCost":"{2}{B}{R}","cmc":4,"typeLine":"Legendary Creature — Human Mercenary","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Mercenary"],"oracleText":"First strike\nWhenever you attack a player, goad target creature that player controls.\nWhenever a creature attacking one of your opponents becomes blocked by two or more creatures, that attacking creature gains deathtouch until end of turn.","power":"4","toughness":"3","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Goad","First strike"],"set":"fic","releasedAt":"2025-12-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mazzy = (): CardDef => ({"oracleId":"9fa75b3c-a512-4318-9c03-e2d958acb6ef","name":"Mazzy, Truesword Paladin","manaCost":"{1}{R}{G}{W}","cmc":4,"typeLine":"Legendary Creature — Halfling Knight","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Halfling","Knight"],"oracleText":"Whenever an enchanted creature attacks one of your opponents, it gets +2/+0 and gains trample until end of turn.\nWhenever an Aura you control is put into your graveyard from the battlefield, exile it. Until the end of your next turn, you may cast that card.","power":"3","toughness":"4","colors":["G","R","W"],"colorIdentity":["G","R","W"],"keywords":[],"set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tamiyo = (): CardDef => ({"oracleId":"8e0f2e26-1e14-422a-aafe-e1da38ab10a3","name":"Tamiyo, Upriser Crowned","manaCost":"{4}{R}{W}","cmc":6,"typeLine":"Legendary Creature — Moonfolk Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Moonfolk","Warrior"],"oracleText":"Flying, double strike, haste\nWhen Tamiyo enters, you become the monarch.\nWhenever one or more creatures deal combat damage to you while you're the monarch, tap those creatures and put a stun counter on each of them.","power":"3","toughness":"5","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Flying","Haste","Double strike"],"set":"frc","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const borbo = (): CardDef => ({"oracleId":"22d9eef5-0f86-4d1a-bde0-65b990d4be75","name":"Borborygmos and Fblthp","manaCost":"{2}{G}{U}{R}","cmc":5,"typeLine":"Legendary Creature — Cyclops Homunculus","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Cyclops","Homunculus"],"oracleText":"Whenever Borborygmos and Fblthp enters or attacks, draw a card, then you may discard any number of land cards. When you discard one or more cards this way, Borborygmos and Fblthp deals twice that much damage to target creature.\n{1}{U}: Put Borborygmos and Fblthp into its owner's library third from the top.","power":"6","toughness":"5","colors":["G","R","U"],"colorIdentity":["G","R","U"],"keywords":[],"set":"mom","releasedAt":"2023-04-21","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const immard = (): CardDef => ({"oracleId":"104f65d3-bedb-4dc5-a5dd-8ab9fe796af4","name":"Immard, the Stormcleaver","manaCost":"{1}{U}{R}{W}","cmc":4,"typeLine":"Legendary Creature — Human Soldier","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Whenever Immard, the Stormcleaver enters or attacks, put a charge counter on it or remove one from it. When you remove a counter this way, choose one —\n• Immard deals 4 damage to any target.\n• Immard gains lifelink and indestructible until end of turn.","power":"4","toughness":"4","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":[],"set":"slx","releasedAt":"2023-02-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const surfer = (): CardDef => ({"oracleId":"3ce1f550-d044-4cb1-991b-e98449f74507","name":"Silver Surfer, Cosmic Voyager","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Legendary Creature — Alien Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Alien","Hero"],"oracleText":"Flash\nFlying\nWhen Silver Surfer enters, exile any number of other target permanents you control. Return those cards to the battlefield under their owner's control at the beginning of the next end step. If a land enters this way, it enters tapped.","power":"5","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Flash"],"set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gyrus = (): CardDef => ({"oracleId":"2deae472-3cfe-4d7b-b9cf-a045f07a002e","name":"Gyrus, Waker of Corpses","manaCost":"{X}{B}{R}{G}","cmc":3,"typeLine":"Legendary Creature — Hydra","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Hydra"],"oracleText":"Gyrus enters with a number of +1/+1 counters on it equal to the amount of mana spent to cast it.\nWhenever Gyrus attacks, you may exile target creature card with lesser power from your graveyard. If you do, create a token that's a copy of that card and that's tapped and attacking. Exile the token at end of combat.","power":"0","toughness":"0","colors":["B","G","R"],"colorIdentity":["B","G","R"],"keywords":[],"set":"c18","releasedAt":"2018-08-10","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const ellie = (): CardDef => ({"oracleId":"0f4d513e-100d-4cbb-b919-09249cef5fad","name":"Ellie and Alan, Paleontologists","manaCost":"{2}{G}{W}{U}","cmc":5,"typeLine":"Legendary Creature — Human Scientist","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scientist"],"oracleText":"{T}, Exile a creature card from your graveyard: Discover X, where X is the mana value of the exiled card. Activate only as a sorcery. (Exile cards from the top of your library until you exile a nonland card with that mana value or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)","power":"2","toughness":"5","colors":["G","U","W"],"colorIdentity":["G","U","W"],"keywords":["Discover"],"set":"rex","releasedAt":"2023-11-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hollow = (): CardDef => ({"oracleId":"b9e4d34a-ba91-4ad6-b886-daeeda6c9498","name":"Hollow One","manaCost":"{5}","cmc":5,"typeLine":"Artifact Creature — Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"This spell costs {2} less to cast for each card you've cycled or discarded this turn.\nCycling {2} ({2}, Discard this card: Draw a card.)","power":"4","toughness":"4","colors":[],"colorIdentity":[],"keywords":["Cycling"],"set":"hou","releasedAt":"2017-07-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const trash = (): CardDef => ({"oracleId":"e07700e7-218a-45a3-9ee4-de2cc25cdc02","name":"Take Out the Trash","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Take Out the Trash deals 3 damage to target creature or planeswalker. If you control a Raccoon, you may discard a card. If you do, draw a card.","colors":["R"],"colorIdentity":["R"],"keywords":[],"set":"blb","releasedAt":"2024-08-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bearC = (name = "Plain Bear", p = 2, t = 2, extra: Partial<CardDef> = {}) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t, { colors: ["G"], ...extra });
const bolt = (name = "Test Bolt", n = 3) => card(name, "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: `${name} deals ${n} damage to any target.` });
const wreck = (name = "Test Wreck") => card(name, "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Destroy target creature." });
const aura = (name = "Test Aura") => card(name, "Enchantment — Aura", "{W}", { cmc: 1, colors: ["W"], oracleText: "Enchant creature\nEnchanted creature gets +1/+0." });
const rock = (name: string) => card(name, "Artifact", "{1}", { cmc: 1 });
const mayPlay = (s: GameState, id: string) => s.objects[id]!.mayPlay;
/** Puts `n` new test cards on top of `pid`'s library, the first one on top. */
const stack = (s: GameState, pid: PlayerId, defs: CardDef[]) => [...defs].reverse().map((d) => toZone(s, pid, d, "library")).reverse();
/** Plays on to `pid`'s declare blockers with these attacks, then blocks as given. */
const attackAndBlock = (s0: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], blocker: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  let s = goUntil(s0, at("declareAttackers", ap));
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  s = goUntil(s, at("declareBlockers", blocker));
  return act(s, { type: "declareBlockers", player: blocker, blocks } as Action);
};

describe("Lane B round 65", () => {
  it("are fully supported", () => {
    supported(feldon(), fury(), rotisserie(), carah(), seifer(), mazzy(), tamiyo(), borbo(), immard(), surfer(), gyrus(), ellie(), hollow(), trash());
  });

  it("Feldon, Ronom Excavator: dealt damage, exiles that many cards and only the chosen one may be played until the end of your next turn", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, feldon());
    s0.objects[f]!.counters["+1/+1"] = 2;
    const [c1, c2, c3] = stack(s0, ap, [rock("Rock One"), rock("Rock Two"), rock("Rock Three")]);
    const b = toZone(s0, ap, bolt("Test Bolt", 2), "hand");
    let s = settle(castNow(s0, ap, b, [tgt(f)]), at("chooseOption", ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "impulseChoice" });
    expect(zone(s, c1!)).toBe("exile");
    expect(zone(s, c2!)).toBe("exile");
    expect(zone(s, c3!)).toBe("library");
    s = act(s, { type: "chooseOption", player: ap, choice: c2! });
    s = settle(s);
    expect(mayPlay(s, c2!)?.until).toBe("nextTurn");
    expect(mayPlay(s, c1!)).toBeUndefined();
  });

  it("Fire Giant's Fury: +2/+2 and trample, and combat damage to a player exiles that many cards you may play until the end of your next turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, vanilla("Test Giant", "Creature — Giant", "{2}{R}", 3, 2, 2, { colors: ["R"] }));
    const top = stack(s0, ap, [rock("Rock A"), rock("Rock B"), rock("Rock C"), rock("Rock D"), rock("Rock E")]);
    const f = toZone(s0, ap, fury(), "hand");
    let s = settle(castNow(s0, ap, f, [tgt(g)]));
    expect(pt(s, g)).toBe("4/4");
    expect(kw(s, g)).toContain("Trample");
    s = attackAndBlock(s, ap, [{ attacker: g, defender: opp }], opp, []);
    s = goUntil(s, (x) => x.step === "main2");
    s = settle(s);
    expect(top.slice(0, 4).map((id) => zone(s, id))).toEqual(["exile", "exile", "exile", "exile"]);
    expect(zone(s, top[4]!)).toBe("library");
    expect(top.slice(0, 4).every((id) => mayPlay(s, id)?.until === "nextTurn")).toBe(true);
  });

  it("Rotisserie Elemental: a skewer counter, and if you sacrifice it, exile the top cards for each skewer counter it had", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rotisserie());
    s0.objects[r]!.counters.skewer = 2;
    const top = stack(s0, ap, [rock("Rock A"), rock("Rock B"), rock("Rock C"), rock("Rock D")]);
    let s = attackAndBlock(s0, ap, [{ attacker: r, defender: opp }], opp, []);
    s = goUntil(s, (x) => x.pending?.kind === "chooseMay" && x.pending.player === ap);
    expect(counters(s, r, "skewer")).toBe(3);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s);
    expect(zone(s, r)).toBe("graveyard");
    expect(top.slice(0, 3).every((id) => zone(s, id) === "exile" && mayPlay(s, id)?.until === "thisTurn")).toBe(true);
    expect(zone(s, top[3]!)).toBe("library");
  });

  it("Rotisserie Elemental: not sacrificed, it keeps its counter and nothing is exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rotisserie());
    const top = stack(s0, ap, [rock("Rock A")]);
    let s = attackAndBlock(s0, ap, [{ attacker: r, defender: opp }], opp, []);
    s = goUntil(s, (x) => x.pending?.kind === "chooseMay" && x.pending.player === ap);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s);
    expect(zone(s, r)).toBe("battlefield");
    expect(counters(s, r, "skewer")).toBe(1);
    expect(zone(s, top[0]!)).toBe("library");
  });

  it("Syr Carah, the Bold: damage to a player by it or by your instant exiles the top card to play this turn; damage to a creature doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, carah());
    const bear = putOnBattlefield(s0, opp, bearC("Their Bear", 2, 5));
    const top = stack(s0, ap, [rock("Rock A"), rock("Rock B"), rock("Rock C")]);
    // Its own ability, at an opponent.
    let s = settle(run(s0, planActivate(s0, ap, c, 0, [ply(opp)])));
    expect(zone(s, top[0]!)).toBe("exile");
    expect(mayPlay(s, top[0]!)?.until).toBe("thisTurn");
    // An instant at a creature: no trigger.
    const b1 = toZone(s, ap, bolt("Bolt One", 1), "hand");
    s = settle(castNow(s, ap, b1, [tgt(bear)]));
    expect(zone(s, top[1]!)).toBe("library");
    // An instant at you: any player.
    const b2 = toZone(s, ap, bolt("Bolt Two", 1), "hand");
    s = settle(castNow(s, ap, b2, [ply(ap)]));
    expect(zone(s, top[1]!)).toBe("exile");
    expect(mayPlay(s, top[1]!)?.until).toBe("thisTurn");
  });

  it("Seifer, Balamb Rival: a creature attacking an opponent that's blocked by two or more creatures gains deathtouch; by one, it doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, seifer());
    const a1 = putOnBattlefield(s0, ap, bearC("Bear One", 2, 9));
    const a2 = putOnBattlefield(s0, ap, bearC("Bear Two", 2, 9));
    const [x1, x2, x3] = [putOnBattlefield(s0, opp, bearC("Wall One", 0, 9)), putOnBattlefield(s0, opp, bearC("Wall Two", 0, 9)), putOnBattlefield(s0, opp, bearC("Wall Three", 0, 9))];
    let s = attackAndBlock(s0, ap, [{ attacker: a1, defender: opp }, { attacker: a2, defender: opp }], opp, [{ blocker: x1!, attacker: a1 }, { blocker: x2!, attacker: a1 }, { blocker: x3!, attacker: a2 }]);
    s = settle(s);
    expect(kw(s, a1)).toContain("Deathtouch");
    expect(kw(s, a2)).not.toContain("Deathtouch");
  });

  it("Mazzy, Truesword Paladin: an Aura you own and control put into your graveyard is exiled, castable until the end of your next turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, mazzy());
    const host = putOnBattlefield(s0, ap, bearC("Host Bear"));
    const a = putOnBattlefield(s0, ap, aura());
    s0.objects[a]!.attachedTo = host;
    invalidateCharacteristics(s0);
    const w = toZone(s0, ap, wreck(), "hand");
    const s = settle(castNow(s0, ap, w, [tgt(host)]));
    expect(zone(s, a)).toBe("exile");
    expect(mayPlay(s, a)).toMatchObject({ player: ap, until: "nextTurn", castOnly: true });
  });

  it("Tamiyo, Upriser Crowned: creatures that deal combat damage to you while you're the monarch are tapped and get a stun counter", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, tamiyo());
    s0.monarch = ap;
    const v = putOnBattlefield(s0, opp, bearC("Watch Bear", 2, 2, { oracleText: "Vigilance", keywords: ["Vigilance"] }));
    let s = goUntil(s0, at("declareAttackers", opp));
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: v, defender: ap }] });
    s = goUntil(s, (x) => x.step === "main2");
    s = settle(s);
    expect(s.objects[v]!.tapped).toBe(true);
    expect(counters(s, v, "stun")).toBe(1);
    // The monarch moved to the attacker's controller.
    expect(s.monarch).toBe(opp);
  });

  it("Tamiyo, Upriser Crowned: not while someone else is the monarch", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, tamiyo());
    s0.monarch = opp;
    const v = putOnBattlefield(s0, opp, bearC("Watch Bear", 2, 2, { oracleText: "Vigilance", keywords: ["Vigilance"] }));
    let s = goUntil(s0, at("declareAttackers", opp));
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: v, defender: ap }] });
    s = goUntil(s, (x) => x.step === "main2");
    s = settle(s);
    expect(s.objects[v]!.tapped).toBe(false);
    expect(counters(s, v, "stun")).toBe(0);
  });

  it("Borborygmos and Fblthp: draw, then discard any number of lands; twice that much damage to a target creature chosen after", () => {
    const { s: s0, ap, opp } = setup([]);
    const big = putOnBattlefield(s0, opp, bearC("Big Bear", 2, 9));
    const bo = toZone(s0, ap, borbo(), "hand");
    const l1 = toZone(s0, ap, card("Test Waste One", "Land", ""), "hand");
    const l2 = toZone(s0, ap, card("Test Waste Two", "Land", ""), "hand");
    const spellCard = toZone(s0, ap, bolt(), "hand");
    onlyHand(s0, ap, [bo, l1, l2, spellCard]);
    poolOnly(s0, ap, { G: 1, U: 1, R: 1, C: 2 });
    let s = settle(castNow(s0, ap, bo), at("discard", ap));
    expect(s.pending).toMatchObject({ kind: "discard", upTo: true });
    // Only land cards.
    expect(() => act(s, { type: "discard", player: ap, objectIds: [spellCard] })).toThrow();
    s = act(s, { type: "discard", player: ap, objectIds: [l1, l2] });
    s = settle(s, at("chooseTargets", ap));
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(big)] });
    s = settle(s);
    expect(s.objects[big]!.damage).toBe(4);
  });

  it("Borborygmos and Fblthp: discarding nothing, no damage and no target", () => {
    const { s: s0, ap } = setup([]);
    const bo = toZone(s0, ap, borbo(), "hand");
    onlyHand(s0, ap, [bo]);
    poolOnly(s0, ap, { G: 1, U: 1, R: 1, C: 2 });
    let s = settle(castNow(s0, ap, bo), (x) => at("discard", ap)(x) || at("chooseTargets", ap)(x));
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: [] });
    s = settle(s, at("chooseTargets", ap));
    expect(s.pending).toBeFalsy();
  });

  it("Immard, the Stormcleaver: with no charge counter it puts one on; later you may remove it to choose a mode", () => {
    const { s: s0, ap, opp } = setup([]);
    const im = toZone(s0, ap, immard(), "hand");
    poolOnly(s0, ap, { U: 1, R: 1, W: 1, C: 1 });
    let s = settle(castNow(s0, ap, im));
    // No counter to remove: putting one on is the only choice (CR 608.2d).
    expect(counters(s, im, "charge")).toBe(1);
    s.objects[im]!.controlledSinceTurn = -1;
    const lifeBefore = life(s, opp);
    s = goUntil(s, at("declareAttackers", ap));
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: im, defender: opp }] });
    s = goUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.player === ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", labels: ["Put a charge counter on Immard, the Stormcleaver", "Remove a charge counter from Immard, the Stormcleaver"] });
    s = act(s, { type: "chooseOption", player: ap, choice: "1" });
    s = settle(s, (x) => at("chooseModes", ap)(x) || at("chooseTargets", ap)(x));
    expect(counters(s, im, "charge")).toBe(0);
    expect(s.pending?.kind).toBe("chooseModes");
    s = act(s, { type: "chooseModes", player: ap, modes: [0] });
    s = settle(s, at("chooseTargets", ap));
    s = act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] });
    s = settle(s);
    expect(life(s, opp)).toBe(lifeBefore - 4);
  });

  it("Silver Surfer, Cosmic Voyager: flickers any number of your other permanents at the next end step, lands entering tapped", () => {
    const { s: s0, ap } = setup([]);
    poolOnly(s0, ap, { U: 2, C: 4 });
    const bear = putOnBattlefield(s0, ap, bearC("Surf Bear"));
    const land = putOnBattlefield(s0, ap, card("Test Waste", "Land", "", { oracleText: "{T}: Add {C}." }));
    const ss = toZone(s0, ap, surfer(), "hand");
    let s = settle(castNow(s0, ap, ss), at("chooseTargets", ap));
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(bear), tgt(land)] });
    s = settle(s);
    expect(zone(s, bear)).toBe("exile");
    expect(zone(s, land)).toBe("exile");
    s = goUntil(s, (x) => x.step === "cleanup" || (x.step === "end" && !x.stack.length && !x.triggerQueue.length && zone(x, land) === "battlefield"));
    expect(zone(s, bear)).toBe("battlefield");
    expect(zone(s, land)).toBe("battlefield");
    expect(s.objects[land]!.tapped).toBe(true);
    expect(s.objects[bear]!.tapped).toBe(false);
  });

  it("Gyrus, Waker of Corpses: a creature card with lesser power becomes a tapped and attacking token, exiled at end of combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const gy = putOnBattlefield(s0, ap, gyrus());
    s0.objects[gy]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s0);
    const small = toZone(s0, ap, bearC("Small Bear", 2, 2), "graveyard");
    const huge = toZone(s0, ap, bearC("Huge Bear", 5, 5), "graveyard");
    toZone(s0, ap, bearC("Tiny Bear", 1, 1), "graveyard");
    let s = goUntil(s0, at("declareAttackers", ap));
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: gy, defender: opp }] });
    s = goUntil(s, at("chooseTargets", ap));
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(huge)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(small)] });
    s = settle(s, (x) => at("chooseMay", ap)(x));
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, at("chooseOption", ap));
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: s.pending.options[0]! });
    s = settle(s);
    expect(zone(s, small)).toBe("exile");
    const [tok] = tokensNamed(s, ap, "Small Bear");
    expect(tok).toBeDefined();
    expect(s.objects[tok!]!.attacking).toBeDefined();
    expect(s.objects[tok!]!.tapped).toBe(true);
    s = goUntil(s, (x) => x.step === "main2");
    expect(tokensNamed(s, ap, "Small Bear")).toHaveLength(0);
  });

  it("Ellie and Alan, Paleontologists: discover X, X the exiled creature card's mana value", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, ellie());
    const dead = toZone(s0, ap, vanilla("Three Drop", "Creature — Bear", "{2}{G}", 3, 3, 3), "graveyard");
    const [big, small] = stack(s0, ap, [vanilla("Four Drop", "Creature — Bear", "{3}{G}", 4, 4, 4), rock("Cheap Rock")]);
    let s = run(s0, planActivate(s0, ap, e, 0, [], undefined, undefined, undefined, { exileCards: [dead] }));
    expect(zone(s, dead)).toBe("exile");
    s = settle(s, (x) => x.pending?.player === ap);
    // The four-drop is passed over; the one-drop is found, to cast free or put into your hand.
    expect(zone(s, big!)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: small, how: "discover" });
  });

  it("Hollow One: costs {2} less for each card you've cycled or discarded this turn", () => {
    const { s: s0, ap } = setup([]);
    const h = toZone(s0, ap, hollow(), "hand");
    const h2 = toZone(s0, ap, hollow(), "hand");
    const junk = toZone(s0, ap, rock("Junk Rock"), "hand");
    onlyHand(s0, ap, [h, h2, junk]);
    poolOnly(s0, ap, { C: 3 });
    expect(planCast(s0, ap, h, [])).toBeNull();
    // Cycling one (a discard, CR 702.29a) for {2}...
    let s = settle(run(s0, planActivate(s0, ap, h2, 0, [])));
    expect(zone(s, h2)).toBe("graveyard");
    // ... and discarding another: {5} less {4}.
    const rummage = toZone(s, ap, card("Test Rummage", "Sorcery", "{0}", { oracleText: "Discard a card." }), "hand");
    s = settle(castNow(s, ap, rummage), at("discard", ap));
    s = act(s, { type: "discard", player: ap, objectIds: [junk] });
    s = settle(s);
    expect(zone(s, junk)).toBe("graveyard");
    expect(s.players[ap]!.manaPool.C).toBe(1);
    expect(planCast(s, ap, h, [])).not.toBeNull();
  });

  it("Take Out the Trash: 3 damage, and with a Raccoon you may discard a card to draw a card", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, vanilla("Test Raccoon", "Creature — Raccoon", "{G}", 1, 1, 1));
    const bear = putOnBattlefield(s0, opp, bearC("Target Bear", 2, 4));
    const t = toZone(s0, ap, trash(), "hand");
    const junk = toZone(s0, ap, rock("Junk Rock"), "hand");
    onlyHand(s0, ap, [t, junk]);
    let s = settle(castNow(s0, ap, t, [tgt(bear)]), at("chooseMay", ap));
    expect(s.objects[bear]!.damage).toBe(3);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s);
    expect(zone(s, junk)).toBe("graveyard");
    expect(s.players[ap]!.hand).toHaveLength(1);
  });

  it("Take Out the Trash: without a Raccoon, no discard", () => {
    const { s: s0, ap, opp } = setup([]);
    const bear = putOnBattlefield(s0, opp, bearC("Target Bear", 2, 4));
    const t = toZone(s0, ap, trash(), "hand");
    const junk = toZone(s0, ap, rock("Junk Rock"), "hand");
    onlyHand(s0, ap, [t, junk]);
    const s = settle(castNow(s0, ap, t, [tgt(bear)]), at("chooseMay", ap));
    expect(s.pending).toBeFalsy();
    expect(zone(s, junk)).toBe("hand");
  });
});
