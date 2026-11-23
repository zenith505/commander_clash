// Lane B round B301: Codie, Ravenous Codex's "Whenever you cast a prepared spell, copy it. You may choose new targets for the
// copy." Adventurous Eater enters prepared; its Have a Bite copy is cast from exile at the Eater, and Codie's copy targets
// Grizzly Bears instead.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil, seat } from "./ui";

test("Codie, Ravenous Codex: Have a Bite cast from a prepared Eater's copy is copied, the copy at Grizzly Bears", async ({ page }) => {
  const s = scene({ hand: ["Adventurous Eater // Have a Bite"], board: [...LANDS, "Codie, Ravenous Codex", "Grizzly Bears"] });
  const [eater, bears] = [one(s, "Adventurous Eater"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Adventurous Eater", s).click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Cast it/ }).click();
  // Cast from the hand, the Eater is a creature spell, not a prepared spell (CR 722.4): Codie doesn't trigger.
  const entered = await resolveUntil(page, (st) => st.objects[eater]!.zone === "battlefield" && st.stack.length === 0 && st.triggerQueue.length === 0 && !st.pending);
  expect(entered.objects[eater]!.prepared).toBeTruthy();
  expect(entered.log.some((l) => /^Codie, Ravenous Codex's ability triggers/.test(l.text))).toBe(false);
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable").click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await page.locator(`[data-obj="${eater}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[eater]!.counters?.["+1/+1"] ?? 0) === 1);
  expect(after.objects[bears]!.counters?.["+1/+1"]).toBe(1);
  expect(after.players[0]!.life).toBe(42);
  expect(pageErrors(page)).toEqual([]);
});
