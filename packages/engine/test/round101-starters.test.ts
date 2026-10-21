// Round 101: Windcrag Siege (Mardu: attack triggers trigger an additional time, CR 603.2d), Aven Mindcensor (an opponent
// searches only the top four cards, CR 614.1a), Chromatic Orrery (mana spent as though of any color, CR 609.4b),
// Scapeshift ("sacrifice any number of lands ... up to that many land cards"), Duelist's Heritage ("whenever one or more
// creatures attack": anyone's), Coveted Jewel ("attack you and aren't blocked": that player draws and takes it), Lethal
// Scheme and Venerated Loxodon ("each creature that convoked ~", CR 702.51a).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, waitingOn, type GameState, type PlayerId } from "../src";

const pass = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
/** Pass until the stack and triggers are empty, answering discards (the first cards) and "may"s (yes). */
function settle(s: GameState) {
  for (let i = 0; i < 80; i++) {
    const p = s.pending;
    if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
    else if (p) break;
    else if (s.stack.length || s.triggerQueue.length) s = pass(s);
    else break;
  }
  return s;
}
const toHand = (s: GameState, pid: PlayerId, id: string) => {
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
};
const toLibraryTop = (s: GameState, pid: PlayerId, ids: string[]) => {
  for (const id of ids) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
  }
  s.players[pid]!.library.unshift(...ids);
};

// Real oracle text (Scryfall).
const windcrag = card("Windcrag Siege", "Enchantment", "{1}{R}{W}", {
  oracleText:
    "As this enchantment enters, choose Mardu or Jeskai.\n• Mardu — If a creature attacking causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.\n• Jeskai — At the beginning of your upkeep, create a 1/1 red Goblin creature token. It gains lifelink and haste until end of turn.",
});
const raider = card("Jungle Raider", "Creature — Human Warrior", "{1}{R}", { power: "2", toughness: "2", oracleText: "Whenever this creature attacks, you gain 1 life." });
const mindcensor = card("Aven Mindcensor", "Creature — Bird Wizard", "{2}{W}", {
  power: "2",
  toughness: "1",
  keywords: ["Flash", "Flying"],
  oracleText: "Flash\nFlying\nIf an opponent would search a library, that player searches the top four cards of that library instead.",
});
const tutor = card("Sylvan Scrying", "Sorcery", "{1}{G}", { oracleText: "Search your library for a land card, reveal it, put it into your hand, then shuffle." });
const orrery = card("Chromatic Orrery", "Legendary Artifact", "{7}", {
  oracleText: "You may spend mana as though it were mana of any color.\n{T}: Add {C}{C}{C}{C}{C}{C}{C}.\n{5}, {T}: Draw a card for each color among permanents you control.",
});
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const scapeshift = card("Scapeshift", "Sorcery", "{2}{G}{G}", { oracleText: "Sacrifice any number of lands. Search your library for up to that many land cards, put them onto the battlefield tapped, then shuffle." });
const heritage = card("Duelist's Heritage", "Enchantment", "{2}{W}", { oracleText: "Whenever one or more creatures attack, you may have target attacking creature gain double strike until end of turn." });
const jewel = card("Coveted Jewel", "Artifact", "{6}", {
  oracleText:
    "When this artifact enters, draw three cards.\n{T}: Add three mana of any one color.\nWhenever one or more creatures an opponent controls attack you and aren't blocked, that player draws three cards and gains control of this artifact. Untap it.",
});
const scheme = card("Lethal Scheme", "Instant", "{2}{B}{B}", {
  keywords: ["Convoke"],
  oracleText:
    "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nDestroy target creature or planeswalker. Each creature that convoked this spell connives. (Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on that creature.)",
});
const loxodon = card("Venerated Loxodon", "Creature — Elephant Cleric", "{4}{W}", {
  power: "4",
  toughness: "4",
  keywords: ["Convoke"],
  oracleText: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nWhen this creature enters, put a +1/+1 counter on each creature that convoked it.",
});

describe("round 101: starting cards", () => {
  it("parse", () => {
    for (const c of [windcrag, mindcensor, orrery, scapeshift, heritage, jewel, scheme, loxodon]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Windcrag Siege (Mardu): an attack trigger triggers twice; not with Jeskai", () => {
    for (const anchor of ["Mardu", "Jeskai"]) {
      const { s: s0, ap, opp } = setup([]);
      const w = putOnBattlefield(s0, ap, windcrag);
      s0.objects[w]!.chosen = { anchor };
      const r = putOnBattlefield(s0, ap, raider);
      const life = s0.players[ap]!.life;
      let s = passUntil(s0, "declareAttackers", ap);
      s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: opp }] }));
      expect(s.players[ap]!.life, anchor).toBe(life + (anchor === "Mardu" ? 2 : 1));
    }
  });

  it("Aven Mindcensor: an opponent's search offers only the top four cards", () => {
    const { s: s0, ap, opp, ids } = setup([tutor]);
    putOnBattlefield(s0, opp, mindcensor);
    // A Forest fifth from the top only: the top four are bears.
    s0.players[ap]!.library = s0.players[ap]!.library.filter((id) => !s0.cards[s0.objects[id]!.cardId]!.types.includes("Land"));
    const bears = [0, 1, 2, 3].map(() => putOnBattlefield(s0, ap, bear()));
    const f = putOnBattlefield(s0, ap, forest);
    toLibraryTop(s0, ap, [...bears, f]);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [])!) s = act(s, a);
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary"; i++) s = pass(s);
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind === "searchLibrary") expect(s.pending.cards).toEqual([]);
  });

  it("Chromatic Orrery: colorless mana pays {U}", () => {
    const { s: s0, ap, ids } = setup([divination]);
    s0.battlefield = s0.battlefield.filter((id) => s0.objects[id]!.controller !== ap);
    invalidateCharacteristics(s0);
    s0.players[ap]!.manaPool.C = 3;
    expect(planCast(s0, ap, ids[0]!, [])).toBeNull();
    putOnBattlefield(s0, ap, orrery);
    s0.objects[s0.battlefield[0]!]!.tapped = true;
    const plan = planCast(s0, ap, ids[0]!, []);
    expect(plan).toBeTruthy();
    let s = s0;
    const hand = s.players[ap]!.hand.length;
    for (const a of plan!) s = act(s, a);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("Scapeshift: sacrifice two lands, find up to two land cards tapped", () => {
    const { s: s0, ap, ids } = setup([scapeshift]);
    s0.players[ap]!.manaPool.G = 4;
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [])!) s = act(s, a);
    for (let i = 0; i < 10 && s.pending?.kind !== "pickPermanents"; i++) s = pass(s);
    expect(s.pending?.kind).toBe("pickPermanents");
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
    const before = lands.length;
    s = act(s, { type: "pickPermanents", player: ap, ids: lands.slice(0, 2) });
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") return;
    expect(s.pending.max).toBe(2);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: s.pending.cards.slice(0, 2) }));
    const now = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
    expect(now.length).toBe(before);
    expect(now.filter((id) => !lands.includes(id)).every((id) => s.objects[id]!.tapped)).toBe(true);
  });

  it("Duelist's Heritage: an opponent's attack triggers it too; its controller's attacker gets double strike", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, heritage);
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    expect(s.pending?.kind).toBe("chooseTargets");
    if (s.pending?.kind !== "chooseTargets") return;
    expect(s.pending.player).toBe(opp);
    s = settle(act(s, { type: "chooseTargets", player: opp, targets: [target(b)] }));
    expect(objHasKeyword(s, s.objects[b]!, "Double strike")).toBe(true);
  });

  it("Coveted Jewel: an unblocked attacker at its controller: that player draws three and takes it, untapped", () => {
    const { s: s0, ap, opp } = setup([]);
    const j = putOnBattlefield(s0, opp, jewel);
    s0.objects[j]!.tapped = true;
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    const hand = s.players[ap]!.hand.length;
    for (let i = 0; i < 20 && s.step !== "combatDamage" && s.step !== "declareBlockers"; i++) s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: opp, blocks: [] }) : pass(s);
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: opp, blocks: [] });
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
    expect(s.objects[j]!.tapped).toBe(false);
    invalidateCharacteristics(s);
    expect(s.battlefield.includes(j)).toBe(true);
    expect(controllerOf(s, s.objects[j]!)).toBe(ap);
  });

  it("Lethal Scheme: each creature that convoked it connives", () => {
    const { s: s0, ap, opp, ids } = setup([scheme]);
    s0.battlefield = s0.battlefield.filter((id) => s0.objects[id]!.controller !== ap);
    const helpers = [0, 1].map(() => putOnBattlefield(s0, ap, bear()));
    const victim = putOnBattlefield(s0, opp, bear());
    invalidateCharacteristics(s0);
    s0.players[ap]!.manaPool.B = 2;
    const hand = s0.players[ap]!.hand.length;
    const plan = planCast(s0, ap, ids[0]!, [target(victim)], undefined, helpers);
    expect(plan).toBeTruthy();
    let s = s0;
    for (const a of plan!) s = act(s, a);
    s = settle(s);
    expect(s.objects[victim]!.zone).toBe("graveyard");
    // Two connives: two draws and two discards.
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    expect(s.log.filter((l) => / connives\./.test(l.text))).toHaveLength(2);
  });

  it("Venerated Loxodon: a +1/+1 counter on each creature that convoked it", () => {
    const { s: s0, ap, ids } = setup([loxodon]);
    s0.battlefield = s0.battlefield.filter((id) => s0.objects[id]!.controller !== ap);
    const helpers = [0, 1, 2].map(() => putOnBattlefield(s0, ap, bear()));
    const other = putOnBattlefield(s0, ap, bear());
    invalidateCharacteristics(s0);
    s0.players[ap]!.manaPool.W = 2;
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [], undefined, helpers)!) s = act(s, a);
    s = settle(s);
    for (const h of helpers) expect(s.objects[h]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[other]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});
