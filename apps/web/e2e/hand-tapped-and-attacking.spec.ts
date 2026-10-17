// "Put a creature card from your hand onto the battlefield tapped and attacking" (CR 508.4): pick the card, then choose
// which player it attacks (rulings on Kinscaer Sentry: not necessarily the one the Sentry attacks).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { attack, controls, modal, resolveUntil } from "./ui";

test("Kinscaer Sentry: put Savannah Lions onto the battlefield attacking Ben while the Sentry attacks Ana", async ({ page }) => {
  const s = scene({ hand: ["Savannah Lions", "Hill Giant"], board: [...LANDS, "Kinscaer Sentry", "Grizzly Bears"] });
  const [sentry, bears, lions, giant] = [one(s, "Kinscaer Sentry"), one(s, "Grizzly Bears"), one(s, "Savannah Lions"), one(s, "Hill Giant")];
  await open(page, s);
  await controls(page).getByRole("button", { name: "Pass" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  await attack(page, [[sentry, 1], [bears, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  // Two attacking creatures: X is 2, so the Hill Giant (mana value 4) can't be put in.
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${lions}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await expect(controls(page)).toContainText("choose what Savannah Lions attacks");
  await controls(page).getByRole("button", { name: "Ben", exact: true }).click();
  const mid = await resolveUntil(page, (st) => st.objects[lions]!.zone === "battlefield" && !st.pending && st.stack.length === 0);
  expect(mid.objects[lions]!.tapped).toBe(true);
  expect(mid.objects[lions]!.attacking).toBe(2);
  await resolveUntil(page, (st) => st.step === "main2");
  const after = await state(page);
  expect(after.players[2]!.life).toBe(38); // the Lions' 2 damage
  expect(after.players[1]!.life).toBe(36); // the Sentry and the Bears
  expect(pageErrors(page)).toEqual([]);
});
