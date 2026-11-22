// Round 446's whole lines (compile.ts, before round 445's): Psychic Paper's name and creature type, chosen as it becomes
// attached to a creature, and Vesuvan Shapeshifter's copy, chosen as it enters or is turned face up, until it's turned face
// down.
import type { CompiledCard } from "../abilities";
import { parseCardNameChoice } from "./search";
import { parseStatic } from "./statics";
import { parseTargetPhrase } from "./targets";
import { parseCopyExcept } from "./tokens";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

/** One whole line of round 446's (compile.ts); false when it isn't one of these. */
export function round446Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Psychic Paper: "As ~ becomes attached to a creature, choose a creature card name and a creature type." Asked each time
  // it becomes attached to a creature, as Sanctuary Blade's color is (game.ts askAttachColor): any creature card's name
  // (CR 201.4), an existing creature type (CR 205.3m; rulings: not a card type or supertype), into Chosen.name and type.
  if (line === "As ~ becomes attached to a creature, choose a creature card name and a creature type.") {
    const c = parseCardNameChoice("a creature card name");
    if (!c?.names || out.attachChooseColor || out.attachChooseNameAndType) return fail(out, raw);
    out.attachChooseNameAndType = { names: c.names };
    return true;
  }
  // Psychic Paper: "Equipped creature has ward {1}, it can't be blocked, and its name and creature type are the last chosen
  // name and creature type." Its new name is a text-changing effect (CR 123.6c, 613.1c: layer 3); its creature type
  // replaces its others, keeping its other card types and their subtypes (CR 205.1b, 613.1d: layer 4); none chosen yet,
  // neither changes. Ward and "can't be blocked" are granted as any are (layer 6).
  if (line === "Equipped creature has ward {1}, it can't be blocked, and its name and creature type are the last chosen name and creature type.") {
    const st = out.attachChooseNameAndType ? parseStatic("Equipped creature has ward {1} and can't be blocked.") : null;
    if (!st || st.affects.kind !== "attached" || st.mods.length !== 2) return fail(out, raw);
    out.statics.push({ ...st, text: line }, { affects: { kind: "attached" }, mods: [{ kind: "setName", name: "", chosen: true }, { kind: "setSubtypes", subtypes: [], chosenType: true }], text: line });
    return true;
  }
  // Vesuvan Shapeshifter: "As ~ enters or is turned face up, you may choose another creature on the battlefield. If you do,
  // until ~ is turned face down, it becomes a copy of that creature, except it has "At the beginning of your upkeep, you may
  // turn ~ face down."" A replacement effect as it enters (CR 614.1c, 614.12: entering as the copy, so the copied creature's
  // "enters" abilities apply and trigger) or as it's turned face up (CR 614.1e: chosen with turning it face up; the copied
  // creature's "turned face up" abilities, rulings), anyone's creature but itself; the exception part of the copiable values
  // (CR 707.9b), so a copy of it has the trigger too (rulings). The copy effect lasts until it's turned face down (CR
  // 611.2a), not after; a face-down permanent has no abilities, so entering face down it doesn't choose (CR 708.2).
  const vesuvan = /^As ~ enters or is turned face up, you may choose another creature on the battlefield\. If you do, until ~ is turned face down, it becomes a copy of that creature, except (it has "[^"]+")$/.exec(line);
  if (vesuvan) {
    const except = parseCopyExcept(vesuvan[1]!);
    const filter = parseTargetPhrase("creature");
    if (!except || except.thisAbility || !filter || filter.kind !== "object" || out.entersAsCopy) return fail(out, raw);
    out.entersAsCopy = { filter: { ...filter, text: "another creature on the battlefield" }, except, untilFaceDown: true, faceUp: true };
    return true;
  }
  return false;
}
