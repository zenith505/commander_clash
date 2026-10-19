// Round 86's pickers. Scent of Cinder reveals any number of red cards from your hand (CR 701.20a); Valakut Awakening
// puts any number from your hand on the bottom of your library (first pick lowest) and draws that many plus one;
// Volcanic Spite's "You may put a card from your hand on the bottom of your library"; Halo-Charged Skaab puts a card
// from your graveyard on top of your library; Invasion of Alara, casting neither card, asks which goes to your hand;
// Traumatic Revelation's "You may choose a creature or battle card from it" with Take none, then incubate 3.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Scent of Cinder: reveal two red cards from your hand for 2 damage", async ({ page }) => {
  const s = scene({ hand: ["Scent of Cinder", "Shock", "Lightning Bolt", "Opt"], board: LANDS });
  const [shock, bolt, opt] = [one(s, "Shock"), one(s, "Lightning Bolt"), one(s, "Opt")];
  await open(page, s);
  await card(page, "Scent of Cinder", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Scent of Cinder: you may reveal");
  await expect(pick.locator(`[data-pick="${opt}"]`)).toHaveCount(0);
  await expect(pick.getByRole("button", { name: "Reveal none" })).toBeVisible();
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await expect(pick).toContainText("Revealing 2.");
  await pick.getByRole("button", { name: "Reveal", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[1]!.life).toBe(38);
  expect(after.objects[shock]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Valakut Awakening: put two cards from your hand on the bottom, first pick lowest, and draw three", async ({ page }) => {
  const s = scene({ hand: ["Valakut Awakening // Valakut Stoneforge", "Shock", "Opt", "Divination"], board: LANDS });
  const [shock, opt, div] = [one(s, "Shock"), one(s, "Opt"), one(s, "Divination")];
  await open(page, s);
  await card(page, "Valakut Awakening", s).click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Valakut Awakening: put");
  await expect(pick).toContainText("from your hand on the bottom of your library");
  await expect(pick.getByRole("button", { name: "Keep them all" })).toBeVisible();
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.locator(`[data-pick="${opt}"]`).click();
  await expect(pick).toContainText("Chosen 2; the first goes lowest.");
  await pick.getByRole("button", { name: "Put on bottom" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const lib = after.players[0]!.library;
  expect(lib.slice(-2)).toEqual([opt, shock]);
  expect(after.objects[div]!.zone).toBe("hand");
  expect(after.players[0]!.hand.length).toBe(4);
  expect(pageErrors(page)).toEqual([]);
});

test("Volcanic Spite: yes, then click a card to put on the bottom of your library and draw", async ({ page }) => {
  const s = scene({ hand: ["Volcanic Spite", "Opt", "Shock"], board: LANDS }, [{ board: ["Hill Giant"] }]);
  const [giant, opt] = [one(s, "Hill Giant"), one(s, "Opt")];
  await open(page, s);
  await card(page, "Volcanic Spite", s).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "handToTop");
  await expect(controls(page)).toContainText("Volcanic Spite: click 1 card to put on the bottom of your library.");
  const put = controls(page).getByRole("button", { name: "Put on bottom" });
  await expect(put).toBeDisabled();
  await page.locator(`[data-obj="${opt}"]`).click();
  await put.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.players[0]!.library.at(-1)).toBe(opt);
  expect(after.players[0]!.hand.length).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Halo-Charged Skaab: put an instant from your graveyard on top of your library", async ({ page }) => {
  const s = scene({ hand: ["Halo-Charged Skaab"], board: LANDS, yard: ["Shock", "Grizzly Bears"] });
  const [shock, bears] = [one(s, "Shock"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Halo-Charged Skaab", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Halo-Charged Skaab: you may put");
  await expect(pick).toContainText("from your graveyard on top of your library");
  await expect(pick.locator(`[data-pick="${bears}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[0]!.library[0]).toBe(shock);
  expect(pageErrors(page)).toEqual([]);
});

test("Invasion of Alara: cast neither card, then choose which goes to your hand", async ({ page }) => {
  const s = scene({ hand: ["Invasion of Alara // Awaken the Maelstrom"], board: LANDS, library: ["Grizzly Bears", "Shock"] });
  const [bears, shock] = [one(s, "Grizzly Bears"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Invasion of Alara", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "protector");
  await controls(page).getByRole("button", { name: "Ana" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong");
  await controls(page).getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && !st.pending.options.includes("none"));
  const bar = controls(page);
  await expect(bar).toContainText("Invasion of Alara: put which of them into your hand? The other stays exiled.");
  await bar.getByRole("button", { name: "Shock", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[shock]!.zone).toBe("hand");
  expect(after.objects[bears]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Traumatic Revelation: Take none from their hand, and incubate 3", async ({ page }) => {
  const s = scene({ hand: ["Traumatic Revelation"], board: LANDS }, [{ hand: ["Hill Giant", "Opt"] }]);
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Traumatic Revelation", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Ana's hand");
  await pick.getByRole("button", { name: "Take none" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.zone).toBe("hand");
  const incubator = after.battlefield.find((id) => after.objects[id]!.isToken && after.objects[id]!.controller === 0);
  expect(incubator && after.objects[incubator]!.counters["+1/+1"]).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});
