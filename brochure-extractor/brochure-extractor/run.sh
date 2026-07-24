#!/usr/bin/env bash
set -e
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt
[ -f .env ] && export $(grep -v '^#' .env | xargs -d '\n')
exec uvicorn brochure_extractor.api:app --host 0.0.0.0 --port ${PORT:-8000} --reload
