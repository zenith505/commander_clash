// Lane B round B108: Skull Raid, Prohibit, Dimensional Infiltrator, Zenith Flare, Dazzling Reflection, Mark of Eviction,
// Suffer the Past, Recall, Deathless Knight, Dimir Machinations, Nim Devourer, Cathedral Membrane, Defiant Vanguard and
// Sludge Titan.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
/** `ap` attacks with `attacks`, then `blocker`'s controller blocks with `blocks`, everyone else blocking nothing. */
const combat = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], defender: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 20 && !(s.pending?.kind === "declareBlockers" && s.pending.player === defender); i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return act(s, { type: "declareBlockers", player: defender, blocks });
};
/** Puts every card of `pid`'s hand on the bottom of their library. */
const trimHand = (s: GameState, pid: PlayerId) => {
  const p = s.players[pid]!;
  for (const id of p.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
};

// Real oracle text (Scryfall).
const raid = (): CardDef => ({"oracleId":"7d22c7ed-2f45-42af-b999-b921f4f4db25","name":"Skull Raid","manaCost":"{3}{B}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target opponent discards two cards. If fewer than two cards were discarded this way, you draw cards equal to the difference.\nForetell {1}{B} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)","colors":["B"],"colorIdentity":["B"],"keywords":["Foretell"],"imageUrl":"https://cards.scryfall.io/normal/front/4/5/4589c520-4db3-47bf-bfb2-5d7e02ede4bf.jpg?1783928240","artUrl":"https://cards.scryfall.io/art_crop/front/4/5/4589c520-4db3-47bf-bfb2-5d7e02ede4bf.jpg?1783928240","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const prohibit = (): CardDef => ({"oracleId":"d95f1797-56f9-41be-a5fe-8398961f4b8b","name":"Prohibit","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Kicker {2} (You may pay an additional {2} as you cast this spell.)\nCounter target spell if its mana value is 2 or less. If this spell was kicked, counter that spell if its mana value is 4 or less instead.","colors":["U"],"colorIdentity":["U"],"keywords":["Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0daa5458-2a97-40d0-b18d-2381a7a68ee1.jpg?1783945705","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0daa5458-2a97-40d0-b18d-2381a7a68ee1.jpg?1783945705","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const infiltrator = (): CardDef => ({"oracleId":"b93732e4-7aeb-4c37-a415-2b0ff46e2056","name":"Dimensional Infiltrator","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Eldrazi","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"Devoid (This card has no color.)\nFlash\nFlying\n{1}{C}: Target opponent exiles the top card of their library. If it's a land card, you may return this creature to its owner's hand. ({C} represents colorless mana.)","power":"2","toughness":"1","colors":[],"colorIdentity":["U"],"keywords":["Flying","Devoid","Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0ea28dd5-57b0-4255-a3d9-1c190c446f20.jpg?1783937921","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0ea28dd5-57b0-4255-a3d9-1c190c446f20.jpg?1783937921","commanderLegal":"legal","set":"ogw","releasedAt":"2016-01-22","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const flare = (): CardDef => ({"oracleId":"ae005f00-3817-40ca-b8be-069a4085cfee","name":"Zenith Flare","manaCost":"{2}{R}{W}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Zenith Flare deals X damage to any target and you gain X life, where X is the number of cards with a cycling ability in your graveyard.","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0efac1ed-3f01-487c-86be-8239568b4425.jpg?1783931012","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0efac1ed-3f01-487c-86be-8239568b4425.jpg?1783931012","commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const reflection = (): CardDef => ({"oracleId":"44db1ff5-7082-4da4-8f4f-4a2d2e3d7666","name":"Dazzling Reflection","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"You gain life equal to target creature's power. The next time that creature would deal damage this turn, prevent that damage.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/7/f77977e8-25d8-4531-a6fc-8c46e6904670.jpg?1783937927","artUrl":"https://cards.scryfall.io/art_crop/front/f/7/f77977e8-25d8-4531-a6fc-8c46e6904670.jpg?1783937927","commanderLegal":"legal","set":"ogw","releasedAt":"2016-01-22","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const eviction = (): CardDef => ({"oracleId":"d9193641-a7f4-40d3-ac62-15015acece4e","name":"Mark of Eviction","manaCost":"{U}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nAt the beginning of your upkeep, return enchanted creature and all Auras attached to that creature to their owners' hands.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae826236-e591-4afb-817b-0017a11010ad.jpg?1783943682","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae826236-e591-4afb-817b-0017a11010ad.jpg?1783943682","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const suffer = (): CardDef => ({"oracleId":"edf46ef0-159d-4f0b-ae14-14e0c8446382","name":"Suffer the Past","manaCost":"{X}{B}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile X target cards from target player's graveyard. For each card exiled this way, that player loses 1 life and you gain 1 life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/7/b7e959ec-7ba2-429d-a5b9-b5e4d97dfd4e.jpg?1783941980","artUrl":"https://cards.scryfall.io/art_crop/front/b/7/b7e959ec-7ba2-429d-a5b9-b5e4d97dfd4e.jpg?1783941980","commanderLegal":"legal","set":"roe","releasedAt":"2010-04-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const recall = (): CardDef => ({"oracleId":"4158f397-4ee4-4f53-90f2-3b64bfe4f9b8","name":"Recall","manaCost":"{X}{X}{U}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Discard X cards, then return a card from your graveyard to your hand for each card discarded this way. Exile Recall.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/33296718-0625-4422-a65c-b21cf99c52ec.jpg?1783948072","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/33296718-0625-4422-a65c-b21cf99c52ec.jpg?1783948072","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const knight = (): CardDef => ({"oracleId":"f96f1a94-6226-4e1f-a7fb-a43a276b3c3a","name":"Deathless Knight","manaCost":"{B/G}{B/G}{B/G}{B/G}","cmc":4,"typeLine":"Creature — Skeleton Knight","supertypes":[],"types":["Creature"],"subtypes":["Skeleton","Knight"],"oracleText":"Haste\nWhen you gain life for the first time each turn, return this card from your graveyard to your hand.","power":"4","toughness":"2","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/3/9/39c6e952-97b5-435c-a7fd-6271ddc23200.jpg?1783932590","artUrl":"https://cards.scryfall.io/art_crop/front/3/9/39c6e952-97b5-435c-a7fd-6271ddc23200.jpg?1783932590","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const machinations = (): CardDef => ({"oracleId":"cab67380-4e1a-4210-a98b-d2a21022b4b7","name":"Dimir Machinations","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Look at the top three cards of target player's library. Exile any number of those cards, then put the rest back in any order.\nTransmute {1}{B}{B} ({1}{B}{B}, Discard this card: Search your library for a card with the same mana value as this card, reveal it, put it into your hand, then shuffle. Transmute only as a sorcery.)","colors":["B"],"colorIdentity":["B"],"keywords":["Transmute"],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14bfd72a-78c1-4167-89bf-ea1fccccd5b1.jpg?1783943671","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14bfd72a-78c1-4167-89bf-ea1fccccd5b1.jpg?1783943671","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const nim = (): CardDef => ({"oracleId":"89075fbe-cd8a-4054-abab-fcaa2aedddfb","name":"Nim Devourer","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"This creature gets +1/+0 for each artifact you control.\n{B}{B}: Return this card from your graveyard to the battlefield, then sacrifice a creature. Activate only during your upkeep.","power":"4","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/0/a037ef49-8849-41aa-aa6e-3ac6ee34cdad.jpg?1783944547","artUrl":"https://cards.scryfall.io/art_crop/front/a/0/a037ef49-8849-41aa-aa6e-3ac6ee34cdad.jpg?1783944547","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const membrane = (): CardDef => ({"oracleId":"0297eeb2-47ec-4f9a-b1ad-4e7286994f00","name":"Cathedral Membrane","manaCost":"{1}{W/P}","cmc":2,"typeLine":"Artifact Creature — Phyrexian Wall","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Phyrexian","Wall"],"oracleText":"({W/P} can be paid with either {W} or 2 life.)\nDefender\nWhen this creature dies during combat, it deals 6 damage to each creature it blocked this combat.","power":"0","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/0/7/07592731-68be-4218-bb2c-c2523c5a27f1.jpg?1783941327","artUrl":"https://cards.scryfall.io/art_crop/front/0/7/07592731-68be-4218-bb2c-c2523c5a27f1.jpg?1783941327","commanderLegal":"legal","set":"nph","releasedAt":"2011-05-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const vanguard = (): CardDef => ({"oracleId":"680766e2-637b-40bc-a15f-0b4dc55bd619","name":"Defiant Vanguard","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human Rebel","supertypes":[],"types":["Creature"],"subtypes":["Human","Rebel"],"oracleText":"When this creature blocks, at end of combat, destroy it and all creatures it blocked this turn.\n{5}, {T}: Search your library for a Rebel permanent card with mana value 4 or less, put it onto the battlefield, then shuffle.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/c/4c0bd267-59ec-41df-b0b7-37f6e6d6b073.jpg?1783945844","artUrl":"https://cards.scryfall.io/art_crop/front/4/c/4c0bd267-59ec-41df-b0b7-37f6e6d6b073.jpg?1783945844","commanderLegal":"legal","set":"nem","releasedAt":"2000-02-14","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const titan = (): CardDef => ({"oracleId":"94dd397e-0127-4c79-b9d9-22ce62ccdfe7","name":"Sludge Titan","manaCost":"{4}{B/G}{B/G}","cmc":6,"typeLine":"Creature — Zombie Giant","supertypes":[],"types":["Creature"],"subtypes":["Zombie","Giant"],"oracleText":"Trample\nWhenever this creature enters or attacks, mill five cards. You may put a creature card and/or a land card from among them into your hand.","power":"6","toughness":"6","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Trample","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f429617d-7134-4749-af8c-398eee68565d.jpg?1783912572","artUrl":"https://cards.scryfall.io/art_crop/front/f/4/f429617d-7134-4749-af8c-398eee68565d.jpg?1783912572","commanderLegal":"legal","set":"clu","releasedAt":"2024-02-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3", colors: ["R"] });
const twoDrop = card("Test Two", "Instant", "{1}{U}", { cmc: 2, oracleText: "Draw a card." });
const threeDrop = card("Test Three", "Instant", "{2}{U}", { cmc: 3, oracleText: "Draw a card." });
const fourDrop = card("Test Four", "Instant", "{3}{U}", { cmc: 4, oracleText: "Draw a card." });
const cycler = () => card("Test Cycler", "Creature — Beast", "{3}{G}", { power: "3", toughness: "3", keywords: ["Cycling"], oracleText: "Cycling {2}" });
const heal = card("Test Heal", "Instant", "{0}", { oracleText: "You gain 3 life." });
const pinger = card("Test Pinger", "Creature — Human Wizard", "{1}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });
const aura = card("Test Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
const wall = card("Test Wall", "Creature — Wall", "{1}", { power: "1", toughness: "4", keywords: ["Defender"], oracleText: "Defender" });
const land = card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });

describe("Lane B round B108", () => {
  it("all fourteen cards are supported", () =>
    supported(raid(), prohibit(), infiltrator(), flare(), reflection(), eviction(), suffer(), recall(), knight(), machinations(), nim(), membrane(), vanguard(), titan()));

  it("Skull Raid: target opponent discards two cards, and you draw one for each card fewer than two discarded", () => {
    for (const [inHand, drawn] of [[3, 0], [1, 1], [0, 2]] as const) {
      let { s, ap, opp, ids } = setup([raid()]);
      trimHand(s, opp);
      for (let i = 0; i < inHand; i++) into(s, opp, bear(), "hand");
      const hand = s.players[ap]!.hand.length - 1;
      s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
      expect(s.players[opp]!.hand.length, `${inHand} in hand`).toBe(Math.max(0, inHand - 2));
      expect(s.players[ap]!.hand.length, `${inHand} in hand`).toBe(hand + drawn);
    }
  });

  it("Prohibit: counters a spell with mana value 2 or less, 4 or less if kicked", () => {
    for (const [spell, kicked, countered] of [[twoDrop, false, true], [threeDrop, false, false], [fourDrop, false, false], [fourDrop, true, true]] as const) {
      let { s, ap, opp, ids } = setup([prohibit()]);
      const theirs = into(s, opp, spell, "hand");
      s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool, U: 1, C: 3 };
      s = act(s, { type: "passPriority", player: ap });
      s = run(s, planCast(s, opp, theirs));
      const item = s.stack.at(-1)!;
      for (let i = 0; i < 5 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      const hand = s.players[opp]!.hand.length;
      s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: item.id }], undefined, undefined, undefined, kicked ? { kicks: [0] } : {})));
      expect(zone(s, theirs), spell.name).toBe("graveyard");
      // Resolved, it would have drawn its caster a card.
      expect(s.players[opp]!.hand.length, spell.name).toBe(hand + (countered ? 0 : 1));
    }
  });

  it("Dimensional Infiltrator: target opponent exiles their top card; if it's a land card, you may return it to its owner's hand", () => {
    for (const [top, yes] of [[land, true], [land, false], [bear(), true]] as const) {
      let { s, ap, opp } = setup([]);
      const inf = putOnBattlefield(s, ap, infiltrator());
      const c = into(s, opp, top, "library");
      s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 2 };
      s = settle(run(s, planActivate(s, ap, inf, 0, [player(opp)])), { may: yes });
      expect(zone(s, c)).toBe("exile");
      expect(zone(s, inf), `${top.name} ${yes}`).toBe(top === land && yes ? "hand" : "battlefield");
    }
  });

  it("Dimensional Infiltrator: {C} must be paid with colorless mana", () => {
    let { s, ap, opp } = setup([]);
    const inf = putOnBattlefield(s, ap, infiltrator());
    into(s, opp, land, "library");
    // Only basic lands: none of them makes {C}.
    expect(planActivate(s, ap, inf, 0, [player(opp)])).toBeNull();
  });

  it("Zenith Flare: X is the number of cards with a cycling ability in your graveyard", () => {
    let { s, ap, opp, ids } = setup([flare()]);
    into(s, ap, cycler(), "graveyard");
    into(s, ap, cycler(), "graveyard");
    into(s, ap, bear(), "graveyard");
    const [mine, theirs] = [s.players[ap]!.life, s.players[opp]!.life];
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.players[opp]!.life).toBe(theirs - 2);
    expect(s.players[ap]!.life).toBe(mine + 2);
  });

  it("Dazzling Reflection: you gain life equal to its power, and only that creature's next damage is prevented", () => {
    let { s, ap, opp, ids } = setup([reflection()]);
    const p = putOnBattlefield(s, ap, pinger);
    const other = putOnBattlefield(s, ap, pinger);
    const mine = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(p)])));
    expect(s.players[ap]!.life).toBe(mine + 1);
    const theirs = s.players[opp]!.life;
    // Another creature's damage isn't prevented.
    s = settle(run(s, planActivate(s, ap, other, 0, [player(opp)])));
    expect(s.players[opp]!.life).toBe(theirs - 1);
    // Its next damage is; the one after that isn't.
    s = settle(run(s, planActivate(s, ap, p, 0, [player(opp)])));
    expect(s.players[opp]!.life).toBe(theirs - 1);
    s.objects[p]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, p, 0, [player(opp)])));
    expect(s.players[opp]!.life).toBe(theirs - 2);
  });

  it("Mark of Eviction: at your upkeep, the enchanted creature and every Aura on it return to their owners' hands", () => {
    let { s, ap, opp } = setup([]);
    s.players[ap]!.hand = [];
    const b = putOnBattlefield(s, opp, bear());
    const mark = putOnBattlefield(s, ap, eviction());
    const theirs = putOnBattlefield(s, opp, aura);
    const elsewhere = putOnBattlefield(s, opp, aura);
    const b2 = putOnBattlefield(s, opp, bear());
    s.objects[mark]!.attachedTo = b;
    s.objects[theirs]!.attachedTo = b;
    s.objects[elsewhere]!.attachedTo = b2;
    invalidateCharacteristics(s);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(zone(s, b)).toBe("hand");
    expect(zone(s, mark)).toBe("hand");
    expect(s.players[ap]!.hand).toContain(mark);
    expect(zone(s, theirs)).toBe("hand");
    expect(s.players[opp]!.hand).toContain(theirs);
    expect(zone(s, elsewhere)).toBe("battlefield");
  });

  it("Suffer the Past: X target cards from target player's graveyard are exiled; that player loses and you gain 1 life for each", () => {
    let { s, ap, opp, ids } = setup([suffer()]);
    const c1 = into(s, opp, bear(), "graveyard");
    const c2 = into(s, opp, bear(), "graveyard");
    const c3 = into(s, opp, bear(), "graveyard");
    const mine = into(s, ap, bear(), "graveyard");
    const [me, them] = [s.players[ap]!.life, s.players[opp]!.life];
    // The cards must be in the targeted player's graveyard.
    expect(planCast(s, ap, ids[0]!, [player(opp), tgt(c1), tgt(mine)], undefined, undefined, 2)).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp), tgt(c1), tgt(c2)], undefined, undefined, 2)));
    expect([zone(s, c1), zone(s, c2), zone(s, c3)]).toEqual(["exile", "exile", "graveyard"]);
    expect(s.players[opp]!.life).toBe(them - 2);
    expect(s.players[ap]!.life).toBe(me + 2);
  });

  it("Recall: discard X cards, then return that many cards from your graveyard to your hand; Recall is exiled", () => {
    let { s, ap, ids } = setup([recall(), bear(), bear(), bear()]);
    const old = into(s, ap, ogre, "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, undefined, 2)), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    s = act(s, { type: "discard", player: ap, objectIds: [ids[1]!, ids[2]!] });
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2 });
    s = act(s, { type: "searchLibrary", player: ap, found: [old, ids[1]!] });
    s = settle(s);
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([old, ids[1]!, ids[3]!]));
    expect(zone(s, ids[2]!)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("Deathless Knight: returns from your graveyard to your hand when you gain life for the first time each turn", () => {
    let { s, ap, ids } = setup([heal, heal]);
    const k = into(s, ap, knight(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, k)).toBe("hand");
    // Back in the graveyard, the second life gain this turn doesn't return it.
    s.players[ap]!.hand.splice(s.players[ap]!.hand.indexOf(k), 1);
    s.players[ap]!.graveyard.push(k);
    s.objects[k]!.zone = "graveyard";
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(zone(s, k)).toBe("graveyard");
  });

  it("Deathless Knight: an opponent's life gain doesn't return it", () => {
    let { s, ap, opp, ids } = setup([heal]);
    const k = into(s, opp, knight(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, k)).toBe("graveyard");
  });

  it("Dimir Machinations: exile any number of target player's top three cards, then put the rest back in any order", () => {
    let { s, ap, opp, ids } = setup([machinations()]);
    const [c, b, a] = [into(s, opp, bear(), "library"), into(s, opp, ogre, "library"), into(s, opp, land, "library")];
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 3 });
    s = act(s, { type: "searchLibrary", player: ap, found: [b] });
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [c, a], away: [] }));
    expect(zone(s, b)).toBe("exile");
    expect(s.players[opp]!.library.slice(0, 2)).toEqual([c, a]);
  });

  it("Nim Devourer: during your upkeep, it returns from your graveyard to the battlefield, then you sacrifice a creature", () => {
    let { s, ap } = setup([]);
    s.players[ap]!.hand = [];
    const n = into(s, ap, nim(), "graveyard");
    const b = putOnBattlefield(s, ap, bear());
    // Only during your upkeep, not in a main phase.
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 2 };
    expect(planActivate(s, ap, n, 0)).toBeNull();
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    s = settle(run(s, planActivate(s, ap, n, 0)), { me: [ap] });
    expect(zone(s, n)).toBe("battlefield");
    expect(s.pending).toMatchObject({ player: ap });
    s = settle(run(s, botActions(s, ap)));
    // The bot keeps the bigger creature.
    expect(zone(s, n)).toBe("battlefield");
    expect(zone(s, b)).toBe("graveyard");
  });

  it("Cathedral Membrane: when it dies during combat, it deals 6 damage to each creature it blocked this combat", () => {
    let { s, ap, opp } = setup([]);
    s.players[ap]!.hand = [];
    const big = putOnBattlefield(s, ap, card("Test Giant", "Creature — Giant", "{4}{R}", { power: "5", toughness: "6" }));
    const other = putOnBattlefield(s, ap, card("Test Giant", "Creature — Giant", "{4}{R}", { power: "5", toughness: "6" }));
    const m = putOnBattlefield(s, opp, membrane());
    s = combat(s, ap, [{ attacker: big, defender: opp }, { attacker: other, defender: opp }], opp, [{ blocker: m, attacker: big }]);
    for (let i = 0; i < 40 && zone(s, m) === "battlefield"; i++) s = s.pending ? settle(s) : act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(s);
    expect(zone(s, m)).toBe("graveyard");
    expect(zone(s, big)).toBe("graveyard");
    expect(zone(s, other)).toBe("battlefield");
  });

  it("Cathedral Membrane: dying outside combat deals no damage", () => {
    let { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, ap, membrane());
    const b = putOnBattlefield(s, opp, bear());
    s.objects[m]!.damage = 5;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, m)).toBe("graveyard");
    expect(s.objects[b]!.damage).toBe(0);
  });

  it("Defiant Vanguard: when it blocks, at end of combat it and the creature it blocked are destroyed", () => {
    let { s, ap, opp } = setup([]);
    s.players[ap]!.hand = [];
    const w = putOnBattlefield(s, ap, card("Test Walker", "Creature — Wall", "{2}", { power: "1", toughness: "5" }));
    const free = putOnBattlefield(s, ap, card("Test Walker", "Creature — Wall", "{2}", { power: "1", toughness: "5" }));
    const v = putOnBattlefield(s, opp, vanguard());
    s = combat(s, ap, [{ attacker: w, defender: opp }, { attacker: free, defender: opp }], opp, [{ blocker: v, attacker: w }]);
    s = passUntil(s, "main2", ap);
    s = settle(s);
    expect(zone(s, v)).toBe("graveyard");
    expect(zone(s, w)).toBe("graveyard");
    expect(zone(s, free)).toBe("battlefield");
  });

  it("Sludge Titan: mills five; you may put a creature card and a land card from among them into your hand", () => {
    let { s, ap, ids } = setup([titan()]);
    const milled = [into(s, ap, ogre, "library"), into(s, ap, land, "library"), into(s, ap, bear(), "library"), into(s, ap, land, "library"), into(s, ap, heal, "library")];
    s = settle(run(s, planCast(s, ap, ids[0]!)), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1 });
    expect((s.pending as { cards: string[] }).cards.sort()).toEqual([milled[0]!, milled[2]!].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [milled[0]!] }), { me: [ap] });
    expect((s.pending as { cards: string[] }).cards.sort()).toEqual([milled[1]!, milled[3]!].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [milled[3]!] }));
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([milled[0]!, milled[3]!]));
    expect([milled[1]!, milled[2]!, milled[4]!].map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard"]);
  });
});
