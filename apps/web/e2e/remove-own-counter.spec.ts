// "{1}{U}, Remove a counter from this creature: Counter target noncreature spell. Its controller draws a card." (Glen
// Elendra Guardian): the counter picker offers only the Guardian's own counters (CR 602.2b).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Glen Elendra Guardian: remove its own counter to counter a noncreature spell; its controller draws", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Glen Elendra Guardian", "Grizzly Bears"] });
  const [guardian, bears, divination] = [one(s, "Glen Elendra Guardian"), one(s, "Grizzly Bears"), one(s, "Divination")];
  s.objects[guardian]!.counters["-1/-1"] = 1;
  s.objects[bears]!.counters["+1/+1"] = 1;
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await card(page, "Divination", s).click();
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  await page.locator(`[data-obj="${guardian}"]`).click();
  const item = menu(page).getByRole("button", { name: /Counter target noncreature spell/ });
  if (await item.count()) await item.click();
  const top = (await state(page)).stack[0]!.id;
  await page.locator(`[data-stack="${top}"]`).click();
  const pick = page.locator(".counter-pick");
  await expect(pick).toContainText("remove 1 counter from it");
  await expect(pick.locator("[data-counter]")).toHaveCount(1);
  await pick.locator(`[data-counter="${guardian}:-1/-1"]`).getByRole("button", { name: "+" }).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[divination]!.zone === "graveyard");
  expect(after.objects[guardian]!.counters["-1/-1"] ?? 0).toBe(0);
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(1);
  // Divination was countered (no two cards), and its controller (you) drew one: the hand lost Divination, gained one.
  expect(after.players[0]!.hand.length).toBe(hand);
  expect(pageErrors(page)).toEqual([]);
});
