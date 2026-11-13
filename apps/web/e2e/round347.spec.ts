// Round 347 in the browser: Urianger Augurelt's Draw Arcanum (look at the top card, then exile it face down or take none)
// and Play Arcanum (cast a card exiled with it for {2} less), and Lobelia, Defender of Bag End's first mode (one of the
// cards it exiled face down from an opponent's library, cast without paying its mana cost).
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { menu, modal, resolveUntil, seat } from "./ui";

test("Urianger Augurelt: Draw Arcanum looks at the top card, and you exile it face down", async ({ page }) => {
  const s = scene({ board: ["Urianger Augurelt"], library: ["Hill Giant"] });
  const [urianger, giant] = [one(s, "Urianger Augurelt"), one(s, "Hill Giant")];
  await open(page, s);
  await page.locator(`[data-obj="${urianger}"]`).click();
  await menu(page).getByRole("button", { name: /Look at the top card of your library\. You may exile it face down/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Urianger Augurelt: put a card to exile face down");
  await expect(pick).toContainText("back on top of your library");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.objects[giant]!.hiddenExile).toMatchObject({ seen: [0], label: "Face down" });
  expect(pageErrors(page)).toEqual([]);
});

test("Urianger Augurelt: Draw Arcanum, taking none, leaves the card on top", async ({ page }) => {
  const s = scene({ board: ["Urianger Augurelt"], library: ["Hill Giant"] });
  const [urianger, giant] = [one(s, "Urianger Augurelt"), one(s, "Hill Giant")];
  await open(page, s);
  await page.locator(`[data-obj="${urianger}"]`).click();
  await menu(page).getByRole("button", { name: /Look at the top card of your library\. You may exile it face down/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  await modal(page).getByRole("button", { name: "Take none" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[urianger]!.tapped);
  expect(after.objects[giant]!.zone).toBe("library");
  expect(after.players[0]!.library[0]).toBe(giant);
  expect(pageErrors(page)).toEqual([]);
});

test("Urianger Augurelt: Play Arcanum, then cast the face-down Hill Giant from your exile for {1}{R} and gain 2 life", async ({ page }) => {
  const s = scene({ board: ["Urianger Augurelt", "Mountain", "Island"], exile: ["Hill Giant"] });
  const [urianger, giant] = [one(s, "Urianger Augurelt"), one(s, "Hill Giant")];
  s.objects[giant]!.hiddenExile = { by: urianger, seen: [0], label: "Face down" };
  s.linkedExile = { [`${urianger}@0`]: [{ id: giant, zc: s.objects[giant]!.zoneChanges ?? 0 }] };
  await open(page, s);
  await page.locator(`[data-obj="${urianger}"]`).click();
  await menu(page).getByRole("button", { name: /Until end of turn, you may play cards exiled with/ }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.mayPlay?.less === 2);
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.players[0]!.life).toBe(42);
  expect(pageErrors(page)).toEqual([]);
});

test("Lobelia, Defender of Bag End: sacrifice Sol Ring for the first mode, then cast Ana's face-down Grizzly Bears free", async ({ page }) => {
  const s = scene({ board: ["Lobelia, Defender of Bag End", "Sol Ring"] }, [{ exile: ["Grizzly Bears"] }]);
  const [lobelia, ring, bears] = [one(s, "Lobelia, Defender of Bag End"), one(s, "Sol Ring"), one(s, "Grizzly Bears")];
  s.objects[bears]!.hiddenExile = { by: lobelia, seen: [0], label: "Face down" };
  s.linkedExile = { [`${lobelia}@0`]: [{ id: bears, zc: s.objects[bears]!.zoneChanges ?? 0 }] };
  await open(page, s);
  await page.locator(`[data-obj="${lobelia}"]`).click();
  await menu(page).getByRole("button", { name: /Sacrifice an artifact: Choose one/ }).click();
  await page.locator(".mode-menu").getByRole("button", { name: /you may play a card exiled with/ }).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice an artifact" });
  await page.locator(`[data-obj="${ring}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and activate" }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.mayPlay?.free === true);
  await seat(page, 1).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[ring]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
