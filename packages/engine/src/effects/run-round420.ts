// Round 420's effects: Kotose, the Silent Spider's "you may play one of the exiled cards" while you control it, Allure
// of the Unknown's revealed card exiled by an opponent who may cast it, and Cloak and Dagger, Entwined's exile of a card
// from a hand or the chosen creature until it leaves.
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { freeCastable, log, moveObject, obj, player, stillControlsSource } from "../game";
import type { GameState, ObjectId } from "../types";
import { chooseAnOpponent, opponentPicks } from "./run-library";
import { objects, runEffect, type ResolveCtx } from "./resolve";
import { printedMatches } from "./targeting";

type R420Effect = Extract<Effect, { type: "mayPlayOneExiledThisWay" | "revealOpponentExilesCasts" | "exileFromHandOrTarget" }>;

export function runRound420Effect(s: GameState, e: R420Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "mayPlayOneExiledThisWay": {
      // Kotose: the target card exiled from the graveyard and the cards with its name the search exiled, each still that
      // card in exile (CR 400.7; not a token, which has ceased to exist, CR 111.7). "For as long as you control ~": the
      // source as the object it is now, under this ability's controller; if it has already left or changed control, the
      // duration is over before it began and nothing may be played (CR 611.2b, rulings). Only one of them may be played
      // (rulings), whichever: a `oneOf` group. Lands too ("play", CR 305.1), with an available land play.
      const r = s.resolving!;
      const ids = [...new Set([...(r.exiledCards ?? []), ...(r.namedExiled ?? [])])].filter((id) => s.objects[id]?.zone === "exile" && !s.objects[id]!.isToken);
      if (!ids.length || !ctx.sourceId) return;
      const source = { id: ctx.sourceId, zc: ctx.sourceZc ?? s.objects[ctx.sourceId]?.zoneChanges ?? 0 };
      const probe = { player: ctx.controller, zc: 0, until: "whileControlled" as const, turn: s.turn, source };
      if (!stillControlsSource(s, probe)) {
        log(s, `${player(s, ctx.controller).name} no longer controls ${src}, so the exiled cards can't be played.`);
        return;
      }
      const oneOf = `g${s.nextId++}`;
      for (const id of ids) {
        const o = obj(s, id);
        o.mayPlay = { ...probe, zc: o.zoneChanges ?? 0, oneOf, anyColor: true };
      }
      log(s, `${player(s, ctx.controller).name} may play one of ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} for as long as they control ${src}, spending mana as though it were mana of any color.`);
      return;
    }
    case "revealOpponentExilesCasts": {
      // Allure of the Unknown: the top cards revealed (CR 701.20a), then an opponent chosen as it resolves (CR 608.2d)
      // exiles one of the nonland cards among them (with one, that one; with none, nothing, and all of them go to your
      // hand, rulings); the rest go to your hand. That opponent may then cast the exiled card without paying its mana cost
      // (CR 118.9: X is 0, alternative costs can't be paid, mandatory additional costs must), as this resolves and not
      // later, its card type's timing ignored (CR 608.2g, rulings). Cast or not, it stays exiled; cast, it's still yours
      // (CR 108.3): a permanent spell enters under their control, an instant or sorcery goes to your graveyard.
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const me = player(s, ctx.controller);
      if (!sc.allure) {
        const looked = me.library.slice(0, e.n);
        if (!looked.length) return void log(s, `${me.name} has no cards in their library to reveal (${src}).`);
        log(s, `${me.name} reveals ${looked.map((id) => defOf(s, obj(s, id)).name).join(", ")} from the top of their library.`);
        sc.allure = { looked };
      }
      const st = sc.allure;
      if (st.exiled === undefined) {
        const looked = st.looked.filter((id) => obj(s, id).zone === "library");
        const fits = looked.filter((id) => printedMatches(e.filter, defOf(s, obj(s, id))));
        let picked: ObjectId[] = [];
        if (fits.length) {
          const opp = chooseAnOpponent(s, ctx, src, `choose an opponent to exile a ${e.filter.text} and cast it`);
          if (opp === "paused") return "paused";
          if (opp !== undefined && !player(s, opp).lost) {
            const got = opponentPicks(s, ctx, src, { ref: "chosenPlayer" }, me.id, looked, fits, 1, { zone: "exile" }, { zone: "hand" }, `into exile (${player(s, opp).name} may cast it without paying its mana cost)`, `go into ${me.name}'s hand`);
            if (got === "paused") return "paused";
            picked = got.filter((id) => obj(s, id).zone === "library").slice(0, 1);
            st.caster = opp;
          }
        }
        for (const id of picked) {
          log(s, `${player(s, st.caster!).name} exiles ${defOf(s, obj(s, id)).name} (${src}).`);
          moveObject(s, id, "exile");
        }
        const rest = looked.filter((id) => !picked.includes(id) && obj(s, id).zone === "library");
        for (const id of rest) moveObject(s, id, "hand");
        if (rest.length) log(s, `${me.name} puts ${rest.map((id) => defOf(s, obj(s, id)).name).join(", ")} into their hand.`);
        st.exiled = picked[0] && obj(s, picked[0]).zone === "exile" ? { id: picked[0], zc: obj(s, picked[0]).zoneChanges ?? 0 } : null;
      }
      const ex = st.exiled;
      const o = ex ? s.objects[ex.id] : undefined;
      if (!ex || !o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== ex.zc || st.asked || st.caster === undefined || player(s, st.caster).lost) return;
      // Asked once; casting it is a castSpell action, declining a chooseMay (CR 608.2g).
      st.asked = true;
      s.pending = { kind: "castFree", player: st.caster, objectId: o.id, source: src };
      if (freeCastable(s, st.caster, o.id, true)) return "paused";
      s.pending = null;
      log(s, `${defOf(s, o).name} can't be cast, so it stays in exile (${src}).`);
      return;
    }
    case "exileFromHandOrTarget": {
      // Cloak and Dagger, Entwined: the hand was revealed by the instruction before; now you may choose one of its nonland
      // cards or the chosen creature, if that target is still legal and on the battlefield (CR 608.2b), and exile it until
      // ~ leaves the battlefield (CR 610.3). If ~ has already left, nothing is exiled (CR 610.3c). Choosing nothing is
      // allowed ("you may"). An exiled hand card returns to its owner's hand, the creature to the battlefield (CR 610.3a).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (sc.cloakDone) return;
      const me = objects(s, { ref: "self" }, ctx)[0];
      if (!me) {
        sc.cloakDone = true;
        return void log(s, `${src} has left the battlefield, so nothing is exiled.`);
      }
      const tp = ctx.targets[e.player];
      const pid = ctx.legal[e.player] && tp?.kind === "player" ? tp.id : undefined;
      const hand = pid !== undefined && !player(s, pid).lost ? player(s, pid).hand : [];
      const tc = ctx.targets[e.creature];
      const cre = ctx.legal[e.creature] && tc?.kind === "object" && s.objects[tc.id]?.zone === "battlefield" ? tc.id : undefined;
      if (!sc.found) {
        const cards = [...hand.filter((id) => printedMatches(e.filter, defOf(s, obj(s, id)))), ...(cre ? [cre] : [])];
        if (!cards.length) {
          sc.cloakDone = true;
          return void log(s, `${player(s, ctx.controller).name} has nothing to exile (${src}).`);
        }
        const whose = pid !== undefined ? player(s, pid).name : "the opponent";
        s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: `a ${e.filter.text} from ${whose}'s hand${cre ? " or the chosen creature" : ""}`, cards, min: 0, max: 1, dig: { looked: [...hand, ...(cre ? [cre] : [])], to: `to exile until ${src} leaves the battlefield`, rest: "stay where they are" }, ...(pid !== undefined ? { hand: pid } : {}) };
        return "paused";
      }
      const id = sc.found[0];
      sc.found = undefined;
      sc.cloakDone = true;
      if (id === undefined) return void log(s, `${player(s, ctx.controller).name} exiles nothing (${src}).`);
      if (id === cre) return runEffect(s, { type: "exile", what: { ref: "target", index: e.creature }, until: "sourceLeaves" }, ctx);
      if (!hand.includes(id)) return;
      log(s, `${player(s, ctx.controller).name} exiles ${defOf(s, obj(s, id)).name} from ${player(s, pid!).name}'s hand until ${src} leaves the battlefield.`);
      moveObject(s, id, "exile");
      const o = obj(s, id);
      if (o.zone === "exile") (me.exiledUntilLeaves ??= []).push({ id, zc: o.zoneChanges ?? 0, hand: true });
      return;
    }
  }
}
