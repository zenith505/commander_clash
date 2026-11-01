// Round 238: cards from the top of the popularity list. Galadriel, Elven-Queen ("the Ring tempts you, then you put a
// +1/+1 counter on your Ring-bearer"); Protean Raider (raid: "If you attacked this turn, you may have this creature enter
// as a copy"); Chandra, Fire of Kaladesh ("If Chandra has dealt 3 or more damage this turn"); Cait, Cage Brawler ("you and
// defending player each draw a card, then discard a card ... if you discarded the card with the greatest mana value");
// Augusta, Order Returned ("each player exiles a card from their graveyard. When one or more nonland cards are exiled this
// way"); Nyssa of Traken ("sacrifice any number of artifacts. When you sacrifice one or more artifacts this way"); Kitt
// Kanto, Mayhem Diva ("target creature that player controls" on each player's turn); Goliath Hatchery ("choose a creature
// you control, then draw cards equal to its total toxic value"); Indominus Rex, Alpha ("As ~ enters, discard any number of
// creature cards", keyword counters); Vault 21: House Gambit ("Reveal up to five nonland cards ... the same mana value as
// another card revealed this way"); Erestor of the Council ("Whenever players finish voting").

import { describe, expect, it } from "vitest";
import { act, bear, card, forest as forestCard, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { dealDamage, objectSource } from "../src/damage";
import { putCounters } from "../src/counters";
import { objHasKeyword } from "../src/cards";
import { setFace } from "../src/faces";

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
const tokensNamed = (s: GameState, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && [name, `${name} Token`].includes(characteristics(s, s.objects[id]!).name));
/** Passes priority (the bots answering their own questions) until `pid`'s beginning of combat, or a question of ours. */
const toCombatOf = (s: GameState, me: PlayerId, pid: PlayerId) => {
  for (let i = 0; i < 2000 && !(s.activePlayer === pid && s.step === "beginCombat"); i++) {
    // Kitt triggers on every player's turn: decline on the turns before theirs.
    if (s.pending?.player === me && s.pending.kind === "chooseMay" && s.activePlayer !== pid) s = act(s, { type: "chooseMay", player: me, yes: false });
    else if (s.pending?.player === me && s.pending.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: me, attacks: [] });
    else if (s.pending?.player === me && s.activePlayer !== pid) s = act(s, botActions(s, me)[0]!);
    else if (s.pending?.player === me) return s;
    else s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
  }
  for (let i = 0; i < 50 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of [...s.players[pid]!.hand]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
};

// Real oracle text (Scryfall).
const galadriel = (): CardDef => ({"oracleId":"b97a11c2-7119-4399-9565-bf69520d3988","name":"Galadriel, Elven-Queen","manaCost":"{2}{G}{U}","cmc":4,"typeLine":"Legendary Creature — Elf Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Noble"],"oracleText":"Will of the council — At the beginning of combat on your turn, if another Elf entered the battlefield under your control this turn, starting with you, each player votes for dominion or guidance. If dominion gets more votes, the Ring tempts you, then you put a +1/+1 counter on your Ring-bearer. If guidance gets more votes or the vote is tied, draw a card.","power":"4","toughness":"5","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Will of the council"],"imageUrl":"https://cards.scryfall.io/normal/front/8/f/8fa46d54-563d-4b5c-9c69-5ab37dd529b3.jpg?1783916039","artUrl":"https://cards.scryfall.io/art_crop/front/8/f/8fa46d54-563d-4b5c-9c69-5ab37dd529b3.jpg?1783916039","commanderLegal":"legal","set":"ltc","releasedAt":"2023-06-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const raider = (): CardDef => ({"oracleId":"b2f6a75e-5637-41a8-a32b-56666716492d","name":"Protean Raider","manaCost":"{1}{U}{R}","cmc":3,"typeLine":"Creature — Shapeshifter Pirate","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter","Pirate"],"oracleText":"Raid — If you attacked this turn, you may have this creature enter as a copy of any creature on the battlefield.","power":"2","toughness":"2","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Raid"],"imageUrl":"https://cards.scryfall.io/normal/front/4/1/41ed9247-16c0-4ca4-9b46-d3da5a375e4c.jpg?1783935271","artUrl":"https://cards.scryfall.io/art_crop/front/4/1/41ed9247-16c0-4ca4-9b46-d3da5a375e4c.jpg?1783935271","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const chandra = (): CardDef => ({"oracleId":"6f6b8e14-c247-4dfd-8b39-38c7a5f2f354","name":"Chandra, Fire of Kaladesh // Chandra, Roaring Flame","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Legendary Creature — Human Shaman // Legendary Planeswalker — Chandra","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Shaman"],"oracleText":"Whenever you cast a red spell, untap Chandra.\n{T}: Chandra deals 1 damage to target player or planeswalker. If Chandra has dealt 3 or more damage this turn, exile her, then return her to the battlefield transformed under her owner's control.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Transform"],"imageUrl":"https://cards.scryfall.io/normal/front/b/0/b0d6caf0-4fa8-4ec5-b7f4-1307474d1b13.jpg?1783938336","artUrl":"https://cards.scryfall.io/art_crop/front/b/0/b0d6caf0-4fa8-4ec5-b7f4-1307474d1b13.jpg?1783938336","commanderLegal":"legal","set":"ori","releasedAt":"2015-07-17","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"Chandra, Fire of Kaladesh","manaCost":"{1}{R}{R}","typeLine":"Legendary Creature — Human Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Shaman"],"oracleText":"Whenever you cast a red spell, untap Chandra.\n{T}: Chandra deals 1 damage to target player or planeswalker. If Chandra has dealt 3 or more damage this turn, exile her, then return her to the battlefield transformed under her owner's control.","power":"2","toughness":"2","colors":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/b/0/b0d6caf0-4fa8-4ec5-b7f4-1307474d1b13.jpg?1783938336","artUrl":"https://cards.scryfall.io/art_crop/front/b/0/b0d6caf0-4fa8-4ec5-b7f4-1307474d1b13.jpg?1783938336"},{"name":"Chandra, Roaring Flame","manaCost":"","typeLine":"Legendary Planeswalker — Chandra","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Chandra"],"oracleText":"+1: Chandra deals 2 damage to target player or planeswalker.\n−2: Chandra deals 2 damage to target creature.\n−7: Chandra deals 6 damage to each opponent. Each player dealt damage this way gets an emblem with \"At the beginning of your upkeep, this emblem deals 3 damage to you.\"","loyalty":"4","colors":["R"],"colorIndicator":["R"],"imageUrl":"https://cards.scryfall.io/normal/back/b/0/b0d6caf0-4fa8-4ec5-b7f4-1307474d1b13.jpg?1783938336","artUrl":"https://cards.scryfall.io/art_crop/back/b/0/b0d6caf0-4fa8-4ec5-b7f4-1307474d1b13.jpg?1783938336"}]}) as CardDef;
const cait = (): CardDef => ({"oracleId":"f24319a1-0662-44be-9027-11e7bc020e1d","name":"Cait, Cage Brawler","manaCost":"{R}{G}","cmc":2,"typeLine":"Legendary Creature — Human Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"During your turn, Cait has indestructible.\nWhenever Cait attacks, you and defending player each draw a card, then discard a card. Put two +1/+1 counters on Cait if you discarded the card with the greatest mana value among those cards or tied for greatest.","power":"1","toughness":"1","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/c/fca61d02-2819-483f-9d30-862f0650ab0a.jpg?1783912393","artUrl":"https://cards.scryfall.io/art_crop/front/f/c/fca61d02-2819-483f-9d30-862f0650ab0a.jpg?1783912393","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const augusta = (): CardDef => ({"oracleId":"a80a1f84-ea49-4c8d-912d-c7036b814a6c","name":"Augusta, Order Returned","manaCost":"{2}{W}","cmc":3,"typeLine":"Legendary Creature — Spirit Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit","Advisor"],"oracleText":"Flying, vigilance\nWhenever Augusta attacks, each player exiles a card from their graveyard. When one or more nonland cards are exiled this way, put that many +1/+1 counters on target attacking creature.","power":"1","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/a/0/a0d1df84-0cb6-44fb-9916-d766d93f1519.jpg?1783903864","artUrl":"https://cards.scryfall.io/art_crop/front/a/0/a0d1df84-0cb6-44fb-9916-d766d93f1519.jpg?1783903864","commanderLegal":"legal","set":"soc","releasedAt":"2026-04-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const nyssa = (): CardDef => ({"oracleId":"07802bd6-29ca-40c5-beba-c2baf7a92555","name":"Nyssa of Traken","manaCost":"{3}{U}","cmc":4,"typeLine":"Legendary Creature — Human Scientist","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scientist"],"oracleText":"You have no maximum hand size.\nSonic Booster — Whenever Nyssa of Traken attacks, sacrifice any number of artifacts. When you sacrifice one or more artifacts this way, tap up to that many target creatures and draw that many cards.\nDoctor's companion (You can have two commanders if the other is the Doctor.)","power":"3","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Sonic Booster","Doctor's companion"],"imageUrl":"https://cards.scryfall.io/normal/front/b/e/bed41499-759d-4a3b-aabb-c462d5831956.jpg?1783914665","artUrl":"https://cards.scryfall.io/art_crop/front/b/e/bed41499-759d-4a3b-aabb-c462d5831956.jpg?1783914665","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kitt = (): CardDef => ({"oracleId":"b6e3af71-0d68-4bf0-b886-c29dae15e9ae","name":"Kitt Kanto, Mayhem Diva","manaCost":"{1}{R}{G}{W}","cmc":4,"typeLine":"Legendary Creature — Cat Bard Druid","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Cat","Bard","Druid"],"oracleText":"When Kitt Kanto enters, create a 1/1 green and white Citizen creature token.\nAt the beginning of combat on each player's turn, you may tap two untapped creatures you control. When you do, target creature that player controls gets +2/+2 and gains trample until end of turn. Goad that creature.","power":"3","toughness":"3","colors":["G","R","W"],"colorIdentity":["G","R","W"],"keywords":["Goad"],"imageUrl":"https://cards.scryfall.io/normal/front/9/b/9b9850d6-49d3-45ec-9a45-75aa0fce9ee5.jpg?1783923381","artUrl":"https://cards.scryfall.io/art_crop/front/9/b/9b9850d6-49d3-45ec-9a45-75aa0fce9ee5.jpg?1783923381","commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const hatchery = (): CardDef => ({"oracleId":"c4d65bcd-f6c5-40c3-825d-06b5183e7dbe","name":"Goliath Hatchery","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, create two 3/3 green Phyrexian Beast creature tokens with toxic 1. (Players dealt combat damage by them also get a poison counter.)\nCorrupted — At the beginning of your upkeep, if an opponent has three or more poison counters, choose a creature you control, then draw cards equal to its total toxic value.","colors":["G"],"colorIdentity":["G"],"keywords":["Corrupted"],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0d55c882-bf32-4d52-8af2-6a59c00bde5c.jpg?1783917915","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0d55c882-bf32-4d52-8af2-6a59c00bde5c.jpg?1783917915","commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rex = (): CardDef => ({"oracleId":"723a66c3-2c2c-411c-bba5-922e8601981b","name":"Indominus Rex, Alpha","manaCost":"{1}{U/B}{U/B}{G}{G}","cmc":5,"typeLine":"Legendary Creature — Dinosaur Mutant","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dinosaur","Mutant"],"oracleText":"As Indominus Rex enters, discard any number of creature cards. It enters with a flying counter on it if a card discarded this way has flying. The same is true for first strike, double strike, deathtouch, hexproof, haste, indestructible, lifelink, menace, reach, trample, and vigilance.\nWhen Indominus Rex enters, draw a card for each counter on it.","power":"6","toughness":"6","colors":["B","G","U"],"colorIdentity":["B","G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/5/25e6ebfb-8f0b-44f0-a911-103ade41c6bc.jpg?1783913634","artUrl":"https://cards.scryfall.io/art_crop/front/2/5/25e6ebfb-8f0b-44f0-a911-103ade41c6bc.jpg?1783913634","commanderLegal":"legal","set":"rex","releasedAt":"2023-11-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const vault = (): CardDef => ({"oracleId":"8d83d816-518c-4557-a3c4-0255f772c57a","name":"Vault 21: House Gambit","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Discard a card, then draw a card.\nIII — Reveal up to five nonland cards from your hand. For each of those cards that has the same mana value as another card revealed this way, create a Treasure token.","colors":["R"],"colorIdentity":["R"],"keywords":["Treasure"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/40972644-a284-4c7c-a451-d70eff7488ab.jpg?1783912400","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/40972644-a284-4c7c-a451-d70eff7488ab.jpg?1783912400","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const erestor = (): CardDef => ({"oracleId":"b65e1dff-9423-4840-a6af-78cb3e6f4f31","name":"Erestor of the Council","manaCost":"{1}{G}{U}","cmc":3,"typeLine":"Legendary Creature — Elf Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Noble"],"oracleText":"Whenever players finish voting, each opponent who voted for a choice you voted for creates a Treasure token. You scry X, where X is the number of opponents who voted for a choice you didn't vote for. Draw a card.","power":"2","toughness":"4","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Treasure","Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/812c35ae-cdb1-4420-a660-f2a9788759f9.jpg?1783915980","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/812c35ae-cdb1-4420-a660-f2a9788759f9.jpg?1783915980","commanderLegal":"legal","set":"ltc","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const elf = (name = "Test Elf") => card(name, "Creature — Elf", "{G}", { cmc: 1, power: "1", toughness: "1" });
/** Notes that a permanent entered under `pid`'s control this turn, as the turn log does. */
const entered = (s: GameState, pid: PlayerId, id: string) => {
  const c = characteristics(s, s.objects[id]!);
  ((s.turnLog ??= {}).entered ??= []).push({ controller: pid, types: [...c.types], subtypes: [...c.subtypes], colors: [...c.colors], id, zc: s.objects[id]!.zoneChanges ?? 0 });
};

describe("round 238: Galadriel, Elven-Queen", () => {
  it("is supported", () => supported(galadriel()));

  /** At the beginning of combat, with every vote ours to make (Illusion of Choice), all for `word`. */
  const voteAll = (s: GameState, ap: PlayerId, word: string) => {
    s.votesChosenBy = { player: ap, turn: s.turn };
    s = passUntil(s, "beginCombat", ap);
    s = settle(s, { me: ap });
    for (let i = 0; i < 4; i++) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "vote" });
      s = settle(act(s, { type: "chooseOption", player: ap, choice: word }), { me: ap });
    }
    return s;
  };

  it("dominion: the Ring tempts you, then a +1/+1 counter on your Ring-bearer", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, galadriel());
    entered(s, ap, putOnBattlefield(s, ap, elf()));
    s = voteAll(s, ap, "dominion");
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "ringBearer", player: ap });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [g] }), { me: ap });
    expect(s.objects[g]!.counters["+1/+1"]).toBe(1);
  });

  it("guidance: draw a card", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, galadriel());
    entered(s, ap, putOnBattlefield(s, ap, elf()));
    const hand = s.players[ap]!.hand.length;
    s = voteAll(s, ap, "guidance");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("no vote unless another Elf entered under your control this turn (Galadriel herself doesn't count)", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, galadriel());
    entered(s, ap, g);
    entered(s, opp, putOnBattlefield(s, opp, elf("Their Elf")));
    s = passUntil(s, "beginCombat", ap);
    s = settle(s, { me: ap });
    expect(s.pending).toBeNull();
    expect(s.log.some((l) => /votes? for/.test(l.text))).toBe(false);
  });
});

describe("round 238: Protean Raider", () => {
  it("is supported", () => supported(raider()));

  const raiderIn = (s: GameState, ap: PlayerId) => {
    const r = into(s, ap, raider(), "hand");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1, R: 1, C: 1 };
    return r;
  };

  it("if you attacked this turn, it may enter as a copy of any creature", () => {
    let { s, ap, opp } = setup([]);
    const theirs = putOnBattlefield(s, opp, card("Test Wurm", "Creature — Wurm", "{5}{G}", { cmc: 6, power: "6", toughness: "6" }));
    s.players[ap]!.attackedTurn = s.turn;
    const r = raiderIn(s, ap);
    s = settle(run(s, planCast(s, ap, r)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: theirs }));
    expect(characteristics(s, s.objects[r]!).name).toBe("Test Wurm");
    expect(power(s, s.objects[r]!)).toBe(6);
  });

  it("without having attacked, it's just a 2/2", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, card("Test Wurm", "Creature — Wurm", "{5}{G}", { cmc: 6, power: "6", toughness: "6" }));
    const r = raiderIn(s, ap);
    s = settle(run(s, planCast(s, ap, r)));
    expect(s.pending).toBeNull();
    expect(characteristics(s, s.objects[r]!).name).toBe("Protean Raider");
    expect(power(s, s.objects[r]!)).toBe(2);
  });
});

describe("round 238: Chandra, Fire of Kaladesh", () => {
  it("is supported", () => supported(chandra()));

  it("transforms only once she has dealt 3 or more damage this turn, combat or not, counted as the ability resolves", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, chandra());
    const life = s.players[opp]!.life;
    s = settle(run(s, planActivate(s, ap, c, 0, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(characteristics(s, s.objects[c]!).name).toBe("Chandra, Fire of Kaladesh");
    // 2 more damage from her (as combat damage would be) makes 3; the next activation transforms her after its damage.
    dealDamage(s, objectSource(s, s.objects[c]!), { player: opp }, 2, { combat: true });
    s.objects[c]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, c, 0, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 4);
    const now = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Chandra, Roaring Flame");
    expect(now).toBeDefined();
    expect(s.objects[now!]!.counters.loyalty).toBe(4);
  });

  it("Chandra, Roaring Flame's −7: each player dealt damage this way gets the emblem", () => {
    let { s, ap } = setup([]);
    const c = putOnBattlefield(s, ap, chandra());
    setFace(s, s.objects[c]!, 1);
    s.objects[c]!.counters.loyalty = 7;
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[c]!).name).toBe("Chandra, Roaring Flame");
    const opps = s.turnOrder.filter((p) => p !== ap);
    const lives = opps.map((p) => s.players[p]!.life);
    s = settle(run(s, planActivate(s, ap, c, 2)));
    expect(opps.map((p) => s.players[p]!.life)).toEqual(lives.map((l) => l - 6));
    const owners = (s.emblems ?? []).map((id) => s.objects[id]!.owner);
    expect(owners.sort()).toEqual([...opps].sort());
  });

  it("damage another object dealt doesn't count", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, chandra());
    const other = putOnBattlefield(s, ap, bear());
    dealDamage(s, objectSource(s, s.objects[other]!), { player: opp }, 5);
    s = settle(run(s, planActivate(s, ap, c, 0, [{ kind: "player", id: opp }])));
    expect(characteristics(s, s.objects[c]!).name).toBe("Chandra, Fire of Kaladesh");
  });
});

describe("round 238: Cait, Cage Brawler", () => {
  it("is supported", () => supported(cait()));

  const attackWith = (s: GameState, ap: PlayerId, opp: PlayerId, id: string) => {
    s = passUntil(s, "declareAttackers", ap);
    return act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: id, defender: opp }] });
  };

  it("you and defending player each draw, then discard; two +1/+1 counters if yours had the greatest mana value", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, cait());
    emptyHand(s, ap);
    emptyHand(s, opp);
    const big = into(s, ap, card("Test Titan", "Creature — Giant", "{5}{R}", { cmc: 6, power: "6", toughness: "6" }), "hand");
    into(s, ap, bear({ name: "My Draw" }), "library");
    const theirs = into(s, opp, card("Test Six", "Sorcery", "{5}{B}", { cmc: 6 }), "library");
    s = settle(attackWith(s, ap, opp, c), { me: ap });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [big] }), { me: ap });
    expect(s.objects[big]!.zone).toBe("graveyard");
    expect(s.objects[theirs]!.zone).toBe("graveyard"); // their only card
    expect(s.objects[c]!.counters["+1/+1"]).toBe(2); // tied for greatest
  });

  it("no counters if theirs was greater", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, cait());
    emptyHand(s, ap);
    emptyHand(s, opp);
    const small = into(s, ap, card("Test Cheap", "Instant", "{R}", { cmc: 1 }), "hand");
    into(s, ap, bear({ name: "My Draw" }), "library");
    into(s, opp, card("Test Six", "Sorcery", "{5}{B}", { cmc: 6 }), "library");
    s = settle(attackWith(s, ap, opp, c), { me: ap });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [small] }), { me: ap });
    expect(s.objects[small]!.zone).toBe("graveyard");
    expect(s.objects[c]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("round 238: Augusta, Order Returned", () => {
  it("is supported", () => supported(augusta()));

  const attack = (s: GameState, ap: PlayerId, opp: PlayerId, a: string) => {
    s = passUntil(s, "declareAttackers", ap);
    return settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] }), { targets: [tgt(a)], me: ap });
  };

  it("each player exiles a card from their graveyard; that many +1/+1 counters for the nonland cards", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, augusta());
    const mine = into(s, ap, bear({ name: "My Dead Bear" }), "graveyard");
    const theirs = into(s, opp, bear({ name: "Their Dead Bear" }), "graveyard");
    const third = s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!;
    const land = into(s, third, forestCard, "graveyard");
    s = attack(s, ap, opp, a);
    expect([mine, theirs, land].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(2);
  });

  it("only land cards exiled: no reflexive trigger", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, augusta());
    into(s, ap, forestCard, "graveyard");
    s = attack(s, ap, opp, a);
    expect(s.objects[a]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("each player chooses which card of theirs", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, augusta());
    const keep = into(s, ap, bear({ name: "Kept Bear" }), "graveyard");
    const land = into(s, ap, forestCard, "graveyard");
    s = passUntil(s, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] }), { me: ap });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromGraveyard: "exile" });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [land] }), { me: ap });
    expect(s.objects[land]!.zone).toBe("exile");
    expect(s.objects[keep]!.zone).toBe("graveyard");
    expect(s.objects[a]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("round 238: Nyssa of Traken", () => {
  it("is supported", () => supported(nyssa()));

  it("sacrifice any number of artifacts; tap up to that many target creatures and draw that many cards", () => {
    let { s, ap, opp } = setup([]);
    const n = putOnBattlefield(s, ap, nyssa());
    const trinket = () => card("Test Trinket", "Artifact", "{1}", { cmc: 1 });
    const [t1, t2] = [putOnBattlefield(s, ap, trinket()), putOnBattlefield(s, ap, trinket())];
    const b1 = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: n, defender: opp }] }), { me: ap });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "sacrifice", player: ap });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [t1, t2] }), { me: ap, targets: [tgt(b1)] });
    expect([t1, t2].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    expect(s.objects[b1]!.tapped).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand + 2); // fewer targets don't change the draw (rulings)
  });

  it("sacrifice none: nothing happens", () => {
    let { s, ap, opp } = setup([]);
    const n = putOnBattlefield(s, ap, nyssa());
    putOnBattlefield(s, ap, card("Test Trinket", "Artifact", "{1}", { cmc: 1 }));
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: n, defender: opp }] }), { me: ap });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }), { me: ap });
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("round 238: Kitt Kanto, Mayhem Diva", () => {
  it("is supported", () => supported(kitt()));

  it("on another player's turn: tap two of yours, then their creature gets +2/+2 and trample and is goaded", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kitt());
    const a = putOnBattlefield(s, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    s = toCombatOf(s, ap, opp);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    // Only two untapped creatures: those two are tapped, no choice.
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
    s = settle(s, { me: ap, targets: [tgt(theirs)] });
    expect(s.objects[k]!.tapped && s.objects[a]!.tapped).toBe(true);
    expect([power(s, s.objects[theirs]!), toughness(s, s.objects[theirs]!)]).toEqual([4, 4]);
    expect(objHasKeyword(s, s.objects[theirs]!, "Trample")).toBe(true);
    expect(characteristics(s, s.objects[theirs]!).goadedBy).toContain(ap);
  });

  it("only that player's creatures can be the target; with fewer than two untapped creatures, it can't be done", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, kitt());
    putOnBattlefield(s, ap, bear({ name: "My Bear" }));
    const third = s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!;
    const other = putOnBattlefield(s, third, bear({ name: "Other Bear" }));
    putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    s = toCombatOf(s, ap, opp);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(other)] })).toThrow();
  });
});

describe("round 238: Goliath Hatchery", () => {
  it("is supported", () => supported(hatchery()));

  const toxic = () => card("Test Toxic", "Creature — Phyrexian", "{2}{G}", { cmc: 3, power: "2", toughness: "2", oracleText: "Toxic 2", keywords: ["Toxic"] });

  it("with an opponent at three poison counters: choose a creature, draw cards equal to its total toxic value", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, hatchery());
    const t = putOnBattlefield(s, ap, toxic());
    putOnBattlefield(s, ap, bear());
    s.players[opp]!.poison = 3;
    s = passUntil(s, "main1", opp);
    s = passUntil(s, "upkeep", ap);
    const hand = s.players[ap]!.hand.length;
    s = settle(s, { me: ap });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "choose", player: ap });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [t] }), { me: ap });
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("no opponent with three poison counters: it doesn't trigger", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, hatchery());
    putOnBattlefield(s, ap, toxic());
    s.players[opp]!.poison = 2;
    s = passUntil(s, "main1", opp);
    s = passUntil(s, "upkeep", ap);
    s = settle(s, { me: ap });
    expect(s.pending).toBeNull();
  });
});

describe("round 238: Indominus Rex, Alpha", () => {
  it("is supported", () => supported(rex()));

  const flyer = (name: string, extra = "") => card(name, "Creature — Bird", "{1}{U}", { cmc: 2, power: "1", toughness: "1", oracleText: `Flying${extra ? `, ${extra.toLowerCase()}` : ""}`, keywords: ["Flying", ...(extra ? [extra] : [])] });

  it("discard any number of creature cards: one counter of each keyword among them, then draw that many", () => {
    let { s, ap } = setup([]);
    emptyHand(s, ap);
    const r = into(s, ap, rex(), "hand");
    const f1 = into(s, ap, flyer("Test Flyer"), "hand");
    const f2 = into(s, ap, flyer("Test Deadly Flyer", "Deathtouch"), "hand");
    const plain = into(s, ap, bear({ name: "Test Plain Bear" }), "hand");
    const spell = into(s, ap, card("Test Spell", "Sorcery", "{1}", { cmc: 1 }), "hand");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 2, G: 2, C: 1 };
    s = settle(run(s, planCast(s, ap, r)), { me: ap });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "discard", player: ap, count: 3 });
    expect((s.pending as { options: string[] }).options.sort()).toEqual([f1, f2, plain].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [f1, f2] }), { me: ap });
    expect(s.objects[r]!.counters).toMatchObject({ flying: 1, deathtouch: 1 });
    expect(objHasKeyword(s, s.objects[r]!, "Flying") && objHasKeyword(s, s.objects[r]!, "Deathtouch")).toBe(true);
    expect([f1, f2].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    // Two counters: two cards drawn; the plain Bear and the sorcery stay.
    expect(s.players[ap]!.hand.length).toBe(4);
    expect(s.players[ap]!.hand).toContain(plain);
    expect(s.players[ap]!.hand).toContain(spell);
  });

  it("the bot discards only the cards that give a new kind of counter", () => {
    let { s, ap } = setup([]);
    emptyHand(s, ap);
    const r = into(s, ap, rex(), "hand");
    const f1 = into(s, ap, flyer("Test Flyer"), "hand");
    const f2 = into(s, ap, flyer("Test Other Flyer"), "hand");
    const plain = into(s, ap, bear({ name: "Test Plain Bear" }), "hand");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 2, G: 2, C: 1 };
    s = settle(run(s, planCast(s, ap, r)), { me: ap });
    const pick = botActions(s, ap)[0]! as { ids: string[] };
    expect(pick.ids.length).toBe(1);
    expect([f1, f2]).toContain(pick.ids[0]);
    expect(pick.ids).not.toContain(plain);
  });
});

describe("round 238: Vault 21: House Gambit", () => {
  it("is supported", () => supported(vault()));

  it("III: a Treasure for each revealed card that shares its mana value with another revealed card", () => {
    let { s, ap } = setup([]);
    emptyHand(s, ap);
    const v = putOnBattlefield(s, ap, vault());
    s.objects[v]!.counters.lore = 2;
    const twos = [1, 2, 3].map((i) => into(s, ap, bear({ name: `Test Bear ${i}` }), "hand"));
    const three = into(s, ap, card("Test Three", "Sorcery", "{2}{R}", { cmc: 3 }), "hand");
    const xSpell = into(s, ap, card("Test X", "Sorcery", "{X}{R}", { cmc: 1 }), "hand");
    const one = into(s, ap, card("Test One", "Instant", "{R}", { cmc: 1 }), "hand");
    into(s, ap, forestCard, "hand");
    putCounters(s, s.objects[v]!, "lore", 1);
    s = settle(s, { me: ap });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, max: 5 });
    expect((s.pending as { cards: string[] }).cards.length).toBe(6); // not the land
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [...twos, xSpell, one] }), { me: ap });
    // Three 2s and two 1s ({X}{R} is 1): all five share.
    expect(tokensNamed(s, "Treasure").length).toBe(5);
    expect(s.players[ap]!.hand).toContain(three);
  });

  it("the bot reveals the biggest groups of equal mana value", () => {
    let { s, ap } = setup([]);
    emptyHand(s, ap);
    const v = putOnBattlefield(s, ap, vault());
    s.objects[v]!.counters.lore = 2;
    const twos = [1, 2].map((i) => into(s, ap, bear({ name: `Test Bear ${i}` }), "hand"));
    const odd = [into(s, ap, card("Test Three", "Sorcery", "{2}{R}", { cmc: 3 }), "hand"), into(s, ap, card("Test Five", "Sorcery", "{4}{R}", { cmc: 5 }), "hand")];
    putCounters(s, s.objects[v]!, "lore", 1);
    s = settle(s, { me: ap });
    const pick = botActions(s, ap)[0]! as { found: string[] };
    expect(pick.found.slice(0, 2).sort()).toEqual([...twos].sort());
    expect(odd.length).toBe(2);
  });
});

describe("round 238: Erestor of the Council", () => {
  it("is supported", () => supported(erestor()));

  const council = () => card("Test Council", "Sorcery", "{W}", { cmc: 1, oracleText: "Will of the council — Starting with you, each player votes for death or taxes. If death gets more votes, each opponent loses 1 life. If taxes gets more votes or the vote is tied, draw a card." });

  it("after the vote: a Treasure for each opponent who voted with you, scry the others, draw a card", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, erestor());
    const c = into(s, ap, council(), "hand");
    s.votesChosenBy = { player: ap, turn: s.turn };
    const order = [0, 1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
    s = settle(run(s, planCast(s, ap, c)), { me: ap });
    for (const word of ["death", "death", "taxes", "taxes"]) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote" });
      s = settle(act(s, { type: "chooseOption", player: ap, choice: word }), { me: ap });
    }
    // Tied: draw a card (the council), then Erestor's trigger.
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "scry" });
    expect((s.pending as { cards: string[] }).cards.length).toBe(2);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "arrangeTop", player: ap, top: (s.pending as { cards: string[] }).cards, away: [] }), { me: ap });
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    const treasures = tokensNamed(s, "Treasure").map((id) => s.objects[id]!.controller);
    expect(treasures).toEqual([order[1]]);
  });

  it("\"each player may choose\" isn't voting: no trigger", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, erestor());
    const hand = s.players[ap]!.hand.length;
    const c = into(s, ap, card("Test Choice", "Sorcery", "{W}", { cmc: 1, oracleText: "Each player draws a card." }), "hand");
    s = settle(run(s, planCast(s, ap, c)), { me: ap });
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(tokensNamed(s, "Treasure").length).toBe(0);
  });
});

describe("round 238: Kitt Kanto, Mayhem Diva (alone)", () => {
  it("with only Kitt untapped, the may does nothing", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kitt());
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    s = toCombatOf(s, ap, opp);
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: ap, targets: [tgt(theirs)] });
    expect(s.objects[k]!.tapped).toBe(false);
    expect(power(s, s.objects[theirs]!)).toBe(2);
  });
});
