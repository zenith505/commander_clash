// Round 92's prompts: Gemstone Caverns in your opening hand (begin the game with it, then exile a card from your hand),
// Bolas's Citadel's "pay life" cast from the top of your library, and Cloud Key's card type chosen as it enters.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Gemstone Caverns: not the starting player, begin with it and exile a card from your hand", async ({ page }) => {
  // With this seed another player starts the game.
  const s = scene({ hand: ["Gemstone Caverns", "Grizzly Bears"] }, [], { mulligans: true });
  expect(s.activePlayer).not.toBe(0);
  const [caverns, bears] = [one(s, "Gemstone Caverns"), one(s, "Grizzly Bears")];
  await open(page, s);
  await controls(page).getByRole("button", { name: "Keep" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Opening hand: you may put these cards from your hand onto the battlefield");
  await pick.locator(`[data-pick="${caverns}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await expect(pick).toContainText("Gemstone Caverns: exile a card from your hand");
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await expect.poll(async () => (await state(page)).objects[bears]!.zone).toBe("exile");
  const after = await state(page);
  expect(after.objects[caverns]!.zone).toBe("battlefield");
  expect(after.objects[caverns]!.counters.luck).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Bolas's Citadel: click the top card of your library and cast it for life", async ({ page }) => {
  const s = scene({ board: ["Bolas's Citadel"], library: ["Grizzly Bears"] });
  const bears = idsOf(s, "Grizzly Bears", "library")[0]!;
  await open(page, s);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await menu(page).getByRole("button", { name: /pay 2 life/ }).click();
  const after = await resolveUntil(page, (st) => st.objects[bears]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.players[0]!.life).toBe(38);
  expect(pageErrors(page)).toEqual([]);
});

test("Cloud Key: choose a card type as it enters", async ({ page }) => {
  const s = scene({ hand: ["Cloud Key"], board: LANDS });
  const key = one(s, "Cloud Key");
  await open(page, s);
  await card(page, "Cloud Key", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cardType");
  const bar = controls(page);
  await expect(bar).toContainText("Cloud Key: choose a card type");
  await expect(bar.getByRole("button")).toHaveText(["Artifact", "Creature", "Enchantment", "Instant", "Sorcery"]);
  await bar.getByRole("button", { name: "Instant" }).click();
  await expect.poll(async () => (await state(page)).objects[key]!.chosen?.cardType).toBe("Instant");
  expect(pageErrors(page)).toEqual([]);
});
