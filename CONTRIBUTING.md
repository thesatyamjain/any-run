# Contributing to AnyRun

Thank you for your interest in contributing to AnyRun! We welcome issues, pull requests, and suggestions.

## Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/thesatyamjain/any-run.git
   cd any-run
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run test suite**:
   ```bash
   npm test
   ```

4. **Launch local development dashboard**:
   ```bash
   npm start
   ```

## Design Philosophy

- **Zero-Dependency Core**: AnyRun avoids heavy runtime frameworks for its core runner and proxy. Prefer standard Node.js built-ins (`http`, `net`, `child_process`, `fs`, `path`) wherever possible.
- **Cross-Platform First**: Features must operate seamlessly across Windows, macOS, and Linux without platform lock-in.
- **Fail-Safe & Non-Destructive**: Stale processes are cleaned up safely, inputs are sanitized against path traversal, and public tunnels fall back gracefully.

## Submitting Pull Requests

1. Fork the repo and create your feature branch: `git checkout -b feature/my-enhancement`.
2. Ensure all self-checks pass: `npm test`.
3. Keep commits focused and provide clear descriptions.
4. Open a Pull Request referencing any related issues.
