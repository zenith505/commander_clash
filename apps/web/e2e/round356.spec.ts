// Round 356: The Fourth Doctor's once-a-turn historic card from the top of your library, clicked there, which makes a
// Food; the next card on top can't be played that turn.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { resolveUntil, seat } from "./ui";

test("The Fourth Doctor: click Sol Ring on top of your library to cast it; a Food is made, and Ornithopter under it waits", async ({ page }) => {
  const s = scene({ board: [...LANDS, "The Fourth Doctor"], library: ["Sol Ring", "Ornithopter"] });
  const [ring, thopter] = [one(s, "Sol Ring"), one(s, "Ornithopter")];
  await open(page, s);
  const library = seat(page, 0).locator(".zone", { hasText: "Library" });
  await expect(library.locator(".zone-title")).toHaveText("Library ✦");
  await library.locator(`[data-obj="${ring}"]`).click();
  const after = await resolveUntil(page, (st) => st.objects[ring]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && /^Food/.test(after.cards[after.objects[id]!.cardId]!.name)).length).toBe(1);
  // Ornithopter is historic too, but the permission is used this turn.
  await expect(library.locator(`[data-obj="${thopter}"]`)).toBeVisible();
  await expect(library.locator(".zone-title")).toHaveText("Library");
  expect(pageErrors(page)).toEqual([]);
});
