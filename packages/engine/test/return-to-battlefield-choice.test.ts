// "Return a creature card from your graveyard to the battlefield" without "target": the card is chosen as the ability
// resolves (CR 608.2c), and only a permanent card can be put onto the battlefield (CR 110.4b). It enters under your
// control (CR 110.2a); an Aura's controller chooses what it enchants as it enters (CR 303.4f). Desecrate Reality's
// adamant asks whether at least three colorless mana was spent (CR 601.2h), and "an odd mana value" is a card quality
// like any other (0 is even).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, isFullySupported, planActivate, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
const NONE: TargetChoice = { kind: "none" };
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const toGraveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};

// Real oracle text (Scryfall).
const port = card("Port of Karfell", "Land", "", { oracleText: "This land enters tapped.\n{T}: Add {U}.\n{3}{U}{B}{B}, {T}, Sacrifice this land: Mill four cards, then return a creature card from your graveyard to the battlefield tapped. (To mill a card, put the top card of your library into your graveyard.)" });
const summon = card("Summon Undead", "Sorcery", "{5}{B}", { oracleText: "You may mill three cards. Then return a creature card from your graveyard to the battlefield.\nForetell {1}{B} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)" });
const teval = card("Teval, the Balanced Scale", "Legendary Creature — Spirit Dragon", "{1}{B}{G}{U}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhenever Teval attacks, mill three cards. Then you may return a land card from your graveyard to the battlefield tapped.\nWhenever one or more cards leave your graveyard, create a 2/2 black Zombie Druid creature token." });
const serenade = card("Charnel Serenade", "Sorcery", "{4}{B}{B}", { keywords: ["Suspend"], oracleText: "Surveil 3, then return a creature card from your graveyard to the battlefield with a finality counter on it. Exile Charnel Serenade with three time counters on it.\nSuspend 3—{2}{B} (Rather than cast this card from your hand, you may pay {2}{B} and exile it with three time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)" });
const fortress = card("Tomb Fortress", "Land", "", { oracleText: "This land enters tapped.\n{T}: Add {B}.\n{2}{B}{B}{B}, {T}, Exile this land: Mill four cards, then return a creature card from your graveyard to the battlefield. Activate only as a sorcery." });
const desecrate = card("Desecrate Reality", "Sorcery", "{7}", { oracleText: "For each opponent, exile up to one target permanent that player controls with an even mana value.\nAdamant — If at least three colorless mana was spent to cast this spell, return a permanent card with an odd mana value from your graveyard to the battlefield." });
const giant = card("Hill Giant Test", "Creature — Giant", "{2}{R}", { power: "3", toughness: "3" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const rancor = card("Rancor", "Enchantment — Aura", "{G}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen Rancor is put into a graveyard from the battlefield, return Rancor to its owner's hand." });

function planActivateOk(s: GameState, pid: PlayerId, id: string, index: number): GameState {
  for (const a of planActivate(s, pid, id, index)!) s = act(s, a);
  return s;
}
/** Desecrate Reality cast from a pool of exactly this mana. */
function castDesecrate(s: GameState, pid: PlayerId, id: string, mana: ("C" | "G")[]): GameState {
  addMana(s, pid, mana, {});
  return passAll(act(s, { type: "castSpell", player: pid, objectId: id, targets: [NONE, NONE, NONE] }));
}

describe("returning a card of your choice from your graveyard to the battlefield", () => {
  it("parses", () => {
    supported(port, summon, teval, serenade, fortress, desecrate);
    expect(JSON.stringify(compileCard(serenade).spell)).toContain('"counters":{"finality":1}');
  });

  it("Port of Karfell: mill four, then a creature card from your graveyard enters tapped under your control", () => {
    let { s, ap } = setup([]);
    const p = putOnBattlefield(s, ap, port);
    const g = toGraveyard(s, ap, giant);
    const f = toGraveyard(s, ap, card("Forest", "Basic Land — Forest"));
    s = passAll(planActivateOk(s, ap, p, 0));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromGraveyard: "battlefield", min: 1, max: 1 });
    const cards = (s.pending as { cards: string[] }).cards;
    expect(cards).toContain(g);
    expect(cards).not.toContain(f);
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [g] }));
    expect(s.objects[g]!).toMatchObject({ zone: "battlefield", controller: ap, tapped: true });
  });

  it("Desecrate Reality with three colorless mana spent: only permanent cards with an odd mana value are offered", () => {
    let { s, ap, ids } = setup([desecrate]);
    const two = toGraveyard(s, ap, bear());
    const three = toGraveyard(s, ap, giant);
    const one = toGraveyard(s, ap, shock);
    s = castDesecrate(s, ap, ids[0]!, ["C", "C", "C", "G", "G", "G", "G"]);
    expect(s.objects[ids[0]!]!.spent).toMatchObject({ C: 3 });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromGraveyard: "battlefield", cards: [three] });
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [three] }));
    expect(s.objects[three]!).toMatchObject({ zone: "battlefield", controller: ap, tapped: false });
    expect(s.objects[two]!.zone).toBe("graveyard");
    expect(s.objects[one]!.zone).toBe("graveyard");
  });

  it("Desecrate Reality with less than three colorless mana spent returns nothing", () => {
    let { s, ap, ids } = setup([desecrate]);
    const three = toGraveyard(s, ap, giant);
    s = castDesecrate(s, ap, ids[0]!, ["C", "C", "G", "G", "G", "G", "G"]);
    expect(s.pending).toBeFalsy();
    expect(s.objects[three]!.zone).toBe("graveyard");
  });

  it("an Aura returned this way: you choose what it enchants as it enters", () => {
    let { s, ap, ids } = setup([desecrate]);
    const b = putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, bear());
    const r = toGraveyard(s, ap, rancor);
    s = castDesecrate(s, ap, ids[0]!, ["C", "C", "C", "G", "G", "G", "G"]);
    s = act(s, { type: "searchLibrary", player: ap, found: [r] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant" });
    const opts = (s.pending as { options: string[] }).options;
    s = passAll(act(s, { type: "chooseOption", player: ap, choice: opts.find((o) => o.includes(b))! }));
    expect(s.objects[r]!).toMatchObject({ zone: "battlefield", attachedTo: b });
  });

  it("the bot takes the best creature card", () => {
    let { s, ap } = setup([]);
    const p = putOnBattlefield(s, ap, fortress);
    putOnBattlefield(s, ap, card("Swamp", "Basic Land — Swamp"));
    const g = toGraveyard(s, ap, giant);
    s.players[ap]!.library = s.players[ap]!.library.filter((id) => !s.cards[s.objects[id]!.cardId]!.typeLine.includes("Creature"));
    s = passAll(planActivateOk(s, ap, p, 0));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromGraveyard: "battlefield" });
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.objects[g]!.zone).toBe("battlefield");
  });
});
