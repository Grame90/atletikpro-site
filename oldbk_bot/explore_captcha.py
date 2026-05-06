"""Изучает страницу капчи."""
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

        # Напрямую загружаем страницу капчи
        frame = page.frame(name="main")
        print(f"iframe URL: {frame.url}", flush=True)

        print("Загружаю страницу капчи...", flush=True)
        await page.evaluate("h.loadMainBox('/battle/battle.php?action=captcha&captcha=1')")
        await asyncio.sleep(3)

        frame = page.frame(name="main")
        print(f"iframe URL после загрузки: {frame.url}", flush=True)

        html = await frame.content()
        with open("screenshots/captcha_page.html", "w", encoding="utf-8") as f:
            f.write(html)
        print("HTML сохранён в screenshots/captcha_page.html", flush=True)
        await page.screenshot(path="screenshots/captcha_screen.png", full_page=True)

        print("\nВсе элементы:", flush=True)
        els = await frame.query_selector_all("input, img, form, button")
        for el in els:
            try:
                tag = await el.evaluate("el => el.tagName")
                text = (await el.inner_text()).strip()[:50]
                src = await el.get_attribute("src") or ""
                typ = await el.get_attribute("type") or ""
                name = await el.get_attribute("name") or ""
                val = await el.get_attribute("value") or ""
                print(f"  <{tag}> type={typ} name={name} value={val} src={src[:50]} text={text}", flush=True)
            except Exception:
                pass

        await browser.close()


asyncio.run(main())
