import asyncio
import json
import random
import os
import re
from datetime import datetime
from playwright.async_api import async_playwright

with open("config.json", encoding="utf-8") as f:
    CFG = json.load(f)

LOGIN = CFG["login"]
PASSWORD = CFG["password"]
HEADLESS = CFG.get("headless", False)
DELAY = CFG.get("delay_between_battles", 3)
MAX_BATTLES = CFG.get("max_battles", 0)
HP_WAIT_TIMEOUT = CFG.get("hp_wait_timeout", 600)

BASE_URL = "https://oldbk.game"
CHAOS_URL = "/fightclub/proposal.php?subtype=3"
ROOM_URL = "/fightclub/room.php"

os.makedirs("screenshots", exist_ok=True)

# Панель управления — HTML/CSS/JS встраивается в страницу
PANEL_JS = """
(function() {
  if (document.getElementById('__botPanel')) return;
  const panel = document.createElement('div');
  panel.id = '__botPanel';
  panel.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
    background: linear-gradient(135deg, #1a1a2e, #16213e);
    color: #eee; font-family: Arial, sans-serif; font-size: 13px;
    padding: 6px 12px; display: flex; align-items: center; gap: 16px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5); user-select: none;
    border-bottom: 2px solid #0f3460;
  `;
  panel.innerHTML = `
    <span style="font-weight:bold;color:#e94560">⚔ БОТ</span>
    <span id="__botStatus" style="padding:3px 8px;border-radius:10px;background:#555;font-size:12px">Запуск...</span>
    <span id="__botHP" style="color:#4ade80">HP: ---</span>
    <span id="__botCount" style="color:#60a5fa">Боёв: 0</span>
    <button id="__botStop" style="
      padding:4px 14px; border:none; border-radius:6px; cursor:pointer;
      background:#e94560; color:white; font-size:12px; font-weight:bold;
    " onclick="window.__botStop=true;this.textContent='Стоп...';this.disabled=true">■ Стоп</button>
    <button id="__botStart" style="
      padding:4px 14px; border:none; border-radius:6px; cursor:pointer;
      background:#22c55e; color:white; font-size:12px; font-weight:bold; display:none;
    " onclick="window.__botStop=false;this.style.display='none';
               document.getElementById('__botStop').disabled=false;
               document.getElementById('__botStop').style.display='';
               document.getElementById('__botStop').textContent='■ Стоп'">▶ Старт</button>
    <span style="color:#888;font-size:11px;margin-left:auto" id="__botLog">Инициализация...</span>
  `;
  document.body.prepend(panel);
  document.body.style.paddingTop = '36px';
  window.__botStop = false;
  window.__botPaused = false;
})();
"""

PANEL_UPDATE_JS = """
(function(status, hp, count, logMsg, stopped) {
  const s = document.getElementById('__botStatus');
  const h = document.getElementById('__botHP');
  const c = document.getElementById('__botCount');
  const l = document.getElementById('__botLog');
  const stopBtn = document.getElementById('__botStop');
  const startBtn = document.getElementById('__botStart');
  if (s) {
    s.textContent = status;
    s.style.background = stopped ? '#555' : (status.includes('Бой') ? '#e94560' : '#22c55e');
  }
  if (h) h.textContent = 'HP: ' + hp;
  if (c) c.textContent = 'Боёв: ' + count;
  if (l) l.textContent = logMsg;
  if (stopped && startBtn && stopBtn) {
    stopBtn.style.display = 'none';
    startBtn.style.display = '';
  }
})(...arguments);
"""


def log(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


async def rnd(min_s=0.5, max_s=1.5):
    await asyncio.sleep(random.uniform(min_s, max_s))


async def inject_panel(page):
    try:
        await page.evaluate(PANEL_JS)
    except Exception:
        pass


async def update_panel(page, status="", hp="---", count=0, msg="", stopped=False):
    try:
        await page.evaluate(PANEL_UPDATE_JS, status, hp, count, msg, stopped)
    except Exception:
        pass


async def is_stop_requested(page):
    try:
        result = await page.evaluate("window.__botStop")
        return result is True
    except Exception:
        return False


async def get_main_frame(page):
    frame = page.frame(name="main")
    if frame:
        return frame
    for f in page.frames:
        if "oldbk.game" in f.url and f.url != BASE_URL + "/" and f.url != BASE_URL:
            return f
    return None


async def login(page):
    log("Открываю сайт...")
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await rnd(1.5, 2.5)
    await inject_panel(page)
    await update_panel(page, "Логин", msg="Входим...")

    await page.locator('input[name="login"], input[type="text"]').first.fill(LOGIN)
    await rnd(0.3, 0.7)
    await page.locator('input[type="password"]').first.fill(PASSWORD)
    await rnd(0.3, 0.7)
    await page.locator('button[type="submit"], input[type="submit"]').first.click()
    await page.wait_for_load_state("domcontentloaded")
    await rnd(2, 3)
    await inject_panel(page)
    log(f"Вошёл. URL: {page.url}")


async def get_hp(page):
    try:
        frame = await get_main_frame(page)
        if not frame:
            return None, None
        # HP находится в span.hpContainer — текст формата "... : 1054/1054"
        hp_el = frame.locator('.hpContainer').first
        if await hp_el.count() > 0:
            text = await hp_el.inner_text()
            match = re.search(r'(\d+)/(\d+)', text)
            if match:
                cur = int(match.group(1))
                mx = int(match.group(2))
                if mx > 0 and cur <= mx:
                    return cur, mx
    except Exception:
        pass
    return None, None


async def wait_for_hp(page, battles_done):
    log("Проверяю HP...")
    # Сначала убедимся что в клубе (room.php показывает HP)
    frame = await get_main_frame(page)
    if not (frame and "fightclub" in frame.url):
        await navigate_to_fightclub(page)
    try:
        await page.evaluate(f"h.loadMainBox('{ROOM_URL}')")
        await rnd(2, 3)
    except Exception:
        pass

    deadline = asyncio.get_event_loop().time() + HP_WAIT_TIMEOUT

    while asyncio.get_event_loop().time() < deadline:
        if await is_stop_requested(page):
            return False

        cur, mx = await get_hp(page)
        if cur is not None:
            pct = int(cur / mx * 100)
            hp_str = f"{cur}/{mx} ({pct}%)"
            log(f"HP: {hp_str}")
            await update_panel(page, "Восстановление HP", hp_str, battles_done,
                               f"Жду HP... {hp_str}")
            if cur >= mx:
                log("HP полное — идём в бой!")
                return True
        else:
            return True

        await asyncio.sleep(15)

        # Обновляем страницу каждые 15 секунд чтобы HP обновился
        log("Обновляю страницу...")
        try:
            await page.evaluate(f"h.loadMainBox('{ROOM_URL}')")
            await rnd(1.5, 2.5)
        except Exception:
            pass

    log("Таймаут ожидания HP.")
    return True


async def check_captcha(page):
    """Проверяет капчу и решает автоматически (ответ = число в имени картинки)."""
    frame = await get_main_frame(page)
    if not (frame and "captcha" in frame.url):
        return

    log("Обнаружена капча, решаю автоматически...")
    await update_panel(page, "⚠ Капча", msg="Решаю капчу...")

    for _ in range(5):
        frame = await get_main_frame(page)
        if not frame or "captcha" not in frame.url:
            log("Капча исчезла.")
            return

        try:
            # Ответ = число в src картинки: /i/im/40.png → 40
            img = frame.locator('img[src*="/i/im/"]').first
            if await img.count() > 0:
                src = await img.get_attribute("src")
                answer = re.search(r'/i/im/(\d+)\.png', src)
                if answer:
                    num = answer.group(1)
                    log(f"Капча: картинка={src}, ответ={num}")

                    inp = frame.locator('input[name="captcha"]').first
                    if await inp.count() > 0:
                        await inp.fill(num)
                        await rnd(0.3, 0.7)

                    btn = frame.locator('input[control="captcha"]').first
                    if await btn.count() > 0:
                        await btn.click()
                        await rnd(1.5, 2.5)
                        log("Капча решена автоматически!")
                        await update_panel(page, "✓ Капча решена", msg=f"Ответ: {num}")
                        return
        except Exception as e:
            log(f"Ошибка при решении капчи: {e}")

        await asyncio.sleep(2)

    # Если автоматически не получилось — ждём ручного решения
    log("!!! Авто-решение не сработало — реши капчу вручную !!!")
    await update_panel(page, "⚠ КАПЧА ВРУЧНУЮ", msg="Введи число из картинки!")
    while frame and "captcha" in frame.url:
        await asyncio.sleep(3)
        frame = await get_main_frame(page)
    log("Капча решена, продолжаю.")


async def navigate_to_fightclub(page):
    """Переходит в Бойцовский Клуб с любой страницы."""
    frame = await get_main_frame(page)

    # Если уже в бою — не трогаем
    if frame and "battle/battle.php" in frame.url:
        log("Уже в бою, не переходим в клуб.")
        return True

    if frame and "fightclub" in frame.url:
        return True  # уже в клубе

    log("Иду в Бойцовский Клуб...")

    # Шаг 1: Центральная площадь (place=20)
    try:
        await page.evaluate("core.moveTo(20)")
        await rnd(2, 3)
    except Exception:
        frame = await get_main_frame(page)
        if frame:
            btn = frame.locator('[data-place="20"]').first
            if await btn.count() > 0:
                await btn.click()
                await rnd(2, 3)

    # Шаг 2: Бойцовский клуб (place=1)
    try:
        await page.evaluate("core.moveTo(1)")
        await rnd(2, 3)
    except Exception:
        frame = await get_main_frame(page)
        if frame:
            btn = frame.locator('[data-place="1"]').first
            if await btn.count() > 0:
                await btn.click()
                await rnd(2, 3)

    frame = await get_main_frame(page)
    if frame and "fightclub" in frame.url:
        log(f"В Бойцовском Клубе: {frame.url}")
        return True

    log(f"Не удалось попасть в клуб. iframe: {frame.url if frame else '?'}")
    return False


async def go_to_chaos_battles(page):
    log("Открываю Хаотические поединки...")

    # Если уже в бою — не переходим, вернём True сразу
    frame = await get_main_frame(page)
    if frame and "battle/battle.php" in frame.url:
        log("Уже в бою!")
        return True

    # Сначала убеждаемся что в клубе
    if not (frame and "fightclub" in frame.url):
        ok = await navigate_to_fightclub(page)
        if not ok:
            return False

    # Теперь loadMainBox работает
    try:
        await page.evaluate(f"h.loadMainBox('{CHAOS_URL}')")
    except Exception as e:
        log(f"JS навигация: {e}")

    # Ждём загрузки proposal.php
    for _ in range(15):
        await asyncio.sleep(0.5)
        frame = await get_main_frame(page)
        if frame and "proposal" in frame.url:
            log(f"Страница поединков: {frame.url}")
            return True

    # Fallback: кнопки внутри iframe
    frame = await get_main_frame(page)
    if frame:
        try:
            chaos_link = frame.locator('a[href*="subtype=3"]')
            if await chaos_link.count() > 0:
                await chaos_link.click()
                await rnd(1.5, 2.5)
                return True
            btn = frame.locator('input[value="Поединки"]')
            if await btn.count() > 0:
                await btn.click()
                await rnd(2, 3)
                chaos_link = frame.locator('a[href*="subtype=3"]')
                if await chaos_link.count() > 0:
                    await chaos_link.click()
                    await rnd(1.5, 2.5)
                    return True
        except Exception as e:
            log(f"Клик: {e}")

    log(f"Не удалось перейти. iframe: {frame.url if frame else '?'}")
    return False


async def find_and_join_battle(page):
    frame = await get_main_frame(page)
    if not frame:
        log("iframe не найден")
        return False

    log(f"Ищу бои на: {frame.url}")

    if "battle/battle.php" in frame.url:
        log("Уже в бою!")
        return True

    accept_links = frame.locator('a[href*="proposal.append"]')
    count = await accept_links.count()

    if count > 0:
        log(f"Доступных боёв: {count}. Принимаю...")
        await accept_links.first.click()
        await rnd(1.5, 2.5)
        frame = await get_main_frame(page)
        log(f"URL после принятия: {frame.url if frame else '?'}")
        return True

    log("Нет боёв. Подаю заявку...")
    try:
        submit_btn = frame.locator('input[value="Подать заявку"]').first
        if await submit_btn.count() > 0:
            await submit_btn.click()
            await rnd(1, 2)
            confirm_btn = frame.locator('input[value="Подать заявку"]').last
            if await confirm_btn.count() > 0:
                await confirm_btn.click()
                await rnd(1, 2)
                log("Заявка подана. Жду соперника...")
                return "waiting"
    except Exception as e:
        log(f"Ошибка заявки: {e}")
    return False


async def wait_for_battle_start(page, timeout=300):
    log("Жду начала боя...")
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        if await is_stop_requested(page):
            return False
        frame = await get_main_frame(page)
        if frame and "battle/battle.php" in frame.url:
            log("Бой начался!")
            return True
        await asyncio.sleep(5)
    log("Таймаут ожидания.")
    return False


async def play_battle(page, battles_done, timeout=300):
    log("Играю в бой...")
    deadline = asyncio.get_event_loop().time() + timeout
    action_count = 0

    while asyncio.get_event_loop().time() < deadline:
        if await is_stop_requested(page):
            log("Бот остановлен пользователем.")
            return False

        frame = await get_main_frame(page)
        if not frame:
            await asyncio.sleep(3)
            continue

        # Капча во время боя
        if frame and "captcha" in frame.url:
            await check_captcha(page)
            continue

        if "battle/battle.php" not in frame.url:
            log(f"Бой завершён (перешли на {frame.url}).")
            return True

        content = (await frame.content()).lower()
        for sig in ["бой окончен", "результат боя", "бой завершён"]:
            if sig in content:
                log(f"Бой завершён ('{sig}').")
                return True

        btn = frame.locator('input[control="blow"]').first
        if await btn.count() > 0:
            await btn.click()
            action_count += 1
            log(f"Вперёд #{action_count}")
            await update_panel(page, "⚔ В бою", "---", battles_done,
                               f"Ход #{action_count}")
            await rnd(1.5, 2.5)
        else:
            await asyncio.sleep(2)

    log("Таймаут боя.")
    return False


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=HEADLESS,
            args=["--disable-blink-features=AutomationControlled"]
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 720},
        )
        page = await context.new_page()

        try:
            await login(page)
        except Exception as e:
            log(f"Ошибка логина: {e}")
            log("Браузер остаётся открытым. Исправь проблему и перезапусти.")
            await update_panel(page, "Ошибка", msg=str(e), stopped=True)
            input("Нажми Enter для выхода...")
            await browser.close()
            return

        battles_done = 0

        while True:
            if MAX_BATTLES > 0 and battles_done >= MAX_BATTLES:
                log(f"Лимит: {MAX_BATTLES} боёв.")
                await update_panel(page, "Завершено", count=battles_done,
                                   msg="Лимит боёв достигнут", stopped=True)
                break

            # Проверяем кнопку Стоп
            if await is_stop_requested(page):
                log("Бот остановлен. Браузер открыт.")
                await update_panel(page, "Остановлен", count=battles_done,
                                   msg="Нажми ▶ Старт для продолжения", stopped=True)
                # Ждём нажатия Старт
                while await is_stop_requested(page):
                    await asyncio.sleep(2)
                log("Возобновляю...")
                await inject_panel(page)

            log(f"\n=== Поединок #{battles_done + 1} ===")
            await update_panel(page, "Подготовка", count=battles_done,
                               msg=f"Поединок #{battles_done + 1}")

            try:
                # Ждём HP
                await wait_for_hp(page, battles_done)

                if await is_stop_requested(page):
                    continue

                # Идём в хаотичные бои
                ok = await go_to_chaos_battles(page)
                if not ok:
                    log("Не удалось перейти. Жду 15 сек...")
                    await asyncio.sleep(15)
                    continue

                result = await find_and_join_battle(page)

                if result == "waiting":
                    await update_panel(page, "Ожидание", count=battles_done,
                                       msg="Ищем соперника...")
                    started = await wait_for_battle_start(page)
                    if not started:
                        await asyncio.sleep(10)
                        continue
                elif not result:
                    log("Не нашёл бой. Жду 10 сек...")
                    await asyncio.sleep(10)
                    continue

                # Играем
                ok = await play_battle(page, battles_done)
                if ok:
                    battles_done += 1
                    log(f"Итого боёв: {battles_done}")
                    await update_panel(page, "Отдых", count=battles_done,
                                       msg=f"Бой #{battles_done} завершён")

            except Exception as e:
                log(f"Ошибка: {e}. Перезапускаю цикл через 10 сек...")
                # Если iframe пропал — перезаходим на сайт
                frame = await get_main_frame(page)
                if frame is None:
                    log("iframe потерян — перезахожу на сайт...")
                    try:
                        await login(page)
                    except Exception as le:
                        log(f"Ошибка перезахода: {le}")
                await update_panel(page, "Ошибка", count=battles_done,
                                   msg=f"Ошибка: {str(e)[:50]}")
                await asyncio.sleep(10)
                # Переходим в комнату и продолжаем
                try:
                    await inject_panel(page)
                    await page.evaluate(f"h.loadMainBox('{ROOM_URL}')")
                    await rnd(2, 3)
                except Exception:
                    pass

        log("Бот завершил работу. Браузер открыт.")
        input("Нажми Enter для закрытия...")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
