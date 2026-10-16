// Mythos of Illuna: "Create a token that's a copy of target permanent. If {R}{G} was spent to cast this spell, instead
// create a token that's a copy of that permanent, except the token has "When this token enters, if it's a creature, it
// fights up to one target creature you don't control."" The granted ability is an intervening if (CR 603.4): it
// triggers only if the token is a creature as it enters, and does nothing if it isn't one any more (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, compileCard, isFullySupported, type GameState } from "../src";
import { addMana } from "../src/spend";

// Real oracle text (Scryfall).
const mythos = card("Mythos of Illuna", "Sorcery", "{2}{R}{R}{G}{G}", { oracleText: "Create a token that's a copy of target permanent. If {R}{G} was spent to cast this spell, instead create a token that's a copy of that permanent, except the token has \"When this token enters, if it's a creature, it fights up to one target creature you don't control.\"" });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const solRing = card("Sol Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." });

const tokens = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid);

describe("Mythos of Illuna", () => {
  it("is supported; without {R}{G} it's a plain copy", () => {
    expect(isFullySupported(mythos)).toBe(true);
    const fx = compileCard(mythos).spell!.effects[0]!;
    expect(fx).toMatchObject({ type: "if", cond: { kind: "spent", req: { colors: { R: 1, G: 1 } } } });
    expect((fx as { otherwise: unknown[] }).otherwise).toEqual([expect.not.objectContaining({ except: expect.anything() })]);
  });

  it("with {R}{G} spent, the copy of a creature fights up to one creature you don't control as it enters", () => {
    let { s, ap, opp, ids } = setup([mythos]);
    const g = putOnBattlefield(s, opp, giant);
    const b = putOnBattlefield(s, opp, bear());
    addMana(s, ap, ["R", "R", "G", "G", "C", "C"], {});
    s = cast(s, ap, ids[0]!, [target(g)]);
    const [tok] = tokens(s, ap);
    expect(s.cards[s.objects[tok!]!.cardId]!.name).toBe("Hill Giant");
    expect(abilitiesOf(s, s.objects[tok!]!).triggers).toHaveLength(1);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = passAll(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[tok!]!.damage).toBe(2);
    expect(s.objects[g]!.damage).toBe(0);
  });

  it("\"except the token has\" in other copies (Irenicus's Vile Duplication, Miirym)", () => {
    const vile = card("Irenicus's Vile Duplication", "Sorcery", "{3}{U}", { oracleText: "Create a token that's a copy of target creature you control, except the token has flying and it isn't legendary." });
    const miirym = card("Miirym, Sentinel Wyrm", "Legendary Creature — Dragon Spirit", "{3}{G}{U}{R}", { power: "6", toughness: "6", keywords: ["Flying", "Ward"], oracleText: "Flying, ward {2}\nWhenever another nontoken Dragon you control enters, create a token that's a copy of it, except the token isn't legendary." });
    expect(isFullySupported(vile) && isFullySupported(miirym)).toBe(true);
    expect(compileCard(vile).spell!.effects[0]).toMatchObject({ type: "createTokenCopy", except: { keywords: ["Flying"], notLegendary: true } });
    expect(compileCard(miirym).triggers.flatMap((t) => t.body.effects)).toContainEqual(expect.objectContaining({ type: "createTokenCopy", except: { notLegendary: true } }));
  });

  it("the copy of a noncreature permanent has the ability, but it doesn't trigger", () => {
    let { s, ap, opp, ids } = setup([mythos]);
    const r = putOnBattlefield(s, opp, solRing);
    putOnBattlefield(s, opp, bear());
    addMana(s, ap, ["R", "R", "G", "G", "C", "C"], {});
    s = cast(s, ap, ids[0]!, [target(r)]);
    const [tok] = tokens(s, ap);
    expect(s.cards[s.objects[tok!]!.cardId]!.name).toBe("Sol Ring");
    expect(s.pending).toBeFalsy();
    expect(s.stack).toHaveLength(0);
  });
});
