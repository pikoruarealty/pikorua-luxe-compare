FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY brochure_extractor ./brochure_extractor
ENV IMAGE_OUT_DIR=/app/extracted_images
RUN mkdir -p /app/extracted_images

EXPOSE 8000
CMD ["uvicorn", "brochure_extractor.api:app", "--host", "0.0.0.0", "--port", "8000"]
