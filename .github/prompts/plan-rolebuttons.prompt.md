## Plan: Transcription Queue + On-Demand Model Downloads

**TL;DR:** Remove the pre-bundled `base.en` model from the Docker image. Models are downloaded on-demand when a user saves a non-disabled config in the dashboard, with live progress via the existing WebSocket system. Transcription requests are queued (max 1 concurrent, unlimited queue) with edit-in-place position updates every 5 seconds. Models persist across rebuilds via an optional Docker volume.

---

### Steps

**1. Remove pre-bundled model from Dockecurl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGVzdA==" http://localhost:3002/rfile**
In Dockerfile, delete the `wget` line that downloads `ggml-base.en.bin` at build time. This shrinks the image by ~74 MB (and avoids baking in a model the user might not want).

**2. Add volume mount to docker-compose.yml**
In docker-compose.yml, add a commented volume line under the existing `./logs` mount:

```
# Whisper model cache (optional — avoids re-downloading models after rebuilds)
- ./data/whisper-models:/app/models/whisper
```

**3. Update model path resolution in TranscribeMessage.ts**
In TranscribeMessage.ts, change the `modelsDir` from `node_modules/nodejs-whisper/cpp/whisper.cpp/models` to a new persistent path: `/app/models/whisper` (with fallback to the `node_modules` path if the volume isn't mounted). The `WHISPER_MODELS` map and `downloadWhisperModel` function stay but now target this new directory.

**4. Create `TranscriptionQueueService.ts`** (new file)
In bot/plugins/vc-transcription/services/, create a queue service:

- **Properties:** `queue: Array<QueueEntry>`, `processing: boolean`, `maxConcurrent: 1` (from config), `modelReady: Map<string, boolean>`, `downloadProgress: Map<string, number>`
- **`enqueue(message, options)`** — adds to queue, returns `{ position, queueMessage }` (the bot's reply). If model isn't ready, throws/returns a "model downloading" state
- **`processNext()`** — dequeues one entry, calls `transcribeWithLocal/OpenAI`, edits the queue message in-place with the result
- **Position updater** — every 5 seconds, iterates queued entries and edits their reply messages with updated positions: `"⏳ Queued for transcription (position 3)..."`
- **`downloadModel(model, guildId)`** — downloads the model, emits `vc-transcription:model_download_progress` WS events with `{ model, percent, status }`. On completion emits `vc-transcription:model_ready`
- **`isModelReady(model)`** — checks filesystem for model file existence

**5. Update messageCreate.ts and messageReactionAdd.ts event handlers**
In messageCreate.ts and messageReactionAdd.ts:

- Instead of calling `transcribeMessage()` directly, call `queueService.enqueue(message, options)`
- The enqueue immediately replies with `"⏳ Queued for transcription (position 1)..."` or `"⏳ Transcribing..."` if no queue
- If the model is still downloading: `"⏳ Transcription model is downloading (67%)... your message is queued"`
- The queue service handles editing the reply in-place with the final transcription

**6. Trigger model download on config save**
In api/config.ts PUT handler, after saving the config:

- If `mode` is not `DISABLED` and `whisperProvider` is `LOCAL`:
  - Check if the selected model file exists
  - If not, kick off `queueService.downloadModel(model, guildId)` (non-blocking)
  - This emits live WS progress events the dashboard can consume

**7. Add WS events for download progress**
Using the existing broadcast() helper, emit from the queue service:

- `vc-transcription:model_download_progress` — `{ model, percent, totalMB, downloadedMB, status: "downloading" }`
- `vc-transcription:model_download_complete` — `{ model, status: "ready" }`
- `vc-transcription:model_download_error` — `{ model, error }`

**8. Update dashboard page**
In VCTranscriptionPage.tsx:

- Subscribe to `vc-transcription:model_download_progress` via `useRealtimeEvent`
- When a model is downloading, show a progress bar in the Model card (e.g., `"Downloading base.en... 45% (33 / 74 MB)"`)
- On `model_download_complete`, show a success badge
- On `model_download_error`, show an error toast

**9. Add `maxConcurrent` config field**
In VoiceTranscriptionConfig.ts, add `maxConcurrentTranscriptions: { type: Number, default: 1 }`. Expose it in the API config route and add a simple number input to the dashboard page.

**10. Add model status API endpoint**
In api/config.ts, add `GET /model-status` that returns which models are downloaded and any active download progress, so the dashboard can show the correct state on page load (not just from WS events).

**11. Update agents.md**
Add convention #8: "Edit-in-place replies — when the bot sends a status/progress reply, always edit that same message in place with the final result rather than sending a second message."

---

### Verification

- Select `large` model in dashboard, set mode to Auto → progress bar appears, WS events flow
- Send a voice message during download → reply says "model downloading (X%)... queued"
- Send multiple voice messages rapidly → queue positions shown, updated every 5s, processed one at a time
- Rebuild Docker container → model persists in `./data/whisper-models/` (if volume mounted)
- No volume mounted → model re-downloads on first use (works, just slower)
- `base.en` no longer baked into Docker image → image is ~74 MB smaller

### Decisions

- **Queue size: unlimited** — per your preference, no cap on queued transcriptions
- **Default concurrency: 1** — configurable via dashboard
- **Edit-in-place** — queue position reply becomes the transcription result
- **`large` uses `large-v3-turbo`** — 806 MB, much faster than full `large-v3` (2.9 GB) with near-identical quality
- **Volume is optional** — works without it, just re-downloads after rebuilds
