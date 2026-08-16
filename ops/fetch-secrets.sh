#!/usr/bin/env sh
set -eu
umask 077
mkdir -p /run/propcompare
gcloud secrets versions access latest --secret=propcompare-web-env > /run/propcompare/web.env
gcloud secrets versions access latest --secret=propcompare-ocr-env > /run/propcompare/ocr.env
chmod 600 /run/propcompare/web.env /run/propcompare/ocr.env
