/**
 * Automação de Contas a Pagar — Aridus BPO
 *
 * Todo dia: lê o Gmail, pega os PDFs de boletos/guias (R&S Assessoria Contábil
 * e qualquer outro remetente), salva na pasta "03. Contas a Pagar" do cliente
 * (subpasta do mês de vencimento), renomeia no padrão
 *     DD.MM.AAAA FORNECEDOR R$ 0.000,00.pdf
 * e envia um e-mail de alerta com o que foi programado e o que ficou pendente.
 *
 * Instalação: veja LEIA-ME.md nesta pasta.
 */

// ============================== CONFIGURAÇÃO ==============================

var CONFIG = {
  // Quem recebe o relatório de alerta.
  EMAIL_RELATORIO: 'aridusbpo@gmail.com',

  // Busca no Gmail. Só e-mails com PDF dos últimos 3 dias que ainda não foram
  // processados (o rótulo abaixo é aplicado depois de processar).
  BUSCA_GMAIL: 'has:attachment filename:pdf newer_than:3d -in:sent ' +
               '-label:CP-Processado -label:CP-Pendente',

  ROTULO_PROCESSADO: 'CP-Processado',
  ROTULO_PENDENTE: 'CP-Pendente',

  // Remetentes sempre tratados como "pode ter boleto/guia".
  REMETENTES_CONFIAVEIS: ['rsassessoriacont@gmail.com'],

  // Nome do arquivo indica documento a pagar (de qualquer remetente).
  PALAVRAS_PAGAVEL: ['BOLETO', 'DARF', 'DAS', 'FGTS', 'GPS', 'INSS', 'GUIA',
                     'DAE', 'DAM', 'ISS', 'FATURA', 'COBRANCA', 'COBRANÇA',
                     'TRIBUTO', 'IPTU', 'ALVARA', 'ALVARÁ', 'TAXA', 'PARCELA',
                     'PARCELAMENTO', 'DUPLICATA', 'MENSALIDADE'],

  // Nome do arquivo indica que NÃO é conta a pagar (folha, recibo, holerite...).
  PALAVRAS_IGNORAR: ['FOLHA', 'RECIBO', 'HOLERITE', 'CONTRACHEQUE', 'EXTRATO',
                     'RELATORIO', 'RELATÓRIO', 'CONTRATO', 'NOTA FISCAL', 'NFS',
                     'DANFE', 'COMPROVANTE', 'BALANCETE', 'DRE'],

  // Cliente -> pasta "03. Contas a Pagar" no Drive + palavras que identificam
  // o cliente no assunto, no nome do arquivo ou no texto do PDF (nome, CNPJ...).
  // Para adicionar cliente: copie uma linha, troque o ID da pasta e as palavras.
  CLIENTES: [
    { nome: 'D R Oral Clinic',  pastaId: '1EdOBiK8uvcp5mIOpSkYPBAvGcOS7zit3',
      chaves: ['DR ORAL', 'D R ORAL', 'ORAL CLINIC', 'RAISSA', 'RAYSSA', 'DEUSDEDIT'] },
    { nome: 'Dr Paulo Arnon',   pastaId: '1Qm20HBn4DZ9Fii4amYD49JLijUZH3fj9',
      chaves: ['PAULO ARNON', 'PAULO BASTOS', 'DR PAULO'] },
    { nome: 'Geovana Nogueira', pastaId: '1P_a4_YfrEqhqJhYZTyKv_jTUB2mYP8SE',
      chaves: ['GEOVANA'] },
    { nome: 'Camila Vascular',  pastaId: '1A49BRuWfmW-W4-Kkfh-kLyMeWmLrux3s',
      chaves: ['CAMILA', '41.625.338', '41625338'] },
    { nome: 'Dulce Regina',     pastaId: '1uwtGt3iw4vUVUcKSBnBNRx6La582ZS5p',
      chaves: ['DULCE'] },
    { nome: 'Ian Fox',          pastaId: '1okBavPYndxV7TjdhzorUhuUV1XVxQy2K',
      chaves: ['IAN FOX'] },
    { nome: 'Felipe',           pastaId: '12mf8AoCgpU2i0_-qPDO0j_vOJqXzfJYt',
      chaves: ['FELIPE'] },
    { nome: 'Yasmin',           pastaId: '1QtJO2YqdyN6TJ68IfEfJ8_DMVw2vgJr4',
      chaves: ['YASMIN'] }
  ],

  // Quando não dá para identificar o cliente, o PDF vai para esta pasta
  // (criada automaticamente na raiz do Meu Drive).
  PASTA_A_CLASSIFICAR: '_CP A CLASSIFICAR',

  // Salvar dentro da subpasta do mês do vencimento ("10. Outubro 2026").
  USAR_SUBPASTA_MES: true,

  HORA_EXECUCAO: 7 // hora do dia (fuso do projeto) para a execução diária
};

var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
             'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// ============================== EXECUÇÃO ==============================

/** Rode UMA vez para criar o agendamento diário. */
function instalarAgendamentoDiario() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processarBoletos') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processarBoletos').timeBased()
    .everyDays(1).atHour(CONFIG.HORA_EXECUCAO).create();
}

/** Rotina principal (chamada pelo agendamento diário ou manualmente). */
function processarBoletos() {
  var rotOk = obterRotulo_(CONFIG.ROTULO_PROCESSADO);
  var rotPend = obterRotulo_(CONFIG.ROTULO_PENDENTE);
  var programados = [];
  var pendentes = [];

  var threads = GmailApp.search(CONFIG.BUSCA_GMAIL, 0, 100);
  threads.forEach(function (thread) {
    var temPendencia = false;
    thread.getMessages().forEach(function (msg) {
      var remetente = msg.getFrom();
      var assunto = msg.getSubject();
      var confiavel = CONFIG.REMETENTES_CONFIAVEIS.some(function (r) {
        return remetente.toLowerCase().indexOf(r) >= 0;
      });

      msg.getAttachments({ includeInlineImages: false }).forEach(function (anexo) {
        var nomeArq = anexo.getName();
        if (!/\.pdf$/i.test(nomeArq)) return;
        var classe = classificarArquivo(nomeArq, assunto, confiavel);
        if (classe === 'ignorar') return;

        try {
          var texto = extrairTextoPdf_(anexo);
          var dados = extrairDados(texto, nomeArq, assunto, remetente);
          // Remetente desconhecido + nome genérico: só entra se o PDF tiver
          // linha digitável (é de fato um boleto/guia).
          if (classe === 'talvez' && !dados.temCodigo) return;

          var cliente = identificarCliente(assunto + ' ' + nomeArq + ' ' + texto);
          var registro = {
            cliente: cliente ? cliente.nome : '(não identificado)',
            fornecedor: dados.fornecedor,
            vencimento: dados.vencimento,
            valor: dados.valor,
            original: nomeArq,
            assunto: assunto,
            remetente: remetente,
            link: ''
          };

          var faltando = [];
          if (!cliente) faltando.push('cliente');
          if (!dados.vencimento) faltando.push('vencimento');
          if (dados.valor === null) faltando.push('valor');

          var pasta = cliente
            ? pastaDestino_(cliente.pastaId, dados.vencimento)
            : pastaAClassificar_();
          var novoNome = montarNome(dados.vencimento, dados.fornecedor, dados.valor);

          var existente = pasta.getFilesByName(novoNome);
          var arquivo = existente.hasNext()
            ? existente.next()
            : pasta.createFile(anexo.copyBlob().setName(novoNome));
          registro.link = arquivo.getUrl();
          registro.novoNome = novoNome;
          registro.pasta = pasta.getName();

          if (faltando.length) {
            registro.motivo = 'Não consegui ler: ' + faltando.join(', ');
            pendentes.push(registro);
            temPendencia = true;
          } else {
            programados.push(registro);
          }
        } catch (e) {
          pendentes.push({ cliente: '-', fornecedor: '-', vencimento: null,
            valor: null, original: nomeArq, assunto: assunto, remetente: remetente,
            link: '', motivo: 'Erro: ' + e.message });
          temPendencia = true;
        }
      });
    });
    thread.addLabel(temPendencia ? rotPend : rotOk);
  });

  if (programados.length || pendentes.length) {
    enviarRelatorio_(programados, pendentes);
  }
  console.log('Programados: ' + programados.length + ' | Pendentes: ' + pendentes.length);
}

// ============================== REGRAS (funções puras) ==============================

function normalizar(s) {
  return String(s || '').toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** 'sim' = conta a pagar | 'ignorar' = não é | 'talvez' = decidir pelo conteúdo */
function classificarArquivo(nomeArq, assunto, remetenteConfiavel) {
  var n = normalizar(nomeArq);
  var contem = function (lista) {
    return lista.some(function (p) {
      return new RegExp('(^|[^A-Z])' + normalizar(p) + '([^A-Z]|$)').test(n);
    });
  };
  if (contem(CONFIG.PALAVRAS_IGNORAR)) return 'ignorar';
  if (contem(CONFIG.PALAVRAS_PAGAVEL)) return 'sim';
  if (/BOLETO|COBRAN|FATURA|GUIA|VENCIMENTO/.test(normalizar(assunto))) return 'sim';
  return remetenteConfiavel ? 'sim' : 'talvez';
}

function identificarCliente(texto) {
  var t = normalizar(texto);
  for (var i = 0; i < CONFIG.CLIENTES.length; i++) {
    var c = CONFIG.CLIENTES[i];
    for (var j = 0; j < c.chaves.length; j++) {
      if (t.indexOf(normalizar(c.chaves[j])) >= 0) return c;
    }
  }
  return null;
}

/**
 * Boleto bancário (47 dígitos). Os 14 últimos = fator de vencimento (4) + valor (10).
 * Desde 22/02/2025 o fator reiniciou em 1000 (regra Febraban).
 */
function lerBoletoBancario(digitos) {
  var fator = parseInt(digitos.substr(33, 4), 10);
  var valor = parseInt(digitos.substr(37, 10), 10) / 100;
  var venc = null;
  if (fator >= 1000) {
    venc = new Date(Date.UTC(2025, 1, 22) + (fator - 1000) * 86400000);
    // Fatores do ciclo antigo (antes de 22/02/2025) caem muito no futuro.
    if (venc.getUTCFullYear() > new Date().getUTCFullYear() + 10) venc = null;
  }
  return { valor: valor > 0 ? valor : null, vencimento: venc };
}

/**
 * Arrecadação/guias (48 dígitos, começa com 8 — DARF, DAS, FGTS, GPS, concessionárias).
 * Valor nas posições 5-15 do código de barras quando o 3º dígito é 6 ou 8.
 * O vencimento não vem de forma padronizada: lido do texto.
 */
function lerArrecadacao(digitos) {
  // remove os 4 dígitos verificadores dos blocos de 12
  var barras = digitos.substr(0, 11) + digitos.substr(12, 11) +
               digitos.substr(24, 11) + digitos.substr(36, 11);
  var idValor = barras.charAt(2);
  var valor = (idValor === '6' || idValor === '8')
    ? parseInt(barras.substr(4, 11), 10) / 100 : null;
  return { valor: valor > 0 ? valor : null, vencimento: null };
}

function acharCodigo(texto) {
  // Boleto: 5.5 5.6 5.6 1 14
  var mb = texto.match(/(\d{5})[.\s]?(\d{5})\s+(\d{5})[.\s]?(\d{6})\s+(\d{5})[.\s]?(\d{6})\s+(\d)\s+(\d{14})/);
  if (mb) return { tipo: 'boleto', digitos: mb.slice(1).join('') };
  // Arrecadação: 4 blocos de 11 dígitos + DV, começa com 8
  var ma = texto.match(/(8\d{10})[\s-]*(\d)\s+(\d{11})[\s-]*(\d)\s+(\d{11})[\s-]*(\d)\s+(\d{11})[\s-]*(\d)/);
  if (ma) return { tipo: 'arrecadacao', digitos: ma.slice(1).join('') };
  var so = texto.replace(/[^\d\n ]/g, '').match(/\b8\d{47}\b/);
  if (so) return { tipo: 'arrecadacao', digitos: so[0] };
  var sb = texto.replace(/[.\s]/g, '').match(/\d{47}/);
  if (sb && sb[0].charAt(0) !== '8') return { tipo: 'boleto', digitos: sb[0] };
  return null;
}

function parseDataBR(s) {
  var m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
}

function parseValorBR(s) {
  var m = String(s).match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
  return m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) : null;
}

function vencimentoDoTexto(texto) {
  var m = texto.match(/(?:VENCIMENTO|VENCTO|PAGAR AT[ÉE]|PAGAVEL AT[ÉE]|DATA DE VENC\w*|VALIDADE)[^\d]{0,40}(\d{2}\/\d{2}\/\d{4})/i);
  return m ? parseDataBR(m[1]) : null;
}

function valorDoTexto(texto) {
  var m = texto.match(/(?:VALOR (?:DO DOCUMENTO|COBRADO|TOTAL|A PAGAR|A RECOLHER)|TOTAL A (?:PAGAR|RECOLHER)|\(=\) ?VALOR)[^\d]{0,40}(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  return m ? parseValorBR(m[1]) : null;
}

function fornecedorDoTexto(texto, nomeArq, remetente) {
  var t = normalizar(texto + ' ' + nomeArq);
  if (/DOCUMENTO DE ARRECADACAO DO SIMPLES|\bDAS\b|PGDAS/.test(t)) return 'DAS SIMPLES NACIONAL';
  if (/\bDARF\b|DOCUMENTO DE ARRECADACAO DE RECEITAS FEDERAIS/.test(t)) return 'DARF';
  if (/\bFGTS\b|GFD|GUIA DO FGTS/.test(t)) return 'FGTS';
  if (/\bGPS\b|PREVIDENCIA SOCIAL|\bINSS\b/.test(t)) return 'INSS GPS';
  if (/\bDAE\b/.test(t)) return 'DAE ESTADUAL';
  if (/\bDAM\b|\bISS\b/.test(t)) return 'ISS MUNICIPAL';

  var linhas = String(texto).split(/\n/);
  for (var i = 0; i < linhas.length; i++) {
    var l = linhas[i];
    var m = l.match(/(?:BENEFICI[ÁA]RIO|CEDENTE)\s*(?:FINAL)?\s*[:\-]?\s*(.*)/i);
    if (m) {
      var nome = m[1].trim();
      if (!nome || /^(CNPJ|CPF|AG[EÊ]NCIA|C[ÓO]DIGO)/i.test(nome)) nome = (linhas[i + 1] || '').trim();
      nome = limparNome(nome);
      if (nome.length >= 3) return nome;
    }
  }
  var nomeRem = String(remetente || '').replace(/<.*>/, '').replace(/"/g, '').trim();
  return limparNome(nomeRem || nomeArq.replace(/\.pdf$/i, ''));
}

function limparNome(s) {
  return normalizar(s)
    .replace(/\s*(-\s*)?(CNPJ|CPF)[\s:]*[\d./-]+.*/, '')
    .replace(/\b(LTDA|S\/?A|EIRELI|ME|EPP|S\.A\.)\b\.?/g, '')
    .replace(/[\\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ').trim().substr(0, 40).trim();
}

function extrairDados(texto, nomeArq, assunto, remetente) {
  var cod = acharCodigo(texto);
  var r = cod ? (cod.tipo === 'boleto' ? lerBoletoBancario(cod.digitos)
                                       : lerArrecadacao(cod.digitos))
              : { valor: null, vencimento: null };
  return {
    temCodigo: !!cod,
    vencimento: vencimentoDoTexto(texto) || r.vencimento,
    valor: r.valor !== null ? r.valor : valorDoTexto(texto),
    fornecedor: fornecedorDoTexto(texto, nomeArq, remetente)
  };
}

function formatarValor(v) {
  var partes = v.toFixed(2).split('.');
  return partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + partes[1];
}

function formatarData(d) {
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return p(d.getUTCDate()) + '.' + p(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear();
}

/** Padrão do escritório: "01.10.2026 SIN IMPLANT R$ 528,96.pdf" */
function montarNome(venc, fornecedor, valor) {
  return (venc ? formatarData(venc) : 'SEM DATA') + ' ' + fornecedor + ' R$ ' +
         (valor !== null ? formatarValor(valor) : 'SEM VALOR') + '.pdf';
}

// ============================== GOOGLE (Drive/Gmail) ==============================

/** Converte o PDF num Google Doc temporário (OCR) só para ler o texto. */
function extrairTextoPdf_(anexo) {
  var blob = anexo.copyBlob();
  var doc = Drive.Files.create(
    { name: 'tmp-ocr-' + Date.now(), mimeType: 'application/vnd.google-apps.document' },
    blob, { ocrLanguage: 'pt' });
  try {
    return DocumentApp.openById(doc.id).getBody().getText();
  } finally {
    Drive.Files.remove(doc.id);
  }
}

function pastaDestino_(pastaCpId, venc) {
  var cp = DriveApp.getFolderById(pastaCpId);
  if (!CONFIG.USAR_SUBPASTA_MES || !venc) return cp;
  var mes = venc.getUTCMonth();
  var ano = venc.getUTCFullYear();
  var prefixo = (mes < 9 ? '0' : '') + (mes + 1) + '.';
  var it = cp.getFolders();
  while (it.hasNext()) {
    var f = it.next();
    var n = f.getName();
    if (n.indexOf(prefixo) === 0 && n.indexOf(String(ano)) >= 0) return f;
  }
  return cp.createFolder(prefixo + ' ' + MESES[mes] + ' ' + ano);
}

function pastaAClassificar_() {
  var it = DriveApp.getRootFolder().getFoldersByName(CONFIG.PASTA_A_CLASSIFICAR);
  return it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(CONFIG.PASTA_A_CLASSIFICAR);
}

function obterRotulo_(nome) {
  return GmailApp.getUserLabelByName(nome) || GmailApp.createLabel(nome);
}

function enviarRelatorio_(programados, pendentes) {
  var hoje = formatarData(new Date(Date.UTC(new Date().getFullYear(),
    new Date().getMonth(), new Date().getDate())));
  var total = programados.reduce(function (s, r) { return s + (r.valor || 0); }, 0);
  var linha = function (r, extra) {
    return '<tr><td>' + esc_(r.cliente) + '</td><td>' + esc_(r.fornecedor) +
      '</td><td>' + (r.vencimento ? formatarData(r.vencimento) : '—') +
      '</td><td style="text-align:right">' + (r.valor !== null ? 'R$ ' + formatarValor(r.valor) : '—') +
      '</td><td>' + (r.link ? '<a href="' + r.link + '">' + esc_(r.novoNome) + '</a>' : esc_(r.original)) +
      '</td>' + (extra ? '<td>' + esc_(r.motivo) + '</td>' : '') + '</tr>';
  };
  var cab = '<tr style="background:#eee"><th>Cliente</th><th>Fornecedor</th>' +
    '<th>Vencimento</th><th>Valor</th><th>Arquivo</th>';

  var html = '<h2>Contas a Pagar — programação de ' + hoje + '</h2>';
  html += '<p><b>' + programados.length + '</b> documento(s) salvo(s) e renomeado(s) ' +
          'no Drive, total <b>R$ ' + formatarValor(total) + '</b>.</p>';
  if (programados.length) {
    html += '<table border="1" cellpadding="6" style="border-collapse:collapse">' + cab +
            '</tr>' + programados.map(function (r) { return linha(r, false); }).join('') + '</table>';
  }
  if (pendentes.length) {
    html += '<h3 style="color:#b00">⚠ ' + pendentes.length + ' precisam de conferência manual</h3>' +
      '<table border="1" cellpadding="6" style="border-collapse:collapse">' + cab +
      '<th>Motivo</th></tr>' + pendentes.map(function (r) { return linha(r, true); }).join('') +
      '</table><p>Os e-mails ficaram com o rótulo <b>' + CONFIG.ROTULO_PENDENTE + '</b>.</p>';
  }
  html += '<p style="color:#888">Valores e datas foram lidos automaticamente do PDF ' +
          '(linha digitável/texto). Confira antes de pagar.</p>';

  var assunto = (pendentes.length ? '⚠ ' : '✅ ') + 'CP ' + hoje + ': ' +
    programados.length + ' programado(s)' +
    (pendentes.length ? ', ' + pendentes.length + ' pendente(s)' : '');
  MailApp.sendEmail({ to: CONFIG.EMAIL_RELATORIO, subject: assunto, htmlBody: html });
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Permite testar as funções puras fora do Google (node).
if (typeof module !== 'undefined') {
  module.exports = { CONFIG: CONFIG, classificarArquivo: classificarArquivo,
    identificarCliente: identificarCliente, lerBoletoBancario: lerBoletoBancario,
    lerArrecadacao: lerArrecadacao, acharCodigo: acharCodigo, extrairDados: extrairDados,
    montarNome: montarNome, formatarValor: formatarValor };
}
