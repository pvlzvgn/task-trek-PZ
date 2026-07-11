FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir faster-whisper==1.1.1 flask==3.1.0 requests==2.32.3
COPY app.py .
# модель скачивается при первом старте и кэшируется в volume
EXPOSE 8081
CMD ["python", "app.py"]
