// Meld (CR 701.42, 712.4): one card of a meld pair exiles itself and its counterpart and puts them onto the battlefield
// as one melded permanent with the characteristics of their combined back face (712.8g), represented by both cards: if
// it leaves the battlefield, both go (712.21). Only the two cards of a pair meld; anything else stays in exile (701.42c).

import { describe, expect, it } from "vitest";
import { act, card, forest, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, compileCard, defMv, defOf, destroyPermanent, isFullySupported, parseManaCost, planActivate, planCast, planMana, registerMeldResults, waitingOn, type Action, type CardDef, type GameState } from "../src";

// Real oracle text (Scryfall), with the meld pairs as the card data has them.
const meld = (parts: string[], result: string) => ({ meld: { parts, result } });
const RATS = meld(["Graf Rats", "Midnight Scavengers"], "Chittering Host");
const grafRats = card("Graf Rats", "Creature — Rat", "{1}{B}", {
  power: "2",
  toughness: "1",
  cmc: 2,
  oracleText: "At the beginning of combat on your turn, if you both own and control this creature and a creature named Midnight Scavengers, exile them, then meld them into Chittering Host.",
  ...RATS,
});
const scavengers = card("Midnight Scavengers", "Creature — Human Rogue", "{4}{B}", {
  power: "3",
  toughness: "3",
  cmc: 5,
  oracleText: "When this creature enters, you may return target creature card with mana value 3 or less from your graveyard to your hand.\n(Melds with Graf Rats.)",
  ...RATS,
});
const host = card("Chittering Host", "Creature — Eldrazi Horror", "", {
  power: "5",
  toughness: "6",
  cmc: 7,
  colors: ["B"],
  keywords: ["Haste", "Menace"],
  oracleText: "Haste\nMenace (This creature can't be blocked except by two or more creatures.)\nWhen this creature enters, other creatures you control get +1/+0 and gain menace until end of turn.",
  ...RATS,
});
const HANWEIR = meld(["Hanweir Battlements", "Hanweir Garrison"], "Hanweir, the Writhing Township");
const battlements = card("Hanweir Battlements", "Land", "", {
  oracleText: "{T}: Add {C}.\n{R}, {T}: Target creature gains haste until end of turn.\n{3}{R}{R}, {T}: If you both own and control this land and a creature named Hanweir Garrison, exile them, then meld them into Hanweir, the Writhing Township.",
  ...HANWEIR,
});
const garrison = card("Hanweir Garrison", "Creature — Human Soldier", "{2}{R}", {
  power: "2",
  toughness: "3",
  cmc: 3,
  oracleText: "Whenever this creature attacks, create two 1/1 red Human creature tokens that are tapped and attacking.\n(Melds with Hanweir Battlements.)",
  ...HANWEIR,
});
const township = card("Hanweir, the Writhing Township", "Legendary Creature — Eldrazi Ooze", "", {
  power: "7",
  toughness: "4",
  cmc: 3,
  colors: ["R"],
  keywords: ["Trample", "Haste"],
  oracleText: "Trample, haste\nWhenever Hanweir attacks, create two 3/2 colorless Eldrazi Horror creature tokens that are tapped and attacking.",
  ...HANWEIR,
});
const MISHRA = meld(["Mishra, Claimed by Gix", "Phyrexian Dragon Engine"], "Mishra, Lost to Phyrexia");
const mishra = card("Mishra, Claimed by Gix", "Legendary Creature — Phyrexian Human Artificer", "{2}{B}{R}", {
  power: "3",
  toughness: "5",
  cmc: 4,
  oracleText:
    "Whenever you attack, each opponent loses X life and you gain X life, where X is the number of attacking creatures. If Mishra, Claimed by Gix and a creature named Phyrexian Dragon Engine are attacking, and you both own and control them, exile them, then meld them into Mishra, Lost to Phyrexia. It enters tapped and attacking.",
  ...MISHRA,
});
const engine = card("Phyrexian Dragon Engine", "Artifact Creature — Phyrexian Dragon", "{3}", {
  power: "2",
  toughness: "2",
  cmc: 3,
  keywords: ["Double strike", "Unearth"],
  oracleText: "Double strike\nWhen this creature enters from your graveyard, you may discard your hand. If you do, draw three cards.\nUnearth {3}{R}{R}\n(Melds with Mishra, Claimed by Gix.)",
  ...MISHRA,
});
const lost = card("Mishra, Lost to Phyrexia", "Legendary Artifact Creature — Phyrexian Artificer", "", {
  power: "9",
  toughness: "9",
  cmc: 7,
  colors: ["B", "R"],
  oracleText:
    "Whenever Mishra enters or attacks, choose three —\n• Target opponent discards two cards.\n• Mishra deals 3 damage to any target.\n• Destroy target artifact or planeswalker.\n• Creatures you control gain menace and trample until end of turn.\n• Creatures you don't control get -1/-1 until end of turn.\n• Create two tapped Powerstone tokens.",
  ...MISHRA,
});
const FF = meld(["Fang, Fearless l'Cie", "Vanille, Cheerful l'Cie"], "Ragnarok, Divine Deliverance");
const fang = card("Fang, Fearless l'Cie", "Legendary Creature — Human Warrior", "{2}{B}", {
  power: "2",
  toughness: "3",
  cmc: 3,
  oracleText: "Whenever one or more cards leave your graveyard, you draw a card and you lose 1 life. This ability triggers only once each turn.\n(Melds with Vanille, Cheerful l'Cie.)",
  ...FF,
});
const vanille = card("Vanille, Cheerful l'Cie", "Legendary Creature — Human Cleric", "{3}{G}", {
  power: "3",
  toughness: "2",
  cmc: 4,
  oracleText:
    "When Vanille enters, mill two cards, then return a permanent card from your graveyard to your hand.\nAt the beginning of your first main phase, if you both own and control Vanille and a creature named Fang, Fearless l'Cie, you may pay {3}{B}{G}. If you do, exile them, then meld them into Ragnarok, Divine Deliverance.",
  ...FF,
});
const ragnarok = card("Ragnarok, Divine Deliverance", "Legendary Creature — Beast Avatar", "", {
  power: "7",
  toughness: "6",
  cmc: 7,
  colors: ["B", "G"],
  keywords: ["Reach", "Vigilance", "Menace", "Trample", "Haste"],
  oracleText: "Reach, vigilance, menace, trample, haste\nWhen Ragnarok dies, destroy target permanent and return target nonlegendary permanent card from your graveyard to the battlefield.",
  ...FF,
});
const BG = meld(["Bruna, the Fading Light", "Gisela, the Broken Blade"], "Brisela, Voice of Nightmares");
const gisela = card("Gisela, the Broken Blade", "Legendary Creature — Angel Horror", "{2}{W}{W}", {
  power: "4",
  toughness: "3",
  cmc: 4,
  keywords: ["Flying", "First strike", "Lifelink"],
  oracleText: "Flying, first strike, lifelink\nAt the beginning of your end step, if you both own and control Gisela and a creature named Bruna, the Fading Light, exile them, then meld them into Brisela, Voice of Nightmares.",
  ...BG,
});
const bruna = card("Bruna, the Fading Light", "Legendary Creature — Angel Horror", "{5}{W}{W}", {
  power: "5",
  toughness: "7",
  cmc: 7,
  keywords: ["Flying", "Vigilance"],
  oracleText: "When you cast this spell, you may return target Angel or Human creature card from your graveyard to the battlefield.\nFlying, vigilance\n(Melds with Gisela, the Broken Blade.)",
  ...BG,
});
const brisela = card("Brisela, Voice of Nightmares", "Legendary Creature — Eldrazi Angel", "", {
  power: "9",
  toughness: "10",
  cmc: 11,
  colors: ["W"],
  keywords: ["Flying", "First strike", "Vigilance", "Lifelink"],
  oracleText: "Flying, first strike, vigilance, lifelink\nYour opponents can't cast spells with mana value 3 or less.",
  ...BG,
});
const AT = meld(["Argoth, Sanctum of Nature", "Titania, Voice of Gaea"], "Titania, Gaea Incarnate");
const argoth = card("Argoth, Sanctum of Nature", "Land", "", {
  oracleText: "This land enters tapped unless you control a legendary green creature.\n{T}: Add {G}.\n{2}{G}{G}, {T}: Create a 2/2 green Bear creature token, then mill three cards. Activate only as a sorcery.\n(Melds with Titania, Voice of Gaea.)",
  ...AT,
});
const titania = card("Titania, Voice of Gaea", "Legendary Creature — Elemental", "{1}{G}{G}", {
  power: "3",
  toughness: "4",
  cmc: 3,
  keywords: ["Reach"],
  oracleText:
    "Reach\nWhenever one or more land cards are put into your graveyard from anywhere, you gain 2 life.\nAt the beginning of your upkeep, if there are four or more land cards in your graveyard and you both own and control Titania, Voice of Gaea and a land named Argoth, Sanctum of Nature, exile them, then meld them into Titania, Gaea Incarnate.",
  ...AT,
});
const incarnate = card("Titania, Gaea Incarnate", "Legendary Creature — Elemental Avatar", "", {
  power: "*",
  toughness: "*",
  cmc: 3,
  colors: ["G"],
  keywords: ["Reach", "Vigilance", "Trample", "Haste"],
  oracleText:
    "Reach, vigilance, trample, haste\nTitania's power and toughness are each equal to the number of lands you control.\nWhen Titania enters, return all land cards from your graveyard to the battlefield tapped.\n{3}{G}: Put four +1/+1 counters on target land you control. It becomes a 0/0 Elemental creature with haste. It's still a land.",
  ...AT,
});
registerMeldResults([host, township, lost, ragnarok, brisela, incarnate]);
const shock = card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." });
const blaze = card("Blaze", "Sorcery", "{X}{R}", { cmc: 1, oracleText: "Blaze deals X damage to any target." });

const copier = card("Copy Test", "Sorcery", "{1}", { oracleText: "Create a token that's a copy of target permanent." });

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Pass priority with nothing on the stack until the step after this one. */
const nextStep = (s: GameState) => {
  const step = s.step;
  for (let i = 0; i < 8 && s.step === step && !s.pending && !s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const zoneOf = (s: GameState, id: string) => s.objects[id]!.zone;

describe("meld (CR 701.42, 712.4)", () => {
  it("supports the meld cards whose combined back face is supported, and never the back face itself", () => {
    for (const d of [grafRats, scavengers, battlements, garrison, mishra, fang, vanille, gisela, bruna, argoth, titania]) expect(isFullySupported(d), d.name).toBe(true);
    for (const d of [host, township, lost, ragnarok, brisela, incarnate]) expect(isFullySupported(d), d.name).toBe(false);
  });

  it("Graf Rats and Midnight Scavengers meld into Chittering Host at the beginning of combat: one object, both cards", () => {
    const { s: s0, ap } = setup([]);
    const rats = putOnBattlefield(s0, ap, grafRats);
    const scav = putOnBattlefield(s0, ap, scavengers);
    let s = settle(nextStep(s0));
    expect(s.step).toBe("beginCombat");
    const o = s.objects[rats]!;
    expect(zoneOf(s, rats)).toBe("battlefield");
    expect(defOf(s, o).name).toBe("Chittering Host");
    expect(zoneOf(s, scav)).toBe("merged");
    expect(s.battlefield.filter((id) => s.objects[id]!.owner === ap && defOf(s, s.objects[id]!).types.includes("Creature"))).toEqual([rats]);
    // Its mana value is its front faces' together (CR 202.3c), and it's a new object (rulings).
    expect(defMv(defOf(s, o))).toBe(7);
    // Its own enters trigger: "other creatures you control get +1/+0 and gain menace".
    s = settle(s);
    // It dies: one creature dies, two cards go to the graveyard (CR 712.21).
    destroyPermanent(s, s.objects[rats]!, "test");
    expect(s.players[ap]!.graveyard).toEqual(expect.arrayContaining([rats, scav]));
    expect(defOf(s, s.objects[rats]!).name).toBe("Graf Rats");
  });

  it("doesn't trigger without both, and a token copy of Midnight Scavengers can't meld: both stay exiled (CR 701.42c)", () => {
    const { s: s0, ap } = setup([copier]);
    const rats = putOnBattlefield(s0, ap, grafRats);
    let s = settle(nextStep(s0));
    expect(s.step).toBe("beginCombat");
    expect(defOf(s, s.objects[rats]!).name).toBe("Graf Rats");
    expect(JSON.stringify(s.log)).not.toMatch(/meld/);

    const { s: s1, ap: ap1, ids } = setup([copier]);
    const rats1 = putOnBattlefield(s1, ap1, grafRats);
    const scav = putOnBattlefield(s1, ap1, scavengers);
    s = s1;
    for (const a of planCast(s, ap1, ids[0]!, [{ kind: "object", id: scav }])!) s = act(s, a);
    s = settle(s);
    const token = s.battlefield.find((id) => s.objects[id]!.isToken && defOf(s, s.objects[id]!).name === "Midnight Scavengers")!;
    expect(token).toBeDefined();
    // Pick the token to meld with.
    s = settle(nextStep(s));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "meld", options: expect.arrayContaining([scav, token]) });
    s = act(s, { type: "pickPermanents", player: ap1, ids: [token] });
    s = settle(s);
    expect(zoneOf(s, rats1)).toBe("exile");
    expect(s.objects[token]).toBeUndefined();
    expect(zoneOf(s, scav)).toBe("battlefield");
    expect(JSON.stringify(s.log)).toMatch(/can't be melded/);
  });

  it("a bot melds the real card, not a token copy", () => {
    const { s: s0, ap, ids } = setup([copier]);
    const rats = putOnBattlefield(s0, ap, grafRats);
    const scav = putOnBattlefield(s0, ap, scavengers);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [{ kind: "object", id: scav }])!) s = act(s, a);
    s = settle(nextStep(settle(s)));
    expect(s.pending?.kind).toBe("pickPermanents");
    s = settle(act(s, botActions(s, ap)[0]!));
    expect(defOf(s, s.objects[rats]!).name).toBe("Chittering Host");
    expect(zoneOf(s, scav)).toBe("merged");
  });

  it("Hanweir Battlements melds with Hanweir Garrison as its ability resolves, untapped", () => {
    const { s: s0, ap } = setup([]);
    const land = putOnBattlefield(s0, ap, battlements);
    const garr = putOnBattlefield(s0, ap, garrison);
    const index = compileCard(battlements).activated.findIndex((a) => /meld/.test(a.body.text));
    expect(index).toBeGreaterThanOrEqual(0);
    const plan = planActivate(s0, ap, land, index);
    expect(plan).not.toBeNull();
    let s = s0;
    for (const a of plan!) s = act(s, a);
    s = settle(s);
    const o = s.objects[land]!;
    expect(defOf(s, o).name).toBe("Hanweir, the Writhing Township");
    expect(zoneOf(s, garr)).toBe("merged");
    expect(o.tapped).toBe(false);
    expect(defMv(defOf(s, o))).toBe(3);
  });

  it("a melded commander is its owner's commander (CR 903.3b)", () => {
    const { s: s0, ap } = setup([]);
    const rats = putOnBattlefield(s0, ap, grafRats);
    const scav = putOnBattlefield(s0, ap, scavengers, { commander: true });
    const s = settle(nextStep(s0));
    const o = s.objects[rats]!;
    expect(o.isCommander).toBe(true);
    expect(o.melded).toBeDefined();
    expect(zoneOf(s, scav)).toBe("merged");
  });

  it("a token copy of a melded permanent is a Chittering Host with mana value 0 (CR 202.3c)", () => {
    const { s: s0, ap, ids } = setup([copier]);
    putOnBattlefield(s0, ap, grafRats);
    putOnBattlefield(s0, ap, scavengers);
    let s = settle(nextStep(s0));
    const rats = s.battlefield.find((id) => defOf(s, s.objects[id]!).name === "Chittering Host")!;
    s = settle(s);
    // Back to a main phase to cast the copy.
    for (let i = 0; i < 40 && s.step !== "main2"; i++) s = s.pending?.kind === "declareAttackers" ? act(s, { type: "declareAttackers", player: ap, attacks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    for (const a of planCast(s, ap, ids[0]!, [{ kind: "object", id: rats }])!) s = act(s, a);
    s = settle(s);
    const copy = s.battlefield.find((id) => id !== rats && defOf(s, s.objects[id]!).name === "Chittering Host")!;
    expect(copy).toBeDefined();
    expect(s.objects[copy]!.isToken).toBe(true);
    expect(defMv(defOf(s, s.objects[copy]!))).toBe(0);
    expect(defMv(defOf(s, s.objects[rats]!))).toBe(7);
  });

  it("Mishra and Phyrexian Dragon Engine attacking meld into Mishra, Lost to Phyrexia, tapped and attacking whom you choose", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, mishra);
    const e = putOnBattlefield(s0, ap, engine);
    let s = s0;
    for (let i = 0; i < 10 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: m, defender: opp }, { attacker: e, defender: opp }] });
    const life = s.players[opp]!.life;
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attackWhom" });
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    s = act(s, { type: "chooseOption", player: ap, choice: String(other) });
    const o = s.objects[m]!;
    expect(defOf(s, o).name).toBe("Mishra, Lost to Phyrexia");
    expect(zoneOf(s, e)).toBe("merged");
    expect(o.tapped).toBe(true);
    expect(o.attacking).toBe(other);
    // It wasn't declared as an attacker, so its "enters or attacks" ability triggers once, for entering (rulings).
    expect(s.pending?.kind === "chooseModes" || s.stack.length + s.triggerQueue.length > 0).toBe(true);
  });

  it("only one of them attacking: Mishra doesn't meld", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, mishra);
    putOnBattlefield(s0, ap, engine);
    let s = s0;
    for (let i = 0; i < 10 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: m, defender: opp }] }));
    expect(defOf(s, s.objects[m]!).name).toBe("Mishra, Claimed by Gix");
    expect(s.objects[m]!.attacking).toBe(opp);
  });

  it("Vanille melds with Fang at the beginning of the first main phase if you pay {3}{B}{G}", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, vanille);
    const f = putOnBattlefield(s0, ap, fang);
    // To the next turn's first main phase of this player.
    let s = s0;
    for (let i = 0; i < 400 && !(s.activePlayer === ap && s.turn > s0.turn && s.pending?.kind === "chooseMay"); i++) {
      const p = s.pending;
      if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
      else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p && p.kind !== "chooseMay") s = act(s, botActions(s, waitingOn(s)!)[0]!);
      else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: false });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.step).toBe("main1");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    for (const a of planMana(s, ap, parseManaCost("{3}{B}{G}"))!) s = act(s, a);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(defOf(s, s.objects[v]!).name).toBe("Ragnarok, Divine Deliverance");
    expect(zoneOf(s, f)).toBe("merged");
  });

  it("Gisela and Bruna meld into Brisela at the end step; opponents can't cast spells with mana value 3 or less (X counts as chosen)", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, gisela);
    putOnBattlefield(s0, ap, bruna);
    const shockId = putOnBattlefield(s0, opp, shock);
    const blazeId = putOnBattlefield(s0, opp, blaze);
    for (const id of [shockId, blazeId]) {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "hand";
      s0.players[opp]!.hand.push(id);
    }
    let s = s0;
    for (let i = 0; i < 60 && !(s.step === "end" && s.stack.length === 0 && s.triggerQueue.length === 0 && defOf(s, s.objects[g]!).name !== "Gisela, the Broken Blade"); i++) {
      const p = s.pending;
      if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(defOf(s, s.objects[g]!).name).toBe("Brisela, Voice of Nightmares");
    expect(defMv(defOf(s, s.objects[g]!))).toBe(11);
    expect(castProblem(s, opp, shockId)).toMatch(/can't cast spells with mana value 3 or less/);
    expect(castProblem(s, opp, blazeId, [{ kind: "player", id: ap }], undefined, undefined, undefined, 2)).toMatch(/mana value 3 or less/);
    expect(castProblem(s, opp, blazeId, [{ kind: "player", id: ap }], undefined, undefined, undefined, 3) ?? "").not.toMatch(/mana value 3 or less/);
  });

  it("Titania and Argoth meld at the upkeep only with four or more land cards in the graveyard; the lands come back", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, titania);
    const a = putOnBattlefield(s0, ap, argoth);
    // Three land cards in the graveyard: no meld.
    const yard = [0, 1, 2, 3].map(() => {
      const id = putOnBattlefield(s0, ap, forest);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "graveyard";
      return id;
    });
    s0.players[ap]!.graveyard.push(...yard.slice(0, 3));
    const toUpkeep = (s: GameState) => {
      const turn = s.turn;
      for (let i = 0; i < 400 && !(s.step === "upkeep" && s.activePlayer === ap && s.turn > turn); i++) {
        const p = s.pending;
        if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
        else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
        else if (p) s = act(s, botActions(s, waitingOn(s)!)[0]!);
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      return settle(s);
    };
    let s = toUpkeep(s0);
    expect(defOf(s, s.objects[t]!).name).toBe("Titania, Voice of Gaea");
    s.players[ap]!.graveyard.push(yard[3]!);
    s = toUpkeep(s);
    for (let i = 0; i < 20 && (s.pending || s.stack.length); i++) s = s.pending ? act(s, botActions(s, waitingOn(s)!)[0]!) : settle(s);
    expect(defOf(s, s.objects[t]!).name).toBe("Titania, Gaea Incarnate");
    expect(zoneOf(s, a)).toBe("merged");
    // "Return all land cards from your graveyard to the battlefield tapped."
    for (const id of yard) expect([zoneOf(s, id), s.objects[id]!.tapped]).toEqual(["battlefield", true]);
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && defOf(s, s.objects[id]!).types.includes("Land")).length;
    expect(pt(s, t)).toBe(`${lands}/${lands}`);
  });

  it("Argoth enters tapped unless you control a legendary green creature", () => {
    const plain = setup([argoth]);
    let s = act(plain.s, { type: "playLand", player: plain.ap, objectId: plain.ids[0]! });
    expect(s.objects[plain.ids[0]!]!.tapped).toBe(true);
    const withTitania = setup([argoth]);
    putOnBattlefield(withTitania.s, withTitania.ap, titania);
    s = act(withTitania.s, { type: "playLand", player: withTitania.ap, objectId: withTitania.ids[0]! });
    expect(s.objects[withTitania.ids[0]!]!.tapped).toBe(false);
  });
});
