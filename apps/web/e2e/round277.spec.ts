// Round 277 in the browser: Omnath, Locus of All's "you may reveal it" question and its three mana limited to the
// revealed card's colors; Manabond's end-step question (lands onto the battlefield, then the hand is discarded);
// Display of Power copying two spells on the stack picked as its targets.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, resolveUntil } from "./ui";

test("Omnath: Yes reveals Sphinx of the Steel Wind; three mana in white, blue and/or black only, and the Sphinx goes to your hand", async ({ page }) => {
  const s = scene({ board: ["Omnath, Locus of All"], library: ["Sphinx of the Steel Wind"] }, [], { step: "draw" });
  const sphinx = one(s, "Sphinx of the Steel Wind");
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const ctl = controls(page);
  await expect(ctl).toContainText("Omnath, Locus of All");
  await ctl.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "manaMix" && st.pending.player === 0);
  const bar = page.locator(".mana-mix");
  await expect(bar).toContainText("add 3 mana in any combination of white and/or blue and/or black (3 left)");
  await expect(bar.locator('[data-mix-color="R"]')).toHaveCount(0);
  await expect(bar.locator('[data-mix-color="G"]')).toHaveCount(0);
  await bar.getByRole("button", { name: "Blue plus one" }).click();
  await bar.getByRole("button", { name: "Blue plus one" }).click();
  await bar.getByRole("button", { name: "Black plus one" }).click();
  await bar.getByRole("button", { name: "Add" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[sphinx]!.zone === "hand");
  expect(after.players[0]!.manaPool.U).toBe(2);
  expect(after.players[0]!.manaPool.B).toBe(1);
  expect(after.step).toBe("main1");
  expect(pageErrors(page)).toEqual([]);
});

test("Omnath: No keeps the card hidden, adds nothing, and it still goes to your hand", async ({ page }) => {
  const s = scene({ board: ["Omnath, Locus of All"], library: ["Sphinx of the Steel Wind"] }, [], { step: "draw" });
  const sphinx = one(s, "Sphinx of the Steel Wind");
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "No" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[sphinx]!.zone === "hand");
  expect(Object.values(after.players[0]!.manaPool).reduce((a, n) => a + n, 0)).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Manabond: Yes at your end step puts Forest and Island onto the battlefield and discards Lightning Bolt", async ({ page }) => {
  const s = scene({ board: ["Manabond"], hand: ["Forest", "Island", "Lightning Bolt"] }, [], { step: "main2" });
  const [forest, island, bolt] = [idsOf(s, "Forest", "hand", 0)[0]!, idsOf(s, "Island", "hand", 0)[0]!, one(s, "Lightning Bolt")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const ctl = controls(page);
  await expect(ctl).toContainText("Manabond");
  await ctl.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect([after.objects[forest]!.zone, after.objects[island]!.zone]).toEqual(["battlefield", "battlefield"]);
  expect(after.players[0]!.hand.length).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Display of Power: pick Lightning Bolt, Done offered, then Shock; the Bolt copy turns to Cy, the Shock copy keeps Ben", async ({ page }) => {
  // Two more Mountains: Bolt, Shock and Display of Power need four red.
  const s = scene({ hand: ["Lightning Bolt", "Shock", "Display of Power"], board: [...LANDS, "Mountain", "Mountain"] });
  const [bolt, shock] = [one(s, "Lightning Bolt"), one(s, "Shock")];
  await open(page, s);
  // Bolt at Ana, then Shock at Ben, holding priority (CR 117.3c).
  await card(page, "Lightning Bolt", s).click();
  await clickPlayer(page, 1);
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  await card(page, "Shock", s).click();
  await clickPlayer(page, 2);
  await expect.poll(async () => (await state(page)).stack.length).toBe(2);
  const stack = (await state(page)).stack;
  const item = (id: string) => stack.find((it) => it.objectId === id)!.id;
  await card(page, "Display of Power", s).click();
  const bar = page.locator(".targeting");
  await page.locator(`[data-stack="${item(bolt)}"]`).click();
  await expect(bar.getByRole("button", { name: "Done" })).toBeVisible();
  await page.locator(`[data-stack="${item(shock)}"]`).click();
  // Both spells on the stack picked: no more to pick, so it's cast.
  await expect.poll(async () => (await state(page)).stack.length).toBe(3);
  // The copies come one at a time, in the order the targets were picked; each may get new targets.
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.pending.copyOf === "Lightning Bolt");
  await expect(bar).toContainText("Display of Power: copy of Lightning Bolt");
  await clickPlayer(page, 3);
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.pending.copyOf === "Shock");
  await bar.getByRole("button", { name: /^Keep target/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard" && st.objects[shock]!.zone === "graveyard", 60);
  expect([1, 2, 3].map((p) => after.players[p]!.life)).toEqual([37, 36, 37]);
  expect(pageErrors(page)).toEqual([]);
});
