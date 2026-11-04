// Lane B round B104: Gideon the Oathless, Crown-Hunter Hireling, Chained Throatseeker, The End, Dark Matter Manipulator,
// Cursed Rack, Jaded Response, Orcish Spy, Gandalf, Wandering Wizard, Ravaging Riftwurm, Voidpouncer, Spike Cannibal,
// Hedron Matrix, Arcades Sabboth, Light of Sanction, Desert Nomads, Stream of Thought and Lure of Prey.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { dealDamage, objectSource } from "../src/damage";
import { attackProblem, botActions, characteristics, invalidateCharacteristics, isFullySupported, maxHandSize, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[]; may?: boolean } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay" && opts.may !== undefined) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may });
    else if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (pid: PlayerId): TargetChoice => ({ kind: "player", id: pid });
/** Moves a new card for `def` from the battlefield into `pid`'s `zone`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** Taps everything a player controls, then gives them exactly this mana. */
const poolOnly = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid) s.objects[id]!.tapped = true;
  Object.assign(s.players[pid]!.manaPool, mana);
};
const next = (s: GameState, pid: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % s.turnOrder.length]!;
const ptOf = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;

// Real oracle text (Scryfall).
const gideon = (): CardDef => ({"oracleId":"7afa530f-ea51-4bee-af3b-59b83ea5cb25","name":"Gideon the Oathless","manaCost":"{2}{B}","cmc":3,"typeLine":"Legendary Creature — Human Mercenary","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Mercenary"],"oracleText":"Ward—Discard a card.\nWhenever a creature an opponent controls enters, Gideon deals 1 damage to that player.\nWhenever an opponent activates a loyalty ability, Gideon deals 1 damage to that player.","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Ward"],"imageUrl":"https://cards.scryfall.io/normal/front/c/9/c985b0d1-25bd-4069-aab7-a566ff27a8f6.jpg?1789127990","artUrl":"https://cards.scryfall.io/art_crop/front/c/9/c985b0d1-25bd-4069-aab7-a566ff27a8f6.jpg?1789127990","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hireling = (): CardDef => ({"oracleId":"fece36a3-deb6-4fef-a456-b6514056bfd2","name":"Crown-Hunter Hireling","manaCost":"{4}{R}","cmc":5,"typeLine":"Creature — Ogre Mercenary","supertypes":[],"types":["Creature"],"subtypes":["Ogre","Mercenary"],"oracleText":"When this creature enters, you become the monarch.\nThis creature can't attack unless defending player is the monarch.","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0babeae3-79fe-4d04-b496-e3dc7fa2ad60.jpg?1783937350","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0babeae3-79fe-4d04-b496-e3dc7fa2ad60.jpg?1783937350","commanderLegal":"legal","set":"cn2","releasedAt":"2016-08-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const throatseeker = (): CardDef => ({"oracleId":"f971a597-caa7-4289-ae8f-1efdc9abb593","name":"Chained Throatseeker","manaCost":"{5}{U}","cmc":6,"typeLine":"Creature — Phyrexian Horror","supertypes":[],"types":["Creature"],"subtypes":["Phyrexian","Horror"],"oracleText":"Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)\nThis creature can't attack unless defending player is poisoned.","power":"5","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Infect"],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3a7bb447-c2b0-429e-bf82-02d6a966fe73.jpg?1783941321","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3a7bb447-c2b0-429e-bf82-02d6a966fe73.jpg?1783941321","commanderLegal":"legal","set":"nph","releasedAt":"2011-05-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const theEnd = (): CardDef => ({"oracleId":"835c195a-8c35-4076-896d-8d2972cac270","name":"The End","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"This spell costs {2} less to cast if your life total is 5 or less.\nExile target creature or planeswalker. Search its controller's graveyard, hand, and library for any number of cards with the same name as that permanent and exile them. That player shuffles, then draws a card for each card exiled from their hand this way.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/9/79220c46-01df-41c1-877e-577f9ce78593.jpg?1783915036","artUrl":"https://cards.scryfall.io/art_crop/front/7/9/79220c46-01df-41c1-877e-577f9ce78593.jpg?1783915036","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const manipulator = (): CardDef => ({"oracleId":"6a3862f0-8dfc-4ac9-8eb9-faefcad685d4","name":"Dark Matter Manipulator","manaCost":"{B}","cmc":1,"typeLine":"Creature — Human Warlock","supertypes":[],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"When this creature enters, mill three cards.\nThis creature gets +2/+0 for every seven cards in your graveyard.","power":"1","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/4/e/4ec912d5-cbe7-4d07-9ece-b03ac02d3055.jpg?1789385959","artUrl":"https://cards.scryfall.io/art_crop/front/4/e/4ec912d5-cbe7-4d07-9ece-b03ac02d3055.jpg?1789385959","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rack = (): CardDef => ({"oracleId":"4f04603f-8f91-405b-b6ac-d2b66f05e32f","name":"Cursed Rack","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"As this artifact enters, choose an opponent.\nThe chosen player's maximum hand size is four.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/2/720d871d-1e7b-482e-bd1e-8ec79519fb86.jpg?1783948362","artUrl":"https://cards.scryfall.io/art_crop/front/7/2/720d871d-1e7b-482e-bd1e-8ec79519fb86.jpg?1783948362","commanderLegal":"legal","set":"atq","releasedAt":"1994-03-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const jaded = (): CardDef => ({"oracleId":"23917517-7561-45b3-b156-77cd2f340466","name":"Jaded Response","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell if it shares a color with a creature you control.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/a/6a9ab1f0-4e75-4165-85bc-6f838c221d6a.jpg?1783945353","artUrl":"https://cards.scryfall.io/art_crop/front/6/a/6a9ab1f0-4e75-4165-85bc-6f838c221d6a.jpg?1783945353","commanderLegal":"legal","set":"apc","releasedAt":"2001-06-04","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const spy = (): CardDef => ({"oracleId":"0d058991-3751-4afe-80c9-79f0c6e10282","name":"Orcish Spy","manaCost":"{R}","cmc":1,"typeLine":"Creature — Orc Rogue","supertypes":[],"types":["Creature"],"subtypes":["Orc","Rogue"],"oracleText":"{T}: Look at the top three cards of target player's library.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/8/28e08767-7e92-4ff4-b0d8-196565fbc23c.jpg?1783947891","artUrl":"https://cards.scryfall.io/art_crop/front/2/8/28e08767-7e92-4ff4-b0d8-196565fbc23c.jpg?1783947891","commanderLegal":"legal","set":"fem","releasedAt":"1994-11-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const gandalf = (): CardDef => ({"oracleId":"c996bc53-184d-4dc3-8244-e8d9528516a0","name":"Gandalf, Wandering Wizard","manaCost":"{4}{U}","cmc":5,"typeLine":"Legendary Creature — Avatar Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Avatar","Wizard"],"oracleText":"Ward {3} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {3}.)\n{6}: Gandalf's owner shuffles him into their library and draws three cards.","power":"4","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Ward"],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1f8403a2-849c-4a59-b0ed-c8803995028d.jpg?1785496472","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1f8403a2-849c-4a59-b0ed-c8803995028d.jpg?1785496472","commanderLegal":"legal","set":"hob","releasedAt":"2026-08-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const riftwurm = (): CardDef => ({"oracleId":"a71448ce-8d57-418e-b862-bd526726074d","name":"Ravaging Riftwurm","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"Kicker {4} (You may pay an additional {4} as you cast this spell.)\nVanishing 2 (This creature enters with two time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)\nIf this creature was kicked, it enters with three additional time counters on it.","power":"6","toughness":"6","colors":["G"],"colorIdentity":["G"],"keywords":["Vanishing","Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/5/e/5e09949e-c8cd-4bb4-9ed4-699abbc7ad3c.jpg?1783943097","artUrl":"https://cards.scryfall.io/art_crop/front/5/e/5e09949e-c8cd-4bb4-9ed4-699abbc7ad3c.jpg?1783943097","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const voidpouncer = (): CardDef => ({"oracleId":"bb4ebe30-2501-48aa-879a-2402a9eb1be7","name":"Voidpouncer","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Eldrazi","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"Devoid (This card has no color.)\nKicker {2}{C} (You may pay an additional {2}{C} as you cast this spell.)\nIf this creature was kicked, it enters with two +1/+1 counters and a trample counter on it and with haste.","power":"3","toughness":"1","colors":[],"colorIdentity":["R"],"keywords":["Devoid","Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1f9b8532-4f1a-4653-9cbb-befba8169e5a.jpg?1783911263","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1f9b8532-4f1a-4653-9cbb-befba8169e5a.jpg?1783911263","commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const cannibal = (): CardDef => ({"oracleId":"c175ab0e-7085-41ec-83e4-38fc85c338fa","name":"Spike Cannibal","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Spike","supertypes":[],"types":["Creature"],"subtypes":["Spike"],"oracleText":"This creature enters with a +1/+1 counter on it.\nWhen this creature enters, move all +1/+1 counters from all creatures onto it.","power":"0","toughness":"0","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/4/64003772-c62f-4728-a00c-48c78991c6ae.jpg?1783946516","artUrl":"https://cards.scryfall.io/art_crop/front/6/4/64003772-c62f-4728-a00c-48c78991c6ae.jpg?1783946516","commanderLegal":"legal","set":"exo","releasedAt":"1998-06-15","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const matrix = (): CardDef => ({"oracleId":"dc748941-fd91-4a0e-b0c4-04c9092ff158","name":"Hedron Matrix","manaCost":"{4}","cmc":4,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +X/+X, where X is its mana value.\nEquip {4}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/8/f/8f26a7d8-3bc5-4666-a0dc-c5fbd68f9441.jpg?1783941956","artUrl":"https://cards.scryfall.io/art_crop/front/8/f/8f26a7d8-3bc5-4666-a0dc-c5fbd68f9441.jpg?1783941956","commanderLegal":"legal","set":"roe","releasedAt":"2010-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const arcades = (): CardDef => ({"oracleId":"8ead94c5-8447-4f20-87ec-efdccde689fc","name":"Arcades Sabboth","manaCost":"{2}{G}{G}{W}{W}{U}{U}","cmc":8,"typeLine":"Legendary Creature — Elder Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elder","Dragon"],"oracleText":"Flying\nAt the beginning of your upkeep, sacrifice Arcades Sabboth unless you pay {G}{W}{U}.\nEach untapped creature you control gets +0/+2 as long as it's not attacking.\n{W}: Arcades Sabboth gets +0/+1 until end of turn.","power":"7","toughness":"7","colors":["G","U","W"],"colorIdentity":["G","U","W"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/175695bb-2630-4269-a407-9138c7008e81.jpg?1783918432","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/175695bb-2630-4269-a407-9138c7008e81.jpg?1783918432","commanderLegal":"legal","set":"dmr","releasedAt":"2023-01-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sanction = (): CardDef => ({"oracleId":"c34cf404-729d-46ef-8661-1095e5581766","name":"Light of Sanction","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Prevent all damage that would be dealt to creatures you control by sources you control.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/a/daff382a-980e-4f0c-b26c-70c8a43c66f1.jpg?1783943697","artUrl":"https://cards.scryfall.io/art_crop/front/d/a/daff382a-980e-4f0c-b26c-70c8a43c66f1.jpg?1783943697","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const nomads = (): CardDef => ({"oracleId":"3247fca3-7458-47ee-875b-c55f2a3e2962","name":"Desert Nomads","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Nomad","supertypes":[],"types":["Creature"],"subtypes":["Human","Nomad"],"oracleText":"Desertwalk\nPrevent all damage that would be dealt to this creature by Deserts.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Landwalk","Desertwalk"],"imageUrl":"https://cards.scryfall.io/normal/front/e/4/e46d0c10-ec09-48ba-9e93-1392dca8111a.jpg?1783948384","artUrl":"https://cards.scryfall.io/art_crop/front/e/4/e46d0c10-ec09-48ba-9e93-1392dca8111a.jpg?1783948384","commanderLegal":"legal","set":"arn","releasedAt":"1993-12-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const stream = (): CardDef => ({"oracleId":"e5b29094-0bb4-4c18-ad47-dce4d4379a4f","name":"Stream of Thought","manaCost":"{U}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player mills four cards. You shuffle up to four cards from your graveyard into your library.\nReplicate {2}{U}{U} (When you cast this spell, copy it for each time you paid its replicate cost. You may choose new targets for the copies.)","colors":["U"],"colorIdentity":["U"],"keywords":["Replicate","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/8/b/8b75bef5-a039-4edf-8e43-56b8d089605e.jpg?1783933137","artUrl":"https://cards.scryfall.io/art_crop/front/8/b/8b75bef5-a039-4edf-8e43-56b8d089605e.jpg?1783933137","commanderLegal":"legal","set":"mh1","releasedAt":"2019-06-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lure = (): CardDef => ({"oracleId":"3c83ea11-7141-41a2-ba77-1ed2722dfe74","name":"Lure of Prey","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only if an opponent cast a creature spell this turn.\nYou may put a green creature card from your hand onto the battlefield.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/1/7165f1d8-7b31-4a81-aab4-c6cd4ff2e67d.jpg?1783947065","artUrl":"https://cards.scryfall.io/art_crop/front/7/1/7165f1d8-7b31-4a81-aab4-c6cd4ff2e67d.jpg?1783947065","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const walker = card("Test Walker", "Legendary Planeswalker — Jace", "{2}{U}", { oracleText: "+1: Draw a card.", loyalty: "3", colors: ["U"] });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3", colors: ["R"] });
const golem = card("Test Golem", "Artifact Creature — Golem", "{5}", { power: "4", toughness: "4" });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target.", colors: ["R"] });
const desert = card("Test Desert", "Land — Desert", "");
const rock = card("Test Rock", "Artifact", "{1}");

describe("Lane B round B104", () => {
  it("all eighteen cards are supported", () =>
    supported(gideon(), hireling(), throatseeker(), theEnd(), manipulator(), rack(), jaded(), spy(), gandalf(), riftwurm(), voidpouncer(), cannibal(), matrix(), arcades(), sanction(), nomads(), stream(), lure()));

  it("Gideon the Oathless: whenever an opponent activates a loyalty ability, 1 damage to that player; not for its controller's", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, gideon());
    const w = putOnBattlefield(s, ap, walker);
    s.objects[w]!.counters.loyalty = 3;
    const life = s.players[ap]!.life;
    s = settle(run(s, planActivate(s, ap, w, 0)));
    expect(s.objects[w]!.counters.loyalty).toBe(4);
    expect(s.players[ap]!.life).toBe(life - 1);
    // Its own controller's loyalty ability: no damage.
    let t = setup([]);
    putOnBattlefield(t.s, t.ap, gideon());
    const mine = putOnBattlefield(t.s, t.ap, walker);
    t.s.objects[mine]!.counters.loyalty = 3;
    const before = t.s.players[t.ap]!.life;
    t.s = settle(run(t.s, planActivate(t.s, t.ap, mine, 0)));
    expect(t.s.objects[mine]!.counters.loyalty).toBe(4);
    expect(t.s.players[t.ap]!.life).toBe(before);
  });

  it("Crown-Hunter Hireling: can attack only the monarch (or the monarch's planeswalkers)", () => {
    const { s, ap, opp } = setup([]);
    const h = putOnBattlefield(s, ap, hireling());
    s.monarch = ap;
    expect(attackProblem(s, s.objects[h]!, opp)).toMatch(/monarch/);
    s.monarch = opp;
    expect(attackProblem(s, s.objects[h]!, opp)).toBeNull();
    expect(attackProblem(s, s.objects[h]!, next(s, ap, 2))).toMatch(/monarch/);
    const w = putOnBattlefield(s, opp, walker);
    expect(attackProblem(s, s.objects[h]!, opp, true, w)).toBeNull();
  });

  it("Crown-Hunter Hireling: as it enters, you become the monarch", () => {
    let { s, ap, ids } = setup([hireling()]);
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto")));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.monarch).toBe(ap);
  });

  it("Chained Throatseeker: can attack only a poisoned player", () => {
    const { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, throatseeker());
    expect(attackProblem(s, s.objects[c]!, opp)).toMatch(/poisoned/);
    s.players[opp]!.poison = 1;
    expect(attackProblem(s, s.objects[c]!, opp)).toBeNull();
    expect(attackProblem(s, s.objects[c]!, next(s, ap, 2))).toMatch(/poisoned/);
  });

  it("The End: costs {2} less with 5 or less life, and exiles the creature and the cards with its name", () => {
    let { s, ap, opp, ids } = setup([theEnd()]);
    const b = putOnBattlefield(s, opp, bear());
    const dead = into(s, opp, bear(), "graveyard");
    poolOnly(s, ap, { B: 2 });
    s.players[ap]!.life = 6;
    expect(planCast(s, ap, ids[0]!, [tgt(b)])).toBeNull();
    s.players[ap]!.life = 5;
    const hand = s.players[opp]!.hand.length;
    const handBears = s.players[opp]!.hand.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])), { me: [ap] });
    // Searching for any number of cards: take every one offered.
    for (let i = 0; i < 5 && s.pending?.kind === "searchLibrary" && s.pending.player === ap; i++) s = settle(act(s, { type: "searchLibrary", player: ap, found: [...(s.pending as { cards: string[] }).cards] }), { me: [ap] });
    s = settle(s);
    expect(zone(s, b)).toBe("exile");
    expect(zone(s, dead)).toBe("exile");
    expect(handBears.length).toBeGreaterThan(0);
    for (const id of handBears) expect(zone(s, id)).toBe("exile");
    // They draw a card for each card exiled from their hand.
    expect(s.players[opp]!.hand.length).toBe(hand);
  });

  it("Dark Matter Manipulator: +2/+0 for every seven cards in your graveyard, whole groups only", () => {
    const { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, manipulator());
    for (let i = 0; i < 6; i++) into(s, ap, rock, "graveyard");
    expect(ptOf(s, d)).toBe("1/2");
    into(s, ap, rock, "graveyard");
    expect(ptOf(s, d)).toBe("3/2");
    for (let i = 0; i < 6; i++) into(s, ap, rock, "graveyard");
    expect(ptOf(s, d)).toBe("3/2");
    into(s, ap, rock, "graveyard");
    expect(ptOf(s, d)).toBe("5/2");
  });

  it("Cursed Rack: the chosen opponent's maximum hand size is four, no one else's", () => {
    let { s, ap, opp, ids } = setup([rack()]);
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto")), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(maxHandSize(s, opp)).toBe(4);
    expect(maxHandSize(s, ap)).toBe(7);
    expect(maxHandSize(s, next(s, ap, 2))).toBe(7);
  });

  it("Jaded Response: counters the spell only if it shares a color with a creature you control as it resolves", () => {
    for (const mine of [ogre, bear()]) {
      let { s, ap, opp, ids } = setup([shock, jaded()]);
      putOnBattlefield(s, ap, mine);
      const life = s.players[opp]!.life;
      s = run(s, planCast(s, ap, ids[0]!, [player(opp)]));
      const item = s.stack[s.stack.length - 1]!;
      s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: item.id }])));
      expect(zone(s, ids[1]!)).toBe("graveyard");
      // A red creature: the red spell is countered; a green one: it resolves.
      expect(s.players[opp]!.life).toBe(mine === ogre ? life : life - 2);
    }
  });

  it("Orcish Spy: looks at the top three cards of target player's library, which stay in that order", () => {
    let { s, ap, opp } = setup([]);
    const o = putOnBattlefield(s, ap, spy());
    const top = s.players[opp]!.library.slice(0, 3);
    s = settle(run(s, planActivate(s, ap, o, 0, [player(opp)])), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "look", cards: top });
    expect(() => act(s, { type: "arrangeTop", player: ap, top: [top[1]!, top[0]!, top[2]!], away: [] })).toThrow();
    s = settle(act(s, { type: "arrangeTop", player: ap, top, away: [] }));
    expect(s.players[opp]!.library.slice(0, 3)).toEqual(top);
  });

  it("Gandalf, Wandering Wizard: its owner shuffles it into their library and draws three cards", () => {
    let { s, ap, opp } = setup([]);
    // Owned by an opponent, controlled by you: into the opponent's library, and the opponent draws.
    const g = putOnBattlefield(s, opp, gandalf());
    s.objects[g]!.controller = ap;
    invalidateCharacteristics(s);
    const [mine, theirs] = [s.players[ap]!.hand.length, s.players[opp]!.hand.length];
    s = settle(run(s, planActivate(s, ap, g, 0)));
    expect(zone(s, g)).toBe("library");
    expect(s.players[opp]!.library).toContain(g);
    expect(s.players[opp]!.hand.length).toBe(theirs + 3);
    expect(s.players[ap]!.hand.length).toBe(mine);
  });

  it("Ravaging Riftwurm: two time counters, five if it was kicked", () => {
    for (const kicked of [false, true]) {
      let { s, ap, ids } = setup([riftwurm()]);
      s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, kicked ? { kicks: [0] } : {})));
      expect(zone(s, ids[0]!)).toBe("battlefield");
      expect(s.objects[ids[0]!]!.counters.time).toBe(kicked ? 5 : 2);
    }
  });

  it("Voidpouncer: kicked, two +1/+1 counters, a trample counter and haste; not kicked, none", () => {
    for (const kicked of [false, true]) {
      let { s, ap, ids } = setup([voidpouncer()]);
      poolOnly(s, ap, { R: 1, C: 4 });
      s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, kicked ? { kicks: [0] } : {})));
      const o = s.objects[ids[0]!]!;
      expect(o.zone).toBe("battlefield");
      expect(ptOf(s, o.id)).toBe(kicked ? "5/3" : "3/1");
      expect(o.counters.trample ?? 0).toBe(kicked ? 1 : 0);
      expect(objHasKeyword(s, o, "Trample")).toBe(kicked);
      expect(objHasKeyword(s, o, "Haste")).toBe(kicked);
      expect(characteristics(s, o).colors).toEqual([]);
    }
  });

  it("Spike Cannibal: moves every other creature's +1/+1 counters onto itself, no other kind", () => {
    let { s, ap, opp, ids } = setup([cannibal()]);
    const a = putOnBattlefield(s, ap, bear());
    const b = putOnBattlefield(s, opp, bear());
    s.objects[a]!.counters["+1/+1"] = 2;
    s.objects[b]!.counters["+1/+1"] = 1;
    s.objects[b]!.counters.charge = 1;
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto")));
    const c = ids[0]!;
    expect(s.objects[c]!.counters["+1/+1"]).toBe(4);
    expect(s.objects[a]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[b]!.counters.charge).toBe(1);
    expect(ptOf(s, c)).toBe("4/4");
  });

  it("Hedron Matrix: the equipped creature gets +X/+X for its own mana value", () => {
    let { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, matrix());
    const b = putOnBattlefield(s, ap, bear());
    const g = putOnBattlefield(s, ap, golem);
    s = settle(run(s, planActivate(s, ap, m, 0, [tgt(b)])));
    expect(ptOf(s, b)).toBe("4/4");
    expect(ptOf(s, g)).toBe("4/4");
    s.objects[m]!.attachedTo = g;
    invalidateCharacteristics(s);
    expect(ptOf(s, g)).toBe("9/9");
    expect(ptOf(s, b)).toBe("2/2");
  });

  it("Arcades Sabboth: each untapped creature you control that isn't attacking gets +0/+2, itself too", () => {
    const { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, arcades());
    const b = putOnBattlefield(s, ap, bear());
    const t = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    s.objects[t]!.tapped = true;
    invalidateCharacteristics(s);
    expect(ptOf(s, a)).toBe("7/9");
    expect(ptOf(s, b)).toBe("2/4");
    expect(ptOf(s, t)).toBe("2/2");
    expect(ptOf(s, theirs)).toBe("2/2");
    s.objects[b]!.attacking = opp;
    invalidateCharacteristics(s);
    expect(ptOf(s, b)).toBe("2/2");
  });

  it("Light of Sanction: damage your sources would deal to your creatures is prevented; other damage isn't", () => {
    const { s, ap, opp } = setup([]);
    const l = putOnBattlefield(s, ap, sanction());
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    const myOgre = putOnBattlefield(s, ap, ogre);
    const theirOgre = putOnBattlefield(s, opp, ogre);
    expect(dealDamage(s, objectSource(s, s.objects[myOgre]!), { object: s.objects[mine]! }, 2)).toBe(0);
    expect(dealDamage(s, objectSource(s, s.objects[l]!), { object: s.objects[mine]! }, 1)).toBe(0);
    expect(dealDamage(s, objectSource(s, s.objects[theirOgre]!), { object: s.objects[mine]! }, 1)).toBe(1);
    expect(dealDamage(s, objectSource(s, s.objects[myOgre]!), { object: s.objects[theirs]! }, 1)).toBe(1);
    expect(dealDamage(s, objectSource(s, s.objects[myOgre]!), { player: ap }, 1)).toBe(1);
  });

  it("Desert Nomads: damage from Deserts is prevented, from other sources it isn't", () => {
    const { s, ap, opp } = setup([]);
    const n = putOnBattlefield(s, ap, nomads());
    const d = putOnBattlefield(s, opp, desert);
    const o = putOnBattlefield(s, opp, ogre);
    expect(dealDamage(s, objectSource(s, s.objects[d]!), { object: s.objects[n]! }, 1)).toBe(0);
    expect(dealDamage(s, objectSource(s, s.objects[o]!), { object: s.objects[n]! }, 1)).toBe(1);
  });

  it("Stream of Thought: target player mills four, then you shuffle up to four cards from your graveyard into your library", () => {
    let { s, ap, opp, ids } = setup([stream()]);
    const [g1, g2, g3] = [into(s, ap, rock, "graveyard"), into(s, ap, rock, "graveyard"), into(s, ap, ogre, "graveyard")];
    const lib = s.players[opp]!.library.length;
    const shuffles = s.players[ap]!.shuffles ?? 0;
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, "auto")), { me: [ap] });
    expect(s.players[opp]!.library.length).toBe(lib - 4);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    // Not targeted: chosen as it resolves; the spell itself isn't there yet (rulings).
    expect((s.pending as { cards: string[] }).cards).not.toContain(ids[0]!);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [g1, g3] }));
    expect(zone(s, g1)).toBe("library");
    expect(zone(s, g3)).toBe("library");
    expect(zone(s, g2)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[ap]!.shuffles ?? 0).toBe(shuffles + 1);
  });

  it("Lure of Prey: castable only after an opponent cast a creature spell this turn", () => {
    let { s, ap, opp, ids } = setup([lure()]);
    const big = into(s, ap, bear(), "hand");
    expect(planCast(s, ap, ids[0]!, undefined, undefined, "auto")).toBeNull();
    // You casting one doesn't count, an opponent's noncreature spell neither.
    s.castThisTurn = [{ player: ap, card: s.objects[big]!.cardId }, { player: opp, card: s.objects[into(s, opp, shock, "graveyard")]!.cardId }];
    expect(planCast(s, ap, ids[0]!, undefined, undefined, "auto")).toBeNull();
    s.castThisTurn.push({ player: opp, card: s.objects[into(s, opp, bear(), "graveyard")]!.cardId });
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto")), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [big] }));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, big)).toBe("battlefield");
  });
});
