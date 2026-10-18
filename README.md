# Covers: host stand trainer

A practice host stand for Meetbros. Build your floor plan, run simulated shifts (slow weeknight to holiday), seat reservations and walk-ins, quote waits, handle curveballs, and get graded at the end.

Everything is one file: `index.html`. No server, no account. Layouts, settings, shift history and an in-progress shift are saved in the browser (localStorage) on the device you use.

## Open it on your phone or iPad

### Option A: GitHub Pages (free, stays at one link)
1. On github.com open this repository, then **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
3. Pick the branch that has `index.html` (`main` once this is merged, or `claude/host-stand-simulator-dgfi4i`) and the **/ (root)** folder. Save.
4. Wait a minute. The page shows your link, like `https://en-ea.github.io/host-train/`.
5. Open that link in Safari (iPhone/iPad) or Chrome (Android).

GitHub Pages is free for public repositories. For a private repository it needs a paid GitHub plan; use Option B instead.

### Option B: Netlify Drop (free, no Git needed)
1. Download `index.html` from this repository and put it in a folder on your computer.
2. Go to https://app.netlify.com/drop and drag the folder onto the page.
3. Netlify gives you a link right away. Make a free account to keep it permanently.

### Make it feel like an app
- **iPhone / iPad (Safari):** tap Share → **Add to Home Screen**.
- **Android (Chrome):** menu ⋮ → **Add to Home screen**.

Each device keeps its own data. To move layouts and history between devices use **Settings → Copy backup** on one and **Restore from backup** on the other.

## Using it
Open **Help** in the app for the short guide, or run the tutorial shift from the Service screen.

## Editing the code
Source lives in `src/` (one CSS file, a shell HTML file and numbered JS modules). Run `python3 build.py` to rebuild `index.html`.
