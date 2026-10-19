// "Cowards can't block Warriors" (Boldwyr Intimidator), "target creature can't block ~ this turn" (Duct Crawler): blocking
// restrictions (CR 509.1b). Also Electric Eel's "gets +2/+0 until end of turn and deals 1 damage to you".

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { blockProblem, characteristics, compileCard, isFullySupported, moveObject, type CardDef } from "../src";

// Real oracle text (Scryfall).
const boldwyr = card("Boldwyr Intimidator", "Creature — Giant Warrior", "{5}{R}{R}", { power: "5", toughness: "5", oracleText: "Cowards can't block Warriors.\n{R}: Target creature becomes a Coward until end of turn.\n{2}{R}: Target creature becomes a Warrior until end of turn." });
const kargan = card("Kargan Intimidator", "Creature — Human Warrior", "{1}{R}", { power: "3", toughness: "1", oracleText: "Cowards can't block Warriors.\n{1}: Choose one that hasn't been chosen this turn —\n• This creature gets +1/+1 until end of turn.\n• Target creature becomes a Coward until end of turn.\n• Target Warrior gains trample until end of turn." });
const ductCrawler = card("Duct Crawler", "Creature — Insect", "{R}", { power: "1", toughness: "1", oracleText: "{1}{R}: Target creature can't block this creature this turn." });
const bloodscale = card("Burning-Tree Bloodscale", "Creature — Lizard Berserker", "{2}{R}{G}", { power: "2", toughness: "2", keywords: ["Bloodthirst"], oracleText: "Bloodthirst 1 (If an opponent was dealt damage this turn, this creature enters with a +1/+1 counter on it.)\n{2}{R}: Target creature can't block this creature this turn.\n{2}{G}: Target creature blocks this creature this turn if able." });
const eel = card("Electric Eel", "Creature — Fish", "{U}", { power: "1", toughness: "1", oracleText: "When this creature enters, it deals 1 damage to you.\n{R}{R}: This creature gets +2/+0 until end of turn and deals 1 damage to you." });
const djinn = card("Stormcloud Djinn", "Creature — Djinn", "{4}{U}", { power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nThis creature can block only creatures with flying.\n{R}{R}: This creature gets +2/+0 until end of turn and deals 1 damage to you." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

describe("Cowards can't block Warriors", () => {
  it("a creature made a Coward can't block a Warrior, but can block others; it loses its other creature types (rulings)", () => {
    supported(boldwyr, kargan);
    const { s: s0, ap, opp } = setup([]);
    const giant = putOnBattlefield(s0, ap, boldwyr);
    const other = putOnBattlefield(s0, ap, bear());
    const blocker = putOnBattlefield(s0, opp, bear());
    s0.objects[giant]!.attacking = opp;
    s0.objects[other]!.attacking = opp;
    expect(blockProblem(s0, s0.objects[blocker]!, s0.objects[giant]!)).toBeNull();
    let s = activate(s0, ap, giant, 0, [{ kind: "object", id: blocker }]);
    while (s.stack.length) s = act(s, { type: "passPriority", player: s.priority });
    expect(characteristics(s, s.objects[blocker]!).subtypes).toEqual(["Coward"]);
    expect(blockProblem(s, s.objects[blocker]!, s.objects[giant]!)).toMatch(/can't block Warriors/);
    expect(blockProblem(s, s.objects[blocker]!, s.objects[other]!)).toBeNull();
    // Without an Intimidator on the battlefield, nothing stops the Coward.
    moveObject(s, giant, "graveyard");
    const warrior = putOnBattlefield(s, ap, card("Warrior Test", "Creature — Human Warrior", "{1}", { power: "1", toughness: "1" }));
    s.objects[warrior]!.attacking = opp;
    expect(blockProblem(s, s.objects[blocker]!, s.objects[warrior]!)).toBeNull();
  });
});

describe("target creature can't block ~ this turn", () => {
  it("Duct Crawler: that creature can't block it this turn, but can block others; a new object isn't affected (CR 400.7)", () => {
    supported(ductCrawler, bloodscale);
    expect(compileCard(ductCrawler).activated[0]!.body.effects).toMatchObject([{ type: "cantBlockSource" }]);
    const { s: s0, ap, opp } = setup([]);
    const crawler = putOnBattlefield(s0, ap, ductCrawler);
    const other = putOnBattlefield(s0, ap, bear());
    const blocker = putOnBattlefield(s0, opp, bear());
    let s = activate(s0, ap, crawler, 0, [{ kind: "object", id: blocker }]);
    while (s.stack.length) s = act(s, { type: "passPriority", player: s.priority });
    s.objects[crawler]!.attacking = opp;
    s.objects[other]!.attacking = opp;
    expect(blockProblem(s, s.objects[blocker]!, s.objects[crawler]!)).toMatch(/can't block Duct Crawler this turn/);
    expect(blockProblem(s, s.objects[blocker]!, s.objects[other]!)).toBeNull();
    // The blocker leaves and comes back: a new object, free to block.
    const s2 = structuredClone(s);
    moveObject(s2, blocker, "hand");
    moveObject(s2, blocker, "battlefield");
    s2.objects[blocker]!.tapped = false;
    expect(blockProblem(s2, s2.objects[blocker]!, s2.objects[crawler]!)).toBeNull();
    // Next turn it's over.
    const s3 = passUntil(structuredClone(s), "main1", opp);
    s3.objects[crawler]!.attacking = opp;
    expect(blockProblem(s3, s3.objects[blocker]!, s3.objects[crawler]!)).toBeNull();
  });
});

describe("gets +2/+0 until end of turn and deals 1 damage to you", () => {
  it("Electric Eel and Stormcloud Djinn: both happen", () => {
    supported(eel, djinn);
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, djinn);
    const life = s0.players[ap]!.life;
    let s = activate(s0, ap, d, 0);
    while (s.stack.length) s = act(s, { type: "passPriority", player: s.priority });
    expect(characteristics(s, s.objects[d]!).power).toBe(5);
    expect(s.players[ap]!.life).toBe(life - 1);
  });
});
