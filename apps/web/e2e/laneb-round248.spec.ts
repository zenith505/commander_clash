// Lane B round B248 in the browser: replicate given to the spells you cast (CR 702.56a-b). Djinn Illuminatus gives
// Lightning Bolt replicate {R}, paid twice (a third time can't be paid), each copy aimed anew; Hatchery Sliver gives a
// Hatchery Sliver spell a second replicate beside its own, each asked and paid separately, the copies becoming tokens.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Djinn Illuminatus: Lightning Bolt replicated twice for {R}{R}, each copy aimed at another of Ana's creatures", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Djinn Illuminatus"] }, [{ board: ["Grizzly Bears", "Hill Giant", "Gray Ogre"] }]);
  const [bolt, bears, giant, ogre] = [one(s, "Lightning Bolt"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Gray Ogre")];
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  const cast = menu(page).getByRole("button", { name: /^Cast it/ });
  if (await cast.count()) await cast.click();
  const bar = page.locator("[data-replicate-pick]");
  await expect(bar).toContainText("Lightning Bolt: replicate (copy it for each time you pay), how many times?");
  await expect(bar).toContainText("(Djinn Illuminatus)");
  const more = bar.getByRole("button", { name: "Replicate Djinn Illuminatus one more time" });
  await expect(bar.getByRole("button", { name: "Don't replicate" })).toBeVisible();
  await more.click();
  await more.click();
  // Three Mountains: the Bolt and two copies use them all.
  await expect(more).toBeDisabled();
  await bar.getByRole("button", { name: "Replicate 2 times" }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets");
  await page.locator(`[data-obj="${giant}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.stack.some((it) => (it.targets ?? []).some((t) => t.kind === "object" && t.id === giant)));
  await page.locator(`[data-obj="${ogre}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ogre]!.zone === "graveyard");
  expect([bears, giant, ogre, bolt].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard", "graveyard"]);
  expect(after.log.some((l) => /You casts? Lightning Bolt, paying replicate \{R\} twice \(from Djinn Illuminatus\)/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Hatchery Sliver: its own replicate once, then the one the Hatchery Sliver on the battlefield gives once: two token copies", async ({ page }) => {
  const s = scene({ hand: ["Hatchery Sliver"], board: [...LANDS, "Hatchery Sliver"] });
  const inHand = idsOf(s, "Hatchery Sliver", "hand", 0)[0]!;
  expect(idsOf(s, "Hatchery Sliver", "battlefield", 0)).toHaveLength(1);
  await open(page, s);
  await page.locator(`[data-obj="${inHand}"]`).first().click();
  const cast = menu(page).getByRole("button", { name: /^Cast it/ });
  if (await cast.count()) await cast.click();
  // Its own replicate first (CR 702.56a) ...
  const kick = page.locator(".targeting", { hasText: "how many times?" }).first();
  await expect(kick).toContainText("Hatchery Sliver: replicate");
  await kick.getByRole("button", { name: "Kick one more time" }).click();
  await kick.getByRole("button", { name: "Pay once" }).click();
  // ... then the instance the other Hatchery Sliver gives, paid separately (CR 702.56b).
  const bar = page.locator("[data-replicate-pick]");
  await expect(bar).toContainText("(Hatchery Sliver)");
  const more = bar.getByRole("button", { name: "Replicate Hatchery Sliver one more time" });
  await more.click();
  // Three Forests: {1}{G} three times uses them all.
  await expect(more).toBeDisabled();
  await bar.getByRole("button", { name: "Replicate once" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[inHand]!.zone === "battlefield");
  const slivers = after.battlefield.filter((id) => after.cards[after.objects[id]!.cardId]!.name === "Hatchery Sliver");
  expect(slivers).toHaveLength(4);
  expect(slivers.filter((id) => after.objects[id]!.isToken)).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});
