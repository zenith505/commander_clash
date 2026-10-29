// Round 206's prompt: "As this creature enters, it becomes your choice of a 3/3 artifact creature, a 2/2 artifact creature
// with flying, or a 1/6 Wall artifact creature with defender" (Primal Clay): asked as it enters (CR 614.12), on a bar
// with one button per choice, and the choice becomes part of its copiable values (CR 707.2).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Primal Clay: choose the 2/2 flyer as it enters", async ({ page }) => {
  const s = scene({ hand: ["Primal Clay"], board: [...LANDS] });
  const clay = one(s, "Primal Clay");
  await open(page, s);
  await card(page, "Primal Clay", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "form");
  const bar = controls(page);
  await expect(bar).toContainText("choose what Primal Clay becomes as it enters");
  for (const f of ["A 3/3 artifact creature", "A 2/2 artifact creature with flying", "A 1/6 Wall artifact creature with defender"]) await expect(bar.getByRole("button", { name: f, exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "A 2/2 artifact creature with flying", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[clay]!.zone === "battlefield");
  expect(after.log.some((l) => l.text === "Primal Clay enters as a 2/2 artifact creature with flying.")).toBe(true);
  await expect(card(page, "Primal Clay", after)).toContainText("2/2");
  expect(pageErrors(page)).toEqual([]);
});
