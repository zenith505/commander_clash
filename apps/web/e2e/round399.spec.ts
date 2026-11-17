// Round 399 in the browser: Koh, the Face Stealer's "Pay 1 life: Choose a creature card exiled with Koh" (the pick between
// two exiled creature cards), then the Prodigal Pyromancer ability Koh has from it; Idris, Soul of the TARDIS's pick of
// another artifact to exile as it enters, and its +X/+X.
import { expect, test } from "@playwright/test";
import { characteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Koh, the Face Stealer: pay 1 life, pick Prodigal Pyromancer from the two cards exiled with Koh, then ping Ana's Grizzly Bears", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Koh, the Face Stealer"] }, [{ exile: ["Prodigal Pyromancer", "Doomed Traveler"], board: ["Grizzly Bears"] }]);
  const [koh, pyro, trav, bears] = [one(s, "Koh, the Face Stealer"), one(s, "Prodigal Pyromancer"), one(s, "Doomed Traveler"), one(s, "Grizzly Bears")];
  // Both cards exiled with Koh, by its enters and dies abilities (CR 607.2a).
  s.linkedExile = { [`${koh}@${s.objects[koh]!.zoneChanges ?? 0}`]: [pyro, trav].map((id) => ({ id, zc: s.objects[id]!.zoneChanges ?? 0 })) };
  await open(page, s);
  await card(page, "Koh, the Face Stealer", s).click();
  await menu(page).locator("button", { hasText: "Pay 1 life" }).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "kohCard" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose a creature card exiled with Koh, the Face Stealer");
  await bar.getByRole("button", { name: "Prodigal Pyromancer" }).click();
  const chosen = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[koh]!.chosen?.card?.id === pyro);
  expect(chosen.players[0]!.life).toBe(s.players[0]!.life - 1);
  // The card chosen shows on Koh.
  await expect(page.locator(`[data-obj="${koh}"]`).first()).toContainText("Prodigal Pyromancer");
  await card(page, "Koh, the Face Stealer", s).click();
  await menu(page).locator("button", { hasText: "deals 1 damage" }).first().click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.damage === 1);
  expect(after.objects[koh]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Idris, Soul of the TARDIS: pick Ichor Wellspring over Sol Ring to exile; Idris is 5/5", async ({ page }) => {
  const s = scene({ hand: ["Idris, Soul of the TARDIS"], board: [...LANDS, "Sol Ring", "Ichor Wellspring"] });
  const [idris, ring, well] = [one(s, "Idris, Soul of the TARDIS"), one(s, "Sol Ring"), one(s, "Ichor Wellspring")];
  await open(page, s);
  await card(page, "Idris, Soul of the TARDIS", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("exile");
  await page.locator(`[data-obj="${well}"]`).first().click();
  await bar.getByRole("button", { name: "Exile" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[well]!.zone === "exile");
  expect(after.objects[ring]!.zone).toBe("battlefield");
  const ch = characteristics(after, after.objects[idris]!);
  expect(`${ch.power}/${ch.toughness}`).toBe("5/5");
  await expect(page.locator(`[data-obj="${idris}"]`).first()).toContainText("5/5");
  expect(pageErrors(page)).toEqual([]);
});
