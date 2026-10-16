// Harmonize (CR 702.180a-b): the graveyard menu offers it when tapping a creature makes it affordable, then a bar asks
// which creature to tap (or none), and the card is exiled after it resolves.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { controls, menu, modal, resolveUntil } from "./ui";

test("Unending Whisper: harmonize from the graveyard, tapping Hill Giant for {3} less", async ({ page }) => {
  const s = scene({ board: ["Island", "Island", "Island", "Hill Giant"], yard: ["Unending Whisper"] });
  const [whisper, giant] = [one(s, "Unending Whisper"), one(s, "Hill Giant")];
  await open(page, s);
  const hand = s.players[0]!.hand.length;
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Unending Whisper" }).click();
  await menu(page).getByRole("button", { name: /^Harmonize/ }).click();
  const bar = page.locator(".harmonize-pick");
  await expect(bar).toContainText("Harmonize:");
  await expect(bar.getByRole("button", { name: "Tap and cast" })).toBeDisabled();
  await expect(bar.getByRole("button", { name: "Cast without" })).toBeVisible();
  await page.locator(`[data-obj="${giant}"]`).click();
  await expect(bar).toContainText("Hill Giant: {3} less");
  await bar.getByRole("button", { name: "Tap and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[whisper]!.zone === "exile");
  expect(after.objects[giant]!.tapped).toBe(true);
  expect(after.players[0]!.hand.length).toBe(hand + 1);
  await expect(controls(page)).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});
