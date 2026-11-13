// Lane B round B195 in the browser: Discover the Impossible (exile one of the top five face down, then cast it free if it's
// an instant spell with mana value 2 or less, or it goes to your hand).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

const TOP = ["Lightning Bolt", "Divination", "Hill Giant", "Sol Ring", "Grizzly Bears"];

async function exileOne(page: import("@playwright/test").Page, pickName: string) {
  const s = scene({ hand: ["Discover the Impossible"], board: LANDS, library: TOP });
  const ids = TOP.map((n) => one(s, n));
  await open(page, s);
  await card(page, "Discover the Impossible", s).click();
  const cast = menu(page).locator("button", { hasText: /^Cast/ });
  if (await cast.count()) await cast.first().click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(asked.pending?.kind === "searchLibrary" ? [...asked.pending.cards].sort() : []).toEqual([...ids].sort());
  const pick = modal(page);
  await pick.locator(`[data-pick="${one(s, pickName)}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  return { s, ids };
}

test("Discover the Impossible: exile Lightning Bolt face down and cast it free at Ana", async ({ page }) => {
  const { ids } = await exileOne(page, "Lightning Bolt");
  const offer = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  expect(offer.pending?.kind === "castFree" && offer.pending.how).toBe("orHand");
  expect(offer.objects[ids[0]!]!.zone).toBe("exile");
  // The four others went to the bottom of your library.
  expect([...offer.players[0]!.library.slice(-4)].sort()).toEqual([...ids.slice(1)].sort());
  const life = offer.players[1]!.life;
  const bar = controls(page);
  await expect(bar).toContainText("If you don't, it goes to your hand.");
  await bar.getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === life - 3);
  expect(after.objects[ids[0]!]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Discover the Impossible: decline the free cast and the exiled card goes to your hand", async ({ page }) => {
  const { ids } = await exileOne(page, "Lightning Bolt");
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Don't" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ids[0]!]!.zone === "hand");
  expect(after.players[0]!.hand).toContain(ids[0]);
  expect(pageErrors(page)).toEqual([]);
});

test("Discover the Impossible: a sorcery can't be cast this way, so Divination goes straight to your hand", async ({ page }) => {
  const { ids } = await exileOne(page, "Divination");
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ids[1]!]!.zone === "hand");
  expect(after.players[0]!.hand).toContain(ids[1]);
  expect(pageErrors(page)).toEqual([]);
});
