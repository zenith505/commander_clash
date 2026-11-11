// Round 341 (Lane A): optional replacements of token creation (CR 614.1a, 616.1), chosen as the tokens would be
// created, so a resolving instruction stops to ask and runs again with the answer (resolve.ts runAsking, as for damage
// shields): Jinnie Fay, Jetmir's Second ("you may instead create that many 2/2 green Cat creature tokens with haste or
// that many 3/1 green Dog creature tokens with vigilance"), Mirrormind Crown and Moonlit Meditation ("the first time you
// would create one or more tokens each turn, you may instead create that many tokens that are copies of" what it's
// attached to) and Esix, Fractal Bloom ("during each of your turns ... choose a creature other than Esix").

import { describe, expect, it } from "vitest";
import { act, plainsCard as plains, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PendingDecision, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const question = (s: GameState) => {
  expect(s.pending?.kind).toBe("chooseOption");
  const p = s.pending as Extract<PendingDecision, { kind: "chooseOption" }>;
  expect(p.what).toBe("tokenInstead");
  return p;
};
/** Pick the option whose label contains `label`. */
const answer = (s: GameState, label: string) => {
  const p = question(s);
  const i = p.labels!.findIndex((l) => l.includes(label));
  expect(i, `${label} in ${p.labels!.join(" / ")}`).toBeGreaterThanOrEqual(0);
  return act(s, { type: "chooseOption", player: p.player, choice: p.options[i]! });
};
const castIt = (s: GameState, pid: PlayerId, id: string) => {
  const plan = planCast(s, pid, id);
  if (!plan) throw new Error(`can't cast ${s.cards[s.objects[id]!.cardId]!.name}`);
  for (const a of plan) s = act(s, a);
  return settle(s, pid);
};
/** The names of the tokens `pid` controls, sorted. */
const tokens = (s: GameState, pid: PlayerId) =>
  s.battlefield
    .filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid)
    .map((id) => characteristics(s, s.objects[id]!).name)
    .sort();
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const graveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = inHand(s, pid, def);
  s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const attach = (s: GameState, what: string, to: string) => {
  s.objects[what]!.attachedTo = to;
  invalidateCharacteristics(s);
};
/** Passes priority until `pid` has it (the stack unchanged by the others). */
const toPriority = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};

// Real oracle text (Scryfall).
const jinnie = (): CardDef => ({"oracleId":"61fbaaf2-4286-4e9a-b9cb-aa31262b596a","name":"Jinnie Fay, Jetmir's Second","manaCost":"{R/G}{G}{G/W}","cmc":3,"typeLine":"Legendary Creature — Elf Druid","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"If you would create one or more tokens, you may instead create that many 2/2 green Cat creature tokens with haste or that many 3/1 green Dog creature tokens with vigilance.","power":"3","toughness":"3","colors":["G","R","W"],"colorIdentity":["G","R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/0/702f2011-be9c-4b83-b503-59a59284ab51.jpg?1783923028","artUrl":"https://cards.scryfall.io/art_crop/front/7/0/702f2011-be9c-4b83-b503-59a59284ab51.jpg?1783923028","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const crown = (): CardDef => ({"oracleId":"353db389-b829-4e66-85d5-6018bc87c3e0","name":"Mirrormind Crown","manaCost":"{4}","cmc":4,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"As long as this Equipment is attached to a creature, the first time you would create one or more tokens each turn, you may instead create that many tokens that are copies of equipped creature.\nEquip {2}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/0/6/061d765e-df27-406a-9ba0-b51b0cbb65da.jpg?1783904397","artUrl":"https://cards.scryfall.io/art_crop/front/0/6/061d765e-df27-406a-9ba0-b51b0cbb65da.jpg?1783904397","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const moonlit = (): CardDef => ({"oracleId":"df702b0c-e011-497f-ae29-9876efac4a4c","name":"Moonlit Meditation","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant artifact or creature you control\nThe first time you would create one or more tokens each turn, you may instead create that many tokens that are copies of enchanted permanent.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/f/2/f2a56007-5bca-4edf-9cc4-5f77a273636c.jpg?1783905978","artUrl":"https://cards.scryfall.io/art_crop/front/f/2/f2a56007-5bca-4edf-9cc4-5f77a273636c.jpg?1783905978","commanderLegal":"legal","set":"eoe","releasedAt":"2025-08-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const esix = (): CardDef => ({"oracleId":"9d22960b-babc-4cf3-b228-d32e13bc6014","name":"Esix, Fractal Bloom","manaCost":"{4}{G}{U}","cmc":6,"typeLine":"Legendary Creature — Fractal","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Fractal"],"oracleText":"Flying\nThe first time you would create one or more tokens during each of your turns, you may instead choose a creature other than Esix and create that many tokens that are copies of that creature.","power":"4","toughness":"4","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/9/c/9c381bc2-d26e-4d7e-9a0b-a8f7d2d802be.jpg?1783927611","artUrl":"https://cards.scryfall.io/art_crop/front/9/c/9c381bc2-d26e-4d7e-9a0b-a8f7d2d802be.jpg?1783927611","commanderLegal":"legal","set":"c21","releasedAt":"2021-04-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const alarm = (): CardDef => ({"oracleId":"5b2364d7-a811-4595-a1b4-224c70555ffa","name":"Raise the Alarm","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Create two 1/1 white Soldier creature tokens.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81d3e5c5-6531-48e7-9dd6-2db519dd61b1.jpg?1783908838","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81d3e5c5-6531-48e7-9dd6-2db519dd61b1.jpg?1783908838","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const season = (): CardDef => ({"oracleId":"01546b7d-a233-4176-8843-d732074dc5b6","name":"Doubling Season","manaCost":"{4}{G}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/29ba5a2d-d787-4214-8cd7-7f2bcea938f8.jpg?1783934805","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/29ba5a2d-d787-4214-8cd7-7f2bcea938f8.jpg?1783934805","commanderLegal":"legal","set":"bbd","releasedAt":"2018-06-08","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const visitation = (): CardDef => ({"oracleId":"5917216f-5b42-41fa-8976-401bdbeb782e","name":"Divine Visitation","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If one or more creature tokens would be created under your control, that many 4/4 white Angel creature tokens with flying and vigilance are created instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/a/dabd95db-b4ca-446b-bb68-6f52cec9ed2a.jpg?1783903248","artUrl":"https://cards.scryfall.io/art_crop/front/d/a/dabd95db-b4ca-446b-bb68-6f52cec9ed2a.jpg?1783903248","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const strike = (): CardDef => ({"oracleId":"c34c17c7-3827-49a2-be25-67f44fdfe150","name":"Strike It Rich","manaCost":"{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nFlashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["R"],"colorIdentity":["R"],"keywords":["Treasure","Flashback"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/1/c/1c7c2814-a617-4123-acdf-1b01b2768210.jpg?1783926837","artUrl":"https://cards.scryfall.io/art_crop/front/1/c/1c7c2814-a617-4123-acdf-1b01b2768210.jpg?1783926837","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const resurgence = (): CardDef => ({"oracleId":"e2d54c59-7722-4520-adca-cd02a0871ab2","name":"Elephant Resurgence","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player creates a green Elephant creature token. Those creatures have \"This token's power and toughness are each equal to the number of creature cards in its controller's graveyard.\"","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/2/22147f72-7ff8-40c4-9bdd-df41dce17dad.jpg?1783945773","artUrl":"https://cards.scryfall.io/art_crop/front/2/2/22147f72-7ff8-40c4-9bdd-df41dce17dad.jpg?1783945773","commanderLegal":"legal","set":"pcy","releasedAt":"2000-06-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const brimaz = (): CardDef => ({"oracleId":"49471b65-be9d-4ded-b2e5-dfc81b306b54","name":"Brimaz, King of Oreskos","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Legendary Creature — Cat Soldier","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Cat","Soldier"],"oracleText":"Vigilance\nWhenever Brimaz attacks, create a 1/1 white Cat Soldier creature token with vigilance that's attacking.\nWhenever Brimaz blocks a creature, create a 1/1 white Cat Soldier creature token with vigilance that's blocking that creature.","power":"3","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/f/2/f2fd4bf5-7ed6-4a90-b0ba-ba886342859a.jpg?1783908852","artUrl":"https://cards.scryfall.io/art_crop/front/f/2/f2fd4bf5-7ed6-4a90-b0ba-ba886342859a.jpg?1783908852","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const chatterfang = (): CardDef => ({"oracleId":"f15b3b76-d38a-48db-bb44-3296183c8641","name":"Chatterfang, Squirrel General","manaCost":"{2}{G}","cmc":3,"typeLine":"Legendary Creature — Squirrel Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Squirrel","Warrior"],"oracleText":"Forestwalk (This creature can't be blocked as long as defending player controls a Forest.)\nIf one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.\n{B}, Sacrifice X Squirrels: Target creature gets +X/-X until end of turn.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["B","G"],"keywords":["Landwalk","Forestwalk"],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/1785cf85-1ac0-4246-9b89-1a8221a8e1b2.jpg?1783926835","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/1785cf85-1ac0-4246-9b89-1a8221a8e1b2.jpg?1783926835","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const krenko = (): CardDef => ({"oracleId":"9cfe86ae-eebe-44aa-a956-4b3e9e621105","name":"Krenko's Command","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Create two 1/1 red Goblin creature tokens.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/0/b07d96a1-87a0-45ff-ae6e-230deaf44dca.jpg?1783912539","artUrl":"https://cards.scryfall.io/art_crop/front/b/0/b07d96a1-87a0-45ff-ae6e-230deaf44dca.jpg?1783912539","commanderLegal":"legal","set":"clu","releasedAt":"2024-02-23","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("round 341: compiles", () => {
  it("every card of the round", () => supported(jinnie(), crown(), moonlit(), esix()));
});

describe("Jinnie Fay, Jetmir's Second", () => {
  it("asks as Raise the Alarm resolves: two Cats with haste instead of the Soldiers", () => {
    const { s: s0, ap, ids } = setup([alarm()]);
    putOnBattlefield(s0, ap, jinnie());
    let s = castIt(s0, ap, ids[0]!);
    const q = question(s);
    expect(q.player).toBe(ap);
    expect(q.source).toBe("Jinnie Fay, Jetmir's Second");
    expect(q.labels).toEqual(["No, create the 2 Soldier tokens", "Create 2 2/2 green Cat creature tokens with haste", "Create 2 3/1 green Dog creature tokens with vigilance"]);
    s = settle(answer(s, "Cat"), ap);
    expect(tokens(s, ap)).toEqual(["Cat Token", "Cat Token"]);
    const cat = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(characteristics(s, s.objects[cat]!).keywords).toContain("Haste");
    expect(characteristics(s, s.objects[cat]!).power).toBe(2);
    expect(s.pending).toBeFalsy();
  });

  it("declined: the Soldiers as they are; asked again for the next tokens (no first-time limit)", () => {
    const { s: s0, ap, ids } = setup([alarm(), alarm()]);
    putOnBattlefield(s0, ap, jinnie());
    let s = settle(answer(castIt(s0, ap, ids[0]!), "No, create"), ap);
    expect(tokens(s, ap)).toEqual(["Soldier Token", "Soldier Token"]);
    s = settle(answer(castIt(s, ap, ids[1]!), "Dog"), ap);
    expect(tokens(s, ap)).toEqual(["Dog Token", "Dog Token", "Soldier Token", "Soldier Token"]);
  });

  it("with Doubling Season: that many is all four, as Dogs", () => {
    const { s: s0, ap, ids } = setup([alarm()]);
    putOnBattlefield(s0, ap, jinnie());
    putOnBattlefield(s0, ap, season());
    let s = castIt(s0, ap, ids[0]!);
    expect(question(s).labels![2]).toBe("Create 4 3/1 green Dog creature tokens with vigilance");
    s = settle(answer(s, "Dog"), ap);
    expect(tokens(s, ap)).toEqual(["Dog Token", "Dog Token", "Dog Token", "Dog Token"]);
  });

  it("with Chatterfang: the Squirrels it adds become Cats too", () => {
    const { s: s0, ap, ids } = setup([alarm()]);
    putOnBattlefield(s0, ap, jinnie());
    putOnBattlefield(s0, ap, chatterfang());
    let s = castIt(s0, ap, ids[0]!);
    expect(question(s).labels![0]).toBe("No, create the 2 Soldier tokens and 2 Squirrel tokens");
    s = settle(answer(s, "Cat"), ap);
    expect(tokens(s, ap)).toEqual(["Cat Token", "Cat Token", "Cat Token", "Cat Token"]);
  });

  it("with Divine Visitation: declined, Angels; chosen, Cats", () => {
    const { s: s0, ap, ids } = setup([alarm(), krenko()]);
    putOnBattlefield(s0, ap, jinnie());
    putOnBattlefield(s0, ap, visitation());
    let s = castIt(s0, ap, ids[0]!);
    expect(question(s).labels![0]).toBe("No, create the 2 Angel tokens");
    s = settle(answer(s, "No, create"), ap);
    expect(tokens(s, ap)).toEqual(["Angel Token", "Angel Token"]);
    s = settle(answer(castIt(s, ap, ids[1]!), "Cat"), ap);
    expect(tokens(s, ap)).toEqual(["Angel Token", "Angel Token", "Cat Token", "Cat Token"]);
  });

  it("a Treasure from Strike It Rich can be a Dog instead", () => {
    const { s: s0, ap, ids } = setup([strike()]);
    putOnBattlefield(s0, ap, jinnie());
    let s = castIt(s0, ap, ids[0]!);
    expect(question(s).labels![0]).toBe("No, create the 1 Treasure token");
    expect(question(s).labels![2]).toBe("Create 1 3/1 green Dog creature token with vigilance");
    s = settle(answer(s, "Dog"), ap);
    expect(tokens(s, ap)).toEqual(["Dog Token"]);
  });

  it("Brimaz's attacking Cat Soldier as a Dog: still attacking (rulings: what the effect says still applies)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, jinnie());
    const brimaz0 = putOnBattlefield(s0, ap, brimaz());
    let s = s0;
    for (let i = 0; i < 20 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: brimaz0, defender: opp }] });
    s = settle(s, ap);
    // What the token attacks is chosen first (CR 508.4), then what's created.
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("attackWhom");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: (s.pending as Extract<PendingDecision, { kind: "chooseOption" }>).options.find((o) => o.startsWith(`${opp}`))! }), ap);
    s = settle(answer(s, "Dog"), ap);
    const dog = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(characteristics(s, s.objects[dog]!).name).toBe("Dog Token");
    expect(s.objects[dog]!.attacking).toBe(opp);
  });

  it("only its controller's tokens: Elephant Resurgence under an opponent's Jinnie, each player's Elephant made once", () => {
    const { s: s0, ap, ids, opp } = setup([resurgence()]);
    putOnBattlefield(s0, opp, jinnie());
    // A creature card in each graveyard, so each Elephant is a 1/1.
    for (const p of s0.turnOrder) graveyard(s0, p, bears());
    let s = castIt(s0, ap, ids[0]!);
    expect(s.pending).toBeFalsy();
    // The opponent's question was answered the bot's way (a Cat, worth more than a 0/0 Elephant now).
    for (const p of s.turnOrder) expect(tokens(s, p).length, `player ${p}`).toBe(1);
    expect(tokens(s, ap)).toEqual(["Elephant Token"]);
    expect(tokens(s, opp)).toEqual(["Cat Token"]);
  });

  it("the question stops the resolution for a human; the other players' Elephants aren't made twice", () => {
    const { s: s0, ap, ids, opp } = setup([resurgence()]);
    putOnBattlefield(s0, opp, jinnie());
    // A creature card in each graveyard, so each Elephant is a 1/1.
    for (const p of s0.turnOrder) graveyard(s0, p, bears());
    const plan = planCast(s0, ap, ids[0]!)!;
    let s = s0;
    for (const a of plan) s = act(s, a);
    s = settle(s, opp);
    const q = question(s);
    expect(q.player).toBe(opp);
    expect(q.botChoice).toBe("0");
    s = settle(answer(s, "Dog"), opp);
    for (const p of s.turnOrder) expect(tokens(s, p).length, `player ${p}`).toBe(1);
    expect(tokens(s, opp)).toEqual(["Dog Token"]);
  });
});

describe("Mirrormind Crown", () => {
  it("equipped Grizzly Bears: the first tokens of the turn as copies of it; the next ones aren't asked about", () => {
    const { s: s0, ap, ids } = setup([alarm(), krenko()]);
    const bears0 = putOnBattlefield(s0, ap, bears());
    attach(s0, putOnBattlefield(s0, ap, crown()), bears0);
    let s = castIt(s0, ap, ids[0]!);
    expect(question(s).labels).toEqual(["No, create the 2 Soldier tokens", "Create 2 tokens that are copies of Grizzly Bears"]);
    s = settle(answer(s, "copies of Grizzly Bears"), ap);
    expect(tokens(s, ap)).toEqual(["Grizzly Bears", "Grizzly Bears"]);
    s = castIt(s, ap, ids[1]!);
    expect(s.pending).toBeFalsy();
    expect(tokens(s, ap)).toEqual(["Goblin Token", "Goblin Token", "Grizzly Bears", "Grizzly Bears"]);
  });

  it("not attached to a creature: nothing to ask", () => {
    const { s: s0, ap, ids } = setup([alarm()]);
    putOnBattlefield(s0, ap, crown());
    const s = castIt(s0, ap, ids[0]!);
    expect(s.pending).toBeFalsy();
    expect(tokens(s, ap)).toEqual(["Soldier Token", "Soldier Token"]);
  });
});

describe("Moonlit Meditation", () => {
  it("declined the first time: used up for the turn (rulings)", () => {
    const { s: s0, ap, ids } = setup([alarm(), krenko()]);
    const thopter = putOnBattlefield(s0, ap, ornithopter());
    attach(s0, putOnBattlefield(s0, ap, moonlit()), thopter);
    let s = castIt(s0, ap, ids[0]!);
    expect(question(s).labels![1]).toBe("Create 2 tokens that are copies of Ornithopter");
    s = settle(answer(s, "No, create"), ap);
    s = castIt(s, ap, ids[1]!);
    expect(s.pending).toBeFalsy();
    expect(tokens(s, ap)).toEqual(["Goblin Token", "Goblin Token", "Soldier Token", "Soldier Token"]);
  });

  it("tokens made before it came under your control this turn: it doesn't apply until next turn (rulings)", () => {
    const { s: s0, ap, ids } = setup([alarm(), krenko()]);
    let s = castIt(s0, ap, ids[0]!);
    expect(s.pending).toBeFalsy();
    const thopter = putOnBattlefield(s, ap, ornithopter());
    attach(s, putOnBattlefield(s, ap, moonlit()), thopter);
    s = castIt(s, ap, ids[1]!);
    expect(s.pending).toBeFalsy();
    expect(tokens(s, ap)).toEqual(["Goblin Token", "Goblin Token", "Soldier Token", "Soldier Token"]);
  });

  it("copies of the enchanted Ornithopter, the copies flying", () => {
    const { s: s0, ap, ids } = setup([alarm()]);
    const thopter = putOnBattlefield(s0, ap, ornithopter());
    attach(s0, putOnBattlefield(s0, ap, moonlit()), thopter);
    const s = settle(answer(castIt(s0, ap, ids[0]!), "copies of Ornithopter"), ap);
    expect(tokens(s, ap)).toEqual(["Ornithopter", "Ornithopter"]);
    for (const id of s.battlefield.filter((x) => s.objects[x]!.isToken)) expect(characteristics(s, s.objects[id]!).keywords).toContain("Flying");
  });
});

describe("Esix, Fractal Bloom", () => {
  it("on your turn: copies of an opponent's Grizzly Bears, under your control", () => {
    const { s: s0, ap, ids, opp } = setup([alarm()]);
    const esix0 = putOnBattlefield(s0, ap, esix());
    putOnBattlefield(s0, opp, bears());
    let s = castIt(s0, ap, ids[0]!);
    const q = question(s);
    expect(q.labels!.some((l) => l.includes("Esix"))).toBe(false);
    expect(q.labels!.some((l) => l.includes(`copies of Grizzly Bears (${s.players[opp]!.name}'s)`))).toBe(true);
    s = settle(answer(s, `copies of Grizzly Bears (${s.players[opp]!.name}'s)`), ap);
    expect(tokens(s, ap)).toEqual(["Grizzly Bears", "Grizzly Bears"]);
    expect(s.objects[esix0]!.zone).toBe("battlefield");
  });

  it("not on an opponent's turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, esix());
    putOnBattlefield(s0, opp, bears());
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, opp, plains);
    const id = inHand(s0, opp, alarm());
    let s = toPriority(s0, ap);
    s = toPriority(act(s, { type: "passPriority", player: ap }), opp);
    s = castIt(s, opp, id);
    expect(s.pending).toBeFalsy();
    expect(tokens(s, opp)).toEqual(["Soldier Token", "Soldier Token"]);
  });

  it("a bot chooses its best creature's copies over 1/1 Soldiers", () => {
    const { s: s0, ap, ids } = setup([alarm()]);
    putOnBattlefield(s0, ap, esix());
    putOnBattlefield(s0, ap, bears());
    const s = castIt(s0, ap, ids[0]!);
    const q = question(s);
    const [a] = botActions(s, ap);
    expect(a).toEqual({ type: "chooseOption", player: ap, choice: q.botChoice });
    expect(q.labels![q.options.indexOf(q.botChoice!)]).toContain("copies of Grizzly Bears");
  });
});
