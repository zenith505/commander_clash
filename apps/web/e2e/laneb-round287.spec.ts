// Lane B round B287 in the browser: Mimeoplasm, Revered One (X = 2, exile Serra Angel and stop, three +1/+1 counters; then
// {2}: become a copy of the Serra Angel it exiled, picked from your exile) and Sanar, Innovative First-Year (at your first
// main phase, choose a red and a blue card among those revealed, then cast the exiled Hill Giant).
import { expect, test } from "@playwright/test";
import type { GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil, seat } from "./ui";

/** The state once `done` holds (polled), kept: no second read after it. */
async function settled(page: Parameters<typeof state>[0], done: (s: GameState) => boolean): Promise<GameState> {
  let s: GameState | undefined;
  await expect.poll(async () => done((s = await state(page)))).toBe(true);
  return s!;
}

test("Mimeoplasm, Revered One: X = 2, exile Serra Angel and stop; then {2}: it becomes a copy of the Serra Angel, a 3/3", async ({ page }) => {
  const s = scene({ hand: ["Mimeoplasm, Revered One"], board: LANDS, yard: ["Grizzly Bears", "Serra Angel", "Lightning Bolt"] });
  const mimeo = one(s, "Mimeoplasm, Revered One");
  const [bears, angel] = [idsOf(s, "Grizzly Bears", "graveyard", 0)[0]!, idsOf(s, "Serra Angel", "graveyard", 0)[0]!];
  await open(page, s);
  await card(page, "Mimeoplasm, Revered One", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "exileFromYard");
  expect([...(asked.pending as { options: string[] }).options].sort()).toEqual([bears, angel, "done"].sort());
  const c = controls(page);
  await expect(c).toContainText("exile up to 2 creature cards from your graveyard as it enters (3 +1/+1 counters for each)");
  await c.getByRole("button", { name: "Exile Serra Angel" }).click();
  await expect(c).toContainText("(1 so far)");
  await c.getByRole("button", { name: "That's all" }).click();
  const entered = await settled(page, (st) => st.stack.length === 0 && !st.pending && st.objects[mimeo]!.zone === "battlefield");
  expect(entered.objects[angel]!.zone).toBe("exile");
  expect(entered.objects[bears]!.zone).toBe("graveyard");
  expect(entered.objects[mimeo]!.counters["+1/+1"]).toBe(3);
  await expect(page.locator(`[data-obj="${mimeo}"]`)).toContainText("3/3");
  // {2}: the target is a creature card exiled with it, picked from your exile.
  await page.locator(`[data-obj="${mimeo}"]`).first().click();
  const item = menu(page).locator("button", { hasText: "becomes a copy" });
  if (await item.count()) await item.click();
  const pick = modal(page);
  await pick.locator(".card", { hasText: "Serra Angel" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.cards[st.objects[mimeo]!.cardId] !== undefined && st.log.some((l) => l.text.includes("becomes a copy")));
  expect(after.objects[mimeo]!.zone).toBe("battlefield");
  await expect(page.locator(`[data-obj="${mimeo}"]`).first()).toContainText("Serra Angel");
  await expect(page.locator(`[data-obj="${mimeo}"]`).first()).toContainText("3/3");
  expect(pageErrors(page)).toEqual([]);
});

test("Sanar, Innovative First-Year: exile Hill Giant (red) and Opt (blue) of the revealed cards, then cast Hill Giant from exile", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Sanar, Innovative First-Year"], library: ["Island", "Hill Giant", "Opt", "Grizzly Bears"] }, [], { step: "draw" });
  const [giant, opt, bears] = [one(s, "Hill Giant"), one(s, "Opt"), one(s, "Grizzly Bears")];
  const island = s.players[0]!.library[0]!;
  await open(page, s);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(asked.pending?.kind === "searchLibrary" ? [...asked.pending.cards].sort() : []).toEqual([giant, opt].sort());
  const pick = modal(page);
  await expect(pick).toContainText("Sanar, Innovative First-Year: put a card of each of those colors (blue and red; a multicolored card for one of its colors) into exile; you may cast them this turn");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.locator(`[data-pick="${opt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const exiled = await settled(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(exiled.objects[opt]!.zone).toBe("exile");
  expect([exiled.objects[island]!.zone, exiled.objects[bears]!.zone]).toEqual(["library", "library"]);
  // Cast Hill Giant from exile, paying for it.
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable", { hasText: "Hill Giant" }).click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[opt]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
