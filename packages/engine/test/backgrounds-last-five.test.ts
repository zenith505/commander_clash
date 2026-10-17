// The last five Backgrounds (Dungeon Delver, Haunted One, Noble Heritage, Scion of Halaster, Tavern Brawler), kinship
// with last-known creature types (CR 608.2h), Leaf-Crowned Elder, and "When ~ enters and at the beginning of your upkeep".

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, planCast, invalidateCharacteristics, isFullySupported, LOST_MINE, dungeonDef, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));

/** Pass, and let bots answer every choice, until the stack and trigger queue are empty; `answer` gives the test's own answer, or null to stop. */
function settle(s: GameState, answer?: (s: GameState) => Action | undefined | null) {
  for (let i = 0; i < 150 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    const mine = answer?.(s);
    if (mine === null) break;
    if (mine) s = act(s, mine);
    else if (s.pending) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
}
/** Move a permanent `putOnBattlefield` made into a zone (top of the library), as a test setup step. */
function moveTo(s: GameState, id: string, zone: "hand" | "graveyard" | "library") {
  const o = s.objects[id]!;
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  o.zone = zone;
  const p = s.players[o.owner]!;
  if (zone === "library") p.library.unshift(id);
  else p[zone].push(id);
  invalidateCharacteristics(s);
  return id;
}
const castNow = (s: GameState, pid: PlayerId, id: string) => {
  const plan = planCast(s, pid, id);
  if (!plan) throw new Error(`can't cast ${s.cards[s.objects[id]!.cardId]!.name}`);
  return plan.reduce((x, a) => act(x, a), s);
};
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => moveTo(s, putOnBattlefield(s, pid, def), "library");
const tokens = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.name === name);

// Real oracle text (Scryfall).
const bg = (name: string, cost: string, text: string) => card(name, "Legendary Enchantment — Background", cost, { oracleText: text });
const dungeonDelver = bg("Dungeon Delver", "{1}{U}", 'Commander creatures you own have "Room abilities of dungeons you own trigger an additional time."');
const hauntedOne = bg("Haunted One", "{2}{B}", 'Commander creatures you own have "Whenever this creature becomes tapped, it and other creatures you control that share a creature type with it each get +2/+0 and gain undying until end of turn." (When a creature with undying dies, if it had no +1/+1 counters on it, return it to the battlefield under its owner\'s control with a +1/+1 counter on it.)');
const nobleHeritage = bg("Noble Heritage", "{1}{W}", 'Commander creatures you own have "When this creature enters and at the beginning of your upkeep, each player may put two +1/+1 counters on a creature they control. For each opponent who does, you gain protection from that player until your next turn." (You can\'t be targeted, dealt damage, or enchanted by anything controlled by that player.)');
const scion = bg("Scion of Halaster", "{1}{B}", 'Commander creatures you own have "The first time you would draw a card each turn, instead look at the top two cards of your library. Put one of them into your graveyard and the other back on top of your library. Then draw a card."');
const tavernBrawler = bg("Tavern Brawler", "{2}{R}", 'Commander creatures you own have "At the beginning of your upkeep, exile the top card of your library. This creature gets +X/+0 until end of turn, where X is that card\'s mana value. You may play that card this turn."');
const leafCrowned = card("Leaf-Crowned Elder", "Creature — Treefolk Shaman", "{2}{G}{G}", { power: "3", toughness: "5", keywords: ["Kinship"], oracleText: "Kinship — At the beginning of your upkeep, you may look at the top card of your library. If it shares a creature type with this creature, you may reveal it. If you do, you may play that card without paying its mana cost." });
const oldRutstein = card("Old Rutstein", "Legendary Creature — Human Peasant", "{1}{B}{G}", { power: "1", toughness: "4", keywords: ["Treasure", "Mill"], oracleText: "When Old Rutstein enters and at the beginning of your upkeep, mill a card. If a land card is milled this way, create a Treasure token. If a creature card is milled this way, create a 1/1 green Insect creature token. If a noncreature, nonland card is milled this way, create a Blood token." });
const veteranDungeoneer = card("Veteran Dungeoneer", "Creature — Human Warrior", "{3}{W}", { power: "3", toughness: "4", keywords: ["Venture into the dungeon"], oracleText: "When this creature enters, venture into the dungeon. (Enter the first room or advance to the next room.)" });

const elfCmdr = card("Elf Commander Test", "Legendary Creature — Elf Warrior", "{1}{G}", { power: "3", toughness: "3" });
const elf = card("Elf Test", "Creature — Elf", "{G}", { power: "1", toughness: "1" });
const treefolk = card("Treefolk Test", "Creature — Treefolk", "{5}{G}{G}", { power: "6", toughness: "6" });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const zap = card("Zap Test", "Instant", "{0}", { oracleText: "Zap Test deals 2 damage to any target." });

describe("the last five Backgrounds", () => {
  it("compile", () => supported(dungeonDelver, hauntedOne, nobleHeritage, scion, tavernBrawler, leafCrowned, oldRutstein));

  it("Dungeon Delver: a commander creature you own makes room abilities trigger an additional time, one more per instance", () => {
    const { s: s0, ap, ids } = setup([veteranDungeoneer]);
    putOnBattlefield(s0, ap, dungeonDelver);
    const c = putOnBattlefield(s0, ap, elfCmdr, { commander: true });
    expect(abilitiesOf(s0, s0.objects[c]!).roomsTwice).toBe(1);
    const def = dungeonDef(LOST_MINE);
    s0.cards[def.oracleId] = def;
    s0.players[ap]!.dungeon = { name: LOST_MINE.name, room: 0 }; // Cave Entrance: on to Goblin Lair or Mine Tunnels
    let s = settle(castNow(s0, ap, ids[0]!), (x) => (x.pending?.kind === "chooseOption" && x.pending.what === "venture" ? { type: "chooseOption", player: ap, choice: "Goblin Lair" } : undefined));
    expect(s.players[ap]!.dungeon).toEqual({ name: "Lost Mine of Phandelver", room: 1 });
    expect(tokens(s, ap, "Goblin Token")).toHaveLength(2);
  });

  it("Haunted One: when the commander becomes tapped, it and creatures sharing a type get +2/+0 and undying until end of turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, hauntedOne);
    const c = putOnBattlefield(s0, ap, elfCmdr, { commander: true });
    const e = putOnBattlefield(s0, ap, elf);
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }] });
    s = settle(s);
    expect(pt(s, c)).toBe("5/3");
    expect(pt(s, e)).toBe("3/1");
    expect(pt(s, b)).toBe("2/2");
    // The elf has undying this turn: it dies and comes back with a +1/+1 counter (CR 702.93a).
    moveObject(s, e, "graveyard");
    s = settle(s);
    const back = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Elf Test");
    expect(back).toBeDefined();
    expect(s.objects[back!]!.counters["+1/+1"]).toBe(1);
  });

  it("Noble Heritage: each player may put two +1/+1 counters on a creature; you gain protection from each opponent who does until your next turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, nobleHeritage);
    const c = putOnBattlefield(s0, ap, elfCmdr, { commander: true });
    const [b1, b2, b3] = [1, 2, 3].map((i) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + i) % 4]!) as [PlayerId, PlayerId, PlayerId];
    const theirs = [b1, b2].map((p) => putOnBattlefield(s0, p, bear()));
    let s = passUntil(s0, "upkeep", b1);
    s = passUntil(s, "upkeep", ap);
    // Each player is asked; the bots with a creature accept, the one without one isn't asked.
    s = settle(s, (x) => {
      if (x.pending?.kind === "chooseMay" && x.pending.player === ap) return { type: "chooseMay", player: ap, yes: true };
      if (x.pending?.kind === "pickPermanents" && x.pending.player === ap) return { type: "pickPermanents", player: ap, ids: [c] };
      if (x.pending?.kind === "chooseMay" && x.pending.player === b3) throw new Error("a player with no creature was asked");
      return undefined;
    });
    expect(s.objects[c]!.counters["+1/+1"]).toBe(2);
    theirs.forEach((id) => expect(s.objects[id]!.counters["+1/+1"]).toBe(2));
    expect(s.players[ap]!.gainedUntilNextTurn).toHaveLength(2);
    expect(logged(s, /gains protection from .* until their next turn/)).toBe(true);
    // It lasts through the opponents' turns and ends as ap's next turn begins.
    s = passUntil(s, "upkeep", b1);
    expect(s.players[ap]!.gainedUntilNextTurn).toHaveLength(2);
    s = passUntil(s, "upkeep", ap);
    expect(s.players[ap]!.gainedUntilNextTurn ?? []).toHaveLength(0);
  });

  it("Noble Heritage: protection from a player stops that player's spells targeting you", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, nobleHeritage);
    putOnBattlefield(s0, ap, elfCmdr, { commander: true });
    const b1 = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    putOnBattlefield(s0, b1, bear());
    let s = passUntil(s0, "upkeep", b1);
    s = passUntil(s, "upkeep", ap);
    s = settle(s, (x) => (x.pending?.kind === "chooseMay" && x.pending.player === ap ? { type: "chooseMay", player: ap, yes: false } : undefined));
    s = passUntil(s, "main1", b1);
    const id = putOnBattlefield(s, b1, zap);
    moveTo(s, id, "hand");
    expect(planCast(s, b1, id, [{ kind: "player", id: ap }])).toBeNull();
    expect(planCast(s, b1, id, [{ kind: "player", id: b1 }])).not.toBeNull();
  });

  it("Scion of Halaster: the first draw each turn looks at two, one goes to the graveyard, then draws; later draws are normal", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, scion);
    putOnBattlefield(s0, ap, elfCmdr, { commander: true });
    const second = onTop(s0, ap, giant);
    const first = onTop(s0, ap, elf);
    let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "draw", ap);
    expect(s.pending).toMatchObject({ kind: "drawLook", player: ap, cards: [first, second], source: "Elf Commander Test" });
    s = act(s, { type: "drawLook", player: ap, objectId: first });
    expect(s.objects[first]!.zone).toBe("graveyard");
    expect(s.objects[second]!.zone).toBe("hand");
    expect(s.pending).toBeNull();
    // The draw step carries on to the main phase; the next draw this turn isn't replaced.
    const top = s.players[ap]!.library[0]!;
    const bolt = putOnBattlefield(s, ap, card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." }));
    moveTo(s, bolt, "hand");
    s = passUntil(s, "main1", ap);
    s = settle(castNow(s, ap, bolt));
    expect(s.pending).toBeNull();
    expect(s.objects[top]!.zone).toBe("hand");
  });

  it("Scion of Halaster: a bot picks which card to bin; without a commander creature, draws are normal", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, scion);
    const top = s0.players[ap]!.library[0]!;
    let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "main1", ap);
    expect(s.objects[top]!.zone).toBe("hand");
    const { s: s1, ap: ap1 } = setup([]);
    putOnBattlefield(s1, ap1, scion);
    putOnBattlefield(s1, ap1, elfCmdr, { commander: true });
    let t = passUntil(s1, "upkeep", s1.turnOrder[(s1.turnOrder.indexOf(ap1) + 1) % 4]!);
    t = passUntil(t, "draw", ap1);
    expect(t.pending?.kind).toBe("drawLook");
    const [a, b] = (t.pending as { cards: string[] }).cards;
    t = act(t, botActions(t, ap1)[0]!);
    expect([a, b].map((id) => t.objects[id!]!.zone).sort()).toEqual(["graveyard", "hand"]);
  });

  it("Tavern Brawler: at upkeep, exile the top card; the commander gets +X/+0 for its mana value; it may be played this turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, tavernBrawler);
    const c = putOnBattlefield(s0, ap, elfCmdr, { commander: true });
    const g = onTop(s0, ap, giant);
    let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!);
    s = settle(passUntil(s, "upkeep", ap));
    expect(s.objects[g]!.zone).toBe("exile");
    expect(pt(s, c)).toBe("7/3");
    s = passUntil(s, "main1", ap);
    s = settle(castNow(s, ap, g));
    expect(s.objects[g]!.zone).toBe("battlefield");
  });
});

describe("kinship", () => {
  it("compares the creature's last-known creature types once it has left the battlefield (CR 608.2h)", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, leafCrowned);
    // It became an Elf, and the card on top is an Elf: only its last-known types share one, and it's still played.
    s0.effects.push({ id: "x1", timestamp: s0.nextTimestamp++, controller: ap, sourceName: "test", duration: "game", affected: [c], mods: [{ kind: "setSubtypes", subtypes: ["Elf"] }] });
    invalidateCharacteristics(s0);
    const e = onTop(s0, ap, elf);
    let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "upkeep", ap);
    for (let i = 0; i < 10 && !s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack).toHaveLength(1);
    moveObject(s, c, "graveyard");
    s = settle(s, (x) => (x.pending?.kind === "chooseMay" ? null : undefined));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, prompt: expect.stringContaining("Elf Test") });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s);
    expect(s.objects[e]!.zone).toBe("battlefield");
  });

  it("…and a card of its printed type no longer shares one once it stopped being that type", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, leafCrowned);
    s0.effects.push({ id: "x1", timestamp: s0.nextTimestamp++, controller: ap, sourceName: "test", duration: "game", affected: [c], mods: [{ kind: "setSubtypes", subtypes: ["Elf"] }] });
    invalidateCharacteristics(s0);
    const t = onTop(s0, ap, treefolk);
    let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "upkeep", ap);
    for (let i = 0; i < 10 && !s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    moveObject(s, c, "graveyard");
    s = settle(s, (x) => (x.pending?.kind === "chooseMay" ? null : undefined));
    expect(s.pending).toBeNull();
    expect(s.objects[t]!.zone).toBe("library");
  });

  it("Leaf-Crowned Elder: a Treefolk on top may be revealed and played without paying its mana cost", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, leafCrowned);
    const t = onTop(s0, ap, treefolk);
    let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "upkeep", ap);
    s = settle(s, (x) => {
      if (x.pending?.kind === "chooseMay" && x.pending.player === ap) return { type: "chooseMay", player: ap, yes: true };
      if (x.pending?.kind === "castFree") return null;
      return undefined;
    });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: t });
    for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s);
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(logged(s, /casts Treefolk Test without paying its mana cost/)).toBe(true);
  });
});

describe('"When ~ enters and at the beginning of your upkeep"', () => {
  it("Old Rutstein triggers on entering and at upkeep, and makes the token for the kind of card milled", () => {
    const { s: s0, ap, ids } = setup([oldRutstein]);
    onTop(s0, ap, giant);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(tokens(s, ap, "Insect Token")).toHaveLength(1);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    s = settle(passUntil(s, "upkeep", ap)); // a Forest on top (the deck is forests and bears)
    expect(tokens(s, ap, "Treasure Token").length + tokens(s, ap, "Insect Token").length).toBe(2);
  });
});
