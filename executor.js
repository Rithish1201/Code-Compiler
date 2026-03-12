const { execFile, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

const TIMEOUT_MS = 5000;
const TEMP_DIR = path.join(os.tmpdir(), 'online-compiler');

// Track active child processes for Stop functionality
const activeProcesses = new Map();

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// ── Dangerous patterns to block ──────────────────────────────────────────────
const DANGEROUS_PATTERNS_C = [
    /\bsystem\s*\(/,
    /\bexecl\s*\(/, /\bexeclp\s*\(/, /\bexecle\s*\(/,
    /\bexecv\s*\(/, /\bexecvp\s*\(/, /\bexecvpe\s*\(/,
    /\bfork\s*\(/,
    /\bpopen\s*\(/,
    /\bpclose\s*\(/,
    /\b__asm__\b/, /\basm\s*\(/,
    /\bsignal\s*\(/,
    /\bkill\s*\(/,
    /\bunlink\s*\(/,
    /\brmdir\s*\(/,
    /\brename\s*\(/,
    /\bchmod\s*\(/,
    /\bchown\s*\(/,
];

const DANGEROUS_PATTERNS_PYTHON = [
    /\bos\.system\s*\(/,
    /\bos\.popen\s*\(/,
    /\bos\.exec\w*\s*\(/,
    /\bos\.fork\s*\(/,
    /\bos\.kill\s*\(/,
    /\bos\.remove\s*\(/,
    /\bos\.unlink\s*\(/,
    /\bos\.rmdir\s*\(/,
    /\bsubprocess\b/,
    /\b__import__\s*\(/,
    /\beval\s*\(/,
    /\bexec\s*\(/,
    /\bcompile\s*\(/,
    /\bopen\s*\([^)]*['"][wa]/,
];

// ── Sanitize code ────────────────────────────────────────────────────────────
function sanitizeCode(language, code) {
    const patterns = (language === 'python')
        ? DANGEROUS_PATTERNS_PYTHON
        : DANGEROUS_PATTERNS_C;

    for (const pattern of patterns) {
        if (pattern.test(code)) {
            const match = code.match(pattern);
            return {
                safe: false,
                reason: `Blocked: use of restricted function "${match[0].trim()}" is not allowed for security reasons.`
            };
        }
    }
    return { safe: true };
}

// ── Get file extension ───────────────────────────────────────────────────────
function getExtension(language) {
    switch (language) {
        case 'c': return '.c';
        case 'cpp': return '.cpp';
        case 'python': return '.py';
        default: return '.txt';
    }
}

// ── Execute code ─────────────────────────────────────────────────────────────
function executeCode(language, code, input = '') {
    return new Promise((resolve) => {
        // Sanitize
        const check = sanitizeCode(language, code);
        if (!check.safe) {
            return resolve({
                output: '',
                error: check.reason,
                executionTime: 0
            });
        }

        const fileId = uuidv4();
        const ext = getExtension(language);
        const sourceFile = path.join(TEMP_DIR, `${fileId}${ext}`);
        const outputFile = path.join(TEMP_DIR, `${fileId}${process.platform === 'win32' ? '.exe' : '.out'}`);

        // Write source code to temp file
        fs.writeFileSync(sourceFile, code, 'utf8');

        const cleanup = () => {
            try { if (fs.existsSync(sourceFile)) fs.unlinkSync(sourceFile); } catch (e) { }
            try { if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile); } catch (e) { }
        };

        const startTime = Date.now();

        // Detect if code uses input functions to provide better timeout messages
        const usesInput = /\bscanf\s*\(|\bcin\s*>>|\bgetchar\s*\(|\bgets\s*\(|\bfgets\s*\(|\bgetline\s*\(|\binput\s*\(|\breadline\s*\(/.test(code);
        const noInputProvided = !input || input.trim() === '';
        const timeoutMsg = (usesInput && noInputProvided)
            ? `⏱ Execution timed out after ${TIMEOUT_MS / 1000} seconds. Your program reads input (scanf/cin/input) but no Standard Input was provided. Please enter input values in the "Standard Input" area below the editor.`
            : `⏱ Execution timed out after ${TIMEOUT_MS / 1000} seconds. Check for infinite loops or provide input if your program needs it.`;

        if (language === 'c' || language === 'cpp') {
            // Compile first
            const compiler = language === 'c' ? 'gcc' : 'g++';
            const compileArgs = [sourceFile, '-o', outputFile, '-lm'];

            exec(`${compiler} "${sourceFile}" -o "${outputFile}" -lm`, {
                timeout: TIMEOUT_MS,
                maxBuffer: 1024 * 1024
            }, (compileErr, compileStdout, compileStderr) => {
                if (compileErr) {
                    const elapsed = Date.now() - startTime;
                    cleanup();
                    return resolve({
                        output: '',
                        error: compileStderr || compileErr.message || 'Compilation failed',
                        executionTime: elapsed
                    });
                }

                // Run compiled binary
                const runStart = Date.now();
                const child = exec(`"${outputFile}"`, {
                    timeout: TIMEOUT_MS,
                    maxBuffer: 1024 * 1024
                }, (runErr, runStdout, runStderr) => {
                    const elapsed = Date.now() - runStart;
                    activeProcesses.delete(fileId);
                    cleanup();

                    if (runErr && runErr.killed) {
                        return resolve({
                            output: runStdout || '',
                            error: timeoutMsg,
                            executionTime: elapsed
                        });
                    }

                    resolve({
                        output: runStdout || '',
                        error: runStderr || (runErr ? runErr.message : ''),
                        executionTime: elapsed
                    });
                });

                activeProcesses.set(fileId, child);

                // Send stdin input
                if (input) {
                    child.stdin.write(input);
                    child.stdin.end();
                }
            });
        } else if (language === 'python') {
            const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
            const child = exec(`${pythonCmd} "${sourceFile}"`, {
                timeout: TIMEOUT_MS,
                maxBuffer: 1024 * 1024
            }, (err, stdout, stderr) => {
                const elapsed = Date.now() - startTime;
                activeProcesses.delete(fileId);
                cleanup();

                if (err && err.killed) {
                    return resolve({
                        output: stdout || '',
                        error: timeoutMsg,
                        executionTime: elapsed
                    });
                }

                resolve({
                    output: stdout || '',
                    error: stderr || (err ? err.message : ''),
                    executionTime: elapsed
                });
            });

            activeProcesses.set(fileId, child);

            if (input) {
                child.stdin.write(input);
                child.stdin.end();
            }
        } else {
            cleanup();
            resolve({
                output: '',
                error: `Unsupported language: ${language}`,
                executionTime: 0
            });
        }
    });
}

// ── Debug code (instrument with trace statements) ────────────────────────────
function debugCode(language, code, input = '', breakpoints = []) {
    return new Promise((resolve) => {
        const check = sanitizeCode(language, code);
        if (!check.safe) {
            return resolve({
                output: '',
                error: check.reason,
                debugSteps: [],
                executionTime: 0
            });
        }

        const lines = code.split('\n');

        // If no breakpoints, add them at every non-empty, non-brace line
        if (!breakpoints || breakpoints.length === 0) {
            breakpoints = [];
            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                if (trimmed && trimmed !== '{' && trimmed !== '}' && !trimmed.startsWith('#') && !trimmed.startsWith('//') && !trimmed.startsWith('using') && !trimmed.startsWith('import') && !trimmed.startsWith('from')) {
                    breakpoints.push(i + 1); // 1-indexed
                }
            }
        }

        let instrumentedCode = '';
        const marker = '___DEBUG_TRACE___';

        if (language === 'python') {
            // For Python, insert print statements after each breakpoint line
            for (let i = 0; i < lines.length; i++) {
                instrumentedCode += lines[i] + '\n';
                if (breakpoints.includes(i + 1)) {
                    // Get indentation of current line
                    const indent = lines[i].match(/^(\s*)/)[1];
                    instrumentedCode += `${indent}print("${marker}:LINE ${i + 1}:${lines[i].trim().replace(/"/g, '\\"')}")\n`;
                }
            }
        } else {
            // For C/C++, insert printf statements after each breakpoint line
            let hasStdio = code.includes('#include <stdio.h>') || code.includes('#include <cstdio>') || code.includes('#include <iostream>');
            if (!hasStdio && language === 'c') {
                instrumentedCode = '#include <stdio.h>\n';
            }

            for (let i = 0; i < lines.length; i++) {
                instrumentedCode += lines[i] + '\n';
                if (breakpoints.includes(i + 1)) {
                    const escapedLine = lines[i].trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%');
                    if (language === 'cpp' && code.includes('#include <iostream>')) {
                        instrumentedCode += `    std::cout << "${marker}:LINE ${i + 1}:${escapedLine}" << std::endl;\n`;
                    } else {
                        instrumentedCode += `    printf("${marker}:LINE ${i + 1}:${escapedLine}\\n");\n`;
                    }
                }
            }
        }

        // Execute the instrumented code
        executeCode(language, instrumentedCode, input).then((result) => {
            // Parse debug traces from output
            const outputLines = (result.output || '').split('\n');
            const debugSteps = [];
            let cleanOutput = [];

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

            resolve({
                output: cleanOutput.join('\n'),
                error: result.error,
                debugSteps: debugSteps,
                executionTime: result.executionTime
            });
        });
    });
}

module.exports = { executeCode, debugCode, activeProcesses };
