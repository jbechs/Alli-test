const audio = document.getElementById("audio");
const playButton = document.getElementById("playButton");
const startTimeInput = document.getElementById("startTime");
const statusEl = document.getElementById("status");

let syncInterval = null;
let countdownTimer = null;
let startTimestampMs = null;

// Only do rare hard resyncs
const HARD_CORRECT_THRESHOLD = 2.0; // seconds
const SYNC_CHECK_MS = 10000; // every 10 seconds

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

  try {
    // Required by some browsers to unlock audio playback
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
  } catch (err) {
    console.error(err);
    setStatus("Audio could not be initialized. Try again.");
    return;
  }

  const offsetSeconds = (Date.now() - startTimestampMs) / 1000;

  if (offsetSeconds < 0) {
    waitUntilStart();
  } else {
    beginPlayback(offsetSeconds);
  }
});

function parseUtcInput(value) {
  // Treat the datetime-local input as UTC
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
    countdownTimer = setTimeout(tick, 250);
  };

  tick();
}

function beginPlayback(initialOffsetSeconds) {
  const startAt = Math.max(0, initialOffsetSeconds);

  const startNow = () => {
    if (!Number.isNaN(audio.duration) && startAt >= audio.duration) {
      setStatus("The track has already finished.");
      return;
    }

    audio.currentTime = startAt;
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
  };

  // If metadata is already loaded, start immediately.
  // Otherwise wait until duration/currentTime seeking is reliable.
  if (audio.readyState >= 1) {
    startNow();
  } else {
    audio.addEventListener("loadedmetadata", startNow, { once: true });
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

    // Only jump if badly out of sync
    if (Math.abs(drift) >= HARD_CORRECT_THRESHOLD) {
      audio.currentTime = Math.max(0, expectedTime);
      setStatus(`Resynced to ${formatTime(audio.currentTime)}.`);
    } else {
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
