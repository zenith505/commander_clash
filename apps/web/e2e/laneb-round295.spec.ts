// Lane B round B295 in the browser: Harold and Bob, First Numens (dies to Murder, returns as an Aura on the Forest you
// choose, which then taps for three mana of one color and two rad counters) and Nick Fury, Agent of S.H.I.E.L.D. (power-up
// puts Peter Parker from the top seven onto the battlefield, then "you may transform it": Yes).
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Harold and Bob: dies to Murder, returns on the Forest you choose, which taps for {U}{U}{U} and two rad counters", async ({ page }) => {
  const s = scene({ hand: ["Murder"], board: ["Swamp", "Swamp", "Swamp", "Forest", "Forest", "Harold and Bob, First Numens"] });
  const harold = one(s, "Harold and Bob, First Numens");
  const forests = idsOf(s, "Forest", "battlefield", 0);
  await open(page, s);
  await card(page, "Murder", s).click();
  await page.locator(`[data-obj="${harold}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "enchant");
  const pick = page.locator(".controls.enchant-pick");
  await expect(pick).toContainText("choose what Harold and Bob, First Numens enchants as it returns to the battlefield as an Aura");
  await expect(pick.getByRole("button")).toHaveCount(2);
  await pick.getByRole("button").nth(1).click();
  const back = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[harold]!.zone === "battlefield");
  const host = back.objects[harold]!.attachedTo!;
  expect(forests).toContain(host);
  expect(back.players[0]!.rad ?? 0).toBe(0);
  // The Forest it enchants has its own {T}: Add {G} and the granted ability: the menu offers {G}, and three of each color.
  await page.locator(`[data-obj="${host}"]`).first().click();
  const m = menu(page);
  await expect(m.getByRole("button", { name: /add G$/ })).toHaveCount(1);
  await m.getByRole("button", { name: /add U U U/ }).click();
  const after = await resolveUntil(page, (st) => st.players[0]!.manaPool.U === 3);
  expect(after.players[0]!.rad).toBe(2);
  expect(after.objects[host]!.tapped).toBe(true);
  expect(after.stack).toEqual([]);
  expect(pageErrors(page)).toEqual([]);
});

test("Nick Fury: power-up puts Peter Parker onto the battlefield from the top seven, Yes transforms him into Amazing Spider-Man", async ({ page }) => {
  const s = scene({ board: ["Plains", "Island", "Swamp", "Mountain", "Forest", "Nick Fury, Agent of S.H.I.E.L.D."], library: ["Divination", "Peter Parker // Amazing Spider-Man", "Bonesplitter"] });
  const [nick, divination, peter, splitter] = [one(s, "Nick Fury, Agent of S.H.I.E.L.D."), one(s, "Divination"), one(s, "Peter Parker"), one(s, "Bonesplitter")];
  await open(page, s);
  await page.locator(`[data-obj="${nick}"]`).first().click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /Power-up|two \+1\/\+1 counters/ }).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  // Only the Hero and the Equipment can be taken: Divination is dimmed.
  await expect(pick.locator(`[data-pick="${divination}"]`)).toHaveClass(/dim/);
  await expect(pick.locator(`[data-pick="${splitter}"]`)).toHaveClass(/targetable/);
  await pick.locator(`[data-pick="${peter}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Nick Fury, Agent of S.H.I.E.L.D.: Transform the double-faced card put onto the battlefield?");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[peter]!.zone === "battlefield" && st.objects[peter]!.face === 1);
  expect(after.objects[nick]!.counters["+1/+1"]).toBe(2);
  // Peter Parker entered front face up, so his enters trigger made the Spider.
  expect(after.battlefield.some((id) => after.objects[id]!.isToken && after.cards[after.objects[id]!.cardId]?.name.startsWith("Spider"))).toBe(true);
  expect(after.players[0]!.library.slice(-6)).toEqual(expect.arrayContaining([divination, splitter]));
  expect(pageErrors(page)).toEqual([]);
});
