// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const GROQ_MODEL             = 'llama-3.3-70b-versatile';
const MAX_ATTEMPTS_BEFORE_PSEUDO = 3;

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let state = {
  apiKey:      null,
  problemData: null,
  chatHistory: [],
  attempts:    0,
  pseudoGiven: false,
};

// ─────────────────────────────────────────────
//  DOM REFS
// ─────────────────────────────────────────────
const keyScreen      = document.getElementById('key-screen');
const startScreen    = document.getElementById('start-screen');
const chatEl         = document.getElementById('chat');
const inputArea      = document.getElementById('input-area');
const settingsPanel  = document.getElementById('settings-panel');
const contextBar     = document.getElementById('context-bar');

const apiKeyInput    = document.getElementById('api-key-input');
const toggleKeyVis   = document.getElementById('toggle-key-vis');
const saveKeyBtn     = document.getElementById('save-key-btn');
const keyError       = document.getElementById('key-error');
const keySuccess     = document.getElementById('key-success');

const startBtn       = document.getElementById('start-btn');
const errorMsg       = document.getElementById('error-msg');

const userInput      = document.getElementById('user-input');
const sendBtn        = document.getElementById('send-btn');
const refreshBtn     = document.getElementById('refresh-btn');

const settingsBtn    = document.getElementById('settings-btn');
const backBtn        = document.getElementById('back-btn');
const changeKeyBtn   = document.getElementById('change-key-btn');
const keyDisplay     = document.getElementById('key-display');

const problemName    = document.getElementById('problem-name');
const diffPill       = document.getElementById('diff-pill');
const langPill       = document.getElementById('lang-pill');
const dots           = [
  document.getElementById('dot1'),
  document.getElementById('dot2'),
  document.getElementById('dot3'),
];

// ─────────────────────────────────────────────
//  SCREEN MANAGER
//  Only one "main" screen visible at a time
// ─────────────────────────────────────────────
function showScreen(name) {
  // hide all content areas
  keyScreen.style.display     = 'none';
  startScreen.style.display   = 'none';
  chatEl.style.display        = 'none';
  inputArea.style.display     = 'none';
  settingsPanel.style.display = 'none';
  contextBar.style.display    = 'none';

  if (name === 'key') {
    keyScreen.style.display = 'flex';
  } else if (name === 'start') {
    startScreen.style.display = 'flex';
  } else if (name === 'chat') {
    contextBar.style.display = 'block';
    chatEl.style.display     = 'flex';
    inputArea.style.display  = 'block';
  } else if (name === 'settings') {
    settingsPanel.style.display = 'flex';
  }
}

// ─────────────────────────────────────────────
//  INIT — check if key is already saved
// ─────────────────────────────────────────────
chrome.storage.local.get('groqApiKey', (result) => {
  if (result.groqApiKey) {
    state.apiKey = result.groqApiKey;
    showScreen('start');
  } else {
    showScreen('key');
  }
});

// ─────────────────────────────────────────────
//  API KEY SCREEN LOGIC
// ─────────────────────────────────────────────

// show/hide key toggle
toggleKeyVis.addEventListener('click', () => {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    toggleKeyVis.textContent = '🙈';
  } else {
    apiKeyInput.type = 'password';
    toggleKeyVis.textContent = '👁';
  }
});

// save key
saveKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();

  keyError.style.display   = 'none';
  keySuccess.style.display = 'none';

  if (!key) {
    showKeyError('Please paste your Groq API key first.');
    return;
  }
  if (!key.startsWith('gsk_')) {
    showKeyError('Invalid key format. Groq keys start with "gsk_".');
    return;
  }

  saveKeyBtn.disabled     = true;
  saveKeyBtn.textContent  = 'Verifying...';

  // quick test call to verify the key works
  const valid = await verifyGroqKey(key);

  if (!valid) {
    saveKeyBtn.disabled    = false;
    saveKeyBtn.textContent = 'Save Key & Continue →';
    showKeyError('Key verification failed. Please check your key and try again.');
    return;
  }

  // save to chrome.storage.local
  chrome.storage.local.set({ groqApiKey: key }, () => {
    state.apiKey = key;
    keySuccess.textContent  = '✅ Key saved! Redirecting...';
    keySuccess.style.display = 'block';
    setTimeout(() => showScreen('start'), 900);
  });
});

async function verifyGroqKey(key) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      }),
    });
    const data = await res.json();
    return !data.error;
  } catch {
    return false;
  }
}

function showKeyError(msg) {
  keyError.textContent  = '⚠️ ' + msg;
  keyError.style.display = 'block';
}

// ─────────────────────────────────────────────
//  SETTINGS PANEL
// ─────────────────────────────────────────────
settingsBtn.addEventListener('click', () => {
  // show masked key in settings
  if (state.apiKey) {
    keyDisplay.textContent = state.apiKey.substring(0, 8) + '••••••••••••••••••' + state.apiKey.slice(-4);
  }
  showScreen('settings');
});

backBtn.addEventListener('click', () => {
  // go back to whichever screen makes sense
  if (chatEl._hasStarted) {
    showScreen('chat');
    contextBar.style.display = 'block';
  } else {
    showScreen('start');
  }
});

changeKeyBtn.addEventListener('click', () => {
  // clear the saved key and show key screen
  chrome.storage.local.remove('groqApiKey', () => {
    state.apiKey = null;
    apiKeyInput.value = '';
    keyError.style.display   = 'none';
    keySuccess.style.display = 'none';
    saveKeyBtn.disabled      = false;
    saveKeyBtn.textContent   = 'Save Key & Continue →';
    showScreen('key');
  });
});

// ─────────────────────────────────────────────
//  START SESSION
// ─────────────────────────────────────────────
startBtn.addEventListener('click', async () => {
  startBtn.disabled    = true;
  startBtn.textContent = 'Reading page...';
  errorMsg.style.display = 'none';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const isLeetCode = tab.url && tab.url.includes('leetcode.com/problems/');
  const isTUF      = tab.url && tab.url.includes('takeuforward.org/plus/dsa/problems/');

  if (!isLeetCode && !isTUF) {
    errorMsg.textContent   = '⚠️ Open a LeetCode or TakeUForward problem page first.';
    errorMsg.style.display = 'block';
    startBtn.disabled      = false;
    startBtn.textContent   = '⚡ Start Session';
    return;
  }

  chrome.scripting.executeScript(
    { target: { tabId: tab.id }, func: extractFromPage },
    async (results) => {
      if (!results || !results[0] || !results[0].result) {
        errorMsg.textContent   = '❌ Could not read the page. Refresh and wait for it to fully load.';
        errorMsg.style.display = 'block';
        startBtn.disabled      = false;
        startBtn.textContent   = '⚡ Start Session';
        return;
      }

      state.problemData = results[0].result;
      state.chatHistory = [];
      state.attempts    = 0;
      state.pseudoGiven = false;
      dots.forEach(d => { d.classList.remove('used', 'pseudo'); });

      await beginSession();
    }
  );
});

// ─────────────────────────────────────────────
//  BEGIN SESSION
// ─────────────────────────────────────────────
async function beginSession() {
  const d = state.problemData;

  problemName.textContent = d.title || 'Unknown Problem';
  diffPill.textContent    = d.difficulty || '?';
  diffPill.className      = 'ctx-pill ' + (d.difficulty || '').toLowerCase();
  langPill.textContent    = d.language || 'unknown';

  chatEl.innerHTML     = ''; // clear previous session
  chatEl._hasStarted   = true;
  showScreen('chat');

  const opening = await callGroq(buildSystemPrompt(), [], '__OPENING__');
  addMessage('mentor', opening);

  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 100) + 'px';
  });

  startBtn.disabled    = false;
  startBtn.textContent = '⚡ Start Session';
}

// ─────────────────────────────────────────────
//  SEND MESSAGE
// ─────────────────────────────────────────────
sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || sendBtn.disabled) return;

  userInput.value = '';
  userInput.style.height = 'auto';
  sendBtn.disabled = true;

  state.attempts++;
  updateDots();

  addMessage('user', text);
  state.chatHistory.push({ role: 'user', content: text });

  const typingEl = showTyping();
  const shouldRevealPseudo = state.attempts >= MAX_ATTEMPTS_BEFORE_PSEUDO && !state.pseudoGiven;
  const reply = await callGroq(buildSystemPrompt(shouldRevealPseudo), state.chatHistory, null);
  typingEl.remove();

  if (shouldRevealPseudo) {
    state.pseudoGiven = true;
    renderMentorWithPseudo(reply);
    addSystemMsg('🔓 Pseudocode unlocked after ' + MAX_ATTEMPTS_BEFORE_PSEUDO + ' attempts. Keep going!');
  } else {
    addMessage('mentor', reply);
  }

  state.chatHistory.push({ role: 'assistant', content: reply });
  sendBtn.disabled = false;
  chatEl.scrollTop = chatEl.scrollHeight;
}

// ─────────────────────────────────────────────
//  RE-READ CODE
// ─────────────────────────────────────────────
refreshBtn.addEventListener('click', async () => {
  refreshBtn.textContent = '↻ Reading...';
  refreshBtn.disabled = true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript(
    { target: { tabId: tab.id }, func: extractFromPage },
    (results) => {
      refreshBtn.disabled    = false;
      refreshBtn.textContent = '↻ Re-read my code';
      if (!results || !results[0]) return;
      const fresh = results[0].result;
      state.problemData.userCode = fresh.userCode;
      state.problemData.language = fresh.language;
      langPill.textContent = fresh.language || 'unknown';
      addSystemMsg("✅ I've re-read your latest code from the editor.");
    }
  );
});

// ─────────────────────────────────────────────
//  GROQ API CALL
// ─────────────────────────────────────────────
async function callGroq(systemPrompt, history, specialMode) {
  const messages = [{ role: 'system', content: systemPrompt }];

  if (specialMode === '__OPENING__') {
    messages.push({
      role: 'user',
      content: 'Please start our session by briefly acknowledging the problem and asking me one opening question about my approach.',
    });
  } else {
    messages.push(...history);
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 600,
      }),
    });

    const data = await res.json();

    // if key expired/invalid mid-session, send them back to key screen
    if (data.error) {
      if (data.error.code === 'invalid_api_key' || res.status === 401) {
        chrome.storage.local.remove('groqApiKey');
        state.apiKey = null;
        addSystemMsg('⚠️ API key is invalid or expired. Please re-enter your key.');
        setTimeout(() => showScreen('key'), 1500);
        return '(session ended)';
      }
      return `⚠️ API Error: ${data.error.message}`;
    }

    return data.choices?.[0]?.message?.content || '(no response)';
  } catch (err) {
    return `⚠️ Network error: ${err.message}`;
  }
}

// ─────────────────────────────────────────────
//  SYSTEM PROMPT BUILDER
// ─────────────────────────────────────────────
function buildSystemPrompt(revealPseudo = false) {
  const d = state.problemData;
  const platform = d.platform === 'tuf' ? 'TakeUForward (TUF+)' : 'LeetCode';

  const codeSection = d.userCode
    ? `\n\nSTUDENT'S CURRENT CODE (${d.language || 'unknown'}):\n\`\`\`\n${d.userCode}\n\`\`\``
    : '\n\nSTUDENT HAS NOT WRITTEN ANY CODE YET.';

  const pseudoInstruction = revealPseudo
    ? `The student has made ${MAX_ATTEMPTS_BEFORE_PSEUDO} attempts without solving it.
NOW you should:
1. Give a brief encouraging message
2. Provide PSEUDOCODE ONLY — not real code — that outlines the algorithm step by step
3. Wrap it: <<<PSEUDOCODE_START>>> ... <<<PSEUDOCODE_END>>>
4. After the block, ask them to now try implementing it`
    : `NEVER give the actual answer or working code.
NEVER write code for them.
Ask ONE focused Socratic question that:
- Points to a flaw or gap in their thinking
- Guides them toward the right approach
- Relates to their actual code if they have any
Keep response SHORT (2-4 sentences) and end with a question.`;

  return `You are Herupa, a Socratic programming tutor helping a student on ${platform}.

PROBLEM: ${d.title || 'Unknown'}
DIFFICULTY: ${d.difficulty || 'Unknown'}

PROBLEM DESCRIPTION:
${d.description || 'Not available'}

EXAMPLES / TEST CASES:
${(d.examples || []).join('\n\n') || 'Not available'}

CONSTRAINTS:
${d.constraints || 'Not available'}
${codeSection}

YOUR ROLE:
${pseudoInstruction}

Tone: Encouraging, patient, like a senior dev doing code review. Never condescending.`;
}

// ─────────────────────────────────────────────
//  UI HELPERS
// ─────────────────────────────────────────────
function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  const label = role === 'mentor' ? '🤖 Mentor' : '👤 You';
  div.innerHTML = `
    <div class="msg-role">${label}</div>
    <div class="msg-bubble">${escapeHtml(text)}</div>
  `;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

function addSystemMsg(text) {
  const div = document.createElement('div');
  div.className = 'msg system';
  div.innerHTML = `
    <div class="msg-role">⚙ System</div>
    <div class="msg-bubble">${escapeHtml(text)}</div>
  `;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function renderMentorWithPseudo(text) {
  const startTag = '<<<PSEUDOCODE_START>>>';
  const endTag   = '<<<PSEUDOCODE_END>>>';
  const si = text.indexOf(startTag);
  const ei = text.indexOf(endTag);

  const div = document.createElement('div');
  div.className = 'msg mentor';

  if (si !== -1 && ei !== -1) {
    const before = text.substring(0, si).trim();
    const pseudo = text.substring(si + startTag.length, ei).trim();
    const after  = text.substring(ei + endTag.length).trim();
    div.innerHTML = `
      <div class="msg-role">🤖 Mentor</div>
      <div class="msg-bubble">
        ${before ? escapeHtml(before) + '<br><br>' : ''}
        <div class="pseudo-block">${escapeHtml(pseudo)}</div>
        ${after ? '<br>' + escapeHtml(after) : ''}
      </div>
    `;
  } else {
    div.innerHTML = `
      <div class="msg-role">🤖 Mentor</div>
      <div class="msg-bubble">${escapeHtml(text)}</div>
    `;
  }

  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'msg mentor';
  div.innerHTML = `
    <div class="msg-role">🤖 Mentor</div>
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

function updateDots() {
  dots.forEach((dot, i) => {
    if (i < state.attempts && i < MAX_ATTEMPTS_BEFORE_PSEUDO) dot.classList.add('used');
    if (state.pseudoGiven && i === MAX_ATTEMPTS_BEFORE_PSEUDO - 1) {
      dot.classList.remove('used');
      dot.classList.add('pseudo');
    }
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// ─────────────────────────────────────────────
//  PAGE EXTRACTOR — injected into the active tab
//  Handles both LeetCode AND TakeUForward (TUF+)
// ─────────────────────────────────────────────
function extractFromPage() {
  const url  = window.location.href;
  const data = {};

  const isLeetCode = url.includes('leetcode.com');
  const isTUF      = url.includes('takeuforward.org');
  data.platform    = isTUF ? 'tuf' : 'leetcode';

  // ── LEETCODE ──────────────────────────────────────────
  if (isLeetCode) {
    const titleEl = document.querySelector('[data-cy="question-title"], h1, .text-title-large');
    data.title = titleEl
      ? titleEl.innerText.trim()
      : document.title.replace(' - LeetCode', '').trim();

    const diffEl = document.querySelector(
      '.text-difficulty-easy, .text-difficulty-medium, .text-difficulty-hard, [class*="difficulty"]'
    );
    if (diffEl) {
      const txt = diffEl.innerText.trim().toLowerCase();
      if (txt.includes('easy'))        data.difficulty = 'Easy';
      else if (txt.includes('medium')) data.difficulty = 'Medium';
      else if (txt.includes('hard'))   data.difficulty = 'Hard';
    }

    const descSelectors = [
      '[data-track-load="description_content"]',
      '.elfjS', '.question-content__JfgR', '[class*="question-content"]',
    ];
    let descEl = null;
    for (const sel of descSelectors) { descEl = document.querySelector(sel); if (descEl) break; }
    if (descEl) {
      const fullText = descEl.innerText.trim();
      data.description = fullText.split(/\n(?=Example \d)/i)[0].trim();
      const exMatches = [...fullText.matchAll(/Example \d+:([\s\S]*?)(?=Example \d+:|Constraints:|$)/gi)];
      data.examples = exMatches.map(m => m[0].trim());
      const ci = fullText.toLowerCase().indexOf('constraints:');
      if (ci !== -1) {
        const raw = fullText.substring(ci + 12).trim();
        const fi  = raw.toLowerCase().indexOf('follow up');
        data.constraints = fi !== -1 ? raw.substring(0, fi).trim() : raw;
      }
    }

    const tagEls = document.querySelectorAll('[class*="topic-tag"], a[href*="/tag/"]');
    data.tags = [...new Set([...tagEls].map(t => t.innerText.trim()).filter(Boolean))];
  }

  // ── TAKEUFORWARD (TUF+) ───────────────────────────────
  if (isTUF) {
    const headings = [...document.querySelectorAll('h1, h2')];
    const titleEl  = headings.find(el => el.innerText.trim().length > 2 && el.innerText.trim().length < 120);
    data.title = titleEl
      ? titleEl.innerText.trim()
      : document.title.replace(/[-|].*$/, '').trim();

    const leafEls = document.querySelectorAll('span, p, div, button, li');
    for (const el of leafEls) {
      if (el.children.length > 0) continue;
      const txt = el.innerText?.trim().toLowerCase();
      if (txt === 'easy' || txt === 'medium' || txt === 'hard') {
        data.difficulty = txt.charAt(0).toUpperCase() + txt.slice(1);
        break;
      }
    }

    const tufDescSelectors = [
      '[class*="problem-statement"]', '[class*="problemStatement"]',
      '[class*="prose"]', '[class*="description"]', '[class*="markdown"]', 'article',
    ];
    let descText = '';
    for (const sel of tufDescSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 80) { descText = el.innerText.trim(); break; }
    }
    if (!descText) {
      const mainEl = document.querySelector('main, [role="main"], #root main, #__next main');
      if (mainEl) {
        const paras = [...mainEl.querySelectorAll('p')].filter(p => p.innerText.trim().length > 20);
        if (paras.length > 0) descText = paras.map(p => p.innerText.trim()).join('\n\n');
      }
    }
    if (!descText) {
      let best = null, bestLen = 0;
      document.querySelectorAll('div').forEach(div => {
        if (div.children.length > 20) return;
        const len = div.innerText?.trim().length || 0;
        if (len > bestLen && len < 5000) { best = div; bestLen = len; }
      });
      if (best) descText = best.innerText.trim();
    }

    if (descText) {
      const exStart = descText.search(/\n(Example\s*\d*\s*:|Input\s*:)/i);
      data.description = exStart !== -1 ? descText.substring(0, exStart).trim() : descText.substring(0, 800).trim();
      const exMatches = [...descText.matchAll(/(Example\s*\d*\s*:[\s\S]*?)(?=Example\s*\d*\s*:|Constraints\s*:|Note\s*:|$)/gi)];
      data.examples = exMatches.map(m => m[0].trim()).filter(e => e.length > 5);
      const ci = descText.search(/Constraints\s*:/i);
      if (ci !== -1) {
        const afterColon = descText.substring(ci).replace(/Constraints\s*:/i, '').trim();
        const noteIdx = afterColon.search(/\n(Note|Follow.up)\s*:/i);
        data.constraints = noteIdx !== -1 ? afterColon.substring(0, noteIdx).trim() : afterColon.trim();
      }
    }

    const tagSet = new Set();
    ['[class*="tag"]', '[class*="chip"]', '[class*="badge"]', '[class*="topic"]'].forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const t = el.innerText.trim();
        if (t.length > 1 && t.length < 40 && !/^\d+$/.test(t)) tagSet.add(t);
      });
    });
    data.tags = [...tagSet].slice(0, 10);
  }

  // ── USER CODE — Monaco (works on both sites) ──────────
  try {
    const models = window.monaco?.editor?.getModels();
    if (models && models.length > 0) {
      const best = models.reduce((a, b) =>
        (b.getValue()?.length || 0) > (a.getValue()?.length || 0) ? b : a
      );
      data.userCode = best.getValue();
      data.language = best.getLanguageId();
    }
  } catch (e) {}

  if (!data.userCode) {
    const ta = document.querySelector('.monaco-editor textarea');
    if (ta && ta.value && ta.value.trim().length > 0) data.userCode = ta.value;
  }
  if (!data.userCode) {
    try {
      const cm = document.querySelector('.CodeMirror');
      if (cm && cm.CodeMirror) { data.userCode = cm.CodeMirror.getValue(); data.language = 'unknown'; }
    } catch (e) {}
  }
  if (!data.userCode) {
    const lines = document.querySelectorAll('.view-line');
    if (lines.length > 0) { data.userCode = [...lines].map(l => l.innerText).join('\n'); data.language = 'unknown'; }
  }
  if (!data.language || data.language === 'unknown') {
    const langSels = ['[data-cy="lang-select"]', 'button[class*="lang"]', '[class*="language"] button', 'select[class*="lang"]'];
    for (const sel of langSels) {
      const el = document.querySelector(sel);
      if (el) { data.language = (el.innerText || el.value || '').trim(); break; }
    }
  }

  return data;
}