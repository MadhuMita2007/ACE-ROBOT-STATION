# ACE Robot Ground Station

## Overview
ACE Robot Ground Station is a real-time robot monitoring and control dashboard developed using React and Vite. It provides live telemetry visualization, robot position tracking, and virtual joystick controls through WebSocket communication.

## Features
- **Real-Time Telemetry:** Receives robot telemetry data through a WebSocket connection.
- **Live Telemetry Charts:** Visualizes linear velocity, angular velocity, and IMU sensor readings over time.
- **2D Robot Map:** Displays robot position, heading, and movement trail.
- **Virtual Joystick:** Supports mouse and touch input to control robot movement.
- **Robot Status Monitoring:** Displays speed, battery level, position, orientation, and sensor values.
- **Connection Diagnostics:** Monitors WebSocket connectivity, packet rate, and round-trip latency.
- **Session Recording and Replay:** Supports recording and replaying telemetry sessions, if enabled in the current build.
- **Progressive Web App (PWA):** Includes support for installing the dashboard as a desktop-style application.

## Technologies Used
- React
- Vite
- JavaScript
- HTML and CSS
- WebSocket
- HTML Canvas / SVG for visualizations
- Node.js for the mock telemetry server

## Project Structure
```text
ace-robot-station/
├── client/
│   ├── public/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── TelemetryChart.jsx
│   │   └── ...
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── server.js
└── README.md
```

*The exact file structure may vary depending on the final project version.*

## Prerequisites
- Node.js and npm
- A modern web browser such as Google Chrome

## How to Run

### 1. Clone the repository
```bash
git clone https://github.com/YOUR-USERNAME/ace-robot-station.git
cd ace-robot-station
```

### 2. Start the frontend
Open a terminal in the client directory:
```bash
cd client
npm install
npm run dev
```

Open the local URL displayed in the terminal, usually `http://localhost:5173/`.

### 3. Start the WebSocket server
Open a separate terminal in the project root directory and run:
```bash
node server.js
```

The frontend and WebSocket server must both be running for live telemetry and robot controls to work. The frontend's WebSocket URL must match the server address and port configured in the code.

## Telemetry
The dashboard can display telemetry fields such as:
- `t` — timestamp
- `x`, `y` — robot position
- `theta` — robot heading
- `v` — linear velocity
- `omega` — angular velocity
- `battery` — battery level
- `imu` — accelerometer readings (`ax`, `ay`, `az`)
- `status` — robot status

## Notes
- The included server is intended for development and testing if using the mock server.
- The dashboard requires a compatible WebSocket telemetry server to communicate with a real robot.
- Do not commit passwords, API keys, or `.env` files to the public repository.

## Author
Developed as part of the **Team ACE Recruitment Task 2026**.
