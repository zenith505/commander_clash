// Round 440 (Lane A): Calamity, Galloping Inferno ("Whenever Calamity attacks while saddled, choose a nonlegendary
// creature that saddled it this turn and create a tapped and attacking token that's a copy of it. Sacrifice that token at
// the beginning of the next end step. Repeat this process once.": CR 702.171b-c, 707.2, 508.4, 603.7; rulings).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const calamity = (): CardDef => ({"oracleId":"eb37496e-374f-41b9-bd52-f52f37bdac31","name":"Calamity, Galloping Inferno","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Legendary Creature — Horse Mount","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Horse","Mount"],"oracleText":"Haste\nWhenever Calamity attacks while saddled, choose a nonlegendary creature that saddled it this turn and create a tapped and attacking token that's a copy of it. Sacrifice that token at the beginning of the next end step. Repeat this process once.\nSaddle 1","power":"4","toughness":"6","colors":["R"],"colorIdentity":["R"],"keywords":["Saddle","Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/e/7/e7a70f5a-2056-4c26-b6ea-9f751b5d0d8c.jpg?1783911823","artUrl":"https://cards.scryfall.io/art_crop/front/e/7/e7a70f5a-2056-4c26-b6ea-9f751b5d0d8c.jpg?1783911823","commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const visionary = (): CardDef => ({"oracleId":"c6a3a882-a127-4590-93d7-679ef4313efe","name":"Elvish Visionary","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Shaman","supertypes":[],"types":["Creature"],"subtypes":["Elf","Shaman"],"oracleText":"When this creature enters, draw a card.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const isamaru = (): CardDef => ({"oracleId":"cfb756dd-6fe1-430a-8f04-8b10cac62a86","name":"Isamaru, Hound of Konda","manaCost":"{W}","cmc":1,"typeLine":"Legendary Creature — Dog","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dog"],"oracleText":"","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2e7f9919-0713-4ef9-96eb-3e0c444e47f4.jpg?1783944338","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2e7f9919-0713-4ef9-96eb-3e0c444e47f4.jpg?1783944338","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const SADDLE = compileCard(calamity()).activated.findIndex((a) => a.saddle);
const named = (s: GameState, name: string, token: boolean) => s.battlefield.filter((id) => s.objects[id]!.isToken === token && s.cards[s.objects[id]!.cardId]?.name === name);

/** Calamity and `saddlers` on the battlefield (not summoning sick), Calamity saddled by `tap` of them. */
const saddled = (saddlers: (() => CardDef)[], tap: number[] = saddlers.map((_, i) => i)) => {
  const { s: s0, ap, opp } = setup([]);
  const c = putOnBattlefield(s0, ap, calamity());
  const ids = saddlers.map((d) => putOnBattlefield(s0, ap, d()));
  let s = tap.length ? run(s0, planActivate(s0, ap, c, SADDLE, undefined, undefined, tap.map((i) => ids[i]!))) : s0;
  // Saddle uses the stack (CR 702.171a).
  for (let i = 0; i < 20 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return { s, ap, opp, c, ids };
};
/** Calamity attacks `opp`; stops when its trigger asks something of `ap` or has resolved. */
const attack = (s: GameState, ap: PlayerId, opp: PlayerId, c: ObjectId, answer: (s: GameState) => Action | undefined = () => undefined) => {
  if (s.step !== "declareAttackers" || s.pending?.kind === "declareAttackers") {
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }] });
  }
  for (let i = 0; i < 100 && s.step === "declareAttackers"; i++) {
    const p = s.pending;
    const a = answer(s);
    if (a) s = act(s, a);
    else if (p?.kind === "chooseOption" && p.what === "attackWhom") s = act(s, { type: "chooseOption", player: p.player, choice: String(opp) });
    else if (p) s = run(s, botActions(s, p.player));
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("round 440: Calamity, Galloping Inferno", () => {
  it("is fully supported", () => {
    expect(isFullySupported(calamity())).toBe(true);
    const t = compileCard(calamity()).triggers[0]!;
    expect(t).toMatchObject({ event: "selfAttacks", activeIf: { kind: "self", is: "saddled" } });
    expect(t.body.effects.map((e) => e.type)).toEqual(["pick", "createTokenCopy", "delayed", "pick", "createTokenCopy", "delayed"]);
  });

  it("saddled by Grizzly Bears: two tapped and attacking Bears tokens, sacrificed at the next end step", () => {
    const { s: s0, ap, opp, c, ids } = saddled([bears]);
    expect(s0.objects[c]!.saddled).toBe(true);
    expect(s0.objects[ids[0]!]!.tapped).toBe(true);
    let s = attack(s0, ap, opp, c);
    const tokens = named(s, "Grizzly Bears", true);
    expect(tokens).toHaveLength(2);
    for (const t of tokens) {
      expect(s.objects[t]!.tapped).toBe(true);
      expect(s.objects[t]!.attacking).toBe(opp);
    }
    s = passUntil(s, "cleanup", ap);
    expect(tokens.every((t) => !s.battlefield.includes(t))).toBe(true);
    expect(s.battlefield).toContain(ids[0]!);
  });

  it("each token's attack is chosen as it enters (rulings): one at the opponent, one at another player", () => {
    const { s: s0, ap, opp, c } = saddled([bears]);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    let n = 0;
    const s = attack(s0, ap, opp, c, (x) => (x.pending?.kind === "chooseOption" && x.pending.what === "attackWhom" ? { type: "chooseOption", player: ap, choice: String(n++ === 0 ? opp : other) } : undefined));
    const tokens = named(s, "Grizzly Bears", true);
    expect(tokens.map((t) => s.objects[t]!.attacking).sort()).toEqual([opp, other].sort());
  });

  it("two saddlers: each copy is chosen, the same creature or another (rulings); an Elvish Visionary token's enters trigger draws", () => {
    const { s: s0, ap, opp, c, ids } = saddled([bears, visionary]);
    const hand = s0.players[ap]!.hand.length;
    const picks: ObjectId[] = [];
    const s = attack(s0, ap, opp, c, (x) => {
      if (x.pending?.kind !== "pickPermanents" || x.pending.player !== ap) return undefined;
      expect(x.pending.options.sort()).toEqual([...ids].sort());
      picks.push(ids[1]!);
      return { type: "pickPermanents", player: ap, ids: [ids[1]!] };
    });
    expect(picks).toHaveLength(2);
    expect(named(s, "Elvish Visionary", true)).toHaveLength(2);
    expect(named(s, "Grizzly Bears", true)).toHaveLength(0);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("a legendary creature that saddled it isn't chosen: Isamaru alone, no token", () => {
    const { s: s0, ap, opp, c } = saddled([isamaru]);
    const s = attack(s0, ap, opp, c);
    expect(named(s, "Isamaru, Hound of Konda", true)).toHaveLength(0);
  });

  it("only creatures that saddled it: Bears that didn't aren't copied", () => {
    const { s: s0, ap, opp, c } = saddled([isamaru, bears], [0]);
    const s = attack(s0, ap, opp, c);
    expect(named(s, "Grizzly Bears", true)).toHaveLength(0);
  });

  it("not saddled: no trigger", () => {
    const { s: s0, ap, opp, c } = saddled([bears], []);
    const s = attack(s0, ap, opp, c);
    expect(named(s, "Grizzly Bears", true)).toHaveLength(0);
    expect(s.objects[c]!.attacking).toBe(opp);
  });

  it("a saddler that left the battlefield is a new object (CR 400.7): no token", () => {
    const { s: s0, ap, opp, c, ids } = saddled([bears]);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }] });
    // The Bears die with the trigger waiting.
    const b = ids[0]!;
    s.battlefield.splice(s.battlefield.indexOf(b), 1);
    s.objects[b]!.zone = "graveyard";
    s.objects[b]!.zoneChanges = (s.objects[b]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(b);
    s = attack(s, ap, opp, c);
    expect(named(s, "Grizzly Bears", true)).toHaveLength(0);
  });

  it("a saddler another player controls now is still one that saddled it: you get the token", () => {
    const { s: s0, ap, opp, c, ids } = saddled([bears]);
    const b = ids[0]!;
    s0.objects[b]!.controller = opp;
    invalidateCharacteristics(s0);
    expect(controllerOf(s0, s0.objects[b]!)).toBe(opp);
    const s = attack(s0, ap, opp, c);
    const tokens = named(s, "Grizzly Bears", true);
    expect(tokens).toHaveLength(2);
    expect(tokens.every((t) => controllerOf(s, s.objects[t]!) === ap)).toBe(true);
  });
});
