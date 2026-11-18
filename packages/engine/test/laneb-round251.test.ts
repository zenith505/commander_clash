// Lane B round B251: Sharkey, Tyrant of the Shire ("~ has all activated abilities of lands your opponents control except
// mana abilities. Mana of any type can be spent to activate ~'s abilities.", CR 609.4b, 613.1f), Kasmina, Enigma Sage
// ("Each other planeswalker you control has the loyalty abilities of ~.", CR 606.3, rulings) and Tamiyo, Collector of
// Tales ("Spells and abilities your opponents control can't cause you to discard cards or sacrifice permanents.", rulings).

import { describe, expect, it } from "vitest";
import { act, bear, forest, island, mountain, plainsCard, putOnBattlefield, setup, swamp } from "./helpers";
import { abilitiesOf, applyAction, botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, power, runStateBasedActions, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const sharkey = (): CardDef => ({"oracleId":"93a476c0-c77e-43b0-8695-ada40368a002","name":"Sharkey, Tyrant of the Shire","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Legendary Creature — Avatar Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Avatar","Rogue"],"oracleText":"Activated abilities of lands your opponents control can't be activated unless they're mana abilities.\nSharkey has all activated abilities of lands your opponents control except mana abilities.\nMana of any type can be spent to activate Sharkey's abilities.","power":"2","toughness":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/0/e0e446bd-8295-4fca-957a-e4710a15d8e8.jpg?1783916244","artUrl":"https://cards.scryfall.io/art_crop/front/e/0/e0e446bd-8295-4fca-957a-e4710a15d8e8.jpg?1783916244","layout":"normal"});
const kasmina = (): CardDef => ({"oracleId":"06425cb9-d157-4155-a727-78656df12458","name":"Kasmina, Enigma Sage","manaCost":"{1}{G}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Kasmina","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Kasmina"],"oracleText":"Each other planeswalker you control has the loyalty abilities of Kasmina.\n+2: Scry 1.\n−X: Create a 0/0 green and blue Fractal creature token. Put X +1/+1 counters on it.\n−8: Search your library for an instant or sorcery card that shares a color with this planeswalker, exile that card, then shuffle. You may cast that card without paying its mana cost.","loyalty":"2","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/178bf300-38cf-4ab2-9e66-6fcaa112b649.jpg?1783927310","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/178bf300-38cf-4ab2-9e66-6fcaa112b649.jpg?1783927310","layout":"normal"});
const tamiyo = (): CardDef => ({"oracleId":"75d56a0a-2f64-4e80-b83e-85942d3e6dd7","name":"Tamiyo, Collector of Tales","manaCost":"{2}{G}{U}","cmc":4,"typeLine":"Legendary Planeswalker — Tamiyo","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Tamiyo"],"oracleText":"Spells and abilities your opponents control can't cause you to discard cards or sacrifice permanents.\n+1: Choose a nonland card name, then reveal the top four cards of your library. Put all cards with the chosen name from among them into your hand and the rest into your graveyard.\n−3: Return target card from your graveyard to your hand.","loyalty":"5","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/6/f6b45d79-4526-490d-9771-9445e45307a7.jpg?1783931614","artUrl":"https://cards.scryfall.io/art_crop/front/f/6/f6b45d79-4526-490d-9771-9445e45307a7.jpg?1783931614","layout":"normal"});
const wolfRun = (): CardDef => ({"oracleId":"c6911265-54ef-4c16-bcf2-1ffb24b7d426","name":"Kessig Wolf Run","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{X}{R}{G}, {T}: Target creature gets +X/+0 and gains trample until end of turn.","colors":[],"colorIdentity":["G","R"],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bcb4e64b-e978-49ba-8e3e-4792f975fb61.jpg?1783925165","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bcb4e64b-e978-49ba-8e3e-4792f975fb61.jpg?1783925165","layout":"normal"});
const wreckage = (): CardDef => ({"oracleId":"91f34686-cb96-49c0-b4a7-49dd1fd076e2","name":"Sea Gate Wreckage","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}. ({C} represents colorless mana.)\n{2}{C}, {T}: Draw a card. Activate only if you have no cards in hand.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/c/d/cd42576b-9de5-4d77-9d30-1ef5b5a4fd73.jpg?1783937892","artUrl":"https://cards.scryfall.io/art_crop/front/c/d/cd42576b-9de5-4d77-9d30-1ef5b5a4fd73.jpg?1783937892","layout":"normal"});
const coffers = (): CardDef => ({"oracleId":"7358e164-5704-4e78-9b21-6a9bf2a968ce","name":"Cabal Coffers","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{2}, {T}: Add {B} for each Swamp you control.","colors":[],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/6/c/6cd01460-901c-4d75-bc29-e97ed26afc39.jpg?1783926766","artUrl":"https://cards.scryfall.io/art_crop/front/6/c/6cd01460-901c-4d75-bc29-e97ed26afc39.jpg?1783926766","layout":"normal"});
const chandra = (): CardDef => ({"oracleId":"12cc800c-c7be-4811-8207-fd01a99cc892","name":"Chandra, Torch of Defiance","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Legendary Planeswalker — Chandra","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Chandra"],"oracleText":"+1: Exile the top card of your library. You may cast that card. If you don't, Chandra deals 2 damage to each opponent.\n+1: Add {R}{R}.\n−3: Chandra deals 4 damage to target creature.\n−7: You get an emblem with \"Whenever you cast a spell, this emblem deals 5 damage to any target.\"","loyalty":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/40cb22c8-cb03-45c9-bb0e-b8cabdcc43cd.jpg?1788329325","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/40cb22c8-cb03-45c9-bb0e-b8cabdcc43cd.jpg?1788329325","layout":"normal"});
const karn = (): CardDef => ({"oracleId":"060209fa-4b7d-4e08-bf8b-8759bba5641b","name":"Karn, Scion of Urza","manaCost":"{4}","cmc":4,"typeLine":"Legendary Planeswalker — Karn","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Karn"],"oracleText":"+1: Reveal the top two cards of your library. An opponent chooses one of them. Put that card into your hand and exile the other with a silver counter on it.\n−1: Put a card you own with a silver counter on it from exile into your hand.\n−2: Create a 0/0 colorless Construct artifact creature token with \"This token gets +1/+1 for each artifact you control.\"","loyalty":"5","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/7/07a3d9e8-8597-498b-869c-cff79e0df516.jpg?1783935054","artUrl":"https://cards.scryfall.io/art_crop/front/0/7/07a3d9e8-8597-498b-869c-cff79e0df516.jpg?1783935054","layout":"normal"});
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","layout":"normal"});
const growth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","layout":"normal"});
const mindRot = (): CardDef => ({"oracleId":"ad44cf74-b717-48fb-9fa2-77512024d76a","name":"Mind Rot","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player discards two cards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/3317ff1a-9104-44e6-acb9-5ee09648138f.jpg?1783937202","layout":"normal"});
const inquiry = (): CardDef => ({"oracleId":"af98156b-3064-4f16-940e-10039241f2b0","name":"Burning Inquiry","manaCost":"{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player draws three cards, then discards three cards at random.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a448bc9e-f5db-4507-ac40-7d8ee3598585.jpg?1783942375","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a448bc9e-f5db-4507-ac40-7d8ee3598585.jpg?1783942375","layout":"normal"});
const looting = (): CardDef => ({"oracleId":"3d6fa57a-aa53-4b5c-b8af-a7612c823117","name":"Faithless Looting","manaCost":"{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards, then discard two cards.\nFlashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["R"],"colorIdentity":["R"],"keywords":["Flashback"],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/65879a80-b656-412f-8b90-aa6d4f36a43c.jpg?1783915510","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/65879a80-b656-412f-8b90-aa6d4f36a43c.jpg?1783915510","layout":"normal"});
const quandary = (): CardDef => ({"oracleId":"c37051cc-6683-4dbb-b5ff-5c3a5bdab1df","name":"Painful Quandary","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever an opponent casts a spell, that player loses 5 life unless they discard a card.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/e/bed5e030-874f-4a00-8544-78ba04033f53.jpg?1783920080","artUrl":"https://cards.scryfall.io/art_crop/front/b/e/bed5e030-874f-4a00-8544-78ba04033f53.jpg?1783920080","layout":"normal"});
const edict = (): CardDef => ({"oracleId":"058917c1-21ab-488a-9f9c-591c55f3c596","name":"Diabolic Edict","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target player sacrifices a creature of their choice.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/2/d2abd138-b840-4222-88ad-7b0ed64a927b.jpg?1783919168","artUrl":"https://cards.scryfall.io/art_crop/front/d/2/d2abd138-b840-4222-88ad-7b0ed64a927b.jpg?1783919168","layout":"normal"});
const chains = (): CardDef => ({"oracleId":"eae87919-6322-4bd2-ae9c-b1ce25d686da","name":"Chains of Mephistopheles","manaCost":"{1}{B}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If a player would draw a card except the first one they draw in each of their draw steps, that player discards a card instead. If the player discards a card this way, they draw a card. If the player doesn't discard a card this way, they mill a card.","colors":["B"],"colorIdentity":["B"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/2/b/2bb0e884-5bb4-41f3-b04b-6f638357c166.jpg?1783948068","artUrl":"https://cards.scryfall.io/art_crop/front/2/b/2bb0e884-5bb4-41f3-b04b-6f638357c166.jpg?1783948068","layout":"normal"});
const thoughtseize = (): CardDef => ({"oracleId":"edd8d1e8-be43-4c38-bb3a-83081fbaf0b5","name":"Thoughtseize","manaCost":"{B}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player reveals their hand. You choose a nonland card from it. That player discards that card. You lose 2 life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/e/5e85d5db-ced3-406d-90d2-e506a9332468.jpg?1783911723","artUrl":"https://cards.scryfall.io/art_crop/front/5/e/5e85d5db-ced3-406d-90d2-e506a9332468.jpg?1783911723","layout":"normal"});
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","layout":"normal"});

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or one of `me` has a question. */
const settle = (s: GameState, me: PlayerId[] = []) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && !me.includes(p.player)) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const named = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
/** The index of the activated ability of `id` whose text starts with `start`. */
const abilityIndex = (s: GameState, id: string, start: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.text.startsWith(start));
/** Puts a card from `pid`'s library (a new object) on top of it. */
function onTop(s: GameState, pid: PlayerId, d: CardDef): string {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
}
/** Puts a card in `pid`'s hand. */
function inHand(s: GameState, pid: PlayerId, d: CardDef): string {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}
/** A planeswalker on the battlefield with this much loyalty. */
function walker(s: GameState, pid: PlayerId, d: CardDef, loyalty: number): string {
  const id = putOnBattlefield(s, pid, d);
  s.objects[id]!.counters = { loyalty };
  invalidateCharacteristics(s);
  return id;
}
/** Leaves `pid` only these lands of theirs (by name). */
function onlyLands(s: GameState, pid: PlayerId, names: string[]) {
  for (const id of [...s.battlefield]) {
    const o = s.objects[id]!;
    if (o.controller === pid && characteristics(s, o).types.includes("Land") && !names.includes(named(s, id))) moveObject(s, id, "graveyard");
  }
  invalidateCharacteristics(s);
}

describe("Lane B round B251", () => {
  it("are fully supported", () => {
    supported(sharkey(), kasmina(), tamiyo());
    expect(compileCard(sharkey()).spendAnyTypeOwnAbilities).toBe(true);
    expect(compileCard(kasmina()).lendsLoyaltyToPlaneswalkers).toBe(true);
    const t = compileCard(tamiyo());
    expect([t.opponentsCantMakeYouDiscard, t.opponentsCantMakeYouSacrifice]).toEqual([true, true]);
    expect(t.activated.map((a) => a.loyalty)).toEqual([1, -3]);
  });
});

describe("Lane B round B251: Sharkey, Tyrant of the Shire", () => {
  it("has the activated abilities of its opponents' lands, not their mana abilities; they can't activate theirs", () => {
    const { s: s0, ap, opp } = setup([]);
    const sh = putOnBattlefield(s0, ap, sharkey());
    const run0 = putOnBattlefield(s0, opp, wolfRun());
    putOnBattlefield(s0, opp, wreckage());
    putOnBattlefield(s0, opp, coffers());
    putOnBattlefield(s0, ap, wolfRun()); // its own land's ability isn't borrowed
    const texts = abilitiesOf(s0, s0.objects[sh]!).activated.map((a) => a.text);
    expect([...texts].sort()).toEqual(["{2}{C}, {T}: Draw a card. Activate only if you have no cards in hand.", "{X}{R}{G}, {T}: Target creature gets +X/+0 and gains trample until end of turn."]);
    // Cabal Coffers' "{2}, {T}: Add {B} for each Swamp you control." is a mana ability (CR 605.1a): not borrowed, nor the
    // lands' "{T}: Add {C}." (rulings).
    expect(texts.some((t) => /Add/.test(t))).toBe(false);
    // "Activated abilities of lands your opponents control can't be activated unless they're mana abilities."
    const i = abilityIndex(s0, run0, "{X}{R}{G}");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(planActivate(s0, opp, run0, i, [tgt(sh)])).toBeNull();
  });

  it("mana of any type pays its abilities' costs: {R}{G} and {C} with Islands and Plains", () => {
    const { s: s0, ap, opp } = setup([]);
    const sh = putOnBattlefield(s0, ap, sharkey());
    const b = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, wolfRun());
    putOnBattlefield(s0, opp, wreckage());
    onlyLands(s0, ap, ["Island", "Plains"]);
    // Nothing in hand for Sea Gate Wreckage's condition.
    for (const id of [...s0.players[ap]!.hand]) moveObject(s0, id, "graveyard");
    invalidateCharacteristics(s0);
    const pump = abilityIndex(s0, sh, "{X}{R}{G}");
    let s = settle(run(s0, planActivate(s0, ap, sh, pump, [tgt(b)], undefined, undefined, 2)));
    expect(power(s, s.objects[b]!)).toBe(4);
    expect(s.objects[sh]!.tapped).toBe(true);
    expect(logged(s, /Grizzly Bears gets \+2\/\+0/)).toBe(true);
    // The other one, {2}{C}, with only white and blue mana (all untapped again for the test).
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = false;
    invalidateCharacteristics(s);
    const draw = abilityIndex(s, sh, "{2}{C}");
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, sh, draw)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("without Sharkey, a {C} can't be paid with an Island", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wreckage());
    onlyLands(s0, ap, ["Island", "Sea Gate Wreckage"]);
    for (const id of [...s0.players[ap]!.hand]) moveObject(s0, id, "graveyard");
    invalidateCharacteristics(s0);
    // Its own {T} is the only colorless mana, and it's needed for the cost's {T} too.
    expect(planActivate(s0, ap, w, abilityIndex(s0, w, "{2}{C}"))).toBeNull();
  });
});

describe("Lane B round B251: Kasmina, Enigma Sage", () => {
  it("each other planeswalker you control has its loyalty abilities, an opponent's doesn't, and Kasmina only its own", () => {
    const { s, ap, opp } = setup([]);
    const k = walker(s, ap, kasmina(), 2);
    const c = walker(s, ap, chandra(), 4);
    const theirs = walker(s, opp, karn(), 5);
    const texts = (id: string) => abilitiesOf(s, s.objects[id]!).activated.map((a) => a.text.replace(/:.*/, ""));
    expect(texts(c)).toEqual(["+1", "+1", "−3", "−7", "+2", "−X", "−8"]);
    expect(texts(k)).toEqual(["+2", "−X", "−8"]);
    expect(texts(theirs)).toEqual(["+1", "−1", "−2"]);
    // Gone, it lends nothing (CR 400.7).
    moveObject(s, k, "graveyard");
    invalidateCharacteristics(s);
    expect(texts(c)).toEqual(["+1", "+1", "−3", "−7"]);
  });

  it("the planeswalker activates the lent +2 for its own loyalty, and then no other loyalty ability that turn (CR 606.3)", () => {
    const { s: s0, ap } = setup([]);
    walker(s0, ap, kasmina(), 2);
    const c = walker(s0, ap, chandra(), 4);
    let s = settle(run(s0, planActivate(s0, ap, c, abilityIndex(s0, c, "+2"))));
    expect(s.objects[c]!.counters.loyalty).toBe(6);
    expect(planActivate(s, ap, c, abilityIndex(s, c, "−3"), [tgt(c)])).toBeNull();
    expect(planActivate(s, ap, c, abilityIndex(s, c, "−X"), undefined, undefined, undefined, 1)).toBeNull();
  });

  it("the lent −X makes a Fractal with that many counters, X from the planeswalker it's activated from", () => {
    const { s: s0, ap } = setup([]);
    walker(s0, ap, kasmina(), 2);
    const c = walker(s0, ap, chandra(), 4);
    const s = settle(run(s0, planActivate(s0, ap, c, abilityIndex(s0, c, "−X"), undefined, undefined, undefined, 3)));
    expect(s.objects[c]!.counters.loyalty).toBe(1);
    const fractal = s.battlefield.find((id) => /Fractal/.test(named(s, id)))!;
    expect(s.objects[fractal]!.counters["+1/+1"]).toBe(3);
  });

  it("the lent −8 finds an instant or sorcery sharing a color with that planeswalker (rulings)", () => {
    const { s: s0, ap } = setup([]);
    walker(s0, ap, kasmina(), 2);
    const c = walker(s0, ap, chandra(), 9);
    const red = onTop(s0, ap, bolt());
    const green = onTop(s0, ap, growth());
    const s = settle(run(s0, planActivate(s0, ap, c, abilityIndex(s0, c, "−8"))), [ap]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const cards = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(cards).toContain(red);
    expect(cards).not.toContain(green);
  });

  it("a colorless planeswalker's −8 can find nothing (rulings); Kasmina's own uses its colors as it last existed", () => {
    const { s: s0, ap } = setup([]);
    walker(s0, ap, kasmina(), 8);
    const karnId = walker(s0, ap, karn(), 9);
    onTop(s0, ap, bolt());
    const green = onTop(s0, ap, growth());
    let s = settle(run(s0, planActivate(s0, ap, karnId, abilityIndex(s0, karnId, "−8"))), [ap]);
    expect(s.pending?.kind === "searchLibrary" ? s.pending.cards : []).toEqual([]);
    s = settle(s);
    // Kasmina at 8: its −8 leaves it with none, so it's gone before the ability resolves (CR 704.5i).
    const k = s.battlefield.find((id) => named(s, id) === "Kasmina, Enigma Sage")!;
    s = run(s, planActivate(s, ap, k, abilityIndex(s, k, "−8")));
    s = settle(s, [ap]);
    expect(s.objects[k]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const cards = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(cards).toContain(green);
    expect(cards.some((id) => named(s, id) === "Lightning Bolt")).toBe(false);
  });
});

describe("Lane B round B251: Tamiyo, Collector of Tales", () => {
  it("+1: the revealed cards with the chosen name go to the hand, the rest to the graveyard", () => {
    const { s: s0, ap } = setup([]);
    const t = walker(s0, ap, tamiyo(), 2);
    const f = onTop(s0, ap, forest);
    const b1 = onTop(s0, ap, bolt());
    const g = onTop(s0, ap, growth());
    const b2 = onTop(s0, ap, bolt());
    let s = settle(run(s0, planActivate(s0, ap, t, 0)), [ap]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "cardName" });
    expect(s.pending?.kind === "chooseOption" ? s.pending.options : []).not.toContain("Forest");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Lightning Bolt" }), [ap]);
    expect([b1, b2].map((id) => s.objects[id]!.zone)).toEqual(["hand", "hand"]);
    expect([g, f].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    expect(s.objects[t]!.counters.loyalty).toBe(3);
  });

  it("an opponent's spell can't make you discard: Mind Rot does nothing to you", () => {
    const { s: s0, ap, opp, ids } = setup([mindRot()]);
    walker(s0, opp, tamiyo(), 4);
    inHand(s0, opp, bolt());
    inHand(s0, opp, growth());
    const hand = s0.players[opp]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.hand.length).toBe(hand);
    expect(logged(s, /can't be made to discard cards by another player's spells or abilities \(Tamiyo, Collector of Tales\)/)).toBe(true);
  });

  it("each other player still discards; Tamiyo's controller's own spells still make them discard", () => {
    const { s: s0, ap, opp, ids } = setup([inquiry(), looting()]);
    walker(s0, opp, tamiyo(), 4);
    const handOf = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;
    const third = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    const before = { opp: handOf(s0, opp), third: handOf(s0, third) };
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // Each player draws three, then discards three at random: not Tamiyo's controller.
    expect(handOf(s, opp)).toBe(before.opp + 3);
    expect(handOf(s, third)).toBe(before.third);
    // Tamiyo on your own side: your own Faithless Looting still makes you discard two.
    s.objects[s.battlefield.find((id) => named(s, id) === "Tamiyo, Collector of Tales")!]!.controller = ap;
    invalidateCharacteristics(s);
    const mine = handOf(s, ap);
    s = settle(run(s, planCast(s, ap, ids[1]!)), []);
    expect(handOf(s, ap)).toBe(mine - 1 + 2 - 2);
  });

  it("an opponent's Thoughtseize: a card is chosen but not discarded, and its caster still loses 2 life", () => {
    const { s: s0, ap, opp, ids } = setup([thoughtseize()]);
    walker(s0, opp, tamiyo(), 4);
    const b = inHand(s0, opp, bolt());
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])), [ap]);
    // The choice is still made (only the discard can't happen).
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [b] }), [ap]);
    expect(logged(s, /can't be made to discard cards by another player's spells or abilities/)).toBe(true);
    expect(s.objects[b]!.zone).toBe("hand");
    expect(s.players[ap]!.life).toBe(life - 2);
  });

  it("can't take an opponent's option to discard: Painful Quandary's 5 life is lost", () => {
    const { s: s0, ap, opp, ids } = setup([growth()]);
    putOnBattlefield(s0, opp, quandary());
    walker(s0, ap, tamiyo(), 4);
    const b = putOnBattlefield(s0, ap, bear());
    const life = s0.players[ap]!.life;
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.players[ap]!.life).toBe(life - 5);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("an opponent's Diabolic Edict can't make you sacrifice", () => {
    const { s: s0, ap, opp, ids } = setup([edict()]);
    walker(s0, opp, tamiyo(), 4);
    const b = putOnBattlefield(s0, opp, bear());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("an opponent's Chains of Mephistopheles can't make you discard instead of drawing: you mill instead", () => {
    const { s: s0, ap, opp, ids } = setup([looting(), bolt()]);
    putOnBattlefield(s0, opp, chains());
    walker(s0, ap, tamiyo(), 4);
    // Only Faithless Looting and Lightning Bolt in hand.
    for (const id of s0.players[ap]!.hand.filter((x) => !ids.includes(x))) moveObject(s0, id, "graveyard");
    invalidateCharacteristics(s0);
    const lib = s0.players[ap]!.library.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), []);
    // Two draws, each replaced by a discard that can't happen, so a mill each; then Faithless Looting's own two discards,
    // of the one card left (Lightning Bolt).
    expect(s.players[ap]!.library.length).toBe(lib - 2);
    expect(s.players[ap]!.hand).toEqual([]);
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(s.log.filter((l) => /can't be made to discard by another player's Chains of Mephistopheles \(Tamiyo, Collector of Tales\), and mills/.test(l.text)).length).toBe(2);
    expect(logged(s, /instead of drawing/)).toBe(false);
  });
});
