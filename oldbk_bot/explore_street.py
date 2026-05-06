"""Изучает страницу улицы — находит путь к Бойцовскому Клубу."""
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
        print(f"iframe URL после логина: {frame.url}", flush=True)

        # Сохраняем HTML текущей страницы
        html = await frame.content()
        with open("screenshots/street_page.html", "w", encoding="utf-8") as f:
            f.write(html)
        await page.screenshot(path="screenshots/street_screen.png", full_page=True)
        print("HTML сохранён в screenshots/street_page.html", flush=True)

        # Все кнопки/ссылки
        print("\nКнопки:", flush=True)
        btns = await frame.query_selector_all("button, input[type=button], input[type=submit], a")
        for btn in btns:
            try:
                text = (await btn.inner_text()).strip()
                val = await btn.get_attribute("value") or ""
                href = await btn.get_attribute("href") or ""
                onclick = await btn.get_attribute("onclick") or ""
                if text or val:
                    print(f"  [{text or val}] href={href} onclick={onclick[:80]}", flush=True)
            except Exception:
                pass

        # Проверяем что происходит когда вызываем loadMainBox
        print("\nПробую h.loadMainBox('/fightclub/room.php')...", flush=True)
        try:
            await page.evaluate("h.loadMainBox('/fightclub/room.php')")
            await asyncio.sleep(3)
            frame = page.frame(name="main")
            print(f"iframe URL после loadMainBox: {frame.url}", flush=True)
        except Exception as e:
            print(f"Ошибка: {e}", flush=True)

        await browser.close()


asyncio.run(main())
