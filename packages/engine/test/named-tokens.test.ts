// Named legendary tokens ("create Angelo, a legendary 1/1 green and white Dog creature token"): the token's name is
// the given name (CR 111.4), it's legendary (CR 205.4d) and the legend rule applies to it (CR 704.5j). Also tokens
// with keywords and a quoted ability ("with haste and \"This token attacks each combat if able.\"").

import { describe, expect, it } from "vitest";
import { act, activate, card, cast, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
function settle(s: GameState) {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = act(s, s.pending ? botActions(s, pid)[0]! : { type: "passPriority", player: pid });
  }
  return s;
}
const tokens = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.isToken);
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;

// Real oracle text (Scryfall).
const rinoa = card("Rinoa Heartilly", "Legendary Creature — Human Rebel Warlock", "{3}{G}{W}", { power: "4", toughness: "4", keywords: ["Angelo Cannon"], oracleText: "When Rinoa Heartilly enters, create Angelo, a legendary 1/1 green and white Dog creature token.\nAngelo Cannon — Whenever Rinoa Heartilly attacks, another target creature you control gets +1/+1 until end of turn for each creature you control." });
const sophia = card("Sophia, Dogged Detective", "Legendary Creature — Human Detective", "{1}{G}{W}{U}", { power: "3", toughness: "4", keywords: ["Investigate", "Food"], oracleText: "When Sophia enters, create Tiny, a legendary 2/2 green Dog Detective creature token with trample.\n{1}, Sacrifice an artifact token: Put a +1/+1 counter on each Dog you control.\nWhenever a Dog you control deals combat damage to a player, create a Food token, then investigate." });
const tolsimir = card("Tolsimir Wolfblood", "Legendary Creature — Elf Warrior", "{4}{G}{W}", { power: "3", toughness: "4", oracleText: "Other green creatures you control get +1/+1.\nOther white creatures you control get +1/+1.\n{T}: Create Voja, a legendary 2/2 green and white Wolf creature token." });
const sentry = card("The Sentry, Golden Guardian", "Legendary Creature — Human Hero", "{3}{W}", { power: "5", toughness: "5", keywords: ["Flying", "Indestructible", "Vigilance"], oracleText: "Flying, vigilance, indestructible\nWhen The Sentry enters, target opponent creates The Void, a legendary 5/5 black Horror Villain creature token with flying, indestructible, and \"The Void attacks each combat if able.\"" });
const alienInvasion = card("Alien Invasion", "Enchantment", "{1}{R}{R}{G}", { oracleText: "At the beginning of combat on your turn, create a 1/1 red Alien creature token with haste and \"This token attacks each combat if able.\" Put a +1/+1 counter on it for each invasion counter on this enchantment, then put an invasion counter on this enchantment." });
const dragonEgg = card("Dragon Egg", "Creature — Dragon Egg", "{2}{R}", { power: "0", toughness: "2", keywords: ["Defender"], oracleText: "Defender\nWhen this creature dies, create a 2/2 red Dragon creature token with flying and \"{R}: This token gets +1/+0 until end of turn.\"" });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });

describe("named legendary tokens", () => {
  it("parse", () => supported(rinoa, sophia, tolsimir, sentry, alienInvasion, dragonEgg));

  it("Rinoa Heartilly creates Angelo: named Angelo, a legendary green and white 1/1 Dog", () => {
    const { s: s0, ap, ids } = setup([rinoa]);
    const s = settle(cast(s0, ap, ids[0]!));
    const [angelo] = tokens(s, ap);
    expect(nameOf(s, angelo!)).toBe("Angelo");
    const ch = characteristics(s, s.objects[angelo!]!);
    expect(ch.supertypes).toContain("Legendary");
    expect(ch.subtypes).toEqual(["Dog"]);
    expect([...ch.colors].sort()).toEqual(["G", "W"]);
    expect(pt(s, angelo!)).toBe("1/1");
  });

  it("Sophia's Tiny is a legendary 2/2 Dog Detective with trample", () => {
    const { s: s0, ap, ids } = setup([sophia]);
    const s = settle(cast(s0, ap, ids[0]!));
    const [tiny] = tokens(s, ap);
    expect(nameOf(s, tiny!)).toBe("Tiny");
    expect(characteristics(s, s.objects[tiny!]!).subtypes).toEqual(["Dog", "Detective"]);
    expect(characteristics(s, s.objects[tiny!]!).keywords).toContain("Trample");
  });

  it("Tolsimir Wolfblood: Voja gets both of his bonuses, and a second Voja makes its controller keep one (CR 704.5j)", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tolsimir);
    let s = settle(activate(s0, ap, t, 0));
    const [voja] = tokens(s, ap);
    expect(nameOf(s, voja!)).toBe("Voja");
    expect(pt(s, voja!)).toBe("4/4");
    s.objects[t]!.tapped = false;
    s = settle(activate(s, ap, t, 0));
    expect(tokens(s, ap)).toHaveLength(1);
  });

  it("The Sentry: the target opponent creates The Void, which must attack", () => {
    const { s: s0, ap, ids } = setup([sentry]);
    const s = settle(cast(s0, ap, ids[0]!));
    const opps = s.turnOrder.filter((p) => p !== ap);
    const [voidId] = opps.flatMap((p) => tokens(s, p));
    expect(nameOf(s, voidId!)).toBe("The Void");
    expect(characteristics(s, s.objects[voidId!]!).keywords).toEqual(expect.arrayContaining(["Flying", "Indestructible"]));
    const def = s.cards[s.objects[voidId!]!.cardId]!;
    expect(def.oracleText).toMatch(/This creature attacks each combat if able/);
    expect(isFullySupported(def)).toBe(true);
  });
});

describe("tokens with keywords and a quoted ability", () => {
  it("Alien Invasion: a hasty Alien that must attack, with a +1/+1 counter per invasion counter", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, alienInvasion);
    const s = settle(passUntil(s0, "beginCombat", ap));
    const [alien] = tokens(s, ap);
    const def = s.cards[s.objects[alien!]!.cardId]!;
    expect(characteristics(s, s.objects[alien!]!).keywords).toContain("Haste");
    expect(def.oracleText).toMatch(/attacks each combat if able/);
    expect(isFullySupported(def)).toBe(true);
    expect(pt(s, alien!)).toBe("1/1");
  });

  it("Dragon Egg's Dragon can pump itself", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const egg = putOnBattlefield(s0, ap, dragonEgg);
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "object", id: egg }]));
    const [dragon] = tokens(s, ap);
    expect(characteristics(s, s.objects[dragon!]!).keywords).toContain("Flying");
    expect(abilitiesOf(s, s.objects[dragon!]!).activated).toHaveLength(1);
    s = settle(activate(s, ap, dragon!, 0));
    expect(pt(s, dragon!)).toBe("3/2");
  });
});
