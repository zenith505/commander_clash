// Lane B round B208 in the browser: Liberated Livestock's "you may put an Aura card from your hand and/or graveyard onto the
// battlefield attached to it" for each token, Storm Herald's pick of Aura cards from your graveyard and each one's creature,
// Lumbering Battlement's "exile any number of other nontoken creatures you control", and Hans Eriksson's revealed creature
// attacking a planeswalker.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, controls, modal, passTo, resolveUntil } from "./ui";

test("Liberated Livestock: dies; Rancor from your graveyard on the first token, no Aura on the second, Pacifism from your hand on the third", async ({ page }) => {
  const s = scene({ hand: ["Doom Blade", "Pacifism"], board: [...LANDS, "Liberated Livestock"], yard: ["Rancor"] });
  const [livestock, pacifism, rancor] = [one(s, "Liberated Livestock"), one(s, "Pacifism"), one(s, "Rancor")];
  await open(page, s);
  await card(page, "Doom Blade", s).click();
  await page.locator(`[data-obj="${livestock}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "auraForToken");
  const bar = controls(page);
  await expect(bar).toContainText("you may put an Aura card from your hand or graveyard onto the battlefield attached to the Cat token");
  await bar.getByRole("button", { name: "Rancor (from your graveyard)" }).click();
  await expect(bar).toContainText("attached to the Bird token");
  await expect(bar.getByRole("button", { name: "Rancor (from your graveyard)" })).toHaveCount(0);
  await bar.getByRole("button", { name: "No Aura" }).click();
  await expect(bar).toContainText("attached to the Ox token");
  await bar.getByRole("button", { name: "Pacifism (from your hand)" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[pacifism]!.zone === "battlefield");
  const host = (id: string) => after.objects[after.objects[id]!.attachedTo!]!;
  expect(after.objects[rancor]!.zone).toBe("battlefield");
  expect(host(rancor).isToken).toBe(true);
  expect(host(pacifism).isToken).toBe(true);
  expect(host(rancor).id).not.toBe(host(pacifism).id);
  expect(pageErrors(page)).toEqual([]);
});

test("Storm Herald: pick Rancor from your graveyard (Wild Growth isn't offered), put it on your Grizzly Bears; exiled at your end step", async ({ page }) => {
  const s = scene({ hand: ["Storm Herald"], board: [...LANDS, "Grizzly Bears"], yard: ["Rancor", "Wild Growth"] });
  const [bears, rancor, growth] = [one(s, "Grizzly Bears"), one(s, "Rancor"), one(s, "Wild Growth")];
  await open(page, s);
  await card(page, "Storm Herald", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${growth}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${rancor}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "enchant");
  await controls(page).getByRole("button", { name: "Grizzly Bears" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[rancor]!.zone === "battlefield");
  expect(after.objects[rancor]!.attachedTo).toBe(bears);
  expect(after.objects[growth]!.zone).toBe("graveyard");
  const later = await resolveUntil(page, (st) => st.objects[rancor]!.zone === "exile", 200);
  expect(later.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Lumbering Battlement: exile your Grizzly Bears with it; it's a 6/7", async ({ page }) => {
  const s = scene({ hand: ["Lumbering Battlement"], board: [...LANDS, "Grizzly Bears", "Elvish Visionary"] });
  const [bears, visionary] = [one(s, "Grizzly Bears"), one(s, "Elvish Visionary")];
  await open(page, s);
  await card(page, "Lumbering Battlement", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "choose");
  const bar = controls(page);
  await expect(bar).toContainText("any number of other nontoken creatures");
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.triggerQueue.length === 0 && st.objects[bears]!.zone === "exile");
  expect(after.objects[visionary]!.zone).toBe("battlefield");
  await expect(page.locator(`[data-obj="${one(s, "Lumbering Battlement")}"]`).first()).toContainText("6/7");
  expect(pageErrors(page)).toEqual([]);
});

test("Hans Eriksson: attacks Ana; the Grizzly Bears revealed attacks her Jace Beleren, then fights Hans", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Hans Eriksson"], library: ["Grizzly Bears"] }, [{ board: ["Jace Beleren"] }]);
  const [hans, bears, jace] = [one(s, "Hans Eriksson"), one(s, "Grizzly Bears"), one(s, "Jace Beleren")];
  s.objects[jace]!.counters = { loyalty: 3 };
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[hans, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "attackWhom");
  const bar = controls(page);
  await expect(bar).toContainText("choose what Grizzly Bears attacks");
  await bar.getByRole("button", { name: "Jace Beleren (Ana)" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[hans]!.damage === 2);
  expect(after.objects[bears]!.attackingPermanent?.id).toBe(jace);
  expect(after.objects[bears]!.damage).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
