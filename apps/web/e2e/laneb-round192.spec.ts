// Lane B round B192 in the browser: Colfenor's Plans (cast a creature from among the cards it exiled face down, which you
// may look at) and Hedonist's Trove (cast a creature from among the cards it exiled from an opponent's graveyard, then no
// second spell that turn).
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { menu, modal, resolveUntil, seat } from "./ui";

test("Colfenor's Plans: cast the face-down Grizzly Bears from among the cards it exiled", async ({ page }) => {
  const s = scene({ board: ["Colfenor's Plans", "Forest", "Mountain"], exile: ["Grizzly Bears"] });
  const [plans, bears] = [one(s, "Colfenor's Plans"), one(s, "Grizzly Bears")];
  s.objects[bears]!.hiddenExile = { by: plans, seen: [0], label: "Face down" };
  s.linkedExile = { [`${plans}@0`]: [{ id: bears, zc: s.objects[bears]!.zoneChanges ?? 0 }] };
  await open(page, s);
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Hedonist's Trove: cast Ana's Grizzly Bears from among the cards it exiled; her Hill Giant can't be cast too that turn", async ({ page }) => {
  const s = scene({ board: ["Hedonist's Trove", "Forest", "Forest", "Mountain", "Mountain", "Mountain", "Mountain"] }, [{ exile: ["Grizzly Bears", "Hill Giant"] }]);
  const [trove, bears, giant] = [one(s, "Hedonist's Trove"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.linkedExile = { [`${trove}@0`]: [bears, giant].map((id) => ({ id, zc: s.objects[id]!.zoneChanges ?? 0 })) };
  await open(page, s);
  await seat(page, 1).locator(".zone", { hasText: "Exile" }).click();
  await expect(modal(page).locator(".card.playable")).toHaveCount(2);
  await modal(page).locator(".card.playable", { hasText: "Grizzly Bears" }).click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(after.turnLog?.linkedSpellOnce).toEqual([`${trove}@0`]);
  await seat(page, 1).locator(".zone", { hasText: "Exile" }).click();
  await expect(modal(page).locator(".card.playable")).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});
