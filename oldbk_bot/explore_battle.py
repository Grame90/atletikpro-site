"""Изучает страницу боя — находит кнопку Вперед."""
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

        # Идём в хаотичные бои
        print("Открываю хаотичные бои...", flush=True)
        await page.evaluate("h.loadMainBox('/fightclub/proposal.php?subtype=3')")
        await asyncio.sleep(2)

        frame = page.frame(name="main")
        print(f"iframe URL: {frame.url}", flush=True)

        # Принимаем первый бой
        accept = frame.locator('a[href*="proposal.append"]')
        count = await accept.count()
        print(f"Доступных боёв: {count}", flush=True)

        if count > 0:
            print("Принимаю бой...", flush=True)
            await accept.first.click()
            await asyncio.sleep(3)

            frame = page.frame(name="main")
            print(f"URL после принятия: {frame.url}", flush=True)

            # Сохраняем HTML боя
            html = await frame.content()
            with open("screenshots/battle_page.html", "w", encoding="utf-8") as f:
                f.write(html)
            print("HTML боя сохранён в screenshots/battle_page.html", flush=True)
            await page.screenshot(path="screenshots/battle_screen.png", full_page=True)

            # Все кнопки
            print("\nВсе кнопки в бою:", flush=True)
            btns = await frame.query_selector_all("button, input[type=submit], input[type=button], a")
            for btn in btns:
                try:
                    text = (await btn.inner_text()).strip()
                    val = await btn.get_attribute("value") or ""
                    href = await btn.get_attribute("href") or ""
                    onclick = await btn.get_attribute("onclick") or ""
                    name = await btn.get_attribute("name") or ""
                    if text or val:
                        print(f"  [{text or val}] href={href} onclick={onclick[:60]} name={name}", flush=True)
                except Exception:
                    pass
        else:
            print("Нет доступных боёв. Жду 30 сек...", flush=True)
            await asyncio.sleep(30)
            frame = page.frame(name="main")
            html = await frame.content()
            with open("screenshots/proposal_chaos.html", "w", encoding="utf-8") as f:
                f.write(html)

        await browser.close()


asyncio.run(main())
