// Round 120's prompts: Expel the Interlopers asks for a number as it resolves; Shadrix Silverquill's "you may choose two"
// offers "Choose none" and then needs a different player for each mode; One with the Multiverse's free cast offers "Cast
// it prototyped for {0}" for a prototype card; web-slinging returns a tapped creature you control (CR 702.188a).
import { expect, test } from "@playwright/test";
import { type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

test("Expel the Interlopers: you choose 3 as it resolves; the 3-power Hill Giant dies, the smaller creatures stay", async ({ page }) => {
  const s = scene({ hand: ["Expel the Interlopers"], board: [...LANDS, "Llanowar Elves"] }, [{ board: ["Hill Giant", "Grizzly Bears"] }]);
  const [giant, bears, elves] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Expel the Interlopers", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "number" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose a number between 0 and 10");
  await bar.getByRole("spinbutton", { name: "Number" }).fill("3");
  await bar.getByRole("button", { name: "Choose 3" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Expel the Interlopers")]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[elves]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Shadrix Silverquill: none is allowed; you pick two modes, yourself for the Inkling and Ana for the card", async ({ page }) => {
  let s: GameState = scene({ board: ["Shadrix Silverquill"] });
  // In the engine: on to your beginning of combat, where its trigger asks for modes.
  s = playUntil(s, (st) => st.pending?.kind === "chooseModes" && st.pending.player === 0);
  const anaHand = s.players[1]!.hand.length;
  await open(page, s);
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("you may choose two modes or none");
  await expect(modes.getByRole("button", { name: "Choose none" })).toBeEnabled();
  await modes.getByRole("button", { name: /creates a 2\/1 white and black Inkling/ }).click();
  await expect(modes.getByRole("button", { name: "Done" })).toBeDisabled(); // one mode isn't allowed
  await modes.getByRole("button", { name: /draws a card and loses 1 life/ }).click();
  await modes.getByRole("button", { name: "Done" }).click();
  await clickPlayer(page, 0);
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.hand.length === anaHand + 1);
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.isToken).length).toBe(1);
  expect(after.players[1]!.life).toBe(39);
  expect(pageErrors(page)).toEqual([]);
});

test("One with the Multiverse: you cast Phyrexian Fleshgorger prototyped for {0}", async ({ page }) => {
  const s = scene({ hand: ["Phyrexian Fleshgorger"], board: ["One with the Multiverse"] });
  const gorger = one(s, "Phyrexian Fleshgorger");
  await open(page, s);
  await card(page, "Phyrexian Fleshgorger", s).click();
  await menu(page).locator('button[data-alt="payZero-prototyped"]').click();
  const after = await resolveUntil(page, (st) => st.objects[gorger]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.objects[gorger]!.prototyped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Web-slinging: Spider-Man, Web-Slinger cast for {W} by returning your tapped Grizzly Bears, not the untapped Hill Giant", async ({ page }) => {
  const s = scene({ hand: ["Spider-Man, Web-Slinger"], board: ["Plains", "Grizzly Bears", "Hill Giant"] });
  const [spidey, bears, giant] = [one(s, "Spider-Man, Web-Slinger"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[bears]!.tapped = true;
  await open(page, s);
  await card(page, "Spider-Man, Web-Slinger", s).click();
  await menu(page).getByRole("button", { name: /web-slinging: return a tapped creature you control/ }).click();
  const bar = page.locator(".targeting", { hasText: "tapped creature" });
  await expect(bar.getByRole("button", { name: "Return and cast" })).toBeDisabled();
  await page.locator(`[data-obj="${giant}"]`).click(); // untapped: not a choice
  await expect(bar.getByRole("button", { name: "Return and cast" })).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Return and cast" }).click();
  const after = await resolveUntil(page, (st) => st.objects[spidey]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
