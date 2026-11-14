// Round 362: Open the Omenpaths's "two mana of any one color and two mana of any other color", picked with the color bar
// twice, the second time without the first color; Monstrous Emergence's "choose a creature you control or reveal a
// creature card from your hand", picked from your hand and battlefield as it's cast; and Reverse the Sands's
// redistribution of life totals, one button for each way they can be handed around.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Open the Omenpaths: White, then Blue (White isn't offered again): two of each, for creature or enchantment spells", async ({ page }) => {
  const s = scene({ hand: ["Open the Omenpaths"], board: LANDS });
  await open(page, s);
  await card(page, "Open the Omenpaths", s).click();
  const modes = page.locator(".mode-menu");
  await modes.getByRole("button", { name: /Add two mana of any one color and two mana of any other color/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "color" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "White" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "color" && st.pending.player === 0 && !st.pending.options.includes("White"));
  await expect(bar).toContainText("choose a color other than white");
  await expect(bar.getByRole("button", { name: "White" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Blue" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.players[0]!.manaPool.U === 2);
  expect(after.players[0]!.manaPool).toMatchObject({ W: 2, U: 2 });
  expect(after.players[0]!.manaLots?.every((l) => l.only?.text === "Spend this mana only to cast creature or enchantment spells.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Monstrous Emergence: choose your Serra Angel for its cost, then 4 damage to Ana's Hill Giant", async ({ page }) => {
  const s = scene({ hand: ["Monstrous Emergence", "Gray Ogre"], board: [...LANDS, "Serra Angel"] }, [{ board: ["Hill Giant"] }]);
  const [angel, ogre, giant] = [one(s, "Serra Angel"), one(s, "Gray Ogre"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Monstrous Emergence", s).click();
  // The target first (CR 601.2c), then the cost is paid (601.2h).
  await page.locator(`[data-obj="${giant}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("Monstrous Emergence: behold a creature");
  // A creature you control or a creature card in your hand; not Ana's creature.
  await expect(pick.locator(`[data-pick="${angel}"]`)).toHaveCount(1);
  await expect(pick.locator(`[data-pick="${ogre}"]`)).toHaveCount(1);
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${angel}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.objects[angel]!.zone).toBe("battlefield");
  expect(after.objects[angel]!.tapped).toBe(false);
  expect(after.objects[ogre]!.zone).toBe("hand");
  expect(after.log.some((l) => /beholds Serra Angel/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Reverse the Sands: take Ana's 40 and give her your 10, the others keep theirs", async ({ page }) => {
  const s = scene({ hand: ["Reverse the Sands"], board: LANDS, life: 10 }, [{ life: 40 }, { life: 25 }, { life: 18 }]);
  await open(page, s);
  await card(page, "Reverse the Sands", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "redistribute" && st.pending.player === 0);
  // Every way to hand four different totals around, leaving them as they are first.
  expect(asked.pending?.kind === "chooseOption" && asked.pending.options.length).toBe(24);
  const bar = controls(page);
  await expect(bar).toContainText("redistribute life totals");
  await expect(bar.getByRole("button", { name: "Leave the life totals as they are" })).toBeVisible();
  await bar.getByRole("button", { name: "You 10 → 40, Ana 40 → 10", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.players[0]!.life === 40);
  expect([0, 1, 2, 3].map((p) => after.players[p]!.life)).toEqual([40, 10, 25, 18]);
  expect(pageErrors(page)).toEqual([]);
});
