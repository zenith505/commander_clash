// Round 102's prompts: Wheel of Misfortune's secret number (− / + and Choose), casting a card exiled with Valgavoth for
// life from an opponent's exile, Ad Nauseam's "repeat this process" Yes / No, and Scroll Rack's any number of cards.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil, seat } from "./ui";

test("Wheel of Misfortune: pick a number with + and Choose; damage and new hands follow", async ({ page }) => {
  const s = scene({ hand: ["Wheel of Misfortune"], board: LANDS });
  await open(page, s);
  await card(page, "Wheel of Misfortune", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "secretNumber" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Wheel of Misfortune:");
  await expect(bar.getByRole("button", { name: "Number minus one" })).toBeDisabled();
  const plus = bar.getByRole("button", { name: "Number plus one" });
  for (let i = 0; i < 3; i++) await plus.click();
  await bar.getByRole("button", { name: "Choose 3" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  // The bots, with empty hands, chose 1: we chose the highest (3 damage to us) and not the lowest (we discard and draw seven).
  expect(after.players[0]!.life).toBe(37);
  expect(after.players[0]!.hand).toHaveLength(7);
  expect(after.log.some((l) => /reveal/i.test(l.text) && l.text.includes("3"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Valgavoth: cast a card exiled with it from Ana's exile, paying life", async ({ page }) => {
  const s = scene({ board: ["Valgavoth, Terror Eater"] }, [{ exile: ["Grizzly Bears"] }]);
  const valgavoth = one(s, "Valgavoth, Terror Eater");
  const bears = one(s, "Grizzly Bears");
  s.linkedExile = { [`${valgavoth}@${s.objects[valgavoth]!.zoneChanges ?? 0}`]: [{ id: bears, zc: s.objects[bears]!.zoneChanges ?? 0 }] };
  await open(page, s);
  const theirs = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await expect(theirs.locator(".zone-title")).toHaveText("Exile ✦");
  await theirs.click();
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /pay 2 life/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(after.players[0]!.life).toBe(38);
  expect(pageErrors(page)).toEqual([]);
});

test("Ad Nauseam: Yes reveals another card, No stops", async ({ page }) => {
  const s = scene({ hand: ["Ad Nauseam"], board: LANDS, library: ["Grizzly Bears", "Hill Giant", "Opt"] });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Ad Nauseam", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Ad Nauseam: Repeat: reveal the top card of your library");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await expect.poll(async () => (await state(page)).objects[giant]!.zone).toBe("hand");
  await controls(page).getByRole("button", { name: "No" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.objects[one(s, "Opt")]!.zone).toBe("library");
  expect(after.players[0]!.life).toBe(40 - 2 - 4);
  expect(pageErrors(page)).toEqual([]);
});

test("Scroll Rack: click cards in your hand and Trade them for the top of your library", async ({ page }) => {
  const s = scene({ hand: ["Opt", "Shock"], board: ["Scroll Rack", ...LANDS], library: ["Grizzly Bears", "Hill Giant"] });
  const [opt, shock, bears, giant] = [one(s, "Opt"), one(s, "Shock"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await page.locator(`[data-obj="${one(s, "Scroll Rack")}"]`).click();
  await menu(page).locator("button", { hasText: "Exile any number of cards" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "handToTop");
  const bar = controls(page);
  await expect(bar).toContainText("Scroll Rack: click any number of cards");
  await expect(bar.getByRole("button", { name: "Trade none" })).toBeVisible();
  await page.locator(`[data-obj="${shock}"]`).click();
  await page.locator(`[data-obj="${opt}"]`).click();
  await bar.getByRole("button", { name: "Trade 2 cards" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[0]!.hand.sort()).toEqual([bears, giant].sort());
  expect(after.players[0]!.library.slice(0, 2)).toEqual([shock, opt]);
  expect(pageErrors(page)).toEqual([]);
});
