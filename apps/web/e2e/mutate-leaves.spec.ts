// A mutated creature's cards leave together (CR 730.3a): put into a library, its owner arranges them, with the same
// arrows as the other ordering prompts.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Gemrazer mutated onto Grizzly Bears, then Griptide: put both cards on top of your library in your order", async ({ page }) => {
  const s = scene({ hand: ["Gemrazer", "Griptide"], board: [...LANDS, "Grizzly Bears"] });
  const gem = one(s, "Gemrazer");
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Gemrazer", s).click();
  await menu(page).getByRole("button", { name: /^Mutate/ }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "mutate");
  await controls(page).getByRole("button", { name: /^On top/ }).click();
  await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && !!st.objects[bears]!.merged);
  await card(page, "Griptide", s).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "orderLibrary");
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("put these 2 cards on top of your library in any order");
  await expect(arrange).toContainText("Top of library (leftmost on top)");
  const start = st.pending?.kind === "orderLibrary" ? st.pending.cards : [];
  expect(new Set(start)).toEqual(new Set([gem, bears]));
  const first = start[0]!;
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${first}"]`) }).getByRole("button", { name: "Move deeper" }).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  const lib = after.players[0]!.library;
  expect(lib.slice(0, 2)).toEqual([start[1]!, first]);
  expect(pageErrors(page)).toEqual([]);
});
