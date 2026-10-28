// Relatório semanal DR Oral — padrão Aridus (skill relatorio-semanal-word-aridus)
// Uso: node gerar_relatorio.js dados.json links.json saida.docx
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ImageRun, Header, Footer, ShadingType, ExternalHyperlink, VerticalAlign,
} = require('docx');

const d = JSON.parse(fs.readFileSync(process.argv[2]));
const links = JSON.parse(fs.readFileSync(process.argv[3]));
const OUT = process.argv[4];
const logo = fs.readFileSync(__dirname + '/logo_final.png');

const PRIMARY = '2F5D50', PRIMARY_MED = '4C7566', ACCENT = 'B8934C', BG_TINT = 'F2F6F4', GOLD_TINT = 'FBF6E8';
const ROW_ALT = 'FAFBFA', BORDER = 'DCE4E1', TEXT = '2B2B2B', TEXT_MED = '6B7A76', WHITE = 'FFFFFF', RED = 'A8433D';
const FONT = 'Calibri';
const PW = 9360;

const brl = v => (v < 0 ? '-R$ ' : 'R$ ') + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dbr = s => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const dm = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dia = s => DIAS[new Date(s + 'T12:00:00Z').getUTCDay()];
const addDays = (s, n) => new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const sum = (a, f = x => x.valor) => Math.round(a.reduce((s, x) => s + f(x), 0) * 100) / 100;
const UN = { 'CAJAZEIRAS-PB': 'Cajazeiras', 'TRIUNFO-PB': 'Triunfo', 'OBRA': 'Obra', 'SÓCIOS': 'Sócios', 'Não identificado': 'Não identificado' };

const tr = (t, size = 11, color = TEXT, bold = false, italics = false) =>
  new TextRun({ text: t, size: Math.round(size * 2), color, bold, italics, font: FONT });
const para = (runs, opts = {}) => new Paragraph({ children: Array.isArray(runs) ? runs : [runs], ...opts });
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const line = (c, s = 4) => ({ style: BorderStyle.SINGLE, size: s, color: c });
const M = { top: 55, bottom: 55, left: 90, right: 60 };
const link = (text, url, size = 11) => new ExternalHyperlink({ link: url, children: [new TextRun({ text, size: size * 2, font: FONT, color: '1F5FA8', underline: {} })] });

function cell(children, { w, fill = WHITE, borders, align = AlignmentType.LEFT, span } = {}) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA }, columnSpan: span,
    shading: { fill, type: ShadingType.CLEAR, color: 'auto' },
    borders: borders || { top: line(BORDER), bottom: line(BORDER), left: none, right: none },
    margins: M, verticalAlign: VerticalAlign.CENTER,
    children: [para(children, { alignment: align })],
  });
}
const table = (rows, widths) => new Table({ width: { size: PW, type: WidthType.DXA }, columnWidths: widths, rows });
const gap = (after = 120) => para(tr(''), { spacing: { after } });

function secHead(label) {
  return [gap(160), table([new TableRow({ cantSplit: true, children: [new TableCell({
    width: { size: PW, type: WidthType.DXA }, shading: { fill: BG_TINT, type: ShadingType.CLEAR, color: 'auto' },
    borders: { left: line(PRIMARY, 16), bottom: line(ACCENT, 4), top: none, right: none },
    margins: { top: 70, bottom: 70, left: 140, right: 80 },
    children: [para(tr(label.toUpperCase(), 12, PRIMARY, true))],
  })] })], [PW]), gap(80)];
}
const note = t => para(tr(t, 9.5, TEXT_MED, false, true), { spacing: { after: 80 } });

function cards(items) {
  // items: {label, value, sub, color, highlight}
  const w = Math.floor(PW / items.length);
  return table([new TableRow({ cantSplit: true, children: items.map(it => new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: { fill: it.highlight ? GOLD_TINT : WHITE, type: ShadingType.CLEAR, color: 'auto' },
    borders: { top: line(it.highlight ? ACCENT : PRIMARY, 12), bottom: line(BORDER), left: line(BORDER), right: line(BORDER) },
    margins: { top: 90, bottom: 90, left: 100, right: 100 },
    children: [
      para(tr(it.label.toUpperCase(), 9, TEXT_MED, true), { alignment: AlignmentType.CENTER }),
      para(tr(it.value, 15, it.color || PRIMARY, true), { alignment: AlignmentType.CENTER, spacing: { before: 40, after: 30 } }),
      ...(it.sub ? [para(tr(it.sub, 8, TEXT_MED, false, true), { alignment: AlignmentType.CENTER })] : []),
    ],
  })) })], Array(items.length).fill(w));
}

function dataTable(headers, widths, rows, { totalLabel, totalValues, valueColors = [] } = {}) {
  const head = new TableRow({ cantSplit: true, tableHeader: true, children: headers.map((h, i) => cell([tr(h.toUpperCase(), 9.5, PRIMARY, true)], {
    w: widths[i], fill: BG_TINT, borders: { top: line(ACCENT), bottom: line(ACCENT), left: none, right: none },
    align: i >= headers.length - (totalValues ? totalValues.length : 1) ? AlignmentType.RIGHT : AlignmentType.LEFT })) });
  const body = rows.map((r, k) => {
    if (r.subtotal) {
      return new TableRow({ cantSplit: true, children: [
        cell([tr(r.subtotal, 10, PRIMARY_MED, true)], { w: widths.slice(0, -1).reduce((a, b) => a + b), span: widths.length - 1, fill: GOLD_TINT, align: AlignmentType.RIGHT }),
        cell([tr(r.value, 10, RED, true)], { w: widths[widths.length - 1], fill: GOLD_TINT, align: AlignmentType.RIGHT })] });
    }
    return new TableRow({ cantSplit: true, children: r.map((v, i) => {
      const isNum = valueColors[i] !== undefined;
      return cell([tr(v, 11, isNum && v !== '—' ? valueColors[i] : TEXT)], { w: widths[i], fill: k % 2 ? ROW_ALT : WHITE, align: isNum ? AlignmentType.RIGHT : AlignmentType.LEFT });
    }) });
  });
  const out = [head, ...body];
  if (totalLabel) {
    const n = totalValues.length, lw = widths.slice(0, widths.length - n).reduce((a, b) => a + b);
    const tb = { top: line(ACCENT, 8), bottom: line(ACCENT, 8), left: none, right: none };
    out.push(new TableRow({ cantSplit: true, children: [
      cell([tr(totalLabel, 11, PRIMARY, true)], { w: lw, span: widths.length - n, fill: BG_TINT, borders: tb, align: AlignmentType.RIGHT }),
      ...totalValues.map((tv, i) => cell([tr(tv.text, 11, tv.color || PRIMARY, true)], { w: widths[widths.length - n + i], fill: BG_TINT, borders: tb, align: AlignmentType.RIGHT }))] }));
  }
  return table(out, widths);
}

// ---------- números ----------
const contas = d.saldos.filter(s => s.liquidez);
const totalCaixa = sum(contas, s => s.saldo);
const nomeCurto = n => n.replace(/^\d+(\.\d+)?\.?\s*/, '').replace(/C\/C\s*/, '').replace(/\s+/g, ' ').trim();
const atualizado = s => s.openfinance ? `extrato sincronizado ${dm(s.sync)}` : `último lançamento ${dm(s.ult_mov)}`;
const units = d.units;
const byUnit = (rows) => units.map(u => ({ u, rows: rows.filter(r => r.unidade === u) })).filter(x => x.rows.length);
const ent = d.mov.filter(m => m.tipo === 'Entrada'), sai = d.mov.filter(m => m.tipo === 'Saída');
const totEnt = sum(ent), totSai = sum(sai);
const abertoAteSeg = d.pagar_atraso.concat(d.pagar_aberto);
const tJ1 = sum(d.pagar_j1), tJ2 = sum(d.pagar_j2), tAb = sum(abertoAteSeg);
const parcial = d.cutoff < d.ref;

const children = [];
children.push(para(tr('Relatório Semanal — DR Oral Clinic', 18, PRIMARY, true), { border: { bottom: line(ACCENT, 4) }, spacing: { after: 100 } }));
children.push(para([tr(`Semana de ${dbr(d.semana_completa[0])} a ${dbr(d.semana_completa[1])} · `, 10, TEXT_MED), tr(`dados da Nibo até ${dbr(d.cutoff)}`, 10, TEXT_MED, true)], { spacing: { after: 60 } }));
if (parcial) children.push(note(`Prévia: a semana ainda não terminou. A versão final é gerada na sexta-feira ${dbr(d.ref)}, às 17h.`));

// 1. Saldos
children.push(...secHead(`1. Saldos em conta em ${dbr(d.cutoff)}`));
const cofre = contas.filter(s => /Cofre|Caixa/i.test(s.conta));
const bancos = contas.filter(s => !/Cofre|Caixa/i.test(s.conta)).sort((a, b) => a.conta.localeCompare(b.conta));
const cardItems = bancos.map(s => ({ label: nomeCurto(s.conta).replace('Sicredi 09266-5', 'Sicredi').replace('Sicredi 09293-2', 'Sicredi'), value: brl(s.saldo), sub: atualizado(s) }));
cardItems.push({ label: 'Caixas e cofre', value: brl(sum(cofre, s => s.saldo)), sub: `último lançamento ${dm(cofre.map(s => s.ult_mov).sort().pop())}` });
children.push(cards(cardItems.slice(0, 3)), gap(60), cards(cardItems.slice(3)), gap(60));
children.push(cards([{ label: 'Total disponível', value: brl(totalCaixa), sub: `soma das contas acima · posição ${dbr(d.cutoff)}`, highlight: true }]));
const pend = d.saldos.filter(s => s.pend_qtd);
const fora = d.saldos.filter(s => !s.liquidez && Math.abs(s.saldo) > 0.004);
children.push(gap(40), note(`Saldos calculados na Nibo (saldo inicial + lançamentos). ${pend.length ? 'Ainda há movimentos do extrato aguardando lançamento: ' + pend.map(s => `${nomeCurto(s.conta)} (${s.pend_qtd}, líquido ${brl(s.pend_valor)})`).join('; ') + '. ' : ''}Fora do total: ${fora.map(s => `${nomeCurto(s.conta)} ${brl(s.saldo)}`).join(' · ')}.`));

// 2. Resumo
children.push(...secHead('2. Resumo: o que precisa estar na conta'));
const kw = [2340, 2340, 2340, 2340];
const kpiHead = ['Disponível hoje', `A pagar até seg ${dm(d.segunda_pagamento)}`, `Contas ${dm(d.j1[0])} a ${dm(d.j1[1])}`, `Contas ${dm(d.j2[0])} a ${dm(d.j2[1])}`];
const kpiSub = ['todas as contas', 'vencidos + 28/10 a 02/11'.replace('28/10', dm(d.cutoff)).replace('02/11', dm(d.segunda_pagamento)), `pagar na segunda ${dm(d.segunda_pagamento)}`, 'meta de faturamento da próxima semana'];
const kpiVal = [[brl(totalCaixa), PRIMARY], [brl(tAb), RED], [brl(tJ1), RED], [brl(tJ2), RED]];
children.push(table([
  new TableRow({ cantSplit: true, children: kpiHead.map((h, i) => cell([tr(h.toUpperCase(), 9, PRIMARY, true)], { w: kw[i], fill: i === 2 ? GOLD_TINT : BG_TINT, borders: { top: line(BORDER), bottom: line(BORDER), left: line(BORDER), right: line(BORDER) }, align: AlignmentType.CENTER })) }),
  new TableRow({ cantSplit: true, children: kpiVal.map((v, i) => new TableCell({ width: { size: kw[i], type: WidthType.DXA }, shading: { fill: i === 2 ? GOLD_TINT : WHITE, type: ShadingType.CLEAR, color: 'auto' },
    borders: { top: line(BORDER), bottom: line(BORDER), left: line(BORDER), right: line(BORDER) }, margins: M,
    children: [para(tr(v[0], 13, v[1], true), { alignment: AlignmentType.CENTER }), para(tr(kpiSub[i], 8, TEXT_MED, false, true), { alignment: AlignmentType.CENTER })] })) }),
], kw));
const fu = rows => byUnit(rows).map(x => `${UN[x.u]} ${brl(sum(x.rows))}`).join(' · ');
children.push(gap(60),
  para([tr('Segunda-feira ' + dbr(d.segunda_pagamento) + ': ', 11, PRIMARY, true), tr(`pagar as contas de ${dbr(d.j1[0])} a ${dbr(d.j1[1])}, total de ${brl(tJ1)} (${fu(d.pagar_j1)}).`)], { spacing: { after: 60 } }),
  para([tr(`Meta da próxima semana: `, 11, PRIMARY, true), tr(`faturar no mínimo ${brl(tJ2)} até a segunda ${dbr(addDays(d.j2[0], -1))}, para pagar as contas de ${dbr(d.j2[0])} a ${dbr(d.j2[1])} (${fu(d.pagar_j2)}).`)], { spacing: { after: 60 } }),
  para([tr('Ainda em aberto até ' + dbr(d.segunda_pagamento) + ': ', 11, PRIMARY, true), tr(`${brl(tAb)} (${fu(abertoAteSeg)})${d.pagar_atraso.length ? `, dos quais ${brl(sum(d.pagar_atraso))} já vencidos` : ''}.`)]),
);

// 3. Realizado
children.push(...secHead(`3. Realizado da semana (${dm(d.semana[0])} a ${dm(d.semana[1])})`));
const res = totEnt - totSai;
children.push(cards([
  { label: 'Total que entrou', value: brl(totEnt) }, { label: 'Total que saiu', value: brl(totSai), color: RED },
  { label: 'Resultado da semana', value: brl(res), color: res >= 0 ? PRIMARY : RED, highlight: true }]), gap(80));
const ruW = [3360, 2000, 2000, 2000];
const ru = units.map(u => { const e = sum(ent.filter(m => m.unidade === u)), s = sum(sai.filter(m => m.unidade === u)); return { u, e, s }; }).filter(x => x.e || x.s);
children.push(dataTable(['Unidade', 'Entradas', 'Saídas', 'Resultado'], ruW,
  ru.map(x => [UN[x.u], x.e ? brl(x.e) : '—', x.s ? brl(x.s) : '—', brl(x.e - x.s)]),
  { valueColors: [undefined, PRIMARY, RED, PRIMARY], totalLabel: 'TOTAL', totalValues: [{ text: brl(totEnt) }, { text: brl(totSai), color: RED }, { text: brl(res), color: res >= 0 ? PRIMARY : RED }] }));
children.push(gap(40), note('Transferências entre contas da própria clínica não entram como entrada nem saída. O detalhe de cada lançamento está na seção 9.'));

// 4/5. Contas a pagar por janela
function cpSection(titulo, rows, sub) {
  children.push(...secHead(titulo));
  children.push(note(sub));
  const w = [3360, 1500, 4500];
  const groups = byUnit(rows);
  children.push(dataTable(['Unidade', 'Itens', 'Valor'], [3360, 1500, 4500], groups.map(g => [UN[g.u], String(g.rows.length), brl(sum(g.rows))]),
    { valueColors: [undefined, TEXT, RED], totalLabel: 'TOTAL', totalValues: [{ text: String(rows.length), color: PRIMARY }, { text: brl(sum(rows)), color: RED }] }));
  const maiores = [...rows].sort((a, b) => b.valor - a.valor).slice(0, 5);
  if (maiores.length) {
    children.push(gap(60), para(tr('Maiores contas do período', 10, PRIMARY_MED, true), { spacing: { after: 40 } }));
    children.push(dataTable(['Venc.', 'Unidade', 'Fornecedor / descrição', 'Valor'], [1000, 1500, 4860, 2000],
      maiores.map(x => [`${dm(x.venc)} ${dia(x.venc)}`, UN[x.unidade], `${x.nome} — ${x.descricao.trim()}`, brl(x.valor)]), { valueColors: [undefined, undefined, undefined, RED] }));
  }
  children.push(gap(40), para([tr('Lista completa: ', 10, TEXT_MED), link('planilha de contas a pagar', links.cp, 10)]));
}
cpSection(`4. Contas a pagar — semana seguinte (${dm(d.j1[0])} a ${dm(d.j1[1])})`, d.pagar_j1, `Terça ${dbr(d.j1[0])} a segunda ${dbr(d.j1[1])} · pagamento antecipado na segunda ${dbr(d.segunda_pagamento)}`);
cpSection(`5. Contas a pagar — outra semana (${dm(d.j2[0])} a ${dm(d.j2[1])})`, d.pagar_j2, `Terça ${dbr(d.j2[0])} a segunda ${dbr(d.j2[1])} · valor mínimo a faturar na próxima semana`);

// 6. Em aberto até segunda + vencidos
children.push(...secHead(`6. Ainda em aberto até segunda ${dm(d.segunda_pagamento)}`));
children.push(note(`Contas vencidas e não baixadas, mais as que vencem de ${dbr(d.cutoff)} a ${dbr(d.segunda_pagamento)}.`));
children.push(dataTable(['Unidade', 'Itens', 'Valor'], [3360, 1500, 4500], byUnit(abertoAteSeg).map(g => [UN[g.u], String(g.rows.length), brl(sum(g.rows))]),
  { valueColors: [undefined, TEXT, RED], totalLabel: 'TOTAL', totalValues: [{ text: String(abertoAteSeg.length), color: PRIMARY }, { text: brl(tAb), color: RED }] }));
if (d.pagar_atraso.length) {
  children.push(gap(60), para(tr('Vencidas e não baixadas na Nibo', 10, RED, true), { spacing: { after: 40 } }));
  children.push(dataTable(['Venc.', 'Unidade', 'Fornecedor / descrição', 'Dias', 'Valor'], [1000, 1400, 4260, 700, 2000],
    d.pagar_atraso.map(x => [dm(x.venc), UN[x.unidade], `${x.nome} — ${x.descricao.trim()}`, String(Math.round((new Date(d.cutoff) - new Date(x.venc)) / 864e5)), brl(x.valor)]),
    { valueColors: [undefined, undefined, undefined, TEXT, RED] }));
}

// 7. A receber previsto
children.push(...secHead('7. A receber previsto'));
const rec = d.receber_j1.concat(d.receber_j2);
if (rec.length) {
  children.push(dataTable(['Prev.', 'Unidade', 'Pagador / descrição', 'Valor'], [1000, 1500, 4860, 2000],
    rec.map(x => [dm(x.venc), UN[x.unidade], `${x.nome} — ${x.descricao.trim()}`, brl(x.valor)]),
    { valueColors: [undefined, undefined, undefined, PRIMARY], totalLabel: 'TOTAL', totalValues: [{ text: brl(sum(rec)) }] }));
} else children.push(para(tr('Nenhum recebimento agendado na Nibo para os dois períodos.', 11, TEXT_MED, false, true)));
children.push(gap(40), note('A maior parte da receita da clínica entra no ato do atendimento e não fica agendada; por isso a meta de faturamento da seção 2 é o número de referência.'));

// 8. Não identificados
children.push(...secHead('8. Lançamentos não identificados'));
const ni = d.nao_identificados;
const grupos = [['Despesas', ni.filter(x => x.tipo.startsWith('Despesa'))], ['Receitas', ni.filter(x => x.tipo.startsWith('Receita'))]].filter(g => g[1].length);
children.push(dataTable(['Tipo', 'Quantidade', 'Valor'], [3360, 1500, 4500], grupos.map(g => [g[0], String(g[1].length), brl(sum(g[1]))]),
  { valueColors: [undefined, TEXT, TEXT] }));
children.push(gap(60), para([tr('Precisamos da sua ajuda: ', 11, PRIMARY, true), tr('abra a '), link('planilha de lançamentos a identificar', links.ni), tr(' e preencha, em cada linha, o que é e de qual unidade é (Cajazeiras, Triunfo, Obra ou Sócios). A Aridus atualiza a Nibo com as suas respostas.')]));

// 9. Movimentações
children.push(...secHead(`9. Movimentações da semana (${dm(d.semana[0])} a ${dm(d.semana[1])})`));
const mw = [820, 2300, 3040, 1600, 1600];
for (const g of byUnit(d.mov)) {
  children.push(para(tr(UN[g.u], 10.5, PRIMARY_MED, true), { spacing: { before: 80, after: 40 } }));
  const rows = [...g.rows].sort((a, b) => (a.tipo + a.data).localeCompare(b.tipo + b.data))
    .map(m => [dm(m.data), m.nome, (m.descricao || ''), m.tipo === 'Entrada' ? brl(m.valor) : '—', m.tipo === 'Saída' ? brl(m.valor) : '—']);
  children.push(dataTable(['Data', 'Nome', 'Descrição', 'Entrada', 'Saída'], mw, rows,
    { valueColors: [undefined, undefined, undefined, PRIMARY, RED], totalLabel: 'TOTAL ' + UN[g.u].toUpperCase(),
      totalValues: [{ text: brl(sum(g.rows.filter(m => m.tipo === 'Entrada'))) }, { text: brl(sum(g.rows.filter(m => m.tipo === 'Saída'))), color: RED }] }));
}

// 10. Pendências
children.push(...secHead('10. Pendências'));
const pendRows = [];
if (ni.length) pendRows.push(['Clínica', `Preencher a planilha de lançamentos a identificar (${ni.length} itens, ${brl(sum(ni))}).`]);
for (const x of d.pagar_atraso) pendRows.push(['Clínica / Aridus', `Confirmar se ${x.descricao.trim()} (${x.nome}, venc. ${dbr(x.venc)}, ${brl(x.valor)}) foi pago. Se foi, enviar o comprovante para baixa na Nibo.`]);
if (pend.length) pendRows.push(['Aridus BPO', `Lançar na Nibo os ${sum(pend, s => s.pend_qtd)} movimentos de extrato ainda pendentes (${pend.map(s => nomeCurto(s.conta)).join(', ')}).`]);
pendRows.push(['Clínica', 'Enviar notas, boletos e comprovantes novos da semana para lançamento.']);
const pw = [2100, PW - 2100];
children.push(table([
  new TableRow({ cantSplit: true, tableHeader: true, children: ['RESPONSÁVEL', 'PENDÊNCIA'].map((h, i) => cell([tr(h, 9.5, PRIMARY, true)], { w: pw[i], fill: BG_TINT, borders: { top: line(ACCENT), bottom: line(ACCENT), left: none, right: none } })) }),
  ...pendRows.map((r, k) => new TableRow({ cantSplit: true, children: [cell([tr(r[0], 11, PRIMARY, true)], { w: pw[0], fill: k % 2 ? ROW_ALT : WHITE }), cell([tr(r[1])], { w: pw[1], fill: k % 2 ? ROW_ALT : WHITE })] })),
], pw));

// 11. Observações
children.push(...secHead('11. Observações da equipe Aridus BPO'));
const obs = links.obs || [];
obs.forEach((t, i) => {
  children.push(table([new TableRow({ cantSplit: true, children: [
    new TableCell({ width: { size: 420, type: WidthType.DXA }, shading: { fill: BG_TINT, type: ShadingType.CLEAR, color: 'auto' }, borders: { top: line(BORDER), bottom: line(BORDER), left: none, right: none }, margins: M, verticalAlign: VerticalAlign.CENTER, children: [para(tr(String(i + 1), 12, PRIMARY, true), { alignment: AlignmentType.CENTER })] }),
    new TableCell({ width: { size: PW - 420, type: WidthType.DXA }, borders: { top: line(BORDER), bottom: line(BORDER), left: line(ACCENT, 10), right: none }, margins: { top: 70, bottom: 70, left: 140, right: 80 }, children: [para(tr(t))] }),
  ] })], [420, PW - 420]), gap(50));
});

const header = new Header({ children: [table([new TableRow({ children: [
  new TableCell({ width: { size: 1200, type: WidthType.DXA }, borders: { top: none, left: none, right: none, bottom: line(BORDER, 4) }, children: [para(new ImageRun({ data: logo, transformation: { width: 58, height: 51 }, type: 'png' }))] }),
  new TableCell({ width: { size: PW - 1200, type: WidthType.DXA }, borders: { top: none, left: none, right: none, bottom: line(BORDER, 4) }, verticalAlign: VerticalAlign.CENTER, children: [
    para([tr('RELATÓRIO SEMANAL ', 14, PRIMARY, true), tr('— Fluxo de Caixa & Previsões', 11, ACCENT, false, true)], { alignment: AlignmentType.RIGHT }),
    para(tr(`DR Oral Clinic | Atualizado em ${dbr(d.cutoff)}`, 9, TEXT_MED, false, true), { alignment: AlignmentType.RIGHT })] }),
] })], [1200, PW - 1200])] });
const footer = new Footer({ children: [para([
  tr('Relatório gerado pela Aridus BPO · Av. Dom Pedro II, 137 – Sala 07 – Sousa/PB · (83) 99138-8327 · aridusbpo@gmail.com', 8, TEXT_MED),
  tr(' | Documento confidencial preparado exclusivamente para o cliente indicado.', 8, '999999')], { border: { top: line(BORDER, 2) }, spacing: { before: 60 } })] });

const doc = new Document({ styles: { default: { document: { run: { font: FONT, size: 22 } } } },
  sections: [{ properties: { page: { margin: { top: 700, bottom: 700, left: 1260, right: 1260 } } }, headers: { default: header }, footers: { default: footer }, children }] });
Packer.toBuffer(doc).then(b => { fs.writeFileSync(OUT, b); console.log('Gerado com sucesso!'); });
