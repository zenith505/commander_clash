// Lane B round B71: "Search your graveyard, hand and/or library ... If you search your library this way, shuffle."
// (Agency Outfitter): the library is the player's choice, shown as "Graveyard, hand, and library" or "Graveyard and
// hand only". "Whenever an opponent shuffles their library" (Psychic Surgery): look at their top two, exile one.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Agency Outfitter: Thinking Cap from the hand and Magnifying Glass from the graveyard, no library search, no shuffle", async ({ page }) => {
  const s = scene({ hand: ["Agency Outfitter", "Thinking Cap"], board: LANDS, yard: ["Magnifying Glass"] });
  const [cap, glass] = [one(s, "Thinking Cap"), one(s, "Magnifying Glass")];
  const order = [...s.players[0]!.library];
  await open(page, s);
  await card(page, "Agency Outfitter", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  await expect(controls(page)).toContainText("search your library too (then shuffle), or only your graveyard and hand?");
  await expect(controls(page).getByRole("button", { name: "Graveyard, hand, and library" })).toBeVisible();
  await controls(page).getByRole("button", { name: "Graveyard and hand only" }).click();
  const pick = modal(page);
  await pick.locator(`[data-pick="${cap}"]`).click();
  await pick.locator(`[data-pick="${glass}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect([after.objects[cap]!.zone, after.objects[glass]!.zone]).toEqual(["battlefield", "battlefield"]);
  expect(after.players[0]!.library).toEqual(order);
  expect(pageErrors(page)).toEqual([]);
});

test("Psychic Surgery: an opponent shuffles; look at their top two and exile one, the other stays on top", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Psychic Surgery", "Boggart Forager"] });
  await open(page, s);
  await card(page, "Boggart Forager", s).click();
  const item = menu(page).locator("button", { hasText: "shuffles" });
  if (await item.count()) await item.click();
  await clickPlayer(page, 1);
  const st = await resolveUntil(page, (x) => x.pending?.kind === "chooseMay" && x.pending.player === 0);
  expect(st.players[1]!.shuffles).toBeGreaterThan(0);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const looked = await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary");
  const [a, b] = looked.players[1]!.library.slice(0, 2);
  const pick = modal(page);
  await pick.locator(`[data-pick="${a}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending);
  expect(after.objects[a!]!.zone).toBe("exile");
  expect(after.players[1]!.library[0]).toBe(b);
  expect(pageErrors(page)).toEqual([]);
});
