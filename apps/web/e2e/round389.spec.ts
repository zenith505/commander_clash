// Round 389 in the browser: The Pandorica's ability clicked on Ana's Serra Angel, then your untap step's choice to keep it
// tapped (the Angel stays phased out) or untap it (the Angel phases in); Barroom Brawl's second target, a creature the
// opponent to your left controls; and Over the Top, your Aura revealed with it enchanting something already there.
import { expect, test, type Page } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

/** The Pandorica clicked on Ana's Serra Angel; then the game goes round the table to your next untap step's choice. */
async function pandoricaToUntap(page: Page) {
  const s = scene({ board: [...LANDS, "The Pandorica"] }, [{ board: ["Serra Angel"] }]);
  const [box, angel] = [one(s, "The Pandorica"), one(s, "Serra Angel")];
  await open(page, s);
  await page.locator(`[data-obj="${box}"]`).first().click();
  await menu(page).getByRole("button", { name: /Untap another target nonland permanent/ }).click();
  await page.locator(`[data-obj="${angel}"]`).first().click();
  let now = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[angel]!.zone === "phasedOut");
  expect(now.objects[box]!.tapped).toBe(true);
  // Round the table (in the engine, for speed): Ana's untap step doesn't phase the Angel in while The Pandorica is tapped.
  now = playUntil(now, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "keepTapped" && st.pending.player === 0);
  expect(now.objects[angel]!.zone).toBe("phasedOut");
  await open(page, now);
  await expect(controls(page)).toContainText("Untap step: click the permanents you want to keep tapped");
  return { box, angel };
}

test("The Pandorica: Ana's Serra Angel phases out, and stays out while you keep The Pandorica tapped", async ({ page }) => {
  const { box, angel } = await pandoricaToUntap(page);
  await page.locator(`[data-obj="${box}"]`).first().click();
  await controls(page).getByRole("button", { name: "Keep 1 tapped" }).click();
  const now = await resolveUntil(page, (st) => st.step === "main1" && st.activePlayer === 0 && st.stack.length === 0);
  expect(now.objects[box]!.tapped).toBe(true);
  expect(now.objects[angel]!.zone).toBe("phasedOut");
  expect(pageErrors(page)).toEqual([]);
});

test("The Pandorica: untap it in your untap step and Ana's Serra Angel phases in", async ({ page }) => {
  const { box, angel } = await pandoricaToUntap(page);
  await controls(page).getByRole("button", { name: "Untap all" }).click();
  const now = await resolveUntil(page, (st) => st.step === "main1" && st.activePlayer === 0 && st.stack.length === 0 && st.objects[angel]!.zone === "battlefield");
  expect(now.objects[box]!.tapped).toBe(false);
  expect(now.objects[angel]!.controller).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Barroom Brawl: your Craw Wurm can't fight Ben's Hill Giant, only a creature of Ana's, the opponent to your left", async ({ page }) => {
  const s = scene({ hand: ["Barroom Brawl"], board: [...LANDS, "Craw Wurm"] }, [{ board: ["Gray Ogre"] }, { board: ["Hill Giant"] }]);
  const [wurm, ogre, giant] = [one(s, "Craw Wurm"), one(s, "Gray Ogre"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Barroom Brawl", s).click();
  const panel = page.locator(".targeting", { hasText: "Barroom Brawl" });
  await page.locator(`[data-obj="${wurm}"]`).first().click();
  await expect(panel).toContainText("the opponent to your left controls");
  await page.locator(`[data-obj="${giant}"]`).first().click(); // Ben's: not a legal target, nothing happens
  await expect(panel).toBeVisible();
  await page.locator(`[data-obj="${ogre}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ogre]!.zone === "graveyard");
  expect(after.objects[wurm]!.damage).toBe(2);
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Over the Top: your Pacifism revealed enchants Ana's Grizzly Bears, not her Serra Angel entering with it", async ({ page }) => {
  const s = scene({ hand: ["Over the Top"], board: [...LANDS, "Sol Ring", "Hill Giant"], library: ["Pacifism", "Divination"] }, [{ board: ["Grizzly Bears"], library: ["Serra Angel"] }]);
  const [pacifism, divination, bears, angel] = [one(s, "Pacifism"), one(s, "Divination"), one(s, "Grizzly Bears"), one(s, "Serra Angel")];
  await open(page, s);
  await card(page, "Over the Top", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "enchant" && st.pending.player === 0);
  expect(asked.pending?.kind === "chooseOption" && asked.pending.options).not.toContain(angel);
  const bar = controls(page);
  await expect(bar).toContainText("choose what Pacifism enchants");
  await bar.getByRole("button", { name: "Grizzly Bears (Ana)", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[pacifism]!.zone === "battlefield");
  expect(after.objects[pacifism]!.attachedTo).toBe(bears);
  expect(after.objects[divination]!.zone).toBe("graveyard");
  expect(after.objects[angel]!.zone).toBe("battlefield");
  expect(after.objects[angel]!.controller).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
