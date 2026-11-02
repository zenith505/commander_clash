// Lane B, round 88: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): one-line
// templates.

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, controllerOf, destroyPermanent, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PendingDecision, type PlayerId, type TargetChoice } from "../src";
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { may?: boolean; me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay" && !opts.me?.includes(p.player)) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes priority until a question of this kind comes up. */
const toPending = (s: GameState, kind: PendingDecision["kind"]) => {
  for (let i = 0; i < 100; i++) {
    if (s.pending?.kind === kind) return s;
    if (s.pending) throw new Error(`asked ${s.pending.kind} first`);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never asked ${kind}`);
};
/** Plays on (no attacks or blocks, the bots answering other questions) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}, x?: number) => run(s, planCast(s, pid, id, targets, undefined, "auto", x, choices));
/** Moves a new card for `def` into `pid`'s hand, library (on top) or graveyard. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
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
/** Empties `pid`'s hand (into exile), then gives them `defs`. */
const handOf = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  for (const id of [...s.players[pid]!.hand]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
  return defs.map((d) => toZone(s, pid, d, "hand"));
};
const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand;
const lifeOf = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const counters = (s: GameState, id: string, kind: string) => (s.objects[id]!.counters as Record<string, number>)[kind] ?? 0;
const onField = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).name === name);
const opponentsOf = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
const abilityIndex = (s: GameState, id: string, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text ?? ""));
const veteran = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.controlledSinceTurn = 0;
  return id;
};

const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const splinter = (): CardDef => ({"oracleId": "c01095ba-b9c9-44e0-97d1-35cc47c4ed04", "name": "Splinter & Leo, Father & Son", "manaCost": "{2}{W}", "cmc": 3, "typeLine": "Legendary Creature — Mutant Ninja Rat Turtle", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Mutant", "Ninja", "Rat", "Turtle"], "oracleText": "When Splinter & Leo enter, choose one or both. Each mode must target a different player.\n• Target player creates a 2/2 red Mutant creature token.\n• Put a +1/+1 counter on each other creature target player controls.", "power": "2", "toughness": "2", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"}) as CardDef;
const donnie = (): CardDef => ({"oracleId": "7b33368f-0668-4233-8bbf-725c66c771cb", "name": "Donnie & April, Adorkable Duo", "manaCost": "{4}{U}", "cmc": 5, "typeLine": "Legendary Creature — Mutant Ninja Human Turtle", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Mutant", "Ninja", "Human", "Turtle"], "oracleText": "When Donnie & April enter, choose one or both. Each mode must target a different player.\n• Target player draws two cards.\n• Target player returns an artifact, instant, or sorcery card from their graveyard to their hand.", "power": "3", "toughness": "3", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const mikey = (): CardDef => ({"oracleId": "15e14a91-a596-465f-becc-cef2e7fbbd30", "name": "Mikey & Mona, Mutant Sitters", "manaCost": "{2}{G}", "cmc": 3, "typeLine": "Legendary Creature — Mutant Ninja Turtle Lizard", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Mutant", "Ninja", "Turtle", "Lizard"], "oracleText": "When Mikey & Mona enter, choose one or both. Each mode must target a different player.\n• Target player chooses a creature they control and puts two +1/+1 counters on it.\n• Target player returns a creature or land card from their graveyard to their hand.", "power": "2", "toughness": "2", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"}) as CardDef;
const casey = (): CardDef => ({"oracleId": "f20a5297-31ba-4bbd-810e-be23175a116f", "name": "Casey & Raph, Hotheads", "manaCost": "{4}{R}", "cmc": 5, "typeLine": "Legendary Creature — Mutant Ninja Human Turtle", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Mutant", "Ninja", "Human", "Turtle"], "oracleText": "When Casey & Raph enter, choose one or both. Each mode must target a different player.\n• Target player exiles the top card of their library. Until that player's next end step, they may play that card without paying its mana cost.\n• Target player creates two Treasure tokens.", "power": "4", "toughness": "4", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Treasure"], "layout": "normal"}) as CardDef;
const balor = (): CardDef => ({"oracleId": "6f931c1e-f1d2-4dc7-a653-c29adfc8fb2c", "name": "Balor", "manaCost": "{3}{R}{R}", "cmc": 5, "typeLine": "Creature — Demon", "supertypes": [], "types": ["Creature"], "subtypes": ["Demon"], "oracleText": "Flying\nWhenever this creature attacks or dies, choose one or more. Each mode must target a different player.\n• Target opponent draws three cards, then discards three cards at random.\n• Target opponent sacrifices a nontoken artifact of their choice.\n• This creature deals damage to target opponent equal to the number of cards in their hand.", "power": "5", "toughness": "5", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Flying"], "layout": "normal"}) as CardDef;
const sugarmaw = (): CardDef => ({"oracleId": "c8bc28ea-5630-49d5-963a-5789fa83f3c7", "name": "Devouring Sugarmaw // Have for Dinner", "manaCost": "{2}{B}{B} // {1}{W}", "cmc": 4, "typeLine": "Creature — Horror // Instant — Adventure", "supertypes": [], "types": ["Creature"], "subtypes": ["Horror"], "oracleText": "Menace, trample\nAt the beginning of your upkeep, you may sacrifice an artifact, enchantment, or token. If you don't, tap this creature.", "power": "6", "toughness": "6", "colors": ["B"], "colorIdentity": ["B", "W"], "keywords": ["Food", "Trample", "Menace"], "layout": "adventure", "faces": [{"name": "Devouring Sugarmaw", "manaCost": "{2}{B}{B}", "typeLine": "Creature — Horror", "supertypes": [], "types": ["Creature"], "subtypes": ["Horror"], "oracleText": "Menace, trample\nAt the beginning of your upkeep, you may sacrifice an artifact, enchantment, or token. If you don't, tap this creature.", "power": "6", "toughness": "6", "colors": ["B"]}, {"name": "Have for Dinner", "manaCost": "{1}{W}", "typeLine": "Instant — Adventure", "supertypes": [], "types": ["Instant"], "subtypes": ["Adventure"], "oracleText": "Create a 1/1 white Human creature token and a Food token. (Then exile this card. You may cast the creature later from exile.)", "colors": ["W"]}]}) as CardDef;
const inferno = (): CardDef => ({"oracleId": "fa7c8092-94da-4147-aa90-0a951d2a8be8", "name": "Impossible Inferno", "manaCost": "{4}{R}", "cmc": 5, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Impossible Inferno deals 6 damage to target creature.\nDelirium — If there are four or more card types among cards in your graveyard, exile the top card of your library. You may play it until the end of your next turn.", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Delirium"], "layout": "normal"}) as CardDef;
const warchief = (): CardDef => ({"oracleId": "97f1ac0d-a3a6-46d8-ae99-b17b636fe47c", "name": "Mistform Warchief", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Creature — Illusion", "supertypes": [], "types": ["Creature"], "subtypes": ["Illusion"], "oracleText": "Creature spells you cast that share a creature type with this creature cost {1} less to cast.\n{T}: This creature becomes the creature type of your choice until end of turn.", "power": "1", "toughness": "3", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const laboratory = (): CardDef => ({"oracleId": "f2a6e26c-6bd6-4fca-ba9f-d52d01fc03ef", "name": "Volrath's Laboratory", "manaCost": "{5}", "cmc": 5, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "As this artifact enters, choose a color and a creature type.\n{5}, {T}: Create a 2/2 creature token of the chosen color and type.", "colors": [], "colorIdentity": [], "keywords": [], "layout": "normal"}) as CardDef;
const replicator = (): CardDef => ({"oracleId": "f526ce8a-27f5-4785-aed3-944b080c9c1a", "name": "Riptide Replicator", "manaCost": "{X}{4}", "cmc": 4, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "As this artifact enters, choose a color and a creature type.\nThis artifact enters with X charge counters on it.\n{4}, {T}: Create an X/X creature token of the chosen color and type, where X is the number of charge counters on this artifact.", "colors": [], "colorIdentity": [], "keywords": [], "layout": "normal"}) as CardDef;
const sarpadian = (): CardDef => ({"oracleId": "f71d55f5-f220-4cb0-9468-b8d339ab8535", "name": "Sarpadian Empires, Vol. VII", "manaCost": "{3}", "cmc": 3, "typeLine": "Artifact — Book", "supertypes": [], "types": ["Artifact"], "subtypes": ["Book"], "oracleText": "As this artifact enters, choose white Citizen, blue Camarid, black Thrull, red Goblin, or green Saproling.\n{3}, {T}: Create a 1/1 creature token of the chosen color and type.", "colors": [], "colorIdentity": [], "keywords": [], "layout": "normal"}) as CardDef;

const troll = (): CardDef => ({"oracleId": "b707c131-de13-4d4d-839d-b9f47d62f090", "name": "Faunsbane Troll", "manaCost": "{2}{B}{G}", "cmc": 4, "typeLine": "Creature — Troll", "supertypes": [], "types": ["Creature"], "subtypes": ["Troll"], "oracleText": "When this creature enters, create a Monster Role token attached to it. (Enchanted creature gets +1/+1 and has trample.)\n{1}, Sacrifice an Aura attached to this creature: This creature fights target creature you don't control. If that creature would die this turn, exile it instead. Activate only as a sorcery.", "power": "4", "toughness": "4", "colors": ["B", "G"], "colorIdentity": ["B", "G"], "keywords": ["Role token", "Fight"], "layout": "normal"}) as CardDef;
const ronin = (): CardDef => ({"oracleId": "8ceb1acf-5ff3-4f1a-af04-9f07ad454526", "name": "Ronin, Shadow Stalker", "manaCost": "{2}{B}", "cmc": 3, "typeLine": "Legendary Creature — Human Rogue Hero", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Rogue", "Hero"], "oracleText": "Pay 2 life: Add two mana of any one color. Spend this mana only to cast Equipment spells or activate equip abilities. Activate only once each turn.\n{T}, Sacrifice an Equipment attached to Ronin: Target creature gets -4/-4 until end of turn. Activate only as a sorcery.", "power": "3", "toughness": "3", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "producedMana": ["B", "G", "R", "U", "W"], "layout": "normal"}) as CardDef;
const artifact = () => card("Test Relic", "Artifact", "{1}");
const sword = () => card("Test Sword", "Artifact — Equipment", "{1}", { oracleText: "Equip {1}" });
const testSorcery = () => card("Test Sorcery", "Sorcery", "{1}", { oracleText: "Draw a card." });
const illusion = () => card("Test Illusion", "Creature — Illusion Wizard", "{1}{U}", { power: "1", toughness: "1" });
const goblin = () => card("Test Goblin", "Creature — Goblin", "{1}{R}", { power: "1", toughness: "1" });

/** Casts a creature with an "enters" modal trigger and plays on to its modes question. */
const castToModes = (s: GameState, pid: PlayerId, def: CardDef) => {
  const [id] = handOf(s, pid, [def]);
  s = castNow(s, pid, id!);
  return { s: toPending(s, "chooseModes"), id: id! };
};

describe("Lane B round 88", () => {
  it("all of them are supported", () => {
    supported(splinter(), donnie(), mikey(), casey(), balor(), sugarmaw(), inferno(), warchief(), laboratory(), replicator(), sarpadian(), troll(), ronin());
  });

  it("Splinter & Leo: one or both modes, each targeting a different player; 'each other creature' leaves Splinter & Leo out", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const mine = putOnBattlefield(s0, ap, bears());
    const theirs = putOnBattlefield(s0, b!, bears());
    let { s, id } = castToModes(s0, ap, splinter());
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: ap, min: 1, max: 2 });
    s = act(s, { type: "chooseModes", player: ap, modes: [0, 1] });
    expect(s.pending?.kind).toBe("chooseTargets");
    // The same player for both modes isn't allowed (CR 115.3: "each mode must target a different player").
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [player(ap), player(ap)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [player(b!), player(ap)] }));
    expect(onField(s, b!, "Mutant Token").length).toBe(1);
    expect(pt(s, onField(s, b!, "Mutant Token")[0]!)).toBe("2/2");
    expect(characteristics(s, s.objects[onField(s, b!, "Mutant Token")[0]!]!).colors).toEqual(["R"]);
    expect(counters(s, mine, "+1/+1")).toBe(1);
    expect(counters(s, id, "+1/+1")).toBe(0);
    expect(counters(s, theirs, "+1/+1")).toBe(0);
  });

  it("Splinter & Leo: one mode alone", () => {
    const { s: s0, ap } = setup([]);
    let { s } = castToModes(s0, ap, splinter());
    s = act(s, { type: "chooseModes", player: ap, modes: [0] });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [player(ap)] }));
    expect(onField(s, ap, "Mutant Token").length).toBe(1);
  });

  it("Splinter & Leo: the bot picks its modes and players", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, bears());
    let { s } = castToModes(s0, ap, splinter());
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.log.some((l) => /Splinter & Leo/.test(l.text))).toBe(true);
  });

  it("Donnie & April: you draw two; another player returns an artifact, instant or sorcery card from their graveyard", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const relic = toZone(s0, b!, artifact(), "graveyard");
    toZone(s0, b!, bears(), "graveyard");
    let { s } = castToModes(s0, ap, donnie());
    const before = hand(s, ap).length;
    s = act(s, { type: "chooseModes", player: ap, modes: [0, 1] });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [player(ap), player(b!)] }));
    expect(hand(s, ap).length).toBe(before + 2);
    expect(zone(s, relic)).toBe("hand");
    expect(hand(s, b!)).toContain(relic);
  });

  it("Mikey & Mona: that player chooses a creature they control and puts two +1/+1 counters on it; you return a creature or land card", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const theirs = putOnBattlefield(s0, b!, bears());
    const dead = toZone(s0, ap, bears(), "graveyard");
    let { s } = castToModes(s0, ap, mikey());
    s = act(s, { type: "chooseModes", player: ap, modes: [0, 1] });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [player(b!), player(ap)] }));
    expect(counters(s, theirs, "+1/+1")).toBe(2);
    expect(zone(s, dead)).toBe("hand");
  });

  it("Mikey & Mona: the targeted player is asked which of their creatures gets the counters", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const one = putOnBattlefield(s0, ap, bears());
    const two = putOnBattlefield(s0, ap, goblin());
    let { s, id } = castToModes(s0, ap, mikey());
    s = act(s, { type: "chooseModes", player: ap, modes: [0] });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [player(ap)] }), { me: [ap] });
    const p = s.pending!;
    expect(p.player).toBe(ap);
    expect(JSON.stringify(p)).toContain(two);
    expect(JSON.stringify(p)).toContain(id);
    s = run(s, botActions(s, ap));
    s = settle(s);
    expect(counters(s, one, "+1/+1") + counters(s, two, "+1/+1") + counters(s, id, "+1/+1")).toBe(2);
    void b;
  });

  it("Casey & Raph: the targeted player exiles their top card and may play it free until their next end step; you get two Treasures", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const top = toZone(s0, b!, testSorcery(), "library");
    let { s } = castToModes(s0, ap, casey());
    s = act(s, { type: "chooseModes", player: ap, modes: [0, 1] });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [player(b!), player(ap)] }));
    expect(zone(s, top)).toBe("exile");
    expect(s.objects[top]!.mayPlay).toMatchObject({ player: b, until: "yourNextEndStep", free: true });
    expect(onField(s, ap, "Treasure").length + onField(s, ap, "Treasure Token").length).toBe(2);
    // It's theirs to cast (not yours), with no mana, on their turn.
    expect(planCast(s, ap, top, [])).toBeNull();
    s = goUntil(s, (x) => x.activePlayer === b && x.step === "main1" && !x.stack.length && !x.pending);
    s.players[b!]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    expect(planCast(s, b!, top, [])).not.toBeNull();
    // Over as their end step begins.
    s = goUntil(s, (x) => x.activePlayer === b && x.step === "end");
    expect(s.objects[top]!.mayPlay).toBeUndefined();
  });

  it("Balor: when it attacks, one or more modes against different opponents", () => {
    const { s: s0, ap } = setup([]);
    const [b, c, d] = opponentsOf(s0, ap);
    const balorId = veteran(s0, ap, balor());
    const relic = putOnBattlefield(s0, c!, artifact());
    let s = s0;
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: balorId, defender: b! }] });
    s = toPending(s, "chooseModes");
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: ap, min: 1, max: 3 });
    s = act(s, { type: "chooseModes", player: ap, modes: [0, 1, 2] });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [player(b!), player(b!), player(d!)] })).toThrow();
    const dHand = hand(s, d!).length;
    const bHand = hand(s, b!).length;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [player(b!), player(c!), player(d!)] }));
    expect(hand(s, b!).length).toBe(bHand);
    expect(zone(s, relic)).toBe("graveyard");
    expect(lifeOf(s, d!)).toBe(40 - dHand);
  });

  it("Balor: when it dies, the same choice", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const balorId = putOnBattlefield(s0, ap, balor());
    let s = s0;
    destroyPermanent(s, s.objects[balorId]!, "test");
    s = toPending(s, "chooseModes");
    s = act(s, { type: "chooseModes", player: ap, modes: [2] });
    const bHand = hand(s, b!).length;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [player(b!)] }));
    expect(lifeOf(s, b!)).toBe(40 - bHand);
  });

  it("Devouring Sugarmaw: sacrifice an artifact, enchantment or token at upkeep, or it taps", () => {
    const { s: s0, ap } = setup([]);
    const maw = veteran(s0, ap, sugarmaw());
    const relic = putOnBattlefield(s0, ap, artifact());
    let s = goUntil(s0, (x) => x.turn > s0.turn && x.activePlayer === ap && x.step === "upkeep" && (x.stack.length > 0 || !!x.pending));
    s = settle(s, { may: true });
    expect(zone(s, relic)).toBe("graveyard");
    expect(s.objects[maw]!.tapped).toBe(false);
    // Nothing to sacrifice but a nontoken creature: it taps.
    const t = s.turn;
    s = goUntil(s, (x) => x.turn > t && x.activePlayer === ap && x.step === "upkeep" && (x.stack.length > 0 || !!x.pending));
    s = settle(s, { may: true });
    expect(s.objects[maw]!.tapped).toBe(true);
  });

  it("Devouring Sugarmaw: a creature token can be sacrificed; declining taps it", () => {
    const { s: s0, ap } = setup([]);
    const maw = veteran(s0, ap, sugarmaw());
    const tok = putOnBattlefield(s0, ap, bears());
    s0.objects[tok]!.isToken = true;
    let s = goUntil(s0, (x) => x.turn > s0.turn && x.activePlayer === ap && x.step === "upkeep" && (x.stack.length > 0 || !!x.pending));
    const declined = settle(structuredClone(s), { may: false });
    expect(declined.objects[maw]!.tapped).toBe(true);
    s = settle(s, { may: true });
    expect(s.objects[tok]).toBeUndefined();
    expect(s.objects[maw]!.tapped).toBe(false);
  });

  it("Impossible Inferno: delirium exiles the top card to play until the end of your next turn", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const target = putOnBattlefield(s0, b!, bears());
    const [fire] = handOf(s0, ap, [inferno()]);
    const top = toZone(s0, ap, bears(), "library");
    // Only three card types: no impulse.
    let s = settle(castNow(structuredClone(s0), ap, fire!, [tgt(target)]));
    expect(zone(s, target)).toBe("graveyard");
    expect(zone(s, top)).toBe("library");
    // Creature, artifact, sorcery and land (Impossible Inferno is still on the stack, rulings).
    for (const d of [bears(), artifact(), testSorcery(), card("Test Land", "Land")]) toZone(s0, ap, d, "graveyard");
    s = settle(castNow(s0, ap, fire!, [tgt(target)]));
    expect(zone(s, top)).toBe("exile");
    expect(s.objects[top]!.mayPlay).toMatchObject({ player: ap, until: "nextTurn" });
  });

  it("Mistform Warchief: creature spells sharing a creature type with it cost {1} less, as its types are now", () => {
    const { s: s0, ap } = setup([]);
    const chief = veteran(s0, ap, warchief());
    const [mer, gob] = handOf(s0, ap, [illusion(), goblin()]);
    poolOnly(s0, ap, { U: 1 });
    expect(planCast(s0, ap, mer!, [])).not.toBeNull();
    s0.players[ap]!.manaPool = { ...s0.players[ap]!.manaPool, U: 0, R: 1 };
    expect(planCast(s0, ap, gob!, [])).toBeNull();
    // Its own ability makes it a Goblin: now the Goblin is cheaper and the Merfolk isn't.
    const s1 = structuredClone(s0);
    s1.players[ap]!.manaPool = { ...s1.players[ap]!.manaPool, U: 0, R: 0 };
    let s = run(s1, planActivate(s1, ap, chief, abilityIndex(s1, chief, /becomes the creature type/), []));
    s = settle(s, { me: [ap] });
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: "Goblin" });
    s = settle(s);
    expect(characteristics(s, s.objects[chief]!).subtypes).toContain("Goblin");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 0, R: 1 };
    expect(planCast(s, ap, gob!, [])).not.toBeNull();
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1, R: 0 };
    expect(planCast(s, ap, mer!, [])).toBeNull();
  });

  it("Volrath's Laboratory: a 2/2 token of the chosen color and type, named after the type", () => {
    const { s: s0, ap } = setup([]);
    const [lab] = handOf(s0, ap, [laboratory()]);
    let s = castNow(s0, ap, lab!);
    s = toPending(s, "chooseOption");
    expect(s.pending).toMatchObject({ what: "color" });
    s = act(s, { type: "chooseOption", player: ap, choice: "Blue" });
    expect(s.pending).toMatchObject({ what: "creatureType" });
    s = act(s, { type: "chooseOption", player: ap, choice: "Bird" });
    s = settle(s);
    s.objects[lab!]!.controlledSinceTurn = -1;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 5 };
    s = settle(run(s, planActivate(s, ap, lab!, abilityIndex(s, lab!, /Create/), [])));
    const [bird] = onField(s, ap, "Bird Token");
    expect(bird).toBeDefined();
    const c = characteristics(s, s.objects[bird!]!);
    expect(c.colors).toEqual(["U"]);
    expect(c.subtypes).toEqual(["Bird"]);
    expect(c.keywords).not.toContain("Flying");
    expect(pt(s, bird!)).toBe("2/2");
  });

  it("Volrath's Laboratory: gone before its ability resolves, the token still has what was chosen (CR 608.2h)", () => {
    const { s: s0, ap } = setup([]);
    const lab = veteran(s0, ap, laboratory());
    s0.objects[lab]!.chosen = { color: "R", type: "Goblin" };
    s0.players[ap]!.manaPool = { ...s0.players[ap]!.manaPool, C: 5 };
    let s = run(s0, planActivate(s0, ap, lab, abilityIndex(s0, lab, /Create/), []));
    destroyPermanent(s, s.objects[lab]!, "test");
    s = settle(s);
    const [gob] = onField(s, ap, "Goblin Token");
    expect(gob).toBeDefined();
    expect(characteristics(s, s.objects[gob!]!).colors).toEqual(["R"]);
  });

  it("Riptide Replicator: an X/X token, X its charge counters", () => {
    const { s: s0, ap } = setup([]);
    const [rep] = handOf(s0, ap, [replicator()]);
    let s = castNow(s0, ap, rep!, [], {}, 3);
    s = toPending(s, "chooseOption");
    s = act(s, { type: "chooseOption", player: ap, choice: "Green" });
    s = act(s, { type: "chooseOption", player: ap, choice: "Elf" });
    s = settle(s);
    expect(counters(s, rep!, "charge")).toBe(3);
    s.objects[rep!]!.controlledSinceTurn = -1;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 4 };
    s = settle(run(s, planActivate(s, ap, rep!, abilityIndex(s, rep!, /Create/), [])));
    const [elf] = onField(s, ap, "Elf Token");
    expect(pt(s, elf!)).toBe("3/3");
    expect(characteristics(s, s.objects[elf!]!).colors).toEqual(["G"]);
  });

  it("Sarpadian Empires, Vol. VII: one of five color and type pairs, then 1/1 tokens of it", () => {
    const { s: s0, ap } = setup([]);
    const [book] = handOf(s0, ap, [sarpadian()]);
    let s = castNow(s0, ap, book!);
    s = toPending(s, "chooseOption");
    expect(s.pending).toMatchObject({ what: "colorAndType", options: ["white Citizen", "blue Camarid", "black Thrull", "red Goblin", "green Saproling"] });
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "white Thrull" })).toThrow();
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "black Thrull" }));
    expect(s.objects[book!]!.chosen).toMatchObject({ color: "B", type: "Thrull" });
    s.objects[book!]!.controlledSinceTurn = -1;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 3 };
    s = settle(run(s, planActivate(s, ap, book!, abilityIndex(s, book!, /Create/), [])));
    const [thrull] = onField(s, ap, "Thrull Token");
    expect(pt(s, thrull!)).toBe("1/1");
    expect(characteristics(s, s.objects[thrull!]!).colors).toEqual(["B"]);
  });

  it("Sarpadian Empires, Vol. VII: the bot picks the type most of its creatures share", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, goblin());
    putOnBattlefield(s0, ap, goblin());
    const [book] = handOf(s0, ap, [sarpadian()]);
    let s = castNow(s0, ap, book!);
    s = toPending(s, "chooseOption");
    s = run(s, botActions(s, ap));
    expect(s.objects[book!]!.chosen).toMatchObject({ color: "R", type: "Goblin" });
  });

  it("Ronin, Shadow Stalker: sacrifice an Equipment attached to it, not one attached to another creature", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const me = veteran(s0, ap, ronin());
    const other = veteran(s0, ap, bears());
    const victim = putOnBattlefield(s0, b!, card("Test Giant", "Creature — Giant", "{4}", { power: "4", toughness: "4" }));
    const elsewhere = putOnBattlefield(s0, ap, sword());
    s0.objects[elsewhere]!.attachedTo = other;
    invalidateCharacteristics(s0);
    const idx = abilityIndex(s0, me, /Sacrifice an Equipment attached/);
    // Only an Equipment on another creature: it can't be activated.
    expect(planActivate(s0, ap, me, idx, [tgt(victim)], undefined, undefined, undefined, { sacrifice: [elsewhere] })).toBeNull();
    const mine = putOnBattlefield(s0, ap, sword());
    s0.objects[mine]!.attachedTo = me;
    invalidateCharacteristics(s0);
    let s = run(s0, planActivate(s0, ap, me, idx, [tgt(victim)], undefined, undefined, undefined, { sacrifice: [mine] }));
    expect(zone(s, mine)).toBe("graveyard");
    expect(zone(s, elsewhere)).toBe("battlefield");
    s = settle(s);
    expect(zone(s, victim)).toBe("graveyard");
  });

  it("Faunsbane Troll: sacrifice the Role on it to fight; the creature it would kill is exiled instead", () => {
    const { s: s0, ap } = setup([]);
    const [b] = opponentsOf(s0, ap);
    const [trollId] = handOf(s0, ap, [troll()]);
    let s = settle(castNow(s0, ap, trollId!));
    const role = s.battlefield.find((id) => s.objects[id]!.attachedTo === trollId);
    expect(role).toBeDefined();
    expect(pt(s, trollId!)).toBe("5/5");
    const victim = putOnBattlefield(s, b!, bears());
    s.objects[trollId!]!.controlledSinceTurn = -1;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 1 };
    const idx = abilityIndex(s, trollId!, /Sacrifice an Aura attached/);
    s = run(s, planActivate(s, ap, trollId!, idx, [tgt(victim)], undefined, undefined, undefined, { sacrifice: [role!] }));
    expect(s.objects[role!]).toBeUndefined();
    s = settle(s);
    expect(zone(s, victim)).toBe("exile");
    expect(s.objects[trollId!]!.damage).toBe(2);
  });
});
