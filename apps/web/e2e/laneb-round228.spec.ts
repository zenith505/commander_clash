// Lane B round B228 in the browser: Giant Oyster's ability on Ana's tapped creature (only a tapped creature is a legal
// target), and Advancing the Spirit making your first power-up ability of the turn cost {0} with no mana at all.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { menu, resolveUntil } from "./ui";

test("Giant Oyster: target Ana's tapped Serra Angel; it stays tapped while the Oyster does", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Giant Oyster"] }, [{ board: ["Serra Angel", "Hill Giant"] }]);
  const oyster = one(s, "Giant Oyster");
  const angel = idsOf(s, "Serra Angel", "battlefield", 1)[0]!;
  const giant = idsOf(s, "Hill Giant", "battlefield", 1)[0]!;
  s.objects[angel]!.tapped = true;
  await open(page, s);
  await page.locator(`[data-obj="${oyster}"]`).first().click();
  await menu(page).getByRole("button", { name: /For as long as Giant Oyster remains tapped/ }).click();
  await expect(page.locator(".targeting")).toContainText("target tapped creature");
  // The untapped Hill Giant isn't a legal target: clicking it chooses nothing.
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await expect(page.locator(".targeting")).toContainText("target tapped creature");
  await page.locator(`[data-obj="${angel}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.effects.some((e) => e.affected.includes(angel)));
  expect(after.objects[oyster]!.tapped).toBe(true);
  expect(after.floatingTriggers?.some((f) => f.about?.id === angel)).toBe(true);
  expect(after.delayed?.some((d) => d.about?.id === angel && d.orUntaps)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Advancing the Spirit: Serpent Specialist's power-up costs {0}, paid with no lands", async ({ page }) => {
  const s = scene({ board: ["Advancing the Spirit", "Serpent Specialist"] });
  const specialist = one(s, "Serpent Specialist");
  await open(page, s);
  await page.locator(`[data-obj="${specialist}"]`).first().click();
  const button = menu(page).getByRole("button", { name: /Put two \+1\/\+1 counters on/ });
  await expect(button).toBeEnabled();
  await button.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[specialist]!.counters["+1/+1"] ?? 0) === 2);
  expect(after.turnLog?.powerUps?.[0]).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
