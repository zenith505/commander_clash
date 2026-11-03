// Round 266's prompts: Ward—Blight 2 (Auntie Ool, Cursewretch), Sidisi's sacrifice of mana value X, and Nahiri's Resolve's
// end-step pick of what to exile until your next upkeep.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("ward—blight 2: Pay, then click a creature of yours for the -1/-1 counters, and the spell resolves", async ({ page }) => {
  const s = scene({ hand: ["Shock"], board: [...LANDS, "Grizzly Bears", "Hill Giant"] }, [{ board: ["Auntie Ool, Cursewretch"] }]);
  const [auntie, bears, giant] = [one(s, "Auntie Ool, Cursewretch"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Shock", s).click();
  await page.locator(`[data-obj="${auntie}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless");
  await expect(controls(page)).toContainText("blight 2 (put 2 -1/-1 counters on a creature you control) or Shock is countered");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  await expect(controls(page)).toContainText("blight 2: click a creature of yours to put 2 -1/-1 counters on");
  await page.locator(`[data-obj="${giant}"]`).click();
  await controls(page).getByRole("button", { name: "Put counters" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.counters["-1/-1"]).toBe(2);
  expect(after.objects[bears]!.counters["-1/-1"] ?? 0).toBe(0);
  expect(after.objects[auntie]!.damage).toBe(2);
  // Auntie Ool's controller doesn't control the Giant: its controller (you) loses 1 life.
  expect(after.players[0]!.life).toBe(39);
  expect(pageErrors(page)).toEqual([]);
});

// Sidisi, Regent of the Mire: announce X (the sacrificed creature's mana value), pick the creature card with mana value X
// plus 1 in your graveyard, then click the creature to sacrifice.
test("Sidisi: X = 2, target the 3-mana creature card in your graveyard, sacrifice the 2-mana creature", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Sidisi, Regent of the Mire", "Grizzly Bears", "Llanowar Elves"], yard: ["Centaur Courser", "Hill Giant"] });
  const [sidisi, bears, elves, courser, giant] = ["Sidisi, Regent of the Mire", "Grizzly Bears", "Llanowar Elves", "Centaur Courser", "Hill Giant"].map((n) => one(s, n)) as [string, string, string, string, string];
  await open(page, s);
  await page.locator(`[data-obj="${sidisi}"]`).first().click();
  await menu(page).locator("button", { hasText: "Return target creature card" }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("sacrifice a creature with mana value X other than Sidisi, Regent of the Mire");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  // Only the creature card with mana value 3 can be the target.
  await expect(page.locator(`[data-pick="${giant}"]`)).toHaveCount(0);
  await page.locator(`[data-pick="${courser}"]`).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("sacrifice a creature with mana value 2 other than Sidisi, Regent of the Mire");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Sacrifice and activate" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[courser]!.zone === "battlefield");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[elves]!.zone).toBe("battlefield");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.objects[sidisi]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

// Nahiri's Resolve: at the beginning of your end step, click any number of your nontoken artifacts and/or creatures to
// exile until your next upkeep.
test("Nahiri's Resolve: at your end step, click a creature and an artifact to exile until your next upkeep", async ({ page }) => {
  const s0 = scene({ board: ["Nahiri's Resolve", "Grizzly Bears", "Hill Giant", "Sol Ring"] });
  const [bears, giant, ring] = [one(s0, "Grizzly Bears"), one(s0, "Hill Giant"), one(s0, "Sol Ring")];
  const s = playUntil(s0, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await open(page, s);
  await expect(controls(page)).toContainText("click any number of your nontoken artifacts and/or creatures to exile. They return to the battlefield at the beginning of your next upkeep.");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${ring}"]`).first().click();
  await controls(page).getByRole("button", { name: "Exile and return 2" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[bears]!.zone === "exile");
  expect(after.objects[ring]!.zone).toBe("exile");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
