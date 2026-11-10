// Round 334: craft with "one or more" materials (Altar of the Wretched: any number from one up, from the battlefield
// and the graveyard together) and with four named creature types (Throne of the Grim Captain: one separate card for
// each, Done only once the four picks cover them).
import { expect, test } from "@playwright/test";
import { power, toughness } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Altar of the Wretched: craft with two creatures, one on the battlefield and one in the graveyard", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Altar of the Wretched // Wretched Bonemass", "Serra Angel", "Llanowar Elves"], yard: ["Grizzly Bears"] });
  const [altar, angel, elves, bears] = [one(s, "Altar of the Wretched"), one(s, "Serra Angel"), one(s, "Llanowar Elves"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Altar of the Wretched", s).click();
  const craft = menu(page).getByRole("button", { name: /^Craft/ });
  if (await craft.count()) await craft.click();
  const pick = modal(page);
  await expect(pick).toContainText("craft: exile 1 or more creatures you control or from your graveyard");
  const done = pick.getByRole("button", { name: "Done" });
  // At least one; any of the three.
  await expect(done).toBeDisabled();
  for (const id of [angel, elves, bears]) await expect(pick.locator(`[data-pick="${id}"]`)).toBeVisible();
  await expect(pick.locator(`[data-pick="${altar}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${angel}"]`).click();
  await expect(done).toBeEnabled();
  await pick.locator(`[data-pick="${bears}"]`).click();
  await expect(pick).toContainText("chosen 2 of up to 3");
  await done.click();
  const after = await resolveUntil(page, (st) => st.objects[altar]!.zone === "battlefield" && st.objects[altar]!.face === 1 && st.stack.length === 0 && !st.pending);
  expect(after.objects[angel]!.zone).toBe("exile");
  expect(after.objects[bears]!.zone).toBe("exile");
  expect(after.objects[elves]!.zone).toBe("battlefield");
  // Wretched Bonemass: the total power of the cards used to craft it (4 + 2).
  expect(power(after, after.objects[altar]!)).toBe(6);
  expect(toughness(after, after.objects[altar]!)).toBe(6);
  expect(pageErrors(page)).toEqual([]);
});

test("Throne of the Grim Captain: craft with a Dinosaur, a Merfolk, a Pirate, and a Vampire, each a card of its own", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Throne of the Grim Captain // The Grim Captain", "Fathom Fleet Captain"], yard: ["Regisaur Alpha", "Carnage Tyrant", "Merfolk Looter", "Vampire Nighthawk"] });
  const throne = one(s, "Throne of the Grim Captain");
  const [pirate, alpha, tyrant, looter, nighthawk] = ["Fathom Fleet Captain", "Regisaur Alpha", "Carnage Tyrant", "Merfolk Looter", "Vampire Nighthawk"].map((n) => one(s, n)) as [string, string, string, string, string];
  await open(page, s);
  await card(page, "Throne of the Grim Captain", s).click();
  const craft = menu(page).getByRole("button", { name: /^Craft/ });
  if (await craft.count()) await craft.click();
  const pick = modal(page);
  await expect(pick).toContainText("craft: exile a Dinosaur, a Merfolk, a Pirate, and a Vampire you control or from your graveyard");
  const done = pick.getByRole("button", { name: "Done" });
  // Two Dinosaurs leave the Vampire out: not yet.
  for (const id of [alpha, tyrant, looter, pirate]) await pick.locator(`[data-pick="${id}"]`).click();
  await expect(done).toBeDisabled();
  await pick.locator(`[data-pick="${tyrant}"]`).click();
  await pick.locator(`[data-pick="${nighthawk}"]`).click();
  await expect(done).toBeEnabled();
  await done.click();
  const after = await resolveUntil(page, (st) => st.objects[throne]!.zone === "battlefield" && st.objects[throne]!.face === 1 && st.stack.length === 0 && !st.pending);
  for (const id of [alpha, looter, pirate, nighthawk]) expect(after.objects[id]!.zone).toBe("exile");
  expect(after.objects[tyrant]!.zone).toBe("graveyard");
  expect(power(after, after.objects[throne]!)).toBe(7);
  expect(pageErrors(page)).toEqual([]);
});
