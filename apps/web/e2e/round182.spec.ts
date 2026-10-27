// Round 182's prompts: Temporal Cleansing's owner choosing second from the top or the bottom, and See Beyond shuffling a
// card from your hand into your library.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Temporal Cleansing on your own Sol Ring: you put it second from the top of your library", async ({ page }) => {
  const s = scene({ hand: ["Temporal Cleansing"], board: [...LANDS, "Sol Ring"], library: ["Grizzly Bears", "Llanowar Elves"] });
  const ring = one(s, "Sol Ring");
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Temporal Cleansing", s).click();
  await expect(page.locator(".targeting")).toBeVisible();
  await page.locator(`[data-obj="${ring}"]`).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "topOrBottom");
  const bar = controls(page);
  await expect(bar).toContainText("put Sol Ring into your library second from the top or on the bottom?");
  await expect(bar.getByRole("button", { name: "Bottom" })).toBeVisible();
  await bar.getByRole("button", { name: "Second from the top" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending);
  expect(after.objects[ring]!.zone).toBe("library");
  expect(after.players[0]!.library.slice(0, 2)).toEqual([bears, ring]);
  expect(pageErrors(page)).toEqual([]);
});

test("See Beyond: draw two, then click a card to shuffle into your library", async ({ page }) => {
  const s = scene({ hand: ["See Beyond", "Hill Giant"], board: LANDS, library: ["Grizzly Bears", "Llanowar Elves", "Shock"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "See Beyond", s).click();
  await resolveUntil(page, (x) => x.pending?.kind === "handToTop");
  const bar = controls(page);
  await expect(bar).toContainText("See Beyond: click 1 card to shuffle into your library.");
  const shuffle = bar.getByRole("button", { name: "Shuffle in" });
  await expect(shuffle).toBeDisabled();
  await page.locator(`[data-obj="${giant}"]`).click();
  await shuffle.click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  expect(after.objects[giant]!.zone).toBe("library");
  expect(after.players[0]!.hand.map((id) => after.cards[after.objects[id]!.cardId]!.name).sort()).toEqual(["Grizzly Bears", "Llanowar Elves"]);
  expect(pageErrors(page)).toEqual([]);
});
