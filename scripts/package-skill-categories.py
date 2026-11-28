"""Подготовка тематических ZIP и карточек из двух исходных коллекций."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
from html import escape
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from skill_model_profiles import model_guide, optimize_skill

ROOT = Path(__file__).resolve().parents[1]
PROJECT_SKILLS = {
    "project-verification": ("Проверки проектов и совместимости", "Project and compatibility checks"),
    "dev-release-testing": ("Приёмка релиза и диагностика", "Release acceptance and diagnostics"),
    "data-import-testing": ("Тестирование импорта данных", "Data import testing"),
    "web-development": ("Веб-разработка и браузерная приёмка", "Web development and browser acceptance"),
    "web-release-quality": ("Выпуск и производительность сайта", "Website release and performance"),
    "ai-agent-workflows": ("Модели, MCP и рабочие процессы агентов", "Models, MCP and agent workflows"),
    "ai-data-quality": ("Структурированные ответы и качество источников", "Structured outputs and source quality"),
    "editorial-workflows": ("Telegram и проверка источников", "Telegram editing and source verification"),
}
# Общие темы объединяют категории двух платформ и сохраняют адреса ZIP.
TOPICS = (
    ("development", "Разработка и тестирование", "Development and testing",
     {"development", "devops-cloud", "project-verification", "software-engineering", "testing-quality",
      "dev-release-testing", "data-import-testing"}),
    ("web", "Веб-разработка", "Web development", {"web-development", "web-release-quality"}),
    ("ai-data", "ИИ, агенты и данные", "AI, agents and data",
     {"agents-ai", "ai-agents", "data-analytics", "ai-agent-workflows", "ai-data-quality"}),
    ("content-design", "Дизайн, тексты и контент", "Design, writing and content",
     {"design-creative", "product-design", "writing-communication", "editorial-workflows"}),
    ("business", "Бизнес, продукт и карьера", "Business, product and careers",
     {"business-leadership", "business-strategy", "industry-operations", "management-operations",
      "marketing-growth", "marketing-sales", "people-career", "people-leadership", "product-strategy",
      "sales-customer"}),
    ("security", "Безопасность и право", "Security and legal",
     {"legal-compliance", "legal-government", "security-compliance", "security-privacy"}),
    ("learning", "Учёба и продуктивность", "Learning and productivity",
     {"education-learning", "education-research", "productivity", "productivity-tools", "thinking-decisions"}),
    ("personal", "Личное, здоровье и финансы", "Personal life, health and finance",
     {"finance-personal", "health-care", "health-wellness", "home-family", "personal-finance",
      "personal-life", "travel-lifestyle"}),
)
PROJECT_SUMMARIES = {
    "project-verification": (
        "Совместимость скиллов, установщики, скриншоты, офлайн-синхронизация, RSS/CSV/JSON",
        "Skill portability, installers, screenshots, offline sync, RSS/CSV/JSON",
    ),
    "dev-release-testing": (
        "Файлы релиза macOS и Windows, восстановление копий, диагностика Telegram-бота",
        "macOS and Windows release files, backup restores, Telegram bot diagnostics",
    ),
    "data-import-testing": ("Тестовые CSV и JSON, сверка импорта", "CSV and JSON fixtures, import reconciliation"),
    "web-development": (
        "Компоненты, доступность в браузере, проверка контракта веб-API",
        "Components, browser accessibility, web API contract checks",
    ),
    "web-release-quality": (
        "Статический сайт, проверка сборки и бюджет производительности",
        "Static site release, build verification and performance budgets",
    ),
    "ai-data-quality": (
        "Проверка схемы ответа и качества источников для поиска с генерацией (RAG)",
        "Response schema and source quality checks for retrieval-augmented generation (RAG)",
    ),
    "ai-agent-workflows": (
        "Совместимость MCP, проверка промптов на разных моделях, передача задач между агентами",
        "MCP compatibility, prompt regression across models, agent handoffs",
    ),
    "editorial-workflows": (
        "Посты и дайджесты Telegram, проверка цитат и ссылок",
        "Telegram posts and digests, quotation and link verification",
    ),
}
# Рекомендуемые шаги для задач с несколькими скиллами.
WORKFLOWS = {
    "data-import-testing": ("synthetic-import-fixtures", "import-reconciliation"),
    "web-development": ("frontend-component-contract", "web-api-consumer-contract", "browser-accessibility-acceptance"),
    "ai-agent-workflows": ("mcp-tool-contract-check", "prompt-model-regression", "agent-handoff-evidence"),
    "editorial-workflows": ("quotation-source-verification", "telegram-editorial-adaptation"),
    "web-release-quality": ("static-site-release-check", "web-performance-budget-check"),
    "ai-data-quality": ("structured-output-schema-check", "retrieval-source-quality-check"),
}
ENGINES = {"codex": ("Codex", ".agents"), "claude": ("Claude Code", ".claude")}
SLUG = re.compile(r"[a-z0-9][a-z0-9-]*")
LICENSE_DECLARATION = re.compile(
    r"""^license:\s*['"]?(MIT|Apache-2\.0)['"]?\s*(?:\#.*)?$""", re.MULTILINE
)
EXCLUDE = re.compile(
    r"\b(?:pentest(?:ing)?|penetration test(?:ing)?|offensive cyber(?:security)?|"
    r"attack (?:framework|workflow|automation|simulation|planning)|"
    r"exploit(?:s|ation|able|ing)?|shellcode|reverse shell|bind shell|"
    r"meterpreter|metasploit|cobalt strike|mimikatz|credential dump(?:ing)?|"
    r"password crack(?:ing|er)?|keylogg(?:er|ing)|privilege escalat(?:ion|e)|"
    r"remote code execution|arbitrary code execution|vulnerability reproduction|"
    r"zero[- ]day|0[- ]day|CVE-\d{4}-\d+|proof.of.concept.{0,30}vulnerab|"
    r"phishing|malware|ransomware|botnet|DDoS|port scan(?:ning)?|"
    r"nmap|sqlmap|burp suite|nikto|webshell|jailbreak|"
    r"(?:bypass|evad\w*)\s+(?:security|screening|detection|auth\w*|guardrail\w*)|"
    r"virology|viral engineering|biosecurity|bioweapon\w*|"
    r"DNA synthesis|gene synthesis|CRISPR|gain.of.function|pathogen\w*|"
    r"weapon\w*|bomb.making|explosive device|improvised explosive)\b|"
    r"\b(?:эксплойт\w*|пентест\w*|выгрузка учетных данных|виролог\w*|"
    r"биооруж\w*|патоген\w*|синтез ДНК|оружи\w*|взрывн\w+ устройств\w*)\b",
    re.IGNORECASE,
)


def unpack_zip(archive: Path, destination: Path) -> None:
    """Проверяет все пути до распаковки и сохраняет только обычные файлы."""
    seen: set[PurePosixPath] = set()
    with ZipFile(archive) as source:
        members = source.infolist()
        if len(members) > 20_000 or sum(item.file_size for item in members) > 250_000_000:
            raise ValueError(f"Unexpected archive size: {archive.name}")
        for item in members:
            path = PurePosixPath(item.filename)
            mode = stat.S_IFMT(item.external_attr >> 16)
            if (
                path.is_absolute()
                or not path.parts
                or ".." in path.parts
                or "\\" in item.filename
                or ":" in item.filename
                or mode not in (0, stat.S_IFREG, stat.S_IFDIR)
                or path in seen
            ):
                raise ValueError(f"Unexpected archive member: {item.filename}")
            seen.add(path)
        source.extractall(destination)


def markdown_title(path: Path) -> str:
    return next(line[2:] for line in path.read_text(encoding="utf-8").splitlines() if line.startswith("# "))


def split_frontmatter(text: str) -> tuple[str, str]:
    match = re.match(r"\A---\r?\n(.*?)\r?\n---\r?\n(.*)", text, re.DOTALL)
    return (match[1], match[2]) if match else ("", text)


def skill_description(contents: bytes) -> str:
    """Берёт текст описания из поддерживаемых форматов заголовка SKILL.md."""
    frontmatter, _ = split_frontmatter(contents.decode("utf-8-sig"))
    match = re.search(r"^description:[ \t]*(.*)((?:\n[ \t]+[^\n]*)*)", frontmatter, re.MULTILINE)
    if not match:
        return ""
    first, continuation = match.groups()
    value = " ".join((first.strip() if not first.startswith((">", "|")) else "", continuation.strip())).strip()
    if value.startswith('"') and value.endswith('"'):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            value = value[1:-1]
    elif value.startswith("'") and value.endswith("'"):
        value = value[1:-1].replace("''", "'")
    return " ".join(value.split())


def license_files(files: dict[str, bytes]) -> dict[str, bytes]:
    return {
        name: contents
        for name, contents in files.items()
        if "/" not in name and name.upper().split(".")[0] in {"LICENSE", "LICENCE", "COPYING"}
    }


def license_kind(files: dict[str, bytes], frontmatter: str) -> str | None:
    for contents in license_files(files).values():
        text = contents.lower()
        if b"permission is hereby granted, free of charge" in text:
            return "MIT"
        if b"apache license" in text and b"version 2.0" in text:
            return "Apache-2.0"
    match = LICENSE_DECLARATION.search(frontmatter)
    return match[1] if match else None


def read_skill(directory: Path) -> dict[str, bytes]:
    return {
        path.relative_to(directory).as_posix(): path.read_bytes()
        for path in sorted(directory.rglob("*"))
        if path.is_file()
    }


def review_reason(files: dict[str, bytes]) -> str | None:
    """Исключает материалы с признаками опасных сценариев и непрозрачные вложения."""
    for name, contents in files.items():
        if EXCLUDE.search(name):
            return "excluded_content"
        try:
            text = contents.decode("utf-8-sig")
        except UnicodeDecodeError:
            return "unreviewed_binary"
        if "\x00" in text:
            return "unreviewed_binary"
        if EXCLUDE.search(text):
            return "excluded_content"
    return None


def codex_catalog(source: Path) -> tuple[dict[str, tuple[str, str]], list[dict]]:
    rows = json.loads((source / "catalog/skills.json").read_text(encoding="utf-8"))["skills"]
    slugs = sorted({row["category"] for row in rows})
    if any(not SLUG.fullmatch(slug) for slug in slugs):
        raise ValueError("Unexpected Codex category identifier")
    categories = {
        slug: (
            markdown_title(source / f"categories/{slug}.md"),
            markdown_title(source / f"categories/{slug}.en.md"),
        )
        for slug in slugs
    }
    return categories, rows


def copy_known_license(
    files: dict[str, bytes],
    frontmatter: str,
    body: str,
    counterpart: dict[str, bytes] | None,
) -> str | None:
    explicit_license = license_kind(files, frontmatter)
    if explicit_license:
        return explicit_license
    if counterpart is None:
        return None
    copied = license_files(counterpart)
    template = counterpart.get("WORKFLOW.md", b"").decode("utf-8-sig")
    excluded = {"SKILL.md", *license_files(files)}
    # Лицензию из парного архива можно перенести только для совпадающих материалов.
    if copied and template.strip() == body.strip() and all(
        counterpart.get(name) == contents for name, contents in files.items() if name not in excluded
    ):
        kind = license_kind(counterpart, "")
        if kind:
            files.update(copied)
            return kind
    return None


def zip_entry(archive: ZipFile, name: str, contents: bytes) -> None:
    entry = ZipInfo(name)
    entry.create_system = 3
    entry.external_attr = 0o100644 << 16
    archive.writestr(entry, contents, compress_type=ZIP_DEFLATED, compresslevel=6)


def export_category(
    output: Path,
    engine: str,
    category: str,
    titles: tuple[str, str],
    skills: list[tuple[str, dict[str, bytes], str, str]],
) -> str:
    if not SLUG.fullmatch(category):
        raise ValueError(f"Unexpected category identifier: {category}")
    name, config_dir = ENGINES[engine]
    path = output / engine / (category + ".zip")
    path.parent.mkdir(parents=True, exist_ok=True)
    russian, english = titles
    readme = (
        f"# {russian} / {english} · {name}\n\n"
        f"Перенесите нужные папки из skills/ в {config_dir}/skills/ проекта или домашней папки.\n\n"
        f"Copy the skill folders you need from skills/ to {config_dir}/skills/ in your project or home directory.\n\n"
        "Рекомендации по моделям / Model guidance: [MODEL_GUIDE.md](MODEL_GUIDE.md).\n\n"
        "Лицензии и авторство / Licenses and attribution: ATTRIBUTION.json and skill files.\n"
    )
    if category in PROJECT_SUMMARIES and category != "project-verification":
        summary_ru, summary_en = PROJECT_SUMMARIES[category]
        readme += f"## Состав / Contents\n\n{summary_ru}.\n\n{summary_en}.\n\n"
        order = WORKFLOWS.get(category)
        if order:
            if set(order) != {skill for skill, _, _, _ in skills}:
                raise ValueError(f"Workflow does not cover all skills: {engine}/{category}")
            readme += "Рекомендуемый порядок / Suggested order:\n\n"
            readme += "".join(f"{i}. [{skill}](skills/{skill}/SKILL.md)\n" for i, skill in enumerate(order, 1))
        else:
            readme += "Выберите скилл под задачу / Choose a skill for your task:\n\n"
            readme += "".join(f"- [{skill}](skills/{skill}/SKILL.md)\n" for skill, _, _, _ in skills)
    with ZipFile(path, "w") as archive:
        zip_entry(archive, "README.md", readme.encode())
        zip_entry(archive, "MODEL_GUIDE.md", model_guide(engine, category).encode())
        provenance = [{"skill": skill, "license": license_name, "source_path": origin}
                      for skill, _, license_name, origin in skills]
        zip_entry(archive, "ATTRIBUTION.json", (json.dumps(provenance, indent=2) + "\n").encode())
        for skill, files, _, _ in skills:
            for filename, contents in sorted(files.items()):
                if filename == "SKILL.md":
                    contents = optimize_skill(contents, engine, category, skill)
                zip_entry(archive, f"skills/{skill}/{filename}", contents)
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def card(
    engine: str,
    category: str,
    titles: tuple[str, str],
    count: int,
    digest: str,
    topic: str,
) -> str:
    name = ENGINES[engine][0]
    title_ru, title_en = (escape(title) for title in titles)
    filename = f"{engine}-{category}.zip"
    summary = ""
    if category in PROJECT_SUMMARIES:
        summary_ru, summary_en = (escape(line) for line in PROJECT_SUMMARIES[category])
        summary = (
            f'            <span class="skill-summary" data-skill-title-ru="{summary_ru}" '
            f'data-skill-title-en="{summary_en}">{summary_ru}</span>\n'
        )
    return (
        f'      <li id="collection-{engine}-{category}" data-compatibility="{engine}" data-entry-topic="{topic}" data-collection="{engine}/{category}">\n'
        f'        <a class="skill-entry" href="downloads/skills/{engine}/{category}.zip?v={digest}" download="{filename}">\n'
        '          <div class="skill-entry-title">\n'
        f'            <h3 data-skill-title-ru="{title_ru}" data-skill-title-en="{title_en}">{title_ru}</h3>\n'
        f'{summary}'
        '          </div>\n'
        f'          <span class="skill-engine">{name}</span>\n'
        f'          <p data-skill-count="{count}">Навыков: {count}</p>\n'
        '          <span class="collection-download"><span aria-hidden="true">↓</span> <span data-i18n="skillDownload">Скачать ZIP</span></span>\n'
        '        </a>\n'
        '      </li>\n'
    )


def render_topics(cards: dict[str, list[tuple[str, str]]]) -> str:
    """Группирует готовые строки и сортирует названия внутри каждой темы."""
    sections = []
    for slug, title_ru, title_en, _ in TOPICS:
        if not cards[slug]:
            continue
        rows = "".join(row for _, row in sorted(cards[slug], key=lambda entry: entry[0]))
        sections.append(
            f'      <section class="skill-topic" data-skill-topic="{slug}" aria-labelledby="topic-{slug}">\n'
            f'        <h2 id="topic-{slug}" data-skill-title-ru="{escape(title_ru)}" '
            f'data-skill-title-en="{escape(title_en)}">{escape(title_ru)}</h2>\n'
            '        <ul class="skill-list">\n'
            f'{rows}'
            '        </ul>\n'
            '      </section>\n'
        )
    return "".join(sections)


def install_generated(destination: Path) -> None:
    """Обновляет только каталог тематических ZIP и размеченный блок карточек."""
    page = ROOT / "site/skills-agents.html"
    html = page.read_text(encoding="utf-8")
    start = "      <!-- skill-category-cards:start -->"
    end = "      <!-- skill-category-cards:end -->"
    if html.count(start) != 1 or html.count(end) != 1:
        raise ValueError("Missing or duplicated skill catalog markers")
    before, remainder = html.split(start, 1)
    _, after = remainder.split(end, 1)
    cards = (destination / "cards.html").read_text(encoding="utf-8")
    if not cards:
        raise ValueError("Category catalog is empty")
    downloads = ROOT / "site/downloads/skills"
    for engine in ENGINES:
        staged = destination / "skills" / engine
        target = downloads / engine
        target.mkdir(parents=True, exist_ok=True)
        for archive in staged.glob("*.zip"):
            shutil.copyfile(archive, target / archive.name)
        for archive in target.glob("*.zip"):
            if not (staged / archive.name).is_file():
                archive.unlink()
    shutil.copyfile(destination / "skills-index.json", ROOT / "site/skills-index.json")
    page.write_text(before + start + "\n" + cards + end + after, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--install", action="store_true", help="Обновить карточки и тематические ZIP в репозитории")
    args = parser.parse_args()

    with TemporaryDirectory(prefix="slipcast-skills-") as temporary:
        unpacked = Path(temporary)
        for engine in ENGINES:
            unpack_zip(args.source / f"{engine}-skills.zip", unpacked)

        codex = unpacked / "codex-skills"
        claude = unpacked / "claude-skills"
        codex_categories, codex_rows = codex_catalog(codex)
        claude_categories = {
            slug: (entry["title_ru"], entry["title"])
            for slug, entry in json.loads((claude / "categories.json").read_text(encoding="utf-8")).items()
        }
        packages: dict[tuple[str, str], list[tuple[str, dict[str, bytes], str, str]]] = defaultdict(list)
        counters: Counter[tuple[str, str]] = Counter()
        checked_codex: dict[str, dict[str, bytes]] = {}

        def collect(
            engine: str,
            slug: str,
            name: str,
            directory: Path,
            original: str,
            counterpart: dict[str, bytes] | None = None,
            local: bool = False,
        ) -> None:
            if not SLUG.fullmatch(name):
                raise ValueError(f"Unexpected skill identifier: {name}")
            files = read_skill(directory)
            reason = review_reason(files)
            if reason:
                if local:
                    raise ValueError(f"Local skill {original} failed review: {reason}")
                counters[engine, reason] += 1
                return
            frontmatter, body = split_frontmatter(files["SKILL.md"].decode("utf-8-sig"))
            license_name = copy_known_license(files, frontmatter, body, counterpart)
            if local and not license_name:
                license_name = "NOASSERTION"
            if not license_name:
                counters[engine, "license_not_found"] += 1
                return
            if engine == "codex" and not local:
                checked_codex[name] = files
            packages[engine, slug].append((name, files, license_name, original))
            counters[engine, "included"] += 1

        for row in codex_rows:
            slug, name = row["category"], row["name"]
            if not SLUG.fullmatch(name):
                raise ValueError(f"Unexpected skill identifier: {name}")
            expected = f"skills/{name}"
            if row["path"] != expected:
                raise ValueError(f"Unexpected catalog path: {row['path']}")
            collect("codex", slug, name, codex / expected, expected)

        for slug in claude_categories:
            if not SLUG.fullmatch(slug):
                raise ValueError(f"Unexpected category identifier: {slug}")
            for skill in sorted((claude / "skills" / slug).glob("*/SKILL.md")):
                name = skill.parent.name
                collect(
                    "claude", slug, name, skill.parent, skill.parent.relative_to(claude).as_posix(),
                    checked_codex.get(name),
                )

        # Собственные скиллы хранятся отдельно от исходных коллекций.
        for engine, categories in (("codex", codex_categories), ("claude", claude_categories)):
            for slug, titles in PROJECT_SKILLS.items():
                if slug in categories:
                    raise ValueError(f"Duplicate category: {engine}/{slug}")
                source = ROOT / "content/skills" / engine / slug
                skills = sorted(source.glob("*/SKILL.md"))
                if not skills:
                    raise ValueError(f"No project skills in {source}")
                categories[slug] = titles
                for skill in skills:
                    directory = skill.parent
                    collect(engine, slug, directory.name, directory, directory.relative_to(ROOT).as_posix(), local=True)

        destination = args.destination
        destination.mkdir(parents=True, exist_ok=False)
        topic_by_category = {category: slug for slug, _, _, categories in TOPICS for category in categories}
        if len(topic_by_category) != sum(len(categories) for _, _, _, categories in TOPICS):
            raise ValueError("A skill category belongs to multiple topics")
        cards: dict[str, list[tuple[str, str]]] = defaultdict(list)
        search_index: dict[str, list[tuple[str, str]]] = {}
        for engine, categories in (("codex", codex_categories), ("claude", claude_categories)):
            print(engine, {status: count for (scope, status), count in counters.items() if scope == engine})
            for slug, titles in sorted(categories.items(), key=lambda entry: entry[1][0].casefold()):
                skills = packages.get((engine, slug), [])
                if skills:
                    digest = export_category(destination / "skills", engine, slug, titles, skills)
                    topic = topic_by_category[slug]
                    row = card(engine, slug, titles, len(skills), digest, topic)
                    cards[topic].append((titles[0].casefold(), row))
                    search_index[f"{engine}/{slug}"] = [
                        (skill, skill_description(files["SKILL.md"])) for skill, files, _, _ in skills
                    ]
                print(f"  {slug}: {len(skills)}")
        (destination / "cards.html").write_text(render_topics(cards), encoding="utf-8")
        (destination / "skills-index.json").write_text(
            json.dumps(search_index, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
        )
        if args.install:
            install_generated(destination)


if __name__ == "__main__":
    main()
