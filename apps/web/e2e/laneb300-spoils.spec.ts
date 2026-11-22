// Lane B round B300 in the browser: Share the Spoils. Cast it and the top card of each library is exiled with it; cast
// Ana's Lightning Bolt from her exile at her, paying with a Forest (mana as though of any color), which exiles your top
// card too, and then Ben's Forest is no longer playable this turn (one card a turn). With one already on the battlefield,
// play Ana's Forest from her exile as your land.
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, menu, modal, resolveUntil, seat } from "./ui";

test("Share the Spoils: cast it, then cast Ana's exiled Lightning Bolt with a Forest; Ben's Forest isn't playable after", async ({ page }) => {
  const s = scene({ hand: ["Share the Spoils"], board: ["Mountain", "Island", "Forest"], library: ["Grizzly Bears", "Hill Giant"] }, [{ library: ["Lightning Bolt"] }, { library: ["Forest"] }, { library: ["Shock"] }]);
  const [share, bolt, bears, giant, shock] = [one(s, "Share the Spoils"), one(s, "Lightning Bolt"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Shock")];
  const bensForest = s.players[2]!.library[0]!;
  const life = s.players[1]!.life;
  await open(page, s);
  await card(page, "Share the Spoils", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  const entered = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[share]!.zone === "battlefield" && st.objects[bolt]!.zone === "exile");
  for (const id of [bears, bensForest, shock]) expect(entered.objects[id]!.zone).toBe("exile");
  expect(entered.objects[giant]!.zone).toBe("library");
  // Paid with the Mountain and one more land: whichever is left pays {R} as though it were red (CR 609.4b).
  const anas = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await expect(anas.locator(".zone-title")).toHaveText("Exile ✦");
  await anas.click();
  await modal(page).locator(".card.playable", { hasText: "Lightning Bolt" }).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(life - 3);
  // "When they do, exile the top card of their library": yours.
  expect(after.objects[giant]!.zone).toBe("exile");
  // One land or one spell a turn (rulings).
  await expect(seat(page, 2).locator(".zone", { hasText: "Exile" }).locator(".zone-title")).toHaveText("Exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Share the Spoils: play Ana's Forest exiled with it as your land, and your top card is exiled with it", async ({ page }) => {
  const s = scene({ board: ["Share the Spoils"], library: ["Hill Giant"] }, [{ exile: ["Forest", "Shock"] }]);
  const [share, giant] = [one(s, "Share the Spoils"), one(s, "Hill Giant")];
  const [forest, shock] = [idsOf(s, "Forest", "exile", 1)[0]!, one(s, "Shock")];
  s.linkedExile = { ...(s.linkedExile ?? {}), [`${share}@${s.objects[share]!.zoneChanges ?? 0}`]: [forest, shock].map((id) => ({ id, zc: s.objects[id]!.zoneChanges ?? 0 })) };
  await open(page, s);
  const anas = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await anas.click();
  await modal(page).locator(".card.playable", { hasText: "Forest" }).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Play/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[forest]!.zone === "battlefield" && st.objects[giant]!.zone === "exile");
  expect(after.objects[forest]!.controller).toBe(0);
  expect(after.players[0]!.landsPlayedThisTurn).toBe(1);
  expect(after.linkedExile?.[`${share}@${after.objects[share]!.zoneChanges ?? 0}`]?.map((l) => l.id)).toContain(giant);
  expect(pageErrors(page)).toEqual([]);
});
