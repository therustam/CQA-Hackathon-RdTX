# CQA — правила для Codex

Прототип оценки качества чатов и звонков операторов (Freedom Broker, хакатон). План: docs/PLAN.md. Решения: docs/decisions.md. Чек-лист: docs/checklist.pdf. Продукт и дизайн: PRODUCT.md, .impeccable/surfaces/.

## Жёсткие правила
1. LLM возвращает только сырые ответы/ступени, пояснения, evidence_ids, checked_range, na_reason, confidence (contracts/llm_output.schema.json). Баллы, секции, итог и пересчёт после апелляции считает только app/scorer.py (чистая функция).
2. Никаких ID, названий или правил критериев в коде: только в contracts/default_checklist.json и в сохранённых версиях чек-листа. Промпт компилирует app/prompt.py. Тест test_no_criterion_wording_in_code это проверяет.
3. Округление итога: Decimal + ROUND_HALF_UP (70,5 из 80 → 88,13). Если все взвешенные критерии N/A — итога нет. Флаг (тип flag) — без баллов.
4. Результат ИИ никогда не перезаписывается; решение проверяющего — override в таблице appeals.
5. Оценивается участок оператора, но модели передаётся весь диалог (бот и система — контекст). См. docs/PLAN.md 1.8.
6. Секреты только в .env; не коммитить, не печатать. data/ и docs/source/ в .gitignore (реальные звонки и подписанные ссылки). Обновлять .env.example.
7. Без React, сборщиков, Docker, RAG. Фронтенд: web/ — чистые HTML/CSS/JS-модули, точка монтирования cqa-root, префикс классов cqa-, конфигурация { apiBaseUrl }.
8. Бэкенд: Python 3.11+, FastAPI, Pydantic, SQLite (app/db.py), pytest. Даты — datetime.fromisoformat.
9. Каждая задача заканчивается `python -m pytest -q` и коротким отчётом: что сделано, как проверено, что не получилось.

## Команды
- Запуск: `python -m uvicorn app.main:app --reload` → http://127.0.0.1:8000
- Тесты: `python -m pytest -q`
- Точность против эталона: `python -m scripts.bench --out docs/eval_report.md`
