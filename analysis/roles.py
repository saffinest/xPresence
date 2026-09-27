import csv, json
R={}
for y in (2025,2026):
    with open(f'/mnt/user-data/uploads/Downloads/{y}_LoL_esports_match_data_from_OraclesElixir.csv',newline='',encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if r['position'] in ('top','jng','mid','bot','sup'):
                R.setdefault(r['gameid'],{})[r['champion']]=r['position']
A=json.load(open('all_games.json'))
RI={'top':0,'jng':1,'mid':2,'bot':3,'sup':4}
miss=0; full=0
for g in A['rows']:
    m=R.get(g['gid'],{})
    for side in ('A','B'):
        ps=g['p'+side]; rr=[]
        for c in ps:
            nm=A['C'][c] if c is not None and c!=255 else None
            rr.append(RI.get(m.get(nm)) if nm else None)
        g['r'+side]=rr
    ok=all(x is not None for x in g['rA']+g['rB']) and sorted(g['rA'])==[0,1,2,3,4] and sorted(g['rB'])==[0,1,2,3,4]
    full+=ok; miss+= not ok
    if not ok: g['rA']=g['rB']=None
json.dump(A,open('all_games_roles.json','w'))
print('games',len(A['rows']),'with full roles',full,'missing',miss)
