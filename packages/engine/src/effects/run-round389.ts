// Round 389's effects: The Pandorica's delayed phase in (Effect phaseInSubject) and Over the Top's reveal for every player
// (Effect overTheTop).
import { characteristics, controllerOf } from "../layers";
import { defOf, isPermanentCard } from "../cards";
import { enterTogether, livingPlayers, log, moveObject, obj, player } from "../game";
import { phaseIn } from "../phasing";
import type { GameState, ObjectId } from "../types";
import type { ResolveCtx } from "./resolve";
import { apnap as inApnap } from "./resolve";
import { chooseAuraHosts } from "./run-zones";

/**
 * The Pandorica: "When ~ becomes untapped or leaves the battlefield, that permanent phases in.": the permanent its ability
 * phased out, if it's still that object and still phased out (CR 400.7: phasing doesn't change zones, CR 702.26d). What
 * else stops it phasing in still does (Disciple of Caelus Nin, another lock; phasing.ts phaseIn).
 */
export function runPhaseInSubjectEffect(s: GameState, ctx: ResolveCtx, src: string) {
  const sub = ctx.subject;
  const o = sub ? s.objects[sub.id] : undefined;
  if (!o || o.zone !== "phasedOut" || (o.zoneChanges ?? 0) !== sub!.zc || o.phased?.indirect) {
    log(s, `${src}: nothing phases in.`);
    return;
  }
  phaseIn(s, [o.id]);
}

/**
 * Over the Top: each player counts the nonland permanents they control as it resolves (phased-out ones are treated as
 * though they don't exist, CR 702.26b) and reveals that many cards from the top of their library (all of it if fewer).
 * All the permanent cards revealed (CR 110.4a: artifact, battle, creature, enchantment, land, planeswalker) are put onto
 * the battlefield at once (each player's actions in an "each player" instruction happen at the same time, CR 101.4),
 * each under the control of the player who put it there (CR 110.2a); an Aura's player chooses what it enchants among what
 * is already on the battlefield, the active player first, then each other player in turn order (CR 303.4f, 101.4), and
 * one with nothing to enchant stays in the library (CR 303.4g). Then the rest of the revealed cards, every one that wasn't
 * put onto the battlefield, go into their owners' graveyards.
 */
export function runOverTheTopEffect(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const apnap = inApnap(s, livingPlayers(s));
  if (!sc.overTop) {
    const revealed: Record<number, ObjectId[]> = {};
    for (const pid of apnap) {
      const p = player(s, pid);
      const n = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && !characteristics(s, obj(s, id)).types.includes("Land")).length;
      revealed[pid] = p.library.slice(0, n);
      log(s, `${p.name} controls ${n} nonland permanent${n === 1 ? "" : "s"} and reveals ${revealed[pid]!.length ? revealed[pid]!.map((id) => defOf(s, obj(s, id)).name).join(", ") : "no cards"} (${src}).`);
    }
    sc.overTop = { revealed };
  }
  const st = sc.overTop;
  const stillThere = (pid: number) => (st.revealed[pid] ?? []).filter((id) => s.objects[id]?.zone === "library" && player(s, pid).library.includes(id));
  if (!st.entered) {
    const cards = apnap.flatMap((pid) => stillThere(pid).filter((id) => isPermanentCard(defOf(s, obj(s, id)))).map((id) => ({ o: obj(s, id), under: pid })));
    const hosts = chooseAuraHosts(s, cards, src);
    if (hosts === "paused") return "paused";
    const going = cards.filter(({ o }) => !defOf(s, o).subtypes.includes("Aura") || hosts.has(o.id));
    for (const { o } of cards) if (sc.auraHosts) delete sc.auraHosts[o.id];
    enterTogether(s, () => {
      for (const { o, under } of going) moveObject(s, o.id, "battlefield", { controller: under, putBy: under, ...hosts.get(o.id) });
    });
    if (going.length) log(s, `${going.map(({ o }) => defOf(s, o).name).join(", ")} ${going.length === 1 ? "is" : "are"} put onto the battlefield (${src}).`);
    st.entered = true;
  }
  for (const pid of apnap) {
    const rest = stillThere(pid);
    for (const id of rest) moveObject(s, id, "graveyard");
    if (rest.length) log(s, `${player(s, pid).name} puts ${rest.map((id) => defOf(s, obj(s, id)).name).join(", ")} into their graveyard (${src}).`);
  }
  sc.overTop = undefined;
}

