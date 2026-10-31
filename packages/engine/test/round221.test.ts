// Round 221: fresh cards from EDHREC rank 5,800 on. Bhaal, Lord of Murder ("put a counter on target creature and goad
// it"), Cosmogoyf (cards you own in exile), Powerstone Shard ({C} for each artifact named ~), Shield Mare (becomes the
// target of an opponent's spell or ability), Blood Funnel ("counter that spell unless you sacrifice a creature"), The
// Flesh Is Weak, Hindervines ("with no +1/+1 counters on them"), Buzzard-Wasp Colony ("put its counters on this
// creature"), Gibbering Descent (hellbent: skip your upkeep step), Endless Horizons (cards exiled with it by a search),
// Risen Executioner (cast from your graveyard for {1} more per other creature card), Nevinyrral, Urborg Tyrant
// (hexproof from card types), Magosi, the Waterveil, Corrupted Grafstone, Lethal Throwdown ("if the modified creature
// was sacrificed"), Flockchaser Phantom, Peri Brown and The Fifteenth Doctor (convoke / improvise for one spell),
// Underworld Sentinel, Spellwild Ouphe, Geistlight Snare, Rootless Yew, Siege Dragon, Tamiyo's Compleation, Boneyard
// Desecrator (outlaws), Ice Cream Kitty ("creature or token"), Patient Naturalist ("If you can't").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, objIsType, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/**
 * Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; other
 * players' questions are answered as the bots would. Stops at any other question of `me`'s.
 */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const nameOf = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
const named = (s: GameState, n: string) => s.battlefield.filter((id) => nameOf(s, id) === n);
const emptyHand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.splice(0).forEach((id) => (s.objects[id]!.zone = "exile"));
const tapLands = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield) if (controllerOf(s, s.objects[id]!) === pid && objIsType(s, s.objects[id]!, "Land")) s.objects[id]!.tapped = true;
};
/** Attack with `attacks`, nobody blocks; stops at `me`'s first question or once combat is over. */
const attack = (s: GameState, me: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[], stopAtMine = true) => {
  s = act(s, { type: "declareAttackers", player: me, attacks });
  for (let i = 0; i < 80 && s.step !== "endCombat" && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p && p.player === me && stopAtMine) return s;
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const murder = card("Test Murder", "Instant", "{B}", { oracleText: "Destroy target creature." });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const ornament = card("Test Ornament", "Artifact", "{2}", { oracleText: "" });
const plainsDef = card("Plains", "Basic Land — Plains");

// Real oracle text (Scryfall).
const bhaalLordOfMur = card("Bhaal, Lord of Murder", "Legendary Creature — God", "{2}{B}{R}{G}", {"cmc": 5, "oracleText": "As long as your life total is less than or equal to half your starting life total, Bhaal has indestructible.\nWhenever another nontoken creature you control dies, put a +1/+1 counter on target creature and goad it.", "power": "4", "toughness": "4", "keywords": ["Goad"], "layout": "normal"});
const cosmogoyf = card("Cosmogoyf", "Creature — Elemental Lhurgoyf", "{B}{G}", {"cmc": 2, "oracleText": "Cosmogoyf's power is equal to the number of cards you own in exile and its toughness is equal to that number plus 1.", "power": "*", "toughness": "1+*", "keywords": [], "layout": "normal"});
const powerstoneShar = card("Powerstone Shard", "Artifact", "{3}", {"cmc": 3, "oracleText": "{T}: Add {C} for each artifact you control named Powerstone Shard.", "keywords": [], "layout": "normal"});
const shieldMare = card("Shield Mare", "Creature — Horse", "{1}{W}{W}", {"cmc": 3, "oracleText": "This creature can't be blocked by red creatures.\nWhen this creature enters or becomes the target of a spell or ability an opponent controls, you gain 3 life.", "power": "2", "toughness": "3", "keywords": [], "layout": "normal"});
const bloodFunnel = card("Blood Funnel", "Enchantment", "{1}{B}", {"cmc": 2, "oracleText": "Noncreature spells you cast cost {2} less to cast.\nWhenever you cast a noncreature spell, counter that spell unless you sacrifice a creature.", "keywords": [], "layout": "normal"});
const theFleshIsWeak = card("The Flesh Is Weak", "Enchantment", "{2}{W}{U}{B}", {"cmc": 5, "oracleText": "When this enchantment enters, put a +1/+1 counter on each creature you control.\nCreatures you control with +1/+1 counters on them are artifacts in addition to their other types.\nNonartifact creatures get -1/-1.", "keywords": [], "layout": "normal"});
const hindervines = card("Hindervines", "Instant", "{2}{G}", {"cmc": 3, "oracleText": "Prevent all combat damage that would be dealt this turn by creatures with no +1/+1 counters on them.", "keywords": [], "layout": "normal"});
const buzzardWaspCol = card("Buzzard-Wasp Colony", "Creature — Bird Insect", "{3}{B}", {"cmc": 4, "oracleText": "Flying\nWhen this creature enters, you may sacrifice an artifact or creature. If you do, draw a card.\nWhenever another creature you control dies, if it had counters on it, put its counters on this creature.", "power": "2", "toughness": "2", "keywords": ["Flying"], "layout": "normal"});
const gibberingDesce = card("Gibbering Descent", "Enchantment", "{4}{B}{B}", {"cmc": 6, "oracleText": "At the beginning of each player's upkeep, that player loses 1 life and discards a card.\nHellbent — Skip your upkeep step if you have no cards in hand.\nMadness {2}{B}{B} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)", "keywords": ["Madness", "Hellbent"], "layout": "normal"});
const endlessHorizon = card("Endless Horizons", "Enchantment", "{3}{W}", {"cmc": 4, "oracleText": "When this enchantment enters, search your library for any number of Plains cards, exile them, then shuffle.\nAt the beginning of your upkeep, you may put a card you own exiled with this enchantment into your hand.", "keywords": [], "layout": "normal"});
const risenExecution = card("Risen Executioner", "Creature — Zombie Warrior", "{2}{B}{B}", {"cmc": 4, "oracleText": "This creature can't block.\nOther Zombie creatures you control get +1/+1.\nYou may cast this creature from your graveyard if you pay {1} more to cast it for each other creature card in your graveyard.", "power": "4", "toughness": "3", "keywords": [], "layout": "normal"});
const nevinyrralUrbo = card("Nevinyrral, Urborg Tyrant", "Legendary Creature — Zombie Wizard", "{3}{W}{U}{B}", {"cmc": 6, "oracleText": "Hexproof from artifacts, creatures, and enchantments\nWhen Nevinyrral enters, create a tapped 2/2 black Zombie creature token for each creature that died this turn.\nWhen Nevinyrral dies, you may pay {1}. When you do, destroy all artifacts, creatures, and enchantments.", "power": "3", "toughness": "6", "keywords": ["Hexproof from", "Hexproof"], "layout": "normal"});
const magosiTheWater = card("Magosi, the Waterveil", "Land", "", {"cmc": 0, "oracleText": "This land enters tapped.\n{T}: Add {U}.\n{U}, {T}: Put an eon counter on this land. Skip your next turn.\n{T}, Remove an eon counter from this land and return it to its owner's hand: Take an extra turn after this one.", "keywords": [], "layout": "normal"});
const corruptedGrafs = card("Corrupted Grafstone", "Artifact", "{2}", {"cmc": 2, "oracleText": "This artifact enters tapped.\n{T}: Choose a color of a card in your graveyard. Add one mana of that color.", "keywords": [], "layout": "normal"});
const lethalThrowdow = card("Lethal Throwdown", "Sorcery", "{B}", {"cmc": 1, "oracleText": "As an additional cost to cast this spell, sacrifice a creature or sacrifice a modified creature. (Equipment, Auras you control, and counters are modifications.)\nDestroy target creature or planeswalker. If the modified creature was sacrificed, draw a card.", "keywords": [], "layout": "normal"});
const flockchaserPha = card("Flockchaser Phantom", "Creature — Spirit", "{4}{W}{U}", {"cmc": 6, "oracleText": "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nFlying, vigilance\nWhenever this creature attacks, the next spell you cast this turn has convoke.", "power": "5", "toughness": "5", "keywords": ["Flying", "Vigilance", "Convoke"], "layout": "normal"});
const periBrown = card("Peri Brown", "Legendary Creature — Human", "{3}{W}", {"cmc": 4, "oracleText": "The first historic spell you cast each turn has convoke. (Your creatures can help cast it. Each creature you tap while casting it pays for {1} or one mana of that creature's color.)\nDoctor's companion (You can have two commanders if the other is the Doctor.)", "power": "2", "toughness": "3", "keywords": ["Doctor's companion"], "layout": "normal"});
const theFifteenthDo = card("The Fifteenth Doctor", "Legendary Creature — Time Lord Doctor", "{2}{U}{R}", {"cmc": 4, "oracleText": "Whenever The Fifteenth Doctor enters or attacks, mill three cards. You may put an artifact card with mana value 2 or 3 from among them into your hand.\nThe first nonartifact spell you cast each turn has improvise. (Your artifacts can help cast that spell. Each artifact you tap after you're done activating mana abilities pays for {1}.)", "power": "3", "toughness": "3", "keywords": ["Mill"], "layout": "normal"});
const underworldSent = card("Underworld Sentinel", "Creature — Skeleton Soldier", "{3}{B}{B}", {"cmc": 5, "oracleText": "Whenever this creature attacks, exile target creature card from your graveyard.\nWhen this creature dies, put all cards exiled with it onto the battlefield.", "power": "4", "toughness": "5", "keywords": [], "layout": "normal"});
const spellwildOuphe = card("Spellwild Ouphe", "Creature — Ouphe", "{1}{G}", {"cmc": 2, "oracleText": "Spells that target this creature cost {2} less to cast.", "power": "1", "toughness": "3", "keywords": [], "layout": "normal"});
const geistlightSnar = card("Geistlight Snare", "Instant", "{2}{U}", {"cmc": 3, "oracleText": "This spell costs {1} less to cast if you control a Spirit. It also costs {1} less to cast if you control an enchantment.\nCounter target spell unless its controller pays {3}.", "keywords": [], "layout": "normal"});
const rootlessYew = card("Rootless Yew", "Creature — Treefolk", "{3}{G}{G}", {"cmc": 5, "oracleText": "When this creature dies, search your library for a creature card with power or toughness 6 or greater, reveal it, put it into your hand, then shuffle.", "power": "5", "toughness": "4", "keywords": [], "layout": "normal"});
const siegeDragon = card("Siege Dragon", "Creature — Dragon", "{5}{R}{R}", {"cmc": 7, "oracleText": "Flying\nWhen this creature enters, destroy all Walls your opponents control.\nWhenever this creature attacks, if defending player controls no Walls, it deals 2 damage to each creature without flying that player controls.", "power": "5", "toughness": "5", "keywords": ["Flying"], "layout": "normal"});
const tamiyoSComplea = card("Tamiyo's Compleation", "Enchantment — Aura", "{3}{U}", {"cmc": 4, "oracleText": "Flash\nEnchant artifact, creature, or planeswalker\nWhen this Aura enters, tap enchanted permanent. If it's an Equipment, unattach it.\nEnchanted permanent loses all abilities and doesn't untap during its controller's untap step.", "keywords": ["Enchant", "Flash"], "layout": "normal"});
const boneyardDesecr = card("Boneyard Desecrator", "Creature — Zombie Mercenary", "{3}{B}", {"cmc": 4, "oracleText": "Menace\n{1}{B}, Sacrifice another creature: Put a +1/+1 counter on this creature. If an outlaw was sacrificed this way, create a Treasure token. (Assassins, Mercenaries, Pirates, Rogues, and Warlocks are outlaws.)", "power": "3", "toughness": "4", "keywords": ["Treasure", "Menace"], "layout": "normal"});
const iceCreamKitty = card("Ice Cream Kitty", "Artifact Creature — Food Cat Mutant", "{1}{B/G}", {"cmc": 2, "oracleText": "{2}, Sacrifice another creature or token: Draw a card. Activate only as a sorcery.\n{2}, {T}, Sacrifice this creature: You gain 3 life.", "power": "1", "toughness": "3", "keywords": [], "layout": "normal"});
const patientNatural = card("Patient Naturalist", "Creature — Human Scout", "{2}{G}", {"cmc": 3, "oracleText": "When this creature enters, mill three cards. Put a land card from among the milled cards into your hand. If you can't, create a Treasure token. (To mill three cards, put the top three cards of your library into your graveyard.)", "power": "2", "toughness": "3", "keywords": ["Treasure", "Mill"], "layout": "normal"});

describe("round 221 cards are supported", () => {
  it("compiles every card of the round", () => {
    supported(bhaalLordOfMur, cosmogoyf, powerstoneShar, shieldMare, bloodFunnel, theFleshIsWeak, hindervines, buzzardWaspCol, gibberingDesce, endlessHorizon, risenExecution, nevinyrralUrbo, magosiTheWater, corruptedGrafs, lethalThrowdow, flockchaserPha, periBrown, theFifteenthDo, underworldSent, spellwildOuphe, geistlightSnar, rootlessYew, siegeDragon, tamiyoSComplea, boneyardDesecr, iceCreamKitty, patientNatural);
  });
});

describe("Bhaal, Lord of Murder", () => {
  it("another nontoken creature of yours dying puts a +1/+1 counter on target creature and goads it", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    putOnBattlefield(s0, ap, bhaalLordOfMur);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(mine)])), { me: ap, targets: [tgt(theirs)] });
    expect(zone(s, mine)).toBe("graveyard");
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(1);
    expect(characteristics(s, s.objects[theirs]!).goadedBy).toEqual([ap]);
  });

  it("has indestructible only while your life is at most half your starting life", () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bhaalLordOfMur);
    expect(objHasKeyword(s, s.objects[b]!, "Indestructible")).toBe(false);
    s.players[ap]!.life = 20;
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[b]!, "Indestructible")).toBe(true);
  });
});

describe("Cosmogoyf", () => {
  it("is as big as the number of cards you own in exile, plus 1 toughness", () => {
    const { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, cosmogoyf);
    const base = s.players[ap]!.exile.length;
    expect(pt(s, g)).toBe(`${base}/${base + 1}`);
    into(s, ap, bear(), "exile");
    into(s, ap, bear(), "exile");
    into(s, opp, bear(), "exile");
    expect(pt(s, g)).toBe(`${base + 2}/${base + 3}`);
  });
});

describe("Powerstone Shard", () => {
  it("adds {C} for each artifact you control named Powerstone Shard", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, powerstoneShar);
    putOnBattlefield(s0, ap, powerstoneShar);
    putOnBattlefield(s0, ap, powerstoneShar);
    putOnBattlefield(s0, opp, powerstoneShar);
    putOnBattlefield(s0, ap, ornament);
    const s = act(s0, { type: "activateMana", player: ap, objectId: a, mana: "C" });
    expect(s.players[ap]!.manaPool.C).toBe(3);
  });
});

describe("Shield Mare", () => {
  it("gains 3 life when it enters and when an opponent's spell targets it, not when your own does", () => {
    const { s: s0, ap, ids, opp } = setup([shieldMare, shock]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    const life = s0.players[ap]!.life;
    expect(s.players[ap]!.life).toBe(life + 3);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)])), { me: ap });
    expect(s.players[ap]!.life).toBe(life + 3);
    s = passUntil(s, "main1", opp);
    const zap = into(s, opp, shock, "hand");
    s.players[opp]!.manaPool.R = 1;
    s = settle(run(s, planCast(s, opp, zap, [tgt(ids[0]!)])), { me: ap });
    expect(s.players[ap]!.life).toBe(life + 6);
  });

  it("can't be blocked by red creatures", () => {
    const { s: s0, ap, opp } = setup([]);
    const mare = putOnBattlefield(s0, ap, shieldMare);
    const red = putOnBattlefield(s0, opp, card("Red Ox", "Creature — Ox", "{R}", { power: "1", toughness: "1" }));
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: mare, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: red, attacker: mare }] })).toThrow();
  });
});

describe("Blood Funnel", () => {
  const sorcery = card("Test Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
  it("noncreature spells cost {2} less, and are countered unless you sacrifice a creature", () => {
    const { s: s0, ap, ids } = setup([sorcery]);
    putOnBattlefield(s0, ap, bloodFunnel);
    expect(spellCost(s0, ap, s0.objects[ids[0]!]!).extra).toBe(0);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { me: ap, may: false });
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.log.some((l) => /counter/i.test(l.text))).toBe(true);
  });

  it("sacrificing a creature lets the spell resolve", () => {
    const { s: s0, ap, ids } = setup([sorcery]);
    putOnBattlefield(s0, ap, bloodFunnel);
    const fodder = putOnBattlefield(s0, ap, bear({ name: "Fodder Bear" }));
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { me: ap, may: true });
    if (s.pending?.player === ap) s = settle(act(s, botActions(s, ap)[0]!), { me: ap });
    expect(zone(s, fodder)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });
});

describe("The Flesh Is Weak", () => {
  it("counters on your creatures make them artifacts; nonartifact creatures get -1/-1", () => {
    const { s: s0, ap, ids, opp } = setup([theFleshIsWeak]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    expect(objIsType(s, s.objects[mine]!, "Artifact")).toBe(true);
    expect(pt(s, mine)).toBe("3/3");
    expect(objIsType(s, s.objects[theirs]!, "Artifact")).toBe(false);
    expect(pt(s, theirs)).toBe("1/1");
  });
});

describe("Hindervines", () => {
  it("prevents combat damage from creatures with no +1/+1 counters on them", () => {
    const { s: s0, ap, ids, opp } = setup([hindervines]);
    const plain = putOnBattlefield(s0, ap, bear({ name: "Plain Bear" }));
    const pumped = putOnBattlefield(s0, ap, bear({ name: "Pumped Bear" }));
    s0.objects[pumped]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    const life = s.players[opp]!.life;
    s = attack(passUntil(s, "declareAttackers", ap), ap, [{ attacker: plain, defender: opp }, { attacker: pumped, defender: opp }]);
    expect(s.players[opp]!.life).toBe(life - 3);
  });
});

describe("Buzzard-Wasp Colony", () => {
  it("may sacrifice an artifact or creature as it enters to draw a card", () => {
    const { s: s0, ap, ids } = setup([buzzardWaspCol]);
    const fodder = putOnBattlefield(s0, ap, ornament);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap, may: true });
    if (s.pending?.player === ap) s = settle(act(s, botActions(s, ap)[0]!), { me: ap });
    expect(zone(s, fodder)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
  });

  it("another creature of yours dying with counters puts the same counters on it", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const colony = putOnBattlefield(s0, ap, buzzardWaspCol);
    const dead = putOnBattlefield(s0, ap, bear({ name: "Countered Bear" }));
    s0.objects[dead]!.counters["+1/+1"] = 2;
    s0.objects[dead]!.counters.oil = 1;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(dead)])), { me: ap });
    expect(s.objects[colony]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[colony]!.counters.oil).toBe(1);
    expect(pt(s, colony)).toBe("4/4");
  });
});

describe("Gibbering Descent", () => {
  it("each player loses 1 life and discards at their upkeep", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, gibberingDesce);
    const life = s0.players[opp]!.life;
    let s = passUntil(s0, "upkeep", opp);
    const hand = s.players[opp]!.hand.length;
    s = settle(s, { me: ap });
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(s.players[opp]!.hand.length).toBe(hand - 1);
  });

  it("hellbent: you skip your upkeep step with no cards in hand", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, gibberingDesce);
    let s = s0;
    for (let i = 0; i < 2000 && !(s.step === "end" && s.activePlayer === s.turnOrder[3]); i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    emptyHand(s, ap);
    const life = s.players[ap]!.life;
    for (let i = 0; i < 2000 && !(s.step === "draw" && s.activePlayer === ap); i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.life).toBe(life);
    expect(s.log.some((l) => /skips their upkeep/.test(l.text))).toBe(true);
  });
});

/** Passes (bots answer their own questions) until `pid`'s turn reaches `step`. */
const toStep = (s: GameState, step: GameState["step"], pid: PlayerId) => {
  for (let i = 0; i < 3000 && !(s.step === step && s.activePlayer === pid && !s.pending); i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("Endless Horizons", () => {
  it("exiles Plains cards from your library as it enters; at your upkeep you may put one of them into your hand", () => {
    const { s: s0, ap, ids } = setup([endlessHorizon]);
    const p1 = into(s0, ap, plainsDef, "library");
    const p2 = into(s0, ap, plainsDef, "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [p1, p2] }), { me: ap });
    expect(zone(s, p1)).toBe("exile");
    expect(zone(s, p2)).toBe("exile");
    // A card exiled some other way isn't one exiled with it.
    const other = into(s, ap, plainsDef, "exile");
    s = toStep(s, "end", s.turnOrder[3]!);
    s = passUntil(s, "upkeep", ap);
    s = settle(s, { me: ap, may: true });
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind === "searchLibrary") {
      expect(s.pending.cards).not.toContain(other);
      s = settle(act(s, { type: "searchLibrary", player: ap, found: [p1] }), { me: ap });
    }
    expect([zone(s, p1), zone(s, p2)].filter((z) => z === "hand")).toHaveLength(1);
    expect(zone(s, other)).toBe("exile");
  });
});

describe("Risen Executioner", () => {
  it("can be cast from your graveyard for {1} more for each other creature card there", () => {
    const { s: s0, ap } = setup([]);
    const ex = into(s0, ap, risenExecution, "graveyard");
    into(s0, ap, bear(), "graveyard");
    into(s0, ap, bear(), "graveyard");
    into(s0, ap, murder, "graveyard");
    expect(spellCost(s0, ap, s0.objects[ex]!, 0, [], { via: "permission" }).extra).toBe(4);
    const s = settle(run(s0, planCast(s0, ap, ex, undefined, undefined, "auto", undefined, { via: "permission" })), { me: ap });
    expect(zone(s, ex)).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped && objIsType(s, s.objects[id]!, "Land"))).toHaveLength(6);
  });

  it("gives other Zombies +1/+1 and can't block", () => {
    const { s, ap } = setup([]);
    const ex = putOnBattlefield(s, ap, risenExecution);
    const z = putOnBattlefield(s, ap, card("Test Zombie", "Creature — Zombie", "{B}", { power: "2", toughness: "2" }));
    expect(pt(s, z)).toBe("3/3");
    expect(pt(s, ex)).toBe("4/3");
  });
});

describe("Nevinyrral, Urborg Tyrant", () => {
  const pinger = card("Test Pinger", "Creature — Human", "{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });
  it("hexproof from creatures: an opponent's creature ability can't target it, an instant can", () => {
    const { s: s0, ap, opp } = setup([]);
    const nev = putOnBattlefield(s0, ap, nevinyrralUrbo);
    let s = passUntil(s0, "main1", opp);
    const p = putOnBattlefield(s, opp, pinger);
    expect(planActivate(s, opp, p, 0, [tgt(nev)])).toBeNull();
    const zap = into(s, opp, shock, "hand");
    s.players[opp]!.manaPool.R = 1;
    expect(planCast(s, opp, zap, [tgt(nev)])).not.toBeNull();
  });

  it("enters with a tapped Zombie for each creature that died this turn; dying, you may pay {1} to destroy all artifacts, creatures and enchantments", () => {
    const { s: s0, ap, ids, opp } = setup([murder, murder, nevinyrralUrbo]);
    const a = putOnBattlefield(s0, opp, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Bear B" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])), { me: ap });
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])), { me: ap });
    s.players[ap]!.manaPool.B = 1;
    s = settle(run(s, planCast(s, ap, ids[2]!)), { me: ap });
    const zombies = named(s, "Zombie Token");
    expect(zombies).toHaveLength(2);
    expect(zombies.every((id) => s.objects[id]!.tapped)).toBe(true);
    const ench = putOnBattlefield(s, opp, card("Test Aura Thing", "Enchantment", "{W}", { oracleText: "" }));
    const art = putOnBattlefield(s, opp, ornament);
    const land = s.battlefield.find((id) => objIsType(s, s.objects[id]!, "Land") && controllerOf(s, s.objects[id]!) === ap)!;
    const kill = into(s, ap, murder, "hand");
    s.players[ap]!.manaPool.B = 1;
    s.players[ap]!.manaPool.C = 1;
    s = settle(run(s, planCast(s, ap, kill, [tgt(ids[2]!)])), { me: ap, may: true });
    expect(zone(s, ids[2]!)).toBe("graveyard");
    expect(zone(s, ench)).toBe("graveyard");
    expect(zone(s, art)).toBe("graveyard");
    expect(named(s, "Zombie Token")).toHaveLength(0);
    expect(zone(s, land)).toBe("battlefield");
  });
});

describe("Magosi, the Waterveil", () => {
  it("removing the eon counter and returning it to hand gives you an extra turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, magosiTheWater);
    s0.objects[m]!.counters.eon = 1;
    let s = settle(run(s0, planActivate(s0, ap, m, 1)), { me: ap });
    expect(zone(s, m)).toBe("hand");
    s = toStep(s, "upkeep", ap);
    expect(s.turn).toBe(s0.turn + 1);
    s = toStep(s, "upkeep", opp);
    expect(s.turn).toBe(s0.turn + 2);
  });

  it("an eon counter skips your next turn; with both abilities in one turn, the skipped turn is the extra one (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, magosiTheWater);
    s0.players[ap]!.manaPool.U = 1;
    let s = settle(run(s0, planActivate(s0, ap, m, 0)), { me: ap });
    expect(s.objects[m]!.counters.eon).toBe(1);
    s.objects[m]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, m, 1)), { me: ap });
    expect(zone(s, m)).toBe("hand");
    // The extra turn is skipped: the next turn is the next player's.
    s = toStep(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(s.turn).toBe(s0.turn + 1);
    // And ap's own next turn comes as usual.
    s = toStep(s, "upkeep", ap);
    expect(s.turn).toBe(s0.turn + 4);
  });

  it("an eon counter alone skips your next turn", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, magosiTheWater);
    s0.players[ap]!.manaPool.U = 1;
    let s = settle(run(s0, planActivate(s0, ap, m, 0)), { me: ap });
    s = toStep(s, "upkeep", ap);
    // Three other turns, then ap's skipped one (a skipped turn isn't counted), then three more.
    expect(s.turn).toBe(s0.turn + 7);
  });
});

describe("Corrupted Grafstone", () => {
  it("adds one mana of any color among cards in your graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, corruptedGrafs);
    s0.players[ap]!.graveyard.splice(0).forEach((id) => (s0.objects[id]!.zone = "exile"));
    into(s0, ap, shock, "graveyard");
    into(s0, opp, murder, "graveyard");
    const s = act(s0, { type: "activateMana", player: ap, objectId: g, mana: "R" });
    expect(s.players[ap]!.manaPool.R).toBe(1);
    expect(() => act(s0, { type: "activateMana", player: ap, objectId: g, mana: "B" })).toThrow();
  });
});

describe("Lethal Throwdown", () => {
  it("sacrificing a modified creature draws a card", () => {
    const { s: s0, ap, ids, opp } = setup([lethalThrowdow]);
    const victim = putOnBattlefield(s0, opp, bear({ name: "Victim Bear" }));
    const mod = putOnBattlefield(s0, ap, bear({ name: "Modified Bear" }));
    s0.objects[mod]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(victim)], undefined, "auto", undefined, { costOr: 1, sacrifice: [mod] })), { me: ap });
    expect(zone(s, victim)).toBe("graveyard");
    expect(zone(s, mod)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
  });

  it("sacrificing a creature the plain way draws nothing, and an unmodified one can't pay the modified way", () => {
    const { s: s0, ap, ids, opp } = setup([lethalThrowdow]);
    const victim = putOnBattlefield(s0, opp, bear({ name: "Victim Bear" }));
    const plain = putOnBattlefield(s0, ap, bear({ name: "Plain Bear" }));
    expect(planCast(s0, ap, ids[0]!, [tgt(victim)], undefined, "auto", undefined, { costOr: 1, sacrifice: [plain] })).toBeNull();
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(victim)], undefined, "auto", undefined, { costOr: 0, sacrifice: [plain] })), { me: ap });
    expect(zone(s, victim)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });
});

describe("Flockchaser Phantom", () => {
  it("attacking gives the next spell you cast this turn convoke", () => {
    const { s: s0, ap, ids, opp } = setup([card("Test Draw", "Instant", "{2}", { oracleText: "Draw a card." }), card("Test Draw 2", "Instant", "{2}", { oracleText: "Draw a card." })]);
    const ph = putOnBattlefield(s0, ap, flockchaserPha);
    putOnBattlefield(s0, ap, bear({ name: "Helper A" }));
    putOnBattlefield(s0, ap, bear({ name: "Helper B" }));
    tapLands(s0, ap);
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto")).toBeNull();
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ph, defender: opp }] });
    s = settle(s, { me: ap });
    tapLands(s, ap);
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto")), { me: ap });
    expect(zone(s, ids[0]!)).toBe("graveyard");
    s.battlefield.forEach((id) => { if (nameOf(s, id).startsWith("Helper")) s.objects[id]!.tapped = false; });
    expect(planCast(s, ap, ids[1]!, undefined, undefined, "auto")).toBeNull();
  });
});

describe("Peri Brown", () => {
  it("the first historic spell you cast each turn has convoke", () => {
    const { s: s0, ap, ids } = setup([ornament, ornament]);
    putOnBattlefield(s0, ap, periBrown);
    putOnBattlefield(s0, ap, bear({ name: "Helper A" }));
    putOnBattlefield(s0, ap, bear({ name: "Helper B" }));
    putOnBattlefield(s0, ap, bear({ name: "Helper C" }));
    tapLands(s0, ap);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")), { me: ap });
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(planCast(s, ap, ids[1]!, undefined, undefined, "auto")).toBeNull();
  });

  it("a nonhistoric spell first doesn't use it up", () => {
    const { s: s0, ap, ids } = setup([card("Test Draw", "Sorcery", "{1}", { oracleText: "Draw a card." }), ornament]);
    putOnBattlefield(s0, ap, periBrown);
    putOnBattlefield(s0, ap, bear({ name: "Helper A" }));
    putOnBattlefield(s0, ap, bear({ name: "Helper B" }));
    tapLands(s0, ap);
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto")).toBeNull();
    s0.players[ap]!.manaPool.C = 1;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    expect(planCast(s, ap, ids[1]!, undefined, undefined, "auto")).not.toBeNull();
  });
});

describe("The Fifteenth Doctor", () => {
  it("the first nonartifact spell you cast each turn has improvise", () => {
    const sp = (n: string) => card(n, "Sorcery", "{2}", { oracleText: "Draw a card." });
    const { s: s0, ap, ids } = setup([sp("Test Draw A"), sp("Test Draw B")]);
    putOnBattlefield(s0, ap, theFifteenthDo);
    for (const n of ["Gizmo A", "Gizmo B", "Gizmo C", "Gizmo D"]) putOnBattlefield(s0, ap, card(n, "Artifact", "{1}", { oracleText: "" }));
    tapLands(s0, ap);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")), { me: ap });
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(planCast(s, ap, ids[1]!, undefined, undefined, "auto")).toBeNull();
  });

  it("attacking mills three; you may put an artifact card with mana value 2 or 3 from among them into your hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const doc = putOnBattlefield(s0, ap, theFifteenthDo);
    const big = into(s0, ap, card("Big Gizmo", "Artifact", "{4}", { oracleText: "" }), "library");
    const two = into(s0, ap, ornament, "library");
    const b = into(s0, ap, bear({ name: "Milled Bear" }), "library");
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: doc, defender: opp }] });
    s = settle(s, { me: ap });
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind === "searchLibrary") expect(s.pending.cards).toEqual([two]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [two] }), { me: ap });
    expect(zone(s, two)).toBe("hand");
    expect(zone(s, big)).toBe("graveyard");
    expect(zone(s, b)).toBe("graveyard");
  });
});

describe("Underworld Sentinel", () => {
  it("exiles a creature card from your graveyard when it attacks; dying, puts every card exiled with it onto the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const sentinel = putOnBattlefield(s0, ap, underworldSent);
    const dead = into(s0, ap, bear({ name: "Dead Bear" }), "graveyard");
    const other = into(s0, ap, bear({ name: "Other Exiled Bear" }), "exile");
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: sentinel, defender: opp }] });
    s = settle(s, { me: ap, targets: [tgt(dead)] });
    expect(zone(s, dead)).toBe("exile");
    const kill = into(s, ap, murder, "hand");
    s.players[ap]!.manaPool.B = 1;
    s = settle(run(s, planCast(s, ap, kill, [tgt(sentinel)])), { me: ap });
    expect(zone(s, sentinel)).toBe("graveyard");
    expect(zone(s, dead)).toBe("battlefield");
    expect(controllerOf(s, s.objects[dead]!)).toBe(ap);
    expect(zone(s, other)).toBe("exile");
  });
});

describe("Spellwild Ouphe", () => {
  it("spells that target it cost {2} less, whoever casts them", () => {
    const { s, ap, opp } = setup([]);
    const ouphe = putOnBattlefield(s, opp, spellwildOuphe);
    const other = putOnBattlefield(s, opp, bear());
    const bolt = into(s, ap, card("Test Blast", "Instant", "{3}{R}", { oracleText: "Test Blast deals 4 damage to target creature." }), "hand");
    expect(spellCost(s, ap, s.objects[bolt]!, 0, [], { targets: [tgt(other)] }).extra).toBe(3);
    expect(spellCost(s, ap, s.objects[bolt]!, 0, [], { targets: [tgt(ouphe)] }).extra).toBe(1);
  });
});

describe("Geistlight Snare", () => {
  it("costs {1} less with a Spirit and {1} less again with an enchantment", () => {
    const { s, ap, ids } = setup([geistlightSnar]);
    const cost = () => spellCost(s, ap, s.objects[ids[0]!]!).extra;
    expect(cost()).toBe(2);
    putOnBattlefield(s, ap, card("Test Spirit", "Creature — Spirit", "{W}", { power: "1", toughness: "1" }));
    invalidateCharacteristics(s);
    expect(cost()).toBe(1);
    putOnBattlefield(s, ap, card("Test Enchantment", "Enchantment", "{W}", { oracleText: "" }));
    invalidateCharacteristics(s);
    expect(cost()).toBe(0);
  });
});

describe("Rootless Yew", () => {
  it("dying, finds a creature card with power or toughness 6 or greater", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const yew = putOnBattlefield(s0, ap, rootlessYew);
    const wall = into(s0, ap, card("Tall Wall", "Creature — Wall", "{3}", { power: "0", toughness: "6" }), "library");
    const brute = into(s0, ap, card("Big Brute", "Creature — Giant", "{5}", { power: "6", toughness: "2" }), "library");
    const five = into(s0, ap, card("Five Five", "Creature — Giant", "{5}", { power: "5", toughness: "5" }), "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(yew)])), { me: ap });
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind === "searchLibrary") {
      expect(s.pending.cards).toContain(wall);
      expect(s.pending.cards).toContain(brute);
      expect(s.pending.cards).not.toContain(five);
    }
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [wall] }), { me: ap });
    expect(zone(s, wall)).toBe("hand");
  });
});

describe("Siege Dragon", () => {
  it("attacking a player with no Walls deals 2 damage to each creature without flying that player controls", () => {
    const { s: s0, ap, opp } = setup([]);
    const dragon = putOnBattlefield(s0, ap, siegeDragon);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const flier = putOnBattlefield(s0, opp, card("Test Bird", "Creature — Bird", "{U}", { power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" }));
    const third = putOnBattlefield(s0, s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!, bear({ name: "Bystander Bear" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: dragon, defender: opp }] });
    s = settle(s, { me: ap });
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, flier)).toBe("battlefield");
    expect(zone(s, third)).toBe("battlefield");
    expect(zone(s, mine)).toBe("battlefield");
  });

  it("does nothing on attack if the defending player controls a Wall; entering destroys your opponents' Walls", () => {
    const wallDef = card("Test Wall", "Creature — Wall", "{1}", { power: "0", toughness: "4", keywords: ["Defender"], oracleText: "Defender" });
    const { s: s0, ap, ids, opp } = setup([siegeDragon]);
    const dragon = putOnBattlefield(s0, ap, siegeDragon);
    const wall = putOnBattlefield(s0, opp, wallDef);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: dragon, defender: opp }] });
    s = settle(s, { me: ap });
    expect(zone(s, theirs)).toBe("battlefield");
    s = toStep(s, "main2", ap);
    const myWall = putOnBattlefield(s, ap, wallDef);
    s = settle(run(s, planCast(s, ap, ids[0]!)), { me: ap });
    expect(zone(s, wall)).toBe("graveyard");
    expect(zone(s, myWall)).toBe("battlefield");
  });
});

describe("Tamiyo's Compleation", () => {
  it("taps and unattaches an enchanted Equipment, which loses its abilities", () => {
    const sword = card("Test Sword", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });
    const { s: s0, ap, ids } = setup([tamiyoSComplea]);
    const b = putOnBattlefield(s0, ap, bear());
    const eq = putOnBattlefield(s0, ap, sword);
    s0.objects[eq]!.attachedTo = b;
    invalidateCharacteristics(s0);
    expect(pt(s0, b)).toBe("4/2");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(eq)])), { me: ap });
    expect(s.objects[ids[0]!]!.attachedTo).toBe(eq);
    expect(s.objects[eq]!.tapped).toBe(true);
    expect(s.objects[eq]!.attachedTo).toBeUndefined();
    expect(pt(s, b)).toBe("2/2");
    expect(planActivate(s, ap, eq, 0, [tgt(b)])).toBeNull();
  });

  it("a creature is tapped, loses its abilities and doesn't untap", () => {
    const { s: s0, ap, ids, opp } = setup([tamiyoSComplea]);
    const flier = putOnBattlefield(s0, opp, card("Test Bird", "Creature — Bird", "{U}", { power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(flier)])), { me: ap });
    expect(s.objects[flier]!.tapped).toBe(true);
    expect(s.objects[flier]!.attachedTo).toBeUndefined();
    expect(objHasKeyword(s, s.objects[flier]!, "Flying")).toBe(false);
    s = toStep(s, "main1", opp);
    expect(s.objects[flier]!.tapped).toBe(true);
  });
});

describe("Boneyard Desecrator", () => {
  it("sacrificing an outlaw adds a counter and makes a Treasure; another creature only the counter", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, boneyardDesecr);
    const rogue = putOnBattlefield(s0, ap, card("Test Rogue", "Creature — Human Rogue", "{B}", { power: "1", toughness: "1" }));
    const plain = putOnBattlefield(s0, ap, bear({ name: "Plain Bear" }));
    let s = settle(run(s0, planActivate(s0, ap, d, 0, undefined, undefined, undefined, undefined, { sacrifice: [plain] })), { me: ap });
    expect(zone(s, plain)).toBe("graveyard");
    expect(s.objects[d]!.counters["+1/+1"]).toBe(1);
    expect(named(s, "Treasure Token")).toHaveLength(0);
    s = settle(run(s, planActivate(s, ap, d, 0, undefined, undefined, undefined, undefined, { sacrifice: [rogue] })), { me: ap });
    expect(s.objects[d]!.counters["+1/+1"]).toBe(2);
    expect(named(s, "Treasure Token")).toHaveLength(1);
  });
});

describe("Ice Cream Kitty", () => {
  it("sacrifices another creature or a token to draw, as a sorcery; a nontoken artifact can't be sacrificed", () => {
    const { s: s0, ap, opp } = setup([]);
    const kitty = putOnBattlefield(s0, ap, iceCreamKitty);
    const tok = putOnBattlefield(s0, ap, card("Treasure", "Token Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this token: Add one mana of any color." }));
    s0.objects[tok]!.isToken = true;
    const orn = putOnBattlefield(s0, ap, ornament);
    expect(planActivate(s0, ap, kitty, 0, undefined, undefined, undefined, undefined, { sacrifice: [orn] })).toBeNull();
    expect(planActivate(s0, ap, kitty, 0, undefined, undefined, undefined, undefined, { sacrifice: [kitty] })).toBeNull();
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, kitty, 0, undefined, undefined, undefined, undefined, { sacrifice: [tok] })), { me: ap });
    expect(s.objects[tok]?.zone ?? "gone").not.toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // Only as a sorcery.
    const b = putOnBattlefield(s, ap, bear());
    const t = passUntil(s, "main1", opp);
    expect(planActivate(t, ap, kitty, 0, undefined, undefined, undefined, undefined, { sacrifice: [b] })).toBeNull();
  });
});

describe("Patient Naturalist", () => {
  it("mills three and puts a land card from among them into your hand", () => {
    const { s: s0, ap, ids } = setup([patientNatural]);
    const land = into(s0, ap, plainsDef, "library");
    into(s0, ap, bear({ name: "Milled A" }), "library");
    into(s0, ap, bear({ name: "Milled B" }), "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    if (s.pending?.player === ap) s = settle(act(s, botActions(s, ap)[0]!), { me: ap });
    expect(zone(s, land)).toBe("hand");
    expect(named(s, "Treasure Token")).toHaveLength(0);
  });

  it("with no land card milled, makes a Treasure instead", () => {
    const { s: s0, ap, ids } = setup([patientNatural]);
    const milled = [0, 1, 2].map((i) => into(s0, ap, bear({ name: `Milled ${i}` }), "library"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    if (s.pending?.player === ap) s = settle(act(s, botActions(s, ap)[0]!), { me: ap });
    expect(milled.every((id) => zone(s, id) === "graveyard")).toBe(true);
    expect(named(s, "Treasure Token")).toHaveLength(1);
  });
});

const hostOfTheHere = card("Host of the Hereafter", "Creature — Zombie Warlock", "{2}{B}{G}", {"cmc": 4, "oracleText": "This creature enters with two +1/+1 counters on it.\nWhenever this creature or another creature you control dies, if it had counters on it, put its counters on up to one target creature you control.", "power": "2", "toughness": "2", "keywords": [], "layout": "normal"});

describe("Host of the Hereafter", () => {
  it("is supported", () => supported(hostOfTheHere));

  it("itself or another creature of yours dying with counters puts the same counters on up to one target creature you control", () => {
    const { s: s0, ap, ids } = setup([murder, murder]);
    const host = putOnBattlefield(s0, ap, hostOfTheHere);
    s0.objects[host]!.counters["+1/+1"] = 2;
    const dead = putOnBattlefield(s0, ap, bear({ name: "Countered Bear" }));
    s0.objects[dead]!.counters["+1/+1"] = 1;
    s0.objects[dead]!.counters.oil = 1;
    const plain = putOnBattlefield(s0, ap, bear({ name: "Plain Bear" }));
    const heir = putOnBattlefield(s0, ap, bear({ name: "Heir Bear" }));
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(dead)])), { me: ap, targets: [tgt(heir)] });
    expect(zone(s, dead)).toBe("graveyard");
    expect(s.objects[heir]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[heir]!.counters.oil).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(host)])), { me: ap, targets: [tgt(heir)] });
    expect(s.objects[heir]!.counters["+1/+1"]).toBe(3);
    expect(s.objects[plain]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});
