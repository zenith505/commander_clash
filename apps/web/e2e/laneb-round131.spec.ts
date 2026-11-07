// Lane B round B131 in the browser: Kaervek's Spite (sacrifice all permanents you control and discard your hand as an
// additional cost, then target a player), Lavabrink Venturer (choose odd or even as it enters) and Traveling Plague (the
// dead creature's controller, you, picks what it enchants as it returns).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, resolveUntil } from "./ui";

test("Kaervek's Spite: cast it at Ana, sacrificing everything you control and discarding your hand", async ({ page }) => {
  const s = scene({ hand: ["Kaervek's Spite", "Grizzly Bears"], board: [...LANDS, "Hill Giant"] }, [{ board: ["Savannah Lions"] }]);
  const [spite, bears, giant, lions] = [one(s, "Kaervek's Spite"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Savannah Lions")];
  const life = s.players[1]!.life;
  await open(page, s);
  await card(page, "Kaervek's Spite", s).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[spite]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(life - 5);
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0)).toEqual([]);
  expect([after.objects[giant]!.zone, after.objects[bears]!.zone, after.objects[lions]!.zone]).toEqual(["graveyard", "graveyard", "battlefield"]);
  expect(after.players[0]!.hand).toEqual([]);
  expect(pageErrors(page)).toEqual([]);
});

test("Lavabrink Venturer: choose odd as it enters, and it has protection from odd mana values", async ({ page }) => {
  const s = scene({ hand: ["Lavabrink Venturer"], board: LANDS });
  const lava = one(s, "Lavabrink Venturer");
  await open(page, s);
  await card(page, "Lavabrink Venturer", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "parity" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button")).toHaveText(["Odd", "Even"]);
  await bar.getByRole("button", { name: "Odd" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[lava]!.zone === "battlefield");
  expect(after.objects[lava]!.chosen?.parity).toBe("odd");
  expect(pageErrors(page)).toEqual([]);
});

test("Traveling Plague: your enchanted creature dies, and you return Ana's Plague onto Ana's creature", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Grizzly Bears", "Hill Giant"] }, [{ board: ["Traveling Plague", "Savannah Lions"] }]);
  const [plague, bears, lions] = [one(s, "Traveling Plague"), one(s, "Grizzly Bears"), one(s, "Savannah Lions")];
  s.objects[plague]!.attachedTo = bears;
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "enchant" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose what Traveling Plague enchants");
  await bar.getByRole("button", { name: "Savannah Lions (Ana)", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[plague]!.zone === "battlefield");
  expect(after.objects[plague]!.attachedTo).toBe(lions);
  // You returned it, so you control it (CR 110.2a); Ana still owns it.
  expect([after.objects[plague]!.controller, after.objects[plague]!.owner]).toEqual([0, 1]);
  expect(pageErrors(page)).toEqual([]);
});
