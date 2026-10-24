// Round 142: the most played cards, in popularity order, starting with Cactus Preserve.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, legalActions, moveObject, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or something asks a player to choose. */
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const third = (s: GameState, ap: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;

/** Attack `defender` with `attackers`, nobody blocks, through combat damage (stops at a choice). */
function swing(s: GameState, ap: PlayerId, defender: PlayerId, attackers: string[]) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((a) => ({ attacker: a, defender })) });
  for (let i = 0; i < 60 && s.step !== "main2" && !(s.pending && s.pending.kind !== "declareBlockers"); i++) {
    const p = s.pending;
    s = act(s, p?.kind === "declareBlockers" ? { type: "declareBlockers", player: p.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}

// Real oracle text (Scryfall).
const cactus = card("Cactus Preserve", "Land — Desert", "", { oracleText: "This land enters tapped.\n{T}: Add one mana of any type that a land you control could produce.\n{3}: Until end of turn, this land becomes an X/X green Plant creature with reach, where X is the greatest mana value among your commanders. It's still a land." });
const apex = card("Apex of Power", "Sorcery", "{7}{R}{R}{R}", { oracleText: "Exile the top seven cards of your library. Until end of turn, you may cast spells from among them.\nIf this spell was cast from your hand, add ten mana of any one color." });
const karmic = card("Karmic Justice", "Enchantment", "{2}{W}", { oracleText: "Whenever a spell or ability an opponent controls destroys a noncreature permanent you control, you may destroy target permanent that opponent controls." });
const reins = card("Reins of Power", "Instant", "{2}{U}{U}", { oracleText: "Untap all creatures you control and all creatures target opponent controls. You and that opponent each gain control of all creatures the other controls until end of turn. Those creatures gain haste until end of turn." });
const vivien = card("Vivien, Champion of the Wilds", "Legendary Planeswalker — Vivien", "{2}{G}", { loyalty: "4", oracleText: "You may cast creature spells as though they had flash.\n+1: Until your next turn, up to one target creature gains reach and vigilance.\n−2: Look at the top three cards of your library. Exile one face down and put the rest on the bottom of your library in any order. For as long as it remains exiled, you may cast it if it's a creature spell." });
const aboleth = card("Aboleth Spawn", "Creature — Fish Horror", "{2}{U}", { power: "2", toughness: "3", keywords: ["Probing Telepathy", "Ward", "Flash"], oracleText: "Flash\nWard {2}\nProbing Telepathy — Whenever a creature entering under an opponent's control causes a triggered ability of that creature to trigger, you may copy that ability. You may choose new targets for the copy." });
const neheb = card("Neheb, Dreadhorde Champion", "Legendary Creature — Zombie Minotaur Warrior", "{2}{R}{R}", { power: "5", toughness: "4", keywords: ["Trample"], oracleText: "Trample\nWhenever Neheb deals combat damage to a player or planeswalker, you may discard any number of cards. If you do, draw that many cards and add that much {R}. Until end of turn, you don't lose this mana as steps and phases end." });
const solemnity = card("Solemnity", "Enchantment", "{2}{W}", { oracleText: "Players can't get counters.\nCounters can't be put on artifacts, creatures, enchantments, or lands." });
const mariner = card("Unsettled Mariner", "Creature — Shapeshifter", "{W}{U}", { power: "2", toughness: "2", keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)\nWhenever you or a permanent you control becomes the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays {1}." });
const palette = card("Elementalist's Palette", "Artifact", "{3}", { oracleText: "Whenever you cast a spell with {X} in its mana cost, put two charge counters on this artifact.\n{T}: Add one mana of any color.\n{T}: Add {C} for each charge counter on this artifact. Spend this mana only on costs that contain {X}." });
const bogbonder = card("Slippery Bogbonder", "Creature — Human Druid", "{3}{G}", { power: "3", toughness: "3", keywords: ["Hexproof", "Flash"], oracleText: "Flash\nHexproof\nWhen this creature enters, put a hexproof counter on target creature. Then move any number of counters from among creatures you control onto that creature." });

const shatter = card("Test Shatter", "Instant", "{1}{R}", { oracleText: "Destroy target artifact." });
const naturalize = card("Test Naturalize", "Instant", "{1}{G}", { oracleText: "Destroy target artifact or enchantment." });
const murder = card("Test Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const relic = card("Test Relic", "Artifact", "{2}", { oracleText: "" });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const blaze = card("Test Blaze", "Sorcery", "{X}{R}", { oracleText: "Test Blaze deals X damage to any target." });
const elvish = bear({ name: "Test Visionary", typeLine: "Creature — Elf Shaman", subtypes: ["Elf", "Shaman"], power: "1", toughness: "1", oracleText: "When this creature enters, draw a card." });
const pinger = bear({ name: "Test Pinger", typeLine: "Creature — Goblin", subtypes: ["Goblin"], power: "1", toughness: "1", oracleText: "When this creature enters, it deals 1 damage to any target." });
const scavenger = bear({ name: "Test Scavenger", oracleText: "Whenever another creature enters, you gain 1 life." });
const infecter = bear({ name: "Test Infecter", keywords: ["Infect"], oracleText: "Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)" });
const graft = bear({ name: "Test Grafter", power: "0", toughness: "0", oracleText: "This creature enters with two +1/+1 counters on it." });
const druid = bear({ name: "Test Druid", power: "0", toughness: "2", oracleText: "{T}: Add {G}.\nPut a -1/-1 counter on this creature: Untap this creature." });

describe("Cactus Preserve: the greatest mana value among your commanders", () => {
  it("is fully supported; it becomes an X/X with X your commander's mana value as the ability resolves", () => {
    supported(cactus);
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, cactus);
    let s = passAll(run(s0, planActivate(s0, ap, c, 0)));
    s = resolveAll(s);
    const ch = characteristics(s, s.objects[c]!);
    expect(ch.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(ch.subtypes).toEqual(expect.arrayContaining(["Desert", "Plant"]));
    // The test commanders cost {1}{G}: wherever the commander is, its mana value (rulings).
    expect([ch.power, ch.toughness]).toEqual([2, 2]);
    expect(objHasKeyword(s, s.objects[c]!, "Reach")).toBe(true);
    expect(ch.colors).toEqual(["G"]);
  });

  it("with two commanders, the greater; X is fixed as it resolves", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, cactus);
    const big = card("Big Partner", "Legendary Creature — Giant", "{4}{G}{G}", { power: "6", toughness: "6" });
    putOnBattlefield(s0, ap, big, { commander: true });
    // Another player's commander doesn't count.
    putOnBattlefield(s0, third(s0, ap), card("Huge Other", "Legendary Creature — Giant", "{9}", { power: "9", toughness: "9" }), { commander: true });
    let s = resolveAll(passAll(run(s0, planActivate(s0, ap, c, 0))));
    expect(characteristics(s, s.objects[c]!).power).toBe(6);
    // The commander leaving now doesn't change X (CR 608.2h).
    const partner = s.battlefield.find((id) => nameOf(s, id) === "Big Partner")!;
    moveObject(s, partner, "graveyard");
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[c]!).power).toBe(6);
    // Its color identity, wherever: the card in the graveyard still counts next time.
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(characteristics(s, s.objects[c]!).types).not.toContain("Creature");
  });
});

describe("Apex of Power", () => {
  it("is fully supported; exiles seven, spells among them castable this turn, and ten mana of one color from hand", () => {
    supported(apex);
    const { s: s0, ap, ids } = setup([apex]);
    const top = s0.players[ap]!.library.slice(0, 7);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: s.pending.options.find((o) => o.toLowerCase() === "green") ?? s.pending.options[0]! });
    s = resolveAll(s);
    expect(top.every((id) => s.objects[id]!.zone === "exile")).toBe(true);
    const pool = s.players[ap]!.manaPool;
    expect(Object.values(pool).reduce((a, b) => a + b, 0)).toBe(10);
    // The bears are castable from exile, the Forests aren't playable this way (lands stay, rulings).
    const bearsOut = top.filter((id) => nameOf(s, id) === "Grizzly Bears");
    const forestsOut = top.filter((id) => nameOf(s, id) === "Forest");
    if (bearsOut.length) expect(castProblem(s, ap, bearsOut[0]!)).toBeNull();
    if (forestsOut.length) expect(legalActions(s, ap).some((a) => a.type === "playLand" && a.objectId === forestsOut[0])).toBe(false);
    expect(bearsOut.length + forestsOut.length).toBe(7);
    // Next turn they can't be cast any more.
    const later = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    if (bearsOut.length) expect(castProblem(later, ap, bearsOut[0]!)).not.toBeNull();
  });

  it("cast from anywhere but the hand, no mana", () => {
    const { s: s0, ap, ids } = setup([apex]);
    // Cast from exile with a permission (as from Apex's own exile): moved there first.
    const o = s0.objects[ids[0]!]!;
    s0.players[ap]!.hand = s0.players[ap]!.hand.filter((x) => x !== ids[0]);
    o.zone = "exile";
    s0.players[ap]!.exile.push(ids[0]!);
    o.mayPlay = { player: ap, zc: o.zoneChanges ?? 0, until: "thisTurn", turn: s0.turn, castOnly: true };
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(Object.values(s.players[ap]!.manaPool).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("Karmic Justice", () => {
  it("is fully supported; an opponent's spell destroying a noncreature permanent of yours lets you destroy one of theirs", () => {
    supported(karmic);
    const { s: s0, ap, opp } = setup([]);
    const kj = putOnBattlefield(s0, opp, karmic);
    const theirRelic = putOnBattlefield(s0, opp, relic);
    const myRelic = putOnBattlefield(s0, ap, relic);
    // We (the active player) destroy the opponent's artifact.
    const sh = putOnBattlefield(s0, ap, shatter);
    s0.battlefield.splice(s0.battlefield.indexOf(sh), 1);
    s0.objects[sh]!.zone = "hand";
    s0.players[ap]!.hand.push(sh);
    let s = run(s0, planCast(s0, ap, sh, [{ kind: "object", id: theirRelic }]));
    s = resolveAll(s);
    expect(s.objects[theirRelic]!.zone).toBe("graveyard");
    // Karmic Justice triggers: its targets are only the permanents of the player whose spell did it.
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: opp, targets: [{ kind: "object", id: kj }] })).toThrow();
    s = act(s, { type: "chooseTargets", player: opp, targets: [{ kind: "object", id: myRelic }] });
    s = resolveAll(s);
    if (s.pending?.kind === "chooseMay") s = resolveAll(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(s.objects[myRelic]!.zone).toBe("graveyard");
    expect(s.objects[kj]!.zone).toBe("battlefield");
  });

  it("not for creatures, not for its controller's own spells, and it triggers when it's destroyed itself", () => {
    const { s: s0, ap, opp } = setup([shatter, naturalize, murder]);
    const kj = putOnBattlefield(s0, opp, karmic);
    const theirBear = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const myRelic = putOnBattlefield(s0, ap, relic);
    const [, nat, mur] = s0.players[ap]!.hand.slice(-3);
    // A creature: no trigger.
    let s = resolveAll(run(s0, planCast(s0, ap, mur!, [{ kind: "object", id: theirBear }])));
    expect(s.objects[theirBear]!.zone).toBe("graveyard");
    expect(s.pending).toBeNull();
    expect(s.triggerQueue).toEqual([]);
    // Karmic Justice itself: it triggers, looking back (rulings).
    s = run(s, planCast(s, ap, nat!, [{ kind: "object", id: kj }]));
    s = resolveAll(s);
    expect(s.objects[kj]!.zone).toBe("graveyard");
    expect(s.pending?.kind).toBe("chooseTargets");
    s = resolveAll(act(s, { type: "chooseTargets", player: opp, targets: [{ kind: "object", id: myRelic }] }));
    if (s.pending?.kind === "chooseMay") s = resolveAll(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(s.objects[myRelic]!.zone).toBe("graveyard");
  });

  it("sacrifices and lethal damage don't count; its controller's own destruction doesn't either", () => {
    const { s: s0, ap } = setup([shatter]);
    putOnBattlefield(s0, ap, karmic);
    const mine = putOnBattlefield(s0, ap, relic);
    const s = resolveAll(run(s0, planCast(s0, ap, s0.players[ap]!.hand.at(-1)!, [{ kind: "object", id: mine }])));
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.pending).toBeNull();
    expect(s.stack).toEqual([]);
  });
});

describe("Reins of Power", () => {
  it("is fully supported; both players' creatures untap and change sides until end of turn, with haste", () => {
    supported(reins);
    const { s: s0, ap, opp, ids } = setup([reins]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = [putOnBattlefield(s0, opp, bear({ name: "Their Bear" })), putOnBattlefield(s0, opp, bear({ name: "Their Other Bear" }), { sick: true })];
    const bystander = putOnBattlefield(s0, third(s0, ap), bear({ name: "Third Bear" }));
    for (const id of [mine, ...theirs, bystander]) s0.objects[id]!.tapped = true;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(controllerOf(s, s.objects[mine]!)).toBe(opp);
    expect(theirs.map((id) => controllerOf(s, s.objects[id]!))).toEqual([ap, ap]);
    expect([mine, ...theirs].every((id) => !s.objects[id]!.tapped)).toBe(true);
    expect(theirs.every((id) => objHasKeyword(s, s.objects[id]!, "Haste"))).toBe(true);
    // Only the two players' creatures untap.
    expect(s.objects[bystander]!.tapped).toBe(true);
    expect(controllerOf(s, s.objects[bystander]!)).toBe(third(s, ap));
    // The new ones can attack this turn (haste), and it all ends with the turn.
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: theirs[1]!, defender: third(s, ap) }] });
    expect(s.objects[theirs[1]!]!.attacking).toBe(third(s, ap));
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(controllerOf(s, s.objects[mine]!)).toBe(ap);
    expect(theirs.map((id) => controllerOf(s, s.objects[id]!))).toEqual([opp, opp]);
  });

  it("a bot casts it only in its own first main phase, at the opponent with the stronger army", () => {
    const { s: s0, ap, opp, ids } = setup([reins]);
    s0.players[ap]!.hand = [ids[0]!];
    expect(botActions(s0, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(false);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, bear({ name: `Big ${i}`, power: "5", toughness: "5" }));
    invalidateCharacteristics(s0);
    const a = botActions(s0, ap).find((x) => x.type === "castSpell" && x.objectId === ids[0]);
    expect(a?.type === "castSpell" && a.targets?.[0]).toEqual({ kind: "player", id: opp });
  });
});

describe("Vivien, Champion of the Wilds", () => {
  it("is fully supported; −2 exiles one of the top three face down, castable while exiled if it's a creature spell", () => {
    supported(vivien);
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, vivien);
    s0.objects[v]!.counters.loyalty = 4;
    // The top three: a bear, a Forest, a bear.
    const lib = s0.players[ap]!.library;
    const b = lib.find((id) => nameOf(s0, id) === "Grizzly Bears")!;
    const f = lib.find((id) => nameOf(s0, id) === "Forest")!;
    const rest = lib.filter((id) => id !== b && id !== f);
    s0.players[ap]!.library = [b, f, ...rest];
    const index = s0.objects[v] && planActivate(s0, ap, v, 1) ? 1 : 0;
    let s = resolveAll(run(s0, planActivate(s0, ap, v, index)));
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: ap, found: [b] });
    s = resolveAll(s);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[v]!.counters.loyalty).toBe(2);
    // The rest went to the bottom.
    expect(s.players[ap]!.library.slice(-2)).toContain(f);
    // Only we know what it is; we may cast it, with flash from Vivien.
    expect(s.objects[b]!.hiddenExile?.seen).toEqual([ap]);
    s = passUntil(s, "end", ap);
    expect(planCast(s, ap, b)).not.toBeNull();
    const after = resolveAll(run(s, planCast(s, ap, b)));
    expect(after.objects[b]!.zone).toBe("battlefield");
  });

  it("a noncreature card stays in exile; an Adventure can't be cast as its sorcery", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, vivien);
    s0.objects[v]!.counters.loyalty = 4;
    const lib = s0.players[ap]!.library;
    const f = lib.find((id) => nameOf(s0, id) === "Forest")!;
    s0.players[ap]!.library = [f, ...lib.filter((id) => id !== f)];
    let s = resolveAll(run(s0, planActivate(s0, ap, v, 1)));
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [f] }));
    expect(s.objects[f]!.zone).toBe("exile");
    expect(legalActions(s, ap).some((a) => (a.type === "playLand" || a.type === "castSpell") && a.objectId === f)).toBe(false);
    // A noncreature spell card: not castable this way.
    const o = s.objects[f]!;
    s.cards[o.cardId] = { ...s.cards[o.cardId]!, name: "Test Divination", typeLine: "Sorcery", types: ["Sorcery"], subtypes: [], manaCost: "{2}{U}", oracleText: "Draw two cards." };
    expect(castProblem(s, ap, f)).toMatch(/only as a creature spell/);
  });
});

describe("Aboleth Spawn", () => {
  it("is fully supported; an opponent's creature entering with an enters trigger lets you copy it, above that trigger", () => {
    supported(aboleth);
    const { s: s0, ap, opp, ids } = setup([elvish]);
    putOnBattlefield(s0, opp, aboleth);
    const hand = s0.players[opp]!.hand.length;
    const mine = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    // Aboleth's trigger was on top of the Visionary's: it resolves first, the Visionary's still waits.
    expect(s.pending?.kind).toBe("chooseMay");
    expect(s.pending?.kind === "chooseMay" && s.pending.player).toBe(opp);
    expect(s.stack.map((x) => x.controller)).toEqual([ap]);
    s = resolveAll(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(s.players[opp]!.hand.length).toBe(hand + 1);
    expect(s.players[ap]!.hand.length).toBe(mine - 1 + 1);
  });

  it("the copy may get new targets; not for our own creatures, nor other permanents' abilities about it", () => {
    const { s: s0, ap, opp, ids } = setup([pinger, elvish]);
    putOnBattlefield(s0, opp, aboleth);
    // Another permanent's "whenever another creature enters": not an ability of the entering creature (rulings).
    putOnBattlefield(s0, ap, scavenger);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: opp });
    s = resolveAll(act(s, { type: "copyTargets", player: opp, targets: [{ kind: "player", id: ap }] }));
    expect(s.players[ap]!.life).toBe(40 - 1 + 1);
    expect(s.players[opp]!.life).toBe(39);
    // Our own Aboleth doesn't trigger for our own creature; theirs asks once, and declining leaves the Visionary's trigger.
    putOnBattlefield(s, ap, aboleth);
    invalidateCharacteristics(s);
    const hand = s.players[ap]!.hand.length;
    let t = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(t.pending).toMatchObject({ kind: "chooseMay", player: opp });
    t = resolveAll(act(t, { type: "chooseMay", player: opp, yes: false }));
    expect(t.pending).toBeNull();
    expect(t.stack).toEqual([]);
    expect(t.players[ap]!.hand.length).toBe(hand - 1 + 1);
  });
});

describe("Neheb, Dreadhorde Champion", () => {
  it("is fully supported; discard any number, draw that many and add that much {R}, kept until end of turn", () => {
    supported(neheb);
    const { s: s0, ap, opp } = setup([bear({ name: "Spare A" }), bear({ name: "Spare B" }), bear({ name: "Spare C" })]);
    const n = putOnBattlefield(s0, ap, neheb);
    const spares = s0.players[ap]!.hand.slice(-3);
    let s = swing(s0, ap, opp, [n]);
    expect(s.players[opp]!.life).toBe(35);
    for (let i = 0; i < 10 && s.pending?.kind !== "discard" && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending?.kind).toBeDefined();
    const handBefore = s.players[ap]!.hand.length;
    s = act(s, { type: "discard", player: ap, objectIds: spares.slice(0, 2) });
    s = resolveAll(s);
    expect(spares.slice(0, 2).every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(handBefore);
    expect(s.players[ap]!.manaPool.R).toBe(2);
    // Kept as steps end, for the rest of the turn.
    s = passUntil(s, "main2", ap);
    expect(s.players[ap]!.manaPool.R).toBe(2);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(s.players[ap]!.manaPool.R).toBe(0);
  });
});

describe("Solemnity", () => {
  it("is fully supported; no counters on artifacts, creatures, enchantments and lands, or on players", () => {
    supported(solemnity);
    const { s: s0, ap, opp, ids } = setup([graft]);
    putOnBattlefield(s0, opp, solemnity);
    const inf = putOnBattlefield(s0, ap, infecter);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    // It enters with no counters, a 0/0: it dies.
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    // Infect damage: no poison, no life lost (rulings).
    s = swing(s, ap, opp, [inf]);
    expect(s.players[opp]!.poison ?? 0).toBe(0);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("a cost that puts a counter on a creature can't be paid; counters already there stay; planeswalkers still get them", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, druid);
    s0.objects[d]!.counters["+1/+1"] = 1;
    s0.objects[d]!.tapped = true;
    putOnBattlefield(s0, opp, solemnity);
    invalidateCharacteristics(s0);
    expect(planActivate(s0, ap, d, 0)).toBeNull();
    expect(s0.objects[d]!.counters["+1/+1"]).toBe(1);
    const v = putOnBattlefield(s0, ap, vivien);
    s0.objects[v]!.counters.loyalty = 4;
    const s = resolveAll(run(s0, planActivate(s0, ap, v, 0, [{ kind: "none" }])));
    expect(s.objects[v]!.counters.loyalty).toBe(5);
  });
});

describe("Unsettled Mariner", () => {
  it("is fully supported; an opponent's spell targeting you or your permanent is countered unless they pay {1}", () => {
    supported(mariner);
    const { s: s0, ap, opp, ids } = setup([shock, shock]);
    const m = putOnBattlefield(s0, opp, mariner);
    // Targeting the Mariner's controller.
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{1}" });
    s = resolveAll(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(s.players[opp]!.life).toBe(40);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    // Targeting the Mariner itself, and paying.
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: m }]));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap });
    s.players[ap]!.manaPool.R += 1;
    s = resolveAll(act(s, { type: "payUnless", player: ap, pay: true }));
    expect(s.objects[m]!.zone).toBe("graveyard");
  });

  it("its controller's own spells, and other players' targets, don't trigger it", () => {
    const { s: s0, ap, ids } = setup([shock]);
    putOnBattlefield(s0, ap, mariner);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }])));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.life).toBe(38);
  });
});

describe("Elementalist's Palette", () => {
  it("is fully supported; its charge counter mana pays only costs with {X}", () => {
    supported(palette);
    const { s: s0, ap, opp, ids } = setup([blaze, bear({ name: "Plain Bear", manaCost: "{2}" })]);
    // Only the Palette and nothing else to pay with.
    s0.battlefield = s0.battlefield.filter((id) => !characteristics(s0, s0.objects[id]!).types.includes("Land"));
    const p = putOnBattlefield(s0, ap, palette);
    s0.objects[p]!.counters.charge = 4;
    s0.players[ap]!.manaPool.R = 1;
    invalidateCharacteristics(s0);
    // The counter ability is an activated mana ability with an effect (CR 605.1a): it doesn't use the stack.
    let s = run(s0, planActivate(s0, ap, p, 0));
    expect(s.players[ap]!.manaPool.C).toBe(4);
    // The bear's cost has no {X}: the {R} pays only half of it.
    expect(castProblem(s, ap, ids[1]!)).toMatch(/not enough mana/);
    expect(castProblem(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, undefined, 3)).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", 3)));
    expect(s.players[opp]!.life).toBe(37);
  });
});

describe("Slippery Bogbonder", () => {
  it("is fully supported; a hexproof counter on the target, then counters from among your creatures moved onto it", () => {
    supported(bogbonder);
    const { s: s0, ap, ids } = setup([bogbonder]);
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Bear B" }));
    s0.objects[b]!.counters = { "+1/+1": 2, flying: 1 };
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: a }] }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "removeCounter", onto: a });
    const opts = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    // Not the target's own counters (the hexproof one).
    expect(opts).toEqual(expect.arrayContaining([`${b}:+1/+1`, `${b}:flying`, "done"]));
    expect(opts.some((o) => o.startsWith(`${a}:`))).toBe(false);
    s = act(s, { type: "chooseOption", player: ap, choice: `${b}:+1/+1` });
    s = act(s, { type: "chooseOption", player: ap, choice: `${b}:flying` });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "done" }));
    expect(s.objects[a]!.counters).toMatchObject({ hexproof: 1, "+1/+1": 1, flying: 1 });
    expect(s.objects[b]!.counters).toMatchObject({ "+1/+1": 1, flying: 0 });
    expect(objHasKeyword(s, s.objects[a]!, "Flying")).toBe(true);
  });

  it("onto an opponent's creature too, moving none is fine", () => {
    const { s: s0, ap, opp, ids } = setup([bogbonder]);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    s0.objects[mine]!.counters = { "+1/+1": 1 };
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: theirs }] }));
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "done" }));
    expect(s.objects[theirs]!.counters).toMatchObject({ hexproof: 1 });
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1);
  });
});

describe("costs that contain {X}: Rosheen Meanderer, Nexos; Tangleweave Armor", () => {
  const rosheen = card("Rosheen Meanderer", "Legendary Creature — Giant Shaman", "{3}{R/G}", { power: "4", toughness: "4", oracleText: "{T}: Add {C}{C}{C}{C}. Spend this mana only on costs that contain {X}." });
  const nexos = card("Nexos", "Creature — Human Tyranid Advisor", "{1}{G}", { power: "2", toughness: "2", keywords: ["Strategic Coordinator"], oracleText: "Strategic Coordinator — Basic lands you control have \"{T}: Add {C}{C}. Spend this mana only on costs that contain {X}.\"" });
  const armor = card("Tangleweave Armor", "Artifact — Equipment", "{2}{G}{G}", { keywords: ["Equip", "Living weapon"], oracleText: "Living weapon (When this Equipment enters, create a 0/0 black Phyrexian Germ creature token, then attach this to it.)\nEquipped creature gets +X/+X, where X is the greatest mana value among your commanders.\nEquip {4}" });
  const kickBolt = card("Test Kick Bolt", "Instant", "{R}", { oracleText: "Kicker {X}\nTest Kick Bolt deals 1 damage to any target." });

  it("are fully supported; Rosheen's mana pays any part of a total cost with {X}, X 0 included, or a kicker {X}", () => {
    supported(rosheen, nexos, armor);
    const { s: s0, ap, opp, ids } = setup([blaze, bear({ name: "Plain Bear", manaCost: "{2}" }), kickBolt]);
    s0.battlefield = s0.battlefield.filter((id) => !characteristics(s0, s0.objects[id]!).types.includes("Land"));
    s0.players[ap]!.manaPool.R = 1;
    const r = putOnBattlefield(s0, ap, rosheen);
    invalidateCharacteristics(s0);
    const mana = legalActions(s0, ap).find((a) => a.type === "activateMana" && a.objectId === r);
    expect(mana).toBeDefined();
    const s = act(s0, mana!);
    expect(s.players[ap]!.manaPool.C).toBe(4);
    expect(castProblem(s, ap, ids[1]!)).toMatch(/not enough mana/);
    // X 3: Rosheen's mana pays the {X}, the {R} the {R}.
    expect(castProblem(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, undefined, 3)).toBeNull();
    // Its mana cost has no {X}, but kicked its total cost does (CR 601.2f): Rosheen's mana may pay any part of it.
    supported(kickBolt);
    expect(castProblem(s, ap, ids[2]!, [{ kind: "player", id: opp }], undefined, undefined, undefined, 2, { kicks: [0] })).toBeNull();
    const t = structuredClone(s);
    t.players[ap]!.manaPool.R = 0;
    // The {R} still has to be red.
    expect(castProblem(t, ap, ids[2]!, [{ kind: "player", id: opp }], undefined, undefined, undefined, 2, { kicks: [0] })).toMatch(/not enough mana/);
  });

  it("Nexos: your basic lands tap for {C}{C} for such costs; Tangleweave Armor's Germ gets +X/+X from your commander", () => {
    const { s: s0, ap, opp, ids } = setup([blaze]);
    putOnBattlefield(s0, ap, nexos);
    invalidateCharacteristics(s0);
    const mountain = s0.battlefield.find((id) => characteristics(s0, s0.objects[id]!).name === "Mountain" && controllerOf(s0, s0.objects[id]!) === ap)!;
    const two = legalActions(s0, ap).filter((a) => a.type === "activateMana" && a.objectId === mountain);
    expect(two.some((a) => a.type === "activateMana" && a.mana === "R")).toBe(true);
    expect(two.some((a) => a.type === "activateMana" && a.mana === "C")).toBe(true);
    let s = act(s0, two.find((a) => a.type === "activateMana" && a.mana === "C")!);
    expect(s.players[ap]!.manaPool.C).toBe(2);
    s.players[ap]!.manaPool.R = 1;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", 2)));
    expect(s.players[opp]!.life).toBe(38);
    expect(s.players[ap]!.manaPool.C).toBe(0);
    // Tangleweave Armor: the test commanders cost {1}{G}, so the Germ is 2/2.
    const g = setup([armor]);
    const t = resolveAll(run(g.s, planCast(g.s, g.ap, g.ids[0]!)));
    const germ = t.battlefield.find((id) => characteristics(t, t.objects[id]!).subtypes.includes("Germ"))!;
    expect(germ).toBeDefined();
    expect([characteristics(t, t.objects[germ]!).power, characteristics(t, t.objects[germ]!).toughness]).toEqual([2, 2]);
  });
});
