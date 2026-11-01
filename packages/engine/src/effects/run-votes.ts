import type { Effect, TargetSpec } from "../abilities";
import { abilitiesOf, defOf, objIsType } from "../cards";
import { draw, log, loseLife, obj, player } from "../game";
import { invalidateCharacteristics } from "../layers";
import { putCounters, withPutter } from "../counters";
import { dealDamageBatch } from "../damage";
import { discardCards, discardToTop } from "./run-library";
import { fireEvent } from "./triggers";
import { controllerOf } from "../layers";
import type { GameObject, GameState, ObjectId, PlayerId } from "../types";
import { ResolveCtx, apnap, ctxSource, players, runEffect } from "./resolve";
import { objectMatches, printedMatches } from "./targeting";

/** Votes (CR 701.38): each player, starting with the controller and in turn order, votes for one of the choices. */
export function runVotesEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "chooseBlocks":
      // Odric: for this combat (the one its attack trigger is in); the last one to resolve decides.
      s.blocksChosenBy = { player: ctx.controller, turn: s.turn, combat: s.combatsThisTurn ?? 0 };
      log(s, `${player(s, ctx.controller).name} chooses which creatures block this combat and how they block.`);
      return;
    case "chooseVotes":
      // Illusion of Choice: the last one to resolve this turn decides (rulings).
      s.votesChosenBy = { player: ctx.controller, turn: s.turn };
      log(s, `${player(s, ctx.controller).name} chooses how each player votes this turn.`);
      return;
    case "secretNumbers": {
      // Each player chooses in turn order, none seeing another's number until all are revealed at once (rulings).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const st = (sc.numbers ??= { queue: turnOrderFrom(s, ctx.controller), chosen: {} });
      while (st.queue.length && !st.step) {
        const pid = st.queue[0]!;
        if (player(s, pid).lost) {
          st.queue.shift();
          continue;
        }
        if (st.pick === undefined) {
          s.pending = { kind: "chooseOption", player: pid, source: src, what: "secretNumber", options: ["0"], numberRange: { min: 0, max: 999 }, prompt: "secretly choose a number 0 or greater" };
          return "paused";
        }
        st.chosen[pid] = st.pick;
        st.pick = undefined;
        st.queue.shift();
        log(s, `${player(s, pid).name} secretly chooses a number.`);
      }
      const entries = Object.entries(st.chosen).map(([k, n]) => ({ pid: Number(k) as PlayerId, n }));
      if (!entries.length) return;
      const high = Math.max(...entries.map((x) => x.n));
      const low = Math.min(...entries.map((x) => x.n));
      const highest = entries.filter((x) => x.n === high).map((x) => x.pid);
      if (!st.step) {
        log(s, `The numbers are revealed: ${turnOrderFrom(s, ctx.controller).filter((p) => p in st.chosen).map((p) => `${player(s, p).name} ${st.chosen[p]}`).join(", ")}.`);
        if (e.then === "ogre") {
          // Menacing Ogre: each player with the highest number loses that much life; the counters if you're one of them.
          for (const pid of apnap(s, highest)) if (high > 0) loseLife(s, pid, high);
          const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
          if (highest.includes(ctx.controller) && o?.zone === "battlefield" && (ctx.sourceZc === undefined || (o.zoneChanges ?? 0) === ctx.sourceZc)) {
            withPutter(ctx.controller, () => putCounters(s, o, "+1/+1", 2));
            invalidateCharacteristics(s);
          }
          return;
        }
        // Wheel of Misfortune: the highest number as damage to each player who chose it, dealt at the same time.
        if (high > 0) dealDamageBatch(s, highest.map((pid) => ({ src: ctxSource(s, ctx), to: { player: pid }, n: high })));
        st.step = "discard";
      }
      if (st.step === "discard") {
        // Each player who didn't choose the lowest number discards their hand, then they draw seven (CR 101.4).
        const wheel = apnap(s, entries.filter((x) => x.n !== low).map((x) => x.pid)).filter((pid) => !player(s, pid).lost);
        const tops: Record<string, ObjectId[]> = {};
        for (const pid of wheel) {
          const t = discardToTop(s, pid, [...player(s, pid).hand], src, ctx);
          if (t === "paused") return "paused";
          tops[pid] = t;
        }
        for (const pid of wheel) {
          const hand = [...player(s, pid).hand];
          if (hand.length) discardCards(s, pid, hand, "", false, false, ctx.controller, undefined, tops[pid]);
        }
        st.step = "draw";
        st.draws = wheel;
      }
      while (st.draws?.length) {
        const pid = st.draws.shift()!;
        if (player(s, pid).lost) continue;
        log(s, `${player(s, pid).name} draws 7 cards.`);
        if (!draw(s, pid, 7)) return "paused";
      }
      return;
    }
    case "eachChooses": {
      // Each of them in APNAP order, seeing the earlier answers (CR 101.4).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const st = (sc.words ??= { queue: apnap(s, players(s, e.who, ctx)) });
      r.chose ??= {};
      while (st.queue.length) {
        const pid = st.queue[0]!;
        if (player(s, pid).lost) {
          st.queue.shift();
          continue;
        }
        // "For each player, choose friend or foe": this one's controller chooses for each of them, themselves too.
        if (st.pick === undefined) {
          s.pending = { kind: "chooseOption", player: e.byYou ? ctx.controller : pid, source: src, what: "word", options: e.options, labels: e.options.map((w) => w.charAt(0).toUpperCase() + w.slice(1)), prompt: e.byYou ? `${e.text} for ${pid === ctx.controller ? "yourself" : player(s, pid).name}` : e.text, ...(e.byYou ? { of: pid } : {}) };
          return "paused";
        }
        r.chose[pid] = st.pick;
        log(s, e.byYou ? `${player(s, ctx.controller).name} chooses ${st.pick} for ${pid === ctx.controller ? "themselves" : player(s, pid).name} (${src}).` : e.secret ? `${player(s, pid).name} secretly chooses (${src}).` : `${player(s, pid).name} chooses ${st.pick} (${src}).`);
        st.pick = undefined;
        st.queue.shift();
      }
      // Then the choices are revealed, all at once.
      if (e.secret) log(s, `The choices are revealed: ${Object.entries(r.chose).map(([p, w]) => `${player(s, Number(p)).name} ${w}`).join(", ")}.`);
      return;
    }
    case "controlFromEach": {
      // For each player who chose the word, in APNAP order, a creature they control, chosen by this one's controller
      // as it resolves (not targeted); then control of all of them changes at once.
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const st = (sc.fromEach ??= {
        queue: e.votedFor !== undefined ? (r.votes ?? []).filter((v) => v.choice === e.votedFor).map((v) => v.voter) : apnap(s, Object.entries(r.chose ?? {}).filter(([, w]) => w === e.chose).map(([k]) => Number(k) as PlayerId)),
        ids: [],
      });
      while (st.queue.length) {
        const pid = st.queue[0]!;
        // The answer to the question asked for this player (game.ts pickPermanents keeps it as the chooser's pick).
        const picked = sc.chosen?.[ctx.controller];
        if (picked) {
          st.ids.push(...picked);
          sc.chosen = undefined;
          st.queue.shift();
          continue;
        }
        // A permanent the voter owns, whoever controls it now (Expropriate); the same one may be chosen again.
        const options = player(s, pid).lost ? [] : s.battlefield.filter((id) => (e.votedFor !== undefined ? obj(s, id).owner === pid : controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature")));
        if (options.length > 1) {
          sc.queue = [ctx.controller];
          sc.chosen = {};
          s.pending = { kind: "pickPermanents", player: ctx.controller, source: src, action: "choose", what: e.votedFor !== undefined ? "permanent" : "creature", options, count: 1, of: pid, ...(e.votedFor !== undefined ? { owned: true as const } : {}) };
          return "paused";
        }
        st.ids.push(...options);
        st.queue.shift();
      }
      sc.queue = undefined;
      const ids = [...new Set(st.ids)].filter((id) => s.objects[id]?.zone === "battlefield");
      r.created = ids;
      if (!ids.length) return;
      log(s, `${player(s, ctx.controller).name} gains control of ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")}${e.duration === "endOfTurn" ? " until end of turn" : ""}.`);
      return runEffect(s, { type: "continuous", what: { ref: "created" }, mods: [{ kind: "control" }], duration: e.duration }, ctx);
    }
    case "vote": {
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (!sc.vote) {
        r.votes = [];
        // "Starting with the next opponent in turn order" (Sadistic Shell Game): the controller chooses last.
        const order = turnOrderFrom(s, ctx.controller);
        sc.vote = { queue: e.startNext ? [...order.slice(1), ...order.slice(0, 1)] : order, ...(e.choose ? { choose: true as const } : {}) };
      }
      const v = sc.vote;
      while (v.queue.length) {
        const voter = v.queue[0]!;
        // Every vote a player has, made at the time they'd vote (CR 701.38d): "you get an additional vote", and the ones
        // they may take or leave ("you may vote an additional time"), asked after the others.
        if (v.left === undefined) {
          // "Each player may choose": one pick or none, whatever gives extra votes.
          const extra = e.choose ? { get: 0, may: 0 } : extraVotes(s, voter);
          v.left = e.choose ? (e.mustChoose ? 1 : 0) : 1 + extra.get;
          v.may = e.choose ? (e.mustChoose ? 0 : 1) : extra.may;
        }
        const options = voteOptions(s, e, ctx, voter);
        // "A creature they control" with none: that player isn't asked (CR 101.3); the others still choose.
        if (!options.length && e.theirs) {
          v.queue.shift();
          v.left = undefined;
          v.may = undefined;
          continue;
        }
        if (!options.length) {
          // Nothing to vote for (no permanent of that kind): no votes, so nothing has the most (rulings on Council's Judgment).
          v.queue = [];
          break;
        }
        if (v.pick !== undefined) {
          if (v.pick !== "none") {
            r.votes!.push({ voter, choice: v.pick });
            log(s, e.choose ? `${player(s, voter).name} chose ${voteLabel(s, v.pick)}.` : e.secret ? `${player(s, voter).name} votes.` : `${player(s, voter).name} votes for ${voteLabel(s, v.pick)}.`);
          } else {
            if (e.choose) log(s, `${player(s, voter).name} chose nothing.`);
            v.may = 0;
          }
          v.pick = undefined;
          if (v.left > 0) v.left--;
          else if (v.may) v.may--;
        }
        if (v.left > 0 || v.may) {
          const optional = v.left === 0;
          const chooser = !e.choose && s.votesChosenBy?.turn === s.turn && !player(s, s.votesChosenBy.player).lost ? s.votesChosenBy.player : voter;
          const mine = r.votes!.filter((x) => x.voter === voter).length;
          // In turn order, everyone knows the votes made before theirs (rulings on Council's Judgment); a secret vote shows
          // only their own.
          const seen = e.secret ? r.votes!.filter((x) => x.voter === voter) : r.votes!;
          const so = seen.length ? ` (${seen.map((x) => `${player(s, x.voter).name}: ${voteLabel(s, x.choice)}`).join(", ")})` : "";
          const whose = chooser === voter ? "" : ` for ${player(s, voter).name}`;
          // "A creature you don't control": the controller's, said so to the other players.
          const what = voter === ctx.controller ? e.text : e.text.replace(/\byou don't control\b/, `${player(s, ctx.controller).name} doesn't control`);
          const prompt = e.choose ? `${what}${so}` : `vote${whose}${mine ? " an additional time" : ""}: ${e.text}${so}`;
          s.pending = {
            kind: "chooseOption",
            player: chooser,
            source: src,
            what: "vote",
            options: [...options, ...(optional ? ["none"] : [])],
            labels: [...options.map((o) => voteLabel(s, o)), ...(optional ? [e.choose ? "Choose nothing" : "No additional vote"] : [])],
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
      // "Whenever players finish voting" (Erestor of the Council): a vote, not "each player may choose" (CR 701.38).
      if (!e.choose && r.votes!.length) fireEvent(s, { type: "votesDone", votes: r.votes!.map((x) => ({ ...x })) });
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
export function voteOptions(s: GameState, e: Extract<Effect, { type: "vote" }>, ctx: ResolveCtx, voter?: PlayerId): string[] {
  if (e.options) return e.options;
  const among = e.among!;
  return voteCandidates(s, among, e.theirs && voter !== undefined ? voter : ctx.controller).map((o) => `${o.id}@${o.zoneChanges ?? 0}`);
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

/**
 * "Each permanent with the most votes or tied for most votes" (ObjRef "voted"), or with `any` "each permanent chosen this
 * way": still those objects (CR 400.7).
 */
export function votedObjects(s: GameState, any = false): GameObject[] {
  const tally = voteTally(s);
  const most = Math.max(0, ...tally.values());
  if (!most) return [];
  return [...tally].flatMap(([choice, n]) => {
    const [id, zc] = choice.split("@");
    const o = (any || n === most) && id ? s.objects[id] : undefined;
    return o && String(o.zoneChanges ?? 0) === zc ? [o] : [];
  });
}
