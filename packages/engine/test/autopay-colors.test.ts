// Autopay keeps the colors the player's other cards need untapped: generic mana comes from colors their hand and commander
// ask for least, for how many sources make them, so paying {3}{B} from mixed lands doesn't tap every Swamp and strand the
// next black spell.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, island, passAll, putOnBattlefield, setup, swamp, target } from "./helpers";
import { isFullySupported, planCast, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const gravedigger = card("Gravedigger", "Creature — Zombie", "{3}{B}", { power: "2", toughness: "2", oracleText: "When this creature enters, you may return target creature card from your graveyard to your hand." });
const disfigure = card("Disfigure", "Instant", "{B}", { oracleText: "Target creature gets -2/-2 until end of turn." });
const hymn = card("Hymn to Tourach", "Sorcery", "{B}{B}", { oracleText: "Target player discards two cards at random." });

const tappedBy = (s: GameState, plan: ReturnType<typeof planCast>) =>
  (plan ?? []).flatMap((a) => (a.type === "activateMana" ? [s.cards[s.objects[a.objectId]!.cardId]!.name] : []));

describe("autopay keeps colors for later spells", () => {
  it("{3}{B} from 14 mixed lands with two Swamps leaves a Swamp for Disfigure", () => {
    supported(gravedigger, disfigure);
    let { s, ap, ids } = setup([gravedigger, disfigure]);
    const plan = planCast(s, ap, ids[0]!);
    expect(tappedBy(s, plan).filter((n) => n === "Swamp")).toHaveLength(1);
    for (const a of plan!) s = act(s, a);
    const b = putOnBattlefield(s, ap, bear());
    expect(planCast(s, ap, ids[1]!, [target(b)])).not.toBeNull();
  });

  it("generic mana comes from colors the other cards in hand and the commander don't need, whatever order the lands are in", () => {
    let { s, ap, ids } = setup([gravedigger, hymn]);
    // Untap nothing new: tap everything but three Swamps and five Forests and Islands.
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = true;
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, swamp);
    for (let i = 0; i < 5; i++) putOnBattlefield(s, ap, i % 2 ? forest : island);
    const plan = planCast(s, ap, ids[0]!);
    // Islands for {3}: Hymn needs black and the commander green. One Swamp for {B}.
    expect(tappedBy(s, plan).sort()).toEqual(["Island", "Island", "Island", "Swamp"]);
    for (const a of plan!) s = act(s, a);
    s = passAll(s);
    expect(s.stack).toHaveLength(0);
    expect(planCast(s, ap, ids[1]!, [{ kind: "player", id: ap }])).not.toBeNull();
  });
});
