import subprocess
import sys
import unittest
from pathlib import Path


STAGE7_ROOT = Path(__file__).resolve().parent


class VerifyEnvironmentTest(unittest.TestCase):
    def test_cpu_smoke_command_passes_in_the_active_python_environment(self):
        result = subprocess.run(
            [sys.executable, str(STAGE7_ROOT / "verify_environment.py")],
            capture_output=True,
            check=False,
            text=True,
        )

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("cpu_smoke: ok", result.stdout)
        self.assertIn("cuda_smoke: skipped", result.stdout)


if __name__ == "__main__":
    unittest.main()
