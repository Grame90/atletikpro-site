// АтлетикПро — Telegram Bot
// Запуск: node bot.js
// Требования: Node.js 18+ (встроенный fetch), запущенный server.js

const CONFIG = (() => {
  try { return require('./config.json'); }
  catch { console.error('❌ Файл config.json не найден!'); process.exit(1); }
})();

const TOKEN  = CONFIG.botToken;
const SERVER = CONFIG.serverUrl || 'http://localhost:8080';

if (!TOKEN || TOKEN === 'ВСТАВЬТЕ_ТОКЕН_ЗДЕСЬ') {
  console.error('❌ Вставьте токен бота в config.json (botToken)');
  console.error('   Получите токен у @BotFather в Telegram');
  process.exit(1);
}

const TG = `https://api.telegram.org/bot${TOKEN}`;

// ── Telegram helpers ──────────────────────────────────────
async function tg(method, body = {}) {
  try {
    const r = await fetch(`${TG}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.json();
  } catch (e) { console.error('TG error:', e.message); return {}; }
}

const send = (chatId, text, extra = {}) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });

const edit = (chatId, msgId, text, extra = {}) =>
  tg('editMessageText', { chat_id: chatId, message_id: msgId, text, parse_mode: 'HTML', ...extra });

function mainMenu() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '🏃 Спортсмен' }, { text: '👨‍🏫 Тренер' }],
        [{ text: '🧾 Расход' },    { text: '📋 Список' }],
        [{ text: '🔍 Поиск' },     { text: '❓ Помощь' }],
      ],
      resize_keyboard: true,
    },
  };
}

function noKeyboard() {
  return { reply_markup: { remove_keyboard: true } };
}

function inline(rows) {
  return { reply_markup: { inline_keyboard: rows } };
}

// ── Server API helpers ────────────────────────────────────
async function apiGet(section) {
  const r = await fetch(`${SERVER}/api/${section}`);
  return r.json();
}

async function apiPost(section, item) {
  const r = await fetch(`${SERVER}/api/${section}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  return r.json();
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Step definitions ──────────────────────────────────────
const FLOWS = {
  athlete: {
    section: 'athletes',
    title: 'Спортсмен',
    steps: [
      { key: 'name',   required: true,  prompt: '👤 <b>Шаг 1 из 5 — ФИО</b>\n\nПример: <i>Иванов Иван Иванович</i>' },
      { key: 'bdate',  required: false, prompt: '📅 <b>Шаг 2 из 5 — Дата рождения</b>\n\nФормат: ГГГГ-ММ-ДД\nПример: <i>2005-03-15</i>\n\n/skip — пропустить' },
      { key: 'phone',  required: false, prompt: '📞 <b>Шаг 3 из 5 — Телефон</b>\n\nПример: <i>+7 999 123 45 67</i>\n\n/skip — пропустить' },
      { key: 'pphone', required: false, prompt: '📞 <b>Шаг 4 из 5 — Телефон родителей</b>\n\n/skip — пропустить' },
      { key: 'spec',   required: false, prompt: '🏅 <b>Шаг 5 из 5 — Специализация</b>\n\nПример: <i>Спринт 100м</i>\n\n/skip — пропустить' },
    ],
    confirm: item =>
      `✅ <b>Спортсмен добавлен!</b>\n\n` +
      `👤 ${item.name}\n` +
      (item.bdate  ? `📅 ${item.bdate}\n`  : '') +
      (item.phone  ? `📞 ${item.phone}\n`  : '') +
      (item.pphone ? `📞 ${item.pphone} (родители)\n` : '') +
      (item.spec   ? `🏅 ${item.spec}\n`   : ''),
  },

  coach: {
    section: 'coaches',
    title: 'Тренер',
    steps: [
      { key: 'name',     required: true,  prompt: '👤 <b>Шаг 1 из 4 — ФИО тренера</b>\n\nПример: <i>Петров Пётр Петрович</i>' },
      { key: 'phone',    required: false, prompt: '📞 <b>Шаг 2 из 4 — Телефон</b>\n\n/skip — пропустить' },
      { key: 'spec',     required: false, prompt: '🏅 <b>Шаг 3 из 4 — Специализация</b>\n\nПример: <i>Спринт, Прыжки</i>\n\n/skip — пропустить' },
      { key: 'salary',   required: false, prompt: '💰 <b>Шаг 4 из 4 — Зарплата (₽)</b>\n\nПример: <i>50000</i>\n\n/skip — пропустить' },
    ],
    confirm: item =>
      `✅ <b>Тренер добавлен!</b>\n\n` +
      `👨‍🏫 ${item.name}\n` +
      (item.phone  ? `📞 ${item.phone}\n`  : '') +
      (item.spec   ? `🏅 ${item.spec}\n`   : '') +
      (item.salary ? `💰 ${parseInt(item.salary).toLocaleString()} ₽\n` : ''),
  },

  expense: {
    section: 'expenses',
    title: 'Расход',
    steps: [
      { key: 'athName', required: true,  prompt: '👤 <b>Шаг 1 из 4 — Имя спортсмена</b>\n\nВведите имя (можно частично):' },
      { key: 'amount',  required: true,  prompt: '💰 <b>Шаг 2 из 4 — Сумма (₽)</b>\n\nПример: <i>5000</i>' },
      { key: 'cat',     required: true,  prompt: '📂 <b>Шаг 3 из 4 — Категория расхода</b>\n\nВыберите кнопку:', isSelect: true },
      { key: 'desc',    required: false, prompt: '📝 <b>Шаг 4 из 4 — Описание</b>\n\nПример: <i>Кроссовки Nike</i>\n\n/skip — пропустить' },
    ],
    confirm: (item, meta) =>
      `✅ <b>Расход добавлен!</b>\n\n` +
      `💰 ${parseInt(item.amount).toLocaleString()} ₽\n` +
      `📂 ${item.cat}\n` +
      (meta?.athName ? `👤 ${meta.athName}\n` : '') +
      (item.desc     ? `📝 ${item.desc}\n`     : '') +
      `📅 ${item.date}`,
  },
};

const EXPENSE_CATS = [
  ['👕 Форма / Экипировка', 'Форма / Экипировка'],
  ['🏆 Соревнования',       'Соревнования'],
  ['🏥 Медицина',           'Медицина'],
  ['🎽 Инвентарь',          'Инвентарь'],
  ['✈️ Сборы / Выезды',     'Сборы / Выезды'],
  ['📦 Другое',             'Другое'],
];

// ── Session state ─────────────────────────────────────────
const sessions = {}; // chatId → { flow, step, data, meta }

// ── Update handler ────────────────────────────────────────
async function handleUpdate(update) {
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }

  const msg = update.message;
  if (!msg?.text) return;

  const chatId = msg.chat.id;
  const text   = msg.text.trim();
  const sess   = sessions[chatId];

  // ── Global commands ──
  if (text === '/start') {
    sessions[chatId] = null;
    await send(chatId,
      '🏃 <b>АтлетикПро — Бот</b>\n\n' +
      'Добавляйте данные в систему прямо из Telegram.\n\n' +
      '🏃 <b>Спортсмен</b> — добавить спортсмена\n' +
      '👨‍🏫 <b>Тренер</b> — добавить тренера\n' +
      '🧾 <b>Расход</b> — добавить расход\n' +
      '📋 <b>Список</b> — последние спортсмены\n' +
      '🔍 <b>Поиск</b> — найти спортсмена',
      mainMenu()
    );
    return;
  }

  if (text === '/cancel' || text === '❌ Отмена') {
    sessions[chatId] = null;
    await send(chatId, '❌ Отменено.', mainMenu());
    return;
  }

  if (text === '/help' || text === '❓ Помощь') {
    await send(chatId,
      '❓ <b>Помощь</b>\n\n' +
      '/start — главное меню\n' +
      '/athlete — добавить спортсмена\n' +
      '/coach — добавить тренера\n' +
      '/expense — добавить расход\n' +
      '/list — список спортсменов\n' +
      '/search Имя — поиск спортсмена\n' +
      '/cancel — отменить текущее действие\n' +
      '/skip — пропустить необязательное поле',
      mainMenu()
    );
    return;
  }

  // ── Start flows ──
  if (['/athlete', '🏃 Спортсмен'].includes(text)) {
    sessions[chatId] = { flow: 'athlete', step: 0, data: {}, meta: {} };
    await send(chatId, FLOWS.athlete.steps[0].prompt, noKeyboard());
    return;
  }

  if (['/coach', '👨‍🏫 Тренер'].includes(text)) {
    sessions[chatId] = { flow: 'coach', step: 0, data: {}, meta: {} };
    await send(chatId, FLOWS.coach.steps[0].prompt, noKeyboard());
    return;
  }

  if (['/expense', '🧾 Расход'].includes(text)) {
    sessions[chatId] = {
      flow: 'expense', step: 0,
      data: { date: new Date().toISOString().slice(0, 10) },
      meta: {},
    };
    await send(chatId, FLOWS.expense.steps[0].prompt, noKeyboard());
    return;
  }

  // ── List ──
  if (['/list', '📋 Список'].includes(text)) {
    try {
      const athletes = await apiGet('athletes');
      if (!athletes.length) {
        await send(chatId, '📋 Спортсменов пока нет.', mainMenu());
        return;
      }
      const list = athletes.slice(-10).reverse()
        .map((a, i) => `${i + 1}. <b>${a.name}</b>${a.spec ? ' — ' + a.spec : ''}`)
        .join('\n');
      await send(chatId, `📋 <b>Последние спортсмены:</b>\n\n${list}`, mainMenu());
    } catch {
      await send(chatId, '❌ Сервер не отвечает. Убедитесь что запущен node server.js', mainMenu());
    }
    return;
  }

  // ── Search ──
  if (text === '🔍 Поиск' || text === '/search') {
    sessions[chatId] = { flow: 'search', step: 0 };
    await send(chatId, '🔍 Введите имя для поиска:', noKeyboard());
    return;
  }

  if (text.startsWith('/search ')) {
    const q = text.slice(8).toLowerCase();
    await doSearch(chatId, q);
    return;
  }

  // ── Continue active session ──
  if (sess?.flow === 'search') {
    await doSearch(chatId, text.toLowerCase());
    sessions[chatId] = null;
    return;
  }

  if (sess?.flow) {
    await continueFlow(chatId, text, sess);
    return;
  }

  // No active session
  await send(chatId, 'Используйте кнопки меню ниже 👇', mainMenu());
}

// ── Search ────────────────────────────────────────────────
async function doSearch(chatId, query) {
  try {
    const athletes = await apiGet('athletes');
    const coaches  = await apiGet('coaches');
    const found = athletes.filter(a =>
      (a.name || '').toLowerCase().includes(query) ||
      (a.spec || '').toLowerCase().includes(query)
    );
    if (!found.length) {
      await send(chatId, `🔍 По запросу «${query}» ничего не найдено.`, mainMenu());
      return;
    }
    const list = found.slice(0, 8).map(a => {
      const coach = coaches.find(c => c.id === a.coachId);
      return `👤 <b>${a.name}</b>\n` +
        (a.spec   ? `   🏅 ${a.spec}\n`   : '') +
        (a.phone  ? `   📞 ${a.phone}\n`  : '') +
        (coach    ? `   👨‍🏫 ${coach.name}\n` : '') +
        (a.rank   ? `   🎖 ${a.rank}\n`   : '');
    }).join('\n');
    await send(chatId, `🔍 Найдено: <b>${found.length}</b>\n\n${list}`, mainMenu());
  } catch {
    await send(chatId, '❌ Сервер не отвечает.', mainMenu());
  }
}

// ── Flow: continue step ───────────────────────────────────
async function continueFlow(chatId, text, sess) {
  const flow   = FLOWS[sess.flow];
  const step   = flow.steps[sess.step];
  const isSkip = text === '/skip';

  if (step.required && isSkip) {
    await send(chatId, `⚠️ Это поле обязательное. Введите <b>${step.key}</b>:`);
    return;
  }

  // Expense category — show buttons
  if (sess.flow === 'expense' && sess.step === 2) {
    await send(chatId, step.prompt,
      inline(EXPENSE_CATS.map(([label, val]) => [{ text: label, callback_data: 'cat:' + val }]))
    );
    return;
  }

  // Save value
  if (!isSkip) {
    sess.data[step.key] = text;
  }

  sess.step++;
  sessions[chatId] = sess;

  if (sess.step < flow.steps.length) {
    await send(chatId, flow.steps[sess.step].prompt);
  } else {
    await finishFlow(chatId, sess);
  }
}

// ── Flow: callback (inline button press) ─────────────────
async function handleCallback(cb) {
  const chatId = cb.message.chat.id;
  const data   = cb.data;
  const sess   = sessions[chatId];

  await tg('answerCallbackQuery', { callback_query_id: cb.id });

  // Expense category selected
  if (data.startsWith('cat:') && sess?.flow === 'expense') {
    const cat = data.slice(4);
    sess.data.cat = cat;
    sess.step++;
    sessions[chatId] = sess;

    // Remove inline keyboard
    await tg('editMessageReplyMarkup', {
      chat_id: chatId, message_id: cb.message.message_id,
      reply_markup: { inline_keyboard: [] },
    });

    if (sess.step < FLOWS.expense.steps.length) {
      await send(chatId, FLOWS.expense.steps[sess.step].prompt);
    } else {
      await finishFlow(chatId, sess);
    }
  }
}

// ── Flow: finish & save ───────────────────────────────────
async function finishFlow(chatId, sess) {
  try {
    const flow = FLOWS[sess.flow];
    const item = { id: uid(), ...sess.data };

    // Resolve athlete name → ID for expenses
    if (sess.flow === 'expense' && item.athName) {
      const athletes = await apiGet('athletes');
      const q = item.athName.toLowerCase();
      const ath = athletes.find(a => (a.name || '').toLowerCase().includes(q));
      if (ath) {
        item.athId = ath.id;
        sess.meta.athName = ath.name;
      } else {
        item.athId = '';
        sess.meta.athName = item.athName + ' (не найден в базе)';
      }
      delete item.athName;
    }

    await apiPost(flow.section, item);
    sessions[chatId] = null;

    const confirmText = flow.confirm(item, sess.meta) +
      '\n\n<i>Данные добавлены. Обновите страницу в браузере.</i>';

    await send(chatId, confirmText, mainMenu());
  } catch (e) {
    console.error('finishFlow error:', e.message);
    await send(chatId, '❌ Ошибка при сохранении. Проверьте что server.js запущен.', mainMenu());
    sessions[chatId] = null;
  }
}

// ── Polling ───────────────────────────────────────────────
let offset = 0;

async function poll() {
  try {
    const r = await fetch(
      `${TG}/getUpdates?offset=${offset}&timeout=25` +
      `&allowed_updates=${encodeURIComponent(JSON.stringify(['message','callback_query']))}`
    );
    const d = await r.json();
    if (d.ok && d.result?.length) {
      for (const upd of d.result) {
        offset = upd.update_id + 1;
        handleUpdate(upd).catch(e => console.error('Handler error:', e.message));
      }
    }
  } catch (e) {
    console.error('Poll error:', e.message);
  }
  setTimeout(poll, 1000);
}

// ── Start ─────────────────────────────────────────────────
console.log('');
console.log('  🤖  Telegram Bot запускается...');
console.log('');

// Verify token
tg('getMe').then(me => {
  if (!me.ok) {
    console.error('  ❌  Неверный токен! Проверьте config.json');
    process.exit(1);
  }
  console.log(`  ✅  Бот запущен: @${me.result.username}`);
  console.log('  📱  Найдите бота в Telegram и отправьте /start');
  console.log('  🛑  Остановить: Ctrl + C');
  console.log('');
  poll();
});
