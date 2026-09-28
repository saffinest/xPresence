# Fearless Draft Priority: xPresence

**xPresence (expected presence)** is the chance a League of Legends champion gets picked or banned in a fresh Game 1 of a pro series. It's built for **fearless draft**, where a champion can only be played once per series.

This repo holds the interactive dashboard (`index.html`, served by GitHub Pages), the code behind it, and every test used to check it.

**Live dashboard:** see the link in the repo's About panel.

## Why a new stat

- **Presence** (picks + bans ÷ games) and gol.gg's **PrioScore** (ban = 1, pick rounds weighted 1, ½ and ⅓) both count what happened. Neither accounts for fearless.
  - Under fearless, a champion used in Game 1 isn't available for the rest of the series. Its low numbers in Games 2–5 reflect unavailability, not low priority.
  - Neither measure asks what else was on the table when a team made its choice.
- xPresence treats every pick and ban as a choice among the champions still legal at that moment:
  - not banned,
  - not already picked in that game,
  - not used earlier in the series.
- It then fits one strength per champion that best explains all those choices.

## How it works

1. **Choices.** Each draft action becomes a choice from the legal pool. Taking a champion while strong options remain counts for more than taking it from a thin pool, so draft order and fearless are built in without hand-set weights.
2. **Model.** A [Plackett–Luce](https://en.wikipedia.org/wiki/Discrete_choice#Plackett%E2%80%93Luce_model) model is fitted with the MM algorithm and a light prior (one pseudo-choice per champion), so rarely drafted champions don't get extreme strengths. The code is in `src/engine.js`, functions `buildChoices` and `fitPL`.
3. **Recency.** Each game loses half its weight every **5 days** before the latest game.
4. **Take rate.** Strengths become a plain percentage: the share of 3,000 simulated fresh Game 1 drafts (20 picks and bans) in which the champion is taken.
5. **Uncertainty.** The 80% range comes from refitting on 40 resamples of whole series.
6. **Patch-adjusted.** Strength is multiplied by 1.25 per buff and divided by 1.25 per nerf for patches released after the data. Changes are labeled from the official patch notes.

## How it was tested

Every test builds xPresence from earlier games only, then scores how likely it found each real pick and ban, one draft action at a time, among the champions still available. Results are compared with gol.gg's PrioScore scored the same way. Figures are per draft action (higher is better).

| Test | Tests | xPresence won | Gain vs PrioScore |
|---|---|---|---|
| Domestic patches, 2025–2026 (six leagues, 150-day rolling window) | 26 | 25 | +34.8% |
| International events: First Stand, MSI and Worlds 2025; First Stand and MSI 2026 | 5 | 5 | +32.4% |
| MSI 2026 rehearsal (spring data only) | 1 | 1 | +17.9% (90% range +14% to +22%) |
| Against PrioScore given the same 5-day recency weighting (same 31 rolling tests) | 31 | 28 | +6.0% domestic, +8.2% international |

- **Recency is almost the whole edge.** Without it, xPresence roughly ties PrioScore.
  - Giving PrioScore the same recency weighting makes it +26.8% better domestically and +22.2% better internationally. xPresence adds another +6.0% and +8.2% on top, winning 23 of 26 patches and all 5 international events (`analysis/prio_recency.js`).
- **Accuracy.** Across the Game 1s in all 31 tests, predicted percentages track what happened.
  - Domestically, champions rated 90%+ were taken 90% of the time.
  - At international events they were taken 81% of the time, based on only 193 cases. This is being watched at Worlds 2026.
- **Tried and dropped:**
  - Weighting deciding games more: no effect.
  - Series-depth weighting and per-team averaging: worse in every test.
  - Sizing patch changes by tier or by solo-queue win-rate shift: no better than a flat ×1.25.
- **Roles.** Knowing which roles each team still needs predicts the next pick or ban about 40% better. It doesn't improve the Game 1 take rate itself, so xPresence ignores roles.
  - Supports are taken more often than xPresence expects.
  - A per-role correction helped in 22 of 31 tests and is a comparison model for Worlds.

The Evidence tab on the dashboard has every test, chart and number.

### Worlds 2026 check

- **Baseline frozen before Worlds:** `data/snapshot5.json`, with settings as of Sep 26, 2026.
- **The patch-adjusted list will be updated once** when the Worlds patch notes (16.20) are out, before the event starts.
- **Results will be posted after the final** on Nov 14, whether good or bad.

## Data

- **[Oracle's Elixir](https://oracleselixir.com/)** (Tim Sevenhuysen): 2025 and 2026 match data for picks, bans, draft order, first pick, sides and roles.
  - The dashboard uses 762 games from the 2026 post-MSI splits of LCK, LPL, LEC, LCS, CBLOL and LCP.
- **[gol.gg](https://gol.gg/):** 13 games Oracle's Elixir didn't have yet (LPL Regional Finals and one LPL game), and the PrioScore rule used for comparison.
- **[LoLalytics](https://lolalytics.com/):** Diamond+ solo-queue win-rate shifts, used only in the patch-notes test.

`data/` holds compact derived files, not the original CSVs. Download those from Oracle's Elixir to rerun `analysis/`. Please follow each source's terms and credit them if you reuse the data.

Not affiliated with Riot Games, Oracle's Elixir, gol.gg or LoLalytics. League of Legends is a trademark of Riot Games.

## Repo layout

```
index.html        the dashboard (built; one self-contained file, runs entirely in the browser)
og.png            link-preview image
build.py          rebuilds index.html from src/ and data/
src/              page markup, styles, dashboard script, model engine (engine.js)
data/             inputs baked into the page, plus raw test results
analysis/         scripts that produced the test results (Node.js and Python)
```

- **Rebuild the page:** `python3 build.py`. Set `AUTHOR` and `SITE_URL` at the top of that file first.
- **Rerun the tests:**
  1. Put the Oracle's Elixir CSVs where `analysis/export_all.py` expects them, or edit the path.
  2. Run `export_all.py`, then `roles.py`.
  3. Run the `.js` files with Node 18 or later, from inside `analysis/`.

## License

Code: MIT (see `LICENSE`). Data belongs to its sources above.
