
import { useEffect, useRef } from "react";

const WINDOW_SECONDS = 10;
const MAX_SAMPLES = 6000;
const MAX_POINTS_PER_PIXEL = 2;

const SERIES = [
  {
    title: "Linear Velocity",
    keys: ["v"],
    colors: ["#55b8ff"],
  },
  {
    title: "Angular Velocity",
    keys: ["omega"],
    colors: ["#b49aff"],
  },
  {
    title: "IMU Acceleration",
    keys: ["ax", "ay", "az"],
    colors: ["#55d6a4", "#ffbd69", "#ff718b"],
  },
];

export default function TelemetryChart({ telemetry }) {
  const canvasRef = useRef(null);
  const samplesRef = useRef([]);
  const lastSampleRef = useRef(null);

  // Add each new telemetry sample to the rolling buffer.
  useEffect(() => {
    if (!telemetry || !Number.isFinite(telemetry.t)) return;

    // Avoid adding the same telemetry timestamp twice.
    if (lastSampleRef.current === telemetry.t) return;
    lastSampleRef.current = telemetry.t;

    const sample = {
      t: telemetry.t,
      v: telemetry.v ?? 0,
      omega: telemetry.omega ?? 0,
      ax: telemetry.imu?.ax ?? 0,
      ay: telemetry.imu?.ay ?? 0,
      az: telemetry.imu?.az ?? 0,
    };

    const samples = samplesRef.current;
    samples.push(sample);

    // Keep only the latest 10 seconds.
    const cutoff = sample.t - WINDOW_SECONDS;

    let firstValid = 0;
    while (
      firstValid < samples.length &&
      samples[firstValid].t < cutoff
    ) {
      firstValid++;
    }

    if (firstValid > 0) {
      samples.splice(0, firstValid);
    }

    // Protect against unusually high telemetry rates.
    if (samples.length > MAX_SAMPLES) {
      samples.splice(0, samples.length - MAX_SAMPLES);
    }
  }, [telemetry]);

  // Set up the canvas and a continuous rendering loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameId;
    let width = 0;
    let height = 0;
    let dpr = 1;

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

    function drawChart(series, top, plotHeight, now) {
      const left = 55;
      const right = Math.max(left + 1, width - 14);
      const plotWidth = right - left;
      const bottom = top + plotHeight;

      ctx.fillStyle = "#101b2a";
      ctx.fillRect(0, top, width, plotHeight);

      ctx.font = "11px system-ui";
      ctx.fillStyle = "#e5edf9";
      ctx.textAlign = "left";
      ctx.fillText(series.title, 12, top + 17);

      const cutoff = now - WINDOW_SECONDS;
      const samples = samplesRef.current;

      // Select samples inside the visible 10-second window.
      let start = 0;
      while (
        start < samples.length &&
        samples[start].t < cutoff
      ) {
        start++;
      }

      const visible = samples.slice(start).filter(
        (sample) => sample.t <= now
      );

      // Find the value range using every visible sample.
      // This helps preserve the vertical scale during decimation.
      let min = Infinity;
      let max = -Infinity;

      for (const sample of visible) {
        for (const key of series.keys) {
          const value = sample[key];

          if (Number.isFinite(value)) {
            min = Math.min(min, value);
            max = Math.max(max, value);
          }
        }
      }

      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        min = -1;
        max = 1;
      }

      if (min === max) {
        min -= 1;
        max += 1;
      }

      const padding = (max - min) * 0.15;
      min -= padding;
      max += padding;

      const y = (value) =>
        bottom -
        12 -
        ((value - min) / (max - min)) * (plotHeight - 43);

      const x = (time) =>
        left + ((time - cutoff) / WINDOW_SECONDS) * plotWidth;

      // Horizontal grid and vertical value labels.
      ctx.strokeStyle = "#29374a";
      ctx.lineWidth = 1;
      ctx.fillStyle = "#91a0b5";
      ctx.textAlign = "right";

      for (let i = 0; i <= 3; i++) {
        const value = min + ((max - min) * i) / 3;
        const py = y(value);

        ctx.beginPath();
        ctx.moveTo(left, py);
        ctx.lineTo(right, py);
        ctx.stroke();

        ctx.fillText(value.toFixed(2), left - 7, py + 4);
      }

      // Decimate plotted points according to available screen width.
      // All samples are retained in the buffer; only drawing is reduced.
      const maxPoints = Math.max(
        2,
        Math.floor(plotWidth * MAX_POINTS_PER_PIXEL)
      );

      const drawStep = Math.max(
        1,
        Math.ceil(visible.length / maxPoints)
      );

      series.keys.forEach((key, index) => {
        ctx.beginPath();
        ctx.strokeStyle = series.colors[index];
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        let started = false;
        let lastPlotted = null;

        for (let i = 0; i < visible.length; i += drawStep) {
          const sample = visible[i];
          const value = sample[key];

          if (!Number.isFinite(value)) continue;

          const px = x(sample.t);
          const py = y(value);

          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }

          lastPlotted = sample;
        }

        // Always include the latest point.
        const latest = visible[visible.length - 1];

        if (
          latest &&
          latest !== lastPlotted &&
          Number.isFinite(latest[key])
        ) {
          ctx.lineTo(x(latest.t), y(latest[key]));
        }

        ctx.stroke();
      });

      // Time labels.
      ctx.textAlign = "center";
      ctx.fillStyle = "#91a0b5";
      ctx.font = "11px system-ui";

      for (let i = 0; i <= 5; i++) {
        const time = cutoff + (WINDOW_SECONDS * i) / 5;
        ctx.fillText(`${i * 2}s`, x(time), bottom - 1);
      }

      // Signal legend.
      let legendX = right - 5;

      for (let i = series.keys.length - 1; i >= 0; i--) {
        const label = series.keys[i];

        ctx.font = "10px system-ui";
        const textWidth = ctx.measureText(label).width;
        legendX -= textWidth;

        ctx.textAlign = "left";
        ctx.fillStyle = series.colors[i];
        ctx.fillText(label, legendX, top + 17);

        legendX -= 17;
      }
    }

    function render() {
      frameId = requestAnimationFrame(render);

      if (!width || !height) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const gap = 10;
      const plotHeight = (height - gap * 2) / 3;
      const samples = samplesRef.current;

      // Use the newest telemetry timestamp as the chart's right edge.
      const now = samples.length
        ? samples[samples.length - 1].t
        : 10;

      SERIES.forEach((series, index) => {
        drawChart(
          series,
          index * (plotHeight + gap),
          plotHeight,
          now
        );
      });
    }

    render();

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, []);

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">LIVE SIGNALS</div>
          <h2>Telemetry plots</h2>
        </div>
        <span className="status">10 SECOND WINDOW</span>
      </div>

      <canvas
        ref={canvasRef}
        className="telemetry-canvas"
        aria-label="Live plots of linear velocity, angular velocity and IMU acceleration over the last 10 seconds"
        role="img"
      />
    </section>
  );
}
