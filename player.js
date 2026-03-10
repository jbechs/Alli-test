const loadButton = document.getElementById("loadButton");
const playButton = document.getElementById("playButton");
const startTimeInput = document.getElementById("startTime");
const statusEl = document.getElementById("status");
const audio = document.getElementById("audio");

console.log("player.js loaded");

const AUDIO_URL = "audio/track.mp3"; // change if needed

let blobUrl = null;
let fileLoaded = false;
let countdownTimer = null;
let startTimestampMs = null;

loadButton.addEventListener("click", async () => {
  console.log("Load button clicked");
  try {
    fileLoaded = false;

    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }

    setStatus("Downloading audio file...");
    const response = await fetch(AUDIO_URL, { cache: "no-store" });

    console.log("fetch status:", response.status);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    console.log("blob size:", blob.size);

    setStatus(`Downloaded ${Math.round(blob.size / 1024)} KB. Preparing audio...`);

    blobUrl = URL.createObjectURL(blob);
    audio.src = blobUrl;
    audio.load();

    await waitForEvent(audio, "canplaythrough", 8000);

    fileLoaded = true;
    setStatus("Audio loaded and ready.");
  } catch (err) {
    console.error("Load failed:", err);
    setStatus(`Load failed: ${err.message}`);
  }
});

playButton.addEventListener("click", async () => {
  console.log("Play button clicked");

  clearExistingTimers();

  if (!fileLoaded) {
    setStatus("Load audio first.");
    return;
  }

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
    await audio.play();
    audio.pause();
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

async function beginPlayback(initialOffsetSeconds) {
  try {
    const offset = Math.max(0, initialOffsetSeconds);

    if (!Number.isNaN(audio.duration) && offset >= audio.duration) {
      setStatus("The track has already finished.");
      return;
    }

    audio.pause();
    audio.currentTime = offset;

    if (audio.seeking) {
      await waitForEvent(audio, "seeked", 4000);
    }

    await audio.play();
    setStatus(`Playing from ${formatTime(audio.currentTime)}.`);
  } catch (err) {
    console.error(err);
    setStatus(`Playback failed: ${err.message}`);
  }
}

function waitForEvent(el, eventName, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let done = false;

    const onEvent = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.removeEventListener(eventName, onEvent);
      resolve();
    };

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      el.removeEventListener(eventName, onEvent);
      reject(new Error(`${eventName} timeout`));
    }, timeoutMs);

    el.addEventListener(eventName, onEvent, { once: true });
  });
}

function clearExistingTimers() {
  if (countdownTimer) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
  }
}

function setStatus(message) {
  console.log("STATUS:", message);
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

audio.addEventListener("waiting", () => {
  setStatus("Playback is waiting for data...");
});

audio.addEventListener("ended", () => {
  setStatus("Playback ended.");
});
