// Lane B round B211's lines, read by compileCard before its triggers and activated abilities (after round B210's).
import type { CompiledCard, Effect } from "../abilities";
import { parseActivated } from "./activated";
import { parseBody } from "./body";
import { parseStatic } from "./statics";
import { parseTrigger } from "./triggers";

/** Call to Arms: "the chosen color is the most common color among nontoken permanents the chosen player controls but isn't tied for most common". */
const MOST_COMMON = "the chosen color is the most common color among nontoken permanents the chosen player controls but isn't tied for most common";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB211Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Chromatic Armor: "Prevent all damage that would be dealt to enchanted creature by sources of the last chosen color.":
  // Prismatic Ward's prevention (CR 615.1), by the color kept on the Aura (GameObject.chosen.color), the one chosen as it
  // entered (CR 614.12) until its {X} ability chooses another (see below), while it's still that object (CR 400.7).
  if (line === "Prevent all damage that would be dealt to enchanted creature by sources of the last chosen color.") {
    if (!out.entersChoose?.some((c) => c.what === "color")) return fail();
    const st = parseStatic("Prevent all damage that would be dealt to enchanted creature by sources of the chosen color.");
    if (!st || st.affects.kind !== "attached" || st.mods.length !== 1 || st.mods[0]!.kind !== "preventDamage" || !st.mods[0]!.fromChosenColor) return fail();
    out.statics.push({ ...st, text: line });
    return true;
  }
  // Chromatic Armor: "{X}: Put a sleight counter on ~ and choose a color. X is the number of sleight counters on ~.": X is
  // defined by the ability (CR 107.3c), the counters on it as it's activated (as Voodoo Doll, ActivatedAbility.xIs); as it
  // resolves, the counter, then a color chosen (CR 608.2d) that becomes the last chosen color, kept on the Aura while it's
  // still that object (CR 400.7).
  if (line === "{X}: Put a sleight counter on ~ and choose a color. X is the number of sleight counters on ~.") {
    const a = parseActivated("{X}: Put a sleight counter on ~. X is the number of sleight counters on ~.");
    if (!a || a === "fail" || typeof a.xIs !== "object" || !("counters" in a.xIs) || a.xIs.counters !== "sleight" || a.body.effects.length !== 1 || a.body.effects[0]!.type !== "counters") return fail();
    out.activated.push({ ...a, body: { ...a.body, effects: [...a.body.effects, { type: "choose", choice: "color", keepOnSource: true }], text: "Put a sleight counter on ~ and choose a color." }, text: line });
    return true;
  }
  // Call to Arms: "White creatures get +1/+1 as long as ...": every white creature, anyone's (rulings), while the color
  // chosen as it entered has more nontoken permanents of that color controlled by the opponent chosen then than any other
  // color does (multicolored ones counted for each color, colorless ones not, rulings), whoever controls it now (rulings).
  if (line === `White creatures get +1/+1 as long as ${MOST_COMMON}.`) {
    if (!out.entersChoose?.some((c) => c.what === "color") || out.entersChoosePlayer !== "opponent") return fail();
    const st = parseStatic("White creatures get +1/+1.");
    if (!st || st.affects.kind !== "filter" || st.condition) return fail();
    out.statics.push({ ...st, condition: { kind: "chosenColorMostCommonOfChosen" }, text: line });
    return true;
  }
  // Call to Arms: "When the chosen color isn't the most common color among nontoken permanents the chosen player controls
  // or is tied for most common, sacrifice ~.": a state trigger (CR 603.8), not again while it's on the stack, and it's
  // sacrificed even if the numbers have changed by then (rulings).
  if (line === "When the chosen color isn't the most common color among nontoken permanents the chosen player controls or is tied for most common, sacrifice ~.") {
    if (!out.entersChoose?.some((c) => c.what === "color") || out.entersChoosePlayer !== "opponent") return fail();
    const body = parseBody("Sacrifice ~.", { selfIt: true });
    if (!body || body.effects.length !== 1 || body.effects[0]!.type !== "sacrifice") return fail();
    out.triggers.push({ event: "state", state: { kind: "not", cond: { kind: "chosenColorMostCommonOfChosen" } }, body: { ...body, text: "sacrifice ~." } });
    return true;
  }
  // Nettlevine Blight's granted 'At the beginning of your end step, sacrifice this permanent and attach Nettlevine Blight
  // to a creature or land you control.': "you" is the enchanted permanent's controller, who sacrifices it and then chooses
  // the creature or land of theirs the Aura goes on (rulings), not targeted (CR 115.10), one it can legally enchant (CR
  // 303.4, 701.3b); with none it stays unattached and state-based actions put it into its owner's graveyard (CR 704.5m).
  // Both happen even if the first can't (no "if you do").
  if (line === "At the beginning of your end step, sacrifice ~ and attach ⟪source⟫ to a creature or land you control.") {
    const t = parseTrigger("At the beginning of your end step, sacrifice ~.");
    if (!t || t === "fail" || t.event !== "yourEndStep" || t.body.effects.length !== 1 || t.body.effects[0]!.type !== "sacrifice") return fail();
    const attach: Effect = { type: "attachToChosen", source: { ref: "grantSource" }, filter: { kind: "object", types: ["Creature", "Land"], notTypes: [], notColors: [], controller: "you", text: "creature or land you control" } };
    out.triggers.push({ ...t, body: { ...t.body, effects: [...t.body.effects, attach], text: "sacrifice ~ and attach ⟪source⟫ to a creature or land you control." } });
    return true;
  }
  // Strax, Sontaran Nurse: "Grenades! — {2}, {T}, Sacrifice an artifact: Choose a player at random. When you do, ~ fights
  // another target creature that player controls.": the flavor word has no rules meaning (CR 207.2d); the player is any
  // player still in the game, you too, chosen at random as it resolves (no one chooses); then a reflexive ability (CR
  // 603.12) whose target is another creature that player controls, chosen by its controller (rulings), none to choose and
  // it's removed from the stack (CR 603.3d). The fight follows CR 701.14.
  if (line === "Grenades! — {2}, {T}, Sacrifice an artifact: Choose a player at random. When you do, ~ fights another target creature that player controls.") {
    const a = parseActivated("{2}, {T}, Sacrifice an artifact: Draw a card.");
    const fight = parseBody("~ fights another target creature.", {});
    const t = fight?.targets[0];
    if (!a || a === "fail" || a.costs?.length !== 1 || a.costs[0]!.kind !== "sacrifice" || !fight || fight.targets.length !== 1 || t?.kind !== "object" || !t.notSource || fight.effects.length !== 1 || fight.effects[0]!.type !== "fight") return fail();
    const reflexive = { ...fight, targets: [{ ...t, controller: "chosenPlayer" as const, text: "another target creature that player controls" }], text: "~ fights another target creature that player controls." };
    out.activated.push({ ...a, body: { targets: [], effects: [{ type: "choose", choice: "opponent", random: true, anyPlayer: true }, { type: "reflexive", body: reflexive, boundChosenPlayer: true }], text: "Choose a player at random. When you do, ~ fights another target creature that player controls." }, text: line });
    return true;
  }
  // Merseine: "Pay enchanted creature's mana cost: Remove a net counter from ~. Only the controller of the enchanted creature
  // may activate this ability.": any player who controls the creature the Aura is attached to as they activate it (CR
  // 602.2, the one who does controls it, CR 113.8), as often as they like (rulings); the cost is that creature's mana cost
  // as it is then, colored symbols included (rulings), {X} as 0 (CR 107.3h), and unpayable if it has none (CR 118.6).
  if (line === "Pay enchanted creature's mana cost: Remove a net counter from ~. Only the controller of the enchanted creature may activate this ability.") {
    const a = parseActivated("{0}: Remove a net counter from ~.");
    if (!a || a === "fail" || a.tap || a.costs?.length || a.body.effects.length !== 1 || a.body.effects[0]!.type !== "removeCounters") return fail();
    out.activated.push({ ...a, manaCost: "", attachedManaCost: true, anyPlayer: true, enchantedControllerOnly: true, text: line });
    return true;
  }
  return false;
}
