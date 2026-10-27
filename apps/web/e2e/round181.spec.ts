// Round 181's prompt: Hinder countering a spell, whose caster chooses the top or bottom of its owner's library.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Hinder: countering your own Hill Giant spell, you put it on the bottom of your library", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant", "Hinder"], board: LANDS });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Hill Giant", s).click();
  // Hill Giant's stack item, read once the page has it there.
  let spell = "";
  await expect.poll(async () => (spell = (await state(page)).stack.find((i) => i.objectId === giant)?.id ?? "")).not.toBe("");
  await card(page, "Hinder", s).click();
  await expect(page.locator(".targeting")).toBeVisible();
  await page.locator(`[data-stack="${spell}"]`).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "topOrBottom");
  const bar = controls(page);
  await expect(bar).toContainText("put Hill Giant on the top or bottom of your library?");
  await bar.getByRole("button", { name: "Bottom" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending);
  expect(after.objects[giant]!.zone).toBe("library");
  expect(after.players[0]!.library.at(-1)).toBe(giant);
  expect(after.objects[one(s, "Hinder")]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
