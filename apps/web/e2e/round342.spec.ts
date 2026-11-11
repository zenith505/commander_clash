// Round 342's prompts: Sin, Unending Cataclysm's "As ~ enters, remove all counters from any number of artifacts,
// creatures, and enchantments" (a pick as it enters, anyone's), Moxite Refinery's "Remove X counters from an artifact or
// creature you control" (the counter picker, all from one permanent), Orvar, the All-Form's "a token that's a copy of one
// of those permanents" (a pick among the spell's targets) and Petrified Hamlet's "When this land enters, choose a land
// card name".
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Sin, Unending Cataclysm: pick Ana's creature and your Hedron Archive as it enters, it gets twice their counters", async ({ page }) => {
  const s0: GameState = scene({ hand: ["Sin, Unending Cataclysm"], board: [...LANDS, "Hedron Archive", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [archive, bears, giant] = [one(s0, "Hedron Archive"), one(s0, "Grizzly Bears"), one(s0, "Hill Giant")];
  s0.objects[archive]!.counters.charge = 2;
  s0.objects[bears]!.counters["+1/+1"] = 3;
  s0.objects[giant]!.counters["+1/+1"] = 1;
  const sin = idsOf(s0, "Sin, Unending Cataclysm", "hand", 0)[0]!;
  let t = s0;
  for (const a of planCast(t, 0, sin)!) t = applyAction(t, a);
  const s = playUntil(t, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("remove all counters from any number of artifacts, creatures, and enchantments as it enters (2 +1/+1 counters for each counter removed)");
  await expect(bar.getByRole("button", { name: "Choose none" })).toBeVisible();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await page.locator(`[data-obj="${archive}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[sin]!.zone === "battlefield");
  expect(after.objects[giant]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(after.objects[archive]!.counters.charge ?? 0).toBe(0);
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(3);
  expect(after.objects[sin]!.counters["+1/+1"]).toBe(6);
  expect(pageErrors(page)).toEqual([]);
});

test("Moxite Refinery: X = 2, two counters from one permanent (the other is locked out), two charge counters", async ({ page }) => {
  const s: GameState = scene({ board: [...LANDS, "Moxite Refinery", "Hedron Archive", "Grizzly Bears", "Hill Giant"] });
  const [refinery, archive, bears, giant] = [one(s, "Moxite Refinery"), one(s, "Hedron Archive"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[bears]!.counters["+1/+1"] = 1;
  s.objects[bears]!.counters.shield = 1;
  s.objects[giant]!.counters["+1/+1"] = 2;
  await open(page, s);
  await page.locator(`[data-obj="${refinery}"]`).first().click();
  const item = menu(page).locator("button", { hasText: "Remove X counters" });
  if (await item.count()) await item.click();
  const modes = page.locator(".mode-menu");
  if (await modes.count()) await modes.getByRole("button", { name: /charge counters on target artifact/ }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("remove X counters from an artifact or creature you control");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await page.locator(`[data-obj="${archive}"]`).first().click();
  const pick = page.locator(".counter-pick");
  await expect(pick).toContainText("remove 2 counters from an artifact or creature you control");
  await expect(pick).toContainText("0 of 2 chosen");
  await pick.locator(`[data-counter="${bears}:+1/+1"]`).getByRole("button", { name: "+" }).click();
  // All from the Bears now: the Giant's counters can't be picked.
  await expect(pick.locator(`[data-counter="${giant}:+1/+1"]`).getByRole("button", { name: "+" })).toBeDisabled();
  await pick.locator(`[data-counter="${bears}:shield"]`).getByRole("button", { name: "+" }).click();
  await expect(pick).toContainText("2 of 2 chosen");
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[archive]!.counters.charge ?? 0) > 0);
  expect(after.objects[archive]!.counters.charge).toBe(2);
  expect(after.objects[bears]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(after.objects[bears]!.counters.shield ?? 0).toBe(0);
  expect(after.objects[giant]!.counters["+1/+1"]).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Orvar, the All-Form: a spell targeting two of your creatures, you pick which one the token copies", async ({ page }) => {
  const s0: GameState = scene({ hand: ["Seeds of Strength"], board: [...LANDS, "Orvar, the All-Form", "Grizzly Bears", "Llanowar Elves"] });
  const [bears, elves] = [one(s0, "Grizzly Bears"), one(s0, "Llanowar Elves")];
  const seeds = idsOf(s0, "Seeds of Strength", "hand", 0)[0]!;
  let t = s0;
  for (const a of planCast(t, 0, seeds, [{ kind: "object", id: bears }, { kind: "object", id: elves }, { kind: "object", id: elves }])!) t = applyAction(t, a);
  const s = playUntil(t, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Orvar, the All-Form");
  await page.locator(`[data-obj="${elves}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const tokens = after.battlefield.filter((id) => after.objects[id]!.isToken);
  expect(tokens).toHaveLength(1);
  expect(after.cards[after.objects[tokens[0]!]!.cardId]!.name).toBe("Llanowar Elves");
  expect(pageErrors(page)).toEqual([]);
});

test("Petrified Hamlet: play it, name a land card as its trigger resolves", async ({ page }) => {
  const s: GameState = scene({ hand: ["Petrified Hamlet"], board: LANDS }, [{ board: ["Mishra's Factory"] }]);
  const hamlet = one(s, "Petrified Hamlet");
  await open(page, s);
  await card(page, "Petrified Hamlet", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cardName");
  const pick = modal(page);
  await expect(pick).toContainText("Petrified Hamlet: choose a land card name");
  await pick.locator("input").fill("factory");
  await pick.locator(`[data-name="Mishra's Factory"]`).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.objects[hamlet]!.chosen?.name).toBe("Mishra's Factory");
  expect(pageErrors(page)).toEqual([]);
});
