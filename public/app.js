// ── Code Templates ───────────────────────────────────────────────────────────
const TEMPLATES = {
    c: {
        hello: `#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}`,
        input: `#include <stdio.h>

int main() {
    char name[50];
    int age;

    printf("Enter your name: ");
    scanf("%s", name);
    printf("Enter your age: ");
    scanf("%d", &age);

    printf("Hello %s! You are %d years old.\\n", name, age);
    return 0;
}`,
        loop: `#include <stdio.h>

int main() {
    for (int i = 1; i <= 10; i++) {
        printf("%d ", i);
    }
    printf("\\n");

    int sum = 0, n = 5, j = 1;
    while (j <= n) { sum += j; j++; }
    printf("Sum of 1 to %d = %d\\n", n, sum);
    return 0;
}`,
        array: `#include <stdio.h>

int main() {
    int arr[] = {64, 34, 25, 12, 22, 11, 90};
    int n = sizeof(arr) / sizeof(arr[0]);

    printf("Original: ");
    for (int i = 0; i < n; i++) printf("%d ", arr[i]);

    for (int i = 0; i < n-1; i++)
        for (int j = 0; j < n-i-1; j++)
            if (arr[j] > arr[j+1]) {
                int t = arr[j]; arr[j] = arr[j+1]; arr[j+1] = t;
            }

    printf("\\nSorted:   ");
    for (int i = 0; i < n; i++) printf("%d ", arr[i]);
    printf("\\n");
    return 0;
}`,
        function: `#include <stdio.h>

long long factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int isPrime(int n) {
    if (n <= 1) return 0;
    for (int i = 2; i * i <= n; i++)
        if (n % i == 0) return 0;
    return 1;
}

int main() {
    int num = 7;
    printf("Factorial of %d = %lld\\n", num, factorial(num));
    printf("%d is %s\\n", num, isPrime(num) ? "Prime" : "Not Prime");
    return 0;
}`
    },
    cpp: {
        hello: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`,
        input: `#include <iostream>
#include <string>
using namespace std;

int main() {
    string name;
    int age;
    cout << "Enter your name: ";
    cin >> name;
    cout << "Enter your age: ";
    cin >> age;
    cout << "Hello " << name << "! You are " << age << " years old." << endl;
    return 0;
}`,
        loop: `#include <iostream>
using namespace std;

int main() {
    for (int i = 1; i <= 10; i++) cout << i << " ";
    cout << endl;

    int sum = 0, n = 5, j = 1;
    while (j <= n) { sum += j; j++; }
    cout << "Sum of 1 to " << n << " = " << sum << endl;
    return 0;
}`,
        array: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

int main() {
    vector<int> arr = {64, 34, 25, 12, 22, 11, 90};
    cout << "Original: ";
    for (int x : arr) cout << x << " ";
    cout << endl;
    sort(arr.begin(), arr.end());
    cout << "Sorted:   ";
    for (int x : arr) cout << x << " ";
    cout << endl;
    return 0;
}`,
        function: `#include <iostream>
using namespace std;

long long factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

bool isPrime(int n) {
    if (n <= 1) return false;
    for (int i = 2; i * i <= n; i++)
        if (n % i == 0) return false;
    return true;
}

int main() {
    int num = 7;
    cout << "Factorial of " << num << " = " << factorial(num) << endl;
    cout << num << " is " << (isPrime(num) ? "Prime" : "Not Prime") << endl;
    return 0;
}`
    },
    python: {
        hello: `print("Hello, World!")`,
        input: `name = input("Enter your name: ")
age = input("Enter your age: ")
print(f"Hello {name}! You are {age} years old.")`,
        loop: `for i in range(1, 11):
    print(i, end=" ")
print()

total, n, j = 0, 5, 1
while j <= n:
    total += j
    j += 1
print(f"Sum of 1 to {n} = {total}")`,
        array: `arr = [64, 34, 25, 12, 22, 11, 90]
print("Original:", arr)
n = len(arr)
for i in range(n - 1):
    for j in range(n - i - 1):
        if arr[j] > arr[j + 1]:
            arr[j], arr[j + 1] = arr[j + 1], arr[j]
print("Sorted:  ", arr)`,
        function: `def factorial(n):
    if n <= 1: return 1
    return n * factorial(n - 1)

def is_prime(n):
    if n <= 1: return False
    for i in range(2, int(n**0.5) + 1):
        if n % i == 0: return False
    return True

num = 7
print(f"Factorial of {num} = {factorial(num)}")
print(f"{num} is {'Prime' if is_prime(num) else 'Not Prime'}")`
    }
};

// ── Language Config ──────────────────────────────────────────────────────────
const LANG_CONFIG = {
    c: { monacoLang: 'c', fileName: 'main.c' },
    cpp: { monacoLang: 'cpp', fileName: 'main.cpp' },
    python: { monacoLang: 'python', fileName: 'main.py' }
};

// ── State ────────────────────────────────────────────────────────────────────
let currentLanguage = 'c';
let editor = null;
let fontSize = 14;
let isRunning = false;

// ── Initialize Monaco Editor ─────────────────────────────────────────────────
require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });

require(['vs/editor/editor.main'], function () {
    monaco.editor.defineTheme('codelab-dark', {
        base: 'vs-dark', inherit: true,
        rules: [
            { token: 'comment', foreground: '6A737D', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'C792EA' },
            { token: 'string', foreground: 'C3E88D' },
            { token: 'number', foreground: 'F78C6C' },
            { token: 'type', foreground: 'FFCB6B' },
            { token: 'function', foreground: '82AAFF' },
        ],
        colors: {
            'editor.background': '#0d1117',
            'editor.foreground': '#e2e8f0',
            'editor.lineHighlightBackground': '#1a2035',
            'editor.selectionBackground': '#264f78',
            'editorCursor.foreground': '#6C63FF',
            'editorLineNumber.foreground': '#4a5568',
            'editorLineNumber.activeForeground': '#818cf8',
            'editorIndentGuide.background': '#1a2035',
        }
    });

    monaco.editor.defineTheme('codelab-light', {
        base: 'vs', inherit: true,
        rules: [
            { token: 'comment', foreground: '6A737D', fontStyle: 'italic' },
            { token: 'keyword', foreground: '7C3AED' },
            { token: 'string', foreground: '059669' },
            { token: 'number', foreground: 'EA580C' },
            { token: 'type', foreground: 'B45309' },
            { token: 'function', foreground: '2563EB' },
        ],
        colors: {
            'editor.background': '#ffffff',
            'editor.foreground': '#1e293b',
            'editor.lineHighlightBackground': '#f1f5f9',
            'editor.selectionBackground': '#bfdbfe',
            'editorCursor.foreground': '#6C63FF',
            'editorLineNumber.foreground': '#94a3b8',
            'editorLineNumber.activeForeground': '#6C63FF',
        }
    });

    editor = monaco.editor.create(document.getElementById('editorContainer'), {
        value: TEMPLATES[currentLanguage].hello,
        language: LANG_CONFIG[currentLanguage].monacoLang,
        theme: 'codelab-dark',
        fontSize: fontSize,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontLigatures: true,
        minimap: { enabled: false },
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        automaticLayout: true,
        padding: { top: 16, bottom: 16 },
        scrollBeyondLastLine: false,
        renderLineHighlight: 'all',
        roundedSelection: true,
        lineNumbersMinChars: 3,
        folding: true,
        bracketPairColorization: { enabled: true },
        suggest: { showMethods: true, showFunctions: true, showKeywords: true },
        wordWrap: 'on',
        tabSize: 4,
        insertSpaces: true,
    });

    // Keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runCode);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, debugCode);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL, clearOutput);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveCode);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, beautifyCode);

    window.addEventListener('resize', () => editor.layout());
});

// ── Language Switching ───────────────────────────────────────────────────────
document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const lang = btn.dataset.lang;
        if (lang === currentLanguage) return;
        document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentLanguage = lang;
        if (editor) {
            monaco.editor.setModelLanguage(editor.getModel(), LANG_CONFIG[lang].monacoLang);
            editor.setValue(TEMPLATES[lang].hello);
        }
        document.getElementById('fileName').textContent = LANG_CONFIG[lang].fileName;
        showToast(`Switched to ${lang.toUpperCase()}`, 'success');
    });
});

// ── Template Loading ─────────────────────────────────────────────────────────
document.querySelectorAll('.template-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const template = btn.dataset.template;
        if (editor && TEMPLATES[currentLanguage][template]) {
            editor.setValue(TEMPLATES[currentLanguage][template]);
            showToast(`Loaded "${btn.textContent}" template`, 'success');
        }
    });
});

// ── Interactive Console Output ───────────────────────────────────────────────
const consoleEl = document.getElementById('outputText');

function appendToConsole(text, className = '') {
    const span = document.createElement('span');
    if (className) span.className = className;
    span.textContent = text;
    consoleEl.appendChild(span);
    // Auto-scroll to bottom
    consoleEl.parentElement.scrollTop = consoleEl.parentElement.scrollHeight;
}

function clearConsole() {
    consoleEl.innerHTML = '';
}

// ── Run Code (HTTP-based for Vercel) ─────────────────────────────────────────
async function runCode() {
    if (isRunning) return;
    if (!editor) return;

    const code = editor.getValue().trim();
    if (!code) {
        showToast('Please write some code first!', 'error');
        return;
    }

    isRunning = true;
    setStatus('running');
    toggleStopButton(true);
    switchTab('output');

    clearConsole();
    document.getElementById('execTime').style.display = 'none';
    appendToConsole('Compiling & Running...\n', 'output-status');

    try {
        const response = await fetch('/api/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language: currentLanguage,
                code: code,
                input: document.getElementById('stdinInput').value
            })
        });

        const result = await response.json();
        clearConsole();

        if (result.output) {
            appendToConsole(result.output, 'output-success');
        }
        if (result.error) {
            appendToConsole(result.error, 'output-error');
        }
        if (!result.output && !result.error) {
            appendToConsole('Program executed with no output.', 'output-status');
        }

        // Show execution time
        if (result.executionTime > 0) {
            const execTimeEl = document.getElementById('execTime');
            const execTimeValueEl = document.getElementById('execTimeValue');
            execTimeEl.style.display = 'flex';
            execTimeValueEl.textContent = result.executionTime < 1000
                ? `${result.executionTime}ms`
                : `${(result.executionTime / 1000).toFixed(2)}s`;
            const hasError = result.error && !result.output;
            execTimeEl.style.borderColor = hasError ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)';
            execTimeEl.style.background = hasError ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)';
            execTimeEl.style.color = hasError ? 'var(--error)' : 'var(--success)';
        }
    } catch (err) {
        clearConsole();
        appendToConsole('❌ Connection error: ' + err.message, 'output-error');
    } finally {
        isRunning = false;
        setStatus('ready');
        toggleStopButton(false);
    }
}

// ── Stop Execution ───────────────────────────────────────────────────────────
function stopExecution() {
    showToast('Execution will complete on the server', 'info');
}

// ── Debug Code (still uses HTTP) ─────────────────────────────────────────────
async function debugCode() {
    if (isRunning) return;
    if (!editor) return;

    const code = editor.getValue().trim();
    if (!code) { showToast('Please write some code first!', 'error'); return; }

    isRunning = true;
    setStatus('debugging');
    toggleStopButton(true);
    switchTab('debug');

    try {
        const response = await fetch('/api/debug', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language: currentLanguage,
                code: code,
                input: document.getElementById('stdinInput').value,
                breakpoints: []
            })
        });

        const result = await response.json();
        displayDebugOutput(result);
    } catch (err) {
        document.getElementById('debugSteps').innerHTML = `
            <div class="debug-placeholder" style="color: var(--error);">
                <p>❌ Connection error: ${err.message}</p>
            </div>`;
    } finally {
        isRunning = false;
        setStatus('ready');
        toggleStopButton(false);
    }
}

// ── Share, Save, Download, Beautify ──────────────────────────────────────────
async function shareCode() {
    if (!editor) return;
    try {
        await navigator.clipboard.writeText(editor.getValue());
        showToast('✅ Code copied to clipboard!', 'success');
    } catch (err) {
        const ta = document.createElement('textarea');
        ta.value = editor.getValue();
        ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        showToast('✅ Code copied!', 'success');
    }
}

function saveCode() {
    if (!editor) return;
    const blob = new Blob([editor.getValue()], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = LANG_CONFIG[currentLanguage].fileName;
    a.click(); URL.revokeObjectURL(a.href);
    showToast(`💾 Saved as ${LANG_CONFIG[currentLanguage].fileName}`, 'success');
}

function downloadOutput() {
    const text = consoleEl.textContent;
    if (!text) { showToast('No output to download', 'error'); return; }
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'output.txt';
    a.click(); URL.revokeObjectURL(a.href);
    showToast('💾 Output downloaded', 'success');
}

function beautifyCode() {
    if (!editor) return;
    editor.getAction('editor.action.formatDocument')?.run();
    showToast('✨ Code formatted!', 'success');
}

// ── Display Debug Output ─────────────────────────────────────────────────────
function displayDebugOutput(result) {
    const stepsEl = document.getElementById('debugSteps');
    if (!result.debugSteps || result.debugSteps.length === 0) {
        stepsEl.innerHTML = `<div class="debug-placeholder"><p>${result.error ? `<span class="output-error">${escapeHtml(result.error)}</span>` : 'No debug steps captured.'}</p></div>`;
        return;
    }

    let html = '';
    if (result.output && result.output.trim()) {
        html += `<div class="debug-step" style="border-left-color: var(--success);">
            <div class="debug-step-number" style="background: var(--success);">▶</div>
            <div class="debug-step-info">
                <div class="debug-step-line" style="color: var(--success);">Program Output</div>
                <div class="debug-step-code">${escapeHtml(result.output.trim())}</div>
            </div>
        </div>`;
    }

    for (const step of result.debugSteps) {
        html += `<div class="debug-step">
            <div class="debug-step-number">${step.stepNumber}</div>
            <div class="debug-step-info">
                <div class="debug-step-line">Line ${step.line}</div>
                <div class="debug-step-code">${escapeHtml(step.code)}</div>
            </div>
        </div>`;
    }

    if (result.error) {
        html += `<div class="debug-step" style="border-left-color: var(--error);">
            <div class="debug-step-number" style="background: var(--error);">!</div>
            <div class="debug-step-info">
                <div class="debug-step-line" style="color: var(--error);">Error</div>
                <div class="debug-step-code output-error">${escapeHtml(result.error)}</div>
            </div>
        </div>`;
    }

    if (result.executionTime > 0) {
        document.getElementById('execTime').style.display = 'flex';
        document.getElementById('execTimeValue').textContent = `${result.executionTime}ms`;
    }

    stepsEl.innerHTML = html;
}

// ── Tab Switching ────────────────────────────────────────────────────────────
document.querySelectorAll('.output-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

function switchTab(tabName) {
    document.querySelectorAll('.output-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.output-tab[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById('outputContent').style.display = tabName === 'output' ? 'block' : 'none';
    document.getElementById('debugContent').style.display = tabName === 'debug' ? 'block' : 'none';
}

// ── Clear Output ─────────────────────────────────────────────────────────────
function clearOutput() {
    clearConsole();
    consoleInput.style.display = 'none';
    document.getElementById('debugSteps').innerHTML = `
        <div class="debug-placeholder">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p>Click <strong>Debug</strong> or press <strong>Ctrl+D</strong> to trace execution.</p>
        </div>`;
    document.getElementById('execTime').style.display = 'none';
    showToast('Output cleared', 'success');
}

// ── Toggle Stop Button ───────────────────────────────────────────────────────
function toggleStopButton(show) {
    document.getElementById('btnStop').style.display = show ? 'flex' : 'none';
    document.getElementById('btnRun').style.display = show ? 'none' : 'flex';
    document.getElementById('btnDebug').style.display = show ? 'none' : 'flex';
}

// ── Button Handlers ──────────────────────────────────────────────────────────
document.getElementById('btnRun').addEventListener('click', runCode);
document.getElementById('btnDebug').addEventListener('click', debugCode);
document.getElementById('btnStop').addEventListener('click', stopExecution);
document.getElementById('btnShare').addEventListener('click', shareCode);
document.getElementById('btnSave').addEventListener('click', saveCode);
document.getElementById('btnBeautify').addEventListener('click', beautifyCode);
document.getElementById('btnDownload').addEventListener('click', downloadOutput);
document.getElementById('btnClear').addEventListener('click', clearOutput);

// ── Font Size Controls ───────────────────────────────────────────────────────
document.getElementById('fontIncrease').addEventListener('click', () => {
    if (fontSize < 24) { fontSize++; if (editor) editor.updateOptions({ fontSize }); document.getElementById('fontSizeDisplay').textContent = `${fontSize}px`; }
});
document.getElementById('fontDecrease').addEventListener('click', () => {
    if (fontSize > 10) { fontSize--; if (editor) editor.updateOptions({ fontSize }); document.getElementById('fontSizeDisplay').textContent = `${fontSize}px`; }
});

// ── Theme Toggle ─────────────────────────────────────────────────────────────
let darkMode = true;
document.getElementById('themeToggle').addEventListener('click', () => {
    darkMode = !darkMode;
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    if (editor) monaco.editor.setTheme(darkMode ? 'codelab-dark' : 'codelab-light');
    showToast(`${darkMode ? 'Dark' : 'Light'} mode`, 'success');
});

// ── Input Toggle ─────────────────────────────────────────────────────────────
document.getElementById('toggleInput').addEventListener('click', () => {
    document.getElementById('inputSection').classList.toggle('collapsed');
});

// ── Utility Functions ────────────────────────────────────────────────────────
function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast toast-${type} show`;
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function setStatus(status) {
    const dot = document.getElementById('statusDot');
    switch (status) {
        case 'running':
            dot.style.background = 'var(--warning)'; dot.style.boxShadow = '0 0 6px var(--warning)'; dot.title = 'Running...'; break;
        case 'debugging':
            dot.style.background = 'var(--info)'; dot.style.boxShadow = '0 0 6px var(--info)'; dot.title = 'Debugging...'; break;
        default:
            dot.style.background = 'var(--success)'; dot.style.boxShadow = '0 0 6px var(--success)'; dot.title = 'Ready';
    }
}

// ── Global Keyboard Shortcuts ────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); runCode(); }
    if (e.ctrlKey && e.key === 'd') { e.preventDefault(); debugCode(); }
    if (e.ctrlKey && e.key === 'l') { e.preventDefault(); clearOutput(); }
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveCode(); }
    if (e.ctrlKey && e.key === 'b') { e.preventDefault(); beautifyCode(); }
});
