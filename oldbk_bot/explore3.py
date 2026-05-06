"""Изучает страницу /fightclub/proposal.php (Поединки)."""
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

        # Логин
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

        # Кликаем "Поединки" в iframe
        main_frame = page.frame(name="main")
        if not main_frame:
            print("iframe не найден!", flush=True)
            await browser.close()
            return

        print(f"iframe URL: {main_frame.url}", flush=True)

        # Кликаем кнопку Поединки
        btn = main_frame.locator('input[value="Поединки"]')
        if await btn.count() > 0:
            print("Кликаю 'Поединки'...", flush=True)
            await btn.click()
            await asyncio.sleep(3)
        else:
            print("Кнопка Поединки не найдена, пробую JavaScript...", flush=True)
            await page.evaluate("h.loadMainBox('/fightclub/proposal.php')")
            await asyncio.sleep(3)

        # Получаем обновлённый iframe
        main_frame = page.frame(name="main")
        print(f"iframe URL после клика: {main_frame.url}", flush=True)

        # Сохраняем HTML
        html = await main_frame.content()
        with open("screenshots/proposal_page.html", "w", encoding="utf-8") as f:
            f.write(html)
        print("HTML сохранён в screenshots/proposal_page.html", flush=True)

        await page.screenshot(path="screenshots/explore3_proposal.png", full_page=True)

        # Все ссылки и кнопки
        print("\nСсылки:", flush=True)
        links = await main_frame.query_selector_all("a")
        for link in links:
            try:
                text = (await link.inner_text()).strip()
                href = await link.get_attribute("href") or ""
                if text:
                    print(f"  [{text[:60]}] -> {href}", flush=True)
            except Exception:
                pass

        print("\nКнопки/инпуты:", flush=True)
        btns = await main_frame.query_selector_all("button, input[type=submit], input[type=button]")
        for btn in btns:
            try:
                text = (await btn.inner_text()).strip()
                val = await btn.get_attribute("value") or ""
                onclick = await btn.get_attribute("onclick") or ""
                print(f"  [{text or val}] onclick={onclick[:80]}", flush=True)
            except Exception:
                pass

        await browser.close()


asyncio.run(main())
