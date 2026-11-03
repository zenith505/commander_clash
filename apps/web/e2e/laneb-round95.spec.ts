// Lane B round 95's choice in the browser: Storage Matrix's artifact, creature, or land in your untap step.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Storage Matrix in your untap step: choose Land; your tapped Forest untaps, your tapped Grizzly Bears doesn't", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Storage Matrix", "Grizzly Bears"] });
  const bears = one(s0, "Grizzly Bears");
  const forest = idsOf(s0, "Forest", "battlefield", 0)[0]!;
  s0.objects[bears]!.tapped = true;
  s0.objects[forest]!.tapped = true;
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "untapType" && st.pending.player === 0);
  expect(s.step).toBe("untap");
  await open(page, s);
  await expect(controls(page)).toContainText("choose artifact, creature, or land: only your permanents of that type untap this step");
  await expect(controls(page).getByRole("button", { name: "Creature", exact: true })).toBeVisible();
  await controls(page).getByRole("button", { name: "Land", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.step !== "untap" && !st.objects[forest]!.tapped);
  expect(after.objects[bears]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
