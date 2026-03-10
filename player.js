const audio = document.getElementById("audio");
const playButton = document.getElementById("playButton");
const startTimeInput = document.getElementById("startTime");
const statusEl = document.getElementById("status");

let countdownTimer = null;
let startTimestampMs = null;
let pendingStart = false;

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
    // Unlock media on iPhone with direct user gesture
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
  if (pendingStart) return;
  pendingStart = true;

  try {
    const desiredStart = Math.max(0, initialOffsetSeconds);

    await ensureMetadata();

    if (!Number.isNaN(audio.duration) && desiredStart >= audio.duration) {
      setStatus("The track has already finished.");
      pendingStart = false;
      return;
    }

    // Seek once
    audio.currentTime = desiredStart;
    await once(audio, "seeked", 4000);

    // Wait until the desired point is actually inside a buffered range
    await waitForBufferedAt(desiredStart, 6000);

    await audio.play();
    setStatus(`Playing from ${formatTime(audio.currentTime)}.`);
  } catch (err) {
    console.error(err);
    setStatus("Playback failed or audio was not buffered enough.");
  } finally {
    pendingStart = false;
  }
}

function ensureMetadata() {
  return new Promise((resolve) => {
    if (audio.readyState >= 1) {
      resolve();
      return;
    }

    const done = () => {
      audio.removeEventListener("loadedmetadata", done);
      resolve();
    };

    audio.addEventListener("loadedmetadata", done, { once: true });
  });
}

function waitForBufferedAt(time, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      if (isTimeBuffered(time)) {
        resolve();
        return;
      }

      if (Date.now() - start > timeoutMs) {
        reject(new Error("Timed out waiting for buffer"));
        return;
      }

      setStatus(`Buffering near ${formatTime(time)}...`);
      setTimeout(check, 200);
    };

    check();
  });
}

function isTimeBuffered(time) {
  const ranges = audio.buffered;
  for (let i = 0; i < ranges.length; i++) {
    const start = ranges.start(i);
    const end = ranges.end(i);
    if (time >= start && time <= end - 0.05) {
      return true;
    }
  }
  return false;
}

function once(el, eventName, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.removeEventListener(eventName, onEvent);
      resolve();
    };

    const fail = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.removeEventListener(eventName, onEvent);
      reject(new Error(`${eventName} timeout`));
    };

    const onEvent = () => finish();
    const timer = setTimeout(fail, timeoutMs);

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
