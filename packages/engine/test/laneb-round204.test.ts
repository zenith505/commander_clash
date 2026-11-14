// Lane B round B204: Journey to the Lost City ("At the beginning of your upkeep, exile the top four cards of your library,
// then roll a d20. 1—9 | You may put a land card from among those cards onto the battlefield. 10—19 | Create a 2/2 green
// Wolf creature token, then put a +1/+1 counter on it for each creature card among those cards. 20 | Put all permanent
// cards exiled with this enchantment onto the battlefield, then sacrifice it.").

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, island, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const floodgates = (): CardDef => ({"oracleId":"bd4df73c-bbd5-47fd-a961-19f3a3c59381","name":"Lavabrink Floodgates","manaCost":"{3}{R}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {R}{R}.\nAt the beginning of each player's upkeep, that player may put a doom counter on this artifact or remove a doom counter from it. Then if it has three or more doom counters on it, sacrifice this artifact. When you do, it deals 6 damage to each creature.","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/d/2/d2f9a9bf-edd2-4448-bace-8bfba3ba529a.jpg?1783931213","artUrl":"https://cards.scryfall.io/art_crop/front/d/2/d2f9a9bf-edd2-4448-bace-8bfba3ba529a.jpg?1783931213","commanderLegal":"legal","set":"c20","releasedAt":"2020-04-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const damnations = (): CardDef => ({"oracleId":"506714a8-b9c2-443a-a9e8-ef9130e674ba","name":"Choice of Damnations","manaCost":"{5}{B}","cmc":6,"typeLine":"Sorcery — Arcane","supertypes":[],"types":["Sorcery"],"subtypes":["Arcane"],"oracleText":"Target opponent chooses a number. You may have that player lose that much life. If you don't, that player sacrifices all but that many permanents of their choice.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/5/05939f15-2d95-47df-b66f-131c3e7ea95f.jpg?1783944159","artUrl":"https://cards.scryfall.io/art_crop/front/0/5/05939f15-2d95-47df-b66f-131c3e7ea95f.jpg?1783944159","commanderLegal":"legal","set":"sok","releasedAt":"2005-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const offering = (): CardDef => ({"oracleId":"348201c4-79de-4278-9896-d8b1567cc5cc","name":"Infernal Offering","manaCost":"{4}{B}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose an opponent. You and that player each sacrifice a creature. Each player who sacrificed a creature this way draws two cards.\nChoose an opponent. Return a creature card from your graveyard to the battlefield, then that player returns a creature card from their graveyard to the battlefield.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/6/86e47496-5578-42a7-bddb-16d583c0c51c.jpg?1783938870","artUrl":"https://cards.scryfall.io/art_crop/front/8/6/86e47496-5578-42a7-bddb-16d583c0c51c.jpg?1783938870","commanderLegal":"legal","set":"c14","releasedAt":"2014-11-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hew = (): CardDef => ({"oracleId":"8818bbf8-58ec-4070-a81a-c7ce248057ab","name":"Hew the Entwood","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Sacrifice any number of lands. Reveal the top X cards of your library, where X is the number of lands sacrificed this way. Choose any number of artifact and/or land cards revealed this way. Put all nonland cards chosen this way onto the battlefield, then put all land cards chosen this way onto the battlefield tapped, then put the rest on the bottom of your library in a random order.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81940498-a5bf-4bcd-b06d-8816887b2a2b.jpg?1783916285","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81940498-a5bf-4bcd-b06d-8816887b2a2b.jpg?1783916285","commanderLegal":"legal","set":"ltr","releasedAt":"2023-06-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const druid = (): CardDef => ({"oracleId":"acf54a85-0e9e-43fb-99d9-c223c02f13c4","name":"Druid of the Emerald Grove","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Dwarf Druid","supertypes":[],"types":["Creature"],"subtypes":["Dwarf","Druid"],"oracleText":"When this creature enters, search your library for up to two basic land cards and reveal them, then roll a d20.\n9 or less | Put those cards into your hand, then shuffle.\n10—19 | Put one of those cards onto the battlefield tapped and the other into your hand, then shuffle.\n20+ | Put those cards onto the battlefield tapped, then shuffle.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/a/8a270d07-29da-4c31-ae6a-5f60c162f508.jpg?1783922716","artUrl":"https://cards.scryfall.io/art_crop/front/8/a/8a270d07-29da-4c31-ae6a-5f60c162f508.jpg?1783922716","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const journey = (): CardDef => ({"oracleId":"a5f5e662-b32c-44f1-848d-0228f0fe1eb6","name":"Journey to the Lost City","manaCost":"{3}{G}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, exile the top four cards of your library, then roll a d20.\n1—9 | You may put a land card from among those cards onto the battlefield.\n10—19 | Create a 2/2 green Wolf creature token, then put a +1/+1 counter on it for each creature card among those cards.\n20 | Put all permanent cards exiled with this enchantment onto the battlefield, then sacrifice it.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/6/967b19ce-062d-470c-8716-425a8dec0e18.jpg?1783922498","artUrl":"https://cards.scryfall.io/art_crop/front/9/6/967b19ce-062d-470c-8716-425a8dec0e18.jpg?1783922498","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** The first random state from which `go` gives a game `ok` accepts (die rolls come from it). */
const rigged = (s0: GameState, go: (s: GameState) => GameState, ok: (s: GameState) => boolean) => {
  for (let k = 1; k < 5000; k++) {
    const c = structuredClone(s0);
    c.rngState = k;
    const out = go(c);
    if (ok(out)) return out;
  }
  throw new Error("no random state gives that");
};
const zoneOf = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const nameOf = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && nameOf(s, id) === name);
/** The roll logged for `src`, as a number. */
const rolled = (s: GameState, src: string) => {
  const m = [...s.log].reverse().map((e) => new RegExp(`rolls a d20 for ${src}: (\\d+)`).exec(e.text)).find(Boolean);
  return m ? Number(m[1]) : undefined;
};
/** A card put on top of `pid`'s library (the last one put is the top card). */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const others = (s: GameState, ap: PlayerId) => {
  const i = s.turnOrder.indexOf(ap);
  return [1, 2, 3].map((k) => s.turnOrder[(i + k) % 4]!);
};
const relic = card("Mind Stone", "Artifact", "{2}");
const sorcery = card("Divination", "Sorcery", "{2}{U}");

describe("round B204 cards are supported", () => {
  it("compiles every line", () => supported(journey(), floodgates(), damnations(), offering(), hew(), druid()));
});

describe("Journey to the Lost City", () => {
  /** Journey on your battlefield; your library's top four are Forest, Bears, Mind Stone, Divination; on to your next upkeep. */
  const atUpkeep = () => {
    const { s: s0, ap } = setup([]);
    const j = putOnBattlefield(s0, ap, journey());
    const top = [sorcery, relic, bear(), forest].map((d) => onTop(s0, ap, d)).reverse();
    let s = passUntil(s0, "upkeep", others(s0, ap)[0]);
    s = passUntil(s, "upkeep", ap);
    return { s, ap, j, top };
  };
  const roll = (min: number, max: number) => {
    const { s: s0, ap, j, top } = atUpkeep();
    const s = rigged(s0, (c) => settle(c), (c) => { const r = rolled(c, "Journey to the Lost City"); return r !== undefined && r >= min && r <= max; });
    return { s, ap, j, top };
  };
  it("exiles the top four cards as your upkeep begins", () => {
    const { s, top } = roll(1, 20);
    for (const id of top) expect(["exile", "battlefield"]).toContain(zoneOf(s, id));
  });
  it("1—9: you may put a land card from among them onto the battlefield", () => {
    const { s: s0, ap, top } = roll(1, 9);
    expect(s0.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [top[0]] });
    const s = settle(act(s0, { type: "searchLibrary", player: ap, found: [top[0]!] }));
    expect(zoneOf(s, top[0]!)).toBe("battlefield");
    expect(s.objects[top[0]!]!.controller).toBe(ap);
    for (const id of top.slice(1)) expect(zoneOf(s, id)).toBe("exile");
  });
  it("1—9: declining leaves the land in exile", () => {
    const { s: s0, ap, top } = roll(1, 9);
    const s = settle(act(s0, { type: "searchLibrary", player: ap, found: [] }));
    expect(zoneOf(s, top[0]!)).toBe("exile");
  });
  it("10—19: a 2/2 Wolf with a +1/+1 counter for each creature card among them", () => {
    const { s, ap } = roll(10, 19);
    const wolves = named(s, ap, "Wolf Token");
    expect(wolves.length).toBe(1);
    expect(s.objects[wolves[0]!]!.counters["+1/+1"]).toBe(1);
    expect(`${power(s, s.objects[wolves[0]!]!)}/${toughness(s, s.objects[wolves[0]!]!)}`).toBe("3/3");
  });
  it("20: every permanent card exiled with it enters, then it's sacrificed", () => {
    const { s: s0, ap, j, top } = atUpkeep();
    // An earlier upkeep's exiled card is "exiled with" it too.
    const s1 = rigged(s0, (c) => settle(c), (c) => (rolled(c, "Journey to the Lost City") ?? 0) >= 10 && (rolled(c, "Journey to the Lost City") ?? 0) <= 19);
    const older = top[1]!;
    expect(zoneOf(s1, older)).toBe("exile");
    // On to the next upkeep, with four more cards on top as its trigger waits.
    let s2 = passUntil(s1, "upkeep", others(s1, ap)[0]);
    s2 = passUntil(s2, "upkeep", ap);
    const next = [sorcery, relic, bear(), forest].map((d) => onTop(s2, ap, d)).reverse();
    const s = rigged(s2, (c) => settle(c), (c) => rolled(c, "Journey to the Lost City") === 20);
    for (const id of [older, top[2]!, next[0]!, next[1]!, next[2]!]) expect(zoneOf(s, id), nameOf(s, id)).toBe("battlefield");
    // Not the sorceries: only permanent cards (CR 110.4b).
    expect(zoneOf(s, top[3]!)).toBe("exile");
    expect(zoneOf(s, next[3]!)).toBe("exile");
    expect(zoneOf(s, j)).toBe("graveyard");
  });
});

describe("Lavabrink Floodgates", () => {
  /** Floodgates (with `doom` counters) on your battlefield, bears for you and an opponent, on to `whose` next upkeep. */
  const atUpkeep = (doom: number, whose: "you" | "next") => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, floodgates());
    if (doom) s0.objects[f]!.counters.doom = doom;
    const opp = others(s0, ap)[0]!;
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    const big = putOnBattlefield(s0, opp, bear({ name: "Big Bear", power: "7", toughness: "7" }));
    let s = passUntil(s0, "upkeep", opp);
    if (whose === "you") {
      // Each other player leaves the counters alone at their upkeep.
      for (let i = 0; i < 3000 && !(s.step === "upkeep" && s.activePlayer === ap); i++) {
        const p = s.pending;
        if (p?.kind === "chooseOption" && p.what === "addOrRemoveCounter") s = act(s, { type: "chooseOption", player: p.player, choice: "none" });
        else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
        else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
        else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
    }
    return { s, ap, opp, f, mine, theirs, big };
  };
  const answer = (s: GameState, choice: string) => {
    const p = s.pending;
    if (p?.kind !== "chooseOption" || p.what !== "addOrRemoveCounter") throw new Error("not asked about the doom counter");
    return settle(act(s, { type: "chooseOption", player: p.player, choice }));
  };
  it("the upkeep's player is asked: with none on it, only putting one on or not", () => {
    const { s: s0, opp, f } = atUpkeep(0, "next");
    const s = settle(s0);
    expect(s.activePlayer).toBe(opp);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "addOrRemoveCounter", player: opp, options: ["add", "none"] });
    expect(answer(s, "add").objects[f]!.counters.doom).toBe(1);
  });
  it("you're asked at your own upkeep, and may remove one", () => {
    const { s: s0, ap, f } = atUpkeep(2, "you");
    const s = settle(s0);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "addOrRemoveCounter", player: ap, options: ["add", "remove", "none"] });
    const after = answer(s, "remove");
    expect(after.objects[f]!.counters.doom).toBe(1);
    expect(zoneOf(after, f)).toBe("battlefield");
  });
  it("the third counter sacrifices it, and it deals 6 damage to each creature", () => {
    const { s: s0, ap, f, mine, theirs, big } = atUpkeep(2, "you");
    const s = answer(settle(s0), "add");
    expect(zoneOf(s, f)).toBe("graveyard");
    expect(zoneOf(s, mine)).toBe("graveyard");
    expect(zoneOf(s, theirs)).toBe("graveyard");
    expect(zoneOf(s, big)).toBe("battlefield");
    expect(s.objects[big]!.damage).toBe(6);
    expect(s.players[ap]!.graveyard).toContain(f);
  });
  it("with three on it already, doing nothing still sacrifices it as the ability resolves", () => {
    const { s: s0, f, theirs } = atUpkeep(3, "next");
    const s = answer(settle(s0), "none");
    expect(zoneOf(s, f)).toBe("graveyard");
    expect(zoneOf(s, theirs)).toBe("graveyard");
  });
  it("removing one from three keeps it", () => {
    const { s: s0, f, theirs } = atUpkeep(3, "next");
    const s = answer(settle(s0), "remove");
    expect(zoneOf(s, f)).toBe("battlefield");
    expect(s.objects[f]!.counters.doom).toBe(2);
    expect(zoneOf(s, theirs)).toBe("battlefield");
  });
  it("a bot moves toward the wipe only when it hurts its opponents more", () => {
    const { s: s0, opp } = atUpkeep(2, "next");
    const s = settle(s0);
    // The upkeep's player has a 7/7 that survives and a bear; the others have one bear: it doesn't want the wipe.
    expect(botActions(s, opp)[0]).toMatchObject({ type: "chooseOption", choice: "remove" });
  });
});

describe("Choice of Damnations", () => {
  /** You cast it at the next opponent, who controls five bears; it resolves up to their number. */
  const cast = () => {
    const { s: s0, ap, ids, opp } = setup([damnations()]);
    const bears = [1, 2, 3, 4, 5].map((i) => putOnBattlefield(s0, opp, bear({ name: `Bear ${i}` })));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    return { s, ap, opp, bears };
  };
  const number = (s: GameState, opp: PlayerId, n: number) => {
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "number", player: opp });
    return settle(act(s, { type: "chooseOption", player: opp, choice: String(n) }));
  };
  it("the target opponent chooses the number, then you may have them lose that much life", () => {
    const { s: s0, ap, opp } = cast();
    const s1 = number(s0, opp, 3);
    expect(s1.pending).toMatchObject({ kind: "chooseMay", player: ap });
    expect(s1.pending?.kind === "chooseMay" && s1.pending.prompt).toMatch(/lose 3 life/);
    const life = s1.players[opp]!.life;
    const s = settle(act(s1, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === opp).length).toBe(5);
  });
  it("if you don't, they keep that many permanents of their choice and sacrifice the rest", () => {
    const { s: s0, ap, opp, bears } = cast();
    const s1 = settle(act(number(s0, opp, 2), { type: "chooseMay", player: ap, yes: false }));
    expect(s1.pending).toMatchObject({ kind: "pickPermanents", action: "keep", player: opp, count: 2 });
    const life = s1.players[opp]!.life;
    const s = settle(act(s1, { type: "pickPermanents", player: opp, ids: [bears[0]!, bears[4]!] }));
    expect(bears.map((id) => zoneOf(s, id))).toEqual(["battlefield", "graveyard", "graveyard", "graveyard", "battlefield"]);
    expect(s.players[opp]!.life).toBe(life);
  });
  it("a number as great as their permanents sacrifices nothing; 0 sacrifices all of them", () => {
    const { s: s0, ap, opp, bears } = cast();
    const keepAll = settle(act(number(s0, opp, 9), { type: "chooseMay", player: ap, yes: false }));
    expect(bears.every((id) => zoneOf(keepAll, id) === "battlefield")).toBe(true);
    const none = settle(act(number(s0, opp, 0), { type: "chooseMay", player: ap, yes: false }));
    expect(bears.every((id) => zoneOf(none, id) === "graveyard")).toBe(true);
  });
  it("a bot as the target picks as many as it controls while that life is safe; as the caster, the worse for its target", () => {
    const { s: s0, ap, opp } = cast();
    expect(botActions(s0, opp)[0]).toMatchObject({ type: "chooseOption", choice: "5" });
    // Two bears kept of five: 3 bears sacrificed outweigh 2 life.
    expect(botActions(number(s0, opp, 2), ap)[0]).toMatchObject({ type: "chooseMay", yes: false });
    // All five kept: the life.
    expect(botActions(number(s0, opp, 5), ap)[0]).toMatchObject({ type: "chooseMay", yes: true });
  });
});

describe("Infernal Offering", () => {
  /** You and two opponents each have a creature on the battlefield and one in the graveyard; you cast it. */
  const cast = () => {
    const { s: s0, ap, ids } = setup([offering()]);
    const [b, c] = others(s0, ap);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const hers = putOnBattlefield(s0, b!, bear({ name: "Her Bear" }));
    const his = putOnBattlefield(s0, c!, bear({ name: "His Bear" }));
    const yard = (pid: PlayerId, name: string) => {
      const id = putOnBattlefield(s0, pid, bear({ name, power: "4", toughness: "4" }));
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "graveyard";
      s0.players[pid]!.graveyard.push(id);
      invalidateCharacteristics(s0);
      return id;
    };
    const myDead = yard(ap, "My Ogre");
    const herDead = yard(b!, "Her Ogre");
    const hisDead = yard(c!, "His Ogre");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    return { s, ap, b: b!, c: c!, mine, hers, his, myDead, herDead, hisDead };
  };
  const chooseOpp = (s: GameState, ap: PlayerId, opp: PlayerId) => {
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "opponent", player: ap });
    return settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
  };
  it("you and the chosen opponent each sacrifice a creature and draw two; then each returns a creature card", () => {
    const { s: s0, ap, b, c, mine, hers, his, myDead, herDead, hisDead } = cast();
    const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;
    const h0 = { ap: hand(s0, ap), b: hand(s0, b), c: hand(s0, c) };
    const s1 = chooseOpp(s0, ap, b);
    // Each has one creature: no choice to make.
    expect(zoneOf(s1, mine)).toBe("graveyard");
    expect(zoneOf(s1, hers)).toBe("graveyard");
    expect(zoneOf(s1, his)).toBe("battlefield");
    expect(hand(s1, ap)).toBe(h0.ap + 2);
    expect(hand(s1, b)).toBe(h0.b + 2);
    expect(hand(s1, c)).toBe(h0.c);
    // A different opponent for the second part: you choose your card first (two creature cards now), then they return theirs.
    const s2 = chooseOpp(s1, ap, c);
    expect(s2.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const s3 = settle(act(s2, { type: "searchLibrary", player: ap, found: [myDead] }));
    expect(zoneOf(s3, myDead)).toBe("battlefield");
    expect(s3.pending).toMatchObject({ kind: "searchLibrary", player: c, cards: [hisDead] });
    const s = settle(act(s3, { type: "searchLibrary", player: c, found: [hisDead] }));
    expect(zoneOf(s, myDead)).toBe("battlefield");
    expect(s.objects[myDead]!.controller).toBe(ap);
    expect(zoneOf(s, hisDead)).toBe("battlefield");
    expect(s.objects[hisDead]!.controller).toBe(c);
    expect(zoneOf(s, herDead)).toBe("graveyard");
  });
  it("an opponent with no creature sacrifices nothing and draws nothing", () => {
    const { s: s0, ap, b, hers } = cast();
    const g = structuredClone(s0);
    g.battlefield.splice(g.battlefield.indexOf(hers), 1);
    delete g.objects[hers];
    const before = g.players[b]!.hand.length;
    const s = chooseOpp(g, ap, b);
    expect(s.players[b]!.hand.length).toBe(before);
    expect(s.players[ap]!.hand.length).toBe(g.players[ap]!.hand.length + 2);
  });
  it("the same opponent may be chosen twice", () => {
    const { s: s0, ap, b, herDead } = cast();
    const s1 = chooseOpp(chooseOpp(s0, ap, b), ap, b);
    const s2 = settle(act(s1, { type: "searchLibrary", player: ap, found: [s1.pending?.kind === "searchLibrary" ? s1.pending.cards[0]! : ""] }));
    // Her sacrificed bear is in her graveyard too now: her choice.
    expect(s2.pending).toMatchObject({ kind: "searchLibrary", player: b });
    const s = settle(act(s2, { type: "searchLibrary", player: b, found: [herDead] }));
    expect(zoneOf(s, herDead)).toBe("battlefield");
    expect(s.objects[herDead]!.controller).toBe(b);
  });
});

describe("Hew the Entwood", () => {
  /** You have three Forests and cast it; your library's top cards are, from the top: Mind Stone, Divination, Forest, Mind Stone. */
  const cast = () => {
    const { s: s0, ap, ids } = setup([hew()]);
    const lands = [0, 1, 2].map(() => putOnBattlefield(s0, ap, forest));
    const deep = onTop(s0, ap, relic);
    const land = onTop(s0, ap, forest);
    const spell = onTop(s0, ap, sorcery);
    const stone = onTop(s0, ap, relic);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    return { s, ap, lands, top: [stone, spell, land, deep] };
  };
  it("X is the number of lands sacrificed on resolution; chosen artifacts enter, then chosen lands tapped, the rest go to the bottom", () => {
    const { s: s0, ap, lands, top } = cast();
    const [stone, spell, land, deep] = top as [ObjectId, ObjectId, ObjectId, ObjectId];
    expect(s0.pending).toMatchObject({ kind: "pickPermanents", player: ap, anyNumber: true });
    const s1 = settle(act(s0, { type: "pickPermanents", player: ap, ids: lands }));
    for (const l of lands) expect(zoneOf(s1, l)).toBe("graveyard");
    // Three revealed: Mind Stone, Divination and the Forest; the fourth card stays where it is.
    expect(s1.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const offered = s1.pending?.kind === "searchLibrary" ? s1.pending.cards : [];
    expect([...offered].sort()).toEqual([stone, land].sort());
    const s = settle(act(s1, { type: "searchLibrary", player: ap, found: [land, stone] }));
    expect(zoneOf(s, stone)).toBe("battlefield");
    expect(s.objects[stone]!.tapped).toBeFalsy();
    expect(zoneOf(s, land)).toBe("battlefield");
    expect(s.objects[land]!.tapped).toBe(true);
    const lib = s.players[ap]!.library;
    expect(lib[lib.length - 1]).toBe(spell);
    expect(lib[0]).toBe(deep);
    // The artifact entered first, then the land (chosen in the other order).
    expect(s.objects[stone]!.timestamp!).toBeLessThan(s.objects[land]!.timestamp!);
  });
  it("sacrificing fewer lands reveals fewer cards; choosing none puts them all on the bottom", () => {
    const { s: s0, ap, lands, top } = cast();
    const [stone, spell, land] = top as [ObjectId, ObjectId, ObjectId, ObjectId];
    const s1 = settle(act(s0, { type: "pickPermanents", player: ap, ids: [lands[0]!] }));
    expect(zoneOf(s1, lands[1]!)).toBe("battlefield");
    const offered = s1.pending?.kind === "searchLibrary" ? s1.pending.cards : [];
    expect(offered).toEqual([stone]);
    const s = settle(act(s1, { type: "searchLibrary", player: ap, found: [] }));
    expect(zoneOf(s, stone)).toBe("library");
    const lib = s.players[ap]!.library;
    expect(lib[lib.length - 1]).toBe(stone);
    expect(lib[0]).toBe(spell);
    expect(lib[1]).toBe(land);
  });
  it("sacrificing no lands reveals nothing", () => {
    const { s: s0, ap, lands, top } = cast();
    const before = [...s0.players[ap]!.library];
    const s = settle(act(s0, { type: "pickPermanents", player: ap, ids: [] }));
    expect(s.pending).toBeFalsy();
    for (const l of lands) expect(zoneOf(s, l)).toBe("battlefield");
    expect(s.players[ap]!.library).toEqual(before);
    expect(zoneOf(s, top[0]!)).toBe("library");
  });
  it("the bot sacrifices its lands and takes what it can", () => {
    const { s: s0, ap } = cast();
    let s = s0;
    for (let i = 0; i < 10 && s.pending; i++) s = settle(run(s, botActions(s, s.pending.player)));
    expect(s.pending).toBeFalsy();
    expect(s.stack.length).toBe(0);
    expect(s.players[ap]!.graveyard.some((id) => nameOf(s, id) === "Hew the Entwood")).toBe(true);
  });
});

describe("Druid of the Emerald Grove", () => {
  /** You cast it with an Island and a Forest on top of your library; its enters trigger asks for the search. */
  const cast = () => {
    const { s: s0, ap, ids } = setup([druid()]);
    const isle = onTop(s0, ap, island);
    const wood = onTop(s0, ap, forest);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    return { s, ap, isle, wood };
  };
  const found = (min: number, max: number, pick: (x: { isle: ObjectId; wood: ObjectId }) => ObjectId[]) => {
    const { s: s0, ap, isle, wood } = cast();
    expect(s0.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2 });
    const s = rigged(s0, (c) => settle(act(c, { type: "searchLibrary", player: ap, found: pick({ isle, wood }) })), (c) => { const r = rolled(c, "Druid of the Emerald Grove"); return r !== undefined && r >= min && r <= max; });
    return { s, ap, isle, wood };
  };
  it("the cards found stay in the library, revealed, while the die is rolled; 9 or less puts them into your hand", () => {
    const { s, ap, isle, wood } = found(1, 9, (x) => [x.isle, x.wood]);
    expect(zoneOf(s, isle)).toBe("hand");
    expect(zoneOf(s, wood)).toBe("hand");
    const t = s.log.map((e) => e.text);
    const searched = t.findIndex((x) => /searches their library, finds 2 cards \(Island, Forest\)\.$/.test(x));
    const roll = t.findIndex((x) => /rolls a d20 for Druid of the Emerald Grove/.test(x));
    const shuffled = t.lastIndexOf(`${s.players[ap]!.name} shuffles their library.`);
    expect(searched).toBeGreaterThanOrEqual(0);
    expect(roll).toBeGreaterThan(searched);
    expect(shuffled).toBeGreaterThan(roll);
  });
  it("10—19: you choose the one put onto the battlefield tapped; the other goes into your hand", () => {
    const { s: s0, ap, isle, wood } = found(10, 19, (x) => [x.isle, x.wood]);
    expect(s0.pending).toMatchObject({ kind: "chooseOption", what: "impulseChoice", player: ap });
    expect(zoneOf(s0, isle)).toBe("library");
    const s = settle(act(s0, { type: "chooseOption", player: ap, choice: isle }));
    expect(zoneOf(s, isle)).toBe("battlefield");
    expect(s.objects[isle]!.tapped).toBe(true);
    expect(zoneOf(s, wood)).toBe("hand");
  });
  it("10—19 with only one card found: it goes onto the battlefield tapped", () => {
    const { s, wood } = found(10, 19, (x) => [x.wood]);
    expect(s.pending).toBeFalsy();
    expect(zoneOf(s, wood)).toBe("battlefield");
    expect(s.objects[wood]!.tapped).toBe(true);
  });
  it("10—19 with two cards of one name: no question, one enters tapped and the other goes into your hand", () => {
    const { s: s0, ap, wood } = cast();
    const twin = s0.players[ap]!.library.find((id) => id !== wood && nameOf(s0, id) === "Forest")!;
    const s = rigged(s0, (c) => settle(act(c, { type: "searchLibrary", player: ap, found: [wood, twin] })), (c) => { const r = rolled(c, "Druid of the Emerald Grove"); return r !== undefined && r >= 10 && r <= 19; });
    expect(s.pending).toBeFalsy();
    expect([zoneOf(s, wood), zoneOf(s, twin)].sort()).toEqual(["battlefield", "hand"]);
  });
  it("20: both onto the battlefield tapped", () => {
    const { s, isle, wood } = found(20, 20, (x) => [x.isle, x.wood]);
    for (const id of [isle, wood]) {
      expect(zoneOf(s, id)).toBe("battlefield");
      expect(s.objects[id]!.tapped).toBe(true);
    }
  });
  it("finding nothing still rolls, and the library is shuffled", () => {
    const { s, ap } = found(1, 20, () => []);
    expect(s.pending).toBeFalsy();
    expect(s.log.some((e) => e.text === `${s.players[ap]!.name} shuffles their library.`)).toBe(true);
  });
  it("a bot answers the search and the choice", () => {
    const { s: s0 } = cast();
    let s = s0;
    for (let i = 0; i < 10 && s.pending; i++) s = settle(run(s, botActions(s, s.pending.player)));
    expect(s.pending).toBeFalsy();
    expect(s.stack.length).toBe(0);
  });
});
