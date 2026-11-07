// Lane B round B134 in the browser: a splice cost that isn't mana (Torrent of Stone spliced onto Glacial Ray, its two
// Mountains picked on the board after the targets) and an entwine cost that isn't mana (Solar Tide's entwine button
// naming "sacrifice two lands", then the two lands picked).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, modal, resolveUntil } from "./ui";

test("Glacial Ray: splice Torrent of Stone onto it, sacrificing a Mountain and Taiga; both happen and Torrent stays in hand", async ({ page }) => {
  const s = scene({ hand: ["Glacial Ray", "Torrent of Stone"], board: ["Island", "Island", "Swamp", "Mountain", "Taiga"] }, [{ board: ["Hill Giant"] }]);
  const [ray, torrent, taiga, giant] = [one(s, "Glacial Ray"), one(s, "Torrent of Stone"), one(s, "Taiga"), one(s, "Hill Giant")];
  const mountain = idsOf(s, "Mountain", "battlefield", 0)[0]!; // not a library copy
  await open(page, s);
  await card(page, "Glacial Ray", s).click();
  const pick = modal(page);
  await expect(pick).toContainText("Glacial Ray: splice onto it any number of cards from your hand");
  await pick.locator(`[data-pick="${torrent}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await clickPlayer(page, 1);
  await page.locator(`[data-obj="${giant}"]`).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice 2 Mountains" });
  await expect(bar).toHaveCount(1);
  await page.locator(`[data-obj="${mountain}"]`).click();
  await expect(bar.getByRole("button", { name: "Sacrifice and cast" })).toBeDisabled();
  await page.locator(`[data-obj="${taiga}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[ray]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(38);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect([mountain, taiga].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  expect(after.objects[torrent]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Solar Tide: the entwine button names its cost; sacrificing Taiga and Scrubland destroys every creature", async ({ page }) => {
  const s = scene({ hand: ["Solar Tide"], board: [...LANDS, "Taiga", "Scrubland"] }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [taiga, scrub, bears, giant] = [one(s, "Taiga"), one(s, "Scrubland"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Solar Tide", s).click();
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("choose one mode");
  const entwine = modes.getByRole("button", { name: "Entwine (sacrifice two lands): all of them" });
  await expect(entwine).toBeEnabled();
  await entwine.click();
  const bar = page.locator(".targeting", { hasText: "sacrifice 2 lands" });
  await expect(bar).toHaveCount(1);
  await page.locator(`[data-obj="${taiga}"]`).click();
  await page.locator(`[data-obj="${scrub}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Solar Tide")]!.zone === "graveyard");
  expect([bears, giant, taiga, scrub].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});
