import { mkdir, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { signInLocally } from "./auth-fixture.ts";

function environment(name: string): string | undefined {
  // biome-ignore lint/style/noProcessEnv: the verification CLI owns its evidence environment.
  return process.env[name];
}

const artifactDirectory =
  environment("PROPERTY_WATCH_LAYOUT_ARTIFACT_DIR") ??
  new URL("../.results/layout", import.meta.url).pathname;
const phase = environment("PROPERTY_WATCH_LAYOUT_PHASE") ?? "current";
const widths = [
  320, 375, 390, 430, 431, 719, 720, 721, 759, 760, 761, 768, 819, 820, 821, 850, 1024, 1049, 1050,
  1051, 1100, 1440,
] as const;
const expectedMarketKeys = ["denver-co:", "norfolk-va:", "travis-county-tx:", "nyc-ny:"] as const;

type Rect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type RowGeometry = {
  row: Rect;
  rowClientWidth: number;
  rowScrollWidth: number;
  selectionGap: number;
  address: Rect;
  addressOverflow: string;
  addressText: string;
  addressTextOverflow: string;
  addressWhiteSpace: string;
  badge: Rect;
  badgeClientHeight: number;
  badgeClientWidth: number;
  badgeScrollHeight: number;
  badgeScrollWidth: number;
  badgeText: string;
  children: Array<{ className: string; rect: Rect; tagName: string }>;
  key: string;
  label: Rect;
  marketText: string;
  score: Rect;
  scoreLineCount: number;
};

type GeometrySample = {
  rows: RowGeometry[];
  textScalePercent: number;
  viewport: { height: number; width: number };
};

const overlapArea = (left: Rect, right: Rect) =>
  Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
  Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));

const contains = (outer: Rect, inner: Rect, tolerance = 0.75) =>
  inner.left >= outer.left - tolerance &&
  inner.right <= outer.right + tolerance &&
  inner.top >= outer.top - tolerance &&
  inner.bottom <= outer.bottom + tolerance;

function measure(page: import("@playwright/test").Page): Promise<RowGeometry[]> {
  return page.locator(".property-row").evaluateAll((elements) => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- browser-evaluated callbacks must be self-contained.
    const rect = (element: Element) => {
      const value = element.getBoundingClientRect();
      return {
        bottom: value.bottom,
        height: value.height,
        left: value.left,
        right: value.right,
        top: value.top,
        width: value.width,
      };
    };
    return elements.map((row) => {
      const badge = row.querySelector<HTMLElement>(".score-box");
      const score = badge?.querySelector<HTMLElement>("strong");
      const label = badge?.querySelector<HTMLElement>("span");
      const address = row.querySelector<HTMLElement>(".property-address");
      const addressHeading = address?.querySelector<HTMLElement>("strong");
      if (!(badge && score && label && address && addressHeading)) {
        throw new Error("Property row is missing its badge or address structure");
      }
      const range = document.createRange();
      range.selectNodeContents(score);
      const style = getComputedStyle(addressHeading);
      const selection = row.closest(".property-row-wrap")?.querySelector(".property-select");
      const checkbox = selection?.querySelector("input")?.getBoundingClientRect();
      const selectionLabel = selection?.querySelector("span")?.getBoundingClientRect();
      return {
        row: rect(row),
        rowClientWidth: row.clientWidth,
        rowScrollWidth: row.scrollWidth,
        selectionGap: checkbox && selectionLabel ? selectionLabel.left - checkbox.right : -1,
        address: rect(address),
        addressOverflow: style.overflow,
        addressText: addressHeading.textContent?.trim() ?? "",
        addressTextOverflow: style.textOverflow,
        addressWhiteSpace: style.whiteSpace,
        badge: rect(badge),
        badgeClientHeight: badge.clientHeight,
        badgeClientWidth: badge.clientWidth,
        badgeScrollHeight: badge.scrollHeight,
        badgeScrollWidth: badge.scrollWidth,
        badgeText: score.textContent?.trim() ?? "",
        children: Array.from(row.children).map((child) => ({
          className: child.getAttribute("class") ?? "",
          rect: rect(child),
          tagName: child.tagName.toLowerCase(),
        })),
        key: row.closest<HTMLElement>(".property-row-wrap")?.dataset["propertyKey"] ?? "",
        label: rect(label),
        marketText: address.querySelector("span")?.textContent?.trim() ?? "",
        score: rect(score),
        scoreLineCount: range.getClientRects().length,
      };
    });
  });
}

function containedLayoutViolations(
  container: import("@playwright/test").Locator,
): Promise<string[]> {
  return container.evaluate((root) => {
    const rootRect = root.getBoundingClientRect();
    const failures: string[] = [];
    if (root.scrollWidth > root.clientWidth + 1) {
      failures.push(`container scroll width ${root.scrollWidth} exceeds ${root.clientWidth}`);
    }
    for (const element of root.querySelectorAll<HTMLElement>("*")) {
      if (element.getClientRects().length === 0) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (rect.left < rootRect.left - 1 || rect.right > rootRect.right + 1) {
        failures.push(
          `${element.className || element.tagName.toLowerCase()}[name=${element.getAttribute("name") ?? ""}] in ${element.parentElement?.className || element.parentElement?.tagName.toLowerCase() || "unknown"} escapes horizontally (${rect.left.toFixed(1)}..${rect.right.toFixed(1)} vs ${rootRect.left.toFixed(1)}..${rootRect.right.toFixed(1)})`,
        );
      }
    }
    return failures;
  });
}

test("shortlist badges and row content remain geometrically contained", async ({ page }) => {
  test.setTimeout(120_000);
  await mkdir(artifactDirectory, { recursive: true });
  await signInLocally(page.context(), { email: "ericventor97@gmail.com" });
  await page.goto("/");
  await expect(page.locator("[data-hydrated=true]")).toBeVisible();
  await expect(page.locator(".property-row")).toHaveCount(5);

  const samples: GeometrySample[] = [];
  const violations: string[] = [];
  for (const textScalePercent of [100, 200]) {
    if (textScalePercent === 200) {
      await page.addStyleTag({
        content: "html { font-size: 200% !important; }",
      });
    }
    for (const width of widths) {
      const viewport = { width, height: width <= 430 ? 900 : 1000 };
      await page.setViewportSize(viewport);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
      );
      const rows = await measure(page);
      samples.push({ rows, textScalePercent, viewport });

      if (textScalePercent === 100 && (width === 390 || width === 1440)) {
        await page
          .locator(".records-section")
          .evaluate((element) =>
            window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 80),
          );
        await page.screenshot({
          path: `${artifactDirectory}/${phase}-shortlist-${width}.png`,
        });
      }

      for (const row of rows) {
        const prefix = `${textScalePercent}%/${width}px/${row.key}`;
        if (
          row.rowScrollWidth > row.rowClientWidth + 1 ||
          row.row.left < -1 ||
          row.row.right > width + 1
        ) {
          violations.push(`${prefix}: row escapes its available width`);
        }
        if (width <= 760 && (row.selectionGap < 0 || row.selectionGap > 12)) {
          violations.push(`${prefix}: checkbox and Select label are separated`);
        }
        for (const child of row.children) {
          if (child.rect.width > 0 && child.rect.height > 0 && !contains(row.row, child.rect)) {
            violations.push(`${prefix}: ${child.className || child.tagName} escapes row bounds`);
          }
        }
        if (overlapArea(row.badge, row.address) > 0.25) {
          violations.push(`${prefix}: badge intersects address`);
        }
        if (!contains(row.badge, row.score) || !contains(row.badge, row.label)) {
          violations.push(`${prefix}: badge text escapes badge`);
        }
        if (
          row.badgeScrollWidth > row.badgeClientWidth + 1 ||
          row.badgeScrollHeight > row.badgeClientHeight + 1
        ) {
          violations.push(`${prefix}: badge content scrolls outside its box`);
        }
        if (row.scoreLineCount !== 1) {
          violations.push(`${prefix}: ${row.badgeText} splits across lines`);
        }
        if (
          row.addressOverflow === "hidden" ||
          row.addressTextOverflow === "ellipsis" ||
          row.addressWhiteSpace === "nowrap"
        ) {
          violations.push(`${prefix}: address is clipped instead of wrapping`);
        }
        for (let leftIndex = 0; leftIndex < row.children.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < row.children.length; rightIndex += 1) {
            const left = row.children[leftIndex];
            const right = row.children[rightIndex];
            if (left && right && overlapArea(left.rect, right.rect) > 0.25) {
              violations.push(
                `${prefix}: sibling ${left.className || left.tagName} intersects ${right.className || right.tagName}`,
              );
            }
          }
        }
      }
    }
  }

  await writeFile(
    `${artifactDirectory}/${phase}-geometry.json`,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), samples, violations }, null, 2)}\n`,
  );

  const labels = new Set(samples[0]?.rows.map((row) => row.badgeText));
  expect(labels).toEqual(new Set(["Strong", "Moderate", "Early"]));
  const propertyKeys = samples[0]?.rows.map((row) => row.key) ?? [];
  for (const marketKey of expectedMarketKeys) {
    expect(
      propertyKeys.some((propertyKey) => propertyKey.startsWith(marketKey)),
      `Missing representative ${marketKey} row`,
    ).toBe(true);
  }
  expect(samples[0]?.rows.some((row) => row.addressText === "1555 S TENNYSON ST")).toBe(true);
  expect(violations, violations.join("\n")).toEqual([]);
});

test("detail, forms, and partner workspaces stay contained at responsive breakpoints", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await mkdir(artifactDirectory, { recursive: true });
  await signInLocally(page.context(), { email: "ericventor97@gmail.com" });
  await page.goto("/");
  await expect(page.locator("[data-hydrated=true]")).toBeVisible();

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
    await page.getByRole("button", { name: "Shortlist", exact: true }).click();
    await page.locator('[data-property-key="norfolk-va:15834200"] .property-row').click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Loading source-backed brief…", { exact: true })).toHaveCount(0);
    expect(
      await containedLayoutViolations(dialog),
      `Detail panel containment at ${width}px`,
    ).toEqual([]);
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: `${artifactDirectory}/${phase}-detail-${width}.png` });
    }

    const economics = dialog.getByRole("region", {
      name: "Deal economics scenarios",
      exact: true,
    });
    await economics.scrollIntoViewIfNeeded();
    const scenarioEditor = economics.locator(".scenario-editor");
    if ((await scenarioEditor.getAttribute("open")) === null) {
      await scenarioEditor.locator("summary").click();
    }
    await expect(economics.locator(".scenario-form")).toBeVisible();
    expect(
      await containedLayoutViolations(economics),
      `Economics form containment at ${width}px`,
    ).toEqual([]);
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: `${artifactDirectory}/${phase}-economics-${width}.png` });
    }
    await page.getByRole("button", { name: "Close details" }).click();

    const screens = [
      ["Changes", "activity workspace"],
      ["Pipeline", "pipeline workspace"],
      ["Buy boxes", "buyboxes workspace"],
      ["Blind benchmarks", "Blind benchmark workspace"],
      [/Alerts \(/, "alerts workspace"],
    ] as const;
    for (const [buttonName, regionName] of screens) {
      await page.getByRole("button", { name: buttonName }).click();
      const region = page.getByRole("region", { name: regionName, exact: true });
      await expect(region).toBeVisible();
      await region.evaluate((element) => {
        const top = element.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, Math.max(0, top - 80));
      });
      expect(
        await containedLayoutViolations(region),
        `${regionName} containment at ${width}px`,
      ).toEqual([]);
      if ((width === 390 || width === 1440) && regionName !== "activity workspace") {
        await page.screenshot({
          path: `${artifactDirectory}/${phase}-${regionName.split(" ")[0]}-${width}.png`,
        });
      }
    }
  }
});
