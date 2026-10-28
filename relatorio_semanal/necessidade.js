// Quanto precisa entrar em cada conta: saldo de hoje × compromissos que saem daquela conta.
// Sobra de uma conta não cobre a outra; o total soma só as faltas.
const SALDO_RE = {
  'Sicredi 33': /cnpj 33/i, 'Sicredi 88': /cnpj 88/i, 'Sicredi 95': /cnpj 95/i,
  'Nubank Dra. Rayssa': /Nubank.*Rayssa/i, 'Nubank Dr. Deusdedit': /Nubank.*Deusdedit/i, 'Caixa / espécie': /Cofre|Caixa/i,
};
const r2 = v => Math.round(v * 100) / 100;
const sum = a => r2(a.reduce((s, r) => s + r.valor, 0));

module.exports = function necessidade(d, ORD) {
  const ate = d.pagar_atraso.concat(d.pagar_aberto, d.pagar_j1), j2 = d.pagar_j2;
  const liq = d.saldos.filter(s => s.liquidez);
  const rows = ORD.map(conta => {
    const re = SALDO_RE[conta];
    const saldo = re ? r2(liq.filter(s => re.test(s.conta)).reduce((a, s) => a + s.saldo, 0)) : null;
    const pagar = sum(ate.filter(r => r.conta_pag === conta)), pagar2 = sum(j2.filter(r => r.conta_pag === conta));
    const sobra = r2((saldo || 0) - pagar);
    return { conta, saldo, pagar, sobra, falta: Math.max(0, -sobra), pagar2, faturar: r2(Math.max(0, pagar2 - Math.max(0, sobra))), sobraFinal: r2(sobra - pagar2) };
  }).filter(r => r.saldo !== null || r.pagar || r.pagar2);
  return { rows, falta: r2(rows.reduce((a, r) => a + r.falta, 0)), faturar: r2(rows.reduce((a, r) => a + r.faturar, 0)),
    pagar: r2(rows.reduce((a, r) => a + r.pagar, 0)), pagar2: r2(rows.reduce((a, r) => a + r.pagar2, 0)) };
};
