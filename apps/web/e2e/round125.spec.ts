// Round 125's prompts: Library of Leng's "put it on top instead" pick, ..., Master of Ceremonies' three words, Extract
// from Darkness's pick from any graveyard and Fandaniel's "you may sacrifice".
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Library of Leng: Faithless Looting's discards, then click one to put on top of your library instead", async ({ page }) => {
  const s = scene({ hand: ["Faithless Looting", "Hill Giant"], board: [...LANDS, "Library of Leng"], library: ["Grizzly Bears", "Shock"] });
  const [giant, shock] = [one(s, "Hill Giant"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Faithless Looting", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "discard");
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${shock}"]`).click();
  await controls(page).getByRole("button", { name: "Discard", exact: true }).click();
  const bar = controls(page);
  await expect(bar).toContainText("Faithless Looting: you discard Hill Giant, Shock. Click any of them to put on top of your library instead of into your graveyard.");
  await expect(bar.getByRole("button", { name: "All to the graveyard", exact: true })).toBeVisible();
  await page.locator(`[data-obj="${shock}"]`).click();
  await bar.getByRole("button", { name: "Put 1 on top", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.players[0]!.library[0]).toBe(shock);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Rottenmouth Viper: X starts at the fewest sacrifices three Swamps can pay with; sacrifice three and cast it", async ({ page }) => {
  const s = scene({ hand: ["Rottenmouth Viper"], board: ["Swamp", "Swamp", "Swamp", "Grizzly Bears", "Grizzly Bears", "Grizzly Bears", "Hill Giant"] });
  const viper = one(s, "Rottenmouth Viper");
  const bears = idsOf(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Rottenmouth Viper", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("sacrifice X nonland permanents, each making it {1} cheaper: choose X");
  await expect(x.getByLabel("X", { exact: true })).toHaveValue("3");
  await x.getByRole("button", { name: "X = 3" }).click();
  const costBar = page.locator(".targeting");
  await expect(costBar).toContainText("Rottenmouth Viper: sacrifice");
  for (const b of bears) await page.locator(`[data-obj="${b}"]`).click();
  await costBar.getByRole("button", { name: "Sacrifice and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[viper]!.zone === "battlefield");
  expect(bears.every((b) => after.objects[b]!.zone === "graveyard")).toBe(true);
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Gluntch, the Bestower: at your end step choose yourself for the counters, then a second and a third player", async ({ page }) => {
  const s0 = scene({ board: ["Gluntch, the Bestower", "Grizzly Bears"] });
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "nthPlayer");
  const [ana, ben] = [s.players.find((p) => p.name === "Ana")!.id, s.players.find((p) => p.name === "Ben")!.id];
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("to put two +1/+1 counters on a creature they control");
  await bar.getByRole("button", { name: "You", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" || (st.pending?.kind === "chooseOption" && st.pending.prompt === "to draw a card"));
  if ((await state(page)).pending?.kind === "pickPermanents") {
    await page.locator(`[data-obj="${one(s, "Grizzly Bears")}"]`).click();
    await controls(page).getByRole("button").first().click();
  }
  await expect(bar).toContainText("to draw a card");
  await expect(bar.getByRole("button", { name: "You", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  await expect(bar).toContainText("to create two Treasure tokens");
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.controller === ben && st.cards[st.objects[id]!.cardId]!.name === "Treasure Token"));
  expect(after.players[ana]!.hand.length).toBe(s.players[ana]!.hand.length + 1);
  expect(after.objects[one(s, "Grizzly Bears")]!.counters["+1/+1"]).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Master of Ceremonies: at Ana's upkeep choose Secrets with its button; you and Ana each draw a card", async ({ page }) => {
  const s0 = scene({}, [{ board: ["Master of Ceremonies"] }]);
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Master of Ceremonies:");
  await expect(bar.getByRole("button", { name: "Money", exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Friends", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Secrets", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length > s.players[0]!.hand.length);
  expect(after.players[0]!.hand.length).toBe(s.players[0]!.hand.length + 1);
  expect(pageErrors(page)).toEqual([]);
});

test("Extract from Darkness: put Ana's Hill Giant from her graveyard onto the battlefield under your control", async ({ page }) => {
  const s = scene({ hand: ["Extract from Darkness"], board: LANDS }, [{ yard: ["Hill Giant"] }]);
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Extract from Darkness", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const m = modal(page);
  await expect(m).toContainText("Extract from Darkness: put a creature card from a graveyard onto the battlefield under your control");
  await expect(m.locator(`[data-pick="${giant}"] [data-owner="1"]`)).toContainText("Ana's");
  await m.locator(`[data-pick="${giant}"]`).click();
  await m.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.controller).toBe(0);
  expect(after.objects[giant]!.owner).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Fandaniel: at Ana's end step choose to sacrifice your Grizzly Bears instead of losing life", async ({ page }) => {
  const s0 = scene({ board: ["Grizzly Bears"] }, [{ board: ["Fandaniel, Telophoroi Ascian"], yard: ["Lightning Bolt", "Lightning Bolt"] }]);
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Fandaniel, Telophoroi Ascian:");
  await expect(bar).toContainText("Sacrifice a nontoken creature of your choice?");
  // Your only nontoken creature: it's the one sacrificed, without a pick.
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "graveyard");
  expect(after.players[0]!.life).toBe(s.players[0]!.life);
  // Ben and Cy have no creature: each loses 2 life for each of the two instants.
  expect(after.players[2]!.life).toBe(s.players[2]!.life - 4);
  expect(pageErrors(page)).toEqual([]);
});
