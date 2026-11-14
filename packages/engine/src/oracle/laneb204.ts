// Lane B round B204's lines, read by compileCard before its triggers and activated abilities (after round B202's).
import type { AbilityBody, CompiledCard, Effect } from "../abilities";
import { parseBody } from "./body";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";
import { parseSearchFilter } from "./search";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB204Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Journey to the Lost City: "At the beginning of your upkeep, exile the top four cards of your library, then roll a d20.
  // 1—9 | You may put a land card from among those cards onto the battlefield. 10—19 | Create a 2/2 green Wolf creature
  // token, then put a +1/+1 counter on it for each creature card among those cards. 20 | Put all permanent cards exiled
  // with ~ onto the battlefield, then sacrifice it.": "those cards" are the four this trigger exiled, still in exile;
  // "exiled with ~" is every card any of its upkeep triggers exiled while it's this object (CR 607.2a, 400.7), the four
  // just exiled among them; they enter at once under your control (CR 110.2a, 608.2f), only permanent cards (CR 110.4b).
  if (line === "At the beginning of your upkeep, exile the top four cards of your library, then roll a d20. 1—9 | You may put a land card from among those cards onto the battlefield. 10—19 | Create a 2/2 green Wolf creature token, then put a +1/+1 counter on it for each creature card among those cards. 20 | Put all permanent cards exiled with ~ onto the battlefield, then sacrifice it.") {
    const t = parseTrigger("At the beginning of your upkeep, exile the top four cards of your library, then roll a d20. 1—9 | Draw a card. 10—19 | Create a 2/2 green Wolf creature token, then put a +1/+1 counter on it for each creature card in your graveyard. 20 | Sacrifice ~.");
    const [exile, roll, low, mid, high] = t && t !== "fail" ? t.body.effects : [];
    const land = parseSearchFilter("land card");
    const creature = parseSearchFilter("creature card");
    const permanent = parseSearchFilter("permanent card");
    const range = (e: Effect | undefined, min: number, max: number) => e?.type === "if" && e.cond.kind === "rollIn" && e.cond.min === min && e.cond.max === max;
    const [wolf, counters] = mid?.type === "if" ? mid.effects : [];
    if (!t || t === "fail" || t.event !== "yourUpkeep" || t.ifCond || t.body.effects.length !== 5 || exile?.type !== "exileTop" || exile.n !== 4 || exile.who.ref !== "you" || roll?.type !== "roll" || roll.sides !== 20 || !range(low, 1, 9) || !range(mid, 10, 19) || !range(high, 20, 20) || wolf?.type !== "createToken" || counters?.type !== "counters" || counters.what.ref !== "created" || counters.counter !== "+1/+1" || high?.type !== "if" || high.effects.length !== 1 || high.effects[0]!.type !== "sacrifice" || !land || !creature || !permanent || land.kind !== "card" || creature.kind !== "card" || permanent.kind !== "card") {
      out.unsupported.push(raw);
      return true;
    }
    const effects: Effect[] = [
      { ...exile, linked: true },
      roll,
      { ...low!, effects: [{ type: "putFromExiledTop", filter: land, may: true }] } as Effect,
      { ...mid!, effects: [wolf, { ...counters, n: { count: { kind: "exiledTopMatching", filter: creature } } }] } as Effect,
      { ...high, effects: [{ type: "moveLinked", dest: "battlefield", filter: permanent }, high.effects[0]!] },
    ];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.replace(/^At the beginning of your upkeep, /, "") } });
    return true;
  }
  // Druid of the Emerald Grove: "When ~ enters, search your library for up to two basic land cards and reveal them, then
  // roll a d20. 9 or less | Put those cards into your hand, then shuffle. 10—19 | Put one of those cards onto the
  // battlefield tapped and the other into your hand, then shuffle. 20+ | Put those cards onto the battlefield tapped, then
  // shuffle.": the cards found stay in the library, revealed (CR 701.23a, 701.20a: no shuffle until the table says),
  // while the die is rolled (CR 706); then they go where the result says, if still there (CR 400.7). "One of those
  // cards" is the searcher's choice; with only one found it goes onto the battlefield, as with Cultivate (rulings).
  // "20+" counts a result raised above 20 (CR 706.4); "9 or less" one lowered below 1.
  if (line === "When ~ enters, search your library for up to two basic land cards and reveal them, then roll a d20. 9 or less | Put those cards into your hand, then shuffle. 10—19 | Put one of those cards onto the battlefield tapped and the other into your hand, then shuffle. 20+ | Put those cards onto the battlefield tapped, then shuffle.") {
    const t = parseTrigger("When ~ enters, search your library for up to two basic land cards, reveal them, put them into your hand, then shuffle.");
    const r = parseTrigger("When ~ enters, roll a d20. 9 or less | Draw a card. 10—19 | Draw two cards. 20+ | Draw three cards.");
    const search = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    const [roll, low, mid, high] = r && r !== "fail" ? r.body.effects : [];
    const range = (e: Effect | undefined, min: number | undefined, max: number | undefined) => e?.type === "if" && e.cond.kind === "rollIn" && e.cond.min === min && e.cond.max === max;
    if (!t || t === "fail" || !r || r === "fail" || t.event !== "selfEnters" || r.event !== "selfEnters" || t.ifCond || r.ifCond || search?.type !== "search" || search.n !== 2 || !search.upTo || !search.reveal || search.dest.zone !== "hand" || search.filter?.kind !== "card" || r.body.effects.length !== 4 || roll?.type !== "roll" || roll.sides !== 20 || !range(low, undefined, 9) || !range(mid, 10, 19) || !range(high, 20, undefined)) {
      out.unsupported.push(raw);
      return true;
    }
    const shuffle: Effect = { type: "shuffle", who: { ref: "you" }, ifSearched: true };
    const effects: Effect[] = [
      { ...search, dest: { zone: "reveal" }, noShuffle: true },
      roll,
      { ...low!, effects: [{ type: "putSearchFound", dest: { zone: "hand" } }, shuffle] } as Effect,
      { ...mid!, effects: [{ type: "putSearchFound", dest: { zone: "battlefield", tapped: true }, others: { zone: "hand" } }, shuffle] } as Effect,
      { ...high!, effects: [{ type: "putSearchFound", dest: { zone: "battlefield", tapped: true } }, shuffle] } as Effect,
    ];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  // Lavabrink Floodgates: "At the beginning of each player's upkeep, that player may put a doom counter on ~ or remove a
  // doom counter from it. Then if it has three or more doom counters on it, sacrifice ~. When you do, it deals 6 damage to
  // each creature.": the upkeep's player chooses, to put one on, remove one or do neither (rulings); it's sacrificed only
  // as this resolves, by its controller, if it still controls it (CR 701.21a), and only that sacrifice triggers the
  // reflexive damage (rulings, CR 603.12), dealt by it as it last existed (CR 608.2h).
  if (line === "At the beginning of each player's upkeep, that player may put a doom counter on ~ or remove a doom counter from it. Then if it has three or more doom counters on it, sacrifice ~. When you do, it deals 6 damage to each creature.") {
    const t = parseTrigger("At the beginning of each player's upkeep, put a doom counter on ~. Then if it has three or more doom counters on it, sacrifice ~.");
    const a = parseActivated("{T}: Sacrifice ~. When you do, ~ deals 6 damage to each creature.");
    const [put, then] = t && t !== "fail" ? t.body.effects : [];
    const here = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    const reflexive = here?.type === "if" && here.cond.kind === "selfHere" && here.cond.yours && here.effects.length === 2 && here.effects[0]!.type === "sacrifice" && here.effects[1]!.type === "reflexive" ? here.effects[1] : undefined;
    const dmg = reflexive?.type === "reflexive" && reflexive.body.effects.length === 1 ? reflexive.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "eachUpkeep" || t.ifCond || t.body.effects.length !== 2 || put?.type !== "counters" || put.what.ref !== "self" || put.counter !== "doom" || then?.type !== "if" || then.cond.kind !== "state" || then.cond.cond.kind !== "selfCounters" || then.cond.cond.counter !== "doom" || then.cond.cond.min !== 3 || then.effects.length !== 1 || then.effects[0]!.type !== "sacrifice" || !here || !reflexive || dmg?.type !== "damage" || dmg.amount !== 6) {
      out.unsupported.push(raw);
      return true;
    }
    const choice: Effect = { type: "counterKindsAddOrRemove", what: { ref: "self" }, kind: "doom", may: true, chooser: { ref: "eventPlayer" }, evenNone: true, wipeAt: { n: 3, damage: 6 } };
    out.triggers.push({ ...t, body: { targets: [], effects: [choice, { ...then, effects: [here] }], text: line.replace(/^At the beginning of each player's upkeep, /, "") } });
    return true;
  }
  return false;
}

/** Round B204's whole spells, read after round B201's: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB204Spell(text: string): AbilityBody | null | undefined {
  // Choice of Damnations: "Target opponent chooses a number. You may have that player lose that much life. If you don't,
  // that player sacrifices all but that many permanents of their choice.": any whole number 0 or more (CR 107.1, 107.3);
  // then you choose (rulings); "all but that many": they choose that many to keep and sacrifice the rest, nothing with as
  // many or fewer (rulings, CR 701.21a).
  if (text === "Target opponent chooses a number. You may have that player lose that much life. If you don't, that player sacrifices all but that many permanents of their choice.") {
    const body = parseBody("You may have target opponent lose 3 life. If you don't, that player chooses five permanents they control, then sacrifices the rest.", { spell: true });
    const [may, ifNot] = body?.effects ?? [];
    const lose = may?.type === "may" && may.effects.length === 1 ? may.effects[0] : undefined;
    const keep = ifNot?.type === "if" && ifNot.cond.kind === "youDid" && !ifNot.effects.length && ifNot.otherwise?.length === 1 ? ifNot.otherwise[0] : undefined;
    if (!body || body.targets.length !== 1 || body.effects.length !== 2 || may?.type !== "may" || lose?.type !== "loseLife" || lose.who.ref !== "target" || ifNot?.type !== "if" || keep?.type !== "keepRest" || keep.who.ref !== "target" || keep.keep.length !== 1) return null;
    const n = { count: { kind: "chosenNumber" as const } };
    const choose: Effect = { type: "choose", choice: "number", who: { ref: "target", index: 0 }, range: { min: 0, max: 999 }, damnation: true, prompt: "choose a number: Choice of Damnations' caster then has you lose that much life or sacrifice all but that many permanents" };
    const effects: Effect[] = [
      choose,
      { ...may, effects: [{ ...lose, n }], text: "have that player lose {n} life (if you don't, they sacrifice all but {n} permanents)" },
      { ...ifNot, otherwise: [{ ...keep, keep: [{ ...keep.keep[0]!, n: 0, nChosen: true }] }] },
    ];
    return { ...body, effects, text };
  }
  // Infernal Offering: "Choose an opponent. You and that player each sacrifice a creature. Each player who sacrificed a
  // creature this way draws two cards." then "Choose an opponent. Return a creature card from your graveyard to the
  // battlefield, then that player returns a creature card from their graveyard to the battlefield.": each opponent chosen
  // as it resolves, the same one or another (rulings, CR 608.2d), neither targeted; the sacrifices aren't optional, you
  // choose then they do (CR 101.4), and a player with no creature sacrifices nothing and draws nothing (rulings); you
  // choose your card, then they choose theirs, each entering under its owner's control (rulings, CR 110.2a).
  if (text === "Choose an opponent. You and that player each sacrifice a creature. Each player who sacrificed a creature this way draws two cards. Choose an opponent. Return a creature card from your graveyard to the battlefield, then that player returns a creature card from their graveyard to the battlefield.") {
    const first = parseBody("Choose an opponent. That player sacrifices a creature. Draw two cards.", { spell: true });
    const second = parseBody("Choose an opponent. Return a creature card from your graveyard to the battlefield.", { spell: true });
    const [choose1, sac, draw] = first?.effects ?? [];
    const [choose2, back] = second?.effects ?? [];
    if (!first || !second || first.targets.length || second.targets.length || first.effects.length !== 3 || second.effects.length !== 2 || choose1?.type !== "choose" || choose1.choice !== "opponent" || sac?.type !== "pick" || sac.action !== "sacrifice" || sac.who.ref !== "chosenPlayer" || sac.n !== 1 || draw?.type !== "draw" || draw.who.ref !== "you" || draw.n !== 2 || choose2?.type !== "choose" || choose2.choice !== "opponent" || back?.type !== "chooseFromGraveyard" || back.dest !== "battlefield" || back.who || back.n !== 1) return null;
    const effects: Effect[] = [choose1, { ...sac, who: { ref: "youAndChosenPlayer" } }, { ...draw, who: { ref: "sacrificedThisWay" } }, { ...choose2, again: true }, back, { ...back, who: { ref: "chosenPlayer" } }];
    return { targets: [], effects, text };
  }
  // Hew the Entwood: "Sacrifice any number of lands. Reveal the top X cards of your library, where X is the number of lands
  // sacrificed this way. Choose any number of artifact and/or land cards revealed this way. Put all nonland cards chosen
  // this way onto the battlefield, then put all land cards chosen this way onto the battlefield tapped, then put the rest on
  // the bottom of your library in a random order.": the lands sacrificed as it resolves, not as a cost (rulings); the
  // artifacts enter, then the lands enter tapped, triggers waiting until it has resolved (rulings, CR 603.3).
  if (text === "Sacrifice any number of lands. Reveal the top X cards of your library, where X is the number of lands sacrificed this way. Choose any number of artifact and/or land cards revealed this way. Put all nonland cards chosen this way onto the battlefield, then put all land cards chosen this way onto the battlefield tapped, then put the rest on the bottom of your library in a random order.") {
    const sac = parseBody("Sacrifice any number of lands, then draw that many cards.", { spell: true });
    const dig = parseBody("Reveal the top five cards of your library. Put any number of artifact and/or land cards from among them onto the battlefield and the rest on the bottom of your library in a random order.", { spell: true });
    const [pick, draw] = sac?.effects ?? [];
    const [d] = dig?.effects ?? [];
    if (!sac || !dig || sac.targets.length || dig.targets.length || sac.effects.length !== 2 || dig.effects.length !== 1 || pick?.type !== "pick" || pick.action !== "sacrifice" || !pick.anyNumber || draw?.type !== "draw" || d?.type !== "dig" || d.into !== "battlefield" || !d.reveal || !d.upTo || d.rest !== "bottom" || !d.random) return null;
    return { targets: [], effects: [pick, { ...d, n: draw.n, nonlandFirst: true }], text };
  }
  return undefined;
}
