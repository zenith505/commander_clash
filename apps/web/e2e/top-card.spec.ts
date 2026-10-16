// PR #25: looking at the top card of your library any time (Elven Chorus), and casting a creature from there.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { menu, resolveUntil, seat } from "./ui";

test("Elven Chorus: only you see your top card, and a creature there can be cast", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Elven Chorus"], library: ["Hill Giant", "Shock"] }, [{ library: ["Grizzly Bears"] }]);
  const [giant, shock, bears] = [one(s, "Hill Giant"), one(s, "Shock"), one(s, "Grizzly Bears")];
  await open(page, s);
  const library = seat(page, 0).locator(".zone", { hasText: "Library" });
  await expect(library.locator(`[data-obj="${giant}"]`)).toBeVisible();
  await expect(library.locator(".zone-title")).toHaveText("Library ✦");
  // Opponents' libraries stay hidden.
  await expect(seat(page, 1).locator(`[data-obj="${bears}"]`)).toHaveCount(0);
  await library.locator(`[data-obj="${giant}"]`).click();
  await resolveUntil(page, (st) => st.objects[giant]!.zone === "battlefield" && st.stack.length === 0);
  // Now an instant is on top: you see it, but Elven Chorus only lets you cast creatures from there.
  await expect(library.locator(`[data-obj="${shock}"]`)).toBeVisible();
  await expect(library.locator(".zone-title")).toHaveText("Library");
  expect(pageErrors(page)).toEqual([]);
});

test("Brutal Deceiver: look at the top card of your library, then put it back", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Brutal Deceiver"], library: ["Hill Giant", "Shock"] });
  const [deceiver, giant] = [one(s, "Brutal Deceiver"), one(s, "Hill Giant")];
  await open(page, s);
  await page.locator(`[data-obj="${deceiver}"]`).click();
  await menu(page).getByRole("button", { name: /Look at the top card of your library/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "arrangeTop");
  const look = page.locator(".modal.arrange");
  await expect(look).toContainText("Brutal Deceiver: the top card of your library");
  await expect(look.locator(`[data-arrange="${giant}"]`)).toBeVisible();
  await look.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.players[0]!.library[0]).toBe(giant);
  expect(pageErrors(page)).toEqual([]);
});
