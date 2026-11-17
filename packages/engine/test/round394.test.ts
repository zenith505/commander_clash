// Round 394 (Lane A): tokens an opponent would create made under your control instead, before every other token
// replacement (Crafty Cutpurse, CR 616.1b), one of the attacking creatures that died at once returned tapped with a flying
// counter once each turn (Rinoa, Angel Wing), and Curses returned attached to you and moved to an opponent (Lynde,
// Cheerful Tormentor).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";
import { createToken } from "../src/effects/run-tokens";

// Real card data (Scryfall).
const rinoa = (): CardDef => ({"oracleId":"47b29cf9-8ef3-4b6a-a9a3-3ab822c5dea4","name":"Rinoa, Angel Wing","manaCost":"{2}{W}","cmc":3,"typeLine":"Legendary Creature — Human Rebel Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Rebel","Warlock"],"oracleText":"At the beginning of combat on your turn, creatures you control with flying get +1/+1 and gain vigilance until end of turn.\nWhenever one or more attacking creatures you control die, you may return one of them to the battlefield tapped under its owner's control with a flying counter on it. Do this only once each turn.","power":"2","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/76a9b08e-53f7-48d7-a024-3e2bf2318391.jpg?1783904654","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/76a9b08e-53f7-48d7-a024-3e2bf2318391.jpg?1783904654","commanderLegal":"legal","set":"fic","releasedAt":"2025-12-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const cutpurse = (): CardDef => ({"oracleId":"2ef53e18-0baf-4eee-b671-4c19b464cbfb","name":"Crafty Cutpurse","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Human Pirate","supertypes":[],"types":["Creature"],"subtypes":["Human","Pirate"],"oracleText":"Flash\nWhen this creature enters, each token that would be created under an opponent's control this turn is created under your control instead.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/a/c/ac6afc4c-3c41-44e8-ad8c-186c277267a1.jpg?1783935328","artUrl":"https://cards.scryfall.io/art_crop/front/a/c/ac6afc4c-3c41-44e8-ad8c-186c277267a1.jpg?1783935328","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lynde = (): CardDef => ({"oracleId":"dc386f6c-bd4a-462a-8d42-0e7a552a4f17","name":"Lynde, Cheerful Tormentor","manaCost":"{1}{U}{B}{R}","cmc":4,"typeLine":"Legendary Creature — Human Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"Deathtouch\nWhenever a Curse is put into your graveyard from the battlefield, return it to the battlefield attached to you at the beginning of the next end step.\nAt the beginning of your upkeep, you may attach a Curse attached to you to one of your opponents. If you do, draw two cards.","power":"2","toughness":"4","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":["Deathtouch"],"imageUrl":"https://cards.scryfall.io/normal/front/4/d/4df484de-4d9b-4a4b-9d10-df993e36f1a8.jpg?1783925369","artUrl":"https://cards.scryfall.io/art_crop/front/4/d/4df484de-4d9b-4a4b-9d10-df993e36f1a8.jpg?1783925369","commanderLegal":"legal","set":"mic","releasedAt":"2021-09-24","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const beastWithin = (): CardDef => ({"oracleId":"7735eeba-693b-47e2-bd51-414379cf1016","name":"Beast Within","manaCost":"{2}{G}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target permanent. Its controller creates a 3/3 green Beast creature token.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/400b43aa-c1d2-4435-b863-061f43889422.jpg?1783903232","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/400b43aa-c1d2-4435-b863-061f43889422.jpg?1783903232","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const cannonade = (): CardDef => ({"oracleId":"7e108b31-2ea3-4129-b324-a2d31c78bbe6","name":"Fiery Cannonade","manaCost":"{2}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fiery Cannonade deals 2 damage to each non-Pirate creature.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/6/664d21c9-4b6c-4797-845f-7bca79c2b76b.jpg?1783935745","artUrl":"https://cards.scryfall.io/art_crop/front/6/6/664d21c9-4b6c-4797-845f-7bca79c2b76b.jpg?1783935745","commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const naturalize = (): CardDef => ({"oracleId":"bdb3ca68-ec1f-4e16-81cc-d23f8f52c728","name":"Naturalize","manaCost":"{1}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact or enchantment.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c187d05-0df4-48b6-8e75-690e725b8bcf.jpg?1783935285","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c187d05-0df4-48b6-8e75-690e725b8bcf.jpg?1783935285","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const alarm = (): CardDef => ({"oracleId":"5b2364d7-a811-4595-a1b4-224c70555ffa","name":"Raise the Alarm","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Create two 1/1 white Soldier creature tokens.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81d3e5c5-6531-48e7-9dd6-2db519dd61b1.jpg?1783908838","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81d3e5c5-6531-48e7-9dd6-2db519dd61b1.jpg?1783908838","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const procession = (): CardDef => ({"oracleId":"7246d45b-2185-4cdd-981b-5419b7d52bce","name":"Anointed Procession","manaCost":"{3}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9a52c265-6920-4929-ba0a-70da08df01f1.jpg?1783936544","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9a52c265-6920-4929-ba0a-70da08df01f1.jpg?1783936544","commanderLegal":"legal","set":"akh","releasedAt":"2017-04-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const piercedHeart = (): CardDef => ({"oracleId":"f22c3624-6bd5-4761-b8ad-ac301ad9351c","name":"Curse of the Pierced Heart","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nAt the beginning of enchanted player's upkeep, this Aura deals 1 damage to that player or a planeswalker that player controls.","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/7/1/71010182-c004-4d18-adab-80319cd1e625.jpg?1783940940","artUrl":"https://cards.scryfall.io/art_crop/front/7/1/71010182-c004-4d18-adab-80319cd1e625.jpg?1783940940","commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const opulence = (): CardDef => ({"oracleId":"ba0d3df2-3acf-46d7-8d64-8d67d1579adc","name":"Curse of Opulence","manaCost":"{R}","cmc":1,"typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nWhenever enchanted player is attacked, create a Gold token. Each opponent attacking that player does the same. (A Gold token is an artifact with \"Sacrifice this token: Add one mana of any color.\")","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/e/2/e23db9d3-d11f-4b2c-8349-687bc0e9d4c2.jpg?1783935943","artUrl":"https://cards.scryfall.io/art_crop/front/e/2/e23db9d3-d11f-4b2c-8349-687bc0e9d4c2.jpg?1783935943","commanderLegal":"legal","set":"c17","releasedAt":"2017-08-25","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions are answered as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tokensOf = (s: GameState, pid: PlayerId, name: string) => s.battlefield.map((id) => s.objects[id]!).filter((o) => o.isToken && controllerOf(s, o) === pid && characteristics(s, o).name === name);
const bearsOf = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.cardId === bear().oracleId);

describe("round 394: compiles", () => {
  it("every card of the round is fully supported", () => {
    for (const d of [rinoa(), cutpurse(), lynde()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

/** `ap` casts Crafty Cutpurse and lets its enters trigger resolve. */
const withCutpurse = (s0: GameState, ap: PlayerId, id: ObjectId) => settle(run(s0, planCast(s0, ap, id)), ap);

describe("Crafty Cutpurse", () => {
  it("a token an opponent would create this turn is created under your control instead: you create it and own it", () => {
    const { s: s0, ap, ids, opp } = setup([cutpurse(), beastWithin()]);
    const forest = putOnBattlefield(s0, opp, bear());
    let s = withCutpurse(s0, ap, ids[0]!);
    expect(s.turnLog?.tokenSteals).toEqual([{ player: ap, source: "Crafty Cutpurse" }]);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: forest }])), ap);
    expect(tokensOf(s, opp, "Beast Token")).toHaveLength(0);
    const beasts = tokensOf(s, ap, "Beast Token");
    expect(beasts).toHaveLength(1);
    expect(beasts[0]!.owner).toBe(ap);
  });

  it("applies before token doublers: the opponent's Anointed Procession doesn't double it, yours does (CR 616.1b, rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([cutpurse(), beastWithin(), beastWithin()]);
    putOnBattlefield(s0, opp, procession());
    const targets = [putOnBattlefield(s0, opp, bear()), putOnBattlefield(s0, opp, bear())];
    let s = withCutpurse(s0, ap, ids[0]!);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: targets[0]! }])), ap);
    expect(tokensOf(s, ap, "Beast Token")).toHaveLength(1);
    expect(tokensOf(s, opp, "Beast Token")).toHaveLength(0);
    putOnBattlefield(s, ap, procession());
    s = settle(run(s, planCast(s, ap, ids[2]!, [{ kind: "object", id: targets[1]! }])), ap);
    expect(tokensOf(s, ap, "Beast Token")).toHaveLength(3);
  });

  it("your own tokens aren't affected, and the effect ends with the turn", () => {
    const { s: s0, ap, ids, opp } = setup([cutpurse(), alarm(), beastWithin()]);
    const forest = putOnBattlefield(s0, opp, bear());
    let s = withCutpurse(s0, ap, ids[0]!);
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    expect(tokensOf(s, ap, "Soldier Token")).toHaveLength(2);
    // The next turn (the opponent's): Beast Within at instant speed, the opponent gets their own Beast.
    s = passUntil(s, "main1", opp);
    expect(s.turnLog?.tokenSteals).toBeUndefined();
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(waitingOn(s)).toBe(ap);
    expect(s.step).toBe("main1");
    s = settle(run(s, planCast(s, ap, ids[2]!, [{ kind: "object", id: forest }])), ap);
    expect(tokensOf(s, opp, "Beast Token")).toHaveLength(1);
    expect(tokensOf(s, ap, "Beast Token")).toHaveLength(0);
  });

  it("with two players' effects, the would-be controller chooses which applies first, and the other then takes them back (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([cutpurse(), beastWithin()]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const forest = putOnBattlefield(s0, third, bear());
    let s = withCutpurse(s0, ap, ids[0]!);
    // The opponent's own Crafty Cutpurse resolved this turn too.
    s.turnLog!.tokenSteals!.push({ player: opp, source: "Crafty Cutpurse" });
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: forest }])), third);
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what === "tokenInstead" && p.player === third).toBe(true);
    if (p?.kind !== "chooseOption") return;
    expect(p.options).toEqual(["0", "1"]);
    expect(p.labels?.[0]).toContain(`under ${s.players[opp]!.name}'s control`);
    // The third player applies your effect first: then the opponent's applies (you're their opponent), and they keep it.
    s = settle(act(s, { type: "chooseOption", player: third, choice: "0" }), third);
    expect(tokensOf(s, opp, "Beast Token")).toHaveLength(1);
    expect(tokensOf(s, ap, "Beast Token")).toHaveLength(0);
    expect(tokensOf(s, third, "Beast Token")).toHaveLength(0);
  });

  it("a token created attacking under a player who isn't attacking is created but isn't attacking (CR 506.3b, rulings)", () => {
    const { s, ap, opp } = setup([]);
    s.step = "declareAttackers";
    const spec = { name: "Soldier", power: 1, toughness: 1, colors: ["W" as const], types: ["Creature"], subtypes: ["Soldier"], keywords: [] };
    const mine = createToken(s, ap, spec, { tapped: true, attacking: opp });
    const theirs = createToken(s, opp, spec, { tapped: true, attacking: ap });
    expect(mine.attacking).toBe(opp);
    expect(theirs.attacking).toBeUndefined();
    expect(theirs.tapped).toBe(true);
  });
});

/** Declares `attackers` against `opp`, then lets the bots block nothing. */
const attackWith = (s0: GameState, ap: PlayerId, opp: PlayerId, attackers: ObjectId[]) => {
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((a) => ({ attacker: a, defender: opp })) });
  return settle(s, ap);
};

describe("Rinoa, Angel Wing", () => {
  it("attacking creatures that die at once: you may return one of them tapped with a flying counter; not one that wasn't attacking", () => {
    const { s: s0, ap, ids, opp } = setup([cannonade()]);
    const r = putOnBattlefield(s0, ap, rinoa());
    const [a, b, home] = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear())];
    let s = attackWith(s0, ap, opp, [r, a, b]);
    expect(s.objects[a]!.attacking).toBe(opp);
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    const p = s.pending;
    expect(p?.kind === "searchLibrary" && p.player === ap && p.min === 0 && p.max === 1).toBe(true);
    if (p?.kind !== "searchLibrary") return;
    expect([...p.cards].sort()).toEqual([a, b].sort());
    expect(p.cards).not.toContain(home);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [a] }), ap);
    const back = s.objects[a]!;
    expect(back.zone).toBe("battlefield");
    expect(back.tapped).toBe(true);
    expect(back.counters.flying).toBe(1);
    expect(back.attacking).toBeUndefined();
    expect(objHasKeyword(s, back, "Flying")).toBe(true);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[home]!.zone).toBe("graveyard");
  });

  it("only once each turn: after returning one, it doesn't trigger again; declining doesn't use it up", () => {
    const { s: s0, ap, ids, opp } = setup([cannonade(), cannonade(), cannonade()]);
    const r = putOnBattlefield(s0, ap, rinoa());
    const bs = [0, 1, 2].map(() => putOnBattlefield(s0, ap, bear()));
    let s = attackWith(s0, ap, opp, [r, ...bs]);
    // The first: declined.
    s.objects[bs[1]!]!.counters["+1/+1"] = 2;
    s.objects[bs[2]!]!.counters["+1/+1"] = 4;
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }), ap);
    expect(s.objects[bs[0]!]!.zone).toBe("graveyard");
    // The second: returned.
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    const p = s.pending;
    expect(p?.kind === "searchLibrary" && p.cards.includes(bs[1]!)).toBe(true);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [bs[1]!] }), ap);
    expect(s.objects[bs[1]!]!.zone).toBe("battlefield");
    // The third: Rinoa (2/4) has taken 6 now, so Rinoa and the last bear die; no trigger this turn.
    s = settle(run(s, planCast(s, ap, ids[2]!)), ap);
    expect(s.pending).toBeNull();
    expect(s.objects[bs[2]!]!.zone).toBe("graveyard");
    expect(s.objects[r]!.zone).toBe("graveyard");
  });

  it("returns a creature you controlled but didn't own under its owner's control, and Rinoa can return itself", () => {
    const { s: s0, ap, ids, opp } = setup([cannonade()]);
    const r = putOnBattlefield(s0, ap, rinoa());
    const theirs = putOnBattlefield(s0, opp, bear());
    s0.objects[theirs]!.controller = ap;
    invalidateCharacteristics(s0);
    s0.objects[r]!.damage = 2;
    let s = attackWith(s0, ap, s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!, [r, theirs]);
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    const p = s.pending;
    expect(p?.kind === "searchLibrary" && [...p.cards].sort().join() === [r, theirs].sort().join()).toBe(true);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirs] }), ap);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
    expect(s.objects[theirs]!.counters.flying).toBe(1);
  });

  it("attacking tokens that die leave nothing to return: no question", () => {
    const { s: s0, ap, ids, opp } = setup([cannonade()]);
    putOnBattlefield(s0, ap, rinoa());
    const t = putOnBattlefield(s0, ap, bear());
    s0.objects[t]!.isToken = true;
    let s = attackWith(s0, ap, opp, [t]);
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    expect(s.pending).toBeNull();
    expect(s.objects[t]?.zone ?? "gone").not.toBe("battlefield");
  });

  it("a bot returns its own best card", () => {
    const { s: s0, ap, ids, opp } = setup([cannonade()]);
    const r = putOnBattlefield(s0, ap, rinoa());
    const a = putOnBattlefield(s0, ap, bear());
    let s = attackWith(s0, ap, opp, [r, a]);
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    expect(s.pending?.kind).toBe("searchLibrary");
    for (const x of botActions(s, ap)) s = act(s, x);
    s = settle(s, ap);
    expect(s.objects[a]!.zone).toBe("battlefield");
  });
});

describe("Lynde, Cheerful Tormentor", () => {
  it("a Curse you own put into your graveyard returns attached to you at the beginning of the next end step; one you don't own doesn't", () => {
    const { s: s0, ap, ids, opp } = setup([naturalize(), naturalize()]);
    putOnBattlefield(s0, ap, lynde());
    const mine = putOnBattlefield(s0, ap, piercedHeart());
    s0.objects[mine]!.attachedToPlayer = opp;
    const theirs = putOnBattlefield(s0, opp, opulence());
    s0.objects[theirs]!.attachedToPlayer = ap;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: mine }])), ap);
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: theirs }])), ap);
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    s = passUntil(s, "cleanup", ap);
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[mine]!.attachedToPlayer).toBe(ap);
    expect(controllerOf(s, s.objects[mine]!)).toBe(ap);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("at your upkeep you may attach a Curse attached to you to an opponent, any Curse; if you do, draw two cards", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, lynde());
    const theirs = putOnBattlefield(s0, opp, opulence());
    s0.objects[theirs]!.attachedToPlayer = ap;
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "upkeep", ap);
    // Wait for the trigger's question.
    s = settle(s, ap);
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what === "curseMove" && p.player === ap).toBe(true);
    if (p?.kind !== "chooseOption") return;
    const others = s.turnOrder.filter((q) => q !== ap);
    expect(p.options).toEqual([...others.map((q) => `${theirs}>${q}`), "none"].sort((a, b) => p.options.indexOf(a) - p.options.indexOf(b)));
    expect(p.options).toHaveLength(4);
    const hand = s.players[ap]!.hand.length;
    const third = others.find((q) => q !== opp)!;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: `${theirs}>${third}` }), ap);
    expect(s.objects[theirs]!.attachedToPlayer).toBe(third);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("declined, or with no Curse attached to you, nothing happens and you don't draw", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, lynde());
    const c = putOnBattlefield(s0, opp, opulence());
    s0.objects[c]!.attachedToPlayer = ap;
    invalidateCharacteristics(s0);
    let s = settle(passUntil(s0, "upkeep", ap), ap);
    expect(s.pending?.kind).toBe("chooseOption");
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }), ap);
    expect(s.objects[c]!.attachedToPlayer).toBe(ap);
    expect(s.players[ap]!.hand.length).toBe(hand);
    // Without a Curse on you, no question at all.
    const { s: t0, ap: ap2 } = setup([]);
    putOnBattlefield(t0, ap2, lynde());
    const t = settle(passUntil(t0, "upkeep", ap2), ap2);
    expect(t.pending).toBeNull();
  });

  it("a bot moves the Curse and draws", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, lynde());
    const c = putOnBattlefield(s0, opp, opulence());
    s0.objects[c]!.attachedToPlayer = ap;
    invalidateCharacteristics(s0);
    let s = settle(passUntil(s0, "upkeep", ap), ap);
    for (const x of botActions(s, ap)) s = act(s, x);
    expect(s.objects[c]!.attachedToPlayer).not.toBe(ap);
  });
});
