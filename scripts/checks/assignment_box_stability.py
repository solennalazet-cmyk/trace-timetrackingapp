"""
Regression check: the clock-out assignment box and its client picker must not
move ("bounce") on a phone.

Run whenever you touch: dialogs, sheets, the assignment box, the client picker,
keyboard/viewport handling, geolocation, the timer stop flow, or index.html's
viewport meta.

    python3 scripts/checks/assignment_box_stability.py

Exits 0 on PASS, 1 on FAIL. Uses the shared test account and leaves one short
"Skipped" (unassigned) stopwatch entry behind on it.
"""
import asyncio
import json
import os
import sys
import urllib.request
from pathlib import Path

from playwright.async_api import async_playwright

BASE = os.environ.get("TRACE_BASE_URL", "http://localhost:8080")
PROJECT_REF = "qiwdhjgwakjzlwnabcmv"
ANON = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpd2Roamd3YWtqemx3bmFiY212Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1ODY0MTYsImV4cCI6MjA4OTE2MjQxNn0.uCJWUJnbpfukH5JwvqYA1v8X7P0RuBrdWCczjd97R68"
)
EMAIL = os.environ.get("TRACE_TEST_EMAIL", "alex.free@tracetest.io")
PASSWORD = os.environ.get("TRACE_TEST_PASSWORD", "TraceTest2026!")
TOLERANCE = 2  # px
OUT = Path("/tmp/browser/assignment-stability")
OUT.mkdir(parents=True, exist_ok=True)

failures: list[str] = []


def sign_in() -> dict:
    req = urllib.request.Request(
        f"https://{PROJECT_REF}.supabase.co/auth/v1/token?grant_type=password",
        data=json.dumps({"email": EMAIL, "password": PASSWORD}).encode(),
        headers={"apikey": ANON, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def same(label: str, a: dict, b: dict, keys=("y", "height")):
    for k in keys:
        if abs(a[k] - b[k]) > TOLERANCE:
            failures.append(f"{label}: {k} moved {a[k]:.0f} -> {b[k]:.0f}")


async def rect(page, sel):
    return await page.locator(sel).first.bounding_box()


async def main():
    # Signed-out (local/anonymous) mode exercises the exact same box and
    # picker without touching any real account. Set TRACE_CHECK_SIGNED_IN=1
    # to run against the shared test account instead.
    session = sign_in() if os.environ.get("TRACE_CHECK_SIGNED_IN") == "1" else None
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 411, "height": 695}, is_mobile=True, has_touch=True,
            device_scale_factor=2,
        )
        page = await ctx.new_page()
        await page.goto(BASE)
        if session:
            await page.evaluate(
                "([k, v]) => localStorage.setItem(k, v)",
                [f"sb-{PROJECT_REF}-auth-token", json.dumps(session)],
            )
        await page.goto(BASE + "/", wait_until="networkidle")

        # Dismiss first-run overlays if present.
        for name in ("Not now", "Got it", "Close"):
            btn = page.get_by_role("button", name=name)
            if await btn.count() and await btn.first.is_visible():
                await btn.first.click()

        start = page.get_by_role("button", name="Start", exact=True)
        if await start.count() and await start.first.is_visible():
            await start.first.click()
            await page.wait_for_timeout(1500)
        nn = page.get_by_role("button", name="Not now")
        if await nn.count() and await nn.first.is_visible():
            await nn.first.click()
            await page.wait_for_timeout(300)
        await page.locator("button:visible", has_text="Stop").last.click()
        await page.wait_for_timeout(1500); await page.screenshot(path=str(OUT / "0_after_stop.png"))
        box = "[data-assignment-box]"
        await page.wait_for_selector(box, timeout=10000)
        await page.wait_for_timeout(400)  # open animation
        r0 = await rect(page, box)
        await page.screenshot(path=str(OUT / "1_open.png"))

        await page.wait_for_timeout(2500)  # async clients/projects/rates land
        same("box after data load", r0, await rect(page, box))

        await page.locator(f"{box} button", has_text="Select client").first.tap()
        await page.wait_for_selector("[data-picker-panel]")
        await page.wait_for_timeout(300)
        same("box when picker opens", r0, await rect(page, box))
        p0 = await rect(page, "[data-picker-panel]")
        await page.screenshot(path=str(OUT / "2_picker.png"))

        # Simulate the keyboard (interactive-widget=resizes-content shrinks
        # the layout viewport on Android).
        await page.locator("[data-picker-panel] input").tap()
        await page.set_viewport_size({"width": 411, "height": 400})
        await page.wait_for_timeout(400)
        same("box under keyboard", r0, await rect(page, box), keys=("y",))
        same("picker top under keyboard", p0, await rect(page, "[data-picker-panel]"), keys=("y",))
        await page.screenshot(path=str(OUT / "3_keyboard.png"))

        await page.locator("[data-picker-panel] input").fill("zzzz-no-match")
        await page.wait_for_timeout(200)
        same("picker top while filtering", p0, await rect(page, "[data-picker-panel]"), keys=("y",))
        await page.locator("[data-picker-panel] input").fill("")

        await page.set_viewport_size({"width": 411, "height": 695})
        await page.wait_for_timeout(400)
        rows = page.locator("[data-picker-panel] .overflow-y-auto button")
        if await rows.count():
            await rows.first.tap()
        else:
            await page.get_by_role("button", name="Close").first.tap()
        await page.wait_for_timeout(500)
        same("box after selecting client", r0, await rect(page, box))
        await page.screenshot(path=str(OUT / "4_selected.png"))

        await page.locator(box).get_by_role("button", name="Skip").click()
        await browser.close()

    if failures:
        print("FAIL")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print("PASS: assignment box and client picker stayed still")


asyncio.run(main())
