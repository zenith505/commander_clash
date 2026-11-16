// Lane B round B227 in the browser: Fishing Pole's granted ability on the equipped Grizzly Bears (its cost taps the Pole
// too), and Aeon Engine reversing the turn order while everyone keeps their seat on the screen.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { menu, resolveUntil, seat } from "./ui";

test("Fishing Pole: the equipped Grizzly Bears' ability taps it and the Pole and puts a bait counter on the Pole", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Grizzly Bears", "Fishing Pole"] });
  const [bears, pole] = [one(s, "Grizzly Bears"), one(s, "Fishing Pole")];
  s.objects[pole]!.attachedTo = bears;
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const button = menu(page).locator("button", { hasText: /Tap Fishing Pole: Put a bait counter on Fishing Pole/ });
  await expect(button).toBeEnabled();
  await button.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[pole]!.counters.bait ?? 0) === 1);
  expect(after.objects[pole]!.tapped).toBe(true);
  expect(after.objects[bears]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Aeon Engine: reverse the turn order; the turn order is backwards, but nobody changes seats", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Aeon Engine"] });
  const engine = one(s, "Aeon Engine");
  s.objects[engine]!.tapped = false;
  const order = [...s.turnOrder];
  await open(page, s);
  const before = await Promise.all([1, 2, 3].map((p) => seat(page, p).getAttribute("class")));
  await page.locator(`[data-obj="${engine}"]`).first().click();
  await menu(page).locator("button", { hasText: /Reverse the game's turn order/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[engine]!.zone === "exile");
  expect(after.turnOrder).toEqual([...order].reverse());
  expect(await Promise.all([1, 2, 3].map((p) => seat(page, p).getAttribute("class")))).toEqual(before);
  expect(pageErrors(page)).toEqual([]);
});
