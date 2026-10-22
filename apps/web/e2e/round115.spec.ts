// Round 115's prompts: Jhoira of the Ghitu's "exile a nonland card from your hand" cost, Quilled Greatwurm cast from the
// graveyard by removing six counters, Plargg and Nassari's opponent who picks the card you can't cast, Oblivion Sower's
// lands from exile, Slaughter the Strong's keep with a total power, Thieving Skydiver's kicker X (never 0), Sphinx of the
// Revelation's "Pay X {E}" and Leyline Tyrant's "pay any amount of {R}".
import { expect, test } from "@playwright/test";
import { applyAction, controllerOf, planCast, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Jhoira of the Ghitu: exile Hill Giant from your hand to pay, and it's suspended with four time counters", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant", "Forest"], board: [...LANDS, "Jhoira of the Ghitu"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Jhoira of the Ghitu", s).click();
  const item = menu(page).locator("button", { hasText: "Exile a nonland card from your hand" });
  if (await item.count()) await item.click();
  const m = modal(page);
  await expect(m).toContainText("Jhoira of the Ghitu: exile from your hand a nonland card");
  // The Forest isn't a choice.
  await expect(m.locator(".card", { hasText: "Forest" })).toHaveCount(0);
  await m.locator(".card", { hasText: "Hill Giant" }).click();
  await m.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.counters.time === 4);
  expect(after.objects[giant]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Quilled Greatwurm: cast from your graveyard, removing six counters from among your creatures", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Grizzly Bears", "Hill Giant"], yard: ["Quilled Greatwurm"] });
  const [bears, giant, wurm] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Quilled Greatwurm")];
  s.objects[bears]!.counters["+1/+1"] = 3;
  s.objects[giant]!.counters["+1/+1"] = 4;
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Quilled Greatwurm" }).click();
  const item = menu(page).locator("button", { hasText: /graveyard/i });
  if (await item.count()) await item.first().click();
  const pick = page.locator(".counter-pick");
  await expect(pick).toContainText("Quilled Greatwurm: remove 6 counters from among creatures you control");
  await expect(pick).toContainText("0 of 6 chosen");
  for (let i = 0; i < 3; i++) await pick.locator(`[data-counter="${bears}:+1/+1"]`).getByRole("button", { name: "+" }).click();
  for (let i = 0; i < 3; i++) await pick.locator(`[data-counter="${giant}:+1/+1"]`).getByRole("button", { name: "+" }).click();
  await expect(pick).toContainText("6 of 6 chosen");
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[wurm]!.zone === "battlefield");
  expect(after.objects[bears]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(after.objects[giant]!.counters["+1/+1"]).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Plargg and Nassari: you pick Ana, who keeps one card from you; you cast one of the others for free", async ({ page }) => {
  // Each opponent draws one Hill Giant before your next upkeep; the second is on top then.
  const two = { library: ["Hill Giant", "Hill Giant"] };
  let s: GameState = scene({ board: ["Plargg and Nassari"], library: ["Grizzly Bears"] }, [two, two, two]);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent" && st.pending.player === 0);
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Plargg and Nassari:");
  await bar.getByRole("button", { name: "Ana" }).click();
  // Ana picks one nonland card; you may cast up to two of the other three.
  const now = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  const options = (now.pending as { options: string[] }).options.filter((o) => o !== "none");
  expect(options.length).toBe(3);
  const pick = options.find((o) => now.objects[o]!.cardId === now.objects[idsOf(now, "Hill Giant", "exile")[0]!]!.cardId)!;
  await bar.locator("button", { hasText: "Hill Giant" }).first().click();
  // Cast it for free; then stop, though a second spell is allowed.
  await expect(bar).toContainText("cast Hill Giant without paying its mana cost?");
  await bar.getByRole("button", { name: "Cast it" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[pick]!.zone === "battlefield");
  expect(after.objects[pick]!.controller).toBe(0);
  expect(idsOf(after, "Hill Giant", "exile").length).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Oblivion Sower: Ana exiles four, and you put two of her lands onto the battlefield", async ({ page }) => {
  const s = scene({ hand: ["Oblivion Sower"], board: LANDS });
  await open(page, s);
  await card(page, "Oblivion Sower", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await clickPlayer(page, 1);
  const now = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const offered = (now.pending as { cards: string[] }).cards;
  expect(offered.length).toBe(4);
  const m = modal(page);
  await m.locator(`[data-pick="${offered[0]}"]`).click();
  await m.locator(`[data-pick="${offered[1]}"]`).click();
  await m.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Oblivion Sower")]!.zone === "battlefield");
  for (const id of offered.slice(0, 2)) {
    expect(after.objects[id]!.zone).toBe("battlefield");
    expect(after.objects[id]!.controller).toBe(0);
    expect(after.objects[id]!.owner).toBe(1);
  }
  for (const id of offered.slice(2)) expect(after.objects[id]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Slaughter the Strong: keep creatures with total power 4 or less; Keep is off above that", async ({ page }) => {
  const s = scene({ hand: ["Slaughter the Strong"], board: [...LANDS, "Hill Giant", "Grizzly Bears", "Grizzly Bears"] });
  const giant = one(s, "Hill Giant");
  const [b1, b2] = idsOf(s, "Grizzly Bears", "battlefield");
  await open(page, s);
  await card(page, "Slaughter the Strong", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("click any number of your creatures with total power 4 or less to keep (now 0)");
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${b1}"]`).click();
  await expect(bar).toContainText("(now 5)");
  await expect(bar.getByRole("button", { name: "Keep 2" })).toBeDisabled();
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${b2}"]`).click();
  await expect(bar).toContainText("(now 4)");
  await bar.getByRole("button", { name: "Keep 2" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect([b1, b2].map((id) => after.objects[id!]!.zone)).toEqual(["battlefield", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Thieving Skydiver: kicked, X can't go below 1; X = 1 takes Ana's Sol Ring", async ({ page }) => {
  const s = scene({ hand: ["Thieving Skydiver"], board: LANDS }, [{ board: ["Sol Ring", "Mind Stone"] }]);
  const ring = one(s, "Sol Ring");
  await open(page, s);
  await card(page, "Thieving Skydiver", s).click();
  await page.getByRole("button", { name: "Kick it" }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("Thieving Skydiver (kicked)");
  await x.getByLabel("X", { exact: true }).fill("0");
  await expect(x.getByRole("button", { name: "X = 1" })).toBeVisible();
  await expect(x.getByRole("button", { name: "X minus one" })).toBeDisabled();
  await x.getByRole("button", { name: "X = 1" }).click();
  // Sol Ring is the only artifact with mana value 1 or less: it may be chosen without asking.
  const at = await resolveUntil(page, (st) => (st.pending?.kind === "chooseTargets" && st.pending.player === 0) || controllerOf(st, st.objects[ring]!) === 0);
  if (at.pending?.kind === "chooseTargets") await page.locator(`[data-obj="${ring}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && controllerOf(st, st.objects[ring]!) === 0);
  expect(controllerOf(after, after.objects[one(s, "Mind Stone")]!)).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Sphinx of the Revelation: pay X energy, no more than you have, to draw X", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Sphinx of the Revelation"] });
  s.players[0]!.energy = 3;
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await card(page, "Sphinx of the Revelation", s).click();
  const item = menu(page).locator("button", { hasText: "Draw X cards" });
  if (await item.count()) await item.click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("pay X energy: choose X (up to 3)");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === hand + 2);
  expect(after.players[0]!.energy).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Leyline Tyrant dies: pay 3 red, then it deals 3 damage to Ana", async ({ page }) => {
  let s: GameState = scene({ hand: ["Murder"], board: ["Swamp", "Swamp", "Swamp", "Mountain", "Mountain", "Mountain", "Mountain", "Leyline Tyrant"] });
  const tyrant = one(s, "Leyline Tyrant");
  for (const a of planCast(s, 0, one(s, "Murder"), [{ kind: "object", id: tyrant }])!) s = applyAction(s, a);
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "payX" && st.pending.player === 0);
  const bar = controls(page);
  // Four Mountains, one tapped for Murder: up to 3.
  await expect(bar.getByRole("button", { name: "X = 4" })).toHaveCount(0);
  await expect(bar).toContainText("Leyline Tyrant:");
  await bar.getByRole("button", { name: "X = 3" }).click();
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === 37);
  expect(after.objects[tyrant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
