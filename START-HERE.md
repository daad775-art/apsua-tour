# Апсуа Тур — инструкция для разработки

Исходный код сайта «Апсуа Тур». Номер сборки в коде — 166: метки `?v=166` в `lib/site-shell.ts` и последняя запись `SITE_CHANGELOG` (23.8). Номер публикации Sites фиксирует Codex при публикации; сверяйте его с `BUILD-IDENTITY.txt`.

- Рабочий сайт: https://apsua-tour-design.rkviii.chatgpt.site
- Проект Sites: `apsua-tour-design`
- Основная ветка: `main`

## Правила работы

- Создавай отдельную ветку и Pull Request. Не вноси изменения напрямую в `main`.
- Не публикуй сайт. Публикацию после проверки выполняет Codex.
- Не меняй `.openai/hosting.json` и не создавай новый проект.
- Не добавляй в Git токены, ключи, `.env`, `.dev.vars` или другие секреты.
- Не очищай и не заменяй данные D1/R2 содержимым `lib/site-seed.json`.
- Не меняй API-контракты без отдельного задания владельца.
- Не ломай Telegram-вход, push, заявки, диспетчерскую интеграцию, маршруты, редактор, админку и историю изменений.
- Не возвращай удалённую тёмную тему.
- Сохраняй текущий дизайн и анимации, кроме точечных изменений из задания.

## Обязательные проверки

Перед передачей результата выполни:

```bash
npm ci
npm run build
node tests/app-icons.mjs
node tests/rail-motion.mjs
node tests/telegram-login-ui.mjs
node tests/telegram-app.mjs
node tests/telegram-oidc.mjs
node tests/telegram-key-cache.mjs
node tests/telegram-web.mjs
node tests/account-ui.mjs
node tests/account-moderation.mjs
node tests/audit-privacy.mjs
node tests/order-notify.mjs
node tests/theme.mjs
node tests/control-appearance.mjs
node tests/live-updates.mjs
node tests/visual-editor.mjs
node tests/intro.mjs
node tests/push-defaults.mjs
node tests/web-push.mjs
node tests/push-worker.mjs
node tests/push-runtime.mjs
node tests/session-reminders.mjs
npx tsc --noEmit
node tests/deployment-shell.mjs
```

Если хотя бы одна проверка падает, не создавай финальный PR как готовый к публикации. Укажи название теста и полный текст ошибки.

## История изменений

Каждую пользовательскую функцию или исправление добавляй в `SITE_CHANGELOG` в `public/user-app.js`:

- одна цифра после точки; после `18.9` идёт `19.0`;
- фактическая дата изменения;
- автор программных правок — `Руслан`;
- тип: функция, улучшение или исправление;
- важность: важно, обычное или мелкое исправление;
- старые записи не удаляй и не дублируй;
- не упоминай названия чужих компаний как источник визуального стиля.
