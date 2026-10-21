// Round 107's prompts: Ardenn's "attach any number of Auras and Equipment you control to target permanent or player"
// picker, Talion's "choose a number between 1 and 10" (− / + and Choose), and the Impending entry in the cast menu.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Ardenn: at the beginning of combat, target Grizzly Bears, pick Bonesplitter and attach it", async ({ page }) => {
  const s = scene({ board: ["Ardenn, Intrepid Archaeologist", "Grizzly Bears", "Bonesplitter"] });
  const [bears, splitter] = [one(s, "Grizzly Bears"), one(s, "Bonesplitter")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.step === "beginCombat");
  await page.locator(`[data-obj="${bears}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "attach");
  const bar = controls(page);
  await expect(bar).toContainText("click any number of your Auras and Equipment to attach to Grizzly Bears");
  await expect(bar.getByRole("button", { name: "Attach none" })).toBeVisible();
  await page.locator(`[data-obj="${splitter}"]`).click();
  await bar.getByRole("button", { name: "Attach 1" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[splitter]!.attachedTo).toBe(bears);
  expect(pageErrors(page)).toEqual([]);
});

test("Talion: choose 3 with + and Choose as it enters", async ({ page }) => {
  const s = scene({ hand: ["Talion, the Kindly Lord"], board: LANDS });
  const talion = one(s, "Talion, the Kindly Lord");
  await open(page, s);
  await card(page, "Talion, the Kindly Lord", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Talion, the Kindly Lord:");
  await expect(bar.getByRole("button", { name: "Number minus one" })).toBeDisabled(); // 1 is the least
  const plus = bar.getByRole("button", { name: "Number plus one" });
  await plus.click();
  await plus.click();
  await bar.getByRole("button", { name: "Choose 3" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[talion]!.zone === "battlefield");
  expect(after.objects[talion]!.chosen?.number).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Overlord of the Hauntwoods: cast it for its impending cost from the menu; four time counters, not a creature", async ({ page }) => {
  const s = scene({ hand: ["Overlord of the Hauntwoods"], board: LANDS });
  const overlord = one(s, "Overlord of the Hauntwoods");
  await open(page, s);
  await card(page, "Overlord of the Hauntwoods", s).click();
  await menu(page).getByRole("button", { name: /^Impending/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[overlord]!.zone === "battlefield");
  expect(after.objects[overlord]!.counters.time).toBe(4);
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.tapped && !after.objects[id]!.isToken)).toHaveLength(3); // {1}{G}{G}
  expect(after.battlefield.some((id) => after.objects[id]!.isToken && after.cards[after.objects[id]!.cardId]!.name.startsWith("Everywhere"))).toBe(true);
  await expect(page.locator(`[data-obj="${overlord}"]`).first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});
