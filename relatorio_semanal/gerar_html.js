// Relatório semanal DR Oral em HTML interativo (arquivo único).
// Página inicial = resumo com totais; cada valor sublinhado abre uma janela com os lançamentos que o compõem.
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
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
const rec = d.receber_atraso.concat(d.receber_j1, d.receber_j2);
const ni = d.nao_identificados;
const fatAb = d.faturas.filter(f => !f.fechada);

// ---- detalhes: cada janela recebe uma chave; o navegador mostra a lista ao clicar ----
const DET = {};
let nDet = 0;
const vencidos = new Set(d.pagar_atraso.map(r => r.id));
const FAT = {};
d.faturas.forEach(f => {
  FAT[f.cartao + f.venc] = det(`Fatura Cartão PJ ${f.cartao} — venc. ${dm(f.venc)}`, f.itens.map(i => ({ ...i, conta_pag: `Cartão PJ ${f.cartao}` })), 'fat',
    f.fechada ? 'Fatura fechada.' : 'Fatura ainda não fechada: valor parcial, soma das compras lançadas até agora.');
});
function slim(r, kind) {
  const o = { d: r.venc || r.data || '', u: UN[r.unidade] || r.unidade || '', n: r.nome || '', x: r.descricao || '', c: r.categoria || '', v: r.valor };
  if (kind === 'pagar') { o.a = r.conta_pag || ''; if (vencidos.has(r.id)) o.t = 'vencido'; if (r.cartao) { o.f = FAT[r.cartao + r.venc]; if (r.fatura_aberta) o.t = 'fatura parcial'; } }
  if (kind === 'mov') { o.a = nomeCurto(r.conta || ''); o.t = r.tipo === 'Entrada' ? 'entrada' : 'saída'; }
  if (kind === 'fat') o.a = r.origem || '';
  if (kind === 'ni') { o.a = nomeCurto(r.conta || ''); o.t = (r.tipo || '').toLowerCase(); o.c = r.motivo || ''; }
  if (kind === 'rec') o.t = 'a receber';
  return o;
}
function det(title, rows, kind = 'pagar', nota = '') {
  if (!rows.length) return null;
  const k = 'd' + (++nDet);
  DET[k] = { title, nota, kind, rows: rows.map(r => slim(r, kind)).sort((a, b) => a.d.localeCompare(b.d) || b.v - a.v) };
  return k;
}
const kAttr = k => (k ? ` data-k="${k}" tabindex="0" role="button"` : '');

const card = (label, value, sub, c, hl, k) => `<div class="card${hl ? ' hl' : ''}${k ? ' clk' : ''}"${kAttr(k)}><div class="lbl">${esc(label)}</div><div class="val ${c}">${esc(value)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}${k ? '<div class="more">ver detalhes ›</div>' : ''}</div>`;
const sec = t => `<h2>${esc(t)}</h2>`;
function grid(headers, rows) {
  return `<div class="tw"><table><thead><tr>${headers.map((h, i) => `<th${i ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r => `<tr${r.total ? ' class="tot"' : ''}><td>${esc(r.label)}</td>${r.vals.map(v => `<td class="n ${v.c || ''}${v.b ? ' b' : ''}"${kAttr(v.k)}>${v.k ? `<span class="lk">${esc(v.t)}</span>` : esc(v.t)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const lk = (text, k, c = '') => (k ? `<span class="lk ${c}"${kAttr(k)}>${esc(text)}</span>` : `<span class="${c}">${esc(text)}</span>`);

const cols = [abertoAteSeg, d.pagar_j1, d.pagar_j2];
const cpHead = [`Até seg ${dm(d.segunda_pagamento)}`, `${dm(d.j1[0])} a ${dm(d.j1[1])}`, `${dm(d.j2[0])} a ${dm(d.j2[1])}`];
const cpTit = [`A pagar até seg ${dm(d.segunda_pagamento)} (vencidos + até ${dm(d.segunda_pagamento)})`, `Contas de ${dm(d.j1[0])} a ${dm(d.j1[1])} (pagar seg ${dm(d.segunda_pagamento)})`, `Contas de ${dm(d.j2[0])} a ${dm(d.j2[1])}`];
const kCol = cols.map((c, i) => det(cpTit[i], c));
const v = (rows, title) => { const x = sum(rows); return { t: x ? brl(x) : '—', c: x ? 'alert' : 'muted', k: x ? det(title, rows) : null }; };
const totRow = { label: 'Total', total: true, vals: cols.map((c, i) => ({ t: brl(sum(c)), c: 'alert', k: kCol[i] })) };
const ORD = ['Sicredi 33', 'Sicredi 88', 'Sicredi 95', 'Nubank Dra. Rayssa', 'Nubank Dr. Deusdedit', 'Caixa / espécie', 'Conta não informada'];
const nec = require('./necessidade')(d, ORD);
const segJ2 = addDays(d.j2[0], -1);
const ok = { t: 'coberto', c: 'pos', b: 1 };
const sobras = nec.rows.filter(r => r.saldo !== null && r.sobraFinal > 0.004);
const semConta = nec.rows.find(r => r.conta === 'Conta não informada');
const ateJ1 = abertoAteSeg.concat(d.pagar_j1);
const ru = units.map(u => { const e = ent.filter(m => m.unidade === u), s = sai.filter(m => m.unidade === u); return { u, e, s, te: sum(e), ts: sum(s) }; }).filter(x => x.te || x.ts);
const movConta = re => d.mov.filter(m => re.test(m.conta));

const pendRows = [];
if (ni.length) pendRows.push(['Clínica', `Preencher a planilha de lançamentos a identificar (${ni.length} itens, ${brl(sum(ni))}).`]);
if (d.pagar_atraso.length) pendRows.push(['Clínica', (d.pagar_atraso.length > 1 ? `Confirmar o pagamento das ${d.pagar_atraso.length} contas vencidas e não baixadas (` : 'Confirmar o pagamento da conta vencida e não baixada (') + `${brl(sum(d.pagar_atraso))}, detalhe na planilha de contas a pagar) e enviar o comprovante.`]);
pendRows.push(['Clínica', 'Enviar notas, boletos e comprovantes novos da semana para lançamento.']);

// ---- corpo ----
const bancoCards = bancos.map(s => {
  const m = d.mov.filter(x => x.conta === s.conta);
  return card(nomeCurto(s.conta).replace(/Sicredi \d{5}-\d/, 'Sicredi'), brl(s.saldo), atualizado(s), cls(s.saldo), false, det(`Movimentos da semana — ${nomeCurto(s.conta)}`, m, 'mov', `Saldo da conta em ${dm(d.cutoff)}: ${brl(s.saldo)}. Abaixo, só o que entrou e saiu nesta semana.`));
}).join('') + card('Caixas e cofre', brl(sum(cofre, s => s.saldo)), `último lançamento ${dm(cofre.map(s => s.ult_mov).sort().pop())}`, 'pos', false, det('Movimentos da semana — caixas e cofre', movConta(/Cofre|Caixa/i), 'mov', `Saldo de caixas e cofre em ${dm(d.cutoff)}: ${brl(sum(cofre, s => s.saldo))}. Abaixo, só o que entrou e saiu nesta semana.`));

// fluxo de caixa por conta, semana a semana (um cartão por conta)
const fluxo = nec.rows.map(r => {
  const de = rows => rows.filter(x => x.conta_pag === r.conta);
  const kAb = det(`${r.conta} — vencidos + até seg ${dm(d.segunda_pagamento)}`, de(abertoAteSeg));
  const kJ1 = det(`${r.conta} — contas de ${dm(d.j1[0])} a ${dm(d.j1[1])}`, de(d.pagar_j1));
  const kJ2 = det(`${r.conta} — contas de ${dm(d.j2[0])} a ${dm(d.j2[1])}`, de(d.pagar_j2));
  const kF1 = r.falta1 ? det(`${r.conta} — falta até ${dm(d.j1[1])}`, de(d.pagar_j1), 'pagar', `Falta ${brl(r.falta1)} = contas de ${dm(d.j1[0])} a ${dm(d.j1[1])} (${brl(r.j1)}) − saldo provisionado (${brl(r.prov1)}). Precisa entrar na conta até a segunda ${dm(d.segunda_pagamento)}.`) : null;
  const kF2 = r.faturar ? det(`${r.conta} — falta até ${dm(d.j2[1])}`, de(d.pagar_j2), 'pagar', `Falta ${brl(r.faturar)} = contas de ${dm(d.j2[0])} a ${dm(d.j2[1])} (${brl(r.pagar2)}) − saldo provisionado (${brl(r.prov2)}). Meta de faturamento da conta até a segunda ${dm(segJ2)}.`) : null;
  const ln = (l, val, c, k, x = '') => `<div class="fl ${x}"><span>${l}</span>${val === null ? '<b class="muted">—</b>' : `<b class="${c}${k ? ' lk' : ''}"${kAttr(k)}>${esc(val)}</b>`}</div>`;
  const neg = v => (v ? brl(v) : '—');
  return `<div class="fx${r.falta1 || r.faturar ? ' falta' : ''}"><div class="fxh">${esc(r.conta)}</div>
${ln('Saldo hoje', r.saldo === null ? null : brl(r.saldo), r.saldo === null ? '' : cls(r.saldo), null, 'st')}
${ln(`(−) Vencidos + até seg ${dm(d.segunda_pagamento)}`, neg(r.aberto), r.aberto ? 'alert' : 'muted', kAb)}
${ln(`= Saldo para ${dm(d.j1[0])} a ${dm(d.j1[1])}`, brl(r.prov1), r.prov1 < 0 ? 'crit' : 'pos', null, 'st')}
${ln(`(−) Contas ${dm(d.j1[0])} a ${dm(d.j1[1])}`, neg(r.j1), r.j1 ? 'alert' : 'muted', kJ1)}
${ln(`FALTA até ${dm(d.j1[1])} <small>depositar até ${dm(d.segunda_pagamento)}</small>`, r.falta1 ? brl(r.falta1) : '✔ coberto', r.falta1 ? 'crit' : 'pos', kF1, 'fz')}
${ln(`= Saldo para ${dm(d.j2[0])} a ${dm(d.j2[1])}`, brl(r.prov2), 'pos', null, 'st')}
${ln(`(−) Contas ${dm(d.j2[0])} a ${dm(d.j2[1])}`, neg(r.pagar2), r.pagar2 ? 'alert' : 'muted', kJ2)}
${ln(`FALTA até ${dm(d.j2[1])} <small>faturar até ${dm(segJ2)}</small>`, r.faturar ? brl(r.faturar) : '✔ coberto', r.faturar ? 'alert' : 'pos', kF2, 'fz')}
</div>`;
}).join('');

const body = `
<header><img src="data:image/png;base64,${logo}" alt="Aridus BPO"><div class="t"><b>RELATÓRIO SEMANAL</b> <i>— Fluxo de Caixa &amp; Previsões</i><div>DR Oral Clinic | Atualizado em ${dbr(d.cutoff)}</div></div></header>
<h1>Relatório Semanal — DR Oral Clinic</h1>
<div class="meta">Semana de ${dbr(d.semana_completa[0])} a ${dbr(d.semana_completa[1])} · <b>dados da Nibo até ${dbr(d.cutoff)}</b></div>
${d.cutoff < d.ref ? `<div class="note">Prévia: a semana ainda não terminou. A versão final é gerada na sexta-feira ${dbr(d.ref)}, às 17h.</div>` : ''}
<div class="legend"><span class="pos">■ positivo</span><span class="alert">■ alerta</span><span class="crit">■ crítico</span></div>
<div class="hint">👆 Toque em qualquer valor <span class="lk">sublinhado</span> ou cartão com “ver detalhes” para abrir os lançamentos. Use “Voltar” para retornar ao resumo.</div>

${sec(`1. Saldos em conta em ${dbr(d.cutoff)}`)}
<div class="cards">${bancoCards}</div>
<div class="cards">${card('Total disponível', brl(totalCaixa), 'soma das contas acima (sem a obra)', cls(totalCaixa), true)}${obra ? card('Obra — separado', brl(obra.saldo), `reservado dentro da Sicredi 88 · no banco a 88 soma ${brl(s88.saldo + obra.saldo)}`, 'crit') : ''}</div>
<div class="note">Fora do total: ${fora.map(s => `${esc(nomeCurto(s.conta))} ${brl(s.saldo)}`).join(' · ')}.${pend.length ? ` Há ${sum(pend, s => s.pend_qtd)} movimentos de extrato ainda em lançamento.` : ''}</div>

${sec('2. Resumo: o que precisa estar na conta')}
<div class="cards kpi">${card('Disponível hoje', brl(totalCaixa), 'sem a obra', cls(totalCaixa))}${card(`A pagar até seg ${dm(d.segunda_pagamento)}`, brl(tAb), `vencidos + até ${dm(d.segunda_pagamento)}`, 'alert', false, kCol[0])}${card(`Contas ${dm(d.j1[0])} a ${dm(d.j1[1])}`, brl(tJ1), `pagar na segunda ${dm(d.segunda_pagamento)}` + (d.pagar_j1.some(r => r.fatura_aberta) ? ' · com faturas de cartão parciais' : ''), 'alert', true, kCol[1])}${card(`Contas ${dm(d.j2[0])} a ${dm(d.j2[1])}`, brl(tJ2), 'meta de faturamento · por conta abaixo', 'alert', false, kCol[2])}</div>
<h3>Fluxo de caixa por conta: quanto falta em cada semana</h3>
<div class="fxs">${fluxo}</div>
<div class="fxt"><div>Total que falta até ${dm(d.j1[1])} <small>(depositar até seg ${dm(d.segunda_pagamento)})</small> <b class="crit">${brl(nec.tot('falta1'))}</b></div><div>Total que falta até ${dm(d.j2[1])} <small>(faturar até seg ${dm(segJ2)})</small> <b class="alert">${brl(nec.tot('faturar'))}</b></div></div>
<div class="note">Como ler: o saldo de hoje paga primeiro o que vence até ${dm(d.segunda_pagamento)}; o que sobra é o saldo provisionado para as contas de ${dm(d.j1[0])} a ${dm(d.j1[1])}, pagas antecipadamente na segunda ${dm(d.segunda_pagamento)}. Se não cobrir, a FALTA precisa entrar na conta até essa segunda. O que sobrar passa para as contas de ${dm(d.j2[0])} a ${dm(d.j2[1])}, e a FALTA dessa semana é a meta de faturamento da conta até a segunda ${dm(segJ2)}. A sobra de uma conta não cobre a outra: só vale se houver transferência.</div>
${sobras.length ? `<p><b class="pos">✔ Contas com sobra depois dos pagamentos:</b> ${sobras.map(r => `${esc(r.conta)} ${brl(r.sobraFinal)}`).join(' · ')}.</p>` : ''}
${semConta ? `<p><b class="alert">⚠ Alerta:</b> ${lk(brl(semConta.pagar + semConta.pagar2), det('Contas sem conta de pagamento definida na Nibo', ateJ1.concat(d.pagar_j2).filter(x => x.conta_pag === 'Conta não informada')), 'b')} em contas sem conta de pagamento definida na Nibo. Enquanto não for definida, o valor entra inteiro como falta.</p>` : ''}

${sec(`3. Realizado da semana (${dm(d.semana[0])} a ${dm(d.semana[1])})`)}
<div class="cards">${card('Total que entrou', brl(totEnt), '', 'pos', false, det('Entradas da semana', ent, 'mov'))}${card('Total que saiu', brl(totSai), '', 'alert', false, det('Saídas da semana', sai, 'mov'))}${card('Resultado da semana', brl(res), '', cls(res), true, det('Todos os movimentos da semana', d.mov, 'mov'))}</div>
${grid(['Unidade', 'Entradas', 'Saídas', 'Resultado'], [
  ...ru.map(x => ({ label: UN[x.u], vals: [
    { t: x.te ? brl(x.te) : '—', c: x.te ? 'pos' : 'muted', k: det(`Entradas da semana — ${UN[x.u]}`, x.e, 'mov') },
    { t: x.ts ? brl(x.ts) : '—', c: x.ts ? 'alert' : 'muted', k: det(`Saídas da semana — ${UN[x.u]}`, x.s, 'mov') },
    { t: brl(x.te - x.ts), c: cls(x.te - x.ts), k: det(`Movimentos da semana — ${UN[x.u]}`, x.e.concat(x.s), 'mov') }] })),
  { label: 'Total', total: true, vals: [{ t: brl(totEnt), c: 'pos', k: det('Entradas da semana', ent, 'mov') }, { t: brl(totSai), c: 'alert', k: det('Saídas da semana', sai, 'mov') }, { t: brl(res), c: cls(res) }] }])}

${sec('4. Contas a pagar — totais')}
<h3>Por unidade</h3>
${grid(['Unidade', ...cpHead], [...units.filter(u => cols.some(c => c.some(r => r.unidade === u))).map(u => ({ label: UN[u], vals: cols.map((c, i) => v(c.filter(r => r.unidade === u), `${UN[u]} — ${cpTit[i]}`)) })), totRow])}
<h3>Por conta de pagamento</h3>
${grid(['Conta', ...cpHead], [...ORD.filter(k => cols.some(c => c.some(r => r.conta_pag === k))).map(k => ({ label: k, vals: cols.map((c, i) => v(c.filter(r => r.conta_pag === k), `${k} — ${cpTit[i]}`)) })), totRow])}
${fatAb.length ? `<p><b class="alert">⚠ Alerta:</b> faturas dos cartões PJ ainda não fechadas, valor parcial: ${fatAb.map(f => `PJ ${f.cartao} (venc. ${dm(f.venc)}) ${lk(brl(f.total), FAT[f.cartao + f.venc])}`).join(' · ')}. Já estão incluídas acima, na conta que paga cada cartão.</p>` : ''}
${d.pagar_atraso.length ? `<p><b class="crit">● Crítico:</b> ${d.pagar_atraso.length > 1 ? `${d.pagar_atraso.length} contas vencidas e não baixadas na Nibo, total` : '1 conta vencida e não baixada na Nibo, de'} ${lk(brl(sum(d.pagar_atraso)), det('Contas vencidas e não baixadas na Nibo', d.pagar_atraso), 'crit b')}. ${d.pagar_atraso.length > 1 ? 'Se já foram pagas, enviar os comprovantes.' : 'Se já foi paga, enviar o comprovante.'}</p>` : ''}
<p class="muted">Lista completa, conta por conta: <a href="${links.cp}" target="_blank" rel="noopener">planilha de contas a pagar</a></p>

${sec('5. A receber e lançamentos a identificar')}
<p><b style="color:var(--pri)">A receber agendado até ${dbr(d.j2[1])}:</b> ${rec.length ? `${lk(brl(sum(rec)), det(`A receber agendado até ${dm(d.j2[1])}`, rec, 'rec'), 'pos b')} (${rec.length} parcela${rec.length > 1 ? 's' : ''})` : '<i class="muted">nenhum</i>'}</p>
${rec.length ? grid(['Unidade', 'A receber'], units.filter(u => rec.some(r => r.unidade === u)).map(u => { const rr = rec.filter(r => r.unidade === u); return { label: UN[u], vals: [{ t: brl(sum(rr)), c: 'pos', k: det(`A receber — ${UN[u]}`, rr, 'rec') }] }; })) : ''}
<p><b style="color:var(--pri)">Lançamentos a identificar:</b> ${ni.length} itens, ${lk(brl(sum(ni)), det('Lançamentos a identificar', ni, 'ni'), `${ni.length ? 'crit' : 'pos'} b`)}. Preencha o que é e a unidade de cada um na <a href="${links.ni}" target="_blank" rel="noopener">planilha de lançamentos a identificar</a>.</p>

${sec('6. Pendências')}
${`<div class="tw"><table><thead><tr><th>Responsável</th><th>Pendência</th></tr></thead><tbody>${pendRows.map(r => `<tr><td><b style="color:var(--pri)">${esc(r[0])}</b></td><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table></div>`}

${sec('7. Observações da equipe Aridus BPO')}
${(links.obs || []).map((t, i) => `<div class="obs"><div class="num">${i + 1}</div><div class="txt">${esc(t)}</div></div>`).join('')}

<footer>Relatório gerado pela Aridus BPO · Av. Dom Pedro II, 137 – Sala 07 – Sousa/PB · (83) 99138-8327 · aridusbpo@gmail.com | Documento confidencial preparado exclusivamente para o cliente indicado.</footer>`;

// ---- script do navegador: abre/fecha a janela de detalhe pelo #hash (o botão voltar do celular também funciona) ----
const client = `
const DET = ${JSON.stringify(DET).replace(/</g, '\\u003c')};
const brl = v => (v < 0 ? '-R$ ' : 'R$ ') + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dm = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '';
const ov = document.getElementById('ov'), box = document.getElementById('ovb');
let depth = 0, scrollY = 0;
function abrir(k) { if (!DET[k]) return; depth++; location.hash = k; }
function voltar() { if (depth > 0) { depth--; history.back(); } else location.hash = ''; }
function render() {
  const k = location.hash.slice(1), D = DET[k];
  if (!D) { if (ov.classList.contains('on')) { ov.classList.remove('on'); document.body.classList.remove('lock'); window.scrollTo(0, scrollY); } depth = 0; return; }
  if (!ov.classList.contains('on')) { scrollY = window.scrollY; }
  const tot = D.rows.reduce((s, r) => s + r.v, 0);
  const qt = D.rows.length + (D.rows.length > 1 ? ' lançamentos' : ' lançamento');
  let resumo = qt + ' · total <b>' + brl(tot) + '</b>';
  if (D.kind === 'mov') {
    const e = D.rows.filter(r => r.t === 'entrada').reduce((s, r) => s + r.v, 0), sa = D.rows.filter(r => r.t === 'saída').reduce((s, r) => s + r.v, 0);
    resumo = qt + (e && sa ? ' · entradas <b>' + brl(e) + '</b> · saídas <b>' + brl(sa) + '</b> · resultado <b>' + brl(e - sa) + '</b>' : (e ? ' · entradas <b>' + brl(e) : ' · saídas <b>' + brl(sa)) + '</b>');
  }
  box.innerHTML = '<div class="ovh"><button class="bk" onclick="voltar()">‹ Voltar</button><div><div class="ovt">' + esc(D.title) + '</div><div class="ovs">' + resumo + '</div></div></div>' +
    (D.nota ? '<div class="ovn">' + esc(D.nota) + '</div>' : '') +
    '<div class="items">' + D.rows.map(r => '<div class="it"><div class="r1"><span class="nm">' + esc(r.n || r.x) + '</span><span class="vl ' + (r.t === 'entrada' || r.t === 'a receber' || r.t === 'receita' ? 'pos' : 'alert') + '">' + brl(r.v) + '</span></div>' +
      '<div class="r2">' + [dm(r.d), r.u, r.a].filter(Boolean).map(esc).join(' · ') + (r.t ? ' <span class="tag t-' + esc(r.t.replace(/\\s/g, '-')) + '">' + esc(r.t) + '</span>' : '') + '</div>' +
      (r.n && r.x ? '<div class="r3">' + esc(r.x) + '</div>' : '') + (r.c ? '<div class="r4">' + esc(r.c) + '</div>' : '') +
      (r.f ? '<button class="sub-lk" onclick="abrir(\\'' + r.f + '\\')">ver compras desta fatura ›</button>' : '') + '</div>').join('') + '</div>';
  ov.classList.add('on'); document.body.classList.add('lock'); ov.scrollTop = 0;
}
document.addEventListener('click', e => { const t = e.target.closest('[data-k]'); if (t) abrir(t.dataset.k); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('on')) voltar(); const t = e.target.closest && e.target.closest('[data-k]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(t.dataset.k); } });
ov.addEventListener('click', e => { if (e.target === ov) voltar(); });
window.addEventListener('hashchange', render);
if (location.hash) { history.replaceState(null, '', location.pathname); }
`;

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório Semanal DR Oral</title>
<style>
:root{--pri:#2F5D50;--pri2:#4C7566;--acc:#B8934C;--tint:#F2F6F4;--gold:#FBF6E8;--alt:#FAFBFA;--bd:#DCE4E1;--tx:#2B2B2B;--mut:#6B7A76;--pos:#2E7D4F;--alert:#A8433D;--crit:#C9731E;--link:#1F5FA8;--bg:#FFFFFF}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.5 Calibri,"Segoe UI",Arial,sans-serif}
body.lock{overflow:hidden}
.page{max-width:900px;margin:0 auto;padding:24px 16px 40px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--bd);padding-bottom:10px}
header img{height:52px}header .t{text-align:right}header .t b{color:var(--pri);font-size:18px}header .t i{color:var(--acc)}header .t div{color:var(--mut);font-size:12px;font-style:italic}
h1{color:var(--pri);font-size:24px;margin:18px 0 4px;border-bottom:2px solid var(--acc);padding-bottom:6px}
.meta{color:var(--mut);font-size:13px}.note{color:var(--mut);font-size:13px;font-style:italic;margin:6px 0}
.legend span{font-weight:700;margin-right:10px;font-size:12px}
.hint{background:var(--gold);border:1px solid #EADBB5;border-radius:8px;padding:8px 12px;margin:12px 0;font-size:13px}
h2{background:var(--tint);border-left:5px solid var(--pri);border-bottom:1px solid var(--acc);color:var(--pri);font-size:15px;text-transform:uppercase;padding:8px 12px;margin:28px 0 12px}
h3{color:var(--pri2);font-size:14px;margin:16px 0 6px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:10px 0}
.card{border:1px solid var(--bd);border-top:3px solid var(--pri);padding:10px;text-align:center;background:#fff;border-radius:6px}.card.hl{background:var(--gold);border-top-color:var(--acc)}
.card.clk{cursor:pointer;transition:transform .12s,box-shadow .12s}.card.clk:hover,.card.clk:focus{transform:translateY(-2px);box-shadow:0 4px 12px rgba(47,93,80,.18);outline:none}
.more{font-size:11px;color:var(--link);font-weight:700;margin-top:4px}
.lbl{font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase}.val{font-size:22px;font-weight:700;margin:4px 0}.sub{font-size:11px;font-style:italic;color:var(--mut)}
.pos{color:var(--pos)}.alert{color:var(--alert)}.crit{color:var(--crit)}.muted{color:var(--mut)}
.b{font-weight:700}
.lk{text-decoration:underline dotted;text-underline-offset:3px;cursor:pointer}
td[data-k]{cursor:pointer}td[data-k]:hover,td[data-k]:focus{background:var(--gold);outline:none}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}
th{background:var(--tint);color:var(--pri);font-size:11px;text-transform:uppercase;text-align:left;padding:7px 8px;border-top:1px solid var(--acc);border-bottom:1px solid var(--acc)}
td{padding:7px 8px;border-bottom:1px solid var(--bd)}tbody tr:nth-child(even){background:var(--alt)}.n{text-align:right;white-space:nowrap}
tr.tot td{background:var(--tint);font-weight:700;color:var(--pri);border-top:2px solid var(--acc);border-bottom:2px solid var(--acc)}tr.tot td.alert{color:var(--alert)}tr.tot td.pos{color:var(--pos)}tr.tot td.crit{color:var(--crit)}
.kpi .card .val{font-size:19px}p{margin:8px 0}a{color:var(--link)}
.obs{display:flex;border-top:1px solid var(--bd);border-bottom:1px solid var(--bd);margin:8px 0}.obs .num{background:var(--tint);color:var(--pri);font-weight:700;min-width:36px;display:flex;align-items:center;justify-content:center}.obs .txt{border-left:3px solid var(--acc);padding:8px 12px}
.fxs{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin:10px 0}
.fx{border:1px solid var(--bd);border-top:3px solid var(--pos);border-radius:6px;background:#fff;font-size:13.5px}.fx.falta{border-top-color:var(--crit)}
.fxh{background:var(--tint);color:var(--pri);font-weight:700;padding:6px 10px;text-transform:uppercase;font-size:12.5px}
.fl{display:flex;justify-content:space-between;gap:8px;padding:4px 10px;border-bottom:1px solid var(--alt)}.fl b{white-space:nowrap}.fl small{color:var(--mut);font-weight:400;display:block;font-size:11px}
.fl.st{background:var(--alt);font-weight:700;color:var(--pri)}.fl.fz{background:var(--gold);font-weight:700}
.fxt{display:flex;flex-wrap:wrap;gap:8px 24px;background:var(--gold);border:1px solid #EADBB5;border-radius:6px;padding:8px 12px;font-weight:700;color:var(--pri)}.fxt small{font-weight:400;color:var(--mut)}
footer{margin-top:32px;border-top:1px solid var(--bd);padding-top:8px;font-size:11px;color:var(--mut)}
#ov{position:fixed;inset:0;background:rgba(30,45,40,.45);display:none;z-index:10;overflow-y:auto;padding:24px 12px}
#ov.on{display:block}
#ovb{max-width:720px;margin:0 auto;background:#fff;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.25);overflow:hidden;animation:up .18s ease-out}
@keyframes up{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}
.ovh{position:sticky;top:0;display:flex;gap:12px;align-items:center;background:var(--pri);color:#fff;padding:12px 14px}
.bk{background:#fff;color:var(--pri);border:0;border-radius:18px;padding:7px 14px;font:700 14px Calibri,"Segoe UI",Arial,sans-serif;cursor:pointer;white-space:nowrap}
.ovt{font-weight:700;font-size:16px;line-height:1.25}.ovs{font-size:13px;opacity:.9}
.ovn{background:var(--gold);color:var(--tx);font-size:13px;padding:8px 14px;border-bottom:1px solid var(--bd)}
.items{padding:4px 14px 14px}
.it{border-bottom:1px solid var(--bd);padding:10px 0}
.r1{display:flex;justify-content:space-between;gap:10px;align-items:baseline}.nm{font-weight:700}.vl{font-weight:700;white-space:nowrap}
.r2{font-size:12.5px;color:var(--mut);margin-top:2px}.r3{font-size:13.5px;margin-top:2px}.r4{font-size:12px;color:var(--pri2);font-style:italic}
.tag{display:inline-block;font-size:11px;font-weight:700;border-radius:10px;padding:0 7px;margin-left:4px;background:var(--tint);color:var(--pri)}
.t-vencido{background:#FCEFE3;color:var(--crit)}.t-fatura-parcial,.t-saída,.t-despesa{background:#FBEDEC;color:var(--alert)}.t-entrada,.t-a-receber,.t-receita{background:#E8F3EC;color:var(--pos)}
.sub-lk{margin-top:6px;background:none;border:1px solid var(--link);color:var(--link);border-radius:14px;padding:3px 10px;font:700 12px Calibri,"Segoe UI",Arial,sans-serif;cursor:pointer}
@media (max-width:560px){#ov{padding:0}#ovb{border-radius:0;min-height:100%}}
@media print{.page{padding:0}h2{break-after:avoid}.card,.obs,tr{break-inside:avoid}.hint,#ov{display:none}.lk{text-decoration:none}.more{display:none}}
</style></head><body><div class="page">${body}
</div>
<div id="ov" aria-modal="true" role="dialog"><div id="ovb"></div></div>
<script>${client}</script>
</body></html>`;
fs.writeFileSync(OUT, html);
console.log('HTML gerado:', OUT, '·', nDet, 'janelas de detalhe');
