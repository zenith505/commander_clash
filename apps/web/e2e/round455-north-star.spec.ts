// Round 455: North Star's "{4}, {T}: For one spell this turn, you may spend mana as though it were mana of any type to pay
// that spell's mana cost." Casting a spell afterwards asks whether to use it; with it, three Mountains pay Divination's
// {2}{U}.
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("North Star: activate it, then cast Divination with three Mountains, choosing Use North Star", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: ["North Star", "Swamp", "Swamp", "Swamp", "Swamp", "Mountain", "Mountain", "Mountain"] });
  const [star, divination] = [one(s, "North Star"), one(s, "Divination")];
  await open(page, s);
  await card(page, "North Star", s).click();
  await menu(page).locator("button", { hasText: "For one spell this turn" }).click();
  const starred = await resolveUntil(page, (st) => st.objects[star]!.tapped && st.stack.length === 0 && !!st.anyTypeSpells?.length);
  expect(starred.anyTypeSpells).toEqual([expect.objectContaining({ player: 0, source: "North Star" })]);
  const hand = starred.players[0]!.hand.length;
  await card(page, "Divination", starred).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("spend mana as though it were mana of any type to pay its mana cost (North Star, for one spell this turn)");
  await bar.getByRole("button", { name: "Use North Star", exact: true }).click();
  const done = await resolveUntil(page, (st) => st.objects[divination]!.zone === "graveyard" && st.stack.length === 0);
  expect(done.players[0]!.hand.length).toBe(hand - 1 + 2);
  expect(done.anyTypeSpells).toBeUndefined();
  expect(idsOf(done, "Mountain", "battlefield", 0).every((id) => done.objects[id]!.tapped)).toBe(true);
  expect(done.log.some((l) => /^You casts? Divination, spending mana as though it were mana of any type for its mana cost \(North Star\)/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
