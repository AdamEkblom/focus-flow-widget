import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Parse HSL lightness from a CSS custom property value like "215 28% 18%".
 * Returns the lightness percentage (0–100).
 */
function parseLightness(hslValue: string): number {
  const match = hslValue.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
  if (!match) throw new Error(`Cannot parse HSL value: "${hslValue}"`);
  return Number(match[3]);
}

/**
 * Extract the value of a CSS custom property from the :root block.
 */
function getCssVar(css: string, varName: string): string {
  const rootMatch = css.match(/:root\s*\{([^}]+)\}/s);
  if (!rootMatch) throw new Error(":root block not found");
  const re = new RegExp(`${varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(.+?)\\s*;`);
  const match = rootMatch[1].match(re);
  if (!match) throw new Error(`CSS variable ${varName} not found in :root`);
  return match[1].trim();
}

describe("colour scheme", () => {
  const css = readFileSync(resolve(__dirname, "../index.css"), "utf-8");

  it("background is dark (lightness <= 25%)", () => {
    const lightness = parseLightness(getCssVar(css, "--background"));
    expect(lightness).toBeLessThanOrEqual(25);
  });

  it("foreground is light (lightness >= 75%)", () => {
    const lightness = parseLightness(getCssVar(css, "--foreground"));
    expect(lightness).toBeGreaterThanOrEqual(75);
  });

  it("card background is dark (lightness <= 30%)", () => {
    const lightness = parseLightness(getCssVar(css, "--card"));
    expect(lightness).toBeLessThanOrEqual(30);
  });

  it("card foreground is light (lightness >= 75%)", () => {
    const lightness = parseLightness(getCssVar(css, "--card-foreground"));
    expect(lightness).toBeGreaterThanOrEqual(75);
  });

  it("html and body backgrounds are transparent for vibrancy", () => {
    const htmlBlock = css.match(/html\s*\{([^}]+)\}/s);
    expect(htmlBlock).not.toBeNull();
    expect(htmlBlock![1]).toContain("background: transparent");

    const bodyBlock = css.match(/body\s*\{([^}]+)\}/s);
    expect(bodyBlock).not.toBeNull();
    expect(bodyBlock![1]).toContain("background: transparent");
  });
});
