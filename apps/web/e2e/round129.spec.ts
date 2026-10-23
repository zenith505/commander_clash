// Round 129's prompts: a villainous choice you face (The Dalek Emperor, CR 701.55), Necromantic Selection's choice of
// a creature card that died this way, and Inventory Management's "Leave it where it is" for each Equipment and Aura.
import { expect, test } from "@playwright/test";
import type { GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("The Dalek Emperor: you face its villainous choice at Ana's beginning of combat and give up Grizzly Bears", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Grizzly Bears"] }, [{ board: ["The Dalek Emperor"] }]);
  const bears = one(s0, "Grizzly Bears");
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "villainous" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("The Dalek Emperor");
  await expect(bar.getByRole("button", { name: /create a 3\/3 black Dalek/ })).toBeVisible();
  await bar.getByRole("button", { name: /sacrifices a creature/ }).click();
  await expect.poll(async () => (await state(page)).objects[bears]!.zone).toBe("graveyard");
  const after = await state(page);
  expect(after.battlefield.filter((id) => after.cards[after.objects[id]!.cardId]!.name.startsWith("Dalek")).length).toBe(0);
  expect(after.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n")).toMatch(/You faces? a villainous choice and chooses/);
  expect(pageErrors(page)).toEqual([]);
});

test("Necromantic Selection: every creature is destroyed, and you choose Ana's Hill Giant to return as a black Zombie", async ({ page }) => {
  const s = scene({ hand: ["Necromantic Selection"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Necromantic Selection", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "impulseChoice" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose a creature card put into a graveyard this way to put onto the battlefield under your control");
  await expect(bar.getByRole("button", { name: "Grizzly Bears" })).toBeVisible();
  await bar.getByRole("button", { name: "Hill Giant" }).click();
  const after = await resolveUntil(page, (st: GameState) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.controller).toBe(0);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[one(s, "Necromantic Selection")]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Inventory Management: Bonesplitter moves to Hill Giant, Rancor is left where it is", async ({ page }) => {
  const s = scene({ hand: ["Inventory Management"], board: [...LANDS, "Grizzly Bears", "Hill Giant", "Bonesplitter", "Rancor"] });
  const [bears, giant, sword, rancor] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Bonesplitter"), one(s, "Rancor")];
  s.objects[sword]!.attachedTo = bears;
  s.objects[rancor]!.attachedTo = bears;
  await open(page, s);
  await card(page, "Inventory Management", s).click();
  const bar = controls(page);
  for (let i = 0; i < 2; i++) {
    const st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "enchant" && x.pending.player === 0);
    const about = st.pending?.kind === "chooseOption" && /Bonesplitter/.test(st.pending.prompt ?? "") ? "sword" : "rancor";
    await expect(bar).toContainText(`to attach ${about === "sword" ? "Bonesplitter" : "Rancor"} to, or none`);
    await expect(bar.getByRole("button", { name: "Grizzly Bears" })).toHaveCount(0); // it's already there
    await bar.getByRole("button", { name: about === "sword" ? "Hill Giant" : "Leave it where it is" }).click();
  }
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[sword]!.attachedTo === giant);
  expect(after.objects[rancor]!.attachedTo).toBe(bears);
  expect(pageErrors(page)).toEqual([]);
});
