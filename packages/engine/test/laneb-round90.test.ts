// Lane B, round 90: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): one-line
// templates.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, closeZoneBatch, controllerOf, destroyPermanent, invalidateCharacteristics, isFullySupported, planActivate, planCast, tapPermanent, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PendingDecision, type PlayerId, type TargetChoice } from "../src";
import { pt } from "./helpers";

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
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
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
/** An Aura put onto the battlefield attached to `host`. */
const attached = (s: GameState, pid: PlayerId, def: CardDef, host: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = host;
  invalidateCharacteristics(s);
  return id;
};
/** `pid` gets priority with the stack as it is: the players before them pass. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 4 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};

// Real oracle text (Scryfall).
const kavu = (): CardDef => ({"oracleId": "285c9f49-4aeb-468c-bb41-f5ccb5257e2b", "name": "Yavimaya Kavu", "manaCost": "{2}{R}{G}", "cmc": 4, "typeLine": "Creature — Kavu", "supertypes": [], "types": ["Creature"], "subtypes": ["Kavu"], "oracleText": "Yavimaya Kavu's power is equal to the number of red creatures on the battlefield.\nYavimaya Kavu's toughness is equal to the number of green creatures on the battlefield.", "power": "*", "toughness": "*", "colors": ["G", "R"], "colorIdentity": ["G", "R"], "keywords": [], "layout": "normal"}) as CardDef;
const emissary = (): CardDef => ({"oracleId": "034c2b40-6bcc-4bb5-be94-4602496ddcc6", "name": "Foul Emissary", "manaCost": "{2}{G}", "cmc": 3, "typeLine": "Creature — Human Horror", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Horror"], "oracleText": "When this creature enters, look at the top four cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in any order.\nWhen you sacrifice this creature while casting a spell with emerge, create a 3/2 colorless Eldrazi Horror creature token.", "power": "1", "toughness": "1", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"}) as CardDef;
const runeforge = (): CardDef => ({"oracleId": "2705a288-3b9d-4452-a320-28b86331aa09", "name": "Runeforge Champion", "manaCost": "{2}{W}", "cmc": 3, "typeLine": "Creature — Dwarf Warrior", "supertypes": [], "types": ["Creature"], "subtypes": ["Dwarf", "Warrior"], "oracleText": "When this creature enters, you may search your library and/or graveyard for a Rune card, reveal it, and put it into your hand. If you search your library this way, shuffle.\nYou may pay {1} rather than pay the mana cost for Rune spells you cast.", "power": "2", "toughness": "3", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"}) as CardDef;
const auditor = (): CardDef => ({"oracleId": "8c612741-2b30-43b3-bd3f-7df19662d298", "name": "Case File Auditor", "manaCost": "{2}{W}", "cmc": 3, "typeLine": "Creature — Human Detective", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Detective"], "oracleText": "When this creature enters and whenever you solve a Case, look at the top six cards of your library. You may reveal an enchantment card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.\nYou may spend mana as though it were mana of any color to cast Case spells.", "power": "1", "toughness": "4", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"}) as CardDef;
const vizier = (): CardDef => ({"oracleId": "cb5aa38e-6a76-4c0c-be14-3c546acd353d", "name": "Vizier of the Anointed", "manaCost": "{3}{U}", "cmc": 4, "typeLine": "Creature — Human Cleric", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Cleric"], "oracleText": "When this creature enters, you may search your library for a creature card with eternalize or embalm, put that card into your graveyard, then shuffle.\nWhenever you activate an eternalize or embalm ability, draw a card.", "power": "2", "toughness": "4", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const magistrate = (): CardDef => ({"oracleId": "ecd3ddd7-2fa8-466b-9319-ae51c744a05f", "name": "Magnanimous Magistrate", "manaCost": "{5}{W}", "cmc": 6, "typeLine": "Creature — Human Advisor", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Advisor"], "oracleText": "This creature enters with five reprieve counters on it.\nWhenever another nontoken creature you control dies, if its mana value was 1 or greater, you may remove that many reprieve counters from this creature. If you do, return that card to the battlefield under its owner's control.", "power": "3", "toughness": "4", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"}) as CardDef;
const mariaHill = (): CardDef => ({"oracleId": "a2d90efe-80f2-4069-b135-a8bd00ccd2b0", "name": "Agent Maria Hill", "manaCost": "{W}", "cmc": 1, "typeLine": "Legendary Creature — Human Spy Hero", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Spy", "Hero"], "oracleText": "Whenever Agent Maria Hill becomes tapped to pay a teamwork cost, put a +1/+1 counter on her and draw a card.", "power": "2", "toughness": "1", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"}) as CardDef;
const slug = (): CardDef => ({"oracleId": "1ce7f356-1f9b-44dc-9b05-f7b1ecc5d755", "name": "Giant Slug", "manaCost": "{1}{B}", "cmc": 2, "typeLine": "Creature — Slug", "supertypes": [], "types": ["Creature"], "subtypes": ["Slug"], "oracleText": "{5}: At the beginning of your next upkeep, choose a basic land type. This creature gains landwalk of the chosen type until the end of that turn. (It can't be blocked as long as defending player controls a land of that type.)", "power": "1", "toughness": "1", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"}) as CardDef;
const banish = (): CardDef => ({"oracleId": "1f18e63d-ab1f-426c-afd5-ce89433394ca", "name": "Banish into Fable", "manaCost": "{4}{W}{U}", "cmc": 6, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "When you cast this spell from your hand, copy it if you control an artifact, then copy it if you control an enchantment. You may choose new targets for the copies.\nReturn target nonland permanent to its owner's hand. You create a 2/2 white Knight creature token with vigilance.", "colors": ["U", "W"], "colorIdentity": ["U", "W"], "keywords": [], "layout": "normal"}) as CardDef;
const omnipresence = (): CardDef => ({"oracleId": "8dad1fa8-3533-4e3c-b9b3-fcd57b20a33d", "name": "Omnipresence", "manaCost": "{5}{G}{G}{G}", "cmc": 8, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "You may cast spells with mana value less than or equal to the number of creatures you control from your hand without paying their mana costs.", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"}) as CardDef;
const beastMode = (): CardDef => ({"oracleId": "a465f8a9-d5aa-4dfa-b674-7aa1798cb0bd", "name": "Beast Mode", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Teamwork 1 (As an additional cost to cast this spell, you may tap any number of creatures you control with total power 1 or more.)\nTarget creature gets +2/+2 and gains trample until end of turn. Also put a +1/+1 counter on that creature if this spell was cast using teamwork.", "colors": ["G"], "colorIdentity": ["G"], "keywords": ["Teamwork"], "layout": "normal"}) as CardDef;
const falcon = (): CardDef => ({"oracleId": "33b31fb0-71ce-408a-a256-2a5a3b085cb6", "name": "Case of the Filched Falcon", "manaCost": "{U}", "cmc": 1, "typeLine": "Enchantment — Case", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Case"], "oracleText": "When this Case enters, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nTo solve — You control three or more artifacts. (If unsolved, solve at the beginning of your end step.)\nSolved — {2}{U}, Sacrifice this Case: Put four +1/+1 counters on target noncreature artifact. It becomes a 0/0 Bird creature with flying in addition to its other types.", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Investigate", "Solved"], "layout": "case"}) as CardDef;
const runeOfFlight = (): CardDef => ({"oracleId": "829a4110-9209-45e9-b1a5-25e005711118", "name": "Rune of Flight", "manaCost": "{1}{U}", "cmc": 2, "typeLine": "Enchantment — Aura Rune", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura", "Rune"], "oracleText": "Enchant permanent\nWhen this Aura enters, draw a card.\nAs long as enchanted permanent is a creature, it has flying.\nAs long as enchanted permanent is an Equipment, it has \"Equipped creature has flying.\"", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Enchant"], "layout": "normal"}) as CardDef;
const deepFiend = (): CardDef => ({"oracleId": "4eafe717-4ba4-4901-8c67-11757230eb54", "name": "Elder Deep-Fiend", "manaCost": "{8}", "cmc": 8, "typeLine": "Creature — Eldrazi Octopus", "supertypes": [], "types": ["Creature"], "subtypes": ["Eldrazi", "Octopus"], "oracleText": "Flash\nEmerge {5}{U}{U} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, tap up to four target permanents.", "power": "5", "toughness": "6", "colors": [], "colorIdentity": ["U"], "keywords": ["Emerge", "Flash"], "layout": "normal"}) as CardDef;
const sacredCat = (): CardDef => ({"oracleId": "d85ea576-a794-44bf-b405-1f1c49477409", "name": "Sacred Cat", "manaCost": "{W}", "cmc": 1, "typeLine": "Creature — Cat", "supertypes": [], "types": ["Creature"], "subtypes": ["Cat"], "oracleText": "Lifelink\nEmbalm {W} ({W}, Exile this card from your graveyard: Create a token that's a copy of it, except it's a white Zombie Cat with no mana cost. Embalm only as a sorcery.)", "power": "1", "toughness": "1", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Lifelink", "Embalm"], "layout": "normal"}) as CardDef;
const bears = () => card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2", colors: ["G"] });
const goblin = () => card("Goblin Piker", "Creature — Goblin", "{1}{R}", { power: "2", toughness: "1", colors: ["R"] });
const giant = () => card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3", colors: ["R"] });
const relic = () => card("Test Relic", "Artifact", "{2}", { cmc: 2 });
const charm = () => card("Test Charm", "Enchantment", "{1}", { cmc: 1 });
const ogre = () => card("Test Ogre", "Creature — Ogre", "{2}{G}", { power: "3", toughness: "3", colors: ["G"] });

describe("Lane B round 90", () => {
  it("all of them are supported", () => {
    supported(kavu(), emissary(), runeforge(), auditor(), vizier(), magistrate(), mariaHill(), slug(), banish(), omnipresence());
  });

  it("Yavimaya Kavu: power counts the red creatures on the battlefield, toughness the green ones (two CDAs)", () => {
    const { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kavu());
    // It's red and green itself.
    expect(pt(s, k)).toBe("1/1");
    putOnBattlefield(s, opp, goblin());
    putOnBattlefield(s, ap, giant());
    expect(pt(s, k)).toBe("3/1");
    putOnBattlefield(s, opp, bears());
    expect(pt(s, k)).toBe("3/2");
  });

  it("Foul Emissary: sacrificed to cast a spell with emerge, it makes a 3/2 Eldrazi Horror; sacrificed otherwise, nothing", () => {
    const { s: s0, ap } = setup([]);
    const [fiend] = handOf(s0, ap, [deepFiend()]);
    const em = putOnBattlefield(s0, ap, emissary());
    // Emerge {5}{U}{U} less Foul Emissary's mana value 3: {2}{U}{U}.
    s0.players[ap]!.manaPool.U = 4;
    let s = castNow(s0, ap, fiend!, [{ kind: "none" }, { kind: "none" }, { kind: "none" }, { kind: "none" }], { alt: "emerge", sacrifice: [em] });
    expect(zone(s, em)).toBe("graveyard");
    // Its trigger resolves first, above the Deep-Fiend and its cast trigger.
    expect(s.stack.some((i) => i.sourceId === em)).toBe(true);
    s = settle(s);
    expect(onField(s, ap, "Eldrazi Horror Token").length + onField(s, ap, "Eldrazi Horror").length).toBe(1);
    expect(zone(s, fiend!)).toBe("battlefield");
  });

  it("Foul Emissary: a sacrifice that isn't part of casting a spell with emerge doesn't trigger it", () => {
    const { s: s0, ap } = setup([]);
    const em = putOnBattlefield(s0, ap, emissary());
    const stem = toZone(s0, ap, card("Test Altar", "Artifact", "{1}", { oracleText: "Sacrifice a creature: Draw a card." }), "hand");
    s0.objects[stem]!.zone = "battlefield";
    s0.players[ap]!.hand.splice(s0.players[ap]!.hand.indexOf(stem), 1);
    s0.battlefield.push(stem);
    invalidateCharacteristics(s0);
    const ix = abilityIndex(s0, stem, /Sacrifice a creature/);
    let s = run(s0, planActivate(s0, ap, stem, ix, [], undefined, undefined, undefined, { sacrifice: [em] }));
    s = settle(s);
    expect(zone(s, em)).toBe("graveyard");
    expect(onField(s, ap, "Eldrazi Horror Token").length + onField(s, ap, "Eldrazi Horror").length).toBe(0);
  });

  it("Runeforge Champion: finds a Rune card in the graveyard, and Rune spells may be cast for {1}", () => {
    const { s: s0, ap } = setup([]);
    const [champ] = handOf(s0, ap, [runeforge()]);
    const rune = toZone(s0, ap, runeOfFlight(), "graveyard");
    s0.players[ap]!.manaPool.W = 3;
    let s = settle(castNow(s0, ap, champ!), { me: [ap] });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = act(s, { type: "chooseOption", player: ap, choice: "graveyard" });
    expect(s.pending?.kind).toBe("searchLibrary");
    expect((s.pending as Extract<PendingDecision, { kind: "searchLibrary" }>).cards).toEqual([rune]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [rune] }));
    expect(hand(s, ap)).toContain(rune);
    // Rune of Flight for {1} rather than {1}{U}: generic mana only, and its mana value stays 2 (rulings).
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 };
    const champId = onField(s, ap, "Runeforge Champion")[0]!;
    const plan = planCast(s, ap, rune, [tgt(champId)], undefined, "auto", undefined, { alt: "genericMv" });
    expect(plan).not.toBeNull();
    const tappedBefore = s.battlefield.filter((id) => s.objects[id]!.tapped).length;
    s = settle(run(s, plan), { me: [ap] });
    // Only the {C} in the pool paid for it.
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped && id !== rune).length).toBe(tappedBefore);
    expect(s.players[ap]!.manaPool.C).toBe(0);
    expect(s.objects[rune]!.attachedTo).toBe(champId);
    expect(characteristics(s, s.objects[champId]!).keywords).toContain("Flying");
    // Not for a spell that isn't a Rune.
    const [other] = handOf(s, ap, [bears()]);
    s.players[ap]!.manaPool.C = 1;
    expect(planCast(s, ap, other!, [], undefined, "auto", undefined, { alt: "genericMv" })).toBeNull();
  });

  it("Case File Auditor: mana of any color pays for Case spells, not for other spells", () => {
    const { s, ap } = setup([]);
    for (const id of s.battlefield) if (controllerOf(s, s.objects[id]!) === ap) tapPermanent(s, s.objects[id]!);
    const [falconId, other] = handOf(s, ap, [falcon(), card("Test Ponder", "Sorcery", "{U}", { oracleText: "Draw a card." })]);
    s.players[ap]!.manaPool.W = 1;
    expect(planCast(s, ap, falconId!, [])).toBeNull();
    putOnBattlefield(s, ap, auditor());
    expect(planCast(s, ap, falconId!, [])).not.toBeNull();
    expect(planCast(s, ap, other!, [])).toBeNull();
  });

  it("Case File Auditor: when you solve a Case, look at the top six cards for an enchantment card", () => {
    const { s: s0, ap } = setup([]);
    handOf(s0, ap, []);
    putOnBattlefield(s0, ap, auditor());
    const caseId = putOnBattlefield(s0, ap, falcon());
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, relic());
    const top = toZone(s0, ap, charm(), "library");
    let s = passUntil(s0, "end", ap);
    s = settle(s, { me: [ap] });
    expect(s.objects[caseId]!.solved).toBe(true);
    const p = s.pending as Extract<PendingDecision, { kind: "searchLibrary" }>;
    expect(p.kind).toBe("searchLibrary");
    expect(p.source).toBe("Case File Auditor");
    expect(p.cards).toEqual([top]);
    expect(p.dig?.looked.length).toBe(6);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top] }), { me: [ap] });
    expect(hand(s, ap)).toEqual([top]);
    // The other five went to the bottom.
    expect(s.players[ap]!.library.slice(-5).every((id) => p.dig!.looked.includes(id))).toBe(true);
    expect(s.pending).toBeNull();
  });

  it("Vizier of the Anointed: puts a creature card with embalm into your graveyard; activating embalm draws a card first", () => {
    const { s: s0, ap } = setup([]);
    const [viz] = handOf(s0, ap, [vizier()]);
    const cat = toZone(s0, ap, sacredCat(), "library");
    s0.players[ap]!.library.splice(0, 1);
    s0.players[ap]!.library.splice(20, 0, cat);
    s0.players[ap]!.manaPool.U = 4;
    let s = settle(castNow(s0, ap, viz!), { me: [ap] });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    const p = s.pending as Extract<PendingDecision, { kind: "searchLibrary" }>;
    expect(p.kind).toBe("searchLibrary");
    // Only the card with embalm (the deck's Bears and Forests have neither).
    expect(p.cards).toEqual([cat]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [cat] }), { me: [ap] });
    expect(zone(s, cat)).toBe("graveyard");
    // Embalm {W}: the draw resolves before the token is made (rulings).
    const before = hand(s, ap).length;
    s.players[ap]!.manaPool.W = 1;
    const ix = abilityIndex(s, cat, /^Embalm/);
    s = run(s, planActivate(s, ap, cat, ix, []));
    expect(s.stack.length).toBe(2);
    expect(s.stack[s.stack.length - 1]!.sourceId).not.toBe(cat);
    s = priorityTo(s, ap);
    s = act(s, { type: "passPriority", player: ap });
    for (let i = 0; i < 3; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(hand(s, ap).length).toBe(before + 1);
    expect(onField(s, ap, "Sacred Cat").length).toBe(0);
    s = settle(s);
    expect(onField(s, ap, "Sacred Cat").length).toBe(1);
  });

  it("Magnanimous Magistrate: removes reprieve counters equal to the dead creature's mana value to return it", () => {
    const { s: s0, ap, opp } = setup([]);
    const mag = putOnBattlefield(s0, ap, magistrate());
    s0.objects[mag]!.counters.reprieve = 5;
    const ogreId = putOnBattlefield(s0, ap, ogre());
    destroyPermanent(s0, s0.objects[ogreId]!, "test");
    closeZoneBatch(s0);
    let s = settle(s0, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
    expect(counters(s, mag, "reprieve")).toBe(2);
    expect(zone(s, ogreId)).toBe("battlefield");
    // Two left: a mana value 3 creature can't be paid for, so it stays dead.
    const again = onField(s, ap, "Test Ogre")[0]!;
    destroyPermanent(s, s.objects[again]!, "test");
    closeZoneBatch(s);
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind ?? null).not.toBe("chooseMay");
    s = settle(s);
    expect(counters(s, mag, "reprieve")).toBe(2);
    expect(zone(s, again)).toBe("graveyard");
    // Not tokens, not a mana value 0 creature, not an opponent's creature.
    const zero = putOnBattlefield(s, ap, card("Test Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2" }));
    const theirs = putOnBattlefield(s, opp, bears());
    destroyPermanent(s, s.objects[zero]!, "test");
    destroyPermanent(s, s.objects[theirs]!, "test");
    closeZoneBatch(s);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
  });

  it("Agent Maria Hill: tapped to pay a teamwork cost, she gets a +1/+1 counter and you draw; tapped another way, nothing", () => {
    const { s: s0, ap } = setup([]);
    const [mode] = handOf(s0, ap, [beastMode()]);
    const hill = putOnBattlefield(s0, ap, mariaHill());
    const bear = putOnBattlefield(s0, ap, bears());
    s0.players[ap]!.manaPool.G = 2;
    let s = castNow(s0, ap, mode!, [tgt(bear)], { teamwork: [hill] });
    expect(s.objects[hill]!.tapped).toBe(true);
    s = settle(s);
    expect(counters(s, hill, "+1/+1")).toBe(1);
    expect(hand(s, ap).length).toBe(1);
    expect(counters(s, bear, "+1/+1")).toBe(1);
    // Tapped by an effect: no trigger.
    s.objects[hill]!.tapped = false;
    tapPermanent(s, s.objects[hill]!);
    expect(s.triggerQueue.length).toBe(0);
  });

  it("Giant Slug: at your next upkeep you choose a basic land type, and it has that landwalk until the end of that turn", () => {
    const { s: s0, ap } = setup([]);
    handOf(s0, ap, []);
    const sl = putOnBattlefield(s0, ap, slug());
    s0.players[ap]!.manaPool.C = 5;
    let s = settle(run(s0, planActivate(s0, ap, sl, 0, [])));
    expect(s.delayed?.length).toBeGreaterThan(0);
    // Not this turn.
    expect(characteristics(s, s.objects[sl]!).keywords.some((k) => /walk$/.test(k))).toBe(false);
    s = passUntil(act(s, { type: "passPriority", player: waitingOn(s)! }), "upkeep", ap);
    s = settle(s, { me: [ap] });
    const p = s.pending as Extract<PendingDecision, { kind: "chooseOption" }>;
    expect(p.kind).toBe("chooseOption");
    expect(p.what).toBe("basicLandType");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Island" }), { me: [ap] });
    expect(characteristics(s, s.objects[sl]!).keywords).toContain("Islandwalk");
    // Gone at the end of that turn.
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(characteristics(s, s.objects[sl]!).keywords.some((k) => /walk$/.test(k))).toBe(false);
  });

  it("Banish into Fable: cast from your hand, one copy for an artifact you control and one for an enchantment you control", () => {
    const { s: s0, ap, opp } = setup([]);
    const [b] = handOf(s0, ap, [banish()]);
    putOnBattlefield(s0, ap, relic());
    putOnBattlefield(s0, ap, charm());
    const a = putOnBattlefield(s0, opp, bears());
    const c = putOnBattlefield(s0, opp, giant());
    const d = putOnBattlefield(s0, opp, ogre());
    s0.players[ap]!.manaPool = { W: 1, U: 1, B: 0, R: 0, G: 0, C: 4 };
    let s = castNow(s0, ap, b!, [tgt(a)]);
    // The copy trigger, then each copy may get a new target.
    s = settle(s, { me: [ap] });
    const targets: string[] = [c, d];
    for (let i = 0; i < 4 && s.pending; i++) {
      const pend = s.pending;
      if (pend.kind === "copyTargets") s = settle(act(s, { type: "copyTargets", player: ap, targets: [tgt(targets.shift()!)] }), { me: [ap] });
      else if (pend.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
      else throw new Error(`asked ${pend.kind}`);
    }
    s = settle(s);
    expect([a, c, d].map((id) => zone(s, id))).toEqual(["hand", "hand", "hand"]);
    expect(onField(s, ap, "Knight Token").length + onField(s, ap, "Knight").length).toBe(3);
  });

  it("Banish into Fable: with neither an artifact nor an enchantment, no copies", () => {
    const { s: s0, ap, opp } = setup([]);
    const [b] = handOf(s0, ap, [banish()]);
    const a = putOnBattlefield(s0, opp, bears());
    s0.players[ap]!.manaPool = { W: 1, U: 1, B: 0, R: 0, G: 0, C: 4 };
    const s = settle(castNow(s0, ap, b!, [tgt(a)]));
    expect(zone(s, a)).toBe("hand");
    expect(onField(s, ap, "Knight Token").length + onField(s, ap, "Knight").length).toBe(1);
  });

  it("Omnipresence: spells from your hand with mana value up to the number of creatures you control are free", () => {
    const { s, ap } = setup([]);
    for (const id of s.battlefield) if (controllerOf(s, s.objects[id]!) === ap) tapPermanent(s, s.objects[id]!);
    putOnBattlefield(s, ap, omnipresence());
    const [two, three] = handOf(s, ap, [bears(), ogre()]);
    expect(planCast(s, ap, two!, [], undefined, "auto", undefined, { alt: "payZero" })).toBeNull();
    putOnBattlefield(s, ap, bears());
    putOnBattlefield(s, ap, bears());
    const plan = planCast(s, ap, two!, [], undefined, "auto", undefined, { alt: "payZero" });
    expect(plan).not.toBeNull();
    expect(planCast(s, ap, three!, [], undefined, "auto", undefined, { alt: "payZero" })).toBeNull();
    const after = settle(run(s, plan));
    expect(zone(after, two!)).toBe("battlefield");
  });
});
