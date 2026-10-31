// Lane B, round 64: unsupported cards no earlier round wrote down, from EDHREC rank about 19,700 up, least played first
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

const moira = (): CardDef => ({"oracleId":"48060406-dd5a-4df5-84e9-3e797f0248cd","name":"Moira, Urborg Haunt","manaCost":"{2}{B}","cmc":3,"typeLine":"Legendary Creature — Spirit Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit","Wizard"],"oracleText":"Menace\nWhenever Moira deals combat damage to a player, return to the battlefield target creature card in your graveyard that was put there from the battlefield this turn.","power":"3","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Menace"],"layout":"normal"}) as CardDef;
const antman = (): CardDef => ({"oracleId":"b0ed9fbe-324d-467a-a326-c6f85a4c688a","name":"Ant-Man, Colony Commander","manaCost":"{1}{G}{U}","cmc":3,"typeLine":"Legendary Creature — Human Rogue Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Rogue","Hero"],"oracleText":"Whenever Ant-Man attacks, you may pay {1}. When you do, put a +1/+1 counter on target creature.\nWhenever you put a +1/+1 counter on a creature, create a 1/1 green Insect creature token. This ability triggers only once each turn.","power":"2","toughness":"2","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"layout":"normal"}) as CardDef;
const ginger = (): CardDef => ({"oracleId":"5ea93956-085d-409b-bd95-dd669fa69eeb","name":"Ginger, Queen of Sweets","manaCost":"{6}","cmc":6,"typeLine":"Legendary Artifact Creature — Food Noble","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Food","Noble"],"oracleText":"When Ginger enters, you become the monarch.\n{2}, {T}, Sacrifice Ginger: You gain 6 life.\nAt the beginning of each upkeep, if you're the monarch, create a Gingerbrute token. (It's a {1} 1/1 Food Golem artifact creature with haste, \"{1}: This token can't be blocked this turn except by creatures with haste,\" and \"{2}, {T}, Sacrifice this token: You gain 3 life.\")","power":"6","toughness":"4","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const namor = (): CardDef => ({"oracleId":"171a0a09-4aee-466c-aebd-3b0d4c1f51b4","name":"Namor, Atlantean King","manaCost":"{1}{W}{U}","cmc":3,"typeLine":"Legendary Creature — Mutant Merfolk Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Mutant","Merfolk","Noble"],"oracleText":"Flying\nWhenever you cast a noncreature spell, create a 1/1 blue Merfolk creature token.\nWhenever Namor attacks a player who has more life than you, other creatures you control attacking that player get +2/+0 until end of turn.","power":"2","toughness":"2","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Flying"],"layout":"normal"}) as CardDef;
const kaima = (): CardDef => ({"oracleId":"3d8f9b58-d011-4ed2-99ae-c626243fab26","name":"Kaima, the Fractured Calm","manaCost":"{2}{R}{G}","cmc":4,"typeLine":"Legendary Creature — Spirit","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"At the beginning of your end step, goad each creature your opponents control that's enchanted by an Aura you control. Put a +1/+1 counter on Kaima for each creature goaded this way. (Until your next turn, the goaded creatures attack each combat if able and attack a player other than you if able.)","power":"3","toughness":"3","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Goad"],"layout":"normal"}) as CardDef;
const dennick = (): CardDef => ({"oracleId":"45802eb2-6848-416c-95e0-c1c1ea0620d0","name":"Dennick, Pious Apprentice // Dennick, Pious Apparition","manaCost":"{W}{U}","cmc":2,"typeLine":"Legendary Creature — Human Soldier // Legendary Creature — Spirit Soldier","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Lifelink\nCards in graveyards can't be the targets of spells or abilities.\nDisturb {2}{W}{U} (You may cast this card from your graveyard transformed for its disturb cost.)","power":"2","toughness":"3","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Flying","Lifelink","Investigate","Transform","Disturb"],"layout":"transform","faces":[{"name":"Dennick, Pious Apprentice","manaCost":"{W}{U}","typeLine":"Legendary Creature — Human Soldier","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Lifelink\nCards in graveyards can't be the targets of spells or abilities.\nDisturb {2}{W}{U} (You may cast this card from your graveyard transformed for its disturb cost.)","power":"2","toughness":"3","colors":["U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/4/d/4df8d711-09e3-43e5-b59e-ea6a92cae726.jpg?1783924353","artUrl":"https://cards.scryfall.io/art_crop/front/4/d/4df8d711-09e3-43e5-b59e-ea6a92cae726.jpg?1783924353"},{"name":"Dennick, Pious Apparition","manaCost":"","typeLine":"Legendary Creature — Spirit Soldier","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit","Soldier"],"oracleText":"Flying\nWhenever one or more creature cards are put into graveyards from anywhere, investigate. This ability triggers only once each turn. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nIf Dennick would be put into a graveyard from anywhere, exile it instead.","power":"3","toughness":"2","colors":["U","W"],"colorIndicator":["U","W"],"imageUrl":"https://cards.scryfall.io/normal/back/4/d/4df8d711-09e3-43e5-b59e-ea6a92cae726.jpg?1783924353","artUrl":"https://cards.scryfall.io/art_crop/back/4/d/4df8d711-09e3-43e5-b59e-ea6a92cae726.jpg?1783924353"}]}) as CardDef;
const biblioplex = (): CardDef => ({"oracleId":"86ed6073-c35c-4d29-9911-5fe191dd875f","name":"The Biblioplex","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{2}, {T}: Look at the top card of your library. If it's an instant or sorcery card, you may reveal it and put it into your hand. If you don't put the card into your hand, you may put it into your graveyard. Activate only if you have exactly zero or seven cards in hand.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const tazri = (): CardDef => ({"oracleId":"ce703e1d-b7b2-4b8b-a12c-714fc152d0a5","name":"Tazri, Beacon of Unity","manaCost":"{4}{W}","cmc":5,"typeLine":"Legendary Creature — Human Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"This spell costs {1} less to cast for each creature in your party.\n{2/U}{2/B}{2/R}{2/G}: Look at the top six cards of your library. You may reveal up to two Cleric, Rogue, Warrior, Wizard, and/or Ally cards from among them and put them into your hand. Put the rest on the bottom of your library in a random order.","power":"4","toughness":"6","colors":["W"],"colorIdentity":["B","G","R","U","W"],"keywords":[],"layout":"normal"}) as CardDef;
const loli = (): CardDef => ({"oracleId":"ad643992-eb9f-4a4a-9b74-a5aee2337f30","name":"Lo and Li, Twin Tutors","manaCost":"{4}{B}","cmc":5,"typeLine":"Legendary Creature — Human Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Advisor"],"oracleText":"When Lo and Li enter, search your library for a Lesson or Noble card, reveal it, put it into your hand, then shuffle.\nNoble creatures you control and Lesson spells you control have lifelink.","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const sarevok = (): CardDef => ({"oracleId":"4e215ede-e4ac-482a-a2e1-cacb20affa70","name":"Sarevok, Deathbringer","manaCost":"{3}{B}","cmc":4,"typeLine":"Legendary Creature — Human Knight","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"At the beginning of each player's end step, if no permanents left the battlefield this turn, that player loses X life, where X is Sarevok's power.\nChoose a Background (You can have a Background as a second commander.)","power":"3","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Choose a background"],"layout":"normal"}) as CardDef;
const jared = (): CardDef => ({"oracleId":"b48da54c-002f-4afb-9fdf-2a3e1cf77383","name":"Jared Carthalion, True Heir","manaCost":"{R}{G}{W}","cmc":3,"typeLine":"Legendary Creature — Human Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"When Jared Carthalion enters, target opponent becomes the monarch. You can't become the monarch this turn.\nIf damage would be dealt to Jared Carthalion while you're the monarch, prevent that damage and put that many +1/+1 counters on it.","power":"3","toughness":"3","colors":["G","R","W"],"colorIdentity":["G","R","W"],"keywords":[],"layout":"normal"}) as CardDef;
const numa = (): CardDef => ({"oracleId":"7f4aa98d-3572-4637-9b0d-3c12f63a96ec","name":"Numa, Joraga Chieftain","manaCost":"{2}{G}","cmc":3,"typeLine":"Legendary Creature — Elf Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Warrior"],"oracleText":"At the beginning of combat on your turn, you may pay {X}{X}. When you do, distribute X +1/+1 counters among any number of target Elves.\nPartner (You can have two commanders if both have partner.)","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Partner"],"layout":"normal"}) as CardDef;
const garruk = (): CardDef => ({"oracleId":"4a6972fe-348a-4a19-a1d0-bdf8f1f9c792","name":"Garruk, Veiled Butcher","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Legendary Planeswalker — Garruk","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Garruk"],"oracleText":"If a creature an opponent controls would die, exile it instead.\n+2: Up to one target creature gets -4/-1 until your next turn.\n−2: Each player sacrifices a creature of their choice. If you sacrificed a creature this way, create a 4/4 green Beast creature token with trample.\n−3: Each opponent discards two cards. For each opponent who didn't discard two nonland cards this way, you draw a card.","loyalty":"5","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const chromium = (): CardDef => ({"oracleId":"58d8ff36-4a4d-40e0-b812-3d23b2c7606a","name":"Chromium, the Mutable","manaCost":"{4}{W}{U}{B}","cmc":7,"typeLine":"Legendary Creature — Elder Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elder","Dragon"],"oracleText":"Flash\nThis spell can't be countered.\nFlying\nDiscard a card: Until end of turn, Chromium becomes a Human with base power and toughness 1/1, loses all abilities, and gains hexproof. It can't be blocked this turn.","power":"7","toughness":"7","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":["Flying","Flash"],"layout":"normal"}) as CardDef;
const pizza = (): CardDef => ({"oracleId":"e71479c9-bb38-4112-bf8a-41b39a3ade51","name":"Pizza Face, Gastromancer","manaCost":"{3}{B}{G}","cmc":5,"typeLine":"Legendary Artifact Creature — Food Mutant","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Food","Mutant"],"oracleText":"When Pizza Face enters, create a Food token.\nDisappear — At the beginning of your end step, if a permanent left the battlefield under your control this turn, put three +1/+1 counters on up to one other target artifact or creature. If it isn't a creature, it becomes a 0/0 Mutant creature in addition to its other types.\n{10}, {T}, Sacrifice Pizza Face: You gain 15 life.","power":"2","toughness":"4","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Disappear","Food"],"layout":"normal"}) as CardDef;
const spire = (): CardDef => ({"oracleId":"7d347d59-0cd5-4207-86cb-5d6244c7c70a","name":"Spire Mechcycle","manaCost":"{4}{R}","cmc":5,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Haste\nExhaust — Tap another untapped Mount or Vehicle you control: This Vehicle becomes an artifact creature. Put a +1/+1 counter on it for each Mount and/or Vehicle you control other than this Vehicle. (Activate each exhaust ability only once.)\nCrew 2","power":"5","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Haste","Crew","Exhaust"],"layout":"normal"}) as CardDef;

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bearC = (name = "Plain Bear", p = 2, t = 2) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t, { colors: ["G"] });
const elfC = (name = "Plain Elf", p = 1, t = 1) => vanilla(name, "Creature — Elf Druid", "{G}", 1, p, t, { colors: ["G"] });
const bolt = (name = "Test Bolt", n = 3) => card(name, "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: `${name} deals ${n} damage to any target.` });
const wreck = (name = "Test Wreck") => card(name, "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Destroy target creature." });
const growth = (name = "Test Growth") => card(name, "Instant", "{G}", { cmc: 1, colors: ["G"], oracleText: "Put a +1/+1 counter on target creature." });
const pacify = (name = "Test Pacify") => card(name, "Enchantment — Aura", "{W}", { cmc: 1, colors: ["W"], oracleText: "Enchant creature\nEnchanted creature gets +1/+0." });

describe("Lane B round 64", () => {
  it("are fully supported", () => {
    supported(moira(), antman(), ginger(), namor(), kaima(), dennick(), biblioplex(), tazri(), loli(), sarevok(), jared(), numa(), garruk(), chromium(), pizza(), spire());
  });

  it("Moira, Urborg Haunt: combat damage to a player returns a creature card put into your graveyard from the battlefield this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, moira());
    const died = putOnBattlefield(s0, ap, bearC("Dead Bear"));
    const old = toZone(s0, ap, bearC("Old Bear"), "graveyard");
    const w = toZone(s0, ap, wreck(), "hand");
    let s = settle(castNow(s0, ap, w, [tgt(died)]));
    expect(zone(s, died)).toBe("graveyard");
    s = goUntil(s, at("declareAttackers", ap));
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: m, defender: opp }] });
    s = goUntil(s, (x) => at("chooseTargets", ap)(x) || x.step === "end");
    expect(s.pending?.kind).toBe("chooseTargets");
    // The card that has been in the graveyard since before this turn isn't a legal target.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(old)] } as Action)).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(died)] } as Action);
    s = settle(s);
    expect(zone(s, died)).toBe("battlefield");
    expect(zone(s, old)).toBe("graveyard");
  });

  it("Ant-Man, Colony Commander: putting +1/+1 counters on a creature makes an Insect, only once each turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, antman());
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const g1 = toZone(s0, ap, growth(), "hand");
    const g2 = toZone(s0, ap, growth("Test Growth Two"), "hand");
    // Any creature, an opponent's too.
    let s = settle(castNow(s0, ap, g1, [tgt(theirs)]));
    expect(tokensNamed(s, ap, "Insect")).toHaveLength(1);
    s = settle(castNow(s, ap, g2, [tgt(theirs)]));
    expect(tokensNamed(s, ap, "Insect")).toHaveLength(1);
  });

  it("Ginger, Queen of Sweets: makes you the monarch, and at each upkeep while you're the monarch creates a Gingerbrute (a copy of the card)", () => {
    const { s: s0, ap } = setup([]);
    const g = toZone(s0, ap, ginger(), "hand");
    poolOnly(s0, ap, { C: 6 });
    let s = settle(castNow(s0, ap, g));
    expect(s.monarch).toBe(ap);
    // The next upkeep (an opponent's) creates one for Ginger's controller.
    s = goUntil(s, (x) => x.activePlayer !== ap && x.step === "upkeep" && !x.stack.length && !x.triggerQueue.length && tokensNamed(x, ap, "Gingerbrute").length > 0);
    const [tok] = tokensNamed(s, ap, "Gingerbrute");
    const o = s.objects[tok!]!;
    expect(nameOf(s, tok!)).toBe("Gingerbrute");
    expect(defOfTest(s, tok!).manaCost).toBe("{1}");
    expect(defOfTest(s, tok!).cmc).toBe(1);
    expect(characteristics(s, o).subtypes).toEqual(["Food", "Golem"]);
    expect(kw(s, tok!)).toContain("Haste");
    expect(pt(s, tok!)).toBe("1/1");
    expect(abilitiesOf(s, o).activated).toHaveLength(2);
  });

  it("Ginger, Queen of Sweets: no Gingerbrute at an upkeep when you aren't the monarch", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, ginger());
    s0.monarch = opp;
    const s = goUntil(s0, (x) => x.activePlayer !== ap && x.step === "draw");
    expect(tokensNamed(s, ap, "Gingerbrute")).toHaveLength(0);
  });

  it("Namor, Atlantean King: attacking a player with more life pumps the others attacking that player, not those attacking someone else", () => {
    const { s: s0, ap, opp } = setup([]);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const n = putOnBattlefield(s0, ap, namor());
    const a1 = putOnBattlefield(s0, ap, bearC("Bear One"));
    const a2 = putOnBattlefield(s0, ap, bearC("Bear Two"));
    s0.players[ap]!.life = 30;
    s0.players[opp]!.life = 35;
    s0.players[other]!.life = 35;
    let s = goUntil(s0, at("declareAttackers", ap));
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: n, defender: opp }, { attacker: a1, defender: opp }, { attacker: a2, defender: other }] });
    s = settle(s);
    expect(pt(s, a1)).toBe("4/2");
    expect(pt(s, a2)).toBe("2/2");
    expect(pt(s, n)).toBe("2/2");
  });

  it("Namor, Atlantean King: no trigger when the attacked player doesn't have more life than you", () => {
    const { s: s0, ap, opp } = setup([]);
    const n = putOnBattlefield(s0, ap, namor());
    const a1 = putOnBattlefield(s0, ap, bearC("Bear One"));
    s0.players[ap]!.life = 40;
    s0.players[opp]!.life = 40;
    let s = goUntil(s0, at("declareAttackers", ap));
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: n, defender: opp }, { attacker: a1, defender: opp }] });
    s = settle(s);
    expect(pt(s, a1)).toBe("2/2");
  });

  it("Kaima, the Fractured Calm: goads opponents' creatures enchanted by your Auras and grows for each", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kaima());
    const e1 = putOnBattlefield(s0, opp, bearC("Enchanted One"));
    const e2 = putOnBattlefield(s0, opp, bearC("Enchanted Two"));
    const plain = putOnBattlefield(s0, opp, bearC("Plain One"));
    const theirAura = putOnBattlefield(s0, opp, bearC("Their Enchanted"));
    const mine = putOnBattlefield(s0, ap, bearC("My Enchanted"));
    for (const [to, who] of [[e1, ap], [e2, ap], [theirAura, opp], [mine, ap]] as const) {
      const a = putOnBattlefield(s0, who, pacify(`Test Pacify ${to}`));
      s0.objects[a]!.attachedTo = to;
    }
    invalidateCharacteristics(s0);
    const s = goUntil(s0, (x) => x.activePlayer === ap && x.step === "end" && !x.stack.length && !x.triggerQueue.length && counters(x, k) > 0);
    const goaded = (id: string) => characteristics(s, s.objects[id]!).goadedBy.includes(ap);
    expect(goaded(e1)).toBe(true);
    expect(goaded(e2)).toBe(true);
    expect(goaded(plain)).toBe(false);
    expect(goaded(theirAura)).toBe(false);
    expect(counters(s, k)).toBe(2);
  });

  it("Dennick, Pious Apparition: creature cards put into any graveyard investigate, once each turn; tokens don't count", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = toZone(s0, ap, dennick(), "graveyard");
    poolOnly(s0, ap, { W: 3, U: 3 });
    let s = settle(run(s0, planCast(s0, ap, d, undefined, undefined, "auto", undefined, { face: 1, via: "disturb" })));
    expect(zone(s, d)).toBe("battlefield");
    const tokenBear = putOnBattlefield(s, opp, bearC("Token Bear"));
    s.objects[tokenBear]!.isToken = true;
    const w0 = toZone(s, ap, wreck("Test Wreck Zero"), "hand");
    s.players[ap]!.manaPool.B = 3;
    s = settle(castNow(s, ap, w0, [tgt(tokenBear)]));
    expect(tokensNamed(s, ap, "Clue")).toHaveLength(0);
    const theirs = putOnBattlefield(s, opp, bearC("Their Bear"));
    const theirs2 = putOnBattlefield(s, opp, bearC("Their Bear Two"));
    const w = toZone(s, ap, wreck(), "hand");
    const w2 = toZone(s, ap, wreck("Test Wreck Two"), "hand");
    s = settle(castNow(s, ap, w, [tgt(theirs)]));
    expect(tokensNamed(s, ap, "Clue")).toHaveLength(1);
    s = settle(castNow(s, ap, w2, [tgt(theirs2)]));
    expect(tokensNamed(s, ap, "Clue")).toHaveLength(1);
  });

  it("The Biblioplex: can be activated only with exactly zero or seven cards in hand", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, biblioplex());
    const hand = s0.players[ap]!.hand;
    onlyHand(s0, ap, hand.slice(0, 3));
    expect(planActivate(s0, ap, b, 0)).toBeNull();
    onlyHand(s0, ap, []);
    const top = toZone(s0, ap, card("Test Insight", "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." }), "library");
    let s = run(s0, planActivate(s0, ap, b, 0));
    s = settleMay(s, ap, () => true);
    expect(zone(s, top)).toBe("hand");
  });

  it("The Biblioplex: a card that isn't an instant or sorcery may go to the graveyard", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, biblioplex());
    onlyHand(s0, ap, []);
    const top = toZone(s0, ap, bearC("Top Bear"), "library");
    let s = run(s0, planActivate(s0, ap, b, 0));
    s = settleMay(s, ap, () => true);
    expect(zone(s, top)).toBe("graveyard");
  });

  it("Tazri, Beacon of Unity: up to two Cleric, Rogue, Warrior, Wizard and/or Ally cards from the top six", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tazri());
    const ids = [
      toZone(s0, ap, vanilla("Test Cleric", "Creature — Human Cleric", "{W}", 1, 1, 1), "library"),
      toZone(s0, ap, vanilla("Test Ally", "Creature — Kor Ally", "{W}", 1, 1, 1), "library"),
      toZone(s0, ap, bearC("Top Bear"), "library"),
    ];
    poolOnly(s0, ap, { U: 1, B: 1, R: 1, G: 1 });
    let s = run(s0, planActivate(s0, ap, t, 0));
    s = settle(s, (x) => x.pending?.kind === "searchLibrary");
    const p = s.pending!;
    expect(p.player).toBe(ap);
    // The bot takes what it can: the two matching cards, not the Bear.
    for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("hand");
    expect(zone(s, ids[1]!)).toBe("hand");
    expect(zone(s, ids[2]!)).toBe("library");
  });

  it("Lo and Li, Twin Tutors: Noble creatures you control and Lesson spells you control have lifelink", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, loli());
    const noble = putOnBattlefield(s0, ap, vanilla("Test Noble", "Creature — Human Noble", "{W}", 1, 1, 1));
    const theirNoble = putOnBattlefield(s0, opp, vanilla("Their Noble", "Creature — Human Noble", "{W}", 1, 1, 1));
    expect(kw(s0, noble)).toContain("Lifelink");
    expect(kw(s0, theirNoble)).not.toContain("Lifelink");
    const lesson = toZone(s0, ap, card("Test Lesson", "Sorcery — Lesson", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Lesson deals 3 damage to any target." }), "hand");
    const before = life(s0, ap);
    const s = settle(castNow(s0, ap, lesson, [ply(opp)]));
    expect(life(s, ap)).toBe(before + 3);
  });

  it("Sarevok, Deathbringer: at each end step, the active player loses life equal to its power unless a permanent left the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, sarevok());
    const before = life(s0, ap);
    let s = goUntil(s0, (x) => x.activePlayer !== ap);
    expect(life(s, ap)).toBe(before - 3);
    // On the next player's turn a creature dies: no life loss for them.
    const nxt = s.activePlayer;
    const theirs = putOnBattlefield(s, nxt, bearC("Their Bear"));
    moveObject(s, theirs, "graveyard");
    const theirLife = life(s, nxt);
    s = goUntil(s, (x) => x.activePlayer !== nxt);
    expect(life(s, nxt)).toBe(theirLife);
    expect(opp).toBeDefined();
  });

  it("Jared Carthalion, True Heir: an opponent becomes the monarch and you can't become it this turn; damage is prevented as counters while you're the monarch", () => {
    const { s: s0, ap, opp } = setup([]);
    const j = toZone(s0, ap, jared(), "hand");
    poolOnly(s0, ap, { R: 1, G: 1, W: 1 });
    s0.monarch = ap;
    let s = castNow(s0, ap, j);
    s = settle(s, at("chooseTargets", ap));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] } as Action);
    s = settle(s);
    expect(s.monarch).toBe(opp);
    // Becoming the monarch again this turn does nothing.
    const crown = toZone(s, ap, card("Test Crown", "Sorcery", "{W}", { cmc: 1, oracleText: "You become the monarch." }), "hand");
    s.players[ap]!.manaPool.W = 1;
    s = settle(castNow(s, ap, crown));
    expect(s.monarch).toBe(opp);
    // While you're the monarch: damage to it becomes +1/+1 counters.
    s.monarch = ap;
    invalidateCharacteristics(s);
    const bo = toZone(s, ap, bolt(), "hand");
    s.players[ap]!.manaPool.R = 1;
    s = settle(castNow(s, ap, bo, [tgt(j)]));
    expect(zone(s, j)).toBe("battlefield");
    expect(counters(s, j)).toBe(3);
    expect(s.objects[j]!.damage ?? 0).toBe(0);
  });

  it("Numa, Joraga Chieftain: pay {X}{X} at the beginning of combat to distribute X +1/+1 counters among Elves", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, numa());
    const e1 = putOnBattlefield(s0, ap, elfC("Elf One"));
    const e2 = putOnBattlefield(s0, ap, elfC("Elf Two"));
    const bear = putOnBattlefield(s0, ap, bearC());
    poolOnly(s0, ap, {});
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, card(`Test Grove ${i}`, "Land", "", { oracleText: "{T}: Add {G}." }));
    let s = goUntil(s0, (x) => x.pending?.kind === "chooseOption" && x.pending.player === ap);
    const p = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    // At most 2: {X}{X} with four mana.
    expect(p.options).toEqual(["none", "0", "1", "2"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "2" } as Action);
    s = goUntil(s, (x) => at("chooseMay", ap)(x));
    // {2}{2}: four mana, paid from the pool.
    s.players[ap]!.manaPool.G = 4;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = goUntil(s, (x) => at("chooseTargets", ap)(x));
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(bear)] } as Action)).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ ...tgt(e1), amount: 1 }, { ...tgt(e2), amount: 1 }] } as Action);
    s = settle(s);
    expect(counters(s, e1)).toBe(1);
    expect(counters(s, e2)).toBe(1);
    expect(s.players[ap]!.manaPool.G ?? 0).toBe(0);
  });

  it("Garruk, Veiled Butcher: −2 makes each player sacrifice a creature, and a Beast for you only if you sacrificed one", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, garruk());
    s0.objects[g]!.counters = { loyalty: 5 };
    const mine = putOnBattlefield(s0, ap, bearC("My Bear"));
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    let s = settle(run(s0, planActivate(s0, ap, g, 1)));
    expect(zone(s, mine)).toBe("graveyard");
    // Its first ability: an opponent's creature that would die is exiled instead.
    expect(zone(s, theirs)).toBe("exile");
    const beasts = tokensNamed(s, ap, "Beast");
    expect(beasts).toHaveLength(1);
    expect(kw(s, beasts[0]!)).toContain("Trample");
    expect(pt(s, beasts[0]!)).toBe("4/4");
  });

  it("Garruk, Veiled Butcher: −2 with no creature of yours to sacrifice makes no Beast", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, garruk());
    s0.objects[g]!.counters = { loyalty: 5 };
    putOnBattlefield(s0, opp, bearC("Their Bear"));
    const s = settle(run(s0, planActivate(s0, ap, g, 1)));
    expect(tokensNamed(s, ap, "Beast")).toHaveLength(0);
  });

  it("Garruk, Veiled Butcher: −3 draws a card for each opponent who didn't discard two nonland cards", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2, o3] = s0.turnOrder.filter((p) => p !== ap);
    const g = putOnBattlefield(s0, ap, garruk());
    s0.objects[g]!.counters = { loyalty: 5 };
    onlyHand(s0, o1!, []);
    toZone(s0, o1!, bearC("Their Bear A"), "hand");
    toZone(s0, o1!, bearC("Their Bear B"), "hand");
    onlyHand(s0, o2!, []);
    toZone(s0, o2!, bearC("Their Bear C"), "hand");
    toZone(s0, o2!, card("Test Land", "Land", "", { oracleText: "" }), "hand");
    onlyHand(s0, o3!, []);
    onlyHand(s0, ap, []);
    const s = settle(run(s0, planActivate(s0, ap, g, 2)));
    expect(s.players[o1!]!.hand).toHaveLength(0);
    expect(s.players[o2!]!.hand).toHaveLength(0);
    // Two of them (one discarded a land, one had nothing) didn't discard two nonland cards.
    expect(s.players[ap]!.hand).toHaveLength(2);
  });

  it("Chromium, the Mutable: discarding a card makes it a 1/1 Human with hexproof and no other abilities that can't be blocked", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, chromium());
    const blocker = putOnBattlefield(s0, opp, bearC("Their Bear"));
    onlyHand(s0, ap, []);
    const junk = toZone(s0, ap, bearC("Junk Bear"), "hand");
    const s = settle(run(s0, planActivate(s0, ap, c, 0, [], undefined, undefined, undefined, { discard: [junk] })));
    expect(zone(s, junk)).toBe("graveyard");
    const ch = characteristics(s, s.objects[c]!);
    expect(pt(s, c)).toBe("1/1");
    expect(ch.subtypes).toEqual(["Human"]);
    expect(ch.keywords).toContain("Hexproof");
    expect(ch.keywords).not.toContain("Flying");
    expect(ch.cantBeBlocked).toBe(true);
    expect(s.objects[blocker]).toBeDefined();
  });

  it("Pizza Face, Gastromancer: after a permanent left, three +1/+1 counters on an artifact that becomes a 0/0 Mutant creature", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, pizza());
    const rock = putOnBattlefield(s0, ap, card("Test Rock", "Artifact", "{2}", { cmc: 2, oracleText: "" }));
    const gone = putOnBattlefield(s0, ap, bearC("Gone Bear"));
    moveObject(s0, gone, "graveyard");
    let s = goUntil(s0, (x) => x.activePlayer === ap && x.step === "end" && at("chooseTargets", ap)(x));
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(rock)] } as Action);
    s = settle(s);
    const ch = characteristics(s, s.objects[rock]!);
    expect(ch.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(ch.subtypes).toContain("Mutant");
    expect(pt(s, rock)).toBe("3/3");
  });

  it("Pizza Face, Gastromancer: no trigger if no permanent left the battlefield under your control this turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, pizza());
    putOnBattlefield(s0, ap, card("Test Rock", "Artifact", "{2}", { cmc: 2, oracleText: "" }));
    let asked = false;
    goUntil(s0, (x) => (at("chooseTargets", ap)(x) ? (asked = true) : x.activePlayer !== ap));
    expect(asked).toBe(false);
  });

  it("Spire Mechcycle: exhaust by tapping another Vehicle: an artifact creature with a counter for each other Mount or Vehicle", () => {
    const { s: s0, ap } = setup([]);
    const sp = putOnBattlefield(s0, ap, spire());
    const v = putOnBattlefield(s0, ap, card("Test Wagon", "Artifact — Vehicle", "{2}", { cmc: 2, power: "3", toughness: "3", oracleText: "Crew 1" }));
    putOnBattlefield(s0, ap, vanilla("Test Steed", "Creature — Horse Mount", "{1}{W}", 2, 2, 2));
    const idx = abilitiesOf(s0, s0.objects[sp]!).activated.findIndex((a) => /^Exhaust/.test(a.text ?? "") || /Tap another untapped/.test(a.text ?? ""));
    expect(idx).toBeGreaterThanOrEqual(0);
    const plan = planActivate(s0, ap, sp, idx, [], undefined, undefined, undefined, { tap: [v] });
    let s = settle(run(s0, plan));
    expect(s.objects[v]!.tapped).toBe(true);
    expect(characteristics(s, s.objects[sp]!).types).toContain("Creature");
    expect(counters(s, sp)).toBe(2);
    expect(pt(s, sp)).toBe("7/6");
    // Exhaust: only once.
    s.objects[v]!.tapped = false;
    expect(planActivate(s, ap, sp, idx, [], undefined, undefined, undefined, { tap: [v] })).toBeNull();
  });
});
