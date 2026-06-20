# syntax=docker/dockerfile:1
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

COPY config/ ./config/
COPY entrypoint.py ./

EXPOSE 8800

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8800/agents')" || exit 1

CMD ["python", "entrypoint.py"]
