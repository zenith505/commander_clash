// Round 346 in the browser: Crucible of the Spirit Dragon's "Remove X storage counters: Add X mana in any combination of
// colors" (a button for each X, then the color mix), and Greater Gargadon's ability from your exile pile while it's
// suspended (its sacrifice picked on the battlefield), and Detective's Phoenix cast bestowed from your graveyard (the
// creature, then the evidence: not the Phoenix itself).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil, seat } from "./ui";

test("Crucible of the Spirit Dragon: remove two storage counters, then add one blue and one red", async ({ page }) => {
  const s = scene({ board: ["Crucible of the Spirit Dragon"] });
  const crucible = one(s, "Crucible of the Spirit Dragon");
  s.objects[crucible]!.counters = { storage: 2 };
  await open(page, s);
  await card(page, "Crucible of the Spirit Dragon", s).click();
  const m = menu(page);
  await expect(m.locator('[data-mix][data-removes="1"]')).toContainText("Remove a storage counter: add 1 mana in any combination of colors");
  await m.locator('[data-mix][data-removes="2"]').click();
  const bar = page.locator(".mana-mix");
  await expect(bar).toContainText("add 2 mana in any combination of colors (2 left)");
  await bar.getByRole("button", { name: "Blue plus one" }).click();
  await bar.getByRole("button", { name: "Red plus one" }).click();
  await bar.getByRole("button", { name: "Add" }).click();
  const after = await resolveUntil(page, (st) => st.players[0]!.manaPool.U === 1 && st.players[0]!.manaPool.R === 1);
  expect(after.objects[crucible]!.counters.storage ?? 0).toBe(0);
  expect(after.objects[crucible]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Greater Gargadon: from your exile pile while suspended, sacrifice Grizzly Bears to remove a time counter", async ({ page }) => {
  const s = scene({ exile: ["Greater Gargadon"], board: ["Grizzly Bears", "Mountain"] });
  const [gargadon, bears] = [one(s, "Greater Gargadon"), one(s, "Grizzly Bears")];
  s.objects[gargadon]!.counters = { time: 10 };
  await open(page, s);
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /Sacrifice an artifact, creature, or land: Remove a time counter/ }).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice an artifact, creature, or land" });
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and activate" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[gargadon]!.counters.time === 9);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[gargadon]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Detective's Phoenix: from your graveyard only bestowed, on Grizzly Bears, collecting evidence 6 with Shivan Dragon", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Grizzly Bears"], yard: ["Detective's Phoenix", "Shivan Dragon", "Hill Giant"] });
  const [phoenix, bears, dragon, giant] = [one(s, "Detective's Phoenix"), one(s, "Grizzly Bears"), one(s, "Shivan Dragon"), one(s, "Hill Giant")];
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Detective's Phoenix" }).click();
  const m = menu(page);
  await expect(m.getByRole("button", { name: /^Cast from graveyard R R$|^Cast from graveyard 2 R$/ })).toBeDisabled();
  await m.getByRole("button", { name: /Cast from graveyard: Bestow/ }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("Detective's Phoenix: collect evidence 6");
  await expect(pick.locator(`[data-pick="${phoenix}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${dragon}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[phoenix]!.zone === "battlefield");
  expect(after.objects[phoenix]!.attachedTo).toBe(bears);
  expect([after.objects[dragon]!.zone, after.objects[giant]!.zone]).toEqual(["exile", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});
