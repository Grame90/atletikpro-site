"""Скрипт для изучения структуры игры. Запусти один раз, потом удали."""
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

        print("Открываю сайт...", flush=True)
        await page.goto("https://oldbk.game", wait_until="domcontentloaded")
        await asyncio.sleep(2)

        # Логин
        await page.locator('input[name="login"], input[name="username"], input[type="text"]').first.fill(CFG["login"])
        await asyncio.sleep(0.5)
        await page.locator('input[type="password"]').first.fill(CFG["password"])
        await asyncio.sleep(0.5)
        await page.locator('button[type="submit"], input[type="submit"]').first.click()
        await page.wait_for_load_state("domcontentloaded")
        await asyncio.sleep(3)

        print(f"URL после логина: {page.url}", flush=True)
        await page.screenshot(path="screenshots/explore_01_main.png", full_page=True)

        # Сохраняем HTML
        html = await page.content()
        with open("screenshots/page_main.html", "w", encoding="utf-8") as f:
            f.write(html)
        print("HTML сохранён в screenshots/page_main.html", flush=True)

        # Ищем все iframes
        frames = page.frames
        print(f"\nФреймы на странице: {len(frames)}", flush=True)
        for i, frame in enumerate(frames):
            print(f"  Frame {i}: url={frame.url} name={frame.name}", flush=True)

        # Все ссылки на главной
        print("\nВсе ссылки:", flush=True)
        links = await page.query_selector_all("a")
        for link in links:
            try:
                text = (await link.inner_text()).strip()
                href = await link.get_attribute("href") or ""
                if text:
                    print(f"  [{text[:50]}] -> {href}", flush=True)
            except Exception:
                pass

        # Все кнопки/инпуты
        print("\nВсе кнопки:", flush=True)
        btns = await page.query_selector_all("button, input[type=button], input[type=submit], .btn")
        for btn in btns:
            try:
                text = (await btn.inner_text()).strip()
                val = await btn.get_attribute("value") or ""
                cls = await btn.get_attribute("class") or ""
                print(f"  [{text or val}] class={cls[:50]}", flush=True)
            except Exception:
                pass

        print("\nЖду 60 секунд (посмотри на браузер и кликни вручную на 'Поединки')...", flush=True)
        await asyncio.sleep(5)

        # После ручного клика делаем скриншот
        await page.screenshot(path="screenshots/explore_02_after_wait.png", full_page=True)
        html2 = await page.content()
        with open("screenshots/page_after.html", "w", encoding="utf-8") as f:
            f.write(html2)
        print(f"URL сейчас: {page.url}", flush=True)
        print("HTML сохранён в screenshots/page_after.html", flush=True)

        await browser.close()


asyncio.run(main())
