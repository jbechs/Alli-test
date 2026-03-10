const audio = document.getElementById("audio");
const playButton = document.getElementById("playButton");
const startTimeInput = document.getElementById("startTime");
const statusEl = document.getElementById("status");

let syncInterval = null;
let countdownTimer = null;
let startTimestampMs = null;

const SOFT_CORRECT_THRESHOLD = 0.15; // seconds
const HARD_CORRECT_THRESHOLD = 1.0;  // seconds
const MAX_PLAYBACK_RATE_ADJUST = 0.02; // ±2%
const SYNC_CHECK_MS = 3000;
const COUNTDOWN_CHECK_MS = 250;

playButton.addEventListener("click", async () => {
  clearExistingTimers();

  const inputValue = startTimeInput.value;
  if (!inputValue) {
    setStatus("Please enter a UTC start time.");
    return;
  }

  startTimestampMs = parseUtcInput(inputValue);

  if (Number.isNaN(startTimestampMs)) {
    setStatus("Invalid time format.");
    return;
  }

  setStatus("Preparing audio...");

  try {
    // Force metadata load if needed
    audio.load();

    await waitForAudioReady(audio, 5000);

    const now = Date.now();
    const offsetSeconds = (now - startTimestampMs) / 1000;

    if (!Number.isNaN(audio.duration) && offsetSeconds >= audio.duration) {
      setStatus("That start time is beyond the end of the track.");
      return;
    }

    if (offsetSeconds < 0) {
      setStatus("Waiting for scheduled start...");
      waitUntilStart();
    } else {
      beginPlayback(offsetSeconds);
    }
  } catch (err) {
    console.error(err);
    setStatus("Audio failed to load. Check the file path and filename.");
  }
});

function parseUtcInput(value) {
  // Interpret entered datetime-local value as UTC
  return new Date(value + "Z").getTime();
}

function waitUntilStart() {
  const tick = () => {
    const msRemaining = startTimestampMs - Date.now();

    if (msRemaining <= 0) {
      beginPlayback(0);
      return;
    }

    const totalSeconds = Math.ceil(msRemaining / 1000);
    setStatus(`Starting in ${totalSeconds} second${totalSeconds === 1 ? "" : "s"}...`);
    countdownTimer = setTimeout(tick, COUNTDOWN_CHECK_MS);
  };

  tick();
}

async function beginPlayback(initialOffsetSeconds) {
  try {
    audio.currentTime = Math.max(0, initialOffsetSeconds);
    audio.playbackRate = 1.0;

    await audio.play();

    setStatus(`Playing from ${formatTime(audio.currentTime)}.`);
    startSyncLoop();
  } catch (err) {
    console.error(err);
    setStatus("Playback failed. Usually this means the audio file path is wrong or the browser blocked playback.");
  }
}

function startSyncLoop() {
  if (syncInterval) clearInterval(syncInterval);

  syncInterval = setInterval(() => {
    if (!startTimestampMs || audio.paused || audio.ended) return;

    const expectedTime = (Date.now() - startTimestampMs) / 1000;
    const actualTime = audio.currentTime;
    const drift = expectedTime - actualTime;

    if (!Number.isNaN(audio.duration) && expectedTime >= audio.duration) {
      setStatus("Track complete.");
      clearExistingTimers();
      return;
    }

    if (Math.abs(drift) >= HARD_CORRECT_THRESHOLD) {
      audio.currentTime = Math.max(0, expectedTime);
      audio.playbackRate = 1.0;
      setStatus(`Hard resync at ${formatTime(audio.currentTime)}.`);
      return;
    }

    if (Math.abs(drift) >= SOFT_CORRECT_THRESHOLD) {
      const correction = clamp(drift * 0.02, -MAX_PLAYBACK_RATE_ADJUST, MAX_PLAYBACK_RATE_ADJUST);
      audio.playbackRate = 1.0 + correction;
      setStatus(`Soft sync drift: ${drift.toFixed(2)}s`);
    } else {
      audio.playbackRate = 1.0;
      setStatus(`In sync at ${formatTime(actualTime)}.`);
    }
  }, SYNC_CHECK_MS);
}

function waitForAudioReady(audioEl, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (audioEl.readyState >= 1) {
      resolve();
      return;
    }

    const onLoaded = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Audio element reported an error while loading."));
    };

    const onTimeout = () => {
      cleanup();
      reject(new Error("Timed out waiting for audio metadata."));
    };

    const cleanup = () => {
      clearTimeout(timer);
      audioEl.removeEventListener("loadedmetadata", onLoaded);
      audioEl.removeEventListener("error", onError);
    };

    audioEl.addEventListener("loadedmetadata", onLoaded);
    audioEl.addEventListener("error", onError);

    const timer = setTimeout(onTimeout, timeoutMs);
  });
}

function clearExistingTimers() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }

  if (countdownTimer) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
  }
}

function setStatus(message) {
  statusEl.textContent = message;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${mins}:${String(secs).padStart(2, "0")}`;
}

audio.addEventListener("loadedmetadata", () => {
  setStatus(`Track loaded. Duration: ${formatTime(audio.duration)}.`);
});

audio.addEventListener("error", () => {
  console.error("Audio error:", audio.error);
  setStatus("Audio error: file may be missing or path may be incorrect.");
});

audio.addEventListener("ended", () => {
  setStatus("Playback ended.");
  clearExistingTimers();
});
