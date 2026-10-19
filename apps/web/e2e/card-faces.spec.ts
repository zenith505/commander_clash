// Cards with two faces: an Adventure cast from the menu and then the creature from exile, a split card's half, and a
// modal double-faced card played as its land face.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, menu, modal, resolveUntil, seat } from "./ui";

test("Adventure: cast Swift End from the menu, then Murderous Rider from exile on an adventure", async ({ page }) => {
  const s = scene({ hand: ["Murderous Rider // Swift End"], board: [...LANDS, "Swamp", "Swamp"] }, [{ board: ["Grizzly Bears"] }]);
  const [rider, bears] = [one(s, "Murderous Rider"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Murderous Rider", s).click();
  await menu(page).getByRole("button", { name: /^Cast Swift End \(Adventure\)/ }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  let now = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[bears]!.zone === "graveyard");
  // CR 715.3d: the Adventure resolves into exile, and you may cast the creature from there.
  expect(now.objects[rider]).toMatchObject({ zone: "exile" });
  expect(now.players[0]!.life).toBe(38);
  const exile = seat(page, 0).locator(".zone", { hasText: "Exile" });
  await exile.click();
  await expect(modal(page).locator(".zone-tag")).toHaveText("on an adventure");
  await modal(page).locator(".card.playable").click();
  // Not as an Adventure again (CR 715.3d).
  await expect(menu(page).getByRole("button", { name: /^Cast Swift End/ })).toBeDisabled();
  await menu(page).getByRole("button", { name: /^Cast it/ }).click();
  now = await resolveUntil(page, (st) => st.objects[rider]!.zone === "battlefield" && st.stack.length === 0);
  expect(now.objects[rider]!.face).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});

test("Split card: the menu casts either half, here Ice, with only that half's cost", async ({ page }) => {
  const s = scene({ hand: ["Fire // Ice"], board: ["Island", "Island"] }, [{ board: ["Grizzly Bears"] }]);
  const [fi, bears] = [one(s, "Fire // Ice"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Fire // Ice", s).click();
  // Fire needs red mana: only Ice can be cast from two Islands.
  await expect(menu(page).getByRole("button", { name: /^Cast Fire/ })).toBeDisabled();
  await expect(menu(page).getByRole("button", { name: /^Cast it/ })).toHaveCount(0);
  await menu(page).getByRole("button", { name: /^Cast Ice/ }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const now = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[fi]!.zone === "graveyard");
  expect(now.objects[bears]!.tapped).toBe(true);
  expect(now.players[0]!.hand).toHaveLength(1); // "Draw a card."
  expect(pageErrors(page)).toEqual([]);
});

test("Modal double-faced card: play Kazandu Valley as your land, or Emeria untapped for 3 life", async ({ page }) => {
  const s = scene({ hand: ["Kazandu Mammoth // Kazandu Valley", "Emeria's Call // Emeria, Shattered Skyclave"] });
  const [mammoth, emeria] = [one(s, "Kazandu Mammoth"), one(s, "Emeria's Call")];
  await open(page, s);
  await card(page, "Emeria's Call", s).click();
  await menu(page).getByRole("button", { name: /^Play Emeria, Shattered Skyclave untapped \(pay 3 life\)/ }).click();
  let now = await resolveUntil(page, (st) => st.objects[emeria]!.zone === "battlefield");
  expect(now.objects[emeria]!.tapped).toBe(false);
  expect(now.objects[emeria]!.face).toBe(1);
  await expect(page.locator(`[data-obj="${emeria}"]`)).toContainText("Emeria, Shattered Skyclave");
  expect(now.players[0]!.life).toBe(37);
  // One land a turn: the Mammoth's land face can't be played now.
  await card(page, "Kazandu Mammoth", s).click();
  await expect(menu(page).getByRole("button", { name: /^Play Kazandu Valley/ })).toBeDisabled();
  now = await state(page);
  expect(now.objects[mammoth]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
