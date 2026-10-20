// Mana from the most played cards (round 90): Chrome Mox's imprint ("one mana of any of the exiled card's colors"), Mox
// Amber and Plaza of Heroes ("any color among legendary ..."), Nykthos ("Choose a color. Add an amount of mana of that
// color equal to your devotion to that color"), Three Tree City ("... equal to the number of creatures you control of the
// chosen type"), Bloom Tender and Faeburrow Elder ("For each color among permanents you control, add one mana of that
// color").

import { describe, expect, it } from "vitest";
import { act, bear, card, fourPlayerGame, passAll, passUntil, pt, putOnBattlefield } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, manaAbilitiesOn, manaChoices, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const chromeMox = card("Chrome Mox", "Artifact", "{0}", { oracleText: "Imprint — When this artifact enters, you may exile a nonartifact, nonland card from your hand.\n{T}: Add one mana of any of the exiled card's colors." });
const moxAmber = card("Mox Amber", "Legendary Artifact", "{0}", { oracleText: "{T}: Add one mana of any color among legendary creatures and planeswalkers you control." });
const plaza = card("Plaza of Heroes", "Land", "", { oracleText: "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a legendary spell.\n{T}: Add one mana of any color among legendary permanents you control.\n{3}, {T}, Exile this land: Target legendary creature gains hexproof and indestructible until end of turn." });
const nykthos = card("Nykthos, Shrine to Nyx", "Legendary Land", "", { oracleText: "{T}: Add {C}.\n{2}, {T}: Choose a color. Add an amount of mana of that color equal to your devotion to that color. (Your devotion to a color is the number of mana symbols of that color in the mana costs of permanents you control.)" });
const threeTree = card("Three Tree City", "Legendary Land", "", { oracleText: "As Three Tree City enters, choose a creature type.\n{T}: Add {C}.\n{2}, {T}: Choose a color. Add an amount of mana of that color equal to the number of creatures you control of the chosen type." });
const bloomTender = card("Bloom Tender", "Creature — Elf Druid", "{1}{G}", { power: "1", toughness: "1", oracleText: "Vivid — {T}: For each color among permanents you control, add one mana of that color." });
const faeburrow = card("Faeburrow Elder", "Creature — Treefolk Druid", "{1}{G}{W}", { power: "0", toughness: "0", keywords: ["Vigilance"], oracleText: "Vigilance\nThis creature gets +1/+1 for each color among permanents you control.\n{T}: For each color among permanents you control, add one mana of that color." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const counterspell = card("Counterspell", "Instant", "{U}{U}", { oracleText: "Counter target spell." });
const sol = card("Sol Talisman", "Artifact", "{2}", { oracleText: "" });
const legendElf = card("Legendary Elf", "Legendary Creature — Elf", "{1}{G}", { power: "2", toughness: "2" });
const legendWizard = card("Legendary Wizard", "Legendary Creature — Human Wizard", "{U}{R}", { power: "2", toughness: "2" });
const blueGuy = card("Blue Guy", "Creature — Merfolk", "{U}{U}{U/R}", { power: "1", toughness: "1" });

function fresh(): { s: GameState; ap: PlayerId } {
  const s = passUntil(fourPlayerGame(), "main1");
  return { s, ap: s.activePlayer };
}
function toHand(s: GameState, pid: PlayerId, def: CardDef): string {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}
const pool = (s: GameState, pid: PlayerId) => Object.entries(s.players[pid]!.manaPool).filter(([, n]) => n > 0).map(([m, n]) => `${m}${n}`).sort().join(" ");

describe("mana from the most played cards", () => {
  it("parse", () => {
    for (const d of [chromeMox, moxAmber, plaza, nykthos, threeTree, bloomTender, faeburrow]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Chrome Mox exiles a nonartifact, nonland card from your hand and taps for its colors", () => {
    const { s: s0, ap } = fresh();
    s0.players[ap]!.hand = s0.players[ap]!.hand.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name !== "Grizzly Bears");
    const mox = toHand(s0, ap, chromeMox);
    toHand(s0, ap, sol);
    const wiz = toHand(s0, ap, legendWizard);
    let s = act(s0, { type: "castSpell", player: ap, objectId: mox });
    s = passAll(s);
    // The trigger: "you may", then the card.
    for (let i = 0; i < 6 && s.pending?.kind !== "searchLibrary"; i++) {
      if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    // Only the nonartifact, nonland card can be picked.
    expect((s.pending as { cards: string[] }).cards).toEqual([wiz]);
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [wiz] }));
    expect(s.objects[wiz]!.zone).toBe("exile");
    const moxObj = s.objects[mox]!;
    expect(manaChoices(s, moxObj, manaAbilitiesOn(s, moxObj)[0]!).sort()).toEqual(["R", "U"]);
    expect(() => act(s, { type: "activateMana", player: ap, objectId: mox, mana: "G" })).toThrow();
    s = act(s, { type: "activateMana", player: ap, objectId: mox, mana: "R" });
    expect(s.players[ap]!.manaPool.R).toBe(1);
  });

  it("Chrome Mox with nothing exiled makes no mana", () => {
    const { s: s0, ap } = fresh();
    const mox = putOnBattlefield(s0, ap, chromeMox);
    expect(manaChoices(s0, s0.objects[mox]!, manaAbilitiesOn(s0, s0.objects[mox]!)[0]!)).toEqual([]);
    expect(() => act(s0, { type: "activateMana", player: ap, objectId: mox, mana: "W" })).toThrow();
  });

  it("Chrome Mox's exiled card stays linked to that Mox only: a new Mox object has none (CR 607.2a, 400.7)", () => {
    const { s: s0, ap } = fresh();
    const mox = toHand(s0, ap, chromeMox);
    const b = toHand(s0, ap, bolt);
    let s = act(s0, { type: "castSpell", player: ap, objectId: mox });
    s = passAll(s);
    for (let i = 0; i < 6 && s.pending?.kind !== "searchLibrary"; i++) {
      if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [b] }));
    expect(manaChoices(s, s.objects[mox]!, manaAbilitiesOn(s, s.objects[mox]!)[0]!)).toEqual(["R"]);
    const other = putOnBattlefield(s, ap, chromeMox);
    expect(manaChoices(s, s.objects[other]!, manaAbilitiesOn(s, s.objects[other]!)[0]!)).toEqual([]);
  });

  it("a bot imprints a card with Chrome Mox", () => {
    const { s: s0, ap } = fresh();
    s0.players[ap]!.hand = s0.players[ap]!.hand.filter((id) => s0.cards[s0.objects[id]!.cardId]!.types.includes("Land"));
    const mox = toHand(s0, ap, chromeMox);
    const c = toHand(s0, ap, counterspell);
    let s = passAll(act(s0, { type: "castSpell", player: ap, objectId: mox }));
    for (let i = 0; i < 10 && s.objects[c]!.zone === "hand" && s.stack.length + (s.pending ? 1 : 0) > 0; i++) {
      const [a] = botActions(s, waitingOn(s)!);
      s = act(s, a!);
    }
    expect(s.objects[c]!.zone).toBe("exile");
  });

  it("Mox Amber makes the colors of legendary creatures and planeswalkers you control, not of other permanents", () => {
    const { s, ap } = fresh();
    const mox = putOnBattlefield(s, ap, moxAmber);
    const choices = () => manaChoices(s, s.objects[mox]!, manaAbilitiesOn(s, s.objects[mox]!)[0]!);
    expect(choices()).toEqual([]);
    putOnBattlefield(s, ap, bear());
    expect(choices()).toEqual([]);
    putOnBattlefield(s, ap, legendWizard);
    expect(choices().sort()).toEqual(["R", "U"]);
    const opp = s.turnOrder.find((p) => p !== ap)!;
    putOnBattlefield(s, opp, legendElf);
    expect(choices().sort()).toEqual(["R", "U"]);
    const t = act(s, { type: "activateMana", player: ap, objectId: mox, mana: "U" });
    expect(t.players[ap]!.manaPool.U).toBe(1);
  });

  it("Plaza of Heroes adds any color among legendary permanents you control", () => {
    const { s, ap } = fresh();
    const p = putOnBattlefield(s, ap, plaza);
    putOnBattlefield(s, ap, legendElf);
    const ab = manaAbilitiesOn(s, s.objects[p]!);
    expect(manaChoices(s, s.objects[p]!, ab[2]!)).toEqual(["G"]);
    const t = act(s, { type: "activateMana", player: ap, objectId: p, mana: "G", ability: 2 });
    expect(t.players[ap]!.manaPool.G).toBe(1);
  });

  it("Nykthos adds mana of the chosen color equal to your devotion to it", () => {
    const { s: s0, ap } = fresh();
    const nyk = putOnBattlefield(s0, ap, nykthos);
    putOnBattlefield(s0, ap, blueGuy); // {U}{U}{U/R}: 3 to blue, 1 to red
    putOnBattlefield(s0, ap, legendWizard); // {U}{R}
    s0.players[ap]!.manaPool.C = 2;
    let s = act(s0, { type: "activateMana", player: ap, objectId: nyk, mana: "U", ability: 1 });
    expect(pool(s, ap)).toBe("U4");
    s = act(s0, { type: "activateMana", player: ap, objectId: nyk, mana: "R", ability: 1 });
    expect(pool(s, ap)).toBe("R2");
    s = act(s0, { type: "activateMana", player: ap, objectId: nyk, mana: "W", ability: 1 });
    expect(pool(s, ap)).toBe("");
    expect(s.objects[nyk]!.tapped).toBe(true);
  });

  it("Three Tree City adds a chosen color, as much as creatures you control of the chosen type", () => {
    const { s: s0, ap } = fresh();
    const city = putOnBattlefield(s0, ap, threeTree);
    s0.objects[city]!.chosen = { type: "Bear" };
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, legendElf);
    s0.players[ap]!.manaPool.C = 2;
    const s = act(s0, { type: "activateMana", player: ap, objectId: city, mana: "B", ability: 1 });
    expect(pool(s, ap)).toBe("B3");
  });

  it("Bloom Tender adds one mana of each color among permanents you control, counting itself", () => {
    const { s: s0, ap } = fresh();
    const bt = putOnBattlefield(s0, ap, bloomTender);
    let s = act(s0, { type: "activateMana", player: ap, objectId: bt, mana: "G" });
    expect(pool(s, ap)).toBe("G1");
    putOnBattlefield(s0, ap, legendWizard);
    s = act(s0, { type: "activateMana", player: ap, objectId: bt, mana: "G" });
    expect(pool(s, ap)).toBe("G1 R1 U1");
  });

  it("Faeburrow Elder gets +1/+1 for each color and taps for each", () => {
    const { s: s0, ap } = fresh();
    const fe = putOnBattlefield(s0, ap, faeburrow);
    putOnBattlefield(s0, ap, legendWizard);
    expect(pt(s0, fe)).toBe("4/4");
    const s = act(s0, { type: "activateMana", player: ap, objectId: fe, mana: "G" });
    expect(pool(s, ap)).toBe("G1 R1 U1 W1");
  });

  it("autopay pays with Bloom Tender's mana of several colors", () => {
    const { s: s0, ap } = fresh();
    for (const id of s0.battlefield.filter((id) => s0.objects[id]!.controller === ap)) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    putOnBattlefield(s0, ap, bloomTender);
    putOnBattlefield(s0, ap, blueGuy);
    const w = toHand(s0, ap, legendWizard);
    const plan = planCast(s0, ap, w);
    expect(plan).not.toBeNull();
    let s = s0;
    for (const a of plan!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[w]!.zone).toBe("battlefield");
  });

  it("autopay pays with Nykthos", () => {
    const { s: s0, ap } = fresh();
    for (const id of s0.battlefield.filter((id) => s0.objects[id]!.controller === ap)) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    putOnBattlefield(s0, ap, nykthos);
    putOnBattlefield(s0, ap, blueGuy);
    putOnBattlefield(s0, ap, blueGuy);
    s0.players[ap]!.manaPool.C = 2;
    const c = toHand(s0, ap, card("Big Blue", "Creature — Whale", "{3}{U}{U}", { power: "5", toughness: "5" }));
    const plan = planCast(s0, ap, c);
    expect(plan).not.toBeNull();
  });
});
