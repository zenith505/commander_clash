// Lane B, round 63: unsupported cards no earlier round wrote down, from EDHREC rank about 19,700 up, least played first
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
const acolyte = (): CardDef => ({"oracleId":"944689b2-f9f7-45c3-952c-54287b9824d5","name":"Acolyte's Reward","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Prevent the next X damage that would be dealt to target creature this turn, where X is your devotion to white. If damage is prevented this way, Acolyte's Reward deals that much damage to any target. (Each {W} in the mana costs of permanents you control counts toward your devotion to white.)","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const hibernation = (): CardDef => ({"oracleId":"cf032b80-00d5-42fc-9e1a-16072b5fed55","name":"Hibernation's End","manaCost":"{4}{G}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhenever you pay this enchantment's cumulative upkeep, you may search your library for a creature card with mana value equal to the number of age counters on this enchantment, put it onto the battlefield, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":["Cumulative upkeep"],"layout":"normal"}) as CardDef;
const augmenter = (): CardDef => ({"oracleId":"d87f0e52-486e-49b4-9cf1-12e238857340","name":"Ambitious Augmenter","manaCost":"{G}","cmc":1,"typeLine":"Creature — Turtle Wizard","supertypes":[],"types":["Creature"],"subtypes":["Turtle","Wizard"],"oracleText":"Increment (Whenever you cast a spell, if the amount of mana you spent is greater than this creature's power or toughness, put a +1/+1 counter on this creature.)\nWhen this creature dies, if it had one or more counters on it, create a 0/0 green and blue Fractal creature token, then put this creature's counters on that token.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":["Increment"],"layout":"normal"}) as CardDef;
const decree = (): CardDef => ({"oracleId":"d7cba934-02ad-4677-bb4d-50808b01b4f9","name":"Thranduil's Decree","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell. If a permanent spell is countered this way, exile it instead of putting it into its owner's graveyard. You may cast that card without paying its mana cost for as long as it remains exiled.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const barrel = (): CardDef => ({"oracleId":"7ddbf891-7f80-44e9-b94c-70c1da0b91ed","name":"Getaway Barrel","manaCost":"{3}{R}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact is put into a graveyard from the battlefield, reveal the top thirteen cards of your library. Put a random creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const pharaoh = (): CardDef => ({"oracleId":"7e465cfe-d2ee-4420-87f4-945728f58f87","name":"Vengeful Pharaoh","manaCost":"{2}{B}{B}{B}","cmc":5,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nWhenever combat damage is dealt to you or a planeswalker you control, if this card is in your graveyard, destroy target attacking creature, then put this card on top of your library.","power":"5","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch"],"layout":"normal"}) as CardDef;
const tadeas = (): CardDef => ({"oracleId":"b4b5b928-8b98-4f65-9f15-212859874fe4","name":"Tadeas, Juniper Ascendant","manaCost":"{2}{G}{W}","cmc":4,"typeLine":"Legendary Creature — Human Monk","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Monk"],"oracleText":"Reach\nTadeas has hexproof unless it's attacking.\nWhenever a creature you control with reach attacks, untap it and it can't be blocked by creatures with greater power this combat.\nWhenever one or more creatures you control deal combat damage to a player, draw a card.","power":"1","toughness":"3","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Reach"],"layout":"normal"}) as CardDef;
const blob = (): CardDef => ({"oracleId":"818292cc-6261-47e4-b573-d92f03da6ded","name":"Consuming Blob","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Creature — Ooze","supertypes":[],"types":["Creature"],"subtypes":["Ooze"],"oracleText":"Consuming Blob's power is equal to the number of card types among cards in your graveyard and its toughness is equal to that number plus 1.\nAt the beginning of your end step, create a green Ooze creature token with \"This token's power is equal to the number of card types among cards in your graveyard and its toughness is equal to that number plus 1.\"","power":"*","toughness":"*+1","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const tajuru = (): CardDef => ({"oracleId":"132401fb-6754-4190-9c85-1e57e7f63ed6","name":"Strength of the Tajuru","manaCost":"{X}{G}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Multikicker {1} (You may pay an additional {1} any number of times as you cast this spell.)\nChoose target creature, then choose another target creature for each time this spell was kicked. Put X +1/+1 counters on each of them.","colors":["G"],"colorIdentity":["G"],"keywords":["Multikicker"],"layout":"normal"}) as CardDef;
const kinzu = (): CardDef => ({"oracleId":"e4f4c41b-2533-497f-96bb-7083ef597268","name":"Kinzu of the Bleak Coven","manaCost":"{4}{B}","cmc":5,"typeLine":"Legendary Creature — Phyrexian Vampire","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Phyrexian","Vampire"],"oracleText":"Flying\nWhenever another nontoken creature you control dies, you may pay 2 life and exile it. If you do, create a token that's a copy of that creature, except it's 1/1 and has toxic 1. (Players dealt combat damage by it also get a poison counter.)","power":"5","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Flying"],"layout":"normal"}) as CardDef;
const sylex = (): CardDef => ({"oracleId":"c5e817f9-a003-45b5-8e16-1746e6096166","name":"Karn's Sylex","manaCost":"{3}","cmc":3,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"Karn's Sylex enters tapped.\nPlayers can't pay life to cast spells or to activate abilities that aren't mana abilities.\n{X}, {T}, Exile Karn's Sylex: Destroy each nonland permanent with mana value X or less. Activate only as a sorcery.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bearC = (name = "Plain Bear", p = 2, t = 2) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t, { colors: ["G"] });
const bolt = (name = "Test Bolt", n = 3) => card(name, "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: `${name} deals ${n} damage to any target.` });
const wreck = (name = "Test Wreck") => card(name, "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Destroy target creature." });
const reanimate = () => card("Test Reanimate", "Sorcery", "{B}", { cmc: 1, colors: ["B"], oracleText: "Return target creature card from your graveyard to the battlefield." });
const opt = (name = "Test Opt") => card(name, "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const whiteGuy = (name = "Test Paladin") => vanilla(name, "Creature — Human Knight", "{W}{W}", 2, 2, 2, { colors: ["W"] });

describe("Lane B round 63", () => {
  it("are fully supported", () => {
    supported(acolyte(), hibernation(), augmenter(), decree(), barrel(), pharaoh(), tadeas(), blob(), tajuru(), kinzu(), sylex());
  });

  it("Acolyte's Reward: prevents the next X (devotion to white) damage to the creature and deals that much to the other target", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = toZone(s0, ap, acolyte(), "hand");
    putOnBattlefield(s0, ap, whiteGuy()); // {W}{W}: devotion 2
    const b = putOnBattlefield(s0, ap, bearC("My Bear", 2, 4));
    const bo = toZone(s0, ap, bolt(), "hand");
    let s = settle(castNow(s0, ap, a, [tgt(b), ply(opp)]));
    expect(s.players[ap]!.graveyard).toContain(a);
    const before = life(s, opp);
    s = settle(castNow(s, ap, bo, [tgt(b)]));
    // 2 of the 3 prevented, 2 dealt to the opponent by Acolyte's Reward; the other 1 marked on the bear.
    expect(life(s, opp)).toBe(before - 2);
    expect(s.objects[b]!.damage).toBe(1);
  });

  it("Acolyte's Reward: with only its second target gone, the damage is still prevented, none dealt (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = toZone(s0, ap, acolyte(), "hand");
    putOnBattlefield(s0, ap, whiteGuy());
    const b = putOnBattlefield(s0, ap, bearC("My Bear", 2, 4));
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    let s = castNow(s0, ap, a, [tgt(b), tgt(theirs)]);
    moveObject(s, theirs, "graveyard");
    s = settle(s);
    expect(s.players[ap]!.graveyard).toContain(a);
    const bo = toZone(s, ap, bolt(), "hand");
    s = settle(castNow(s, ap, bo, [tgt(b)]));
    expect(s.objects[b]!.damage).toBe(1);
  });

  it("Ambitious Augmenter: dying with counters makes a Fractal token with the same counters; with none, nothing", () => {
    const { s: s0, ap } = setup([]);
    const aug = putOnBattlefield(s0, ap, augmenter());
    s0.objects[aug]!.counters = { "+1/+1": 3 };
    invalidateCharacteristics(s0);
    const w = toZone(s0, ap, wreck(), "hand");
    let s = settle(castNow(s0, ap, w, [tgt(aug)]));
    expect(zone(s, aug)).toBe("graveyard");
    const fractal = tokensNamed(s, ap, "Fractal");
    expect(fractal).toHaveLength(1);
    expect(counters(s, fractal[0]!)).toBe(3);
    expect(pt(s, fractal[0]!)).toBe("3/3");
    // Without counters: no token.
    const aug2 = putOnBattlefield(s, ap, { ...augmenter(), oracleId: "augmenter-two" });
    const w2 = toZone(s, ap, wreck("Test Wreck Two"), "hand");
    s = settle(castNow(s, ap, w2, [tgt(aug2)]));
    expect(zone(s, aug2)).toBe("graveyard");
    expect(tokensNamed(s, ap, "Fractal")).toHaveLength(1);
  });

  it("Getaway Barrel: a random creature card from the top thirteen onto the battlefield, the rest on the bottom, no choice", () => {
    const { s: s0, ap } = setup([]);
    const lib = s0.players[ap]!.library;
    // Thirteen known cards on top: two creatures among eleven lands.
    const top: string[] = [];
    for (let i = 0; i < 11; i++) top.push(toZone(s0, ap, card(`Test Land ${i}`, "Land", "", { oracleText: "" }), "library"));
    const c1 = toZone(s0, ap, bearC("Top Bear One"), "library");
    const c2 = toZone(s0, ap, bearC("Top Bear Two"), "library");
    const barrelId = putOnBattlefield(s0, ap, barrel());
    const w = toZone(s0, ap, card("Test Shatter", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Destroy target artifact." }), "hand");
    let s = castNow(s0, ap, w, [tgt(barrelId)]);
    let asked = false;
    s = settle(s, (x) => (x.pending?.kind === "searchLibrary" ? (asked = true) : false));
    expect(asked).toBe(false);
    const onto = [c1, c2].filter((id) => zone(s, id) === "battlefield");
    expect(onto).toHaveLength(1);
    // The other twelve are now the bottom twelve cards.
    const bottom = s.players[ap]!.library.slice(-12);
    expect(new Set(bottom)).toEqual(new Set([...top, c1, c2].filter((id) => !onto.includes(id))));
    expect(lib).toBeDefined();
  });

  it("Vengeful Pharaoh: combat damage to you destroys an attacker and puts it on top of your library, once for the step", () => {
    const { s: s0, ap, opp } = setup([]);
    const ph = toZone(s0, ap, pharaoh(), "graveyard");
    const a1 = putOnBattlefield(s0, opp, bearC("Their Bear One"));
    const a2 = putOnBattlefield(s0, opp, bearC("Their Bear Two"));
    // On the opponent's turn: both attack ap.
    let s = goUntil(s0, (x) => x.activePlayer === opp && x.pending?.kind === "declareAttackers");
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: a1, defender: ap }, { attacker: a2, defender: ap }] });
    s = goUntil(s, (x) => at("chooseTargets", ap)(x) || x.step === "end");
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(a1)] } as Action);
    s = settle(s, (x) => at("chooseTargets", ap)(x));
    expect(s.pending?.kind).not.toBe("chooseTargets"); // only one trigger
    s = settle(s);
    expect(zone(s, a1)).toBe("graveyard");
    expect(zone(s, a2)).toBe("battlefield");
    expect(zone(s, ph)).toBe("library");
    expect(s.players[ap]!.library[0]).toBe(ph);
  });

  it("Vengeful Pharaoh: once for you and once for a planeswalker you control dealt combat damage (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    toZone(s0, ap, pharaoh(), "graveyard");
    const walker = putOnBattlefield(s0, ap, card("Test Walker", "Legendary Planeswalker — Test", "{3}", { cmc: 3, loyalty: "9", oracleText: "+1: You gain 1 life." }));
    s0.objects[walker]!.counters = { loyalty: 9 };
    const a1 = putOnBattlefield(s0, opp, bearC("Their Bear One"));
    const a2 = putOnBattlefield(s0, opp, bearC("Their Bear Two"));
    let s = goUntil(s0, (x) => x.activePlayer === opp && x.pending?.kind === "declareAttackers");
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: a1, defender: ap }, { attacker: a2, defender: ap, planeswalker: walker }] });
    let asked = 0;
    s = goUntil(s, (x) => {
      if (at("chooseTargets", ap)(x)) return true;
      return x.step === "end";
    });
    while (at("chooseTargets", ap)(s)) {
      asked++;
      const p = s.pending as { options?: unknown };
      s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(asked === 1 ? a1 : a2)] } as Action);
      s = settle(s, (x) => at("chooseTargets", ap)(x));
      void p;
    }
    expect(asked).toBe(2);
    s = settle(s);
    // The first to resolve put it on top; the second did nothing (it's no longer in the graveyard, rulings).
    expect([zone(s, a1), zone(s, a2)].filter((z) => z === "graveyard")).toHaveLength(1);
  });

  it("Hibernation's End: paying its cumulative upkeep lets you search for a creature with mana value equal to its age counters", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, hibernation());
    const one = toZone(s0, ap, vanilla("Test Elf", "Creature — Elf", "{G}", 1, 1, 1, { colors: ["G"] }), "library");
    let s = goUntil(s0, (x) => x.step === "upkeep" && x.activePlayer === ap && x.turn > s0.turn);
    // Pay {1} for one age counter.
    s = settle(s, (x) => at("chooseMay", ap)(x));
    expect(s.pending?.kind).toBe("chooseMay");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 1 };
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(counters(s, h, "age")).toBe(1);
    expect(zone(s, h)).toBe("battlefield");
    // The trigger: you may search.
    s = settle(s, (x) => at("chooseMay", ap)(x));
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, (x) => at("searchLibrary", ap)(x));
    expect(s.pending?.kind).toBe("searchLibrary");
    const pend = s.pending as { cards: string[] };
    // Only a creature card with mana value 1 (the Elf; the library's Bears cost 2).
    expect(pend.cards).toEqual([one]);
    s = act(s, { type: "searchLibrary", player: ap, found: [one] } as Action);
    s = settle(s);
    expect(zone(s, one)).toBe("battlefield");
  });

  it("Hibernation's End: not paying sacrifices it, with no search", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, hibernation());
    let s = goUntil(s0, (x) => x.step === "upkeep" && x.activePlayer === ap && x.turn > s0.turn);
    s = settle(s, (x) => at("chooseMay", ap)(x));
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s, (x) => at("chooseMay", ap)(x));
    expect(s.pending).toBeNull();
    expect(zone(s, h)).toBe("graveyard");
  });

  it("Thranduil's Decree: a countered permanent spell is exiled and the Decree's controller may cast it free; others go to the graveyard", () => {
    const { s: s0, ap } = setup([]);
    const d = toZone(s0, ap, decree(), "hand");
    const d2 = toZone(s0, ap, { ...decree(), oracleId: "decree-two" }, "hand");
    const myBear = toZone(s0, ap, bearC("My Bear"), "hand");
    const myOpt = toZone(s0, ap, opt("My Opt"), "hand");
    s0.players[ap]!.manaPool = { ...s0.players[ap]!.manaPool, U: 12, C: 12, G: 2 };
    let s = castNow(s0, ap, myBear);
    s = castNow(s, ap, d, [spell(s, myBear)]);
    s = settle(s);
    expect(zone(s, myBear)).toBe("exile");
    expect(s.objects[myBear]!.mayPlay?.player).toBe(ap);
    expect(s.objects[myBear]!.mayPlay?.free).toBe(true);
    // Cast from exile without paying its mana cost.
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    s = settle(castNow(s, ap, myBear));
    expect(zone(s, myBear)).toBe("battlefield");
    // An instant is countered into its owner's graveyard, with no permission.
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 12, C: 12 };
    s = castNow(s, ap, myOpt);
    s = castNow(s, ap, d2, [spell(s, myOpt)]);
    s = settle(s);
    expect(zone(s, myOpt)).toBe("graveyard");
  });

  it("Tadeas: hexproof unless attacking; a reach attacker untaps and can't be blocked by greater power; combat damage draws", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, tadeas());
    const big = putOnBattlefield(s0, opp, bearC("Their Big Bear", 3, 3));
    expect(kw(s0, t)).toContain("Hexproof");
    let s = goUntil(s0, at("declareAttackers", ap));
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: opp }] });
    expect(kw(s, t)).not.toContain("Hexproof");
    s = goUntil(s, (x) => x.pending?.kind === "declareBlockers");
    expect(s.objects[t]!.tapped).toBe(false);
    expect(s.pending?.kind).toBe("declareBlockers");
    const pl = s.pending!.player;
    expect(() => act(s, { type: "declareBlockers", player: pl, blocks: [{ blocker: big, attacker: t }] } as Action)).toThrow();
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "declareBlockers", player: pl, blocks: [] });
    s = goUntil(s, (x) => x.step === "end" || x.step === "main2");
    expect(life(s, opp)).toBe(39);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(kw(s, t)).toContain("Hexproof");
  });

  it("Consuming Blob: power is the card types in your graveyard, toughness that plus 1; the end-step Ooze is the same size", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, blob());
    for (const id of [...s0.players[ap]!.graveyard]) moveObject(s0, id, "exile");
    invalidateCharacteristics(s0);
    expect(pt(s0, b)).toBe("0/1");
    toZone(s0, ap, bearC("Dead Bear"), "graveyard");
    toZone(s0, ap, opt("Dead Opt"), "graveyard");
    toZone(s0, ap, card("Dead Wurm Artifact", "Artifact Creature — Wurm", "{3}", { cmc: 3, power: "3", toughness: "3" }), "graveyard");
    expect(pt(s0, b)).toBe("3/4");
    let s = goUntil(s0, (x) => x.step === "end" && x.activePlayer === ap && x.stack.length === 0 && !x.triggerQueue.length && tokensNamed(x, ap, "Ooze").length > 0);
    const oz = tokensNamed(s, ap, "Ooze")[0]!;
    expect(pt(s, oz)).toBe(pt(s, b));
    s = settle(s);
  });

  it("Strength of the Tajuru: kicked once with X=2, two different target creatures get two counters each", () => {
    const { s: s0, ap } = setup([]);
    const st = toZone(s0, ap, tajuru(), "hand");
    const a = putOnBattlefield(s0, ap, bearC("Bear A"));
    const b = putOnBattlefield(s0, ap, bearC("Bear B"));
    poolOnly(s0, ap, { G: 2, C: 3 });
    const plan = planCast(s0, ap, st, [tgt(a), tgt(b)], undefined, undefined, 2, { kicks: [0] });
    expect(plan).not.toBeNull();
    let s = settle(run(s0, plan));
    expect(counters(s, a)).toBe(2);
    expect(counters(s, b)).toBe(2);
    // Unkicked: one target.
    const st2 = toZone(s, ap, { ...tajuru(), oracleId: "tajuru-two" }, "hand");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, G: 2, C: 1 };
    s = settle(castNow(s, ap, st2, [tgt(a), { kind: "none" }], {}, 1));
    expect(counters(s, a)).toBe(3);
    expect(counters(s, b)).toBe(2);
  });

  it("Kinzu: paying 2 life exiles the dead creature and makes a 1/1 token copy with toxic 1; tokens dying don't trigger", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, kinzu());
    const big = putOnBattlefield(s0, ap, vanilla("Test Giant", "Creature — Giant", "{4}{R}", 5, 5, 5, { colors: ["R"] }));
    const w = toZone(s0, ap, wreck(), "hand");
    const before = life(s0, ap);
    let s = settleMay(castNow(s0, ap, w, [tgt(big)]), ap, () => true);
    expect(zone(s, big)).toBe("exile");
    expect(life(s, ap)).toBe(before - 2);
    const tok = tokensNamed(s, ap, "Test Giant");
    expect(tok).toHaveLength(1);
    expect(pt(s, tok[0]!)).toBe("1/1");
    expect(kw(s, tok[0]!).some((k) => /^toxic/i.test(k))).toBe(true);
    // The token dying: no trigger.
    const w2 = toZone(s, ap, wreck("Test Wreck Two"), "hand");
    let asked = false;
    s = settleMay(castNow(s, ap, w2, [tgt(tok[0]!)]), ap, () => ((asked = true), true));
    expect(asked).toBe(false);
  });

  it("Kinzu: declining leaves the creature in the graveyard with no token", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, kinzu());
    const bear = putOnBattlefield(s0, ap, bearC("My Bear"));
    const w = toZone(s0, ap, wreck(), "hand");
    const before = life(s0, ap);
    const s = settleMay(castNow(s0, ap, w, [tgt(bear)]), ap, () => false);
    expect(zone(s, bear)).toBe("graveyard");
    expect(life(s, ap)).toBe(before);
    expect(tokensNamed(s, ap, "My Bear")).toHaveLength(0);
  });

  it("Karn's Sylex: no paying life for Phyrexian mana or non-mana abilities; life-cost mana abilities still work", () => {
    const { s: s0, ap } = setup([]);
    const syl = putOnBattlefield(s0, ap, sylex());
    poolOnly(s0, ap, {});
    const phy = toZone(s0, ap, card("Test Phyrexian Bolt", "Instant", "{R/P}", { cmc: 1, colors: ["R"], oracleText: "Test Phyrexian Bolt deals 1 damage to any target." }), "hand");
    const drawer = putOnBattlefield(s0, ap, card("Test Life Altar", "Artifact", "{1}", { cmc: 1, oracleText: "Pay 2 life: Draw a card." }));
    const pain = putOnBattlefield(s0, ap, card("Test Pain Rock", "Artifact", "{1}", { cmc: 1, oracleText: "{T}, Pay 1 life: Add {B}." }));
    expect(planCast(s0, ap, phy, [ply(ap)])).toBeNull();
    expect(abilityProblem(s0, ap, drawer, 0)).toBeTruthy();
    const t = act(s0, { type: "activateMana", player: ap, objectId: pain, mana: "B" });
    expect(t.players[ap]!.manaPool.B).toBe(1);
    // Without the Sylex, both are fine.
    moveObject(s0, syl, "graveyard");
    invalidateCharacteristics(s0);
    expect(planCast(s0, ap, phy, [ply(ap)])).not.toBeNull();
    expect(abilityProblem(s0, ap, drawer, 0)).toBeFalsy();
  });

  it("Karn's Sylex: an additional life cost can't be paid either; its ability destroys nonland permanents with mana value X or less", () => {
    const { s: s0, ap, opp } = setup([]);
    const syl = putOnBattlefield(s0, ap, sylex());
    const extra = toZone(s0, ap, card("Test Blood Pact", "Sorcery", "{B}", { cmc: 1, colors: ["B"], oracleText: "As an additional cost to cast this spell, pay 3 life.\nDraw a card." }), "hand");
    s0.players[ap]!.manaPool = { ...s0.players[ap]!.manaPool, B: 1 };
    expect(isFullySupported(defOfTest(s0, extra))).toBe(true);
    expect(planCast(s0, ap, extra)).toBeNull();
    const small = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const big = putOnBattlefield(s0, opp, vanilla("Their Giant", "Creature — Giant", "{4}{R}", 5, 5, 5, { colors: ["R"] }));
    poolOnly(s0, ap, { C: 2 });
    s0.objects[syl]!.tapped = false;
    let s = run(s0, planActivate(s0, ap, syl, 0, [], undefined, undefined, 2));
    s = settle(s);
    expect(zone(s, syl)).toBe("exile");
    expect(zone(s, small)).toBe("graveyard");
    expect(zone(s, big)).toBe("battlefield");
  });
});
