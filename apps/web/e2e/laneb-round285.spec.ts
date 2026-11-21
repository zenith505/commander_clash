// Lane B round B285 in the browser: Ice Cauldron (X = 1, pick Lightning Bolt from your hand to exile; a charge counter and
// the mana spent noted), then, charged with {R}, Lightning Bolt cast from exile with the Cauldron's mana.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { clickPlayer, menu, modal, resolveUntil, seat } from "./ui";

/** The state once `done` holds (polled), kept: no second read after it. */
async function settled(page: Parameters<typeof state>[0], done: (s: GameState) => boolean): Promise<GameState> {
  let s: GameState | undefined;
  await expect.poll(async () => done((s = await state(page)))).toBe(true);
  return s!;
}

test("Ice Cauldron: X = 1, pick Lightning Bolt to exile; a charge counter and the mana noted", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt", "Grizzly Bears"], board: [...LANDS, "Ice Cauldron"] });
  const [cauldron, bolt, bears] = [one(s, "Ice Cauldron"), one(s, "Lightning Bolt"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${cauldron}"]`).first().click();
  if (await menu(page).count()) await menu(page).locator("button", { hasText: "You may exile a nonland card from your hand" }).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("1");
  await x.getByRole("button", { name: "X = 1" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const charged = await settled(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bolt]!.zone === "exile");
  expect(charged.objects[cauldron]!.counters.charge).toBe(1);
  expect(charged.objects[cauldron]!.notedManaAll).toHaveLength(1);
  expect(charged.objects[bears]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Ice Cauldron: charged with {R} for Lightning Bolt, cast Bolt from exile; the Cauldron pays it", async ({ page }) => {
  const s = scene({ board: ["Ice Cauldron"], exile: ["Lightning Bolt"] });
  const [cauldron, bolt] = [one(s, "Ice Cauldron"), one(s, "Lightning Bolt")];
  // As its first ability left it on an earlier turn: a charge counter, {R} noted, Bolt exiled with it and castable.
  const c = s.objects[cauldron]!;
  const b = s.objects[bolt]!;
  c.counters.charge = 1;
  c.notedManaAll = ["R"];
  c.cauldronCard = { id: bolt, zc: b.zoneChanges ?? 0, name: "Lightning Bolt" };
  b.mayPlay = { player: 0, zc: b.zoneChanges ?? 0, until: "exiled", turn: s.turn - 1, castOnly: true };
  invalidateCharacteristics(s);
  const life = s.players[1]!.life;
  await open(page, s);
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable").click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await clickPlayer(page, 1);
  const after = await settled(page, (st) => !st.pending && st.stack.length === 0 && st.players[1]!.life === life - 3);
  expect(after.objects[cauldron]!.tapped).toBe(true);
  expect(after.objects[cauldron]!.counters.charge ?? 0).toBe(0);
  expect(after.objects[bolt]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
