// Lane B round 25 in the browser: Hatchet Bully's "Put a -1/-1 counter on a creature you control" cost (CR 602.2b,
// 601.2h): click the creature that gets it, one of yours only.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, menu, resolveUntil } from "./ui";

test("Hatchet Bully: put the -1/-1 counter on your Grizzly Bears to deal 2 damage to Ana", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Hatchet Bully", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [bully, bears, giant] = [one(s, "Hatchet Bully"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  const life = s.players[1]!.life;
  await open(page, s);
  await card(page, "Hatchet Bully", s).click();
  await menu(page).locator("button", { hasText: "2 damage" }).click();
  await clickPlayer(page, 1);
  const bar = page.locator(".targeting", { hasText: "put a -1/-1 counter on a creature you control" });
  const done = bar.getByRole("button", { name: "Put the counter and activate" });
  await expect(done).toBeDisabled();
  // Ana's Hill Giant isn't yours: nothing happens.
  await page.locator(`[data-obj="${giant}"]`).click();
  await expect(done).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).click();
  await done.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life < life);
  expect(after.players[1]!.life).toBe(life - 2);
  expect(after.objects[bears]!.counters["-1/-1"]).toBe(1);
  expect(after.objects[giant]!.counters["-1/-1"] ?? 0).toBe(0);
  expect(after.objects[bully]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
