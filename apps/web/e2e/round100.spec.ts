// Round 100's prompts: Spellskite's "which target becomes Spellskite", Muldrotha's once-each-turn permission picked by
// card type, Plumb the Forbidden's optional "sacrifice one or more creatures" X (0 by default), Mount Doom's "choose up
// to two creatures, then destroy the rest", and Shark Typhoon's cycling with {X}.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Spellskite: Arc Trail's second target becomes Spellskite, picked as its ability resolves", async ({ page }) => {
  const s = scene({ hand: ["Arc Trail"], board: [...LANDS, "Spellskite"] }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [skite, bears, giant] = [one(s, "Spellskite"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Arc Trail", s).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  await card(page, "Spellskite", s).click();
  await menu(page).locator("button", { hasText: "Change a target" }).click();
  const top = (await state(page)).stack[0]!.id;
  await page.locator(`[data-stack="${top}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "targetSlot");
  const bar = controls(page);
  await expect(bar).toContainText("Which target of Arc Trail becomes Spellskite?");
  await bar.getByRole("button", { name: "Instead of Hill Giant" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.damage).toBe(0);
  expect(after.objects[skite]!.damage).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Muldrotha: cast an artifact creature from the graveyard with the creature permission, then the artifact one is left", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Muldrotha, the Gravetide"], yard: ["Ornithopter", "Myr Retriever"] });
  const [solemn, myr] = [one(s, "Ornithopter"), one(s, "Myr Retriever")];
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Ornithopter" }).click();
  await expect(menu(page).locator("[data-permit]")).toHaveCount(2);
  await menu(page).getByRole("button", { name: /^Cast from graveyard with Muldrotha, the Gravetide \(creature\)/ }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[solemn]!.zone === "battlefield");
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Myr Retriever" }).click();
  // Only the artifact permission is left: one plain button.
  await expect(menu(page).locator("[data-permit]")).toHaveCount(0);
  await menu(page).getByRole("button", { name: /^Cast from graveyard/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[myr]!.zone === "battlefield");
  expect(after.turnLog?.gravePermits).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Plumb the Forbidden: X starts at 0; sacrifice one creature for one copy", async ({ page }) => {
  const s = scene({ hand: ["Plumb the Forbidden"], board: [...LANDS, "Grizzly Bears", "Hill Giant"] });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Plumb the Forbidden", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("(X can be 0): choose X");
  await expect(x.getByLabel("X", { exact: true })).toHaveValue("0");
  await x.getByLabel("X", { exact: true }).fill("1");
  await x.getByRole("button", { name: "X = 1" }).click();
  const costBar = page.locator(".targeting");
  await expect(costBar).toContainText("Plumb the Forbidden: sacrifice a creature (click it)");
  await page.locator(`[data-obj="${bears}"]`).click();
  await costBar.getByRole("button", { name: "Sacrifice and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.triggerQueue.length === 0 && st.players[0]!.life === 38);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(after.players[0]!.hand).toHaveLength(2); // the spell and its copy each drew one
  expect(pageErrors(page)).toEqual([]);
});

test("Mount Doom: sacrifice it and a legendary artifact, keep your Hill Giant and Ana's Bears, destroy the rest", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Mount Doom", "The One Ring", "Hill Giant", "Llanowar Elves"] }, [{ board: ["Grizzly Bears", "Colossal Dreadmaw"] }]);
  const [doom, ring, giant, elves, bears, dreadmaw] = ["Mount Doom", "The One Ring", "Hill Giant", "Llanowar Elves", "Grizzly Bears", "Colossal Dreadmaw"].map((n) => one(s, n));
  await open(page, s);
  await card(page, "Mount Doom", s).click();
  await menu(page).locator("button", { hasText: "Choose up to two creatures" }).click();
  const costBar = page.locator(".targeting");
  await expect(costBar).toContainText("Mount Doom: sacrifice another legendary artifact (click it)");
  await page.locator(`[data-obj="${ring}"]`).click();
  await costBar.getByRole("button", { name: "Sacrifice and activate" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "keep");
  const bar = controls(page);
  await expect(bar).toContainText("to keep (anyone's). The rest are destroyed.");
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Keep 2" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect([doom, ring, giant, elves, bears, dreadmaw].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "battlefield", "graveyard", "battlefield", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Shark Typhoon: cycle it for X = 2 from the hand, a 2/2 flying Shark", async ({ page }) => {
  const s = scene({ hand: ["Shark Typhoon"], board: LANDS });
  const shark = one(s, "Shark Typhoon");
  await open(page, s);
  await card(page, "Shark Typhoon", s).click();
  await menu(page).locator("button", { hasText: "Cycling" }).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.triggerQueue.length === 0 && st.players[0]!.hand.length === 1);
  expect(after.objects[shark]!.zone).toBe("graveyard");
  const tokens = after.battlefield.filter((id) => after.objects[id]!.isToken);
  expect(tokens).toHaveLength(1);
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(4); // {X}{1}{U} with X = 2
  expect(pageErrors(page)).toEqual([]);
});
