// Round 203: "you may exile an artifact or creature card from your hand. If you do, create a token that's a copy of the
// exiled card" (Nexus of Becoming), no activated abilities of cards in graveyards (Ashes of the Abhorrent), cards in
// graveyards that can't be targeted (Ground Seal, Underworld Cerberus), "target player other than ~'s owner" (Crown of
// Doom) and an X the ability sets itself (CR 107.3c: Prototype Portal, Soul Foundry).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, applyAction, castProblem, characteristics, controllerOf, definedX, invalidateCharacteristics, isFullySupported, legalTargets, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Only these cards in the hand: the seven drawn ones go back to the library. */
const handOnly = (s: GameState, pid: PlayerId, keep: ObjectId[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !keep.includes(x))) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = p.hand.filter((x) => keep.includes(x));
};
/** Everyone passes until the stack is empty, answering "you may" with `may` and a card pick with `pick`. */
const settle = (s: GameState, opts: { may?: boolean; pick?: ObjectId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: p.player, found: (opts.pick ?? []).filter((id) => p.cards.includes(id)) });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tokensOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid);
const nameOf = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;

// Real oracle text (Scryfall).
const nexusOfBecoming = card("Nexus of Becoming", "Artifact", "{6}", {"cmc": 6, "keywords": [], "oracleText": "At the beginning of combat on your turn, draw a card. Then you may exile an artifact or creature card from your hand. If you do, create a token that's a copy of the exiled card, except it's a 3/3 Golem artifact creature in addition to its other types.", "colors": [], "colorIdentity": [], "layout": "normal"});
const ashesOfTheAbhorrent = card("Ashes of the Abhorrent", "Enchantment", "{1}{W}", {"cmc": 2, "keywords": [], "oracleText": "Players can't cast spells from graveyards or activate abilities of cards in graveyards.\nWhenever a creature dies, you gain 1 life.", "colors": ["W"], "colorIdentity": ["W"], "layout": "normal"});
const groundSeal = card("Ground Seal", "Enchantment", "{1}{G}", {"cmc": 2, "keywords": [], "oracleText": "When this enchantment enters, draw a card.\nCards in graveyards can't be the targets of spells or abilities.", "colors": ["G"], "colorIdentity": ["G"], "layout": "normal"});
const crownOfDoom = card("Crown of Doom", "Artifact", "{3}", {"cmc": 3, "keywords": [], "oracleText": "Whenever a creature attacks you or a planeswalker you control, it gets +2/+0 until end of turn.\n{2}: Target player other than this artifact's owner gains control of it. Activate only during your turn.", "colors": [], "colorIdentity": [], "layout": "normal"});
const prototypePortal = card("Prototype Portal", "Artifact", "{4}", {"cmc": 4, "keywords": ["Imprint"], "oracleText": "Imprint — When this artifact enters, you may exile an artifact card from your hand.\n{X}, {T}: Create a token that's a copy of the exiled card. X is the mana value of that card.", "colors": [], "colorIdentity": [], "layout": "normal"});
const soulFoundry = card("Soul Foundry", "Artifact", "{4}", {"cmc": 4, "keywords": ["Imprint"], "oracleText": "Imprint — When this artifact enters, you may exile a creature card from your hand.\n{X}, {T}: Create a token that's a copy of the exiled card. X is the mana value of that card.", "colors": [], "colorIdentity": [], "layout": "normal"});
const grizzlyBears = card("Grizzly Bears", "Creature — Bear", "{1}{G}", {"cmc": 2, "power": "2", "toughness": "2", "keywords": [], "oracleText": "", "colors": ["G"], "colorIdentity": ["G"], "layout": "normal"});
const raiseDead = card("Raise Dead", "Sorcery", "{B}", {"cmc": 1, "keywords": [], "oracleText": "Return target creature card from your graveyard to your hand.", "colors": ["B"], "colorIdentity": ["B"], "layout": "normal"});
const dregscapeZombie = card("Dregscape Zombie", "Creature — Zombie", "{1}{B}", {"cmc": 2, "power": "2", "toughness": "1", "keywords": ["Unearth"], "oracleText": "Unearth {B} ({B}: Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.)", "colors": ["B"], "colorIdentity": ["B"], "layout": "normal"});
const thinkTwice = card("Think Twice", "Instant", "{1}{U}", {"cmc": 2, "keywords": ["Flashback"], "oracleText": "Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)", "colors": ["U"], "colorIdentity": ["U"], "layout": "normal"});
const chaliceOfTheVoid = card("Chalice of the Void", "Artifact", "{X}{X}", {"cmc": 0, "keywords": [], "oracleText": "This artifact enters with X charge counters on it.\nWhenever a player casts a spell with mana value equal to the number of charge counters on this artifact, counter that spell.", "colors": [], "colorIdentity": [], "layout": "normal"});
const llanowarElves = card("Llanowar Elves", "Creature — Elf Druid", "{G}", {"cmc": 1, "power": "1", "toughness": "1", "keywords": [], "oracleText": "{T}: Add {G}.", "colors": ["G"], "colorIdentity": ["G"], "layout": "normal"});
const ornithopter = card("Ornithopter", "Artifact Creature — Thopter", "{0}", {"cmc": 0, "power": "0", "toughness": "2", "keywords": ["Flying"], "oracleText": "Flying", "colors": [], "colorIdentity": [], "layout": "normal"});
const wayfarerSBauble = card("Wayfarer's Bauble", "Artifact", "{1}", {"cmc": 1, "keywords": [], "oracleText": "{2}, {T}, Sacrifice this artifact: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.", "colors": [], "colorIdentity": [], "layout": "normal"});
const underworldCerberus = card("Underworld Cerberus", "Creature — Dog", "{3}{B}{R}", {"cmc": 5, "power": "6", "toughness": "6", "keywords": [], "oracleText": "This creature can't be blocked except by three or more creatures.\nCards in graveyards can't be the targets of spells or abilities.\nWhen this creature dies, exile it and each player returns all creature cards from their graveyard to their hand.", "colors": ["B", "R"], "colorIdentity": ["B", "R"], "layout": "normal"});

describe("round 203: graveyards, imprint and an X the ability sets", () => {
  it("compile", () => supported(nexusOfBecoming, ashesOfTheAbhorrent, groundSeal, underworldCerberus, crownOfDoom, prototypePortal, soulFoundry));

  it("Nexus of Becoming: draw, then exile an artifact or creature card from your hand for a 3/3 Golem artifact creature copy", () => {
    const { s: s0, ap, ids } = setup([grizzlyBears, raiseDead]);
    handOnly(s0, ap, ids);
    putOnBattlefield(s0, ap, nexusOfBecoming);
    const [bears, sorcery] = ids as [ObjectId, ObjectId];
    // On to the beginning of combat: the trigger draws a card, then asks.
    let s = act(s0, { type: "passPriority", player: ap });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("beginCombat");
    expect(s.players[ap]!.hand.length).toBe(3);
    s = settle(s, { may: true, pick: [bears] });
    expect(s.objects[bears]!.zone).toBe("exile");
    expect(s.objects[sorcery]!.zone).toBe("hand");
    const [token] = tokensOf(s, ap);
    expect(token).toBeDefined();
    const c = characteristics(s, s.objects[token!]!);
    expect(c.name).toBe("Grizzly Bears");
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Bear", "Golem"]));
    expect(`${power(s, s.objects[token!]!)}/${toughness(s, s.objects[token!]!)}`).toBe("3/3");
  });

  it("Nexus of Becoming: no card exiled, no token; a sorcery can't be picked", () => {
    const { s: s0, ap, ids } = setup([raiseDead]);
    handOnly(s0, ap, ids);
    putOnBattlefield(s0, ap, nexusOfBecoming);
    let s = act(s0, { type: "passPriority", player: ap });
    for (let i = 0; i < 20 && (s.stack.length || s.pending || s.triggerQueue.length) === 0 && s.step !== "beginCombat"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(s, { may: true, pick: [ids[0]!] });
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
    expect(tokensOf(s, ap)).toEqual([]);
  });

  it("Ashes of the Abhorrent: no spells from graveyards, no abilities of cards there; lands and triggers are fine", () => {
    const { s, ap } = setup([]);
    const zombie = into(s, ap, dregscapeZombie, "graveyard");
    const twice = into(s, ap, thinkTwice, "graveyard");
    // Without it: unearth and flashback both work.
    expect(planActivate(s, ap, zombie, 0)).not.toBeNull();
    expect(planCast(s, ap, twice, undefined, undefined, undefined, undefined, { via: "flashback" })).not.toBeNull();
    putOnBattlefield(s, ap, ashesOfTheAbhorrent);
    invalidateCharacteristics(s);
    expect(abilityProblem(s, ap, zombie, 0)).toMatch(/can't activate abilities of cards in graveyards/);
    expect(planActivate(s, ap, zombie, 0)).toBeNull();
    expect(planCast(s, ap, twice, undefined, undefined, undefined, undefined, { via: "flashback" })).toBeNull();
    expect(castProblem(s, ap, twice, undefined, undefined, undefined, undefined, undefined, { via: "flashback" })).toMatch(/can't cast spells from graveyards/);
    // "Whenever a creature dies, you gain 1 life."
    const life = s.players[ap]!.life;
    const bear = putOnBattlefield(s, ap, grizzlyBears);
    s.objects[bear]!.damage = 2;
    const after = settle(act(s, { type: "passPriority", player: ap }));
    expect(after.objects[bear]!.zone).toBe("graveyard");
    expect(after.players[ap]!.life).toBe(life + 1);
  });

  it("Ground Seal: cards in graveyards can't be targeted; it draws a card as it enters", () => {
    const { s: s0, ap, ids } = setup([raiseDead, groundSeal]);
    const dead = into(s0, ap, grizzlyBears, "graveyard");
    expect(legalTargets(s0, { kind: "card", types: ["Creature"], owner: "you", text: "creature card" }, ap).map((t) => t.kind === "object" && t.id)).toContain(dead);
    let s = settle(run(s0, planCast(s0, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(s0.players[ap]!.hand.length);
    expect(planCast(s, ap, ids[0]!, [tgt(dead)])).toBeNull();
    expect(legalTargets(s, { kind: "card", types: ["Creature"], owner: "you", text: "creature card" }, ap)).toEqual([]);
  });

  it("Crown of Doom: given to a player other than its owner, who can't give it back", () => {
    const { s: s0, ap, opp } = setup([]);
    const crown = putOnBattlefield(s0, ap, crownOfDoom);
    // Not its owner (CR 108.3).
    expect(planActivate(s0, ap, crown, 0, [{ kind: "player", id: ap }])).toBeNull();
    let s = settle(run(s0, planActivate(s0, ap, crown, 0, [{ kind: "player", id: opp }])));
    expect(controllerOf(s, s.objects[crown]!)).toBe(opp);
    // The new controller can't hand it back to its owner (rulings): only the other two are legal.
    const players = legalTargets(s, { kind: "player", notSourceOwner: true, text: "target player other than ~'s owner" }, opp, undefined, undefined, crown).map((t) => t.id);
    expect(players).not.toContain(ap);
    expect(players).toContain(opp);
    // Only during its controller's turn.
    expect(abilityProblem(s, opp, crown, 0)).toBeTruthy();
  });

  it("Prototype Portal: X is the exiled card's mana value, not chosen; with nothing exiled it can't be activated", () => {
    const { s: s0, ap, ids } = setup([wayfarerSBauble, prototypePortal]);
    handOnly(s0, ap, ids);
    const [bauble, portal] = ids as [ObjectId, ObjectId];
    let s = settle(run(s0, planCast(s0, ap, portal)), { may: true, pick: [bauble] });
    expect(s.objects[bauble]!.zone).toBe("exile");
    expect(definedX(s, s.objects[portal]!, abilitiesOf(s, s.objects[portal]!).activated[0]!)).toBe(1);
    expect(abilityProblem(s, ap, portal, 0, undefined, undefined, undefined, 3)).toMatch(/X is 1/);
    s = settle(run(s, planActivate(s, ap, portal, 0)));
    const tokens = tokensOf(s, ap);
    expect(tokens.map((id) => nameOf(s, id))).toEqual(["Wayfarer's Bauble"]);
    expect(s.objects[portal]!.tapped).toBe(true);
  });

  it("Prototype Portal with no card exiled: X isn't defined, so the ability can't be activated (rulings)", () => {
    const { s: s0, ap, ids } = setup([prototypePortal]);
    handOnly(s0, ap, ids);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(definedX(s, s.objects[ids[0]!]!, abilitiesOf(s, s.objects[ids[0]!]!).activated[0]!)).toBeNull();
    expect(abilityProblem(s, ap, ids[0]!, 0)).toMatch(/X isn't defined/);
    expect(planActivate(s, ap, ids[0]!, 0)).toBeNull();
  });

  it("Soul Foundry: a creature card imprinted; X 0 for a mana value 0 card (CR 107.3g)", () => {
    const { s: s0, ap, ids } = setup([llanowarElves, soulFoundry]);
    handOnly(s0, ap, ids);
    const [elves, foundry] = ids as [ObjectId, ObjectId];
    let s = settle(run(s0, planCast(s0, ap, foundry)), { may: true, pick: [elves] });
    expect(s.objects[elves]!.zone).toBe("exile");
    s = settle(run(s, planActivate(s, ap, foundry, 0)));
    expect(tokensOf(s, ap).map((id) => nameOf(s, id))).toEqual(["Llanowar Elves"]);
    // Chalice of the Void in exile has mana value 0 (CR 107.3g): X is 0.
    const { s: t0, ap: bp, ids: bids } = setup([chaliceOfTheVoid, prototypePortal]);
    handOnly(t0, bp, bids);
    const t = settle(run(t0, planCast(t0, bp, bids[1]!)), { may: true, pick: [bids[0]!] });
    expect(definedX(t, t.objects[bids[1]!]!, abilitiesOf(t, t.objects[bids[1]!]!).activated[0]!)).toBe(0);
    expect(planActivate(t, bp, bids[1]!, 0)).not.toBeNull();
  });

  it("Underworld Cerberus: graveyard cards can't be targeted; when it dies it's exiled and creature cards go back to hands", () => {
    const { s: s0, ap, opp, ids } = setup([raiseDead]);
    const cerberus = putOnBattlefield(s0, ap, underworldCerberus);
    const mine = into(s0, ap, grizzlyBears, "graveyard");
    const theirs = into(s0, opp, llanowarElves, "graveyard");
    const spell = into(s0, opp, thinkTwice, "graveyard");
    expect(planCast(s0, ap, ids[0]!, [tgt(mine)])).toBeNull();
    s0.objects[cerberus]!.damage = 6;
    const s = settle(act(s0, { type: "passPriority", player: ap }));
    expect(s.objects[cerberus]!.zone).toBe("exile");
    expect(s.objects[mine]!.zone).toBe("hand");
    expect(s.objects[theirs]!.zone).toBe("hand");
    expect(s.players[opp]!.hand).toContain(theirs);
    expect(s.objects[spell]!.zone).toBe("graveyard");
  });
});
