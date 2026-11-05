// Round 274 in the browser: Herigast, Erupting Nullkite's granted emerge (an Emerge entry in a creature card's cast
// menu, then the creature to sacrifice; its mana value comes off the spell's mana cost), Herigast's own "you may exile
// your hand. If you do, draw three cards", and Oft-Nabbed Goat's ability, which only an opponent of its controller may
// activate: you use it on Ana's Goat and take it.
import { expect, test } from "@playwright/test";
import { controllerOf } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Herigast: Hill Giant's cast menu has Emerge; sacrificing Grizzly Bears, it costs {1}{R}", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant"], board: [...LANDS, "Herigast, Erupting Nullkite", "Grizzly Bears"] });
  const [giant, bears] = [one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Hill Giant", s).click();
  await menu(page).getByRole("button", { name: /^Emerge/ }).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice" });
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and cast" }).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "battlefield" && st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  // {3}{R} less 2 for the Bears: two lands tapped.
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Herigast: as you cast it, Yes exiles your hand and you draw three cards", async ({ page }) => {
  const s = scene({ hand: ["Herigast, Erupting Nullkite", "Grizzly Bears"], board: [...LANDS, ...LANDS] });
  const [herigast, bears] = [one(s, "Herigast, Erupting Nullkite"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Herigast, Erupting Nullkite", s).click();
  // Its own emerge makes a menu: cast it for its mana cost.
  await menu(page).getByRole("button", { name: /^Cast it/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await expect(controls(page)).toContainText("Exile your hand?");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[herigast]!.zone === "battlefield");
  expect(after.objects[bears]!.zone).toBe("exile");
  expect(after.players[0]!.hand).toHaveLength(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Oft-Nabbed Goat: you activate Ana's Goat, draw a card, and take it with a -1/-1 counter", async ({ page }) => {
  const s = scene({ board: LANDS }, [{ board: ["Oft-Nabbed Goat"] }]);
  const goat = one(s, "Oft-Nabbed Goat");
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await page.locator(`[data-obj="${goat}"]`).click();
  const ability = menu(page).getByRole("button", { name: /Draw a card/ });
  await expect(ability).toBeEnabled();
  await ability.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[goat]!.counters["-1/-1"] === 1);
  expect(controllerOf(after, after.objects[goat]!)).toBe(0);
  expect(after.players[0]!.hand).toHaveLength(hand + 1);
  expect(pageErrors(page)).toEqual([]);
});
