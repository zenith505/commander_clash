// "As ~ enters, exile ... from your graveyard" (CompiledCard.entersExileFromYard): Sutured Ghoul, Living Lore,
// Frankenstein's Monster. Lane B round B171.
import { compileCard } from "./oracle";
import { defOf } from "./cards";
import { fireEvent, printedMatches } from "./effects";
import { log, moveObject, nameOf, neverEnters, obj, player } from "./game";
import { controllerOf, invalidateCharacteristics } from "./layers";
import { RulesError, type GameObject, type GameState, type ObjectId } from "./types";

type Entry = NonNullable<GameState["entersChoices"]>[number];

/** The graveyards it exiles from: its controller's, or with `anyGraveyard` (Dermotaxi, round 423) every player's still in the game (CR 800.4a), in turn order. */
function yardsOf(s: GameState, o: GameObject): ObjectId[] {
  const how = compileCard(defOf(s, o)).entersExileFromYard;
  if (!how?.anyGraveyard) return player(s, controllerOf(s, o)).graveyard;
  return s.turnOrder.flatMap((pid) => (player(s, pid).lost ? [] : player(s, pid).graveyard));
}

/** The cards of its controller's graveyard (any graveyard, with `anyGraveyard`) it may exile now: never itself (rulings), nor one already chosen. */
export function yardExileOptions(s: GameState, o: GameObject, chosen: readonly string[]): ObjectId[] {
  const how = compileCard(defOf(s, o)).entersExileFromYard;
  if (!how) return [];
  return yardsOf(s, o).filter((id) => id !== o.id && !chosen.includes(id) && printedMatches(how.filter, defOf(s, obj(s, id))));
}

/** How many cards it must exile: "one" (or none with none there), X, or undefined for "any number". */
function needed(s: GameState, o: GameObject, c: Entry): number | undefined {
  const how = compileCard(defOf(s, o)).entersExileFromYard!;
  return how.n === "any" ? undefined : how.n === "one" ? 1 : (c.enterOpts?.x ?? 0);
}

/**
 * Ask for the next card to exile, or finish when nothing is left to choose (CR 614.12a: the choice is made as it enters).
 * Returns true when a question is pending, false when the entry was used up.
 */
export function askYardExile(s: GameState, o: GameObject, c: Entry): boolean {
  const how = compileCard(defOf(s, o)).entersExileFromYard!;
  const chosen = c.options ?? [];
  const options = yardExileOptions(s, o, chosen);
  const need = needed(s, o, c);
  const you = controllerOf(s, o);
  const name = defOf(s, o).name;
  // Frankenstein's Monster: with fewer creature cards than X, all of them are exiled (CR 609.3) and it never enters; so with
  // exactly as many as it needs, or none left to choose, there's nothing to ask.
  const allLeft = need !== undefined && chosen.length + options.length <= need;
  if (!options.length || allLeft || (need !== undefined && chosen.length >= need)) {
    s.entersChoices!.shift();
    finishYardExile(s, o, c, allLeft ? [...chosen, ...options] : chosen);
    return false;
  }
  const left = need === undefined ? undefined : need - chosen.length;
  const counted = how.counterEach ? `, each one a ${how.counterEach.slice(0, -1).join(", ")}, or ${how.counterEach.at(-1)} counter` : "";
  const yardWord = how.anyGraveyard ? "a" : "your";
  const prompt = need === undefined ? `exile any number of ${how.filter.text}s from ${yardWord} graveyard as it enters${chosen.length ? ` (${chosen.length} so far)` : ""}` : need === 1 ? `exile ${/^[aeiou]/.test(how.filter.text) ? "an" : "a"} ${how.filter.text} from ${yardWord} graveyard as it enters` : `exile ${need} ${how.filter.text}s from ${yardWord} graveyard as it enters${counted} (${left} more to choose)`;
  s.pending = { kind: "chooseOption", player: you, source: name, what: "exileFromYard", options: [...options, ...(need === undefined ? ["done"] : [])], labels: [...options.map((id) => `Exile ${nameOf(s, id)}${how.anyGraveyard && obj(s, id).owner !== you ? ` (${player(s, obj(s, id).owner).name}'s graveyard)` : ""}`), ...(need === undefined ? [chosen.length ? "That's all" : "Exile none"] : [])], objectId: o.id, prompt };
  return true;
}

/** The answer to askYardExile: one more card, or "done". */
export function yardExileChosen(s: GameState, o: GameObject, entry: Entry | undefined, choice: string, options: readonly string[]) {
  if (!entry || entry.what !== "exileFromYard") throw new RulesError("nothing to exile");
  if (!options.includes(choice)) throw new RulesError("choose a card offered");
  if (choice === "done") {
    finishYardExile(s, o, entry, entry.options ?? []);
    return;
  }
  // Asked again (askYardExile) with this card chosen.
  s.entersChoices!.unshift({ ...entry, options: [...(entry.options ?? []), choice] });
}

/**
 * The cards chosen are exiled together, linked to it (CR 607.2b); then, with `counterEach`, a counter is chosen for each
 * one (CR 614.1c); then it has entered. Frankenstein's Monster with fewer than X never enters (rulings on Lotus Vale's like:
 * it goes straight to the graveyard).
 */
function finishYardExile(s: GameState, o: GameObject, c: Entry, ids: string[]) {
  const how = compileCard(defOf(s, o)).entersExileFromYard!;
  const you = controllerOf(s, o);
  const need = needed(s, o, c);
  const yards = yardsOf(s, o);
  const cards = ids.filter((id) => s.objects[id]?.zone === "graveyard" && yards.includes(id));
  const key = `${o.id}@${o.zoneChanges ?? 0}`;
  if (cards.length) {
    log(s, `${player(s, you).name} exiles ${cards.map((id) => nameOf(s, id)).join(", ")} from ${how.anyGraveyard ? cards.map((id) => (obj(s, id).owner === you ? "their" : `${player(s, obj(s, id).owner).name}'s`)).join(" and ") : "their"} graveyard as ${defOf(s, o).name} enters.`);
    for (const id of cards) {
      moveObject(s, id, "exile");
      ((s.linkedExile ??= {})[key] ??= []).push({ id, zc: obj(s, id).zoneChanges ?? 0 });
    }
    invalidateCharacteristics(s);
  } else log(s, `${player(s, you).name} exiles no cards from ${how.anyGraveyard ? "a" : "their"} graveyard as ${defOf(s, o).name} enters.`);
  if (need !== undefined && how.n === "x" && cards.length < need) {
    log(s, `${defOf(s, o).name} couldn't exile ${need} ${how.filter.text}s, so it goes to its owner's graveyard instead.`);
    neverEnters(s, o);
    return;
  }
  if (how.counterEach && cards.length) {
    // One counter choice for each card exiled, asked before anything else about it (CR 614.12a).
    const asks: Entry[] = cards.map((_, i) => ({ id: o.id, zc: o.zoneChanges ?? 0, what: "counterChoice", options: [...how.counterEach!], ...(i === cards.length - 1 && c.enters ? { enters: c.enters } : {}) }));
    s.entersChoices = [...asks, ...(s.entersChoices ?? [])];
    return;
  }
  if (c.enters) fireEvent(s, { type: "enters", id: o.id, ...c.enters });
}
