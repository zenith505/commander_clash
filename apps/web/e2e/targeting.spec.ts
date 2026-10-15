// Clicking a permanent in an opponent's area while choosing targets.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, resolveUntil } from "./ui";

test("'any target' at an opponent's creature targets the creature, not the player around it", async ({ page }) => {
  const s = scene({ hand: ["Shock", "Shock"], board: LANDS }, [{ board: ["Grizzly Bears"] }]);
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Shock", s, 0).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  let now = await resolveUntil(page, (st) => st.stack.length === 0);
  expect(now.objects[bears]!.zone).toBe("graveyard");
  expect(now.players[1]!.life).toBe(40);
  // The player is still a click on their name.
  await card(page, "Shock", s, 1).click();
  await clickPlayer(page, 1);
  now = await resolveUntil(page, (st) => st.stack.length === 0);
  expect(now.players[1]!.life).toBe(38);
  expect(pageErrors(page)).toEqual([]);
});
