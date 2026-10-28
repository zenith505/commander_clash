// Round 199's prompts: Heavenly Blademaster's "you may attach any number of Auras and Equipment you control to it"
// picker (the attach picker with the Blademaster itself as the host), and Dream Cache's "both on top of your library or
// both on the bottom" (two buttons, then the click-two-cards picker).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Heavenly Blademaster: as it enters, pick Bonesplitter and attach it to the Blademaster", async ({ page }) => {
  const s = scene({ hand: ["Heavenly Blademaster"], board: [...LANDS, "Grizzly Bears", "Bonesplitter"] });
  const [blademaster, splitter] = [one(s, "Heavenly Blademaster"), one(s, "Bonesplitter")];
  await open(page, s);
  await card(page, "Heavenly Blademaster", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "attach");
  const bar = controls(page);
  await expect(bar).toContainText("click any number of your Auras and Equipment to attach to Heavenly Blademaster");
  await expect(bar.getByRole("button", { name: "Attach none" })).toBeVisible();
  await page.locator(`[data-obj="${splitter}"]`).click();
  await bar.getByRole("button", { name: "Attach 1" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[splitter]!.attachedTo).toBe(blademaster);
  expect(pageErrors(page)).toEqual([]);
});

test("Dream Cache: draw three, choose the bottom, then click two cards to put there", async ({ page }) => {
  const s = scene({ hand: ["Dream Cache", "Hill Giant"], board: LANDS, library: ["Grizzly Bears", "Llanowar Elves", "Shock"] });
  const [giant, shock] = [one(s, "Hill Giant"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Dream Cache", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Put two cards from your hand on top of your library" })).toBeVisible();
  await bar.getByRole("button", { name: "Put two cards from your hand on the bottom of your library" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "handToTop");
  await expect(bar).toContainText("Dream Cache: click 2 cards to put on the bottom of your library (first pick goes lowest).");
  const put = bar.getByRole("button", { name: "Put on bottom" });
  await expect(put).toBeDisabled();
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${shock}"]`).click();
  await put.click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect([...after.players[0]!.library.slice(-2)].sort()).toEqual([giant, shock].sort());
  expect(after.players[0]!.hand.map((id) => after.cards[after.objects[id]!.cardId]!.name).sort()).toEqual(["Grizzly Bears", "Llanowar Elves"]);
  expect(pageErrors(page)).toEqual([]);
});
