"""STT-сервис Task Trek: расшифровка голосовых (Whisper, локально на VPS).

POST /transcribe — тело запроса: аудиофайл как есть (ogg/opus от Telegram,
m4a, wav — PyAV разбирает сам). Ответ: {"text": "..."}.
"""
import io
import logging
import os

from flask import Flask, jsonify, request
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO, format="[stt] %(message)s")
log = logging.getLogger(__name__)

MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")

log.info("загружаю модель %s…", MODEL_NAME)
model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
log.info("модель готова")

app = Flask(__name__)


@app.get("/health")
def health():
    return jsonify(ok=True, model=MODEL_NAME)


@app.post("/transcribe")
def transcribe():
    audio = request.get_data()
    if not audio:
        return jsonify(error="пустое тело запроса"), 400
    segments, info = model.transcribe(
        io.BytesIO(audio),
        language=os.environ.get("WHISPER_LANGUAGE", "ru"),
        beam_size=1,
        vad_filter=True,
    )
    text = " ".join(seg.text.strip() for seg in segments).strip()
    log.info("расшифровано %.1fs → «%s»", info.duration, text[:80])
    return jsonify(text=text, duration=info.duration)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8081)
