import json,csv,io,sys,datetime as dt
d=json.load(open(sys.argv[1]))
br=lambda s: dt.date.fromisoformat(s).strftime('%d/%m/%Y')
DIAS=['seg','ter','qua','qui','sex','sáb','dom'];dia=lambda s: DIAS[dt.date.fromisoformat(s).weekday()]
money=lambda v: f"{v:.2f}".replace('.',',')
UN={'CAJAZEIRAS-PB':'Cajazeiras','TRIUNFO-PB':'Triunfo','OBRA':'Obra','SÓCIOS':'Sócios','Não identificado':'Não identificado'}
j1,j2,ab=d['j1'],d['j2'],d['aberto_ate_segunda']
W=[(f"1) SEMANA SEGUINTE {br(j1[0])[:5]} a {br(j1[1])[:5]} (pagar na segunda {br(d['segunda_pagamento'])[:5]})",d['pagar_j1']),
   (f"2) OUTRA SEMANA {br(j2[0])[:5]} a {br(j2[1])[:5]} (meta de faturamento)",d['pagar_j2']),
   (f"0) AINDA EM ABERTO ATÉ {br(ab[1])[:5]} (vencidos e a vencer)",d['pagar_atraso']+d['pagar_aberto'])]
b=io.StringIO();w=csv.writer(b)
w.writerow(['Período','Unidade','Vencimento','Dia','Fornecedor','Descrição','Categoria','Valor (R$)','Situação','Conta de pagamento'])
for nome,rows in W:
    for u in d['units']:
        rs=[x for x in rows if x['unidade']==u]
        if not rs: continue
        for x in sorted(rs,key=lambda r:(r['venc'],r['nome'])):
            w.writerow([nome,UN[u],br(x['venc']),dia(x['venc']),x['nome'],x['descricao'].strip(),x['categoria'],money(x['valor']),'VENCIDO' if x['venc']<d['cutoff'] else ('Fatura NÃO FECHADA (parcial)' if x.get('fatura_aberta') else 'A vencer'),x.get('conta_pag','')])
        w.writerow([nome,UN[u],'','','','SUBTOTAL '+UN[u].upper(),'',money(sum(x['valor'] for x in rs)),''])
    w.writerow([nome,'TOTAL','','','','TOTAL DO PERÍODO','',money(sum(x['valor'] for x in rows)),''])
    w.writerow([])
w.writerow(['COMPOSIÇÃO DAS FATURAS DOS CARTÕES PJ (vencimento conforme o nome da conta do cartão na Nibo)'])
w.writerow(['Cartão','Vencimento','Situação','Unidade','Data','Fornecedor','Descrição','Valor (R$)','Origem'])
for f in d.get('faturas',[]):
    sit='Fechada' if f['fechada'] else 'NÃO FECHADA - valor parcial'
    for i in sorted(f['itens'],key=lambda i:(i['unidade'],i['nome'])):
        w.writerow(['Cartão PJ '+f['cartao'],br(f['venc']),sit,UN[i['unidade']],br(i['data']),i['nome'],i['descricao'].strip(),money(i['valor']),i['origem']])
    w.writerow(['Cartão PJ '+f['cartao'],br(f['venc']),sit,'TOTAL','','','TOTAL DA FATURA',money(f['total']),''])
open('CP.csv','w').write(b.getvalue());print(b.getvalue())
