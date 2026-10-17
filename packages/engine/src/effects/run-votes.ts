import type { Effect, TargetSpec } from "../abilities";
import { abilitiesOf, defOf } from "../cards";
import { log, obj, player } from "../game";
import { controllerOf } from "../layers";
import type { GameObject, GameState, PlayerId } from "../types";
import { ResolveCtx } from "./resolve";
import { objectMatches, printedMatches } from "./targeting";

/** Votes (CR 701.38): each player, starting with the controller and in turn order, votes for one of the choices. */
export function runVotesEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "chooseVotes":
      // Illusion of Choice: the last one to resolve this turn decides (rulings).
      s.votesChosenBy = { player: ctx.controller, turn: s.turn };
      log(s, `${player(s, ctx.controller).name} chooses how each player votes this turn.`);
      return;
    case "vote": {
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (!sc.vote) {
        r.votes = [];
        sc.vote = { queue: turnOrderFrom(s, ctx.controller) };
      }
      const v = sc.vote;
      while (v.queue.length) {
        const voter = v.queue[0]!;
        // Every vote a player has, made at the time they'd vote (CR 701.38d): "you get an additional vote", and the ones
        // they may take or leave ("you may vote an additional time"), asked after the others.
        if (v.left === undefined) {
          const extra = extraVotes(s, voter);
          v.left = 1 + extra.get;
          v.may = extra.may;
        }
        const options = voteOptions(s, e, ctx);
        if (!options.length) {
          // Nothing to vote for (no permanent of that kind): no votes, so nothing has the most (rulings on Council's Judgment).
          v.queue = [];
          break;
        }
        if (v.pick !== undefined) {
          if (v.pick !== "none") {
            r.votes!.push({ voter, choice: v.pick });
            log(s, e.secret ? `${player(s, voter).name} votes.` : `${player(s, voter).name} votes for ${voteLabel(s, v.pick)}.`);
          } else v.may = 0;
          v.pick = undefined;
          if (v.left > 0) v.left--;
          else if (v.may) v.may--;
        }
        if (v.left > 0 || v.may) {
          const optional = v.left === 0;
          const chooser = s.votesChosenBy?.turn === s.turn && !player(s, s.votesChosenBy.player).lost ? s.votesChosenBy.player : voter;
          const mine = r.votes!.filter((x) => x.voter === voter).length;
          // In turn order, everyone knows the votes made before theirs (rulings on Council's Judgment); a secret vote shows
          // only their own.
          const seen = e.secret ? r.votes!.filter((x) => x.voter === voter) : r.votes!;
          const so = seen.length ? ` (${seen.map((x) => `${player(s, x.voter).name}: ${voteLabel(s, x.choice)}`).join(", ")})` : "";
          const whose = chooser === voter ? "" : ` for ${player(s, voter).name}`;
          const prompt = `vote${whose}${mine ? " an additional time" : ""}: ${e.text}${so}`;
          s.pending = {
            kind: "chooseOption",
            player: chooser,
            source: src,
            what: "vote",
            options: [...options, ...(optional ? ["none"] : [])],
            labels: [...options.map((o) => voteLabel(s, o)), ...(optional ? ["No additional vote"] : [])],
            prompt,
            ...(chooser !== voter ? { voter } : {}),
          };
          return "paused";
        }
        v.queue.shift();
        v.left = undefined;
        v.may = undefined;
      }
      if (e.secret) log(s, `The votes are revealed: ${r.votes!.map((x) => `${player(s, x.voter).name} for ${voteLabel(s, x.choice)}`).join(", ") || "none"}.`);
      return;
    }
  }
}

/** The living players in turn order, starting with `first` (CR 701.38a, 101.4). */
function turnOrderFrom(s: GameState, first: PlayerId): PlayerId[] {
  const i = Math.max(0, s.turnOrder.indexOf(first));
  return [...s.turnOrder.slice(i), ...s.turnOrder.slice(0, i)].filter((p) => !player(s, p).lost);
}

/** The extra votes `pid` has from the permanents they control: each one counts (rulings on Brago's Representative). */
function extraVotes(s: GameState, pid: PlayerId): { get: number; may: number } {
  const out = { get: 0, may: 0 };
  for (const id of s.battlefield) {
    const o = obj(s, id);
    const x = abilitiesOf(s, o).extraVote;
    if (x && controllerOf(s, o) === pid) out[x]++;
  }
  return out;
}

/**
 * What can be voted for: the words, or the permanents or cards that match, as the controller sees them ("a nonland
 * permanent you don't control"). They aren't targeted (rulings on Council's Judgment). An object is "id@zc", so a vote
 * is for that object only (CR 400.7).
 */
export function voteOptions(s: GameState, e: Extract<Effect, { type: "vote" }>, ctx: ResolveCtx): string[] {
  if (e.options) return e.options;
  const among = e.among!;
  return voteCandidates(s, among, ctx.controller).map((o) => `${o.id}@${o.zoneChanges ?? 0}`);
}

function voteCandidates(s: GameState, among: TargetSpec, controller: PlayerId): GameObject[] {
  if (among.kind === "card") {
    const owners = among.owner === "you" ? [controller] : s.players.filter((p) => !p.lost && (among.owner !== "opponent" || p.id !== controller)).map((p) => p.id);
    return owners.flatMap((pid) => player(s, pid).graveyard.map((id) => obj(s, id)).filter((o) => printedMatches(among, defOf(s, o))));
  }
  return s.battlefield.map((id) => obj(s, id)).filter((o) => objectMatches(s, among, o, controller, false));
}

/** A vote's choice for people: the word, or the permanent or card with its controller or owner. */
export function voteLabel(s: GameState, choice: string): string {
  const [id] = choice.split("@");
  const o = id ? s.objects[id] : undefined;
  if (!o || !choice.includes("@")) return choice;
  const who = o.zone === "battlefield" ? player(s, controllerOf(s, o)).name : player(s, o.owner).name;
  return `${defOf(s, o).name} (${who})`;
}

/** How many votes each choice got in the ability resolving now. */
export function voteTally(s: GameState): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of s.resolving?.votes ?? []) out.set(v.choice, (out.get(v.choice) ?? 0) + 1);
  return out;
}

/**
 * "If death gets more votes" (SpellCondition "voteWins"): more votes than each other choice; with `orTie`, also when two or
 * more choices share the most (rulings on Coercive Portal: "the vote is tied" means a tie for the most).
 */
export function voteWins(s: GameState, option: string, orTie: boolean): boolean {
  const tally = voteTally(s);
  const most = Math.max(0, ...tally.values());
  const n = tally.get(option) ?? 0;
  const top = [...tally.values()].filter((x) => x === most).length;
  if (n === most && n > 0 && top === 1) return true;
  return orTie && top > 1;
}

/** "Each permanent with the most votes or tied for most votes" (ObjRef "voted"): still those objects (CR 400.7). */
export function votedObjects(s: GameState): GameObject[] {
  const tally = voteTally(s);
  const most = Math.max(0, ...tally.values());
  if (!most) return [];
  return [...tally].flatMap(([choice, n]) => {
    const [id, zc] = choice.split("@");
    const o = n === most && id ? s.objects[id] : undefined;
    return o && String(o.zoneChanges ?? 0) === zc ? [o] : [];
  });
}
