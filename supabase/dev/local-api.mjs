// API για ΤΟΠΙΚΗ δοκιμή (npm run local:api): ψεύτικα μαγαζιά (χωρίς Google/κόστος), χωρίς έλεγχο σύνδεσης,
// θύρα 8788. Οι τιμές εδώ υπερισχύουν του apps/api/.env (το Node δεν αντικαθιστά υπάρχουσες μεταβλητές).
//
// + Proxy για το κινητό: 0.0.0.0:54330 → τοπικό Supabase (127.0.0.1:54321), μαζί με websockets (realtime).
//   Το Windows Firewall συχνά επιτρέπει το Node αλλά μπλοκάρει τις θύρες του Docker.
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';

const SUPABASE = { host: '127.0.0.1', port: 54321 };
const PROXY_PORT = 54330;

const proxy = http.createServer((req, res) => {
  const up = http.request({ ...SUPABASE, method: req.method, path: req.url, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end('Supabase δεν απαντά (npm run local:up;)');
  });
  req.pipe(up);
});
// Websockets (realtime): προωθούμε το upgrade αυτούσιο
proxy.on('upgrade', (req, socket, head) => {
  const up = net.connect(SUPABASE.port, SUPABASE.host, () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    up.write(lines.join('\r\n') + '\r\n\r\n');
    if (head?.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  const close = () => {
    up.destroy();
    socket.destroy();
  };
  up.on('error', close);
  socket.on('error', close);
});
proxy.listen(PROXY_PORT, '0.0.0.0', () => console.log(`Supabase proxy για το κινητό: http://0.0.0.0:${PROXY_PORT}`));

const env = {
  ...process.env,
  PORT: '8788',
  USE_MOCK_PROVIDERS: 'true',
  REQUIRE_AUTH: 'false',
  GOOGLE_MAPS_API_KEY: '',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_JWT_SECRET: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  NODE_ENV: 'development',
};
const child = spawn('npm', ['run', 'start', '-w', '@centimeet/api'], { env, stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
