# 📥 Automação de Contas a Pagar (Gmail → Drive → alerta)

Todo dia às 7h este script, rodando **na sua própria conta Google**:

1. Procura no Gmail e-mails com PDF dos últimos 3 dias: tudo da **R&S Assessoria Contábil** (`rsassessoriacont@gmail.com`) e, de qualquer outro remetente, PDFs que sejam boleto ou guia.
2. Ignora o que não é conta a pagar (folha, recibo, holerite, nota fiscal, contrato…).
3. Lê o PDF (OCR do Google) e tira **vencimento, valor e fornecedor**. Usa a linha digitável do boleto/guia (conferindo os dígitos verificadores) e, se não achar, o texto do documento.
4. Descobre o **cliente** (primeiro pelo assunto e nome do arquivo, depois pelo texto do PDF: nome, CNPJ…) e salva em `03. Contas a Pagar / MM. Mês AAAA` da pasta dele.
5. Renomeia no padrão do escritório: `01.10.2026 SIN IMPLANT R$ 528,96.pdf`.
6. Marca o e-mail com o rótulo `CP-Processado` (ou `CP-Pendente`, se faltou algum dado) e **te manda um e-mail de alerta** com a tabela do que foi programado e do que precisa conferir.

Cada mensagem é processada **uma vez só**: o script guarda o ID dela por 30 dias. Se a contabilidade responder numa conversa antiga com um boleto novo, ele também é lido.

## Instalação (uma vez, ~5 min)

1. Acesse **https://script.google.com** com a conta `aridusbpo@gmail.com` → **Novo projeto**. Dê o nome "Contas a Pagar".
2. Apague o conteúdo do `Código.gs` e cole o conteúdo de **`Code.gs`**.
3. Engrenagem (**Configurações do projeto**):
   - marque **"Mostrar arquivo de manifesto appsscript.json"**;
   - confira o **fuso horário** (o arquivo já vem com `America/Fortaleza`; troque se for outro).
4. Volte ao editor, abra `appsscript.json` e cole o conteúdo do **`appsscript.json`** daqui. Isso já ativa o serviço avançado do Drive (usado no OCR).
5. Configure os clientes (próxima seção).
6. No topo, selecione a função **`processarBoletos`** → **Executar**. Autorize o acesso (Gmail, Drive, Documentos, Planilhas, envio de e-mail). O Google mostra "app não verificado": clique em **Avançado → Acessar Contas a Pagar (não seguro)**. É normal, o script é seu. Esse primeiro teste já processa os e-mails dos últimos 3 dias.
7. Confira o e-mail de alerta e as pastas no Drive.
8. Selecione **`instalarAgendamentoDiario`** → **Executar**. A partir daí roda sozinho todo dia às 7h. Para conferir: menu lateral **Acionadores** (ícone de relógio).

## Mapeamento cliente → pasta

O script precisa saber, para cada cliente, **qual é a pasta "03. Contas a Pagar"** e **quais palavras identificam o cliente** nos e-mails/PDFs. Escolha um dos dois jeitos:

### Opção A — Planilha (recomendada para a equipe)

1. No editor, selecione **`criarPlanilhaDeClientes`** → **Executar**. Ela cria no seu Drive a planilha **"Automação CP — Clientes e pastas"** já preenchida com os clientes de hoje, e mostra o ID no **Registro de execução**.
2. Copie o ID e cole em `PLANILHA_CLIENTES_ID: '...'` no topo do `Code.gs`. Salve. (Pode colar o link inteiro da planilha, também funciona.)
3. Daí em diante, cliente novo é só uma linha nova na planilha, sem mexer no código:

| Cliente | Pasta "03. Contas a Pagar" (link ou ID) | Palavras que identificam o cliente (separe com ;) |
|---|---|---|
| Studio Brendha | https://drive.google.com/drive/folders/1AbC… | BRENDHA; 12.345.678; 12345678 |

### Opção B — Direto no código

Deixe `PLANILHA_CLIENTES_ID: ''` e edite a lista `CLIENTES` no topo do `Code.gs`: copie uma linha, troque o nome, o ID da pasta (o final do link da pasta, depois de `/folders/`) e as palavras.

### Dicas para as palavras-chave

- **O CNPJ é a chave mais segura.** Coloque com e sem pontuação (`41.625.338` e `41625338`); o começo do CNPJ (8 dígitos) já basta.
- Evite palavras muito comuns sozinhas (ex.: só `FELIPE`): podem aparecer no PDF de outro cliente. Prefira nome + sobrenome.
- A comparação ignora maiúsculas e acentos, e só vale a palavra inteira (`DAS` não bate com `DASHBOARD`).
- Se dois clientes baterem, vale o **primeiro da lista**, olhando antes o assunto e o nome do arquivo e só depois o texto do PDF.
- O que não for identificado vai para a pasta `_CP A CLASSIFICAR` na raiz do Meu Drive e aparece em vermelho no alerta.

## Outros ajustes (bloco `CONFIG` no topo do `Code.gs`)

- **Outro remetente confiável** (outra contabilidade): adicione em `REMETENTES_CONFIAVEIS`.
- **Quem recebe o alerta:** `EMAIL_RELATORIO`.
- **Horário:** `HORA_EXECUCAO` (depois de mudar, rode `instalarAgendamentoDiario` de novo).
- **Sem subpasta do mês:** `USAR_SUBPASTA_MES: false`.
- **Reprocessar** os últimos 3 dias (ex.: depois de corrigir a planilha de clientes): rode `esquecerMensagensProcessadas` e depois `processarBoletos`. Arquivos que já existem com o mesmo nome não são duplicados.

## Limitações (leia)

- **Confira antes de pagar.** Vencimento e valor são lidos automaticamente. No boleto bancário eles vêm da linha digitável (bem confiável, os dígitos verificadores são conferidos). Nas guias (DARF/DAS/FGTS) o valor vem do código de barras, mas o **vencimento vem do texto** do PDF e o OCR pode falhar. Quando falta algum dado, o arquivo é salvo como `SEM DATA`/`SEM VALOR` (com o nome original entre parênteses) e aparece em vermelho no alerta.
- **Boleto com valor em branco** (ex.: "valor a critério do pagador") cai no valor do texto do PDF ou fica `SEM VALOR`.
- **Limite de tempo do Google:** cada execução para em ~5 min. Se houver muitos PDFs, o resto fica para a execução seguinte, e o alerta avisa.
- O alerta só é enviado nos dias em que houve algum documento.

## Testes (opcional, para quem for mexer no código)

As regras de leitura (linha digitável, datas, valores, cliente, nome do arquivo) podem ser testadas fora do Google, com Node.js:

```bash
node automacao-boletos/teste.js
```
