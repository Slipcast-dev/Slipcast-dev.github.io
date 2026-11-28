"""Рекомендации по моделям для публикуемых SKILL.md Codex и Claude Code."""

from __future__ import annotations

import re

START = b"<!-- slipcast-model-profile:start -->"
END = b"<!-- slipcast-model-profile:end -->"
FRONTMATTER = re.compile(rb"\A(?:\xef\xbb\xbf)?---\r?\n.*?^---[ \t]*\r?\n", re.M | re.S)

# Используются названия из селекторов. Подсказки не меняют конфигурацию сессии.
MODELS = {
    "codex": {
        "quick": "GPT-6 Luna", "standard": "GPT-6.2 Sol", "visual": "GPT-6.1 Terra",
        "deep": "GPT-6.2 Astra", "flagship": "GPT-6.2 Astra",
    },
    "claude": {
        "quick": "Claude Haiku 5.5", "standard": "Claude Sonnet 5.5", "visual": "Claude Sonnet 5.5",
        "deep": "Claude Opus 5.5", "flagship": "Claude Fable 5.2",
    },
}
DOCS = {
    "codex": ("https://learn.chatgpt.com/docs/models", "https://learn.chatgpt.com/docs/build-skills"),
    "claude": ("https://code.claude.com/docs/en/model-config", "https://code.claude.com/docs/en/skills"),
}
FAMILIES = {
    "engineering": {"development", "devops-cloud", "testing-quality", "software-engineering", "agents-ai", "ai-agents"},
    "defensive": {"security-privacy", "security-compliance"},
    "analysis": {"data-analytics", "industry-operations", "education-learning", "education-research"},
    "sensitive": {"finance-personal", "personal-finance", "health-care", "health-wellness", "legal-compliance", "legal-government"},
    "visual": {"design-creative", "product-design"},
    "writing": {"writing-communication", "marketing-growth", "marketing-sales", "sales-customer"},
    "planning": {"management-operations", "business-leadership", "business-strategy", "people-career", "people-leadership",
                 "product-strategy", "thinking-decisions"},
    "routine": {"home-family", "personal-life", "productivity-tools", "productivity", "travel-lifestyle"},
}
FAMILY_BY_CATEGORY = {category: family for family, categories in FAMILIES.items() for category in categories}
CHECKS = {
    "engineering": ("Открой относящиеся к задаче файлы, сохрани существующие контракты и проверь изменённый сценарий.",
                    "Read relevant files, preserve existing contracts, and verify the affected workflow."),
    "defensive": ("Ограничься защитной проверкой предоставленных материалов. Указывай подтверждения и меры исправления.",
                  "Keep the work to a defensive review of supplied materials. Report evidence and remediation."),
    "analysis": ("Сохрани ссылки на источники и единицы измерения. Проверь итоги на контрольном примере.",
                 "Preserve source references and units. Validate totals against a reference example."),
    "sensitive": ("Разделяй подтверждённые факты и допущения. Отметь вопросы, требующие проверки специалистом.",
                  "Separate verified facts from assumptions. Flag questions that require review by a qualified professional."),
    "visual": ("Сверяй результат с референсом и целевым форматом. Отметь визуальные детали, которые не удалось проверить.",
               "Compare the result with the reference and target format. Flag visual details you could not verify."),
    "writing": ("Сохрани факты, аудиторию и нужный тон. Сверь итог с требованиями к формату.",
                "Preserve facts, audience, and tone. Check the result against the required format."),
    "planning": ("Отделяй решения от допущений и укажи зависимости, критерии выбора и следующий шаг.",
                 "Separate decisions from assumptions. State dependencies, decision criteria, and the next step."),
    "routine": ("Сохрани заданные ограничения. Дай конкретный следующий шаг и отметь недостающие данные.",
                "Keep the stated constraints. Give a concrete next step and identify missing inputs."),
}
VISUAL = re.compile(r"(?:^|-)(?:screenshot|visual|thumbnail|slide|storyboard|image|illustration|photo|ux|chart)(?:-|$)")
FOCUSED = re.compile(r"(?:^|-)(?:summary|summarizer|checklist|formatter|shortener|classifier|extractor)(?:-|$)")
COMPLEX = re.compile(r"(?:^|-)(?:architecture|architect|migration|debugging|incident|review|audit|strategy|forecast)(?:-|$)")
RUSSIAN_LETTER = re.compile(r"[А-Яа-яЁё]")

EFFORT = {
    "quick": ("Выполни один ограниченный шаг и сверяй результат с ожидаемым форматом.",
              "Complete one bounded step and verify the expected output format."),
    "standard": ("Разбей работу на проверяемые шаги и сообщи о результатах проверок.",
                 "Break the work into verifiable steps and report check results."),
    "visual": ("Привязывай выводы к конкретной области изображения или документа.",
               "Ground conclusions in a specific region of the image or document."),
    "deep": ("Сравни варианты, проверь пограничные случаи и укажи остаточные риски.",
             "Compare options, check edge cases, and state the remaining risks."),
}


def recommended_profile(category: str, skill: str) -> tuple[str, str]:
    """Сначала учитывает предметную область, затем характер конкретного навыка."""
    family = FAMILY_BY_CATEGORY[category]
    if family in {"defensive", "sensitive"} or COMPLEX.search(skill):
        return "deep", family
    if VISUAL.search(skill):
        return "visual", family
    if FOCUSED.search(skill):
        return "quick", family
    return "standard", family


def optimize_skill(original: bytes, engine: str, category: str, skill: str) -> bytes:
    """Добавляет модельную подсказку после YAML и сохраняет исходные байты."""
    front = FRONTMATTER.match(original)
    if not front:
        raise ValueError(f"No complete frontmatter in {engine}/{category}/{skill}")
    if START in original or END in original:
        raise ValueError(f"Duplicate model guidance in {engine}/{category}/{skill}")
    name = "Codex" if engine == "codex" else "Claude Code"
    profile, family = recommended_profile(category, skill)
    models = MODELS[engine]
    sample = original[front.end():].decode("utf-8")[:2400]
    russian = len(RUSSIAN_LETTER.findall(sample)) > sum(c.isascii() and c.isalpha() for c in sample) / 3
    preferred, flagship = models[profile], models["flagship"]
    if russian:
        heading = f"## Выполнение в {name}"
        model_line = f"Рекомендуемая модель: **{preferred}**. Для более сложного случая вручную выберите **{flagship}** в /model, если она доступна."
        if preferred == flagship:
            model_line = f"Рекомендуемая модель для сложной проверки: **{flagship}**. Для узкого случая подойдёт **{models['standard']}**."
        runtime = ("Работай в текущей модели Codex и загружай только нужные разделы."
                   if engine == "codex" else
                   "Используй доступные инструменты Claude Code. Меняй модель или разрешения только по запросу пользователя.")
        effort, check = EFFORT[profile][0], CHECKS[family][0]
    else:
        heading = f"## Running this skill in {name}"
        model_line = f"Suggested model: **{preferred}**. For a more complex case, select **{flagship}** in /model if available."
        if preferred == flagship:
            model_line = f"Use **{flagship}** for complex verification or **{models['standard']}** for a narrowly scoped case."
        runtime = ("Use the active Codex model and load only relevant sections."
                   if engine == "codex" else
                   "Use the available Claude Code tools. Change models or permissions only at the user's request.")
        effort, check = EFFORT[profile][1], CHECKS[family][1]
    block = ("\n" + START.decode() + f"\n{heading}\n\n- {model_line}\n- {runtime} {effort}\n- {check}\n"
             + END.decode() + "\n\n").encode()
    if original[:front.end()].endswith(b"\r\n"):
        block = block.replace(b"\n", b"\r\n")
    return original[:front.end()] + block + original[front.end():]


def model_guide(engine: str, category: str) -> str:
    models = MODELS[engine]
    model_docs, skill_docs = DOCS[engine]
    ru, en = CHECKS[FAMILY_BY_CATEGORY[category]]
    return (
        "# Модели / Models\n\n"
        "Выберите модель в своей сессии. Доступ зависит от клиента, тарифа и организации.\n\n"
        "Choose a model in your session. Availability depends on your client, plan, and organization.\n\n"
        "| Задача / Work | Рекомендуемая модель / Suggested model |\n| --- | --- |\n"
        f"| Короткий шаг / Focused task | {models['quick']} |\n"
        f"| Обычная работа / Everyday work | {models['standard']} |\n"
        f"| Изображения и интерфейс / Images and UI | {models['visual']} |\n"
        f"| Глубокая проверка / In-depth review | {models['deep']} |\n"
        f"| Сложная задача / Flagship workflow | {models['flagship']} |\n\n"
        f"{ru}\n\n{en}\n\n[Модели / Models]({model_docs}) · [Скиллы / Skills]({skill_docs})\n"
    )
