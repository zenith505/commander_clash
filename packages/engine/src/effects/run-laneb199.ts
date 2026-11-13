// Lane B round B199's effects.
import type { Effect } from "../abilities";
import { cardIdOf, defOf, objIsType } from "../cards";
import { attackingPermanentOf, log, moveObject, player } from "../game";
import { invalidateCharacteristics } from "../layers";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { addDelayed } from "./run-spells";
import { attackChoices, returnFromExile } from "./run-zones";

type B199Effect = Extract<Effect, { type: "noLegendRuleThisTurn" | "exileReturnAttackingAtDeclare" | "returnExiledAttacking" }>;

export function runLaneB199Effect(s: GameState, e: B199Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "noLegendRuleThisTurn": {
      // Hall of Echoes: for the permanents its controller controls, until the cleanup step (CR 704.5j, 514.2).
      const p = player(s, ctx.controller);
      p.noLegendRuleTurn = s.turn;
      log(s, `The "legend rule" doesn't apply to permanents ${p.name} controls this turn.`);
      return;
    }
    case "exileReturnAttackingAtDeclare": {
      // The source, only while it's the permanent it was (CR 400.7); a token that leaves the battlefield doesn't come back
      // (CR 111.7, 111.8).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!me || me.zone !== "battlefield" || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc)) return;
      const name = defOf(s, me).name;
      const owner = me.owner;
      const token = !!me.isToken;
      log(s, `${src} exiles ${name}.`);
      moveObject(s, me.id, "exile");
      const card = s.objects[me.id];
      if (token || !card || card.zone !== "exile") return;
      // Towershell: "under your control ... on your next turn": this ability's controller's; Noctis: its owner's.
      const whose = e.under === "owner" ? owner : ctx.controller;
      addDelayed(s, "playersNextDeclareAttackers", ctx.controller, card, {
        targets: [],
        effects: [{ type: "returnExiledAttacking", under: e.under, ...(e.unblockable ? { unblockable: true as const } : {}) }],
        text: `Return ${name} to the battlefield under ${e.under === "owner" ? "its owner's" : "your"} control tapped and attacking${e.unblockable ? ". It can't be blocked this combat" : ""}.`,
      }, cardIdOf(card), whose);
      const d = s.delayed!.at(-1)!;
      d.combat = s.combatsThisTurn ?? 0;
      if (e.laterTurn) d.laterTurn = true;
      return;
    }
    case "returnExiledAttacking": {
      // The card the delayed trigger is about, while it's still that card in exile (CR 400.7).
      const l = ctx.subject;
      const c = l ? s.objects[l.id] : undefined;
      if (!l || !c || c.zone !== "exile" || (c.zoneChanges ?? 0) !== l.zc) return;
      const under = e.under === "owner" ? c.owner : ctx.controller;
      if (player(s, under).lost) return;
      const sc = (s.resolving!.scratch ??= {});
      // Attacking only under the attacking player's control (CR 506.3b); its controller chooses what it attacks as it enters
      // (CR 508.4), any player or planeswalker it could attack (rulings: not necessarily the one it attacked before).
      const options = under === s.activePlayer && objIsType(s, c, "Creature") ? attackChoices(s, under, c.id) : [];
      if (options.length > 1 && sc.attackWhom === undefined) {
        s.pending = { kind: "chooseOption", player: under, source: src, what: "attackWhom", options: options.map((a) => a.key), labels: options.map((a) => a.label), prompt: `choose what ${defOf(s, c).name} attacks` };
        return "paused";
      }
      const attack = options.length > 1 ? options.find((a) => a.key === sc.attackWhom) : options[0];
      if (returnFromExile(s, [c], () => under, src, undefined, true) === "paused") return "paused";
      // The object as it is now, back on the battlefield (moved in place).
      const back = s.objects[c.id];
      if (!back || back.zone !== "battlefield" || !objIsType(s, back, "Creature") || !attack) return;
      // Put onto the battlefield attacking, it never "attacked" (CR 508.4): no attack triggers, no raid (rulings).
      back.attacking = attack.player;
      if (attack.planeswalker) back.attackingPermanent = attackingPermanentOf(s, attack.planeswalker);
      log(s, `${defOf(s, back).name} is attacking ${attack.label}.`);
      // Noctis: "It can't be blocked that combat."
      if (e.unblockable) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, sourceId: back.id, duration: "endOfCombat", affected: [back.id], mods: [{ kind: "cantBeBlocked" }] });
      invalidateCharacteristics(s);
      return;
    }
  }
}
