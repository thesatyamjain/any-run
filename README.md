# AnyRun // One-Click Universal Project Runner & Tunnel

[![CI](https://github.com/any-run/any-run/actions/workflows/ci.yml/badge.svg)](https://github.com/any-run/any-run/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**AnyRun** is an automated, one-click developer utility that inspects, launches, and tunnels any project of any software architecture, dynamically detecting its listening port and displaying scannable QR codes in both the terminal and a local web dashboard.

---

## 1. Quick Start (One-Click)

### Method A: Double-Click or Drag & Drop (Windows)
1. **Double-click `any-run.bat`** to open the Control Center dashboard.
2. **Or Drag & Drop ANY project folder** directly onto `any-run.bat` in Windows Explorer to immediately run, tunnel, and generate its QR code.

### Method B: Terminal / CLI (Windows, macOS, Linux)
```bash
# Global install (optional)
npm install -g any-run

# Run any project folder:
any-run /path/to/project

# Or from local directory:
node bin/any-run.js ./my-project

# Launch interactive Web Control Center:
npm start
```

---

## 2. Dual-Mode QR & Access Links

AnyRun automatically provides **two access modes** for maximum reliability and speed:

1. **Local Wi-Fi (LAN Direct - Fastest)**:
   - Example: `http://192.168.1.40:5000`
   - **Instant zero-latency**: Connects directly over your local Wi-Fi router.
   - **Zero DNS dependency**: 100% immune to ISP DNS blocking or slow propagation.
   - Perfect for mobile phone testing on the same Wi-Fi.

2. **Public Tunnel (Cloudflare / Worldwide)**:
   - Example: `https://<subdomain>.trycloudflare.com`
   - **Global access**: Reachable from anywhere on the internet (4G/5G, remote clients).
   - 100% free with SSL HTTPS. Portable binary automatically provisioned across Windows (x64/x86), macOS (Apple Silicon/Intel), and Linux (x64/arm64).

> [!TIP]
> **ISP DNS Note (India / BSNL / Regional ISPs)**:
> If your browser reports `DNS_PROBE_FINISHED_NXDOMAIN` when clicking a `trycloudflare.com` link, your local ISP DNS resolver may be blocking or slow to update ephemeral domains.
> 1. In the Web Control Center (`http://localhost:3737`), simply toggle to **"LOCAL WI-FI (FASTEST)"** for instant access on your phone.
> 2. Or change your device DNS to Google (`8.8.8.8`) or Cloudflare (`1.1.1.1`).

---

## 3. Multi-Architecture Detection Matrix

AnyRun inspects the project directory and auto-configures the optimal execution plan:

| Ecosystem | Detected File / Signature | Auto-Command & Port |
| :--- | :--- | :--- |
| **Node.js (Next.js)** | `package.json` (`next`) | `npm run dev` (Port 3000) |
| **Node.js (Vite)** | `package.json` (`vite`) | `npm run dev` (Auto-reads `vite.config.ts` port) |
| **Node.js (Angular)** | `package.json` (`@angular/core`) | `npm start` (Port 4200) |
| **Node.js (Astro)** | `package.json` (`astro`) | `npm run dev` (Port 4321) |
| **Node.js (Express/Nest)** | `package.json` / `server.js` | `node server.js` / `npm start` (Port 3000) |
| **Python (FastAPI)** | `main.py` / `app.py` (`fastapi`) | Auto-detects local `.venv` or system Python; runs `uvicorn main:app --reload` (Port 8000) |
| **Python (Django)** | `manage.py` | `manage.py runserver 0.0.0.0:8000` |
| **Python (Flask)** | `app.py` / `wsgi.py` (`flask`) | `flask run --host 0.0.0.0 --port 5000` |
| **Python (Streamlit)** | `streamlit` in code | `streamlit run ...` (Port 8501) |
| **Docker Compose** | `docker-compose.yml`, `compose.yaml` | `docker compose up` |
| **Dockerfile** | `Dockerfile` | `docker build` & `docker run` |
| **Go** | `go.mod`, `main.go` | `go run .` (Port 8080) |
| **Rust** | `Cargo.toml` | `cargo run` (Port 8080) |
| **PHP** | `artisan` (Laravel) / `index.php` | `php artisan serve` / `php -S 0.0.0.0:8000` |
| **Static Web Site** | `index.html`, HTML/CSS/JS files | Zero-config embedded high-speed HTTP server with SPA routing & path traversal protection |

---

## 4. Production & Security Hardening

- **Zero-Dependency Core**: Standard Node.js `http`, `net`, and `child_process` modules for maximum performance and stability.
- **Path Traversal Protection**: Embedded static server and control center enforce strict boundary validation against traversal and null-byte injection.
- **Cross-Platform Process Supervision**: Clean process tree termination on Windows (`taskkill /t`), Linux, and macOS (`SIGKILL` process groups).
- **Safe Proxying**: Deep request/response logging, WebSockets upgrade relay, and SSRF-hardened replay endpoints strictly locked to loopback interfaces.
- **Atomic Tunnel Provisioning**: Downloads validated, hash/size-checked portable tunnel clients with atomic temporary file swapping.

---

## 5. Verification Suite

Run the built-in test suite anytime:
```bash
npm test
```
