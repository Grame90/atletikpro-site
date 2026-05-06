"""Изучает содержимое iframe игры."""
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
        await asyncio.sleep(4)

        # Получаем iframe
        main_frame = page.frame(name="main")
        if not main_frame:
            print("iframe 'main' не найден!", flush=True)
            frames = page.frames
            for f in frames:
                print(f"  frame: url={f.url} name={f.name}", flush=True)
            await browser.close()
            return

        print(f"iframe URL: {main_frame.url}", flush=True)

        # Сохраняем HTML iframe
        html = await main_frame.content()
        with open("screenshots/iframe_content.html", "w", encoding="utf-8") as f:
            f.write(html)
        print("HTML iframe сохранён в screenshots/iframe_content.html", flush=True)

        # Все ссылки в iframe
        print("\nСсылки в iframe:", flush=True)
        links = await main_frame.query_selector_all("a")
        for link in links:
            try:
                text = (await link.inner_text()).strip()
                href = await link.get_attribute("href") or ""
                if text:
                    print(f"  [{text[:60]}] -> {href}", flush=True)
            except Exception:
                pass

        # Все кнопки в iframe
        print("\nКнопки в iframe:", flush=True)
        btns = await main_frame.query_selector_all("button, input[type=submit], input[type=button]")
        for btn in btns:
            try:
                text = (await btn.inner_text()).strip()
                val = await btn.get_attribute("value") or ""
                name = await btn.get_attribute("name") or ""
                print(f"  [{text or val}] name={name}", flush=True)
            except Exception:
                pass

        await page.screenshot(path="screenshots/explore2_main.png", full_page=True)
        print("\nСкриншот сохранён.", flush=True)
        await browser.close()


asyncio.run(main())
