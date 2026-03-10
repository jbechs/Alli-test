const loadButton = document.getElementById("loadButton");
const playButton = document.getElementById("playButton");
const startTimeInput = document.getElementById("startTime");
const statusEl = document.getElementById("status");

let audioCtx = null;
let audioBuffer = null;
let sourceNode = null;
let countdownTimer = null;
let startTimestampMs = null;

const AUDIO_URL = "audio/track.m4a"; // or track.mp3, but m4a/aac is preferable

loadButton.addEventListener("click", async () => {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    setStatus("Loading audio file...");
    const response = await fetch(AUDIO_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    setStatus("Decoding audio...");
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    setStatus(`Loaded. Duration: ${formatTime(audioBuffer.duration)}.`);
  } catch (err) {
    console.error(err);
    setStatus("Failed to load/decode audio.");
  }
});

playButton.addEventListener("click", async () => {
  clearExistingTimers();

  if (!audioBuffer) {
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

  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  try {
    await audioCtx.resume();
  } catch (err) {
    console.error(err);
    setStatus("Audio context could not resume.");
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

function beginPlayback(initialOffsetSeconds) {
  stopCurrentSource();

  const offset = Math.max(0, initialOffsetSeconds);

  if (offset >= audioBuffer.duration) {
    setStatus("The track has already finished.");
    return;
  }

  sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.connect(audioCtx.destination);

  sourceNode.onended = () => {
    setStatus("Playback ended.");
  };

  sourceNode.start(0, offset);
  setStatus(`Playing from ${formatTime(offset)}.`);
}

function stopCurrentSource() {
  if (sourceNode) {
    try {
      sourceNode.stop();
    } catch (_) {}
    sourceNode.disconnect();
    sourceNode = null;
  }
}

function clearExistingTimers() {
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
