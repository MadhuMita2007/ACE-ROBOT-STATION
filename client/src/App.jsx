
import VirtualJoystick from "./VirtualJoystick";
import RobotMap from "./RobotMap";
import TelemetryChart from "./TelemetryChart";
import { useEffect, useState, useRef } from "react";
import { useSessionRecorder } from "./useSessionRecorder";
import "./App.css";

function App() {
  const [connected, setConnected] = useState(false);
  const [socketInstance, setSocketInstance] = useState(null);

  const recorder = useSessionRecorder();

  const [linkStats, setLinkStats] = useState({
    latency: null,
    packetRate: 0,
  });

  const [replayMode, setReplayMode] = useState(false);

  const [telemetry, setTelemetry] = useState({
    t: 0,
    x: 0,
    y: 0,
    theta: 0,
    v: 0,
    omega: 0,
    battery: 100,
    imu: { ax: 0, ay: 0, az: 9.81 },
    status: "CONNECTING",
  });

  // Keep the latest recorder and replay state available to callbacks.
  const replayModeRef = useStateRef(replayMode);
  const recorderRef = useStateRef(recorder);

  // WebSocket connection, worker batching and link diagnostics.
  useEffect(() => {
    let socket;
    let retryTimer;
    let pingTimer;
    let statsTimer;
    let retryDelay = 1000;
    let active = true;

    let receivedPackets = 0;
    let latestLatency = null;
    const pendingPings = new Map();

    // Create the Web Worker for telemetry batching.
    const telemetryWorker = new Worker(
      new URL("./telemetryWorker.js", import.meta.url),
      { type: "module" }
    );

    telemetryWorker.onmessage = (event) => {
      const message = event.data;

      if (
        message.type !== "batch" ||
        !Array.isArray(message.samples) ||
        message.samples.length === 0
      ) {
        return;
      }

      // Record every sample in the batch.
      // This preserves samples for session recording.
      for (const sample of message.samples) {
        recorderRef.current.recordSample(sample);
      }

      // Update React once per batch instead of once per sample.
      // The map and charts receive the newest sample.
      if (!replayModeRef.current) {
        const latestSample =
          message.samples[message.samples.length - 1];

        setTelemetry(latestSample);
      }
    };

    telemetryWorker.onerror = (error) => {
      console.error("Telemetry worker error:", error.message);
    };

    function connect() {
      if (!active) return;

      socket = new WebSocket("ws://localhost:8080");

      socket.onopen = () => {
        if (!active) {
          socket.close();
          return;
        }

        setConnected(true);
        setSocketInstance(socket);
        retryDelay = 1000;

        // Measure WebSocket round-trip latency.
        pingTimer = setInterval(() => {
          if (socket.readyState !== WebSocket.OPEN) return;

          const sentAt = performance.now();
          pendingPings.set(sentAt, sentAt);

          socket.send(
            JSON.stringify({
              type: "ping",
              sentAt,
            })
          );

          // Avoid retaining old ping timestamps indefinitely.
          if (pendingPings.size > 10) {
            const oldest = pendingPings.keys().next().value;
            pendingPings.delete(oldest);
          }
        }, 1000);

        // Update link diagnostics once per second.
        statsTimer = setInterval(() => {
          setLinkStats({
            latency: latestLatency,
            packetRate: receivedPackets,
          });

          receivedPackets = 0;
        }, 1000);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle latency replies separately from telemetry.
          if (
            data.type === "pong" &&
            Number.isFinite(data.sentAt)
          ) {
            if (pendingPings.has(data.sentAt)) {
              latestLatency = Math.max(
                0,
                performance.now() - data.sentAt
              );

              pendingPings.delete(data.sentAt);
            }

            return;
          }

          // Send telemetry samples to the worker.
          if (Number.isFinite(data.t)) {
            receivedPackets++;

            telemetryWorker.postMessage({
              type: "sample",
              sample: data,
            });
          }
        } catch (error) {
          // Ignore invalid WebSocket messages.
          console.warn("Invalid WebSocket message:", error);
        }
      };

      socket.onclose = () => {
        clearInterval(pingTimer);
        clearInterval(statsTimer);
        pendingPings.clear();

        setConnected(false);
        setSocketInstance(null);
        setLinkStats({
          latency: null,
          packetRate: 0,
        });

        // Reconnect with exponential backoff.
        if (active) {
          retryTimer = setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 10000);
        }
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    connect();

    return () => {
      active = false;

      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      clearInterval(statsTimer);

      pendingPings.clear();

      // Stop the worker when the component is removed.
      telemetryWorker.terminate();

      socket?.close();
    };
  }, []);

  // Show the selected recorded sample when scrubbing the timeline.
  useEffect(() => {
    if (!replayMode || recorder.replayData.length === 0) return;

    const sample = recorder.replayData[recorder.replayIndex];

    if (sample) {
      setTelemetry(sample);
    }
  }, [
    replayMode,
    recorder.replayData,
    recorder.replayIndex,
  ]);

  const metrics = [
    ["LINEAR SPEED", telemetry.v.toFixed(2), "m/s"],
    ["ANGULAR VELOCITY", telemetry.omega.toFixed(2), "rad/s"],
    ["BATTERY", telemetry.battery.toFixed(1), "%"],
    ["UPTIME", telemetry.t.toFixed(1), "sec"],
  ];

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <div className="eyebrow">
            TEAM ACE · RECRUITMENT TASK 2026
          </div>

          <h1>Robot Ground Station</h1>

          <p className="subtitle">
            Real-time telemetry and control
          </p>
        </div>

        <div
          className={`connection ${
            connected ? "online" : "offline"
          }`}
        >
          <span className="dot" />
          {connected ? "CONNECTED" : "DISCONNECTED"}
        </div>
      </header>

      <section className="metrics">
        {metrics.map(([label, value, unit]) => (
          <article className="metric" key={label}>
            <div className="metric-label">{label}</div>

            <div className="metric-value">
              {value}
              <span>{unit}</span>
            </div>
          </article>
        ))}
      </section>

      {/* Connection diagnostics */}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">CONNECTION QUALITY</div>
            <h2>Link diagnostics</h2>
          </div>

          <span
            className={
              connected ? "status" : "joystick-disabled"
            }
          >
            {connected ? "ONLINE" : "OFFLINE"}
          </span>
        </div>

        <div className="readings">
          <div>
            <span>Round-trip latency</span>
            <strong>
              {linkStats.latency === null
                ? "--"
                : `${linkStats.latency.toFixed(1)} ms`}
            </strong>
          </div>

          <div>
            <span>Telemetry packet rate</span>
            <strong>{linkStats.packetRate} packets/sec</strong>
          </div>

          <div>
            <span>Target stream rate</span>
            <strong>50 Hz</strong>
          </div>
        </div>
      </section>

      {/* Live robot telemetry */}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">LIVE TELEMETRY</div>
            <h2>Robot status</h2>
          </div>

          <span className="status">{telemetry.status}</span>
        </div>

        <div className="readings">
          <div>
            <span>Position X</span>
            <strong>{telemetry.x.toFixed(2)} m</strong>
          </div>

          <div>
            <span>Position Y</span>
            <strong>{telemetry.y.toFixed(2)} m</strong>
          </div>

          <div>
            <span>Heading</span>
            <strong>
              {(
                (telemetry.theta * 180) /
                Math.PI
              ).toFixed(1)}
              °
            </strong>
          </div>

          <div>
            <span>IMU Acceleration X</span>
            <strong>{telemetry.imu.ax.toFixed(2)} m/s²</strong>
          </div>

          <div>
            <span>IMU Acceleration Y</span>
            <strong>{telemetry.imu.ay.toFixed(2)} m/s²</strong>
          </div>

          <div>
            <span>IMU Acceleration Z</span>
            <strong>{telemetry.imu.az.toFixed(2)} m/s²</strong>
          </div>
        </div>
      </section>

      {/* Session recording and replay */}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">SESSION MANAGEMENT</div>
            <h2>Recording and Replay</h2>
          </div>

          <span className="status">
            {recorder.recording
              ? "RECORDING"
              : replayMode
              ? "REPLAY MODE"
              : "READY"}
          </span>
        </div>

        <div className="session-controls">
          <button
            onClick={() => {
              setReplayMode(false);
              recorder.startRecording();
            }}
            disabled={recorder.recording}
          >
            Start Recording
          </button>

          <button
            onClick={async () => {
              try {
                await recorder.stopRecording();
              } catch (error) {
                console.error("Session save failed:", error);
                alert("Could not save the session.");
              }
            }}
            disabled={!recorder.recording}
          >
            Stop &amp; Save
          </button>
        </div>

        <div className="readings">
          <div>
            <span>Recording</span>
            <strong>
              {recorder.recording ? "Active" : "Inactive"}
            </strong>
          </div>

          <div>
            <span>Saved sessions</span>
            <strong>{recorder.sessions.length}</strong>
          </div>

          <div>
            <span>Replay samples</span>
            <strong>{recorder.replayData.length}</strong>
          </div>
        </div>

        <h3>Saved sessions</h3>

        {recorder.sessions.length === 0 ? (
          <p>
            No saved sessions yet. Record some robot movement
            and select Stop &amp; Save.
          </p>
        ) : (
          <div className="session-list">
            {recorder.sessions.map((session) => (
              <div className="session-item" key={session.id}>
                <div>
                  <strong>{session.name}</strong>
                  <p>
                    {session.sampleCount} samples ·{" "}
                    {(session.durationMs / 1000).toFixed(1)} sec
                  </p>
                </div>

                <div className="session-controls">
                  <button
                    onClick={async () => {
                      try {
                        await recorder.loadSession(session.id);
                        setReplayMode(true);
                      } catch (error) {
                        console.error(
                          "Session loading failed:",
                          error
                        );
                        alert("Could not load this session.");
                      }
                    }}
                  >
                    Load Replay
                  </button>

                  <button
                    onClick={async () => {
                      if (
                        window.confirm(
                          "Delete this saved session?"
                        )
                      ) {
                        await recorder.deleteSession(session.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {recorder.replayData.length > 0 && (
          <div className="replay-controls">
            <h3>Replay timeline</h3>

            <p>
              Sample {recorder.replayIndex + 1} of{" "}
              {recorder.replayData.length}
            </p>

            <input
              type="range"
              min="0"
              max={recorder.replayData.length - 1}
              value={recorder.replayIndex}
              onChange={(event) => {
                setReplayMode(true);
                recorder.setReplayIndex(
                  Number(event.target.value)
                );
              }}
            />

            <button
              onClick={() => {
                setReplayMode(false);
                recorder.setReplayIndex(0);

                setTelemetry({
                  t: 0,
                  x: 0,
                  y: 0,
                  theta: 0,
                  v: 0,
                  omega: 0,
                  battery: 100,
                  imu: { ax: 0, ay: 0, az: 9.81 },
                  status: "CONNECTING",
                });
              }}
            >
              Exit Replay
            </button>
          </div>
        )}
      </section>

      {/* Telemetry charts, robot map and joystick */}
      <TelemetryChart telemetry={telemetry} />

      <RobotMap telemetry={telemetry} />

      <VirtualJoystick
        connected={connected}
        socket={socketInstance}
      />

      <footer>ACE ROBOTICS · SIMULATION MODE</footer>
    </main>
  );
}

export default App;

// Keep current values available inside WebSocket and worker callbacks.
function useStateRef(value) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}
