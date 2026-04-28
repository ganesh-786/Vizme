"""Smoke demo for Vizme Python SDK.

Usage:
  export VIZME_API_KEY=<your_api_key>"
  export VIZME_ENDPOINT=<your_endpoint>
  python smoke_demo.py
"""

import os
import time
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

from vizme import Metric, VizmeClient


def main() -> None:
    api_key = os.getenv("VIZME_API_KEY")
    endpoint = os.getenv("VIZME_ENDPOINT")

    if not api_key:
        raise SystemExit("VIZME_API_KEY is required")

    client = VizmeClient(api_key=api_key, endpoint=endpoint)
    now = int(time.time())

    response = client.send_batch(
        [
            Metric(
                name="test_metric_main",
                metric_type="counter",
                value=1,
                labels={"source": "pyLibrary", "run_ts": str(now)},
                operation="increment",
            ),
            Metric(
                name="test_metric_secondary",
                metric_type="gauge",
                value=42,
                labels={"source": "pyLibrary", "run_ts": str(now)},
                operation="set",
            ),
        ]
    )

    print("Ingestion response:", response)
    print("Now check dashboard for metrics: python_smoke_counter / python_smoke_gauge")


if __name__ == "__main__":
    main()
