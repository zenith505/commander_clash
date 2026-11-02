// Round 246: cards from earlier rounds' skip lists (the top of the popularity list is all skipped cards now). Even the
// Score ("costs {U}{U}{U} less ... if an opponent has drawn four or more cards this turn"), Colossal Rattlewurm (flash as
// long as you control a Desert, also on the battlefield), Aggressive Mining ("You can't play lands"), Unbreathing Horde
// ("for each other Zombie you control and each Zombie card in your graveyard"), Clever Conjurer ("target permanent not
// named ~"), Hammerheim ("loses all landwalk abilities"), Wave of Rats ("if it dealt combat damage to a player this
// turn"), Mandate of Peace ("End the combat phase", CR 724.2), Faerie Fencing, Flame Discharge and Steer Clear ("if you
// controlled a ... as you cast this spell"), End Hostilities ("all permanents attached to creatures"), Terrifying Presence
// ("creatures other than target creature"), Viashino Heretic ("the artifact's mana value"), Last-Ditch Effort and Reprocess
// ("sacrifice any number of ..."), Sporogenic Infection ("a creature of their choice other than enchanted creature") and
// Kitsune Ace ("That Vehicle" in a mode).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, castProblem, characteristics, controllerOf, dealDamage, defOf, destroyPermanent, invalidateCharacteristics, isFullySupported, landsAllowed, legalActions, manaValue, objHasKeyword, objectSource, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
/** Others pass until `pid` has priority (nothing resolves on the way while the stack is untouched). */
const toPlayer = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 4 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
/** Declare `attacks`; nobody blocks; others' questions answered by the bot; stops at `stop` or a question for `me`. */
const attack = (s: GameState, me: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[], stop: (s: GameState) => boolean = (x) => x.step === "main2") => {
  s = act(s, { type: "declareAttackers", player: me, attacks });
  for (let i = 0; i < 200 && !stop(s); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p && p.player === me) return s;
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === name);

// Real oracle text (Scryfall).
const evenScore = (): CardDef => ({"oracleId":"25f5cca6-a414-46d9-82e3-ce2fa21b14ca","name":"Even the Score","manaCost":"{X}{U}{U}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"This spell costs {U}{U}{U} less to cast if an opponent has drawn four or more cards this turn.\nDraw X cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/7/57dcba6c-9d8e-4a66-99ac-48e737e14263.jpg?1783922988","artUrl":"https://cards.scryfall.io/art_crop/front/5/7/57dcba6c-9d8e-4a66-99ac-48e737e14263.jpg?1783922988","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const rattlewurm = (): CardDef => ({"oracleId":"510659d6-69b4-4b04-8836-08b76213954e","name":"Colossal Rattlewurm","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"Colossal Rattlewurm has flash as long as you control a Desert.\nTrample\n{1}{G}, Exile this card from your graveyard: Search your library for a Desert card, put it onto the battlefield tapped, then shuffle.","power":"6","toughness":"5","colors":["G"],"colorIdentity":["G"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/17a104d3-e4ac-44a0-9c6a-39965b1b9751.jpg?1783911809","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/17a104d3-e4ac-44a0-9c6a-39965b1b9751.jpg?1783911809","commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mining = (): CardDef => ({"oracleId":"ff321c13-03ae-4cb9-b371-1242290f8433","name":"Aggressive Mining","manaCost":"{3}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"You can't play lands.\nSacrifice a land: Draw two cards. Activate only once each turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/1/e15a3f1a-83af-4541-8d1c-bf7844f969c9.jpg?1783939177","artUrl":"https://cards.scryfall.io/art_crop/front/e/1/e15a3f1a-83af-4541-8d1c-bf7844f969c9.jpg?1783939177","commanderLegal":"legal","set":"m15","releasedAt":"2014-07-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const horde = (): CardDef => ({"oracleId":"e6cd9203-e4d3-4d9f-b59f-4e454fc5a477","name":"Unbreathing Horde","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"This creature enters with a +1/+1 counter on it for each other Zombie you control and each Zombie card in your graveyard.\nIf this creature would be dealt damage, prevent that damage and remove a +1/+1 counter from it.","power":"0","toughness":"0","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/a/1a91ea47-0c06-4333-a309-ac360c5cc9bd.jpg?1783940947","artUrl":"https://cards.scryfall.io/art_crop/front/1/a/1a91ea47-0c06-4333-a309-ac360c5cc9bd.jpg?1783940947","commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const conjurer = (): CardDef => ({"oracleId":"628e59e2-3665-40dd-ba4f-11ab5824de22","name":"Clever Conjurer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Gnome Wizard","supertypes":[],"types":["Creature"],"subtypes":["Gnome","Wizard"],"oracleText":"Mage Hand — {T}: Untap target permanent not named Clever Conjurer. Activate only as a sorcery.","power":"2","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/9/b9784c97-3839-4a4b-ae8a-965844dbeb70.jpg?1783926517","artUrl":"https://cards.scryfall.io/art_crop/front/b/9/b9784c97-3839-4a4b-ae8a-965844dbeb70.jpg?1783926517","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hammerheim = (): CardDef => ({"oracleId":"c7476beb-7923-4994-8476-bc69187ecb72","name":"Hammerheim","manaCost":"","cmc":0,"typeLine":"Legendary Land","supertypes":["Legendary"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {R}.\n{T}: Target creature loses all landwalk abilities until end of turn.","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/8/2816d30e-1e52-4323-b30e-1688fba23368.jpg?1783948022","artUrl":"https://cards.scryfall.io/art_crop/front/2/8/2816d30e-1e52-4323-b30e-1688fba23368.jpg?1783948022","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const rats = (): CardDef => ({"oracleId":"ccb0f59b-7947-4563-9e16-5d23246f4232","name":"Wave of Rats","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Rat","supertypes":[],"types":["Creature"],"subtypes":["Rat"],"oracleText":"Trample\nWhen this creature dies, if it dealt combat damage to a player this turn, return it to the battlefield under its owner's control.\nBlitz {4}{B} (If you cast this spell for its blitz cost, it gains haste and \"When this creature dies, draw a card.\" Sacrifice it at the beginning of the next end step.)","power":"4","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Blitz","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/1/5/154dc126-67ca-4759-a424-37f0eb52e1fa.jpg?1783923365","artUrl":"https://cards.scryfall.io/art_crop/front/1/5/154dc126-67ca-4759-a424-37f0eb52e1fa.jpg?1783923365","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mandate = (): CardDef => ({"oracleId":"c309ec42-34a0-4083-a36c-7814643d7960","name":"Mandate of Peace","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only during combat.\nYour opponents can't cast spells this turn.\nEnd the combat phase. (Remove all attackers and blockers from combat. Exile all spells and abilities from the stack, including this spell.)","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/2/d243055f-892e-4042-9694-13d5e99e3550.jpg?1783932814","artUrl":"https://cards.scryfall.io/art_crop/front/d/2/d243055f-892e-4042-9694-13d5e99e3550.jpg?1783932814","commanderLegal":"legal","set":"c19","releasedAt":"2019-08-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fencing = (): CardDef => ({"oracleId":"450a9b73-9024-4103-b9f9-216a2f395cff","name":"Faerie Fencing","manaCost":"{X}{B}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets -X/-X until end of turn. That creature gets an additional -3/-3 until end of turn if you controlled a Faerie as you cast this spell.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/b/6bdcaf24-4352-47cf-a043-899be47ab1bb.jpg?1783915108","artUrl":"https://cards.scryfall.io/art_crop/front/6/b/6bdcaf24-4352-47cf-a043-899be47ab1bb.jpg?1783915108","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const discharge = (): CardDef => ({"oracleId":"fa4755c2-e573-45c3-bd6a-61b2b35fbd24","name":"Flame Discharge","manaCost":"{X}{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Flame Discharge deals X damage to target creature or planeswalker. If you controlled a modified creature as you cast this spell, it deals X plus 2 damage instead. (Equipment, Auras you control, and counters are modifications.)","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0b44534f-d10c-4754-8585-5fe9db5fd4ea.jpg?1783923867","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0b44534f-d10c-4754-8585-5fe9db5fd4ea.jpg?1783923867","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const steer = (): CardDef => ({"oracleId":"2c22af49-c6ef-4de6-bb84-6b3e99879148","name":"Steer Clear","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Steer Clear deals 2 damage to target attacking or blocking creature. Steer Clear deals 4 damage to that creature instead if you controlled a Mount as you cast this spell.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/2/523a4d6e-122b-49b4-bf3d-17d29c0007fb.jpg?1783911852","artUrl":"https://cards.scryfall.io/art_crop/front/5/2/523a4d6e-122b-49b4-bf3d-17d29c0007fb.jpg?1783911852","commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hostilities = (): CardDef => ({"oracleId":"7b2e2c4b-b8fd-440c-8a79-de6532022745","name":"End Hostilities","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all creatures and all permanents attached to creatures.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/0/80a53ed7-a7b7-40d8-9239-cf6f205dbc59.jpg?1783939095","artUrl":"https://cards.scryfall.io/art_crop/front/8/0/80a53ed7-a7b7-40d8-9239-cf6f205dbc59.jpg?1783939095","commanderLegal":"legal","set":"ktk","releasedAt":"2014-09-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const presence = (): CardDef => ({"oracleId":"ca8f6e19-6ef3-4d77-8312-867767ffeda6","name":"Terrifying Presence","manaCost":"{1}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Prevent all combat damage that would be dealt by creatures other than target creature this turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2e8d0a22-f31b-45c0-85c7-0101aa63c77b.jpg?1783940661","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2e8d0a22-f31b-45c0-85c7-0101aa63c77b.jpg?1783940661","commanderLegal":"legal","set":"avr","releasedAt":"2012-05-04","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const heretic = (): CardDef => ({"oracleId":"36896550-151d-472c-bfc1-1d9bbf7cc04d","name":"Viashino Heretic","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Lizard","supertypes":[],"types":["Creature"],"subtypes":["Lizard"],"oracleText":"{1}{R}, {T}: Destroy target artifact. This creature deals damage to that artifact's controller equal to the artifact's mana value.","power":"1","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/143e435e-e3a1-45b0-81c3-bd47916df8ac.jpg?1783946232","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/143e435e-e3a1-45b0-81c3-bd47916df8ac.jpg?1783946232","commanderLegal":"legal","set":"ulg","releasedAt":"1999-02-15","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const lastDitch = (): CardDef => ({"oracleId":"cdd8d7cf-28f2-4a4d-a373-40d48bff615b","name":"Last-Ditch Effort","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Sacrifice any number of creatures. Last-Ditch Effort deals that much damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/295f7fe0-0681-4b25-807f-30ed70ec78d5.jpg?1783946235","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/295f7fe0-0681-4b25-807f-30ed70ec78d5.jpg?1783946235","commanderLegal":"legal","set":"ulg","releasedAt":"1999-02-15","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const reprocess = (): CardDef => ({"oracleId":"27177cb0-1670-488e-82be-4610da5a7de3","name":"Reprocess","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Sacrifice any number of artifacts, creatures, and/or lands. Draw a card for each permanent sacrificed this way.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/a/0a4cb4f4-046c-4efd-a53f-48003526444c.jpg?1783906069","artUrl":"https://cards.scryfall.io/art_crop/front/0/a/0a4cb4f4-046c-4efd-a53f-48003526444c.jpg?1783906069","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sporogenic = (): CardDef => ({"oracleId":"659a259d-f75e-4af3-b568-c63225e647de","name":"Sporogenic Infection","manaCost":"{1}{B}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nWhen this Aura enters, target player sacrifices a creature of their choice other than enchanted creature.\nWhen enchanted creature is dealt damage, destroy it.","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/e/a/eaae086e-0781-4f4d-bc9c-a98228bc380c.jpg?1783909476","artUrl":"https://cards.scryfall.io/art_crop/front/e/a/eaae086e-0781-4f4d-bc9c-a98228bc380c.jpg?1783909476","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const kitsune = (): CardDef => ({"oracleId":"1dbadf75-28cd-4525-8f51-9c53049b9b54","name":"Kitsune Ace","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Fox Pilot","supertypes":[],"types":["Creature"],"subtypes":["Fox","Pilot"],"oracleText":"Whenever a Vehicle you control attacks, choose one —\n• That Vehicle gains first strike until end of turn.\n• Untap this creature.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/f/ef1d446a-8607-45b8-a01f-dad17bab76e7.jpg?1783923919","artUrl":"https://cards.scryfall.io/art_crop/front/e/f/ef1d446a-8607-45b8-a01f-dad17bab76e7.jpg?1783923919","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const zombie = (name = "Test Zombie") => card(name, "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2" });
const desert = card("Test Desert", "Land — Desert");
const faerie = card("Test Faerie", "Creature — Faerie", "{U}", { power: "1", toughness: "1" });
const mount = card("Test Mount", "Creature — Horse Mount", "{1}{W}", { power: "2", toughness: "2" });
const relic = (mv = 3) => card(`Test Relic ${mv}`, "Artifact", `{${mv}}`, { cmc: mv });
const vehicle = card("Test Vehicle", "Artifact — Vehicle", "{2}", { power: "3", toughness: "3", oracleText: "Crew 1", keywords: ["Crew"] });
const counterspell = card("Test Counter", "Instant", "{U}{U}", { oracleText: "Counter target spell." });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });

describe("round 246", () => {
  it("every card of the round compiles fully", () => {
    supported(evenScore(), rattlewurm(), mining(), horde(), conjurer(), hammerheim(), rats(), mandate(), fencing(), discharge(), steer(), hostilities(), presence(), heretic(), lastDitch(), reprocess(), sporogenic(), kitsune());
  });

  it("Even the Score: {U}{U}{U} less once an opponent has drawn four or more cards this turn (just {X} then)", () => {
    const { s, ap, opp, ids } = setup([evenScore()]);
    const blue = () => spellCost(s, ap, s.objects[ids[0]!]!, 2, [], {}).cost.symbols.filter((x) => x.kind === "colored" && x.color === "U").length;
    expect(blue()).toBe(3);
    s.players[opp]!.draws = { turn: s.turn, n: 3 };
    expect(blue()).toBe(3);
    // Your own draws don't count.
    s.players[ap]!.draws = { turn: s.turn, n: 6 };
    expect(blue()).toBe(3);
    s.players[opp]!.draws = { turn: s.turn, n: 4 };
    expect(spellCost(s, ap, s.objects[ids[0]!]!, 2, [], {}).cost.symbols).toEqual([{ kind: "x" }]);
    // Cast for X = 2: two mana, two cards.
    const hand = s.players[ap]!.hand.length;
    const t = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, 2)));
    expect(t.players[ap]!.hand.length).toBe(hand - 1 + 2);
    // Last turn's draws don't count.
    s.players[opp]!.draws = { turn: s.turn - 1, n: 9 };
    expect(blue()).toBe(3);
  });

  it("Colossal Rattlewurm: flash while you control a Desert, as a spell and on the battlefield; its graveyard ability finds a Desert", () => {
    const { s: s0, ap, opp, ids } = setup([rattlewurm()]);
    let s = passUntil(s0, "upkeep", opp);
    s = toPlayer(s, ap);
    s.players[ap]!.manaPool.G = 4;
    expect(castProblem(s, ap, ids[0]!)).not.toBeNull();
    const d = putOnBattlefield(s, ap, desert);
    expect(castProblem(s, ap, ids[0]!)).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Flash")).toBe(true);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Trample")).toBe(true);
    // Without a Desert, no flash on the battlefield either.
    destroyPermanent(s, s.objects[d]!, "destroyed");
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Flash")).toBe(false);
    // An opponent's Desert doesn't count.
    putOnBattlefield(s, opp, desert);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Flash")).toBe(false);
    // From the graveyard: exile it, search for a Desert card, onto the battlefield tapped.
    const { s: t0, ap: bp } = setup([]);
    const w = into(t0, bp, rattlewurm(), "graveyard");
    const lib = into(t0, bp, desert, "library");
    const idx = abilitiesOf(t0, t0.objects[w]!).activated.findIndex((a) => /from your graveyard/.test(a.text));
    let t = settle(run(t0, planActivate(t0, bp, w, idx)));
    expect(t.objects[w]!.zone).toBe("exile");
    expect(t.pending).toMatchObject({ kind: "searchLibrary", player: bp });
    t = settle(act(t, { type: "searchLibrary", player: bp, found: [lib] }));
    expect(t.objects[lib]).toMatchObject({ zone: "battlefield", tapped: true });
  });

  it("Aggressive Mining: its controller can't play lands (other players can); sacrifice a land to draw two, once each turn", () => {
    const { s: s0, ap, opp, ids } = setup([card("Forest", "Basic Land — Forest")]);
    expect(landsAllowed(s0, ap)).toBe(1);
    const m = putOnBattlefield(s0, ap, mining());
    expect(landsAllowed(s0, ap)).toBe(0);
    expect(legalActions(s0, ap).some((a) => a.type === "playLand")).toBe(false);
    expect(() => act(s0, { type: "playLand", player: ap, objectId: ids[0]! })).toThrow();
    expect(landsAllowed(s0, opp)).toBe(1);
    const hand = s0.players[ap]!.hand.length;
    const land = s0.battlefield.find((id) => defOf(s0, s0.objects[id]!).name === "Swamp")!;
    let s = settle(run(s0, planActivate(s0, ap, m, 0, undefined, undefined, undefined, undefined, { sacrifice: [land] })));
    expect(s.objects[land]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(planActivate(s, ap, m, 0)).toBeNull();
    // Lands still arrive by effects (rulings): only the special action is stopped.
    s = passUntil(s, "upkeep", opp);
    expect(landsAllowed(s, ap)).toBe(0);
  });

  it("Unbreathing Horde: a +1/+1 counter for each other Zombie you control and each Zombie card in your graveyard", () => {
    const { s: s0, ap, opp, ids } = setup([horde()]);
    putOnBattlefield(s0, ap, zombie());
    putOnBattlefield(s0, ap, zombie("Test Ghoul"));
    putOnBattlefield(s0, opp, zombie());
    into(s0, ap, zombie(), "graveyard");
    into(s0, ap, bear(), "graveyard");
    into(s0, opp, zombie(), "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
    expect(pt(s, ids[0]!)).toBe("3/3");
    // Damage to it is prevented, and one counter removed.
    const src = putOnBattlefield(s, opp, bear());
    dealDamage(s, objectSource(s, s.objects[src]!), { object: s.objects[ids[0]!]! }, 5);
    expect(s.objects[ids[0]!]!.damage).toBe(0);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
  });

  it("Clever Conjurer: untaps any permanent but one named Clever Conjurer, as a sorcery", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, conjurer());
    const other = putOnBattlefield(s0, opp, conjurer());
    const land = s0.battlefield.find((id) => defOf(s0, s0.objects[id]!).name === "Island")!;
    s0.objects[land]!.tapped = true;
    s0.objects[other]!.tapped = true;
    expect(planActivate(s0, ap, c, 0, [tgt(other)])).toBeNull();
    expect(planActivate(s0, ap, c, 0, [tgt(c)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, c, 0, [tgt(land)])));
    expect(s.objects[land]!.tapped).toBe(false);
    expect(s.objects[c]!.tapped).toBe(true);
  });

  it("Hammerheim: the target loses every landwalk ability until end of turn, nothing else", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, hammerheim());
    const walker = putOnBattlefield(s0, opp, bear({ name: "Test Walker", oracleText: "Flying, swampwalk, snow forestwalk", keywords: ["Flying", "Swampwalk", "Snow forestwalk"] }));
    const idx = abilitiesOf(s0, s0.objects[h]!).activated.findIndex((a) => /landwalk/.test(a.text));
    let s = settle(run(s0, planActivate(s0, ap, h, idx, [tgt(walker)])));
    const kw = [...characteristics(s, s.objects[walker]!).keywords];
    expect(kw).toContain("Flying");
    expect(kw.some((k) => /walk/i.test(k))).toBe(false);
    s = passUntil(s, "upkeep", opp);
    expect([...characteristics(s, s.objects[walker]!).keywords]).toContain("Swampwalk");
  });

  it("Wave of Rats: returns when it dies only if it dealt combat damage to a player this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rats());
    let s = passUntil(s0, "declareAttackers", ap);
    s = attack(s, ap, [{ attacker: r, defender: opp }]);
    expect(s.players[opp]!.life).toBe(36);
    destroyPermanent(s, s.objects[r]!, "destroyed");
    s = settle(s);
    expect(s.objects[r]!.zone).toBe("battlefield");
    // A new object: it hasn't dealt combat damage, so it stays in the graveyard this time.
    destroyPermanent(s, s.objects[r]!, "destroyed");
    s = settle(s);
    expect(s.objects[r]!.zone).toBe("graveyard");
    // Never attacked: stays in the graveyard.
    const { s: t0, ap: bp } = setup([]);
    const r2 = putOnBattlefield(t0, bp, rats());
    destroyPermanent(t0, t0.objects[r2]!, "destroyed");
    const t = settle(t0);
    expect(t.objects[r2]!.zone).toBe("graveyard");
  });

  it("Mandate of Peace: only during combat; the combat phase ends, the stack is exiled, opponents can't cast spells this turn", () => {
    const { s: s0, ap, opp, ids } = setup([mandate(), shock]);
    expect(castProblem(s0, ap, ids[0]!)).not.toBeNull();
    const a = putOnBattlefield(s0, opp, bear());
    const theirs = into(s0, opp, shock, "hand");
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: a, defender: ap }] });
    s = toPlayer(s, ap);
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    s = toPlayer(s, ap);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(s.step).toBe("main2");
    expect(s.activePlayer).toBe(opp);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    // The Shock below it was exiled too, not resolved (and not countered, rulings).
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
    expect(s.players[opp]!.life).toBe(40);
    expect(s.objects[a]!.attacking).toBeUndefined();
    expect(s.players[ap]!.life).toBe(40);
    s.players[opp]!.manaPool.R = 1;
    expect(castProblem(s, opp, theirs)).not.toBeNull();
    // The next turn they can cast spells again.
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!);
    s = passUntil(s, "main1", opp);
    s.players[opp]!.manaPool.R = 1;
    expect(castProblem(s, opp, theirs)).toBeNull();
  });

  it("Faerie Fencing: an additional -3/-3 if you controlled a Faerie as you cast it, even if it's gone as it resolves", () => {
    const { s: s0, ap, opp, ids } = setup([fencing(), fencing()]);
    const big = putOnBattlefield(s0, opp, bear({ name: "Test Giant", power: "6", toughness: "6" }));
    const f = putOnBattlefield(s0, ap, faerie);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(big)], undefined, undefined, 1));
    destroyPermanent(s, s.objects[f]!, "destroyed");
    s = settle(s);
    expect(pt(s, big)).toBe("2/2");
    // Without a Faerie as it's cast: -X/-X only, even if one arrives before it resolves.
    s = run(s, planCast(s, ap, ids[1]!, [tgt(big)], undefined, undefined, 1));
    putOnBattlefield(s, ap, faerie);
    s = settle(s);
    expect(pt(s, big)).toBe("1/1");
  });

  it("Flame Discharge: X plus 2 damage if you controlled a modified creature as you cast it", () => {
    const { s: s0, ap, opp, ids } = setup([discharge(), discharge()]);
    const big = putOnBattlefield(s0, opp, bear({ name: "Test Giant", power: "9", toughness: "9" }));
    const mine = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(big)], undefined, undefined, 1)));
    expect(s.objects[big]!.damage).toBe(1);
    // A creature with a counter on it is modified (CR 700.9); an opponent's modified creature doesn't count.
    s.objects[mine]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(big)], undefined, undefined, 1)));
    expect(s.objects[big]!.damage).toBe(4);
  });

  it("Steer Clear: 2 damage to an attacking or blocking creature, 4 if you controlled a Mount as you cast it", () => {
    const { s: s0, ap, opp, ids } = setup([steer(), steer()]);
    const a = putOnBattlefield(s0, opp, bear({ name: "Test Giant", power: "5", toughness: "5" }));
    putOnBattlefield(s0, ap, mount);
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: a, defender: ap }] });
    s = toPlayer(s, ap);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    expect(s.objects[a]!.damage).toBe(4);
  });

  it("End Hostilities: all creatures and everything attached to creatures, at once; nothing else", () => {
    const { s: s0, ap, opp, ids } = setup([hostilities()]);
    const b = putOnBattlefield(s0, opp, bear());
    const aura = putOnBattlefield(s0, opp, card("Test Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature" }));
    s0.objects[aura]!.attachedTo = b;
    const eq = putOnBattlefield(s0, ap, card("Test Sword", "Artifact — Equipment", "{1}", { oracleText: "Equip {1}", keywords: ["Equip"] }));
    const mine = putOnBattlefield(s0, ap, bear());
    s0.objects[eq]!.attachedTo = mine;
    const loose = putOnBattlefield(s0, ap, card("Test Sword", "Artifact — Equipment", "{1}", { oracleText: "Equip {1}", keywords: ["Equip"] }));
    const land = s0.battlefield.find((id) => defOf(s0, s0.objects[id]!).name === "Forest")!;
    const landAura = putOnBattlefield(s0, ap, card("Test Land Aura", "Enchantment — Aura", "{G}", { oracleText: "Enchant land" }));
    s0.objects[landAura]!.attachedTo = land;
    const relicId = putOnBattlefield(s0, opp, relic());
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (const id of [b, aura, eq, mine]) expect(s.objects[id]!.zone, defOf(s, s.objects[id]!).name).toBe("graveyard");
    for (const id of [loose, landAura, relicId, land]) expect(s.objects[id]!.zone, defOf(s, s.objects[id]!).name).toBe("battlefield");
  });

  it("Terrifying Presence: every creature's combat damage this turn is prevented but the target's", () => {
    const { s: s0, ap, opp, ids } = setup([presence()]);
    const x = putOnBattlefield(s0, opp, bear({ name: "Test Giant", power: "5", toughness: "5" }));
    const y = putOnBattlefield(s0, opp, bear());
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: x, defender: ap }, { attacker: y, defender: ap }] });
    s = toPlayer(s, ap);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(y)])));
    s = passUntil(s, "main2", opp);
    expect(s.players[ap]!.life).toBe(38);
    // Noncombat damage isn't touched.
    const pinger = putOnBattlefield(s, opp, bear({ name: "Test Pinger" }));
    dealDamage(s, objectSource(s, s.objects[pinger]!), { player: ap }, 1);
    expect(s.players[ap]!.life).toBe(37);
  });

  it("Viashino Heretic: destroys the artifact and deals its mana value in damage to its controller", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, heretic());
    const r = putOnBattlefield(s0, opp, relic(3));
    const s = settle(run(s0, planActivate(s0, ap, h, 0, [tgt(r)])));
    expect(s.objects[r]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(37);
    // An indestructible artifact survives, and its controller is still dealt the damage.
    const { s: t0, ap: bp, opp: bo } = setup([]);
    const h2 = putOnBattlefield(t0, bp, heretic());
    const r2 = putOnBattlefield(t0, bo, card("Test Relic 4", "Artifact", "{4}", { cmc: 4, oracleText: "Indestructible", keywords: ["Indestructible"] }));
    const t = settle(run(t0, planActivate(t0, bp, h2, 0, [tgt(r2)])));
    expect(t.objects[r2]!.zone).toBe("battlefield");
    expect(t.players[bo]!.life).toBe(36);
  });

  it("Last-Ditch Effort: sacrifice any number of creatures as it resolves, that much damage to the target chosen as it was cast", () => {
    const { s: s0, ap, opp, ids } = setup([lastDitch()]);
    const mine = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear())];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "sacrifice" });
    expect(s.pending?.kind === "pickPermanents" ? s.pending.options : []).toEqual(expect.arrayContaining(mine));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: mine.slice(0, 2) }));
    expect(mine.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "battlefield"]);
    expect(s.players[opp]!.life).toBe(38);
  });

  it("Reprocess: sacrifice any mix of artifacts, creatures and lands, then a card for each", () => {
    const { s: s0, ap, ids } = setup([reprocess()]);
    const b = putOnBattlefield(s0, ap, bear());
    const r = putOnBattlefield(s0, ap, relic());
    const ench = putOnBattlefield(s0, ap, card("Test Charm", "Enchantment", "{W}"));
    const land = s0.battlefield.find((id) => defOf(s0, s0.objects[id]!).name === "Plains")!;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "sacrifice" });
    const options = s.pending?.kind === "pickPermanents" ? s.pending.options : [];
    expect(options).toEqual(expect.arrayContaining([b, r, land]));
    expect(options).not.toContain(ench);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b, r, land] }));
    for (const id of [b, r, land]) expect(s.objects[id]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });

  it("Sporogenic Infection: the target player sacrifices a creature of their choice, not the enchanted one", () => {
    const { s: s0, ap, opp, ids } = setup([sporogenic()]);
    const host = putOnBattlefield(s0, opp, bear({ name: "Test Host" }));
    const other = putOnBattlefield(s0, opp, bear({ name: "Test Other" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(host)]));
    s = settle(s, { targets: [{ kind: "player", id: opp }] });
    expect(s.objects[ids[0]!]!.attachedTo).toBe(host);
    // With only one other creature, that one goes.
    expect(s.objects[other]!.zone).toBe("graveyard");
    expect(s.objects[host]!.zone).toBe("battlefield");
    // With two others, the choice is between those two.
    const { s: t0, ap: bp, opp: bo, ids: tid } = setup([sporogenic()]);
    const h2 = putOnBattlefield(t0, bo, bear({ name: "Test Host" }));
    const o1 = putOnBattlefield(t0, bo, bear({ name: "Test One" }));
    const o2 = putOnBattlefield(t0, bo, bear({ name: "Test Two" }));
    let t = run(t0, planCast(t0, bp, tid[0]!, [tgt(h2)]));
    t = settle(t, { targets: [{ kind: "player", id: bo }] });
    expect(t.pending).toMatchObject({ kind: "pickPermanents", player: bo });
    expect([...(t.pending?.kind === "pickPermanents" ? t.pending.options : [])].sort()).toEqual([o1, o2].sort());
    // When enchanted creature is dealt damage, destroy it.
    t = settle(act(t, { type: "pickPermanents", player: bo, ids: [o1] }));
    const src = putOnBattlefield(t, bp, bear({ name: "Test Pinger" }));
    dealDamage(t, objectSource(t, t.objects[src]!), { object: t.objects[h2]! }, 1);
    t = settle(t);
    expect(t.objects[h2]!.zone).toBe("graveyard");
  });

  it("Kitsune Ace: when a Vehicle you control attacks, that Vehicle gains first strike, or untap Kitsune Ace", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kitsune());
    const v = putOnBattlefield(s0, ap, vehicle);
    const crew = abilitiesOf(s0, s0.objects[v]!).activated.findIndex((a) => /^Crew/.test(a.text));
    let s = passUntil(s0, "beginCombat", ap);
    s = toPlayer(s, ap);
    s = settle(act(s, { type: "activateAbility", player: ap, objectId: v, index: crew, tapCreatures: [k] }));
    expect(s.objects[k]!.tapped).toBe(true);
    s = passUntil(s, "declareAttackers", ap);
    const u = structuredClone(s);
    s = attack(s, ap, [{ attacker: v, defender: opp }], (x) => x.pending?.kind === "chooseModes");
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: ap });
    let a = settle(act(structuredClone(s), { type: "chooseModes", player: ap, modes: [1] }));
    expect(a.objects[k]!.tapped).toBe(false);
    expect(objHasKeyword(a, a.objects[v]!, "First strike")).toBe(false);
    a = settle(act(s, { type: "chooseModes", player: ap, modes: [0] }));
    expect(objHasKeyword(a, a.objects[v]!, "First strike")).toBe(true);
    expect(a.objects[k]!.tapped).toBe(true);
    // A non-Vehicle attacking doesn't trigger it.
    const b = putOnBattlefield(u, ap, bear());
    const w = attack(u, ap, [{ attacker: b, defender: opp }], (x) => x.pending?.kind === "chooseModes" || x.step === "main2");
    expect(w.step).toBe("main2");
  });

  it("bots: Mandate of Peace against an attack on them, not in their own combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = into(s0, opp, mandate(), "hand");
    for (const l of ["Plains", "Mountain"]) putOnBattlefield(s0, opp, card(l, `Basic Land — ${l}`));
    const big = putOnBattlefield(s0, ap, bear({ name: "Test Giant", power: "6", toughness: "6" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: big, defender: opp }] });
    for (let i = 0; i < 6 && s.objects[m]!.zone === "hand" && s.step === "declareAttackers"; i++) {
      const pid = waitingOn(s)!;
      s = pid === opp ? run(s, botActions(s, pid)) : act(s, { type: "passPriority", player: pid });
    }
    expect(s.objects[m]!.zone).toBe("stack");
    s = settle(s);
    expect(s.step).toBe("main2");
    expect(s.players[opp]!.life).toBe(40);
  });
});
