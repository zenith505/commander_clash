// Round 194's prompts: Blatant Thievery's one required target for each opponent who has one, named in the targeting panel, and
// Shadowgrange Archfiend's madness cost with its life payment ("Madness—{2}{B}, Pay 8 life").
import { expect, test } from "@playwright/test";
import { controllerOf } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Blatant Thievery: one permanent of each opponent, asked for by name; another opponent's doesn't count", async ({ page }) => {
  const s = scene({ hand: ["Blatant Thievery"], board: LANDS }, [{ board: ["Sol Ring"] }, { board: ["Mind Stone"] }, { board: ["Grizzly Bears"] }]);
  const [ring, stone, bears] = [one(s, "Sol Ring"), one(s, "Mind Stone"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Blatant Thievery", s).click();
  const panel = page.locator(".targeting", { hasText: "Blatant Thievery" });
  await expect(panel).toContainText("choose target permanent Ana controls (1/3)");
  // Cy's Grizzly Bears isn't Ana's: still asking for Ana's.
  await page.locator(`[data-obj="${bears}"]`).click();
  await expect(panel).toContainText("choose target permanent Ana controls (1/3)");
  await page.locator(`[data-obj="${ring}"]`).click();
  await expect(panel).toContainText("choose target permanent Ben controls (2/3)");
  await page.locator(`[data-obj="${stone}"]`).click();
  await expect(panel).toContainText("choose target permanent Cy controls (3/3)");
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Blatant Thievery")]!.zone === "graveyard");
  expect([ring, stone, bears].map((id) => controllerOf(after, after.objects[id]!))).toEqual([0, 0, 0]);
  expect(pageErrors(page)).toEqual([]);
});

test("Blatant Thievery: an opponent with no permanent is left out; the other two are asked for", async ({ page }) => {
  const s = scene({ hand: ["Blatant Thievery"], board: LANDS }, [{ board: ["Sol Ring"] }, {}, { board: ["Grizzly Bears"] }]);
  const [ring, bears] = [one(s, "Sol Ring"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Blatant Thievery", s).click();
  const panel = page.locator(".targeting", { hasText: "Blatant Thievery" });
  await expect(panel).toContainText("choose target permanent Ana controls (1/2)");
  await page.locator(`[data-obj="${ring}"]`).click();
  await expect(panel).toContainText("choose target permanent Cy controls (2/2)");
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Blatant Thievery")]!.zone === "graveyard");
  expect([ring, bears].map((id) => controllerOf(after, after.objects[id]!))).toEqual([0, 0]);
  expect(pageErrors(page)).toEqual([]);
});

test("Shadowgrange Archfiend: discarded, the madness prompt asks for {2}{B} and 8 life; casting it pays both", async ({ page }) => {
  const s = scene({ hand: ["Faithless Looting", "Shadowgrange Archfiend", "Hill Giant"], board: LANDS, library: ["Shock", "Opt"] }, [{ board: ["Grizzly Bears"] }, {}, {}]);
  const [fiend, giant, bears] = [one(s, "Shadowgrange Archfiend"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Faithless Looting", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "discard");
  const bar = controls(page);
  await card(page, "Shadowgrange Archfiend", s).click();
  await card(page, "Hill Giant", s).click();
  await bar.getByRole("button", { name: "Discard" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.objectId === fiend);
  await expect(bar).toContainText("Madness: cast Shadowgrange Archfiend for");
  await expect(bar).toContainText("and 8 life? If you don't, it goes to your graveyard.");
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[fiend]!.zone === "battlefield" && st.objects[bears]!.zone === "graveyard");
  // 8 life paid, then 2 gained for the Grizzly Bears sacrificed.
  expect(after.players[0]!.life).toBe(34);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
