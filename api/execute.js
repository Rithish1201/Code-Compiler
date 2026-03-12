// Vercel Serverless Function: /api/execute
// Uses Piston API (free, no auth) for remote code execution

const PISTON_API = 'https://emkc.org/api/v2/piston';

const LANG_MAP = {
    c: { language: 'c', version: '10.2.0' },
    cpp: { language: 'c++', version: '10.2.0' },
    python: { language: 'python', version: '3.10.0' }
};

// Dangerous patterns to block
const DANGEROUS_C = [
    /\bsystem\s*\(/, /\bexecl\s*\(/, /\bfork\s*\(/,
    /\bpopen\s*\(/, /\b__asm__\b/, /\basm\s*\(/,
];

const DANGEROUS_PY = [
    /\bos\.system\s*\(/, /\bos\.popen\s*\(/,
    /\bsubprocess\b/, /\b__import__\s*\(/,
];

function checkSafety(language, code) {
    const patterns = language === 'python' ? DANGEROUS_PY : DANGEROUS_C;
    for (const p of patterns) {
        if (p.test(code)) {
            const m = code.match(p);
            return `Blocked: use of restricted function "${m[0].trim()}" is not allowed for security reasons.`;
        }
    }
    return null;
}

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { language, code, input } = req.body;

        if (!language || !code) {
            return res.status(400).json({
                output: '',
                error: '❌ Language and code are required.',
                executionTime: 0
            });
        }

        if (!LANG_MAP[language]) {
            return res.status(400).json({
                output: '',
                error: `❌ Unsupported language: "${language}".`,
                executionTime: 0
            });
        }

        // Safety check
        const blocked = checkSafety(language, code);
        if (blocked) {
            return res.json({ output: '', error: blocked, executionTime: 0 });
        }

        const startTime = Date.now();

        // Call Piston API
        const pistonRes = await fetch(`${PISTON_API}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language: LANG_MAP[language].language,
                version: LANG_MAP[language].version,
                files: [{ content: code }],
                stdin: input || '',
                run_timeout: 5000,
                compile_timeout: 5000
            })
        });

        const result = await pistonRes.json();
        const elapsed = Date.now() - startTime;

        if (result.message) {
            return res.json({ output: '', error: `❌ ${result.message}`, executionTime: elapsed });
        }

        const runOutput = result.run || {};
        const compileOutput = result.compile || {};

        // Check for compile errors
        if (compileOutput.code !== 0 && compileOutput.stderr) {
            return res.json({
                output: compileOutput.stdout || '',
                error: compileOutput.stderr,
                executionTime: elapsed
            });
        }

        res.json({
            output: runOutput.stdout || '',
            error: runOutput.stderr || '',
            executionTime: elapsed
        });

    } catch (err) {
        console.error('Execution error:', err);
        res.status(500).json({
            output: '',
            error: '❌ Server error. Please try again.',
            executionTime: 0
        });
    }
};
