# MCP do Nibo · Multi-empresa

Servidor MCP que conecta o Claude ao **Nibo** (API `empresas/v1`), com **leitura e escrita**,
suportando **várias empresas/clientes no mesmo servidor**.

Feito para BPO: cada cliente tem seu próprio ApiToken, e você escolhe a empresa em cada pergunta.

---

## Como funciona

O código **não guarda token nenhum**. Os tokens ficam num arquivo separado, fora da pasta do projeto:

```
~/.nibo-mcp/empresas.json
(no Windows: C:\Users\<seu-usuario>\.nibo-mcp\empresas.json)
```

```json
{
  "padrao": "cliente-a",
  "empresas": {
    "cliente-a": { "nome": "Cliente A Ltda", "token": "APITOKEN_DO_CLIENTE_A", "escrita": false },
    "cliente-b": { "nome": "Cliente B ME",   "token": "APITOKEN_DO_CLIENTE_B", "escrita": true  }
  }
}
```

- **apelido** (a chave, ex. `cliente-a`): como você se refere ao cliente no chat.
- **padrao**: empresa usada nas leituras quando você não disser qual.
- **escrita**: libera alteração de dados naquele cliente específico.

O arquivo é **lido a cada chamada** — cadastrar um cliente novo vale na hora, sem reiniciar o Claude.

**Onde o servidor procura**, em ordem (o primeiro que existir vence):

1. o caminho em `NIBO_EMPRESAS_FILE`
2. `~/.nibo-mcp/empresas.json`
3. `%USERPROFILE%\.nibo-mcp\empresas.json`
4. `%HOMEDRIVE%%HOMEPATH%\.nibo-mcp\empresas.json`
5. `empresas.json` na mesma pasta do `server.py` (instalação portátil)
6. `.nibo-mcp/empresas.json` na pasta acima do `server.py`

> Os candidatos 5 e 6 existem porque o **Claude Desktop da Microsoft Store** roda num contêiner
> onde a pasta do usuário resolve para um caminho virtualizado — sem eles, o servidor não acha
> o cadastro quando chamado pelo Desktop. Se nada for encontrado e existir `NIBO_API_TOKEN` no env,
> ele usa esse token e **avisa** em `listar_empresas`/`status_conexao` que caiu no modo antigo.

> Use `empresas.exemplo.json` como modelo. O `.gitignore` já impede que `empresas.json` seja versionado.

### Usar os mesmos tokens em vários computadores

**Opção A — pasta sincronizada (recomendado para PCs Windows).** Guarde o `empresas.json` numa
pasta do OneDrive, Google Drive (app para desktop) ou Dropbox e aponte `NIBO_EMPRESAS_FILE` para ele.
O `INSTALAR.ps1` faz isso sozinho: na pergunta *"Onde guardar os tokens das empresas?"* escolha
**[2] Na nuvem** (ou **[3]** e informe a pasta). Se já existir um cadastro local, ele é copiado
para a nuvem. Em cada computador novo, rode o instalador e escolha a mesma pasta — os tokens
cadastrados num computador aparecem nos outros assim que a pasta sincronizar.

> ⚠️ Os tokens ficam em **texto puro** dentro dessa pasta. Use só uma conta de nuvem sua, com
> verificação em duas etapas, e **não compartilhe** a pasta com ninguém.

**Opção B — variáveis de ambiente (sessões do Claude na nuvem, ou máquinas sem a pasta).**
Cada empresa pode vir de uma variável `NIBO_TOKEN_<APELIDO>`:

| Variável | Efeito |
|---|---|
| `NIBO_TOKEN_DRA_CAMILA` | cria a empresa `dra-camila` com esse token |
| `NIBO_NOME_DRA_CAMILA` | (opcional) nome exibido |
| `NIBO_ESCRITA_DRA_CAMILA=1` | (opcional) libera escrita nessa empresa |
| `NIBO_PADRAO=dra-camila` | (opcional) empresa padrão quando não houver arquivo |

Underscore no nome da variável vira hífen no apelido. Se o mesmo apelido existir no arquivo,
**o arquivo prevalece**. Empresas vindas do env nunca são gravadas no `empresas.json`, e
`listar_empresas` mostra `"origem": "env"` para elas.

---

## Instalação

### Passo 1 — Python e dependências
Python 3.10+ instalado ("Add to PATH" marcado). Depois:
```
pip install -r "caminho\para\nibo-mcp\requirements.txt"
```
(ou: `pip install "mcp[cli]" httpx`)

### Passo 2 — Registrar o MCP

**Claude Code** (`~/.claude.json`) ou **Claude Desktop** (`%APPDATA%\Claude\claude_desktop_config.json`),
dentro de `mcpServers`:

```json
{
  "mcpServers": {
    "nibo": {
      "type": "stdio",
      "command": "python",
      "args": ["C:\\caminho\\para\\nibo-mcp\\server.py"],
      "env": {
        "NIBO_ALLOW_WRITE": "0"
      }
    }
  }
}
```

Note que **não há token aqui**. Se quiser guardar o cadastro em outro lugar (pasta na nuvem, rede),
acrescente `"NIBO_EMPRESAS_FILE": "C:\\caminho\\empresas.json"` no `env`.

> Se `python` não for encontrado, use o caminho completo do executável.

### Passo 3 — Cadastrar as empresas
Reabra o Claude e peça, no chat:

> *"cadastre no Nibo a empresa cliente-a, nome 'Cliente A Ltda', token XXXX"*

(o Claude chama `adicionar_empresa`). Ou edite o `empresas.json` na mão.

### Passo 4 — Testar
> *"status da conexão com o Nibo"* → testa **todas** as empresas cadastradas de uma vez
> e mostra qual token está expirado.

---

## Compartilhando com outro escritório de BPO

Mande **só a pasta do projeto** (`server.py`, `requirements.txt`, `empresas.exemplo.json`,
`.gitignore`, este LEIA-ME). Ela não contém credencial alguma.

O outro escritório faz os passos 1 a 4 acima e cadastra **os clientes dele**. Nenhum dado
seu vai junto — o cadastro vive na máquina de cada um, em `~/.nibo-mcp/empresas.json`.

---

## Segurança da escrita — três travas

Uma alteração só sai se **as três** estiverem liberadas:

1. `"NIBO_ALLOW_WRITE": "1"` no env do MCP — libera a **máquina**;
2. `"escrita": true` na empresa — libera **aquele cliente**;
3. `confirmar=true` na chamada — libera **aquela operação**.

Comece com `NIBO_ALLOW_WRITE=0` e `escrita: false` em todos. Ligue por cliente conforme confiar.

**Toda ferramenta de escrita exige o parâmetro `empresa` explícito** — nunca herda a empresa
padrão. É a proteção contra lançar na contabilidade do cliente errado. Antes de executar,
o Claude devolve uma prévia com o nome da empresa alvo para você conferir.

---

## Ferramentas

**Cadastro:** `listar_empresas`, `adicionar_empresa`, `remover_empresa`,
`definir_empresa_padrao`, `definir_escrita_empresa`.

**Leitura** (parâmetro `empresa` opcional — sem ele usa a padrão):
`status_conexao`, `nibo_get` (genérico), `listar_fornecedores`, `listar_clientes`,
`listar_contas_a_pagar`, `listar_contas_a_receber`, `listar_pagamentos`, `listar_recebimentos`,
`listar_categorias`, `listar_centros_de_custo`, `listar_contas_bancarias`, `itens_a_conciliar`.

**Escrita** (parâmetro `empresa` **obrigatório** + `confirmar=true`):
`nibo_post`, `nibo_put`, `nibo_delete` (genéricos), `criar_fornecedor`,
`criar_conta_a_pagar`, `criar_conta_a_receber`.

`listar_empresas` e `status_conexao` **sempre mascaram o token** (mostram só os 4 últimos
caracteres) — nenhum token completo aparece no chat.

---

## Observações

- A API usa **OData**: dá pra filtrar, ex. *"fornecedores cujo nome começa com A"* → `$filter=startswith(name,'A')`.
- Limite de **500 registros** por chamada (use paginação `skip`).
- **Token expirado** retorna `HTTP 401 · "Api token expirado"`. Gere outro no Nibo
  (**Configurações → Integrações/API**) e rode `adicionar_empresa` com o mesmo apelido para substituir.
- Os **paths de escrita e campos obrigatórios** devem ser conferidos na doc oficial antes de usar:
  https://developer.nibo.com.br e https://nibo.readme.io/reference.
  Se um path estiver diferente, use `nibo_get`/`nibo_post` genérico com o caminho correto.
- **Compatibilidade:** se não existir `empresas.json` mas houver `NIBO_API_TOKEN` no env,
  ele é usado como a empresa `padrao` (instalações antigas continuam funcionando).
