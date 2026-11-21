// Lane B round B290: "a name originally printed in the ... expansion" (first-printings.ts, TargetSpec.firstPrintedIn):
// Golgothian Sylex ("Each nontoken permanent with a name originally printed in the Antiquities expansion is sacrificed by its
// controller."), Apocalypse Chime ("Destroy all nontoken permanents with a name originally printed in the Homelands
// expansion. They can't be regenerated.") and City in a Bottle (a state trigger, CR 603.8, and a ban on casting spells and
// playing lands with an Arabian Nights name).

import { describe, expect, it } from "vitest";
import { act, activate, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, isFullySupported, legalActions, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";
import { nameFirstPrintedIn } from "../src/first-printings";

// Real card data (Scryfall).
const sylex = (): CardDef => ({"oracleId":"95197f8f-c24e-4d13-a106-7186b3cc59e0","name":"Golgothian Sylex","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{1}, {T}: Each nontoken permanent with a name originally printed in the Antiquities expansion is sacrificed by its controller.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/5/856be1dd-a20b-49c2-be9d-7db76c7efd8b.jpg?1783948362","artUrl":"https://cards.scryfall.io/art_crop/front/8/5/856be1dd-a20b-49c2-be9d-7db76c7efd8b.jpg?1783948362","commanderLegal":"legal","set":"atq","releasedAt":"1994-03-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const chime = (): CardDef => ({"oracleId":"995e2412-3f69-4aaf-a5d6-ae0ecbb95061","name":"Apocalypse Chime","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}, {T}, Sacrifice this artifact: Destroy all nontoken permanents with a name originally printed in the Homelands expansion. They can't be regenerated.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/e/cef20d8f-6e80-4fca-b6a7-541981f6a112.jpg?1783947276","artUrl":"https://cards.scryfall.io/art_crop/front/c/e/cef20d8f-6e80-4fca-b6a7-541981f6a112.jpg?1783947276","commanderLegal":"legal","set":"hml","releasedAt":"1995-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const city = (): CardDef => ({"oracleId":"a83f25e3-4d84-4c9b-ab12-19b8d326e459","name":"City in a Bottle","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever one or more other nontoken permanents with a name originally printed in the Arabian Nights expansion are on the battlefield, their controllers sacrifice them.\nPlayers can't cast spells or play lands with a name originally printed in the Arabian Nights expansion.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/5/9598b346-a47d-4c4c-9571-156824e86b9c.jpg?1783948377","artUrl":"https://cards.scryfall.io/art_crop/front/9/5/9598b346-a47d-4c4c-9571-156824e86b9c.jpg?1783948377","commanderLegal":"legal","set":"arn","releasedAt":"1993-12-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const factory = (): CardDef => ({"oracleId":"5963e0ef-e0bc-4611-ad4f-813a4c0eacfb","name":"Mishra's Factory","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}: This land becomes a 2/2 Assembly-Worker artifact creature until end of turn. It's still a land.\n{T}: Target Assembly-Worker creature gets +1/+1 until end of turn.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/c/9/c9eb1309-5e60-4b8f-b63c-ebe62030db5c.jpg?1783920232","artUrl":"https://cards.scryfall.io/art_crop/front/c/9/c9eb1309-5e60-4b8f-b63c-ebe62030db5c.jpg?1783920232","commanderLegal":"legal","set":"slc","releasedAt":"2022-11-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kirdApe = (): CardDef => ({"oracleId":"fbbc3acb-c917-44ff-ac6f-9dd6ebe3f4ad","name":"Kird Ape","manaCost":"{R}","cmc":1,"typeLine":"Creature — Ape","supertypes":[],"types":["Creature"],"subtypes":["Ape"],"oracleText":"This creature gets +1/+2 as long as you control a Forest.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/b/ebe8845e-df1c-481c-949c-aab84af99a05.jpg?1783948383","artUrl":"https://cards.scryfall.io/art_crop/front/e/b/ebe8845e-df1c-481c-949c-aab84af99a05.jpg?1783948383","commanderLegal":"legal","set":"arn","releasedAt":"1993-12-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const desert = (): CardDef => ({"oracleId":"195107ad-879d-4b02-a44a-a3ba70fedf88","name":"Desert","manaCost":"","cmc":0,"typeLine":"Land — Desert","supertypes":[],"types":["Land"],"subtypes":["Desert"],"oracleText":"{T}: Add {C}.\n{T}: This land deals 1 damage to target attacking creature. Activate only during the end of combat step.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/5/a/5aa802d3-f9b1-49d1-87de-91d5fd9850ad.jpg?1783911688","artUrl":"https://cards.scryfall.io/art_crop/front/5/a/5aa802d3-f9b1-49d1-87de-91d5fd9850ad.jpg?1783911688","commanderLegal":"legal","set":"spg","releasedAt":"2024-04-19","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const baronSengir = (): CardDef => ({"oracleId":"fc728cd7-2b5b-45f3-896a-a45648bcb61d","name":"Baron Sengir","manaCost":"{5}{B}{B}{B}","cmc":8,"typeLine":"Legendary Creature — Vampire Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire","Noble"],"oracleText":"Flying\nWhenever a creature dealt damage by Baron Sengir this turn dies, put a +2/+2 counter on Baron Sengir.\n{T}: Regenerate another target Vampire.","power":"5","toughness":"5","colors":["B"],"colorIdentity":["B"],"keywords":["Flying","Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/51bdddac-02fc-493a-a0ea-689273252d7e.jpg?1783947293","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/51bdddac-02fc-493a-a0ea-689273252d7e.jpg?1783947293","commanderLegal":"legal","set":"hml","releasedAt":"1995-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const serraAviary = (): CardDef => ({"oracleId":"7a06483b-e71c-4d11-86ea-3b48e2a9cdaf","name":"Serra Aviary","manaCost":"{3}{W}","cmc":4,"typeLine":"World Enchantment","supertypes":["World"],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures with flying get +1/+1.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/8/688a8de2-0167-4b35-a38d-3574034a892c.jpg?1783947301","artUrl":"https://cards.scryfall.io/art_crop/front/6/8/688a8de2-0167-4b35-a38d-3574034a892c.jpg?1783947301","commanderLegal":"legal","set":"hml","releasedAt":"1995-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const clone = (): CardDef => ({"oracleId":"42226b87-0746-4ebf-9fd0-108d508462af","name":"Clone","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"You may have this creature enter as a copy of any creature on the battlefield.","power":"0","toughness":"0","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const juzam = (): CardDef => ({"oracleId":"4e81596c-9225-43d1-bd35-798212144f2c","name":"Juzám Djinn","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Creature — Djinn","supertypes":[],"types":["Creature"],"subtypes":["Djinn"],"oracleText":"At the beginning of your upkeep, this creature deals 1 damage to you.","power":"5","toughness":"5","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/1/31bf3f14-b5df-498b-a1bb-965885c82401.jpg?1783948387","artUrl":"https://cards.scryfall.io/art_crop/front/3/1/31bf3f14-b5df-498b-a1bb-965885c82401.jpg?1783948387","commanderLegal":"legal","set":"arn","releasedAt":"1993-12-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const irini = (): CardDef => ({"oracleId":"2727a7ec-1cf7-4cd7-b5d4-955db940ddd9","name":"Irini Sengir","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Legendary Creature — Vampire Dwarf","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire","Dwarf"],"oracleText":"Green enchantment spells and white enchantment spells cost {2} more to cast.","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/518e3b77-d482-4b90-94c0-0b8cdd949b9f.jpg?1783947289","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/518e3b77-d482-4b90-94c0-0b8cdd949b9f.jpg?1783947289","commanderLegal":"legal","set":"hml","releasedAt":"1995-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
/** Everyone passes until the stack and trigger queue are empty; bots answer any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);

describe("Lane B round B290: names originally printed in an old set", () => {
  it("all three are fully supported", () => supported(sylex(), chime(), city()));

  it("knows which names were first printed in each set (and Arabian Nights' Mountain isn't one)", () => {
    expect(nameFirstPrintedIn("Ornithopter", "atq")).toBe(true);
    expect(nameFirstPrintedIn("Mishra's Factory", "atq")).toBe(true);
    expect(nameFirstPrintedIn("Juzám Djinn", "arn")).toBe(true);
    expect(nameFirstPrintedIn("Baron Sengir", "hml")).toBe(true);
    expect(nameFirstPrintedIn("Mountain", "arn")).toBe(false);
    expect(nameFirstPrintedIn("Ornithopter", "arn")).toBe(false);
    expect(nameFirstPrintedIn("Grizzly Bears", "atq")).toBe(false);
    expect(nameFirstPrintedIn(undefined, "atq")).toBe(false);
  });

  describe("Golgothian Sylex", () => {
    it("each player sacrifices their nontoken permanents with an Antiquities name, Sylex too; tokens and other cards stay", () => {
      const { s: s0, ap, opp } = setup([]);
      const sx = putOnBattlefield(s0, ap, sylex());
      const fac = putOnBattlefield(s0, ap, factory());
      const orn = putOnBattlefield(s0, opp, ornithopter());
      const tok = putOnBattlefield(s0, opp, ornithopter());
      s0.objects[tok]!.isToken = true;
      const bears = putOnBattlefield(s0, opp, grizzlyBears());
      // A Clone copying Ornithopter has its name (CR 707.2) and is a card, so it goes too.
      const cl = putOnBattlefield(s0, others(s0, ap)[1]!, clone());
      s0.objects[cl]!.copyOf = s0.objects[orn]!.cardId;
      const s = settle(activate(s0, ap, sx, 0));
      expect([zone(s, sx), zone(s, fac), zone(s, orn), zone(s, cl)]).toEqual(["graveyard", "graveyard", "graveyard", "graveyard"]);
      expect(s.objects[orn]!.owner).toBe(opp);
      expect(s.players[opp]!.graveyard).toContain(orn);
      expect(s.battlefield).toContain(tok);
      expect(zone(s, bears)).toBe("battlefield");
    });
  });

  describe("Apocalypse Chime", () => {
    it("destroys every nontoken permanent with a Homelands name, and they can't be regenerated", () => {
      const { s: s0, ap, opp } = setup([]);
      const ch = putOnBattlefield(s0, ap, chime());
      const baron = putOnBattlefield(s0, ap, baronSengir());
      const ir = putOnBattlefield(s0, ap, irini());
      const aviary = putOnBattlefield(s0, ap, serraAviary());
      const bears = putOnBattlefield(s0, opp, grizzlyBears());
      // Baron Sengir regenerates Irini Sengir first: the shield doesn't help (CR 701.19c).
      let s = settle(activate(s0, ap, baron, 0, [target(ir)]));
      expect(s.objects[ir]!.regenShields).toBe(1);
      s = settle(activate(s, ap, ch, 0));
      expect([zone(s, ch), zone(s, baron), zone(s, ir), zone(s, aviary)]).toEqual(["graveyard", "graveyard", "graveyard", "graveyard"]);
      expect(zone(s, bears)).toBe("battlefield");
    });
  });

  describe("City in a Bottle", () => {
    it("triggers while another nontoken Arabian Nights permanent is on the battlefield; their controllers sacrifice them", () => {
      const { s: s0, ap, opp } = setup([]);
      const c = putOnBattlefield(s0, ap, city());
      let s = passAll(s0);
      expect(s.stack.length + s.triggerQueue.length).toBe(0); // City alone: "other"
      const ape = putOnBattlefield(s, opp, kirdApe());
      const dj = putOnBattlefield(s, ap, juzam());
      const tok = putOnBattlefield(s, opp, kirdApe());
      s.objects[tok]!.isToken = true;
      const bears = putOnBattlefield(s, opp, grizzlyBears());
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.stack.filter((x) => x.sourceId === c).length).toBe(1); // once, not once for each (CR 603.8)
      s = settle(s);
      expect([zone(s, ape), zone(s, dj), zone(s, c), zone(s, bears)]).toEqual(["graveyard", "graveyard", "battlefield", "battlefield"]);
      expect(s.battlefield).toContain(tok);
      expect(s.players[opp]!.graveyard).toContain(ape);
    });

    it("a Clone copying an Arabian Nights creature is sacrificed; a second City in a Bottle sacrifices the first", () => {
      const { s: s0, ap, opp } = setup([]);
      const c1 = putOnBattlefield(s0, ap, city());
      const cl = putOnBattlefield(s0, opp, clone());
      const ape = kirdApe();
      s0.cards[ape.oracleId] = ape;
      s0.objects[cl]!.copyOf = ape.oracleId;
      const c2 = putOnBattlefield(s0, opp, city());
      const s = settle(act(s0, { type: "passPriority", player: waitingOn(s0)! }));
      expect([zone(s, cl), zone(s, c1), zone(s, c2)]).toEqual(["graveyard", "graveyard", "graveyard"]);
    });

    it("no player can cast spells or play lands with an Arabian Nights name; other cards are fine", () => {
      const { s: s0, ap, ids } = setup([kirdApe(), desert(), grizzlyBears(), factory()]);
      putOnBattlefield(s0, ap, city());
      const [ape, des, bears, fac] = ids as [string, string, string, string];
      expect(planCast(s0, ap, ape)).toBeNull();
      expect(planCast(s0, ap, bears)).not.toBeNull();
      const plays = legalActions(s0, ap).filter((a) => a.type === "playLand").map((a) => (a as { objectId: string }).objectId);
      expect(plays).not.toContain(des);
      expect(plays).toContain(fac);
      expect(() => act(s0, { type: "playLand", player: ap, objectId: des })).toThrow(/Arabian Nights/);
    });
  });

  describe("bots", () => {
    /** `ap` (a bot) in its second main phase with `art`, `mine` and the opponent's `theirs`: does it activate `art`? */
    const uses = (art: CardDef, mine: CardDef[], theirs: CardDef[]) => {
      const { s: s0, ap, opp } = setup([]);
      const id = putOnBattlefield(s0, ap, art);
      mine.forEach((d) => putOnBattlefield(s0, ap, d));
      theirs.forEach((d) => putOnBattlefield(s0, opp, d));
      let s = passUntil(s0, "main2", ap);
      for (let i = 0; i < 40 && s.objects[id]!.zone === "battlefield"; i++) {
        const w = waitingOn(s)!;
        const acts = botActions(s, w);
        if (w === ap && !s.stack.length && acts.length === 1 && acts[0]!.type === "passPriority") break;
        for (const a of acts) s = act(s, a);
      }
      return s.objects[id]!.zone !== "battlefield";
    };
    it("activate Golgothian Sylex when the opponents lose more than they do, not otherwise", () => {
      expect(uses(sylex(), [], [ornithopter(), factory(), baronSengir()])).toBe(false); // Baron Sengir isn't from Antiquities
      expect(uses(sylex(), [], [ornithopter(), factory(), ornithopter()])).toBe(true);
      expect(uses(sylex(), [ornithopter()], [ornithopter()])).toBe(false);
    });
    it("activate Apocalypse Chime only for more than the Chime is worth", () => {
      expect(uses(chime(), [], [baronSengir()])).toBe(true);
      expect(uses(chime(), [], [])).toBe(false);
      expect(uses(chime(), [baronSengir()], [irini()])).toBe(false);
    });
    it("planActivate works for the human too (no choices)", () => {
      const { s, ap } = setup([]);
      const id = putOnBattlefield(s, ap, sylex());
      expect(planActivate(s, ap, id, 0)).not.toBeNull();
    });
  });
});
