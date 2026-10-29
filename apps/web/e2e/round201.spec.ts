// Round 201's prompt: Search for Blex's "You may put any number of them into your hand and the rest into your graveyard.
// You lose 3 life for each card you put into your hand this way." (the dig picker says what each card taken costs).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Search for Blex: take two of the top five for 6 life, the other three go to the graveyard", async ({ page }) => {
  const top = ["Hill Giant", "Grizzly Bears", "Shock", "Llanowar Elves", "Ornithopter"];
  const s = scene({ hand: ["Blex, Vexing Pest // Search for Blex"], board: LANDS, library: top });
  const [giant, bears] = [one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  const life = s.players[0]!.life;
  await open(page, s);
  await card(page, "Blex, Vexing Pest", s).click();
  await menu(page).getByRole("button", { name: /^Cast Search for Blex/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("(you lose 3 life for each)");
  await expect(pick).toContainText("You'll lose 0 life.");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.locator(`[data-pick="${bears}"]`).click();
  await expect(pick).toContainText("You'll lose 6 life.");
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "hand");
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(["Shock", "Llanowar Elves", "Ornithopter"].map((n) => after.objects[one(s, n)]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
  expect(after.players[0]!.life).toBe(life - 6);
  expect(pageErrors(page)).toEqual([]);
});
