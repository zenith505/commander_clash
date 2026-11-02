// Round 244 in the browser: Primal Prayers' "You may cast creature spells with mana value 3 or less by paying {E} rather
// than paying their mana costs. If you cast a spell this way, you may cast it as though it had flash." (the card menu's
// "Cast it: pay 1 energy" button, offered with a spell on the stack, where the mana cost can't be paid at that speed).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Primal Prayers: with Hill Giant on the stack, Grizzly Bears is cast for one energy as though it had flash", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant", "Grizzly Bears"], board: [...LANDS, "Primal Prayers"] });
  s.players[0]!.energy = 2;
  const [giant, bears] = [one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Hill Giant", s).click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  await card(page, "Grizzly Bears", s).click();
  const cast = menu(page).getByRole("button", { name: "Cast it: pay 1 energy" });
  await expect(cast).toBeEnabled();
  await cast.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield" && st.objects[giant]!.zone === "battlefield");
  expect(after.players[0]!.energy).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
