// "Roll two d12 and choose one result" (Reckless Endeavor): a button for each die as it resolves; the one clicked is "that
// result", the other "the other result".
import { expect, test } from "@playwright/test";
import { nextRandom, type GameState } from "@cc/engine";
import { one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

/** The next d12s rolled come up `values` (the game's seeded random numbers, CR 706.1b). */
function rig(s: GameState, values: number[]) {
  for (let st = 1; ; st++) {
    const t = { rngState: st };
    if (values.every((v) => 1 + Math.floor(nextRandom(t) * 12) === v)) {
      s.rngState = st;
      return;
    }
  }
}

test("Reckless Endeavor: choose which die deals the damage", async ({ page }) => {
  const s = scene({ hand: ["Reckless Endeavor"], board: ["Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain"] }, [{ board: ["Grizzly Bears"] }]);
  const spell = one(s, "Reckless Endeavor");
  rig(s, [9, 2]);
  await open(page, s);
  await card(page, "Reckless Endeavor", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "rollResult");
  const bar = controls(page);
  await expect(bar).toContainText("Reckless Endeavor: you rolled 9 and 2: choose one result");
  await expect(bar.getByRole("button", { name: "9", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "2", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[spell]?.zone === "graveyard");
  const treasures = after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.isToken);
  expect(treasures).toHaveLength(9);
  expect(after.log.some((l) => l.text === "You chooses 2 (the other result is 9).")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
