// Lane B round B70: casting and playing cards exiled with a permanent (linked abilities, CR 607.2a).
// Kaho, Minamo Historian: "{X}, {T}: You may cast a spell with mana value X from among cards exiled with Kaho without
// paying its mana cost." The X picker, then a button for each exiled card with mana value X.
// Raphael, Most Attitude: "Whenever Raphael attacks, until end of turn, you may play a card exiled with Raphael." One
// card from your exile becomes playable, and once one is played the other isn't.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, controls, menu, modal, passTo, resolveUntil, seat } from "./ui";

test("Kaho, Minamo Historian: X = 3 offers only the exiled Divination, cast without paying its mana cost", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Kaho, Minamo Historian"], exile: ["Divination", "Lightning Bolt", "Opt"] });
  const [kaho, divination, bolt, opt] = [one(s, "Kaho, Minamo Historian"), one(s, "Divination"), one(s, "Lightning Bolt"), one(s, "Opt")];
  // Kaho's enters ability exiled the Divination and the Bolt; the Opt was exiled some other way.
  s.linkedExile = { [`${kaho}@${s.objects[kaho]!.zoneChanges ?? 0}`]: [divination, bolt].map((id) => ({ id, zc: s.objects[id]!.zoneChanges ?? 0 })) };
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await card(page, "Kaho, Minamo Historian", s).click();
  const item = menu(page).locator("button", { hasText: "from among cards exiled with" });
  if (await item.count()) await item.click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("3");
  await x.getByRole("button", { name: "X = 3" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong");
  const bar = controls(page);
  // Lightning Bolt's mana value isn't 3, and the Opt wasn't exiled with Kaho.
  await expect(bar.getByRole("button", { name: "Lightning Bolt" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Opt" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Divination" }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[divination]!.zone === "graveyard");
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(after.objects[kaho]!.tapped).toBe(true);
  expect([bolt, opt].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Raphael, Most Attitude: after it attacks, play one card exiled with it from your exile, then not the other", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Raphael, Most Attitude"], exile: ["Hill Giant", "Grizzly Bears"] });
  const [raphael, giant, bears] = [one(s, "Raphael, Most Attitude"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  s.linkedExile = { [`${raphael}@${s.objects[raphael]!.zoneChanges ?? 0}`]: [giant, bears].map((id) => ({ id, zc: s.objects[id]!.zoneChanges ?? 0 })) };
  await open(page, playUntil(s, (st) => st.pending?.kind === "declareAttackers"));
  await attack(page, [[raphael, 1]]);
  await passTo(page, "main2");
  const yours = seat(page, 0).locator(".zone", { hasText: "Exile" });
  await yours.click();
  await expect(modal(page).locator(".card.playable")).toHaveCount(2);
  await modal(page).locator(".card.playable", { hasText: "Hill Giant" }).click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  // Alliance: the Giant entering lets Raphael exile the top card of your library (a land), also exiled with it.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.controller).toBe(0);
  expect(after.players[0]!.exile.length).toBe(2);
  // The permission was for one card: the Bears and the land stay in exile and can't be played now.
  expect(after.objects[bears]!.zone).toBe("exile");
  await yours.click();
  await expect(modal(page).locator(".card", { hasText: "Grizzly Bears" })).toBeVisible();
  await expect(modal(page).locator(".card")).toHaveCount(2);
  await expect(modal(page).locator(".card.playable")).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});
