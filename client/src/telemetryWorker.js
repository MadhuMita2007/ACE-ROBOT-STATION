
const MAX_BATCH_SIZE = 100;

let pendingSamples = [];
let flushScheduled = false;

self.onmessage = (event) => {
  const message = event.data;

  if (message.type === "sample") {
    pendingSamples.push(message.sample);

    if (pendingSamples.length >= MAX_BATCH_SIZE) {
      flushSamples();
    } else if (!flushScheduled) {
      flushScheduled = true;

      // Yield briefly so incoming messages can be grouped.
      setTimeout(() => {
        flushSamples();
      }, 10);
    }
  }

  if (message.type === "clear") {
    pendingSamples = [];
    flushScheduled = false;
  }
};

function flushSamples() {
  flushScheduled = false;

  if (pendingSamples.length === 0) return;

  const samples = pendingSamples;
  pendingSamples = [];

  self.postMessage({
    type: "batch",
    samples,
  });
}
