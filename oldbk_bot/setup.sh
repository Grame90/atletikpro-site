#!/bin/bash
echo "Устанавливаю зависимости..."
pip install -r requirements.txt
echo "Устанавливаю браузер Playwright..."
playwright install chromium
echo "Готово! Теперь отредактируй config.json и запусти: python bot.py"
