// Lane B round B271 in the browser: Ian Malcolm, Chaotician (you cast Ana's Lightning Bolt from among the cards exiled
// with Ian, paying with Forests), Araumi of the Dead Tide (target Hill Giant in your graveyard, exile three other cards
// for your three opponents, then encore it from the graveyard's menu) and Haldan, Avid Arcanist (cast Ana's Lightning
// Bolt you exiled with a fetch counter, paying with Islands, and play her Forest as your land).
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, menu, modal, resolveUntil, seat } from "./ui";

test("Ian Malcolm, Chaotician: cast Ana's Lightning Bolt exiled with Ian at her, paying with a Forest", async ({ page }) => {
  const s = scene({ board: ["Ian Malcolm, Chaotician", "Forest"] }, [{ exile: ["Lightning Bolt"] }]);
  const [ian, bolt] = [one(s, "Ian Malcolm, Chaotician"), one(s, "Lightning Bolt")];
  s.linkedExile = { ...(s.linkedExile ?? {}), [`${ian}@${s.objects[ian]!.zoneChanges ?? 0}`]: [{ id: bolt, zc: s.objects[bolt]!.zoneChanges ?? 0 }] };
  const life = s.players[1]!.life;
  await open(page, s);
  const theirs = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await expect(theirs.locator(".zone-title")).toHaveText("Exile ✦");
  await theirs.click();
  await modal(page).locator(".card.playable", { hasText: "Lightning Bolt" }).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(life - 3);
  expect(after.players[1]!.graveyard).toContain(bolt);
  expect(pageErrors(page)).toEqual([]);
});

test("Araumi of the Dead Tide: target Hill Giant in your graveyard, exile three cards for three opponents, then encore it", async ({ page }) => {
  const s = scene({ board: ["Araumi of the Dead Tide", "Mountain", "Mountain", "Mountain", "Mountain"], yard: ["Hill Giant", "Shock", "Divination", "Lightning Bolt", "Grizzly Bears"] });
  const [araumi, giant, bears] = [one(s, "Araumi of the Dead Tide"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  const fodder = ["Shock", "Divination", "Lightning Bolt"].map((n) => one(s, n));
  await open(page, s);
  await card(page, "Araumi of the Dead Tide", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /Exile cards from your graveyard/ }).click();
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("Araumi of the Dead Tide: exile from your graveyard 3 cards");
  for (const id of fodder) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const granted = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.yardKeywordGrants?.length);
  for (const id of fodder) expect(granted.objects[id]!.zone).toBe("exile");
  expect(granted.objects[bears]!.zone).toBe("graveyard");
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Hill Giant" }).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Encore/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  // A token copy for each opponent (CR 702.141a).
  expect(idsOf(after, "Hill Giant", "battlefield").filter((id) => after.objects[id]!.isToken)).toHaveLength(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Haldan, Avid Arcanist: cast Ana's Lightning Bolt you exiled with a fetch counter paying with an Island, then play her Forest", async ({ page }) => {
  const s = scene({ board: ["Haldan, Avid Arcanist", "Island"] }, [{ exile: ["Lightning Bolt", "Forest"] }]);
  const [bolt, forest] = [one(s, "Lightning Bolt"), idsOf(s, "Forest", "exile", 1)[0]!];
  for (const id of [bolt, forest]) {
    s.objects[id]!.counters = { fetch: 1 };
    s.objects[id]!.exiledByPlayer = 0;
  }
  const life = s.players[1]!.life;
  await open(page, s);
  const theirs = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await theirs.click();
  await modal(page).locator(".card.playable", { hasText: "Lightning Bolt" }).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await clickPlayer(page, 1);
  const cast = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect(cast.players[1]!.life).toBe(life - 3);
  await theirs.click();
  await modal(page).locator(".card.playable", { hasText: "Forest" }).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Play/ }).first().click();
  const after = await resolveUntil(page, (st) => st.objects[forest]!.zone === "battlefield");
  expect(after.objects[forest]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
