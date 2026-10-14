"""
Servidor MCP para a API do Nibo (empresas/v1) — MULTI-EMPRESA, leitura + escrita.

Autenticação: header  ApiToken: <token>   (um token por empresa).

CADASTRO DE EMPRESAS (fora do código, para o repositório ser compartilhável):
  Arquivo JSON apontado por NIBO_EMPRESAS_FILE.
  Default: ~/.nibo-mcp/empresas.json   (Windows: C:\\Users\\<voce>\\.nibo-mcp\\empresas.json)

  {
    "padrao": "omegaprice",
    "empresas": {
      "omegaprice": {"nome": "Omegaprice Contabilidade", "token": "...", "escrita": true}
    }
  }

  O arquivo é lido A CADA CHAMADA: incluir/remover empresa vale na hora, sem reiniciar.

  Para usar o MESMO cadastro em várias máquinas, guarde o empresas.json numa pasta
  sincronizada (OneDrive, Google Drive, Dropbox) e aponte NIBO_EMPRESAS_FILE para ela.

Env:
  NIBO_EMPRESAS_FILE -> caminho do cadastro (opcional)
  NIBO_TOKEN_<APELIDO> -> token de uma empresa via variável de ambiente (ex.: em
                        sessões na nuvem, onde não há arquivo). Ex.: NIBO_TOKEN_DRA_CAMILA
                        vira a empresa "dra-camila". Opcionais: NIBO_NOME_<APELIDO> e
                        NIBO_ESCRITA_<APELIDO>=1. Se o apelido também estiver no arquivo,
                        o arquivo prevalece. Nunca são gravadas no arquivo.
  NIBO_API_TOKEN     -> compatibilidade: se não houver cadastro, vira a empresa "padrao"
  NIBO_ALLOW_WRITE   -> "1" é a chave-mestra da escrita (default bloqueado)

TRAVAS DE ESCRITA (as três precisam estar ok):
  1) NIBO_ALLOW_WRITE=1                  (máquina)
  2) "escrita": true na empresa           (cliente específico)
  3) confirmar=true na chamada            (operação específica)
  Além disso, toda ferramenta de escrita EXIGE o parâmetro `empresa` explícito —
  nunca cai na empresa padrão, para não lançar na contabilidade do cliente errado.

Base: https://api.nibo.com.br/empresas/v1  | OData | limite 500/chamada.

ENDPOINTS CONFIRMADOS AO VIVO (GET):
  suppliers, customers, categories, cost-centers,
  schedules, schedules/debit (contas a pagar), schedules/credit (contas a receber),
  payments, receipts, accounts (contas bancárias),
  accounts/{accountId}/reconciliation (itens a conciliar — alimentado pelo Open Finance)

FLUXO DE CONCILIAÇÃO (quando o Open Finance jogar extratos no Nibo):
  1) itens_a_conciliar(empresa, account_id)  -> lista o que precisa conciliar
  2) (opcional) cruzar com OFX/extrato fornecido pelo usuário
  3) efetivar a conciliação / dar baixa via ESCRITA — usar nibo_post/nibo_delete
     com o path EXATO confirmado na doc no momento (ver nota abaixo).

NOTA DE SEGURANÇA SOBRE PATHS DE ESCRITA:
  A doc do Nibo é ambígua quanto aos paths de POST (mistura PT/EN). NÃO cravar
  caminho de escrita sem confirmar. Por isso as ferramentas de escrita nomeadas usam
  o padrão REST/EN (ex.: POST suppliers) e há genéricas (nibo_post/put/delete) para
  qualquer endpoint confirmado na doc na hora do uso.
"""

import json
import os
import re
import sys
from pathlib import Path

import httpx
from mcp.server.fastmcp import FastMCP

BASE = "https://api.nibo.com.br/empresas/v1"
ALLOW_WRITE = os.environ.get("NIBO_ALLOW_WRITE", "0").strip() == "1"

_env_file = os.environ.get("NIBO_EMPRESAS_FILE", "").strip()


def _caminhos_possiveis():
    """Onde procurar o cadastro, em ordem de prioridade.

    Apps empacotados (Claude Desktop da Microsoft Store) rodam num contêiner onde
    a pasta do usuário pode resolver para um caminho virtualizado — por isso não
    dá para confiar só em Path.home(). O último candidato é relativo ao próprio
    server.py, que funciona mesmo com a pasta do usuário redirecionada.
    """
    cands = []
    if _env_file:
        cands.append(Path(_env_file))
    bases = [str(Path.home()),
             os.environ.get("USERPROFILE", ""),
             os.environ.get("HOMEDRIVE", "") + os.environ.get("HOMEPATH", "")]
    for base in bases:
        if base.strip():
            cands.append(Path(base) / ".nibo-mcp" / "empresas.json")
    aqui = Path(__file__).resolve().parent
    cands.append(aqui / "empresas.json")
    cands.append(aqui.parent / ".nibo-mcp" / "empresas.json")

    vistos, saida = set(), []
    for c in cands:
        chave = str(c).lower()
        if chave not in vistos:
            vistos.add(chave)
            saida.append(c)
    return saida


def _cadastro_existente():
    for c in _caminhos_possiveis():
        try:
            if c.is_file():
                return c
        except OSError:
            continue
    return None


def _cadastro_destino():
    """Arquivo em uso; se nenhum existir ainda, onde gravar o primeiro."""
    return _cadastro_existente() or _caminhos_possiveis()[0]


def _arquivo_em_uso() -> str:
    return str(_cadastro_destino())

APELIDO_OK = re.compile(r"^[a-z0-9][a-z0-9_-]{1,39}$")

mcp = FastMCP("nibo")


# ----------------- cadastro de empresas -----------------
_ENV_TOKEN = re.compile(r"^NIBO_TOKEN_([A-Z0-9_]+)$")


def _empresas_do_env() -> dict:
    """Empresas definidas por NIBO_TOKEN_<APELIDO> (útil em máquinas/sessões sem arquivo)."""
    saida = {}
    for var, valor in os.environ.items():
        m = _ENV_TOKEN.match(var)
        if not m or not valor.strip():
            continue
        sufixo = m.group(1)
        apelido = sufixo.lower().replace("_", "-")
        if not APELIDO_OK.match(apelido):
            continue
        saida[apelido] = {
            "nome": os.environ.get(f"NIBO_NOME_{sufixo}", "").strip() or f"(env: {var})",
            "token": valor.strip(),
            "escrita": os.environ.get(f"NIBO_ESCRITA_{sufixo}", "0").strip() == "1",
            "_do_env": True,
        }
    return saida


def _carregar() -> dict:
    """Lê o cadastro do disco + env. Sem cache: alterações valem na chamada seguinte."""
    do_env = _empresas_do_env()
    arquivo = _cadastro_existente()
    if arquivo:
        try:
            dados = json.loads(arquivo.read_text(encoding="utf-8"))
        except Exception as e:
            return {"padrao": "", "empresas": {}, "_erro": f"{arquivo} inválido: {e}"}
        empresas = {**do_env, **(dados.get("empresas") or {})}  # arquivo prevalece
        origem = str(arquivo) + (" + variáveis NIBO_TOKEN_*" if do_env else "")
        return {"padrao": (dados.get("padrao") or "").strip(), "empresas": empresas,
                "_origem": origem}

    if do_env:
        padrao = os.environ.get("NIBO_PADRAO", "").strip().lower()
        if padrao not in do_env:
            padrao = sorted(do_env)[0] if len(do_env) == 1 else ""
        return {"padrao": padrao, "empresas": do_env,
                "_origem": "variáveis NIBO_TOKEN_* (nenhum empresas.json encontrado)"}

    # compatibilidade com a instalação antiga de token único.
    # Marcado como fallback para não mascarar um cadastro que o servidor não achou.
    token_env = os.environ.get("NIBO_API_TOKEN", "").strip()
    if token_env:
        return {"padrao": "padrao",
                "empresas": {"padrao": {"nome": "(fallback: NIBO_API_TOKEN do env)",
                                        "token": token_env, "escrita": True}},
                "_origem": "NIBO_API_TOKEN (env) — nenhum empresas.json encontrado",
                "_aviso": "Cadastro de empresas NÃO encontrado; usando o token único do env. "
                          "Procurei em: " + " | ".join(str(c) for c in _caminhos_possiveis())}
    return {"padrao": "", "empresas": {}, "_origem": "(nenhum)"}


def _salvar(cfg: dict) -> None:
    destino = _cadastro_destino()
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_suffix(".json.tmp")
    # empresas vindas do env não são gravadas (o token ficaria copiado no arquivo)
    empresas = {k: v for k, v in cfg.get("empresas", {}).items() if not v.get("_do_env")}
    corpo = {"padrao": cfg.get("padrao", ""), "empresas": empresas}
    tmp.write_text(json.dumps(corpo, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(destino)


def _mascarar(token: str) -> str:
    token = token or ""
    return f"...{token[-4:]}" if len(token) >= 4 else "(vazio)"


def _resolver(apelido: str, exigir_explicito: bool = False):
    """Devolve (apelido, empresa, erro). erro=None quando resolveu."""
    cfg = _carregar()
    if cfg.get("_erro"):
        return None, None, {"erro": cfg["_erro"]}

    empresas = cfg["empresas"]
    if not empresas:
        return None, None, {"erro": "Nenhuma empresa cadastrada.",
                            "arquivo": _arquivo_em_uso(),
                            "como_resolver": "Use a ferramenta adicionar_empresa."}

    apelido = (apelido or "").strip()
    if not apelido:
        if exigir_explicito:
            return None, None, {"erro": "Informe a empresa explicitamente nesta operação de escrita.",
                                "empresas_disponiveis": sorted(empresas)}
        apelido = cfg["padrao"]
        if not apelido:
            return None, None, {"erro": "Sem empresa padrão definida. Informe `empresa`.",
                                "empresas_disponiveis": sorted(empresas)}

    empresa = empresas.get(apelido)
    if not empresa:
        return None, None, {"erro": f"Empresa '{apelido}' não cadastrada.",
                            "empresas_disponiveis": sorted(empresas)}
    if not (empresa.get("token") or "").strip():
        return None, None, {"erro": f"Empresa '{apelido}' está sem token."}
    return apelido, empresa, None


# ----------------- núcleo HTTP -----------------
def _client(token: str) -> httpx.Client:
    # retries=3 cobre falha de conexão/DNS (getaddrinfo failed), que acontece de forma
    # intermitente e produzia erro enganoso de "sem conexão". Não repete requisição
    # já enviada — logo, não há risco de duplicar uma escrita.
    return httpx.Client(base_url=BASE,
                        headers={"ApiToken": token, "Accept": "application/json"},
                        transport=httpx.HTTPTransport(retries=3),
                        timeout=30.0)


def _odata(filtro=None, top=500, skip=0, orderby=None):
    p = {}
    if filtro:
        p["$filter"] = filtro
    if top:
        p["$top"] = min(int(top), 500)
    if skip:
        p["$skip"] = int(skip)
    if orderby:
        p["$orderby"] = orderby
    return p


def _get(path, params=None, empresa=""):
    apelido, emp, erro = _resolver(empresa)
    if erro:
        return erro
    try:
        with _client(emp["token"]) as c:
            r = c.get(path.lstrip("/"), params=params or {})
        if r.status_code >= 400:
            return {"erro": f"HTTP {r.status_code}", "detalhe": r.text[:1000],
                    "path": path, "empresa": apelido}
        dados = r.json()
        if isinstance(dados, dict):
            dados["_empresa"] = apelido
        return dados
    except Exception as e:
        return {"erro": "falha", "detalhe": str(e), "path": path, "empresa": apelido}


def _write(method, path, body=None, empresa=""):
    apelido, emp, erro = _resolver(empresa, exigir_explicito=True)
    if erro:
        return erro
    if not ALLOW_WRITE:
        return {"erro": "Escrita bloqueada nesta máquina. Defina NIBO_ALLOW_WRITE=1 no env do MCP."}
    if not emp.get("escrita", False):
        return {"erro": f"Escrita bloqueada para a empresa '{apelido}'.",
                "como_resolver": f"definir_escrita_empresa('{apelido}', permitir=true, confirmar=true)"}
    try:
        with _client(emp["token"]) as c:
            r = c.request(method, path.lstrip("/"), json=body)
        if r.status_code >= 400:
            return {"erro": f"HTTP {r.status_code}", "detalhe": r.text[:1500],
                    "path": path, "enviado": body, "empresa": apelido}
        return {"ok": True, "status": r.status_code, "empresa": apelido,
                "resposta": (r.json() if r.text else None)}
    except Exception as e:
        return {"erro": "falha", "detalhe": str(e), "path": path, "empresa": apelido}


def _preview(metodo, path, apelido, dados=None):
    """Resposta padrão de 'não executei ainda' — sempre mostrando a empresa alvo."""
    cfg = _carregar()
    emp = cfg["empresas"].get((apelido or "").strip(), {})
    aviso = {"aviso": "Não executado. Confira a EMPRESA e reenvie com confirmar=true.",
             "metodo": metodo, "path": path,
             "empresa": apelido, "empresa_nome": emp.get("nome", "(não cadastrada)")}
    if dados is not None:
        aviso["enviaria"] = dados
    return aviso


# ===================== EMPRESAS =====================
@mcp.tool()
def listar_empresas() -> dict:
    """Lista as empresas cadastradas neste MCP (tokens sempre mascarados).
    Use antes de qualquer operação para saber o apelido correto de cada cliente."""
    cfg = _carregar()
    if cfg.get("_erro"):
        return {"erro": cfg["_erro"]}
    saida = {
        "arquivo": cfg.get("_origem", _arquivo_em_uso()),
        "escrita_liberada_na_maquina": ALLOW_WRITE,
        "padrao": cfg["padrao"],
        "empresas": [
            {"apelido": k,
             "nome": v.get("nome", ""),
             "escrita": bool(v.get("escrita", False)),
             "token": _mascarar(v.get("token", "")),
             "origem": "env" if v.get("_do_env") else "arquivo"}
            for k, v in sorted(cfg["empresas"].items())
        ],
    }
    if cfg.get("_aviso"):
        saida["aviso"] = cfg["_aviso"]
    return saida


@mcp.tool()
def adicionar_empresa(apelido: str, nome: str, token: str,
                      escrita: bool = False, definir_padrao: bool = False,
                      confirmar: bool = False) -> dict:
    """Cadastra (ou atualiza) o ApiToken de uma empresa/cliente. Vale imediatamente.
    apelido: identificador curto, minúsculo, sem espaço (ex.: 'omegaprice').
    escrita: libera criação/alteração de dados nessa empresa (padrão: só leitura).
    confirmar=true obrigatório."""
    apelido = (apelido or "").strip().lower()
    if not APELIDO_OK.match(apelido):
        return {"erro": "Apelido inválido. Use 2-40 caracteres: a-z, 0-9, hífen ou underscore."}
    token = (token or "").strip()
    if not token:
        return {"erro": "Token vazio."}

    cfg = _carregar()
    if cfg.get("_erro"):
        return {"erro": cfg["_erro"]}
    ja_existe = apelido in cfg["empresas"]
    if not confirmar:
        return {"aviso": "Não executado. Reenvie com confirmar=true.",
                "acao": "atualizar" if ja_existe else "cadastrar",
                "apelido": apelido, "nome": nome,
                "token": _mascarar(token), "escrita": escrita,
                "definir_padrao": definir_padrao, "arquivo": _arquivo_em_uso()}

    cfg["empresas"][apelido] = {"nome": nome, "token": token, "escrita": bool(escrita)}
    if definir_padrao or not cfg.get("padrao"):
        cfg["padrao"] = apelido
    _salvar(cfg)
    return {"ok": True, "acao": "atualizada" if ja_existe else "cadastrada",
            "apelido": apelido, "nome": nome, "escrita": bool(escrita),
            "padrao": cfg["padrao"], "arquivo": _arquivo_em_uso()}


@mcp.tool()
def remover_empresa(apelido: str, confirmar: bool = False) -> dict:
    """Remove uma empresa do cadastro deste MCP (não mexe em nada dentro do Nibo).
    confirmar=true obrigatório."""
    apelido = (apelido or "").strip().lower()
    cfg = _carregar()
    if cfg.get("_erro"):
        return {"erro": cfg["_erro"]}
    if apelido not in cfg["empresas"]:
        return {"erro": f"Empresa '{apelido}' não cadastrada.",
                "empresas_disponiveis": sorted(cfg["empresas"])}
    if cfg["empresas"][apelido].get("_do_env"):
        return {"erro": f"Empresa '{apelido}' vem de variável de ambiente; remova a variável "
                        f"NIBO_TOKEN_{apelido.upper().replace('-', '_')} no config do MCP."}
    if not confirmar:
        return {"aviso": "Não executado. Reenvie com confirmar=true.",
                "removeria": apelido, "nome": cfg["empresas"][apelido].get("nome", "")}
    cfg["empresas"].pop(apelido)
    if cfg.get("padrao") == apelido:
        cfg["padrao"] = next(iter(sorted(cfg["empresas"])), "")
    _salvar(cfg)
    return {"ok": True, "removida": apelido, "padrao": cfg["padrao"]}


@mcp.tool()
def definir_empresa_padrao(apelido: str) -> dict:
    """Define qual empresa é usada nas LEITURAS quando `empresa` não for informada.
    (Escrita nunca usa o padrão — sempre exige a empresa explícita.)"""
    apelido = (apelido or "").strip().lower()
    cfg = _carregar()
    if cfg.get("_erro"):
        return {"erro": cfg["_erro"]}
    if apelido not in cfg["empresas"]:
        return {"erro": f"Empresa '{apelido}' não cadastrada.",
                "empresas_disponiveis": sorted(cfg["empresas"])}
    cfg["padrao"] = apelido
    _salvar(cfg)
    return {"ok": True, "padrao": apelido, "nome": cfg["empresas"][apelido].get("nome", "")}


@mcp.tool()
def definir_escrita_empresa(apelido: str, permitir: bool, confirmar: bool = False) -> dict:
    """Liga/desliga a escrita de UMA empresa. Só tem efeito se NIBO_ALLOW_WRITE=1.
    confirmar=true obrigatório."""
    apelido = (apelido or "").strip().lower()
    cfg = _carregar()
    if cfg.get("_erro"):
        return {"erro": cfg["_erro"]}
    if apelido not in cfg["empresas"]:
        return {"erro": f"Empresa '{apelido}' não cadastrada.",
                "empresas_disponiveis": sorted(cfg["empresas"])}
    if cfg["empresas"][apelido].get("_do_env"):
        return {"erro": f"Empresa '{apelido}' vem de variável de ambiente; defina "
                        f"NIBO_ESCRITA_{apelido.upper().replace('-', '_')}=1 no config do MCP."}
    if not confirmar:
        return {"aviso": "Não executado. Reenvie com confirmar=true.",
                "empresa": apelido, "nome": cfg["empresas"][apelido].get("nome", ""),
                "escrita_passaria_a_ser": bool(permitir)}
    cfg["empresas"][apelido]["escrita"] = bool(permitir)
    _salvar(cfg)
    return {"ok": True, "empresa": apelido, "escrita": bool(permitir),
            "escrita_liberada_na_maquina": ALLOW_WRITE}


# ===================== LEITURA =====================
@mcp.tool()
def status_conexao(empresa: str = "") -> dict:
    """Diagnóstico: testa 1 chamada real no Nibo. Sem `empresa`, testa TODAS as cadastradas
    (útil para achar token expirado)."""
    cfg = _carregar()
    if cfg.get("_erro"):
        return {"erro": cfg["_erro"], "arquivo": _arquivo_em_uso()}
    if not cfg["empresas"]:
        return {"erro": "Nenhuma empresa cadastrada.", "arquivo": _arquivo_em_uso(),
                "como_resolver": "Use a ferramenta adicionar_empresa."}

    alvos = [empresa.strip()] if empresa.strip() else sorted(cfg["empresas"])
    resultados = []
    for ap in alvos:
        emp = cfg["empresas"].get(ap)
        if not emp:
            resultados.append({"empresa": ap, "erro": "não cadastrada"})
            continue
        t = _get("categories", {"$top": 1}, empresa=ap)
        falhou = isinstance(t, dict) and t.get("erro")
        resultados.append({"empresa": ap, "nome": emp.get("nome", ""),
                           "token": _mascarar(emp.get("token", "")),
                           "escrita": bool(emp.get("escrita", False)),
                           "teste": t if falhou else "ok"})
    saida = {"base_url": BASE, "arquivo": cfg.get("_origem", _arquivo_em_uso()),
             "escrita_liberada_na_maquina": ALLOW_WRITE,
             "padrao": cfg["padrao"], "resultados": resultados}
    if cfg.get("_aviso"):
        saida["aviso"] = cfg["_aviso"]
    return saida


@mcp.tool()
def nibo_get(path: str, empresa: str = "", filtro: str = "", top: int = 500,
             skip: int = 0, orderby: str = "") -> dict:
    """GET genérico em qualquer endpoint de leitura do Nibo.
    path ex.: 'suppliers', 'schedules/debit', 'accounts'. filtro = OData $filter."""
    return _get(path, _odata(filtro or None, top, skip, orderby or None), empresa)


@mcp.tool()
def listar_fornecedores(empresa: str = "", filtro: str = "", top: int = 100) -> dict:
    """Lista fornecedores (suppliers). filtro OData opcional."""
    return _get("suppliers", _odata(filtro or None, top), empresa)


@mcp.tool()
def listar_clientes(empresa: str = "", filtro: str = "", top: int = 100) -> dict:
    """Lista clientes (customers). filtro OData opcional."""
    return _get("customers", _odata(filtro or None, top), empresa)


@mcp.tool()
def listar_contas_a_pagar(empresa: str = "", filtro: str = "", top: int = 100) -> dict:
    """Contas a pagar = agendamentos de débito (schedules/debit).
    Dica de filtro por vencimento: dueDate ge 2026-06-22T00:00:00Z and dueDate le 2026-06-28T23:59:59Z"""
    return _get("schedules/debit", _odata(filtro or None, top), empresa)


@mcp.tool()
def listar_contas_a_receber(empresa: str = "", filtro: str = "", top: int = 100) -> dict:
    """Contas a receber = agendamentos de crédito (schedules/credit)."""
    return _get("schedules/credit", _odata(filtro or None, top), empresa)


@mcp.tool()
def listar_pagamentos(empresa: str = "", filtro: str = "", top: int = 100) -> dict:
    """Pagamentos realizados (payments)."""
    return _get("payments", _odata(filtro or None, top), empresa)


@mcp.tool()
def listar_recebimentos(empresa: str = "", filtro: str = "", top: int = 100) -> dict:
    """Recebimentos realizados (receipts)."""
    return _get("receipts", _odata(filtro or None, top), empresa)


@mcp.tool()
def listar_categorias(empresa: str = "", filtro: str = "", top: int = 200) -> dict:
    """Plano de contas / categorias (categories)."""
    return _get("categories", _odata(filtro or None, top), empresa)


@mcp.tool()
def listar_centros_de_custo(empresa: str = "", filtro: str = "", top: int = 200) -> dict:
    """Centros de custo (cost-centers)."""
    return _get("cost-centers", _odata(filtro or None, top), empresa)


@mcp.tool()
def listar_contas_bancarias(empresa: str = "", filtro: str = "", top: int = 100) -> dict:
    """Contas bancárias (accounts). Campos úteis: id, name, isReconcilable, isAutomated."""
    return _get("accounts", _odata(filtro or None, top), empresa)


@mcp.tool()
def itens_a_conciliar(account_id: str, empresa: str = "", top: int = 200) -> dict:
    """Lista os itens que precisam ser conciliados em uma conta bancária
    (GET accounts/{accountId}/reconciliation). É AQUI que aparecem os lançamentos
    trazidos pelo banco/Open Finance, prontos para conciliar. Passe o id da conta
    (use listar_contas_bancarias para achar o id)."""
    return _get(f"accounts/{account_id}/reconciliation", _odata(None, top), empresa)


# ===================== ESCRITA =====================
# Travas: NIBO_ALLOW_WRITE=1 + "escrita":true na empresa + confirmar=true.
# `empresa` é OBRIGATÓRIO: nunca herda a empresa padrão.
@mcp.tool()
def nibo_post(empresa: str, path: str, dados: dict, confirmar: bool = False) -> dict:
    """POST genérico (CRIA/EFETIVA algo — ALTERA DADOS REAIS da empresa informada).
    Use para qualquer endpoint de escrita confirmado na doc (ex.: criar agendamento,
    efetivar conciliação). confirmar=true é obrigatório para executar."""
    if not confirmar:
        return _preview("POST", path, empresa, dados)
    return _write("POST", path, dados, empresa)


@mcp.tool()
def nibo_put(empresa: str, path: str, dados: dict, confirmar: bool = False) -> dict:
    """PUT genérico (ALTERA um registro existente — DADOS REAIS). confirmar=true obrigatório."""
    if not confirmar:
        return _preview("PUT", path, empresa, dados)
    return _write("PUT", path, dados, empresa)


@mcp.tool()
def nibo_delete(empresa: str, path: str, confirmar: bool = False) -> dict:
    """DELETE genérico (REMOVE um registro — ex.: excluir conciliação). confirmar=true obrigatório."""
    if not confirmar:
        return _preview("DELETE", path, empresa)
    return _write("DELETE", path, None, empresa)


@mcp.tool()
def criar_fornecedor(empresa: str, nome: str, documento: str = "", confirmar: bool = False) -> dict:
    """Cria fornecedor (POST suppliers). ALTERA DADOS REAIS. confirmar=true obrigatório."""
    body = {"name": nome}
    if documento:
        body["document"] = {"number": documento}
    if not confirmar:
        return _preview("POST", "suppliers", empresa, body)
    return _write("POST", "suppliers", body, empresa)


@mcp.tool()
def criar_conta_a_pagar(empresa: str, dados: dict, confirmar: bool = False) -> dict:
    """Cria conta a pagar / agendamento de débito (POST schedules/debit). ALTERA DADOS REAIS.
    CONFIRA os campos obrigatórios na doc antes (ex.: stakeholderId, categories, value, dueDate,
    accrualDate, description). confirmar=true obrigatório."""
    if not confirmar:
        return _preview("POST", "schedules/debit", empresa, dados)
    return _write("POST", "schedules/debit", dados, empresa)


@mcp.tool()
def criar_conta_a_receber(empresa: str, dados: dict, confirmar: bool = False) -> dict:
    """Cria conta a receber / agendamento de crédito (POST schedules/credit). ALTERA DADOS REAIS.
    confirmar=true obrigatório."""
    if not confirmar:
        return _preview("POST", "schedules/credit", empresa, dados)
    return _write("POST", "schedules/credit", dados, empresa)


if __name__ == "__main__":
    # Diagnóstico no stderr (aparece no log do cliente MCP; stdout é reservado ao protocolo).
    _cfg_inicial = _carregar()
    print(f"[nibo] cadastro: {_cfg_inicial.get('_origem')}", file=sys.stderr)
    print(f"[nibo] empresas: {sorted(_cfg_inicial.get('empresas', {}))}", file=sys.stderr)
    if _cfg_inicial.get("_aviso"):
        print(f"[nibo] AVISO: {_cfg_inicial['_aviso']}", file=sys.stderr)
    mcp.run()
