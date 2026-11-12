/**
 * Smoke-check: Lit-rendered <video> has <source> children in the shadow DOM.
 * Usage: node scripts/verify-video-sources.mjs  (expects demo on :5173)
 */
import { chromium } from "playwright";

const base = process.env.DEMO_URL ?? "http://127.0.0.1:5173/";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(base, { waitUntil: "networkidle" });

const result = await page.waitForFunction(
  () => {
    const card = document.querySelector("tapo-c260-card");
    const root = card?.shadowRoot;
    const video = root?.querySelector("video");
    if (!video) return null;
    const sources = [...video.querySelectorAll("source")].map((s) => ({
      src: s.getAttribute("src") ?? "",
      type: s.getAttribute("type") ?? "",
    }));
    const fallback = video.querySelector("img.stream-fallback");
    return {
      sourceCount: sources.length,
      sources,
      hasMp4: sources.some((s) => s.type === "video/mp4"),
      hasHls: sources.some((s) => s.type === "application/vnd.apple.mpegurl"),
      hasNestedFallbackImg: !!fallback,
    };
  },
  { timeout: 20000 },
).then((h) => h.jsonValue());

await browser.close();

if (!result || result.sourceCount < 1) {
  console.error("FAIL: video has no <source> children", result);
  process.exit(1);
}
if (!result.hasMp4 || !result.hasHls) {
  console.error("FAIL: expected mp4 + hls sources", result);
  process.exit(1);
}
if (!result.hasNestedFallbackImg) {
  console.error("FAIL: expected nested img.stream-fallback inside video", result);
  process.exit(1);
}

console.log("OK: video source children + nested fallback img present");
console.log(JSON.stringify(result, null, 2));
