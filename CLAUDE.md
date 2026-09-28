# CLAUDE.md: xPresence / Fearless Draft Priority

Read this first. It carries the project's decisions and history from earlier sessions.

## What this is

**xPresence (expected presence):** the chance a League of Legends champion is picked or banned in a **fresh Game 1** of a pro series, built for **fearless draft** (a champion can be played only once per series).

- **Site:** `index.html` is a single self-contained dashboard served by GitHub Pages. It has five tabs (Rankings, Leagues, Fearless, Evidence, About) and runs entirely in the browser: the model, resampling and filters all run in a web worker.
- **Owner:** @saffirephire. Credit that handle only; don't add real names anywhere.
- **Data:** the 2026 summer splits of the six Worlds leagues (LCK, LPL, LEC, LCS, CBLOL, LCP): 775 games, 284 series, patches 16.14–16.17, data through Sep 25, 2026.
- **Audience:** LoL analytics readers (a Substack is planned). Copy on the page is plain language, with no jargon and no model internals in headings.

## Build and check

- **Never edit `index.html` directly.** It is built. Edit `src/` or `data/`, then run `python3 build.py`.
  - `src/shell.html` is the document wrapper: doctype, meta and link-preview tags, footer. It has `{{...}}` slots.
  - `src/head.html` holds the CSS tokens (light and dark). `src/body.html` is the markup; `src/script.html` is the dashboard logic.
  - `src/engine.js` is the model. It's inlined into the page as `<script id="engine">`, and the web worker is built from that script's text.
  - `build.py` swaps placeholders such as `/*DATA*/` and `/*ROLL*/` for files in `data/`, and asserts that each placeholder exists.
  - Settings at the top of `build.py`: `AUTHOR`, `SITE_URL` (empty until the Pages URL is known; set it so `og:image` is absolute) and `UPDATED`.
- **After any change,** load the page headlessly (for example Playwright with Chromium) and do three things:
  - click every tab and check the console for errors;
  - change a league filter, wait for "Range from 40 resamples", and confirm the worker ran;
  - check a 390px-wide viewport for horizontal overflow.
  - The only acceptable console error is the Google Fonts request when offline.
- **Caution:** never read and write the same file in one expression, e.g. `open(f,'w').write(open(f).read())`. It truncates the file first. This once wiped the stylesheet.

## The model (`src/engine.js`)

- `buildChoices`: every pick and ban is a choice among champions still legal at that moment: not banned, not picked in this game, not used earlier in the series.
- `fitPL`: Plackett–Luce MM algorithm with a light prior, `(wins+α)/(den+α)`, α=1.
- **Recency weight:** `0.5^((maxDay - day)/half)`, with **half = 5 days**.
- `plTakeRate`: share of 3,000 simulated fresh Game 1 drafts (20 Gumbel-sampled draws) in which the champion is taken.
- `plBootstrap`: 40 resamples of whole series, which give the 80% range.
- **Patch-adjusted:** strength ×1.25 per buff and ÷1.25 per nerf for patches after the data (currently 16.18 and 16.19). Changes are listed in `data/patch_adj.json`.
- **Retired** (kept on the page and in `computeAll` for the record; don't re-enable):
  - series depth and per-team averaging: worse in every test;
  - deciding games counted 1.5×: no effect across 31 tests;
  - the 10-day half-life: replaced by 5 days on Sep 26.

## Data

- **Source:** Oracle's Elixir CSVs (`2025_...` and `2026_LoL_esports_match_data_from_OraclesElixir.csv`). They are **not in the repo** (about 75 MB each; the data belongs to Oracle's Elixir). Scripts find them through `OE_DIR`, default `~/Downloads`.
- **`data/data3.json`:** the dashboard's summer games. It is base64-encoded, 32 bytes per game: sid(2), lg, st, gn, day, pt, A, B, win, fp, known, bA[5], bB[5], pA[5], pB[5]. 255 means an empty slot.
  - `day` counts from 2026-07-01. `C` holds champion names, `T` team names, `LG` leagues and `PT` patches.
  - 762 games come from Oracle's Elixir and 13 from gol.gg (the LPL Regional Finals and WE vs ThunderTalk, Aug 7, Game 3). The gol.gg reconciliation script isn't in the repo, so treat this file as a frozen input.
- **Oracle's Elixir quirks:**
  - Patches are floats, so `16.1` might mean 16.10. Order patches by date (see `export_all.py`).
  - In one LPL game (NIP vs IG, Aug 22, Game 2) picks are listed as bans.
- **gol.gg quirks:** some games list picks by role instead of draft order; there are missing first-pick markers; and the LCK Gen.G vs Dplus KIA Game 1 on Aug 1 is a duplicate.
- **Name matching:** normalize names before matching (lowercase, letters only). This handles K'Sante vs KSante and Kai'Sa vs Kaisa.
- **LoLalytics:** solo-queue win-rate history only goes back to 16.9.
- **Roles:** `data/roles_summer.json` holds summer role counts per champion. All 5,105 games from 2025–2026 have full roles in Oracle's Elixir.

## Tests (`analysis/`, results in `data/`)

- **Pipeline:** run `export_all.py`, which writes `all_games.json` (5,105 games, 2025–2026), then `roles.py`, which writes `all_games_roles.json`. Then run the `.js` tests with Node from inside `analysis/`. Copy any inputs they need (e.g. `data/data_spring_msi.json`, `notes.json`, `wr_shift.json`) there first.
- **Scoring metric:** for each draft action, the likelihood of the real choice among available champions, using softmax(β·log score) with β fitted on recent training games. Results are reported relative to gol.gg's PrioScore, rebuilt from its published rule (ban 1; pick rounds 1, ½, ⅓).
- **Key results at the current settings:**
  - Rolling tests (`rolling2.js`, a 150-day window before each test): 26 domestic patches, +34.8% vs PrioScore, won 25. Five international events, +32.4%, won 5.
  - Recency is almost the whole edge; without it, xPresence roughly ties PrioScore.
  - MSI 2026 rehearsal (spring data only): +17.9% (90% range +14% to +22%).
- **Calibration** (`calib5.js`): domestic results are accurate. Internationally the top runs high: champions rated 90%+ were taken 81% of the time (n=193).
- **Patch-notes sizing** (`adjust_gap.js`): size tiers and win-rate shifts did not beat flat ×1.25 (+0.37% when 2–3 patches behind).
- **Roles** (`rolerun.js`, `rolebias.js`, `rolecal.js`):
  - Role-aware choice sets predict the next action +41% better, but Game 1 take rates don't improve (won 7 of 31).
  - Supports are under-predicted (3.3 expected vs 3.8 taken per Game 1).
  - A per-role correction won 22 of 31 (−0.45% log-loss). Not adopted; it's a comparison model.
- **Field weighting** (`field_test.js`): counting the event's own teams ×2 won 5 of 5 international events (+1.7%).
  - About half of that is a weaker prior: counting every game ×2 gave +0.8%.
  - The field-specific part won 4 of 5.

## Frozen predictions: never edit

These are public, pre-registered predictions. Changing them after the fact defeats their purpose.

- **`data/snapshot5.json`:** Worlds 2026 baseline, frozen Sep 26 (5-day half-life). **One planned exception:** the patch-adjusted list gets updated once with the 16.20 (Worlds patch) changes, after the notes come out on Oct 7 and before Worlds starts on Oct 15. Record that update in the file's `version` field.
- **`data/snapshot3.json`:** the earlier 10-day baseline, kept for comparison.
- **`data/demacia-baseline-2026-09-27.json`:** Demacia Cup Global Invitational (Oct 3–17). It has a main model (same as the Worlds baseline) and a field-weighted comparison model, plus the scoring plan.

## Checkpoints

- **Oct 8:**
  - Add the 16.20 buffs and nerfs to `patch_adj.json` using the rubric (small: 1–2 minor numbers; medium: several numbers or one 10–25% change; large: many changes, over 25%, or new mechanics).
  - Update the Worlds patch-adjusted list once.
  - Freeze the Worlds test plan: models (include the per-role correction, field weighting and prior strength as comparisons), metrics, data source, and what counts as a win.
- **Oct 19:** score the Demacia Cup predictions against the frozen file.
- **Nov 16:** score Worlds 2026 (final Nov 14) and add a "Worlds check" section to the Evidence tab. Post results whether good or bad.

## Ideas for later (off-season)

- Flag targeted bans aimed at one player's comfort picks, and weight them less than meta bans.
- Break the tests down by league and by role.
- A "next pick" predictor for live drafts, built from the role-aware model.

## Conventions

- **Naming:** the stat is **xPresence**. It's compared with "gol.gg's PrioScore", and results read "+x% vs gol.gg".
- **Writing:** short, plain sentences in dashboard copy. Every new finding gets a row in the Evidence tab's results table plus a collapsible details section.
- **Credit:** Oracle's Elixir (Tim Sevenhuysen), gol.gg and LoLalytics, in the footer and README. Not affiliated with Riot.
- **Commits:** small commits with messages that say what changed on the page. Don't commit raw CSVs or large intermediate JSONs such as `all_games*.json`. A good early task is adding a `.gitignore` for `*.csv`, `analysis/all_games*.json` and `node_modules/`; it wasn't included in the first upload because Finder hides dotfiles.
