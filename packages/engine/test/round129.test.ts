// Round 129: round 128's gaps (Goblin Guide, Insidious Dreams, Doomsday, Breeches, Brazen Plunderer), then the most
// played cards.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, characteristics, isFullySupported, legalActions, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Bots answer every choice and everyone passes until the stack and trigger queue are empty. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const who = s.pending ? s.pending.player : waitingOn(s)!;
    const acts = s.pending ? botActions(s, who) : [];
    s = acts.length ? acts.reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: who });
  }
  return s;
};
/** Everyone passes until something asks a player to choose (or the stack is empty). */
const passToPending = (s: GameState) => {
  for (let i = 0; i < 30 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const legalLand = (s: GameState, pid: PlayerId, id: string) => legalActions(s, pid).some((a) => a.type === "playLand" && a.objectId === id);
const logText = (s: GameState) => s.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n");
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
/** A fresh copy of `def` put into `pid`'s `zone` (on top of the library). */
const putIn = (s: GameState, pid: PlayerId, def: CardDef, zone: "library" | "graveyard" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
/** `ap` attacks `defender` with `attackers`; blocks are none and bots answer what's asked, until combat damage is done. */
const attackThrough = (s0: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => {
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 80 && s.step !== "end"; i++) {
    const pid = waitingOn(s)!;
    s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: pid, blocks: [] }) : s.pending ? botActions(s, pid).reduce((x, y) => act(x, y), s) : act(s, { type: "passPriority", player: pid });
  }
  return s;
};

const goblinGuide = card("Goblin Guide", "Creature — Goblin Scout", "{R}", {
  power: "2",
  toughness: "2",
  keywords: ["Haste"],
  oracleText: "Haste\nWhenever this creature attacks, defending player reveals the top card of their library. If it's a land card, that player puts it into their hand.",
});

describe("Goblin Guide: the defending player reveals their top card, and takes it if it's a land", () => {
  for (const land of [true, false])
    it(land ? "a land goes to that player's hand" : "a nonland card stays on top (rulings)", () => {
      supported(goblinGuide);
      const { s: s0, ap, opp } = setup([]);
      const g = putOnBattlefield(s0, ap, goblinGuide);
      const top = putIn(s0, opp, land ? card("Test Wastes", "Land") : card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" }), "library");
      const s = attackThrough(s0, ap, [{ attacker: g, defender: opp }]);
      expect(logText(s)).toMatch(new RegExp(`reveals ${land ? "Test Wastes" : "Test Ogre"} from the top of their library`));
      expect(s.objects[top]!.zone).toBe(land ? "hand" : "library");
      if (land) expect(s.players[opp]!.hand).toContain(top);
      else expect(s.players[opp]!.library[0]).toBe(top);
    });
});

const insidious = card("Insidious Dreams", "Instant", "{3}{B}", {
  oracleText: "As an additional cost to cast this spell, discard X cards.\nSearch your library for X cards, then shuffle and put those cards on top in any order.",
});

describe("Insidious Dreams: X cards found for the X cards discarded, on top in your order", () => {
  it("discards two, finds exactly two, then orders them", () => {
    supported(insidious);
    const fodder = [card("Fodder A", "Sorcery", "{B}"), card("Fodder B", "Sorcery", "{B}")];
    const { s: s0, ap, ids } = setup([insidious, ...fodder]);
    const [a, b] = [putIn(s0, ap, card("Wanted A", "Sorcery", "{U}"), "library"), putIn(s0, ap, card("Wanted B", "Sorcery", "{U}"), "library")];
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2, { discard: ids.slice(1) }));
    s = passToPending(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 2, max: 2 });
    s = act(s, { type: "searchLibrary", player: ap, found: [a, b] });
    expect(s.pending).toMatchObject({ kind: "orderLibrary", player: ap });
    s = act(s, { type: "orderLibrary", player: ap, order: [b, a] });
    expect(s.players[ap]!.library.slice(0, 2)).toEqual([b, a]);
    expect(fodder.every((f) => s.players[ap]!.graveyard.some((id) => nameOf(s, id) === f.name))).toBe(true);
  });
});

const doomsday = card("Doomsday", "Sorcery", "{B}{B}{B}", {
  oracleText: "Search your library and graveyard for five cards and exile the rest. Put the chosen cards on top of your library in any order. You lose half your life, rounded up.",
});

describe("Doomsday: five cards from library and graveyard, the rest exiled, on top in your order", () => {
  it("finds three in the library and two in the graveyard, exiles everything else, halves your life", () => {
    supported(doomsday);
    const { s: s0, ap, ids } = setup([doomsday]);
    putOnBattlefield(s0, ap, swamp);
    const lib = [1, 2, 3].map((n) => putIn(s0, ap, card(`Pile ${n}`, "Sorcery", "{U}"), "library"));
    const yard = [4, 5].map((n) => putIn(s0, ap, card(`Pile ${n}`, "Instant", "{U}"), "graveyard"));
    const other = putIn(s0, ap, card("Left Behind", "Instant", "{U}"), "graveyard");
    const life = s0.players[ap]!.life;
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 5, max: 5 });
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toEqual(expect.arrayContaining([...lib, ...yard, other]));
    const five = [...lib, ...yard];
    s = act(s, { type: "searchLibrary", player: ap, found: five });
    expect(s.pending).toMatchObject({ kind: "orderLibrary", player: ap });
    const order = [yard[0]!, lib[2]!, lib[0]!, yard[1]!, lib[1]!];
    s = act(s, { type: "orderLibrary", player: ap, order });
    s = passToPending(s);
    expect(s.players[ap]!.library).toEqual(order);
    expect(s.players[ap]!.graveyard.filter((id) => nameOf(s, id) !== "Doomsday")).toEqual([]);
    expect(s.objects[other]!.zone).toBe("exile");
    expect(s.players[ap]!.life).toBe(life - Math.ceil(life / 2));
  });
  it("with fewer than five cards in all, every one of them ends up in the library (rulings)", () => {
    const { s: s0, ap, ids } = setup([doomsday]);
    putOnBattlefield(s0, ap, swamp);
    for (const id of s0.players[ap]!.library) s0.objects[id]!.zone = "exile";
    s0.players[ap]!.exile.push(...s0.players[ap]!.library);
    s0.players[ap]!.library = [];
    const a = putIn(s0, ap, card("Last A", "Sorcery", "{U}"), "library");
    const b = putIn(s0, ap, card("Last B", "Sorcery", "{U}"), "graveyard");
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 2, max: 2 });
    s = act(s, { type: "searchLibrary", player: ap, found: [a, b] });
    s = act(s, { type: "orderLibrary", player: ap, order: [a, b] });
    s = passToPending(s);
    expect(s.players[ap]!.library).toEqual([a, b]);
  });
});

const breeches = card("Breeches, Brazen Plunderer", "Legendary Creature — Goblin Pirate", "{2}{R}", {
  power: "3",
  toughness: "3",
  keywords: ["Menace", "Partner"],
  oracleText: "Menace\nWhenever one or more Pirates you control deal damage to your opponents, exile the top card of each of those opponents' libraries. You may play those cards this turn, and you may spend mana as though it were mana of any color to cast those spells.\nPartner (You can have two commanders if both have partner.)",
});

describe("Breeches, Brazen Plunderer: the top card of each opponent dealt damage, playable this turn with any mana", () => {
  it("one Pirate hits one opponent in combat: only that opponent's card is exiled (rulings)", () => {
    supported(breeches);
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, breeches);
    const tops = s0.turnOrder.filter((p) => p !== ap).map((p) => putIn(s0, p, card(`Loot ${p}`, "Creature — Elf", "{G}{G}", { power: "1", toughness: "1" }), "library"));
    const s = attackThrough(s0, ap, [{ attacker: b, defender: opp }]);
    const mine = tops.filter((id) => s.objects[id]!.zone === "exile");
    expect(mine).toHaveLength(1);
    expect(s.objects[mine[0]!]!.owner).toBe(opp);
    expect(s.objects[mine[0]!]!.mayPlay).toMatchObject({ player: ap, anyType: true, until: "thisTurn" });
  });
  it("a Pirate pinging every opponent: one trigger, a card from each, castable with mana of any color", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, breeches);
    const pinger = putOnBattlefield(s0, ap, card("Test Corsair", "Creature — Human Pirate", "{1}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to each opponent." }));
    const tops = s0.turnOrder.filter((p) => p !== ap).map((p) => putIn(s0, p, card(`Loot ${p}`, "Creature — Elf", "{G}{G}", { power: "1", toughness: "1" }), "library"));
    let s = settleBots(run(s0, planActivate(s0, ap, pinger, 0)));
    expect(logText(s).match(/Breeches, Brazen Plunderer's ability triggers/g)).toHaveLength(1);
    expect(tops.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
    // Only red and blue mana sources besides the Forests: tap the Forests away, the green cost is paid with other mana.
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && nameOf(s, id) === "Forest") s.objects[id]!.tapped = true;
    const plan = planCast(s, ap, tops[0]!);
    expect(plan).not.toBeNull();
    s = run(s, plan);
    expect(s.stack.some((it) => it.objectId === tops[0])).toBe(true);
  });
});

const gogo = card("Gogo, Master of Mimicry", "Legendary Creature — Wizard", "{2}{U}", {
  power: "2",
  toughness: "4",
  oracleText: "{X}{X}, {T}: Copy target activated or triggered ability you control X times. You may choose new targets for the copies. This ability can't be copied and X can't be 0. (Mana abilities can't be targeted.)",
});
const drawer = card("Test Scholar", "Creature — Human Wizard", "{1}{U}", { power: "1", toughness: "1", oracleText: "{T}: Draw a card." });

describe("Gogo, Master of Mimicry: copy an ability X times", () => {
  it("X = 2: the ability resolves three times", () => {
    supported(gogo);
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, gogo);
    const d = putOnBattlefield(s0, ap, drawer);
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planActivate(s0, ap, d, 0));
    const item = s.stack[s.stack.length - 1]!;
    expect(planActivate(s, ap, g, 0, [{ kind: "stack", id: item.id }], undefined, undefined, 0)).toBeNull(); // X can't be 0
    s = run(s, planActivate(s, ap, g, 0, [{ kind: "stack", id: item.id }], undefined, undefined, 2));
    s = settleBots(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });
  it("its own ability can't be copied by another Gogo", () => {
    const { s: s0, ap } = setup([]);
    // A second one under another name, so the legend rule leaves both.
    const [g1, g2] = [putOnBattlefield(s0, ap, gogo), putOnBattlefield(s0, ap, { ...gogo, name: "Gogo Mimic", typeLine: "Creature — Wizard", supertypes: [], oracleId: `${gogo.oracleId}-2` })];
    const d = putOnBattlefield(s0, ap, drawer);
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planActivate(s0, ap, d, 0));
    s = run(s, planActivate(s, ap, g1, 0, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }], undefined, undefined, 1));
    s = run(s, planActivate(s, ap, g2, 0, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }], undefined, undefined, 1));
    s = settleBots(s);
    expect(logText(s)).toMatch(/can't be copied/);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });
});

const inventory = card("Inventory Management", "Instant", "{R}{W}", {
  keywords: ["Split second"],
  oracleText: "Split second (As long as this spell is on the stack, players can't cast spells or activate abilities that aren't mana abilities.)\nFor each Aura and Equipment you control, you may attach it to a creature you control.",
});

describe("Inventory Management: each Aura and Equipment you control may move to a creature you control", () => {
  it("moves an Equipment, leaves an Aura where it is", () => {
    supported(inventory);
    const { s: s0, ap, ids } = setup([inventory]);
    const [a, b] = [putOnBattlefield(s0, ap, card("Bear A", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" })), putOnBattlefield(s0, ap, card("Bear B", "Creature — Bear", "{1}{G}", { power: "3", toughness: "3" }))];
    const sword = putOnBattlefield(s0, ap, card("Test Sword", "Artifact — Equipment", "{2}", { oracleText: "Equipped creature gets +1/+1.\nEquip {2}" }));
    const aura = putOnBattlefield(s0, ap, card("Test Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+1." }));
    s0.objects[sword]!.attachedTo = a;
    s0.objects[aura]!.attachedTo = a;
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    const asked: string[] = [];
    for (let i = 0; i < 4 && s.pending?.kind === "chooseOption"; i++) {
      const p = s.pending;
      expect(p.what).toBe("enchant");
      expect(p.options).not.toContain(a); // not where it already is
      const about = p.prompt!.includes("Test Sword") ? "sword" : "aura";
      asked.push(about);
      s = act(s, { type: "chooseOption", player: ap, choice: about === "sword" ? b : "none" });
    }
    expect(asked.sort()).toEqual(["aura", "sword"]);
    expect(s.objects[sword]!.attachedTo).toBe(b);
    expect(s.objects[aura]!.attachedTo).toBe(a);
  });
});

const ensnared = card("Ensnared by the Mara", "Sorcery", "{2}{R}{R}", {
  oracleText: "Each opponent faces a villainous choice — They exile cards from the top of their library until they exile a nonland card, then you may cast that card without paying its mana cost, or that player exiles the top four cards of their library and Ensnared by the Mara deals damage equal to the total mana value of those exiled cards to that player.",
});
const dalekEmperor = card("The Dalek Emperor", "Legendary Artifact Creature — Dalek", "{5}{B}{R}", {
  power: "6",
  toughness: "6",
  oracleText: "Affinity for Daleks (This spell costs {1} less to cast for each Dalek you control.)\nOther Daleks you control have haste.\nAt the beginning of combat on your turn, each opponent faces a villainous choice — That player sacrifices a creature of their choice, or you create a 3/3 black Dalek artifact creature token with menace.",
});

describe("Villainous choice (CR 701.55): each opponent chooses, in turn order, and that option is done", () => {
  it("Ensnared by the Mara: one opponent takes the damage, the others give up a card to cast", () => {
    supported(ensnared);
    const { s: s0, ap, ids } = setup([ensnared]);
    const opps = [1, 2, 3].map((n) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + n) % 4]!);
    // The first opponent's top four: mana values 1, 2, 3 and a land.
    for (const [i, mv] of [3, 2, 1].entries()) putIn(s0, opps[0]!, card(`Top ${i}`, "Sorcery", `{${mv}}`), "library");
    putIn(s0, opps[0]!, card("Top Land", "Land"), "library");
    // The second opponent's top card: a creature spell you may cast.
    const loot = putIn(s0, opps[1]!, card("Free Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" }), "library");
    const life = s0.players[opps[0]!]!.life;
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    // APNAP: the opponent after the caster first.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "villainous", player: opps[0] });
    s = act(s, { type: "chooseOption", player: opps[0]!, choice: "1" });
    expect(s.players[opps[0]!]!.life).toBe(life - 6);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "villainous", player: opps[1] });
    s = act(s, { type: "chooseOption", player: opps[1]!, choice: "0" });
    // You may cast the exiled Ogre for free.
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: loot });
    s = act(s, { type: "castSpell", player: ap, objectId: loot });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "villainous", player: opps[2] });
    s = act(s, { type: "chooseOption", player: opps[2]!, choice: "1" });
    s = settleBots(s);
    expect(s.objects[loot]!.zone).toBe("battlefield");
    expect(s.objects[loot]!.controller).toBe(ap);
    expect(logText(s)).toMatch(/faces a villainous choice and chooses/);
  });
  it("The Dalek Emperor: bots with no creature choose the sacrifice (CR 701.55b), the one with a creature gives the token", () => {
    supported(dalekEmperor);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, dalekEmperor);
    const theirs = putOnBattlefield(s0, opp, card("Their Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    let s = passUntil(s0, "beginCombat", ap);
    s = settleBots(s);
    // The opponent with a creature: the sacrifice costs more than the 3/3 token, so the token.
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    const daleks = s.battlefield.filter((id) => nameOf(s, id) === "Dalek Token" || nameOf(s, id) === "Dalek");
    expect(daleks.length).toBe(1);
  });
});

const serraParagon = card("Serra Paragon", "Creature — Angel", "{2}{W}{W}", {
  power: "3",
  toughness: "4",
  keywords: ["Flying"],
  oracleText: "Flying\nOnce during each of your turns, you may play a land from your graveyard or cast a permanent spell with mana value 3 or less from your graveyard. If you do, it gains \"When this permanent is put into a graveyard from the battlefield, exile it and you gain 2 life.\"",
});

describe("Serra Paragon: one land or small permanent spell from the graveyard each turn, and it gains the exile trigger", () => {
  const via = { via: "turnPermission" as const };
  it("a creature cast from the graveyard is exiled when it dies, you gain 2 life, and no land after it this turn", () => {
    supported(serraParagon);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, serraParagon);
    const b = putIn(s0, ap, card("Yard Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }), "graveyard");
    const big = putIn(s0, ap, card("Yard Giant", "Creature — Giant", "{3}{G}", { power: "4", toughness: "4" }), "graveyard");
    const l = putIn(s0, ap, card("Yard Wastes", "Land"), "graveyard");
    s0.players[ap]!.landsPlayedThisTurn = 0;
    // Mana value 4: not with this permission.
    expect(planCast(s0, ap, big, undefined, undefined, "auto", undefined, via)).toBeNull();
    let s = settleBots(run(s0, planCast(s0, ap, b, undefined, undefined, "auto", undefined, via)));
    expect(s.objects[b]!.zone).toBe("battlefield");
    // The permission is one for lands and spells together.
    expect(legalLand(s, ap, l)).toBe(false);
    const life = s.players[ap]!.life;
    s.objects[b]!.damage = 2;
    s = settleBots(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.players[ap]!.life).toBe(life + 2);
  });
  it("a land played from the graveyard gains it too, and uses the turn's permission", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, serraParagon);
    const l = putIn(s0, ap, card("Yard Wastes", "Land"), "graveyard");
    const b = putIn(s0, ap, card("Yard Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }), "graveyard");
    s0.players[ap]!.landsPlayedThisTurn = 0;
    expect(legalLand(s0, ap, l)).toBe(true);
    const s = act(s0, { type: "playLand", player: ap, objectId: l });
    expect(s.objects[l]!.zone).toBe("battlefield");
    expect(planCast(s, ap, b, undefined, undefined, "auto", undefined, via)).toBeNull();
    expect(characteristics(s, s.objects[l]!).grantedAbilities.join("\n")).toContain("exile it and you gain 2 life");
  });
});

const lordOfTheVoid = card("Lord of the Void", "Creature — Demon", "{4}{B}{B}{B}", {
  power: "7",
  toughness: "7",
  keywords: ["Flying"],
  oracleText: "Flying\nWhenever this creature deals combat damage to a player, exile the top seven cards of that player's library, then put a creature card from among them onto the battlefield under your control.",
});

describe("Lord of the Void: exile seven of the player's cards, then take a creature card from among them", () => {
  it("you choose the creature; the rest stay exiled", () => {
    supported(lordOfTheVoid);
    const { s: s0, ap, opp } = setup([]);
    const lord = putOnBattlefield(s0, ap, lordOfTheVoid);
    const ogre = putIn(s0, opp, card("Void Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" }), "library");
    const elf = putIn(s0, opp, card("Void Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" }), "library");
    const rock = putIn(s0, opp, card("Void Rock", "Artifact", "{1}"), "library");
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: lord, defender: opp }] });
    for (let i = 0; i < 80 && !(s.pending?.kind === "chooseOption" && s.pending.what === "impulseChoice"); i++) {
      const pid = waitingOn(s)!;
      s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: pid, blocks: [] }) : s.pending ? botActions(s, pid).reduce((x, y) => act(x, y), s) : act(s, { type: "passPriority", player: pid });
    }
    const p = s.pending as { options: string[]; player: PlayerId };
    expect(p.player).toBe(ap);
    expect(p.options).toContain(ogre);
    expect(p.options).toContain(elf);
    expect(p.options).not.toContain(rock);
    s = act(s, { type: "chooseOption", player: ap, choice: elf });
    expect(s.objects[elf]!.zone).toBe("battlefield");
    expect(s.objects[elf]!.controller).toBe(ap);
    expect(s.objects[ogre]!.zone).toBe("exile");
    expect(s.objects[rock]!.zone).toBe("exile");
  });
});
