// Lane B round B275's effects: Tawnos's Coffin (coffinNote, coffinWatch, coffinReturn) and Takklemaggot (takklemaggot).
import type { Effect } from "../abilities";
import { characteristics, invalidateCharacteristics } from "../layers";
import { defOf, isPermanentCard } from "../cards";
import { auraHostKey, auraHostLabels, auraHostOf, auraHostOptions, enterTogether, log, moveObject, player } from "../game";
import { newObjects } from "../mutate";
import { TAKK_UPKEEP } from "../oracle/laneb275-lines";
import type { GameObject, GameState, ObjectId } from "../types";
import { objects, players, type ResolveCtx } from "./resolve";
import { addDelayed } from "./run-spells";
import { chooseAuraHosts } from "./run-zones";

type B275Effect = Extract<Effect, { type: "coffinNote" | "coffinWatch" | "coffinReturn" | "takklemaggot" }>;

/** The cards of `cards` still in exile as the objects they became there (CR 400.7). */
function stillExiled(s: GameState, cards: { id: ObjectId; zc: number }[]): GameObject[] {
  return cards.flatMap((c) => {
    const o = s.objects[c.id];
    return o && o.zone === "exile" && (o.zoneChanges ?? 0) === c.zc ? [o] : [];
  });
}

export function runLaneB275Effect(s: GameState, e: B275Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  switch (e.type) {
    case "coffinNote": {
      // "Note the number and kind of counters that were on that creature": the target as the exile that follows finds it
      // (only if it's still legal, CR 608.2b: an illegal single target means the ability doesn't resolve at all), and the
      // Auras attached to it then, which that exile takes with it (CR 608.2c).
      const t = objects(s, { ref: "target", index: 0 }, ctx).find((o) => o.zone === "battlefield");
      if (!t) return;
      const counters = Object.fromEntries(Object.entries(t.counters ?? {}).filter(([, n]) => (n ?? 0) > 0)) as Record<string, number>;
      const auras = s.battlefield.map((id) => s.objects[id]!).filter((o) => o.attachedTo === t.id && characteristics(s, o).subtypes.includes("Aura")).map((o) => ({ id: o.id, zc: o.zoneChanges ?? 0 }));
      s.resolving!.coffinNoted = { counters, auras };
      return;
    }
    case "coffinWatch": {
      const noted = s.resolving!.coffinNoted;
      s.resolving!.coffinNoted = undefined;
      const tc = ctx.targets[0];
      const was = tc?.kind === "object" ? s.objects[tc.id] : undefined;
      if (!noted || !was || tc?.kind !== "object") return;
      // "That exiled card": the card the creature became in exile (CR 400.7), a merged one's other cards too (CR 730.3c);
      // a token ceased to exist (CR 111.7, 704.5d), so nothing comes back and the Auras stay exiled forever (rulings).
      const cards = was.zone === "exile" ? newObjects(was).filter((c) => s.objects[c.id]?.zone === "exile" && !s.objects[c.id]!.isToken) : [];
      // "The other exiled cards": the Auras exiled with it, as the cards they became in exile (one zone change later).
      const auras = noted.auras.flatMap((a) => {
        const o = s.objects[a.id];
        return o && o.zone === "exile" && !o.isToken && (o.zoneChanges ?? 0) === a.zc + 1 ? [{ id: a.id, zc: a.zc + 1 }] : [];
      });
      if (!cards.length) {
        if (auras.length || was.zone !== "exile") log(s, `${src}: nothing exiled will come back.`);
        return;
      }
      // The delayed trigger watches ~ as it is now; if ~ has left the battlefield (or is a new object) by now, it never
      // triggers, so the cards stay exiled (rulings). Phasing out isn't leaving (CR 702.26d).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!me || (me.zone !== "battlefield" && me.zone !== "phasedOut") || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc)) {
        log(s, `${src} has left the battlefield, so ${defOf(s, s.objects[cards[0]!.id]!).name} stays exiled.`);
        return;
      }
      const name = defOf(s, s.objects[cards[0]!.id]!).name;
      addDelayed(s, "leaves", ctx.controller, me, { targets: [], effects: [{ type: "coffinReturn", cards, auras, counters: noted.counters }], text: `Return ${name} to the battlefield under its owner's control tapped with the noted counters${auras.length ? ", then the Auras exiled with it attached to it" : ""}.` });
      Object.assign(s.delayed![s.delayed!.length - 1]!, { to: ["graveyard", "exile", "hand", "library", "command"], orUntaps: true as const, about: cards[0]! });
      return;
    }
    case "coffinReturn": {
      // "Return that exiled card to the battlefield under its owner's control tapped with the noted number and kind of counters
      // on it": still in exile as that object (CR 400.7), and only a permanent card can enter (CR 400.4a; the card's types in
      // exile don't matter otherwise, rulings). It enters tapped with those counters (CR 614.1c, 122.6) and is a new object,
      // summoning sick (rulings). An Aura card enchants what its owner chooses as it enters (CR 303.4f), or stays (303.4g).
      if (!sc.coffinBack) {
        const back = stillExiled(s, e.cards).filter((o) => isPermanentCard(defOf(s, o)));
        const hosts = chooseAuraHosts(s, back.map((o) => ({ o, under: o.owner })), src);
        if (hosts === "paused") return "paused";
        const going = back.filter((o) => !defOf(s, o).subtypes.includes("Aura") || hosts.has(o.id));
        for (const o of back) if (sc.auraHosts) delete sc.auraHosts[o.id];
        enterTogether(s, () => {
          for (const o of going) moveObject(s, o.id, "battlefield", { controller: o.owner, putBy: ctx.controller, tapped: true, ...(Object.keys(e.counters).length ? { counters: { ...e.counters } } : {}), ...hosts.get(o.id) });
        });
        sc.coffinBack = going.flatMap((o) => (o.zone === "battlefield" ? [{ id: o.id, zc: o.zoneChanges ?? 0 }] : []));
        if (sc.coffinBack.length) {
          const counted = Object.entries(e.counters).map(([k, n]) => `${n} ${k} counter${n === 1 ? "" : "s"}`).join(", ");
          log(s, `${src} returns ${sc.coffinBack.map((c) => defOf(s, s.objects[c.id]!).name).join(", ")} to the battlefield tapped${counted ? ` with ${counted}` : ""}.`);
        } else log(s, `${src}: the exiled card doesn't come back.`);
      }
      // "If you do, return the other exiled cards to the battlefield under their owner's control attached to that permanent":
      // only once it came back, and only the Aura cards still in exile that could legally enchant it (CR 303.4f); the others
      // stay exiled (rulings). For a merged permanent's cards, attached to the one their owner chooses among them.
      const hostsNow = sc.coffinBack.map((c) => s.objects[c.id]!).filter((o, i) => o.zone === "battlefield" && (o.zoneChanges ?? 0) === sc.coffinBack![i]!.zc);
      const auras = stillExiled(s, e.auras).filter((o) => isPermanentCard(defOf(s, o)));
      if (!hostsNow.length || !auras.length) {
        sc.coffinBack = undefined;
        return;
      }
      const ids = new Set(hostsNow.map((o) => o.id));
      const hosts = hostsNow.length === 1 ? chooseAuraHosts(s, auras.map((o) => ({ o, under: o.owner })), src, hostsNow[0]!.id) : chooseAuraHosts(s, auras.map((o) => ({ o, under: o.owner })), src, undefined, undefined, undefined, (h) => ids.has(h.id));
      if (hosts === "paused") return "paused";
      sc.coffinBack = undefined;
      enterTogether(s, () => {
        for (const o of auras) {
          const d = defOf(s, o);
          const to = hosts.get(o.id);
          if (sc.auraHosts) delete sc.auraHosts[o.id];
          if (!d.subtypes.includes("Aura") || !to || !("attachTo" in to)) {
            log(s, `${d.name} can't be attached to ${characteristics(s, hostsNow[0]!).name}, so it stays in exile.`);
            continue;
          }
          log(s, `${src} returns ${d.name} to the battlefield attached to ${characteristics(s, s.objects[to.attachTo]!).name}.`);
          moveObject(s, o.id, "battlefield", { controller: o.owner, putBy: ctx.controller, ...to });
        }
      });
      return;
    }
    case "takklemaggot": {
      // "Return ~ to the battlefield": its card still in the graveyard it went to (rulings, CR 400.7); otherwise nothing,
      // and nobody chooses.
      const me = objects(s, { ref: "selfCard", moved: true }, ctx)[0];
      if (!me) return void log(s, `${src} isn't in the graveyard, so nothing happens.`);
      // "That creature's controller": as it last existed (CR 608.2h). "Chooses a creature that ~ could enchant": any
      // creature on the battlefield it could legally enchant as it would enter under your control (CR 303.4f; not targeted,
      // so shroud doesn't matter, but protection from black does, rulings); they must choose one if they can.
      const chooser = players(s, { ref: "subjectController" }, ctx)[0];
      const options = auraHostOptions(s, me, ctx.controller).filter((h) => "attachTo" in h).map(auraHostKey);
      // Asked: the answer is in the "enchant" answer's place (game.ts), for this card.
      let pick = sc.takkHost === "" ? sc.auraHosts?.[me.id] : undefined;
      if (sc.auraHosts) delete sc.auraHosts[me.id];
      if (pick === undefined || !options.includes(pick)) {
        if (chooser === undefined || !options.length) pick = "none";
        else if (options.length === 1) pick = options[0]!;
        else {
          sc.takkHost = "";
          sc.auraAsking = me.id;
          s.pending = { kind: "chooseOption", player: chooser, source: src, what: "enchant", options, labels: auraHostLabels(s, options.map(auraHostOf)), prompt: `choose a creature for ${src} to enchant` };
          return "paused";
        }
      }
      sc.takkHost = undefined;
      const you = ctx.controller;
      if (pick !== "none") {
        const host = s.objects[pick]!;
        log(s, `${chooser !== undefined ? player(s, chooser).name : "Nobody"} chooses ${characteristics(s, host).name}; ${src} returns to the battlefield under ${player(s, you).name}'s control attached to it.`);
        moveObject(s, me.id, "battlefield", { controller: you, putBy: you, attachTo: pick });
        return;
      }
      // "If they don't": it enters under your control as a non-Aura enchantment (the effect applies as it enters, CR 614.12)
      // that has lost "enchant creature" and has gained the upkeep trigger, "that player" being the player who couldn't
      // choose (GameObject.chosen.player; none if they've left the game, so it never triggers). For as long as it stays on
      // the battlefield (CR 611.2c, 400.7).
      log(s, `${chooser !== undefined ? player(s, chooser).name : "Nobody"} can't choose a creature; ${src} returns to the battlefield under ${player(s, you).name}'s control as a non-Aura enchantment.`);
      moveObject(s, me.id, "battlefield", {
        controller: you,
        putBy: you,
        entersAs: [{ kind: "loseTypes", types: [], subtypes: ["Aura"] }, { kind: "loseEnchant" }, { kind: "addAbility", text: TAKK_UPKEEP }],
        entersAsBy: { controller: you, source: src },
      });
      const back = s.objects[me.id]!;
      if (back.zone === "battlefield" && chooser !== undefined) back.chosen = { ...back.chosen, player: chooser };
      invalidateCharacteristics(s);
      return;
    }
  }
}
