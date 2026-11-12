// Round 344's prompts: Bronzehide Lion returning as an Aura (what it enchants, chosen as it enters, CR 303.4f), The
// Eagles Are Coming! kicked (any number of target creatures you own instead of one, CR 702.33g) and Identity Thief's
// attack trigger (exile a creature and become a copy of it until end of turn).
import { expect, test } from "@playwright/test";
import type { GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playWithBots, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Bronzehide Lion dies to Murder and returns as an Aura on the Watchwolf you choose", async ({ page }) => {
  const s = scene({ hand: ["Murder"], board: [...LANDS, "Bronzehide Lion", "Grizzly Bears", "Watchwolf"] });
  const [lion, wolf] = [one(s, "Bronzehide Lion"), one(s, "Watchwolf")];
  await open(page, s);
  await card(page, "Murder", s).click();
  await page.locator(`[data-obj="${lion}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "enchant");
  const pick = page.locator(".controls.enchant-pick");
  await expect(pick).toContainText("choose what Bronzehide Lion enchants as it returns to the battlefield as an Aura");
  await expect(pick.getByRole("button")).toHaveText(["Grizzly Bears (You)", "Watchwolf (You)"]);
  await pick.getByRole("button", { name: "Watchwolf (You)" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[lion]!.zone === "battlefield");
  expect(after.objects[lion]!.attachedTo).toBe(wolf);
  expect(pageErrors(page)).toEqual([]);
});

test("The Eagles Are Coming! kicked: two of your creatures back to your hand, a Bird for each at the next upkeep", async ({ page }) => {
  const s = scene({ hand: ["The Eagles Are Coming!"], board: [...LANDS, "Grizzly Bears", "Watchwolf", "Llanowar Elves"] });
  const [bears, wolf, elves] = [one(s, "Grizzly Bears"), one(s, "Watchwolf"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "The Eagles Are Coming!", s).click();
  await page.getByRole("button", { name: "Kick it" }).click();
  const bar = page.locator(".targeting", { hasText: "The Eagles Are Coming!" });
  await expect(bar).toBeVisible();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${wolf}"]`).first().click();
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "The Eagles Are Coming!")]!.zone === "graveyard");
  expect([bears, wolf, elves].map((id) => after.objects[id]!.zone)).toEqual(["hand", "hand", "battlefield"]);
  expect(after.delayed?.some((d) => d.when === "nextTurnUpkeep" && d.event?.amount === 2)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Identity Thief attacks: exile Ana's Hill Giant, Yes, and it's a Hill Giant until end of turn", async ({ page }) => {
  const s0: GameState = scene({ board: [...LANDS, "Identity Thief"] }, [{ board: ["Hill Giant"] }]);
  const [thief, giant] = [one(s0, "Identity Thief"), one(s0, "Hill Giant")];
  const s = playWithBots(s0, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0, [[thief, 1]]);
  await open(page, s);
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Exile another target nontoken creature");
  await bar.getByRole("button", { name: "Yes", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.objects[thief]!.copyEffects?.some((c) => c.until === "endOfTurn")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
