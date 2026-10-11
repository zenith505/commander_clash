// Effects on groups of permanents ("destroy all", "each creature", "creatures you control with ...")
// and creature types or colors chosen as a permanent enters (CR 614.12) or as a spell resolves.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, manaOptions, moveObject, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(passAll(s));
};
const choose = (s: GameState, pid: PlayerId, choice: string) => settle(act(s, { type: "chooseOption", player: pid, choice }));

const tranquility = card("Tranquility", "Sorcery", "{2}{G}", { oracleText: "Destroy all enchantments." });
const vengeance = card("Akroma's Vengeance", "Sorcery", "{4}{W}{W}", { oracleText: "Destroy all artifacts, creatures, and enchantments." });
const evacuation = card("Evacuation", "Instant", "{3}{U}{U}", { oracleText: "Return all creatures to their owners' hands." });
const earthquake = card("Earthquake", "Sorcery", "{X}{R}", { oracleText: "Earthquake deals X damage to each creature without flying and each player." });
const ceratok = card("Crowned Ceratok", "Creature — Rhino", "{3}{G}", { power: "4", toughness: "3", oracleText: "Trample\nEach creature you control with a +1/+1 counter on it has trample." });
const plagueEngineer = card("Plague Engineer", "Creature — Rat Assassin", "{2}{B}", {
  power: "2",
  toughness: "2",
  oracleText: "Deathtouch\nAs this creature enters, choose a creature type.\nCreatures of the chosen type your opponents control get -1/-1.",
});
const heart = card("Coldsteel Heart", "Snow Artifact", "{2}", { oracleText: "This artifact enters tapped.\nAs this artifact enters, choose a color.\n{T}: Add one mana of the chosen color." });
const dominance = card("Kindred Dominance", "Sorcery", "{5}{B}{B}", { oracleText: "Choose a creature type. Destroy all creatures that aren't of the chosen type." });
const melody = card("Distant Melody", "Sorcery", "{3}{U}", { oracleText: "Choose a creature type. Draw a card for each permanent you control of that type." });
const mare = card("Diamond Mare", "Artifact Creature — Horse", "{2}", { power: "1", toughness: "3", oracleText: "As this creature enters, choose a color.\nWhenever you cast a spell of the chosen color, you gain 1 life." });
const instruments = card("Instruments of War", "Artifact", "{3}", { oracleText: "As this artifact enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1." });
const oketra = card("In Oketra's Name", "Instant", "{1}{W}", { oracleText: "Zombies you control get +2/+1 until end of turn. Other creatures you control get +1/+1 until end of turn." });
const elf = (name = "Llanowar Elves") => card(name, "Creature — Elf Druid", "{G}", { power: "1", toughness: "1" });
const changeling = card("Changeling Outcast", "Creature — Shapeshifter", "{B}", { power: "1", toughness: "1", keywords: ["Changeling"], oracleText: "Changeling" });
const flyer = card("Wind Drake", "Creature — Drake", "{2}{U}", { power: "2", toughness: "2", oracleText: "Flying", keywords: ["Flying"] });
const aura = card("Pacifism", "Enchantment — Aura", "{1}{W}", { oracleText: "Enchant creature\nEnchanted creature can't attack or block." });
const relic = card("Mind Stone", "Artifact", "{2}");

describe("groups of permanents", () => {
  it("compiles the templates", () => {
    supported(tranquility, vengeance, evacuation, earthquake, ceratok, plagueEngineer, heart, dominance, melody, mare, instruments);
    expect(compileCard(vengeance).spell!.effects[0]).toMatchObject({ type: "destroy", what: { ref: "each", filter: { types: ["Artifact", "Creature", "Enchantment"] } } });
    // "Other creatures you control" in a spell means other than the Zombies it just named: not modeled.
    expect(isFullySupported(oketra)).toBe(false);
  });

  it('"Destroy all artifacts, creatures, and enchantments" leaves lands and players alone', () => {
    const { s: s0, ap, ids, opp } = setup([vengeance]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, flyer);
    const stone = putOnBattlefield(s0, opp, relic);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect([zone(s, mine), zone(s, theirs), zone(s, stone)]).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")).toBe(true);
  });

  it("Tranquility destroys Auras too, and Evacuation returns every creature to its owner's hand", () => {
    const { s: s0, ap, ids, opp } = setup([tranquility, evacuation]);
    const b = putOnBattlefield(s0, opp, bear());
    const a = putOnBattlefield(s0, ap, aura);
    s0.objects[a]!.attachedTo = b;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(zone(s, a)).toBe("graveyard");
    const mine = putOnBattlefield(s, ap, bear());
    s = run(s, planCast(s, ap, ids[1]!));
    expect([zone(s, b), zone(s, mine)]).toEqual(["hand", "hand"]);
    expect(s.players[opp]!.hand).toContain(b);
  });

  it("Earthquake: X damage to each creature without flying and each player, all at once (CR 120.3)", () => {
    const { s: s0, ap, ids, opp } = setup([earthquake]);
    const b = putOnBattlefield(s0, opp, bear());
    const f = putOnBattlefield(s0, opp, flyer);
    const lives = s0.turnOrder.map((p) => s0.players[p]!.life);
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2));
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, f)).toBe("battlefield");
    expect(s.turnOrder.map((p) => s.players[p]!.life)).toEqual(lives.map((l) => l - 2));
  });

  it('a spell\'s "each other creature you control" means other than its target', () => {
    const tactics = card("Phalanx Tactics", "Instant", "{W}", { oracleText: "Target creature you control gets +2/+1 until end of turn. Each other creature you control gets +1/+1 until end of turn." });
    const { s: s0, ap, ids } = setup([tactics, oketra]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: a }]));
    expect([pt(s, a), pt(s, b)]).toEqual(["4/3", "3/3"]);
  });

  it("a static ability for a group with a counter: trample while it has a +1/+1 counter", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, ceratok);
    const b = putOnBattlefield(s, ap, bear());
    const trample = () => {
      invalidateCharacteristics(s);
      return characteristics(s, s.objects[b]!).keywords.includes("Trample");
    };
    expect(trample()).toBe(false);
    s.objects[b]!.counters["+1/+1"] = 1;
    expect(trample()).toBe(true);
  });
});

describe("choosing a creature type or color", () => {
  it("as it enters (CR 614.12): Plague Engineer asks first, then shrinks the opponents' creatures of that type, changelings included", () => {
    const { s: s0, ap, ids, opp } = setup([plagueEngineer]);
    const e1 = putOnBattlefield(s0, opp, elf());
    const ch = putOnBattlefield(s0, opp, changeling);
    const mine = putOnBattlefield(s0, ap, elf("My Elf"));
    const b = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "creatureType", objectId: ids[0] });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toContain("Elf");
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "Artifact" })).toThrow();
    s = choose(s, ap, "Elf");
    expect(s.objects[ids[0]!]!.chosen).toEqual({ type: "Elf" });
    expect(logged(s, /chooses Elf for Plague Engineer/)).toBe(true);
    // The 1/1s of that type die to state-based actions; ours and the Bear don't change.
    expect([zone(s, e1), zone(s, ch)]).toEqual(["graveyard", "graveyard"]);
    expect([pt(s, mine), pt(s, b)]).toEqual(["1/1", "2/2"]);
  });

  it("the choice is forgotten when it leaves (CR 400.7)", () => {
    const { s: s0, ap, ids } = setup([instruments]);
    const s = choose(run(s0, planCast(s0, ap, ids[0]!)), ap, "Bear");
    const b = putOnBattlefield(s, ap, bear());
    expect(pt(s, b)).toBe("3/3");
    moveObject(s, ids[0]!, "hand");
    moveObject(s, ids[0]!, "battlefield");
    expect(s.objects[ids[0]!]!.chosen).toBeUndefined();
    expect(pt(s, b)).toBe("2/2");
    expect(s.entersChoices).toHaveLength(1); // it asks again
  });

  it("Coldsteel Heart taps for the chosen color only", () => {
    const { s: s0, ap, ids } = setup([heart]);
    const s = choose(run(s0, planCast(s0, ap, ids[0]!)), ap, "Blue");
    const o = s.objects[ids[0]!]!;
    expect(o.tapped).toBe(true);
    expect(manaOptions(s, o).map((m) => m.mana)).toEqual(["U"]);
  });

  it("a spell's choice: Kindred Dominance spares creatures of the chosen type and changelings", () => {
    const { s: s0, ap, ids, opp } = setup([dominance]);
    const e = putOnBattlefield(s0, opp, elf());
    const ch = putOnBattlefield(s0, opp, changeling);
    const b = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "creatureType" });
    expect(s.pending?.kind === "chooseOption" && s.pending.objectId).toBeUndefined();
    s = choose(s, ap, "Elf");
    expect([zone(s, e), zone(s, ch), zone(s, b)]).toEqual(["battlefield", "battlefield", "graveyard"]);
  });

  it("Distant Melody draws a card for each permanent you control of the chosen type", () => {
    const { s: s0, ap, ids } = setup([melody]);
    putOnBattlefield(s0, ap, elf());
    putOnBattlefield(s0, ap, elf());
    putOnBattlefield(s0, ap, changeling);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const hand = s.players[ap]!.hand.length;
    s = choose(s, ap, "Elf");
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });

  it("Diamond Mare: you gain 1 life whenever you cast a spell of the chosen color", () => {
    const red = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
    const green = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
    const { s: s0, ap, ids, opp } = setup([mare, red, green]);
    let s = choose(run(s0, planCast(s0, ap, ids[0]!)), ap, "Red");
    const life = s.players[ap]!.life;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    expect(s.players[ap]!.life).toBe(life + 1);
    const b = putOnBattlefield(s, ap, bear());
    s = run(s, planCast(s, ap, ids[2]!, [{ kind: "object", id: b }]));
    expect(s.players[ap]!.life).toBe(life + 1);
  });

  it("bots aim a harmful choice at opponents and a helpful one at their own creatures", () => {
    const { s: s0, ap, ids, opp } = setup([plagueEngineer, instruments]);
    putOnBattlefield(s0, opp, elf());
    putOnBattlefield(s0, opp, elf());
    putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(botActions(s, ap)[0]).toMatchObject({ type: "chooseOption", choice: "Elf" });
    s = choose(s, ap, "Elf");
    s = run(s, planCast(s, ap, ids[1]!));
    expect(botActions(s, ap)[0]).toMatchObject({ type: "chooseOption", choice: "Bear" });
  });

  it("bots don't cast a sweeper that would hurt them more than their opponents", () => {
    const { s: s0, ap, opp } = setup([vengeance]);
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, bear());
    s0.players[ap]!.command = [];
    s0.players[ap]!.hand = [s0.players[ap]!.hand.at(-1)!];
    const a = botActions(s0, ap);
    expect(a.some((x) => x.type === "castSpell")).toBe(false);
    const s1 = setup([vengeance]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s1.s, s1.opp, bear());
    s1.s.players[s1.ap]!.command = [];
    s1.s.players[s1.ap]!.hand = [s1.ids[0]!];
    expect(botActions(s1.s, s1.ap).some((x) => x.type === "castSpell")).toBe(true);
    void opp;
  });
});
