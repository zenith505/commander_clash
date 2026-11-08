// Lane B round B147: triggers on damage events. Tamanoa ("Whenever a noncreature source you control deals damage, you gain
// that much life"), Blaze Commando ("Whenever an instant or sorcery spell you control deals damage") and Flame Channeler
// ("When a spell you control deals damage, transform ~"): once for each source and damage event (CR 120.3, 603.2c), a
// spell on the stack (rulings), not a creature a spell has fight. Justice ("Whenever a red creature or spell deals damage,
// ~ deals that much damage to that creature's or spell's controller"): anyone's, all one source dealt at once added up
// (rulings). Master of Barbs ("Whenever one or more opponents are dealt noncombat damage"): once for each damage event.
// Satyr Firedancer ("Whenever an instant or sorcery spell you control deals damage to an opponent, ~ deals that much damage
// to target creature that player controls"). Briarbridge Patrol ("Whenever ~ deals damage to one or more creatures,
// investigate"): once for each event (rulings). Greatbow Doyen and Ohabi Caleria ("Whenever an Archer you control deals
// damage to a creature"): once for each creature dealt damage, combat or not (rulings), the Archer dealing Doyen's damage.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const tamanoa = (): CardDef => ({"oracleId":"14440669-ddf0-46ac-b140-13948a8113b8","name":"Tamanoa","manaCost":"{R}{G}{W}","cmc":3,"typeLine":"Creature — Spirit","supertypes":[],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Whenever a noncreature source you control deals damage, you gain that much life.","power":"2","toughness":"4","colors":["G","R","W"],"colorIdentity":["G","R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/d/6d32955b-cbf6-429b-9513-17ca75d4ec2c.jpg?1783943322","artUrl":"https://cards.scryfall.io/art_crop/front/6/d/6d32955b-cbf6-429b-9513-17ca75d4ec2c.jpg?1783943322","commanderLegal":"legal","set":"csp","releasedAt":"2006-07-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const blaze = (): CardDef => ({"oracleId":"92e2f982-f8b9-4c3b-ab50-14c025370e5c","name":"Blaze Commando","manaCost":"{3}{R}{W}","cmc":5,"typeLine":"Creature — Minotaur Soldier","supertypes":[],"types":["Creature"],"subtypes":["Minotaur","Soldier"],"oracleText":"Whenever an instant or sorcery spell you control deals damage, create two 1/1 red and white Soldier creature tokens with haste.","power":"5","toughness":"3","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/e/5e179f0d-2965-44e4-8483-67b330a8608c.jpg?1783940033","artUrl":"https://cards.scryfall.io/art_crop/front/5/e/5e179f0d-2965-44e4-8483-67b330a8608c.jpg?1783940033","commanderLegal":"legal","set":"dgm","releasedAt":"2013-05-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const justice = (): CardDef => ({"oracleId":"0586fdc7-3025-4040-8eaf-f8a57a21aff0","name":"Justice","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, sacrifice this enchantment unless you pay {W}{W}.\nWhenever a red creature or spell deals damage, this enchantment deals that much damage to that creature's or spell's controller.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9a6e0c8d-0fc1-4f52-8357-e550b0ac579a.jpg?1783947523","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9a6e0c8d-0fc1-4f52-8357-e550b0ac579a.jpg?1783947523","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const channeler = (): CardDef => ({"oracleId":"ca8950ce-43d9-47bd-85f3-58c1fad42420","name":"Flame Channeler // Embodiment of Flame","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Human Wizard // Creature — Elemental Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"When a spell you control deals damage, transform this creature.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Transform"],"imageUrl":"https://cards.scryfall.io/normal/front/c/f/cf183650-13a7-47d6-8ee9-fa8ef3df9f78.jpg?1783924402","artUrl":"https://cards.scryfall.io/art_crop/front/c/f/cf183650-13a7-47d6-8ee9-fa8ef3df9f78.jpg?1783924402","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Flame Channeler","manaCost":"{1}{R}","typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"When a spell you control deals damage, transform this creature.","power":"2","toughness":"2","colors":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/c/f/cf183650-13a7-47d6-8ee9-fa8ef3df9f78.jpg?1783924402","artUrl":"https://cards.scryfall.io/art_crop/front/c/f/cf183650-13a7-47d6-8ee9-fa8ef3df9f78.jpg?1783924402"},{"name":"Embodiment of Flame","manaCost":"","typeLine":"Creature — Elemental Wizard","supertypes":[],"types":["Creature"],"subtypes":["Elemental","Wizard"],"oracleText":"Whenever a spell you control deals damage, put a flame counter on this creature.\n{1}, Remove a flame counter from this creature: Exile the top card of your library. You may play that card this turn.","power":"3","toughness":"3","colors":["R"],"colorIndicator":["R"],"imageUrl":"https://cards.scryfall.io/normal/back/c/f/cf183650-13a7-47d6-8ee9-fa8ef3df9f78.jpg?1783924402","artUrl":"https://cards.scryfall.io/art_crop/back/c/f/cf183650-13a7-47d6-8ee9-fa8ef3df9f78.jpg?1783924402"}]}) as CardDef;
const barbs = (): CardDef => ({"oracleId":"e8c36337-135c-460d-a1da-cc01743dda71","name":"Master of Barbs","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Lizard Bard","supertypes":[],"types":["Creature"],"subtypes":["Lizard","Bard"],"oracleText":"Menace\nWhenever one or more opponents are dealt noncombat damage, creatures you control get +1/+0 until end of turn.","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/4404d9d4-9cdd-4dad-a4f6-574d90db5052.jpg?1789127596","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/4404d9d4-9cdd-4dad-a4f6-574d90db5052.jpg?1789127596","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const satyr = (): CardDef => ({"oracleId":"b30edff0-3716-4dbb-b445-5329b08e36f4","name":"Satyr Firedancer","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment Creature — Satyr","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Satyr"],"oracleText":"Whenever an instant or sorcery spell you control deals damage to an opponent, this creature deals that much damage to target creature that player controls.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fc6a735-cbf5-4af2-b15c-7ced82f0d9da.jpg?1783939542","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fc6a735-cbf5-4af2-b15c-7ced82f0d9da.jpg?1783939542","commanderLegal":"legal","set":"bng","releasedAt":"2014-02-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const patrol = (): CardDef => ({"oracleId":"784f0ca3-efe1-4e22-aedd-57cba7996fa5","name":"Briarbridge Patrol","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Human Warrior","supertypes":[],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"Whenever this creature deals damage to one or more creatures, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nAt the beginning of each end step, if you sacrificed three or more Clues this turn, you may put a creature card from your hand onto the battlefield.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Investigate"],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f44a017b-40cb-4c15-b9ea-a3ed904e4e49.jpg?1783937736","artUrl":"https://cards.scryfall.io/art_crop/front/f/4/f44a017b-40cb-4c15-b9ea-a3ed904e4e49.jpg?1783937736","commanderLegal":"legal","set":"soi","releasedAt":"2016-04-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const doyen = (): CardDef => ({"oracleId":"b32c3a35-cc77-43fa-96e1-5ec8c0ab056f","name":"Greatbow Doyen","manaCost":"{4}{G}","cmc":5,"typeLine":"Creature — Elf Archer","supertypes":[],"types":["Creature"],"subtypes":["Elf","Archer"],"oracleText":"Other Archer creatures you control get +1/+1.\nWhenever an Archer you control deals damage to a creature, that Archer deals that much damage to that creature's controller.","power":"2","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/0/a0f64e8a-2775-4f64-8728-36e7d613f54c.jpg?1783942779","artUrl":"https://cards.scryfall.io/art_crop/front/a/0/a0f64e8a-2775-4f64-8728-36e7d613f54c.jpg?1783942779","commanderLegal":"legal","set":"mor","releasedAt":"2008-02-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ohabi = (): CardDef => ({"oracleId":"e403fadb-537c-41ac-924a-450f0eabe2c4","name":"Ohabi Caleria","manaCost":"{1}{G}{W}","cmc":3,"typeLine":"Legendary Creature — Elf Archer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Archer"],"oracleText":"Reach\nUntap all Archers you control during each other player's untap step.\nWhenever an Archer you control deals damage to a creature, you may pay {2}. If you do, draw a card.","power":"1","toughness":"3","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Reach"],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82003d72-5138-4341-a53a-62b794f2bce1.jpg?1783921462","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82003d72-5138-4341-a53a-62b794f2bce1.jpg?1783921462","commanderLegal":"legal","set":"dmc","releasedAt":"2022-09-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const earthquake = (): CardDef => ({"oracleId":"9a40614b-50a3-422c-849e-53c8b7d3d204","name":"Earthquake","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Earthquake deals X damage to each creature without flying and each player.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/c/ac5d49b5-cf4d-48a4-b21d-0a3b7e6320a4.jpg?1783903402","artUrl":"https://cards.scryfall.io/art_crop/front/a/c/ac5d49b5-cf4d-48a4-b21d-0a3b7e6320a4.jpg?1783903402","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const punish = (): CardDef => ({"oracleId":"09f73f77-a9bc-4718-be7d-ba6e08576e3a","name":"Punish the Enemy","manaCost":"{4}{R}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Punish the Enemy deals 3 damage to target player or planeswalker and 3 damage to target creature.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/1/4179a72b-8482-46ec-9815-f5d6d94b5aa5.jpg?1783940037","artUrl":"https://cards.scryfall.io/art_crop/front/4/1/4179a72b-8482-46ec-9815-f5d6d94b5aa5.jpg?1783940037","commanderLegal":"legal","set":"dgm","releasedAt":"2013-05-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const preyUpon = (): CardDef => ({"oracleId":"b3c12848-528d-4005-878f-4f950a07240a","name":"Prey Upon","manaCost":"{G}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target creature you control fights target creature you don't control. (Each deals damage equal to its power to the other.)","colors":["G"],"colorIdentity":["G"],"keywords":["Fight"],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/16979827-4011-454a-9886-18326cfa3e77.jpg?1783934147","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/16979827-4011-454a-9886-18326cfa3e77.jpg?1783934147","commanderLegal":"legal","set":"grn","releasedAt":"2018-10-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const pyromancer = (): CardDef => ({"oracleId":"29b3cb3e-aeb1-43eb-8095-9f7881aa34bd","name":"Prodigal Pyromancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const rod = (): CardDef => ({"oracleId":"c29a04ab-4e14-45d8-a993-3fffd0e2f6eb","name":"Rod of Ruin","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{3}, {T}: This artifact deals 1 damage to any target.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/c/3c1f1431-b324-4915-89e8-2697cf755441.jpg?1783942979","artUrl":"https://cards.scryfall.io/art_crop/front/3/c/3c1f1431-b324-4915-89e8-2697cf755441.jpg?1783942979","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const gempalm = (): CardDef => ({"oracleId":"467ea3e3-7767-405a-9d1a-8fa5de696376","name":"Gempalm Incinerator","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Goblin","supertypes":[],"types":["Creature"],"subtypes":["Goblin"],"oracleText":"Cycling {1}{R} ({1}{R}, Discard this card: Draw a card.)\nWhen you cycle this card, you may have it deal X damage to target creature, where X is the number of Goblins on the battlefield.","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/17c231e3-10ec-458b-bba1-891812e000f6.jpg?1783918461","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/17c231e3-10ec-458b-bba1-891812e000f6.jpg?1783918461","commanderLegal":"legal","set":"dmr","releasedAt":"2023-01-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const archer = bear({ name: "Test Archer", typeLine: "Creature — Elf Archer", subtypes: ["Elf", "Archer"], power: "3", toughness: "3" });
const ogre = bear({ name: "Test Ogre", power: "2", toughness: "5" });
const volley = card("Test Volley", "Sorcery", "{R}", { oracleText: "Test Volley deals 1 damage to each opponent.", colors: ["R"], colorIdentity: ["R"] });
const blueBolt = card("Test Blue Bolt", "Instant", "{U}", { oracleText: "Test Blue Bolt deals 3 damage to any target.", colors: ["U"], colorIdentity: ["U"] });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const pl = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
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
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Cast `def` from `pid`'s hand (mana from the pool or their lands) and let it resolve. */
const castIt = (s: GameState, pid: PlayerId, def: CardDef, targets: TargetChoice[], opts: { x?: number; settle?: { targets?: TargetChoice[] } } = {}) => {
  const id = into(s, pid, def, "hand");
  return settle(run(s, planCast(s, pid, id, targets, undefined, undefined, opts.x)), opts.settle);
};
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
/** Give an opponent priority with mana in their pool, on the active player's turn (they pass first). */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 4 && s.priority !== pid; i++) s = act(s, { type: "passPriority", player: s.priority! });
  return s;
};

describe("Lane B round B147", () => {
  it("compiles all nine cards", () => supported(tamanoa(), blaze(), justice(), channeler(), barbs(), satyr(), patrol(), doyen(), ohabi()));

  it("Tamanoa: a noncreature source of yours dealing damage gains you that much life; a creature's damage doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, tamanoa());
    const life0 = s0.players[ap]!.life;
    // A spell: Lightning Bolt to an opponent, 3 life.
    let s = castIt(s0, ap, bolt(), [pl(opp)]);
    expect(s.players[opp]!.life).toBe(40 - 3);
    expect(s.players[ap]!.life).toBe(life0 + 3);
    // A noncreature permanent: Rod of Ruin's 1 damage to a creature, 1 life.
    const rod0 = putOnBattlefield(s, ap, rod());
    const target = putOnBattlefield(s, opp, ogre);
    s = settle(run(s, planActivate(s, ap, rod0, 0, [tgt(target)])));
    expect(s.objects[target]!.damage).toBe(1);
    expect(s.players[ap]!.life).toBe(life0 + 4);
    // A creature: Prodigal Pyromancer's ping gains nothing.
    const pyro = putOnBattlefield(s, ap, pyromancer());
    s = settle(run(s, planActivate(s, ap, pyro, 0, [pl(opp)])));
    expect(s.players[opp]!.life).toBe(40 - 4);
    expect(s.players[ap]!.life).toBe(life0 + 4);
  });

  it("Tamanoa: Earthquake's damage to every creature and player at once is one trigger for all of it, you included", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, tamanoa());
    putOnBattlefield(s0, opp, ogre);
    s0.players[ap]!.manaPool.R = 3;
    const life0 = s0.players[ap]!.life;
    // X = 2: Tamanoa (2/4), the Ogre and the four players, 2 each: 12 damage, one trigger.
    const id = into(s0, ap, earthquake(), "hand");
    let s = run(s0, planCast(s0, ap, id, [], undefined, undefined, 2));
    for (let i = 0; i < 20 && s.stack.some((x) => x.kind === "spell"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.filter((x) => x.kind !== "spell")).toHaveLength(1);
    s = settle(s);
    expect(s.objects[t]!.damage).toBe(2);
    expect(s.players[ap]!.life).toBe(life0 - 2 + 12);
  });

  it("Tamanoa: an opponent's noncreature source doesn't trigger it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, tamanoa());
    const rod0 = putOnBattlefield(s0, opp, rod());
    s0.players[opp]!.manaPool.C = 3;
    const life0 = s0.players[ap]!.life;
    let s = priorityTo(s0, opp);
    s = settle(run(s, planActivate(s, opp, rod0, 0, [pl(ap)])));
    expect(s.players[ap]!.life).toBe(life0 - 1);
  });

  it("Blaze Commando: Punish the Enemy's damage to a player and a creature triggers once; a fight spell doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, blaze());
    const target = putOnBattlefield(s0, opp, ogre);
    let s = castIt(s0, ap, punish(), [pl(opp), tgt(target)]);
    expect(s.players[opp]!.life).toBe(40 - 3);
    expect(named(s, ap, "Soldier Token")).toHaveLength(2);
    // Prey Upon: the creatures deal the damage, not the spell (rulings).
    const other = putOnBattlefield(s, opp, bear({ name: "Test Bear Two" }));
    s = castIt(s, ap, preyUpon(), [tgt(b), tgt(other)]);
    expect(s.objects[other]!.zone).not.toBe("battlefield");
    expect(named(s, ap, "Soldier Token")).toHaveLength(2);
    // Two spells: two triggers.
    s = castIt(s, ap, bolt(), [pl(opp)]);
    expect(named(s, ap, "Soldier Token")).toHaveLength(4);
  });

  it("Flame Channeler transforms when a spell of yours deals damage, not when its own ability or a fight does", () => {
    const { s: s0, ap, opp } = setup([]);
    const fc = putOnBattlefield(s0, ap, channeler());
    const target = putOnBattlefield(s0, opp, bear({ name: "Test Small", power: "1", toughness: "1" }));
    // Prey Upon: Flame Channeler fights; no spell dealt damage.
    let s = castIt(s0, ap, preyUpon(), [tgt(fc), tgt(target)]);
    expect(s.objects[fc]!.face ?? 0).toBe(0);
    s = castIt(s, ap, bolt(), [pl(opp)]);
    expect(s.objects[fc]!.face).toBe(1);
  });

  it("Justice: a red creature or red spell dealing damage costs its controller that much; other colors don't", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, justice());
    const pyro = putOnBattlefield(s0, opp, pyromancer());
    s0.players[opp]!.manaPool.U = 1;
    s0.players[opp]!.manaPool.R = 1;
    const life0 = s0.players[ap]!.life;
    let s = priorityTo(s0, opp);
    // The opponent's red creature pings you: Justice deals 1 to that opponent.
    s = settle(run(s, planActivate(s, opp, pyro, 0, [pl(ap)])));
    expect(s.players[ap]!.life).toBe(life0 - 1);
    expect(s.players[opp]!.life).toBe(40 - 1);
    // A blue spell: nothing.
    s = priorityTo(s, opp);
    s = castIt(s, opp, blueBolt, [pl(ap)]);
    expect(s.players[opp]!.life).toBe(40 - 1);
    // Your own red spell: Justice deals that much to you.
    s = priorityTo(s, ap);
    s = castIt(s, ap, bolt(), [pl(opp)]);
    expect(s.players[opp]!.life).toBe(40 - 4);
    expect(s.players[ap]!.life).toBe(life0 - 1 - 3 - 3);
  });

  it("Justice: Earthquake dealing damage to several things at once is one trigger for the total (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, justice());
    putOnBattlefield(s0, opp, ogre);
    s0.players[ap]!.manaPool.R = 2;
    const life0 = s0.players[ap]!.life;
    const id = into(s0, ap, earthquake(), "hand");
    let s = run(s0, planCast(s0, ap, id, [], undefined, undefined, 1));
    for (let i = 0; i < 20 && s.stack.some((x) => x.kind === "spell"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.filter((x) => x.kind !== "spell")).toHaveLength(1);
    s = settle(s);
    // 1 to the Ogre and the four players: 5, dealt to you by Justice, after Earthquake's own 1.
    expect(s.players[ap]!.life).toBe(life0 - 1 - 5);
  });

  it("Master of Barbs: once for each event that deals noncombat damage to opponents; damage to creatures alone doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, barbs());
    const target = putOnBattlefield(s0, opp, ogre);
    s0.players[ap]!.manaPool.R = 2;
    // Bolt a creature: nothing.
    let s = castIt(s0, ap, bolt(), [tgt(target)]);
    expect(power(s, s.objects[m]!)).toBe(2);
    // 1 damage to each opponent, three of them at once: one +1/+0.
    s = castIt(s, ap, volley, []);
    expect(power(s, s.objects[m]!)).toBe(3);
    // Bolt an opponent: another.
    s = castIt(s, ap, bolt(), [pl(opp)]);
    expect(power(s, s.objects[m]!)).toBe(4);
  });

  it("Satyr Firedancer: your spell's damage to an opponent is dealt again to a creature that opponent controls", () => {
    const { s: s0, ap, opp } = setup([]);
    const sat = putOnBattlefield(s0, ap, satyr());
    const target = putOnBattlefield(s0, opp, ogre);
    const s1 = castIt(s0, ap, bolt(), [pl(opp)], { settle: { targets: [tgt(target)] } });
    expect(s1.players[opp]!.life).toBe(40 - 3);
    expect(s1.objects[target]!.damage).toBe(3);
    // Its source is the Satyr, not the spell.
    expect(s1.log.some((l) => /Satyr Firedancer deals 3 damage to Test Ogre/.test(l.text ?? String(l)))).toBe(true);
    expect(sat).toBeDefined();
  });

  it("Briarbridge Patrol: dealing damage to one creature is one Clue", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, patrol());
    const target = putOnBattlefield(s0, opp, bear({ name: "Test Small" }));
    const s = castIt(s0, ap, preyUpon(), [tgt(p), tgt(target)]);
    expect(named(s, ap, "Clue Token")).toHaveLength(1);
  });

  it("Briarbridge Patrol: its combat damage to two blockers is one Clue (rulings: once per combat damage step)", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, patrol());
    const b1 = putOnBattlefield(s0, opp, bear({ name: "Test Small", power: "1", toughness: "1" }));
    const b2 = putOnBattlefield(s0, opp, bear({ name: "Test Small Two", power: "1", toughness: "1" }));
    s0.players[ap]!.hand = [];
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: p, defender: opp }] });
    for (let i = 0; i < 40 && s.pending?.kind !== "declareBlockers"; i++) s = s.pending ? s : act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: p }, { blocker: b2, attacker: p }] });
    for (let i = 0; i < 100 && s.step !== "endCombat" && s.step !== "main2"; i++) {
      if (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[b1]!.zone).toBe("graveyard");
    expect(s.objects[b2]!.zone).toBe("graveyard");
    expect(named(s, ap, "Clue Token")).toHaveLength(1);
  });

  it("Greatbow Doyen: an Archer of yours damaging a creature deals that much again to that creature's controller", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, doyen());
    const a = putOnBattlefield(s0, ap, archer);
    const target = putOnBattlefield(s0, opp, ogre);
    // The Archer is 4/4 with Doyen: it deals 4 to the 2/5 Ogre in the fight, then 4 to the Ogre's controller.
    const s = castIt(s0, ap, preyUpon(), [tgt(a), tgt(target)]);
    expect(s.objects[target]!.damage).toBe(4);
    expect(s.objects[a]!.damage).toBe(2);
    expect(s.players[opp]!.life).toBe(40 - 4);
    expect(s.log.some((l) => /Test Archer deals 4 damage to /.test(JSON.stringify(l)) && !/Ogre/.test(JSON.stringify(l)))).toBe(true);
  });

  it("Ohabi Caleria: an Archer damaging a creature lets you pay {2} to draw", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, ohabi());
    const target = putOnBattlefield(s0, opp, bear({ name: "Test Small" }));
    const hand0 = s0.players[ap]!.hand.length;
    let s = castIt(s0, ap, preyUpon(), [tgt(o), tgt(target)]);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s.players[ap]!.manaPool.C = 2;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.hand.length).toBe(hand0 + 1);
    expect(s.players[ap]!.manaPool.C).toBe(0);
  });
});
