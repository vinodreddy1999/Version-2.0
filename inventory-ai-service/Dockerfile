FROM python:3.12-slim

WORKDIR /service
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN groupadd --system inventory-ai \
    && useradd --system --gid inventory-ai --home-dir /service --no-create-home inventory-ai \
    && chown -R inventory-ai:inventory-ai /service

USER inventory-ai

EXPOSE 8100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8100/health').read()"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
