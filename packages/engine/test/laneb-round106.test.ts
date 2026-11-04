// Lane B round B106: Leaves from the Vine, Spirit of Resistance, Kemba's Legion, Cut Short, Gideon, the Oathsworn,
// Embodiment of Agonies, Fealty to the Realm, Zameck Guildmage, Combine Guildmage, Dearly Departed, Inferno Hellion,
// Foundry Helix, General Tazri, Armored Kincaller and Skulking Killer.

import { describe, expect, it } from "vitest";
import { putCounters } from "../src/counters";
import { becomeMonarch } from "../src/effects/run-basics";
import { maxBlocks } from "../src/game";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const ptOf = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
/** Attackers declared and every defending player's blocks none, with the attack triggers waiting. */
const attackWith = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => {
  s = passUntil(s, "declareAttackers", ap);
  return act(s, { type: "declareAttackers", player: ap, attacks });
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
const leaves = (): CardDef => ({"oracleId":"7c4abd72-29b0-4c82-9e67-b481cf7e8775","name":"Leaves from the Vine","manaCost":"{1}{G}","cmc":2,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Mill three cards, then create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nII — Put a +1/+1 counter on each of up to two target creatures you control.\nIII — Draw a card if there's a creature or Lesson card in your graveyard.","colors":["G"],"colorIdentity":["G"],"keywords":["Food","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/b/1/b18995c2-efe3-46ca-8204-e2dc0e42f6e3.jpg?1784182904","artUrl":"https://cards.scryfall.io/art_crop/front/b/1/b18995c2-efe3-46ca-8204-e2dc0e42f6e3.jpg?1784182904","commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"uncommon","layout":"saga","gameChanger":false}) as CardDef;
const resistance = (): CardDef => ({"oracleId":"b075b645-2e5a-4d91-9440-02db4e6f5d08","name":"Spirit of Resistance","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"As long as you control a permanent of each color, prevent all damage that would be dealt to you.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/f/5fb66439-df73-4a01-a8d4-6f2334297fdf.jpg?1783945711","artUrl":"https://cards.scryfall.io/art_crop/front/5/f/5fb66439-df73-4a01-a8d4-6f2334297fdf.jpg?1783945711","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const legion = (): CardDef => ({"oracleId":"338ad8c4-c89f-4e78-be28-7224fac0fd0f","name":"Kemba's Legion","manaCost":"{5}{W}{W}","cmc":7,"typeLine":"Creature — Cat Soldier","supertypes":[],"types":["Creature"],"subtypes":["Cat","Soldier"],"oracleText":"Vigilance\nThis creature can block an additional creature each combat for each Equipment attached to this creature.","power":"4","toughness":"6","colors":["W"],"colorIdentity":["W"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/3/0/30731756-81a8-480b-938f-48c1d0cb95d7.jpg?1783941392","artUrl":"https://cards.scryfall.io/art_crop/front/3/0/30731756-81a8-480b-938f-48c1d0cb95d7.jpg?1783941392","commanderLegal":"legal","set":"mbs","releasedAt":"2011-02-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const cutShort = (): CardDef => ({"oracleId":"428d131c-b0fa-4e96-9c02-e2e6714357b9","name":"Cut Short","manaCost":"{2}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nDestroy target planeswalker that was activated this turn or tapped creature.","colors":["W"],"colorIdentity":["W"],"keywords":["Convoke"],"imageUrl":"https://cards.scryfall.io/normal/front/b/0/b0a45d4d-d16a-43c6-843c-916d4629aae1.jpg?1783917065","artUrl":"https://cards.scryfall.io/art_crop/front/b/0/b0a45d4d-d16a-43c6-843c-916d4629aae1.jpg?1783917065","commanderLegal":"legal","set":"mom","releasedAt":"2023-04-21","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const gideon = (): CardDef => ({"oracleId":"19a81aa7-823b-43fa-abc2-b2700a122bc1","name":"Gideon, the Oathsworn","manaCost":"{4}{W}{W}","cmc":6,"typeLine":"Legendary Planeswalker — Gideon","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Gideon"],"oracleText":"Whenever you attack with two or more non-Gideon creatures, put a +1/+1 counter on each of those creatures.\n+2: Until end of turn, Gideon becomes a 5/5 white Soldier creature that's still a planeswalker. Prevent all damage that would be dealt to him this turn. (He can't attack if he was cast this turn.)\n−9: Exile Gideon and each creature your opponents control.","loyalty":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/43e7331d-98b8-420f-a346-3f3521c3b258.jpg?1783933361","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/43e7331d-98b8-420f-a346-3f3521c3b258.jpg?1783933361","commanderLegal":"legal","set":"war","releasedAt":"2019-05-03","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const agonies = (): CardDef => ({"oracleId":"9d6686a0-1648-42f6-a606-16d2a84138a7","name":"Embodiment of Agonies","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Demon","supertypes":[],"types":["Creature"],"subtypes":["Demon"],"oracleText":"Flying, deathtouch\nThis creature enters with a +1/+1 counter on it for each different mana cost among nonland cards in your graveyard. (For example, {2}{B} and {1}{B}{B} are different mana costs.)","power":"0","toughness":"0","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch","Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/7/7/77972745-8689-4733-9a9d-39ae9d6273a2.jpg?1783932995","artUrl":"https://cards.scryfall.io/art_crop/front/7/7/77972745-8689-4733-9a9d-39ae9d6273a2.jpg?1783932995","commanderLegal":"legal","set":"m20","releasedAt":"2019-07-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fealty = (): CardDef => ({"oracleId":"c0128941-240a-4ca1-9816-b32f47523fdb","name":"Fealty to the Realm","manaCost":"{4}{U}","cmc":5,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nWhen this Aura enters, you become the monarch.\nThe monarch controls enchanted creature.\nEnchanted creature attacks each combat if able and can't attack you.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/0/1/017a5dbf-5773-448d-abf3-9a3d42bde9e5.jpg?1783916032","artUrl":"https://cards.scryfall.io/art_crop/front/0/1/017a5dbf-5773-448d-abf3-9a3d42bde9e5.jpg?1783916032","commanderLegal":"legal","set":"ltc","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const zameck = (): CardDef => ({"oracleId":"98250fad-7fd0-431e-a87e-551185d26ec1","name":"Zameck Guildmage","manaCost":"{G}{U}","cmc":2,"typeLine":"Creature — Elf Wizard","supertypes":[],"types":["Creature"],"subtypes":["Elf","Wizard"],"oracleText":"{G}{U}: This turn, each creature you control enters with an additional +1/+1 counter on it.\n{G}{U}, Remove a +1/+1 counter from a creature you control: Draw a card.","power":"2","toughness":"2","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/e/feeaf99b-7720-42e3-8cb1-23218b646458.jpg?1783940097","artUrl":"https://cards.scryfall.io/art_crop/front/f/e/feeaf99b-7720-42e3-8cb1-23218b646458.jpg?1783940097","commanderLegal":"legal","set":"gtc","releasedAt":"2013-02-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const combine = (): CardDef => ({"oracleId":"90abb55d-5c05-453f-b4a6-c0741dc36694","name":"Combine Guildmage","manaCost":"{G}{U}","cmc":2,"typeLine":"Creature — Merfolk Wizard","supertypes":[],"types":["Creature"],"subtypes":["Merfolk","Wizard"],"oracleText":"{1}{G}, {T}: This turn, each creature you control enters with an additional +1/+1 counter on it.\n{1}{U}, {T}: Move a +1/+1 counter from target creature you control onto another target creature you control.","power":"2","toughness":"2","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3a6e2816-d50b-41a5-b503-faa58dc7c94a.jpg?1783933655","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3a6e2816-d50b-41a5-b503-faa58dc7c94a.jpg?1783933655","commanderLegal":"legal","set":"rna","releasedAt":"2019-01-25","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const departed = (): CardDef => ({"oracleId":"539be0f3-0863-4d44-87ee-5912dd003475","name":"Dearly Departed","manaCost":"{4}{W}{W}","cmc":6,"typeLine":"Creature — Spirit","supertypes":[],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Flying\nAs long as this creature is in your graveyard, each Human creature you control enters with an additional +1/+1 counter on it.","power":"5","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/0/d008061f-cda4-4bcf-b6b3-d1b4a251cc66.jpg?1783940996","artUrl":"https://cards.scryfall.io/art_crop/front/d/0/d008061f-cda4-4bcf-b6b3-d1b4a251cc66.jpg?1783940996","commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hellion = (): CardDef => ({"oracleId":"68c88a4c-8c2b-4e6f-b835-7e269eb073c8","name":"Inferno Hellion","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Hellion","supertypes":[],"types":["Creature"],"subtypes":["Hellion"],"oracleText":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nAt the beginning of each end step, if this creature attacked or blocked this turn, its owner shuffles it into their library.","power":"7","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/9/c/9cd11004-5b8f-4c71-bde0-eb75eed869b0.jpg?1783934549","artUrl":"https://cards.scryfall.io/art_crop/front/9/c/9cd11004-5b8f-4c71-bde0-eb75eed869b0.jpg?1783934549","commanderLegal":"legal","set":"m19","releasedAt":"2018-07-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const helix = (): CardDef => ({"oracleId":"f4f66558-3c99-4488-ad2d-90626a922042","name":"Foundry Helix","manaCost":"{1}{R}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, sacrifice a permanent.\nFoundry Helix deals 4 damage to any target. If the sacrificed permanent was an artifact, you gain 4 life.","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/c/9c54b7c6-f94c-4349-8725-319c54240409.jpg?1783926817","artUrl":"https://cards.scryfall.io/art_crop/front/9/c/9c54b7c6-f94c-4349-8725-319c54240409.jpg?1783926817","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const tazri = (): CardDef => ({"oracleId":"b0f19cba-1339-4518-8320-d7b1dcaf2eb0","name":"General Tazri","manaCost":"{4}{W}","cmc":5,"typeLine":"Legendary Creature — Human Ally","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Ally"],"oracleText":"When General Tazri enters, you may search your library for an Ally creature card, reveal it, put it into your hand, then shuffle.\n{W}{U}{B}{R}{G}: Ally creatures you control get +X/+X until end of turn, where X is the number of colors among those creatures.","power":"3","toughness":"4","colors":["W"],"colorIdentity":["B","G","R","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/4/34e9aa86-1a31-4c0f-928d-923f066286b6.jpg?1783937927","artUrl":"https://cards.scryfall.io/art_crop/front/3/4/34e9aa86-1a31-4c0f-928d-923f066286b6.jpg?1783937927","commanderLegal":"legal","set":"ogw","releasedAt":"2016-01-22","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const kincaller = (): CardDef => ({"oracleId":"6aad6906-96ec-4994-bfc3-9a76f893bc8c","name":"Armored Kincaller","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Dinosaur","supertypes":[],"types":["Creature"],"subtypes":["Dinosaur"],"oracleText":"When this creature enters, you may reveal a Dinosaur card from your hand. If you do or if you control another Dinosaur, you gain 3 life.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/7/b76a46a1-a63e-460a-98c5-699dd1c827aa.jpg?1783913752","artUrl":"https://cards.scryfall.io/art_crop/front/b/7/b76a46a1-a63e-460a-98c5-699dd1c827aa.jpg?1783913752","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const killer = (): CardDef => ({"oracleId":"e711a2d6-008d-4e7b-986e-f34805165679","name":"Skulking Killer","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Vampire Assassin","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Assassin"],"oracleText":"When this creature enters, target creature an opponent controls gets -2/-2 until end of turn if that opponent controls no other creatures.","power":"4","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/334e6e41-cd45-4192-97a7-cee03845717c.jpg?1783924223","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/334e6e41-cd45-4192-97a7-cee03845717c.jpg?1783924223","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const fireIce = (): CardDef => ({"oracleId":"ae92942b-919c-4ea9-b693-85fcef765d5a","name":"Fire // Ice","manaCost":"{1}{R} // {1}{U}","cmc":4,"typeLine":"Instant // Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","commanderLegal":"legal","set":"ddj","releasedAt":"2012-09-07","rarity":"uncommon","layout":"split","gameChanger":false,"faces":[{"name":"Fire","manaCost":"{1}{R}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R"]},{"name":"Ice","manaCost":"{1}{U}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Tap target permanent.\nDraw a card.","colors":["U"]}]}) as CardDef;

const lesson = card("Test Lesson", "Sorcery — Lesson", "{1}{U}", { oracleText: "Draw a card." });
const instant = card("Test Instant", "Instant", "{U}", { oracleText: "Draw a card." });
const selfShock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const mote = (c: string) => card(`Test ${c} Mote`, "Enchantment", `{${c}}`);
const sword = card("Test Sword", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +1/+0.\\nEquip {1}" });
const walker = card("Test Walker", "Legendary Planeswalker — Jace", "{2}{U}", { oracleText: "+1: Draw a card.", loyalty: "3" });
const gideonCreature = card("Test Gideon Soldier", "Legendary Planeswalker Creature — Gideon Soldier", "{2}{W}", { power: "2", toughness: "2" });
const human = card("Test Villager", "Creature — Human", "{W}", { power: "1", toughness: "1" });
const ally = card("Test Ally", "Creature — Elf Ally", "{G}{U}", { power: "2", toughness: "2" });
const bigAlly = card("Test Big Ally", "Creature — Ogre Ally", "{B}{R}", { power: "3", toughness: "3" });
const rock = card("Test Rock", "Artifact", "{1}");
const dino = card("Test Dino", "Creature — Dinosaur", "{1}{G}", { power: "2", toughness: "2" });
const freeSpell = card("Test Pact", "Instant", "", { oracleText: "Draw a card." });
const zero = card("Test Zero", "Artifact", "{0}");
const twoUR = card("Test Izzet", "Instant", "{2}{U}{R}", { oracleText: "Draw a card." });

describe("Lane B round B106", () => {
  it("all fifteen cards are supported", () =>
    supported(leaves(), resistance(), legion(), cutShort(), gideon(), agonies(), fealty(), zameck(), combine(), departed(), hellion(), helix(), tazri(), kincaller(), killer()));

  it("Leaves from the Vine III: draws a card only if there's a creature or Lesson card in your graveyard", () => {
    for (const yard of [[], [instant], [lesson], [bear()]] as CardDef[][]) {
      let { s, ap } = setup([]);
      for (const d of yard) into(s, ap, d, "graveyard");
      const saga = putOnBattlefield(s, ap, leaves());
      s.objects[saga]!.counters.lore = 2;
      const hand = s.players[ap]!.hand.length;
      putCounters(s, s.objects[saga]!, "lore", 1);
      s = settle(s);
      const draws = yard.some((d) => d.name === "Test Lesson" || d.types.includes("Creature"));
      expect(s.players[ap]!.hand.length, yard.map((d) => d.name).join() || "empty").toBe(hand + (draws ? 1 : 0));
      // Sacrificed after its last chapter (CR 714.4).
      expect(zone(s, saga)).toBe("graveyard");
    }
  });

  it("Spirit of Resistance: prevents all damage to you only while you control a permanent of each color", () => {
    for (const colors of [["U", "B", "R", "G"], ["U", "B", "R"]]) {
      let { s, ap, ids } = setup([selfShock]);
      putOnBattlefield(s, ap, resistance());
      for (const c of colors) putOnBattlefield(s, ap, mote(c));
      const life = s.players[ap]!.life;
      s = settle(run(s, planCast(s, ap, ids[0]!, [player(ap)])));
      expect(s.players[ap]!.life, colors.join("")).toBe(colors.length === 4 ? life : life - 2);
    }
  });

  it("Kemba's Legion: can block an additional creature for each Equipment attached to it", () => {
    const { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, legion());
    expect(maxBlocks(s, s.objects[l]!)).toBe(1);
    attach(s, ap, sword, l);
    expect(maxBlocks(s, s.objects[l]!)).toBe(2);
    attach(s, ap, sword, l);
    expect(maxBlocks(s, s.objects[l]!)).toBe(3);
  });

  it("Cut Short: a planeswalker whose ability was activated this turn, or a tapped creature", () => {
    let { s, ap, opp, ids } = setup([cutShort()]);
    const w = putOnBattlefield(s, ap, walker);
    s.objects[w]!.counters.loyalty = 3;
    const untapped = putOnBattlefield(s, opp, bear());
    const tapped = putOnBattlefield(s, opp, bear());
    s.objects[tapped]!.tapped = true;
    expect(planCast(s, ap, ids[0]!, [tgt(w)])).toBeNull();
    expect(planCast(s, ap, ids[0]!, [tgt(untapped)])).toBeNull();
    expect(planCast(s, ap, ids[0]!, [tgt(tapped)])).not.toBeNull();
    s = settle(run(s, planActivate(s, ap, w, 0)));
    expect(s.objects[w]!.counters.loyalty).toBe(4);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(w)])));
    expect(zone(s, w)).toBe("graveyard");
  });

  it("Gideon, the Oathsworn: attacking with two or more non-Gideon creatures puts a +1/+1 counter on each of them", () => {
    for (const second of ["bear", "gideon", "none"] as const) {
      let { s, ap, opp } = setup([]);
      const g = putOnBattlefield(s, ap, gideon());
      s.objects[g]!.counters.loyalty = 4;
      const a = putOnBattlefield(s, ap, bear());
      const b = second === "bear" ? putOnBattlefield(s, ap, bear()) : second === "gideon" ? putOnBattlefield(s, ap, gideonCreature) : undefined;
      // A planeswalker creature with no loyalty would be put into its owner's graveyard (CR 704.5i).
      if (second === "gideon") s.objects[b!]!.counters.loyalty = 3;
      s = attackWith(s, ap, [a, ...(b ? [b] : [])].map((attacker) => ({ attacker, defender: opp })));
      s = settle(s);
      // A Gideon creature is a Gideon planeswalker, so with it only one non-Gideon creature attacked (rulings).
      expect(s.objects[a]!.counters["+1/+1"] ?? 0, second).toBe(second === "bear" ? 1 : 0);
      if (b) expect(s.objects[b]!.counters["+1/+1"] ?? 0, second).toBe(second === "bear" ? 1 : 0);
    }
  });

  it("Embodiment of Agonies: a +1/+1 counter for each different mana cost among nonland cards in your graveyard", () => {
    let { s, ap, ids } = setup([agonies()]);
    // {1}{G} twice: one cost. Fire // Ice's is {2}{U}{R}, the same as Test Izzet's (rulings). {0} counts; no mana cost
    // and a land don't.
    for (const d of [bear(), bear(), fireIce(), twoUR, zero, freeSpell, card("Forest", "Basic Land — Forest")]) into(s, ap, d, "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
    expect(ptOf(s, ids[0]!)).toBe("3/3");
  });

  it("Fealty to the Realm: you become the monarch, and the monarch controls the enchanted creature", () => {
    let { s, ap, opp, ids } = setup([fealty()]);
    const b = putOnBattlefield(s, opp, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(s.monarch).toBe(ap);
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    becomeMonarch(s, third);
    expect(controllerOf(s, s.objects[b]!)).toBe(third);
  });

  it("Zameck Guildmage: this turn, creatures you control enter with an additional +1/+1 counter, once for each activation", () => {
    let { s, ap, ids } = setup([bear(), bear()]);
    const z = putOnBattlefield(s, ap, zameck());
    Object.assign(s.players[ap]!.manaPool, { G: 4, U: 2 });
    s = settle(run(s, planActivate(s, ap, z, 0)));
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    s = settle(run(s, planActivate(s, ap, z, 0)));
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(2);
    // Over in the cleanup step (CR 514.2).
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(s.entersWithCountersThisTurn).toBeUndefined();
  });

  it("Combine Guildmage: an opponent's creature entering doesn't get the counter", () => {
    let { s, ap, opp, ids } = setup([bear()]);
    const c = putOnBattlefield(s, ap, combine());
    s = settle(run(s, planActivate(s, ap, c, 0)));
    expect(s.objects[c]!.tapped).toBe(true);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    const theirs = into(s, opp, bear(), "hand");
    s.players[opp]!.manaPool.G = 2;
    s.activePlayer = opp;
    s.priority = opp;
    s = settle(run(s, planCast(s, opp, theirs)));
    expect(zone(s, theirs)).toBe("battlefield");
    expect(s.objects[theirs]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Dearly Departed: while in your graveyard, Humans you control enter with an additional +1/+1 counter, one per Departed", () => {
    for (const n of [0, 1, 2]) {
      let { s, ap, opp, ids } = setup([human, bear()]);
      for (let i = 0; i < n; i++) into(s, ap, departed(), "graveyard");
      // An opponent's Dearly Departed is about their Humans, not yours.
      into(s, opp, departed(), "graveyard");
      s = settle(run(s, planCast(s, ap, ids[0]!)));
      s = settle(run(s, planCast(s, ap, ids[1]!)));
      expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0, `${n}`).toBe(n);
      expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
    }
    // On the battlefield it does nothing.
    let { s, ap, ids } = setup([human]);
    putOnBattlefield(s, ap, departed());
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Inferno Hellion: at the end step, if it attacked or blocked this turn, its owner shuffles it into their library", () => {
    for (const attacks of [true, false]) {
      let { s, ap, opp } = setup([]);
      trimHand(s, ap);
      const h = putOnBattlefield(s, ap, hellion());
      s = attacks ? attackWith(s, ap, [{ attacker: h, defender: opp }]) : passUntil(s, "main2", ap);
      s = passUntil(s, "end", ap);
      s = settle(s);
      expect(zone(s, h), String(attacks)).toBe(attacks ? "library" : "battlefield");
    }
  });

  it("Inferno Hellion: blocking counts too, at the attacking player's end step", () => {
    let { s, ap, opp } = setup([]);
    trimHand(s, ap);
    const h = putOnBattlefield(s, opp, hellion());
    const a = putOnBattlefield(s, ap, bear());
    s = attackWith(s, ap, [{ attacker: a, defender: opp }]);
    s = settle(s);
    s = passUntil(s, "declareBlockers");
    if (s.pending?.kind === "declareBlockers" && s.pending.player !== opp) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    for (let i = 0; i < 4 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: s.pending.player === opp ? [{ blocker: h, attacker: a }] : [] });
    expect(s.objects[h]!.blocking).toBeTruthy();
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(zone(s, h)).toBe("library");
    expect(s.players[opp]!.library).toContain(h);
  });

  it("Foundry Helix: 4 damage to any target, and 4 life if the sacrificed permanent was an artifact", () => {
    for (const sacArtifact of [true, false]) {
      let { s, ap, opp, ids } = setup([helix()]);
      const r = putOnBattlefield(s, ap, rock);
      const b = putOnBattlefield(s, ap, bear());
      const life = s.players[ap]!.life;
      const theirs = s.players[opp]!.life;
      s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, undefined, undefined, { sacrifice: [sacArtifact ? r : b] })));
      expect(zone(s, sacArtifact ? r : b)).toBe("graveyard");
      expect(s.players[opp]!.life).toBe(theirs - 4);
      expect(s.players[ap]!.life).toBe(life + (sacArtifact ? 4 : 0));
    }
  });

  it("General Tazri: Ally creatures you control get +X/+X, X the colors among them as it resolves", () => {
    let { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, tazri());
    const a = putOnBattlefield(s, ap, ally);
    const b = putOnBattlefield(s, ap, bear());
    // White, green and blue among the Allies; the green Bear isn't an Ally.
    s = settle(run(s, planActivate(s, ap, t, 0)));
    expect(ptOf(s, t)).toBe("6/7");
    expect(ptOf(s, a)).toBe("5/5");
    expect(ptOf(s, b)).toBe("2/2");
    // X doesn't change once it's resolved (rulings).
    putOnBattlefield(s, ap, bigAlly);
    expect(ptOf(s, a)).toBe("5/5");
  });

  it("Armored Kincaller: 3 life if you reveal a Dinosaur card or control another Dinosaur", () => {
    for (const how of ["reveal", "control", "neither", "decline"] as const) {
      let { s, ap, ids } = setup([kincaller(), ...(how === "reveal" || how === "decline" ? [dino] : [])]);
      if (how === "control") putOnBattlefield(s, ap, dino);
      const life = s.players[ap]!.life;
      s = settle(run(s, planCast(s, ap, ids[0]!)), { me: [ap] });
      if (how === "reveal" || how === "decline") {
        // Revealing is a choice of up to one Dinosaur card from your hand.
        expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, min: 0, max: 1 });
        s = settle(act(s, { type: "searchLibrary", player: ap, found: how === "reveal" ? [ids[1]!] : [] }));
      }
      expect(s.pending).toBeFalsy();
      expect(s.players[ap]!.life, how).toBe(life + (how === "reveal" || how === "control" ? 3 : 0));
    }
  });

  it("Skulking Killer: -2/-2 only if the target's controller controls no other creatures as it resolves", () => {
    for (const others of [0, 1]) {
      let { s, ap, opp, ids } = setup([killer()]);
      const victim = putOnBattlefield(s, opp, card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" }));
      for (let i = 0; i < others; i++) putOnBattlefield(s, opp, bear());
      s = settle(run(s, planCast(s, ap, ids[0]!)), { me: [ap] });
      expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
      s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(victim)] }));
      expect(ptOf(s, victim), String(others)).toBe(others ? "3/3" : "1/1");
    }
  });
});
