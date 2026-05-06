"""Находит путь от Центральной площади к Бойцовскому Клубу."""
import asyncio
import json
import os
from playwright.async_api import async_playwright

with open("config.json", encoding="utf-8") as f:
    CFG = json.load(f)

os.makedirs("screenshots", exist_ok=True)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 720},
        )
        page = await context.new_page()

        print("Логинюсь...", flush=True)
        await page.goto("https://oldbk.game", wait_until="domcontentloaded")
        await asyncio.sleep(2)
        await page.locator('input[name="login"], input[type="text"]').first.fill(CFG["login"])
        await asyncio.sleep(0.5)
        await page.locator('input[type="password"]').first.fill(CFG["password"])
        await asyncio.sleep(0.5)
        await page.locator('button[type="submit"], input[type="submit"]').first.click()
        await page.wait_for_load_state("domcontentloaded")
        await asyncio.sleep(3)

        frame = page.frame(name="main")
        print(f"iframe URL: {frame.url}", flush=True)

        # Идём на Центральную площадь
        print("Иду на Центральную площадь (data-place=20)...", flush=True)
        btn = frame.locator('[data-place="20"]').first
        if await btn.count() > 0:
            await btn.click()
            await asyncio.sleep(3)
        else:
            print("Кнопка place=20 не найдена, пробую JS...", flush=True)
            await page.evaluate("core.moveTo(20)")
            await asyncio.sleep(3)

        frame = page.frame(name="main")
        print(f"iframe URL после площади: {frame.url}", flush=True)
        await page.screenshot(path="screenshots/central_square.png", full_page=True)
        html = await frame.content()
        with open("screenshots/central_square.html", "w", encoding="utf-8") as f:
            f.write(html)
        print("HTML сохранён.", flush=True)

        print("\nВсе кнопки/ссылки:", flush=True)
        btns = await frame.query_selector_all("button, input[type=button], a, polygon, [data-ctrl]")
        for btn in btns:
            try:
                text = (await btn.inner_text()).strip()
                val = await btn.get_attribute("value") or ""
                href = await btn.get_attribute("href") or ""
                place = await btn.get_attribute("data-place") or ""
                title = await btn.get_attribute("title") or ""
                onclick = await btn.get_attribute("onclick") or ""
                if text or val or title:
                    print(f"  [{text or val or title}] place={place} href={href} onclick={onclick[:60]}", flush=True)
            except Exception:
                pass

        await browser.close()


asyncio.run(main())
