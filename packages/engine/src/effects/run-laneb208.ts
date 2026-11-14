// Lane B round B208's effects.
import type { Effect } from "../abilities";
import { defOf, isType, objIsType } from "../cards";
import { attackingPermanentOf, auraHostName, auraHostOptions, enterTogether, log, moveObject, obj, player } from "../game";
import { characteristics, controllerOf, type Characteristics } from "../layers";
import { compileCard } from "../oracle";
import type { GameObject, GameState, ObjectId, PlayerId } from "../types";
import type { ResolveCtx } from "./resolve";
import { players } from "./resolve";
import { chooseAuraHosts } from "./run-zones";
import { objectMatches } from "./targeting";
import { attackDefault } from "./triggers";

type B208Effect = Extract<Effect, { type: "aurasFromYardToYourCreatures" | "auraOntoEachCreated" | "revealTopAttackingOrHand" }>;

/**
 * Auratouched Mage: whether `aura` (a card) could have enchanted the source as it last existed on the battlefield, once it
 * has left (rulings: "as it most recently existed on the battlefield if it's no longer on the battlefield", CR 608.2h):
 * the Aura's enchant restriction (CR 303.4a) checked against the permanent's last known characteristics, its types (an
 * effect that made it an artifact counts), colors, abilities, controller and counters then.
 */
export function couldEnchantAsLastExisted(s: GameState, aura: GameObject, sourceId: ObjectId, sourceZc: number, pid: PlayerId): boolean {
  const lk = s.lastKnown?.[sourceId];
  const o = s.objects[sourceId];
  if (!lk || lk.zc !== sourceZc || !lk.source || !o) return false;
  const enchant = compileCard(defOf(s, aura)).enchant;
  if (!enchant || enchant.kind !== "object") return false;
  const now = characteristics(s, o);
  const last: Characteristics = {
    ...now,
    name: lk.source.name,
    colors: [...lk.source.colors],
    types: [...lk.source.types],
    subtypes: [...lk.source.subtypes],
    supertypes: [...(lk.source.supertypes ?? [])],
    allCreatureTypes: !!lk.source.allCreatureTypes,
    keywords: [...lk.source.keywords],
    power: lk.power,
    toughness: lk.toughness,
    controller: lk.controller,
    enchantedOnlyBy: [],
  };
  const asItWas: GameObject = { ...o, zone: "battlefield", counters: { ...(lk.counters ?? {}) }, tapped: !!lk.tapped, attachedTo: undefined };
  return objectMatches(s, enchant, asItWas, pid, false, defOf(s, aura), last);
}

/** A token's name without the word "Token" (its name is its subtypes plus "Token", CR 111.4). */
const tokenName = (s: GameState, o: GameObject) => characteristics(s, o).name.replace(/ Token$/, "");

/** "A creature you control" for Storm Herald's Auras (CR 303.4f): a creature on the battlefield its controller controls. */
const yourCreature = (s: GameState, pid: PlayerId) => (h: GameObject) => h.zone === "battlefield" && controllerOf(s, h) === pid && objIsType(s, h, "Creature");

export function runLaneB208Effect(s: GameState, e: B208Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "aurasFromYardToYourCreatures": {
      // Storm Herald: any number of Aura cards, none too, chosen as it resolves (CR 608.2c), only those that could be
      // attached to a creature you control (rulings: one that can't can't be returned); Storm Herald itself is one of
      // those creatures (rulings). Each Aura's creature is chosen as they enter, among what's on the battlefield before
      // any of them moves, then they enter together (CR 303.4f).
      const p = player(s, ctx.controller);
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const fits = yourCreature(s, p.id);
      const returnable = (id: ObjectId) => defOf(s, obj(s, id)).subtypes.includes("Aura") && auraHostOptions(s, obj(s, id), p.id).some((h) => "attachTo" in h && fits(obj(s, h.attachTo)));
      if (!sc.found) {
        r.created = [];
        const cards = p.graveyard.filter(returnable);
        if (!cards.length) {
          log(s, `${src}: no Aura card in ${p.name}'s graveyard could enchant a creature they control.`);
          return;
        }
        s.pending = { kind: "searchLibrary", player: p.id, source: src, what: "any number of Aura cards to return attached to creatures you control", cards, min: 0, max: cards.length, fromGraveyard: "battlefield" };
        return "paused";
      }
      const found = sc.found.filter((id) => p.graveyard.includes(id));
      const hosts = chooseAuraHosts(s, found.map((id) => ({ o: obj(s, id), under: p.id })), src, undefined, true, undefined, fits);
      if (hosts === "paused") return "paused";
      const ids = found.filter((id) => hosts.has(id));
      if (ids.length) log(s, `${p.name} returns ${ids.map((id) => `${defOf(s, obj(s, id)).name} (enchanting ${auraHostName(s, hosts.get(id)!)})`).join(", ")} from their graveyard to the battlefield.`);
      enterTogether(s, () => ids.forEach((id) => moveObject(s, id, "battlefield", { controller: p.id, ...hosts.get(id) })));
      r.created = ids.filter((id) => obj(s, id).zone === "battlefield");
      return;
    }
    case "auraOntoEachCreated": {
      // Liberated Livestock: for each token created just before (extra ones too, rulings), in the order they were created,
      // you may choose an Aura card in your hand or graveyard that could enchant it, a card chosen once only. Then the
      // chosen Auras enter together, each attached to its token (CR 303.4f), as one instruction (CR 608.2c).
      const p = player(s, ctx.controller);
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const tokens = (r.created ?? []).filter((id) => s.objects[id]?.zone === "battlefield" && s.objects[id]!.isToken);
      const st = (sc.auraForToken ??= { picks: [] });
      if (st.answer !== undefined) {
        st.picks.push(st.answer);
        st.answer = undefined;
      }
      while (st.picks.length < tokens.length) {
        const tok = obj(s, tokens[st.picks.length]!);
        const options = [...p.hand, ...p.graveyard].filter((id) => !st.picks.includes(id) && defOf(s, obj(s, id)).subtypes.includes("Aura") && auraHostOptions(s, obj(s, id), p.id).some((h) => "attachTo" in h && h.attachTo === tok.id));
        if (!options.length) {
          st.picks.push("none");
          continue;
        }
        const name = tokenName(s, tok);
        s.pending = { kind: "chooseOption", player: p.id, source: src, what: "auraForToken", options: [...options, "none"], labels: [...options.map((id) => `${defOf(s, obj(s, id)).name} (from your ${obj(s, id).zone})`), "No Aura"], prompt: `you may put an Aura card from your hand or graveyard onto the battlefield attached to the ${name} token` };
        return "paused";
      }
      const puts = st.picks.flatMap((id, i) => {
        const aura = id === "none" ? undefined : s.objects[id];
        const tok = s.objects[tokens[i]!];
        return aura && (aura.zone === "hand" || aura.zone === "graveyard") && aura.owner === p.id && tok?.zone === "battlefield" ? [{ aura, tok }] : [];
      });
      if (puts.length) log(s, `${p.name} puts ${puts.map(({ aura, tok }) => `${defOf(s, aura).name} onto the battlefield attached to the ${tokenName(s, tok)} token`).join(", ")}.`);
      enterTogether(s, () => puts.forEach(({ aura, tok }) => moveObject(s, aura.id, "battlefield", { controller: p.id, attachTo: tok.id })));
      return;
    }
    case "revealTopAttackingOrHand": {
      // Hans Eriksson: the top card revealed (CR 701.20a); a creature card is put onto the battlefield tapped and attacking
      // the defending player (the player Hans attacks, or the controller of the planeswalker he attacks, rulings) or a
      // planeswalker they control, its controller's choice (CR 508.4); it was never declared as an attacker (CR 508.4a).
      // Any other card goes into your hand. Nothing happens with an empty library.
      const p = player(s, ctx.controller);
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const id = p.library[0];
      if (!id) {
        r.created = [];
        log(s, `${p.name} has no cards in their library to reveal (${src}).`);
        return;
      }
      const card = obj(s, id);
      const d = defOf(s, card);
      if (sc.attackWhom === undefined) log(s, `${p.name} reveals ${d.name} from the top of their library (${src}).`);
      if (!isType(d, "Creature")) {
        r.created = [];
        log(s, `${p.name} puts ${d.name} into their hand.`);
        moveObject(s, id, "hand");
        return;
      }
      const defender = players(s, { ref: "eventPlayer" }, ctx)[0];
      const live = defender !== undefined && !player(s, defender).lost && attackDefault(s, p.id, ctx.sourceId) !== undefined;
      const choices = live
        ? [
            { key: String(defender), label: player(s, defender!).name, planeswalker: undefined as ObjectId | undefined },
            ...s.battlefield.filter((x) => objIsType(s, obj(s, x), "Planeswalker") && controllerOf(s, obj(s, x)) === defender).map((x) => ({ key: `${defender}:${x}`, label: `${defOf(s, obj(s, x)).name} (${player(s, defender!).name})`, planeswalker: x as ObjectId | undefined })),
          ]
        : [];
      if (choices.length > 1 && sc.attackWhom === undefined) {
        s.pending = { kind: "chooseOption", player: p.id, source: src, what: "attackWhom", options: choices.map((a) => a.key), labels: choices.map((a) => a.label), prompt: `choose what ${d.name} attacks` };
        return "paused";
      }
      const at = choices.length > 1 ? choices.find((a) => a.key === sc.attackWhom) : choices[0];
      log(s, `${p.name} puts ${d.name} onto the battlefield tapped${at ? ` and attacking ${at.label}` : ""}.`);
      moveObject(s, id, "battlefield", { controller: p.id, tapped: true });
      r.created = [];
      if (card.zone !== "battlefield") return;
      r.created.push(id);
      if (at && objIsType(s, card, "Creature")) {
        card.attacking = defender;
        if (at.planeswalker) card.attackingPermanent = attackingPermanentOf(s, at.planeswalker);
      }
      return;
    }
  }
}
