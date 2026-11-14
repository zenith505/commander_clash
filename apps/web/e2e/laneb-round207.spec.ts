// Lane B round B207 in the browser: Tourach's Chant asking the player who put a Forest onto the battlefield to blight 1
// (Pay, then click the creature for the -1/-1 counter) or take 3 damage, and Delif's Cone's delayed "when target
// creature you control attacks and isn't blocked" trigger with its "you may gain life" question.
import { expect, test } from "@playwright/test";
import { idsOf, LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, controls, menu, passTo, resolveUntil } from "./ui";

const CHANT = "blight 1 (put a -1/-1 counter on a creature you control) or";

test("Tourach's Chant: you play a Forest, Pay, then click your Hill Giant for the -1/-1 counter; no damage", async ({ page }) => {
  const s = scene({ hand: ["Forest"], board: ["Plains", "Grizzly Bears", "Hill Giant"] }, [{ board: ["Tourach's Chant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await page.locator(`[data-obj="${idsOf(s, "Forest", "hand", 0)[0]!}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0);
  await expect(controls(page)).toContainText(CHANT);
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await controls(page).getByRole("button", { name: /^Put counter/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.counters["-1/-1"] === 1);
  expect(after.objects[bears]!.counters["-1/-1"] ?? 0).toBe(0);
  expect(after.players[0]!.life).toBe(40);
  expect(pageErrors(page)).toEqual([]);
});

test("Tourach's Chant: you play a Forest and don't pay; it deals 3 damage to you", async ({ page }) => {
  const s = scene({ hand: ["Forest"], board: ["Plains", "Grizzly Bears"] }, [{ board: ["Tourach's Chant"] }]);
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await page.locator(`[data-obj="${idsOf(s, "Forest", "hand", 0)[0]!}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0);
  await expect(controls(page)).toContainText(CHANT);
  await controls(page).getByRole("button", { name: "Don't pay" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.life === 37);
  expect(after.objects[bears]!.counters["-1/-1"] ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Delif's Cone: activate it on your Grizzly Bears, attack unblocked, say Yes: gain 2 life and deal no combat damage", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Delif's Cone", "Grizzly Bears"] });
  const [cone, bears] = [one(s, "Delif's Cone"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${cone}"]`).first().click();
  await menu(page).locator("button", { hasText: "This turn, when target creature you control attacks" }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[cone]!.zone === "graveyard");
  await passTo(page, "declareAttackers");
  await attack(page, [[bears, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0, 100);
  await expect(controls(page)).toContainText("Delif's Cone");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const after = await passTo(page, "main2");
  expect(after.players[0]!.life).toBe(42);
  expect(after.players[1]!.life).toBe(40);
  expect(pageErrors(page)).toEqual([]);
});
