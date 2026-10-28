// Relatório semanal DR Oral em HTML (arquivo único, mesmo conteúdo do Word)
// Uso: node gerar_html.js dados.json links.json saida.html
const fs = require('fs');
const d = JSON.parse(fs.readFileSync(process.argv[2]));
const links = JSON.parse(fs.readFileSync(process.argv[3]));
const OUT = process.argv[4];
const logo = fs.readFileSync(__dirname + '/logo_final.png').toString('base64');

const brl = v => (v < 0 ? '-R$ ' : 'R$ ') + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dbr = s => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const dm = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const addDays = (s, n) => new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const sum = (a, f = x => x.valor) => Math.round(a.reduce((s, x) => s + f(x), 0) * 100) / 100;
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const UN = { 'CAJAZEIRAS-PB': 'Cajazeiras', 'TRIUNFO-PB': 'Triunfo', 'OBRA': 'Obra', 'SÓCIOS': 'Sócios', 'Não identificado': 'Não identificado' };
const cls = v => (v >= 0 ? 'pos' : 'alert');

const contas = d.saldos.filter(s => s.liquidez);
const totalCaixa = sum(contas, s => s.saldo);
const nomeCurto = n => n.replace(/^\d+(\.\d+)?\s*[.-]?\s*/, '').replace(/C\/C\s*/, '').replace(/\s+/g, ' ').trim();
const atualizado = s => s.openfinance ? `extrato sincronizado ${dm(s.sync)}` : `último lançamento ${dm(s.ult_mov)}`;
const units = d.units;
const ent = d.mov.filter(m => m.tipo === 'Entrada'), sai = d.mov.filter(m => m.tipo === 'Saída');
const totEnt = sum(ent), totSai = sum(sai), res = totEnt - totSai;
const abertoAteSeg = d.pagar_atraso.concat(d.pagar_aberto);
const tJ1 = sum(d.pagar_j1), tJ2 = sum(d.pagar_j2), tAb = sum(abertoAteSeg);
const obra = d.saldos.find(s => /OBRA/i.test(s.conta));
const s88 = d.saldos.find(s => /cnpj 88/i.test(s.conta));
const cofre = contas.filter(s => /Cofre|Caixa/i.test(s.conta));
const bancos = contas.filter(s => !/Cofre|Caixa/i.test(s.conta)).sort((a, b) => a.conta.localeCompare(b.conta));
const pend = d.saldos.filter(s => s.pend_qtd);
const fora = d.saldos.filter(s => !s.liquidez && !/OBRA/i.test(s.conta) && Math.abs(s.saldo) > 0.004);
const rec = d.receber_j1.concat(d.receber_j2);
const ni = d.nao_identificados;
const fatAb = d.faturas.filter(f => !f.fechada);

const card = (label, value, sub, c, hl) => `<div class="card${hl ? ' hl' : ''}"><div class="lbl">${esc(label)}</div><div class="val ${c}">${esc(value)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>`;
const sec = t => `<h2>${esc(t)}</h2>`;
function grid(headers, rows) {
  return `<div class="tw"><table><thead><tr>${headers.map((h, i) => `<th${i ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r => `<tr${r.total ? ' class="tot"' : ''}><td>${esc(r.label)}</td>${r.vals.map(v => `<td class="n ${v.c || ''}${v.b ? ' b' : ''}">${esc(v.t)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

const cols = [abertoAteSeg, d.pagar_j1, d.pagar_j2];
const cpHead = [`Até seg ${dm(d.segunda_pagamento)}`, `${dm(d.j1[0])} a ${dm(d.j1[1])}`, `${dm(d.j2[0])} a ${dm(d.j2[1])}`];
const v = x => ({ t: x ? brl(x) : '—', c: x ? 'alert' : 'muted' });
const totRow = { label: 'Total', total: true, vals: cols.map(c => ({ t: brl(sum(c)), c: 'alert' })) };
const ORD = ['Sicredi 33', 'Sicredi 88', 'Sicredi 95', 'Nubank Dra. Rayssa', 'Nubank Dr. Deusdedit', 'Caixa / espécie', 'Conta não informada'];
const nec = require('./necessidade')(d, ORD);
const segJ2 = addDays(d.j2[0], -1);
const ok = { t: 'coberto', c: 'pos', b: 1 };
const sobras = nec.rows.filter(r => r.saldo !== null && r.sobraFinal > 0.004);
const semConta = nec.rows.find(r => r.conta === 'Conta não informada');
const ru = units.map(u => { const e = sum(ent.filter(m => m.unidade === u)), s = sum(sai.filter(m => m.unidade === u)); return { u, e, s }; }).filter(x => x.e || x.s);

const pendRows = [];
if (ni.length) pendRows.push(['Clínica', `Preencher a planilha de lançamentos a identificar (${ni.length} itens, ${brl(sum(ni))}).`]);
if (d.pagar_atraso.length) pendRows.push(['Clínica', (d.pagar_atraso.length > 1 ? `Confirmar o pagamento das ${d.pagar_atraso.length} contas vencidas e não baixadas (` : 'Confirmar o pagamento da conta vencida e não baixada (') + `${brl(sum(d.pagar_atraso))}, detalhe na planilha de contas a pagar) e enviar o comprovante.`]);
pendRows.push(['Clínica', 'Enviar notas, boletos e comprovantes novos da semana para lançamento.']);

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório Semanal DR Oral</title>
<style>
:root{--pri:#2F5D50;--pri2:#4C7566;--acc:#B8934C;--tint:#F2F6F4;--gold:#FBF6E8;--alt:#FAFBFA;--bd:#DCE4E1;--tx:#2B2B2B;--mut:#6B7A76;--pos:#2E7D4F;--alert:#A8433D;--crit:#C9731E;--link:#1F5FA8;--bg:#FFFFFF}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.5 Calibri,"Segoe UI",Arial,sans-serif}
.page{max-width:900px;margin:0 auto;padding:24px 16px 40px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--bd);padding-bottom:10px}
header img{height:52px}header .t{text-align:right}header .t b{color:var(--pri);font-size:18px}header .t i{color:var(--acc)}header .t div{color:var(--mut);font-size:12px;font-style:italic}
h1{color:var(--pri);font-size:24px;margin:18px 0 4px;border-bottom:2px solid var(--acc);padding-bottom:6px}
.meta{color:var(--mut);font-size:13px}.note{color:var(--mut);font-size:13px;font-style:italic;margin:6px 0}
.legend span{font-weight:700;margin-right:10px;font-size:12px}
h2{background:var(--tint);border-left:5px solid var(--pri);border-bottom:1px solid var(--acc);color:var(--pri);font-size:15px;text-transform:uppercase;padding:8px 12px;margin:28px 0 12px}
h3{color:var(--pri2);font-size:14px;margin:16px 0 6px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:10px 0}
.card{border:1px solid var(--bd);border-top:3px solid var(--pri);padding:10px;text-align:center;background:#fff}.card.hl{background:var(--gold);border-top-color:var(--acc)}
.lbl{font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase}.val{font-size:22px;font-weight:700;margin:4px 0}.sub{font-size:11px;font-style:italic;color:var(--mut)}
.pos{color:var(--pos)}.alert{color:var(--alert)}.crit{color:var(--crit)}.muted{color:var(--mut)}
.b{font-weight:700}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}
th{background:var(--tint);color:var(--pri);font-size:11px;text-transform:uppercase;text-align:left;padding:7px 8px;border-top:1px solid var(--acc);border-bottom:1px solid var(--acc)}
td{padding:7px 8px;border-bottom:1px solid var(--bd)}tbody tr:nth-child(even){background:var(--alt)}.n{text-align:right;white-space:nowrap}
tr.tot td{background:var(--tint);font-weight:700;color:var(--pri);border-top:2px solid var(--acc);border-bottom:2px solid var(--acc)}tr.tot td.alert{color:var(--alert)}tr.tot td.pos{color:var(--pos)}
.kpi .card .val{font-size:19px}p{margin:8px 0}a{color:var(--link)}
.obs{display:flex;border-top:1px solid var(--bd);border-bottom:1px solid var(--bd);margin:8px 0}.obs .num{background:var(--tint);color:var(--pri);font-weight:700;min-width:36px;display:flex;align-items:center;justify-content:center}.obs .txt{border-left:3px solid var(--acc);padding:8px 12px}
footer{margin-top:32px;border-top:1px solid var(--bd);padding-top:8px;font-size:11px;color:var(--mut)}
@media print{.page{padding:0}h2{break-after:avoid}.card,.obs,tr{break-inside:avoid}}
</style></head><body><div class="page">
<header><img src="data:image/png;base64,${logo}" alt="Aridus BPO"><div class="t"><b>RELATÓRIO SEMANAL</b> <i>— Fluxo de Caixa &amp; Previsões</i><div>DR Oral Clinic | Atualizado em ${dbr(d.cutoff)}</div></div></header>
<h1>Relatório Semanal — DR Oral Clinic</h1>
<div class="meta">Semana de ${dbr(d.semana_completa[0])} a ${dbr(d.semana_completa[1])} · <b>dados da Nibo até ${dbr(d.cutoff)}</b></div>
${d.cutoff < d.ref ? `<div class="note">Prévia: a semana ainda não terminou. A versão final é gerada na sexta-feira ${dbr(d.ref)}, às 17h.</div>` : ''}
<div class="legend"><span class="pos">■ positivo</span><span class="alert">■ alerta</span><span class="crit">■ crítico</span></div>

${sec(`1. Saldos em conta em ${dbr(d.cutoff)}`)}
<div class="cards">${bancos.map(s => card(nomeCurto(s.conta).replace(/Sicredi \d{5}-\d/, 'Sicredi'), brl(s.saldo), atualizado(s), cls(s.saldo))).join('')}${card('Caixas e cofre', brl(sum(cofre, s => s.saldo)), `último lançamento ${dm(cofre.map(s => s.ult_mov).sort().pop())}`, 'pos')}</div>
<div class="cards">${card('Total disponível', brl(totalCaixa), 'soma das contas acima (sem a obra)', cls(totalCaixa), true)}${obra ? card('Obra — separado', brl(obra.saldo), `reservado dentro da Sicredi 88 · no banco a 88 soma ${brl(s88.saldo + obra.saldo)}`, 'crit') : ''}</div>
<div class="note">Fora do total: ${fora.map(s => `${esc(nomeCurto(s.conta))} ${brl(s.saldo)}`).join(' · ')}.${pend.length ? ` Há ${sum(pend, s => s.pend_qtd)} movimentos de extrato ainda em lançamento.` : ''}</div>

${sec('2. Resumo: o que precisa estar na conta')}
<div class="cards kpi">${card('Disponível hoje', brl(totalCaixa), 'sem a obra', cls(totalCaixa))}${card(`A pagar até seg ${dm(d.segunda_pagamento)}`, brl(tAb), `vencidos + até ${dm(d.segunda_pagamento)}`, 'alert')}${card(`Contas ${dm(d.j1[0])} a ${dm(d.j1[1])}`, brl(tJ1), `pagar na segunda ${dm(d.segunda_pagamento)}` + (d.pagar_j1.some(r => r.fatura_aberta) ? ' · com faturas de cartão parciais' : ''), 'alert', true)}${card(`Contas ${dm(d.j2[0])} a ${dm(d.j2[1])}`, brl(tJ2), 'meta de faturamento · por conta abaixo', 'alert')}</div>
<h3>Quanto precisa entrar em cada conta</h3>
${grid(['Conta', 'Saldo hoje', `Pagar seg ${dm(d.segunda_pagamento)}`, `Falta até ${dm(d.segunda_pagamento)}`, `Contas ${dm(d.j2[0])} a ${dm(d.j2[1])}`, `Faturar até ${dm(segJ2)}`], [
  ...nec.rows.map(r => ({ label: r.conta, vals: [
    r.saldo === null ? { t: '—', c: 'muted' } : { t: brl(r.saldo), c: cls(r.saldo) },
    r.pagar ? { t: brl(r.pagar), c: 'alert' } : { t: '—', c: 'muted' },
    r.falta ? { t: brl(r.falta), c: 'crit', b: 1 } : ok,
    r.pagar2 ? { t: brl(r.pagar2), c: 'alert' } : { t: '—', c: 'muted' },
    r.faturar ? { t: brl(r.faturar), c: 'alert', b: 1 } : ok] })),
  { label: 'Total', total: true, vals: [{ t: '' }, { t: brl(nec.pagar) }, { t: brl(nec.falta), c: nec.falta ? 'crit' : 'pos' }, { t: brl(nec.pagar2) }, { t: brl(nec.faturar), c: nec.faturar ? 'alert' : 'pos' }] }])}
<div class="note">Pagar seg ${dm(d.segunda_pagamento)} = vencidos + contas até ${dm(d.j1[1])}. Falta = quanto precisa entrar na conta até a segunda ${dm(d.segunda_pagamento)}. Faturar = quanto precisa entrar até a segunda ${dm(segJ2)} para as contas de ${dm(d.j2[0])} a ${dm(d.j2[1])}, já descontado o que sobrar na conta. A sobra de uma conta não cobre a outra: só vale se houver transferência.</div>
${sobras.length ? `<p><b class="pos">✔ Contas com sobra depois dos pagamentos:</b> ${sobras.map(r => `${esc(r.conta)} ${brl(r.sobraFinal)}`).join(' · ')}.</p>` : ''}
${semConta ? `<p><b class="alert">⚠ Alerta:</b> ${brl(semConta.pagar + semConta.pagar2)} em contas sem conta de pagamento definida na Nibo. Enquanto não for definida, o valor entra inteiro como falta.</p>` : ''}

${sec(`3. Realizado da semana (${dm(d.semana[0])} a ${dm(d.semana[1])})`)}
<div class="cards">${card('Total que entrou', brl(totEnt), '', 'pos')}${card('Total que saiu', brl(totSai), '', 'alert')}${card('Resultado da semana', brl(res), '', cls(res), true)}</div>
${grid(['Unidade', 'Entradas', 'Saídas', 'Resultado'], [
  ...ru.map(x => ({ label: UN[x.u], vals: [{ t: x.e ? brl(x.e) : '—', c: 'pos' }, { t: x.s ? brl(x.s) : '—', c: 'alert' }, { t: brl(x.e - x.s), c: cls(x.e - x.s) }] })),
  { label: 'Total', total: true, vals: [{ t: brl(totEnt), c: 'pos' }, { t: brl(totSai), c: 'alert' }, { t: brl(res), c: cls(res) }] }])}

${sec('4. Contas a pagar — totais')}
<h3>Por unidade</h3>
${grid(['Unidade', ...cpHead], [...units.filter(u => cols.some(c => c.some(r => r.unidade === u))).map(u => ({ label: UN[u], vals: cols.map(c => v(sum(c.filter(r => r.unidade === u)))) })), totRow])}
<h3>Por conta de pagamento</h3>
${grid(['Conta', ...cpHead], [...ORD.filter(k => cols.some(c => c.some(r => r.conta_pag === k))).map(k => ({ label: k, vals: cols.map(c => v(sum(c.filter(r => r.conta_pag === k)))) })), totRow])}
${fatAb.length ? `<p><b class="alert">⚠ Alerta:</b> faturas dos cartões PJ ainda não fechadas (vencimento dia 8), valor parcial: ${fatAb.map(f => `PJ ${f.cartao} ${brl(f.total)}`).join(' · ')}. Já estão incluídas acima, na conta que paga cada cartão.</p>` : ''}
${d.pagar_atraso.length ? `<p><b class="crit">● Crítico:</b> ${d.pagar_atraso.length > 1 ? `${d.pagar_atraso.length} contas vencidas e não baixadas na Nibo, total` : '1 conta vencida e não baixada na Nibo, de'} <b class="crit">${brl(sum(d.pagar_atraso))}</b>. ${d.pagar_atraso.length > 1 ? 'Se já foram pagas, enviar os comprovantes.' : 'Se já foi paga, enviar o comprovante.'}</p>` : ''}
<p class="muted">Lista completa, conta por conta: <a href="${links.cp}" target="_blank" rel="noopener">planilha de contas a pagar</a></p>

${sec('5. A receber e lançamentos a identificar')}
<p><b style="color:var(--pri)">A receber agendado até ${dbr(d.j2[1])}:</b> ${rec.length ? `<b class="pos">${brl(sum(rec))}</b> (${rec.length} parcela${rec.length > 1 ? 's' : ''})` : '<i class="muted">nenhum</i>'}</p>
<p><b style="color:var(--pri)">Lançamentos a identificar:</b> ${ni.length} itens, <b class="${ni.length ? 'crit' : 'pos'}">${brl(sum(ni))}</b>. Preencha o que é e a unidade de cada um na <a href="${links.ni}" target="_blank" rel="noopener">planilha de lançamentos a identificar</a>.</p>

${sec('6. Pendências')}
${`<div class="tw"><table><thead><tr><th>Responsável</th><th>Pendência</th></tr></thead><tbody>${pendRows.map(r => `<tr><td><b style="color:var(--pri)">${esc(r[0])}</b></td><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table></div>`}

${sec('7. Observações da equipe Aridus BPO')}
${(links.obs || []).map((t, i) => `<div class="obs"><div class="num">${i + 1}</div><div class="txt">${esc(t)}</div></div>`).join('')}

<footer>Relatório gerado pela Aridus BPO · Av. Dom Pedro II, 137 – Sala 07 – Sousa/PB · (83) 99138-8327 · aridusbpo@gmail.com | Documento confidencial preparado exclusivamente para o cliente indicado.</footer>
</div></body></html>`;
fs.writeFileSync(OUT, html);
console.log('HTML gerado:', OUT);
