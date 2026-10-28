# Relatório semanal DR Oral Clinic

Gera, toda sexta-feira às 17h (Brasília), o relatório semanal da DR Oral (unidades Cajazeiras e Triunfo) a partir da Nibo.

## Regras dos períodos (relatório da sexta `S`)

- Realizado da semana: sábado `S-6` até sexta `S` (transferências entre contas não contam).
- Saldos: saldo inicial da conta na Nibo + recebimentos − pagamentos até a data de corte. Para contas com Open Finance mostra a data da última sincronização; para caixa e cofre, a data do último lançamento.
- Contas a pagar, semana seguinte: terça `S+4` a segunda `S+10`, pagas antecipadamente na segunda `S+3`.
- Contas a pagar, outra semana: terça `S+11` a segunda `S+17` (meta de faturamento da semana seguinte).
- Ainda em aberto: contas vencidas não baixadas + vencimentos do corte até a segunda `S+3`.
- Não identificados: lançamentos do mês sem categoria/centro de custo ou marcados como "não identificado", agendamentos em aberto sem centro de custo e movimentos do extrato ainda não lançados.

## Passo a passo

```bash
mkdir -p /tmp/dr && cd /tmp/dr
python3 <repo>/relatorio_semanal/fetch_nibo.py
python3 <repo>/relatorio_semanal/build_data.py AAAA-MM-DD(sexta) AAAA-MM-DD(corte)
python3 <repo>/relatorio_semanal/build_cp_csv.py dados_<sexta>.json      # CSV das contas a pagar
NODE_PATH=$(npm root -g) node <repo>/relatorio_semanal/gerar_relatorio.js dados_<sexta>.json links.json Relatorio_Semanal_DrOralClinic_<sexta>.docx
```

`links.json` traz `cp` e `ni` (links das planilhas no Google Drive) e `obs` (observações da semana).

As planilhas ficam no Drive em `09. D R Oral Clinic › Planilhas › Lançamentos a identificar` e `› Contas a pagar previsão`.
Nada é enviado ao cliente sem pedido explícito da Aridus.
