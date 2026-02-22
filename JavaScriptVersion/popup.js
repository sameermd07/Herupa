// ─────────────────────────────────────────────
//  CONFIG  — Loaded from config.js (copy config.example.js → config.js, add your key)
// ─────────────────────────────────────────────
const MAX_ATTEMPTS_BEFORE_PSEUDO = 3; // after this many, give pseudocode

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let state = {
  problemData: null,       // { title, difficulty, description, examples, constraints, tags, userCode, language }
  chatHistory: [],         // { role: 'user'|'assistant', content: string }[]
  attempts: 0,             // how many times user has asked for help
  pseudoGiven: false,      // have we already shown pseudocode?
};

// ─────────────────────────────────────────────
//  DOM REFS
// ─────────────────────────────────────────────
const startScreen  = document.getElementById('start-screen');
const startBtn     = document.getElementById('start-btn');
const errorMsg     = document.getElementById('error-msg');
const chatEl       = document.getElementById('chat');
const inputArea    = document.getElementById('input-area');
const userInput    = document.getElementById('user-input');
const sendBtn      = document.getElementById('send-btn');
const refreshBtn   = document.getElementById('refresh-btn');
const contextBar   = document.getElementById('context-bar');
const problemName  = document.getElementById('problem-name');
const diffPill     = document.getElementById('diff-pill');
const ctxTitle     = document.getElementById('ctx-title');
const langPill     = document.getElementById('lang-pill');
const dots         = [document.getElementById('dot1'), document.getElementById('dot2'), document.getElementById('dot3')];

// ─────────────────────────────────────────────
//  START SESSION
// ─────────────────────────────────────────────
startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Reading page...';
  errorMsg.style.display = 'none';

  const apiKey = typeof GROQ_API_KEY !== 'undefined' ? GROQ_API_KEY : '';
  if (!apiKey || apiKey.includes('PASTE_YOUR') || apiKey.includes('YOUR_KEY')) {
    showError('⚠️ Add your Groq API key first. Copy config.example.js → config.js and paste your key from console.groq.com');
    startBtn.disabled = false;
    startBtn.textContent = '⚡ Start Session';
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url || !tab.url.includes('leetcode.com/problems/')) {
    showError('⚠️ Please open a LeetCode problem page first.');
    startBtn.disabled = false;
    startBtn.textContent = '⚡ Start Session';
    return;
  }

  // inject extractor into the LeetCode tab
  chrome.scripting.executeScript(
    { target: { tabId: tab.id }, func: extractFromPage },
    async (results) => {
      if (!results || !results[0] || !results[0].result) {
        showError('❌ Could not read the page. Try refreshing LeetCode.');
        startBtn.disabled = false;
        startBtn.textContent = '⚡ Start Session';
        return;
      }

      state.problemData = results[0].result;
      await beginSession();
    }
  );
});

// ─────────────────────────────────────────────
//  BEGIN SESSION — switch to chat UI
// ─────────────────────────────────────────────
async function beginSession() {
  const d = state.problemData;

  // update header
  problemName.textContent = d.title || 'Unknown Problem';
  diffPill.textContent    = d.difficulty || '?';
  diffPill.className      = 'ctx-pill ' + (d.difficulty || '').toLowerCase();
  langPill.textContent    = d.language || 'unknown';

  // show UI
  startScreen.style.display = 'none';
  contextBar.style.display  = 'block';
  chatEl.style.display      = 'flex';
  inputArea.style.display   = 'block';

  // send first mentor message
  const opening = await callGroq(buildSystemPrompt(), [], '__OPENING__');
  addMessage('mentor', opening);

  // auto-resize textarea
  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 100) + 'px';
  });
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

  // show user message
  addMessage('user', text);

  // add to history
  state.chatHistory.push({ role: 'user', content: text });

  // show typing
  const typingEl = showTyping();

  // decide: normal guidance OR pseudocode reveal
  const shouldRevealPseudo = state.attempts >= MAX_ATTEMPTS_BEFORE_PSEUDO && !state.pseudoGiven;

  const reply = await callGroq(
    buildSystemPrompt(shouldRevealPseudo),
    state.chatHistory,
    null
  );

  typingEl.remove();

  if (shouldRevealPseudo) {
    state.pseudoGiven = true;
    // split the reply into text + pseudocode block
    renderMentorWithPseudo(reply);
    addSystemMsg('🔓 Pseudocode unlocked after ' + MAX_ATTEMPTS_BEFORE_PSEUDO + ' attempts. Keep thinking!');
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
      refreshBtn.disabled = false;
      refreshBtn.textContent = '↻ Re-read my code';
      if (!results || !results[0]) return;
      const fresh = results[0].result;
      state.problemData.userCode = fresh.userCode;
      state.problemData.language = fresh.language;
      langPill.textContent = fresh.language || 'unknown';
      addSystemMsg('✅ I\'ve re-read your latest code from the editor.');
    }
  );
});

// ─────────────────────────────────────────────
//  GROQ API CALL
// ─────────────────────────────────────────────
async function callGroq(systemPrompt, history, specialMode) {
  // build messages
  const messages = [{ role: 'system', content: systemPrompt }];

  if (specialMode === '__OPENING__') {
    messages.push({
      role: 'user',
      content: 'Please start our session by briefly acknowledging the problem and asking me one opening question about my approach.'
    });
  } else {
    messages.push(...history);
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${typeof GROQ_API_KEY !== 'undefined' ? GROQ_API_KEY : ''}`
      },
      body: JSON.stringify({
        model: typeof GROQ_MODEL !== 'undefined' ? GROQ_MODEL : 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.7,
        max_tokens: 600,
      })
    });

    const data = await res.json();

    if (data.error) {
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

  const codeSection = d.userCode
    ? `\n\nSTUDENT'S CURRENT CODE (${d.language}):\n\`\`\`\n${d.userCode}\n\`\`\``
    : '\n\nSTUDENT HAS NOT WRITTEN ANY CODE YET.';

  const pseudoInstruction = revealPseudo
    ? `
The student has made ${MAX_ATTEMPTS_BEFORE_PSEUDO} attempts without solving it.
NOW you should:
1. Give a brief encouraging message
2. Provide PSEUDOCODE ONLY — not real code — that outlines the algorithm step by step
3. Format the pseudocode inside a block starting with: <<<PSEUDOCODE_START>>> and ending with <<<PSEUDOCODE_END>>>
4. After the pseudocode, ask them to now try implementing it themselves
`
    : `
NEVER give the actual answer or working code.
NEVER write code for them.
Instead, ask ONE focused Socratic question that:
- Points to a flaw or gap in their thinking
- Guides them toward the right approach
- Relates to their actual code if they have written any
Keep your response SHORT (2-4 sentences max) and end with a question.
`;

  return `You are CodeMentor, a Socratic programming tutor helping a student solve a LeetCode problem.

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

  const roleLabel = role === 'mentor' ? '🤖 Mentor' : '👤 You';
  div.innerHTML = `
    <div class="msg-role">${roleLabel}</div>
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
  // check if the response has a pseudocode block
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
        ${before ? escapeHtml(before) : ''}
        <div class="pseudo-block">${escapeHtml(pseudo)}</div>
        ${after ? escapeHtml(after) : ''}
      </div>
    `;
  } else {
    // fallback: no tags found, just show raw text
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
    if (i < state.attempts && i < MAX_ATTEMPTS_BEFORE_PSEUDO) {
      dot.classList.add(state.pseudoGiven || state.attempts > i ? 'used' : '');
    }
    if (state.pseudoGiven && i === MAX_ATTEMPTS_BEFORE_PSEUDO - 1) {
      dot.classList.remove('used');
      dot.classList.add('pseudo');
    }
  });
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.className = 'not-leetcode-msg';
  errorMsg.style.display = 'block';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// ─────────────────────────────────────────────
//  PAGE EXTRACTOR (injected into LeetCode tab)
// ─────────────────────────────────────────────
function extractFromPage() {
  const data = {};

  // Title
  const titleEl = document.querySelector('[data-cy="question-title"], h1, .text-title-large');
  data.title = titleEl ? titleEl.innerText.trim() : document.title.replace(' - LeetCode', '');

  // Difficulty
  const diffEl = document.querySelector('.text-difficulty-easy, .text-difficulty-medium, .text-difficulty-hard, [class*="difficulty"]');
  if (diffEl) {
    const txt = diffEl.innerText.trim().toLowerCase();
    if (txt.includes('easy'))   data.difficulty = 'Easy';
    else if (txt.includes('medium')) data.difficulty = 'Medium';
    else if (txt.includes('hard'))   data.difficulty = 'Hard';
  }

  // Description
  const descSelectors = [
    '[data-track-load="description_content"]',
    '.elfjS',
    '.question-content__JfgR',
    '[class*="question-content"]',
  ];
  let descEl = null;
  for (const sel of descSelectors) {
    descEl = document.querySelector(sel);
    if (descEl) break;
  }

  if (descEl) {
    const fullText = descEl.innerText.trim();
    data.description = fullText.split(/\n(?=Example \d)/i)[0].trim();

    const exampleMatches = [...fullText.matchAll(/Example \d+:([\s\S]*?)(?=Example \d+:|Constraints:|$)/gi)];
    data.examples = exampleMatches.map(m => m[0].trim());

    const ci = fullText.toLowerCase().indexOf('constraints:');
    if (ci !== -1) {
      const raw = fullText.substring(ci + 12).trim();
      const fi  = raw.toLowerCase().indexOf('follow up');
      data.constraints = fi !== -1 ? raw.substring(0, fi).trim() : raw;
    }
  }

  // Tags
  const tagEls = document.querySelectorAll('[class*="topic-tag"], a[href*="/tag/"]');
  data.tags = [...new Set([...tagEls].map(t => t.innerText.trim()).filter(Boolean))];

  // User code — Monaco API
  try {
    const models = window.monaco?.editor?.getModels();
    if (models && models.length > 0) {
      data.userCode = models[0].getValue();
      data.language = models[0].getLanguageId();
    }
  } catch (e) {}

  // Fallback: textarea
  if (!data.userCode) {
    const ta = document.querySelector('.monaco-editor textarea');
    if (ta && ta.value) data.userCode = ta.value;
  }

  // Fallback: view-lines
  if (!data.userCode) {
    const lines = document.querySelectorAll('.view-line');
    if (lines.length > 0) {
      data.userCode = [...lines].map(l => l.innerText).join('\n');
      data.language = 'unknown';
    }
  }

  return data;
}