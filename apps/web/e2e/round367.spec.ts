// Round 367: Herald of Leshrac's cumulative upkeep (pay or not, then which of Ana's lands to take); Vault 101: Birthday
// Party's chapter II (an Aura or Equipment card from your hand or graveyard, then the creature the Equipment goes on);
// Pyromancer Ascension's copy; and Mana Web tapping your other lands.
import { expect, test } from "@playwright/test";
import { characteristics } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

test("Herald of Leshrac: pay its cumulative upkeep by choosing Ana's Ancient Tomb; it gets +1/+1", async ({ page }) => {
  const s0 = scene({ board: ["Herald of Leshrac"] }, [{ board: ["Wastes", "Ancient Tomb"] }]);
  const [herald, tomb, wastes] = [one(s0, "Herald of Leshrac"), one(s0, "Ancient Tomb"), one(s0, "Wastes")];
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("cumulative upkeep");
  await bar.getByRole("button", { name: "Yes" }).click();
  const pick = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  expect([...(pick.pending as { options: string[] }).options].sort()).toEqual([tomb, wastes].sort());
  await page.locator(`[data-obj="${tomb}"]`).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.effects.some((e) => e.affected.includes(tomb)));
  expect(after.objects[herald]!.zone).toBe("battlefield");
  expect(after.objects[herald]!.counters.age).toBe(1);
  const ch = characteristics(after, after.objects[herald]!);
  expect([ch.power, ch.toughness]).toEqual([3, 5]);
  expect(after.effects.find((e) => e.affected.includes(tomb))!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Vault 101: Birthday Party II: put Bonesplitter from your graveyard onto the battlefield and attach it to Gray Ogre", async ({ page }) => {
  const s0 = scene({ board: ["Vault 101: Birthday Party", "Gray Ogre", "Hill Giant"], hand: ["Holy Strength"], yard: ["Bonesplitter"] });
  const [saga, ogre, split, holy] = [one(s0, "Vault 101: Birthday Party"), one(s0, "Gray Ogre"), one(s0, "Bonesplitter"), one(s0, "Holy Strength")];
  s0.objects[saga]!.counters.lore = 1;
  // Your next turn: the lore counter after your draw step makes chapter II trigger.
  const s = playUntil(s0, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  await open(page, s);
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${holy}"]`)).toBeVisible();
  await pick.locator(`[data-pick="${split}"]`).click();
  await pick.getByRole("button", { name: /^(Done|Put)/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("attach Bonesplitter");
  await bar.getByRole("button", { name: "Gray Ogre", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[split]!.attachedTo === ogre && !st.pending && st.stack.length === 0);
  expect(after.objects[holy]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Pyromancer Ascension: with two quest counters, cast Shock at Ana and copy it", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Pyromancer Ascension"], hand: ["Shock"] });
  const asc = one(s, "Pyromancer Ascension");
  s.objects[asc]!.counters.quest = 2;
  await open(page, s);
  await card(page, "Shock", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  // The copy may get new targets: keep Ana.
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.pending.player === 0);
  await page.locator(".targeting").getByRole("button", { name: /^Keep target/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life <= 36);
  expect(after.players[1]!.life).toBe(36);
  expect(pageErrors(page)).toEqual([]);
});

test("Mana Web: Ana's Mana Web taps your Breeding Pool when you tap your Forest for mana, not your Island", async ({ page }) => {
  const s = scene({ board: ["Forest", "Breeding Pool", "Island"] }, [{ board: ["Mana Web"] }]);
  // Basic lands are in the library too: these are the ones on your battlefield.
  const [forest, island] = [idsOf(s, "Forest", "battlefield", 0)[0]!, idsOf(s, "Island", "battlefield", 0)[0]!];
  const pool = one(s, "Breeding Pool");
  await open(page, s);
  await page.locator(`[data-obj="${forest}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[pool]!.tapped);
  expect(after.objects[forest]!.tapped).toBe(true);
  expect(after.objects[island]!.tapped).toBe(false);
  expect(after.log.some((l) => /Mana Web taps Breeding Pool/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
