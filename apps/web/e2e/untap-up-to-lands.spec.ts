// Snap: "Return target creature to its owner's hand. Untap up to two lands": as it resolves you click which tapped
// lands to untap (up to two, anyone's), then press Untap.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Snap: click a tapped land to untap, then Untap 1", async ({ page }) => {
  const s = scene({ hand: ["Snap"], board: LANDS }, [{ board: ["Grizzly Bears"] }]);
  const bears = idsOf(s, "Grizzly Bears", undefined, 1)[0]!;
  await open(page, s);
  await card(page, "Snap", s).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "pickPermanents");
  const tapped = st.battlefield.filter((id) => st.objects[id]!.controller === 0 && st.objects[id]!.tapped);
  expect(tapped.length).toBe(2);
  const bar = controls(page);
  await expect(bar).toContainText("Snap: click up to 2 tapped lands to untap (any player's), then untap them.");
  await expect(bar.getByRole("button", { name: "Untap none" })).toBeEnabled();
  await page.locator(`[data-obj="${tapped[0]}"]`).click();
  await bar.getByRole("button", { name: "Untap 1" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending);
  expect([after.objects[bears]!.zone, after.objects[tapped[0]!]!.tapped, after.objects[tapped[1]!]!.tapped]).toEqual(["hand", false, true]);
  expect(pageErrors(page)).toEqual([]);
});
