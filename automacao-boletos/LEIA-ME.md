# 📥 Automação de Contas a Pagar (Gmail → Drive → alerta)

Todo dia às 7h este script, rodando **na sua própria conta Google**:

1. Procura no Gmail e-mails com PDF dos últimos 3 dias: tudo da **R&S Assessoria Contábil** (`rsassessoriacont@gmail.com`) e, de qualquer outro remetente, PDFs que sejam boleto ou guia.
2. Ignora o que não é conta a pagar (folha, recibo, holerite, nota fiscal, contrato…).
3. Lê o PDF (OCR do Google) e tira **vencimento, valor e fornecedor**. Usa a linha digitável do boleto/guia e, se não achar, o texto do documento.
4. Descobre o **cliente** (nome, CNPJ, assunto) e salva em `03. Contas a Pagar / MM. Mês AAAA` da pasta dele.
5. Renomeia no padrão do escritório: `01.10.2026 SIN IMPLANT R$ 528,96.pdf`.
6. Coloca o rótulo `CP-Processado` no e-mail (ou `CP-Pendente`, se faltou algum dado) e **te manda um e-mail de alerta** com a tabela do que foi programado e o que precisa conferir.

## Instalação (uma vez, ~5 min)

1. Acesse **https://script.google.com** com a conta `aridusbpo@gmail.com` → **Novo projeto**. Dê o nome "Contas a Pagar".
2. Apague o conteúdo do `Código.gs` e cole o conteúdo de **`Code.gs`**.
3. Engrenagem (**Configurações do projeto**) → marque **"Mostrar arquivo de manifesto appsscript.json"**. Volte ao editor, abra `appsscript.json` e cole o conteúdo do **`appsscript.json`** daqui. Isso já ativa o serviço avançado do Drive.
4. No topo, selecione a função **`processarBoletos`** → **Executar**. Autorize o acesso (Gmail, Drive, envio de e-mail). Esse primeiro teste já processa os e-mails dos últimos 3 dias.
5. Selecione **`instalarAgendamentoDiario`** → **Executar**. A partir daí roda sozinho todo dia às 7h.

## Ajustes

Tudo fica no bloco `CONFIG` no topo do `Code.gs`:

- **Cliente novo:** copie uma linha de `CLIENTES` e troque o ID da pasta "03. Contas a Pagar" (é o final do link da pasta) e as palavras que identificam o cliente.
- **Outro remetente confiável** (outra contabilidade): adicione em `REMETENTES_CONFIAVEIS`.
- **Horário:** `HORA_EXECUCAO`.
- **Sem subpasta do mês:** `USAR_SUBPASTA_MES: false`.

## Limitações (leia)

- **Confira antes de pagar.** Vencimento e valor são lidos automaticamente. No boleto bancário eles vêm da linha digitável (bem confiável). Nas guias (DARF/DAS/FGTS) o valor vem do código de barras, mas o **vencimento vem do texto** do PDF e o OCR pode falhar. Quando falta algum dado, o arquivo é salvo como `SEM DATA`/`SEM VALOR` e aparece em vermelho no alerta.
- **Cliente por palavra-chave:** se o PDF tiver o nome de dois clientes, vale o primeiro da lista. O que não for identificado vai para `_CP A CLASSIFICAR` na raiz do Drive.
- O alerta só é enviado nos dias em que houve algum documento.
