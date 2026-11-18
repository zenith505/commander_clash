// Round 413 (Lane A): Perplexing Chimera ("Whenever an opponent casts a spell, you may exchange control of ~ and that
// spell. If you do, you may choose new targets for the spell.") and Sudden Substitution ("Exchange control of target
// noncreature spell and target creature. Then the spell's controller may choose new targets for it."): control of a spell
// and a permanent exchanged (CR 701.12a), then new targets (CR 115.7d).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup, swamp } from "./helpers";
import { invalidateCharacteristics, controllerOf } from "../src/layers";
import { moveObject, playerLoses } from "../src/game";
import { applyAction, botActions, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const chimera = (): CardDef => ({"oracleId":"7d075b8a-a606-4590-b52b-b4ef3a9e342f","name":"Perplexing Chimera","manaCost":"{4}{U}","cmc":5,"typeLine":"Enchantment Creature — Chimera","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Chimera"],"oracleText":"Whenever an opponent casts a spell, you may exchange control of this creature and that spell. If you do, you may choose new targets for the spell. (If the spell becomes a permanent, you control that permanent.)","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81cea94d-e8a2-4c88-b121-9806eb7cc210.jpg?1791120518","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81cea94d-e8a2-4c88-b121-9806eb7cc210.jpg?1791120518","commanderLegal":"legal","set":"sld","releasedAt":"2026-09-28","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const substitution = (): CardDef => ({"oracleId":"e5ddacfb-e5a8-4885-a4c9-fa117f321293","name":"Sudden Substitution","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Split second (As long as this spell is on the stack, players can't cast spells or activate abilities that aren't mana abilities.)\nExchange control of target noncreature spell and target creature. Then the spell's controller may choose new targets for it.","colors":["U"],"colorIdentity":["U"],"keywords":["Split second"],"imageUrl":"https://cards.scryfall.io/normal/front/9/f/9f7983bf-2a3b-4428-8c01-35285f589da8.jpg?1783932812","artUrl":"https://cards.scryfall.io/art_crop/front/9/f/9f7983bf-2a3b-4428-8c01-35285f589da8.jpg?1783932812","commanderLegal":"legal","set":"c19","releasedAt":"2019-08-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty or a question comes up. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Everyone passes until `pid` has priority (nothing resolves on the way: each of the others passes once). */
const passTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 4 && waitingOn(s) !== pid && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
function inHand(s: GameState, pid: PlayerId, def: CardDef): ObjectId {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}
/** Everyone passes until the top of the stack has resolved (or a question comes up). */
const resolveTop = (s: GameState) => {
  const n = s.stack.length;
  for (let i = 0; i < 20 && s.stack.length >= n && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const stackOf = (s: GameState, name: string) => s.stack.find((x) => x.description.startsWith(name));
const log = (s: GameState) => s.log.map((e) => e.text).join("\n");

describe("round 413: the cards compile", () => {
  it("are fully supported", () => {
    for (const d of [chimera(), substitution()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 413: Perplexing Chimera", () => {
  /** The active player casts Murder at `opp`'s Grizzly Bears while `opp` controls Perplexing Chimera. */
  function murderVsChimera() {
    const { s: s0, ap, opp } = setup([murder()]);
    const s1 = s0;
    const chim = putOnBattlefield(s1, opp, chimera());
    const theirBear = putOnBattlefield(s1, opp, bears());
    const myBear = putOnBattlefield(s1, ap, bears());
    const m = s1.players[ap]!.hand.find((id) => s1.objects[id]!.cardId === murder().oracleId)!;
    let s = run(s1, planCast(s1, ap, m, [{ kind: "object", id: theirBear }]));
    s = settle(s);
    return { s, ap, opp, chim, theirBear, myBear, m };
  }

  it("exchanges control of the Chimera and the spell, then its controller chooses new targets for the spell", () => {
    let { s, ap, opp, chim, theirBear, myBear, m } = murderVsChimera();
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    // The spell is the Chimera's controller's now, the Chimera the caster's (neither changes zones, rulings).
    expect(stackOf(s, "Murder")?.controller).toBe(opp);
    expect(controllerOf(s, s.objects[chim]!)).toBe(ap);
    expect(s.objects[chim]!.zone).toBe("battlefield");
    expect(s.pending).toMatchObject({ kind: "newTargets", player: opp });
    s = act(s, { type: "newTargets", player: opp, targets: [{ kind: "object", id: myBear }] });
    s = settle(s);
    expect(s.objects[myBear]!.zone).toBe("graveyard");
    expect(s.objects[theirBear]!.zone).toBe("battlefield");
    // An instant goes to its owner's graveyard (rulings).
    expect(s.objects[m]!.zone).toBe("graveyard");
    expect(s.players[ap]!.graveyard).toContain(m);
    expect(log(s)).toMatch(/exchange control of Murder and Perplexing Chimera/);
    // The exchange lasts: the Chimera stays its new controller's.
    expect(controllerOf(s, s.objects[chim]!)).toBe(ap);
  });

  it("declining keeps everything as it was", () => {
    let { s, ap, opp, chim, theirBear } = murderVsChimera();
    s = settle(act(s, { type: "chooseMay", player: opp, yes: false }));
    expect(controllerOf(s, s.objects[chim]!)).toBe(opp);
    expect(s.objects[theirBear]!.zone).toBe("graveyard");
    expect(s.pending).toBeNull();
    void ap;
  });

  it("no exchange and no new targets once the Chimera has left the battlefield (rulings)", () => {
    let { s, opp, chim, theirBear } = murderVsChimera();
    // The Chimera leaves before its ability resolves.
    moveObject(s, chim, "graveyard");
    invalidateCharacteristics(s);
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    expect(stackOf(s, "Murder")?.controller).not.toBe(opp);
    expect(s.pending?.kind).not.toBe("newTargets");
    s = settle(s);
    expect(s.objects[theirBear]!.zone).toBe("graveyard");
  });

  it("a permanent spell taken this way enters under its new controller's control", () => {
    const { s: s0, ap, opp } = setup([angel()]);
    const chim = putOnBattlefield(s0, opp, chimera());
    const a = s0.players[ap]!.hand.find((id) => s0.objects[id]!.cardId === angel().oracleId)!;
    let s = settle(run(s0, planCast(s0, ap, a)));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(s.objects[a]).toMatchObject({ zone: "battlefield", owner: ap });
    expect(controllerOf(s, s.objects[a]!)).toBe(opp);
    expect(controllerOf(s, s.objects[chim]!)).toBe(ap);
  });

  it("a bot takes a spell aimed at its creature and turns it on the caster's best creature (the Chimera, theirs now)", () => {
    let { s, ap, opp, chim, theirBear, myBear } = murderVsChimera();
    for (let i = 0; i < 10 && s.pending && waitingOn(s) === opp; i++) for (const a of botActions(s, opp)) s = act(s, a);
    s = settle(s);
    expect(s.objects[theirBear]!.zone).toBe("battlefield");
    expect(s.objects[myBear]!.zone).toBe("battlefield");
    expect(s.objects[chim]!.zone).toBe("graveyard");
    expect(log(s)).toMatch(/changes the targets of Murder to Perplexing Chimera/);
    void ap;
  });
});

describe("round 413: Perplexing Chimera (bots)", () => {
  it("a bot lets a cheap spell that isn't aimed at it go by", () => {
    const { s: s0, ap, opp } = setup([divination()]);
    const chim = putOnBattlefield(s0, opp, chimera());
    const d = s0.players[ap]!.hand.find((id) => s0.objects[id]!.cardId === divination().oracleId)!;
    let s = settle(run(s0, planCast(s0, ap, d)));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    expect(botActions(s, opp)).toEqual([{ type: "chooseMay", player: opp, yes: false }]);
    s = settle(act(s, botActions(s, opp)[0]!));
    expect(controllerOf(s, s.objects[chim]!)).toBe(opp);
  });
});

describe("round 413: Sudden Substitution", () => {
  /** `opp` casts Murder at the active player's Grizzly Bears; the active player then has priority with Sudden Substitution. */
  function murderOnStack() {
    const { s: s0, ap, opp } = setup([substitution()]);
    const myBear = putOnBattlefield(s0, ap, bears());
    const theirAngel = putOnBattlefield(s0, opp, angel());
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, swamp);
    const m = inHand(s0, opp, murder());
    const sub = s0.players[ap]!.hand.find((id) => s0.objects[id]!.cardId === substitution().oracleId)!;
    let s = act(s0, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = run(s, planCast(s, opp, m, [{ kind: "object", id: myBear }]));
    s = passTo(s, ap);
    return { s, ap, opp, myBear, theirAngel, m, sub };
  }

  it("exchanges control of the spell and the creature, then the spell's new controller chooses its new targets", () => {
    let { s, ap, opp, myBear, theirAngel, m, sub } = murderOnStack();
    const item = stackOf(s, "Murder")!;
    s = run(s, planCast(s, ap, sub, [{ kind: "stack", id: item.id }, { kind: "object", id: myBear }]));
    // Split second: nobody can respond.
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "newTargets", player: ap });
    expect(stackOf(s, "Murder")?.controller).toBe(ap);
    expect(controllerOf(s, s.objects[myBear]!)).toBe(opp);
    s = settle(act(s, { type: "newTargets", player: ap, targets: [{ kind: "object", id: theirAngel }] }));
    expect(s.objects[theirAngel]!.zone).toBe("graveyard");
    expect(s.objects[myBear]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[myBear]!)).toBe(opp);
    expect(s.players[opp]!.graveyard).toContain(m);
  });

  it("with both under one player's control there's no exchange, but that player may still choose new targets (rulings)", () => {
    let { s, ap, opp, theirAngel, sub } = murderOnStack();
    const item = stackOf(s, "Murder")!;
    s = settle(run(s, planCast(s, ap, sub, [{ kind: "stack", id: item.id }, { kind: "object", id: theirAngel }])));
    expect(stackOf(s, "Murder")?.controller).toBe(opp);
    expect(controllerOf(s, s.objects[theirAngel]!)).toBe(opp);
    expect(s.pending).toMatchObject({ kind: "newTargets", player: opp });
    expect(log(s)).toMatch(/have the same controller, so nothing is exchanged/);
  });

  it("when the player who gained control of the spell leaves the game, it's the one before's again (rulings)", () => {
    // The active player casts Divination, then gives it away with Sudden Substitution for the opponent's Serra Angel.
    const { s: s0, ap, opp } = setup([divination(), substitution()]);
    const theirAngel = putOnBattlefield(s0, opp, angel());
    const [div, sub] = s0.players[ap]!.hand.slice(-2) as [ObjectId, ObjectId];
    let s = run(s0, planCast(s0, ap, div));
    expect(waitingOn(s)).toBe(ap);
    const item = stackOf(s, "Divination")!;
    s = resolveTop(run(s, planCast(s, ap, sub, [{ kind: "stack", id: item.id }, { kind: "object", id: theirAngel }])));
    expect(stackOf(s, "Divination")?.controller).toBe(opp);
    expect(controllerOf(s, s.objects[theirAngel]!)).toBe(ap);
    playerLoses(s, opp, "test");
    expect(stackOf(s, "Divination")?.controller).toBe(ap);
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    void div;
  });

  it("a bot answers an opponent's big noncreature spell with it, giving its least useful creature", () => {
    let { s, ap, opp, myBear } = murderOnStack();
    // The bot is the one with Murder cast at it: swap the seats' roles by letting the active player be the bot.
    const acts = botActions(s, ap);
    const cast = acts.find((a) => a.type === "castSpell") as Extract<Action, { type: "castSpell" }> | undefined;
    expect(cast?.targets).toEqual([{ kind: "stack", id: stackOf(s, "Murder")!.id }, expect.objectContaining({ kind: "object", id: myBear })]);
    void opp;
  });
});
