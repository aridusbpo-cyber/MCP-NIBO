# 🔌 MCP do Nibo — conecte o Claude ao seu Nibo

Este pacote liga o **Claude** ao **Nibo** (API `empresas/v1`) — leitura e, se você liberar, escrita — com suporte a **várias empresas/clientes** no mesmo servidor. Feito para BPO.

> 🔒 **Sem segredos aqui dentro.** Este pacote **não contém token nenhum**. Cada um coloca os **seus próprios** ApiTokens do Nibo, que ficam guardados **só na sua máquina** (em `%USERPROFILE%\.nibo-mcp\empresas.json`, que nunca é compartilhado).

---

## ✅ Requisitos
- **Claude Code** ou **Claude Desktop** instalado.
- **Python 3.10+** (na instalação, marque *"Add python.exe to PATH"*).

## 🚀 Instalação em 3 passos

**1) Rode o instalador**
- Clique com o **botão direito** em `INSTALAR.ps1` → **"Executar com PowerShell"**.
- Se o Windows bloquear, abra o PowerShell nesta pasta e rode:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\INSTALAR.ps1
  ```
O instalador cuida de tudo: instala dependências, copia o servidor, **registra o MCP no Claude sem token** e cria um cadastro vazio pra você preencher.

**2) Coloque os seus tokens do Nibo** (uma das formas):
- **Pelo chat** (reinicie o Claude primeiro):
  > *"cadastre no Nibo a empresa cliente-a, nome 'Cliente A Ltda', token SEU_TOKEN"*
- **Ou editando o arquivo:** `%USERPROFILE%\.nibo-mcp\empresas.json`

> Onde pegar o token no Nibo: **Configurações → Integrações/API**.

**3) Teste**
Reinicie o Claude e peça:
> *"status da conexão com o Nibo"*

Ele testa todas as empresas cadastradas e mostra se algum token expirou.

---

## 🔐 Segurança (leia rápido)

- O instalador deixa a **escrita DESLIGADA** (`NIBO_ALLOW_WRITE=0`) — começa só leitura.
- Para **liberar escrita** depois, precisa de **3 travas juntas**:
  1. `NIBO_ALLOW_WRITE=1` no config do MCP (libera a máquina);
  2. `"escrita": true` na empresa (libera aquele cliente);
  3. `confirmar=true` na operação (libera aquela ação).
- Toda escrita **exige dizer a empresa explicitamente** — proteção contra lançar no cliente errado.
- `listar_empresas` e `status_conexao` **mascaram o token** (só os 4 últimos dígitos).

---

## 🧰 O que tem no pacote
| Arquivo | Função |
|---|---|
| `INSTALAR.ps1` | Instalador automático (rode este) |
| `instalar_config.py` | Auxiliar do instalador (registra o MCP no Claude com segurança) |
| `LEIA-ME.md` | Este guia rápido |
| `MANUAL-COMPLETO.md` | Documentação detalhada (todas as ferramentas, OData, troubleshooting) |
| `server.py` | O servidor MCP |
| `requirements.txt` | Dependências Python |
| `empresas.exemplo.json` | Modelo do cadastro (placeholders, sem token) |
| `.gitignore` | Impede versionar tokens |

Detalhes de ferramentas, filtros OData e solução de problemas: veja o **`MANUAL-COMPLETO.md`**.

---

*Material de mentoria BPO Class — pode distribuir. Cada mentorado usa os próprios tokens.*
