// Round 270's prompts: Catastrophe's "Destroy all lands or all creatures" (chosen as it resolves), Urborg's "loses first
// strike or swampwalk" (the same), and Scrap Welder's sacrifice of an artifact with mana value X for a lesser one.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Catastrophe: choose Destroy all creatures as it resolves; the lands stay", async ({ page }) => {
  const s = scene({ hand: ["Catastrophe"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Hill Giant", "Forest"] }]);
  const [bears, giant, forest] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), s.battlefield.find((id) => s.objects[id]!.controller === 1 && s.cards[s.objects[id]!.cardId]!.name === "Forest")!];
  await open(page, s);
  await card(page, "Catastrophe", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Destroy all lands" })).toBeVisible();
  await bar.getByRole("button", { name: "Destroy all creatures" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.objects[forest]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Urborg: target White Knight, then choose that it loses first strike", async ({ page }) => {
  const s = scene({ board: ["Urborg"] }, [{ board: ["White Knight"] }]);
  const [urborg, knight] = [one(s, "Urborg"), one(s, "White Knight")];
  await open(page, s);
  await page.locator(`[data-obj="${urborg}"]`).first().click();
  await menu(page).locator("button", { hasText: "loses first strike or swampwalk" }).click();
  await page.locator(`[data-obj="${knight}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "It loses swampwalk until end of turn" })).toBeVisible();
  await bar.getByRole("button", { name: "It loses first strike until end of turn" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[urborg]!.tapped).toBe(true);
  expect(after.effects.some((e) => e.affected.includes(knight) && e.mods.some((m) => m.kind === "removeKeywords" && m.keywords.includes("First strike")))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

// Scrap Welder: announce X (the sacrificed artifact's mana value), pick an artifact card with lesser mana value in your
// graveyard, then click the artifact to sacrifice.
test("Scrap Welder: X = 2, return Sol Ring from your graveyard, sacrifice Mind Stone", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Scrap Welder", "Mind Stone"], yard: ["Sol Ring", "Arcane Signet"] });
  const [welder, stone, ring, signet] = ["Scrap Welder", "Mind Stone", "Sol Ring", "Arcane Signet"].map((n) => one(s, n)) as [string, string, string, string];
  await open(page, s);
  await page.locator(`[data-obj="${welder}"]`).first().click();
  await menu(page).locator("button", { hasText: "Return target artifact card" }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("sacrifice an artifact with mana value X");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  // Arcane Signet's mana value is 2, not less than X.
  await expect(page.locator(`[data-pick="${signet}"]`)).toHaveCount(0);
  await page.locator(`[data-pick="${ring}"]`).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("sacrifice an artifact with mana value 2");
  await page.locator(`[data-obj="${stone}"]`).first().click();
  await bar.getByRole("button", { name: "Sacrifice and activate" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ring]!.zone === "battlefield");
  expect(after.objects[stone]!.zone).toBe("graveyard");
  expect(after.objects[signet]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
