// "You may have target creature get -1/-1 until end of turn", "you may have enchanted creature fight target creature",
// "you may have Ally creatures you control gain vigilance": the controller chooses as it resolves whether it happens (CR
// 608.2d); its targets were chosen as it was put on the stack either way.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, pt, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, objHasKeyword, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const prowler = card("Fourth Bridge Prowler", "Creature — Human Rogue", "{B}", { power: "1", toughness: "1", oracleText: "When this creature enters, you may have target creature get -1/-1 until end of turn." });
const cartouche = card("Cartouche of Strength", "Enchantment — Aura Cartouche", "{2}{G}", { oracleText: "Enchant creature you control\nWhen this Aura enters, you may have enchanted creature fight target creature an opponent controls. (Each deals damage equal to its power to the other.)\nEnchanted creature gets +1/+1 and has trample." });
const bard = card("Joraga Bard", "Creature — Elf Rogue Bard Ally", "{3}{G}", { power: "1", toughness: "4", oracleText: "Whenever this creature or another Ally you control enters, you may have Ally creatures you control gain vigilance until end of turn." });
const khenra = card("Resilient Khenra", "Creature — Jackal Wizard", "{1}{G}", { power: "2", toughness: "2", oracleText: "When this creature enters, you may have target creature get +X/+X until end of turn, where X is this creature's power.\nEternalize {4}{G}{G} ({4}{G}{G}, Exile this card from your graveyard: Create a token that's a copy of it, except it's a 4/4 black Zombie Jackal Wizard with no mana cost. Eternalize only as a sorcery.)" });

/** Resolve the stack, choosing these targets for triggers and answering "you may" with `yes`. */
function settle(s: GameState, pid: PlayerId, yes: boolean, triggerTargets: TargetChoice[] = []): GameState {
  for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: pid, targets: triggerTargets });
    else if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: pid, yes });
    else s = passAll(s);
  }
  return s;
}

describe("you may have ...", () => {
  it("compiles them", () => supported(prowler, cartouche, bard, khenra));

  it("Fourth Bridge Prowler: yes gives the target -1/-1, no leaves it", () => {
    let { s, ap, opp, ids } = setup([prowler, { ...prowler }]);
    const a = putOnBattlefield(s, opp, bear());
    s = settle(cast(s, ap, ids[0]!), ap, false, [target(a)]);
    expect(pt(s, a)).toBe("2/2");
    s = settle(cast(s, ap, ids[1]!), ap, true, [target(a)]);
    expect(pt(s, a)).toBe("1/1");
  });

  it("Cartouche of Strength: the enchanted creature fights the target", () => {
    let { s, ap, opp, ids } = setup([cartouche]);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    s = settle(cast(s, ap, ids[0]!, [target(mine)]), ap, true, [target(theirs)]);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.damage).toBe(2);
    expect(pt(s, mine)).toBe("3/3");
  });

  it("Joraga Bard: Ally creatures you control gain vigilance, other creatures don't", () => {
    let { s, ap, ids } = setup([bard]);
    const b = putOnBattlefield(s, ap, bear());
    s = settle(cast(s, ap, ids[0]!), ap, true);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Vigilance")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Vigilance")).toBe(false);
  });

  it("Resilient Khenra: the target gets +X/+X, X its power", () => {
    let { s, ap, ids } = setup([khenra]);
    const b = putOnBattlefield(s, ap, bear());
    s = settle(cast(s, ap, ids[0]!), ap, true, [target(b)]);
    expect(pt(s, b)).toBe("4/4");
  });
});
