# Exports Worlds 2026 games from the Oracle's Elixir 2026 CSV into worlds.json (champion and team NAMES, not indices).
# Usage: python3 export_worlds.py <path to 2026 OE csv> <out.json>   (needs pandas; on this Mac: /usr/bin/python3)
import sys, json, re, collections
import pandas as pd
src, out = sys.argv[1], sys.argv[2]
cols = ['gameid','datacompleteness','league','year','split','playoffs','date','game','patch','side','position','teamname',
        'firstPick','ban1','ban2','ban3','ban4','ban5','pick1','pick2','pick3','pick4','pick5','result']
d = pd.read_csv(src, usecols=cols, low_memory=False)
print('leagues in file containing W/orld:', sorted(x for x in d.league.dropna().unique() if 'W' in str(x) or 'orld' in str(x)))
t = d[(d.position == 'team') & (d.league == 'WLDs') & (d.year == 2026)].copy()
t['ts'] = pd.to_datetime(t.date)
print('team rows', len(t), 'splits', t.split.fillna('').unique().tolist(), 'playoffs', t.playoffs.unique().tolist(),
      'patches', sorted(t.patch.astype(str).unique().tolist()), 'completeness', t.datacompleteness.value_counts().to_dict())
nm = lambda x: None if pd.isna(x) or str(x).strip() == '' else str(x)
games = []
for gid, g in t.groupby('gameid'):
    if len(g) != 2 or set(g.side) != {'Blue', 'Red'}:
        print('skip malformed', gid); continue
    bl = g[g.side == 'Blue'].iloc[0]; rd = g[g.side == 'Red'].iloc[0]
    fp = 0 if bl.firstPick == 1 else (1 if rd.firstPick == 1 else None)
    games.append(dict(gid=gid, ts=bl.ts, date=str(bl.date), game=int(bl.game), split=nm(bl.split) or '', po=int(bl.playoffs) if not pd.isna(bl.playoffs) else 0,
        patch=str(bl.patch), comp=str(bl.datacompleteness), A=str(bl.teamname), B=str(rd.teamname), win=0 if bl.result == 1 else 1, fp=fp,
        bA=[nm(bl[f'ban{k}']) for k in range(1, 6)], bB=[nm(rd[f'ban{k}']) for k in range(1, 6)],
        pA=[nm(bl[f'pick{k}']) for k in range(1, 6)], pB=[nm(rd[f'pick{k}']) for k in range(1, 6)]))
games.sort(key=lambda g: (g['ts'], g['game']))
# Oracle's Elixir also files the LPL regional-qualifier games (Sep 17-19) under WLDs. They're in the summer
# training data, not Worlds, so keep only games from the Play-In start (Oct 15, per the test plan) onward.
WORLDS_START = '2026-10-15'
pre = [g for g in games if g['date'][:10] < WORLDS_START]
games = [g for g in games if g['date'][:10] >= WORLDS_START]
print('excluded', len(pre), 'games before', WORLDS_START, sorted(set(g['date'][:10] for g in pre)), sorted(set(t for g in pre for t in (g['A'], g['B']))))
last = {}; sid = 0
for g in games:
    pair = frozenset([g['A'], g['B']]); p = last.get(pair)
    if p is None or g['game'] == 1 or (g['ts'] - p['ts']).total_seconds() > 12 * 3600 or g['game'] <= p['game']:
        sid += 1; g['sid'] = sid
    else:
        g['sid'] = p['sid']
    last[pair] = g
# duplicates and fearless check
by = collections.defaultdict(list)
for g in games: by[g['sid']].append(g)
drop = set(); repeats = []
for s, L in by.items():
    seen = set(); prevk = None
    for g in sorted(L, key=lambda g: g['game']):
        k = frozenset(x for x in g['pA'] + g['pB'] if x)
        if k == prevk: drop.add(g['gid'])
        prevk = k
        for c in g['pA'] + g['pB']:
            if c and c in seen: repeats.append((g['gid'], c))
            if c: seen.add(c)
rows = [dict({k: v for k, v in g.items() if k != 'ts'}, known=g['fp'] is not None) for g in games if g['gid'] not in drop]
missing = [g['gid'] for g in rows if any(x is None for x in g['pA'] + g['pB'])]
json.dump({'rows': rows, 'dropped_duplicates': sorted(drop), 'repeat_picks_in_series': repeats, 'games_missing_picks': missing,
           'excluded': f'{len(pre)} games before {WORLDS_START} (LPL regional qualifier, in the summer training data, not Worlds)', 'excluded_gids': [g["gid"] for g in pre]}, open(out, 'w'))
print('games', len(rows), 'series', len(set(g['sid'] for g in rows)), 'dropped duplicates', len(drop),
      'repeat picks within a series (should be 0 under fearless)', len(repeats), 'games missing picks', len(missing),
      'unknown first pick', sum(1 for g in rows if not g['known']))
print('date range', rows[0]['date'] if rows else None, '→', rows[-1]['date'] if rows else None)
