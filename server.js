
const WebSocket = require("ws");

const PORT = 8080;
const RATE = Math.max(1, Number(process.env.RATE || 50));

const wss = new WebSocket.Server({ port: PORT });

let t = 0;
let x = 0;
let y = 0;
let theta = 0;

// Start safely at rest.
let v = 0;
let omega = 0;
let battery = 100;

wss.on("connection", (ws) => {
  console.log("Dashboard connected!");

  ws.on("message", (raw) => {
    try {
      const cmd = JSON.parse(raw.toString());

      // Respond to latency-check messages.
      if (cmd.type === "ping") {
        ws.send(JSON.stringify({
          type: "pong",
          sentAt: cmd.sentAt,
        }));
        return;
      }

      // Accept joystick velocity commands.
      if (Number.isFinite(cmd.v)) {
        v = Math.max(-1, Math.min(1, cmd.v));
      }

      if (Number.isFinite(cmd.omega)) {
        omega = Math.max(-2, Math.min(2, cmd.omega));
      }
    } catch {
      console.log("Invalid command received");
    }
  });

  // Stop if the dashboard disconnects.
  ws.on("close", () => {
    v = 0;
    omega = 0;
    console.log("Dashboard disconnected. Robot stopped.");
  });

  ws.on("error", () => {
    v = 0;
    omega = 0;
  });
});

setInterval(() => {
  const dt = 1 / RATE;

  t += dt;

  // Update pose from the latest joystick commands.
  theta += omega * dt;
  x += v * Math.cos(theta) * dt;
  y += v * Math.sin(theta) * dt;

  // Keep heading within -PI to +PI.
  theta = Math.atan2(Math.sin(theta), Math.cos(theta));

  battery = Math.max(0, battery - 0.0002 * dt);

  const data = {
    t,
    x,
    y,
    theta,
    v,
    omega,
    battery,
    imu: {
      ax: -v * omega * Math.sin(theta),
      ay: v * omega * Math.cos(theta),
      az: 9.81,
    },
    status: battery > 15 ? "OK" : "LOW_BATTERY",
  };

  const message = JSON.stringify(data);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}, 1000 / RATE);

console.log(`Robot server running on port ${PORT}`);
console.log(`Telemetry frequency: ${RATE} Hz`);
