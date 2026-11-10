// Round 333's effects.
import type { Effect, TargetChoice } from "../abilities";
import { cardIdOf, defOf } from "../cards";
import { enterTogether, log, obj, opponents, player, turnOrderFrom } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import { copiableDef } from "../copies";
import { tokenCopies } from "./run-tokens";
import { canAttachTo } from "./run-permanents";
import type { GameState, PlayerId } from "../types";
import type { ResolveCtx } from "./resolve";
import { putSpellCopy } from "./run-spells";
import { isLegalTarget, opponentOrTheirsTarget, spellQuality } from "./targeting";

type R333Effect = Extract<Effect, { type: "copyPerOtherOpponent" | "copyAttachedOnto" }>;

/** A Zevlor choice's option: "p<player>" for a player, else an object id. */
const asTarget = (o: string): TargetChoice => (/^p\d+$/.test(o) ? { kind: "player", id: Number(o.slice(1)) as PlayerId } : { kind: "object", id: o });

export function runRound333Effect(s: GameState, e: R333Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "copyAttachedOnto": {
      // Stangg, Echo Warrior: a token copy of each Aura and Equipment attached to ~ as this resolves (their copiable values
      // now, CR 707.2), entering attached to the token just created; an Aura copy that couldn't enchant it isn't created,
      // an Equipment copy that couldn't be attached to it enters unattached (rulings). All enter at once.
      const r = s.resolving!;
      const host = r.created?.[0] ? s.objects[r.created[0]] : undefined;
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!me || me.zone !== "battlefield" || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc)) return;
      const attached = s.battlefield.map((id) => obj(s, id)).filter((o) => o.attachedTo === me.id && ["Aura", "Equipment"].some((t) => characteristics(s, o).subtypes.includes(t)));
      if (!attached.length) return;
      const bases = attached.map((o) => ({ base: copiableDef(s, o), aura: characteristics(s, o).subtypes.includes("Aura") }));
      enterTogether(s, () => {
        for (const { base, aura } of bases) {
          if (aura) {
            tokenCopies(s, ctx.controller, base, 1, ctx, { auraHost: host?.zone === "battlefield" ? { attachTo: host.id } : null });
            continue;
          }
          const before = r.created?.length ?? 0;
          tokenCopies(s, ctx.controller, base, 1, ctx);
          for (const id of (r.created ?? []).slice(before)) {
            const eq = s.objects[id];
            if (!eq || !host || host.zone !== "battlefield" || !canAttachTo(s, eq, host)) continue;
            eq.attachedTo = host.id;
            invalidateCharacteristics(s);
            log(s, `${defOf(s, eq).name} enters attached to ${defOf(s, host).name}.`);
          }
        }
      });
      return;
    }
    case "copyPerOtherOpponent": {
      // Zevlor, Elturel Exile: the spell that made the delayed trigger trigger, even if it has left the stack (rulings).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const orig = ctx.cause ? (s.stack.find((x) => x.id === ctx.cause) ?? s.castItems?.[ctx.cause]) : undefined;
      if (!orig || orig.kind !== "spell" || !orig.body) return;
      if (!sc.zevlor) {
        // The opponent it targets (or whose permanent it targets) as this resolves; with that target gone, the opponent it
        // was cast against still isn't one of the "other" opponents.
        const now = opponentOrTheirsTarget(s, orig.targets ?? [], ctx.controller);
        const t0 = (orig.targets ?? []).find((t) => t.kind !== "none");
        const gone = t0?.kind === "object" ? s.objects[t0.id] : undefined;
        const was = now?.player ?? (t0?.kind === "player" ? t0.id : gone ? gone.controller : undefined);
        if (was === undefined) return;
        const others = turnOrderFrom(s, ctx.controller).filter((pid) => pid !== was && opponents(s, ctx.controller).includes(pid));
        sc.zevlor = { left: others, picks: [] };
      }
      const st = sc.zevlor;
      const card = orig.objectId ? s.objects[orig.objectId] : undefined;
      const quality = card ? spellQuality(s, cardIdOf(card), orig) : undefined;
      const specs = orig.body.targets.filter((_, i) => (orig.targets?.[i]?.kind ?? "none") !== "none");
      // That player or permanent could be every target of the copy (CR 707.10e), its controller choosing it.
      const legal = (t: TargetChoice) => specs.length > 0 && specs.every((spec) => isLegalTarget(s, spec, t, ctx.controller, quality));
      while (st.left.length) {
        const q = st.left[0]!;
        if (player(s, q).lost) {
          st.left.shift();
          continue;
        }
        if (st.answer === undefined) {
          const theirs = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === q);
          const options = [`p${q}`, ...theirs].filter((o) => legal(asTarget(o)));
          // Choosing one that isn't a legal target makes no copy (rulings): offered when there's one to choose.
          const canDecline = options.length < 1 + theirs.length;
          if (!options.length) {
            st.left.shift();
            continue;
          }
          s.pending = {
            kind: "chooseOption",
            player: ctx.controller,
            source: src,
            what: "copyTargetFor",
            options: [...options, ...(canDecline ? ["none"] : [])],
            labels: [...options.map((o) => (/^p\d+$/.test(o) ? player(s, q).name : `${defOf(s, obj(s, o)).name} (${player(s, q).name})`)), ...(canDecline ? ["No copy (choose an illegal target)"] : [])],
            prompt: `for ${player(s, q).name}, choose that player or a permanent they control: a copy of ${orig.description} targets it`,
          };
          return "paused";
        }
        if (st.answer !== "none") st.picks.push(st.answer);
        st.answer = undefined;
        st.left.shift();
      }
      // The copies go on the stack in turn order of those opponents; each targets the one chosen with all its targets.
      for (const pick of st.picks) {
        const t = asTarget(pick);
        if (!legal(t)) continue;
        const aimed = (orig.targets ?? []).map((x): TargetChoice => (x.kind === "none" ? x : t));
        putSpellCopy(s, orig, ctx.controller, aimed);
      }
      if (!st.picks.length) log(s, `${src}: no copies of ${orig.description}.`);
      sc.zevlor = undefined;
      return;
    }
  }
}
