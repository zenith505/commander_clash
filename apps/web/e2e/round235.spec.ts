// Round 235's prompts: Mariposa Military Base's land menu ("You may have this land enter tapped. If you do, you get two
// rad counters"): "Play it tapped (you get 2 rad counters)" and "Play it untapped".
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Mariposa Military Base: play it tapped and get two rad counters", async ({ page }) => {
  const s = scene({ hand: ["Mariposa Military Base"] });
  const base = one(s, "Mariposa Military Base");
  await open(page, s);
  await card(page, "Mariposa Military Base", s).click();
  await expect(menu(page).getByRole("button", { name: "Play it untapped" })).toBeVisible();
  await menu(page).getByRole("button", { name: "Play it tapped (you get 2 rad counters)" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[base]!.zone === "battlefield");
  expect(after.objects[base]!.tapped).toBe(true);
  expect(after.players[0]!.rad).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Mariposa Military Base: play it untapped and get no rad counters", async ({ page }) => {
  const s = scene({ hand: ["Mariposa Military Base"] });
  const base = one(s, "Mariposa Military Base");
  await open(page, s);
  await card(page, "Mariposa Military Base", s).click();
  await menu(page).getByRole("button", { name: "Play it untapped" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[base]!.zone === "battlefield");
  expect(after.objects[base]!.tapped).toBe(false);
  expect(after.players[0]!.rad ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
