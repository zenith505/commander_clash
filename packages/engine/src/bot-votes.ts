// How a bot votes (CR 701.38): for the choice whose result does it the most good, as far as a rough count can tell.

import { allEffects, type Amount, type Effect, type PlayerRef } from "./abilities";
import { defOf } from "./cards";
import { livingPlayers, obj, opponents, player } from "./game";
import { characteristics, controllerOf } from "./layers";
import { objectMatches } from "./effects";
import { groupValue, worth } from "./value";
import type { GameState, PlayerId } from "./types";
import { defMv } from "./faces";

/** The vote for `pid` to make (or to choose for another player, with Illusion of Choice): one of `options`. */
export function chooseVote(s: GameState, pid: PlayerId, options: string[]): string {
  const r = s.resolving;
  if (!r) return options[0]!;
  const controller = r.item.controller;
  const effects = r.body.effects;
  // A vote for a player (Mob Verdict, Círdan the Shipwright).
  if (options.every((o) => /^p:\d+$/.test(o))) return playerVote(s, pid, controller, effects, options);
  const words = options.filter((o) => o !== "none" && !o.includes("@"));
  // An extra vote that may be passed on: always worth taking, for whatever the first one was for.
  // "Each player may choose ..." (Druid of Purification): choosing nothing beats choosing something that hurts us.
  const none = r.scratch?.vote?.choose ? 0 : -Infinity;
  const score = (o: string) => (o === "none" ? none : o.includes("@") ? objectScore(s, pid, controller, effects, o) : words.length ? wordScore(s, pid, controller, effects, o) : 0);
  let best = options[0]!;
  for (const o of options) if (score(o) > score(best)) best = o;
  return best;
}

/**
 * A vote for a player: with Mob Verdict, the controller wants cards from votes for themselves only if no opponent is
 * worth hurting, and another voter hurts the strongest player who is neither the controller nor themselves; with Círdan,
 * a vote for ourselves is a card for us.
 */
function playerVote(s: GameState, pid: PlayerId, controller: PlayerId, effects: Effect[], options: string[]): string {
  const mob = allEffects(effects).some((e) => e.type === "playerVotes" && e.then === "mobVerdict");
  const strength = (q: PlayerId) => s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === q).reduce((n, o) => n + Math.max(1, worth(s, pid, o)), 0);
  const score = (o: string) => {
    const q = Number(o.slice(2));
    if (!mob) return q === pid ? 1 : 0;
    if (q === pid) return -1000;
    if (q === controller) return pid === controller ? 5 : -5;
    return strength(q);
  };
  return [...options].sort((a, b) => score(b) - score(a))[0]!;
}

/** A vote for a permanent or card: what the instructions about "each ... with the most votes" do to it, for us. */
function objectScore(s: GameState, pid: PlayerId, controller: PlayerId, effects: Effect[], choice: string): number {
  const o = s.objects[choice.split("@")[0]!];
  if (!o) return -Infinity;
  const about = allEffects(effects).filter((e) => JSON.stringify(e).includes('"ref":"voted"'));
  const harmful = about.some((e) => ["destroy", "exile", "tap", "putInLibrary", "sacrifice"].includes(e.type));
  if (o.zone === "battlefield") {
    const v = worth(s, pid, o);
    const mine = controllerOf(s, o) === pid;
    return harmful ? (mine ? -v : v) : mine ? v : -v;
  }
  // A card returned to its owner's hand (Custodi Squire): the best one for us, the worst for anyone else.
  const v = defMv(defOf(s, o));
  return (harmful ? -1 : 1) * (o.owner === pid ? v : -v);
}

/** A vote for a word: what the instructions that depend on it do, for us (`pid`), the vote being `controller`'s. */
function wordScore(s: GameState, pid: PlayerId, controller: PlayerId, effects: Effect[], option: string): number {
  let v = 0;
  const walk = (es: Effect[]) => {
    for (const e of es) {
      if (e.type === "if" && e.cond.kind === "voteWins") {
        // Council Guardian: protection from a color for the controller's permanent: worth the permanents of that color
        // its controller's opponents have, to its controller; to anyone else, the worse the more of their own it stops.
        const prot = e.cond.amongMost && e.effects.length === 1 && e.effects[0]!.type === "continuous" && e.effects[0]!.what.ref === "self" ? /^Protection from (white|blue|black|red|green)$/.exec(e.effects[0]!.mods.find((m) => m.kind === "addKeywords")?.keywords[0] ?? "") : null;
        if (prot && e.cond.option === option) {
          const color = ({ white: "W", blue: "U", black: "B", red: "R", green: "G" } as const)[prot[1] as "white"];
          const ofColor = (q: PlayerId) => s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === q && characteristics(s, obj(s, id)).colors.includes(color)).length;
          v += pid === controller ? opponents(s, controller).reduce((a, q) => a + ofColor(q), 0) : -ofColor(pid);
          continue;
        }
        if (e.cond.option === option) v += effectsValue(s, pid, controller, e.effects);
        continue;
      }
      // Expropriate's money vote: the caster takes one of the voter's permanents (the best one, say).
      if (e.type === "controlFromEach" && e.votedFor === option) {
        if (pid !== controller) v -= Math.max(0, ...s.battlefield.map((id) => obj(s, id)).filter((o) => o.owner === pid).map((o) => worth(s, pid, o)));
        continue;
      }
      // Travel Through Caradhras (round 383): one more vote for a word is one more basic land onto the battlefield, or one
      // more card back from the graveyard, for the controller (only if there's one to find or return).
      const per = e.type === "if" && e.cond.kind === "amountNow" && typeof e.cond.amount === "object" && "count" in e.cond.amount && e.cond.amount.count.kind === "votes" ? e.cond.amount.count.option : undefined;
      if (per !== undefined) {
        if (per === option) v += perVoteValue(s, pid, controller, e.type === "if" ? e.effects : []);
        continue;
      }
      // "For each strength vote": what one more vote for it adds.
      if (JSON.stringify(e).includes(`"option":${JSON.stringify(option)}`)) v += effectsValue(s, pid, controller, [e]);
    }
  };
  walk(effects);
  return v;
}

/** One more vote's worth of these (Travel Through Caradhras): a basic land found, or the best card in the controller's graveyard returned. */
function perVoteValue(s: GameState, pid: PlayerId, controller: PlayerId, es: Effect[]): number {
  let d = 0;
  const c = player(s, controller);
  for (const e of es) {
    if (e.type === "search" && c.library.some((id) => { const def = defOf(s, obj(s, id)); return def.types.includes("Land") && def.supertypes.includes("Basic"); })) d += 3;
    if (e.type === "chooseFromGraveyard" && c.graveyard.length) d += 2 + Math.max(...c.graveyard.map((id) => defMv(defOf(s, obj(s, id))))) / 2;
    // Fateful Tempest (round 384): a card milled is about 2 damage to each opponent (a land's 0, a spell's more); a card
    // exiled to play until the end of the caster's next turn is about as good as a card drawn.
    if (e.type === "mill" && c.library.length) d += opponents(s, controller).length;
    if (e.type === "impulse" && c.library.length) d += 2;
  }
  return pid === controller ? d : -d / 2;
}

/** Roughly what these instructions are worth to `pid`, done by `controller`: good for us, less than that bad for others. */
function effectsValue(s: GameState, pid: PlayerId, controller: PlayerId, es: Effect[]): number {
  let v = 0;
  const who = (r: PlayerRef | undefined): PlayerId[] =>
    !r ? [] : r.ref === "you" ? [controller] : r.ref === "eachOpponent" ? opponents(s, controller) : r.ref === "eachPlayer" ? livingPlayers(s) : [];
  // Something happening to player p is worth `d` to them: all of it for us, half of it against us for anyone else.
  const to = (ps: PlayerId[], d: number) => {
    for (const p of ps) v += p === pid ? d : -d / 2;
  };
  const n = (a: Amount) => (typeof a === "number" ? a : (a.times ?? 1) + (a.plus ?? 0));
  for (const e of es) {
    switch (e.type) {
      case "draw":
        to(who(e.who), 2.5 * n(e.n));
        break;
      case "gainLife":
        to(who(e.who), 0.4 * n(e.n));
        break;
      case "loseLife":
        to(who(e.who), -0.6 * n(e.n));
        break;
      case "discard":
        to(who(e.who), -2 * n(e.n));
        break;
      case "pick":
        // What each of them would sacrifice: their least valuable ones that fit.
        if (e.action === "sacrifice")
          for (const p of who(e.who)) {
            const theirs = s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === p && objectMatches(s, e.filter, o, p, false));
            const lost = theirs.map((o) => worth(s, p, o)).sort((a, b) => a - b).slice(0, n(e.n));
            to([p], -lost.reduce((x, y) => x + y, 0));
          }
        break;
      case "createToken":
        to([controller], 2 * n(e.n));
        break;
      // Trial of a Time Lord: the cards it exiled go for good instead of coming back: a loss to each owner as big as each
      // card's mana value (and more), worth as much to the vote's controller as it hurts them.
      case "untilLeavesToBottom": {
        const src = s.resolving?.item.sourceId ? s.objects[s.resolving.item.sourceId] : undefined;
        for (const l of src?.exiledUntilLeaves ?? []) {
          const c = s.objects[l.id];
          if (c?.zone !== "exile") continue;
          const w = 3 + defMv(defOf(s, c));
          to([c.owner], -w);
          if (c.owner !== controller) to([controller], w);
        }
        break;
      }
      case "extraTurn":
        to([controller], 10);
        break;
      case "sacrifice":
        if (e.what.ref === "self") to([controller], -4);
        break;
      case "returnAllFromGraveyard": {
        // "Each player returns each creature card from their graveyard": what each gets back.
        for (const p of e.owners ? livingPlayers(s) : [controller]) to([p], player(s, p).graveyard.filter((id) => defOf(s, obj(s, id)).typeLine.includes("Creature")).length * 3);
        break;
      }
      // Split Decision: countering the target spell costs its controller the spell; a copy is a spell for the vote's
      // controller (and the original still resolves).
      case "counterSpell":
      case "copySpell": {
        const t = s.resolving?.item.targets?.[e.type === "counterSpell" ? e.index : typeof e.spell === "object" && "target" in e.spell ? e.spell.target : -1];
        const item = t?.kind === "stack" ? s.stack.find((x) => x.id === t.id) : undefined;
        if (!item) break;
        const worthIt = 3 + (item.objectId ? defMv(defOf(s, obj(s, item.objectId))) : 0);
        to([e.type === "counterSpell" ? item.controller : controller], e.type === "counterSpell" ? -worthIt : worthIt);
        break;
      }
      case "counters":
        if ("what" in e && e.what.ref === "self") to([controller], n(e.n));
        else v += groupValue(s, pid, { targets: [], effects: [e], text: "" }) ?? 0;
        break;
      default:
        v += groupValue(s, pid, { targets: [], effects: [e], text: "" }) ?? 0;
    }
  }
  return v;
}
