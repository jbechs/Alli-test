const audio = document.getElementById("audio");
const playButton = document.getElementById("playButton");
const startTimeInput = document.getElementById("startTime");
const statusEl = document.getElementById("status");

let syncInterval = null;
let startTimestampMs = null;
let countdownTimer = null;

// --- Tuning values ---
// Small drift: gently correct with playbackRate
const SOFT_CORRECT_THRESHOLD = 0.15; // seconds
const HARD_CORRECT_THRESHOLD = 1.0;  // seconds

// Maximum tiny speed adjustment
const MAX_PLAYBACK_RATE_ADJUST = 0.02; // ±2%

// How often to check sync
const SYNC_CHECK_MS = 3000;

// Update countdown text more often
const COUNTDOWN_CHECK_MS = 250;

playButton.addEventListener("click", async () => {
  clearExistingTimers();

  const inputValue = startTimeInput.value;
  if (!inputValue) {
    setStatus("Please enter a UTC start time.");
    return;
  }

  // Treat entered value as UTC
  startTimestampMs = parseUtcInput(inputValue);

  if (Number.isNaN(startTimestampMs)) {
    setStatus("Invalid time format.");
    return;
  }

  try {
    // iOS/Safari often requires the audio element to be activated by a direct user gesture.
    await audio.play();
    audio.pause();
  } catch (err) {
    console.error(err);
    setStatus("Audio could not be initialized. Try again.");
    return;
  }

  const now = Date.now();
  const offsetSeconds = (now - startTimestampMs) / 1000;

  if (offsetSeconds < 0) {
    waitUntilStart();
  } else {
    beginPlayback(offsetSeconds);
  }
});

function parseUtcInput(value) {
  // datetime-local gives something like "2026-03-09T20:00:00"
  // We want to interpret that AS UTC, not as local time.
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

function beginPlayback(initialOffsetSeconds) {
  const trackDuration = audio.duration;

  if (!Number.isNaN(trackDuration) && initialOffsetSeconds >= trackDuration) {
    setStatus("The track has already finished.");
    return;
  }

  audio.currentTime = Math.max(0, initialOffsetSeconds);
  audio.playbackRate = 1.0;

  audio.play()
    .then(() => {
      setStatus(`Playing from ${formatTime(audio.currentTime)}.`);
      startSyncLoop();
    })
    .catch((err) => {
      console.error(err);
      setStatus("Playback failed. Try pressing Play again.");
    });
}

function startSyncLoop() {
  if (syncInterval) clearInterval(syncInterval);

  syncInterval = setInterval(() => {
    if (!startTimestampMs || audio.paused || audio.ended) return;

    const expectedTime = (Date.now() - startTimestampMs) / 1000;
    const actualTime = audio.currentTime;
    const drift = expectedTime - actualTime;

    // If expected time is past end of track, stop trying to sync
    if (!Number.isNaN(audio.duration) && expectedTime >= audio.duration) {
      setStatus("Track complete.");
      clearExistingTimers();
      return;
    }

    // Large drift -> hard jump
    if (Math.abs(drift) >= HARD_CORRECT_THRESHOLD) {
      audio.currentTime = Math.max(0, expectedTime);
      audio.playbackRate = 1.0;
      setStatus(`Hard resync at ${formatTime(audio.currentTime)}.`);
      return;
    }

    // Medium/small drift -> gentle correction via playbackRate
    if (Math.abs(drift) >= SOFT_CORRECT_THRESHOLD) {
      const correction = clamp(drift * 0.02, -MAX_PLAYBACK_RATE_ADJUST, MAX_PLAYBACK_RATE_ADJUST);
      audio.playbackRate = 1.0 + correction;
      setStatus(
        `Soft sync: expected ${formatTime(expectedTime)}, actual ${formatTime(actualTime)}, drift ${drift.toFixed(2)}s.`
      );
    } else {
      // Close enough -> return to normal speed
      audio.playbackRate = 1.0;
      setStatus(`In sync at ${formatTime(actualTime)}.`);
    }
  }, SYNC_CHECK_MS);
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

audio.addEventListener("ended", () => {
  setStatus("Playback ended.");
  clearExistingTimers();
});
