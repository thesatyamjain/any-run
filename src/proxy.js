import http from 'node:http';
import net from 'node:net';

/**
 * Creates a zero-dependency streaming HTTP & WebSocket interception reverse proxy.
 * Provides deep request/response inspection, latency profiling, and header capture.
 *
 * @param {object} options
 * @param {number} options.targetPort - Port of the underlying application
 * @param {string} [options.targetHost='127.0.0.1'] - Host of the underlying application
 * @param {function(object): void} [options.onTraffic] - Callback for captured HTTP requests
 * @returns {http.Server}
 */
export function createInterceptionProxy({ targetPort, targetHost = '127.0.0.1', onTraffic }) {
  const server = http.createServer((clientReq, clientRes) => {
    const startTime = Date.now();
    const clientIp = clientReq.headers['x-forwarded-for'] || clientReq.socket.remoteAddress || '127.0.0.1';

    const reqHeaders = {
      ...clientReq.headers,
      host: `${targetHost}:${targetPort}`,
      'x-forwarded-for': clientIp,
      'x-forwarded-proto': clientReq.socket.encrypted ? 'https' : 'http',
      'x-forwarded-host': clientReq.headers.host || `${targetHost}:${targetPort}`
    };

    const proxyReq = http.request({
      hostname: targetHost,
      port: targetPort,
      path: clientReq.url,
      method: clientReq.method,
      headers: reqHeaders,
      timeout: 60000
    }, (proxyRes) => {
      const durationMs = Date.now() - startTime;
      const status = proxyRes.statusCode || 200;

      if (onTraffic) {
        try {
          onTraffic({
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            timestamp: new Date().toISOString(),
            method: clientReq.method ? clientReq.method.toUpperCase() : 'GET',
            path: clientReq.url || '/',
            status,
            durationMs,
            clientIp,
            headers: clientReq.headers,
            responseHeaders: proxyRes.headers
          });
        } catch (_) {}
      }

      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes);
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy(new Error('Gateway timeout'));
    });

    proxyReq.on('error', (err) => {
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        clientRes.end(`[AnyRun Gateway] Upstream service unavailable: ${err.message}`);
      }
    });

    clientReq.pipe(proxyReq);
  });

  // Handle bidirectional WebSocket upgrades (Vite HMR, Next.js Fast Refresh, socket.io)
  server.on('upgrade', (req, socket, head) => {
    const proxySocket = net.connect(targetPort, targetHost, () => {
      const headerLines = Object.entries(req.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n');

      proxySocket.write(
        `${req.method} ${req.url} HTTP/1.1\r\n` +
        headerLines +
        '\r\n\r\n'
      );

      if (head && head.length > 0) {
        proxySocket.write(head);
      }

      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    });

    const cleanup = () => {
      try { socket.destroy(); } catch (_) {}
      try { proxySocket.destroy(); } catch (_) {}
    };

    proxySocket.on('error', cleanup);
    proxySocket.on('close', cleanup);
    socket.on('error', cleanup);
    socket.on('close', cleanup);
  });

  return server;
}

/**
 * Starts the interception proxy on a free port.
 * @param {object} options
 * @param {number} options.targetPort
 * @param {string} [options.targetHost='127.0.0.1']
 * @param {number} [options.preferredPort]
 * @param {function(object): void} [options.onTraffic]
 * @returns {Promise<{ server: http.Server, port: number }>}
 */
export function startInterceptionProxy(options) {
  return new Promise((resolve, reject) => {
    const proxyServer = createInterceptionProxy(options);
    const startPort = options.preferredPort || (options.targetPort + 1000);

    function tryBind(port) {
      proxyServer.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          tryBind(port + 1);
        } else {
          reject(err);
        }
      });

      proxyServer.listen(port, '0.0.0.0', () => {
        const boundPort = proxyServer.address().port;
        resolve({ server: proxyServer, port: boundPort });
      });
    }

    tryBind(startPort);
  });
}
