// Lane B round B244 in the browser: Domri, Chaos Bringer's +1 (the color chosen as it resolves, then a creature spell paid
// with that mana enters with riot's choice) and Nihilith's question while it's suspended, for each card put into an
// opponent's graveyard.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

test("Domri, Chaos Bringer: +1 for {G}, then Llanowar Elves paid with it enters with haste (riot)", async ({ page }) => {
  const s = scene({ hand: ["Llanowar Elves"], board: ["Domri, Chaos Bringer"] });
  const [domri, elves] = [one(s, "Domri, Chaos Bringer"), one(s, "Llanowar Elves")];
  s.objects[domri]!.counters.loyalty = 5;
  await open(page, s);
  await page.locator(`[data-obj="${domri}"]`).click();
  await menu(page).locator("button", { hasText: "If that mana is spent on a creature spell" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "either");
  await controls(page).getByRole("button", { name: "Add {G}" }).click();
  const mid = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.manaPool.G === 1);
  expect(mid.objects[domri]!.counters.loyalty).toBe(6);
  await card(page, "Llanowar Elves", mid).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "riot");
  await expect(controls(page)).toContainText("(riot): enter with a +1/+1 counter, or with haste?");
  await controls(page).getByRole("button", { name: "Haste" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[elves]!.zone === "battlefield");
  expect(after.objects[elves]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(after.effects.some((e) => e.affected.includes(elves) && e.mods.some((m) => m.kind === "addKeywords" && m.keywords.includes("Haste")))).toBe(true);
  expect(after.log.some((l) => /enters with haste \(riot\)/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Nihilith: suspended, Mind Rot makes Ana discard two; yes once, no once: one time counter off", async ({ page }) => {
  const s = scene({ hand: ["Mind Rot"], board: ["Swamp", "Swamp", "Swamp"], exile: ["Nihilith"] }, [{ hand: ["Grizzly Bears", "Hill Giant"] }]);
  const nih = one(s, "Nihilith");
  s.objects[nih]!.counters.time = 7;
  await open(page, s);
  await card(page, "Mind Rot", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const mid = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && st.objects[nih]!.counters.time === 6);
  expect(mid.players[1]!.graveyard).toHaveLength(2);
  await controls(page).getByRole("button", { name: "No" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[nih]!.counters.time).toBe(6);
  expect(after.objects[nih]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
