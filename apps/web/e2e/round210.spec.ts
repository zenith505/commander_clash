// Round 210: Yuffie, Materia Hunter's "you may attach an Equipment you control to ~": one of your Equipment, or none.
import { expect, test } from "@playwright/test";
import { applyAction, controllerOf, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Yuffie: gain control of the opponent's artifact, then attach one Equipment to her", async ({ page }) => {
  let s: GameState = scene({ hand: ["Yuffie, Materia Hunter"], board: [...LANDS, "Bonesplitter", "Lightning Greaves"] }, [{ board: ["Sol Ring"] }]);
  const yuffie = one(s, "Yuffie, Materia Hunter");
  const [splitter, ring] = [one(s, "Bonesplitter"), one(s, "Sol Ring")];
  for (const a of planCast(s, 0, yuffie)!) s = applyAction(s, a);
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await page.locator(`[data-obj="${ring}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "attach");
  const bar = controls(page);
  await expect(bar).toContainText("you may click one of your Equipment to attach to Yuffie, Materia Hunter");
  await expect(bar.getByRole("button", { name: "Attach none" })).toBeVisible();
  await page.locator(`[data-obj="${splitter}"]`).click();
  await bar.getByRole("button", { name: "Attach 1" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[splitter]!.attachedTo === yuffie);
  expect(controllerOf(after, after.objects[ring]!)).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
