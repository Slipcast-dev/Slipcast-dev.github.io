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

ROOT = Path(__file__).resolve().parents[1]
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
        "Лицензии и авторство / Licenses and attribution: ATTRIBUTION.json and skill files.\n"
    )
    with ZipFile(path, "w") as archive:
        zip_entry(archive, "README.md", readme.encode())
        provenance = [{"skill": skill, "license": license_name, "source_path": origin}
                      for skill, _, license_name, origin in skills]
        zip_entry(archive, "ATTRIBUTION.json", (json.dumps(provenance, indent=2) + "\n").encode())
        for skill, files, _, _ in skills:
            for filename, contents in sorted(files.items()):
                zip_entry(archive, f"skills/{skill}/{filename}", contents)
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def card(
    engine: str,
    category: str,
    titles: tuple[str, str],
    count: int,
    digest: str,
) -> str:
    name = ENGINES[engine][0]
    title_ru, title_en = (escape(title) for title in titles)
    filename = f"{engine}-{category}.zip"
    return (
        f'      <li data-compatibility="{engine}">\n'
        f'        <a class="project-card" href="downloads/skills/{engine}/{category}.zip?v={digest}" download="{filename}">\n'
        f'          <span class="status">{name} · SKILL.md</span>\n'
        f'          <h2 data-skill-title-ru="{title_ru}" data-skill-title-en="{title_en}">{title_ru}</h2>\n'
        f'          <p data-skill-count="{count}">Навыков: {count}</p>\n'
        '          <span class="collection-download" data-i18n="skillDownload">Скачать ZIP</span>\n'
        '        </a>\n'
        '      </li>\n'
    )


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
        ) -> None:
            if not SLUG.fullmatch(name):
                raise ValueError(f"Unexpected skill identifier: {name}")
            files = read_skill(directory)
            reason = review_reason(files)
            if reason:
                counters[engine, reason] += 1
                return
            frontmatter, body = split_frontmatter(files["SKILL.md"].decode("utf-8-sig"))
            license_name = copy_known_license(files, frontmatter, body, counterpart)
            if not license_name:
                counters[engine, "license_not_found"] += 1
                return
            if engine == "codex":
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

        destination = args.destination
        destination.mkdir(parents=True, exist_ok=False)
        cards = []
        for engine, categories in (("codex", codex_categories), ("claude", claude_categories)):
            print(engine, {status: count for (scope, status), count in counters.items() if scope == engine})
            for slug, titles in sorted(categories.items(), key=lambda entry: entry[1][0].casefold()):
                skills = packages.get((engine, slug), [])
                if skills:
                    digest = export_category(destination / "skills", engine, slug, titles, skills)
                    cards.append(card(engine, slug, titles, len(skills), digest))
                print(f"  {slug}: {len(skills)}")
        (destination / "cards.html").write_text("".join(cards), encoding="utf-8")
        if args.install:
            install_generated(destination)


if __name__ == "__main__":
    main()
