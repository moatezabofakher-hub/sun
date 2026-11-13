#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
target="$(mktemp -d)"
trap 'rm -rf "$target"' EXIT
javac -d "$target" tests/JavaSyntaxCheck.java
java -cp "$target" JavaSyntaxCheck app/src/main/java/com/sunshine/accounting/MainActivity.java app/src/main/java/com/sunshine/accounting/ReportPdfRenderer.java
