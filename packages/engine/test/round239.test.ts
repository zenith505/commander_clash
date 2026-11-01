// Round 239: cards from the top of the popularity list. Caustic Bronco ("if this creature isn't saddled. Otherwise"); The
// Ancient One ("When you discard a card this way, target player mills cards equal to its mana value"); Abundant Harvest
// ("Choose land or nonland"); Industrial Advancement ("you may sacrifice a creature. If you do, look at the top X cards ...
// where X is that creature's mana value"); Old One Eye (a first-main-phase trigger from the graveyard); War's Toll ("If a
// creature an opponent controls attacks, all creatures that opponent controls attack if able"); Monastery Siege's
// Dragons ("Spells your opponents cast that target you or a permanent you control cost {2} more"); Belt of Giant Strength
// ("costs {X} less ..., where X is the power of the creature it targets"); Agatha of the Vile Cauldron ("cost {X} less ...,
// where X is Agatha's power"); Will, Scion of Peace ("Spells you cast this turn that are white and/or blue cost {X}
// less"); Solstice Revelations ("if the spell's mana value is less than the number of Mountains you control");
// Froghemoth ("exile up to that many target cards from their graveyard"); Roar of Resistance ("creatures attacking your
// opponents and/or planeswalkers they control"); Oath of Nissa ("spend mana as though it were mana of any color to cast
// planeswalker spells").

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { gainLife, loseLife } from "../src/game";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
/** Everyone passes until the stack is empty, answering "you may" with `may`; other players' questions as the bots would. Stops at any other question of `me`'s. */
const settle = (s: GameState, opts: { may?: boolean; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tapped = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.tapped).length;
/** Attack with these creatures (all at `defender`) from `ap`'s first main phase. */
const attackWith = (s: GameState, ap: PlayerId, defender: PlayerId, ids: string[]) => {
  s = passUntil(s, "declareAttackers", ap);
  return act(s, { type: "declareAttackers", player: ap, attacks: ids.map((attacker) => ({ attacker, defender })) });
};

// Real oracle text (Scryfall).
const bronco = (): CardDef => ({"oracleId":"165bdc68-1da0-47db-a069-978fc4c04b3f","name":"Caustic Bronco","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Snake Horse Mount","supertypes":[],"types":["Creature"],"subtypes":["Snake","Horse","Mount"],"oracleText":"Whenever this creature attacks, reveal the top card of your library and put it into your hand. You lose life equal to that card's mana value if this creature isn't saddled. Otherwise, each opponent loses that much life.\nSaddle 3 (Tap any number of other creatures you control with total power 3 or more: This Mount becomes saddled until end of turn. Saddle only as a sorcery.)","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Saddle"],"imageUrl":"https://cards.scryfall.io/normal/front/e/9/e9a268ba-c442-4fe4-90b4-2810c8474f4e.jpg?1783911835","artUrl":"https://cards.scryfall.io/art_crop/front/e/9/e9a268ba-c442-4fe4-90b4-2810c8474f4e.jpg?1783911835","commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ancient = (): CardDef => ({"oracleId":"6615f881-960c-4216-a32a-63856bc3afd0","name":"The Ancient One","manaCost":"{U}{B}","cmc":2,"typeLine":"Legendary Creature — Spirit God","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit","God"],"oracleText":"Descend 8 — The Ancient One can't attack or block unless there are eight or more permanent cards in your graveyard.\n{2}{U}{B}: Draw a card, then discard a card. When you discard a card this way, target player mills cards equal to its mana value.","power":"8","toughness":"8","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Descend","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/6/6/66dd43d7-76a7-46ea-b431-097fcea417af.jpg?1783913736","artUrl":"https://cards.scryfall.io/art_crop/front/6/6/66dd43d7-76a7-46ea-b431-097fcea417af.jpg?1783913736","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const harvest = (): CardDef => ({"oracleId":"34841228-31ac-48ac-b6d6-486b5e1e07dd","name":"Abundant Harvest","manaCost":"{G}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose land or nonland. Reveal cards from the top of your library until you reveal a card of the chosen kind. Put that card into your hand and the rest on the bottom of your library in a random order.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/a/5ad86b17-3fed-418a-938c-c49adb409531.jpg?1783926837","artUrl":"https://cards.scryfall.io/art_crop/front/5/a/5ad86b17-3fed-418a-938c-c49adb409531.jpg?1783926837","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const advancement = (): CardDef => ({"oracleId":"7a0aa9ea-610e-4910-b66d-fdac69e88adf","name":"Industrial Advancement","manaCost":"{3}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your end step, you may sacrifice a creature. If you do, look at the top X cards of your library, where X is that creature's mana value. You may put a creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81f1416c-48bd-4168-aacd-a9b0a3afb8bc.jpg?1783923360","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81f1416c-48bd-4168-aacd-a9b0a3afb8bc.jpg?1783923360","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const oneEye = (): CardDef => ({"oracleId":"86ef2ceb-b7e6-4451-92ec-8528ea191d3a","name":"Old One Eye","manaCost":"{5}{G}","cmc":6,"typeLine":"Legendary Creature — Tyranid","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Tyranid"],"oracleText":"Trample\nOther creatures you control have trample.\nWhen Old One Eye enters, create a 5/5 green Tyranid creature token.\nFast Healing — At the beginning of your first main phase, you may discard two cards. If you do, return this card from your graveyard to your hand.","power":"6","toughness":"6","colors":["G"],"colorIdentity":["G"],"keywords":["Fast Healing","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/b/5/b5aaaee0-9a61-45df-821e-cce516f8de6a.jpg?1783920874","artUrl":"https://cards.scryfall.io/art_crop/front/b/5/b5aaaee0-9a61-45df-821e-cce516f8de6a.jpg?1783920874","commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const toll = (): CardDef => ({"oracleId":"ba4e4afb-24bb-47de-aba8-89d21b11d45c","name":"War's Toll","manaCost":"{3}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever an opponent taps a land for mana, tap all lands that player controls.\nIf a creature an opponent controls attacks, all creatures that opponent controls attack if able.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/e/de5f6c39-55eb-4d8d-83cf-94652b07bc46.jpg?1783943416","artUrl":"https://cards.scryfall.io/art_crop/front/d/e/de5f6c39-55eb-4d8d-83cf-94652b07bc46.jpg?1783943416","commanderLegal":"legal","set":"dis","releasedAt":"2006-05-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const siege = (): CardDef => ({"oracleId":"240a33a8-23a0-4cb2-a9fd-1a2a21966bb8","name":"Monastery Siege","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"As this enchantment enters, choose Khans or Dragons.\n• Khans — At the beginning of your draw step, draw an additional card, then discard a card.\n• Dragons — Spells your opponents cast that target you or a permanent you control cost {2} more to cast.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/eef398b5-38f7-4a11-8fcf-d4e0d27267cf.jpg?1783938706","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/eef398b5-38f7-4a11-8fcf-d4e0d27267cf.jpg?1783938706","commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const belt = (): CardDef => ({"oracleId":"eb70939f-c4ce-4224-ab74-acc24771d7f0","name":"Belt of Giant Strength","manaCost":"{1}{G}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature has base power and toughness 10/10.\nEquip {10}. This ability costs {X} less to activate, where X is the power of the creature it targets.","colors":["G"],"colorIdentity":["G"],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/4/e/4ef2b9aa-4f7c-4640-bb34-9775e1be0935.jpg?1783926245","artUrl":"https://cards.scryfall.io/art_crop/front/4/e/4ef2b9aa-4f7c-4640-bb34-9775e1be0935.jpg?1783926245","commanderLegal":"legal","set":"afc","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const agatha = (): CardDef => ({"oracleId":"f398d222-f8e7-4983-9a77-267adef7f551","name":"Agatha of the Vile Cauldron","manaCost":"{R}{G}","cmc":2,"typeLine":"Legendary Creature — Human Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"Activated abilities of creatures you control cost {X} less to activate, where X is Agatha's power. This effect can't reduce the mana in that cost to less than one mana.\n{4}{R}{G}: Other creatures you control get +1/+1 and gain trample and haste until end of turn.","power":"1","toughness":"1","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/6/d6c48f07-63b7-4a60-8da6-ce77405abf1e.jpg?1783915073","artUrl":"https://cards.scryfall.io/art_crop/front/d/6/d6c48f07-63b7-4a60-8da6-ce77405abf1e.jpg?1783915073","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const will = (): CardDef => ({"oracleId":"4ecb8653-db8c-468a-853d-420ff62a7a8a","name":"Will, Scion of Peace","manaCost":"{1}{W}{U}","cmc":3,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Vigilance\n{T}: Spells you cast this turn that are white and/or blue cost {X} less to cast, where X is the amount of life you gained this turn. Activate only as a sorcery.","power":"2","toughness":"4","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/162088ea-5f99-4244-9427-2fdfb2168fc3.jpg?1783915068","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/162088ea-5f99-4244-9427-2fdfb2168fc3.jpg?1783915068","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const solstice = (): CardDef => ({"oracleId":"310c1280-dee8-426f-8440-6132a634a1e0","name":"Solstice Revelations","manaCost":"{2}{R}","cmc":3,"typeLine":"Instant — Lesson","supertypes":[],"types":["Instant"],"subtypes":["Lesson"],"oracleText":"Exile cards from the top of your library until you exile a nonland card. You may cast that card without paying its mana cost if the spell's mana value is less than the number of Mountains you control. If you don't cast that card this way, put it into your hand.\nFlashback {6}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["R"],"colorIdentity":["R"],"keywords":["Flashback"],"imageUrl":"https://cards.scryfall.io/normal/front/f/2/f22ac19f-66fb-4d54-9f09-495a20a29577.jpg?1783904953","artUrl":"https://cards.scryfall.io/art_crop/front/f/2/f22ac19f-66fb-4d54-9f09-495a20a29577.jpg?1783904953","commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const frog = (): CardDef => ({"oracleId":"66e66543-1f56-4e62-9183-3804843db101","name":"Froghemoth","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Creature — Frog Horror","supertypes":[],"types":["Creature"],"subtypes":["Frog","Horror"],"oracleText":"Trample, haste\nWhenever this creature deals combat damage to a player, exile up to that many target cards from their graveyard. Put a +1/+1 counter on this creature for each creature card exiled this way. You gain 1 life for each noncreature card exiled this way.","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Haste","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/7/2/728e9567-2585-4c03-99a5-3e84fd8044d2.jpg?1783926463","artUrl":"https://cards.scryfall.io/art_crop/front/7/2/728e9567-2585-4c03-99a5-3e84fd8044d2.jpg?1783926463","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const roar = (): CardDef => ({"oracleId":"a0753b28-e693-4f5b-a4e4-846e933058d3","name":"Roar of Resistance","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creature tokens you control have haste.\nWhenever one or more creatures attack, you may pay {1}{R}. If you do, creatures attacking your opponents and/or planeswalkers they control get +2/+0 until end of turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/5/f5eb9570-6203-4a03-9a3e-e5c679df5903.jpg?1783918159","artUrl":"https://cards.scryfall.io/art_crop/front/f/5/f5eb9570-6203-4a03-9a3e-e5c679df5903.jpg?1783918159","commanderLegal":"legal","set":"onc","releasedAt":"2023-02-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const oath = (): CardDef => ({"oracleId":"c4efdbab-711d-4269-9b24-b05d36f7e5c7","name":"Oath of Nissa","manaCost":"{G}","cmc":1,"typeLine":"Legendary Enchantment","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":[],"oracleText":"When Oath of Nissa enters, look at the top three cards of your library. You may reveal a creature, land, or planeswalker card from among them and put it into your hand. Put the rest on the bottom of your library in any order.\nYou may spend mana as though it were mana of any color to cast planeswalker spells.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/613513ea-55dd-4ae8-93b2-247e468112a6.jpg?1783937900","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/613513ea-55dd-4ae8-93b2-247e468112a6.jpg?1783937900","commanderLegal":"legal","set":"ogw","releasedAt":"2016-01-22","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const rowan = (): CardDef => ({"oracleId":"333c15c6-c8fd-4cdd-89d2-06b921edeb8b","name":"Rowan, Scion of War","manaCost":"{1}{B}{R}","cmc":3,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Menace\n{T}: Spells you cast this turn that are black and/or red cost {X} less to cast, where X is the amount of life you lost this turn. Activate only as a sorcery.","power":"4","toughness":"2","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Menace"],"commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
describe("round 239 cards", () => {
  it("are fully supported", () => supported(bronco(), ancient(), harvest(), advancement(), oneEye(), toll(), siege(), belt(), agatha(), will(), rowan(), solstice(), frog(), roar(), oath()));
});

describe("Caustic Bronco", () => {
  const four = card("Test Four", "Sorcery", "{3}{B}", { oracleText: "Draw a card." });
  it("unsaddled: you lose life equal to the revealed card's mana value; saddled: each opponent does instead", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bronco());
    const top = into(s0, ap, four, "library");
    const life = s0.players[ap]!.life;
    let s = settle(attackWith(s0, ap, opp, [b]));
    expect(s.objects[top]!.zone).toBe("hand");
    expect(s.players[ap]!.life).toBe(life - 4);
    // Saddled: each opponent loses 4 instead.
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const b2 = putOnBattlefield(t0, ap2, bronco());
    t0.objects[b2]!.saddled = true;
    into(t0, ap2, four, "library");
    const before = t0.turnOrder.map((p) => t0.players[p]!.life);
    s = settle(attackWith(t0, ap2, opp2, [b2]));
    expect(s.turnOrder.map((p) => s.players[p]!.life)).toEqual(before.map((l, i) => (t0.turnOrder[i] === ap2 ? l : l - 4)));
  });
});

describe("The Ancient One", () => {
  it("draws, discards, then the reflexive trigger targets a player who mills cards equal to the discarded card's mana value", () => {
    const five = card("Test Five", "Sorcery", "{4}{U}", { oracleText: "Draw a card." });
    const { s: s0, ap, ids, opp } = setup([five]);
    const a = putOnBattlefield(s0, ap, ancient());
    const lib = s0.players[opp]!.library.length;
    let s = run(s0, planActivate(s0, ap, a, 0));
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    s = act(s, { type: "discard", player: ap, objectIds: [ids[0]!] });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = settle(s);
    expect(s.players[opp]!.library.length).toBe(lib - 5);
  });
  it("a land discarded mills nothing", () => {
    const land = card("Test Land", "Land", "", { oracleText: "{T}: Add {G}." });
    const { s: s0, ap, ids, opp } = setup([land]);
    const a = putOnBattlefield(s0, ap, ancient());
    const lib = s0.players[opp]!.library.length;
    let s = passAll(run(s0, planActivate(s0, ap, a, 0)));
    s = act(s, { type: "discard", player: ap, objectIds: [ids[0]!] });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = settle(s);
    expect(s.players[opp]!.library.length).toBe(lib);
  });
});

describe("Abundant Harvest", () => {
  it("choose nonland: reveals to the first nonland card, puts it into your hand and the rest on the bottom", () => {
    const { s: s0, ap, ids } = setup([harvest()]);
    const land = card("Test Land", "Land", "", { oracleText: "{T}: Add {G}." });
    const spell = into(s0, ap, card("Test Spell", "Sorcery", "{1}{G}", { oracleText: "Draw a card." }), "library");
    const l1 = into(s0, ap, land, "library");
    const l2 = into(s0, ap, land, "library");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "landOrNonland", options: ["land", "nonland"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "nonland" }));
    expect(s.objects[spell]!.zone).toBe("hand");
    const lib = s.players[ap]!.library;
    expect(lib.slice(-2).sort()).toEqual([l1, l2].sort());
  });
  it("choose land: the first land card", () => {
    const { s: s0, ap, ids } = setup([harvest()]);
    const land = into(s0, ap, card("Test Land", "Land", "", { oracleText: "{T}: Add {G}." }), "library");
    const spell = into(s0, ap, card("Test Spell", "Sorcery", "{1}{G}", { oracleText: "Draw a card." }), "library");
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "land" }));
    expect(s.objects[land]!.zone).toBe("hand");
    expect(s.players[ap]!.library.at(-1)).toBe(spell);
  });
  it("the bot answers the choice", () => {
    const { s: s0, ap, ids } = setup([harvest()]);
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    const a = botActions(s, ap)[0]!;
    expect(a).toMatchObject({ type: "chooseOption" });
    s = settle(act(s, a));
    expect(s.pending).toBeFalsy();
  });
});

describe("Industrial Advancement", () => {
  it("at your end step, you may sacrifice a creature; then look at the top X cards (its mana value) and may put a creature card onto the battlefield", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, advancement());
    const three = putOnBattlefield(s0, ap, card("Test Three", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" }));
    const big = into(s0, ap, card("Test Big", "Creature — Giant", "{5}{R}{R}", { power: "7", toughness: "7" }), "library");
    into(s0, ap, card("Test Spell", "Sorcery", "{1}{G}", { oracleText: "Draw a card." }), "library");
    into(s0, ap, card("Test Spell", "Sorcery", "{1}{G}", { oracleText: "Draw a card." }), "library");
    let s = passUntil(s0, "end", ap);
    s = settle(s, { may: true, me: ap });
    // The 3-mana creature sacrificed: the top three cards, the Giant among them.
    expect(s.objects[three]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [big], max: 1 });
    expect((s.pending as { dig?: { looked: string[] } }).dig?.looked).toHaveLength(3);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [big] }), { me: ap });
    expect(s.objects[big]!.zone).toBe("battlefield");
  });
  it("declining the sacrifice looks at nothing", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, advancement());
    const three = putOnBattlefield(s0, ap, card("Test Three", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" }));
    let s = passUntil(s0, "end", ap);
    s = settle(s, { may: false, me: ap });
    expect(s.objects[three]!.zone).toBe("battlefield");
    expect(s.pending).toBeFalsy();
  });
});

describe("Old One Eye", () => {
  it("in your graveyard at your first main phase: you may discard two cards to return it to your hand", () => {
    const { s: s0, ap } = setup([]);
    const eye = into(s0, ap, oneEye(), "graveyard");
    let s = passUntil(s0, "upkeep", ap);
    // Keep two cards in hand to discard.
    s = passUntil(s, "main1", ap);
    expect(s.stack.length).toBe(1);
    s = settle(s, { may: true, me: ap });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 2 });
    const two = s.players[ap]!.hand.slice(0, 2);
    s = settle(act(s, { type: "discard", player: ap, objectIds: two }), { me: ap });
    expect(s.objects[eye]!.zone).toBe("hand");
    expect(two.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  });
  it("doesn't trigger from the battlefield, and can't be done with fewer than two cards in hand", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, oneEye());
    let s = passUntil(passUntil(s0, "upkeep", ap), "main1", ap);
    expect(s.stack.length).toBe(0);
    const { s: t0, ap: ap2 } = setup([]);
    const eye = into(t0, ap2, oneEye(), "graveyard");
    let t = passUntil(passUntil(t0, "upkeep", ap2), "main1", ap2);
    // One card left in hand as the trigger resolves.
    for (const id of t.players[ap2]!.hand.slice(1)) {
      t.players[ap2]!.hand.splice(t.players[ap2]!.hand.indexOf(id), 1);
      t.objects[id]!.zone = "library";
      t.players[ap2]!.library.push(id);
    }
    t = settle(t, { may: true, me: ap2 });
    expect(t.objects[eye]!.zone).toBe("graveyard");
  });
});

describe("War's Toll", () => {
  it("once one of an opponent's creatures attacks, all of that player's creatures that can attack must", () => {
    const { s: s0, ap, opp } = setup([]);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    putOnBattlefield(s0, other, toll());
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Bear Two" }));
    const sick = putOnBattlefield(s0, ap, bear({ name: "Test Sick Bear" }), { sick: true });
    const s = passUntil(s0, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] })).toThrow(/has to attack too/);
    // All that can (the summoning-sick one can't), or none at all.
    const all = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: other }] });
    expect([all.objects[a]!.attacking, all.objects[b]!.attacking, all.objects[sick]!.attacking]).toEqual([opp, other, undefined]);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).not.toThrow();
  });
  it("its controller's own creatures are free; the bot attacks with all or none", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, toll());
    const a = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, bear({ name: "Test Bear Two" }));
    const s = passUntil(s0, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] })).not.toThrow();
    // The bot, under an opponent's War's Toll, with a big creature and a small one.
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    putOnBattlefield(t0, opp2, toll());
    putOnBattlefield(t0, ap2, card("Test Giant", "Creature — Giant", "{5}{R}", { power: "9", toughness: "9" }));
    putOnBattlefield(t0, ap2, bear());
    const t = passUntil(t0, "declareAttackers", ap2);
    const plan = botActions(t, ap2);
    const decl = plan.find((x) => x.type === "declareAttackers") as Extract<Action, { type: "declareAttackers" }>;
    expect([0, 2]).toContain(decl.attacks.length);
    expect(() => run(t, plan)).not.toThrow();
  });
});

describe("Monastery Siege", () => {
  const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
  it("Dragons: an opponent's spell that targets you or a permanent you control costs {2} more, once per spell", () => {
    const { s: s0, ap, ids, opp } = setup([shock, shock, shock]);
    const sg = putOnBattlefield(s0, opp, siege());
    s0.objects[sg]!.chosen = { anchor: "Dragons" };
    const theirs = putOnBattlefield(s0, opp, bear());
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    let s = s0;
    const before = tapped(s, ap);
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(tapped(s, ap) - before).toBe(3);
    s = passAll(s);
    const mid = tapped(s, ap);
    s = run(s, planCast(s, ap, ids[1]!, [tgt(theirs)]));
    expect(tapped(s, ap) - mid).toBe(3);
    s = passAll(s);
    // Another player: no tax.
    const last = tapped(s, ap);
    s = run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: third }]));
    expect(tapped(s, ap) - last).toBe(1);
  });
  it("Khans chosen: no tax", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    const sg = putOnBattlefield(s0, opp, siege());
    s0.objects[sg]!.chosen = { anchor: "Khans" };
    const before = tapped(s0, ap);
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(tapped(s, ap) - before).toBe(1);
  });
});

describe("Belt of Giant Strength", () => {
  it("equip {10} costs {X} less, X the power of the creature it targets", () => {
    const { s: s0, ap } = setup([]);
    const bl = putOnBattlefield(s0, ap, belt());
    const seven = putOnBattlefield(s0, ap, card("Test Seven", "Creature — Giant", "{6}{G}", { power: "7", toughness: "7" }));
    const before = tapped(s0, ap);
    let s = run(s0, planActivate(s0, ap, bl, 0, [tgt(seven)]));
    expect(tapped(s, ap) - before).toBe(3);
    s = passAll(s);
    expect(s.objects[bl]!.attachedTo).toBe(seven);
    expect(power(s, s.objects[seven]!)).toBe(10);
  });
});

describe("Agatha of the Vile Cauldron", () => {
  it("activated abilities of creatures you control cost {X} less (X her power), not below one mana", () => {
    const { s: s0, ap } = setup([]);
    const ag = putOnBattlefield(s0, ap, agatha());
    const pinger = putOnBattlefield(s0, ap, card("Test Pinger", "Creature — Wizard", "{2}{R}", { power: "1", toughness: "1", oracleText: "{3}: Test Pinger deals 1 damage to any target." }));
    const cheap = putOnBattlefield(s0, ap, card("Test Cheap", "Creature — Wizard", "{R}", { power: "1", toughness: "1", oracleText: "{1}: Test Cheap gets +1/+0 until end of turn." }));
    s0.objects[ag]!.counters["+1/+1"] = 1; // power 2
    invalidateCharacteristics(s0);
    let before = tapped(s0, ap);
    let s = run(s0, planActivate(s0, ap, pinger, 0, [{ kind: "player", id: ap }]));
    expect(tapped(s, ap) - before).toBe(1);
    s = passAll(s);
    // {1} stays {1}.
    before = tapped(s, ap);
    s = run(s, planActivate(s, ap, cheap, 0));
    expect(tapped(s, ap) - before).toBe(1);
    s = passAll(s);
    // Her own {4}{R}{G}: {2}{R}{G}.
    before = tapped(s, ap);
    s = run(s, planActivate(s, ap, ag, 0));
    expect(tapped(s, ap) - before).toBe(4);
  });
});

describe("Will, Scion of Peace", () => {
  it("white and/or blue spells you cast this turn cost {X} less, X the life you gained this turn as it resolves", () => {
    const blue = card("Test Blue", "Sorcery", "{4}{U}", { oracleText: "Draw a card." });
    const red = card("Test Red", "Sorcery", "{4}{R}", { oracleText: "Draw a card." });
    const { s: s0, ap, ids } = setup([blue, red]);
    const w = putOnBattlefield(s0, ap, will());
    gainLife(s0, ap, 3);
    let s = passAll(run(s0, planActivate(s0, ap, w, 0)));
    let before = tapped(s, ap);
    s = run(s, planCast(s, ap, ids[0]!));
    expect(tapped(s, ap) - before).toBe(2);
    s = passAll(s);
    before = tapped(s, ap);
    s = run(s, planCast(s, ap, ids[1]!));
    expect(tapped(s, ap) - before).toBe(5);
  });
});

describe("Rowan, Scion of War", () => {
  it("black and/or red spells cost {X} less, X the life you lost this turn (gains don't offset it), fixed as it resolves", () => {
    const red = card("Test Red", "Sorcery", "{4}{R}", { oracleText: "Draw a card." });
    const blue = card("Test Blue", "Sorcery", "{4}{U}", { oracleText: "Draw a card." });
    const { s: s0, ap, ids } = setup([red, blue]);
    const r = putOnBattlefield(s0, ap, rowan());
    // Rulings: lost 3 and gained 3 still reduces by {3}.
    loseLife(s0, ap, 3);
    gainLife(s0, ap, 3);
    let s = passAll(run(s0, planActivate(s0, ap, r, 0)));
    // X was fixed when the ability resolved: losing more life now doesn't change it.
    loseLife(s, ap, 2);
    let before = tapped(s, ap);
    s = run(s, planCast(s, ap, ids[0]!));
    expect(tapped(s, ap) - before).toBe(2);
    s = passAll(s);
    before = tapped(s, ap);
    s = run(s, planCast(s, ap, ids[1]!));
    expect(tapped(s, ap) - before).toBe(5);
  });
});

describe("Solstice Revelations", () => {
  it("exiles to a nonland card; cast free only if its mana value is less than your Mountains, else into your hand", () => {
    const three = card("Test Three", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" });
    const land = card("Test Land", "Land", "", { oracleText: "{T}: Add {G}." });
    const { s: s0, ap, ids } = setup([solstice(), solstice()]);
    // setup gives three Mountains: mana value 2 or less may be cast.
    const big = into(s0, ap, three, "library");
    const l = into(s0, ap, land, "library");
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeFalsy();
    expect(s.objects[big]!.zone).toBe("hand");
    expect(s.objects[l]!.zone).toBe("exile");
    // A fourth Mountain: now it may be cast free.
    putOnBattlefield(s, ap, card("Mountain", "Basic Land — Mountain"));
    const again = into(s, ap, three, "library");
    s = passAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: again, mv: { max: 3 } });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: again }));
    expect(s.objects[again]!.zone).toBe("battlefield");
  });
});

describe("Froghemoth", () => {
  it("exiles up to as many target cards from the damaged player's graveyard as the damage; counters for creatures, life for the rest", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, frog());
    const ys = [bear(), bear({ name: "Test Bear Two" }), card("Test Spell", "Sorcery", "{1}{G}", { oracleText: "Draw a card." }), card("Test Spell Two", "Sorcery", "{1}{G}", { oracleText: "Draw a card." }), bear({ name: "Test Bear Three" })].map((d) => into(s0, opp, d, "graveyard"));
    const life = s0.players[ap]!.life;
    let s = attackWith(s0, ap, opp, [f]);
    for (let i = 0; i < 50 && !(s.pending?.kind === "chooseTargets"); i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // 4 damage: up to four of the five cards.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: ys.map(tgt) })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [ys[0]!, ys[1]!, ys[2]!, ys[3]!].map(tgt) }));
    expect(ys.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile", "exile", "graveyard"]);
    expect(s.objects[f]!.counters["+1/+1"]).toBe(2);
    expect(s.players[ap]!.life).toBe(life + 2);
  });
});

describe("Roar of Resistance", () => {
  it("whenever any creatures attack, you may pay {1}{R}: creatures attacking your opponents get +2/+0, not ones attacking you", () => {
    const { s: s0, ap, opp } = setup([]);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    // Roar is the third player's: the active player attacks Roar's controller with one and opp with the other.
    putOnBattlefield(s0, third, roar());
    for (const l of ["Mountain", "Mountain"]) putOnBattlefield(s0, third, card(l, "Basic Land — Mountain"));
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Bear Two" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: third }] });
    for (let i = 0; i < 50 && !(s.pending?.kind === "chooseMay" && s.pending.player === third); i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: third });
    s.players[third]!.manaPool.R = 2;
    s = act(s, { type: "chooseMay", player: third, yes: true });
    for (let i = 0; i < 20 && s.stack.length; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect([power(s, s.objects[a]!), power(s, s.objects[b]!)]).toEqual([4, 2]);
  });
});

describe("Oath of Nissa", () => {
  it("mana of any color pays a planeswalker spell's colored symbols, not other spells'", () => {
    const walker = card("Test Walker", "Legendary Planeswalker — Test", "{U}{U}", { oracleText: "+1: Draw a card.", loyalty: "3" } as Partial<CardDef>);
    const blue = card("Test Blue", "Sorcery", "{U}{U}", { oracleText: "Draw a card." });
    const { s: s0, ap, ids } = setup([walker, blue]);
    // Only Mountains to pay with.
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap && !["Mountain"].includes(characteristics(s0, s0.objects[id]!).name)) s0.objects[id]!.tapped = true;
    expect(planCast(s0, ap, ids[0]!)).toBeNull();
    putOnBattlefield(s0, ap, oath());
    expect(planCast(s0, ap, ids[1]!)).toBeNull();
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });
});
