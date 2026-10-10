# Worlds 2026 test plan (frozen Oct 9, 2026)

This is decided before Worlds starts (Oct 15) so the result can't be tuned after the fact. Nothing in it changes after Oct 15.

## What's being tested

- **Main model (the headline):** patch-adjusted xPresence. That's the 5-day Plackett–Luce model from the 2026 summer splits (775 games, data through Sep 25, patches 16.14–16.17), with ×1.25 per buff and ÷1.25 per nerf for patches 16.18, 16.19 and 16.20.
  - Source: `data/snapshot5.json`, field `plTakeAdj`, as updated Oct 8 with 16.20.
- **Comparison models:**
  - unadjusted 5-day xPresence (`snapshot5.json`, `plTake`);
  - the old 10-day baseline (`data/snapshot3.json`);
  - gol.gg's PrioScore, rebuilt from the same summer games with gol.gg's rule (ban 1; pick rounds 1, ½, ⅓);
  - PrioScore with 5-day recency weighting. That half-life was chosen in every leave-one-out fit in `prio_recency.js`.
  - presence: (picks + bans) ÷ games over the same summer games.
- **No retraining:** every model uses the frozen summer data only. Demacia Cup and Worlds games are never fed back in.

## Which games count

- **Every Worlds 2026 game:** Play-In, Swiss stage and knockouts, through the final on Nov 14.
- **Headline:** all games pooled. Each stage is also reported separately.

## Data

- **Primary source:** Oracle's Elixir 2026 match data, downloaded after the final. Use team rows: pick1–pick5 in draft order, firstPick, ban1–ban5, game number.
- **Fallback:** gol.gg, only for games Oracle's Elixir lacks. Note each one.
- **Series and fearless:**
  - Series are identified by event + team pair: a new series starts at game 1 or after a gap of more than 12 hours.
  - Champions used earlier in a series are unavailable, as in every earlier test.
  - Fearless and duplicate games are checked before scoring.

## Metrics

1. **Likelihood per draft action:** for every pick and ban, the probability each model gave the real choice among the champions still available, averaged over all actions. Each model's result is reported as a % gain over gol.gg's PrioScore.
   - **Scoring convention** (same as the Evidence tab): xPresence is scored with its own probabilities (β = 1). PrioScore, PrioScore with recency, and presence get β fitted on the last 30 days of summer training games.
   - The fitted-β version for xPresence is reported as a secondary number.
2. **90% range:** from 1,000 resamples of whole Worlds series.
3. **Rank correlation:** between each model's ranking and Worlds presence.
4. **Accuracy of the percentages:** on Game 1s, predicted xPresence against how often each champion was picked or banned, grouped into bins. Watch the 90%+ bin especially: at past international events, champions rated 90%+ were taken 81% of the time.
5. **Top-10 hit rate:** of each model's top 10, how many are picked or banned in the average Game 1.

## What counts as a win

**xPresence passes if patch-adjusted xPresence beats gol.gg's PrioScore per draft action, all stages pooled, and the 90% range stays above zero.**

- The result vs PrioScore with recency is reported as context, not as a pass/fail condition.
- Results are published whether xPresence passes or not.

## Not in this test

- **Left out:** the per-role correction, field weighting, and the size-tier and win-rate patch variants.
- **Already being tested elsewhere:** field weighting is being tested at the Demacia Cup (scored Oct 19).
