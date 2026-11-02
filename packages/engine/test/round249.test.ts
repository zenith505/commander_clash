// Round 249: the top of the popularity list. Pox ("a third ... Round up each time", CR 107.1a), Ellie, Brick Master (a
// named token "that's attacking that opponent"), Azula, Ruthless Firebender ("for each player who discarded a card this
// turn"), Sibylline Soothsayer (reveal until a nonland card with mana value 3 or greater, suspended, CR 702.62), Nissa,
// Leyline Tamer ("if this is the first time this ability has resolved this turn ... onto the battlefield"), Scholarship
// Sponsor (each player behind the most lands searches for up to the difference, rulings), Unexpected Request (an
// Equipment attached this way is unattached at the next end step), Malik, Grim Manipulator (secret choices, then that
// player sacrifices them), Ormos, Archive Keeper (a draw from an empty library replaced, CR 614.1a; a discard cost with
// different names) and Neyam Shai Murad (that player chooses a permanent card in your graveyard).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, defOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
/** Everyone passes until the stack is empty, answering trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** As settle, but the bots' answers for every question (whoever is asked). */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = s.pending ? botActions(s, pid).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: pid });
  }
  return s;
};
const named = (s: GameState, name: string, pid?: PlayerId) => s.battlefield.filter((id) => defOf(s, s.objects[id]!).name === name && (pid === undefined || s.objects[id]!.controller === pid));
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).types.includes("Land")).length;

// Real oracle text (Scryfall).
const pox = (): CardDef => ({"oracleId":"539d7c1a-b5e9-4204-9109-ddb2e8dec168","name":"Pox","manaCost":"{B}{B}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player loses a third of their life, then discards a third of the cards in their hand, then sacrifices a third of the creatures they control of their choice, then sacrifices a third of the lands they control of their choice. Round up each time.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a914138c-a593-414c-bbcb-83d3c1bc4f6f.jpg?1783947495","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a914138c-a593-414c-bbcb-83d3c1bc4f6f.jpg?1783947495","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ellie = (): CardDef => ({"oracleId":"299ff264-c6db-4b48-88fb-ca006cb84f88","name":"Ellie, Brick Master","manaCost":"{1}{R}","cmc":2,"typeLine":"Legendary Creature — Human Survivor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Survivor"],"oracleText":"Distract the Horde — Whenever a player attacks one of your opponents, that attacking player creates a tapped 1/1 black Fungus Zombie creature token named Cordyceps Infected that's attacking that opponent.\nPartner—Survivors (You can have two commanders if both have this ability.)","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Distract the Horde","Partner"],"imageUrl":"https://cards.scryfall.io/normal/front/e/9/e973462f-589d-4c53-81d7-075ec1d5a9b4.jpg?1783905138","artUrl":"https://cards.scryfall.io/art_crop/front/e/9/e973462f-589d-4c53-81d7-075ec1d5a9b4.jpg?1783905138","commanderLegal":"legal","set":"sld","releasedAt":"2025-10-27","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const azula = (): CardDef => ({"oracleId":"7139ead5-86f0-46ae-8a6d-ad66d0408f73","name":"Azula, Ruthless Firebender","manaCost":"{2}{B}","cmc":3,"typeLine":"Legendary Creature — Human Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Noble"],"oracleText":"Firebending 1 (Whenever this creature attacks, add {R}. This mana lasts until end of combat.)\nWhenever Azula attacks, you may discard a card. Then you get an experience counter for each player who discarded a card this turn.\n{2}{B}: Until end of turn, Azula gets +1/+1 for each experience counter you have and gains menace.","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Firebending"],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/c/1/c1aab711-c113-458c-848e-9369c0149d61.jpg?1783904827","artUrl":"https://cards.scryfall.io/art_crop/front/c/1/c1aab711-c113-458c-848e-9369c0149d61.jpg?1783904827","commanderLegal":"legal","set":"tle","releasedAt":"2025-11-21","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const soothsayer = (): CardDef => ({"oracleId":"70718e4a-c3c2-4fcd-96f8-98cd7fee257c","name":"Sibylline Soothsayer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Warlock","supertypes":[],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"Temporal Foresight — When this creature enters, reveal cards from the top of your library until you reveal a nonland card with mana value 3 or greater. Exile that card with three time counters on it. If it doesn't have suspend, it gains suspend. Put the rest of the revealed cards on the bottom of your library in a random order.","power":"3","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Temporal Foresight"],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/145daf0b-55a3-45a9-b653-e6e4a461d629.jpg?1783914649","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/145daf0b-55a3-45a9-b653-e6e4a461d629.jpg?1783914649","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const nissa = (): CardDef => ({"oracleId":"6067b8d0-5b00-402c-967d-e35a1304fafc","name":"Nissa, Leyline Tamer","manaCost":"{3}{W}{U}{B}{R}","cmc":7,"typeLine":"Legendary Creature — Elf Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Wizard"],"oracleText":"Deathtouch, vigilance\nLandfall — Whenever a land you control enters, draw a card. Then if this is the first time this ability has resolved this turn, reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.","power":"5","toughness":"5","colors":["B","R","U","W"],"colorIdentity":["B","R","U","W"],"keywords":["Vigilance","Deathtouch","Landfall"],"imageUrl":"https://cards.scryfall.io/normal/front/e/9/e969d1f3-9595-498b-81cb-6cf4df2cad5d.jpg?1789644323","artUrl":"https://cards.scryfall.io/art_crop/front/e/9/e969d1f3-9595-498b-81cb-6cf4df2cad5d.jpg?1789644323","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const sponsor = (): CardDef => ({"oracleId":"21e3895b-f6b6-48af-9161-71b422818004","name":"Scholarship Sponsor","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Human Advisor","supertypes":[],"types":["Creature"],"subtypes":["Human","Advisor"],"oracleText":"When this creature enters, each player who controls fewer lands than the player who controls the most lands searches their library for a number of basic land cards less than or equal to the difference, puts those cards onto the battlefield tapped, then shuffles.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/d/ed238d90-72b5-44c4-bea7-20f71788088f.jpg?1783927605","artUrl":"https://cards.scryfall.io/art_crop/front/e/d/ed238d90-72b5-44c4-bea7-20f71788088f.jpg?1783927605","commanderLegal":"legal","set":"c21","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const request = (): CardDef => ({"oracleId":"f4497af5-8b81-46b3-bb52-eaed1999809b","name":"Unexpected Request","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. You may attach an Equipment you control to that creature. If you do, unattach it at the beginning of the next end step.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/2/0265fd20-a85d-49ce-b338-4c40843a5b18.jpg?1783906594","artUrl":"https://cards.scryfall.io/art_crop/front/0/2/0265fd20-a85d-49ce-b338-4c40843a5b18.jpg?1783906594","commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const malik = (): CardDef => ({"oracleId":"416608a1-89a4-44ce-8fd0-fab6b023d3d4","name":"Malik, Grim Manipulator","manaCost":"{2}{R}{W}{B}","cmc":5,"typeLine":"Legendary Creature — Human Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"When Malik, Grim Manipulator enters, you and target opponent each secretly choose a creature that player controls. Then those choices are revealed, and that player sacrifices those creatures.\nWhenever an opponent sacrifices a creature, you create a Treasure token.","power":"4","toughness":"3","colors":["B","R","W"],"colorIdentity":["B","R","W"],"keywords":["Treasure"],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5cf4fee3-3059-4ca4-a47d-0848410b294d.jpg?1783915138","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5cf4fee3-3059-4ca4-a47d-0848410b294d.jpg?1783915138","commanderLegal":"legal","set":"slx","releasedAt":"2023-09-08","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const ormos = (): CardDef => ({"oracleId":"06d60b71-a9f9-4a7f-ad69-15d760b6e5c3","name":"Ormos, Archive Keeper","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Legendary Creature — Sphinx","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Sphinx"],"oracleText":"Flying\nIf you would draw a card while your library has no cards in it, instead put five +1/+1 counters on Ormos.\n{1}{U}{U}, Discard three cards with different names: Draw five cards.","power":"5","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/7/1/711412f1-9ab3-48b6-91a4-77232b416a32.jpg?1783930506","artUrl":"https://cards.scryfall.io/art_crop/front/7/1/711412f1-9ab3-48b6-91a4-77232b416a32.jpg?1783930506","commanderLegal":"legal","set":"jmp","releasedAt":"2020-07-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const neyam = (): CardDef => ({"oracleId":"9466cfc1-a8fe-44a0-abd2-5d2dfe7110e0","name":"Neyam Shai Murad","manaCost":"{2}{W}{B}","cmc":4,"typeLine":"Legendary Creature — Human Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"Rogue Trader — Whenever Neyam Shai Murad deals combat damage to a player, you may have that player return target permanent card from their graveyard to their hand. If you do, that player chooses a permanent card in your graveyard, then you put it onto the battlefield under your control.","power":"3","toughness":"3","colors":["B","W"],"colorIdentity":["B","W"],"keywords":["Rogue Trader"],"imageUrl":"https://cards.scryfall.io/normal/front/2/1/211fdfd5-af23-4a16-a80f-1d9ba5ccd255.jpg?1783920839","artUrl":"https://cards.scryfall.io/art_crop/front/2/1/211fdfd5-af23-4a16-a80f-1d9ba5ccd255.jpg?1783920839","commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const mindRot = card("Test Mind Rot", "Sorcery", "{B}", { oracleText: "Target player discards a card." });
const extraLand = card("Test Extra Land", "Sorcery", "{G}", { oracleText: "You may play an additional land this turn." });
const sword = card("Test Sword", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +2/+0.\nEquip {2}" });
const opt = card("Test Opt", "Instant", "{U}", { oracleText: "Draw a card." });
const big = card("Test Big Spell", "Sorcery", "{3}{R}", { oracleText: "Test Big Spell deals 3 damage to any target." });
const cheap = card("Test Cheap Spell", "Instant", "{1}{R}", { oracleText: "Test Cheap Spell deals 1 damage to any target." });
const land = card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });
const beast = card("Test Beast", "Creature — Beast", "{4}{G}", { power: "5", toughness: "5" });
const relic = card("Test Relic", "Artifact", "{2}", { oracleText: "{T}: Add {C}." });

describe("round 249", () => {
  it("every card of the round compiles fully", () => {
    supported(pox(), ellie(), azula(), soothsayer(), nissa(), sponsor(), request(), malik(), ormos(), neyam());
  });

  it("Pox: each player loses a third of their life, then discards, sacrifices creatures and lands, each a third rounded up", () => {
    const { s: s0, ap, opp, ids } = setup([pox(), opt, opt, opt, opt]);
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, opp, bear());
    for (let i = 0; i < 5; i++) into(s0, opp, opt, "hand");
    s0.players[opp]!.life = 40;
    s0.players[ap]!.life = 5;
    s0.players[ap]!.manaPool.B = 3;
    const oppHand = s0.players[opp]!.hand.length;
    const myHand = s0.players[ap]!.hand.length - 1; // Pox itself is on the stack
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settleBots(s);
    expect(s.players[opp]!.life).toBe(26); // 40 - 14
    expect(s.players[ap]!.life).toBe(3); // 5 - 2 (rulings)
    expect(s.players[opp]!.hand.length).toBe(oppHand - Math.ceil(oppHand / 3));
    expect(s.players[ap]!.hand.length).toBe(myHand - Math.ceil(myHand / 3));
    expect(named(s, "Grizzly Bears", opp).length).toBe(2); // four creatures: two sacrificed
    expect(lands(s, ap)).toBe(14 - 5); // fourteen lands: five sacrificed
  });

  it("Ellie, Brick Master: a player attacking one of your opponents creates a tapped Cordyceps Infected attacking that opponent", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, ellie());
    const attacker = putOnBattlefield(s0, opp, bear());
    let s = passUntil(s0, "declareAttackers", opp);
    const victim = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker, defender: victim }] });
    s = settle(s);
    const tokens = named(s, "Cordyceps Infected");
    expect(tokens.length).toBe(1);
    const t = s.objects[tokens[0]!]!;
    expect(t.controller).toBe(opp);
    expect(t.tapped).toBe(true);
    expect(t.attacking).toBe(victim);
    expect(characteristics(s, t).subtypes).toEqual(["Fungus", "Zombie"]);
    expect(pt(s, t.id)).toBe("1/1");
    // Attacking you (Ellie's controller) isn't attacking one of your opponents.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    putOnBattlefield(s1, ap1, ellie());
    const a1 = putOnBattlefield(s1, opp1, bear());
    let s2 = passUntil(s1, "declareAttackers", opp1);
    s2 = settle(act(s2, { type: "declareAttackers", player: opp1, attacks: [{ attacker: a1, defender: ap1 }] }));
    expect(named(s2, "Cordyceps Infected").length).toBe(0);
  });

  it("Azula, Ruthless Firebender: an experience counter for each player who discarded a card this turn; +1/+1 for each and menace", () => {
    const { s: s0, ap, opp, ids } = setup([mindRot, opt, opt]);
    const az = putOnBattlefield(s0, ap, azula());
    for (let i = 0; i < 2; i++) into(s0, opp, opt, "hand");
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = settleBots(s);
    expect(s.players[opp]!.graveyard.length).toBe(1);
    s = passUntil(s, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: az, defender: opp }] });
    s = settle(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: [ids[1]!] });
    s = settle(s);
    expect(s.players[ap]!.experience).toBe(2); // the opponent and you
    s.players[ap]!.manaPool.B = 1;
    s.players[ap]!.manaPool.C = 2;
    s = settle(run(s, planActivate(s, ap, az, 0)));
    expect(pt(s, az)).toBe("5/5");
    expect(characteristics(s, s.objects[az]!).keywords).toContain("Menace");
  });

  it("Azula: declining to discard, only the players who discarded count", () => {
    const { s: s0, ap, opp } = setup([opt]);
    const az = putOnBattlefield(s0, ap, azula());
    let s = passUntil(s0, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: az, defender: opp }] });
    s = settle(s);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.players[ap]!.experience ?? 0).toBe(0);
  });

  it("Sibylline Soothsayer: the first nonland card with mana value 3 or greater is exiled with three time counters and gains suspend", () => {
    const { s: s0, ap, ids } = setup([soothsayer()]);
    const bigId = into(s0, ap, big, "library");
    const cheapId = into(s0, ap, cheap, "library");
    const landId = into(s0, ap, land, "library");
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    const o = s.objects[bigId]!;
    expect(o.zone).toBe("exile");
    expect(o.counters.time).toBe(3);
    expect(o.gainedSuspend).toBeDefined();
    const lib = s.players[ap]!.library;
    expect(lib.slice(-2).sort()).toEqual([cheapId, landId].sort());
  });

  it("Nissa, Leyline Tamer: each landfall draws; only the first resolution each turn puts the first creature card revealed onto the battlefield", () => {
    const { s: s0, ap, ids } = setup([land, land, extraLand]);
    putOnBattlefield(s0, ap, nissa());
    const beastId = into(s0, ap, beast, "library");
    const sorc = into(s0, ap, opt, "library");
    const top = into(s0, ap, opt, "library");
    const hand = s0.players[ap]!.hand.length;
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }));
    expect(s.objects[top]!.zone).toBe("hand");
    expect(s.objects[beastId]!.zone).toBe("battlefield");
    expect(s.players[ap]!.library[s.players[ap]!.library.length - 1]).toBe(sorc);
    s = settle(run(s, planCast(s, ap, ids[2]!)));
    const before = s.battlefield.length;
    s = settle(act(s, { type: "playLand", player: ap, objectId: ids[1]! }));
    expect(s.players[ap]!.hand.length).toBe(hand - 3 + 2); // two lands and the spell out, two draws in
    expect(s.battlefield.length).toBe(before + 1); // only the land
  });

  it("Scholarship Sponsor: each player behind the most lands searches for up to the difference; the leader doesn't search", () => {
    const { s: s0, ap, ids } = setup([sponsor()]);
    const [, b, c, d] = [ap, ...s0.turnOrder.filter((p) => p !== ap)] as PlayerId[];
    for (let i = 0; i < 16; i++) putOnBattlefield(s0, b!, land); // the most: 16
    for (let i = 0; i < 13; i++) putOnBattlefield(s0, c!, land); // 3 behind
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const asked: Record<string, number> = {};
    for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "searchLibrary") {
        asked[p.player] = p.max;
        s = act(s, { type: "searchLibrary", player: p.player, found: p.cards.slice(0, p.max) });
      } else if (p) s = botActions(s, waitingOn(s)!).reduce((x, a) => act(x, a), s);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked[b!]).toBeUndefined();
    expect(asked[ap]).toBe(2); // 14 lands
    expect(asked[c!]).toBe(3);
    expect(asked[d!]).toBe(16);
    expect(lands(s, ap)).toBe(16);
    expect(lands(s, c!)).toBe(16);
    expect(lands(s, d!)).toBe(16);
    expect(lands(s, b!)).toBe(16);
    // Put onto the battlefield tapped.
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === d && !s.objects[id]!.tapped).length).toBe(0);
  });

  it("Unexpected Request: steal, untap and haste; an Equipment you attach is unattached at the beginning of the next end step", () => {
    const { s: s0, ap, opp, ids } = setup([request()]);
    const theirs = putOnBattlefield(s0, opp, bear());
    s0.objects[theirs]!.tapped = true;
    const eq = putOnBattlefield(s0, ap, sword);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attachWhich" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: eq }));
    expect(s.objects[theirs]!.controller === ap || characteristics(s, s.objects[theirs]!).controller === ap).toBe(true);
    expect(s.objects[theirs]!.tapped).toBe(false);
    expect(characteristics(s, s.objects[theirs]!).keywords).toContain("Haste");
    expect(s.objects[eq]!.attachedTo).toBe(theirs);
    expect(pt(s, theirs)).toBe("4/2");
    s = passUntil(s, "end");
    s = settle(s);
    expect(s.objects[eq]!.attachedTo).toBeUndefined();
    expect(s.objects[eq]!.zone).toBe("battlefield");
  });

  it("Unexpected Request: attaching nothing sets up nothing", () => {
    const { s: s0, ap, opp, ids } = setup([request()]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const eq = putOnBattlefield(s0, ap, sword);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)])));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(s.objects[eq]!.attachedTo).toBeUndefined();
    expect(s.delayed?.length ?? 0).toBe(0);
  });

  it("Malik, Grim Manipulator: you and the target opponent each secretly choose one of their creatures; both are sacrificed, and you get Treasures", () => {
    const { s: s0, ap, opp, ids } = setup([malik()]);
    const a = putOnBattlefield(s0, opp, bear({ name: "Test Alpha" }));
    const b = putOnBattlefield(s0, opp, bear({ name: "Test Beta" }));
    const c = putOnBattlefield(s0, opp, bear({ name: "Test Gamma" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { targets: [{ kind: "player", id: opp }] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, secret: "theirs", of: opp });
    const logged = s.log.length;
    s = act(s, { type: "pickPermanents", player: ap, ids: [a] });
    // Your choice isn't shown before they choose.
    expect(s.log.slice(logged).join(" ")).not.toMatch(/Test Alpha/);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, secret: "own" });
    s = act(s, { type: "pickPermanents", player: opp, ids: [b] });
    s = settle(s);
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[c]!.zone).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).subtypes.includes("Treasure")).length).toBe(2);
  });

  it("Malik: the same creature chosen by both is sacrificed alone; the bots choose their best and their worst", () => {
    const { s: s0, ap, opp, ids } = setup([malik()]);
    const small = putOnBattlefield(s0, opp, bear({ name: "Test Small", power: "1", toughness: "1" }));
    const huge = putOnBattlefield(s0, opp, bear({ name: "Test Huge", power: "8", toughness: "8" }));
    const mid = putOnBattlefield(s0, opp, bear({ name: "Test Mid", power: "3", toughness: "3" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { targets: [{ kind: "player", id: opp }] });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [huge] }));
    s = settle(botActions(s, opp).reduce((x, a2) => act(x, a2), s));
    expect(s.objects[huge]!.zone).toBe("graveyard");
    expect(s.objects[small]!.zone).toBe("graveyard"); // their least useful
    expect(s.objects[mid]!.zone).toBe("battlefield");
    // The bot as Malik's controller takes the opponent's biggest.
    const { s: t0, ap: tap, opp: topp, ids: tids } = setup([malik()]);
    const tSmall = putOnBattlefield(t0, topp, bear({ name: "Test Small", power: "1", toughness: "1" }));
    const tHuge = putOnBattlefield(t0, topp, bear({ name: "Test Huge", power: "8", toughness: "8" }));
    let t = settle(run(t0, planCast(t0, tap, tids[0]!)), { targets: [{ kind: "player", id: topp }] });
    t = botActions(t, tap).reduce((x, a2) => act(x, a2), t);
    t = settle(act(t, { type: "pickPermanents", player: topp, ids: [tHuge] }));
    expect(t.objects[tHuge]!.zone).toBe("graveyard");
    expect(t.objects[tSmall]!.zone).toBe("battlefield");
  });

  it("Ormos, Archive Keeper: a draw from an empty library puts five +1/+1 counters on it instead, and the game goes on", () => {
    const { s: s0, ap, ids } = setup([opt]);
    const o = putOnBattlefield(s0, ap, ormos());
    for (const id of s0.players[ap]!.library) delete s0.objects[id];
    s0.players[ap]!.library = [];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[o]!.counters["+1/+1"]).toBe(5);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(s.players[ap]!.lost).toBeFalsy();
  });

  it("Ormos: its activated ability needs three cards with different names to discard", () => {
    const { s: s0, ap, ids } = setup([opt, opt, mindRot, extraLand]);
    const o = putOnBattlefield(s0, ap, ormos());
    s0.players[ap]!.manaPool.U = 2;
    s0.players[ap]!.manaPool.C = 1;
    // Two Test Opts: not different names.
    expect(() => run(s0, [{ type: "activateAbility", player: ap, objectId: o, index: 0, targets: [], costs: { discard: [ids[0]!, ids[1]!, ids[2]!] } }])).toThrow(/different names/);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, [{ type: "activateAbility", player: ap, objectId: o, index: 0, targets: [], costs: { discard: [ids[0]!, ids[2]!, ids[3]!] } }]));
    expect(s.players[ap]!.hand.length).toBe(hand - 3 + 5);
  });

  it("Neyam Shai Murad: return their permanent card to their hand; then they choose a permanent card in your graveyard for you", () => {
    const { s: s0, ap, opp } = setup([]);
    const ny = putOnBattlefield(s0, ap, neyam());
    const theirs = into(s0, opp, beast, "graveyard");
    const mine1 = into(s0, ap, relic, "graveyard");
    const mine2 = into(s0, ap, bear({ name: "Test Mine" }), "graveyard");
    into(s0, ap, opt, "graveyard");
    let s = passUntil(s0, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ny, defender: opp }] });
    for (let i = 0; i < 50 && s.step !== "combatDamage"; i++) s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(s, { targets: [tgt(theirs)] });
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[theirs]!.zone).toBe("hand");
    expect(s.pending).toMatchObject({ player: opp });
    s = settleBots(s);
    const back = [mine1, mine2].filter((id) => s.objects[id]!.zone === "battlefield");
    expect(back.length).toBe(1);
    expect(s.objects[back[0]!]!.controller).toBe(ap);
  });
});
