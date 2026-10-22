// Round 116's prompt: Lim-Dûl's Vault, which shows the top five cards of your library and asks whether to pay 1 life to
// put them on the bottom (in any order) and look at the next five, or keep these and order them on top.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, resolveUntil } from "./ui";

test("Lim-Dûl's Vault: pay 1 life to send the first five to the bottom, then keep the next five on top", async ({ page }) => {
  const first = ["Grizzly Bears", "Hill Giant", "Llanowar Elves", "Shock", "Giant Growth"];
  const second = ["Lightning Bolt", "Counterspell", "Wind Drake", "Doom Blade", "Serra Angel"];
  const s = scene({ hand: ["Lim-Dûl's Vault"], board: LANDS, library: [...first, ...second] });
  const ids1 = first.map((n) => one(s, n));
  const ids2 = second.map((n) => one(s, n));
  const life = s.players[0]!.life;
  await open(page, s);
  await card(page, "Lim-Dûl's Vault", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const vault = page.locator(".modal.vault-look");
  await expect(vault).toContainText("Lim-Dûl's Vault: the top 5 cards of your library");
  const shown = () => vault.locator("[data-vault]").evaluateAll((els) => els.map((e) => e.getAttribute("data-vault")));
  expect(await shown()).toEqual(ids1);
  await vault.getByRole("button", { name: "Pay 1 life: bottom, look again" }).click();
  // The five go to the bottom in an order you choose.
  const arrange = page.locator(".modal.arrange:not(.vault-look)");
  await expect(arrange).toContainText("on the bottom of your library");
  await arrange.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && st.players[0]!.life === life - 1);
  await expect.poll(shown).toEqual(ids2);
  await vault.getByRole("button", { name: "Keep these on top" }).click();
  // Then the library is shuffled and these five go back on top, in an order you choose.
  await expect(arrange).toContainText("Lim-Dûl's Vault");
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[one(s, "Lim-Dûl's Vault")]!.zone === "graveyard");
  expect(after.players[0]!.life).toBe(life - 1);
  expect([...after.players[0]!.library.slice(0, 5)].sort()).toEqual([...ids2].sort());
  expect(pageErrors(page)).toEqual([]);
});
