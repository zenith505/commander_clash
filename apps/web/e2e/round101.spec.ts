// Round 101's prompts: "Remove two +1/+1 counters from among creatures you control" costs (Hopeful Initiate), the counters
// "Remove up to five counters" removes picked one at a time (Render Inert), a target card exiled with the source (The
// Darkness Crystal), "a creature card and/or a land card" from the top of the library (Relentless Pursuit), evoke by
// exiling a white card from your hand (Solitude) and "sacrifice any number of lands" (Scapeshift).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Hopeful Initiate: remove two +1/+1 counters from among your creatures, picked in the counter window", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Hopeful Initiate", "Grizzly Bears", "Hill Giant"] }, [{ board: ["Sol Ring"] }]);
  const [initiate, bears, giant, ring] = [one(s, "Hopeful Initiate"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Sol Ring")];
  s.objects[bears]!.counters["+1/+1"] = 1;
  s.objects[giant]!.counters["+1/+1"] = 2;
  await open(page, s);
  await card(page, "Hopeful Initiate", s).click();
  const item = menu(page).locator("button", { hasText: "Destroy target artifact or enchantment" });
  if (await item.count()) await item.click();
  await page.locator(`[data-obj="${ring}"]`).click();
  const pick = page.locator(".counter-pick");
  await expect(pick).toContainText("0 of 2 chosen");
  await expect(pick.locator("[data-counter]")).toHaveCount(2);
  await pick.locator(`[data-counter="${bears}:+1/+1"]`).getByRole("button", { name: "+" }).click();
  await pick.locator(`[data-counter="${giant}:+1/+1"]`).getByRole("button", { name: "+" }).click();
  await expect(pick).toContainText("2 of 2 chosen");
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ring]!.zone === "graveyard");
  expect(after.objects[bears]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(after.objects[giant]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[initiate]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Render Inert: pick the counters to remove one at a time, then stop", async ({ page }) => {
  const s = scene({ hand: ["Render Inert"], board: LANDS }, [{ board: ["Grizzly Bears"] }]);
  const bears = one(s, "Grizzly Bears");
  s.objects[bears]!.counters = { "+1/+1": 2, stun: 1 };
  await open(page, s);
  await card(page, "Render Inert", s).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "removeCounter");
  const bar = controls(page);
  await expect(bar).toContainText("choose a counter to remove from Grizzly Bears (1 of 5)");
  await bar.getByRole("button", { name: "A +1/+1 counter (2 left)" }).click();
  await expect(bar).toContainText("(2 of 5)");
  await bar.getByRole("button", { name: "A +1/+1 counter (1 left)" }).click();
  await bar.getByRole("button", { name: "That's all" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.counters).toMatchObject({ "+1/+1": 0, stun: 1 });
  expect(pageErrors(page)).toEqual([]);
});

test("The Darkness Crystal: put a creature card it exiled onto the battlefield, picked from that player's exile", async ({ page }) => {
  const s = scene({ board: [...LANDS, "The Darkness Crystal"] }, [{ exile: ["Hill Giant", "Grizzly Bears"] }]);
  const [crystal, giant, bears] = [one(s, "The Darkness Crystal"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  // The Crystal exiled the Giant; the Bears were exiled some other way.
  s.linkedExile = { [`${crystal}@${s.objects[crystal]!.zoneChanges ?? 0}`]: [{ id: giant, zc: s.objects[giant]!.zoneChanges ?? 0 }] };
  await open(page, s);
  await card(page, "The Darkness Crystal", s).click();
  const item = menu(page).locator("button", { hasText: "onto the battlefield" });
  if (await item.count()) await item.click();
  const pick = modal(page);
  await expect(pick).toContainText("Ana's cards in exile");
  await expect(pick.locator(".card", { hasText: "Grizzly Bears" })).toHaveCount(0);
  await pick.locator(".card", { hasText: "Hill Giant" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.controller).toBe(0);
  expect(after.objects[giant]!.tapped).toBe(true);
  expect(after.objects[giant]!.counters["+1/+1"]).toBe(2);
  expect(after.objects[bears]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Relentless Pursuit: a creature card and a land card, not two creatures", async ({ page }) => {
  const s = scene({ hand: ["Relentless Pursuit"], board: LANDS, library: ["Grizzly Bears", "Hill Giant", "Forest", "Opt"] });
  const [bears, giant, opt] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Opt")];
  const forest = s.players[0]!.library[2]!;
  await open(page, s);
  await card(page, "Relentless Pursuit", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Relentless Pursuit: put a creature card and/or a land card into your hand");
  await pick.locator(`[data-pick="${bears}"]`).click();
  // A second creature card doesn't fit: the creature slot is taken.
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${forest}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect([bears, forest, giant, opt].map((id) => after.objects[id]!.zone)).toEqual(["hand", "hand", "graveyard", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Solitude: evoke it by exiling a white card from your hand, exile a creature, then it's sacrificed", async ({ page }) => {
  const s = scene({ hand: ["Solitude", "Swords to Plowshares", "Shock"] }, [{ board: ["Hill Giant"] }]);
  const [solitude, swords, shock, giant] = [one(s, "Solitude"), one(s, "Swords to Plowshares"), one(s, "Shock"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Solitude", s).click();
  await menu(page).getByRole("button", { name: "Evoke: exile a white card from your hand" }).click();
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await expect(pick.locator(`[data-pick="${solitude}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${swords}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" || st.objects[giant]!.zone === "exile", 60);
  if ((await state(page)).pending?.kind === "chooseTargets") await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.triggerQueue.length === 0 && st.objects[solitude]!.zone === "graveyard", 60);
  expect(after.objects[giant]!.zone).toBe("exile");
  expect(after.objects[swords]!.zone).toBe("exile");
  expect(after.players[1]!.life).toBe(43); // the Giant's controller gains life equal to its power
  expect(pageErrors(page)).toEqual([]);
});

test("Scapeshift: sacrifice two lands, then find up to two land cards", async ({ page }) => {
  const s = scene({ hand: ["Scapeshift"], board: ["Forest", "Forest", "Forest", "Forest", "Plains", "Swamp"], library: ["Mountain", "Island"] });
  const [plains, swamp] = [idsOf(s, "Plains", "battlefield", 0)[0]!, idsOf(s, "Swamp", "battlefield", 0)[0]!];
  const [mountain, island] = s.players[0]!.library.slice(0, 2);
  await open(page, s);
  await card(page, "Scapeshift", s).click();
  await resolveUntil(page, (st) => !!st.pending);
  const bar = controls(page);
  await expect(bar).toContainText("Scapeshift: click any number of lands of yours to sacrifice.");
  await expect(bar.getByRole("button", { name: "Sacrifice none" })).toBeVisible();
  // Tapped or not, any land can be sacrificed.
  await page.locator(`[data-obj="${plains}"]`).click();
  await page.locator(`[data-obj="${swamp}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice", exact: true }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await pick.locator(`[data-pick="${mountain}"]`).click();
  await pick.locator(`[data-pick="${island}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending);
  for (const id of [plains, swamp]) expect(after.objects[id]!.zone).toBe("graveyard");
  for (const id of [mountain!, island!]) {
    expect(after.objects[id]!.zone).toBe("battlefield");
    expect(after.objects[id]!.tapped).toBe(true);
  }
  expect(pageErrors(page)).toEqual([]);
});
