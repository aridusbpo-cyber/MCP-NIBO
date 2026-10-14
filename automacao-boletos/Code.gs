/**
 * Automação de Contas a Pagar — Aridus BPO
 *
 * Todo dia: lê o Gmail, pega os PDFs de boletos/guias (R&S Assessoria Contábil
 * e qualquer outro remetente), salva na pasta "03. Contas a Pagar" do cliente
 * (subpasta do mês de vencimento), renomeia no padrão
 *     DD.MM.AAAA FORNECEDOR R$ 0.000,00.pdf
 * marca o e-mail como processado e envia um e-mail de alerta com o que foi
 * programado e o que ficou pendente.
 *
 * Instalação: veja LEIA-ME.md nesta pasta.
 */

// ============================== CONFIGURAÇÃO ==============================

var CONFIG = {
  // Quem recebe o relatório de alerta.
  EMAIL_RELATORIO: 'aridusbpo@gmail.com',

  // Busca no Gmail: e-mails com PDF dos últimos 3 dias. Cada mensagem é
  // processada uma única vez (o script guarda o ID dela), então uma resposta
  // nova dentro de uma conversa antiga também é lida.
  BUSCA_GMAIL: 'has:attachment filename:pdf newer_than:3d -in:sent',

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

  // Mapeamento cliente -> pasta. Duas opções (veja o LEIA-ME):
  //  a) Planilha: coloque aqui o ID (ou o link) da planilha de clientes.
  //     Rode criarPlanilhaDeClientes() uma vez para gerar uma já preenchida.
  //  b) Deixe vazio e use a lista CLIENTES logo abaixo.
  PLANILHA_CLIENTES_ID: '',

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

  HORA_EXECUCAO: 7, // hora do dia (fuso do projeto) para a execução diária

  // O Google encerra o script em 6 min. Para antes disso; o que sobrar fica
  // para a próxima execução (a busca cobre 3 dias).
  LIMITE_MINUTOS: 5,

  // Por quantos dias o script lembra das mensagens já processadas.
  DIAS_MEMORIA: 30
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
  console.log('Agendado: todo dia às ' + CONFIG.HORA_EXECUCAO + 'h.');
}

/** Rotina principal (chamada pelo agendamento diário ou manualmente). */
function processarBoletos() {
  var inicio = Date.now();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) { console.log('Já existe uma execução em andamento.'); return; }
  try {
    processar_(inicio);
  } finally {
    lock.releaseLock();
  }
}

function processar_(inicio) {
  var clientes = carregarClientes_();
  var memoria = PropertiesService.getScriptProperties();
  limparMemoria_(memoria);
  var rotOk = obterRotulo_(CONFIG.ROTULO_PROCESSADO);
  var rotPend = obterRotulo_(CONFIG.ROTULO_PENDENTE);
  var programados = [];
  var pendentes = [];
  var interrompido = false;

  var threads = GmailApp.search(CONFIG.BUSCA_GMAIL, 0, 100);
  for (var t = 0; t < threads.length && !interrompido; t++) {
    var thread = threads[t];
    var salvos = 0;
    var temPendencia = false;
    var msgs = thread.getMessages();

    for (var m = 0; m < msgs.length; m++) {
      var msg = msgs[m];
      var chave = 'msg:' + msg.getId();
      if (memoria.getProperty(chave)) continue;
      // A busca traz a conversa inteira; mensagens antigas dela ficam de fora.
      if (msg.getDate().getTime() < inicio - 4 * 86400000) continue;
      if (Date.now() - inicio > CONFIG.LIMITE_MINUTOS * 60000) { interrompido = true; break; }

      var r = processarMensagem_(msg, clientes);
      programados = programados.concat(r.programados);
      pendentes = pendentes.concat(r.pendentes);
      salvos += r.programados.length + r.pendentes.length;
      if (r.pendentes.length) temPendencia = true;
      memoria.setProperty(chave, String(Date.now()));
    }
    if (temPendencia) thread.addLabel(rotPend);
    else if (salvos) thread.addLabel(rotOk);
  }

  if (programados.length || pendentes.length || interrompido) {
    enviarRelatorio_(programados, pendentes, interrompido);
  }
  console.log('Programados: ' + programados.length + ' | Pendentes: ' + pendentes.length +
              (interrompido ? ' | interrompido por tempo' : ''));
}

function processarMensagem_(msg, clientes) {
  var out = { programados: [], pendentes: [] };
  var remetente = msg.getFrom();
  var assunto = msg.getSubject();
  var confiavel = CONFIG.REMETENTES_CONFIAVEIS.some(function (r) {
    return remetente.toLowerCase().indexOf(r.toLowerCase()) >= 0;
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
      // linha digitável válida (é de fato um boleto/guia).
      if (classe === 'talvez' && !dados.temCodigo) return;

      var cliente = identificarCliente(assunto + ' ' + nomeArq, texto, clientes);
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
      var novoNome = montarNome(dados.vencimento, dados.fornecedor, dados.valor,
                                faltando.length ? nomeArq : null);

      // Mesmo nome = mesmo documento (reenvio): não duplica.
      var existente = pasta.getFilesByName(novoNome);
      var arquivo = existente.hasNext()
        ? existente.next()
        : pasta.createFile(anexo.copyBlob().setName(novoNome));
      registro.link = arquivo.getUrl();
      registro.novoNome = novoNome;
      registro.pasta = pasta.getName();

      if (faltando.length) {
        registro.motivo = 'Não consegui ler: ' + faltando.join(', ');
        out.pendentes.push(registro);
      } else {
        out.programados.push(registro);
      }
    } catch (e) {
      out.pendentes.push({ cliente: '-', fornecedor: '-', vencimento: null,
        valor: null, original: nomeArq, assunto: assunto, remetente: remetente,
        link: '', motivo: 'Erro: ' + e.message });
    }
  });
  return out;
}

// ============================== REGRAS (funções puras) ==============================

function normalizar(s) {
  return String(s || '').toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function escaparRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
}

/** true se a palavra/expressão aparece inteira (não como pedaço de outra). */
function contemTermo(textoNormalizado, termo) {
  var t = normalizar(termo).trim();
  if (!t) return false;
  return new RegExp('(^|[^A-Z0-9])' + escaparRegex(t) + '([^A-Z0-9]|$)').test(textoNormalizado);
}

/** 'sim' = conta a pagar | 'ignorar' = não é | 'talvez' = decidir pelo conteúdo */
function classificarArquivo(nomeArq, assunto, remetenteConfiavel) {
  var n = normalizar(nomeArq.replace(/\.pdf$/i, '').replace(/[_\-.]+/g, ' '));
  var contem = function (lista) {
    return lista.some(function (p) { return contemTermo(n, p); });
  };
  if (contem(CONFIG.PALAVRAS_IGNORAR)) return 'ignorar';
  if (contem(CONFIG.PALAVRAS_PAGAVEL)) return 'sim';
  if (/BOLETO|COBRAN|FATURA|GUIA|VENCIMENTO/.test(normalizar(assunto))) return 'sim';
  return remetenteConfiavel ? 'sim' : 'talvez';
}

/**
 * Procura o cliente primeiro no assunto + nome do arquivo (mais confiável) e,
 * se não achar, no texto do PDF. Vale o primeiro cliente da lista que bater.
 */
function identificarCliente(cabecalho, textoPdf, clientes) {
  clientes = clientes || CONFIG.CLIENTES;
  var fontes = [normalizar(cabecalho), normalizar(textoPdf)];
  for (var f = 0; f < fontes.length; f++) {
    for (var i = 0; i < clientes.length; i++) {
      var c = clientes[i];
      for (var j = 0; j < c.chaves.length; j++) {
        if (contemTermo(fontes[f], c.chaves[j])) return c;
      }
    }
  }
  return null;
}

/** Dígito verificador módulo 10 (pesos 2,1,2,1... da direita para a esquerda). */
function modulo10(num) {
  var soma = 0, peso = 2;
  for (var i = num.length - 1; i >= 0; i--) {
    var p = parseInt(num.charAt(i), 10) * peso;
    soma += p > 9 ? Math.floor(p / 10) + (p % 10) : p;
    peso = peso === 2 ? 1 : 2;
  }
  var r = soma % 10;
  return r === 0 ? 0 : 10 - r;
}

/** Módulo 11 da arrecadação (pesos 2..9; resto 0 ou 1 => DV 0). */
function modulo11Arrecadacao(num) {
  var soma = 0, peso = 2;
  for (var i = num.length - 1; i >= 0; i--) {
    soma += parseInt(num.charAt(i), 10) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  var r = soma % 11;
  return (r === 0 || r === 1) ? 0 : 11 - r;
}

/** Linha digitável de boleto bancário (47 dígitos): confere os 3 DVs dos campos. */
function boletoValido(d) {
  if (!/^\d{47}$/.test(d)) return false;
  return modulo10(d.substr(0, 9)) === +d.charAt(9) &&
         modulo10(d.substr(10, 10)) === +d.charAt(20) &&
         modulo10(d.substr(21, 10)) === +d.charAt(31);
}

/** Linha digitável de arrecadação/guia (48 dígitos, começa com 8): confere os 4 DVs. */
function arrecadacaoValida(d) {
  if (!/^8\d{47}$/.test(d)) return false;
  var id = d.charAt(2);
  var dv = (id === '6' || id === '7') ? modulo10
         : (id === '8' || id === '9') ? modulo11Arrecadacao : null;
  if (!dv) return false;
  for (var b = 0; b < 4; b++) {
    if (dv(d.substr(b * 12, 11)) !== +d.charAt(b * 12 + 11)) return false;
  }
  return true;
}

/**
 * Boleto bancário (47 dígitos). Os 14 últimos = fator de vencimento (4) + valor (10).
 * Desde 22/02/2025 o fator reiniciou em 1000 (regra Febraban).
 */
function lerBoletoBancario(digitos, hoje) {
  hoje = hoje || new Date();
  var fator = parseInt(digitos.substr(33, 4), 10);
  var valor = parseInt(digitos.substr(37, 10), 10) / 100;
  var venc = null;
  if (fator >= 1000) {
    venc = new Date(Date.UTC(2025, 1, 22) + (fator - 1000) * 86400000);
    // Fator do ciclo antigo (antes de 22/02/2025) cai muito no futuro: descarta.
    if (venc.getUTCFullYear() > hoje.getUTCFullYear() + 5) venc = null;
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

/**
 * Acha a linha digitável no texto do PDF. Só aceita sequências com dígitos
 * verificadores corretos, então números soltos (CNPJ, nosso número) não passam.
 */
function acharCodigo(texto) {
  var linhas = String(texto || '').split(/\n/);
  // 1) linha a linha; 2) texto inteiro (OCR às vezes quebra a linha digitável)
  var blocos = linhas.concat([linhas.join(' ')]);
  for (var b = 0; b < blocos.length; b++) {
    var corridas = blocos[b].replace(/[.\-\s]/g, '').match(/\d{47,}/g) || [];
    for (var c = 0; c < corridas.length; c++) {
      var s = corridas[c];
      for (var i = 0; i + 47 <= s.length; i++) {
        var d48 = s.substr(i, 48);
        if (d48.length === 48 && arrecadacaoValida(d48)) return { tipo: 'arrecadacao', digitos: d48 };
        var d47 = s.substr(i, 47);
        if (d47.charAt(0) !== '8' && boletoValido(d47)) return { tipo: 'boleto', digitos: d47 };
      }
    }
  }
  return null;
}

function parseDataBR(s) {
  var m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  var d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return (d.getUTCMonth() === +m[2] - 1) ? d : null;
}

function parseValorBR(s) {
  var m = String(s).match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
  return m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) : null;
}

function vencimentoDoTexto(texto) {
  var m = normalizar(texto).match(/(?:VENCIMENTO|VENCTO|PAGAR (?:ESTE DOCUMENTO )?ATE|PAGAVEL ATE|DATA DE VENC\w*|VALIDADE)[^\d]{0,40}(\d{2}\/\d{2}\/\d{4})/);
  return m ? parseDataBR(m[1]) : null;
}

function valorDoTexto(texto) {
  var m = normalizar(texto).match(/(?:VALOR (?:DO DOCUMENTO|COBRADO|TOTAL|A PAGAR|A RECOLHER)|TOTAL A (?:PAGAR|RECOLHER)|\(=\) ?VALOR)[^\d]{0,40}(\d{1,3}(?:\.\d{3})*,\d{2})/);
  return m ? parseValorBR(m[1]) : null;
}

function fornecedorDoTexto(texto, nomeArq, remetente) {
  var t = normalizar(texto + ' ' + nomeArq);
  if (/DOCUMENTO DE ARRECADACAO DO SIMPLES|\bDAS\b|PGDAS/.test(t)) return 'DAS SIMPLES NACIONAL';
  if (/\bDARF\b|DOCUMENTO DE ARRECADACAO DE RECEITAS FEDERAIS/.test(t)) return 'DARF';
  if (/\bFGTS\b|\bGFD\b|GUIA DO FGTS/.test(t)) return 'FGTS';
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
  return limparNome(nomeRem || nomeArq.replace(/\.pdf$/i, '')) || 'FORNECEDOR';
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
    // Boleto: a linha digitável é a fonte mais confiável; guia: só o texto.
    vencimento: r.vencimento || vencimentoDoTexto(texto),
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

/**
 * Padrão do escritório: "01.10.2026 SIN IMPLANT R$ 528,96.pdf".
 * Se faltou algum dado, acrescenta o nome original para dois documentos
 * incompletos do mesmo fornecedor não ficarem com o mesmo nome.
 */
function montarNome(venc, fornecedor, valor, nomeOriginal) {
  var nome = (venc ? formatarData(venc) : 'SEM DATA') + ' ' + fornecedor + ' R$ ' +
             (valor !== null ? formatarValor(valor) : 'SEM VALOR');
  if (nomeOriginal) {
    nome += ' (' + nomeOriginal.replace(/\.pdf$/i, '').replace(/[\\\/:*?"<>|]/g, ' ').trim() + ')';
  }
  return nome + '.pdf';
}

// ============================== GOOGLE (Drive/Gmail/Sheets) ==============================

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

/** Lê o mapeamento da planilha (se configurada) ou da lista CONFIG.CLIENTES. */
function carregarClientes_() {
  if (!CONFIG.PLANILHA_CLIENTES_ID) return CONFIG.CLIENTES;
  var linhas = SpreadsheetApp.openById(extrairId(CONFIG.PLANILHA_CLIENTES_ID))
    .getSheets()[0].getDataRange().getDisplayValues();
  return clientesDaPlanilha(linhas);
}

/** Linhas da planilha (com cabeçalho) -> lista de clientes. Ignora linhas incompletas. */
function clientesDaPlanilha(linhas) {
  var out = [];
  for (var i = 1; i < linhas.length; i++) {
    var nome = String(linhas[i][0] || '').trim();
    var pasta = extrairId(linhas[i][1]);
    var chaves = String(linhas[i][2] || '').split(/[;\n]/)
      .map(function (s) { return s.trim(); }).filter(String);
    if (nome && pasta) out.push({ nome: nome, pastaId: pasta, chaves: chaves.length ? chaves : [nome] });
  }
  return out;
}

/** Aceita o ID puro ou o link do Drive/Planilhas e devolve só o ID. */
function extrairId(s) {
  s = String(s || '').trim();
  var m = s.match(/\/(?:folders|d)\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/);
  return m ? m[1] : s;
}

/** Rode UMA vez se quiser gerenciar os clientes numa planilha. */
function criarPlanilhaDeClientes() {
  var ss = SpreadsheetApp.create('Automação CP — Clientes e pastas');
  var aba = ss.getSheets()[0];
  aba.setName('Clientes');
  var linhas = [['Cliente', 'Pasta "03. Contas a Pagar" (link ou ID)',
                 'Palavras que identificam o cliente (separe com ;)']];
  CONFIG.CLIENTES.forEach(function (c) {
    linhas.push([c.nome, 'https://drive.google.com/drive/folders/' + c.pastaId, c.chaves.join('; ')]);
  });
  aba.getRange(1, 1, linhas.length, 3).setValues(linhas);
  aba.getRange(1, 1, 1, 3).setFontWeight('bold');
  aba.setFrozenRows(1);
  aba.autoResizeColumns(1, 3);
  console.log('Planilha criada. Copie este ID para CONFIG.PLANILHA_CLIENTES_ID: ' + ss.getId());
  console.log(ss.getUrl());
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

/** Esquece mensagens processadas há mais de DIAS_MEMORIA dias. */
function limparMemoria_(memoria) {
  var limite = Date.now() - CONFIG.DIAS_MEMORIA * 86400000;
  var props = memoria.getProperties();
  Object.keys(props).forEach(function (k) {
    if (k.indexOf('msg:') === 0 && +props[k] < limite) memoria.deleteProperty(k);
  });
}

/** Para reprocessar tudo dos últimos 3 dias (ex.: depois de mudar a configuração). */
function esquecerMensagensProcessadas() {
  var memoria = PropertiesService.getScriptProperties();
  Object.keys(memoria.getProperties()).forEach(function (k) {
    if (k.indexOf('msg:') === 0) memoria.deleteProperty(k);
  });
}

function enviarRelatorio_(programados, pendentes, interrompido) {
  var hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy');
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
  if (interrompido) {
    html += '<p style="color:#b60"><b>A execução parou por tempo.</b> O restante será ' +
            'processado na próxima execução (ou rode processarBoletos manualmente).</p>';
  }
  html += '<p style="color:#888">Valores e datas foram lidos automaticamente do PDF ' +
          '(linha digitável/texto). Confira antes de pagar.</p>';

  var assunto = (pendentes.length || interrompido ? '⚠ ' : '✅ ') + 'CP ' + hoje + ': ' +
    programados.length + ' programado(s)' +
    (pendentes.length ? ', ' + pendentes.length + ' pendente(s)' : '');
  MailApp.sendEmail({ to: CONFIG.EMAIL_RELATORIO, subject: assunto, htmlBody: html });
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Permite testar as funções puras fora do Google (node teste.js).
if (typeof module !== 'undefined') {
  module.exports = { CONFIG: CONFIG, classificarArquivo: classificarArquivo,
    identificarCliente: identificarCliente, lerBoletoBancario: lerBoletoBancario,
    lerArrecadacao: lerArrecadacao, acharCodigo: acharCodigo, extrairDados: extrairDados,
    montarNome: montarNome, formatarValor: formatarValor, modulo10: modulo10,
    modulo11Arrecadacao: modulo11Arrecadacao, boletoValido: boletoValido,
    arrecadacaoValida: arrecadacaoValida, clientesDaPlanilha: clientesDaPlanilha,
    extrairId: extrairId, vencimentoDoTexto: vencimentoDoTexto, valorDoTexto: valorDoTexto };
}
