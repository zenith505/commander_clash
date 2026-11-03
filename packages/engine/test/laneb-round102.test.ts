// Lane B round B102: Feast of Worms, Aggression, Angel's Trumpet, Jabari's Influence, Noggin Whack, Pulse of the Dross,
// Blackmail, Thieving Sprite, Alaborn Zealot, Hellhole Rats, Liability, Landscaper Colos and Kazandu Stomper.

import { describe, expect, it } from "vitest";
import { legalTargets } from "../src/effects/targeting";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, controllerOf, defOf, invalidateCharacteristics, isFullySupported, planCast, power, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (pid: PlayerId): TargetChoice => ({ kind: "player", id: pid });
/** Moves a new card for `def` from the battlefield into `pid`'s `zone`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const nameOf = (s: GameState, id: string) => defOf(s, s.objects[id]!).name;
const worms = (): CardDef => ({"oracleId":"905889fb-a123-4f7a-afc6-b4c6ccac9105","name":"Feast of Worms","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Sorcery — Arcane","supertypes":[],"types":["Sorcery"],"subtypes":["Arcane"],"oracleText":"Destroy target land. If that land was legendary, its controller sacrifices another land of their choice.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/33119e6a-d69b-4039-add2-97fe35a89e8e.jpg?1783944290","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/33119e6a-d69b-4039-add2-97fe35a89e8e.jpg?1783944290","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const aggression = (): CardDef => ({"oracleId":"b6c38a2b-2fe8-4080-80ce-cfa12aaf57f0","name":"Aggression","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant non-Wall creature\nEnchanted creature has first strike and trample.\nAt the beginning of the end step of enchanted creature's controller, destroy that creature if it didn't attack this turn.","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/f/3/f3f26060-0c24-496c-b8e2-4dac7ea6166b.jpg?1783947493","artUrl":"https://cards.scryfall.io/art_crop/front/f/3/f3f26060-0c24-496c-b8e2-4dac7ea6166b.jpg?1783947493","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const trumpet = (): CardDef => ({"oracleId":"f187f766-3696-419e-9865-58023a46446b","name":"Angel's Trumpet","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"All creatures have vigilance.\nAt the beginning of each player's end step, tap all untapped creatures that player controls that didn't attack this turn. This artifact deals damage to the player equal to the number of creatures tapped this way.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c7b248a-3c74-4592-b357-47989568298c.jpg?1783946225","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c7b248a-3c74-4592-b357-47989568298c.jpg?1783946225","commanderLegal":"legal","set":"ulg","releasedAt":"1999-02-15","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const jabari = (): CardDef => ({"oracleId":"8930b1ce-80ac-48b6-a368-ccff9fd01d38","name":"Jabari's Influence","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only after combat.\nGain control of target nonartifact, nonblack creature that attacked you this turn and put a -1/-0 counter on it.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/9/c9f764d7-4c18-40ef-8373-ef1e2a88007e.jpg?1783947120","artUrl":"https://cards.scryfall.io/art_crop/front/c/9/c9f764d7-4c18-40ef-8373-ef1e2a88007e.jpg?1783947120","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const whack = (): CardDef => ({"oracleId":"c637fedc-b7b9-4da8-bab4-0488e7c1fac1","name":"Noggin Whack","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Kindred Sorcery — Rogue","supertypes":[],"types":["Kindred","Sorcery"],"subtypes":["Rogue"],"oracleText":"Prowl {1}{B} (You may cast this for its prowl cost if you dealt combat damage to a player this turn with a Rogue.)\nTarget player reveals three cards from their hand. You choose two of them. That player discards those cards.","colors":["B"],"colorIdentity":["B"],"keywords":["Prowl"],"imageUrl":"https://cards.scryfall.io/normal/front/9/3/932649ab-ed5e-405f-986f-855d8a7c8eb2.jpg?1783942791","artUrl":"https://cards.scryfall.io/art_crop/front/9/3/932649ab-ed5e-405f-986f-855d8a7c8eb2.jpg?1783942791","commanderLegal":"legal","set":"mor","releasedAt":"2008-02-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const pulse = (): CardDef => ({"oracleId":"95846070-7b35-4689-a56c-5b32b6264013","name":"Pulse of the Dross","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player reveals three cards from their hand and you choose one of them. That player discards that card. Then if that player has more cards in hand than you, return Pulse of the Dross to its owner's hand.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/b/bb8b1d0a-2c78-4173-b7ed-d7f3a0502fe7.jpg?1783944442","artUrl":"https://cards.scryfall.io/art_crop/front/b/b/bb8b1d0a-2c78-4173-b7ed-d7f3a0502fe7.jpg?1783944442","commanderLegal":"legal","set":"dst","releasedAt":"2004-02-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const blackmail = (): CardDef => ({"oracleId":"2dc6da5d-c4d1-4f2c-8f46-11a935bc0044","name":"Blackmail","manaCost":"{B}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player reveals three cards from their hand and you choose one of them. That player discards that card.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/b/9b40f6eb-e2a4-46d2-8822-b0f3dc508b73.jpg?1783945073","artUrl":"https://cards.scryfall.io/art_crop/front/9/b/9b40f6eb-e2a4-46d2-8822-b0f3dc508b73.jpg?1783945073","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const sprite = (): CardDef => ({"oracleId":"4c5b2be9-5d48-4e62-ae67-d61f3708bb4f","name":"Thieving Sprite","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Faerie Rogue","supertypes":[],"types":["Creature"],"subtypes":["Faerie","Rogue"],"oracleText":"Flying\nWhen this creature enters, target player reveals X cards from their hand, where X is the number of Faeries you control. You choose one of those cards. That player discards that card.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/9/b/9b5b51c3-60a8-45b2-9de0-605388091e8a.jpg?1783942881","artUrl":"https://cards.scryfall.io/art_crop/front/9/b/9b5b51c3-60a8-45b2-9de0-605388091e8a.jpg?1783942881","commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const zealot = (): CardDef => ({"oracleId":"0d0d97dd-2653-4d37-b475-ac3b50c5ee53","name":"Alaborn Zealot","manaCost":"{W}","cmc":1,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"When this creature blocks a creature, destroy both creatures.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/5/a5eba273-0b83-42a7-b8b0-9e0cd6a7aa6f.jpg?1783946495","artUrl":"https://cards.scryfall.io/art_crop/front/a/5/a5eba273-0b83-42a7-b8b0-9e0cd6a7aa6f.jpg?1783946495","commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const rats = (): CardDef => ({"oracleId":"7491e0bf-8335-44e4-8e05-b9a737a0f2e7","name":"Hellhole Rats","manaCost":"{2}{B}{R}","cmc":4,"typeLine":"Creature — Rat","supertypes":[],"types":["Creature"],"subtypes":["Rat"],"oracleText":"Haste\nWhen this creature enters, target player discards a card. This creature deals damage to that player equal to that card's mana value.","power":"2","toughness":"2","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/6/e/6e1eb937-21d4-44b1-85e7-b95995865f44.jpg?1783943401","artUrl":"https://cards.scryfall.io/art_crop/front/6/e/6e1eb937-21d4-44b1-85e7-b95995865f44.jpg?1783943401","commanderLegal":"legal","set":"dis","releasedAt":"2006-05-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const liability = (): CardDef => ({"oracleId":"65f1bebb-6441-4189-b6de-993ec9d24a59","name":"Liability","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a nontoken permanent is put into a player's graveyard from the battlefield, that player loses 1 life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0b07c66d-5f37-4098-b7e6-03e6c684806b.jpg?1783945950","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0b07c66d-5f37-4098-b7e6-03e6c684806b.jpg?1783945950","commanderLegal":"legal","set":"mmq","releasedAt":"1999-10-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const colos = (): CardDef => ({"oracleId":"144bef8b-3583-4e98-9285-a1965e7e17f8","name":"Landscaper Colos","manaCost":"{5}{W}","cmc":6,"typeLine":"Creature — Goat Beast","supertypes":[],"types":["Creature"],"subtypes":["Goat","Beast"],"oracleText":"When this creature enters, put target card from an opponent's graveyard on the bottom of their library.\nBasic landcycling {1}{W} ({1}{W}, Discard this card: Search your library for a basic land card, reveal it, put it into your hand, then shuffle.)","power":"4","toughness":"6","colors":["W"],"colorIdentity":["W"],"keywords":["Landcycling","Basic landcycling","Typecycling","Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f45a9e86-133e-4626-a239-73ef88d9ae12.jpg?1783926891","artUrl":"https://cards.scryfall.io/art_crop/front/f/4/f45a9e86-133e-4626-a239-73ef88d9ae12.jpg?1783926891","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const stomper = (): CardDef => ({"oracleId":"121f6c96-2911-4ee3-b14e-d3b143eb14c3","name":"Kazandu Stomper","manaCost":"{5}{G}","cmc":6,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nWhen this creature enters, return up to two lands you control to their owner's hand.","power":"6","toughness":"5","colors":["G"],"colorIdentity":["G"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/a/f/afdfe5aa-8b15-4a89-a22a-03baf6afa4e7.jpg?1783929338","artUrl":"https://cards.scryfall.io/art_crop/front/a/f/afdfe5aa-8b15-4a89-a22a-03baf6afa4e7.jpg?1783929338","commanderLegal":"legal","set":"znr","releasedAt":"2020-09-25","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const legendLand = card("Test Legendary Ruins", "Legendary Land", "", { oracleText: "{T}: Add {C}." });
const toughLegend = card("Test Indestructible Ruins", "Legendary Land", "", { oracleText: "Indestructible\n{T}: Add {C}.", keywords: ["Indestructible"] });
const wastes = card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });
const faerie = card("Test Pixie", "Creature — Faerie", "{U}", { power: "1", toughness: "1", colors: ["U"] });
const three = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3", colors: ["R"] });
const kill = card("Test Kill", "Instant", "{0}", { oracleText: "Destroy target permanent." });

describe("Lane B round B102", () => {
  it("all thirteen cards are supported", () => supported(worms(), aggression(), trumpet(), jabari(), whack(), pulse(), blackmail(), sprite(), zealot(), rats(), liability(), colos(), stomper()));

  it("Feast of Worms: a legendary land destroyed makes its controller sacrifice another land; a nonlegendary one doesn't", () => {
    for (const legendary of [true, false]) {
      let { s, ap, opp, ids } = setup([worms()]);
      const land = putOnBattlefield(s, opp, legendary ? legendLand : wastes);
      const other = putOnBattlefield(s, opp, wastes);
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(land)], undefined, "auto")));
      expect(zone(s, land)).toBe("graveyard");
      expect(zone(s, other)).toBe(legendary ? "graveyard" : "battlefield");
    }
  });

  it("Feast of Worms: an indestructible legendary land survives and another land is sacrificed, not it", () => {
    let { s, ap, opp, ids } = setup([worms()]);
    const land = putOnBattlefield(s, opp, toughLegend);
    const other = putOnBattlefield(s, opp, wastes);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(land)], undefined, "auto")));
    expect(zone(s, land)).toBe("battlefield");
    expect(zone(s, other)).toBe("graveyard");
    // With no other land, nothing is sacrificed.
    let t = setup([worms()]);
    const lone = putOnBattlefield(t.s, t.opp, toughLegend);
    t.s = settle(run(t.s, planCast(t.s, t.ap, t.ids[0]!, [tgt(lone)], undefined, "auto")));
    expect(zone(t.s, lone)).toBe("battlefield");
  });

  it("Aggression: at the end step of the enchanted creature's controller, it's destroyed unless it attacked this turn", () => {
    for (const attacked of [false, true]) {
      let { s, ap, opp } = setup([]);
      s.players[ap]!.hand = [];
      const b = putOnBattlefield(s, ap, bear());
      const a = putOnBattlefield(s, opp, aggression());
      s.objects[a]!.attachedTo = b;
      invalidateCharacteristics(s);
      expect(defOf(s, s.objects[b]!).name).toBe("Grizzly Bears");
      if (attacked) {
        s = passUntil(s, "declareAttackers", ap);
        s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
      }
      s = passUntil(s, "end", ap);
      s = settle(s);
      expect(zone(s, b)).toBe(attacked ? "battlefield" : "graveyard");
    }
  });

  it("Aggression: the creature it enchanted as the ability triggered, even if the Aura moves before it resolves (rulings)", () => {
    let { s, ap, opp } = setup([]);
    s.players[ap]!.hand = [];
    const b = putOnBattlefield(s, ap, bear());
    const c = putOnBattlefield(s, ap, bear({ name: "Test Other Bear" }));
    const a = putOnBattlefield(s, opp, aggression());
    s.objects[a]!.attachedTo = b;
    invalidateCharacteristics(s);
    s = passUntil(s, "end", ap);
    for (let i = 0; i < 10 && !s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.length).toBe(1);
    s.objects[a]!.attachedTo = c;
    invalidateCharacteristics(s);
    s = settle(s);
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, c)).toBe("battlefield");
  });

  it("Angel's Trumpet: each player's end step taps their untapped creatures that didn't attack and deals that much damage", () => {
    let { s, ap, opp } = setup([]);
    s.players[ap]!.hand = [];
    putOnBattlefield(s, opp, trumpet());
    const attacker = putOnBattlefield(s, ap, bear());
    const idle = putOnBattlefield(s, ap, bear());
    const idle2 = putOnBattlefield(s, ap, three);
    const tapped = putOnBattlefield(s, ap, bear());
    s.objects[tapped]!.tapped = true;
    const theirs = putOnBattlefield(s, opp, bear());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
    // All creatures have vigilance: the attacker stays untapped.
    expect(s.objects[attacker]!.tapped).toBe(false);
    s = passUntil(s, "end", ap);
    const life = s.players[ap]!.life;
    s = settle(s);
    expect(s.objects[idle]!.tapped).toBe(true);
    expect(s.objects[idle2]!.tapped).toBe(true);
    expect(s.objects[attacker]!.tapped).toBe(false);
    // Only the active player's creatures, and only those it tapped count.
    expect(s.objects[theirs]!.tapped).toBe(false);
    expect(s.players[ap]!.life).toBe(life - 2);
  });

  it("Jabari's Influence: after combat, gain control of a nonblack creature that attacked you and put a -1/-0 counter on it", () => {
    let { s, ap, opp, ids } = setup([jabari()]);
    const attacker = putOnBattlefield(s, opp, three);
    const stayed = putOnBattlefield(s, opp, bear());
    s = passUntil(s, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker, defender: ap }] });
    const spec = compileCard(jabari()).spell!.targets[0]!;
    // Not before combat is over (Cast this spell only after combat).
    expect(planCast(s, ap, ids[0]!, [tgt(attacker)], undefined, "auto")).toBeNull();
    s = passUntil(s, "main2", opp);
    const legal = legalTargets(s, spec, ap).map((t) => t.id);
    expect(legal).toContain(attacker);
    expect(legal).not.toContain(stayed);
    s.priority = ap;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(attacker)], undefined, "auto")));
    expect(s.objects[attacker]!.counters["-1/-0"]).toBe(1);
    expect(power(s, s.objects[attacker]!)).toBe(2);
    expect(s.battlefield.includes(attacker)).toBe(true);
    expect(controllerOf(s, s.objects[attacker]!)).toBe(ap);
  });
  it("Noggin Whack: the target player reveals three cards of their choice, you choose two, they discard those", () => {
    let { s, ap, opp, ids } = setup([whack()]);
    s.players[opp]!.hand = [];
    const hand = [1, 2, 3, 4, 5].map((i) => into(s, opp, bear({ name: `Test Card ${i}` }), "hand"));
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, "auto")), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 2, max: 2 });
    const shown = (s.pending as { cards: string[] }).cards;
    expect(shown.length).toBe(3);
    expect(shown.every((id) => hand.includes(id))).toBe(true);
    const picked = shown.slice(0, 2);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: picked }));
    expect(picked.every((id) => zone(s, id) === "graveyard")).toBe(true);
    expect(s.players[opp]!.hand.length).toBe(3);
  });

  it("Noggin Whack: with fewer than three cards they reveal all of them, you choose all, all are discarded (rulings)", () => {
    let { s, ap, opp, ids } = setup([whack()]);
    s.players[opp]!.hand = [];
    const hand = [1, 2].map((i) => into(s, opp, bear({ name: `Test Card ${i}` }), "hand"));
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, "auto")), { me: [ap] });
    // They had no choice to make; you choose both.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 2, max: 2 });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([...hand].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: hand }));
    expect(hand.every((id) => zone(s, id) === "graveyard")).toBe(true);
  });

  it("Blackmail: three cards revealed of their choice, you choose one to discard", () => {
    let { s, ap, opp, ids } = setup([blackmail()]);
    s.players[opp]!.hand = [];
    [1, 2, 3, 4].map((i) => into(s, opp, bear({ name: `Test Card ${i}` }), "hand"));
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, "auto")), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    const shown = (s.pending as { cards: string[] }).cards;
    expect(shown.length).toBe(3);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [shown[2]!] }));
    expect(zone(s, shown[2]!)).toBe("graveyard");
    expect(s.players[opp]!.hand.length).toBe(3);
  });

  it("Pulse of the Dross: one of three discarded; then it returns to your hand only if that player has more cards in hand than you", () => {
    for (const more of [true, false]) {
      let { s, ap, opp, ids } = setup([pulse()]);
      s.players[ap]!.hand = [ids[0]!];
      s.players[opp]!.hand = [];
      [1, 2, 3, 4].map((i) => into(s, opp, bear({ name: `Test Card ${i}` }), "hand"));
      // You have no other cards: they have 3 left after the discard. With 3 cards of yours, not more.
      if (!more) [1, 2, 3].map((i) => into(s, ap, bear({ name: `Test Mine ${i}` }), "hand"));
      s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)], undefined, "auto")), { me: [ap] });
      const shown = (s.pending as { cards: string[] }).cards;
      s = settle(act(s, { type: "searchLibrary", player: ap, found: [shown[0]!] }));
      expect(zone(s, shown[0]!)).toBe("graveyard");
      expect(zone(s, ids[0]!)).toBe(more ? "hand" : "graveyard");
    }
  });

  it("Thieving Sprite: the target player reveals X cards, X the number of Faeries you control, you choose one to discard", () => {
    let { s, ap, opp, ids } = setup([sprite()]);
    putOnBattlefield(s, ap, faerie);
    s.players[opp]!.hand = [];
    [1, 2, 3, 4].map((i) => into(s, opp, bear({ name: `Test Card ${i}` }), "hand"));
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto"));
    s = settle(s, { me: [ap] });
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] }), { me: [ap] });
    // The Sprite and the Pixie: two Faeries, two cards revealed.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    const shown = (s.pending as { cards: string[] }).cards;
    expect(shown.length).toBe(2);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [shown[0]!] }));
    expect(zone(s, shown[0]!)).toBe("graveyard");
    expect(s.players[opp]!.hand.length).toBe(3);
  });

  it("Alaborn Zealot: when it blocks a creature, both are destroyed", () => {
    let { s, ap, opp } = setup([]);
    s.players[ap]!.hand = [];
    const attacker = putOnBattlefield(s, ap, three);
    const z = putOnBattlefield(s, opp, zealot());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: z, attacker }] });
    s = settle(s);
    expect(zone(s, attacker)).toBe("graveyard");
    expect(zone(s, z)).toBe("graveyard");
  });

  it("Hellhole Rats: target player discards a card and is dealt damage equal to its mana value", () => {
    let { s, ap, opp, ids } = setup([rats()]);
    s.players[opp]!.hand = [];
    const c = into(s, opp, card("Test Five Drop", "Sorcery", "{3}{B}{B}", { cmc: 5 }), "hand");
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto"));
    s = settle(s, { me: [ap] });
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] }), { me: [ap] });
    expect(zone(s, c)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 5);
  });

  it("Liability: a nontoken permanent put into a graveyard from the battlefield makes its owner lose 1 life; a token doesn't", () => {
    let { s, ap, opp, ids } = setup([kill, kill]);
    putOnBattlefield(s, ap, liability());
    const b = putOnBattlefield(s, opp, bear());
    // A permanent the active player controls but the opponent owns: its owner loses the life.
    const borrowed = putOnBattlefield(s, opp, bear({ name: "Test Borrowed Bear" }));
    s.objects[borrowed]!.controller = ap;
    invalidateCharacteristics(s);
    const life = s.players[opp]!.life;
    const mine = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)], undefined, "auto")));
    expect(s.players[opp]!.life).toBe(life - 1);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(borrowed)], undefined, "auto")));
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.players[ap]!.life).toBe(mine);
    const tok = putOnBattlefield(s, opp, bear({ name: "Test Token Bear" }));
    s.objects[tok]!.isToken = true;
    const k = into(s, ap, kill, "hand");
    s = settle(run(s, planCast(s, ap, k, [tgt(tok)], undefined, "auto")));
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("Landscaper Colos: target card from an opponent's graveyard goes to the bottom of their library", () => {
    let { s, ap, opp, ids } = setup([colos()]);
    const g = into(s, opp, bear({ name: "Test Dead Bear" }), "graveyard");
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto"));
    s = settle(s, { me: [ap] });
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(g)] }), { me: [ap] });
    expect(zone(s, g)).toBe("library");
    expect(s.players[opp]!.library.at(-1)).toBe(g);
  });

  it("Kazandu Stomper: return up to two lands you control to their owner's hand, none too", () => {
    for (const n of [2, 0]) {
      let { s, ap, ids } = setup([stomper()]);
      s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto"));
      s = settle(s, { me: [ap] });
      expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, min: 0, count: 2, action: "bounce" });
      const lands = (s.pending as { options: string[] }).options.slice(0, n);
      const hand = s.players[ap]!.hand.length;
      s = settle(act(s, { type: "pickPermanents", player: ap, ids: lands }));
      expect(lands.every((id) => zone(s, id) === "hand")).toBe(true);
      expect(s.players[ap]!.hand.length).toBe(hand + n);
    }
  });
});
