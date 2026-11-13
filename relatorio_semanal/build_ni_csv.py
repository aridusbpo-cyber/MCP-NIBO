# Planilha "Lançamentos a identificar" (CSV para subir no Drive convertido em Google Sheets)
# Uso: python3 build_ni_csv.py dados_<sexta>.json  -> NI.csv
import json,csv,io,sys,datetime as dt
d=json.load(open(sys.argv[1]))
br=lambda s: dt.date.fromisoformat(s).strftime('%d/%m/%Y')
money=lambda v: f"{v:.2f}".replace('.',',')
b=io.StringIO();w=csv.writer(b)
w.writerow(['Origem','Tipo','Data','Nome / contraparte','Descrição','Conta','Valor (R$)','Por que está aqui','O QUE É? (cliente preenche)','UNIDADE CORRETA: Cajazeiras / Triunfo / Obra / Sócios (cliente preenche)','OBSERVAÇÃO (cliente preenche)'])
for x in sorted(d['nao_identificados'],key=lambda r:(r['data'],r['nome'])):
    w.writerow([x['origem'],x['tipo'],br(x['data']),x['nome'],x['descricao'],x['conta'],money(x['valor']),x['motivo'],'','',''])
open('NI.csv','w').write(b.getvalue());print(b.getvalue())
