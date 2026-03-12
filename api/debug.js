// Vercel Serverless Function: /api/debug
// Uses Piston API for code execution with debug instrumentation

const PISTON_API = 'https://emkc.org/api/v2/piston';

const LANG_MAP = {
    c: { language: 'c', version: '10.2.0' },
    cpp: { language: 'c++', version: '10.2.0' },
    python: { language: 'python', version: '3.10.0' }
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { language, code, input, breakpoints } = req.body;

        if (!language || !code) {
            return res.status(400).json({
                output: '', error: '❌ Language and code are required.',
                debugSteps: [], executionTime: 0
            });
        }

        const lines = code.split('\n');
        const bps = (breakpoints && breakpoints.length > 0) ? breakpoints : [];

        // Auto-generate breakpoints if none provided
        if (bps.length === 0) {
            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                if (trimmed && trimmed !== '{' && trimmed !== '}' &&
                    !trimmed.startsWith('#') && !trimmed.startsWith('//') &&
                    !trimmed.startsWith('using') && !trimmed.startsWith('import') &&
                    !trimmed.startsWith('from')) {
                    bps.push(i + 1);
                }
            }
        }

        const marker = '___DEBUG_TRACE___';
        let instrumentedCode = '';

        if (language === 'python') {
            for (let i = 0; i < lines.length; i++) {
                instrumentedCode += lines[i] + '\n';
                if (bps.includes(i + 1)) {
                    const indent = lines[i].match(/^(\s*)/)[1];
                    instrumentedCode += `${indent}print("${marker}:LINE ${i + 1}:${lines[i].trim().replace(/"/g, '\\"')}")\n`;
                }
            }
        } else {
            let hasStdio = code.includes('#include <stdio.h>') || code.includes('#include <cstdio>') || code.includes('#include <iostream>');
            if (!hasStdio && language === 'c') instrumentedCode = '#include <stdio.h>\n';

            for (let i = 0; i < lines.length; i++) {
                instrumentedCode += lines[i] + '\n';
                if (bps.includes(i + 1)) {
                    const escaped = lines[i].trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%');
                    if (language === 'cpp' && code.includes('#include <iostream>')) {
                        instrumentedCode += `    std::cout << "${marker}:LINE ${i + 1}:${escaped}" << std::endl;\n`;
                    } else {
                        instrumentedCode += `    printf("${marker}:LINE ${i + 1}:${escaped}\\n");\n`;
                    }
                }
            }
        }

        const startTime = Date.now();

        const pistonRes = await fetch(`${PISTON_API}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language: LANG_MAP[language].language,
                version: LANG_MAP[language].version,
                files: [{ content: instrumentedCode }],
                stdin: input || '',
                run_timeout: 5000,
                compile_timeout: 5000
            })
        });

        const result = await pistonRes.json();
        const elapsed = Date.now() - startTime;
        const runOutput = result.run || {};

        // Parse debug traces
        const outputLines = (runOutput.stdout || '').split('\n');
        const debugSteps = [];
        const cleanOutput = [];

        for (const line of outputLines) {
            if (line.includes(marker)) {
                const parts = line.split(marker + ':')[1];
                if (parts) {
                    const [lineInfo, ...codeParts] = parts.split(':');
                    const lineNum = parseInt(lineInfo.replace('LINE ', ''));
                    debugSteps.push({
                        line: lineNum,
                        code: codeParts.join(':'),
                        stepNumber: debugSteps.length + 1
                    });
                }
            } else {
                cleanOutput.push(line);
            }
        }

        res.json({
            output: cleanOutput.join('\n'),
            error: runOutput.stderr || '',
            debugSteps,
            executionTime: elapsed
        });

    } catch (err) {
        console.error('Debug error:', err);
        res.status(500).json({
            output: '', error: '❌ Server error.',
            debugSteps: [], executionTime: 0
        });
    }
};
