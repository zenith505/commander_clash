// Lane B, round 15: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty. "You may" questions get `yes`; a pending target choice gets `targets`; a pick
 * gets `pick` (or the first ones offered); a discard the first cards in hand. Stops at any other question.
 */
const settle = (s: GameState, opts: { yes?: boolean; targets?: TargetChoice[]; pick?: string[] } = {}) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = run(s, [...((opts.yes ?? true) && p.pay?.mana ? planMana(s, p.player, parseManaCost(p.pay.mana))! : []), { type: "chooseMay", player: p.player, yes: opts.yes ?? true }]);
    else if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets } as Action);
    else if (p?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: opts.pick ?? p.options.slice(0, p.count) });
    else if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A player gets priority: state-based actions and state triggers are checked (CR 117.5, 603.8), then all settles. */
const check = (s: GameState, opts: Parameters<typeof settle>[1] = {}) => settle(act(s, { type: "passPriority", player: waitingOn(s)! }), opts);
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const has = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const chars = (s: GameState, id: string) => characteristics(s, s.objects[id]!);
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const ctl = (s: GameState, id: string) => chars(s, id).controller;
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2);
const blackRat = () => creature("Black Rat", "Creature — Rat", "{B}", 1, 1);
const whiteKnight = () => creature("White Knight", "Creature — Human Knight", "{W}{W}", 2, 2);
const bigOgre = () => creature("Big Ogre", "Creature — Ogre", "{4}{R}", 6, 6);
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
/** Empties a player's hand into their library. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  const p = s.players[pid]!;
  for (const id of p.hand) s.objects[id]!.zone = "library";
  p.library.push(...p.hand);
  p.hand = [];
};
/** The next upkeep of `pid`, with its triggers resolved. */
const toUpkeep = (s: GameState, pid: PlayerId, opts: Parameters<typeof settle>[1] = {}) => settle(passUntil(s, "upkeep", pid), opts);
/** Attackers declared, the game paused on the defending players' blocks. */
const toBlocks = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], opts: Parameters<typeof settle>[1] = {}) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 40 && s.pending?.kind !== "declareBlockers"; i++) s = s.pending || s.stack.length ? settle(s, opts) : act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Blocks declared by `opp`; every other defending player declares none. Then the block triggers resolve. */
const block = (s: GameState, opp: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  s = act(s, { type: "declareBlockers", player: opp, blocks });
  for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return settle(s);
};

// Real oracle text (Scryfall).
const extortion = card("Extortion", "Sorcery", "{3}{B}{B}", {cmc: 5,oracleText: "Look at target player's hand and choose up to two cards from it. That player discards those cards."});
const mindWarp = card("Mind Warp", "Sorcery", "{X}{3}{B}", {cmc: 4,oracleText: "Look at target player's hand and choose X cards from it. That player discards those cards."});
const painfulMemories = card("Painful Memories", "Sorcery", "{1}{B}", {cmc: 2,oracleText: "Look at target opponent's hand and choose a card from it. Put that card on top of that player's library."});
const venarianGlimmer = card("Venarian Glimmer", "Instant", "{X}{U}", {cmc: 1,oracleText: "Target player reveals their hand. You choose a nonland card with mana value X or less from it. That player discards that card."});
const abandonHope = card("Abandon Hope", "Sorcery", "{X}{1}{B}", {cmc: 2,oracleText: "As an additional cost to cast this spell, discard X cards.\nLook at target opponent's hand and choose X cards from it. That player discards those cards."});
const discordantDirge = card("Discordant Dirge", "Enchantment", "{3}{B}{B}", {cmc: 5,oracleText: "At the beginning of your upkeep, you may put a verse counter on this enchantment.\n{B}, Sacrifice this enchantment: Look at target opponent's hand and choose up to X cards from it, where X is the number of verse counters on this enchantment. That player discards those cards."});
const keeperOfTheLight = card("Keeper of the Light", "Creature — Human Wizard", "{W}{W}", {cmc: 2,power: "1",toughness: "2",oracleText: "{W}, {T}: Choose target opponent who has more life than you do as you activate this ability. You gain 3 life."});
const keeperOfTheFlame = card("Keeper of the Flame", "Creature — Human Wizard", "{R}{R}", {cmc: 2,power: "1",toughness: "2",oracleText: "{R}, {T}: Choose target opponent who has more life than you do as you activate this ability. This creature deals 2 damage to that player."});
const keeperOfTheBeasts = card("Keeper of the Beasts", "Creature — Human Wizard", "{G}{G}", {cmc: 2,power: "1",toughness: "2",oracleText: "{G}, {T}: Choose target opponent who controls more creatures than you do as you activate this ability. Create a 2/2 green Beast creature token."});
const keeperOfTheMind = card("Keeper of the Mind", "Creature — Human Wizard", "{U}{U}", {cmc: 2,power: "1",toughness: "2",oracleText: "{U}, {T}: Choose target opponent who has at least two more cards in hand than you do as you activate this ability. Draw a card."});
const keeperOfTheDead = card("Keeper of the Dead", "Creature — Human Wizard", "{B}{B}", {cmc: 2,power: "1",toughness: "2",oracleText: "{B}, {T}: Choose target opponent who has at least two fewer creature cards in their graveyard than you do as you activate this ability. Destroy target nonblack creature that player controls."});
const theFallOfKroog = card("The Fall of Kroog", "Sorcery", "{4}{R}{R}", {cmc: 6,oracleText: "Choose target opponent. Destroy target land that player controls. The Fall of Kroog deals 3 damage to that player and 1 damage to each creature they control."});
const yosei = card("Yosei, the Morning Star", "Legendary Creature — Dragon Spirit", "{4}{W}{W}", {cmc: 6,power: "5",toughness: "5",keywords: ["Flying"],oracleText: "Flying\nWhen Yosei dies, target player skips their next untap step. Tap up to five target permanents that player controls."});
const mistfolk = card("Mistfolk", "Creature — Illusion", "{U}{U}", {cmc: 2,power: "1",toughness: "2",oracleText: "{U}: Counter target spell that targets this creature."});
const retromancer = card("Retromancer", "Creature — Lizard Shaman", "{2}{R}{R}", {cmc: 4,power: "3",toughness: "3",oracleText: "Whenever this creature becomes the target of a spell or ability, this creature deals 3 damage to that spell or ability's controller."});
const fugitiveDruid = card("Fugitive Druid", "Creature — Human Druid", "{3}{G}", {cmc: 4,power: "3",toughness: "2",oracleText: "Whenever this creature becomes the target of an Aura spell, you draw a card."});
const spectralPrison = card("Spectral Prison", "Enchantment — Aura", "{1}{U}", {cmc: 2,keywords: ["Enchant"],oracleText: "Enchant creature\nEnchanted creature doesn't untap during its controller's untap step.\nWhen enchanted creature becomes the target of a spell, sacrifice this Aura."});
const burningEyeZubera = card("Burning-Eye Zubera", "Creature — Zubera Spirit", "{2}{R}{R}", {cmc: 4,power: "3",toughness: "3",oracleText: "When this creature dies, if 4 or more damage was dealt to it this turn, this creature deals 3 damage to any target."});
const rushingTideZubera = card("Rushing-Tide Zubera", "Creature — Zubera Spirit", "{2}{U}{U}", {cmc: 4,power: "3",toughness: "3",oracleText: "When this creature dies, if 4 or more damage was dealt to it this turn, draw three cards."});
const elderLandWurm = card("Elder Land Wurm", "Creature — Dragon Wurm", "{4}{W}{W}{W}", {cmc: 7,power: "5",toughness: "5",keywords: ["Trample", "Defender"],oracleText: "Defender, trample\nWhen this creature blocks, it loses defender."});
const agelessSentinels = card("Ageless Sentinels", "Creature — Wall", "{3}{W}", {cmc: 4,power: "4",toughness: "4",keywords: ["Flying", "Defender"],oracleText: "Defender (This creature can't attack.)\nFlying\nWhen this creature blocks, it becomes a Bird Giant, and it loses defender. (It's no longer a Wall. This effect lasts indefinitely.)"});
const guardianOfTheAges = card("Guardian of the Ages", "Artifact Creature — Golem", "{7}", {cmc: 7,power: "7",toughness: "7",keywords: ["Defender"],oracleText: "Defender (This creature can't attack.)\nWhen a creature attacks you or a planeswalker you control, if this creature has defender, it loses defender and gains trample."});
const ronomHulk = card("Ronom Hulk", "Creature — Beast", "{4}{G}", {cmc: 5,power: "5",toughness: "6",keywords: ["Protection", "Cumulative upkeep"],oracleText: "Protection from snow\nCumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)"});
const kitsuneRiftwalker = card("Kitsune Riftwalker", "Creature — Fox Wizard", "{1}{W}{W}", {cmc: 3,power: "2",toughness: "1",keywords: ["Protection"],oracleText: "Protection from Spirits and from Arcane"});
const kaerveksHex = card("Kaervek's Hex", "Sorcery", "{3}{B}", {cmc: 4,oracleText: "Kaervek's Hex deals 1 damage to each nonblack creature and an additional 1 damage to each green creature."});
const razorPendulum = card("Razor Pendulum", "Artifact", "{4}", {cmc: 4,oracleText: "At the beginning of each player's end step, if that player has 5 or less life, this artifact deals 2 damage to that player."});
const coalbornEntity = card("Coalborn Entity", "Creature — Elemental", "{4}{R}", {cmc: 5,power: "4",toughness: "4",oracleText: "{2}{R}: This creature deals 1 damage to target creature token, player, or planeswalker."});
const sabertoothAlleyCat = card("Sabertooth Alley Cat", "Creature — Cat", "{1}{R}{R}", {cmc: 3,power: "2",toughness: "1",oracleText: "This creature attacks each combat if able.\n{1}{R}: Creatures without defender can't block this creature this turn."});
const spiritFlare = card("Spirit Flare", "Instant", "{3}{W}", {cmc: 4,keywords: ["Flashback"],oracleText: "Tap target untapped creature you control. If you do, it deals damage equal to its power to target attacking or blocking creature an opponent controls.\nFlashback—{1}{W}, Pay 3 life. (You may cast this card from your graveyard for its flashback cost. Then exile it.)"});
const sandstoneDeadfall = card("Sandstone Deadfall", "Artifact", "{3}", {cmc: 3,oracleText: "{T}, Sacrifice two lands and this artifact: Destroy target attacking creature."});
const zombieAssassin = card("Zombie Assassin", "Creature — Zombie Assassin", "{4}{B}", {cmc: 5,power: "3",toughness: "2",oracleText: "{T}, Exile two cards from your graveyard and this creature: Destroy target nonblack creature. It can't be regenerated."});
const coastalWizard = card("Coastal Wizard", "Creature — Human Wizard", "{2}{U}{U}", {cmc: 4,power: "1",toughness: "1",oracleText: "{T}: Return this creature and another target creature to their owners' hands. Activate only during your turn, before attackers are declared."});
const savaenElves = card("Savaen Elves", "Creature — Elf", "{G}", {cmc: 1,power: "1",toughness: "1",oracleText: "{G}{G}, {T}: Destroy target Aura attached to a land."});
const streetSweeper = card("Street Sweeper", "Artifact Creature — Construct", "{6}", {cmc: 6,power: "4",toughness: "6",oracleText: "Whenever this creature attacks, destroy all Auras attached to target land."});
const topple = card("Topple", "Sorcery", "{2}{W}", {cmc: 3,oracleText: "Exile target creature with the greatest power among creatures on the battlefield. (If two or more creatures are tied for greatest power, target any one of them.)"});
const orimsTouch = card("Orim's Touch", "Instant", "{W}", {cmc: 1,keywords: ["Kicker"],oracleText: "Kicker {1} (You may pay an additional {1} as you cast this spell.)\nPrevent the next 2 damage that would be dealt to any target this turn. If this spell was kicked, prevent the next 4 damage that would be dealt to that permanent or player this turn instead."});
const elvishHealer = card("Elvish Healer", "Creature — Elf Cleric", "{2}{W}", {cmc: 3,power: "1",toughness: "2",oracleText: "{T}: Prevent the next 1 damage that would be dealt to any target this turn. If it's a green creature, prevent the next 2 damage instead."});
const ladySun = card("Lady Sun", "Legendary Creature — Human Advisor", "{1}{U}{U}", {cmc: 3,power: "1",toughness: "1",oracleText: "{T}: Return Lady Sun and another target creature to their owners' hands. Activate only during your turn, before attackers are declared."});
const lavaRunner = card("Lava Runner", "Creature — Lizard", "{1}{R}{R}", {cmc: 3,power: "2",toughness: "2",keywords: ["Haste"],oracleText: "Haste\nWhenever this creature becomes the target of a spell or ability, that spell or ability's controller sacrifices a land of their choice."});
const pearlShard = card("Pearl Shard", "Artifact", "{3}", {cmc: 3,oracleText: "{3}, {T} or {W}, {T}: Prevent the next 2 damage that would be dealt to any target this turn."});
const graniteShard = card("Granite Shard", "Artifact", "{3}", {cmc: 3,oracleText: "{3}, {T} or {R}, {T}: This artifact deals 1 damage to any target."});
const heartwoodShard = card("Heartwood Shard", "Artifact", "{3}", {cmc: 3,oracleText: "{3}, {T} or {G}, {T}: Target creature gains trample until end of turn."});
const skeletonShard = card("Skeleton Shard", "Artifact", "{3}", {cmc: 3,oracleText: "{3}, {T} or {B}, {T}: Return target artifact creature card from your graveyard to your hand."});

/** Everyone passes (answering as `settle` does) until the game reaches `step` of `pid`'s turn. */
const passTo = (s: GameState, step: GameState["step"], pid: PlayerId, opts: Parameters<typeof settle>[1] = {}) => {
  for (let i = 0; i < 600 && !(s.step === step && s.activePlayer === pid && !s.stack.length && (!s.pending || (step === "declareAttackers" && s.pending.kind === "declareAttackers"))); i++) {
    const p = s.pending;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p || s.stack.length || s.triggerQueue.length) {
      const before = JSON.stringify([p, s.stack.length]);
      s = settle(s, opts);
      if (s.pending && JSON.stringify([s.pending, s.stack.length]) === before) throw new Error(`stuck on ${s.pending.kind}`);
    } else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

const wall = (mv: number) => creature("Test Wall", "Creature — Wall", `{${mv}}`, 0, 4, { cmc: mv, keywords: ["Defender"], oracleText: "Defender" });
const flier = () => creature("Test Bird", "Creature — Bird", "{1}{U}", 1, 1, { keywords: ["Flying"], oracleText: "Flying" });
const bolt = (n: number) => card(`Test Bolt ${n}`, "Instant", "{R}", { cmc: 1, oracleText: `This spell deals ${n} damage to any target.` });
const murder = () => card("Test Murder", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const giantGrowth = () => card("Test Growth", "Instant", "{G}", { cmc: 1, oracleText: "Target creature gets +3/+3 until end of turn." });
const testAura = () => card("Test Aura", "Enchantment — Aura", "{W}", { cmc: 1, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
const filler = (name: string, manaCost: string, cmc: number) => card(name, "Sorcery", manaCost, { cmc, oracleText: "Draw a card." });
/** Gives `pid` a hand of exactly these cards. */
const handOf = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  emptyHand(s, pid);
  return defs.map((d) => into(s, pid, d));
};
const names = (s: GameState, ids: string[]) => ids.map((id) => s.cards[s.objects[id]!.cardId]!.name);

describe("looking at a hand and choosing cards: Extortion, Mind Warp, Abandon Hope, Painful Memories, Venarian Glimmer, Discordant Dirge", () => {
  it("compiles them", () => supported(extortion, mindWarp, abandonHope, painfulMemories, venarianGlimmer, discordantDirge));

  it("Extortion: you choose up to two cards and that player discards them", () => {
    let { s, ap, opp, ids } = setup([extortion]);
    const hand = handOf(s, opp, [greenBear(), blackRat(), bigOgre()]);
    s = run(s, planCast(s, ap, ids[0]!, [player(opp)]));
    s = settle(s);
    const p = s.pending;
    expect(p?.kind === "searchLibrary" && p.player === ap && p.min === 0 && p.max === 2 && p.cards.length === 3).toBe(true);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [hand[0]!, hand[2]!] }));
    expect(names(s, s.players[opp]!.hand)).toEqual(["Black Rat"]);
    expect(zone(s, hand[0]!)).toBe("graveyard");
    expect(zone(s, hand[2]!)).toBe("graveyard");
  });

  it("Mind Warp: X cards, exactly; fewer if the hand has fewer (CR 609.3)", () => {
    let { s, ap, opp, ids } = setup([mindWarp]);
    const hand = handOf(s, opp, [greenBear(), blackRat(), bigOgre()]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, "auto", 2)));
    const p = s.pending;
    expect(p?.kind === "searchLibrary" && p.min === 2 && p.max === 2).toBe(true);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [hand[1]!, hand[2]!] }));
    expect(names(s, s.players[opp]!.hand)).toEqual(["Green Bear"]);

    let g = setup([mindWarp]);
    handOf(g.s, g.opp, [greenBear()]);
    g.s = settle(run(g.s, planCast(g.s, g.ap, g.ids[0]!, [player(g.opp)], undefined, "auto", 3)));
    const q = g.s.pending;
    expect(q?.kind === "searchLibrary" && q.min === 1 && q.max === 1).toBe(true);
  });

  it("Abandon Hope: discard X cards to cast it, then choose X cards from that player's hand", () => {
    let { s, ap, opp, ids } = setup([abandonHope, greenBear(), blackRat()]);
    const hand = handOf(s, opp, [greenBear(), blackRat(), bigOgre()]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, "auto", 2, { discard: [ids[1]!, ids[2]!] })));
    expect([zone(s, ids[1]!), zone(s, ids[2]!)]).toEqual(["graveyard", "graveyard"]);
    const p = s.pending;
    expect(p?.kind === "searchLibrary" && p.min === 2 && p.max === 2).toBe(true);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [hand[0]!, hand[2]!] }));
    expect(names(s, s.players[opp]!.hand)).toEqual(["Black Rat"]);
  });

  it("Painful Memories: the chosen card goes on top of that player's library", () => {
    let { s, ap, opp, ids } = setup([painfulMemories]);
    const hand = handOf(s, opp, [greenBear(), bigOgre()]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    const p = s.pending;
    expect(p?.kind === "searchLibrary" && p.min === 1 && p.max === 1).toBe(true);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [hand[1]!] }));
    expect(s.players[opp]!.library[0]).toBe(hand[1]);
    expect(zone(s, hand[1]!)).toBe("library");
    expect(names(s, s.players[opp]!.hand)).toEqual(["Green Bear"]);
  });

  it("Venarian Glimmer: only nonland cards with mana value X or less can be chosen", () => {
    let { s, ap, opp, ids } = setup([venarianGlimmer]);
    const hand = handOf(s, opp, [filler("Cheap", "{1}", 1), filler("Two", "{1}{B}", 2), filler("Pricey", "{4}", 4), card("Forest", "Basic Land — Forest")]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, "auto", 2)));
    const p = s.pending;
    expect(p?.kind === "searchLibrary" && [...p.cards].sort()).toEqual([hand[0], hand[1]].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [hand[1]!] }));
    expect(zone(s, hand[1]!)).toBe("graveyard");
  });

  it("Discordant Dirge: up to as many cards as it had verse counters as it was sacrificed", () => {
    let { s, ap, opp } = setup([]);
    const dirge = putOnBattlefield(s, ap, discordantDirge);
    s.objects[dirge]!.counters = { verse: 2 };
    handOf(s, opp, [greenBear(), blackRat(), bigOgre()]);
    s = settle(run(s, planActivate(s, ap, dirge, 0, [player(opp)])));
    expect(zone(s, dirge)).toBe("graveyard");
    const p = s.pending;
    expect(p?.kind === "searchLibrary" && p.min === 0 && p.max === 2).toBe(true);
  });

  it("Discordant Dirge: puts a verse counter on itself at your upkeep if you want", () => {
    let { s, ap } = setup([]);
    const dirge = putOnBattlefield(s, ap, discordantDirge);
    s = toUpkeep(s, ap);
    expect(s.objects[dirge]!.counters.verse).toBe(1);
  });
});

describe("the Keepers: an opponent compared with you as you activate", () => {
  it("compiles them", () => supported(keeperOfTheLight, keeperOfTheFlame, keeperOfTheBeasts, keeperOfTheMind, keeperOfTheDead));

  it("Keeper of the Light: only an opponent with more life can be chosen; the check is only as you activate", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, keeperOfTheLight);
    s.players[opp]!.life = 40;
    s.players[ap]!.life = 40;
    expect(planActivate(s, ap, k, 0, [player(opp)])).toBeNull();
    s.players[opp]!.life = 41;
    s = run(s, planActivate(s, ap, k, 0, [player(opp)]));
    // With the ability on the stack, the opponent's life drops below yours: it still resolves (rulings).
    s.players[opp]!.life = 10;
    s = settle(s);
    expect(life(s, ap)).toBe(43);
  });

  it("Keeper of the Flame deals 2 damage to that player", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, keeperOfTheFlame);
    s.players[opp]!.life = 45;
    s = settle(run(s, planActivate(s, ap, k, 0, [player(opp)])));
    expect(life(s, opp)).toBe(43);
  });

  it("Keeper of the Beasts: an opponent who controls more creatures", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, keeperOfTheBeasts);
    putOnBattlefield(s, opp, greenBear());
    expect(planActivate(s, ap, k, 0, [player(opp)])).toBeNull();
    putOnBattlefield(s, opp, greenBear());
    const before = s.battlefield.length;
    s = settle(run(s, planActivate(s, ap, k, 0, [player(opp)])));
    expect(s.battlefield.length).toBe(before + 1);
  });

  it("Keeper of the Mind: an opponent with at least two more cards in hand", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, keeperOfTheMind);
    handOf(s, ap, [greenBear()]);
    handOf(s, opp, [greenBear(), greenBear()]);
    expect(planActivate(s, ap, k, 0, [player(opp)])).toBeNull();
    into(s, opp, greenBear());
    s = settle(run(s, planActivate(s, ap, k, 0, [player(opp)])));
    expect(s.players[ap]!.hand.length).toBe(2);
  });

  it("Keeper of the Dead: two fewer creature cards in their graveyard; the creature must be that player's", () => {
    let { s, ap, opp } = setup([]);
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    const k = putOnBattlefield(s, ap, keeperOfTheDead);
    into(s, ap, greenBear(), "graveyard");
    const bear = putOnBattlefield(s, opp, greenBear());
    const other = putOnBattlefield(s, third, greenBear());
    const rat = putOnBattlefield(s, opp, blackRat());
    expect(planActivate(s, ap, k, 0, [player(opp), tgt(bear)])).toBeNull();
    into(s, ap, greenBear(), "graveyard");
    expect(planActivate(s, ap, k, 0, [player(opp), tgt(other)])).toBeNull();
    expect(planActivate(s, ap, k, 0, [player(opp), tgt(rat)])).toBeNull();
    s = settle(run(s, planActivate(s, ap, k, 0, [player(opp), tgt(bear)])));
    expect(zone(s, bear)).toBe("graveyard");
  });

  it("Keeper of the Dead: if the creature changes control before it resolves, it isn't destroyed", () => {
    let { s, ap, opp } = setup([]);
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    const k = putOnBattlefield(s, ap, keeperOfTheDead);
    into(s, ap, greenBear(), "graveyard");
    into(s, ap, greenBear(), "graveyard");
    const bear = putOnBattlefield(s, opp, greenBear());
    s = run(s, planActivate(s, ap, k, 0, [player(opp), tgt(bear)]));
    s.objects[bear]!.controller = third;
    invalidateCharacteristics(s);
    s = settle(s);
    expect(zone(s, bear)).toBe("battlefield");
  });
});

describe("a chosen player's permanents: The Fall of Kroog, Yosei", () => {
  it("compiles them", () => supported(theFallOfKroog, yosei));

  it("The Fall of Kroog: the land and the creatures are that player's only", () => {
    let { s, ap, opp, ids } = setup([theFallOfKroog]);
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    const land = putOnBattlefield(s, opp, forest);
    const otherLand = putOnBattlefield(s, third, forest);
    const bear = putOnBattlefield(s, opp, blackRat());
    const mine = putOnBattlefield(s, ap, blackRat());
    const theirs = putOnBattlefield(s, third, blackRat());
    expect(planCast(s, ap, ids[0]!, [player(opp), tgt(otherLand)])).toBeNull();
    const before = life(s, opp);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp), tgt(land)])));
    expect(zone(s, land)).toBe("graveyard");
    expect(life(s, opp)).toBe(before - 3);
    expect(zone(s, bear)).toBe("graveyard");
    expect(zone(s, mine)).toBe("battlefield");
    expect(zone(s, theirs)).toBe("battlefield");
  });

  it("Yosei: when it dies, that player skips their next untap step and up to five of their permanents are tapped", () => {
    let { s, ap, opp, ids } = setup([murder()]);
    const y = putOnBattlefield(s, ap, yosei);
    const a = putOnBattlefield(s, opp, greenBear());
    const b = putOnBattlefield(s, opp, forest);
    const mine = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(y)])));
    const none: TargetChoice = { kind: "none" };
    expect(s.pending?.kind).toBe("chooseTargets");
    // The permanents must be that player's.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [player(opp), tgt(a), tgt(mine), none, none, none] } as Action)).toThrow();
    s = settle(s, { targets: [player(opp), tgt(a), tgt(b), none, none, none] });
    expect(zone(s, y)).toBe("graveyard");
    expect(s.objects[a]!.tapped && s.objects[b]!.tapped).toBe(true);
    s = passTo(s, "main1", opp);
    expect(s.objects[a]!.tapped && s.objects[b]!.tapped).toBe(true);
  });
});

describe("becoming the target: Mistfolk, Retromancer, Fugitive Druid, Spectral Prison", () => {
  it("compiles them", () => supported(mistfolk, retromancer, fugitiveDruid, spectralPrison, lavaRunner));

  it("Lava Runner: the controller of the spell that targets it sacrifices a land", () => {
    let { s, ap, ids } = setup([giantGrowth()]);
    const r = putOnBattlefield(s, ap, lavaRunner);
    const lands = s.battlefield.filter((id) => chars(s, id).types.includes("Land")).length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(r)])));
    expect(s.battlefield.filter((id) => chars(s, id).types.includes("Land")).length).toBe(lands - 1);
  });

  it("Mistfolk: counters a spell that targets it, and no other spell", () => {
    let { s, ap, ids } = setup([bolt(2), bolt(2)]);
    const m = putOnBattlefield(s, ap, mistfolk);
    const bear = putOnBattlefield(s, ap, greenBear());
    s = run(s, planCast(s, ap, ids[1]!, [tgt(bear)]));
    expect(planActivate(s, ap, m, 0, [{ kind: "stack", id: s.stack[0]!.id }])).toBeNull();
    s = settle(s);
    s = run(s, planCast(s, ap, ids[0]!, [tgt(m)]));
    s = settle(run(s, planActivate(s, ap, m, 0, [{ kind: "stack", id: s.stack[0]!.id }])));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, m)).toBe("battlefield");
    expect(s.objects[m]!.damage).toBe(0);
  });

  it("Retromancer: deals 3 damage to the controller of the spell that targets it", () => {
    let { s, ap, ids } = setup([giantGrowth()]);
    const r = putOnBattlefield(s, ap, retromancer);
    const before = life(s, ap);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(r)])));
    expect(life(s, ap)).toBe(before - 3);
    expect(pt(s, r)).toBe("6/6");
  });

  it("Fugitive Druid: an Aura spell draws a card; another spell doesn't", () => {
    let { s, ap, ids } = setup([testAura(), giantGrowth()]);
    const d = putOnBattlefield(s, ap, fugitiveDruid);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(d)])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(d)])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(d);
  });

  it("Spectral Prison: sacrificed when the creature becomes the target of a spell, not of an ability", () => {
    let { s, ap, opp, ids } = setup([giantGrowth()]);
    const bear = putOnBattlefield(s, opp, greenBear());
    const prison = attach(s, ap, spectralPrison, bear);
    const shard = putOnBattlefield(s, ap, heartwoodShard);
    s = settle(run(s, planActivate(s, ap, shard, 1, [tgt(bear)])));
    expect(zone(s, prison)).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear)])));
    expect(zone(s, prison)).toBe("graveyard");
  });

  it("Spectral Prison: the creature doesn't untap", () => {
    let { s, ap, opp } = setup([]);
    const bear = putOnBattlefield(s, opp, greenBear());
    attach(s, ap, spectralPrison, bear);
    s.objects[bear]!.tapped = true;
    s = passTo(s, "main1", opp);
    expect(s.objects[bear]!.tapped).toBe(true);
  });
});

describe("dies if it was dealt 4 or more damage this turn: the Zuberas", () => {
  it("compiles them", () => supported(burningEyeZubera, rushingTideZubera));

  it("Rushing-Tide Zubera: dealt 4 damage and dies, draws three", () => {
    let { s, ap, ids } = setup([bolt(4)]);
    const z = putOnBattlefield(s, ap, rushingTideZubera);
    const hand = s.players[ap]!.hand.length;
    s = check(run(s, planCast(s, ap, ids[0]!, [tgt(z)])));
    expect(zone(s, z)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });

  it("Rushing-Tide Zubera: dealt 3 damage and destroyed, draws nothing", () => {
    let { s, ap, ids } = setup([bolt(3), murder()]);
    const z = putOnBattlefield(s, ap, rushingTideZubera);
    s.objects[z]!.counters = { "+1/+1": 1 };
    invalidateCharacteristics(s);
    s = check(run(s, planCast(s, ap, ids[0]!, [tgt(z)])));
    expect(zone(s, z)).toBe("battlefield");
    const hand = s.players[ap]!.hand.length;
    s = check(run(s, planCast(s, ap, ids[1]!, [tgt(z)])));
    expect(zone(s, z)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("Burning-Eye Zubera: dealt 2 and then 2 more, it deals 3 damage to any target", () => {
    let { s, ap, opp, ids } = setup([bolt(2), bolt(2)]);
    const z = putOnBattlefield(s, ap, burningEyeZubera);
    s.objects[z]!.counters = { "+1/+1": 1 };
    invalidateCharacteristics(s);
    s = check(run(s, planCast(s, ap, ids[0]!, [tgt(z)])));
    const before = life(s, opp);
    s = check(run(s, planCast(s, ap, ids[1]!, [tgt(z)])), { targets: [player(opp)] });
    expect(zone(s, z)).toBe("graveyard");
    expect(life(s, opp)).toBe(before - 3);
  });
});

describe("losing defender: Elder Land Wurm, Ageless Sentinels, Guardian of the Ages", () => {
  it("compiles them", () => supported(elderLandWurm, agelessSentinels, guardianOfTheAges));

  it("Elder Land Wurm: when it blocks, it loses defender for good", () => {
    let { s, ap, opp } = setup([]);
    const bear = putOnBattlefield(s, ap, greenBear());
    const w = putOnBattlefield(s, opp, elderLandWurm);
    expect(has(s, w, "Defender")).toBe(true);
    s = block(toBlocks(s, ap, [{ attacker: bear, defender: opp }]), opp, [{ blocker: w, attacker: bear }]);
    expect(has(s, w, "Defender")).toBe(false);
    s = passTo(s, "main1", opp);
    expect(has(s, w, "Defender")).toBe(false);
    expect(has(s, w, "Trample")).toBe(true);
  });

  it("Ageless Sentinels: when it blocks, it becomes a Bird Giant (no longer a Wall) and loses defender", () => {
    let { s, ap, opp } = setup([]);
    const bear = flier();
    const b = putOnBattlefield(s, ap, bear);
    const a = putOnBattlefield(s, opp, agelessSentinels);
    s = block(toBlocks(s, ap, [{ attacker: b, defender: opp }]), opp, [{ blocker: a, attacker: b }]);
    s = passTo(s, "main1", opp);
    expect(chars(s, a).subtypes).toEqual(["Bird", "Giant"]);
    expect(has(s, a, "Defender")).toBe(false);
    expect(has(s, a, "Flying")).toBe(true);
  });

  it("Guardian of the Ages: a creature attacking you makes it lose defender and gain trample", () => {
    let { s, ap, opp } = setup([]);
    const bear = putOnBattlefield(s, ap, greenBear());
    const g = putOnBattlefield(s, opp, guardianOfTheAges);
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    const g2 = putOnBattlefield(s, third, guardianOfTheAges);
    s = toBlocks(s, ap, [{ attacker: bear, defender: opp }]);
    expect(has(s, g, "Defender")).toBe(false);
    expect(has(s, g, "Trample")).toBe(true);
    // Attacking another player doesn't change the third player's Guardian.
    expect(has(s, g2, "Defender")).toBe(true);
    expect(has(s, g2, "Trample")).toBe(false);
  });
});

describe("protection from snow, from Spirits and from Arcane: Ronom Hulk, Kitsune Riftwalker", () => {
  it("compiles them", () => supported(ronomHulk, kitsuneRiftwalker));

  it("Ronom Hulk: a snow spell can't target it and a snow creature can't block it", () => {
    let { s, ap, opp, ids } = setup([card("Snow Bolt", "Snow Instant", "{R}", { cmc: 1, oracleText: "This spell deals 2 damage to any target." }), bolt(2)]);
    const h = putOnBattlefield(s, ap, ronomHulk);
    expect(planCast(s, ap, ids[0]!, [tgt(h)])).toBeNull();
    expect(planCast(s, ap, ids[1]!, [tgt(h)])).not.toBeNull();
    const yeti = putOnBattlefield(s, opp, creature("Snow Yeti", "Snow Creature — Yeti", "{2}{G}", 2, 2));
    const bear = putOnBattlefield(s, opp, greenBear());
    s = toBlocks(s, ap, [{ attacker: h, defender: opp }]);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: yeti, attacker: h }] })).toThrow();
    s = block(s, opp, [{ blocker: bear, attacker: h }]);
  });

  it("Kitsune Riftwalker: an Arcane spell can't target it and a Spirit can't block it", () => {
    let { s, ap, opp, ids } = setup([card("Arcane Bolt", "Instant — Arcane", "{R}", { cmc: 1, oracleText: "This spell deals 2 damage to any target." }), bolt(2)]);
    const k = putOnBattlefield(s, ap, kitsuneRiftwalker);
    expect(planCast(s, ap, ids[0]!, [tgt(k)])).toBeNull();
    expect(planCast(s, ap, ids[1]!, [tgt(k)])).not.toBeNull();
    const spirit = putOnBattlefield(s, opp, creature("Test Spirit", "Creature — Spirit", "{1}{W}", 1, 1));
    s = toBlocks(s, ap, [{ attacker: k, defender: opp }]);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: spirit, attacker: k }] })).toThrow();
  });
});

describe("damage: Kaervek's Hex, Razor Pendulum, Coalborn Entity", () => {
  it("compiles them", () => supported(kaerveksHex, razorPendulum, coalbornEntity));

  it("Kaervek's Hex: 1 to each nonblack creature, 2 in all to a green one, 1 to a black-green one", () => {
    let { s, ap, opp, ids } = setup([kaerveksHex]);
    const goblin = putOnBattlefield(s, opp, creature("Red Ogre", "Creature — Ogre", "{2}{R}", 3, 3));
    const bear = putOnBattlefield(s, opp, creature("Green Troll", "Creature — Troll", "{2}{G}", 3, 3));
    const bg = putOnBattlefield(s, opp, creature("Golgari Thug", "Creature — Zombie", "{B}{G}", 3, 3));
    const rat = putOnBattlefield(s, ap, creature("Black Ogre", "Creature — Ogre", "{2}{B}", 3, 3));
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[goblin]!.damage).toBe(1);
    expect(s.objects[bear]!.damage).toBe(2);
    expect(s.objects[bg]!.damage).toBe(1);
    expect(s.objects[rat]!.damage).toBe(0);
  });

  it("Kaervek's Hex: a green creature is dealt its 2 damage at once, and a 2 damage shield stops all of it", () => {
    let { s, ap, opp, ids } = setup([kaerveksHex]);
    const troll = putOnBattlefield(s, opp, creature("Green Troll", "Creature — Troll", "{2}{G}", 3, 3));
    const healer = putOnBattlefield(s, ap, elvishHealer);
    s = settle(run(s, planActivate(s, ap, healer, 0, [tgt(troll)])));
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    // Elvish Healer prevents the next 2 damage to a green creature: all of the Hex's damage to it.
    expect(s.objects[troll]!.damage).toBe(0);
  });

  it("Razor Pendulum: at each player's end step, 2 damage to that player if they have 5 or less life", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, razorPendulum);
    s.players[ap]!.life = 5;
    s = settle(passUntil(s, "end", ap));
    expect(life(s, ap)).toBe(3);
    s.players[opp]!.life = 6;
    s = passTo(s, "cleanup", opp);
    expect(life(s, opp)).toBe(6);
  });

  it("Coalborn Entity: a creature token, a player or a planeswalker; not a nontoken creature", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, coalbornEntity);
    const bear = putOnBattlefield(s, opp, greenBear());
    const token = putOnBattlefield(s, opp, greenBear());
    s.objects[token]!.isToken = true;
    expect(planActivate(s, ap, c, 0, [tgt(bear)])).toBeNull();
    s = settle(run(s, planActivate(s, ap, c, 0, [tgt(token)])));
    expect(s.objects[token]!.damage).toBe(1);
    const before = life(s, opp);
    s = settle(run(s, planActivate(s, ap, c, 0, [player(opp)])));
    expect(life(s, opp)).toBe(before - 1);
  });
});

describe("combat: Sabertooth Alley Cat, Spirit Flare, Sandstone Deadfall, Street Sweeper", () => {
  it("compiles them", () => supported(sabertoothAlleyCat, spiritFlare, sandstoneDeadfall, streetSweeper, savaenElves));

  it("Sabertooth Alley Cat: creatures without defender can't block it; a Wall can", () => {
    let { s, ap, opp } = setup([]);
    const cat = putOnBattlefield(s, ap, sabertoothAlleyCat);
    const bear = putOnBattlefield(s, opp, greenBear());
    const w = putOnBattlefield(s, opp, wall(2));
    s = settle(run(s, planActivate(s, ap, cat, 0)));
    s = toBlocks(s, ap, [{ attacker: cat, defender: opp }]);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: bear, attacker: cat }] })).toThrow();
    s = block(s, opp, [{ blocker: w, attacker: cat }]);
    expect(s.objects[w]!.damage).toBe(0);
  });

  it("Spirit Flare: your untapped creature is tapped and deals damage equal to its power to a blocking creature", () => {
    let { s, ap, opp, ids } = setup([spiritFlare]);
    const bear = putOnBattlefield(s, ap, greenBear());
    const ogre = putOnBattlefield(s, ap, bigOgre());
    const blocker = putOnBattlefield(s, opp, creature("Tall Wall", "Creature — Wall", "{3}", 0, 7, { keywords: ["Defender"], oracleText: "Defender" }));
    s = block(toBlocks(s, ap, [{ attacker: bear, defender: opp }]), opp, [{ blocker, attacker: bear }]);
    expect(planCast(s, ap, ids[0]!, [tgt(bear), tgt(blocker)])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre), tgt(blocker)])));
    expect(s.objects[ogre]!.tapped).toBe(true);
    expect(s.objects[blocker]!.damage).toBe(6);
  });

  it("Spirit Flare: no damage if your creature was tapped before it resolves (rulings)", () => {
    let { s, ap, opp, ids } = setup([spiritFlare]);
    const bear = putOnBattlefield(s, ap, greenBear());
    const ogre = putOnBattlefield(s, ap, bigOgre());
    const blocker = putOnBattlefield(s, opp, creature("Tall Wall", "Creature — Wall", "{3}", 0, 7, { keywords: ["Defender"], oracleText: "Defender" }));
    s = block(toBlocks(s, ap, [{ attacker: bear, defender: opp }]), opp, [{ blocker, attacker: bear }]);
    s = run(s, planCast(s, ap, ids[0]!, [tgt(ogre), tgt(blocker)]));
    s.objects[ogre]!.tapped = true;
    s = settle(s);
    expect(s.objects[blocker]!.damage).toBe(0);
  });

  it("Sandstone Deadfall: tap it and sacrifice two lands and itself to destroy an attacking creature", () => {
    let { s, ap, opp } = setup([]);
    const bear = putOnBattlefield(s, ap, greenBear());
    const d = putOnBattlefield(s, opp, sandstoneDeadfall);
    const lands = [putOnBattlefield(s, opp, forest), putOnBattlefield(s, opp, forest)];
    expect(planActivate(s, opp, d, 0, [tgt(bear)], undefined, undefined, undefined, { sacrifice: lands })).toBeNull();
    s = toBlocks(s, ap, [{ attacker: bear, defender: opp }]);
    s = block(s, opp, []);
    // In the declare blockers step: the active player passes, then the defender activates.
    s = act(s, { type: "passPriority", player: ap });
    s = settle(run(s, planActivate(s, waitingOn(s)!, d, 0, [tgt(bear)], undefined, undefined, undefined, { sacrifice: lands })));
    expect(zone(s, bear)).toBe("graveyard");
    expect(zone(s, d)).toBe("graveyard");
    expect(lands.map((l) => zone(s, l))).toEqual(["graveyard", "graveyard"]);
  });

  it("Street Sweeper: destroys all Auras attached to the target land, and no others", () => {
    let { s, ap, opp } = setup([]);
    const sw = putOnBattlefield(s, ap, streetSweeper);
    const land = putOnBattlefield(s, opp, forest);
    const landAura = card("Test Land Aura", "Enchantment — Aura", "{G}", { cmc: 1, keywords: ["Enchant"], oracleText: "Enchant land\nEnchanted land has \"{T}: Add {G}{G}.\"" });
    const a1 = attach(s, opp, landAura, land);
    const a2 = attach(s, ap, landAura, land);
    const bear = putOnBattlefield(s, opp, greenBear());
    const a3 = attach(s, opp, testAura(), bear);
    s = toBlocks(s, ap, [{ attacker: sw, defender: opp }], { targets: [tgt(land)] });
    expect([zone(s, a1), zone(s, a2), zone(s, a3)]).toEqual(["graveyard", "graveyard", "battlefield"]);
    expect(zone(s, land)).toBe("battlefield");
  });

  it("Savaen Elves: destroys an Aura attached to a land, not one on a creature", () => {
    let { s, ap, opp } = setup([]);
    const e = putOnBattlefield(s, ap, savaenElves);
    const land = putOnBattlefield(s, opp, forest);
    const landAura = card("Test Land Aura", "Enchantment — Aura", "{G}", { cmc: 1, keywords: ["Enchant"], oracleText: "Enchant land\nEnchanted land has \"{T}: Add {G}{G}.\"" });
    const a1 = attach(s, opp, landAura, land);
    const bear = putOnBattlefield(s, opp, greenBear());
    const a2 = attach(s, opp, testAura(), bear);
    expect(planActivate(s, ap, e, 0, [tgt(a2)])).toBeNull();
    s = settle(run(s, planActivate(s, ap, e, 0, [tgt(a1)])));
    expect(zone(s, a1)).toBe("graveyard");
  });
});

describe("costs and returns: Zombie Assassin, Coastal Wizard", () => {
  it("compiles them", () => supported(zombieAssassin, coastalWizard, ladySun));

  it("Lady Sun: returns herself and another creature", () => {
    let { s, ap, opp } = setup([]);
    const l = putOnBattlefield(s, ap, ladySun);
    const bear = putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planActivate(s, ap, l, 0, [tgt(bear)])));
    expect([zone(s, l), zone(s, bear)]).toEqual(["hand", "hand"]);
  });

  it("Zombie Assassin: exile two cards from your graveyard and it to destroy a nonblack creature", () => {
    let { s, ap, opp } = setup([]);
    const z = putOnBattlefield(s, ap, zombieAssassin);
    const yard = [into(s, ap, greenBear(), "graveyard"), into(s, ap, greenBear(), "graveyard")];
    const bear = putOnBattlefield(s, opp, greenBear());
    const rat = putOnBattlefield(s, opp, blackRat());
    expect(planActivate(s, ap, z, 0, [tgt(rat)], undefined, undefined, undefined, { exileCards: yard })).toBeNull();
    s = settle(run(s, planActivate(s, ap, z, 0, [tgt(bear)], undefined, undefined, undefined, { exileCards: yard })));
    expect(zone(s, bear)).toBe("graveyard");
    expect([zone(s, z), ...yard.map((id) => zone(s, id))]).toEqual(["exile", "exile", "exile"]);
  });

  it("Coastal Wizard: returns itself and another creature; not after attackers are declared", () => {
    let { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, coastalWizard);
    const bear = putOnBattlefield(s, opp, greenBear());
    expect(planActivate(s, ap, w, 0, [tgt(w)])).toBeNull();
    s = settle(run(s, planActivate(s, ap, w, 0, [tgt(bear)])));
    expect([zone(s, w), zone(s, bear)]).toEqual(["hand", "hand"]);
  });
});

describe("Topple: the creature with the greatest power, as you cast it and as it resolves", () => {
  it("compiles it", () => supported(topple));

  it("exiles the creature with the greatest power, also when tied", () => {
    let { s, ap, opp, ids } = setup([topple]);
    const a = putOnBattlefield(s, opp, bigOgre());
    const b = putOnBattlefield(s, ap, bigOgre());
    const bear = putOnBattlefield(s, opp, greenBear());
    expect(planCast(s, ap, ids[0]!, [tgt(bear)])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    expect(zone(s, a)).toBe("exile");
    expect(zone(s, b)).toBe("battlefield");
  });

  it("doesn't resolve if its target no longer has the greatest power (rulings)", () => {
    let { s, ap, opp, ids } = setup([topple, giantGrowth()]);
    const a = putOnBattlefield(s, opp, bigOgre());
    const bear = putOnBattlefield(s, ap, greenBear());
    s = run(s, planCast(s, ap, ids[0]!, [tgt(a)]));
    s = run(s, planCast(s, ap, ids[1]!, [tgt(bear)]));
    // With Topple on the stack, the bear grows to 7/7: the Ogre no longer has the greatest power.
    s.objects[bear]!.counters = { "+1/+1": 2 };
    invalidateCharacteristics(s);
    s = settle(s);
    expect(pt(s, bear)).toBe("7/7");
    expect(zone(s, a)).toBe("battlefield");
  });
});

describe("preventing damage: Orim's Touch, Elvish Healer, Pearl Shard", () => {
  it("compiles them", () => supported(orimsTouch, elvishHealer, pearlShard));

  it("Orim's Touch: prevents 2, or 4 if kicked", () => {
    for (const kicked of [false, true]) {
      let { s, ap, ids } = setup([orimsTouch, bolt(5)]);
      const ogre = putOnBattlefield(s, ap, bigOgre());
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)], undefined, "auto", undefined, kicked ? { kicks: [0] } : {})));
      s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ogre)])));
      expect(s.objects[ogre]!.damage, kicked ? "kicked" : "not kicked").toBe(kicked ? 1 : 3);
    }
  });

  it("Orim's Touch: kicked, on a player", () => {
    let { s, ap, ids } = setup([orimsTouch, bolt(5)]);
    const before = life(s, ap);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(ap)], undefined, "auto", undefined, { kicks: [0] })));
    s = settle(run(s, planCast(s, ap, ids[1]!, [player(ap)])));
    expect(life(s, ap)).toBe(before - 1);
  });

  it("Elvish Healer: 1 damage, or 2 if it's a green creature as the ability resolves (rulings)", () => {
    let { s, ap, opp, ids } = setup([bolt(3), bolt(3)]);
    const h = putOnBattlefield(s, ap, elvishHealer);
    const troll = putOnBattlefield(s, opp, creature("Green Troll", "Creature — Troll", "{4}{G}", 5, 5));
    const ogre = putOnBattlefield(s, opp, bigOgre());
    s = settle(run(s, planActivate(s, ap, h, 0, [tgt(troll)])));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(troll)])));
    expect(s.objects[troll]!.damage).toBe(1);
    s.objects[h]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, h, 0, [tgt(ogre)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ogre)])));
    expect(s.objects[ogre]!.damage).toBe(2);
  });
});

describe("the Shards: either cost", () => {
  it("compiles them", () => supported(pearlShard, graniteShard, heartwoodShard, skeletonShard));

  it("Granite Shard: {3}, {T} or {R}, {T}: 1 damage to any target", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, graniteShard);
    const before = life(s, opp);
    s = settle(run(s, planActivate(s, ap, g, 1, [player(opp)])));
    expect(life(s, opp)).toBe(before - 1);
    // Tapped now: neither cost can be paid.
    expect(planActivate(s, ap, g, 0, [player(opp)])).toBeNull();
    s.objects[g]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, g, 0, [player(opp)])));
    expect(life(s, opp)).toBe(before - 2);
  });

  it("Skeleton Shard: returns an artifact creature card from your graveyard", () => {
    let { s, ap } = setup([]);
    const sk = putOnBattlefield(s, ap, skeletonShard);
    const golem = into(s, ap, creature("Test Golem", "Artifact Creature — Golem", "{3}", 3, 3), "graveyard");
    const bear = into(s, ap, greenBear(), "graveyard");
    expect(planActivate(s, ap, sk, 1, [tgt(bear)])).toBeNull();
    s = settle(run(s, planActivate(s, ap, sk, 1, [tgt(golem)])));
    expect(zone(s, golem)).toBe("hand");
  });
});
