// Split the Party: "Choose target player. Return half the creatures they control to their owner's hand, rounded up":
// you click that player, then click which of their creatures go back. Partner with: "target player may search their
// library for a card named [name]": you click yourself, say yes, and pick the partner.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

test("Split the Party: click 2 of the 3 creatures an opponent controls to return", async ({ page }) => {
  const s = scene({ hand: ["Split the Party"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Grizzly Bears", "Hill Giant", "Serra Angel"] }]);
  const [bears, giant, angel] = [idsOf(s, "Grizzly Bears", undefined, 1)[0]!, idsOf(s, "Hill Giant", undefined, 1)[0]!, idsOf(s, "Serra Angel", undefined, 1)[0]!];
  const mine = idsOf(s, "Grizzly Bears", undefined, 0)[0]!;
  await open(page, s);
  await card(page, "Split the Party", s).click();
  await clickPlayer(page, 1);
  const st = await resolveUntil(page, (x) => x.pending?.kind === "pickPermanents");
  const bar = controls(page);
  await expect(bar).toContainText(`Split the Party: click 2 (creature) ${st.players[1]!.name} controls to return to their owner's hand.`);
  await expect(bar.getByRole("button", { name: "Return" })).toBeDisabled();
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${angel}"]`).click();
  await bar.getByRole("button", { name: "Return" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending);
  expect([bears, giant, angel, mine].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "hand", "hand", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Partner with: target yourself and put the partner into your hand", async ({ page }) => {
  const s = scene({ hand: ["Khorvath Brightflame"], board: LANDS, library: ["Sylvia Brightspear"] });
  const sylvia = one(s, "Sylvia Brightspear");
  await open(page, s);
  await card(page, "Khorvath Brightflame", s).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseTargets");
  await clickPlayer(page, 0);
  await resolveUntil(page, (x) => x.pending?.kind === "chooseMay");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary");
  await modal(page).locator(`[data-pick="${sylvia}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.objects[sylvia]?.zone === "hand");
  expect(after.objects[sylvia]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
