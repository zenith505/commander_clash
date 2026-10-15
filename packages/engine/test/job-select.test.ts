// Job select (CR 702.182a): "When this Equipment enters, create a 1/1 colorless Hero creature token, then attach this
// Equipment to it." The job select Equipment also make the equipped creature a creature type in addition to its other
// types (layer 4), and some name their equip ability with a flavor word ("Gae Bolg — Equip {4}", CR 207.2d).

import { describe, expect, it } from "vitest";
import { act, card, cast, passUntil, pt, setup } from "./helpers";
import { abilitiesOf, characteristics, isFullySupported, objHasKeyword, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const fist = card("Monk's Fist", "Artifact — Equipment", "{2}", { keywords: ["Job select", "Equip"], oracleText: "Job select (When this Equipment enters, create a 1/1 colorless Hero creature token, then attach this to it.)\nEquipped creature gets +1/+0 and is a Monk in addition to its other types.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)" });
const staff = card("White Mage's Staff", "Artifact — Equipment", "{1}{W}", { keywords: ["Job select", "Equip"], oracleText: "Job select (When this Equipment enters, create a 1/1 colorless Hero creature token, then attach this to it.)\nEquipped creature gets +1/+1, has \"Whenever this creature attacks, you gain 1 life,\" and is a Cleric in addition to its other types.\nEquip {3} ({3}: Attach to target creature you control. Equip only as a sorcery.)" });
const katana = card("Samurai's Katana", "Artifact — Equipment", "{2}{R}", { keywords: ["Murasame", "Job select", "Equip"], oracleText: "Job select (When this Equipment enters, create a 1/1 colorless Hero creature token, then attach this to it.)\nEquipped creature gets +2/+2, has trample and haste, and is a Samurai in addition to its other types.\nMurasame — Equip {5}" });
const lance = card("Dragoon's Lance", "Artifact — Equipment", "{1}{W}", { keywords: ["Gae Bolg", "Job select", "Equip"], oracleText: "Job select (When this Equipment enters, create a 1/1 colorless Hero creature token, then attach this to it.)\nEquipped creature gets +1/+0 and is a Knight in addition to its other types.\nDuring your turn, equipped creature has flying.\nGae Bolg — Equip {4}" });

const hero = (s: GameState, pid: number) => s.battlefield.find((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === "Hero Token");

describe("job select", () => {
  it("parses, with the flavor-word equip abilities", () => {
    supported(fist, staff, katana, lance);
  });

  it("makes a 1/1 colorless Hero token and attaches to it; the Hero gets the job's creature type", () => {
    const { s: s0, ap, ids } = setup([fist]);
    const s = cast(s0, ap, ids[0]!);
    const h = hero(s, ap)!;
    expect(h).toBeDefined();
    expect(s.objects[ids[0]!]!.attachedTo).toBe(h);
    const c = characteristics(s, s.objects[h]!);
    expect(c.colors).toEqual([]);
    expect(c.subtypes).toEqual(expect.arrayContaining(["Hero", "Monk"]));
    expect(pt(s, h)).toBe("2/1");
  });

  it("the granted abilities work on the Hero: keywords, and a quoted attack trigger", () => {
    const { s: s0, ap, ids } = setup([katana]);
    let s = cast(s0, ap, ids[0]!);
    const h = hero(s, ap)!;
    expect(pt(s, h)).toBe("3/3");
    expect(objHasKeyword(s, s.objects[h]!, "Haste")).toBe(true);
    expect(objHasKeyword(s, s.objects[h]!, "Trample")).toBe(true);
    expect(characteristics(s, s.objects[h]!).subtypes).toContain("Samurai");
    expect(abilitiesOf(s, s.objects[ids[0]!]!).activated.some((a) => a.equip && a.manaCost === "{5}")).toBe(true);

    const { s: s1, ap: ap1, opp, ids: ids1 } = setup([staff]);
    s = cast(s1, ap1, ids1[0]!);
    const h1 = hero(s, ap1)!;
    s.objects[h1]!.controlledSinceTurn = -1; // not summoning sick
    const life = s.players[ap1]!.life;
    s = passUntil(s, "declareAttackers", ap1);
    s = act(s, { type: "declareAttackers", player: ap1, attacks: [{ attacker: h1, defender: opp }] });
    for (let i = 0; i < 8 && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap1]!.life).toBe(life + 1);
  });
});
