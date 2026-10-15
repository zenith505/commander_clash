// "Each player may discard their hand and draw five cards" (Will of the Jeskai): you're asked first, as the active
// player, then the bots decide in turn order (CR 101.4); those who chose to discard their hands and draw five.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Will of the Jeskai: each player may discard their hand and draw five cards", async ({ page }) => {
  const s = scene({ hand: ["Will of the Jeskai", "Grizzly Bears", "Hill Giant"], board: LANDS }, [{ hand: Array.from({ length: 6 }, () => "Grizzly Bears") }, {}]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Will of the Jeskai", s).click();
  await page.locator(".mode-menu").getByRole("button", { name: /discard their hand/ }).click();
  const done = page.locator(".mode-menu").getByRole("button", { name: "Done" });
  if (await done.count()) await done.click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await expect(controls(page)).toContainText("Will of the Jeskai: Discard your hand and draw five cards?");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.players[0]!.hand).toHaveLength(5);
  expect(after.players[1]!.hand).toHaveLength(6); // six cards: Ana keeps them
  expect(after.players[2]!.hand).toHaveLength(5); // none: Ben draws five
  expect((await state(page)).log.map((l) => l.text).join("\n")).toMatch(/Ana chooses not to discard their hand and draw five cards/);
  expect(pageErrors(page)).toEqual([]);
});
