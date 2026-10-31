// Round 223: revealing a card from the opening hand (CR 103.6b), as Chancellor of the Dross: "If you do, at the beginning
// of the first upkeep, each opponent loses 3 life, then you gain life equal to the life lost this way."
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene, state } from "./scene";
import { controls, modal, resolveUntil } from "./ui";

test("opening hand: reveal Chancellor of the Dross, and at the first upkeep each opponent loses 3 life and you gain 9", async ({ page }) => {
  const s = scene({ hand: ["Chancellor of the Dross"] }, [], { mulligans: true });
  const dross = one(s, "Chancellor of the Dross");
  await open(page, s);
  await expect(controls(page)).toContainText("Opening hand.");
  await controls(page).getByRole("button", { name: "Keep" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Opening hand: you may reveal these cards from your hand");
  await expect(pick.getByRole("button", { name: "Reveal none" })).toBeVisible();
  await pick.locator(`[data-pick="${dross}"]`).click();
  await pick.getByRole("button", { name: "Reveal", exact: true }).click();
  await expect(pick).toHaveCount(0);
  const after = await resolveUntil(page, (st) => st.players[0]!.life === 49);
  expect(after.players.map((p) => p.life)).toEqual([49, 37, 37, 37]);
  expect(after.objects[dross]!.zone).toBe("hand");
  expect(after.log.some((l) => l.text.includes("reveals Chancellor of the Dross"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("opening hand: reveal none, and nothing happens at the first upkeep", async ({ page }) => {
  const s = scene({ hand: ["Chancellor of the Dross"] }, [], { mulligans: true });
  await open(page, s);
  await controls(page).getByRole("button", { name: "Keep" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Opening hand: you may reveal these cards from your hand");
  await pick.getByRole("button", { name: "Reveal none" }).click();
  await expect(pick).toHaveCount(0);
  const after = await resolveUntil(page, (st) => st.turn > 1 || (st.turn === 1 && !["untap", "upkeep"].includes(st.step)));
  expect(after.players.map((p) => p.life)).toEqual([40, 40, 40, 40]);
  expect(after.delayed ?? []).toHaveLength(0);
  expect(pageErrors(page)).toEqual([]);
});
