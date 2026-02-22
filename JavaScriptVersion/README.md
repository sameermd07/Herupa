# Herupa

A Chrome extension that acts as your DSA mentor. It won't solve problems for you — but it'll ask you the right questions until you figure it out yourself.

---

## The idea

I built this because I kept catching myself googling solutions the moment I got stuck. That's not learning. Herupa forces you to think by asking questions based on your actual code and approach — like a good mentor would.

If you're completely lost after 3 back-and-forths, it gives you pseudocode. Not the solution. Just enough to get unstuck.

Works on LeetCode and TakeUForward (TUF+).

---

## Setup

You'll need a Groq API key. It's free — go to [console.groq.com](https://console.groq.com), sign up, create a key. Takes 2 minutes.

Then:
1. Go to `chrome://extensions/`
2. Turn on Developer Mode (top right)
3. Click Load unpacked → select the `herupa/` folder
4. Click the H icon in your toolbar, paste your key, done

Your key gets saved to Chrome's local storage — it stays on your machine, never goes anywhere except Groq's API.

---

## How it works

Open a problem, write some code (or don't — even just your rough approach works), click Start Session. Herupa reads the problem and whatever you've written, then asks you one question.

You answer, it asks another. After 3 of these it unlocks pseudocode if you're still stuck. You can also hit "re-read my code" anytime to show it your latest changes.

That's it.

---

## Files

```
herupa/
├── manifest.json
├── popup.html
├── popup.js
├── content.js
├── icon16.png
├── icon48.png
└── icon128.png
```

No build step, no npm, no dependencies. Just load it and it works.

---

## Tweaking it

Two things worth knowing about in `popup.js`:

```js
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const MAX_ATTEMPTS_BEFORE_PSEUDO = 3;
```

Change `MAX_ATTEMPTS_BEFORE_PSEUDO` if you want pseudocode sooner or later. That's really the only thing most people will want to change.

---

## If something breaks

**Page won't read** — wait for the problem to fully load, then try again. TUF+ especially takes a second since it's a React app.

**Code not detected** — hit the "re-read my code" button after the editor loads.

**Key stopped working** — go to settings (gear icon), click Change, re-enter your key.

**LeetCode stopped working** — LeetCode occasionally renames their CSS classes. Open DevTools on a problem, find the description div, update the selectors in `extractFromPage()` in `popup.js`.

---

## Publishing

If you want to put it on the Chrome Web Store:
- Zip the folder
- Go to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- One-time $5 fee, upload the zip, add screenshots, submit
- Google reviews it in a day or two

---

Built with vanilla JS, Groq's free API, and a lot of frustration with my own bad habit of looking up answers too quickly.