// Lane B round B172 in the browser: Eureka asks you, each time around, for a permanent card from your hand (or none), and
// it's over once every player in a row has put none; Blood Sun's lands show that they have only their mana abilities.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("Eureka: put Hill Giant, then Grizzly Bears the next time around, then none", async ({ page }) => {
  const s = scene({ hand: ["Eureka", "Hill Giant", "Grizzly Bears", "Lightning Bolt"], board: LANDS });
  const [eureka, giant, bears, bolt] = [one(s, "Eureka"), one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Lightning Bolt")];
  await open(page, s);
  await card(page, "Eureka", s).click();
  const first = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  // Your permanent cards only: not Lightning Bolt.
  expect([...(first.pending as { cards: string[] }).cards].sort()).toEqual([giant, bears].sort());
  await expect(modal(page)).toContainText("Your hand");
  await expect(modal(page)).toContainText("a permanent card");
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  // The giant is on the battlefield before you're asked again (each card enters as it's chosen).
  const second = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.objects[giant]!.zone === "battlefield");
  expect((second.pending as { cards: string[] }).cards).toEqual([bears]);
  await modal(page).locator(`[data-pick="${bears}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  // Nothing left but Lightning Bolt: you aren't asked again, and the others have no cards.
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.triggerQueue.length === 0 && st.objects[eureka]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[bolt]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Eureka: choose none the first time around and it's over", async ({ page }) => {
  const s = scene({ hand: ["Eureka", "Hill Giant"], board: LANDS });
  const [eureka, giant] = [one(s, "Eureka"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Eureka", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  await modal(page).getByRole("button", { name: "Take none" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[eureka]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Blood Sun: Evolving Wilds shows it has only mana abilities left", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Blood Sun", "Evolving Wilds"] });
  const wilds = one(s, "Evolving Wilds");
  await open(page, s);
  await expect(page.locator(`[data-obj="${wilds}"]`)).toContainText("Only mana abilities");
  expect(pageErrors(page)).toEqual([]);
});
