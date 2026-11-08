// Round 306's prompts: Do or Die's piles of creatures (separated by clicking them, then "Destroy pile N"), Make an
// Example's choice of one of each opponent's piles to sacrifice, This Is How It Ends's villainous choice with a creature
// you own to shuffle away, and Sakashima's Will's choice of the creature the others copy.
import { expect, test } from "@playwright/test";
import { idsOf, LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

test("Do or Die on yourself: separate your creatures (not your lands) into two piles, then destroy the pile of your choice", async ({ page }) => {
  const s = scene({ hand: ["Do or Die"], board: [...LANDS, "Grizzly Bears", "Hill Giant"] });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Do or Die", s).click();
  await clickPlayer(page, 0);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "pile");
  expect([...(asked.pending as { options: string[] }).options].sort()).toEqual([bears, giant].sort());
  const bar = controls(page);
  await expect(bar).toContainText("separate all creatures you control into two piles");
  await expect(bar).toContainText("destroyed (they can't be regenerated)");
  await card(page, "Grizzly Bears", s).click();
  await bar.getByRole("button", { name: "First pile: 1, second pile: 1" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "pile");
  const picker = modal(page);
  await expect(picker).toContainText("choose the pile of your creatures to destroy");
  await picker.getByRole("button", { name: "Destroy pile 2" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Make an Example: Ana and Ben separate their own creatures; you choose the pile each of them sacrifices", async ({ page }) => {
  const s = scene({ hand: ["Make an Example"], board: LANDS }, [{ board: ["Grizzly Bears", "Hill Giant"] }, { board: ["Craw Wurm"] }]);
  const [bears, giant, wurm] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Craw Wurm")];
  await open(page, s);
  await card(page, "Make an Example", s).click();
  const first = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "pile" && st.pending.of === 1);
  const picker = modal(page);
  await expect(picker).toContainText("choose the pile of Ana's creatures that they sacrifice");
  const anaPiles = (first.pending as { piles: string[][] }).piles;
  const withGiant = anaPiles.findIndex((p) => p.includes(giant));
  await picker.getByRole("button", { name: `Sacrifice pile ${withGiant + 1}` }).click();
  const second = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "pile" && st.pending.of === 2);
  await expect(modal(page)).toContainText("choose the pile of Ben's creatures that they sacrifice");
  const benPiles = (second.pending as { piles: string[][] }).piles;
  const withWurm = benPiles.findIndex((p) => p.includes(wurm));
  await modal(page).getByRole("button", { name: `Sacrifice pile ${withWurm + 1}` }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[wurm]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe(anaPiles[withGiant]!.includes(bears) ? "graveyard" : "battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("This Is How It Ends on your own Grizzly Bears: you choose to shuffle Hill Giant away rather than lose 5 life", async ({ page }) => {
  const s = scene({ hand: ["This Is How It Ends"], board: [...LANDS, "Grizzly Bears", "Hill Giant", "Craw Wurm"] });
  const [bears, giant, wurm] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Craw Wurm")];
  await open(page, s);
  await card(page, "This Is How It Ends", s).click();
  await card(page, "Grizzly Bears", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "villainous" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: /lose 5 life/ })).toBeVisible();
  await bar.getByRole("button", { name: /shuffle another creature they own/ }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  expect([...(asked.pending as { options: string[] }).options].sort()).toEqual([giant, wurm].sort());
  await card(page, "Hill Giant", s).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "library");
  expect(after.objects[bears]!.zone).toBe("library");
  expect(after.objects[wurm]!.zone).toBe("battlefield");
  expect(after.players[0]!.life).toBe(s.players[0]!.life);
  expect(pageErrors(page)).toEqual([]);
});

test("Sakashima's Will's second mode: choose Hill Giant, and your other creature becomes a copy of it until end of turn", async ({ page }) => {
  const s = scene({ hand: ["Sakashima's Will"], board: [...LANDS, "Grizzly Bears", "Hill Giant"] });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Sakashima's Will", s).click();
  const modes = page.locator(".mode-menu");
  await modes.getByRole("button", { name: /Each other creature you control becomes a copy/ }).click();
  const done = modes.getByRole("button", { name: "Done" });
  if (await done.isVisible()) await done.click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await card(page, "Hill Giant", s).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Sakashima's Will")]!.zone === "graveyard");
  expect(after.battlefield.includes(giant)).toBe(true);
  expect(idsOf(after, "Grizzly Bears", "battlefield", 0)).toEqual([bears]);
  // The Grizzly Bears permanent shows as a Hill Giant now.
  await expect(page.locator(`[data-obj="${bears}"]`)).toContainText("Hill Giant");
  expect(pageErrors(page)).toEqual([]);
});
