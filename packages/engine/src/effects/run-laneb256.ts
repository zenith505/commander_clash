// Lane B round B256's effects: False Orders and Balduvian Warlord (reblock), Raiding Party (raidingParty), Search the City
// (searchTheCity).
import type { Effect } from "../abilities";
import { canBeSacrificed, defOf, objIsType } from "../cards";
import { blockQualities, destroyPermanent, log, moveObject, obj, player, tapPermanent } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import { hasName } from "../faces";
import type { GameObject, GameState, ObjectId } from "../types";
import { apnap, objects, runEffect, type ResolveCtx } from "./resolve";
import { defendingAgainst } from "./run-tokens";
import { fireEvent } from "./triggers";

type B256Effect = Extract<Effect, { type: "reblock" | "raidingParty" | "searchTheCity" }>;

const same = (o: GameObject | undefined, zc: number): o is GameObject => !!o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === zc;

/**
 * The attacking creatures `o` could be made to block (False Orders, Balduvian Warlord): those attacking its controller, a
 * planeswalker they control or a battle they protect (CR 802.4a; 506.3e for one put onto the battlefield blocking). It must
 * still be a creature that isn't a battle and isn't attacking (CR 506.3, 506.3f). Blocking restrictions and costs aren't
 * checked: they apply only as blockers are declared (CR 509.1b-d), and this isn't a declaration.
 */
export function reblockOptions(s: GameState, o: GameObject): ObjectId[] {
  if (o.zone !== "battlefield" || !objIsType(s, o, "Creature") || objIsType(s, o, "Battle") || o.attacking !== undefined || o.attackingPermanent) return [];
  const pid = controllerOf(s, o);
  return s.battlefield.filter((id) => {
    const a = obj(s, id);
    return id !== o.id && (a.attacking !== undefined || !!a.attackingPermanent) && controllerOf(s, a) !== pid && defendingAgainst(s, pid, a) && !(o.blocking ?? []).includes(id);
  });
}

/**
 * `bl` blocks `at` by an effect (CR 509.3a-d): `at` becomes a blocked creature (CR 509.1h), and every other creature in its
 * band with it (CR 702.22i). Not declared as a blocker (declaredInCombat stays unset), but it's a block of this combat for
 * "blocked by only that creature this combat" (TurnLog.blocks). Its "blocks" and "becomes blocked" abilities trigger
 * (event blockedByEffect).
 */
export function blockByEffect(s: GameState, bl: GameObject, at: GameObject, src: string, /** Sorrow's Path (round B258): a swap that leaves each attacker blocked by as many creatures as before, so no "blocked by N or more" crossing. */ swap?: true) {
  const wasBlocking = !!bl.blocking?.length;
  const band = at.band ? s.battlefield.map((id) => obj(s, id)).filter((m) => m.band === at.band && m.attacking !== undefined) : [at];
  const members = band.includes(at) ? band : [at, ...band];
  const newlyBlocked: ObjectId[] = [];
  for (const m of members) {
    if (bl.blocking?.includes(m.id)) continue;
    if (!m.blockedBy) newlyBlocked.push(m.id);
    (bl.blocking ??= []).push(m.id);
    (m.blockedBy ??= []).push(bl.id);
    m.becameBlockedTurn = s.turn;
    ((s.turnLog ??= {}).blocks ??= []).push({ blocker: `${bl.id}@${bl.zoneChanges ?? 0}`, attacker: `${m.id}@${m.zoneChanges ?? 0}`, combat: s.combatsThisTurn ?? 0, ...blockQualities(s, bl, m), ac: controllerOf(s, m) });
  }
  bl.blockedTurn = s.turn;
  invalidateCharacteristics(s);
  log(s, `${defOf(s, bl).name} blocks ${members.map((m) => defOf(s, m).name).join(" and ")} (${src}).`);
  fireEvent(s, { type: "blockedByEffect", blocker: bl.id, attackers: members.map((m) => m.id), newlyBlocked, newBlocker: !wasBlocking, ...(swap ? { swap } : {}) });
}

/**
 * `bl` was put onto the battlefield blocking `at` (Aetherplasm, round B261; CR 509.4): only a creature that isn't a battle
 * (CR 506.3a, 506.3f), and only if `at` is attacking its controller, a planeswalker they control or a battle they protect
 * (CR 506.3e, 509.4a). It's blocking but it never "blocked" (CR 509.4): not declared, not in TurnLog.blocks, none of its
 * "blocks" abilities trigger (CR 509.3a-b), while the attacker's "becomes blocked by a creature" ones do (CR 509.3d), and
 * "becomes blocked" only if it was unblocked then (CR 509.3c). Requirements and restrictions on blocks don't apply (CR
 * 509.4b).
 */
export function enterBlocking(s: GameState, bl: GameObject, at: GameObject, src: string) {
  if (bl.zone !== "battlefield" || !objIsType(s, bl, "Creature") || objIsType(s, bl, "Battle") || at.zone !== "battlefield" || at.attacking === undefined || !defendingAgainst(s, controllerOf(s, bl), at)) return;
  const fresh = !at.blockedBy;
  bl.blocking = [at.id];
  (at.blockedBy ??= []).push(bl.id);
  at.becameBlockedTurn = s.turn;
  invalidateCharacteristics(s);
  log(s, `${defOf(s, bl).name} is blocking ${defOf(s, at).name} (${src}).`);
  fireEvent(s, { type: "blockedByEffect", blocker: bl.id, attackers: [at.id], newlyBlocked: fresh ? [at.id] : [], newBlocker: false, entered: true });
}

export function runLaneB256Effect(s: GameState, e: B256Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  switch (e.type) {
    case "reblock": {
      if (!sc.reblock) {
        // An illegal target does nothing (CR 608.2b); the spell or ability isn't countered for that here, objects() leaves it out.
        const o = objects(s, e.what, ctx).find((x) => x.zone === "battlefield");
        if (!o) return;
        // Removed from combat (CR 506.4): the attackers that only it had blocked this combat become unblocked (rulings:
        // even if their other blockers are gone, or were removed by another Warlord).
        if (o.attacking !== undefined || o.blocking !== undefined) {
          const r = runEffect(s, { type: "removeFromCombat", what: e.what, unblockOnly: true }, ctx);
          if (r === "paused") return r;
        }
        sc.reblock = { id: o.id, zc: o.zoneChanges ?? 0 };
        const options = reblockOptions(s, o);
        if (!options.length) {
          log(s, `${src}: there's no attacking creature ${defOf(s, o).name} could block.`);
          sc.reblock.choice = "none";
          return;
        }
        const name = defOf(s, o).name;
        s.pending = {
          kind: "chooseOption",
          player: ctx.controller,
          source: src,
          what: "reblockAttacker",
          about: o.id,
          options: [...options, ...(e.may ? ["none"] : [])],
          labels: [...options.map((id) => `${name} blocks ${defOf(s, obj(s, id)).name}`), ...(e.may ? [`${name} doesn't block`] : [])],
          prompt: `choose an attacking creature for ${name} to block${e.may ? ", if you want" : ""}`,
        };
        return "paused";
      }
      const st = sc.reblock;
      if (st.choice === undefined || st.choice === "none") return;
      const o = s.objects[st.id];
      const at = s.objects[st.choice];
      // Still the same creature, and the attacker still one it could block, as the choice is acted on.
      if (!same(o, st.zc) || !at || !reblockOptions(s, o).includes(at.id)) return;
      st.choice = "none";
      blockByEffect(s, o, at, src);
      return;
    }
    case "raidingParty": {
      // CR 101.4: each player in turn order from the active player makes their choices, seeing the earlier ones: the
      // creatures to tap, then up to two Plains for each (anyone's; zero or one too, rulings); then the creatures are tapped
      // together, as it resolves (rulings), and all the Plains nobody chose are destroyed at once (CR 608.2c). White as it
      // resolves (rulings: Sleight of Mind can't change the color now).
      const raid = (sc.raid ??= { queue: apnap(s, s.turnOrder.filter((pid) => !player(s, pid).lost)), step: "tap", tapped: {}, tapping: [], saved: [] });
      while (raid.queue.length) {
        const pid = raid.queue[0]!;
        const name = player(s, pid).name;
        if (raid.step === "tap") {
          const answered = sc.chosen?.[pid];
          if (answered === undefined) {
            const options = s.battlefield.filter((id) => {
              const c = obj(s, id);
              return !c.tapped && controllerOf(s, c) === pid && objIsType(s, c, "Creature") && characteristics(s, c).colors.includes("W");
            });
            if (options.length) {
              sc.queue = [pid];
              sc.chosen = {};
              s.pending = { kind: "pickPermanents", player: pid, source: src, action: "tap", what: "untapped white creature", options, count: options.length, min: 0, raid: "tap", prompt: `tap any number of untapped white creatures you control: for each one tapped, you choose up to two Plains (anyone's) that aren't destroyed. Every Plains no player chooses is destroyed.` };
              return "paused";
            }
            raid.tapped[pid] = 0;
          } else {
            const ids = answered.filter((id) => s.objects[id]?.zone === "battlefield" && !obj(s, id).tapped && controllerOf(s, obj(s, id)) === pid);
            sc.chosen = undefined;
            sc.queue = undefined;
            raid.tapping.push(...ids);
            raid.tapped[pid] = ids.length;
            log(s, ids.length ? `${name} chooses to tap ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")}.` : `${name} taps no white creatures.`);
          }
          raid.step = "plains";
        }
        const n = 2 * (raid.tapped[pid] ?? 0);
        const plains = s.battlefield.filter((id) => characteristics(s, obj(s, id)).subtypes.includes("Plains"));
        if (n > 0 && plains.length) {
          const answered = sc.chosen?.[pid];
          if (answered === undefined) {
            sc.queue = [pid];
            sc.chosen = {};
            s.pending = { kind: "pickPermanents", player: pid, source: src, action: "choose", what: "Plains", options: plains, count: Math.min(n, plains.length), min: 0, raid: "plains", prompt: `choose up to ${n} Plains (anyone's) to spare: every Plains no player chooses is destroyed.` };
            return "paused";
          }
          sc.chosen = undefined;
          sc.queue = undefined;
          const ids = answered.filter((id) => s.objects[id]?.zone === "battlefield");
          for (const id of ids) if (!raid.saved.includes(id)) raid.saved.push(id);
          log(s, ids.length ? `${name} chooses ${ids.map((id) => `${player(s, controllerOf(s, obj(s, id))).name}'s ${defOf(s, obj(s, id)).name}`).join(", ")}.` : `${name} chooses no Plains.`);
        }
        raid.queue.shift();
        raid.step = "tap";
      }
      // The choices made, the creatures are tapped together, then the Plains destroyed (CR 101.4).
      for (const id of raid.tapping) {
        const c = s.objects[id];
        if (c?.zone === "battlefield" && !c.tapped) tapPermanent(s, c, undefined, controllerOf(s, c));
      }
      if (raid.tapping.length) log(s, `${src}: ${raid.tapping.map((id) => defOf(s, obj(s, id)).name).join(", ")} ${raid.tapping.length === 1 ? "is" : "are"} tapped.`);
      // As it resolves now: a Plains that's no longer one isn't destroyed.
      const doomed = s.battlefield.map((id) => obj(s, id)).filter((o) => characteristics(s, o).subtypes.includes("Plains") && !raid.saved.includes(o.id));
      for (const o of doomed) if (o.zone === "battlefield") destroyPermanent(s, o, `${src} destroys ${player(s, controllerOf(s, o)).name}'s ${defOf(s, o).name}.`, false, ctx.controller);
      if (!doomed.length) log(s, `${src}: no Plains is destroyed.`);
      return;
    }
    case "searchTheCity": {
      // The card played (the trigger's event): its name as it was played, the card's once it's gone from where it was (a
      // spell that resolved, a land that left). "Those cards with that name": the cards its enters ability exiled (CR 607.2a),
      // still in exile; one of them, the controller's choice (rulings: only one for each card played).
      const key = ctx.sourceId ? `${ctx.sourceId}@${ctx.sourceZc ?? 0}` : undefined;
      const exiled = () =>
        (key ? (s.linkedExile?.[key] ?? []) : []).flatMap((l) => {
          const c = s.objects[l.id];
          return c && c.zone === "exile" && (c.zoneChanges ?? 0) === l.zc && !c.faceDown && !c.hiddenExile ? [c] : [];
        });
      if (sc.city === undefined) {
        const played = ctx.event?.played;
        const p = played ? s.objects[played.id] : undefined;
        const name = p ? ((p.zoneChanges ?? 0) === played!.zc && (p.zone === "stack" || p.zone === "battlefield") ? characteristics(s, p).name : defOf(s, p).name) : undefined;
        const names = name ? name.split(" // ") : [];
        const matching = exiled().filter((c) => defOf(s, c).name.split(" // ").some((n) => names.some((m) => hasName(m, n))));
        if (!matching.length) sc.city = "none";
        else {
          s.pending = {
            kind: "chooseOption",
            player: ctx.controller,
            source: src,
            what: "cityCard",
            options: [...matching.map((c) => c.id), "none"],
            labels: [...matching.map((c) => `Put ${defOf(s, c).name} into ${player(s, c.owner).name === player(s, ctx.controller).name ? "your" : `${player(s, c.owner).name}'s`} hand`), "Leave them exiled"],
            prompt: `you may put one of the exiled cards named ${name} into its owner's hand`,
          };
          return "paused";
        }
      }
      if (sc.city !== "none" && sc.city !== "done") {
        const c = s.objects[sc.city];
        sc.city = "done";
        if (c && c.zone === "exile" && exiled().some((x) => x.id === c.id)) {
          log(s, `${src}: ${player(s, ctx.controller).name} puts ${defOf(s, c).name} into ${player(s, c.owner).name}'s hand.`);
          moveObject(s, c.id, "hand");
        }
      }
      // "Then if there are no cards exiled with ~, sacrifice it. If you do, take an extra turn after this one." Only if it's
      // still the permanent whose ability this is and is sacrificed (rulings: destroyed in response, no extra turn).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (exiled().length || !same(me, ctx.sourceZc ?? 0) || controllerOf(s, me) !== ctx.controller || !canBeSacrificed(s, me)) return;
      log(s, `${player(s, ctx.controller).name} sacrifices ${defOf(s, me).name} (no cards are exiled with it).`);
      moveObject(s, me.id, "graveyard", { sacrificed: true });
      if (s.objects[me.id]?.zone === "battlefield") return;
      return runEffect(s, { type: "extraTurn", who: { ref: "you" }, n: 1 }, ctx);
    }
  }
}
