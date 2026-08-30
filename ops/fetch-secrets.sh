#!/usr/bin/env sh
set -eu
umask 077
mkdir -p /run/propcompare
gcloud secrets versions access latest --secret=propcompare-web-env > /run/propcompare/web.env
gcloud secrets versions access latest --secret=propcompare-ocr-env > /run/propcompare/ocr.env
# The OCR API needs only the private source-bucket name in addition to its own
# secrets, so do not hand it the entire web runtime environment.
if grep '^GCS_PRIVATE_SOURCE_BUCKET=' /run/propcompare/web.env >> /run/propcompare/ocr.env; then :; fi
gcloud secrets versions access latest --secret=propcompare-db-env > /run/propcompare/db.env
chmod 600 /run/propcompare/web.env /run/propcompare/ocr.env /run/propcompare/db.env
