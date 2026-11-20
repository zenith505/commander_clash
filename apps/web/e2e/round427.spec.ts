// Round 427: Sidequest: Play Blitzball. Craw Wurm deals Ana 6 combat damage, so at the end of combat it transforms into
// World Champion, Celestial Weapon and asks which creature you control to attach it to; you pick Hill Giant.
import { expect, test } from "@playwright/test";
import { applyAction, waitingOn, type GameState } from "@cc/engine";
import { one, open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

const BLITZBALL = "Sidequest: Play Blitzball // World Champion, Celestial Weapon";

test("Sidequest: Play Blitzball: 6 combat damage to Ana; it transforms and you choose Hill Giant to attach it to", async ({ page }) => {
  let s: GameState = scene({ board: [BLITZBALL, "Craw Wurm", "Hill Giant"] }, [{}]);
  const [blitz, wurm, giant] = [one(s, "Sidequest: Play Blitzball"), one(s, "Craw Wurm"), one(s, "Hill Giant")];
  // Your combat, played in the engine: the beginning of combat +2/+0 on Hill Giant, Craw Wurm attacks Ana, no blocks.
  let attacked = false;
  for (let i = 0; i < 400 && !(s.pending?.kind === "chooseOption" && s.pending.what === "enchant"); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && p.player === 0) s = applyAction(s, { type: "chooseTargets", player: 0, targets: [{ kind: "object", id: giant }] });
    else if (p?.kind === "declareAttackers") {
      s = applyAction(s, { type: "declareAttackers", player: 0, attacks: attacked ? [] : [{ attacker: wurm, defender: 1 }] });
      attacked = true;
    } else if (p?.kind === "declareBlockers") s = applyAction(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) throw new Error(`unexpected ${p.kind}`);
    else s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  }
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant", player: 0 });
  expect(s.turnLog?.combatDamage?.[1]).toBe(6);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose a creature you control to attach World Champion, Celestial Weapon to");
  await bar.getByRole("button", { name: "Hill Giant", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[blitz]!.attachedTo === giant);
  expect(after.objects[blitz]!.face).toBe(1);
  expect(after.log.some((l) => /Sidequest: Play Blitzball transforms into World Champion, Celestial Weapon/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
