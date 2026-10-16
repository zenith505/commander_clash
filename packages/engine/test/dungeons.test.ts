// Venture into the dungeon (CR 701.49) with the three dungeons from Adventures in the Forgotten Realms (CR 309):
// Lost Mine of Phandelver, Dungeon of the Mad Mage and Tomb of Annihilation; completing one (CR 309.7, 704.5t);
// "as long as you've completed a dungeon"; Hama Pashar's extra trigger (CR 603.2d); "if you have the initiative".

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, DUNGEONS, dungeonDef, dungeonSupported, isFullySupported, LOST_MINE, MAD_MAGE, planCast, TOMB_OF_ANNIHILATION, waitingOn } from "../src";
import type { Action, CardDef, Dungeon, GameState, PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));

/** Pass priority and let bots answer every choice until the stack and the trigger queue are empty; `answer` gives
 * the test's own answer, or null to stop. */
function settle(s: GameState, answer?: (s: GameState) => Action | undefined | null) {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    const mine = answer?.(s);
    if (mine === null) break; // stop here
    if (mine) s = act(s, mine);
    else if (s.pending) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
}
/** Answer the venture choice (a dungeon, or a room where the arrows branch) with `choice`. */
const pickRoom = (pid: PlayerId, choice: string) => (s: GameState): Action | undefined =>
  s.pending?.kind === "chooseOption" && s.pending.what === "venture" && s.pending.player === pid ? { type: "chooseOption", player: pid, choice } : undefined;
/** The player's venture marker is on `room` of `d`. */
function inRoom(s: GameState, pid: PlayerId, d: Dungeon, room: number) {
  const def = dungeonDef(d);
  s.cards[def.oracleId] = def;
  s.players[pid]!.dungeon = { name: d.name, room };
}
/** Move the marker into `room` the way venturing does: its room ability triggers (CR 309.4c). */
function enter(s: GameState, pid: PlayerId, d: Dungeon, room: number) {
  inRoom(s, pid, d, room);
  s.triggerQueue.push({ sourceId: "", sourceCardId: dungeonDef(d).oracleId, controller: pid, index: room });
}
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
const ventureIndex = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => /Venture/.test(a.body.text));
const tokens = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.name === name);

// Real oracle text (Scryfall).
const veteranDungeoneer = card("Veteran Dungeoneer", "Creature — Human Warrior", "{3}{W}", { power: "3", toughness: "4", keywords: ["Venture into the dungeon"], oracleText: "When this creature enters, venture into the dungeon. (Enter the first room or advance to the next room.)" });
const gloomStalker = card("Gloom Stalker", "Creature — Dwarf Ranger", "{2}{W}", { power: "2", toughness: "3", oracleText: "As long as you've completed a dungeon, this creature has double strike." });
const hamaPashar = card("Hama Pashar, Ruin Seeker", "Legendary Creature — Human Wizard", "{1}{W}{U}", { power: "2", toughness: "3", oracleText: "Room abilities of dungeons you own trigger an additional time." });
const feywildCaretaker = card("Feywild Caretaker", "Creature — Orc Wizard", "{4}{U}", { power: "3", toughness: "4", oracleText: "When this creature enters, you take the initiative.\nAt the beginning of your end step, if you have the initiative, create a 1/1 blue Faerie Dragon creature token with flying." });
const secretDoor = card("Secret Door", "Artifact Creature — Wall", "{U}", { power: "0", toughness: "4", keywords: ["Defender", "Venture into the dungeon"], oracleText: "Defender\n{4}{U}: Venture into the dungeon. Activate only as a sorcery. (Enter the first room or advance to the next room.)" });
const cloisterGargoyle = card("Cloister Gargoyle", "Artifact Creature — Gargoyle", "{2}{W}", { power: "0", toughness: "4", keywords: ["Venture into the dungeon"], oracleText: "When this creature enters, venture into the dungeon. (Enter the first room or advance to the next room.)\nAs long as you've completed a dungeon, this creature gets +3/+0 and has flying." });
const seatOfTheSynod = card("Seat of the Synod", "Artifact Land", "", { oracleText: "{T}: Add {U}." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const ancestralRecall = card("Ancestral Recall", "Instant", "{U}", { oracleText: "Target player draws three cards." });

describe("venture into the dungeon (CR 701.49)", () => {
  it("parses, and every dungeon's rooms compile", () => {
    supported(veteranDungeoneer, gloomStalker, hamaPashar, feywildCaretaker, secretDoor, cloisterGargoyle);
    expect(DUNGEONS.map((d) => d.name)).toEqual(["Undercity", "Lost Mine of Phandelver", "Dungeon of the Mad Mage", "Tomb of Annihilation"]);
    DUNGEONS.forEach((d) => expect(dungeonSupported(d), d.name).toBe(true));
  });

  it("with no dungeon, it offers the three dungeons but not Undercity, and enters the chosen one's first room", () => {
    const { s: s0, ap, ids } = setup([veteranDungeoneer]);
    let s = cast(s0, ap, ids[0]!);
    s = settle(s, (x) => {
      if (x.pending?.kind === "chooseOption" && x.pending.what === "venture") {
        expect(x.pending.options).toEqual(["Lost Mine of Phandelver", "Dungeon of the Mad Mage", "Tomb of Annihilation"]);
        return { type: "chooseOption", player: ap, choice: "Lost Mine of Phandelver" };
      }
      return undefined;
    });
    expect(s.players[ap]!.dungeon).toEqual({ name: "Lost Mine of Phandelver", room: 0 });
    expect(logged(s, /moves their venture marker into Cave Entrance/)).toBe(true);
    expect(logged(s, /scr(y|ies) 1/i)).toBe(true);
  });

  it("from the next-to-last room, it enters the bottommost room; after its ability resolves the dungeon is completed", () => {
    const { s: s0, ap } = setup([]);
    const door = putOnBattlefield(s0, ap, secretDoor);
    const stalker = putOnBattlefield(s0, ap, gloomStalker);
    const gargoyle = putOnBattlefield(s0, ap, cloisterGargoyle);
    inRoom(s0, ap, LOST_MINE, 3); // Storeroom
    expect(characteristics(s0, s0.objects[stalker]!).keywords).not.toContain("Double strike");
    const hand = s0.players[ap]!.hand.length;
    let s = settle(activate(s0, ap, door, ventureIndex(s0, door)));
    // Temple of Dumathoin: draw a card.
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[ap]!.dungeon).toBeUndefined();
    expect(s.players[ap]!.completedDungeons).toEqual(["Lost Mine of Phandelver"]);
    expect(characteristics(s, s.objects[stalker]!).keywords).toContain("Double strike");
    expect(characteristics(s, s.objects[gargoyle]!).keywords).toContain("Flying");
    expect(characteristics(s, s.objects[gargoyle]!).power).toBe(3);
    // A completed dungeon can be ventured into again.
    s = passUntil(s, "main1", ap, 4000);
    s = settle(activate(s, ap, door, ventureIndex(s, door)), (x) => {
      if (x.pending?.kind === "chooseOption" && x.pending.what === "venture") {
        expect(x.pending.options).toContain("Lost Mine of Phandelver");
        return { type: "chooseOption", player: ap, choice: "Lost Mine of Phandelver" };
      }
      return undefined;
    });
    expect(s.players[ap]!.dungeon).toEqual({ name: "Lost Mine of Phandelver", room: 0 });
  });

  it("where the arrows branch, the player picks the room; Hama Pashar makes its ability trigger twice", () => {
    const { s: s0, ap, ids } = setup([veteranDungeoneer]);
    putOnBattlefield(s0, ap, hamaPashar);
    inRoom(s0, ap, LOST_MINE, 0); // Cave Entrance: on to Goblin Lair or Mine Tunnels
    let s = cast(s0, ap, ids[0]!);
    s = settle(s, (x) => {
      if (x.pending?.kind === "chooseOption" && x.pending.what === "venture") {
        expect(x.pending.options).toEqual(["Goblin Lair", "Mine Tunnels"]);
        return { type: "chooseOption", player: ap, choice: "Goblin Lair" };
      }
      return undefined;
    });
    expect(s.players[ap]!.dungeon).toEqual({ name: "Lost Mine of Phandelver", room: 1 });
    expect(tokens(s, ap, "Goblin Token")).toHaveLength(2);
  });

  it("Mad Wizard's Lair: draw three, then cast one of those three (not another card in hand) for free", () => {
    const { s: s0, ap, ids } = setup([divination]);
    inRoom(s0, ap, MAD_MAGE, 7); // Deep Mines
    const door = putOnBattlefield(s0, ap, secretDoor);
    // On top after the activation's cost: Hill Giant, Ancestral Recall, a land.
    onTop(s0, ap, seatOfTheSynod);
    const recall = onTop(s0, ap, ancestralRecall);
    const g = onTop(s0, ap, giant);
    let s = settle(activate(s0, ap, door, ventureIndex(s0, door)), (x) => (x.pending?.kind === "chooseOption" && x.pending.what === "castFromHand" ? null : undefined));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromHand", player: ap });
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(options).toEqual(expect.arrayContaining([g, recall, "none"]));
    expect(options).not.toContain(ids[0]); // Divination was in hand already
    expect(options).toHaveLength(3); // the land can't be cast
    s = act(s, { type: "chooseOption", player: ap, choice: g });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: g });
    const untapped = s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length;
    for (const a of planCast(s, ap, g)!) s = act(s, a);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length).toBe(untapped);
    s = settle(s);
    expect(s.battlefield).toContain(g);
    expect(s.players[ap]!.completedDungeons).toEqual(["Dungeon of the Mad Mage"]);
  });

  it("Runestone Caverns: the two exiled cards stay playable on later turns while they stay exiled (CR 611.2a)", () => {
    const { s: s0, ap } = setup([]);
    const b = onTop(s0, ap, bear({ name: "Runestone Bear" }));
    enter(s0, ap, MAD_MAGE, 5);
    let s = settle(s0);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(planCast(s, ap, b)).not.toBeNull();
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4], 4000);
    s = passUntil(s, "main1", ap, 4000);
    expect(s.objects[b]!.zone).toBe("exile");
    s = settle(cast(s, ap, b));
    expect(s.battlefield).toContain(b);
  });

  it("Tomb of Annihilation, Veils of Fear: each player loses 2 life unless they discard a card", () => {
    const { s: s0, ap, opp } = setup([bear()]);
    enter(s0, ap, TOMB_OF_ANNIHILATION, 1);
    const hand = s0.players[opp]!.hand.length;
    const asked: PlayerId[] = [];
    const s = settle(s0, (x) => {
      if (x.pending?.kind !== "chooseOption" || x.pending.what !== "punisher") return undefined;
      const pid = x.pending.player;
      asked.push(pid);
      expect(x.pending.labels).toEqual(["Discard a card", "Lose 2 life"]);
      return { type: "chooseOption", player: pid, choice: pid === ap ? "none" : "0" };
    });
    // In APNAP order, every player.
    expect(asked).toEqual(s.turnOrder.slice(s.turnOrder.indexOf(ap)).concat(s.turnOrder.slice(0, s.turnOrder.indexOf(ap))));
    expect(s.players[ap]!.life).toBe(38);
    expect(s.players[opp]!.life).toBe(40);
    expect(s.players[opp]!.hand.length).toBe(hand - 1);
  });

  it("Oubliette: discard a card and sacrifice an artifact, a creature and a land, as many as can be different permanents", () => {
    const { s: s0, ap } = setup([bear()]);
    // Only an artifact land, an artifact creature and a basic land: the artifact must be the artifact land, so the
    // artifact creature can be the creature (CR 609.3: do as much as possible).
    s0.battlefield = s0.battlefield.filter((id) => s0.objects[id]!.controller !== ap);
    const seat = putOnBattlefield(s0, ap, seatOfTheSynod);
    const door = putOnBattlefield(s0, ap, secretDoor);
    const forestId = putOnBattlefield(s0, ap, card("Forest", "Basic Land — Forest"));
    enter(s0, ap, TOMB_OF_ANNIHILATION, 2);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(s0);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    for (const id of [seat, door, forestId]) expect(s.objects[id]!.zone).toBe("graveyard");
  });

  it("Sandfall Cell: each player loses 2 life unless they sacrifice an artifact, a creature or a land", () => {
    const { s: s0, ap, opp } = setup([]);
    enter(s0, ap, TOMB_OF_ANNIHILATION, 3);
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap).length;
    const s = settle(s0, (x) => {
      if (x.pending?.kind === "chooseOption" && x.pending.what === "punisher") {
        // An opponent with no permanents isn't offered the sacrifice.
        if (x.pending.player !== ap) expect(x.pending.options).toEqual(["none"]);
        return { type: "chooseOption", player: x.pending.player, choice: x.pending.player === ap ? "0" : "none" };
      }
      return undefined;
    });
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap).length).toBe(lands - 1);
    expect(s.players[ap]!.life).toBe(40);
    expect(s.players[opp]!.life).toBe(38);
  });

  it("Cradle of the Death God creates The Atropal, a legendary 4/4 deathtouch token, and completes the Tomb", () => {
    const { s: s0, ap } = setup([]);
    enter(s0, ap, TOMB_OF_ANNIHILATION, 4);
    const s = settle(s0);
    const [atropal] = tokens(s, ap, "The Atropal");
    expect(atropal).toBeDefined();
    const ch = characteristics(s, s.objects[atropal!]!);
    expect(ch.supertypes).toContain("Legendary");
    expect(ch.subtypes).toEqual(["God", "Horror"]);
    expect(ch.keywords).toContain("Deathtouch");
    expect([ch.power, ch.toughness]).toEqual([4, 4]);
    expect(s.players[ap]!.completedDungeons).toEqual(["Tomb of Annihilation"]);
  });

  it("Feywild Caretaker: a Faerie Dragon at your end step only while you have the initiative", () => {
    const { s: s0, ap, ids } = setup([feywildCaretaker]);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.initiative).toBe(ap);
    s = settle(passUntil(s, "end", ap));
    expect(tokens(s, ap, "Faerie Dragon Token")).toHaveLength(1);

    const { s: s1, ap: ap1 } = setup([]);
    putOnBattlefield(s1, ap1, feywildCaretaker);
    s = settle(passUntil(s1, "end", ap1));
    expect(tokens(s, ap1, "Faerie Dragon Token")).toHaveLength(0);
  });
});

// Real oracle text (Scryfall).
const dungeoneersPack = card("Dungeoneer's Pack", "Artifact", "{3}", { keywords: ["Treasure"], oracleText: "This artifact enters tapped.\n{2}, {T}, Sacrifice this artifact: You take the initiative, gain 3 life, draw a card, and create a Treasure token. Activate only as a sorcery. (A Treasure token is an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")" });
const imoen = card("Imoen, Mystic Trickster", "Legendary Creature — Human Rogue Wizard", "{2}{U}", { power: "2", toughness: "3", keywords: ["Choose a background", "Ward"], oracleText: "Ward {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\nAt the beginning of your end step, if you have the initiative, draw a card. Draw another card if you've completed a dungeon.\nChoose a Background (You can have a Background as a second commander.)" });
const safana = card("Safana, Calimport Cutthroat", "Legendary Creature — Human Rogue", "{2}{B}", { power: "3", toughness: "2", keywords: ["Choose a background", "Treasure", "Menace"], oracleText: "Menace\nAt the beginning of your end step, if you have the initiative, create a Treasure token. Create three of those tokens instead if you've completed a dungeon.\nChoose a Background (You can have a Background as a second commander.)" });
const undermountainAdventurer = card("Undermountain Adventurer", "Creature — Giant Warrior", "{3}{G}", { power: "3", toughness: "4", keywords: ["Vigilance"], oracleText: "Vigilance\nWhen this creature enters, you take the initiative.\n{T}: Add {G}{G}. If you've completed a dungeon, add six {G} instead." });
const tombOfHorrorsAdventurer = card("Tomb of Horrors Adventurer", "Creature — Elf Monk", "{5}{U}", { power: "4", toughness: "4", oracleText: "When this creature enters, you take the initiative.\nWhenever you cast your second spell each turn, copy it. If you've completed a dungeon, copy that spell twice instead. You may choose new targets for the copies. (A copy of a permanent spell becomes a token.)" });
const rilsaRael = card("Rilsa Rael, Kingpin", "Legendary Creature — Human Rogue", "{3}{U}{B}", { power: "2", toughness: "5", keywords: ["Deathtouch"], oracleText: "Deathtouch\nWhen Rilsa Rael enters, you take the initiative.\nWhenever you attack, target attacking creature gains deathtouch until end of turn. If you've completed a dungeon, that creature also gets +5/+0 and gains first strike and menace until end of turn." });

describe("completed dungeons inside effects; Dungeoneer's Pack", () => {
  it("parses", () => supported(dungeoneersPack, imoen, safana, undermountainAdventurer, tombOfHorrorsAdventurer, rilsaRael));

  it("Dungeoneer's Pack: the initiative, 3 life, a card and a Treasure, in that order", () => {
    const { s: s0, ap } = setup([]);
    const pack = putOnBattlefield(s0, ap, dungeoneersPack);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(activate(s0, ap, pack, 0));
    expect(s.initiative).toBe(ap);
    expect(s.players[ap]!.dungeon?.name).toBe("Undercity"); // taking the initiative ventures into Undercity (CR 726.2)
    expect(s.players[ap]!.life).toBe(43);
    // The card, and Undercity's Secret Entrance puts a basic land card into the hand.
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(tokens(s, ap, "Treasure Token")).toHaveLength(1);
    expect(s.objects[pack]!.zone).toBe("graveyard");
  });

  it("Imoen and Safana: with the initiative, one card and one Treasure; after a completed dungeon, two cards and three Treasures", () => {
    for (const done of [false, true]) {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, imoen);
      putOnBattlefield(s0, ap, safana);
      s0.initiative = ap;
      if (done) s0.players[ap]!.completedDungeons = ["Lost Mine of Phandelver"];
      const before = passUntil(s0, "end", ap);
      const hand = before.players[ap]!.hand.length;
      const s = settle(before);
      expect(s.players[ap]!.hand.length).toBe(hand + (done ? 2 : 1));
      expect(tokens(s, ap, "Treasure Token")).toHaveLength(done ? 3 : 1);
    }
  });

  it("Undermountain Adventurer: {G}{G}, or six {G} after a completed dungeon", () => {
    for (const done of [false, true]) {
      const { s: s0, ap } = setup([]);
      const u = putOnBattlefield(s0, ap, undermountainAdventurer);
      if (done) s0.players[ap]!.completedDungeons = ["Tomb of Annihilation"];
      const s = act(s0, { type: "activateMana", player: ap, objectId: u, mana: "G" });
      expect(s.players[ap]!.manaPool.G).toBe(done ? 6 : 2);
    }
  });

  it("Tomb of Horrors Adventurer: the second spell is copied once, or twice after a completed dungeon", () => {
    for (const done of [false, true]) {
      const { s: s0, ap, ids } = setup([divination, divination]);
      putOnBattlefield(s0, ap, tombOfHorrorsAdventurer);
      if (done) s0.players[ap]!.completedDungeons = ["Dungeon of the Mad Mage"];
      let s = settle(cast(s0, ap, ids[0]!));
      const hand = s.players[ap]!.hand.length;
      s = settle(cast(s, ap, ids[1]!));
      // The Divination left the hand; it and its copies each draw two.
      expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2 * (done ? 3 : 2));
    }
  });

  it("Rilsa Rael: deathtouch for the target attacker; after a completed dungeon also +5/+0, first strike and menace", () => {
    for (const done of [false, true]) {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, ap, rilsaRael);
      const b = putOnBattlefield(s0, ap, bear());
      if (done) s0.players[ap]!.completedDungeons = ["Lost Mine of Phandelver"];
      let s = passUntil(s0, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
      s = settle(s, (x) => (x.pending?.kind === "chooseTargets" ? { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: b }] } : undefined));
      const c = characteristics(s, s.objects[b]!);
      expect(c.keywords).toContain("Deathtouch");
      expect(c.power).toBe(done ? 7 : 2);
      expect(c.keywords.includes("First strike")).toBe(done);
      expect(c.keywords.includes("Menace")).toBe(done);
    }
  });
});
