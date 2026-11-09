// Round 321's sentences, read before round 320's (round320Sentence in oracle/round320.ts).
import type { Effect, TriggeredAbility } from "../abilities";
import type { Ctx } from "./body";
import { parseSearchFilter } from "./search";
import { parseSentence } from "./sentence";
import { parseTrigger } from "./triggers";
import { round322Sentence, round322Trigger } from "./round322";

type Found = { effect: Effect; next: number } | "fail" | null;

/** Several effects for one sentence: all but the last pushed before it. */
const pushed = (effects: Effect[], before: Effect[], last: Effect, next: number): Found => {
  effects.push(...before);
  return { effect: last, next };
};

export function round321Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 322's sentences first (oracle/round322.ts).
  const r322 = round322Sentence(s, sentences, si, ctx, effects);
  if (r322 !== null) return r322;
  const prev = effects.at(-1);
  // Sail into the West: "each player returns up to two cards from their graveyard to their hand, then you exile ~": the
  // spell exiles itself as it resolves instead of going to the graveyard (CR 608.2n). The splitter breaks it at ", then".
  if (ctx.spell && /^(?:Then )?you exile ~\.?$/i.test(s)) return { effect: { type: "exileSpell" }, next: si + 1 };
  // The same as a vote's outcome (Sail into the West, CR 701.38): one sentence there, read as two.
  const voteThenExile = ctx.spell ? /^If (.+?) gets more votes, (.+), then you exile ~$/.exec(s) : null;
  if (voteThenExile && ctx.vote?.options?.includes(voteThenExile[1]!)) {
    const inner = parseSentence(voteThenExile[2]!.charAt(0).toUpperCase() + voteThenExile[2]!.slice(1), ctx);
    if (!inner?.length) return "fail";
    return { effect: { type: "if", cond: { kind: "voteWins", option: voteThenExile[1]! }, effects: [...inner, { type: "exileSpell" }] }, next: si + 1 };
  }
  // Anzrag's Rampage: "... exile the top X cards of your library, where X is .... You may put a creature card exiled this
  // way onto the battlefield. It gains haste. Return it to your hand at the beginning of the next end step.": up to one of
  // those cards, a permanent card (CR 110.4b); "it" is the permanent it became (CR 400.7), its haste for good, and the
  // delayed trigger returns it at the next end step (CR 603.7).
  const putExiled = /^You may put an? ([a-z]+ card) exiled this way onto the battlefield$/.exec(s);
  if (putExiled && prev?.type === "exileTop" && prev.who.ref === "you" && !prev.putAll && sentences[si + 1] === "It gains haste" && /^Return it to your hand at the beginning of the next end step\.?$/.test(sentences[si + 2] ?? "")) {
    const filter = parseSearchFilter(putExiled[1]!);
    if (!filter || filter.kind !== "card") return "fail";
    return pushed(
      effects,
      [{ type: "putFromExiledTop", filter, may: true }, { type: "continuous", what: { ref: "created" }, mods: [{ kind: "addKeywords", keywords: ["Haste"] }], duration: "game" }],
      { type: "delayed", when: "nextEndStep", of: { ref: "created" }, effects: [{ type: "bounce", what: { ref: "subject" } }], text: "Return it to its owner's hand" },
      si + 3,
    );
  }
  // Eivor, Wolf-Kissed: "you mill that many cards. You may put a Saga card and/or a land card from among them onto the
  // battlefield.": up to one of each from among the milled cards, together (see putMilledPair).
  const pair = /^You may put (an? [A-Za-z]+ card) and\/or (an? [a-z]+ card) from among them onto the battlefield$/.exec(s);
  if (pair && prev?.type === "mill" && prev.who.ref === "you") {
    const filters = [pair[1]!, pair[2]!].map((w) => parseSearchFilter(w.replace(/^an? /, "")));
    if (filters.some((f) => !f || f.kind !== "card")) return "fail";
    return { effect: { type: "putMilledPair", filters: [filters[0]!, filters[1]!] }, next: si + 1 };
  }
  // Swooping Pteranodon: "... gain control of target creature an opponent controls until end of turn. ... At the beginning
  // of the next end step, target land deals 3 damage to that creature.": a delayed trigger about that creature (CR 603.7c),
  // its own target land chosen as it's put on the stack at the next end step (rulings, CR 603.3d), the land the source of
  // the damage. With no land to target it's removed from the stack (CR 603.3c).
  const landDeals = /^At the beginning of the next end step, target land deals (\d+) damage to that creature\.?$/.exec(s);
  if (landDeals && ctx.lastObjectTarget !== undefined && ctx.targets[ctx.lastObjectTarget]?.kind === "object" && !ctx.targets[ctx.lastObjectTarget]?.many) {
    const land = { kind: "object" as const, types: ["Land"], notTypes: [], notColors: [], text: "target land" };
    return { effect: { type: "delayed", when: "nextEndStep", of: { ref: "target", index: ctx.lastObjectTarget }, targets: [land], effects: [{ type: "damage", amount: Number(landDeals[1]), to: { ref: "subject" }, by: { target: 0 } }], text: `target land deals ${landDeals[1]} damage to that creature` }, next: si + 1 };
  }
  // Jace, Architect of Thought: "+1: Until your next turn, whenever a creature an opponent controls attacks, it gets -1/-0
  // until end of turn.": a delayed trigger until your next turn (CR 603.7b), once for each such attacking creature (CR
  // 508.3a), whoever or whatever it attacks (rulings); "an opponent" of this ability's controller.
  const untilNext = /^Until your next turn, whenever a creature an opponent controls attacks, (.+)$/.exec(s);
  if (untilNext) {
    const t = parseTrigger(`Whenever a creature attacks, ${[untilNext[1]!, ...sentences.slice(si + 1).map((x) => x.replace(/\.$/, ""))].join(". ")}.`);
    if (!t || t === "fail" || t.event !== "creatureYouControlAttacks" || !t.attacker?.anyone || t.attacker.attacksYou || t.attacker.other || t.ifCond || t.attacker.filter.controller) return "fail";
    const attacker = { ...t.attacker, filter: { ...t.attacker.filter, controller: "opponent" as const, text: "creature an opponent controls" } };
    return { effect: { type: "floatingTrigger", trigger: { ...t, attacker }, until: "yourNextTurn" }, next: sentences.length };
  }
  // Jace, Architect of Thought: "−8: For each player, search that player's library for a nonland card and exile it, then
  // that player shuffles. You may cast those cards without paying their mana costs.": all the searches first, then any
  // number of them cast one after another as it resolves (rulings, CR 608.2g), X as 0 (CR 107.3b); those not cast stay
  // exiled (rulings).
  const eachSearch = /^For each player, search that player's library for (an? [a-z]+ card) and exile it(, then that player shuffles)?$/.exec(s);
  const castAt = si + (eachSearch?.[2] ? 1 : 2);
  if (eachSearch && (eachSearch[2] || /^(?:Then t|T)hat player shuffles$/.test(sentences[si + 1] ?? "")) && /^You may cast those cards without paying their mana costs\.?$/.test(sentences[castAt] ?? "")) {
    const filter = parseSearchFilter(eachSearch[1]!.replace(/^an? /, ""));
    if (!filter || filter.kind !== "card") return "fail";
    return pushed(effects, [{ type: "searchEachExile", filter }], { type: "castFromAmong", who: { ref: "you" }, n: 0, fromSearched: true }, castAt + 1);
  }
  return null;
}

export function round321Trigger(raw: string): TriggeredAbility | "fail" | null {
  // Round 322's triggers first (oracle/round322.ts).
  const r322 = round322Trigger(raw);
  if (r322 !== null) return r322;
  // Hand of Vecna: "At the beginning of combat on your turn, equipped creature or a creature you control named Vecna gets
  // +X/+X until end of turn, where X is the number of cards in your hand.": one of them, chosen as it resolves, X counted
  // then (rulings); read as a choice of a creature you control, the choice made by chooseHostOrNamed instead.
  const vecna = /^(At the beginning of combat on your turn, )equipped creature or a creature you control named ([A-Z][a-z]+) (gets \+X\/\+X until end of turn, where X is the number of cards in your hand\.)$/.exec(raw);
  if (vecna) {
    const t = parseTrigger(`${vecna[1]!}choose a creature you control. It ${vecna[3]!}`);
    const e = t && t !== "fail" ? t.body.effects : undefined;
    if (!t || t === "fail" || t.event !== "yourBeginCombat" || e?.length !== 2 || e[0]!.type !== "pick" || e[1]!.type !== "continuous" || e[1]!.what.ref !== "created") return "fail";
    return { ...t, body: { ...t.body, effects: [{ type: "chooseHostOrNamed", named: vecna[2]! }, e[1]!], text: raw.replace(vecna[1]!, "") } };
  }
  // Curse of Surveillance: "At the beginning of enchanted player's upkeep, any number of target players other than that
  // player each draw cards equal to the number of Curses attached to that player.": the Curse's controller chooses the
  // targets, themselves included (rulings), never the enchanted player (CR 115.1); the count as it resolves.
  const others = /^(At the beginning of enchanted player's upkeep, any number of target players) other than that player (each draw [^.]+\.)$/.exec(raw);
  if (others) {
    const t = parseTrigger(`${others[1]!} ${others[2]!}`);
    const spec = t && t !== "fail" ? t.body.targets[0] : undefined;
    if (!t || t === "fail" || t.body.targets.length !== 1 || spec?.kind !== "player" || spec.many !== "any" || spec.opponent || spec.notEventPlayer) return "fail";
    return { ...t, body: { ...t.body, targets: [{ ...spec, notEventPlayer: true, text: "target player other than that player" }], text: raw.replace(/^At the beginning of enchanted player's upkeep, /, "") } };
  }
  // Nuka-Nuke Launcher: "Whenever equipped creature attacks, until the end of defending player's next turn, that player gets
  // two rad counters whenever they cast a spell.": a delayed trigger (CR 603.7b) for the spells the defending player (the
  // one it attacks, or the controller of the planeswalker it attacks, CR 506.2) casts until their next turn ends.
  const nuka = /^(Whenever equipped creature attacks), until the end of defending player's next turn, that player (gets [a-z]+ rad counters?) whenever they cast a spell\.$/.exec(raw);
  if (nuka) {
    const t = parseTrigger(`${nuka[1]!}, draw a card.`);
    const inner = parseTrigger(`Whenever a player casts a spell, that player ${nuka[2]!}.`);
    if (!t || t === "fail" || t.event !== "selfAttacks" || !inner || inner === "fail" || inner.event !== "castSpell" || inner.cast?.by !== "any") return "fail";
    return { ...t, body: { targets: [], effects: [{ type: "floatingTrigger", trigger: inner, until: "endOfYourNextTurn", forPlayer: { ref: "eventPlayer" } }], text: raw.replace(`${nuka[1]!}, `, "") } };
  }
  return null;
}
