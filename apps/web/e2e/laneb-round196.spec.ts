// Lane B round B196 in the browser: Ether (the first "{T}, Exile this: Add" mana ability of a permanent: Ether is exiled as
// the mana is added, and the next instant you cast is copied) and Munda, Ambush Leader (rally: you may look at the top
// four, reveal any number of Ally cards among them and put them back on top in the order you choose, the rest on the
// bottom).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Ether: exile it for {U}, then Lightning Bolt is copied and both hit Ana", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: ["Ether", "Mountain"] });
  const [ether, bolt] = [one(s, "Ether"), one(s, "Lightning Bolt")];
  const life = s.players[1]!.life;
  await open(page, s);
  await page.locator(`[data-obj="${ether}"]`).click();
  await menu(page).getByRole("button", { name: /Exile Ether: Add/ }).click();
  // The state the poll saw, not a later one.
  let paid = s;
  await expect
    .poll(async () => {
      paid = await state(page);
      return paid.players[0]!.manaPool.U;
    })
    .toBe(1);
  expect([paid.objects[ether]!.zone, paid.stack.length]).toEqual(["exile", 0]);
  await card(page, "Lightning Bolt", paid).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets");
  await page.locator(".targeting").getByRole("button", { name: /^Keep target/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(life - 6);
  expect(pageErrors(page)).toEqual([]);
});

test("Munda, Ambush Leader: look at the top four, keep both Allies on top in the order you choose, the rest on the bottom", async ({ page }) => {
  const TOP = ["Hill Giant", "Ondu Cleric", "Divination", "Kazandu Blademaster"];
  const s = scene({ hand: ["Munda, Ambush Leader"], board: LANDS, library: TOP });
  const [giant, cleric, divination, blademaster] = TOP.map((n) => one(s, n));
  await open(page, s);
  await card(page, "Munda, Ambush Leader", s).click();
  const cast = menu(page).locator("button", { hasText: /^Cast/ });
  if (await cast.count()) await cast.first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(asked.pending?.kind === "searchLibrary" ? [...asked.pending.cards].sort() : []).toEqual([cleric!, blademaster!].sort());
  const pick = modal(page);
  await pick.locator(`[data-pick="${cleric}"]`).click();
  await pick.locator(`[data-pick="${blademaster}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  // The two Allies back on top, Kazandu Blademaster moved above Ondu Cleric.
  const mid = await resolveUntil(page, (x) => x.pending?.kind === "arrangeTop" && x.pending.how === "order");
  const order = mid.pending?.kind === "arrangeTop" ? mid.pending.cards : [];
  expect(new Set(order)).toEqual(new Set([cleric, blademaster]));
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("Munda");
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${order[1]}"]`) }).getByRole("button", { name: "Move toward the top" }).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  // Then the other two go to the bottom, in the order you choose.
  await resolveUntil(page, (x) => x.pending?.kind === "arrangeTop" && x.pending.how === "bottom");
  await page.locator(".modal.arrange").getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[one(s, "Munda, Ambush Leader")]!.zone === "battlefield");
  const lib = after.players[0]!.library;
  expect(lib.slice(0, 2)).toEqual([order[1], order[0]]);
  expect(new Set(lib.slice(-2))).toEqual(new Set([giant, divination]));
  expect(pageErrors(page)).toEqual([]);
});
