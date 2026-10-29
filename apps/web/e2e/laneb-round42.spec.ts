// Lane B round 42 in the browser: the Dragons of Tarkir "you may reveal a Dragon card from your hand" offer (Draconic
// Roar), skipped when you already control a Dragon (rulings: revealing one then adds nothing), and "you may pay {1}{G}
// any number of times" (Taste of Paradise).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("Draconic Roar: reveal Shivan Dragon from your hand, and Ana's Hill Giant's controller is dealt 3 damage too", async ({ page }) => {
  const s = scene({ hand: ["Draconic Roar", "Shivan Dragon"], board: LANDS }, [{ board: ["Hill Giant"] }]);
  const [dragon, giant] = [one(s, "Shivan Dragon"), one(s, "Hill Giant")];
  const life = s.players[1]!.life;
  await open(page, s);
  await card(page, "Draconic Roar", s).click();
  await page.locator(".targeting", { hasText: "as an additional cost, you may reveal a Dragon card from your hand" }).getByRole("button", { name: "Reveal a Dragon card from your hand" }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("Draconic Roar");
  await pick.locator(`[data-pick="${dragon}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(life - 3);
  expect(after.objects[dragon]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Draconic Roar: with Shivan Dragon on your battlefield there's no reveal offer, and the bonus damage still happens", async ({ page }) => {
  const s = scene({ hand: ["Draconic Roar"], board: [...LANDS, "Shivan Dragon"] }, [{ board: ["Hill Giant"] }]);
  const giant = one(s, "Hill Giant");
  const life = s.players[1]!.life;
  await open(page, s);
  await card(page, "Draconic Roar", s).click();
  await expect(page.locator(".targeting", { hasText: "reveal a Dragon card" })).toHaveCount(0);
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(life - 3);
  expect(pageErrors(page)).toEqual([]);
});

test("Taste of Paradise: pay {1}{G} twice more and gain 9 life", async ({ page }) => {
  const s = scene({ hand: ["Taste of Paradise"], board: LANDS });
  const life = s.players[0]!.life;
  await open(page, s);
  await card(page, "Taste of Paradise", s).click();
  const bar = page.locator(".targeting", { hasText: "how many times?" });
  await bar.getByRole("button", { name: "Kick one more time" }).click();
  await bar.getByRole("button", { name: "Kick one more time" }).click();
  await bar.getByRole("button", { name: "Pay 2 times" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.life > life);
  expect(after.players[0]!.life).toBe(life + 9);
  expect(pageErrors(page)).toEqual([]);
});
