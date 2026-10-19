// Round 87: smaller fixes and cards.

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, cast, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, isFullySupported, objHasKeyword, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.resolving) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

// Real oracle text (Scryfall).
const notDead = card("Not Dead After All", "Instant", "{B}", {
  keywords: ["Role token"],
  oracleText: 'Until end of turn, target creature you control gains "When this creature dies, return it to the battlefield tapped under its owner\'s control, then create a Wicked Role token attached to it." (Enchanted creature gets +1/+1. When this token is put into a graveyard, each opponent loses 1 life.)',
});
const murder = card("Doom Blade", "Instant", "{1}{B}", { oracleText: "Destroy target nonblack creature." });

describe("a quoted ability with ', then' in it is one ability", () => {
  it("Not Dead After All: the creature returns tapped with a Wicked Role attached", () => {
    supported(notDead);
    const { s: s0, ap, ids } = setup([notDead, murder]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    s = settle(cast(s, ap, ids[1]!, [target(b)]));
    const back = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears" && s.objects[id]!.controller === ap)!;
    expect(back).toBeDefined();
    expect(s.objects[back]!.tapped).toBe(true);
    const role = s.battlefield.find((id) => characteristics(s, s.objects[id]!).subtypes.includes("Role"));
    expect(role && s.objects[role]!.attachedTo).toBe(back);
    expect(pt(s, back)).toBe("3/3");
  });
});

const doubleTrouble = card("Double Trouble", "Instant", "{4}{R}", { keywords: ["Double"], oracleText: "Double the power of each creature you control until end of turn." });
const rhonas = card("God-Eternal Rhonas", "Legendary Creature — Zombie God", "{3}{G}{G}", { power: "5", toughness: "5", keywords: ["Double", "Deathtouch"], oracleText: "Deathtouch\nWhen God-Eternal Rhonas enters, double the power of each other creature you control until end of turn. Those creatures gain vigilance until end of turn.\nWhen God-Eternal Rhonas dies or is put into exile from the battlefield, you may put it into its owner's library third from the top." });
const growth = card("Unnatural Growth", "Enchantment", "{1}{G}{G}{G}{G}", { keywords: ["Double"], oracleText: "At the beginning of each combat, double the power and toughness of each creature you control until end of turn." });

describe("doubling the power or toughness of each creature (CR 701.10b-c)", () => {
  it("compile", () => supported(doubleTrouble, rhonas, growth));

  it("Double Trouble: each creature you control gets +X/+0 for its own power; a negative power gets -X/-0; others' don't", () => {
    const { s: s0, ap, opp, ids } = setup([doubleTrouble]);
    const a = putOnBattlefield(s0, ap, bear());
    const big = putOnBattlefield(s0, ap, bear({ power: "4", toughness: "4" }));
    const weak = putOnBattlefield(s0, ap, bear());
    addEffect(s0, ap, [weak], [{ kind: "modifyPT", power: -3, toughness: 0 }]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const s = settle(cast(s0, ap, ids[0]!));
    expect(pt(s, a)).toBe("4/2");
    expect(pt(s, big)).toBe("8/4");
    expect(pt(s, weak)).toBe("-2/2");
    expect(pt(s, theirs)).toBe("2/2");
  });

  it("God-Eternal Rhonas: the other creatures you control, which also gain vigilance; not Rhonas", () => {
    const { s: s0, ap, ids } = setup([rhonas]);
    const a = putOnBattlefield(s0, ap, bear());
    const s = settle(cast(s0, ap, ids[0]!));
    const r = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "God-Eternal Rhonas")!;
    expect(pt(s, a)).toBe("4/2");
    expect(objHasKeyword(s, s.objects[a]!, "Vigilance")).toBe(true);
    expect(pt(s, r)).toBe("5/5");
    expect(objHasKeyword(s, s.objects[r]!, "Vigilance")).toBe(false);
  });

  it("Unnatural Growth: at the beginning of each combat, power and toughness both, from what they are then", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, growth);
    const a = putOnBattlefield(s0, ap, bear({ power: "2", toughness: "3" }));
    let s = passUntil(s0, "beginCombat", ap);
    s = settle(s);
    expect(pt(s, a)).toBe("4/6");
  });
});
