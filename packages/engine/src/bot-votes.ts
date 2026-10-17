// How a bot votes (CR 701.38): for the choice whose result does it the most good, as far as a rough count can tell.

import { allEffects, type Amount, type Effect, type PlayerRef } from "./abilities";
import { defOf } from "./cards";
import { livingPlayers, obj, opponents, player } from "./game";
import { controllerOf } from "./layers";
import { objectMatches } from "./effects";
import { manaValue, parseManaCost } from "./mana";
import { groupValue, worth } from "./value";
import type { GameState, PlayerId } from "./types";

/** The vote for `pid` to make (or to choose for another player, with Illusion of Choice): one of `options`. */
export function chooseVote(s: GameState, pid: PlayerId, options: string[]): string {
  const r = s.resolving;
  if (!r) return options[0]!;
  const controller = r.item.controller;
  const effects = r.body.effects;
  const words = options.filter((o) => o !== "none" && !o.includes("@"));
  // An extra vote that may be passed on: always worth taking, for whatever the first one was for.
  const score = (o: string) => (o === "none" ? -Infinity : o.includes("@") ? objectScore(s, pid, controller, effects, o) : words.length ? wordScore(s, pid, controller, effects, o) : 0);
  let best = options[0]!;
  for (const o of options) if (score(o) > score(best)) best = o;
  return best;
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
  const v = manaValue(parseManaCost(defOf(s, o).manaCost));
  return (harmful ? -1 : 1) * (o.owner === pid ? v : -v);
}

/** A vote for a word: what the instructions that depend on it do, for us (`pid`), the vote being `controller`'s. */
function wordScore(s: GameState, pid: PlayerId, controller: PlayerId, effects: Effect[], option: string): number {
  let v = 0;
  const walk = (es: Effect[]) => {
    for (const e of es) {
      if (e.type === "if" && e.cond.kind === "voteWins") {
        if (e.cond.option === option) v += effectsValue(s, pid, controller, e.effects);
        continue;
      }
      // "For each strength vote": what one more vote for it adds.
      if (JSON.stringify(e).includes(`"option":${JSON.stringify(option)}`)) v += effectsValue(s, pid, controller, [e]);
    }
  };
  walk(effects);
  return v;
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
