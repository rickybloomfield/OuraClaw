#!/usr/bin/env python3
"""
Regression checks for skills committed in this repository.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from unittest import TestCase, TextTestRunner, defaultTestLoader

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
SKILLS_ROOT = REPO_ROOT / "skills"
SKILL_CREATOR_SCRIPTS = SKILLS_ROOT / "skill-creator" / "scripts"
SKILL_DOC_FILENAME = "SKILL.md"

if str(SKILL_CREATOR_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SKILL_CREATOR_SCRIPTS))

from package_skill import package_skill
from quick_validate import validate_skill


def iter_skill_dirs() -> list[Path]:
    return sorted(skill_md.parent for skill_md in SKILLS_ROOT.glob(f"*/{SKILL_DOC_FILENAME}"))


class TestRepositorySkills(TestCase):
    def test_repository_contains_skills(self) -> None:
        self.assertTrue(iter_skill_dirs(), f"No skills found under {SKILLS_ROOT}")

    def test_all_repository_skills_validate(self) -> None:
        for skill_dir in iter_skill_dirs():
            with self.subTest(skill=skill_dir.name):
                valid, message = validate_skill(skill_dir)
                self.assertTrue(valid, f"{skill_dir.name}: {message}")

    def test_all_repository_skills_package(self) -> None:
        with tempfile.TemporaryDirectory(prefix="test_repo_skills_") as temp_dir:
            output_dir = Path(temp_dir)
            for skill_dir in iter_skill_dirs():
                with self.subTest(skill=skill_dir.name):
                    result = package_skill(skill_dir, output_dir)
                    self.assertIsNotNone(result, f"{skill_dir.name}: packaging failed")
                    self.assertTrue(result.exists(), f"{skill_dir.name}: archive missing")


def main() -> int:
    suite = defaultTestLoader.loadTestsFromTestCase(TestRepositorySkills)
    result = TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
