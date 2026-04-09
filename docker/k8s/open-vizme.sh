#!/usr/bin/env bash
set -euo pipefail

if ! command -v minikube >/dev/null 2>&1; then
  echo "minikube not found in PATH" >&2
  exit 1
fi

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl not found in PATH" >&2
  exit 1
fi

echo "Starting ingress proxy (keep this running)."
echo "When you see a URL like http://127.0.0.1:43021, open:"
echo "  http://vizme.local:43021"
echo

minikube service -n ingress-nginx ingress-nginx-controller --url

