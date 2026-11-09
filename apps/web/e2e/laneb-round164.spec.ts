// Lane B round B164 in the browser: Isu the Abominable asks which of {G}, {W} or {U} to pay for its counter (only the
// ones you can pay), then the payment; Spoils of War asks for an opponent first, whose graveyard sets X, then the targets
// and how the counters are divided.
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Isu the Abominable: a snow land enters; choose Pay {W}, pay it, and Isu gets a +1/+1 counter", async ({ page }) => {
  const s = scene({ hand: ["Snow-Covered Forest"], board: ["Isu the Abominable", "Plains", "Island"] });
  const isu = one(s, "Isu the Abominable");
  await open(page, s);
  await card(page, "Snow-Covered Forest", s).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "payWhich");
  expect(st.pending?.kind === "chooseOption" && st.pending.labels).toEqual(["Pay {G}", "Pay {W}", "Pay {U}", "Don't pay"]);
  const bar = controls(page);
  await expect(bar).toContainText("Isu the Abominable");
  await bar.getByRole("button", { name: "Pay {W}", exact: true }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseMay" && x.pending.pay?.mana === "{W}");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && (x.objects[isu]!.counters["+1/+1"] ?? 0) === 1);
  expect(after.objects[idsOf(s, "Plains", "battlefield", 0)[0]!]!.tapped).toBe(true);
  expect(after.objects[idsOf(s, "Island", "battlefield", 0)[0]!]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Isu the Abominable: Don't pay, and no counter", async ({ page }) => {
  const s = scene({ hand: ["Snow-Covered Forest"], board: ["Isu the Abominable", "Plains"] });
  const isu = one(s, "Isu the Abominable");
  await open(page, s);
  await card(page, "Snow-Covered Forest", s).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "payWhich");
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Pay {U}", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Don't pay", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  expect(after.objects[isu]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(after.objects[idsOf(s, "Plains", "battlefield", 0)[0]!]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Spoils of War: choose Ben (X=3), then split three +1/+1 counters between two creatures, two on the Bears", async ({ page }) => {
  const s = scene(
    { hand: ["Spoils of War"], board: ["Swamp", "Swamp", "Swamp", "Swamp", "Grizzly Bears", "Hill Giant"] },
    [{ yard: ["Grizzly Bears"] }, { yard: ["Hill Giant", "Mind Stone", "Llanowar Elves", "Forest"] }],
  );
  const spoils = one(s, "Spoils of War");
  const [bears, giant] = [s.battlefield.find((id) => s.objects[id]!.controller === 0 && s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears")!, one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Spoils of War", s).click();
  const pick = page.locator(".x-opponent-pick");
  await expect(pick).toContainText("Spoils of War");
  await expect(pick.getByRole("button", { name: "Ana (X=1)", exact: true })).toHaveCount(1);
  await expect(pick.getByRole("button", { name: "Cy (X=0)", exact: true })).toHaveCount(1);
  await pick.getByRole("button", { name: "Ben (X=3)", exact: true }).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  // Both creatures there are chosen: straight on to the three counters, the first target given the extra one; move it to
  // the Bears.
  const panel = page.locator(".targeting", { hasText: "distribute the +1/+1 counters" });
  const bearsRow = panel.locator(".divide", { hasText: "Grizzly Bears" });
  const giantRow = panel.locator(".divide", { hasText: "Hill Giant" });
  await expect(giantRow.locator("strong")).toHaveText("2");
  await expect(bearsRow.locator("strong")).toHaveText("1");
  await giantRow.getByRole("button", { name: "−" }).click();
  await bearsRow.getByRole("button", { name: "+" }).click();
  await expect(bearsRow.locator("strong")).toHaveText("2");
  await panel.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[spoils]!.zone === "graveyard");
  expect(after.objects[giant]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(2);
  // X = 3 plus {B}: all four Swamps.
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.tapped).length).toBe(4);
  expect(pageErrors(page)).toEqual([]);
});
