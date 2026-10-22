// PR #20 and #25: exerting an attacker (Combat Celebrant) and playing through the extra combat it adds.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { attack, controls, passTo, resolveUntil } from "./ui";

test("Combat Celebrant: exert it as it attacks, then attack again in the additional combat", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Combat Celebrant", "Grizzly Bears"] });
  const [celebrant, bears] = [one(s, "Combat Celebrant"), one(s, "Grizzly Bears")];
  // The test starts as you declare attackers (the trip from main 1 played in the engine).
  await open(page, playUntil(s, (st) => st.pending?.kind === "declareAttackers"));
  await attack(page, [[celebrant, 1], [bears, 1]]);
  await expect(controls(page)).toContainText("exert attacking creatures if you want");
  await expect(controls(page).getByRole("button", { name: "Don't exert" })).toBeVisible();
  await page.locator(`[data-obj="${celebrant}"]`).click();
  await controls(page).getByRole("button", { name: "Exert 1" }).click();
  // The exert trigger untaps the Bears and adds a combat phase; the first combat's damage, then attackers again.
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  const mid = await state(page);
  expect(mid.players[1]!.life).toBe(34); // 4 from the Celebrant, 2 from the Bears
  expect(mid.objects[bears]!.tapped).toBe(false);
  expect(mid.objects[celebrant]!.tapped).toBe(true);
  await attack(page, [[bears, 1]]);
  // No exert prompt this time: only an exerted Celebrant could have been exerted, and it isn't attacking.
  await passTo(page, "main2");
  const after = await state(page);
  expect(after.players[1]!.life).toBe(32);
  await expect(page.locator(".phase-track .step.on")).toHaveText("Main 2");
  expect(pageErrors(page)).toEqual([]);
});
