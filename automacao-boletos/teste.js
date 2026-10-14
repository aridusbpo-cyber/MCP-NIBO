// Testes das regras do Code.gs fora do Google.  Rode:  node automacao-boletos/teste.js
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ctx = { module: { exports: {} }, console: console };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'), ctx);
var G = ctx.module.exports;

// ---- geradores de linhas digitáveis válidas ----
function linhaBoleto(banco, fator, valorCentavos, livre25) {
  var valor = String(valorCentavos).padStart(10, '0');
  var semDv = banco + '9' + fator + valor + livre25;          // 43 dígitos (sem DV geral)
  var c1 = semDv.substr(0, 4) + semDv.substr(18, 5);
  var c2 = semDv.substr(23, 10);
  var c3 = semDv.substr(33, 10);
  return c1.substr(0, 5) + '.' + c1.substr(5) + G.modulo10(c1) + ' ' +
         c2.substr(0, 5) + '.' + c2.substr(5) + G.modulo10(c2) + ' ' +
         c3.substr(0, 5) + '.' + c3.substr(5) + G.modulo10(c3) + ' 1 ' + fator + valor;
}
function linhaArrecadacao(idValor, valorCentavos, resto) {
  var corpo = '8' + '5' + idValor;                             // segmento 5 = órgão público
  var semDv = corpo + String(valorCentavos).padStart(11, '0') + resto; // 3+11+29 = 43
  var dvFn = (idValor === '6' || idValor === '7') ? G.modulo10 : G.modulo11Arrecadacao;
  var barras = semDv.substr(0, 3) + dvFn(semDv) + semDv.substr(3);
  var out = [];
  for (var b = 0; b < 4; b++) {
    var bloco = barras.substr(b * 11, 11);
    out.push(bloco + '-' + dvFn(bloco));
  }
  return out.join(' ');
}

var ok = 0;
function t(nome, fn) { fn(); ok++; console.log('ok  ' + nome); }

t('DV módulo 10 e 11', function () {
  assert.strictEqual(G.modulo10('237933812'), 8);   // campo 1 de "23793.38128 ..."
  assert.strictEqual(G.modulo11Arrecadacao('0'), 0);
});

t('boleto: valor e vencimento pela linha digitável (fator novo)', function () {
  // fator 1000 = 22/02/2025; 1586 = 22/02/2025 + 586 dias = 01/10/2026
  var linha = linhaBoleto('237', '1586', 52896, '1234567890123456789012345');
  var cod = G.acharCodigo('Beneficiário: SIN IMPLANT LTDA\n' + linha + '\nOutro texto');
  assert.strictEqual(cod.tipo, 'boleto');
  var d = G.extrairDados('BENEFICIARIO: SIN IMPLANT LTDA - CNPJ 12.345.678/0001-90\n' + linha,
                         'boleto.pdf', 'Boleto', 'x@y.com');
  assert.strictEqual(d.valor, 528.96);
  assert.strictEqual(d.vencimento.toISOString().slice(0, 10), '2026-10-01');
  assert.strictEqual(d.fornecedor, 'SIN IMPLANT');
  assert.strictEqual(G.montarNome(d.vencimento, d.fornecedor, d.valor),
                     '01.10.2026 SIN IMPLANT R$ 528,96.pdf');
});

t('boleto: linha quebrada pelo OCR ainda é achada', function () {
  var linha = linhaBoleto('341', '1600', 123456, '9876543210987654321098765');
  var quebrada = linha.replace(' ', '\n');
  assert.ok(G.acharCodigo('xx\n' + quebrada + '\nyy'));
});

t('boleto: DV errado é rejeitado (não inventa valor)', function () {
  var linha = linhaBoleto('237', '1586', 52896, '1234567890123456789012345');
  var errada = linha.replace(/^(\d{5}\.\d{4})(\d)/, function (_, a, dv) { return a + ((+dv + 1) % 10); });
  assert.strictEqual(G.acharCodigo(errada), null);
  assert.strictEqual(G.acharCodigo('CNPJ 12345678000190 12345678901234567890123456789012345678901234567'), null);
});

t('guia (arrecadação): valor pelo código, vencimento pelo texto', function () {
  var linha = linhaArrecadacao('6', 154321, '00000000000000000000000000001');
  assert.ok(G.arrecadacaoValida(linha.replace(/\D/g, '')));
  var texto = 'Documento de Arrecadação do Simples Nacional\nPagar este documento até 20/10/2026\n' + linha;
  var d = G.extrairDados(texto, 'DAS.pdf', 'Guias', 'rsassessoriacont@gmail.com');
  assert.strictEqual(d.valor, 1543.21);
  assert.strictEqual(d.vencimento.toISOString().slice(0, 10), '2026-10-20');
  assert.strictEqual(d.fornecedor, 'DAS SIMPLES NACIONAL');
});

t('guia com módulo 11', function () {
  var linha = linhaArrecadacao('8', 9999, '12345678901234567890123456789');
  var cod = G.acharCodigo(linha);
  assert.strictEqual(cod.tipo, 'arrecadacao');
  assert.strictEqual(G.lerArrecadacao(cod.digitos).valor, 99.99);
});

t('sem código: valor e vencimento pelo texto', function () {
  var d = G.extrairDados('Data de Vencimento: 05/11/2026\nValor do Documento R$ 1.234,56',
                         'fatura.pdf', '', 'Fornecedor X <a@b.com>');
  assert.strictEqual(d.temCodigo, false);
  assert.strictEqual(d.valor, 1234.56);
  assert.strictEqual(d.vencimento.toISOString().slice(0, 10), '2026-11-05');
  assert.strictEqual(d.fornecedor, 'FORNECEDOR X');
});

t('classificação do anexo', function () {
  assert.strictEqual(G.classificarArquivo('FOLHA_092026.pdf', '', true), 'ignorar');
  assert.strictEqual(G.classificarArquivo('DAS-202609.pdf', '', false), 'sim');
  assert.strictEqual(G.classificarArquivo('documento.pdf', 'Seu boleto chegou', false), 'sim');
  assert.strictEqual(G.classificarArquivo('documento.pdf', 'Oi', true), 'sim');
  assert.strictEqual(G.classificarArquivo('documento.pdf', 'Oi', false), 'talvez');
  assert.strictEqual(G.classificarArquivo('DASHBOARD.pdf', 'Oi', false), 'talvez'); // DAS só como palavra
});

t('cliente: assunto/arquivo tem prioridade sobre o texto do PDF', function () {
  var c = G.identificarCliente('Guias Geovana 09/2026', 'Atendente: Felipe');
  assert.strictEqual(c.nome, 'Geovana Nogueira');
  assert.strictEqual(G.identificarCliente('Guias', 'CNPJ 41.625.338/0001-00').nome, 'Camila Vascular');
  assert.strictEqual(G.identificarCliente('Guias', 'FELIPESSA'), null); // palavra inteira
});

t('mapeamento por planilha', function () {
  var cl = G.clientesDaPlanilha([
    ['Cliente', 'Pasta', 'Palavras'],
    ['Studio Brendha', 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing', 'BRENDHA; STUDIO B'],
    ['Sem pasta', '', 'X'],
    ['Só nome', '1ZyXwVuTsRqPoNmLk', '']
  ]);
  assert.strictEqual(cl.length, 2);
  assert.strictEqual(cl[0].pastaId, '1AbCdEfGhIjKlMnOp');
  assert.deepStrictEqual(Array.from(cl[0].chaves), ['BRENDHA', 'STUDIO B']);
  assert.deepStrictEqual(Array.from(cl[1].chaves), ['Só nome']);
  assert.strictEqual(G.identificarCliente('Boleto Studio Brendha', '', cl).nome, 'Studio Brendha');
});

t('nome de arquivo incompleto não colide', function () {
  assert.strictEqual(G.montarNome(null, 'DARF', null, 'guia_1.pdf'),
                     'SEM DATA DARF R$ SEM VALOR (guia_1).pdf');
});

console.log('\n' + ok + ' testes passaram.');
