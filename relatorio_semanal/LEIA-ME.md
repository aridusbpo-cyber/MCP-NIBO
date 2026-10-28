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
python3 <repo>/relatorio_semanal/build_cp_csv.py dados_<sexta>.json      # CP.csv (contas a pagar)
python3 <repo>/relatorio_semanal/build_ni_csv.py dados_<sexta>.json      # NI.csv (lançamentos a identificar)
NODE_PATH=$(npm root -g) node <repo>/relatorio_semanal/gerar_relatorio.js dados_<sexta>.json links.json Relatorio_Semanal_DrOralClinic_<sexta>.docx
```

Versão HTML (arquivo único): `node <repo>/relatorio_semanal/gerar_html.js dados_<sexta>.json links.json Relatorio_Semanal_DrOralClinic_<sexta>.html`

`links.json` traz `cp` e `ni` (links das planilhas no Google Drive) e `obs` (observações da semana).

As planilhas ficam no Drive em `09. D R Oral Clinic › Planilhas › Lançamentos a identificar` e `› Contas a pagar previsão`.
Nada é enviado ao cliente sem pedido explícito da Aridus.

## Fluxo de caixa por conta (necessidade.js)
Por conta: saldo hoje − vencidos e até a segunda de pagamento = saldo provisionado para a semana seguinte; menos essas contas = FALTA (depositar até a segunda); o que sobrar vai para a outra semana, cuja FALTA é a meta de faturamento da conta.
Para cada conta de pagamento: saldo de hoje − (vencidos + contas até a segunda seguinte) = falta até a segunda de pagamento. A conta das contas da outra semana, menos a sobra da mesma conta, dá o que é preciso faturar. A sobra de uma conta não cobre a outra. "Conta não informada" não tem saldo, então entra inteira como falta.

## HTML interativo (gerar_html.js)
A página inicial mostra só os totais. Cada valor sublinhado ou cartão com "ver detalhes" abre uma janela com os lançamentos que formam aquele número (contas a pagar por período, unidade e conta; movimentos da semana por conta e unidade; faturas dos cartões; vencidos; a receber; a identificar). O botão "Voltar" (ou o voltar do celular) retorna ao resumo. Os dados ficam embutidos no próprio arquivo, que funciona offline.
