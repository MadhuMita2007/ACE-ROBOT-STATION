import { useEffect, useRef, useState } from "react";

const RADIUS = 65;

export default function VirtualJoystick({ connected, socket }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const positionRef = useRef({ x: 0, y: 0 });
  const activeRef = useRef(false);
  const padRef = useRef(null);

  function updatePosition(event) {
    if (!activeRef.current || !padRef.current) return;

    const rect = padRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let x = (event.clientX - centerX) / RADIUS;
    let y = (centerY - event.clientY) / RADIUS;

    const length = Math.hypot(x, y);

    if (length > 1) {
      x /= length;
      y /= length;
    }

    const next = { x, y };
    positionRef.current = next;
    setPosition(next);
  }

  function start(event) {
    if (!connected) return;

    activeRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePosition(event);
  }

  function stop() {
    activeRef.current = false;
    positionRef.current = { x: 0, y: 0 };
    setPosition({ x: 0, y: 0 });
  }

  useEffect(() => {
    // Send commands at 20 Hz (every 50 milliseconds).
    const timer = setInterval(() => {
      if (!connected || !socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      const { x, y } = positionRef.current;

      socket.send(JSON.stringify({
        v: Number((y * 1).toFixed(3)),
        omega: Number((x * 2).toFixed(3)),
      }));
    }, 50);

    return () => clearInterval(timer);
  }, [connected, socket]);

  useEffect(() => {
    if (!connected) stop();
  }, [connected]);

  return (
    <section className="panel joystick-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">MANUAL CONTROL</div>
          <h2>Virtual joystick</h2>
        </div>

        <span className={connected ? "status" : "joystick-disabled"}>
          {connected ? "READY" : "DISCONNECTED"}
        </span>
      </div>

      <div className="joystick-layout">
        <div
          ref={padRef}
          className={`joystick-pad ${connected ? "" : "disabled"}`}
          onPointerDown={start}
          onPointerMove={updatePosition}
          onPointerUp={stop}
          onPointerCancel={stop}
          role="application"
          aria-label="Virtual robot joystick. Move up or down to control speed and left or right to turn."
        >
          <div className="joystick-cross horizontal" />
          <div className="joystick-cross vertical" />

          <div
            className="joystick-knob"
            style={{
              transform: `translate(calc(-50% + ${position.x * RADIUS}px), calc(-50% - ${position.y * RADIUS}px))`,
            }}
          >
            +
          </div>
        </div>

        <div className="joystick-info">
          <p>Move the joystick to control the simulated robot.</p>

          <div className="joystick-reading">
            <span>Linear velocity</span>
            <strong>{(position.y * 1).toFixed(2)} m/s</strong>
          </div>

          <div className="joystick-reading">
            <span>Angular velocity</span>
            <strong>{(position.x * 2).toFixed(2)} rad/s</strong>
          </div>

          <button
            className="stop-button"
            onClick={stop}
            disabled={!connected}
          >
            STOP ROBOT
          </button>
        </div>
      </div>
    </section>
  );
}