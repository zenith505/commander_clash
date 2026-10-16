// "Whenever a creature you control attacks" (CR 508.3a): once for each such creature as it's declared as an attacker,
// never for one put onto the battlefield attacking (508.4); "it" is that creature and "defending player" the player
// it's attacking (508.5a). And commanders on the battlefield (CR 903.3): "commander creatures you control get +2/+2",
// "target commander".

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, isFullySupported, objHasKeyword, planActivate, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));

// Real oracle text (Scryfall).
const ferventCharge = card("Fervent Charge", "Enchantment", "{1}{W}{B}{R}", { oracleText: "Whenever a creature you control attacks, it gets +2/+2 until end of turn." });
const gloryBearers = card("Glory Bearers", "Enchantment Creature — Human Cleric", "{3}{W}", { power: "3", toughness: "4", oracleText: "Whenever another creature you control attacks, it gets +0/+1 until end of turn." });
const campaign = card("Campaign of Vengeance", "Enchantment", "{3}{W}{B}", { oracleText: "Whenever a creature you control attacks, defending player loses 1 life and you gain 1 life." });
const atarka = card("Atarka, World Render", "Legendary Creature — Dragon", "{5}{R}{R}", { power: "6", toughness: "4", keywords: ["Flying", "Trample"], oracleText: "Flying, trample\nWhenever a Dragon you control attacks, it gains double strike until end of turn." });
const keleth = card("Keleth, Sunmane Familiar", "Legendary Creature — Horse", "{1}{W}", { power: "2", toughness: "2", keywords: ["Partner"], oracleText: "Whenever a commander you control attacks, put a +1/+1 counter on it.\nPartner (You can have two commanders if both have partner.)" });
const mardu = card("Mardu Ascendancy", "Enchantment", "{R}{W}{B}", { oracleText: "Whenever a nontoken creature you control attacks, create a 1/1 red Goblin creature token that's tapped and attacking.\nSacrifice this enchantment: Creatures you control get +0/+3 until end of turn." });
const veil = card("Teferi's Veil", "Enchantment", "{1}{U}", { oracleText: "Whenever a creature you control attacks, it phases out at end of combat. (While it's phased out, it's treated as though it doesn't exist. It phases in before you untap during your next untap step.)" });
const bastion = card("Bastion Protector", "Creature — Human Soldier", "{2}{W}", { power: "3", toughness: "3", oracleText: "Commander creatures you control get +2/+2 and have indestructible." });
const anara = card("Anara, Wolvid Familiar", "Legendary Creature — Wolf Beast", "{3}{G}", { power: "4", toughness: "4", keywords: ["Partner"], oracleText: "During your turn, commanders you control have indestructible. (Effects that say \"destroy\" don't destroy them. A creature with indestructible can't be destroyed by damage.)\nPartner (You can have two commanders if both have partner.)" });
const clinic = card("Witch's Clinic", "Land", "", { oracleText: "{T}: Add {C}.\n{2}, {T}: Target commander gains lifelink until end of turn." });
const dragon = card("Shivan Dragon", "Creature — Dragon", "{4}{R}{R}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\n{R}: This creature gets +1/+0 until end of turn." });

describe("Whenever a creature you control attacks", () => {
  it("triggers once for each attacker, and 'it' is that creature (Fervent Charge)", () => {
    supported(ferventCharge);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, ferventCharge);
    const a = putOnBattlefield(s0, ap, bear()), b = putOnBattlefield(s0, ap, bear()), home = putOnBattlefield(s0, ap, bear());
    const s = attack(s0, ap, [{ attacker: a, defender: opp }, { attacker: b, defender: opp }]);
    expect([pt(s, a), pt(s, b), pt(s, home)]).toEqual(["4/4", "4/4", "2/2"]);
  });

  it("'another creature' leaves out the source itself (Glory Bearers)", () => {
    supported(gloryBearers);
    const { s: s0, ap, opp } = setup([]);
    const bearers = putOnBattlefield(s0, ap, gloryBearers), a = putOnBattlefield(s0, ap, bear());
    const s = attack(s0, ap, [{ attacker: bearers, defender: opp }, { attacker: a, defender: opp }]);
    expect([pt(s, bearers), pt(s, a)]).toEqual(["3/4", "2/3"]);
  });

  it("defending player is the player each creature attacks (Campaign of Vengeance)", () => {
    supported(campaign);
    const { s: s0, ap } = setup([]);
    const [, p1, p2] = [ap, ...s0.turnOrder.filter((p) => p !== ap)] as PlayerId[];
    putOnBattlefield(s0, ap, campaign);
    const a = putOnBattlefield(s0, ap, bear()), b = putOnBattlefield(s0, ap, bear()), c = putOnBattlefield(s0, ap, bear());
    const s = attack(s0, ap, [{ attacker: a, defender: p1! }, { attacker: b, defender: p1! }, { attacker: c, defender: p2! }]);
    expect(s.players[p1!]!.life).toBe(38);
    expect(s.players[p2!]!.life).toBe(39);
    expect(s.players[ap]!.life).toBe(43);
  });

  it("only creatures that match: a Dragon (Atarka), a commander (Keleth)", () => {
    supported(atarka, keleth);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, atarka);
    putOnBattlefield(s0, ap, keleth);
    const d = putOnBattlefield(s0, ap, dragon), cmdr = putOnBattlefield(s0, ap, bear({ name: "Elf Commander" }), { commander: true }), a = putOnBattlefield(s0, ap, bear());
    const s = attack(s0, ap, [{ attacker: d, defender: opp }, { attacker: cmdr, defender: opp }, { attacker: a, defender: opp }]);
    expect(objHasKeyword(s, s.objects[d]!, "Double strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[a]!, "Double strike")).toBe(false);
    expect(s.objects[cmdr]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[a]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("not for an opponent's creatures", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, ferventCharge);
    const a = putOnBattlefield(s0, ap, bear());
    const s = attack(s0, ap, [{ attacker: a, defender: opp }]);
    expect(pt(s, a)).toBe("2/2");
  });

  it("a token put onto the battlefield attacking wasn't declared, so it doesn't trigger again (Mardu Ascendancy)", () => {
    supported(mardu);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, mardu);
    const a = putOnBattlefield(s0, ap, bear());
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length); i++) {
      if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const goblins = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(goblins).toHaveLength(1);
    expect(s.objects[goblins[0]!]).toMatchObject({ tapped: true });
    expect(s.objects[goblins[0]!]!.attacking).toBeDefined();
  });

  it("'it phases out at end of combat' (Teferi's Veil)", () => {
    supported(veil);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, veil);
    const a = putOnBattlefield(s0, ap, bear()), home = putOnBattlefield(s0, ap, bear());
    let s = attack(s0, ap, [{ attacker: a, defender: opp }]);
    expect(s.objects[a]!.zone).toBe("battlefield");
    s = settle(passUntil(s, "main2", ap));
    expect(s.players[opp]!.life).toBe(38); // dealt its damage first (ruling)
    expect(s.objects[a]!.zone).toBe("phasedOut");
    expect(s.objects[home]!.zone).toBe("battlefield");
  });
});

describe("commanders on the battlefield", () => {
  it("'commander creatures you control' gets only your commanders (Bastion Protector)", () => {
    supported(bastion);
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, bastion);
    const mine = putOnBattlefield(s, ap, bear({ name: "My Commander" }), { commander: true });
    const plain = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Commander" }), { commander: true });
    expect([pt(s, mine), pt(s, plain), pt(s, theirs)]).toEqual(["4/4", "2/2", "2/2"]);
    expect(objHasKeyword(s, s.objects[mine]!, "Indestructible")).toBe(true);
    expect(objHasKeyword(s, s.objects[plain]!, "Indestructible")).toBe(false);
  });

  it("'during your turn, commanders you control have indestructible' (Anara)", () => {
    supported(anara);
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, anara);
    const mine = putOnBattlefield(s, ap, bear({ name: "My Commander" }), { commander: true });
    expect(objHasKeyword(s, s.objects[mine]!, "Indestructible")).toBe(true);
    const later = passUntil(s, "main1", opp);
    expect(objHasKeyword(later, later.objects[mine]!, "Indestructible")).toBe(false);
  });

  it("'target commander' can target any player's commander and nothing else (Witch's Clinic)", () => {
    supported(clinic);
    const { s, ap, opp } = setup([]);
    const land = putOnBattlefield(s, ap, clinic);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Commander" }), { commander: true });
    const plain = putOnBattlefield(s, opp, bear());
    expect(planActivate(s, ap, land, 0, [target(plain)])).toBeNull();
    const plan = planActivate(s, ap, land, 0, [target(theirs)])!;
    let t = s;
    for (const a of plan) t = act(t, a);
    t = settle(t);
    expect(characteristics(t, t.objects[theirs]!).keywords).toContain("Lifelink");
  });
});
