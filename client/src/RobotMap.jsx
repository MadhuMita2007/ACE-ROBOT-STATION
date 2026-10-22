
import { useEffect, useRef } from "react";

const MAX_TRAIL = 500;

export default function RobotMap({ telemetry }) {
  const canvasRef = useRef(null);
  const trailRef = useRef([]);
  const telemetryRef = useRef(telemetry);
  const viewRef = useRef({ zoom: 30, panX: 0, panY: 0 });

  // Keep the latest telemetry available to the drawing loop.
  useEffect(() => {
    telemetryRef.current = telemetry;

    if (
      !telemetry ||
      !Number.isFinite(telemetry.x) ||
      !Number.isFinite(telemetry.y) ||
      !Number.isFinite(telemetry.theta) ||
      !Number.isFinite(telemetry.t)
    ) {
      return;
    }

    const trail = trailRef.current;
    const last = trail[trail.length - 1];

    if (!last || last.t !== telemetry.t) {
      trail.push({
        x: telemetry.x,
        y: telemetry.y,
        theta: telemetry.theta,
        t: telemetry.t,
      });

      if (trail.length > MAX_TRAIL) {
        trail.splice(0, trail.length - MAX_TRAIL);
      }
    }
  }, [telemetry]);

  // Set up one continuous canvas drawing loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let dragging = false;
    let previousX = 0;
    let previousY = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    function pointerDown(event) {
      dragging = true;
      previousX = event.clientX;
      previousY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    }

    function pointerMove(event) {
      if (!dragging) return;

      const view = viewRef.current;
      view.panX += event.clientX - previousX;
      view.panY += event.clientY - previousY;
      previousX = event.clientX;
      previousY = event.clientY;
    }

    function pointerUp() {
      dragging = false;
    }

    function wheel(event) {
      event.preventDefault();

      const view = viewRef.current;
      const factor = event.deltaY < 0 ? 1.1 : 0.9;

      view.zoom = Math.max(
        5,
        Math.min(150, view.zoom * factor)
      );
    }

    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("wheel", wheel, { passive: false });

    function draw() {
      frame = requestAnimationFrame(draw);

      if (!width || !height) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = "#0c1522";
      ctx.fillRect(0, 0, width, height);

      const view = viewRef.current;
      const cx = width / 2 + view.panX;
      const cy = height / 2 + view.panY;
      const scale = view.zoom;

      // Draw grid.
      ctx.strokeStyle = "#1e2d40";
      ctx.lineWidth = 1;

      const startX = ((cx % scale) + scale) % scale;
      const startY = ((cy % scale) + scale) % scale;

      for (let x = startX; x < width; x += scale) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      for (let y = startY; y < height; y += scale) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const toScreen = (x, y) => ({
        x: cx + x * scale,
        y: cy - y * scale,
      });

      // Draw origin axes.
      ctx.strokeStyle = "#42536a";
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(width, cy);
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, height);
      ctx.stroke();

      // Draw the most recent 500 positions.
      const trail = trailRef.current;

      if (trail.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = "#55b8ff";
        ctx.lineWidth = 2;

        trail.forEach((point, index) => {
          const p = toScreen(point.x, point.y);

          if (index === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });

        ctx.stroke();
      }

      // Read the latest robot position without restarting this loop.
      const robot = telemetryRef.current || trail[trail.length - 1];

      if (robot) {
        const p = toScreen(robot.x, robot.y);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(-robot.theta);

        ctx.fillStyle = "#55d6a4";
        ctx.strokeStyle = "#e9fff6";
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-11, -10);
        ctx.lineTo(-7, 0);
        ctx.lineTo(-11, 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();

        ctx.fillStyle = "#e5edf9";
        ctx.font = "12px system-ui";
        ctx.fillText(
          `X: ${robot.x.toFixed(2)} m  Y: ${robot.y.toFixed(2)} m`,
          12,
          22
        );
      }

      ctx.fillStyle = "#91a0b5";
      ctx.font = "11px system-ui";
      ctx.fillText(
        `Trail: ${trail.length}/${MAX_TRAIL}`,
        12,
        height - 12
      );
      ctx.fillText(
        "Drag to pan · Scroll to zoom",
        Math.max(12, width - 170),
        height - 12
      );
    }

    draw();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();

      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("wheel", wheel);
    };
  }, []);

  return (
    <section className="panel map-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">ROBOT NAVIGATION</div>
          <h2>2D live map</h2>
        </div>
        <span className="status">LIVE POSE</span>
      </div>

      <canvas
        ref={canvasRef}
        className="robot-map-canvas"
        aria-label="Robot map showing its position, heading and recent trajectory"
        role="img"
      />
    </section>
  );
}
