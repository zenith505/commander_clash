// Round 167: Lake of the Dead enters only by sacrificing a Swamp: a button for each Swamp you control.
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Lake of the Dead: play it, pick which Swamp to sacrifice, and it enters", async ({ page }) => {
  const s = scene({ hand: ["Lake of the Dead"], board: ["Swamp", "Swamp", "Island"] });
  const lake = one(s, "Lake of the Dead");
  const [first, second] = idsOf(s, "Swamp", "battlefield", 0);
  await open(page, s);
  await page.locator(`[data-obj="${lake}"]`).first().click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "sacrificeInstead");
  const options = asked.pending?.kind === "chooseOption" ? asked.pending.options : [];
  expect([...options].sort()).toEqual([first, second].sort());
  const bar = controls(page);
  await expect(bar).toContainText("Lake of the Dead: sacrifice a Swamp for it to enter");
  await expect(bar.getByRole("button")).toHaveText(["Sacrifice Swamp", "Sacrifice Swamp"]);
  await bar.getByRole("button").nth(1).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[lake]!.zone === "battlefield");
  expect(after.objects[options[1]!]!.zone).toBe("graveyard");
  expect(after.objects[options[0]!]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
