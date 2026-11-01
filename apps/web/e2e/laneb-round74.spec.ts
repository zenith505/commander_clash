// Lane B round 74 in the browser: abilities an Equipment gives that name it show its name in the creature's menu, and
// their costs are paid with that Equipment (Blazing Torch sacrificed, Leonin Bola unattached).
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { clickPlayer, menu, resolveUntil } from "./ui";

test("Blazing Torch: the Bears' menu shows the Torch's ability by name; it sacrifices the Torch for 2 damage to Ana", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Grizzly Bears", "Blazing Torch"] });
  const [bears, torch] = [one(s, "Grizzly Bears"), one(s, "Blazing Torch")];
  s.objects[torch]!.attachedTo = bears;
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const button = menu(page).getByRole("button", { name: /Sacrifice Blazing Torch: Blazing Torch deals 2 damage to any target/ });
  await expect(button).toBeVisible();
  await expect(menu(page)).not.toContainText("⟪");
  await button.click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === 38);
  expect(after.objects[torch]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Leonin Bola: unattach it to tap Ana's Hill Giant; the Bola stays on the battlefield", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Grizzly Bears", "Leonin Bola"] }, [{ board: ["Hill Giant"] }]);
  const [bears, bola, giant] = [one(s, "Grizzly Bears"), one(s, "Leonin Bola"), one(s, "Hill Giant")];
  s.objects[bola]!.attachedTo = bears;
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await menu(page).getByRole("button", { name: /Unattach Leonin Bola: Tap target creature/ }).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.tapped);
  expect(after.objects[bola]!.zone).toBe("battlefield");
  expect(after.objects[bola]!.attachedTo).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});
