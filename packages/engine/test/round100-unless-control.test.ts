// Round 100: "~ can't attack or block unless you control seven or more lands" (Topiary Stomper) and the other "unless you
// control ..." restrictions: the restriction applies while the condition is false, checked as attackers or blockers are
// declared (CR 508.1c, 509.1b; rulings: it stays in combat if the condition stops being true).

import { describe, expect, it } from "vitest";
import { bear, card, forest, putOnBattlefield, setup } from "./helpers";
import { characteristics, isFullySupported, runStateBasedActions } from "../src";

// Real oracle text (Scryfall).
const stomper = card("Topiary Stomper", "Creature — Plant Dinosaur", "{1}{G}{G}", { power: "4", toughness: "4", keywords: ["Vigilance"], oracleText: "Vigilance (Attacking doesn't cause this creature to tap.)\nWhen this creature enters, search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\nThis creature can't attack or block unless you control seven or more lands." });
const rhonas = card("Rhonas the Indomitable", "Legendary Creature — God", "{2}{G}", { power: "5", toughness: "5", keywords: ["Deathtouch", "Indestructible"], oracleText: "Deathtouch, indestructible\nRhonas can't attack or block unless you control another creature with power 4 or greater.\n{2}{G}: Another target creature gets +2/+0 and gains trample until end of turn." });
const bast = card("Bast, Panther Goddess", "Legendary Creature — Cat God", "{3}{G}{W}", { power: "6", toughness: "6", keywords: ["Reach", "Trample", "Indestructible"], oracleText: "Reach, trample, indestructible\nBast can't attack or block unless you control three or more creatures.\nWhenever you attack, target attacking creature gets +X/+X until end of turn, where X is the number of creatures you control." });

describe("round 100: can't attack or block unless you control ...", () => {
  it("parse", () => {
    for (const d of [stomper, rhonas, bast]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Topiary Stomper: can't attack or block with six lands, can with seven", () => {
    const { s, ap } = setup([]);
    for (const id of [...s.battlefield]) if (s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land")) s.battlefield.splice(s.battlefield.indexOf(id), 1);
    const st = putOnBattlefield(s, ap, stomper);
    for (let i = 0; i < 6; i++) putOnBattlefield(s, ap, forest);
    runStateBasedActions(s);
    expect(characteristics(s, s.objects[st]!).cantAttack).toBe(true);
    expect(characteristics(s, s.objects[st]!).cantBlock).toBe(true);
    putOnBattlefield(s, ap, forest);
    runStateBasedActions(s);
    expect(characteristics(s, s.objects[st]!).cantAttack).toBe(false);
    expect(characteristics(s, s.objects[st]!).cantBlock).toBe(false);
  });

  it("Rhonas needs another creature with power 4 or greater; Bast counts itself among three creatures", () => {
    const { s, ap } = setup([]);
    const creatures = () => s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Creature")).length;
    expect(creatures()).toBe(0);
    const r = putOnBattlefield(s, ap, rhonas);
    putOnBattlefield(s, ap, bear());
    runStateBasedActions(s);
    expect(characteristics(s, s.objects[r]!).cantAttack).toBe(true); // Rhonas itself doesn't count
    const b = putOnBattlefield(s, ap, bast);
    runStateBasedActions(s);
    expect(characteristics(s, s.objects[r]!).cantAttack).toBe(false); // Bast is 6/6
    expect(characteristics(s, s.objects[b]!).cantBlock).toBe(false); // Rhonas, a bear and Bast herself
    s.battlefield.splice(s.battlefield.indexOf(r), 1);
    runStateBasedActions(s);
    expect(characteristics(s, s.objects[b]!).cantBlock).toBe(true);
  });
});
