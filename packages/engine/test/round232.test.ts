// Round 232: cards from the top of the popularity list. Hoarding Dragon (a search's exile linked to a dies ability);
// The Clone Saga ("a creature with the chosen name" in a delayed trigger); From the Ashes and Krenko's Buzzcrusher ("for
// each land destroyed this way, its controller may search"); Instrument of the Bards ("if that card is legendary" between
// the search and the shuffle); Sidequest: Hunt the Mark ("a creature died under an opponent's control this turn");
// Ultimecia, Time Sorceress ("pay ... and exile eight cards from your graveyard"); Dovescape ("the spell's mana value");
// Geier Reach Bandit's back face ("Whenever a Werewolf you control enters, you may transform it"); Mass Polymorph; The
// Princess Takes Flight (a chapter returning what an earlier chapter exiled).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, closeZoneBatch, destroyPermanent, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/**
 * Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; other
 * players' questions are answered as the bots would. Stops at any other question of `me`'s.
 */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]?.zone;
/** Moves the hand to the library, so cleanup asks for no discards. */
const trimHand = (s: GameState, pid: PlayerId) => {
  const p = s.players[pid]!;
  for (const id of p.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
};
/** Taps everything a player controls, then gives them exactly this mana. */
const poolOnly = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid) s.objects[id]!.tapped = true;
  Object.assign(s.players[pid]!.manaPool, mana);
};
/** Declares attackers, then passes (no blocks) until `me` has a question or combat ends. */
const attack = (s: GameState, me: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[]) => {
  s = passUntil(s, "declareAttackers", me);
  s = act(s, { type: "declareAttackers", player: me, attacks });
  for (let i = 0; i < 80 && s.step !== "endCombat" && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p && p.player === me) return s;
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Replaces a player's library with fresh copies of `def`. */
const libraryOf = (s: GameState, pid: PlayerId, def: CardDef, n: number) => {
  const p = s.players[pid]!;
  for (const id of p.library.splice(0)) {
    s.objects[id]!.zone = "exile";
    p.exile.push(id);
  }
  return Array.from({ length: n }, () => into(s, pid, def, "library"));
};

// Real oracle text (Scryfall).
const hoard = card("Hoarding Dragon", "Creature — Dragon", "{3}{R}{R}", {"power": "4", "toughness": "4", "keywords": ["Flying"], "oracleText": "Flying\nWhen this creature enters, you may search your library for an artifact card, exile it, then shuffle.\nWhen this creature dies, you may put the exiled card into its owner's hand."});
const clone = card("The Clone Saga", "Enchantment — Saga", "{3}{U}", {"keywords": ["Surveil"], "oracleText": "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Surveil 3.\nII — When you next cast a creature spell this turn, copy it, except the copy isn't legendary.\nIII — Choose a card name. Whenever a creature with the chosen name deals combat damage to a player this turn, draw a card."});
const ashes = card("From the Ashes", "Sorcery", "{3}{R}", {"oracleText": "Destroy all nonbasic lands. For each land destroyed this way, its controller may search their library for a basic land card and put it onto the battlefield. Then each player who searched their library this way shuffles."});
const buzz = card("Krenko's Buzzcrusher", "Artifact Creature — Insect Thopter", "{2}{R}{R}", {"power": "4", "toughness": "4", "keywords": ["Flying", "Trample"], "oracleText": "Flying, trample\nWhen this creature enters, for each player, destroy up to one nonbasic land that player controls. For each land destroyed this way, its controller may search their library for a basic land card, put it onto the battlefield tapped, then shuffle."});
const bards = card("Instrument of the Bards", "Legendary Artifact", "{G}", {"keywords": ["Treasure"], "oracleText": "At the beginning of your upkeep, you may put a harmony counter on Instrument of the Bards.\n{3}{G}, {T}: Search your library for a creature card with mana value equal to the number of harmony counters on Instrument of the Bards, reveal it, and put it into your hand. If that card is legendary, create a Treasure token. Then shuffle."});
const dove = card("Dovescape", "Enchantment", "{3}{W/U}{W/U}{W/U}", {"oracleText": "({W/U} can be paid with either {W} or {U}.)\nWhenever a player casts a noncreature spell, counter that spell. That player creates X 1/1 white and blue Bird creature tokens with flying, where X is the spell's mana value."});
const polymorph = card("Mass Polymorph", "Sorcery", "{5}{U}", {"oracleText": "Exile all creatures you control, then reveal cards from the top of your library until you reveal that many creature cards. Put all creature cards revealed this way onto the battlefield, then shuffle the rest of the revealed cards into your library."});
const wave = card("Wave of Vitriol", "Sorcery", "{5}{G}{G}", {"oracleText": "Each player sacrifices all artifacts, enchantments, and nonbasic lands they control. For each land sacrificed this way, its controller may search their library for a basic land card and put it onto the battlefield tapped. Then each player who searched their library this way shuffles."});
const princess = card("The Princess Takes Flight", "Enchantment — Saga", "{2}{W}", {"oracleText": "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Exile up to one target creature.\nII — Target creature you control gets +2/+2 and gains flying until end of turn.\nIII — Return the exiled card to the battlefield under its owner's control."});
const hunt = (): CardDef => ({"oracleId":"d74f9a18-8dab-4549-be3f-9697ff68d73c","name":"Sidequest: Hunt the Mark // Yiazmat, Ultimate Mark","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Enchantment // Legendary Creature — Dragon","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, destroy up to one target creature.\nAt the beginning of your end step, if a creature died under an opponent's control this turn, create a Treasure token. Then if you control three or more Treasures, transform this enchantment.","colors":["B"],"colorIdentity":["B"],"keywords":["Transform","Treasure"],"layout":"transform","faces":[{"name":"Sidequest: Hunt the Mark","manaCost":"{3}{B}{B}","typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, destroy up to one target creature.\nAt the beginning of your end step, if a creature died under an opponent's control this turn, create a Treasure token. Then if you control three or more Treasures, transform this enchantment.","colors":["B"]},{"name":"Yiazmat, Ultimate Mark","manaCost":"","typeLine":"Legendary Creature — Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"{1}{B}, Sacrifice another creature or artifact: Yiazmat gains indestructible until end of turn. Tap it.","power":"5","toughness":"6","colors":["B"],"colorIndicator":["B"]}]}) as CardDef;
const ultimecia = (): CardDef => ({"oracleId":"70773879-b773-4e81-99ca-8f4bba478962","name":"Ultimecia, Time Sorceress // Ultimecia, Omnipotent","manaCost":"{3}{U}{B}","cmc":5,"typeLine":"Legendary Creature — Human Warlock // Legendary Creature — Nightmare Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"Whenever Ultimecia enters or attacks, surveil 2. (Look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)\nAt the beginning of your end step, you may pay {4}{U}{U}{B}{B} and exile eight cards from your graveyard. If you do, transform Ultimecia.","power":"4","toughness":"5","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Surveil","Transform","Menace","Time Compression"],"layout":"transform","faces":[{"name":"Ultimecia, Time Sorceress","manaCost":"{3}{U}{B}","typeLine":"Legendary Creature — Human Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"Whenever Ultimecia enters or attacks, surveil 2. (Look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)\nAt the beginning of your end step, you may pay {4}{U}{U}{B}{B} and exile eight cards from your graveyard. If you do, transform Ultimecia.","power":"4","toughness":"5","colors":["B","U"]},{"name":"Ultimecia, Omnipotent","manaCost":"","typeLine":"Legendary Creature — Nightmare Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Nightmare","Warlock"],"oracleText":"Menace (This creature can't be blocked except by two or more creatures.)\nTime Compression — When this creature transforms into Ultimecia, Omnipotent, take an extra turn after this one.","power":"7","toughness":"7","colors":["B","U"],"colorIndicator":["B","U"]}]}) as CardDef;
const bandit = (): CardDef => ({"oracleId":"64720167-b88b-47f7-bfc1-d5e005c9fd68","name":"Geier Reach Bandit // Vildin-Pack Alpha","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Rogue Werewolf // Creature — Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue","Werewolf"],"oracleText":"Haste\nAt the beginning of each upkeep, if no spells were cast last turn, transform this creature.","power":"3","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Transform","Haste"],"layout":"transform","faces":[{"name":"Geier Reach Bandit","manaCost":"{2}{R}","typeLine":"Creature — Human Rogue Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue","Werewolf"],"oracleText":"Haste\nAt the beginning of each upkeep, if no spells were cast last turn, transform this creature.","power":"3","toughness":"2","colors":["R"]},{"name":"Vildin-Pack Alpha","manaCost":"","typeLine":"Creature — Werewolf","supertypes":[],"types":["Creature"],"subtypes":["Werewolf"],"oracleText":"Whenever a Werewolf you control enters, you may transform it.\nAt the beginning of each upkeep, if a player cast two or more spells last turn, transform this creature.","power":"4","toughness":"3","colors":["R"],"colorIndicator":["R"]}]}) as CardDef;
const banner = (): CardDef => ({"oracleId":"b6c0ee14-2028-4e8b-9acd-ff78821bca9b","name":"Bruce Banner // The Incredible Hulk","manaCost":"{U}","cmc":1,"typeLine":"Legendary Creature — Human Scientist Hero // Legendary Creature — Gamma Berserker Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scientist","Hero"],"oracleText":"{X}{X}, {T}: Draw X cards. Activate only as a sorcery.\n{2}{R}{R}{G}{G}: Transform Bruce Banner. Activate only as a sorcery.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["G","R","U"],"keywords":["Reach","Enrage","Transform","Trample"],"layout":"modal_dfc","faces":[{"name":"Bruce Banner","manaCost":"{U}","typeLine":"Legendary Creature — Human Scientist Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scientist","Hero"],"oracleText":"{X}{X}, {T}: Draw X cards. Activate only as a sorcery.\n{2}{R}{R}{G}{G}: Transform Bruce Banner. Activate only as a sorcery.","power":"1","toughness":"1","colors":["U"]},{"name":"The Incredible Hulk","manaCost":"{2}{R}{R}{G}{G}","typeLine":"Legendary Creature — Gamma Berserker Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Gamma","Berserker","Hero"],"oracleText":"Reach, trample\nEnrage — Whenever The Incredible Hulk is dealt damage, put a +1/+1 counter on him. If he's attacking, untap him and there is an additional combat phase after this phase.","power":"8","toughness":"8","colors":["G","R"]}]}) as CardDef;
// Helpers.
const relic = card("Test Relic", "Artifact", "{2}", { oracleText: "{T}: You gain 1 life." });
const idol = card("Test Idol", "Artifact", "{3}", { oracleText: "{T}: Add {C}." });
const vault = card("Test Vault", "Land", "", { oracleText: "{T}: Add {C}." });
const tower = card("Test Tower", "Land", "", { oracleText: "{T}: Add {C}." });
const legend = card("Test Legend", "Legendary Creature — Human", "{1}{G}", { power: "2", toughness: "2" });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const unstoppable = card("Test Unstoppable", "Sorcery", "{1}{U}", { oracleText: "This spell can't be countered.\nDraw a card." });
const treasure = card("Treasure", "Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this artifact: Add one mana of any color." });
const wolf = card("Test Wolf", "Creature — Wolf", "{1}{G}", { power: "2", toughness: "2" });
const treasures = (s: GameState) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Treasure"));
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).types.includes("Land") && s.objects[id]!.controller === pid);

describe("round 232: parse", () => {
  it("every card of the round is fully supported", () => supported(hoard, clone, ashes, wave, buzz, bards, dove, polymorph, princess, hunt(), ultimecia(), bandit(), banner()));
});

describe("round 232: Hoarding Dragon", () => {
  it("exiles the artifact it finds and puts that card into its owner's hand when it dies", () => {
    let { s, ap, ids } = setup([hoard]);
    const r = into(s, ap, relic, "library");
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: [r] });
    s = settle(s);
    expect(zone(s, r)).toBe("exile");
    destroyPermanent(s, s.objects[ids[0]!]!, "Hoarding Dragon is destroyed.");
    closeZoneBatch(s);
    s = settle(s);
    expect(zone(s, r)).toBe("hand");
    expect(s.players[ap]!.hand).toContain(r);
  });

  it("each Dragon has its own hoard (rulings): only the one that died gives its card back", () => {
    let { s, ap, ids } = setup([hoard, hoard]);
    const r = into(s, ap, relic, "library");
    const i = into(s, ap, idol, "library");
    s.players[ap]!.manaPool.R = 5;
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    s = act(s, { type: "searchLibrary", player: ap, found: [r] });
    s = settle(s);
    s = run(s, planCast(s, ap, ids[1]!));
    s = settle(s);
    s = act(s, { type: "searchLibrary", player: ap, found: [i] });
    s = settle(s);
    expect([zone(s, r), zone(s, i)]).toEqual(["exile", "exile"]);
    destroyPermanent(s, s.objects[ids[1]!]!, "Hoarding Dragon is destroyed.");
    closeZoneBatch(s);
    s = settle(s);
    expect([zone(s, r), zone(s, i)]).toEqual(["exile", "hand"]);
  });
});

describe("round 232: The Clone Saga", () => {
  it("III: a creature with the chosen name dealing combat damage to a player this turn draws a card, anyone's creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const saga = putOnBattlefield(s0, ap, clone);
    s0.objects[saga]!.counters = { lore: 2 };
    const b = putOnBattlefield(s0, ap, bear());
    const w = putOnBattlefield(s0, ap, wolf);
    trimHand(s0, ap);
    let s = passUntil(passUntil(s0, "end", ap), "main1", ap);
    s = settle(s);
    expect(s.pending?.kind).toBe("chooseOption");
    // The bot names its own creature that can attack.
    const bot = botActions(s, ap)[0]!;
    expect(bot.type === "chooseOption" && ["Grizzly Bears", "Test Wolf"].includes(String(bot.choice))).toBe(true);
    s = act(s, { type: "chooseOption", player: ap, choice: "Grizzly Bears" });
    s = settle(s);
    expect(zone(s, saga)).toBe("graveyard");
    // The name is kept with the delayed trigger, the Saga gone.
    expect(JSON.stringify(s.floatingTriggers)).toContain('"named":"Grizzly Bears"');
    const hand = s.players[ap]!.hand.length;
    s = attack(s, ap, [b, w].map((attacker) => ({ attacker, defender: opp })));
    s = settle(s, { me: ap });
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("III: the delayed trigger ends with the turn", () => {
    const { s: s0, ap } = setup([]);
    const saga = putOnBattlefield(s0, ap, clone);
    s0.objects[saga]!.counters = { lore: 2 };
    putOnBattlefield(s0, ap, bear());
    trimHand(s0, ap);
    let s = passUntil(passUntil(s0, "end", ap), "main1", ap);
    s = settle(s);
    s = act(s, { type: "chooseOption", player: ap, choice: "Grizzly Bears" });
    s = settle(s);
    expect(s.floatingTriggers?.length).toBe(1);
    trimHand(s, ap);
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "upkeep", next);
    expect(s.floatingTriggers?.length ?? 0).toBe(0);
  });
});

describe("round 232: From the Ashes", () => {
  it("destroys every nonbasic land; each controller may search for a basic land for each of theirs, untapped", () => {
    let { s, ap, opp, ids } = setup([ashes]);
    const mine = putOnBattlefield(s, ap, vault);
    const t1 = putOnBattlefield(s, opp, vault);
    const t2 = putOnBattlefield(s, opp, tower);
    const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    const thirdLib = s.players[third]!.library.length;
    const before = { me: lands(s, ap).length, opp: lands(s, opp).length };
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { me: ap });
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.max).toBe(1);
    s = act(s, { type: "searchLibrary", player: ap, found: [p.cards[0]!] });
    s = settle(s, { me: ap });
    expect([zone(s, mine), zone(s, t1), zone(s, t2)]).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(lands(s, ap).length).toBe(before.me);
    // The opponent lost two, so it found two Forests, untapped.
    expect(lands(s, opp).length).toBe(before.opp);
    expect(lands(s, opp).every((id) => !s.objects[id]!.tapped)).toBe(true);
    // A player who lost no land doesn't search.
    expect(s.players[third]!.library.length).toBe(thirdLib);
  });
});

describe("round 232: Wave of Vitriol", () => {
  it("each player sacrifices artifacts, enchantments and nonbasic lands; one tapped basic land for each land sacrificed", () => {
    let { s, ap, opp, ids } = setup([wave]);
    const r = putOnBattlefield(s, ap, relic);
    const mine = putOnBattlefield(s, ap, vault);
    const t1 = putOnBattlefield(s, opp, vault);
    const t2 = putOnBattlefield(s, opp, tower);
    const ench = putOnBattlefield(s, opp, card("Test Field", "Enchantment", "{1}{W}", { oracleText: "Creatures you control get +0/+1." }));
    const before = { me: lands(s, ap).length, opp: lands(s, opp).length };
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { me: ap });
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.kind).toBe("searchLibrary");
    expect(p.max).toBe(1);
    s = act(s, { type: "searchLibrary", player: ap, found: [p.cards[0]!] });
    s = settle(s, { me: ap });
    expect([r, mine, t1, t2, ench].map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard", "graveyard", "graveyard"]);
    expect(lands(s, ap).length).toBe(before.me);
    expect(lands(s, opp).length).toBe(before.opp);
    expect(lands(s, opp).every((id) => s.objects[id]!.tapped)).toBe(true);
    expect(s.objects[p.cards[0]!]!.tapped).toBe(true);
  });
});

describe("round 232: Krenko's Buzzcrusher", () => {
  it("you choose up to one nonbasic land of each player's; each controller may search for a tapped basic land", () => {
    let { s, ap, opp, ids } = setup([buzz]);
    const mine = putOnBattlefield(s, ap, vault);
    const t1 = putOnBattlefield(s, opp, vault);
    const t2 = putOnBattlefield(s, opp, tower);
    const oppLands = lands(s, opp).length;
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { me: ap });
    // You first: none of your own (the bot keeps its own too).
    let p = s.pending as Extract<GameState["pending"], { kind: "pickPermanents" }>;
    expect(p.kind).toBe("pickPermanents");
    expect(p.player).toBe(ap);
    expect(p.options).toEqual([mine]);
    expect(botActions(s, ap)[0]).toEqual({ type: "pickPermanents", player: ap, ids: [] });
    s = act(s, { type: "pickPermanents", player: ap, ids: [] });
    p = s.pending as Extract<GameState["pending"], { kind: "pickPermanents" }>;
    expect(p.player).toBe(ap);
    expect(p.of).toBe(opp);
    expect([...p.options].sort()).toEqual([t1, t2].sort());
    s = act(s, { type: "pickPermanents", player: ap, ids: [t2] });
    s = settle(s, { me: ap });
    expect([zone(s, mine), zone(s, t1), zone(s, t2)]).toEqual(["battlefield", "battlefield", "graveyard"]);
    // The opponent's bot searched for one basic land, put onto the battlefield tapped.
    expect(lands(s, opp).length).toBe(oppLands);
    const found = lands(s, opp).find((id) => id !== t1)!;
    expect(characteristics(s, s.objects[found]!).supertypes).toContain("Basic");
    expect(s.objects[found]!.tapped).toBe(true);
  });

  it("the bot picks an opponent's nonbasic land", () => {
    let { s, ap, opp, ids } = setup([buzz]);
    const t1 = putOnBattlefield(s, opp, vault);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { me: ap });
    const p = s.pending as Extract<GameState["pending"], { kind: "pickPermanents" }>;
    expect(p.of).toBe(opp);
    expect(botActions(s, ap)[0]).toEqual({ type: "pickPermanents", player: ap, ids: [t1] });
  });
});

describe("round 232: Instrument of the Bards", () => {
  it("finds a creature card with mana value equal to its harmony counters; a legendary one makes a Treasure", () => {
    let { s, ap } = setup([]);
    const inst = putOnBattlefield(s, ap, bards);
    s.objects[inst]!.counters = { harmony: 2 };
    const l = into(s, ap, legend, "library");
    const big = into(s, ap, card("Test Giant", "Creature — Giant", "{4}{G}", { power: "5", toughness: "5" }), "library");
    s = run(s, planActivate(s, ap, inst, 0));
    s = settle(s);
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.kind).toBe("searchLibrary");
    expect(p.cards).toContain(l);
    expect(p.cards).not.toContain(big);
    s = act(s, { type: "searchLibrary", player: ap, found: [l] });
    s = settle(s);
    expect(zone(s, l)).toBe("hand");
    expect(treasures(s).length).toBe(1);
  });

  it("a nonlegendary creature card makes no Treasure", () => {
    let { s, ap } = setup([]);
    const inst = putOnBattlefield(s, ap, bards);
    s.objects[inst]!.counters = { harmony: 2 };
    const b = into(s, ap, bear(), "library");
    s = run(s, planActivate(s, ap, inst, 0));
    s = settle(s);
    s = act(s, { type: "searchLibrary", player: ap, found: [b] });
    s = settle(s);
    expect(zone(s, b)).toBe("hand");
    expect(treasures(s).length).toBe(0);
  });
});

describe("round 232: Sidequest: Hunt the Mark", () => {
  it("makes a Treasure at your end step if an opponent's creature died this turn, then transforms with three Treasures", () => {
    let { s, ap, opp } = setup([]);
    const h = putOnBattlefield(s, ap, hunt());
    putOnBattlefield(s, ap, treasure);
    putOnBattlefield(s, ap, treasure);
    const theirs = putOnBattlefield(s, opp, bear());
    destroyPermanent(s, s.objects[theirs]!, "Grizzly Bears is destroyed.");
    closeZoneBatch(s);
    trimHand(s, ap);
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(treasures(s).length).toBe(3);
    expect(characteristics(s, s.objects[h]!).name).toBe("Yiazmat, Ultimate Mark");
  });

  it("doesn't trigger when only your own creature died", () => {
    let { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, hunt());
    const mine = putOnBattlefield(s, ap, bear());
    destroyPermanent(s, s.objects[mine]!, "Grizzly Bears is destroyed.");
    closeZoneBatch(s);
    trimHand(s, ap);
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(treasures(s).length).toBe(0);
    expect(characteristics(s, s.objects[h]!).name).toBe("Sidequest: Hunt the Mark");
  });
});

describe("round 232: Ultimecia, Time Sorceress", () => {
  it("pays {4}{U}{U}{B}{B} and exiles eight cards from your graveyard to transform, then takes an extra turn", () => {
    let { s, ap } = setup([]);
    const u = putOnBattlefield(s, ap, ultimecia());
    const yard = Array.from({ length: 8 }, () => into(s, ap, bear(), "graveyard"));
    trimHand(s, ap);
    s = passUntil(s, "end", ap);
    // Paid from the pool, as the trigger resolves.
    Object.assign(s.players[ap]!.manaPool, { U: 2, B: 2, C: 4 });
    s = settle(s);
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: yard });
    s = settle(s);
    expect(yard.every((id) => zone(s, id) === "exile")).toBe(true);
    expect(characteristics(s, s.objects[u]!).name).toBe("Ultimecia, Omnipotent");
    expect(s.extraTurns?.some((t) => t.player === ap)).toBe(true);
  });

  it("isn't asked with seven cards in the graveyard", () => {
    let { s, ap } = setup([]);
    const u = putOnBattlefield(s, ap, ultimecia());
    for (let i = 0; i < 7; i++) into(s, ap, bear(), "graveyard");
    trimHand(s, ap);
    s = passUntil(s, "end", ap);
    for (let i = 0; i < 50 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      expect(s.pending?.kind).not.toBe("chooseMay");
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(characteristics(s, s.objects[u]!).name).toBe("Ultimecia, Time Sorceress");
    expect(s.players[ap]!.graveyard.length).toBe(7);
  });
});

describe("round 232: Dovescape", () => {
  it("counters a noncreature spell; its caster creates Birds equal to its mana value", () => {
    let { s, ap, ids } = setup([divination]);
    putOnBattlefield(s, ap, dove);
    const hand = s.players[ap]!.hand.length;
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    const birds = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Bird"));
    expect(birds.length).toBe(3);
    expect(birds.every((id) => s.objects[id]!.controller === ap)).toBe(true);
  });

  it("the Birds come even when the spell can't be countered (rulings); creature spells are left alone", () => {
    let { s, ap, ids } = setup([unstoppable, bear()]);
    putOnBattlefield(s, ap, dove);
    const hand = s.players[ap]!.hand.length;
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand); // cast one, drew one
    const birds = () => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Bird")).length;
    expect(birds()).toBe(2);
    s = run(s, planCast(s, ap, ids[1]!));
    s = settle(s);
    expect(zone(s, ids[1]!)).toBe("battlefield");
    expect(birds()).toBe(2);
  });
});

describe("round 232: Vildin-Pack Alpha", () => {
  it("a Werewolf entering under your control may be transformed; a non-Werewolf doesn't trigger it", () => {
    let { s, ap, ids } = setup([bandit(), bear()]);
    const alpha = putOnBattlefield(s, ap, bandit());
    s.objects[alpha]!.face = 1;
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[alpha]!).name).toBe("Vildin-Pack Alpha");
    s = run(s, planCast(s, ap, ids[1]!));
    for (let i = 0; i < 50 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      expect(s.pending?.kind).not.toBe("chooseMay");
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { may: true });
    expect(characteristics(s, s.objects[ids[0]!]!).name).toBe("Vildin-Pack Alpha");
  });

  it("declining leaves it as it is", () => {
    let { s, ap, ids } = setup([bandit()]);
    const alpha = putOnBattlefield(s, ap, bandit());
    s.objects[alpha]!.face = 1;
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { may: false });
    expect(characteristics(s, s.objects[ids[0]!]!).name).toBe("Geier Reach Bandit");
  });
});

describe("round 232: Mass Polymorph", () => {
  it("exiles your creatures, tokens too, and puts that many creature cards from the top of your library onto the battlefield", () => {
    let { s, ap, ids } = setup([polymorph]);
    const b = putOnBattlefield(s, ap, bear());
    const t = putOnBattlefield(s, ap, wolf);
    s.objects[t]!.isToken = true;
    const lib = libraryOf(s, ap, forest, 6);
    const giant = card("Test Giant", "Creature — Giant", "{4}{G}", { power: "5", toughness: "5" });
    const c1 = into(s, ap, giant, "library");
    const f = into(s, ap, forest, "library");
    const c2 = into(s, ap, giant, "library");
    // Library from the top: c2, f, c1, then six Forests.
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(zone(s, b)).toBe("exile");
    expect(s.objects[t]?.zone === "battlefield").toBe(false);
    expect([zone(s, c1), zone(s, c2), zone(s, f)]).toEqual(["battlefield", "battlefield", "library"]);
    expect(s.players[ap]!.library.length).toBe(lib.length + 1);
  });
});

describe("round 232: The Princess Takes Flight", () => {
  it("III returns the creature chapter I exiled, under its owner's control", () => {
    let { s, ap, opp, ids } = setup([princess]);
    const theirs = putOnBattlefield(s, opp, bear());
    const mine = putOnBattlefield(s, ap, wolf);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { targets: [tgt(theirs)] });
    expect(zone(s, theirs)).toBe("exile");
    trimHand(s, ap);
    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    s = settle(s, { targets: [tgt(mine)] });
    trimHand(s, ap);
    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    s = settle(s);
    expect(zone(s, theirs)).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(opp);
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("a Saga that left and came back is a new object: its III returns nothing (CR 607.2a, 400.7)", () => {
    let { s, ap, opp, ids } = setup([princess]);
    const theirs = putOnBattlefield(s, opp, bear());
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { targets: [tgt(theirs)] });
    expect(zone(s, theirs)).toBe("exile");
    // A different Princess Saga with two lore counters: its III has nothing linked to it.
    const other = putOnBattlefield(s, ap, princess);
    s.objects[other]!.counters = { lore: 2 };
    destroyPermanent(s, s.objects[ids[0]!]!, "The Princess Takes Flight is destroyed.");
    closeZoneBatch(s);
    trimHand(s, ap);
    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    s = settle(s);
    expect(zone(s, theirs)).toBe("exile");
  });
});

describe("round 232: The Incredible Hulk", () => {
  it("dealt damage while attacking: a +1/+1 counter, it untaps, and there's an additional combat phase", () => {
    let { s, ap, opp } = setup([]);
    const hulk = putOnBattlefield(s, ap, banner());
    s.objects[hulk]!.face = 1;
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[hulk]!).name).toBe("The Incredible Hulk");
    const blocker = putOnBattlefield(s, opp, bear());
    const turn = s.turn;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: hulk, defender: opp }] });
    for (let i = 0; i < 80 && s.step !== "endCombat"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: p.player === opp ? [{ blocker, attacker: hulk }] : [] });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[hulk]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[hulk]!.tapped).toBe(false);
    for (let i = 0; i < 40 && s.step !== "declareAttackers" && s.step !== "main2"; i++) {
      const p = s.pending;
      if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.turn).toBe(turn);
    expect(s.step).toBe("declareAttackers");
    expect(s.log.some((l) => /An additional combat phase begins/.test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
  });

  it("dealt damage while not attacking: only the counter", () => {
    let { s, ap } = setup([]);
    const hulk = putOnBattlefield(s, ap, banner());
    s.objects[hulk]!.face = 1;
    s.objects[hulk]!.tapped = true;
    invalidateCharacteristics(s);
    const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
    const sh = into(s, ap, shock, "hand");
    s = run(s, planCast(s, ap, sh, [tgt(hulk)]));
    s = settle(s);
    expect(s.objects[hulk]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[hulk]!.tapped).toBe(true);
    expect(s.addedPhases ?? []).toEqual([]);
  });
});
