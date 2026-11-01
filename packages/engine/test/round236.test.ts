// Round 236: cards from the top of the popularity list. Ephara, God of the Polis ("if you had another creature enter the
// battlefield under your control last turn"); Tangled Colony ("the amount of damage dealt to it this turn"); Sigarda, Host
// of Herons and Tajuru Preserver ("Spells and abilities your opponents control can't cause you to sacrifice permanents");
// Tam, Mindful First-Year ("hexproof from each of its colors"); Hourglass of the Lost ("Remove X time counters ...: Return
// each nonland permanent card with mana value X"); Fire Lord Zuko ("and whenever a permanent you control enters from
// exile"); The Lost and the Damned ("a land you control enters from anywhere other than your hand"); Historian's Boon
// ("Whenever the final chapter ability of a Saga you control triggers"); Sam, Loyal Attendant ("Activated abilities of
// Foods you control cost {1} less"); Grindstone ("If two cards that share a color were milled this way, repeat this
// process"); Crystalline Giant (a kind of counter at random); Sigarda's Splendor ("note your life total"); Theoretical
// Duplication ("Whenever a nontoken creature an opponent controls enters this turn"); Topography Tracker ("instead it
// explores, then it explores again"); Phyrexian Soulgorger ("Cumulative upkeep—Sacrifice a creature").

import { describe, expect, it } from "vitest";
import { act, bear, card, forest as forestCard, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { putCounters } from "../src/counters";
import { moveObject } from "../src/game";

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
const named = (s: GameState, name: string) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === name);

// Real oracle text (Scryfall).
const ephara = (): CardDef => ({"oracleId":"5968ecb5-5728-429f-9324-0c108820ebe8","name":"Ephara, God of the Polis","manaCost":"{2}{W}{U}","cmc":4,"typeLine":"Legendary Enchantment Creature — God","supertypes":["Legendary"],"types":["Enchantment","Creature"],"subtypes":["God"],"oracleText":"Indestructible\nAs long as your devotion to white and blue is less than seven, Ephara isn't a creature.\nAt the beginning of each upkeep, if you had another creature enter the battlefield under your control last turn, draw a card.","power":"6","toughness":"5","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Indestructible"],"imageUrl":"https://cards.scryfall.io/normal/front/e/5/e549057e-fb55-4752-903c-41355f9a0589.jpg?1783931364","artUrl":"https://cards.scryfall.io/art_crop/front/e/5/e549057e-fb55-4752-903c-41355f9a0589.jpg?1783931364","commanderLegal":"legal","set":"sld","releasedAt":"2020-02-14","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const colony = (): CardDef => ({"oracleId":"3f01c327-ba50-4fc3-a930-fa1fb02e34b9","name":"Tangled Colony","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Rat","supertypes":[],"types":["Creature"],"subtypes":["Rat"],"oracleText":"This creature can't block.\nWhen this creature dies, create X 1/1 black Rat creature tokens with \"This token can't block,\" where X is the amount of damage dealt to it this turn.","power":"3","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/5/45ba866b-eda5-45c0-8878-235abadc0a3c.jpg?1783915032","artUrl":"https://cards.scryfall.io/art_crop/front/4/5/45ba866b-eda5-45c0-8878-235abadc0a3c.jpg?1783915032","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sigarda = (): CardDef => ({"oracleId":"e55104e2-4900-48de-b288-d3e6abd5e09e","name":"Sigarda, Host of Herons","manaCost":"{2}{G}{W}{W}","cmc":5,"typeLine":"Legendary Creature — Angel","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying, hexproof\nSpells and abilities your opponents control can't cause you to sacrifice permanents.","power":"5","toughness":"5","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Flying","Hexproof"],"imageUrl":"https://cards.scryfall.io/normal/front/f/e/feccd0e2-fae6-4ced-acdf-4252ed5c56e7.jpg?1783940655","artUrl":"https://cards.scryfall.io/art_crop/front/f/e/feccd0e2-fae6-4ced-acdf-4252ed5c56e7.jpg?1783940655","commanderLegal":"legal","set":"avr","releasedAt":"2012-05-04","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const tam = (): CardDef => ({"oracleId":"096a878e-cff0-430a-90b5-031ecb9bfe1b","name":"Tam, Mindful First-Year","manaCost":"{1}{G/U}","cmc":2,"typeLine":"Legendary Creature — Gorgon Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Gorgon","Wizard"],"oracleText":"Each other creature you control has hexproof from each of its colors.\n{T}: Target creature you control becomes all colors until end of turn.","power":"2","toughness":"2","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/c/6cb0f825-b75b-4f2a-803c-08142ca07e76.jpg?1783904402","artUrl":"https://cards.scryfall.io/art_crop/front/6/c/6cb0f825-b75b-4f2a-803c-08142ca07e76.jpg?1783904402","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hourglass = (): CardDef => ({"oracleId":"bf89bd6d-aa6c-4fd8-9278-151529ab0e62","name":"Hourglass of the Lost","manaCost":"{2}{W}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {W}. Put a time counter on this artifact.\n{T}, Remove X time counters from this artifact and exile it: Return each nonland permanent card with mana value X from your graveyard to the battlefield. Activate only as a sorcery.","colors":["W"],"colorIdentity":["W"],"keywords":[],"producedMana":["W"],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/147b0ab2-3ac8-425a-9e1d-7580de58235c.jpg?1783911414","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/147b0ab2-3ac8-425a-9e1d-7580de58235c.jpg?1783911414","commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const zuko = (): CardDef => ({"oracleId":"a129423d-c886-4120-96f7-c2517ea7eb83","name":"Fire Lord Zuko","manaCost":"{R}{W}{B}","cmc":3,"typeLine":"Legendary Creature — Human Noble Ally","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Noble","Ally"],"oracleText":"Firebending X, where X is Fire Lord Zuko's power. (Whenever this creature attacks, add X {R}. This mana lasts until end of combat.)\nWhenever you cast a spell from exile and whenever a permanent you control enters from exile, put a +1/+1 counter on each creature you control.","power":"2","toughness":"4","colors":["B","R","W"],"colorIdentity":["B","R","W"],"keywords":["Firebending"],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/e/6/e62d3bcc-7bb4-42be-90a9-caf3c1caa29d.jpg?1783904927","artUrl":"https://cards.scryfall.io/art_crop/front/e/6/e62d3bcc-7bb4-42be-90a9-caf3c1caa29d.jpg?1783904927","commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const damned = (): CardDef => ({"oracleId":"22e70ad0-1a9c-4d9e-8cc1-ebea485282ca","name":"The Lost and the Damned","manaCost":"{1}{U}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a land you control enters from anywhere other than your hand or you cast a spell from anywhere other than your hand, create a 3/3 red Spawn creature token.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9a53cf96-b47f-48f0-b9cc-3330ae546a87.jpg?1783920844","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9a53cf96-b47f-48f0-b9cc-3330ae546a87.jpg?1783920844","commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

/** A card in exile its owner may play this turn (as an impulse draw leaves it). */
const playableInExile = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = into(s, pid, def, "exile");
  s.objects[id]!.mayPlay = { player: pid, zc: s.objects[id]!.zoneChanges ?? 0, until: "thisTurn", turn: s.turn };
  invalidateCharacteristics(s);
  return id;
};
const flicker = card("Test Flicker", "Instant", "{W}", { cmc: 1, oracleText: "Exile target creature you control, then return that card to the battlefield under its owner's control." });
const ramp = card("Test Ramp", "Sorcery", "{G}", { cmc: 1, oracleText: "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle." });
const tokens = (s: GameState, sub: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes(sub)).length;
const boon = (): CardDef => ({"oracleId":"ce1e6ae2-78c1-4bc6-bb73-bb025dd67a90","name":"Historian's Boon","manaCost":"{3}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever this enchantment or another nontoken enchantment you control enters, create a 1/1 white Soldier creature token.\nWhenever the final chapter ability of a Saga you control triggers, create a 4/4 white Angel creature token with flying and vigilance.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0da48d1e-0dec-461a-9a1d-477408b297e6.jpg?1783921470","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0da48d1e-0dec-461a-9a1d-477408b297e6.jpg?1783921470","commanderLegal":"legal","set":"dmc","releasedAt":"2022-09-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sam = (): CardDef => ({"oracleId":"2837be10-23ad-49d2-943e-b1e00edbbbd9","name":"Sam, Loyal Attendant","manaCost":"{1}{G}{W}","cmc":3,"typeLine":"Legendary Creature — Halfling Peasant","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Halfling","Peasant"],"oracleText":"Partner with Frodo, Adventurous Hobbit (When this creature enters, target player may put Frodo into their hand from their library, then shuffle.)\nAt the beginning of combat on your turn, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nActivated abilities of Foods you control cost {1} less to activate.","power":"2","toughness":"4","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Partner with","Food","Partner"],"imageUrl":"https://cards.scryfall.io/normal/front/6/8/687a2b76-3f05-4732-bd9b-513d06d16300.jpg?1783916039","artUrl":"https://cards.scryfall.io/art_crop/front/6/8/687a2b76-3f05-4732-bd9b-513d06d16300.jpg?1783916039","commanderLegal":"legal","set":"ltc","releasedAt":"2023-06-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

/** Taps everything a player controls, then gives them exactly this mana. */
const poolOnly = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid) s.objects[id]!.tapped = true;
  Object.assign(s.players[pid]!.manaPool, mana);
};const grindstone = (): CardDef => ({"oracleId":"97560adc-814e-450c-9ca7-f9364e910a0b","name":"Grindstone","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{3}, {T}: Target player mills two cards. If two cards that share a color were milled this way, repeat this process.","colors":[],"colorIdentity":[],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a94e3f4b-3c21-494b-9335-b9c258de66c0.jpg?1783937244","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a94e3f4b-3c21-494b-9335-b9c258de66c0.jpg?1783937244","commanderLegal":"legal","set":"mps","releasedAt":"2016-09-30","rarity":"special","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"49a46cfa-f2e9-4718-a6cb-47dbb0792b56","name":"Crystalline Giant","manaCost":"{3}","cmc":3,"typeLine":"Artifact Creature — Giant","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Giant"],"oracleText":"At the beginning of combat on your turn, choose a kind of counter at random that this creature doesn't have on it from among flying, first strike, deathtouch, hexproof, lifelink, menace, reach, trample, vigilance, and +1/+1. Put a counter of that kind on this creature.","power":"3","toughness":"3","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/1/1146c418-2176-466e-8a06-f2ef6bf2b1a9.jpg?1783931007","artUrl":"https://cards.scryfall.io/art_crop/front/1/1/1146c418-2176-466e-8a06-f2ef6bf2b1a9.jpg?1783931007","commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const splendor = (): CardDef => ({"oracleId":"71a3d0ce-052b-41eb-a70f-0c716149a55f","name":"Sigarda's Splendor","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"As this enchantment enters, note your life total.\nAt the beginning of your upkeep, draw a card if your life total is greater than or equal to the last noted life total for this enchantment. Then note your life total.\nWhenever you cast a white spell, you gain 1 life.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/4/b452258c-ea76-46da-a6ff-14e27b3b03de.jpg?1783924458","artUrl":"https://cards.scryfall.io/art_crop/front/b/4/b452258c-ea76-46da-a6ff-14e27b3b03de.jpg?1783924458","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const duplication = (): CardDef => ({"oracleId":"efe7e212-5c91-42f0-9dff-591131b4f6d8","name":"Theoretical Duplication","manaCost":"{2}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Whenever a nontoken creature an opponent controls enters this turn, create a token that's a copy of that creature.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/5/1575a14e-fa70-44f0-8384-95cb90031337.jpg?1783927601","artUrl":"https://cards.scryfall.io/art_crop/front/1/5/1575a14e-fa70-44f0-8384-95cb90031337.jpg?1783927601","commanderLegal":"legal","set":"c21","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tracker = (): CardDef => ({"oracleId":"0171861e-98d5-4e58-834f-899d8ad7acea","name":"Topography Tracker","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Merfolk Scout","supertypes":[],"types":["Creature"],"subtypes":["Merfolk","Scout"],"oracleText":"When this creature enters, create a Map token. (It's an artifact with \"{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery.\")\nIf a creature you control would explore, instead it explores, then it explores again.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Explore"],"imageUrl":"https://cards.scryfall.io/normal/front/0/f/0f1686aa-6b34-4eb7-9811-bc1a8d8b46e9.jpg?1783913907","artUrl":"https://cards.scryfall.io/art_crop/front/0/f/0f1686aa-6b34-4eb7-9811-bc1a8d8b46e9.jpg?1783913907","commanderLegal":"legal","set":"lcc","releasedAt":"2023-11-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gorger = (): CardDef => ({"oracleId":"b6e36e77-0cea-4b7a-b968-774b1e74a992","name":"Phyrexian Soulgorger","manaCost":"{3}","cmc":3,"typeLine":"Snow Artifact Creature — Phyrexian Construct","supertypes":["Snow"],"types":["Artifact","Creature"],"subtypes":["Phyrexian","Construct"],"oracleText":"Cumulative upkeep—Sacrifice a creature. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)","power":"8","toughness":"8","colors":[],"colorIdentity":[],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/9/d/9d4325ea-2e84-4871-a8d6-a42b1d3d6765.jpg?1783943318","artUrl":"https://cards.scryfall.io/art_crop/front/9/d/9d4325ea-2e84-4871-a8d6-a42b1d3d6765.jpg?1783943318","commanderLegal":"legal","set":"csp","releasedAt":"2006-07-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const preserver = (): CardDef => ({"oracleId":"d12d4b54-a13a-46ba-b176-3aaa453ce3e2","name":"Tajuru Preserver","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Shaman","supertypes":[],"types":["Creature"],"subtypes":["Elf","Shaman"],"oracleText":"Spells and abilities your opponents control can't cause you to sacrifice permanents.","power":"2","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/8/c8d03346-0802-4058-b89e-1b6076963c8e.jpg?1783941958","artUrl":"https://cards.scryfall.io/art_crop/front/c/8/c8d03346-0802-4058-b89e-1b6076963c8e.jpg?1783941958","commanderLegal":"legal","set":"roe","releasedAt":"2010-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const zap = (n: number) => card(`Test Zap ${n}`, "Instant", "{R}", { cmc: 1, oracleText: `Test Zap ${n} deals ${n} damage to target creature.` });

describe("round 236: Ephara, God of the Polis", () => {
  it("is supported", () => supported(ephara()));

  it("draws at each upkeep after a turn in which another creature entered under your control, once however many", () => {
    let { s, ap, ids } = setup([bear(), bear({ name: "Test Second Bear" })]);
    putOnBattlefield(s, ap, ephara());
    s.players[ap]!.command = [];
    for (const id of ids) s = settle(run(s, planCast(s, ap, id)));
    expect(named(s, "Grizzly Bears")).toHaveLength(1);
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "upkeep", next);
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // The turn after: nothing entered under your control during the opponent's turn.
    const after = s.turnOrder[(s.turnOrder.indexOf(next) + 1) % 4]!;
    s = passUntil(s, "upkeep", after);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("doesn't count creatures that entered under an opponent's control", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, ephara());
    const b = into(s, ap, bear(), "hand");
    s.players[ap]!.command = [];
    s = settle(run(s, planCast(s, ap, b)));
    const hand = s.players[opp]!.hand.length;
    s = passUntil(s, "upkeep", opp);
    s = settle(s);
    expect(s.players[opp]!.hand.length).toBe(hand);
  });
});

describe("round 236: Tangled Colony", () => {
  it("is supported", () => supported(colony()));

  it("when it dies, creates a Rat that can't block for each damage dealt to it this turn", () => {
    let { s, ap } = setup([]);
    const c = putOnBattlefield(s, ap, colony());
    s = settle(run(s, planCast(s, ap, into(s, ap, zap(1), "hand"), [tgt(c)])));
    expect(s.objects[c]!.zone).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, into(s, ap, zap(3), "hand"), [tgt(c)])));
    expect(s.objects[c]!.zone).toBe("graveyard");
    const rats = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Rat"));
    expect(rats).toHaveLength(4);
    expect(controllerOf(s, s.objects[rats[0]!]!)).toBe(ap);
  });

  it("creates no Rats when it dies without being dealt damage", () => {
    let { s, ap } = setup([]);
    const c = putOnBattlefield(s, ap, colony());
    const kill = into(s, ap, card("Test Doom", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." }), "hand");
    s = settle(run(s, planCast(s, ap, kill, [tgt(c)])));
    expect(s.objects[c]!.zone).toBe("graveyard");
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken)).toHaveLength(0);
  });
});

describe("round 236: Sigarda, Host of Herons", () => {
  it("is supported, and Tajuru Preserver with the same line", () => supported(sigarda(), preserver()));

  const edict = card("Test Edict", "Sorcery", "{B}", { cmc: 1, oracleText: "Each opponent sacrifices a creature." });
  const allEdict = card("Test Pox", "Sorcery", "{B}", { cmc: 1, oracleText: "Each player sacrifices a creature." });
  const punish = card("Test Torment", "Sorcery", "{B}", { cmc: 1, oracleText: "Each opponent loses 3 life unless they sacrifice a creature." });
  const altar = card("Test Altar", "Artifact", "{0}", { oracleText: "Sacrifice a creature: Draw a card." });

  it("an opponent's edict doesn't make you sacrifice; other opponents still do", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, sigarda());
    const mine = putOnBattlefield(s, ap, bear());
    const third = s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!;
    const theirs = putOnBattlefield(s, third, bear({ name: "Test Other Bear" }));
    s = passUntil(s, "main1", opp);
    s.players[opp]!.manaPool.B = 1;
    s.players[opp]!.command = [];
    const e = into(s, opp, edict, "hand");
    s = settle(run(s, planCast(s, opp, e)), { me: opp });
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && characteristics(s, s.objects[id]!).types.includes("Creature"))).toHaveLength(2);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("you can't choose to sacrifice to an opponent's \"unless\": you lose the life", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, sigarda());
    const mine = putOnBattlefield(s, ap, bear());
    s = passUntil(s, "main1", opp);
    s.players[opp]!.manaPool.B = 1;
    s.players[opp]!.command = [];
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, opp, into(s, opp, punish, "hand"))), { me: opp });
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life - 3);
  });

  it("your own spells and costs still sacrifice", () => {
    let { s, ap } = setup([]);
    const sig = putOnBattlefield(s, ap, sigarda());
    const mine = putOnBattlefield(s, ap, bear());
    const a = putOnBattlefield(s, ap, altar);
    s = settle(run(s, planActivate(s, ap, a, 0, undefined, undefined, undefined, undefined, { sacrifice: [mine] })));
    expect(s.objects[mine]!.zone).toBe("graveyard");
    s = settle(run(s, planCast(s, ap, into(s, ap, allEdict, "hand"))), { me: ap });
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [sig] }), { me: ap });
    expect(s.objects[sig]!.zone).toBe("graveyard");
  });
});

describe("round 236: Tam, Mindful First-Year", () => {
  it("is supported", () => supported(tam()));

  it("each other creature you control has hexproof from each of its colors, as it is now", () => {
    let { s, ap, opp } = setup([]);
    const t = putOnBattlefield(s, ap, tam());
    const b = putOnBattlefield(s, ap, bear());
    const grey = putOnBattlefield(s, ap, card("Test Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" }));
    expect(characteristics(s, s.objects[b]!).keywords).toContain("Hexproof from green");
    expect(characteristics(s, s.objects[grey]!).keywords.filter((k) => /^Hexproof/.test(k))).toEqual([]);
    expect(characteristics(s, s.objects[t]!).keywords.filter((k) => /^Hexproof/.test(k))).toEqual([]);
    // Tam's ability: the bear becomes all colors, so it has hexproof from each of them.
    s = settle(run(s, planActivate(s, ap, t, 0, [tgt(b)])));
    expect(characteristics(s, s.objects[b]!).keywords.filter((k) => /^Hexproof from/.test(k)).sort()).toEqual(["Hexproof from black", "Hexproof from blue", "Hexproof from green", "Hexproof from red", "Hexproof from white"]);
    s = passUntil(s, "main1", opp);
    s.players[opp]!.manaPool.R = 1;
    s.players[opp]!.manaPool.G = 1;
    s.players[opp]!.command = [];
    // The turn is over: green only again. A green spell of an opponent's can't target it; a red one can.
    expect(characteristics(s, s.objects[b]!).keywords).not.toContain("Hexproof from red");
    const greenZap = card("Test Green Zap", "Instant", "{G}", { cmc: 1, oracleText: "Test Green Zap deals 1 damage to target creature." });
    expect(planCast(s, opp, into(s, opp, greenZap, "hand"), [tgt(b)])).toBeNull();
    expect(planCast(s, opp, into(s, opp, zap(1), "hand"), [tgt(b)])).not.toBeNull();
  });
});

describe("round 236: Hourglass of the Lost", () => {
  it("is supported", () => supported(hourglass()));

  it("removing X time counters returns each nonland permanent card with mana value X from your graveyard", () => {
    let { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, hourglass());
    s.objects[h]!.counters.time = 3;
    const two = into(s, ap, bear(), "graveyard");
    const relic = into(s, ap, card("Test Relic", "Artifact", "{2}", { cmc: 2 }), "graveyard");
    const three = into(s, ap, card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3" }), "graveyard");
    const spell = into(s, ap, card("Test Divination", "Sorcery", "{1}{U}", { cmc: 2, oracleText: "Draw two cards." }), "graveyard");
    const land = into(s, ap, forestCard, "graveyard");
    const i = abilitiesOf(s, s.objects[h]!).activated.findIndex((a) => /Return each/.test(a.text ?? ""));
    expect(i).toBeGreaterThanOrEqual(0);
    s = settle(run(s, planActivate(s, ap, h, i, [], undefined, undefined, 2)));
    expect(s.objects[h]!.zone).toBe("exile");
    expect(s.objects[two]!.zone).toBe("battlefield");
    expect(s.objects[relic]!.zone).toBe("battlefield");
    expect(s.objects[three]!.zone).toBe("graveyard");
    expect(s.objects[spell]!.zone).toBe("graveyard");
    expect(s.objects[land]!.zone).toBe("graveyard");
  });

  it("taps for {W} and gets a time counter", () => {
    let { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, hourglass());
    const i = abilitiesOf(s, s.objects[h]!).activated.findIndex((a) => /Add \{W\}/.test(a.text ?? ""));
    const plan = i >= 0 ? planActivate(s, ap, h, i) : null;
    if (plan) s = settle(run(s, plan));
    else s = act(s, { type: "activateMana", player: ap, objectId: h, mana: "W" } as Action);
    expect(s.objects[h]!.counters.time).toBe(1);
  });
});

describe("round 236: Fire Lord Zuko", () => {
  it("is supported", () => supported(zuko()));

  it("a spell cast from exile puts a +1/+1 counter on each creature you control; one from your hand doesn't", () => {
    let { s, ap } = setup([]);
    const z = putOnBattlefield(s, ap, zuko());
    const b = putOnBattlefield(s, ap, bear());
    s = settle(run(s, planCast(s, ap, into(s, ap, bear({ name: "Test Hand Bear" }), "hand"))));
    expect(s.objects[z]!.counters["+1/+1"] ?? 0).toBe(0);
    const e = playableInExile(s, ap, bear({ name: "Test Exiled Bear" }));
    s = settle(run(s, planCast(s, ap, e)));
    expect(s.objects[z]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    // The spell was still on the stack as the trigger resolved; it enters from the stack, not from exile.
    expect(s.objects[e]!.zone).toBe("battlefield");
    expect(s.objects[e]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("a permanent you control entering from exile puts a counter on each creature you control, itself included", () => {
    let { s, ap } = setup([]);
    const z = putOnBattlefield(s, ap, zuko());
    const b = putOnBattlefield(s, ap, bear());
    s = settle(run(s, planCast(s, ap, into(s, ap, flicker, "hand"), [tgt(b)])));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[z]!.counters["+1/+1"]).toBe(1);
  });
});

describe("round 236: The Lost and the Damned", () => {
  it("is supported", () => supported(damned()));

  it("a land entering from your library makes a Spawn; a land played from your hand doesn't", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, damned());
    const l = into(s, ap, forestCard, "hand");
    s = settle(act(s, { type: "playLand", player: ap, objectId: l }));
    expect(tokens(s, "Spawn")).toBe(0);
    s = settle(run(s, planCast(s, ap, into(s, ap, ramp, "hand"))), { me: ap });
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: s.pending.cards.slice(0, 1) }), { me: ap });
    expect(tokens(s, "Spawn")).toBe(1);
  });

  it("a spell cast from exile makes a Spawn; one cast from your hand doesn't", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, damned());
    s = settle(run(s, planCast(s, ap, into(s, ap, bear(), "hand"))));
    expect(tokens(s, "Spawn")).toBe(0);
    s = settle(run(s, planCast(s, ap, playableInExile(s, ap, bear({ name: "Test Exiled Bear" })))));
    expect(tokens(s, "Spawn")).toBe(1);
  });
});

describe("round 236: Historian's Boon", () => {
  it("is supported", () => supported(boon()));

  const saga = card("Test Chronicle", "Enchantment — Saga", "{1}{W}", { oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after II.)\nI — You gain 1 life.\nII — You gain 2 life." });

  it("makes an Angel when the final chapter ability of a Saga you control triggers, not an earlier one", () => {
    let { s, ap } = setup([]);
    s = settle(run(s, planCast(s, ap, into(s, ap, boon(), "hand"))));
    expect(tokens(s, "Soldier")).toBe(1);
    const sg = putOnBattlefield(s, ap, saga);
    putCounters(s, s.objects[sg]!, "lore", 1);
    s = settle(s);
    expect(tokens(s, "Angel")).toBe(0);
    putCounters(s, s.objects[sg]!, "lore", 1);
    s = settle(s);
    expect(tokens(s, "Angel")).toBe(1);
  });

  it("an opponent's Saga doesn't count", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, boon());
    const sg = putOnBattlefield(s, opp, saga);
    s.objects[sg]!.counters.lore = 1;
    putCounters(s, s.objects[sg]!, "lore", 1);
    s = settle(s);
    expect(tokens(s, "Angel")).toBe(0);
  });
});

describe("round 236: Sam, Loyal Attendant", () => {
  it("is supported", () => supported(sam()));

  it("makes a Food at the beginning of combat on your turn, and Foods' abilities cost {1} less", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, sam());
    s = settle(passUntil(s, "beginCombat", ap));
    const food = s.battlefield.find((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Food"))!;
    expect(food).toBeDefined();
    poolOnly(s, ap, { C: 1 });
    s.objects[food]!.tapped = false;
    const life = s.players[ap]!.life;
    s = settle(run(s, planActivate(s, ap, food, 0)));
    expect(s.players[ap]!.life).toBe(life + 3);
    expect(s.players[ap]!.manaPool.C ?? 0).toBe(0);
  });

  it("an opponent's Food costs the full {2}", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, sam());
    const food = putOnBattlefield(s, ap, card("Test Food", "Artifact — Food", "", { oracleText: "{2}, {T}, Sacrifice this artifact: You gain 3 life." }));
    poolOnly(s, ap, { C: 1 });
    expect(planActivate(s, ap, food, 0)).toBeNull();
  });
});

describe("round 236: Grindstone", () => {
  it("is supported", () => supported(grindstone()));

  const colored = (name: string, cost: string) => card(name, "Sorcery", cost, { cmc: 1 });

  it("repeats while the two cards milled share a color", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, grindstone());
    // Top to bottom: red, red and white (share red), white, blue (share none): four milled.
    const order = [colored("Test Red A", "{R}"), colored("Test Boros", "{R}{W}"), colored("Test White", "{W}"), colored("Test Blue", "{U}"), colored("Test Black", "{B}")];
    const ids = [...order].reverse().map((d) => into(s, opp, d, "library")).reverse();
    s = settle(run(s, planActivate(s, ap, g, 0, [{ kind: "player", id: opp }])));
    expect(ids.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard", "graveyard", "library"]);
  });

  it("two colorless cards don't share a color", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, grindstone());
    const ids = [colored("Test Relic A", "{1}"), colored("Test Relic B", "{2}"), colored("Test Red B", "{R}")].reverse().map((d) => into(s, opp, d, "library")).reverse();
    s = settle(run(s, planActivate(s, ap, g, 0, [{ kind: "player", id: opp }])));
    expect(ids.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "library"]);
  });
});

describe("round 236: Crystalline Giant", () => {
  it("is supported", () => supported(giant()));

  const KINDS = ["flying", "first strike", "deathtouch", "hexproof", "lifelink", "menace", "reach", "trample", "vigilance", "+1/+1"];

  it("at the beginning of combat on your turn, puts a counter of a kind it doesn't have on it", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, giant());
    // Nine kinds already: the tenth is the only one left.
    for (const k of KINDS.slice(0, 9)) s.objects[g]!.counters[k] = 1;
    invalidateCharacteristics(s);
    s = settle(passUntil(s, "beginCombat", ap));
    expect(s.objects[g]!.counters["+1/+1"]).toBe(1);
    expect(KINDS.every((k) => s.objects[g]!.counters[k] === 1)).toBe(true);
    expect(characteristics(s, s.objects[g]!).keywords).toEqual(expect.arrayContaining(["Flying", "Trample", "Vigilance"]));
  });

  it("with every kind already, it puts none", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, giant());
    for (const k of KINDS) s.objects[g]!.counters[k] = 1;
    invalidateCharacteristics(s);
    s = settle(passUntil(s, "beginCombat", ap));
    expect(KINDS.every((k) => s.objects[g]!.counters[k] === 1)).toBe(true);
  });

  it("a fresh one gets exactly one counter of a listed kind", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, giant());
    s = settle(passUntil(s, "beginCombat", ap));
    const got = Object.entries(s.objects[g]!.counters).filter(([, n]) => (n ?? 0) > 0);
    expect(got).toHaveLength(1);
    expect(KINDS).toContain(got[0]![0]);
  });
});

describe("round 236: Sigarda's Splendor", () => {
  it("is supported", () => supported(splendor()));

  it("notes your life as it enters; draws at upkeep only with at least that much life, noting it again each time", () => {
    let { s, ap } = setup([]);
    s.players[ap]!.command = [];
    s.players[ap]!.life = 30;
    const sp = into(s, ap, splendor(), "hand");
    s = settle(run(s, planCast(s, ap, sp)));
    expect(s.objects[sp]!.notedLife).toBe(30);
    // Life went down: no card, and 25 is noted.
    s.players[ap]!.life = 25;
    s = passUntil(s, "upkeep", ap);
    let hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.objects[sp]!.notedLife).toBe(25);
    // The same life the next time: a card.
    s = passUntil(s, "draw", ap);
    s = passUntil(s, "upkeep", ap);
    hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("casting a white spell gains you 1 life", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, splendor());
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, into(s, ap, card("Test White Bear", "Creature — Bear", "{1}{W}", { power: "2", toughness: "2" }), "hand"))));
    expect(s.players[ap]!.life).toBe(life + 1);
  });
});

describe("round 236: Theoretical Duplication", () => {
  it("is supported", () => supported(duplication()));

  it("this turn, each nontoken creature entering under an opponent's control gives you a token copy of it", () => {
    let { s, ap, opp } = setup([]);
    s = settle(run(s, planCast(s, ap, into(s, ap, duplication(), "hand"))));
    const theirs = into(s, opp, bear({ name: "Test Opposing Bear" }), "hand");
    moveObject(s, theirs, "battlefield");
    s = settle(s);
    const copies = named(s, "Test Opposing Bear").filter((id) => s.objects[id]!.isToken);
    expect(copies).toHaveLength(1);
    expect(controllerOf(s, s.objects[copies[0]!]!)).toBe(ap);
    // Your own creature doesn't count.
    const mine = into(s, ap, bear({ name: "Test My Bear" }), "hand");
    moveObject(s, mine, "battlefield");
    s = settle(s);
    expect(named(s, "Test My Bear")).toHaveLength(1);
  });

  it("ends with the turn", () => {
    let { s, ap, opp } = setup([]);
    s = settle(run(s, planCast(s, ap, into(s, ap, duplication(), "hand"))));
    s = passUntil(s, "main1", opp);
    const theirs = into(s, opp, bear({ name: "Test Opposing Bear" }), "hand");
    moveObject(s, theirs, "battlefield");
    s = settle(s);
    expect(named(s, "Test Opposing Bear")).toHaveLength(1);
  });
});

describe("round 236: Topography Tracker", () => {
  it("is supported", () => supported(tracker()));

  it("makes a Map; a creature you control that would explore explores twice", () => {
    let { s, ap } = setup([]);
    s = settle(run(s, planCast(s, ap, into(s, ap, tracker(), "hand"))));
    const map = s.battlefield.find((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Map"))!;
    expect(map).toBeDefined();
    const b = putOnBattlefield(s, ap, bear());
    const lands = [into(s, ap, forestCard, "library"), into(s, ap, forestCard, "library")];
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, map, 0, [tgt(b)])));
    expect(lands.map((id) => s.objects[id]!.zone)).toEqual(["hand", "hand"]);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("a nonland card left on top is revealed again by the second explore: two counters", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, tracker());
    const b = putOnBattlefield(s, ap, bear());
    const top = into(s, ap, bear({ name: "Test Top Bear" }), "library");
    const scout = card("Test Scout", "Sorcery", "{G}", { cmc: 1, oracleText: "Target creature you control explores." });
    s = run(s, planCast(s, ap, into(s, ap, scout, "hand"), [tgt(b)]));
    s = settle(s, { may: false });
    expect(s.objects[top]!.zone).toBe("library");
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
  });

  it("two Trackers: four times", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, tracker());
    putOnBattlefield(s, ap, tracker());
    const b = putOnBattlefield(s, ap, bear());
    into(s, ap, bear({ name: "Test Top Bear" }), "library");
    const scout = card("Test Scout", "Sorcery", "{G}", { cmc: 1, oracleText: "Target creature you control explores." });
    s = settle(run(s, planCast(s, ap, into(s, ap, scout, "hand"), [tgt(b)])), { may: false });
    expect(s.objects[b]!.counters["+1/+1"]).toBe(4);
  });
});

describe("round 236: Phyrexian Soulgorger", () => {
  it("is supported", () => supported(gorger()));

  /** To `ap`'s next upkeep, with its cumulative upkeep trigger waiting on the stack. */
  const nextUpkeep = (s: GameState, ap: PlayerId) => passUntil(passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!), "upkeep", ap);

  it("sacrifices a different creature for each age counter to stay; with too few, it's sacrificed", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, gorger());
    const a = putOnBattlefield(s, ap, bear());
    const b = putOnBattlefield(s, ap, bear({ name: "Test Second Bear" }));
    s = nextUpkeep(s, ap);
    s = settle(s, { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", labels: ["Sacrifice a creature", "Don't"], prompt: "Sacrifice a creature? If you don't, sacrifice Phyrexian Soulgorger (cumulative upkeep)." });
    s = act(s, { type: "chooseOption", player: ap, choice: "0" });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "sacrifice" });
    expect((s.pending as { options: string[] }).options).toEqual(expect.arrayContaining([g, a, b]));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [a] }), { me: ap });
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.objects[g]!.counters.age).toBe(1);
    // Two age counters: two creatures, and only the Soulgorger and one bear are left, so both of them it is, or it goes.
    s = nextUpkeep(s, ap);
    s = settle(s, { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", labels: ["Sacrifice 2 creatures", "Don't"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }), { me: ap });
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("with too few creatures to sacrifice, there's no choice: it's sacrificed", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, gorger());
    s.objects[g]!.counters.age = 1;
    s = nextUpkeep(s, ap);
    s = settle(s, { me: ap });
    // Two creatures needed, only itself: no choice, it's sacrificed.
    expect(s.pending ?? undefined).toBeUndefined();
    expect(s.objects[g]!.zone).toBe("graveyard");
  });
});
