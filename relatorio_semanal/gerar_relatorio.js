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
    children: [para(children, { alignment: align, keepNext: true })],
  });
}
const table = (rows, widths) => new Table({ width: { size: PW, type: WidthType.DXA }, columnWidths: widths, rows });
const gap = (after = 120) => para(tr(''), { spacing: { after } });

function secHead(label) {
  // parágrafo (não tabela) para o título ficar sempre junto do conteúdo da seção
  return [gap(160), para(tr(label.toUpperCase(), 12, PRIMARY, true), {
    keepNext: true, keepLines: true, indent: { left: 140 }, spacing: { before: 0, after: 160 },
    shading: { fill: BG_TINT, type: ShadingType.CLEAR, color: 'auto' },
    border: { left: { ...line(PRIMARY, 16), space: 6 }, bottom: { ...line(ACCENT, 4), space: 4 }, top: { ...line(BG_TINT, 4), space: 4 } },
  })];
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
const nomeCurto = n => n.replace(/^\d+(\.\d+)?\s*[.-]?\s*/, '').replace(/C\/C\s*/, '').replace(/\s+/g, ' ').trim();
const atualizado = s => s.openfinance ? `extrato sincronizado ${dm(s.sync)}` : `último lançamento ${dm(s.ult_mov)}`;
const units = d.units;
const byUnit = (rows) => units.map(u => ({ u, rows: rows.filter(r => r.unidade === u) })).filter(x => x.rows.length);
const ent = d.mov.filter(m => m.tipo === 'Entrada'), sai = d.mov.filter(m => m.tipo === 'Saída');
const totEnt = sum(ent), totSai = sum(sai);
const abertoAteSeg = d.pagar_atraso.concat(d.pagar_aberto);
const tJ1 = sum(d.pagar_j1), tJ2 = sum(d.pagar_j2), tAb = sum(abertoAteSeg);
const parcial = d.cutoff < d.ref;

const children = [];
const ORANGE = 'C9731E', GREEN = '2E7D4F';
const sign = v => (v >= 0 ? GREEN : RED);
children.push(para(tr('Relatório Semanal — DR Oral Clinic', 18, PRIMARY, true), { border: { bottom: line(ACCENT, 4) }, spacing: { after: 100 } }));
children.push(para([tr(`Semana de ${dbr(d.semana_completa[0])} a ${dbr(d.semana_completa[1])} · `, 10, TEXT_MED), tr(`dados da Nibo até ${dbr(d.cutoff)}`, 10, TEXT_MED, true)], { spacing: { after: 60 } }));
if (parcial) children.push(note(`Prévia: a semana ainda não terminou. A versão final é gerada na sexta-feira ${dbr(d.ref)}, às 17h.`));
children.push(para([tr('Legenda: ', 9, TEXT_MED, true), tr('■ positivo  ', 9, GREEN, true), tr('■ alerta  ', 9, RED, true), tr('■ crítico', 9, ORANGE, true)], { spacing: { after: 40 } }));

// tabela compacta com cor por célula: rows = [{label, vals:[{t,c}], bold}]
function grid(headers, widths, rows) {
  const hb = { top: line(ACCENT), bottom: line(ACCENT), left: none, right: none };
  const head = new TableRow({ cantSplit: true, tableHeader: true, children: headers.map((h, i) => cell([tr(h.toUpperCase(), 9, PRIMARY, true)], { w: widths[i], fill: BG_TINT, borders: hb, align: i ? AlignmentType.RIGHT : AlignmentType.LEFT })) });
  return table([head, ...rows.map((r, k) => {
    const tot = r.total, fill = tot ? BG_TINT : (k % 2 ? ROW_ALT : WHITE);
    const b = tot ? { top: line(ACCENT, 8), bottom: line(ACCENT, 8), left: none, right: none } : undefined;
    return new TableRow({ cantSplit: true, children: [cell([tr(r.label, 11, tot ? PRIMARY : TEXT, !!tot)], { w: widths[0], fill, borders: b }),
      ...r.vals.map((v, i) => cell([tr(v.t, 11, v.c || TEXT, !!tot || !!v.b)], { w: widths[i + 1], fill, borders: b, align: AlignmentType.RIGHT }))] });
  })], widths);
}

// 1. Saldos
children.push(...secHead(`1. Saldos em conta em ${dbr(d.cutoff)}`));
const cofre = contas.filter(s => /Cofre|Caixa/i.test(s.conta));
const bancos = contas.filter(s => !/Cofre|Caixa/i.test(s.conta)).sort((a, b) => a.conta.localeCompare(b.conta));
const cardItems = bancos.map(s => ({ label: nomeCurto(s.conta).replace(/Sicredi \d{5}-\d/, 'Sicredi'), value: brl(s.saldo), sub: atualizado(s), color: sign(s.saldo) }));
cardItems.push({ label: 'Caixas e cofre', value: brl(sum(cofre, s => s.saldo)), sub: `último lançamento ${dm(cofre.map(s => s.ult_mov).sort().pop())}`, color: GREEN });
children.push(cards(cardItems.slice(0, 3)), gap(60), cards(cardItems.slice(3)), gap(60));
const obra = d.saldos.find(s => /OBRA/i.test(s.conta));
const s88 = d.saldos.find(s => /cnpj 88/i.test(s.conta));
children.push(cards([
  { label: 'Total disponível', value: brl(totalCaixa), sub: 'soma das contas acima (sem a obra)', color: sign(totalCaixa), highlight: true },
  ...(obra ? [{ label: 'Obra — separado', value: brl(obra.saldo), sub: `reservado dentro da Sicredi 88 · no banco a 88 soma ${brl(s88.saldo + obra.saldo)}`, color: ORANGE }] : []),
]));
const pend = d.saldos.filter(s => s.pend_qtd);
const fora = d.saldos.filter(s => !s.liquidez && !/OBRA/i.test(s.conta) && Math.abs(s.saldo) > 0.004);
children.push(gap(40), note(`Fora do total: ${fora.map(s => `${nomeCurto(s.conta)} ${brl(s.saldo)}`).join(' · ')}.${pend.length ? ' Há ' + sum(pend, s => s.pend_qtd) + ' movimentos de extrato ainda em lançamento.' : ''}`));

// 2. Resumo
children.push(...secHead('2. Resumo: o que precisa estar na conta'));
const kw = [2340, 2340, 2340, 2340];
const kpiHead = ['Disponível hoje', `A pagar até seg ${dm(d.segunda_pagamento)}`, `Contas ${dm(d.j1[0])} a ${dm(d.j1[1])}`, `Contas ${dm(d.j2[0])} a ${dm(d.j2[1])}`];
const kpiSub = ['sem a obra', `vencidos + até ${dm(d.segunda_pagamento)}`, `pagar na segunda ${dm(d.segunda_pagamento)}` + (d.pagar_j1.some(r => r.fatura_aberta) ? ' · com faturas de cartão parciais' : ''), 'meta de faturamento · por conta abaixo'];
const kpiVal = [[brl(totalCaixa), sign(totalCaixa)], [brl(tAb), RED], [brl(tJ1), RED], [brl(tJ2), RED]];
children.push(table([
  new TableRow({ cantSplit: true, children: kpiHead.map((h, i) => cell([tr(h.toUpperCase(), 9, PRIMARY, true)], { w: kw[i], fill: i === 2 ? GOLD_TINT : BG_TINT, borders: { top: line(BORDER), bottom: line(BORDER), left: line(BORDER), right: line(BORDER) }, align: AlignmentType.CENTER })) }),
  new TableRow({ cantSplit: true, children: kpiVal.map((v, i) => new TableCell({ width: { size: kw[i], type: WidthType.DXA }, shading: { fill: i === 2 ? GOLD_TINT : WHITE, type: ShadingType.CLEAR, color: 'auto' },
    borders: { top: line(BORDER), bottom: line(BORDER), left: line(BORDER), right: line(BORDER) }, margins: M,
    children: [para(tr(v[0], 13, v[1], true), { alignment: AlignmentType.CENTER }), para(tr(kpiSub[i], 8, TEXT_MED, false, true), { alignment: AlignmentType.CENTER })] })) }),
], kw));
const NEC_ORD = ['Sicredi 33', 'Sicredi 88', 'Sicredi 95', 'Nubank Dra. Rayssa', 'Nubank Dr. Deusdedit', 'Caixa / espécie', 'Conta não informada'];
const nec = require('./necessidade')(d, NEC_ORD);
const segJ2 = addDays(d.j2[0], -1);
const ok = { t: 'coberto', c: GREEN, b: true };
children.push(gap(80), para(tr('Fluxo de caixa por conta: quanto falta em cada semana', 12, PRIMARY, true), { spacing: { after: 60 }, keepNext: true }));
// tabela transposta: linhas = passos do fluxo, colunas = contas (valores em R$)
const CURTO = { 'Sicredi 33': 'Sicredi 33', 'Sicredi 88': 'Sicredi 88', 'Sicredi 95': 'Sicredi 95', 'Nubank Dra. Rayssa': 'Nubank Rayssa', 'Nubank Dr. Deusdedit': 'Nubank Deusdedit', 'Caixa / espécie': 'Espécie', 'Conta não informada': 'Sem conta' };
const n2 = v => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = v => (v < -0.004 ? '-' : '') + n2(v);
const STEPS = [
  { l: 'Saldo hoje', k: 'saldo', f: v => [v === null ? '—' : fmt(v), v === null ? TEXT_MED : sign(v)], strong: true },
  { l: `(−) Vencidos + até seg ${dm(d.segunda_pagamento)}`, k: 'aberto', f: v => [v ? n2(v) : '—', v ? RED : TEXT_MED] },
  { l: `= Saldo para ${dm(d.j1[0])} a ${dm(d.j1[1])}`, k: 'prov1', f: v => [fmt(v), v < -0.004 ? ORANGE : GREEN], strong: true },
  { l: `(−) Contas ${dm(d.j1[0])} a ${dm(d.j1[1])}`, k: 'j1', f: v => [v ? n2(v) : '—', v ? RED : TEXT_MED] },
  { l: `FALTA até ${dm(d.j1[1])} (depositar até ${dm(d.segunda_pagamento)})`, k: 'falta1', f: v => [v ? n2(v) : 'coberto', v ? ORANGE : GREEN], hl: true },
  { l: `= Saldo para ${dm(d.j2[0])} a ${dm(d.j2[1])}`, k: 'prov2', f: v => [fmt(v), GREEN], strong: true },
  { l: `(−) Contas ${dm(d.j2[0])} a ${dm(d.j2[1])}`, k: 'pagar2', f: v => [v ? n2(v) : '—', v ? RED : TEXT_MED] },
  { l: `FALTA até ${dm(d.j2[1])} (faturar até ${dm(segJ2)})`, k: 'faturar', f: v => [v ? n2(v) : 'coberto', v ? RED : GREEN], hl: true },
];
const fw = [1880, ...Array(nec.rows.length + 1).fill(Math.floor((PW - 1880) / (nec.rows.length + 1)))];
const fhb = { top: line(ACCENT), bottom: line(ACCENT), left: none, right: none };
const totCol = r => (r.k === 'saldo' ? nec.tot('saldo') : nec.tot(r.k));
children.push(table([
  new TableRow({ cantSplit: true, tableHeader: true, children: [cell([tr('R$', 8, PRIMARY, true)], { w: fw[0], fill: BG_TINT, borders: fhb }),
    ...nec.rows.map((r, i) => cell([tr(CURTO[r.conta].toUpperCase(), 8, PRIMARY, true)], { w: fw[i + 1], fill: BG_TINT, borders: fhb, align: AlignmentType.RIGHT })),
    cell([tr('TOTAL', 8, PRIMARY, true)], { w: fw[fw.length - 1], fill: BG_TINT, borders: fhb, align: AlignmentType.RIGHT })] }),
  ...STEPS.map((st, k) => {
    const fill = st.hl ? GOLD_TINT : (k % 2 ? ROW_ALT : WHITE);
    const b = st.hl ? { top: line(ACCENT, 6), bottom: line(ACCENT, 6), left: none, right: none } : undefined;
    const tv = totCol(st), tf = st.f(tv);
    return new TableRow({ cantSplit: true, children: [cell([tr(st.l, 8.5, st.hl || st.strong ? PRIMARY : TEXT, !!(st.hl || st.strong))], { w: fw[0], fill, borders: b }),
      ...nec.rows.map((r, i) => { const [t, c] = st.f(r[st.k]); return cell([tr(t, 8.5, c, !!(st.hl || st.strong))], { w: fw[i + 1], fill, borders: b, align: AlignmentType.RIGHT }); }),
      cell([tr(tf[0], 8.5, tf[1], true)], { w: fw[fw.length - 1], fill: st.hl ? GOLD_TINT : BG_TINT, borders: b, align: AlignmentType.RIGHT })] });
  }),
], fw));
const sobras = nec.rows.filter(r => r.saldo !== null && r.sobraFinal > 0.004);
const semConta = nec.rows.find(r => r.conta === 'Conta não informada');
children.push(gap(40),
  note(`Como ler: o saldo de hoje paga primeiro o que vence até ${dm(d.segunda_pagamento)}; o que sobra é o saldo provisionado para as contas de ${dm(d.j1[0])} a ${dm(d.j1[1])}, pagas antecipadamente na segunda ${dm(d.segunda_pagamento)}. Se não cobrir, a FALTA precisa entrar na conta até essa segunda. O que sobrar passa para as contas de ${dm(d.j2[0])} a ${dm(d.j2[1])}, e a FALTA dessa semana é a meta de faturamento da conta até a segunda ${dm(segJ2)}. A sobra de uma conta não cobre a outra: só vale se houver transferência.`),
  ...(sobras.length ? [para([tr('✔ Contas com sobra depois dos pagamentos: ', 10, GREEN, true), tr(sobras.map(r => `${r.conta} ${brl(r.sobraFinal)}`).join(' · ') + '.', 10)], { spacing: { after: 40 } })] : []),
  ...(semConta ? [para([tr('⚠ Alerta: ', 10, RED, true), tr(`${brl(semConta.pagar + semConta.pagar2)} em contas sem conta de pagamento definida na Nibo. Enquanto não for definida, o valor entra inteiro como falta.`, 10)], { spacing: { after: 40 } })] : []));

// 3. Realizado
children.push(...secHead(`3. Realizado da semana (${dm(d.semana[0])} a ${dm(d.semana[1])})`));
const res = totEnt - totSai;
children.push(cards([
  { label: 'Total que entrou', value: brl(totEnt), color: GREEN }, { label: 'Total que saiu', value: brl(totSai), color: RED },
  { label: 'Resultado da semana', value: brl(res), color: sign(res), highlight: true }]), gap(80));
const ru = units.map(u => { const e = sum(ent.filter(m => m.unidade === u)), s = sum(sai.filter(m => m.unidade === u)); return { u, e, s }; }).filter(x => x.e || x.s);
children.push(grid(['Unidade', 'Entradas', 'Saídas', 'Resultado'], [3360, 2000, 2000, 2000], [
  ...ru.map(x => ({ label: UN[x.u], vals: [{ t: x.e ? brl(x.e) : '—', c: GREEN }, { t: x.s ? brl(x.s) : '—', c: RED }, { t: brl(x.e - x.s), c: sign(x.e - x.s) }] })),
  { label: 'TOTAL', total: true, vals: [{ t: brl(totEnt), c: GREEN }, { t: brl(totSai), c: RED }, { t: brl(res), c: sign(res) }] }]));

// 4. Contas a pagar (somente totais)
children.push(...secHead('4. Contas a pagar — totais'));
const cols = [abertoAteSeg, d.pagar_j1, d.pagar_j2];
const cpHead = [`Até seg ${dm(d.segunda_pagamento)}`, `${dm(d.j1[0])} a ${dm(d.j1[1])}`, `${dm(d.j2[0])} a ${dm(d.j2[1])}`];
const cw = [2760, 2200, 2200, 2200];
const v = x => ({ t: x ? brl(x) : '—', c: x ? RED : TEXT_MED });
const totRow = { label: 'TOTAL', total: true, vals: cols.map(c => ({ t: brl(sum(c)), c: RED })) };
children.push(para(tr('Por unidade', 10, PRIMARY_MED, true), { spacing: { after: 40 }, keepNext: true }));
children.push(grid(['Unidade', ...cpHead], cw, [...units.filter(u => cols.some(c => c.some(r => r.unidade === u))).map(u => ({ label: UN[u], vals: cols.map(c => v(sum(c.filter(r => r.unidade === u)))) })), totRow]));
children.push(gap(80), para(tr('Por conta de pagamento', 10, PRIMARY_MED, true), { spacing: { after: 40 }, keepNext: true }));
const ORD = ['Sicredi 33', 'Sicredi 88', 'Sicredi 95', 'Nubank Dra. Rayssa', 'Nubank Dr. Deusdedit', 'Caixa / espécie', 'Conta não informada'];
children.push(grid(['Conta', ...cpHead], cw, [...ORD.filter(k => cols.some(c => c.some(r => r.conta_pag === k))).map(k => ({ label: k, vals: cols.map(c => v(sum(c.filter(r => r.conta_pag === k)))) })), totRow]));
const fatAb = d.faturas.filter(f => !f.fechada);
children.push(gap(60));
if (fatAb.length) children.push(para([tr('⚠ Alerta: ', 10.5, RED, true), tr(`faturas dos cartões PJ ainda não fechadas, valor parcial: ${fatAb.map(f => `PJ ${f.cartao} (venc. ${dm(f.venc)}) ${brl(f.total)}`).join(' · ')}. Já estão incluídas acima, na conta que paga cada cartão.`, 10.5)], { spacing: { after: 60 } }));
if (d.pagar_atraso.length) children.push(para([tr('● Crítico: ', 10.5, ORANGE, true), tr(d.pagar_atraso.length > 1 ? `${d.pagar_atraso.length} contas vencidas e não baixadas na Nibo, total ` : '1 conta vencida e não baixada na Nibo, de ', 10.5), tr(brl(sum(d.pagar_atraso)), 10.5, ORANGE, true), tr(d.pagar_atraso.length > 1 ? '. Se já foram pagas, enviar os comprovantes.' : '. Se já foi paga, enviar o comprovante.', 10.5)], { spacing: { after: 60 } }));
children.push(para([tr('Lista completa, conta por conta: ', 10.5, TEXT_MED), link('planilha de contas a pagar', links.cp, 10.5)]));

// 5. A receber e não identificados
children.push(...secHead('5. A receber e lançamentos a identificar'));
const rec = d.receber_j1.concat(d.receber_j2);
const ni = d.nao_identificados;
children.push(para([tr('A receber agendado até ' + dbr(d.j2[1]) + ': ', 11, PRIMARY, true), rec.length ? tr(brl(sum(rec)), 11, GREEN, true) : tr('nenhum', 11, TEXT_MED, false, true), tr(rec.length ? ` (${rec.length} parcela${rec.length > 1 ? 's' : ''})` : '')], { spacing: { after: 60 } }));
children.push(para([tr('Lançamentos a identificar: ', 11, PRIMARY, true), tr(`${ni.length} itens, `), tr(brl(sum(ni)), 11, ni.length ? ORANGE : GREEN, true), tr('. Preencha o que é e a unidade de cada um na '), link('planilha de lançamentos a identificar', links.ni), tr('.')]));

// 10. Pendências
children.push(...secHead('6. Pendências'));
const pendRows = [];
if (ni.length) pendRows.push(['Clínica', `Preencher a planilha de lançamentos a identificar (${ni.length} itens, ${brl(sum(ni))}).`]);
if (d.pagar_atraso.length) pendRows.push(['Clínica', (d.pagar_atraso.length > 1 ? `Confirmar o pagamento das ${d.pagar_atraso.length} contas vencidas e não baixadas (` : `Confirmar o pagamento da conta vencida e não baixada (`) + `${brl(sum(d.pagar_atraso))}, detalhe na planilha de contas a pagar) e enviar o comprovante.`]);
if (false) pendRows.push(['Aridus BPO', `Lançar na Nibo os ${sum(pend, s => s.pend_qtd)} movimentos de extrato ainda pendentes (${pend.map(s => nomeCurto(s.conta)).join(', ')}).`]);
pendRows.push(['Clínica', 'Enviar notas, boletos e comprovantes novos da semana para lançamento.']);
const pw = [2100, PW - 2100];
children.push(table([
  new TableRow({ cantSplit: true, tableHeader: true, children: ['RESPONSÁVEL', 'PENDÊNCIA'].map((h, i) => cell([tr(h, 9.5, PRIMARY, true)], { w: pw[i], fill: BG_TINT, borders: { top: line(ACCENT), bottom: line(ACCENT), left: none, right: none } })) }),
  ...pendRows.map((r, k) => new TableRow({ cantSplit: true, children: [cell([tr(r[0], 11, PRIMARY, true)], { w: pw[0], fill: k % 2 ? ROW_ALT : WHITE }), cell([tr(r[1])], { w: pw[1], fill: k % 2 ? ROW_ALT : WHITE })] })),
], pw));

// 11. Observações
children.push(...secHead('7. Observações da equipe Aridus BPO'));
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
