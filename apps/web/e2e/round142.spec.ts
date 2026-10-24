// Round 142: Slippery Bogbonder's enters trigger puts a hexproof counter on its target, then you pick counters one at a
// time from among your other creatures to move onto it.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Slippery Bogbonder: pick counters one at a time from your creatures, then move them all onto the target", async ({ page }) => {
  const s = scene({ hand: ["Slippery Bogbonder"], board: [...LANDS, "Grizzly Bears", "Hill Giant"] });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[giant]!.counters = { "+1/+1": 2, flying: 1 };
  await open(page, s);
  await card(page, "Slippery Bogbonder", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).click();
  const done = page.locator(".targeting").getByRole("button", { name: "Done" });
  if (await done.isVisible()) await done.click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "removeCounter");
  const bar = controls(page);
  await expect(bar).toContainText("choose a counter to move onto Grizzly Bears (0 so far)");
  await bar.getByRole("button", { name: "A +1/+1 counter from Hill Giant (2 left)" }).click();
  await expect(bar).toContainText("(1 so far)");
  await bar.getByRole("button", { name: "A flying counter from Hill Giant (1 left)" }).click();
  await bar.getByRole("button", { name: "That's all" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[bears]!.counters.flying ?? 0) === 1);
  expect(after.objects[bears]!.counters).toMatchObject({ hexproof: 1, "+1/+1": 1, flying: 1 });
  expect(after.objects[giant]!.counters).toMatchObject({ "+1/+1": 1, flying: 0 });
  expect(pageErrors(page)).toEqual([]);
});
