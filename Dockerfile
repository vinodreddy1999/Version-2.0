FROM node:22-alpine AS frontend-build

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run lint && npm run test:v2 && npm run build

FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DATABASE_URL=sqlite:////data/metam.db

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY scripts ./scripts
COPY --from=frontend-build /frontend/dist ./frontend/dist

RUN mkdir -p /data \
    && groupadd --gid 10001 metam \
    && useradd --uid 10001 --gid metam --home-dir /app --no-create-home metam \
    && chown -R metam:metam /app /data

USER metam

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health').read()"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
