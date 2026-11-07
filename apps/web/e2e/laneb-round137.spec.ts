// Lane B round B137 in the browser: Tyrannical Pitlord's creature chosen as it enters (CR 614.12), Voltage Surge's
// "you may sacrifice an artifact" offered like kicker (CR 601.2b), and Soulblast's "sacrifice all creatures you control"
// as it's cast (their total power, CR 608.2h).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, resolveUntil } from "./ui";

test("Tyrannical Pitlord: pick which of your two creatures gets +3/+3 and flying", async ({ page }) => {
  const s = scene({ hand: ["Tyrannical Pitlord"], board: ["Grizzly Bears", "Hill Giant", ...LANDS] });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Tyrannical Pitlord", s).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "chooseCreature");
  expect(st.pending?.kind === "chooseOption" && st.pending.options.sort()).toEqual([bears, giant].sort());
  const bar = controls(page);
  await expect(bar).toContainText("choose another creature you control");
  await bar.getByRole("button", { name: "Grizzly Bears" }).click();
  const pitlord = one(s, "Tyrannical Pitlord");
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[pitlord]!.zone === "battlefield");
  expect(after.objects[pitlord]!.chosen?.creature?.id).toBe(bears);
  await expect(page.locator(`[data-obj="${bears}"]`).first()).toContainText("5/5");
  expect(pageErrors(page)).toEqual([]);
});

test("Voltage Surge: sacrifice an artifact as you cast it, and it deals 4 damage to Ana's Hill Giant", async ({ page }) => {
  const s = scene({ hand: ["Voltage Surge"], board: [...LANDS, "Mind Stone"] }, [{ board: ["Hill Giant"] }]);
  const [stone, giant] = [one(s, "Mind Stone"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Voltage Surge", s).click();
  const offer = page.locator(".targeting", { hasText: "as an additional cost, you may sacrifice an artifact" });
  await offer.getByRole("button", { name: /^Sacrifice an artifact/ }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${stone}"]`).click();
  await page.locator(".targeting").getByRole("button", { name: /^Sacrifice and cast/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.objects[stone]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Soulblast: sacrifice your Grizzly Bears and Hill Giant for 5 damage to Ana", async ({ page }) => {
  const s = scene({ hand: ["Soulblast"], board: [...LANDS, "Grizzly Bears", "Hill Giant"] }, [{ board: [] }]);
  const [bears, giant] = [idsOf(s, "Grizzly Bears", "battlefield", 0)[0]!, idsOf(s, "Hill Giant", "battlefield", 0)[0]!];
  const life = s.players[1]!.life;
  await open(page, s);
  await card(page, "Soulblast", s).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Soulblast")]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.players[1]!.life).toBe(life - 5);
  expect(pageErrors(page)).toEqual([]);
});
