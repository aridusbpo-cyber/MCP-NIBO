"""Monta os dados do relatório semanal DR Oral a partir dos JSON baixados da Nibo.
Uso: python3 build_data.py REF_FRIDAY(AAAA-MM-DD) CUTOFF(AAAA-MM-DD)"""
import json,sys,datetime as dt,collections
REF=dt.date.fromisoformat(sys.argv[1]); CUT=dt.date.fromisoformat(sys.argv[2])
D=lambda s: dt.date.fromisoformat(s[:10])
acc={a['id']:a for a in json.load(open('accounts.json'))['items']}
P=json.load(open('payments.json'));R=json.load(open('receipts.json'))
DEB=json.load(open('debit.json'));CRE=json.load(open('credit.json'));REC=json.load(open('recon.json'))
UNITS=['CAJAZEIRAS-PB','TRIUNFO-PB','OBRA','SÓCIOS','Não identificado']
CCMAP={c['costCenterId']:c['description'] for c in json.load(open('costcenters.json'))['items']}
def ccname(c): return norm_cc(c.get('costCenterDescription') or CCMAP.get(c.get('costCenterId')))
def norm_cc(n): return 'Não identificado' if (not n or n=='Não Identificado') else n
# janelas
wk_ini=REF-dt.timedelta(days=6)                      # sábado anterior .. sexta
mon_next=REF+dt.timedelta(days=3)                    # segunda em que o cliente paga
J1=(REF+dt.timedelta(days=4),REF+dt.timedelta(days=10))   # terça..segunda
J2=(REF+dt.timedelta(days=11),REF+dt.timedelta(days=17))
OPEN_NOW=(REF+dt.timedelta(days=1),mon_next)         # sáb..seg (janela anterior ainda em aberto)
# saldos
LIQ_EXCL=('Cartão','OBRA','Máquinas','Boletos')
def saldo(aid,cut):
    a=acc[aid];b=a['openBalance'];o=D(a['dateOfOpenBalance'])
    for x in R:
        if x['account']['id']==aid and o<D(x['date'])<=cut: b+=x['value']
    for x in P:
        if x['account']['id']==aid and o<D(x['date'])<=cut: b-=x['value']
    return round(b,2)
lastrec={}
for x in P+R:
    if x['isReconciliated'] and D(x['date'])<=CUT:
        k=x['account']['id']; lastrec[k]=max(lastrec.get(k,''),x['date'][:10])
ultmov={}
for x in P+R:
    if D(x['date'])<=CUT:
        k=x['account']['id']; ultmov[k]=max(ultmov.get(k,''),x['date'][:10])
saldos=[]
for aid,a in acc.items():
    if a['isArchived']: continue
    pend=REC.get(aid,[])
    saldos.append(dict(conta=a['name'],saldo=saldo(aid,CUT),liquidez=not any(w in a['name'] for w in LIQ_EXCL) and a['type']=='BankAccount',
        ult_conciliado=lastrec.get(aid,''),ult_mov=ultmov.get(aid,''),sync=(a.get('automationLastSyncDate') or '')[:10],openfinance=a.get('isOpenFinance'),
        pend_qtd=len(pend),pend_valor=round(sum(i['accountEntry']['value'] for i in pend),2)))
# realizado
def split(x):
    cc=x.get('costCenters') or []
    if not cc: return [('Não identificado',x['value'])]
    return [(ccname(c),c['value']) for c in cc]
def cat(x):
    cs=x.get('categories') or []
    return ' + '.join(c['categoryName'] for c in cs) if cs else ''
def motivo(x):
    r=[]
    c=cat(x).lower()
    if not c: r.append('Sem categoria')
    elif 'não identificad' in c or 'nao identificad' in c: r.append('Categoria "não identificada"')
    cc=x.get('costCenters') or []
    if not cc: r.append('Sem centro de custo')
    elif any(ccname(c)=='Não identificado' for c in cc): r.append('Centro de custo "Não Identificado"')
    return '; '.join(r)
mov=[]
for tipo,L in (('Entrada',R),('Saída',P)):
    for x in L:
        if x.get('isTransfer'): continue
        d=D(x['date'])
        if wk_ini<=d<=min(REF,CUT):
            for u,v in split(x):
                mov.append(dict(data=x['date'][:10],tipo=tipo,unidade=u,nome=(x.get('stakeholder') or {}).get('name',''),
                    descricao=x.get('description') or x.get('identifier',''),categoria=cat(x),conta=x['account']['name'],valor=round(v,2)))
# a pagar / a receber
def sched(L,ini,fim):
    out=[]
    for x in L:
        if x['isPaid'] or x['openValue']<=0.004: continue
        d=D(x['dueDate'])
        if ini<=d<=fim:
            cc=x.get('costCenters') or []
            parts=[(ccname(c),c['value']) for c in cc] or [('Não identificado',x['openValue'])]
            tot=sum(v for _,v in parts) or 1
            for u,v in parts:
                out.append(dict(venc=x['dueDate'][:10],unidade=u,nome=(x.get('stakeholder') or {}).get('name',''),
                    descricao=x.get('description',''),categoria=cat(x),valor=round(x['openValue']*v/tot,2),id=x['scheduleId'],
                    motivo=motivo(x)))
    return sorted(out,key=lambda r:(r['venc'],r['nome']))
pagar_atraso=sched(DEB,dt.date(2000,1,1),CUT-dt.timedelta(days=1))
pagar_aberto=sched(DEB,max(CUT,OPEN_NOW[0]) if False else CUT,OPEN_NOW[1])
pagar_j1=sched(DEB,*J1); pagar_j2=sched(DEB,*J2)
receber_j1=sched(CRE,*J1); receber_j2=sched(CRE,*J2); receber_atraso=sched(CRE,dt.date(2000,1,1),CUT-dt.timedelta(days=1))
# não identificados: realizados desde o início do mês anterior ao corte + CP/CR em aberto + extrato pendente
ini_ni=dt.date(CUT.year,CUT.month,1)
ni=[]
for tipo,L in (('Receita',R),('Despesa',P)):
    for x in L:
        if x.get('isTransfer'): continue
        m=motivo(x); d=D(x['date'])
        if m and ini_ni<=d<=CUT:
            ni.append(dict(origem='Lançamento realizado',tipo=tipo,data=x['date'][:10],nome=(x.get('stakeholder') or {}).get('name',''),
                descricao=x.get('description') or x.get('identifier',''),conta=x['account']['name'],valor=round(x['value'],2),motivo=m,id=x['entryId']))
for tipo,L in (('Despesa (a pagar)',DEB),('Receita (a receber)',CRE)):
    for x in L:
        if x['isPaid'] or x['openValue']<=0.004: continue
        m=motivo(x)
        if m and D(x['dueDate'])<=J2[1]:
            ni.append(dict(origem='Agendado em aberto',tipo=tipo,data=x['dueDate'][:10],nome=(x.get('stakeholder') or {}).get('name',''),
                descricao=x.get('description',''),conta='',valor=round(x['openValue'],2),motivo=m,id=x['scheduleId']))
for aid,items in REC.items():
    for i in items:
        e=i['accountEntry']
        if D(e['date'])<=CUT:
            ni.append(dict(origem='Extrato bancário ainda não lançado',tipo='Receita' if e['value']>0 else 'Despesa',data=e['date'][:10],
                nome=e.get('counterpartyName') or '',descricao=e['description'],conta=acc[aid]['name'],valor=abs(e['value']),
                motivo='Movimento do banco sem lançamento na Nibo',id=e['id']))
ni.sort(key=lambda r:(r['data'],r['tipo']))
out=dict(ref=str(REF),cutoff=str(CUT),semana=[str(wk_ini),str(min(REF,CUT))],semana_completa=[str(wk_ini),str(REF)],
    segunda_pagamento=str(mon_next),j1=[str(x) for x in J1],j2=[str(x) for x in J2],aberto_ate_segunda=[str(CUT),str(OPEN_NOW[1])],
    saldos=saldos,mov=mov,pagar_atraso=pagar_atraso,pagar_aberto=pagar_aberto,pagar_j1=pagar_j1,pagar_j2=pagar_j2,
    receber_j1=receber_j1,receber_j2=receber_j2,receber_atraso=receber_atraso,nao_identificados=ni,units=UNITS)
json.dump(out,open(f'dados_{REF}.json','w'),ensure_ascii=False,indent=1)
# resumo
f=lambda v:f"{v:,.2f}"
print('saldos liquidez',f(sum(s['saldo'] for s in saldos if s['liquidez'])))
for s in saldos: print(' ',s['conta'][:38].ljust(38),f(s['saldo']).rjust(12),s['liquidez'],s['ult_conciliado'],s['pend_qtd'],s['pend_valor'])
for k in ['mov','pagar_atraso','pagar_aberto','pagar_j1','pagar_j2','receber_j1','receber_j2','nao_identificados']:
    L=out[k];by=collections.defaultdict(float)
    for r in L: by[(r.get('tipo',''),r.get('unidade',''))]+=r['valor']
    print(k,len(L),{kk:round(v,2) for kk,v in by.items()})
