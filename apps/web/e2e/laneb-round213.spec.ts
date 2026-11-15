// Lane B round B213 in the browser: Battletide Alchemist's "prevent X of that damage?" question (you prevent Ana's
// Lightning Bolt to you, and let your own Bolt hit Ana), Light Up the Night cast with its flashback (X chosen, at
// least 1, and X loyalty counters removed from your planeswalker), and Kodama of the Center Tree's soulshift X when it
// dies, X the Spirits you controlled.
import { expect, test } from "@playwright/test";
import { applyAction, planCast } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Battletide Alchemist: Ana's Lightning Bolt would deal 3 damage to you, and you prevent 1 of it", async ({ page }) => {
  const s0 = scene({ board: ["Battletide Alchemist"] }, [{ hand: ["Lightning Bolt"], board: ["Mountain"] }]);
  const bolt = one(s0, "Lightning Bolt");
  let s = s0;
  s.priority = 1;
  for (const a of planCast(s, 1, bolt, [{ kind: "player", id: 0 }])!) s = applyAction(s, a);
  const life = s.players[0]!.life;
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "damageShield" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Battletide Alchemist: Lightning Bolt would deal 3 damage to you. Prevent 1 of that damage?");
  await expect(bar.getByRole("button", { name: "Don't prevent it" })).toBeVisible();
  await bar.getByRole("button", { name: "Prevent 1 of it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect(after.players[0]!.life).toBe(life - 2);
  expect(pageErrors(page)).toEqual([]);
});

test("Battletide Alchemist: your Lightning Bolt at Ana, and you don't prevent any of it", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: ["Mountain", "Battletide Alchemist"] });
  const bolt = one(s, "Lightning Bolt");
  const life = s.players[1]!.life;
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  const cast = menu(page).locator("button", { hasText: /^Cast/ });
  if (await cast.count()) await cast.first().click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "damageShield" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Battletide Alchemist: Lightning Bolt would deal 3 damage to Ana. Prevent 1 of that damage?");
  await bar.getByRole("button", { name: "Don't prevent it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(life - 3);
  expect(pageErrors(page)).toEqual([]);
});

test("Light Up the Night: flashback for {3}{R}, X = 2 with 2 loyalty counters from Liliana of the Veil, 3 damage to Ana's Gray Ogre", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Liliana of the Veil"], yard: ["Light Up the Night"] }, [{ board: ["Gray Ogre"] }]);
  const [light, liliana, ogre] = [one(s, "Light Up the Night"), one(s, "Liliana of the Veil"), one(s, "Gray Ogre")];
  s.objects[liliana]!.counters.loyalty = 4;
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Light Up the Night" }).click();
  await menu(page).getByRole("button", { name: /^Flashback/ }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("remove X loyalty counters from among planeswalkers you control");
  // "If you cast this spell this way, X can't be 0."
  await expect(x.getByLabel("X", { exact: true })).toHaveAttribute("min", "1");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await page.locator(`[data-obj="${ogre}"]`).click();
  const pick = page.locator(".counter-pick");
  await expect(pick).toContainText("0 of 2 chosen");
  await pick.locator(`[data-counter="${liliana}:loyalty"]`).getByRole("button", { name: "+" }).click();
  await pick.locator(`[data-counter="${liliana}:loyalty"]`).getByRole("button", { name: "+" }).click();
  await expect(pick).toContainText("2 of 2 chosen");
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[light]!.zone === "exile");
  // 2 plus 1 to a creature: Gray Ogre (2/2) dies.
  expect(after.objects[ogre]!.zone).toBe("graveyard");
  expect(after.objects[liliana]!.counters.loyalty).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Kodama of the Center Tree: Ana's Doom Blade kills it with a Kami of Ancient Law beside it; soulshift 2 returns the other Kami", async ({ page }) => {
  const s0 = scene({ board: ["Kodama of the Center Tree", "Kami of Ancient Law"], yard: ["Kami of Ancient Law"] }, [{ hand: ["Doom Blade"], board: ["Swamp", "Swamp"] }]);
  const [blade, kodama] = [one(s0, "Doom Blade"), one(s0, "Kodama of the Center Tree")];
  const yardKami = idsOf(s0, "Kami of Ancient Law", "graveyard", 0)[0]!;
  let s = s0;
  s.priority = 1;
  for (const a of planCast(s, 1, blade, [{ kind: "object", id: kodama }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.objects[kodama]!.zone === "graveyard" && !!st.pending && st.pending.player === 0);
  await open(page, s);
  await page.locator(`[data-pick="${yardKami}"], [data-obj="${yardKami}"]`).first().click();
  const done = modal(page).getByRole("button", { name: "Done" });
  if (await done.count()) await done.click();
  const after = await resolveUntil(page, (st) => st.objects[yardKami]!.zone === "hand" || st.pending?.kind === "chooseMay");
  if (after.pending?.kind === "chooseMay") await controls(page).getByRole("button", { name: "Yes" }).click();
  const end = await resolveUntil(page, (st) => st.objects[yardKami]!.zone === "hand" && st.stack.length === 0);
  expect(end.objects[kodama]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
