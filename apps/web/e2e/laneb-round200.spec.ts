// Lane B round B200 in the browser: Fortunate Few's choice of a nonland permanent you don't control (then the bots choose
// theirs), Livio, Oathsworn Sentinel's "its controller may exile it with an aegis counter on it" asked of you and its
// return of every card with an aegis counter, Yannik, Scavenging Sentinel's exile pick and then its counters divided
// among the targets you click, and Arcane Artisan's card exiled from your hand for a token copy.
import { expect, test } from "@playwright/test";
import { deciderOf, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

test("Fortunate Few: click Serra Angel to spare it; the bots spare theirs, the rest is destroyed", async ({ page }) => {
  const s = scene({ hand: ["Fortunate Few"], board: [...LANDS, "Sol Ring"] }, [{ board: ["Serra Angel", "Llanowar Elves"] }, { board: ["Grizzly Bears", "Gray Ogre"] }, { board: ["Hill Giant"] }]);
  const [ff, ring, angel, elves] = [one(s, "Fortunate Few"), one(s, "Sol Ring"), one(s, "Serra Angel"), one(s, "Llanowar Elves")];
  const [bears, ogre, giant] = [one(s, "Grizzly Bears"), one(s, "Gray Ogre"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Fortunate Few", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("click a nonland permanent you don't control that hasn't been chosen");
  await page.locator(`[data-obj="${angel}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ff]!.zone === "graveyard");
  // Ana spares the Sol Ring, Ben the Llanowar Elves, Cy one of Ben's two; Hill Giant is nobody's choice.
  for (const id of [angel, ring, elves]) expect(after.objects[id]!.zone).toBe("battlefield");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect([bears, ogre].filter((id) => after.objects[id]!.zone === "battlefield")).toHaveLength(1);
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0)).toHaveLength(LANDS.length + 1);
  expect(pageErrors(page)).toEqual([]);
});

test("Livio, Oathsworn Sentinel: exile your Grizzly Bears with an aegis counter, then return it", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Livio, Oathsworn Sentinel", "Grizzly Bears"] });
  const [livio, bears] = [one(s, "Livio, Oathsworn Sentinel"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${livio}"]`).first().click();
  await menu(page).getByRole("button", { name: /Choose another target creature/ }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("aegis counter");
  await bar.getByRole("button", { name: "Yes" }).click();
  const gone = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "exile");
  expect(gone.objects[bears]!.counters.aegis).toBe(1);
  await page.locator(`[data-obj="${livio}"]`).first().click();
  await menu(page).getByRole("button", { name: /Return all exiled cards with aegis counters/ }).click();
  const back = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(back.objects[bears]!.counters.aegis ?? 0).toBe(0);
  expect(back.objects[livio]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

/** Answer the partner-with search for Nikara (target yourself, then don't search) whenever it's asked. */
async function skipNikara(page: Parameters<typeof open>[0], st: GameState): Promise<boolean> {
  const p = st.pending;
  if (p?.kind === "chooseTargets" && p.player === 0 && /Nikara/.test(p.description)) {
    await clickPlayer(page, 0);
    return true;
  }
  if (p?.kind === "chooseMay" && deciderOf(st, p.player) === 0 && /Nikara/.test(p.prompt)) {
    await controls(page).getByRole("button", { name: "No" }).click();
    return true;
  }
  return false;
}

test("Yannik, Scavenging Sentinel: exile Hill Giant, then its 3 counters divided between Yannik and Grizzly Bears", async ({ page }) => {
  const s = scene({ hand: ["Yannik, Scavenging Sentinel"], board: [...LANDS, "Hill Giant", "Grizzly Bears"] });
  const [yannik, giant, bears] = [one(s, "Yannik, Scavenging Sentinel"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Yannik, Scavenging Sentinel", s).click();
  // Its triggers: the partner-with search (targeting you) and the exile.
  for (let i = 0; i < 10; i++) {
    const st = await resolveUntil(page, (x) => (x.pending?.kind === "chooseTargets" && x.pending.player === 0) || (x.pending?.kind === "pickPermanents" && x.pending.player === 0) || (x.pending?.kind === "chooseMay" && x.pending.player === 0));
    if (st.pending?.kind === "pickPermanents") break;
    if (!(await skipNikara(page, st))) throw new Error(`unexpected ${st.pending?.kind}`);
    await page.waitForTimeout(200);
  }
  const bar = controls(page);
  await expect(bar).toContainText("exile");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await bar.getByRole("button", { name: "Exile" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0 && !/Nikara/.test(st.pending.description));
  await page.locator(`[data-obj="${yannik}"]`).first().click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const panel = page.locator(".targeting", { hasText: "3" });
  const done = panel.getByRole("button", { name: "Done" });
  if (await done.count()) await done.first().click();
  const yannikRow = page.locator(".targeting .divide", { hasText: "Yannik" });
  if (await yannikRow.count()) {
    // Two on Yannik, one on the Bears.
    const now = Number(await yannikRow.locator("strong").textContent());
    for (let k = now; k < 2; k++) await yannikRow.getByRole("button", { name: "+" }).click();
    for (let k = now; k > 2; k--) await yannikRow.getByRole("button", { name: "−" }).click();
    const bearsRow = page.locator(".targeting .divide", { hasText: "Grizzly Bears" });
    const b = Number(await bearsRow.locator("strong").textContent());
    for (let k = b; k > 1; k--) await bearsRow.getByRole("button", { name: "−" }).click();
    await page.locator(".targeting").getByRole("button", { name: "Done" }).click();
  }
  let after = await state(page);
  for (let i = 0; i < 20; i++) {
    after = await resolveUntil(page, (st) => (st.stack.length === 0 && !st.pending) || (!!st.pending && deciderOf(st, st.pending.player) === 0 && st.pending.kind === "chooseMay"));
    if (!after.pending) break;
    if (!(await skipNikara(page, after))) throw new Error(`unexpected ${after.pending.kind}`);
    await page.waitForTimeout(200);
  }
  expect(after.objects[giant]!.zone).toBe("exile");
  expect([after.objects[yannik]!.counters["+1/+1"] ?? 0, after.objects[bears]!.counters["+1/+1"] ?? 0]).toEqual([2, 1]);
  expect(pageErrors(page)).toEqual([]);
});

test("Arcane Artisan: you draw, exile Hill Giant from your hand, and get a token copy of it", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant", "Lightning Bolt"], board: [...LANDS, "Arcane Artisan"] });
  const [artisan, giant] = [one(s, "Arcane Artisan"), one(s, "Hill Giant")];
  await open(page, s);
  await page.locator(`[data-obj="${artisan}"]`).first().click();
  const item = menu(page).getByRole("button", { name: /Target player draws a card/ });
  if (await item.count()) await item.click();
  await clickPlayer(page, 0);
  await resolveUntil(page, (st) => st.pending?.kind === "discard" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("exile");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await bar.getByRole("button", { name: /Exile/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  const tokens = after.battlefield.filter((id) => after.objects[id]!.isToken && after.cards[after.objects[id]!.cardId]?.name === "Hill Giant");
  expect(tokens).toHaveLength(1);
  expect(after.objects[tokens[0]!]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
