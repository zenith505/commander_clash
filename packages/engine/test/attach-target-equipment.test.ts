// Attaching an Equipment that isn't the source (CR 701.3a-c): Brass Squire's "Attach target Equipment you control to
// target creature you control", Magnetic Theft, "attach up to one target Equipment you control to that creature"
// (Kemba), "to ~" after gaining control of it (Ogre Geargrabber) and "When you lose control of that Equipment, unattach
// it" (CR 603.7, 701.3d).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passAll, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });

// Real oracle text (Scryfall).
const squire = card("Brass Squire", "Artifact Creature — Myr", "{3}", { power: "1", toughness: "3", oracleText: "{T}: Attach target Equipment you control to target creature you control." });
const theft = card("Magnetic Theft", "Instant", "{R}", { oracleText: "Attach target Equipment to target creature. (Control of the Equipment doesn't change.)" });
const kemba = card("Kemba, Kha Enduring", "Legendary Creature — Cat Cleric", "{1}{W}", { power: "2", toughness: "2", oracleText: "Whenever Kemba or another Cat you control enters, attach up to one target Equipment you control to that creature.\nEquipped creatures you control get +1/+1.\n{3}{W}{W}: Create a 2/2 white Cat creature token." });
const ogre = card("Ogre Geargrabber", "Creature — Ogre Warrior", "{4}{R}{R}", { power: "4", toughness: "4", oracleText: "Whenever this creature attacks, gain control of target Equipment an opponent controls until end of turn. Attach it to this creature. When you lose control of that Equipment, unattach it." });
const shagrat = card("Shagrat, Loot Bearer", "Legendary Creature — Orc Soldier", "{2}{B}{R}", { power: "4", toughness: "4", oracleText: "Whenever Shagrat attacks, attach up to one target Equipment to it. Then amass Orcs X, where X is the number of Equipment attached to Shagrat. (Put X +1/+1 counters on an Army you control. It's an Orc. If you don't control one, create a 0/0 black Orc Army creature token first.)" });
const amy = card("Amy Rose", "Legendary Creature — Hedgehog", "{1}{R}{W}", { power: "2", toughness: "3", oracleText: "Whenever Amy Rose attacks, attach up to one target Equipment to her. Then up to one other target attacking creature gets +X/+0 until end of turn, where X is Amy Rose's power." });
const stalwart = card("Iron Hills Stalwart", "Creature — Dwarf Soldier", "{2}{W}", { power: "2", toughness: "2", oracleText: "When this creature enters, attach target Equipment you control to up to one target creature you control." });
const swordsman = card("Swordsman, Sharp Scoundrel", "Legendary Creature — Human Villain", "{2}{B}", { power: "3", toughness: "2", oracleText: "Whenever another Villain you control enters, attach up to one target Equipment you control to target creature you control.\nWhenever an equipped creature you control attacks, it connives." });
const sokka = card("Sokka and Suki", "Legendary Creature — Human Warrior Ally", "{U}{R}{W}", { power: "3", toughness: "3", oracleText: "Whenever Sokka and Suki or another Ally you control enters, attach up to one target Equipment you control to that creature.\nWhenever an Equipment you control enters, create a 1/1 white Ally creature token." });
const kazuul = card("Kazuul's Toll Collector", "Creature — Ogre Warrior", "{2}{R}", { power: "3", toughness: "2", oracleText: "{0}: Attach target Equipment you control to Kazuul's Toll Collector. Activate only as a sorcery." });
const outfitter = card("Kor Outfitter", "Creature — Kor Soldier", "{W}{W}", { power: "2", toughness: "2", oracleText: "When this creature enters, you may attach target Equipment you control to target creature you control." });
const windwalker = card("Auriok Windwalker", "Creature — Human Wizard", "{3}{W}", { power: "2", toughness: "3", keywords: ["Flying"], oracleText: "Flying\n{T}: Attach target Equipment you control to target creature you control." });
const splitter = card("Bonesplitter", "Artifact — Equipment", "{1}", { keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });
const cat = card("Test Cat", "Creature — Cat", "{W}", { power: "1", toughness: "1" });
const statue = card("Test Statue", "Artifact", "{1}");

describe("attach target Equipment", () => {
  it("parse", () => supported(squire, theft, kemba, ogre, shagrat, amy, stalwart, swordsman, sokka, kazuul, outfitter, windwalker));

  it("Brass Squire moves an Equipment to another creature, any time it could cast an instant", () => {
    const { s: s0, ap } = setup([]);
    const sq = putOnBattlefield(s0, ap, squire);
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Bear B" }));
    const eq = putOnBattlefield(s0, ap, splitter);
    s0.objects[eq]!.attachedTo = a;
    const ts = s0.objects[eq]!.timestamp;
    const s = settle(activate(s0, ap, sq, 0, [target(eq), target(b)]));
    expect(s.objects[eq]!.attachedTo).toBe(b);
    expect(s.objects[eq]!.timestamp).toBeGreaterThan(ts); // CR 701.3c
    expect(pt(s, b)).toBe("4/2");
    expect(pt(s, a)).toBe("2/2");
  });

  it("Brass Squire: if either target is illegal as it resolves, the Equipment doesn't move", () => {
    const { s: s0, ap } = setup([]);
    const sq = putOnBattlefield(s0, ap, squire);
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Bear B" }));
    const eq = putOnBattlefield(s0, ap, splitter);
    s0.objects[eq]!.attachedTo = a;
    let s = act(s0, { type: "activateAbility", player: ap, objectId: sq, index: 0, targets: [target(eq), target(b)] });
    expect(s.stack).toHaveLength(1);
    // Bear B leaves the battlefield in response.
    moveObject(s, b, "graveyard");
    s = settle(s);
    expect(s.objects[eq]!.attachedTo).toBe(a);
  });

  it("a non-Equipment target: nothing happens (CR 701.3b)", () => {
    const { s: s0, ap } = setup([]);
    const sq = putOnBattlefield(s0, ap, squire);
    putOnBattlefield(s0, ap, statue);
    const b = putOnBattlefield(s0, ap, bear());
    // It can't even be targeted: the Squire needs an Equipment.
    const st = s0.battlefield.find((id) => s0.objects[id]!.cardId === statue.oracleId)!;
    expect(() => activate(s0, ap, sq, 0, [target(st), target(b)])).toThrow();
  });

  it("Magnetic Theft: an opponent's Equipment onto your creature; its controller doesn't change", () => {
    const { s: s0, ap, opp, ids } = setup([theft]);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const eq = putOnBattlefield(s0, opp, splitter);
    s0.objects[eq]!.attachedTo = theirs;
    const s = settle(cast(s0, ap, ids[0]!, [target(eq), target(mine)]));
    expect(s.objects[eq]!.attachedTo).toBe(mine);
    expect(s.objects[eq]!.controller).toBe(opp);
    expect(pt(s, mine)).toBe("4/2");
  });

  it("Kemba: a Cat entering gets an Equipment you control", () => {
    const { s: s0, ap, ids } = setup([cat]);
    putOnBattlefield(s0, ap, kemba);
    const eq = putOnBattlefield(s0, ap, splitter);
    let s = passAll(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(eq)] }));
    expect(s.objects[eq]!.attachedTo).toBe(ids[0]);
    expect(pt(s, ids[0]!)).toBe("4/2"); // +2/+0, and Kemba's +1/+1
  });

  it("Ogre Geargrabber: takes an opponent's Equipment until end of turn and unattaches it when control goes back", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, ogre);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const eq = putOnBattlefield(s0, opp, splitter);
    s0.objects[eq]!.attachedTo = theirs;
    let s = attack(s0, ap, [{ attacker: o, defender: opp }]);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(eq)] });
    s = settle(s);
    expect(s.objects[eq]!.attachedTo).toBe(o);
    expect(s.battlefield.includes(eq)).toBe(true);
    expect(pt(s, o)).toBe("6/4");
    // The control effect ends in the cleanup step; the delayed trigger unattaches it there (rulings).
    s = passUntil(s, "upkeep");
    expect(s.objects[eq]!.attachedTo).toBeUndefined();
    expect(s.objects[eq]!.controller).toBe(opp);
    expect(s.log.some((l) => /Bonesplitter is unattached from Ogre Geargrabber/.test(l.text))).toBe(true);
    expect(pt(s, o)).toBe("4/4");
  });

  it("Shagrat: attach first, then amass that many", () => {
    const { s: s0, ap, opp } = setup([]);
    const sh = putOnBattlefield(s0, ap, shagrat);
    const eq = putOnBattlefield(s0, opp, splitter);
    let s = attack(s0, ap, [{ attacker: sh, defender: opp }]);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(eq)] });
    s = settle(s);
    expect(s.objects[eq]!.attachedTo).toBe(sh);
    const army = s.battlefield.find((id) => s.objects[id]!.isToken && s.objects[id]!.counters["+1/+1"]);
    expect(army && s.objects[army]!.counters["+1/+1"]).toBe(1);
  });
});
