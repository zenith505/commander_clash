// Round 453 in the browser: Psychic Battle. Your Lightning Bolt at Ana's Hill Giant triggers your Psychic Battle; you
// reveal the greatest mana value (Serra Angel, the others' tops being basic lands) and keep the target. Then Ana's
// Lightning Bolt at your Grizzly Bears triggers it; you win again and click her Hill Giant as the Bolt's new target.
import { expect, test } from "@playwright/test";
import { applyAction, planCast } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, resolveUntil } from "./ui";

test("Psychic Battle: your Bolt at Ana's Hill Giant, you reveal the greatest mana value and keep the target", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Psychic Battle"], library: ["Serra Angel"] }, [{ board: ["Hill Giant"] }]);
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const ask = await resolveUntil(page, (st) => st.pending?.kind === "newTargets" && st.pending.player === 0);
  expect(ask.log.some((l) => /You reveals? Serra Angel \(mana value 5\)/.test(l.text))).toBe(true);
  await expect(page.locator(".targeting")).toContainText("Psychic Battle: new targets for Lightning Bolt");
  await page.locator(".targeting").getByRole("button", { name: /^Keep target/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.log.filter((l) => /Psychic Battle's ability triggers/.test(l.text))).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Psychic Battle: Ana's Bolt at your Grizzly Bears, you reveal the greatest mana value and click her Hill Giant instead", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Psychic Battle", "Grizzly Bears"], library: ["Serra Angel", "Serra Angel"] }, [{ hand: ["Lightning Bolt"], board: ["Mountain", "Hill Giant"] }]);
  const [bears, giant, bolt] = [one(s0, "Grizzly Bears"), one(s0, "Hill Giant"), one(s0, "Lightning Bolt")];
  let s = playUntil(s0, (x) => x.activePlayer === 1 && x.step === "main1" && x.priority === 1 && x.stack.length === 0 && !x.pending);
  for (const a of planCast(s, 1, bolt, [{ kind: "object", id: bears }])!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.priority === 0 && x.stack.length === 2 && !x.pending);
  await open(page, s);
  const ask = await resolveUntil(page, (st) => st.pending?.kind === "newTargets" && st.pending.player === 0);
  expect(ask.stack.map((x) => x.description)).toEqual(["Lightning Bolt"]);
  await expect(page.locator(".targeting")).toContainText("Psychic Battle: new targets for Lightning Bolt");
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.log.filter((l) => /Psychic Battle's ability triggers/.test(l.text))).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});
