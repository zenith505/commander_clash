// Round 452: Karn Liberated. "+4: Target player exiles a card from their hand. / −3: Exile target permanent. / −14:
// Restart the game, leaving in exile all non-Aura permanent cards exiled with Karn. Then put those cards onto the
// battlefield under your control." The restart (CR 727.1) starts a new game by rule 103 with Karn's controller going first
// (727.1a); every card is in it, ownership unchanged (727.2), except the exempted ones (727.5), a commander among them
// staying that deck's commander (727.5a); they're put onto the battlefield just before the first untap step (727.4).

import { describe, expect, it } from "vitest";
import { act, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, invalidateCharacteristics, isFullySupported, planActivate, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const karn = (): CardDef => ({"oracleId":"0ca233f4-1b7f-4807-ab6e-2b1f5439b3db","name":"Karn Liberated","manaCost":"{7}","cmc":7,"typeLine":"Legendary Planeswalker — Karn","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Karn"],"oracleText":"+4: Target player exiles a card from their hand.\n−3: Exile target permanent.\n−14: Restart the game, leaving in exile all non-Aura permanent cards exiled with Karn. Then put those cards onto the battlefield under your control.","loyalty":"6","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/4/740dbebf-9e0b-4918-850b-8c1aa0b06c18.jpg?1783919155","artUrl":"https://cards.scryfall.io/art_crop/front/7/4/740dbebf-9e0b-4918-850b-8c1aa0b06c18.jpg?1783919155","commanderLegal":"legal","set":"j22","releasedAt":"2022-12-02","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const mulldrifter = (): CardDef => ({"oracleId":"24d0f5e7-0d9e-4b76-900e-a7274e80312d","name":"Mulldrifter","manaCost":"{4}{U}","cmc":5,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"Flying\nWhen this creature enters, draw two cards.\nEvoke {2}{U} (You may cast this spell for its evoke cost. If you do, it's sacrificed when it enters.)","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Evoke"],"imageUrl":"https://cards.scryfall.io/normal/front/3/b/3bdcae2f-fcf3-4dfd-8818-606d16a03beb.jpg?1783925153","artUrl":"https://cards.scryfall.io/art_crop/front/3/b/3bdcae2f-fcf3-4dfd-8818-606d16a03beb.jpg?1783925153","commanderLegal":"legal","set":"sld","releasedAt":"2021-11-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const clone = (): CardDef => ({"oracleId":"42226b87-0746-4ebf-9fd0-108d508462af","name":"Clone","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"You may have this creature enter as a copy of any creature on the battlefield.","power":"0","toughness":"0","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48c2e9e2-f679-451d-a700-18104af08988.jpg?1784013893","commanderLegal":"legal","set":"sld","releasedAt":"2026-06-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const gauntlet = (): CardDef => ({"oracleId":"1182591d-8660-4a2e-8d77-2fc544b02b66","name":"Gauntlet of Power","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"As this artifact enters, choose a color.\nCreatures of the chosen color get +1/+1.\nWhenever a basic land is tapped for mana of the chosen color, its controller adds an additional one mana of that color.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5c3ac941-2af2-4652-9b3d-c62d04c8af60.jpg?1783937252","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5c3ac941-2af2-4652-9b3d-c62d04c8af60.jpg?1783937252","commanderLegal":"legal","set":"mps","releasedAt":"2016-09-30","rarity":"special","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const into = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the top of the stack resolves or something is asked. */
const top = (s: GameState) => {
  const n = s.stack.length;
  for (let i = 0; i < 8 && s.stack.length === n && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Activates Karn's ability `i` and lets it resolve. */
const karnDoes = (s: GameState, pid: PlayerId, karnId: string, i: number, targets?: TargetChoice[]) => top(run(s, planActivate(s, pid, karnId, i, targets)));
/** Every player keeps their opening hand (CR 103.5). */
const keepAll = (s: GameState) => {
  for (let i = 0; i < 8 && s.pending?.kind === "mulligan"; i++) s = act(s, { type: "mulligan", player: s.pending.player, keep: true });
  return s;
};
const cardsOwned = (s: GameState, pid: PlayerId) => Object.values(s.objects).filter((o) => o.owner === pid && !o.isToken && !o.emblem && !o.spellCopy).length;
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;

/** Karn with 30 loyalty on my battlefield, and the next player's Mulldrifter on theirs. */
function board() {
  const { s, ap, opp } = setup([]);
  const k = putOnBattlefield(s, ap, karn());
  s.objects[k]!.counters.loyalty = 30;
  const md = putOnBattlefield(s, opp, mulldrifter());
  invalidateCharacteristics(s);
  return { s, ap, opp, k, md };
}
/** On to my next turn's first main phase. */
const nextTurn = (s: GameState, ap: PlayerId) => passUntil(passUntil(s, "end", ap), "main1", ap);
/** Every opponent gets lands like mine (setup's), so no one is ahead on lands. */
const evenLands = (s: GameState, ap: PlayerId) => {
  const mine = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
  for (const p of s.players) if (p.id !== ap) for (const id of mine) putOnBattlefield(s, p.id, s.cards[s.objects[id]!.cardId]!);
  invalidateCharacteristics(s);
};

describe("Karn Liberated (round 452)", () => {
  it("is fully supported, its +4 and −3 exiles linked to its −14 (CR 607.2a)", () => {
    expect(isFullySupported(karn())).toBe(true);
    const c = compileCard(karn());
    expect(c.activated.map((a) => a.loyalty)).toEqual([4, -3, -14]);
    expect(JSON.stringify(c.activated[0]!.body.effects)).toContain('"linked":true');
    expect(JSON.stringify(c.activated[1]!.body.effects)).toContain('"linked":true');
    expect(c.activated[2]!.body.effects).toEqual([{ type: "restartGame" }]);
    expect(c.activated[2]!.sorcerySpeed).toBe(true);
  });

  it("restarts the game with Karn's controller first; the cards it exiled come back under their control before the first untap step (CR 727)", () => {
    let { s, ap, opp, k, md } = board();
    const before = s.players.map((p) => cardsOwned(s, p.id));
    // −3: the opponent's Mulldrifter.
    s = karnDoes(s, ap, k, 1, [tgt(md)]);
    expect(s.objects[md]!.zone).toBe("exile");
    // +4 next turn: the opponent exiles Lightning Bolt from their hand (an instant: not left in exile by the restart).
    s = nextTurn(s, ap);
    const bolt0 = into(s, opp, bolt());
    s = run(s, planActivate(s, ap, k, 0, [ply(opp)]));
    s = top(s);
    expect(s.pending).toMatchObject({ kind: "discard", player: opp, exile: true });
    s = act(s, { type: "discard", player: opp, objectIds: [bolt0] });
    expect(s.objects[bolt0]!.zone).toBe("exile");
    s.players[opp]!.life = 13;
    s.players[ap]!.commanderDamage = { x: 5 };
    // −14 the turn after.
    s = nextTurn(s, ap);
    const turnsBefore = s.turn;
    expect(turnsBefore).toBeGreaterThan(5);
    s = run(s, planActivate(s, ap, k, 2));
    s = top(s);
    // A new game: turn 1, Karn's controller the starting player, every opening hand drawn, mulligans asked.
    expect(s.turn).toBe(1);
    expect(s.activePlayer).toBe(ap);
    expect(s.pending).toMatchObject({ kind: "mulligan", player: ap, taken: 0 });
    expect(s.stack).toEqual([]);
    expect(s.battlefield).toEqual([]);
    expect(s.log.some((l) => l.text.includes("the game restarts"))).toBe(true);
    for (const p of s.players) {
      expect(p.life).toBe(40);
      expect(p.hand.length).toBe(7);
      expect(p.graveyard).toEqual([]);
      expect(p.command.length).toBe(1);
      expect(s.objects[p.command[0]!]!.isCommander).toBe(true);
      expect(Object.values(p.commanderCasts)).toEqual([0]);
      expect(p.commanderDamage).toEqual({});
      // Every card they own is in the new game (CR 727.2).
      expect(cardsOwned(s, p.id)).toBe(before[p.id]! + (p.id === opp ? 1 : 0));
    }
    // Karn went back into my deck; the exiled Bolt into its owner's.
    const karnNow = Object.values(s.objects).find((o) => o.owner === ap && nameOf(s, o.id) === "Karn Liberated")!;
    expect(["library", "hand"]).toContain(karnNow.zone);
    const boltNow = Object.values(s.objects).find((o) => nameOf(s, o.id) === "Lightning Bolt")!;
    expect(boltNow.owner).toBe(opp);
    expect(["library", "hand"]).toContain(boltNow.zone);
    // Mulldrifter stayed in exile, out of its owner's deck (CR 727.5).
    const mdNow = Object.values(s.objects).find((o) => nameOf(s, o.id) === "Mulldrifter")!;
    expect(mdNow.zone).toBe("exile");
    expect(mdNow.owner).toBe(opp);
    // Its 99 cards and the Bolt, the Mulldrifter staying out.
    expect(s.players[opp]!.library.length + s.players[opp]!.hand.length).toBe(99 + 1);
    // Everyone keeps: then Karn's ability finishes, Mulldrifter entering under my control (CR 727.4), and its enters
    // trigger waits for the first upkeep (rulings).
    s = keepAll(s);
    expect(s.objects[mdNow.id]!.zone).toBe("battlefield");
    expect(s.objects[mdNow.id]!.owner).toBe(opp);
    expect(s.objects[mdNow.id]!.controller).toBe(ap);
    expect(s.turn).toBe(1);
    expect(s.step).toBe("upkeep");
    expect(s.activePlayer).toBe(ap);
    expect(s.stack.map((i) => i.description)).toEqual([expect.stringContaining("Mulldrifter")]);
    expect(s.stack[0]!.controller).toBe(ap);
    expect(s.log.some((l) => l.text.includes("puts Mulldrifter onto the battlefield"))).toBe(true);
    // Under my control since my first turn began: it can attack this turn (rulings, CR 302.6).
    s = top(s);
    expect(s.players[ap]!.hand.length).toBe(9);
    s = passUntil(s, "declareAttackers", ap);
    expect(s.pending?.kind).toBe("declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: mdNow.id, defender: opp }] });
    expect(s.objects[mdNow.id]!.tapped).toBe(true);
  });

  it("leaves out Auras; a commander left in exile stays that deck's commander; a player who left isn't in the new game (CR 727.5a, rulings)", () => {
    let { s, ap, opp, k } = board();
    const order = s.turnOrder;
    const gone = order[(order.indexOf(ap) + 2) % 4]!;
    const cmd = s.players[opp]!.command[0]!;
    // As if Karn's abilities had exiled them: the opponent's commander (its owner didn't put it into the command zone), a
    // Pacifism, my Clone and my Gauntlet of Power.
    const exiled = (pid: PlayerId, def: CardDef | null, id0?: string) => {
      const id = id0 ?? putOnBattlefield(s, pid, def!);
      s.battlefield = s.battlefield.filter((x) => x !== id);
      s.players[pid]!.command = s.players[pid]!.command.filter((x) => x !== id);
      s.objects[id]!.zone = "exile";
      s.players[pid]!.exile.push(id);
      ((s.linkedExile ??= {})[`${k}@${s.objects[k]!.zoneChanges ?? 0}`] ??= []).push({ id, zc: s.objects[id]!.zoneChanges ?? 0 });
      return id;
    };
    exiled(opp, null, cmd);
    const pac = exiled(opp, pacifism());
    const cl = exiled(ap, clone());
    exiled(ap, gauntlet());
    s.players[opp]!.commanderCasts[cmd] = 3;
    invalidateCharacteristics(s);
    s = act(s, { type: "concede", player: gone });
    expect(s.players[gone]!.lost).toBe(true);
    s = run(s, planActivate(s, ap, k, 2));
    s = top(s);
    expect(s.turn).toBe(1);
    expect(s.players[gone]!.lost).toBe(true);
    expect(cardsOwned(s, gone)).toBe(0);
    expect(s.players[gone]!.hand).toEqual([]);
    // The commander waits in exile, not in the command zone, still a commander, its tax gone (CR 727.5a, rulings).
    expect(s.players[opp]!.command).toEqual([]);
    const cmdNow = Object.values(s.objects).find((o) => o.owner === opp && o.isCommander)!;
    expect(cmdNow.zone).toBe("exile");
    expect(s.players[opp]!.commanderCasts[cmdNow.id]).toBe(0);
    // The Aura went back into its owner's deck; the Clone waits in exile.
    const pacNow = Object.values(s.objects).find((o) => nameOf(s, o.id) === "Pacifism")!;
    expect(pacNow.id).not.toBe(pac);
    expect(["library", "hand"]).toContain(pacNow.zone);
    const clNow = Object.values(s.objects).find((o) => nameOf(s, o.id) === "Clone")!;
    expect(clNow.id).not.toBe(cl);
    expect(clNow.zone).toBe("exile");
    // Mulligans: the player who left isn't asked.
    const asked: PlayerId[] = [];
    for (let i = 0; i < 8 && s.pending?.kind === "mulligan"; i++) {
      asked.push(s.pending.player);
      s = act(s, { type: "mulligan", player: s.pending.player, keep: true });
    }
    expect(asked).not.toContain(gone);
    expect(asked.length).toBe(3);
    // Then they enter under my control at once (CR 727.4). Clone can't copy a creature entering with it (CR 707.5, 614.12),
    // so it's a 0/0 and dies (CR 704.5f); Gauntlet of Power's "as it enters" choice comes before the first turn begins.
    expect(s.objects[cmdNow.id]!.zone).toBe("battlefield");
    expect(s.objects[cmdNow.id]!.controller).toBe(ap);
    expect(s.objects[cmdNow.id]!.isCommander).toBe(true);
    expect(s.objects[clNow.id]!.zone).toBe("graveyard");
    expect(s.players[ap]!.graveyard).toContain(clNow.id);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "color" });
    expect(s.turn).toBe(1);
    expect(s.step).toBe("untap");
    const green = (s.pending as { options: string[] }).options.find((o) => /^g/i.test(o))!;
    s = act(s, { type: "chooseOption", player: ap, choice: green });
    expect(s.step).toBe("upkeep");
    expect(s.activePlayer).toBe(ap);
    expect(s.pending).toBeNull();
    // The opponent's commander, a 3/3 green creature, gets +1/+1, and can attack for me this turn (rulings).
    expect(pt(s, cmdNow.id)).toBe("4/4");
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: cmdNow.id, defender: opp }] });
    s = passUntil(s, "end", ap);
    // Combat damage from a commander counts against the player it hits (CR 903.10a), whoever controls it.
    expect(s.players[opp]!.life).toBe(36);
    expect(s.players[opp]!.commanderDamage[cmdNow.id]).toBe(4);
  });

  it("bots restart the game when the cards left in exile are worth more than their lead, and play on in the new game", () => {
    let { s, ap, opp, k, md } = board();
    evenLands(s, ap);
    s = karnDoes(s, ap, k, 1, [tgt(md)]);
    s = nextTurn(s, ap);
    // A bot's turn: it uses the −14 (its other abilities and spells aside).
    let restarted = false;
    for (let i = 0; i < 300 && !restarted; i++) {
      const pid = waitingOn(s)!;
      const before = s.turn;
      for (const a of botActions(s, pid)) s = act(s, a);
      restarted = s.turn < before;
    }
    expect(restarted).toBe(true);
    expect(s.activePlayer).toBe(ap);
    // Bots answer the mulligans and the game goes on into the first turn, Mulldrifter mine.
    for (let i = 0; i < 300 && (s.turn === 1 && s.step !== "main1"); i++) {
      const pid = waitingOn(s)!;
      for (const a of botActions(s, pid)) s = act(s, a);
    }
    expect(s.mulligans).toBeFalsy();
    const mdNow = Object.values(s.objects).find((o) => nameOf(s, o.id) === "Mulldrifter")!;
    expect(mdNow.zone).toBe("battlefield");
    expect(s.objects[mdNow.id]!.controller).toBe(ap);
    expect(s.turn).toBe(1);
  });

  it("bots don't restart a game they're well ahead in", () => {
    let { s, ap, k } = board();
    evenLands(s, ap);
    for (let i = 0; i < 6; i++) putOnBattlefield(s, ap, mulldrifter());
    invalidateCharacteristics(s);
    const plan = botActions(s, ap);
    expect(plan.some((a) => a.type === "activateAbility" && a.objectId === k && a.index === 2)).toBe(false);
  });
});
