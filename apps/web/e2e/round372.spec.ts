// Round 372: Averna, the Chaos Bloom's land from among the cards Bloodbraid Elf's cascade exiled, put onto the battlefield
// tapped before the cast; Reap's opponent target first, whose black permanents set how many graveyard cards it may target;
// and Rift Elemental's cost, a time counter removed from a suspended card in exile, in the counter picker.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Averna, the Chaos Bloom: Bloodbraid Elf cascades past Evolving Wilds and Terramorphic Expanse; put Evolving Wilds onto the battlefield tapped, then cast Grizzly Bears", async ({ page }) => {
  const s = scene({ hand: ["Bloodbraid Elf"], board: [...LANDS, "Averna, the Chaos Bloom"], library: ["Evolving Wilds", "Terramorphic Expanse", "Grizzly Bears"] });
  const [wilds, expanse, bears] = [one(s, "Evolving Wilds"), one(s, "Terramorphic Expanse"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Bloodbraid Elf", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("to put onto the battlefield tapped");
  // The lands only, not the card cascade hit.
  await expect(pick.locator(`[data-pick="${bears}"]:not(.dim)`)).toHaveCount(0);
  await pick.locator(`[data-pick="${wilds}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  // The land is in before the cast is decided (the reminder text).
  expect(asked.objects[wilds]!.zone).toBe("battlefield");
  expect(asked.objects[wilds]!.tapped).toBe(true);
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[expanse]!.zone).toBe("library");
  expect(after.players[0]!.landsPlayedThisTurn).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Reap: target Ana, who controls two black permanents, then two of the three cards in your graveyard", async ({ page }) => {
  const s = scene({ hand: ["Reap"], board: LANDS, yard: ["Hill Giant", "Lightning Bolt", "Mind Stone"] }, [{ board: ["Vampire Nighthawk", "Bad Moon"] }]);
  const [giant, bolt, stone, reap] = [one(s, "Hill Giant"), one(s, "Lightning Bolt"), one(s, "Mind Stone"), one(s, "Reap")];
  await open(page, s);
  await card(page, "Reap", s).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("target opponent");
  await clickPlayer(page, 1);
  const pick = modal(page);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.locator(`[data-pick="${bolt}"]`).click();
  if (await pick.getByRole("button", { name: "Done", exact: true }).count()) await pick.getByRole("button", { name: "Done", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[reap]!.zone === "graveyard");
  expect([giant, bolt, stone].map((id) => after.objects[id]!.zone)).toEqual(["hand", "hand", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Rift Elemental: remove the last time counter from your suspended Ancestral Vision; it gets +2/+0 and you may cast the Vision", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Rift Elemental"], exile: ["Ancestral Vision"] });
  const [rift, vision] = [one(s, "Rift Elemental"), one(s, "Ancestral Vision")];
  s.objects[vision]!.counters.time = 1;
  await open(page, s);
  await page.locator(`[data-obj="${rift}"]`).first().click();
  const item = menu(page).locator("button", { hasText: "+2/+0" });
  if (await item.count()) await item.click();
  const pick = page.locator(".counter-pick");
  await expect(pick).toContainText("remove 1 time counter from among permanent you control or suspended card you own");
  await pick.locator(`[data-counter="${vision}:time"]`).getByRole("button", { name: "+" }).click();
  await pick.getByRole("button", { name: "Done" }).click();
  // Suspend's ability triggered above the Elemental's: the Vision's free cast is offered first (rulings).
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  expect(asked.objects[vision]!.counters.time ?? 0).toBe(0);
  expect(asked.stack.length).toBe(1);
  await expect(controls(page)).toContainText("Ancestral Vision");
  expect(pageErrors(page)).toEqual([]);
});
