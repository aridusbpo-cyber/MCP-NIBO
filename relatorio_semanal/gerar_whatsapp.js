// Mensagem padrão de WhatsApp com o resumo do relatório semanal DR Oral (texto puro, formatação do WhatsApp).
// Uso: node gerar_whatsapp.js dados.json links.json saida.txt
const fs = require('fs');
const d = JSON.parse(fs.readFileSync(process.argv[2]));
const links = JSON.parse(fs.readFileSync(process.argv[3]));
const OUT = process.argv[4];

const brl = v => (v < 0 ? '-R$ ' : 'R$ ') + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dm = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const addDays = (s, n) => new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const sum = (a, f = x => x.valor) => Math.round(a.reduce((s, x) => s + f(x), 0) * 100) / 100;
const nomeCurto = n => n.replace(/^\d+(\.\d+)?\s*[.-]?\s*/, '').replace(/C\/C\s*/, '').replace(/Sicredi \d{5}-\d\s*\(cnpj (\d+)\)/i, 'Sicredi $1').replace(/\((Dra?\. [^)]+)\)/, '$1').replace(/\s+/g, ' ').trim();

const ORD = ['Sicredi 33', 'Sicredi 88', 'Sicredi 95', 'Nubank Dra. Rayssa', 'Nubank Dr. Deusdedit', 'Caixa / espécie', 'Conta não informada'];
const nec = require('./necessidade')(d, ORD);
const contas = d.saldos.filter(s => s.liquidez);
const totalCaixa = sum(contas, s => s.saldo);
const cofre = contas.filter(s => /Cofre|Caixa/i.test(s.conta));
const bancos = contas.filter(s => !/Cofre|Caixa/i.test(s.conta)).sort((a, b) => a.conta.localeCompare(b.conta));
const obra = d.saldos.find(s => /OBRA/i.test(s.conta));
const seg = d.segunda_pagamento, segJ2 = addDays(d.j2[0], -1);
const ab = d.pagar_atraso.concat(d.pagar_aberto);
const ent = sum(d.mov.filter(m => m.tipo === 'Entrada')), sai = sum(d.mov.filter(m => m.tipo === 'Saída'));
const fatAb = d.faturas.filter(f => !f.fechada);
const semConta = nec.rows.find(r => r.conta === 'Conta não informada');
const pend = d.saldos.filter(s => s.liquidez && s.pend_qtd);
const ni = d.nao_identificados;

const L = [];
L.push('*DR Oral Clinic — Resumo financeiro semanal*');
L.push(`_Dados da Nibo até ${dm(d.cutoff)}/${d.cutoff.slice(0, 4)}${d.cutoff < d.ref ? ` · prévia da semana que fecha em ${dm(d.ref)}` : ''}_`);
L.push('');
L.push(`💰 *Saldos em ${dm(d.cutoff)}*`);
bancos.forEach(s => L.push(`• ${nomeCurto(s.conta)}: ${brl(s.saldo)}`));
L.push(`• Caixas e cofre: ${brl(sum(cofre, s => s.saldo))}`);
L.push(`*Total disponível: ${brl(totalCaixa)}*`);
if (obra) L.push(`_Reserva da obra (separada, dentro da Sicredi 88): ${brl(obra.saldo)}_`);
L.push('');
L.push('📅 *Contas a pagar*');
if (d.cutoff < d.ref) {
  // Prévia: as contas até a segunda já foram programadas na segunda anterior; o débito ainda não saiu do saldo.
  L.push(`• Já programado em ${dm(addDays(d.ref, -4))} (vencimentos até ${dm(seg)}): ${brl(sum(d.pagar_aberto))}`);
  if (d.pagar_atraso.length) L.push(`• Vencidos antes de ${dm(d.cutoff)} sem baixa: ${brl(sum(d.pagar_atraso))}`);
  L.push(`_Ainda estão no saldo até o débito, por isso são descontados no cálculo abaixo._`);
} else L.push(`• Vencidos + até seg ${dm(seg)}: ${brl(sum(ab))}`);
L.push(`• Contas de ${dm(d.j1[0])} a ${dm(d.j1[1])} (pagar seg ${dm(seg)}): ${brl(sum(d.pagar_j1))}`);
L.push(`• Contas de ${dm(d.j2[0])} a ${dm(d.j2[1])} (meta de faturamento): ${brl(sum(d.pagar_j2))}`);
L.push('');
L.push('🧮 *Quanto falta em cada conta*');
const faltas = nec.rows.filter(r => r.falta1 || r.faturar);
faltas.forEach(r => {
  const p = [];
  if (r.falta1) p.push(`${brl(r.falta1)} até ${dm(d.j1[1])} (depositar até ${dm(seg)})`);
  if (r.faturar) p.push(`${brl(r.faturar)} até ${dm(d.j2[1])} (faturar até ${dm(segJ2)})`);
  L.push(`• *${r.conta === 'Conta não informada' ? 'Sem conta definida' : r.conta}:* ${p.join(' · ')}`);
});
const cobertas = nec.rows.filter(r => !r.falta1 && !r.faturar && r.saldo !== null).map(r => r.conta);
if (cobertas.length) L.push(`✅ Cobertas: ${cobertas.join(', ')}.`);
if (!faltas.length) L.push('✅ Todas as contas cobrem as duas semanas.');
L.push(`*Total que falta: ${brl(nec.tot('falta1'))} até ${dm(d.j1[1])} e ${brl(nec.tot('faturar'))} até ${dm(d.j2[1])}.*`);
L.push('');
L.push(`📈 *Realizado (${dm(d.semana[0])} a ${dm(d.semana[1])})*`);
L.push(`Entradas ${brl(ent)} · Saídas ${brl(sai)} · Resultado *${brl(ent - sai)}*`);
L.push('');
const at = [];
if (fatAb.length) at.push(`Faturas de cartão ainda não fechadas (valor parcial): ${fatAb.map(f => `PJ ${f.cartao} venc. ${dm(f.venc)} ${brl(f.total)}`).join(' · ')}.`);
if (d.pagar_atraso.length) at.push(`${d.pagar_atraso.length} conta${d.pagar_atraso.length > 1 ? 's vencidas' : ' vencida'} sem baixa na Nibo: ${brl(sum(d.pagar_atraso))}. Se já ${d.pagar_atraso.length > 1 ? 'foram pagas, enviar os comprovantes' : 'foi paga, enviar o comprovante'}.`);
if (semConta) at.push(`${brl(semConta.pagar + semConta.pagar2)} em contas sem conta de pagamento definida: entram inteiras como falta.`);
if (ni.length) at.push(`${ni.length} lançamento${ni.length > 1 ? 's' : ''} a identificar (${brl(sum(ni))}): preencher a planilha.`);
if (pend.length) at.push(`Extrato ainda em lançamento na Nibo: ${pend.map(s => `${nomeCurto(s.conta)} (${s.pend_qtd})`).join(', ')}. Os saldos podem mudar depois do lançamento.`);
if (at.length) { L.push('⚠️ *Atenção*'); at.forEach(t => L.push(`• ${t}`)); L.push(''); }
L.push('🔗 *Planilhas*');
L.push(`Contas a pagar: ${links.cp}`);
L.push(`Lançamentos a identificar: ${links.ni}`);
L.push('');
L.push('_Relatório completo em anexo (abra o arquivo HTML e toque nos valores para ver o detalhe)._');
L.push('_Aridus BPO Financeiro_');

fs.writeFileSync(OUT, L.join('\n') + '\n');
console.log(L.join('\n'));
