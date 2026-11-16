// Lane B round B228: Rayami, First of the Fallen (nontoken creatures that would die are exiled with a blood counter, and
// Rayami has the listed keywords of exiled creature cards with blood counters), Escaped Shapeshifter (keywords read from
// opponents' creatures in layer 6, with its dependency, CR 613.8a), Giant Oyster (a "for as long as ~ remains tapped"
// delayed trigger at each of your draw steps, and counters removed as it untaps or leaves) and Advancing the Spirit ({0}
// rather than the power-up cost of your first power-up ability each of your turns).

import { describe, expect, it } from "vitest";
import { act, activate, addEffect, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, activationCost, botActions, characteristics, defOf, destroyPermanent, invalidateCharacteristics, isFullySupported, moveObject, objHasKeyword, planActivate, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const rayami = (): CardDef => ({"oracleId":"f196ae91-be5c-461b-a69f-aecb538923b4","name":"Rayami, First of the Fallen","manaCost":"{1}{B}{G}{U}","cmc":4,"typeLine":"Legendary Creature — Vampire","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire"],"oracleText":"If a nontoken creature would die, exile that card with a blood counter on it instead.\nAs long as an exiled creature card with a blood counter on it has flying, Rayami has flying. The same is true for first strike, double strike, deathtouch, haste, hexproof, indestructible, lifelink, menace, protection, reach, trample, and vigilance.","power":"5","toughness":"4","colors":["B","G","U"],"colorIdentity":["B","G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/6997ad62-f34c-4490-aee4-6d5c08e14709.jpg?1783932797","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/6997ad62-f34c-4490-aee4-6d5c08e14709.jpg?1783932797","commanderLegal":"legal","set":"c19","releasedAt":"2019-08-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const escaped = (): CardDef => ({"oracleId":"17f2342b-4dd8-445a-a7c1-4a15a5688294","name":"Escaped Shapeshifter","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"As long as an opponent controls a creature with flying not named Escaped Shapeshifter, this creature has flying. The same is true for first strike, trample, and protection from any color.","power":"3","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/0/e0171d4f-c871-4a7f-821a-82b7f401e9ca.jpg?1783946656","artUrl":"https://cards.scryfall.io/art_crop/front/e/0/e0171d4f-c871-4a7f-821a-82b7f401e9ca.jpg?1783946656","commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const oyster = (): CardDef => ({"oracleId":"062b4d84-5ba3-417b-b8e1-65afce7b05e3","name":"Giant Oyster","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Creature — Oyster","supertypes":[],"types":["Creature"],"subtypes":["Oyster"],"oracleText":"You may choose not to untap this creature during your untap step.\n{T}: For as long as this creature remains tapped, target tapped creature doesn't untap during its controller's untap step, and at the beginning of each of your draw steps, put a -1/-1 counter on that creature. When this creature leaves the battlefield or becomes untapped, remove all -1/-1 counters from the creature.","power":"0","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/8/f8045d23-e6e6-474c-a3e7-ddfc6121657a.jpg?1783947297","artUrl":"https://cards.scryfall.io/art_crop/front/f/8/f8045d23-e6e6-474c-a3e7-ddfc6121657a.jpg?1783947297","commanderLegal":"legal","set":"hml","releasedAt":"1995-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const advancing = (): CardDef => ({"oracleId":"c9949a5a-13d4-41ca-80fe-902b0ae71204","name":"Advancing the Spirit","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, draw a card.\nYou may pay {0} rather than pay the power-up cost of the first power-up ability you activate during each of your turns.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/5/85d0495c-cca0-4aeb-a03e-2bc102b3c556.jpg?1783903042","artUrl":"https://cards.scryfall.io/art_crop/front/8/5/85d0495c-cca0-4aeb-a03e-2bc102b3c556.jpg?1783903042","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const specialist = (): CardDef => ({"oracleId":"556f127f-6131-4171-b1ed-11420c21d345","name":"Serpent Specialist","manaCost":"{G}","cmc":1,"typeLine":"Creature — Human Snake Villain","supertypes":[],"types":["Creature"],"subtypes":["Human","Snake","Villain"],"oracleText":"Deathtouch\nPower-up — {3}{G}: Put two +1/+1 counters on this creature. (Activate each power-up ability only once. Reduce the cost by its mana cost if it entered this turn.)","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":["Power-up","Deathtouch"],"imageUrl":"https://cards.scryfall.io/normal/front/7/2/72727c2a-08a9-47bc-a5eb-cda52e21684b.jpg?1783902912","artUrl":"https://cards.scryfall.io/art_crop/front/7/2/72727c2a-08a9-47bc-a5eb-cda52e21684b.jpg?1783902912","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const stature = (): CardDef => ({"oracleId":"bd49a05c-ed51-4d69-ab9b-11192442ec17","name":"Stature, Size Shifter","manaCost":"{U}","cmc":1,"typeLine":"Legendary Creature — Human Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Hero"],"oracleText":"Stature can't be blocked if her power is 1 or less.\nPower-up — {X}{U}{U}: Put X +1/+1 counters on Stature. (Activate each power-up ability only once. Reduce the cost by her mana cost if she entered this turn.)","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Power-up"],"imageUrl":"https://cards.scryfall.io/normal/front/f/e/fe692959-64ca-4065-9f9e-1abe590e3d0f.jpg?1783902951","artUrl":"https://cards.scryfall.io/art_crop/front/f/e/fe692959-64ca-4065-9f9e-1abe590e3d0f.jpg?1783902951","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const whiteKnight = (): CardDef => ({"oracleId":"ddb021df-ae4a-4ac1-8353-d0b375761714","name":"White Knight","manaCost":"{W}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything black.)","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["First strike","Protection"],"imageUrl":"https://cards.scryfall.io/normal/front/4/0/401c4880-5598-44e6-a54b-6ea18e542a72.jpg?1783942396","artUrl":"https://cards.scryfall.io/art_crop/front/4/0/401c4880-5598-44e6-a54b-6ea18e542a72.jpg?1783942396","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const knightOfGrace = (): CardDef => ({"oracleId":"7b51a979-47e0-4b98-8ec5-8064c83422e1","name":"Knight of Grace","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nHexproof from black (This creature can't be the target of black spells or abilities your opponents control.)\nThis creature gets +1/+0 as long as any player controls a black permanent.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Hexproof from","Hexproof","First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/7/b/7bbbddc0-f8b3-4255-bd82-d50f829ca009.jpg?1783935041","artUrl":"https://cards.scryfall.io/art_crop/front/7/b/7bbbddc0-f8b3-4255-bd82-d50f829ca009.jpg?1783935041","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const jump = (): CardDef => ({"oracleId":"f7518456-45ed-41d4-bd3c-5aacea28eb35","name":"Jump","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gains flying until end of turn.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2edd7be9-9334-4684-b642-1aaf2000e054.jpg?1783942391","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2edd7be9-9334-4684-b642-1aaf2000e054.jpg?1783942391","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const paladin_ = (): CardDef => ({"oracleId":"fd8722e1-9c41-4037-ab7e-47e2aa9858a0","name":"Paladin en-Vec","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike, protection from black and from red (This creature deals combat damage before creatures without first strike. It can't be blocked, targeted, dealt damage, or enchanted by anything black or red.)","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["First strike","Protection"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/aea1a8e1-35f4-4b4a-aa68-21b5219527a9.jpg?1783943075","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/aea1a8e1-35f4-4b4a-aa68-21b5219527a9.jpg?1783943075","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const cairn = (): CardDef => ({"oracleId":"a549d54f-2640-455c-8a93-bef4df2f9e8b","name":"Cairn Wanderer","manaCost":"{4}{B}","cmc":5,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)\nAs long as a creature card with flying is in a graveyard, this creature has flying. The same is true for fear, first strike, double strike, deathtouch, haste, landwalk, lifelink, protection, reach, trample, shroud, and vigilance.","power":"4","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Changeling"],"imageUrl":"https://cards.scryfall.io/normal/front/b/8/b870a7aa-0836-4e3e-8be9-3299bdaded81.jpg?1783942893","artUrl":"https://cards.scryfall.io/art_crop/front/b/8/b870a7aa-0836-4e3e-8be9-3299bdaded81.jpg?1783942893","commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const loki_ = (): CardDef => ({"oracleId":"9c78778a-6335-4949-8ade-11d0f085cb2b","name":"Loki Laufeyson","manaCost":"{1}{R}","cmc":2,"typeLine":"Legendary Creature — God Sorcerer Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["God","Sorcerer","Villain"],"oracleText":"{1}, {T}: When you next cast an instant or sorcery spell with mana value less than or equal to Loki's power this turn, copy that spell. You may choose new targets for the copy.\nPower-up — {4}{R}: Put two +1/+1 counters on Loki. (Activate each power-up ability only once. Reduce the cost by his mana cost if he entered this turn.)","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Power-up"],"imageUrl":"https://cards.scryfall.io/normal/front/5/3/53b795a7-11f8-423a-b021-f811007fc82f.jpg?1783902928","artUrl":"https://cards.scryfall.io/art_crop/front/5/3/53b795a7-11f8-423a-b021-f811007fc82f.jpg?1783902928","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** Resolves the stack and answers any question the way a bot would. */
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = act(s, s.pending ? botActions(s, pid)[0]! : { type: "passPriority", player: pid });
  }
  return s;
};
const has = (s: GameState, id: string, k: string) => characteristics(s, s.objects[id]!).keywords.includes(k);
const costOf = (s: GameState, pid: PlayerId, id: string, index: number) => {
  const o = s.objects[id]!;
  return activationCost(s, pid, o, abilitiesOf(s, o).activated[index]!).symbols.map((y) => (y.kind === "generic" ? `{${y.amount}}` : y.kind === "colored" ? `{${y.color}}` : `{${y.kind}}`)).join("");
};
const powerUpIndex = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.keyword === "Power-up");

describe("Lane B round B228", () => {
  it("compiles all four cards", () => {
    supported(rayami(), escaped(), oyster(), advancing());
  });

  describe("Rayami, First of the Fallen", () => {
    it("any player's nontoken creature that would die is exiled with a blood counter on it; a token dies as usual", () => {
      const { s, ap, opp } = setup([]);
      putOnBattlefield(s, ap, rayami());
      const theirs = putOnBattlefield(s, opp, bear());
      const mine = putOnBattlefield(s, ap, bear());
      const tok = putOnBattlefield(s, opp, bear());
      s.objects[tok]!.isToken = true;
      for (const id of [theirs, mine, tok]) destroyPermanent(s, s.objects[id]!, "test");
      expect(s.objects[theirs]!.zone).toBe("exile");
      expect(s.objects[mine]!.zone).toBe("exile");
      expect(s.objects[theirs]!.counters.blood).toBe(1);
      expect(s.objects[mine]!.counters.blood).toBe(1);
      expect(s.players[opp]!.exile).toContain(theirs);
      // Only the token reached a graveyard.
      expect(s.diedThisTurn).toEqual([opp]);
    });

    it("has flying and vigilance while an exiled creature card with a blood counter has them, not from one exiled otherwise", () => {
      const { s, ap, opp } = setup([]);
      const r = putOnBattlefield(s, ap, rayami());
      const angel = putOnBattlefield(s, opp, serra());
      expect(has(s, r, "Flying")).toBe(false);
      // Exiled some other way, with no blood counter: nothing.
      const other = putOnBattlefield(s, opp, serra());
      moveObject(s, other, "exile");
      invalidateCharacteristics(s);
      expect(has(s, r, "Flying")).toBe(false);
      destroyPermanent(s, s.objects[angel]!, "test");
      invalidateCharacteristics(s);
      expect(s.objects[angel]!.counters.blood).toBe(1);
      expect(has(s, r, "Flying")).toBe(true);
      expect(has(s, r, "Vigilance")).toBe(true);
      // Rulings: any exiled creature card with a blood counter, however it got there.
      s.objects[other]!.counters.blood = 1;
      s.objects[angel]!.counters.blood = 0;
      invalidateCharacteristics(s);
      expect(has(s, r, "Flying")).toBe(true);
      s.objects[other]!.counters.blood = 0;
      invalidateCharacteristics(s);
      expect(has(s, r, "Flying")).toBe(false);
    });

    it("gets protection and hexproof variants as those variants (rulings)", () => {
      const { s, ap, opp } = setup([]);
      const r = putOnBattlefield(s, ap, rayami());
      const paladin = putOnBattlefield(s, opp, paladin_());
      const knight = putOnBattlefield(s, opp, knightOfGrace());
      destroyPermanent(s, s.objects[paladin]!, "test");
      destroyPermanent(s, s.objects[knight]!, "test");
      invalidateCharacteristics(s);
      const kws = characteristics(s, s.objects[r]!).keywords;
      expect(kws).toEqual(expect.arrayContaining(["First strike", "Protection from black", "Protection from red", "Hexproof from black"]));
      expect(kws).not.toContain("Hexproof");
    });

    it("doesn't get a keyword the exiled card has only under a condition (rulings)", () => {
      const { s, ap, opp } = setup([]);
      const r = putOnBattlefield(s, ap, rayami());
      const wanderer = putOnBattlefield(s, opp, cairn());
      // A creature card with flying in a graveyard (put there by hand: dying, Rayami would exile it): Cairn Wanderer itself
      // has flying on the battlefield.
      const angel = putOnBattlefield(s, opp, serra());
      s.battlefield.splice(s.battlefield.indexOf(angel), 1);
      s.objects[angel]!.zone = "graveyard";
      s.players[opp]!.graveyard.push(angel);
      invalidateCharacteristics(s);
      expect(objHasKeyword(s, s.objects[wanderer]!, "Flying")).toBe(true);
      destroyPermanent(s, s.objects[wanderer]!, "test");
      invalidateCharacteristics(s);
      expect(s.objects[wanderer]!.zone).toBe("exile");
      expect(has(s, r, "Flying")).toBe(false);
    });

    it("a Rayami dying exiles itself, and creatures dying with it are exiled too (rulings)", () => {
      const { s, ap, opp } = setup([]);
      const r = putOnBattlefield(s, ap, rayami());
      const theirs = putOnBattlefield(s, opp, bear());
      s.objects[r]!.damage = 5;
      s.objects[theirs]!.damage = 5;
      const after = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
      expect(after.objects[r]!.zone).toBe("exile");
      expect(after.objects[theirs]!.zone).toBe("exile");
      expect(after.objects[theirs]!.counters.blood).toBe(1);
    });
  });

  describe("Escaped Shapeshifter", () => {
    it("has flying while an opponent controls a creature with flying, not for its controller's own flier", () => {
      const { s, ap, opp } = setup([]);
      const e = putOnBattlefield(s, ap, escaped());
      putOnBattlefield(s, ap, serra());
      expect(has(s, e, "Flying")).toBe(false);
      putOnBattlefield(s, opp, serra());
      invalidateCharacteristics(s);
      expect(has(s, e, "Flying")).toBe(true);
      // Only the listed ones: not vigilance.
      expect(has(s, e, "Vigilance")).toBe(false);
    });

    it("has first strike and protection from each color an opponent's creature has protection from", () => {
      const { s, ap, opp } = setup([]);
      const e = putOnBattlefield(s, ap, escaped());
      putOnBattlefield(s, opp, paladin_());
      invalidateCharacteristics(s);
      const kws = characteristics(s, s.objects[e]!).keywords;
      expect(kws).toEqual(expect.arrayContaining(["First strike", "Protection from black", "Protection from red"]));
      expect(kws).not.toContain("Protection from white");
      expect(kws).not.toContain("Trample");
    });

    it("sees flying another effect gives an opponent's creature later (it depends on that effect, CR 613.8a)", () => {
      const { s, ap, opp } = setup([]);
      const e = putOnBattlefield(s, ap, escaped());
      const b = putOnBattlefield(s, opp, bear());
      expect(has(s, e, "Flying")).toBe(false);
      addEffect(s, opp, [b], [{ kind: "addKeywords", keywords: ["Flying"] }]);
      expect(has(s, b, "Flying")).toBe(true);
      expect(has(s, e, "Flying")).toBe(true);
    });

    it("an opponent's creature named Escaped Shapeshifter doesn't count", () => {
      const { s, ap, opp } = setup([]);
      const e = putOnBattlefield(s, ap, escaped());
      const theirs = putOnBattlefield(s, opp, escaped());
      // Theirs gets flying from my flier; mine doesn't get it back from theirs.
      putOnBattlefield(s, ap, serra());
      invalidateCharacteristics(s);
      expect(has(s, theirs, "Flying")).toBe(true);
      expect(has(s, e, "Flying")).toBe(false);
    });
  });

  describe("Giant Oyster", () => {
    /** To `pid`'s untap step, keeping `keep` tapped if asked ("You may choose not to untap ~"). */
    const toUntap = (s: GameState, pid: PlayerId, keep: string[]) => {
      s = passUntil(s, "end");
      for (let i = 0; i < 400; i++) {
        const pend = s.pending;
        if (pend?.kind === "pickPermanents" && pend.action === "keepTapped") return act(s, { type: "pickPermanents", player: pend.player, ids: keep.filter((id) => pend.options.includes(id)) });
        if (s.activePlayer === pid && s.step === "upkeep") return s;
        const w = waitingOn(s)!;
        s = pend ? act(s, botActions(s, w)[0]!) : act(s, { type: "passPriority", player: w });
      }
      throw new Error("never reached the untap step");
    };

    it("keeps the tapped target tapped and puts a -1/-1 counter on it at each of your draw steps while it stays tapped", () => {
      let { s, ap, opp } = setup([]);
      const oy = putOnBattlefield(s, ap, oyster());
      const big = putOnBattlefield(s, opp, serra());
      // Only a tapped creature can be targeted (rulings).
      expect(planActivate(s, ap, oy, 0, [target(big)])).toBeNull();
      s.objects[big]!.tapped = true;
      s = settle(activate(s, ap, oy, 0, [target(big)]));
      expect(s.objects[oy]!.tapped).toBe(true);
      // Its controller's untap step: it stays tapped.
      s = passUntil(s, "main1", opp);
      expect(s.objects[big]!.tapped).toBe(true);
      // My next turn: the Oyster kept tapped, my draw step puts a counter on it.
      s = toUntap(s, ap, [oy]);
      s = settle(passUntil(s, "main1", ap));
      expect(s.objects[oy]!.tapped).toBe(true);
      expect(s.objects[big]!.counters["-1/-1"]).toBe(1);
      s = toUntap(s, ap, [oy]);
      s = settle(passUntil(s, "main1", ap));
      expect(s.objects[big]!.counters["-1/-1"]).toBe(2);
      expect(s.objects[big]!.tapped).toBe(true);
      // Untapped: all the -1/-1 counters come off, and no more come.
      s = toUntap(s, ap, []);
      s = settle(passUntil(s, "main1", ap));
      expect(s.objects[oy]!.tapped).toBe(false);
      expect(s.objects[big]!.counters["-1/-1"] ?? 0).toBe(0);
      s = toUntap(s, ap, [oy]);
      s = settle(passUntil(s, "main1", ap));
      expect(s.objects[big]!.counters["-1/-1"] ?? 0).toBe(0);
      expect(s.floatingTriggers ?? []).toEqual([]);
    });

    it("leaving the battlefield removes the counters too", () => {
      let { s, ap, opp } = setup([]);
      const oy = putOnBattlefield(s, ap, oyster());
      const big = putOnBattlefield(s, opp, serra());
      s.objects[big]!.tapped = true;
      s = settle(activate(s, ap, oy, 0, [target(big)]));
      s = toUntap(s, ap, [oy]);
      s = settle(passUntil(s, "main1", ap));
      expect(s.objects[big]!.counters["-1/-1"]).toBe(1);
      destroyPermanent(s, s.objects[oy]!, "test");
      s = settle(s);
      expect(s.objects[big]!.counters["-1/-1"] ?? 0).toBe(0);
    });

    it("untapped again before it resolves: the ability does nothing but wait to remove counters", () => {
      let { s, ap, opp } = setup([]);
      const oy = putOnBattlefield(s, ap, oyster());
      const big = putOnBattlefield(s, opp, serra());
      s.objects[big]!.tapped = true;
      for (const a of planActivate(s, ap, oy, 0, [target(big)])!) s = act(s, a);
      s.objects[oy]!.tapped = false;
      s.objects[oy]!.untaps = (s.objects[oy]!.untaps ?? 0) + 1;
      s = settle(s);
      expect(s.effects.some((e) => e.affected.includes(big))).toBe(false);
      expect(s.floatingTriggers ?? []).toEqual([]);
    });
  });

  describe("Advancing the Spirit", () => {
    it("the first power-up ability you activate during your turn costs {0}; the next costs its own", () => {
      let { s, ap } = setup([]);
      putOnBattlefield(s, ap, advancing());
      const spec = putOnBattlefield(s, ap, specialist());
      const loki = putOnBattlefield(s, ap, loki_());
      expect(costOf(s, ap, spec, powerUpIndex(s, spec))).toBe("{0}");
      expect(costOf(s, ap, loki, powerUpIndex(s, loki))).toBe("{0}");
      const lands = s.battlefield.filter((id) => s.objects[id]!.tapped).length;
      s = settle(activate(s, ap, spec, powerUpIndex(s, spec)));
      expect(s.objects[spec]!.counters["+1/+1"]).toBe(2);
      // Nothing was tapped to pay for it.
      expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length).toBe(lands);
      expect(costOf(s, ap, loki, powerUpIndex(s, loki))).toBe("{4}{R}");
    });

    it("not during another player's turn, nor without it", () => {
      const { s, ap, opp } = setup([]);
      const spec = putOnBattlefield(s, ap, specialist());
      expect(costOf(s, ap, spec, powerUpIndex(s, spec))).toBe("{3}{G}");
      putOnBattlefield(s, ap, advancing());
      const theirs = putOnBattlefield(s, opp, specialist());
      putOnBattlefield(s, opp, advancing());
      expect(costOf(s, opp, theirs, powerUpIndex(s, theirs))).toBe("{3}{G}");
      expect(costOf(s, ap, spec, powerUpIndex(s, spec))).toBe("{0}");
    });

    it("with {X} in the power-up cost, X above 0 pays the cost itself (CR 107.3b)", () => {
      const { s, ap } = setup([]);
      putOnBattlefield(s, ap, advancing());
      const st = putOnBattlefield(s, ap, stature());
      const o = s.objects[st]!;
      const ab = abilitiesOf(s, o).activated[powerUpIndex(s, st)]!;
      expect(activationCost(s, ap, o, ab, undefined, 0).symbols).toEqual([{ kind: "generic", amount: 0 }]);
      // X = 2: the cost itself, {X}{U}{U}.
      expect(activationCost(s, ap, o, ab, undefined, 2).symbols.map((y) => y.kind)).toEqual(["x", "colored", "colored"]);
    });
  });
});
