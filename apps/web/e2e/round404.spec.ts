// Round 404 in the browser: Ranar the Ever-Watchful's first foretelling of the turn for {0} (and a Spirit token for it),
// and Eriette, the Beguiler taking Ana's Grizzly Bears while your Pacifism is attached to it.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Ranar: foretell Doomskar for {0}, a 1/1 Spirit is made; the second foretelling this turn costs {2}", async ({ page }) => {
  const s = scene({ hand: ["Doomskar", "Doomskar"], board: [...LANDS, "Ranar the Ever-Watchful"] });
  const [first, second] = idsOf(s, "Doomskar", "hand", 0);
  const untapped = s.battlefield.filter((id) => !s.objects[id]!.tapped).length;
  await open(page, s);
  await card(page, "Doomskar", s).click();
  const foretell = menu(page).getByRole("button", { name: /^Foretell/ });
  await expect(foretell).toBeEnabled();
  await expect(foretell.locator("[title='{0}']")).toHaveCount(1);
  await foretell.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[first!]!.zone === "exile" && st.battlefield.some((id) => st.objects[id]!.isToken));
  expect(after.objects[first!]!.foretold).toBe(true);
  expect(after.battlefield.filter((id) => after.objects[id]!.isToken && after.objects[id]!.controller === 0)).toHaveLength(1);
  expect(after.battlefield.filter((id) => !after.objects[id]!.isToken && !after.objects[id]!.tapped)).toHaveLength(untapped);
  // The other Doomskar now costs the usual {2}.
  await page.locator(`[data-obj="${second}"]`).first().click();
  await expect(menu(page).getByRole("button", { name: /^Foretell/ }).locator("[title='{2}']")).toHaveCount(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Eriette: cast Pacifism on Ana's Grizzly Bears; you control the Bears while Pacifism is attached to it", async ({ page }) => {
  const s = scene({ hand: ["Pacifism"], board: [...LANDS, "Eriette, the Beguiler"] }, [{ board: ["Grizzly Bears"] }]);
  const [pacifism, bears] = [one(s, "Pacifism"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Pacifism", s).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[pacifism]!.attachedTo === bears && st.effects.some((e) => e.whileAttached?.id === pacifism));
  expect(after.effects.find((e) => e.whileAttached?.id === pacifism)).toMatchObject({ controller: 0, affected: [bears], whileAttached: { host: bears } });
  expect(after.log.some((l) => /for as long as Pacifism is attached to it/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
