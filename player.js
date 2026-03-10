const audio = document.getElementById("audio");
const playButton = document.getElementById("playButton");
const startTimeInput = document.getElementById("startTime");
const statusEl = document.getElementById("status");

let countdownTimer = null;
let startTimestampMs = null;

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
    // Unlock audio with a direct user gesture
    await audio.play();
    audio.pause();
    audio.load();
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

function beginPlayback(initialOffsetSeconds) {
  const desiredStart = Math.max(0, initialOffsetSeconds);

  const startNow = async () => {
    try {
      if (!Number.isNaN(audio.duration) && desiredStart >= audio.duration) {
        setStatus("The track has already finished.");
        return;
      }

      audio.pause();
      audio.currentTime = desiredStart;

      if (audio.seeking) {
        await once(audio, "seeked", 3000);
      }

      await audio.play();
      setStatus(`Playing from ${formatTime(audio.currentTime)}.`);
    } catch (err) {
      console.error(err);
      setStatus("Playback failed. Try pressing Play again.");
    }
  };

  if (audio.readyState >= 3) {
    startNow();
  } else {
    setStatus("Buffering audio...");
    audio.addEventListener("canplay", startNow, { once: true });
  }
}

function once(el, eventName, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.removeEventListener(eventName, onEvent);
      resolve();
    };

    const onEvent = () => finish();
    const timer = setTimeout(finish, timeoutMs);

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

audio.addEventListener("waiting", () => {
  setStatus("Waiting for more audio data...");
});

audio.addEventListener("ended", () => {
  setStatus("Playback ended.");
  clearExistingTimers();
});
