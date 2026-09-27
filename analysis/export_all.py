import pandas as pd, json, re, datetime as dt, collections
norm=lambda s: re.sub(r'[^a-z0-9]','',str(s).lower())
L25={'LCK','LPL','LEC','LTA','LTA N','LTA S','LCP','FST','MSI','WLDs'}
L26={'LCK','LPL','LEC','LCS','CBLOL','LCP','FST','MSI'}
cols=['gameid','datacompleteness','league','year','split','playoffs','date','game','patch','side','position','teamname','firstPick','ban1','ban2','ban3','ban4','ban5','pick1','pick2','pick3','pick4','pick5','result']
frames=[]
for f,L in [('/mnt/user-data/uploads/Downloads/2025_LoL_esports_match_data_from_OraclesElixir.csv',L25),('/mnt/user-data/uploads/Downloads/2026_LoL_esports_match_data_from_OraclesElixir.csv',L26)]:
    d=pd.read_csv(f,usecols=cols,low_memory=False); d=d[(d.position=='team')&(d.league.isin(L))]; frames.append(d)
t=pd.concat(frames); t['ts']=pd.to_datetime(t.date)
# patch order: sort distinct (year, patch float) by median date
pm=t.groupby(['year','patch']).ts.median().sort_values()
prank={k:i for i,k in enumerate(pm.index)}
C=[]; T=[]
def ci(x):
    if pd.isna(x): return None
    k=norm(x)
    for i,c in enumerate(C):
        if norm(c)==k: return i
    C.append(str(x)); return len(C)-1
cidx={}
def cid(x):
    if pd.isna(x): return None
    k=norm(x)
    if k not in cidx: cidx[k]=len(C); C.append(str(x))
    return cidx[k]
tid={}
def tix(x):
    if x not in tid: tid[x]=len(T); T.append(x)
    return tid[x]
games=[]
for gid,g in t.groupby('gameid'):
    if len(g)!=2 or set(g.side)!={'Blue','Red'}: continue
    bl=g[g.side=='Blue'].iloc[0]; rd=g[g.side=='Red'].iloc[0]
    fp=0 if bl.firstPick==1 else (1 if rd.firstPick==1 else None)
    games.append(dict(gid=gid,lg=bl.league,year=int(bl.year),split=str(bl.split),po=int(bl.playoffs) if not pd.isna(bl.playoffs) else 0,ts=bl.ts,game=int(bl.game),pt=prank[(bl.year,bl.patch)],
       patch=f"{int(bl.year)-2010 if bl.year<2026 else 16}.{bl.patch}",A=tix(bl.teamname),B=tix(rd.teamname),win=0 if bl.result==1 else 1,fp=fp,comp=bl.datacompleteness,
       bA=[cid(bl[f'ban{k}']) for k in range(1,6)],bB=[cid(rd[f'ban{k}']) for k in range(1,6)],pA=[cid(bl[f'pick{k}']) for k in range(1,6)],pB=[cid(rd[f'pick{k}']) for k in range(1,6)]))
games.sort(key=lambda g:g['ts'])
# series
last={}; sid=0
for g in games:
    pair=(g['lg'],frozenset([g['A'],g['B']])); p=last.get(pair)
    if p is None or g['game']==1 or (g['ts']-p['ts']).total_seconds()>12*3600 or g['game']<=p['game']: sid+=1; cur=sid
    else: cur=p['sid']
    g['sid']=cur; last[pair]=g
# fearless check per league-split; drop duplicate games
by=collections.defaultdict(list)
for g in games: by[g['sid']].append(g)
rep=collections.Counter(); multi=collections.Counter(); drop=set()
for s,Lg in by.items():
    seen=set(); prevk=None
    for g in sorted(Lg,key=lambda g:g['game']):
        k=frozenset(g['pA']+g['pB'])
        if k==prevk: drop.add(g['gid'])
        prevk=k
        key=(g['year'],g['lg'],g['split'])
        if len(Lg)>1: multi[key]+=1
        for c in g['pA']+g['pB']:
            if c in seen: rep[key]+=1
            seen.add(c)
print('dropped duplicates',len(drop))
nonfear=set()
for key in sorted(multi):
    r=rep[key]/max(1,multi[key])
    if r>0.05: nonfear.add(key)
    print(key,'multi-game series games',multi[key],'repeat picks per game',round(r,3))
day0=dt.datetime(2025,1,1)
out=[]
for g in games:
    if g['gid'] in drop: continue
    fear=(g['year'],g['lg'],g['split']) not in nonfear
    out.append(dict(gid=g['gid'],sid=g['sid'] if fear else 100000+len(out),lg=g['lg'],year=g['year'],split=g['split'],st=g['po'],gn=g['game'],day=(g['ts']-day0).days,pt=g['pt'],patch=g['patch'],
      A=g['A'],B=g['B'],win=g['win'],fp=2 if g['fp'] is None else g['fp'],known=g['fp'] is not None,bA=[255 if x is None else x for x in g['bA']],bB=[255 if x is None else x for x in g['bB']],pA=g['pA'],pB=g['pB'],fearless=fear))
json.dump({'C':C,'T':T,'rows':out,'nonfearless':[list(k) for k in nonfear]},open('all_games.json','w'))
print('games',len(out),'champs',len(C),'nonfearless splits',nonfear)
print(collections.Counter((g['year'],g['lg']) for g in out))
