const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { executeCode, debugCode, activeProcesses } = require('./executor');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Rate limiting (simple in-memory) ─────────────────────────────────────────
const requestCounts = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60000;

function rateLimit(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const record = requestCounts.get(ip);

    if (!record || now - record.start > RATE_WINDOW) {
        requestCounts.set(ip, { start: now, count: 1 });
        return next();
    }

    record.count++;
    if (record.count > RATE_LIMIT) {
        return res.status(429).json({
            output: '',
            error: '⚠️ Rate limit exceeded. Please wait a moment before submitting again.',
            executionTime: 0
        });
    }

    next();
}

// ── Dangerous patterns ───────────────────────────────────────────────────────
const DANGEROUS_C = [
    /\bsystem\s*\(/, /\bexecl\s*\(/, /\bexeclp\s*\(/, /\bexecle\s*\(/,
    /\bexecv\s*\(/, /\bexecvp\s*\(/, /\bexecvpe\s*\(/,
    /\bfork\s*\(/, /\bpopen\s*\(/, /\bpclose\s*\(/,
    /\b__asm__\b/, /\basm\s*\(/, /\bsignal\s*\(/,
    /\bkill\s*\(/, /\bunlink\s*\(/, /\brmdir\s*\(/,
    /\brename\s*\(/, /\bchmod\s*\(/, /\bchown\s*\(/,
];

const DANGEROUS_PY = [
    /\bos\.system\s*\(/, /\bos\.popen\s*\(/, /\bos\.exec\w*\s*\(/,
    /\bos\.fork\s*\(/, /\bos\.kill\s*\(/, /\bos\.remove\s*\(/,
    /\bos\.unlink\s*\(/, /\bos\.rmdir\s*\(/, /\bsubprocess\b/,
    /\b__import__\s*\(/, /\beval\s*\(/, /\bexec\s*\(/,
    /\bcompile\s*\(/, /\bopen\s*\([^)]*['"][wa]/,
];

function isSafe(language, code) {
    const patterns = language === 'python' ? DANGEROUS_PY : DANGEROUS_C;
    for (const p of patterns) {
        if (p.test(code)) {
            const m = code.match(p);
            return `Blocked: use of restricted function "${m[0].trim()}" is not allowed for security reasons.`;
        }
    }
    return null;
}

// ── Temp dir ─────────────────────────────────────────────────────────────────
const TEMP_DIR = path.join(os.tmpdir(), 'online-compiler');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
const TIMEOUT_MS = 5000;

function getExt(lang) {
    return lang === 'c' ? '.c' : lang === 'cpp' ? '.cpp' : '.py';
}

// ── HTTP Routes ──────────────────────────────────────────────────────────────

app.post('/api/execute', rateLimit, async (req, res) => {
    try {
        const { language, code, input } = req.body;
        if (!language || !code) {
            return res.status(400).json({ output: '', error: '❌ Language and code are required.', executionTime: 0 });
        }
        if (!['c', 'cpp', 'python'].includes(language)) {
            return res.status(400).json({ output: '', error: `❌ Unsupported language: "${language}".`, executionTime: 0 });
        }
        const result = await executeCode(language, code, input || '');
        res.json(result);
    } catch (err) {
        console.error('Execution error:', err);
        res.status(500).json({ output: '', error: '❌ Internal server error.', executionTime: 0 });
    }
});

app.post('/api/debug', rateLimit, async (req, res) => {
    try {
        const { language, code, input, breakpoints } = req.body;
        if (!language || !code) {
            return res.status(400).json({ output: '', error: '❌ Language and code are required.', debugSteps: [], executionTime: 0 });
        }
        if (!['c', 'cpp', 'python'].includes(language)) {
            return res.status(400).json({ output: '', error: `❌ Unsupported language.`, debugSteps: [], executionTime: 0 });
        }
        const result = await debugCode(language, code, input || '', breakpoints || []);
        res.json(result);
    } catch (err) {
        console.error('Debug error:', err);
        res.status(500).json({ output: '', error: '❌ Internal server error.', debugSteps: [], executionTime: 0 });
    }
});

app.post('/api/stop', (req, res) => {
    let killed = 0;
    if (activeProcesses && activeProcesses.size > 0) {
        for (const [id, proc] of activeProcesses) {
            try { proc.kill('SIGKILL'); killed++; } catch (e) { }
        }
        activeProcesses.clear();
    }
    res.json({ stopped: true, killed });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Create HTTP server + WebSocket ───────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    let childProcess = null;
    let fileId = null;
    let sourceFile = null;
    let outputFile = null;
    let timer = null;

    const cleanup = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        if (sourceFile) try { if (fs.existsSync(sourceFile)) fs.unlinkSync(sourceFile); } catch (e) { }
        if (outputFile) try { if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile); } catch (e) { }
        if (fileId && activeProcesses.has(fileId)) activeProcesses.delete(fileId);
    };

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch (e) { return; }

        // ── User sends input to running process ──
        if (msg.type === 'stdin' && childProcess && !childProcess.killed) {
            try {
                childProcess.stdin.write(msg.data + '\n');
            } catch (e) { }
            return;
        }

        // ── User wants to stop ──
        if (msg.type === 'stop') {
            if (childProcess && !childProcess.killed) {
                try { childProcess.kill('SIGKILL'); } catch (e) { }
            }
            cleanup();
            ws.send(JSON.stringify({ type: 'stopped' }));
            return;
        }

        // ── Start interactive execution ──
        if (msg.type === 'run') {
            const { language, code } = msg;
            if (!language || !code) {
                ws.send(JSON.stringify({ type: 'error', data: '❌ Language and code are required.' }));
                ws.send(JSON.stringify({ type: 'exit', code: 1 }));
                return;
            }
            if (!['c', 'cpp', 'python'].includes(language)) {
                ws.send(JSON.stringify({ type: 'error', data: '❌ Unsupported language.' }));
                ws.send(JSON.stringify({ type: 'exit', code: 1 }));
                return;
            }

            // Security check
            const blocked = isSafe(language, code);
            if (blocked) {
                ws.send(JSON.stringify({ type: 'error', data: blocked }));
                ws.send(JSON.stringify({ type: 'exit', code: 1 }));
                return;
            }

            fileId = uuidv4();
            const ext = getExt(language);
            sourceFile = path.join(TEMP_DIR, `${fileId}${ext}`);
            outputFile = path.join(TEMP_DIR, `${fileId}${process.platform === 'win32' ? '.exe' : '.out'}`);

            fs.writeFileSync(sourceFile, code, 'utf8');

            const startTime = Date.now();

            if (language === 'c' || language === 'cpp') {
                const compiler = language === 'c' ? 'gcc' : 'g++';
                ws.send(JSON.stringify({ type: 'status', data: `Compiling with ${compiler}...` }));

                exec(`${compiler} "${sourceFile}" -o "${outputFile}" -lm`, {
                    timeout: TIMEOUT_MS,
                    maxBuffer: 1024 * 1024
                }, (compileErr, _, compileStderr) => {
                    if (compileErr) {
                        ws.send(JSON.stringify({ type: 'error', data: compileStderr || compileErr.message || 'Compilation failed' }));
                        ws.send(JSON.stringify({ type: 'exit', code: 1, time: Date.now() - startTime }));
                        cleanup();
                        return;
                    }

                    ws.send(JSON.stringify({ type: 'status', data: 'Running...' }));
                    const runStart = Date.now();

                    childProcess = exec(`"${outputFile}"`, {
                        maxBuffer: 1024 * 1024
                    });

                    activeProcesses.set(fileId, childProcess);

                    // Timeout
                    timer = setTimeout(() => {
                        if (childProcess && !childProcess.killed) {
                            childProcess.kill('SIGKILL');
                            ws.send(JSON.stringify({ type: 'error', data: `⏱ Execution timed out after ${TIMEOUT_MS / 1000} seconds.` }));
                            ws.send(JSON.stringify({ type: 'exit', code: 1, time: Date.now() - runStart }));
                            cleanup();
                        }
                    }, TIMEOUT_MS);

                    childProcess.stdout.on('data', (data) => {
                        ws.send(JSON.stringify({ type: 'stdout', data: data.toString() }));
                    });

                    childProcess.stderr.on('data', (data) => {
                        ws.send(JSON.stringify({ type: 'stderr', data: data.toString() }));
                    });

                    childProcess.on('close', (exitCode) => {
                        const elapsed = Date.now() - runStart;
                        ws.send(JSON.stringify({ type: 'exit', code: exitCode || 0, time: elapsed }));
                        cleanup();
                    });
                });
            } else if (language === 'python') {
                ws.send(JSON.stringify({ type: 'status', data: 'Running Python...' }));
                const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

                childProcess = exec(`${pythonCmd} "${sourceFile}"`, {
                    maxBuffer: 1024 * 1024
                });

                activeProcesses.set(fileId, childProcess);

                timer = setTimeout(() => {
                    if (childProcess && !childProcess.killed) {
                        childProcess.kill('SIGKILL');
                        ws.send(JSON.stringify({ type: 'error', data: `⏱ Execution timed out after ${TIMEOUT_MS / 1000} seconds.` }));
                        ws.send(JSON.stringify({ type: 'exit', code: 1, time: Date.now() - startTime }));
                        cleanup();
                    }
                }, TIMEOUT_MS);

                childProcess.stdout.on('data', (data) => {
                    ws.send(JSON.stringify({ type: 'stdout', data: data.toString() }));
                });

                childProcess.stderr.on('data', (data) => {
                    ws.send(JSON.stringify({ type: 'stderr', data: data.toString() }));
                });

                childProcess.on('close', (exitCode) => {
                    const elapsed = Date.now() - startTime;
                    ws.send(JSON.stringify({ type: 'exit', code: exitCode || 0, time: elapsed }));
                    cleanup();
                });
            }
        }
    });

    ws.on('close', () => {
        if (childProcess && !childProcess.killed) {
            try { childProcess.kill('SIGKILL'); } catch (e) { }
        }
        cleanup();
    });
});

// ── Start server ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`\n🚀 Online Compiler Server running at http://localhost:${PORT}\n`);
});
