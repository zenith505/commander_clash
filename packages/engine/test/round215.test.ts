// Round 215: Forgotten Monument, Nature's Embrace, Sigrid, Faller's Faithful, Niambi, Orzhov Charm, Jolly Gerbils, Reign
// of the Pit, Reptilian Recruiter, Jace's Mindseeker, Kroxa and Kunoros and others (fresh cards from EDHREC rank 14,200 on).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, dealDamage, objectSource, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, controllerOf, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
/** Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes until a trigger asks for its targets (or the stack is empty). */
const untilTargets = (s: GameState) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "chooseTargets" && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const nameOf = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;

// Real oracle text (Scryfall).
const forgotten = card("Forgotten Monument", "Land — Cave", "", {"cmc":0,"oracleText":"{T}: Add {C}.\nOther Caves you control have \"{T}, Pay 1 life: Add one mana of any color.\"","keywords":[]});
const natures = card("Nature's Embrace", "Enchantment — Aura", "{2}{G}", {"cmc":3,"oracleText":"Enchant creature or land\nAs long as enchanted permanent is a creature, it gets +2/+2.\nAs long as enchanted permanent is a land, it has \"{T}: Add two mana of any one color.\"","keywords":["Enchant"]});
const sigrid = card("Sigrid, God-Favored", "Legendary Creature — Human Warrior", "{1}{W}{W}", {"cmc":3,"oracleText":"Flash\nFirst strike, protection from God creatures\nWhen Sigrid enters, exile up to one target attacking or blocking creature until Sigrid leaves the battlefield.","power":"2","toughness":"2","keywords":["First strike","Protection","Flash"]});
const fallers = card("Faller's Faithful", "Creature — Human Wizard", "{2}{B}", {"cmc":3,"oracleText":"When this creature enters, destroy up to one other target creature. If that creature wasn't dealt damage this turn, its controller draws two cards.","power":"3","toughness":"1","keywords":[]});
const niambi = card("Niambi, Esteemed Speaker", "Legendary Creature — Human Cleric", "{W}{U}", {"cmc":2,"oracleText":"Flash\nWhen Niambi enters, you may return another target creature you control to its owner's hand. If you do, you gain life equal to that creature's mana value.\n{1}{W}{U}, {T}, Discard a legendary card: Draw two cards.","power":"2","toughness":"1","keywords":["Flash"]});
const orzhov = card("Orzhov Charm", "Instant", "{W}{B}", {"cmc":2,"oracleText":"Choose one —\n• Return target creature you control and all Auras you control attached to it to their owner's hand.\n• Destroy target creature and you lose life equal to its toughness.\n• Return target creature card with mana value 1 or less from your graveyard to the battlefield.","keywords":[]});
const hYDRA = card("HYDRA Assault Robot", "Artifact Creature — Robot Villain", "{1}{R}", {"cmc":2,"oracleText":"Whenever another Villain and/or artifact you control enters, this creature deals 1 damage to target opponent.","power":"1","toughness":"3","keywords":[]});
const jolly = card("Jolly Gerbils", "Creature — Hamster Citizen", "{1}{W}", {"cmc":2,"oracleText":"Whenever you give a gift, draw a card.","power":"2","toughness":"3","keywords":[]});
const reign = card("Reign of the Pit", "Sorcery", "{4}{B}{B}", {"cmc":6,"oracleText":"Each player sacrifices a creature of their choice. Create an X/X black Demon creature token with flying, where X is the total power of the creatures sacrificed this way.","keywords":[]});
const reptilian = card("Reptilian Recruiter", "Creature — Lizard Warrior", "{3}{R}{R}", {"cmc":5,"oracleText":"Trample\nWhen this creature enters, choose target creature. If that creature's power is 2 or less or if you control another Lizard, gain control of that creature until end of turn, untap it, and it gains haste until end of turn.","power":"4","toughness":"2","keywords":["Trample"]});
const chandras = card("Chandra's Embercat", "Creature — Elemental Cat", "{1}{R}", {"cmc":2,"oracleText":"{T}: Add {R}. Spend this mana only to cast an Elemental spell or a Chandra planeswalker spell.","power":"2","toughness":"2","keywords":[]});
const volshe = card("Volshe Tideturner", "Creature — Merfolk Wizard", "{1}{U}", {"cmc":2,"oracleText":"{T}: Add {U}. Spend this mana only to cast an instant or sorcery spell or a kicked spell.","power":"1","toughness":"3","keywords":[]});
const gunner = card("Gunner Conscript", "Creature — Human Mercenary", "{1}{G}", {"cmc":2,"oracleText":"Trample\nThis creature gets +1/+1 for each Aura and Equipment attached to it.\nWhen this creature dies, if it was enchanted, create a Junk token.\nWhen this creature dies, if it was equipped, create a Junk token.","power":"2","toughness":"2","keywords":["Trample"]});
const ennis = card("Ennis, Debate Moderator", "Legendary Creature — Human Cleric", "{1}{W}", {"cmc":2,"oracleText":"When Ennis enters, exile up to one other target creature you control. Return that card to the battlefield under its owner's control at the beginning of the next end step.\nAt the beginning of your end step, if one or more cards were put into exile this turn, put a +1/+1 counter on Ennis.","power":"1","toughness":"1","keywords":[]});
const adventure = card("Adventure Awaits", "Sorcery", "{1}{G}", {"cmc":2,"oracleText":"Look at the top five cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in a random order. If you didn't put a card into your hand this way, draw a card.","keywords":[]});
const demonic = card("Demonic Bargain", "Sorcery", "{2}{B}", {"cmc":3,"oracleText":"Exile the top thirteen cards of your library, then search your library for a card. Put that card into your hand, then shuffle.","keywords":[]});
const sawblade = card("Sawblade Skinripper", "Creature — Human Assassin", "{1}{B}{R}", {"cmc":3,"oracleText":"Menace\n{2}, Sacrifice another creature or enchantment: Put a +1/+1 counter on this creature.\nAt the beginning of your end step, if you sacrificed one or more permanents this turn, this creature deals that much damage to any target.","power":"3","toughness":"2","keywords":["Menace"]});
const rescue = card("Rescue, Pepper Potts", "Legendary Artifact Creature — Human Hero", "{1}{U}", {"cmc":2,"oracleText":"Flash\nFlying\nWhen Rescue enters, return up to one other target artifact or creature you control to its owner's hand. If it was an artifact, put a +1/+1 counter on Rescue.","power":"2","toughness":"1","keywords":["Flying","Flash"]});
const kroxa = card("Kroxa and Kunoros", "Legendary Creature — Elder Giant Dog", "{3}{R}{W}{B}", {"cmc":6,"oracleText":"Vigilance, menace, lifelink\nWhenever Kroxa and Kunoros enters or attacks, you may exile five cards from your graveyard. When you do, return target creature card from your graveyard to the battlefield.","power":"6","toughness":"6","keywords":["Lifelink","Vigilance","Menace"]});
const jaces = card("Jace's Mindseeker", "Creature — Fish Illusion", "{4}{U}{U}", {"cmc":6,"oracleText":"Flying\nWhen this creature enters, target opponent mills five cards. You may cast an instant or sorcery spell from among them without paying its mana cost.","power":"4","toughness":"4","keywords":["Flying","Mill"]});
const nissas = card("Nissa's Triumph", "Sorcery", "{G}{G}", {"cmc":2,"oracleText":"Search your library for up to two basic Forest cards. If you control a Nissa planeswalker, instead search your library for up to three land cards. Reveal those cards, put them into your hand, then shuffle.","keywords":[]});
const infernal = card("Infernal Vessel", "Creature — Human Cleric", "{2}{B}", {"cmc":3,"oracleText":"When this creature dies, if it wasn't a Demon, return it to the battlefield under its owner's control with two +1/+1 counters on it. It's a Demon in addition to its other types.","power":"2","toughness":"1","keywords":[]});
// Supported as a side effect of this round's templates.
const kishla = card("Kishla Trawlers", "Creature — Human Citizen", "{2}{U}", {"cmc":3,"oracleText":"When this creature enters, you may exile a creature card from your graveyard. When you do, return target instant or sorcery card from your graveyard to your hand.","power":"3","toughness":"2","keywords":[]});
const pyreSledge = card("Pyre-Sledge Arsonist", "Creature — Lizard Shaman", "{2}{R}", {"cmc":3,"oracleText":"{1}, {T}: This creature deals X damage to any target, where X is the number of permanents you've sacrificed this turn.","power":"2","toughness":"2","keywords":[]});
const stockpiling = card("Stockpiling Celebrant", "Creature — Dwarf Knight", "{2}{W}", {"cmc":3,"oracleText":"When this creature enters, you may return another target nonland permanent you control to its owner's hand. If you do, scry 2.","power":"3","toughness":"2","keywords":["Scry"]});
const young = card("Young Necromancer", "Creature — Human Warlock", "{4}{B}", {"cmc":5,"oracleText":"When this creature enters, you may exile two cards from your graveyard. When you do, return target creature card from your graveyard to the battlefield.","power":"2","toughness":"3","keywords":[]});

describe("round 215 cards", () => {
  it("compile", () =>
    supported(forgotten, natures, sigrid, fallers, niambi, orzhov, hYDRA, jolly, reign, reptilian, chandras, volshe, gunner, ennis, adventure, demonic, sawblade, rescue, kroxa, jaces, nissas, infernal, kishla, pyreSledge, stockpiling, young));
});

describe("Forgotten Monument and Nature's Embrace", () => {
  it("other Caves you control get \"{T}, Pay 1 life: Add one mana of any color\"; the Monument itself doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, forgotten);
    const cave = putOnBattlefield(s0, ap, card("Hidden Cave", "Land — Cave", "", { oracleText: "{T}: Add {C}." }));
    const theirs = putOnBattlefield(s0, opp, card("Their Cave", "Land — Cave", "", { oracleText: "{T}: Add {C}." }));
    expect(abilitiesOf(s0, s0.objects[m]!).mana).toHaveLength(1);
    expect(abilitiesOf(s0, s0.objects[cave]!).mana).toHaveLength(2);
    expect(abilitiesOf(s0, s0.objects[theirs]!).mana).toHaveLength(1);
    const s = act(s0, { type: "activateMana", player: ap, objectId: cave, mana: "R", ability: 1 });
    expect(s.players[ap]!.manaPool.R).toBe(1);
    expect(s.players[ap]!.life).toBe(39);
  });

  it("Nature's Embrace: +2/+2 on a creature, two mana of any one color on a land", () => {
    const { s: s0, ap, ids } = setup([natures, natures]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(pt(s, b)).toBe("4/4");
    expect(abilitiesOf(s, s.objects[b]!).mana).toHaveLength(0);
    const land = putOnBattlefield(s, ap, card("Bare Land", "Land"));
    s.players[ap]!.manaPool.G = 3;
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(land)])));
    expect(abilitiesOf(s, s.objects[land]!).mana).toHaveLength(1);
    s = act(s, { type: "activateMana", player: ap, objectId: land, mana: "U" });
    expect(s.players[ap]!.manaPool.U).toBe(2);
  });
});

describe("Sigrid, God-Favored", () => {
  it("has protection from God creatures: their damage is prevented, not other creatures' or a noncreature God's", () => {
    const { s, ap, opp } = setup([]);
    const sg = putOnBattlefield(s, ap, sigrid);
    expect(characteristics(s, s.objects[sg]!).keywords).toContain("Protection from creatures of type God");
    expect(objHasKeyword(s, s.objects[sg]!, "First strike")).toBe(true);
    const god = putOnBattlefield(s, opp, card("Some God", "Legendary Creature — God", "{2}", { power: "4", toughness: "4" }));
    const notCreature = putOnBattlefield(s, opp, card("Resting God", "Legendary Enchantment — God", "{2}"));
    const other = putOnBattlefield(s, opp, bear());
    dealDamage(s, objectSource(s, s.objects[god]!), { object: s.objects[sg]! }, 1);
    expect(s.objects[sg]!.damage ?? 0).toBe(0);
    dealDamage(s, objectSource(s, s.objects[notCreature]!), { object: s.objects[sg]! }, 1);
    expect(s.objects[sg]!.damage ?? 0).toBe(1);
    dealDamage(s, objectSource(s, s.objects[other]!), { object: s.objects[sg]! }, 1);
    expect(s.objects[sg]!.damage ?? 0).toBe(2);
  });
});

describe("Faller's Faithful", () => {
  it("destroys the target; its controller draws two cards if it wasn't dealt damage this turn", () => {
    const { s: s0, ap, ids, opp } = setup([fallers]);
    const b = putOnBattlefield(s0, opp, bear());
    const hand = s0.players[opp]!.hand.length;
    let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(s, { targets: [tgt(b)] });
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
  });

  it("no cards if it was dealt damage this turn; none either with no target", () => {
    const { s: s0, ap, ids, opp } = setup([fallers, fallers]);
    const b = putOnBattlefield(s0, opp, card("Tough Bear", "Creature — Bear", "{2}", { power: "2", toughness: "4" }));
    dealDamage(s0, objectSource(s0, s0.objects[b]!), { object: s0.objects[b]! }, 1);
    const hand = s0.players[opp]!.hand.length;
    const mine = s0.players[ap]!.hand.length;
    let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(s, { targets: [tgt(b)] });
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[opp]!.hand.length).toBe(hand);
    s.players[ap]!.manaPool.B = 3;
    s = untilTargets(run(s, planCast(s, ap, ids[1]!)));
    s = settle(s, { targets: [{ kind: "none" }] });
    expect(s.players[ap]!.hand.length).toBe(mine - 2);
  });
});

describe("Niambi, Esteemed Speaker", () => {
  it("you may return another creature you control; if you do, you gain life equal to its mana value", () => {
    const { s: s0, ap, ids } = setup([niambi]);
    const big = putOnBattlefield(s0, ap, card("Big Thing", "Creature — Beast", "{3}{G}{G}", { cmc: 5, power: "5", toughness: "5" }));
    let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(s, { targets: [tgt(big)], may: true });
    expect(zone(s, big)).toBe("hand");
    expect(s.players[ap]!.life).toBe(45);
  });

  it("no life if you don't return it", () => {
    const { s: s0, ap, ids } = setup([niambi]);
    const big = putOnBattlefield(s0, ap, card("Big Thing", "Creature — Beast", "{3}{G}{G}", { cmc: 5, power: "5", toughness: "5" }));
    let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(s, { targets: [tgt(big)], may: false });
    expect(zone(s, big)).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(40);
  });
});

describe("Orzhov Charm", () => {
  it("first mode: the creature and the Auras you control on it go to their owners' hands; an opponent's Aura doesn't", () => {
    const { s: s0, ap, ids, opp } = setup([orzhov]);
    const b = putOnBattlefield(s0, ap, bear());
    const aura = card("Mine Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature" });
    const mineA = putOnBattlefield(s0, ap, aura);
    const theirA = putOnBattlefield(s0, opp, card("Their Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature" }));
    s0.objects[mineA]!.attachedTo = b;
    s0.objects[theirA]!.attachedTo = b;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)], [0])));
    expect(zone(s, b)).toBe("hand");
    expect(zone(s, mineA)).toBe("hand");
    expect(zone(s, theirA)).toBe("graveyard");
  });

  it("second mode: destroy target creature and you lose life equal to its toughness, even if it isn't destroyed", () => {
    const { s: s0, ap, ids, opp } = setup([orzhov, orzhov]);
    const b = putOnBattlefield(s0, opp, card("Tough Bear", "Creature — Bear", "{2}", { power: "2", toughness: "4" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)], [1])));
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(36);
    const ind = putOnBattlefield(s, opp, card("Wall", "Creature — Wall", "{2}", { power: "0", toughness: "3", oracleText: "Indestructible", keywords: ["Indestructible"] }));
    s.players[ap]!.manaPool.W = 1;
    s.players[ap]!.manaPool.B = 1;
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ind)], [1])));
    expect(zone(s, ind)).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(33);
  });
});

describe("HYDRA Assault Robot", () => {
  it("another Villain or artifact entering under your control deals 1 damage to target opponent; a plain creature doesn't", () => {
    const { s: s0, ap, ids, opp } = setup([card("Relic", "Artifact", "{1}"), card("Bad Guy", "Creature — Human Villain", "{1}", { power: "1", toughness: "1" }), bear()]);
    putOnBattlefield(s0, ap, hYDRA);
    let s = s0;
    for (const id of ids) {
      s = untilTargets(run(s, planCast(s, ap, id)));
      s = settle(s, { targets: [{ kind: "player", id: opp }] });
    }
    expect(s.players[opp]!.life).toBe(38);
  });
});

describe("Jolly Gerbils", () => {
  const giftLife = card("Gift of Life", "Sorcery", "{1}{W}", { keywords: ["Gift"], oracleText: "Gift a card (You may promise an opponent a gift as you cast this spell. If you do, they draw a card before its other effects.)\nYou gain 2 life." });
  const giftCreature = card("Gift Bear", "Creature — Bear", "{1}{G}", { keywords: ["Gift"], power: "2", toughness: "2", oracleText: "Gift a Food (You may promise an opponent a gift as you cast this spell. If you do, when this creature enters, they create a Food token.)" });

  it("you draw a card when a spell of yours with a promised gift resolves, or a gift trigger of yours resolves", () => {
    const { s: s0, ap, ids, opp } = setup([giftLife, giftCreature, giftLife]);
    putOnBattlefield(s0, ap, jolly);
    const hand = s0.players[ap]!.hand.length;
    const theirs = s0.players[opp]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { gift: opp })));
    expect(s.players[ap]!.life).toBe(42);
    expect(s.players[opp]!.hand.length).toBe(theirs + 1);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    s = settle(run(s, planCast(s, ap, ids[1]!, undefined, undefined, "auto", undefined, { gift: opp })));
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 2);
    // Without a gift promised, no card.
    s.players[ap]!.manaPool.W = 2;
    s = settle(run(s, planCast(s, ap, ids[2]!)));
    expect(s.players[ap]!.life).toBe(44);
    expect(s.players[ap]!.hand.length).toBe(hand - 3 + 2);
  });

  it("an opponent's gift doesn't count", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, jolly);
    const hand = s0.players[ap]!.hand.length;
    let s = passUntil(s0, "main1", opp);
    const handNow = s.players[ap]!.hand.length;
    const id = into(s, opp, giftCreature, "hand");
    s.players[opp]!.manaPool.G = 2;
    s = settle(run(s, planCast(s, opp, id, undefined, undefined, "auto", undefined, { gift: ap })));
    expect(zone(s, id)).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(handNow);
    void hand;
  });
});

describe("Reign of the Pit", () => {
  it("each player sacrifices a creature; the Demon's power and toughness are the total power sacrificed", () => {
    const { s: s0, ap, ids } = setup([reign]);
    for (const p of s0.turnOrder) putOnBattlefield(s0, p, card("Ogre", "Creature — Ogre", "{2}", { power: p === ap ? "3" : "2", toughness: "2" }));
    // One creature each: no choice to make.
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const demon = s.battlefield.find((id) => nameOf(s, id) === "Demon Token");
    expect(s.pending).toBeNull();
    expect(demon).toBeDefined();
    expect(pt(s, demon!)).toBe("9/9");
    expect(objHasKeyword(s, s.objects[demon!]!, "Flying")).toBe(true);
  });
});

describe("Reptilian Recruiter", () => {
  const go = (theirs: CardDef, lizard: boolean) => {
    const { s: s0, ap, ids, opp } = setup([reptilian]);
    const t = putOnBattlefield(s0, opp, theirs);
    s0.objects[t]!.tapped = true;
    if (lizard) putOnBattlefield(s0, ap, card("Little Lizard", "Creature — Lizard", "{R}", { power: "1", toughness: "1" }));
    let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(s, { targets: [tgt(t)] });
    return { s, t, ap, opp };
  };

  it("power 2 or less: you gain control of it until end of turn, untapped and with haste", () => {
    const { s, t, ap } = go(bear(), false);
    expect(controllerOf(s, s.objects[t]!)).toBe(ap);
    expect(s.objects[t]!.tapped).toBe(false);
    expect(objHasKeyword(s, s.objects[t]!, "Haste")).toBe(true);
  });

  it("a bigger creature only if you control another Lizard", () => {
    const big = () => card("Big Bear", "Creature — Bear", "{4}", { power: "5", toughness: "5" });
    const a = go(big(), false);
    expect(controllerOf(a.s, a.s.objects[a.t]!)).toBe(a.opp);
    expect(a.s.objects[a.t]!.tapped).toBe(true);
    const b = go(big(), true);
    expect(controllerOf(b.s, b.s.objects[b.t]!)).toBe(b.ap);
  });
});

describe("Chandra's Embercat and Volshe Tideturner", () => {
  /** Only the restricted mana from `src` to spend: every land tapped. */
  const only = (s: GameState, ap: PlayerId, src: ObjectId, mana: "R" | "U") => {
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && id !== src) s.objects[id]!.tapped = true;
    return act(s, { type: "activateMana", player: ap, objectId: src, mana });
  };

  it("Embercat's mana: an Elemental spell or a Chandra planeswalker spell, nothing else", () => {
    const elemental = card("Spark Elemental", "Creature — Elemental", "{R}", { power: "1", toughness: "1" });
    const chandra = card("Chandra, Test Pyromancer", "Legendary Planeswalker — Chandra", "{R}", { loyalty: "3", oracleText: "+1: You gain 1 life." });
    const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
    const { s: s0, ap, ids, opp } = setup([elemental, chandra, shock]);
    const cat = putOnBattlefield(s0, ap, chandras);
    const s = only(s0, ap, cat, "R");
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
    expect(planCast(s, ap, ids[1]!)).not.toBeNull();
    expect(planCast(s, ap, ids[2]!, [{ kind: "player", id: opp }])).toBeNull();
  });

  it("Volshe's mana: an instant or sorcery spell, or a kicked spell", () => {
    const opt = card("Opt", "Instant", "{U}", { oracleText: "Scry 1.\nDraw a card." });
    const kicked = card("Kicked Bird", "Creature — Bird", "{U}", { power: "1", toughness: "1", keywords: ["Kicker"], oracleText: "Kicker {0}\nFlying" });
    const { s: s0, ap, ids } = setup([opt, kicked]);
    const v = putOnBattlefield(s0, ap, volshe);
    const s = only(s0, ap, v, "U");
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
    expect(planCast(s, ap, ids[1]!)).toBeNull();
    expect(planCast(s, ap, ids[1]!, undefined, undefined, "auto", undefined, { kicks: [0] })).not.toBeNull();
  });
});

describe("Gunner Conscript", () => {
  it("dying enchanted and equipped makes two Junk tokens; neither makes none", () => {
    const { s: s0, ap, ids, opp } = setup([card("Murder", "Instant", "{B}", { oracleText: "Destroy target creature." }), card("Murder", "Instant", "{B}", { oracleText: "Destroy target creature." })]);
    const g = putOnBattlefield(s0, ap, gunner);
    const aura = putOnBattlefield(s0, ap, card("Plain Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature" }));
    const eq = putOnBattlefield(s0, ap, card("Plain Sword", "Artifact — Equipment", "{1}", { oracleText: "Equip {1}" }));
    s0.objects[aura]!.attachedTo = g;
    s0.objects[eq]!.attachedTo = g;
    invalidateCharacteristics(s0);
    expect(pt(s0, g)).toBe("4/4");
    const junk = (s: GameState) => s.battlefield.filter((id) => nameOf(s, id) === "Junk Token" && s.objects[id]!.controller === ap).length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(g)])));
    expect(zone(s, g)).toBe("graveyard");
    expect(junk(s)).toBe(2);
    const bare = putOnBattlefield(s, ap, gunner);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(bare)])));
    expect(zone(s, bare)).toBe("graveyard");
    expect(junk(s)).toBe(2);
    void opp;
  });
});

describe("Ennis, Debate Moderator", () => {
  it("flickers a creature until the next end step, then gets a +1/+1 counter as a card was exiled this turn", () => {
    const { s: s0, ap, ids } = setup([ennis]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(s, { targets: [tgt(b)] });
    expect(zone(s, b)).toBe("exile");
    const e = ids[0]!;
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.objects[e]!.counters["+1/+1"] ?? 0).toBe(1);
    expect(s.battlefield.some((id) => nameOf(s, id) === "Grizzly Bears")).toBe(true);
  });

  it("no counter if no card was exiled this turn; a token exiled isn't a card", () => {
    const { s: s0, ap, ids } = setup([ennis]);
    let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(s, { targets: [{ kind: "none" }] });
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Adventure Awaits", () => {
  it("a creature card from the top five into your hand; with none taken, draw a card", () => {
    for (const take of [true, false]) {
      const { s: s0, ap, ids } = setup([adventure]);
      const lib = s0.players[ap]!.library;
      const top = lib.slice(0, 5);
      const creature = top.find((id) => nameOf(s0, id) === "Grizzly Bears");
      let s = run(s0, planCast(s0, ap, ids[0]!));
      const hand = s.players[ap]!.hand.length;
      for (let i = 0; i < 30 && (s.stack.length || s.pending); i++) {
        const p = s.pending;
        if (p?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: p.player, found: take && creature ? [creature] : [] });
        else if (p) break;
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(s.pending).toBeNull();
      expect(s.players[ap]!.hand.length).toBe(hand + 1);
      if (take && creature) expect(zone(s, creature)).toBe("hand");
      else for (const id of top) expect(s.players[ap]!.hand).not.toContain(id);
    }
  });
});

describe("Demonic Bargain", () => {
  it("exiles the top thirteen cards, then you search the rest for a card to put into your hand", () => {
    const { s: s0, ap, ids } = setup([demonic]);
    const top = s0.players[ap]!.library.slice(0, 13);
    const left = s0.players[ap]!.library.length - 13;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary" && (s.stack.length || s.pending); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary" });
    for (const id of top) expect(zone(s, id)).toBe("exile");
    const pick = (s.pending as { cards: ObjectId[] }).cards[0]!;
    expect((s.pending as { cards: ObjectId[] }).cards).toHaveLength(left);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [pick] }));
    expect(zone(s, pick)).toBe("hand");
  });
});

describe("Sawblade Skinripper and Pyre-Sledge Arsonist", () => {
  it("Skinripper: at your end step, damage equal to the number of permanents you sacrificed this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const sk = putOnBattlefield(s0, ap, sawblade);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, card("Old Charm", "Enchantment", "{1}"));
    let s = s0;
    for (const victim of [a, b]) {
      s.players[ap]!.manaPool.C = 2;
      s = settle(run(s, planActivate(s, ap, sk, 0, undefined, undefined, undefined, undefined, { sacrifice: [victim] })));
    }
    expect(s.objects[sk]!.counters["+1/+1"]).toBe(2);
    s = passUntil(s, "end", ap);
    s = untilTargets(s);
    s = settle(s, { targets: [{ kind: "player", id: opp }] });
    expect(s.players[opp]!.life).toBe(38);
  });

  it("Skinripper: nothing if you sacrificed nothing", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, sawblade);
    const s = passUntil(s0, "end", ap);
    expect(s.pending?.kind).not.toBe("chooseTargets");
    expect(s.stack).toHaveLength(0);
  });

  it("Pyre-Sledge Arsonist: X is the number of permanents you've sacrificed this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, pyreSledge);
    s0.turnLog = { ...(s0.turnLog ?? {}), sacrificed: [{ player: ap, types: ["Creature"], subtypes: [] }, { player: ap, types: ["Artifact"], subtypes: [] }, { player: opp, types: ["Creature"], subtypes: [] }] };
    s0.players[ap]!.manaPool.C = 1;
    const s = settle(run(s0, planActivate(s0, ap, p, 0, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(38);
  });
});

describe("Rescue, Pepper Potts and Stockpiling Celebrant", () => {
  it("Rescue: returning an artifact puts a +1/+1 counter on Rescue; a creature that isn't one doesn't", () => {
    for (const artifact of [true, false]) {
      const { s: s0, ap, ids } = setup([rescue]);
      const t = putOnBattlefield(s0, ap, artifact ? card("Relic", "Artifact", "{1}") : bear());
      let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
      s = settle(s, { targets: [tgt(t)] });
      expect(zone(s, t)).toBe("hand");
      expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(artifact ? 1 : 0);
    }
  });

  it("Stockpiling Celebrant: you may return another nonland permanent you control; if you do, scry 2", () => {
    const { s: s0, ap, ids } = setup([stockpiling]);
    const relic = putOnBattlefield(s0, ap, card("Relic", "Artifact", "{1}"));
    let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(s, { targets: [tgt(relic)], may: true });
    expect(zone(s, relic)).toBe("hand");
    expect(s.pending).toMatchObject({ kind: "arrangeTop" });
  });
});

describe("Kroxa and Kunoros, Young Necromancer, Kishla Trawlers", () => {
  it("Kroxa and Kunoros: exiling five cards from your graveyard triggers the return of a creature card, targeted then", () => {
    const { s: s0, ap, ids } = setup([kroxa]);
    const dead = into(s0, ap, card("Dead Giant", "Creature — Giant", "{5}", { power: "6", toughness: "6" }), "graveyard");
    const junk = [1, 2, 3, 4, 5].map((n) => into(s0, ap, card(`Old Spell ${n}`, "Sorcery", "{1}"), "graveyard"));
    s0.players[ap]!.manaPool = { W: 1, U: 0, B: 1, R: 1, G: 0, C: 3 };
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 30 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
      else if (p?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: p.player, found: junk });
      else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [tgt(dead)] });
      else if (p) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toBeNull();
    for (const id of junk) expect(zone(s, id)).toBe("exile");
    expect(zone(s, dead)).toBe("battlefield");
  });

  it("Young Necromancer: without two cards in your graveyard to exile, nothing happens", () => {
    const { s: s0, ap, ids } = setup([young]);
    const dead = into(s0, ap, bear({ name: "Dead Bear" }), "graveyard");
    s0.players[ap]!.manaPool.B = 5;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), { targets: [tgt(dead)] });
    expect(zone(s, dead)).toBe("graveyard");
  });

  it("Kishla Trawlers: exile a creature card from your graveyard to return an instant or sorcery card", () => {
    const { s: s0, ap, ids } = setup([kishla]);
    const dead = into(s0, ap, bear({ name: "Dead Bear" }), "graveyard");
    const spell = into(s0, ap, card("Old Spell", "Instant", "{1}"), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 30 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
      else if (p?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: p.player, found: [dead] });
      else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [tgt(spell)] });
      else if (p) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, dead)).toBe("exile");
    expect(zone(s, spell)).toBe("hand");
  });
});

describe("Jace's Mindseeker", () => {
  it("target opponent mills five; you may cast an instant or sorcery spell from among them free", () => {
    const { s: s0, ap, ids, opp } = setup([jaces]);
    const draw = card("Divination", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw two cards." });
    const top = into(s0, opp, draw, "library");
    const old = into(s0, opp, card("Old Divination", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw two cards." }), "graveyard");
    let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(s, { targets: [{ kind: "player", id: opp }] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromHand" });
    const options = (s.pending as { options: string[] }).options;
    expect(options).toContain(top);
    expect(options).not.toContain(old);
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "chooseOption", player: ap, choice: top });
    expect(s.pending).toMatchObject({ kind: "castFree" });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: top } as Action));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(zone(s, top)).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(top);
  });
});

describe("Nissa's Triumph", () => {
  it("up to two basic Forests; with a Nissa planeswalker, up to three land cards instead", () => {
    for (const nissa of [false, true]) {
      const { s: s0, ap, ids } = setup([nissas]);
      if (nissa) putOnBattlefield(s0, ap, card("Nissa, Test Walker", "Legendary Planeswalker — Nissa", "{3}", { loyalty: "3" }));
      for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap && nameOf(s0, id) === "Nissa, Test Walker") s0.objects[id]!.counters.loyalty = 3;
      into(s0, ap, card("Odd Land", "Land"), "library");
      let s = run(s0, planCast(s0, ap, ids[0]!));
      for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary" && (s.stack.length || s.pending); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending).toMatchObject({ kind: "searchLibrary", max: nissa ? 3 : 2 });
      const cards = (s.pending as { cards: ObjectId[] }).cards;
      expect(cards.some((id) => nameOf(s, id) === "Odd Land")).toBe(nissa);
    }
  });
});

describe("Infernal Vessel", () => {
  it("dying while not a Demon, it returns with two +1/+1 counters as a Demon; dying again as a Demon, it stays dead", () => {
    const murder = card("Murder", "Instant", "{B}", { oracleText: "Destroy target creature." });
    const { s: s0, ap, ids } = setup([murder, murder]);
    const v = putOnBattlefield(s0, ap, infernal);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(v)])));
    expect(zone(s, v)).toBe("battlefield");
    expect(s.objects[v]!.counters["+1/+1"]).toBe(2);
    expect(characteristics(s, s.objects[v]!).subtypes).toContain("Demon");
    expect(pt(s, v)).toBe("4/3");
    s.players[ap]!.manaPool.B = 1;
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(v)])));
    expect(zone(s, v)).toBe("graveyard");
  });
});
