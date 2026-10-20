// Lands from the most played Commander cards: Fabled Passage ("Then if you control four or more lands, untap that land"),
// Myriad Landscape ("up to two basic land cards that share a land type"), Command Beacon ("Put your commander into your
// hand from the command zone"), War Room ("Pay life equal to the number of colors in your commanders' color identity"),
// and Mystic Sanctuary and the other Eldraine lands ("enters tapped unless you control three or more other Islands",
// "When ~ enters untapped, ...").

import { describe, expect, it } from "vitest";
import { act, card, fourPlayerGame, forest, island, passAll, passUntil, putOnBattlefield } from "./helpers";
import { botActions, commanderTax, invalidateCharacteristics, isFullySupported, planActivate, planCast, RulesError, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const fabledPassage = card("Fabled Passage", "Land", "", { oracleText: "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land." });
const myriadLandscape = card("Myriad Landscape", "Land", "", { oracleText: "This land enters tapped.\n{T}: Add {C}.\n{2}, {T}, Sacrifice this land: Search your library for up to two basic land cards that share a land type, put them onto the battlefield tapped, then shuffle." });
const commandBeacon = card("Command Beacon", "Land", "", { oracleText: "{T}: Add {C}.\n{T}, Sacrifice this land: Put your commander into your hand from the command zone." });
const warRoom = card("War Room", "Land", "", { oracleText: "{T}: Add {C}.\n{3}, {T}, Pay life equal to the number of colors in your commanders' color identity: Draw a card." });
const mysticSanctuary = card("Mystic Sanctuary", "Land — Island", "", { oracleText: "({T}: Add {U}.)\nThis land enters tapped unless you control three or more other Islands.\nWhen this land enters untapped, you may put target instant or sorcery card from your graveyard on top of your library." });
const witchsCottage = card("Witch's Cottage", "Land — Swamp", "", { oracleText: "({T}: Add {B}.)\nThis land enters tapped unless you control three or more other Swamps.\nWhen this land enters untapped, you may put target creature card from your graveyard on top of your library." });
const dwarvenMine = card("Dwarven Mine", "Land — Mountain", "", { oracleText: "({T}: Add {R}.)\nThis land enters tapped unless you control three or more other Mountains.\nWhen this land enters untapped, create a 1/1 red Dwarf creature token." });
const gingerbreadCabin = card("Gingerbread Cabin", "Land — Forest", "", { oracleText: "({T}: Add {G}.)\nThis land enters tapped unless you control three or more other Forests.\nWhen this land enters untapped, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")" });
const idyllicGrange = card("Idyllic Grange", "Land — Plains", "", { oracleText: "({T}: Add {W}.)\nThis land enters tapped unless you control three or more other Plains.\nWhen this land enters untapped, put a +1/+1 counter on target creature you control." });
const opt = card("Opt", "Instant", "{U}", { oracleText: "Scry 1.\nDraw a card." });

/** The active player's first main phase of a game of Forests and Grizzly Bears. */
function fresh(): { s: GameState; ap: PlayerId } {
  const s = passUntil(fourPlayerGame(), "main1");
  return { s, ap: s.activePlayer };
}
function moveTo(s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library"): string {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
}
const landsOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
function run(s: GameState, plan: Action[] | null) {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return passAll(s);
}

describe("lands from the most played cards", () => {
  it("parse", () => {
    for (const d of [fabledPassage, myriadLandscape, commandBeacon, warRoom, mysticSanctuary, witchsCottage, dwarvenMine, gingerbreadCabin, idyllicGrange]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Fabled Passage untaps the land it finds once you control four lands, counting that land but not the Passage", () => {
    for (const [others, untapped] of [[2, false], [3, true]] as const) {
      const { s: s0, ap } = fresh();
      for (const id of landsOf(s0, ap)) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      for (let i = 0; i < others; i++) putOnBattlefield(s0, ap, forest);
      const passage = putOnBattlefield(s0, ap, fabledPassage);
      let s = run(s0, planActivate(s0, ap, passage, 0));
      expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
      const pick = (s.pending as { cards: string[] }).cards[0]!;
      s = passAll(act(s, { type: "searchLibrary", player: ap, found: [pick] }));
      expect(s.objects[pick]!.zone).toBe("battlefield");
      expect(landsOf(s, ap)).toHaveLength(others + 1);
      expect(s.objects[pick]!.tapped, `${others} other lands`).toBe(!untapped);
    }
  });

  it("Myriad Landscape finds up to two basic lands that share a land type", () => {
    const { s: s0, ap } = fresh();
    for (let i = 0; i < 3; i++) moveTo(s0, ap, island, "library");
    const ml = putOnBattlefield(s0, ap, myriadLandscape);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, forest);
    let s = run(s0, planActivate(s0, ap, ml, 0));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", shareLandType: true, max: 2, min: 0 });
    const cards = (s.pending as { cards: string[] }).cards;
    const isl = cards.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Island");
    const fst = cards.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest");
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [isl[0]!, fst[0]!] })).toThrow(RulesError);
    // One alone is fine (rulings).
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [isl[0]!] })).not.toThrow();
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [isl[0]!, isl[1]!] }));
    expect(s.objects[isl[0]!]!).toMatchObject({ zone: "battlefield", tapped: true });
    expect(s.objects[isl[1]!]!).toMatchObject({ zone: "battlefield", tapped: true });
    expect(s.objects[ml]!.zone).toBe("graveyard");
  });

  it("a bot's Myriad Landscape finds two lands of one type", () => {
    const { s: s0, ap } = fresh();
    moveTo(s0, ap, island, "library");
    const ml = putOnBattlefield(s0, ap, myriadLandscape);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, forest);
    const s = run(s0, planActivate(s0, ap, ml, 0));
    const [a] = botActions(s, ap);
    expect(a).toMatchObject({ type: "searchLibrary" });
    const found = (a as { found: string[] }).found.map((id) => s.cards[s.objects[id]!.cardId]!.name);
    expect(found).toEqual(["Forest", "Forest"]);
  });

  it("Command Beacon puts your commander into your hand, and casting it from there has no tax", () => {
    const { s: s0, ap } = fresh();
    const cmd = s0.players[ap]!.command[0]!;
    s0.players[ap]!.commanderCasts[cmd] = 2;
    const beacon = putOnBattlefield(s0, ap, commandBeacon);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, forest);
    expect(commanderTax(s0.players[ap]!, s0.objects[cmd]!)).toBe(4);
    let s = run(s0, planActivate(s0, ap, beacon, 0));
    expect(s.objects[cmd]!.zone).toBe("hand");
    expect(s.players[ap]!.hand).toContain(cmd);
    // {1}{G} from the hand, not {5}{G} (rulings).
    const plan = planCast(s, ap, cmd);
    expect(plan).not.toBeNull();
    s = run(s, plan);
    expect(s.objects[cmd]!.zone).toBe("battlefield");
    expect(s.players[ap]!.commanderCasts[cmd]).toBe(2);
  });

  it("Command Beacon does nothing if the commander isn't in the command zone", () => {
    const { s: s0, ap } = fresh();
    const cmd = s0.players[ap]!.command[0]!;
    s0.players[ap]!.command = [];
    s0.objects[cmd]!.zone = "exile";
    s0.players[ap]!.exile.push(cmd);
    const beacon = putOnBattlefield(s0, ap, commandBeacon);
    const hand = s0.players[ap]!.hand.length;
    const s = run(s0, planActivate(s0, ap, beacon, 0));
    expect(s.objects[cmd]!.zone).toBe("exile");
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("War Room costs life equal to the colors in your commander's color identity", () => {
    const { s: s0, ap } = fresh();
    const room = putOnBattlefield(s0, ap, warRoom);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, forest);
    const life = s0.players[ap]!.life;
    const hand = s0.players[ap]!.hand.length;
    const s = run(s0, planActivate(s0, ap, room, 0));
    // The test commander is green: one color.
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Mystic Sanctuary enters untapped with three other Islands, and only then puts an instant back on top", () => {
    for (const islands of [2, 3]) {
      const { s: s0, ap } = fresh();
      for (let i = 0; i < islands; i++) putOnBattlefield(s0, ap, island);
      const optId = moveTo(s0, ap, opt, "graveyard");
      const ms = moveTo(s0, ap, mysticSanctuary, "hand");
      let s = act(s0, { type: "playLand", player: ap, objectId: ms });
      expect(s.objects[ms]!.tapped, `${islands} Islands`).toBe(islands < 3);
      for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
        const pid = waitingOn(s)!;
        if (s.pending?.kind === "chooseTargets" || (s.pending && s.pending.player === ap)) for (const a of botActions(s, pid)) s = act(s, a);
        else s = act(s, { type: "passPriority", player: pid });
      }
      if (islands === 3) {
        expect(s.objects[optId]!.zone).toBe("library");
        expect(s.players[ap]!.library[0]).toBe(optId);
      } else expect(s.objects[optId]!.zone).toBe("graveyard");
    }
  });

  it("Dwarven Mine makes a Dwarf only when it enters untapped", () => {
    const { s: s0, ap } = fresh();
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, card("Mountain", "Basic Land — Mountain"));
    const mine = moveTo(s0, ap, dwarvenMine, "hand");
    const s = passAll(act(s0, { type: "playLand", player: ap, objectId: mine }));
    const dwarves = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Dwarf Token");
    expect(dwarves).toHaveLength(1);
  });

  it("bots crack Fabled Passage in their first main phase", () => {
    const { s: s0, ap } = fresh();
    const passage = putOnBattlefield(s0, ap, fabledPassage);
    // No land left to play this turn.
    s0.players[ap]!.landsPlayedThisTurn = 1;
    const plan = botActions(s0, ap);
    expect(plan.some((a) => a.type === "activateAbility" && a.objectId === passage)).toBe(true);
  });
});
