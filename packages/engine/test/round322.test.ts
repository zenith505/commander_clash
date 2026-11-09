// Round 322 (Lane A, skip-list cards): combat damage to you prevented this combat when the attacking player leaves another
// opponent unattacked (Suppressor Skyguard); a revealed creature card with mana value 6 or greater transforms it, and copies
// of an attacking creature, two of a Serpent (Runo Stromkirk // Krothuss); a card discarded or put into a graveyard from a
// library this turn returned to its owner's hand (Ghost of Ramirez DePietro); a draw before each connive (Leader,
// Super-Genius); a Curse with a name no Curse on that player has (Curse of Misfortunes); permanents you own taken back and
// permanents given away for cards (Coveted Falcon); an exchange with an opponent's permanent of equal or lesser mana value
// (Puca's Mischief); protection from permanents with corruption counters, and control of each of them (Geyadrone Dihada).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planTurnFaceUp, setFace, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes (no attacks, no blocks) until `done`, other players' questions as the bots would; stops at a question of `me`'s. */
const until = (s: GameState, me: PlayerId, done: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000 && !done(s); i++) {
    const p = s.pending;
    if (p && p.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p && p.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p && p.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p && p.player === me) return s;
    else s = p ? act(s, botActions(s, p.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A copy of `def` in `pid`'s hand, graveyard or library (on top). */
const inZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const nextOf = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % s.turnOrder.length]!;
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(typeof l === "string" ? l : (l as { text: string }).text));

// Real oracle text (Scryfall).
const skyguard = (): CardDef => ({"oracleId":"06c47664-2b4b-468e-a38d-04b62e6edd67","name":"Suppressor Skyguard","manaCost":"{2}{W}{U}","cmc":4,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"Flying\nWhenever a player attacks you, if that player has another opponent who isn't being attacked, prevent all combat damage that would be dealt to you this combat.","power":"2","toughness":"4","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/f/b/fbdaca43-a5be-43e3-8dd9-3a5f2cd8f0d0.jpg?1783912571","artUrl":"https://cards.scryfall.io/art_crop/front/f/b/fbdaca43-a5be-43e3-8dd9-3a5f2cd8f0d0.jpg?1783912571","commanderLegal":"legal","set":"clu","releasedAt":"2024-02-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const runo = (): CardDef => ({"oracleId":"70d7d1a7-9d39-44ec-a4ea-a70ffa453d23","name":"Runo Stromkirk // Krothuss, Lord of the Deep","manaCost":"{1}{U}{B}","cmc":3,"typeLine":"Legendary Creature — Vampire Cleric // Legendary Creature — Kraken Horror","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire","Cleric"],"oracleText":"Flying\nWhen Runo enters, put up to one target creature card from your graveyard on top of your library.\nAt the beginning of your upkeep, look at the top card of your library. You may reveal that card. If a creature card with mana value 6 or greater is revealed this way, transform Runo.","power":"1","toughness":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Flying","Transform"],"imageUrl":"https://cards.scryfall.io/normal/front/3/4/348f80f6-a5e2-4c01-a368-1ce935af8212.jpg?1783924156","artUrl":"https://cards.scryfall.io/art_crop/front/3/4/348f80f6-a5e2-4c01-a368-1ce935af8212.jpg?1783924156","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Runo Stromkirk","manaCost":"{1}{U}{B}","typeLine":"Legendary Creature — Vampire Cleric","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire","Cleric"],"oracleText":"Flying\nWhen Runo enters, put up to one target creature card from your graveyard on top of your library.\nAt the beginning of your upkeep, look at the top card of your library. You may reveal that card. If a creature card with mana value 6 or greater is revealed this way, transform Runo.","power":"1","toughness":"4","colors":["B","U"],"imageUrl":"https://cards.scryfall.io/normal/front/3/4/348f80f6-a5e2-4c01-a368-1ce935af8212.jpg?1783924156","artUrl":"https://cards.scryfall.io/art_crop/front/3/4/348f80f6-a5e2-4c01-a368-1ce935af8212.jpg?1783924156"},{"name":"Krothuss, Lord of the Deep","manaCost":"","typeLine":"Legendary Creature — Kraken Horror","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Kraken","Horror"],"oracleText":"Flying\nWhenever Krothuss attacks, create a tapped and attacking token that's a copy of another target attacking creature. If that creature is a Kraken, Leviathan, Octopus, or Serpent, create two of those tokens instead.","power":"3","toughness":"5","colors":["B","U"],"colorIndicator":["B","U"],"imageUrl":"https://cards.scryfall.io/normal/back/3/4/348f80f6-a5e2-4c01-a368-1ce935af8212.jpg?1783924156","artUrl":"https://cards.scryfall.io/art_crop/back/3/4/348f80f6-a5e2-4c01-a368-1ce935af8212.jpg?1783924156"}]} as CardDef);
const ghost = (): CardDef => ({"oracleId":"07fe0fb5-cf34-4ba4-a3f3-ac0cc919bf91","name":"Ghost of Ramirez DePietro","manaCost":"{2}{U}","cmc":3,"typeLine":"Legendary Creature — Spirit Pirate","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit","Pirate"],"oracleText":"Ghost of Ramirez DePietro can't be blocked by creatures with toughness 3 or greater.\nWhenever Ghost of Ramirez DePietro deals combat damage to a player, choose up to one target card in a graveyard that was discarded or put there from a library this turn. Put that card into its owner's hand.\nPartner (You can have two commanders if both have partner.)","power":"2","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Partner"],"imageUrl":"https://cards.scryfall.io/normal/front/e/4/e4a41506-85c6-4362-b983-36df13db09d9.jpg?1783928861","artUrl":"https://cards.scryfall.io/art_crop/front/e/4/e4a41506-85c6-4362-b983-36df13db09d9.jpg?1783928861","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const leader = (): CardDef => ({"oracleId":"bec686dd-a9ea-4db5-bc20-8e40420b9a9b","name":"Leader, Super-Genius","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Legendary Creature — Gamma Scientist Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Gamma","Scientist","Villain"],"oracleText":"If a creature you control would connive, instead you draw a card, then that creature connives.\nAt the beginning of combat on your turn, target creature you control connives. (Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on that creature.)","power":"1","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Connive"],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c8aab8d-2dfe-49c8-9aa8-536b0587b467.jpg?1783902955","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c8aab8d-2dfe-49c8-9aa8-536b0587b467.jpg?1783902955","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const misfortunes = (): CardDef => ({"oracleId":"b03c7c8d-8206-45cd-8ead-8f7b35c03a7a","name":"Curse of Misfortunes","manaCost":"{4}{B}","cmc":5,"typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nAt the beginning of your upkeep, you may search your library for a Curse card that doesn't have the same name as a Curse attached to enchanted player, put it onto the battlefield attached to that player, then shuffle.","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/c/5/c531d218-ff1c-4333-a19d-446d709b1e28.jpg?1783940833","artUrl":"https://cards.scryfall.io/art_crop/front/c/5/c531d218-ff1c-4333-a19d-446d709b1e28.jpg?1783940833","commanderLegal":"legal","set":"dka","releasedAt":"2012-02-03","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const falcon = (): CardDef => ({"oracleId":"4c495e94-3194-47c7-8129-dd0a0f915daa","name":"Coveted Falcon","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Artifact Creature — Bird","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Bird"],"oracleText":"Flying\nWhenever this creature attacks, gain control of target permanent you own but don't control.\nDisguise {1}{U}\nWhen this creature is turned face up, target opponent gains control of any number of target permanents you control. Draw a card for each one they gained control of this way.","power":"1","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Disguise"],"imageUrl":"https://cards.scryfall.io/normal/front/0/3/03e5b027-7cd5-4343-b029-f4d197e1f1da.jpg?1783912776","artUrl":"https://cards.scryfall.io/art_crop/front/0/3/03e5b027-7cd5-4343-b029-f4d197e1f1da.jpg?1783912776","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const puca = (): CardDef => ({"oracleId":"a8e6655c-e63f-4a60-98f6-9d5bf8631488","name":"Puca's Mischief","manaCost":"{3}{U}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, you may exchange control of target nonland permanent you control and target nonland permanent an opponent controls with equal or lesser mana value.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/3/8380bd90-35f2-4936-995b-af6427f61752.jpg?1783942759","artUrl":"https://cards.scryfall.io/art_crop/front/8/3/8380bd90-35f2-4936-995b-af6427f61752.jpg?1783942759","commanderLegal":"legal","set":"shm","releasedAt":"2008-05-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const pierced = (): CardDef => ({"oracleId":"f22c3624-6bd5-4761-b8ad-ac301ad9351c","name":"Curse of the Pierced Heart","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nAt the beginning of enchanted player's upkeep, this Aura deals 1 damage to that player or a planeswalker that player controls.","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/7/1/71010182-c004-4d18-adab-80319cd1e625.jpg?1783940940","artUrl":"https://cards.scryfall.io/art_crop/front/7/1/71010182-c004-4d18-adab-80319cd1e625.jpg?1783940940","commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const deathsHold = (): CardDef => ({"oracleId":"7194cf15-69fc-46f0-987a-2cea8b498f50","name":"Curse of Death's Hold","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nCreatures enchanted player controls get -1/-1.","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/1774d0a8-1cd3-4582-ace0-1caff92af0e7.jpg?1783940958","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/1774d0a8-1cd3-4582-ace0-1caff92af0e7.jpg?1783940958","commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const dihada = (): CardDef => ({"oracleId":"e1105d84-86b5-44ef-9efc-d994ee1c35cc","name":"Geyadrone Dihada","manaCost":"{1}{U}{B}{R}","cmc":4,"typeLine":"Legendary Planeswalker — Dihada","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Dihada"],"oracleText":"Protection from permanents with corruption counters on them\n+1: Each opponent loses 2 life and you gain 2 life. Put a corruption counter on up to one other target creature or planeswalker.\n−3: Gain control of target creature or planeswalker until end of turn. Untap it and put a corruption counter on it. It gains haste until end of turn.\n−7: Gain control of each permanent with a corruption counter on it.","loyalty":"4","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":["Protection"],"imageUrl":"https://cards.scryfall.io/normal/front/3/d/3d228005-91f1-451e-ab6f-1f86316708a7.jpg?1783926815","artUrl":"https://cards.scryfall.io/art_crop/front/3/d/3d228005-91f1-451e-ab6f-1f86316708a7.jpg?1783926815","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const bear = (name: string) => card(name, "Creature — Bear", "{1}{G}", { cmc: 2, power: "2", toughness: "2" });
const rock = (name: string, mv = 2) => card(name, "Artifact", `{${mv}}`, { cmc: mv });

describe("round 322", () => {
  it("are fully supported", () => supported(skyguard(), runo(), ghost(), leader(), misfortunes(), falcon(), puca(), dihada()));
});

describe("round 322: Suppressor Skyguard", () => {
  const scene = (attackers: number) => {
    const { s, ap, opp } = setup([]);
    const sky = putOnBattlefield(s, opp, skyguard());
    const bears = Array.from({ length: attackers }, (_, i) => putOnBattlefield(s, ap, bear(`Bear ${i}`)));
    return { s, ap, opp, sky, bears };
  };
  const attack = (s0: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId; planeswalker?: string }[]) => {
    let s = passUntil(s0, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks });
    return s;
  };

  it("prevents the combat damage to you when the attacker leaves another opponent unattacked, for this combat only", () => {
    const { s: s0, ap, opp, bears } = scene(1);
    const life = s0.players[opp]!.life;
    let s = attack(s0, ap, [{ attacker: bears[0]!, defender: opp }]);
    s = passUntil(s, "endCombat");
    expect(s.players[opp]!.life).toBe(life);
    expect(logged(s, /Suppressor Skyguard: all combat damage that would be dealt to \w+ this combat will be prevented/)).toBe(true);
    s = passUntil(s, "main2");
    expect((s.damageRules ?? []).length).toBe(0);
  });

  it("doesn't trigger when every one of the attacker's opponents is attacked", () => {
    const { s: s0, ap, opp, bears } = scene(3);
    const life = s0.players[opp]!.life;
    const o2 = nextOf(s0, opp);
    const o3 = nextOf(s0, o2);
    let s = attack(s0, ap, [{ attacker: bears[0]!, defender: opp }, { attacker: bears[1]!, defender: o2 }, { attacker: bears[2]!, defender: o3 }]);
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
    s = passUntil(s, "endCombat");
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("an opponent whose planeswalker is attacked isn't being attacked (rulings)", () => {
    const { s: s0, ap, opp, bears } = scene(3);
    const life = s0.players[opp]!.life;
    const o2 = nextOf(s0, opp);
    const o3 = nextOf(s0, o2);
    const walker = putOnBattlefield(s0, o3, card("Test Walker", "Legendary Planeswalker — Jace", "{3}", { cmc: 3, loyalty: "5" }));
    s0.objects[walker]!.counters.loyalty = 5;
    let s = attack(s0, ap, [{ attacker: bears[0]!, defender: opp }, { attacker: bears[1]!, defender: o2 }, { attacker: bears[2]!, defender: o3, planeswalker: walker }]);
    s = passUntil(s, "endCombat");
    expect(s.players[opp]!.life).toBe(life);
    expect(s.objects[walker]!.counters.loyalty).toBe(3);
  });
});

describe("round 322: Runo Stromkirk // Krothuss, Lord of the Deep", () => {
  const big = card("Big Kraken", "Creature — Kraken", "{5}{U}", { cmc: 6, power: "6", toughness: "6" });
  const small = card("Small Kraken", "Creature — Kraken", "{4}{U}", { cmc: 5, power: "5", toughness: "5" });

  it("transforms at your upkeep when you reveal a creature card with mana value 6 or greater on top", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, runo());
    inZone(s0, ap, big, "library");
    let s = until(s0, ap, (x) => x.turn > s0.turn && x.activePlayer === ap && x.step === "upkeep" && !!x.pending);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(nameOf(s, r)).toBe("Krothuss, Lord of the Deep");
  });

  it("isn't asked about a creature card with mana value 5", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, runo());
    inZone(s0, ap, small, "library");
    const s = until(s0, ap, (x) => x.turn > s0.turn && x.activePlayer === ap && x.step === "draw");
    expect(s.pending?.kind).not.toBe("chooseMay");
    expect(nameOf(s, r)).toBe("Runo Stromkirk");
  });

  const krothussAttack = (other: CardDef) => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, runo());
    setFace(s0, s0.objects[k]!, 1);
    invalidateCharacteristics(s0);
    const mate = putOnBattlefield(s0, ap, other);
    let s = passUntil(s0, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }, { attacker: mate, defender: opp }] });
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(mate)] });
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseOption" && p.player === ap) s = act(s, botActions(s, ap)[0]!);
      else s = settle(s, ap);
    }
    return { s, ap, mate };
  };

  it("Krothuss copies another attacking creature, tapped and attacking", () => {
    const { s, mate } = krothussAttack(bear("Grizzly Bear"));
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken && nameOf(s, id) === "Grizzly Bear");
    expect(tokens.length).toBe(1);
    expect(s.objects[tokens[0]!]!.tapped).toBe(true);
    expect(s.objects[tokens[0]!]!.attacking).toBeDefined();
    expect(s.objects[mate]!.attacking).toBeDefined();
  });

  it("two copies of a Kraken, Leviathan, Octopus or Serpent", () => {
    const { s } = krothussAttack(card("Sea Serpent", "Creature — Serpent", "{5}{U}", { cmc: 6, power: "5", toughness: "5" }));
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && nameOf(s, id) === "Sea Serpent").length).toBe(2);
  });
});

describe("round 322: Ghost of Ramirez DePietro", () => {
  const scene = () => {
    const { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, ghost());
    const discarded = inZone(s, opp, bear("Discarded Bear"), "graveyard");
    s.objects[discarded]!.discardedTurn = s.turn;
    const milled = inZone(s, opp, bear("Milled Bear"), "graveyard");
    s.objects[milled]!.fromLibraryTurn = s.turn;
    const old = inZone(s, opp, bear("Old Bear"), "graveyard");
    s.objects[old]!.discardedTurn = s.turn - 1;
    let s1 = passUntil(s, "declareAttackers");
    s1 = act(s1, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] });
    s1 = until(s1, ap, (x) => x.pending?.kind === "chooseTargets" && x.pending.player === ap);
    return { s: s1, ap, opp, discarded, milled, old };
  };

  it("returns a card discarded this turn to its owner's hand", () => {
    const { s: s0, ap, opp, discarded } = scene();
    expect(s0.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const s = settle(act(s0, { type: "chooseTargets", player: ap, targets: [target(discarded)] }), ap);
    expect(s.players[opp]!.hand).toContain(discarded);
  });

  it("a card put there from a library this turn too; not one discarded on an earlier turn (rulings)", () => {
    const { s: s0, ap, opp, milled, old } = scene();
    expect(() => act(s0, { type: "chooseTargets", player: ap, targets: [target(old)] })).toThrow();
    const s = settle(act(s0, { type: "chooseTargets", player: ap, targets: [target(milled)] }), ap);
    expect(s.players[opp]!.hand).toContain(milled);
    expect(s.players[opp]!.graveyard).toContain(old);
  });
});

describe("round 322: Leader, Super-Genius", () => {
  it("you draw a card before a creature you control connives", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, leader());
    const hand = s0.players[ap]!.hand.length;
    let s = until(s0, ap, (x) => x.step === "beginCombat" && x.pending?.kind === "chooseTargets");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(l)] }), ap);
    // Two cards drawn (one for Leader's replacement, one for connive), then one discarded.
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    const land = s.players[ap]!.hand.find((id) => characteristics(s, s.objects[id]!).types.includes("Land"))!;
    s = settle(act(s, { type: "discard", player: ap, objectIds: [land] }), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(logged(s, /draws a card first \(Leader, Super-Genius\)/)).toBe(true);
  });

  it("two Leaders: two cards first (each replacement applies once, CR 614.5)", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, leader());
    putOnBattlefield(s0, ap, leader());
    // The legend rule keeps one: give the second another name.
    const second = s0.battlefield.find((id) => id !== l && s0.objects[id]!.cardId === s0.objects[l]!.cardId)!;
    const def = leader();
    s0.cards["test:leader2"] = { ...def, oracleId: "test:leader2", name: "Leader Two", oracleText: def.oracleText!.split("\n")[0]!, supertypes: [] };
    s0.objects[second]!.cardId = "test:leader2";
    invalidateCharacteristics(s0);
    const hand = s0.players[ap]!.hand.length;
    let s = until(s0, ap, (x) => x.step === "beginCombat" && x.pending?.kind === "chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(l)] }), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });
});

describe("round 322: Curse of Misfortunes", () => {
  it("searches for a Curse whose name no Curse attached to that player has, and attaches it to them", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, misfortunes());
    s0.objects[m]!.attachedToPlayer = opp;
    const heart = putOnBattlefield(s0, ap, pierced());
    s0.objects[heart]!.attachedToPlayer = opp;
    const libHeart = inZone(s0, ap, pierced(), "library");
    const libMis = inZone(s0, ap, misfortunes(), "library");
    const hold = inZone(s0, ap, deathsHold(), "library");
    invalidateCharacteristics(s0);
    let s = until(s0, ap, (x) => x.turn > s0.turn && x.activePlayer === ap && x.step === "upkeep" && x.pending?.kind === "chooseMay");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const cards = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(cards).toContain(hold);
    expect(cards).not.toContain(libHeart);
    expect(cards).not.toContain(libMis);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [hold] }), ap);
    expect(s.objects[hold]!.zone).toBe("battlefield");
    expect(s.objects[hold]!.attachedToPlayer).toBe(opp);
  });
});

describe("round 322: Coveted Falcon", () => {
  it("whenever it attacks, you gain control of target permanent you own but don't control", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, falcon());
    const mine = putOnBattlefield(s0, opp, rock("Lent Rock"));
    s0.objects[mine]!.owner = ap;
    const theirs = putOnBattlefield(s0, opp, rock("Their Rock"));
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers");
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: f, defender: opp }] }), ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(theirs)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(mine)] }), ap);
    expect(controllerOf(s, s.objects[mine]!)).toBe(ap);
  });

  it("turned face up: target opponent gains control of the permanents you choose, and you draw a card for each", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, falcon());
    s0.objects[f]!.faceDown = "disguise";
    const a = putOnBattlefield(s0, ap, rock("Rock A"));
    const b = putOnBattlefield(s0, ap, rock("Rock B"));
    invalidateCharacteristics(s0);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planTurnFaceUp(s0, ap, f)), ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }, target(a), target(b)] }), ap);
    expect(controllerOf(s, s.objects[a]!)).toBe(opp);
    expect(controllerOf(s, s.objects[b]!)).toBe(opp);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("a bot turning it face up gives nothing away", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, opp, falcon());
    s0.objects[f]!.faceDown = "disguise";
    const keep = putOnBattlefield(s0, opp, rock("Bot Rock"));
    for (const l of ["Island", "Island"]) putOnBattlefield(s0, opp, card(l, "Basic Land — Island"));
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "upkeep", opp);
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planTurnFaceUp(s, opp, f));
    s = settle(s);
    expect(controllerOf(s, s.objects[keep]!)).toBe(opp);
    expect(controllerOf(s, s.objects[f]!)).toBe(opp);
  });
});

describe("round 322: Puca's Mischief", () => {
  const scene = () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, puca());
    const mine = putOnBattlefield(s, ap, rock("My Rock", 3));
    const cheap = putOnBattlefield(s, opp, rock("Cheap Rock", 2));
    const dear = putOnBattlefield(s, opp, rock("Dear Rock", 5));
    const s1 = until(s, ap, (x) => x.turn > s.turn && x.activePlayer === ap && x.step === "upkeep" && x.pending?.kind === "chooseTargets");
    return { s: s1, ap, opp, mine, cheap, dear };
  };

  it("exchanges your nonland permanent for an opponent's with equal or lesser mana value", () => {
    const { s: s0, ap, opp, mine, cheap, dear } = scene();
    expect(s0.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s0, { type: "chooseTargets", player: ap, targets: [target(mine), target(dear)] })).toThrow();
    let s = settle(act(s0, { type: "chooseTargets", player: ap, targets: [target(mine), target(cheap)] }), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(controllerOf(s, s.objects[mine]!)).toBe(opp);
    expect(controllerOf(s, s.objects[cheap]!)).toBe(ap);
  });

  it("no exchange when the opponent's permanent's mana value is greater as it resolves", () => {
    const { s: s0, ap, opp, mine, cheap } = scene();
    let s = act(s0, { type: "chooseTargets", player: ap, targets: [target(mine), target(cheap)] });
    // Their permanent becomes a copy-sized mana value 6 before it resolves (a different card).
    s.cards["test:dear"] = { ...rock("Grown Rock", 6), oracleId: "test:dear" };
    s.objects[cheap]!.cardId = "test:dear";
    invalidateCharacteristics(s);
    s = settle(s, ap);
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(controllerOf(s, s.objects[mine]!)).toBe(ap);
    expect(controllerOf(s, s.objects[cheap]!)).toBe(opp);
  });

  it("a bot takes a permanent worth more, within the mana value", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, puca());
    const junk = putOnBattlefield(s0, opp, rock("Junk", 4));
    const prize = putOnBattlefield(s0, ap, card("Prize Dragon", "Creature — Dragon", "{4}", { cmc: 4, power: "6", toughness: "6" }));
    putOnBattlefield(s0, ap, card("Huge Dragon", "Creature — Dragon", "{7}", { cmc: 7, power: "9", toughness: "9" }));
    const s = until(s0, -1 as PlayerId, (x) => x.turn > s0.turn && x.activePlayer === opp && x.step === "draw");
    expect(controllerOf(s, s.objects[prize]!)).toBe(opp);
    expect(controllerOf(s, s.objects[junk]!)).toBe(ap);
  });
});

describe("round 322: Geyadrone Dihada", () => {
  const pinger = card("Prodigal Pinger", "Creature — Human Wizard", "{2}{R}", { cmc: 3, power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });

  it("can't be targeted by an ability of a permanent with a corruption counter on it; one without can", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, dihada());
    s0.objects[d]!.counters.loyalty = 3;
    const bad = putOnBattlefield(s0, opp, pinger);
    const good = putOnBattlefield(s0, opp, { ...pinger, oracleId: "test:pinger2", name: "Other Pinger" });
    s0.objects[bad]!.counters.corruption = 1;
    invalidateCharacteristics(s0);
    const s = act(s0, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    expect(abilityProblem(s, opp, bad, 0, [target(d)])).toMatch(/target/i);
    expect(abilityProblem(s, opp, bad, 0, [{ kind: "player", id: ap }])).toBeNull();
    expect(abilityProblem(s, opp, good, 0, [target(d)])).toBeNull();
  });

  it("damage from a creature with a corruption counter attacking it is prevented (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, opp, dihada());
    s0.objects[d]!.counters.loyalty = 5;
    const a = putOnBattlefield(s0, ap, bear("Corrupt Bear"));
    s0.objects[a]!.counters.corruption = 1;
    const b = putOnBattlefield(s0, ap, bear("Clean Bear"));
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp, planeswalker: d }, { attacker: b, defender: opp, planeswalker: d }] });
    s = passUntil(s, "endCombat");
    expect(s.objects[d]!.counters.loyalty).toBe(3);
  });

  it("−7: you gain control of each permanent with a corruption counter on it", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, dihada());
    s0.objects[d]!.counters.loyalty = 7;
    const theirs = putOnBattlefield(s0, opp, bear("Their Bear"));
    s0.objects[theirs]!.counters.corruption = 1;
    const other = putOnBattlefield(s0, nextOf(s0, opp), rock("Their Rock"));
    s0.objects[other]!.counters.corruption = 2;
    const clean = putOnBattlefield(s0, opp, bear("Clean Bear"));
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planActivate(s0, ap, d, 2)), ap);
    expect([theirs, other, clean].map((id) => controllerOf(s, s.objects[id]!))).toEqual([ap, ap, opp]);
  });
});
