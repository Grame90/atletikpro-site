"""Изучает страницу анкеты — находит раздел лицензий."""
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

        # Открываем анкету
        print("Открываю анкету...", flush=True)
        await page.evaluate("h.loadMainBox('/registrar/anketa.php')")
        await asyncio.sleep(3)

        frame = page.frame(name="main")
        print(f"iframe URL: {frame.url}", flush=True)

        html = await frame.content()
        with open("screenshots/anketa.html", "w", encoding="utf-8") as f:
            f.write(html)
        await page.screenshot(path="screenshots/anketa.png", full_page=True)
        print("Сохранено.", flush=True)

        # Ищем всё связанное с лицензиями/федерациями
        print("\nЭлементы с 'лицензи' или 'федера':", flush=True)
        els = await frame.query_selector_all("*")
        for el in els:
            try:
                text = (await el.inner_text()).strip()
                if any(kw in text.lower() for kw in ["лицензи", "федера", "license"]):
                    tag = await el.evaluate("el => el.tagName")
                    name = await el.get_attribute("name") or ""
                    val = await el.get_attribute("value") or ""
                    cls = await el.get_attribute("class") or ""
                    print(f"  <{tag}> name={name} value={val} class={cls[:40]} text={text[:80]}", flush=True)
            except Exception:
                pass

        await browser.close()


asyncio.run(main())
