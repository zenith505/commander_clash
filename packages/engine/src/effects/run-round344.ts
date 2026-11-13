// Round 344's effects.
import type { Effect, Modification } from "../abilities";
import { defOf } from "../cards";
import { auraHostKey, auraHostLabels, log, moveObject, obj, player } from "../game";
import { characteristics, enchantableBy } from "../layers";
import type { GameState } from "../types";
import { objects, type ResolveCtx } from "./resolve";
import { objectMatches } from "./targeting";

type R344Effect = Extract<Effect, { type: "foretellSelf" | "returnAsAura" }>;

export function runRound344Effect(s: GameState, e: R344Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "foretellSelf": {
      // The Foretold Soldier: only the permanent the ability came from, still on the battlefield (CR 400.7).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!me || me.zone !== "battlefield" || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc)) return;
      moveObject(s, me.id, "exile");
      if (s.objects[me.id]!.zone !== ("exile" as string)) return;
      if (me.isToken) {
        log(s, `${src} is exiled.`);
        return;
      }
      // Foretold (CR 702.143a, d): face down, its owner may look at it and cast it on a later turn for its foretell cost,
      // whoever controlled it (rulings); nobody foretold it, so nothing triggers on foretelling.
      me.foretold = true;
      me.mayPlay = { player: me.owner, zc: me.zoneChanges ?? 0, until: "foretell", turn: s.turn };
      log(s, `${src} is exiled face down. It becomes foretold: ${player(s, me.owner).name} may cast it on a later turn for its foretell cost.`);
      return;
    }
    case "returnAsAura": {
      // Bronzehide Lion, Old-Growth Troll: the card in the graveyard it went to, still there (CR 400.7); a token has
      // ceased to exist (CR 111.7, rulings).
      const card = objects(s, { ref: "selfCard" }, ctx)[0];
      if (!card || card.zone !== "graveyard" || card.isToken) return;
      const d = defOf(s, card);
      const you = ctx.controller;
      // What it could enchant as the Aura it enters as (CR 303.4f): protection from it as an Aura enchantment, with its
      // name, colors and supertypes (CR 702.16c), not targeting.
      const asAura = { ...d, types: ["Enchantment"], subtypes: ["Aura"] };
      const options = s.battlefield.filter((id) => id !== card.id && objectMatches(s, e.enchant, obj(s, id), you, false, asAura) && enchantableBy(characteristics(s, obj(s, id)), card.id));
      const sc = (s.resolving!.scratch ??= {});
      const hosts = (sc.auraHosts ??= {});
      if (!options.length) {
        log(s, `${d.name} has nothing it could enchant, so it stays in the graveyard.`);
        return;
      }
      if (hosts[card.id] === undefined) {
        if (options.length > 1) {
          sc.auraAsking = card.id;
          s.pending = { kind: "chooseOption", player: you, source: src, what: "enchant", options: options.map((id) => auraHostKey({ attachTo: id })), labels: auraHostLabels(s, options.map((id) => ({ attachTo: id }))), prompt: `choose what ${d.name} enchants as it returns to the battlefield as an Aura` };
          return "paused";
        }
        hosts[card.id] = options[0]!;
      }
      const host = hosts[card.id]!;
      delete hosts[card.id];
      if (!options.includes(host)) return;
      // An Aura enchantment from as it enters (CR 205.1a: no other card types or subtypes), with that enchant ability and
      // the ability it's given; Bronzehide Lion loses all its other abilities first (CR 613.1f, in that order).
      const mods: Modification[] = [{ kind: "setTypes", types: ["Enchantment"], subtypes: ["Aura"] }, ...(e.loseOthers ? [{ kind: "loseAllAbilities" as const }] : []), { kind: "enchant", spec: e.enchant }, { kind: "addAbility", text: e.ability }];
      log(s, `${src} returns ${d.name} to the battlefield as an Aura enchantment attached to ${defOf(s, obj(s, host)).name}.`);
      moveObject(s, card.id, "battlefield", { controller: you, attachTo: host, entersAs: mods, entersAsBy: { controller: you, source: d.name } });
      if (s.objects[card.id]!.zone === ("battlefield" as string)) (s.resolving!.created ??= []).push(card.id);
      return;
    }
  }
}
