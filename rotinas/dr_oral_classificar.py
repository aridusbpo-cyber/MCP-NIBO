"""
Gera a planilha "DR Oral Clinic - Lançamentos para classificar (Categoria e CC)".

Uso (rotina diária):
  python3 rotinas/dr_oral_classificar.py --snippet atual.txt --csv nova.csv

Token: NIBO_TOKEN_DR_ORAL (ou NIBO_API_TOKEN).

--snippet é o texto da planilha que está hoje no Drive, como o get_file_metadata do
conector do Google Drive devolve em "contentSnippet" (snippetVerbosity=MAX_ALLOWED).
Esse texto descarta células vazias, por isso as três colunas da equipe saem com "—"
quando ainda não foram preenchidas: assim a posição delas nunca se perde.
Alternativa: --anterior com JSON {"<ID Nibo>": {"n": 7, "categoria": "", "cc": "", "obs": ""}}.

O CSV sobe para o Drive e vira Planilha Google. Datas em AAAA-MM-DD e valor com ponto
decimal, porque o Drive desta conta lê no formato americano e trocaria dia e mês.

Regras:
  - Entra todo agendamento (scheduleId) com categoria 3.503 / 1.112 ou centro de custo
    "Não Identificado" / vazio.
  - Pagos/recebidos entram sempre; em aberto só se o vencimento já passou.
  - Linha que já foi corrigida no Nibo sai da planilha.
  - Linha que continua pendente mantém o Nº e o que a equipe preencheu.
  - Lançamentos novos recebem Nº a partir do maior já usado.
Imprime um resumo JSON no stdout.
"""

import argparse
import csv
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

BASE = "https://api.nibo.com.br/empresas/v1"
CAT_NAO_ID = ("3.503", "1.112")
CC_NAO_ID = "não identificado"
VAZIO_EQUIPE = "—"
PENDENCIAS = ("Categoria e Centro de Custo", "Categoria", "Centro de Custo")
GUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")

COLUNAS = ["Nº", "Tipo", "Vencimento / Data", "Competência", "Situação", "Conta bancária",
           "Fornecedor / Cliente", "Descrição", "Referência", "Valor (R$)", "Categoria atual",
           "Centro de Custo atual", "Pendência", "CATEGORIA CORRETA", "CENTRO DE CUSTO CORRETO",
           "Observação do colaborador", "ID Nibo"]


def _token():
    t = os.environ.get("NIBO_TOKEN_DR_ORAL") or os.environ.get("NIBO_API_TOKEN")
    if not t:
        sys.exit("Falta NIBO_TOKEN_DR_ORAL / NIBO_API_TOKEN no ambiente.")
    return t


def _get(path, params=None):
    url = f"{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"ApiToken": _token(), "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def _todos(path):
    itens, skip = [], 0
    while True:
        d = _get(path, {"$top": 500, "$skip": skip})
        itens += d["items"]
        skip += 500
        if not d["items"] or skip >= d.get("count", 0):
            return itens


def _data(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).date() if s else None


def _pendencia(ag):
    cats = [c.get("categoryName") or "" for c in ag.get("categories") or []]
    ccs = [c.get("costCenterDescription") or "" for c in ag.get("costCenters") or []]
    cat_ruim = not cats or any(n.startswith(CAT_NAO_ID) for n in cats)
    cc_ruim = not ccs or any(CC_NAO_ID in n.lower() for n in ccs)
    if cat_ruim and cc_ruim:
        return PENDENCIAS[0]
    if cat_ruim:
        return PENDENCIAS[1]
    if cc_ruim:
        return PENDENCIAS[2]
    return None


def coletar(hoje):
    baixas = {}
    for e in _todos("payments") + _todos("receipts"):
        if e.get("scheduleId") and not e.get("isTransfer"):
            baixas.setdefault(e["scheduleId"], []).append(e)

    linhas = []
    for ag in _todos("schedules"):
        pend = _pendencia(ag)
        if not pend:
            continue
        b = baixas.get(ag["scheduleId"], [])
        pago = ag.get("isPaid") or bool(b)
        venc = _data(ag.get("dueDate"))
        if not pago and (venc is None or venc > hoje):
            continue
        datas = [_data(x["date"]) for x in b if x.get("date")]
        cats = [c["categoryName"] for c in ag.get("categories") or [] if c.get("categoryName")]
        ccs = [c.get("costCenterDescription") or "" for c in ag.get("costCenters") or []]
        linhas.append({
            "id": ag["scheduleId"],
            "tipo": "Despesa" if ag.get("type") == "Debit" else "Receita",
            "data": min(datas) if datas else venc,
            "competencia": _data(ag.get("accrualDate")),
            "situacao": "Pago/Recebido" if pago else "Em aberto (vencido)",
            "conta": " / ".join(sorted({x["account"]["name"] for x in b if x.get("account")})),
            "pessoa": (ag.get("stakeholder") or {}).get("name") or "",
            "descricao": ag.get("description") or "",
            "referencia": " / ".join(sorted({x["reference"] for x in b if x.get("reference")})),
            "valor": float(ag.get("value") or 0),
            "categoria": " / ".join(cats) or "(vazio)",
            "cc": " / ".join(ccs) or "(vazio)",
            "pendencia": pend,
        })
    linhas.sort(key=lambda l: (l["tipo"] != "Despesa", l["data"] or date.min, l["pessoa"]))
    return linhas


def listas():
    cats = _get("categories", {"$top": 500})["items"]
    return {
        "out": sorted(c["name"] for c in cats if c.get("type") == "out" and not c["name"].startswith(CAT_NAO_ID)),
        "in": sorted(c["name"] for c in cats if c.get("type") == "in" and not c["name"].startswith(CAT_NAO_ID)),
        "cc": [c["description"] for c in _get("costcenters")["items"] if CC_NAO_ID not in c["description"].lower()],
    }


def ler_snippet(texto, ccs):
    """Linhas do snippet do Drive -> {id: {n, categoria, cc, obs}}; avisos para o que ficou ambíguo."""
    anterior, avisos = {}, []
    for linha in texto.splitlines():
        linha = linha.strip()
        m = GUID.search(linha)
        if not m or not linha.endswith(m.group(0)):
            continue
        campos = [c.strip() for c in linha[:m.start()].rstrip(",").split(",")]
        try:
            n = int(campos[0])
        except ValueError:
            n = 0
        i = max((k for k, c in enumerate(campos) if c in PENDENCIAS), default=None)
        eq = campos[i + 1:] if i is not None else []
        eq = ["" if c == VAZIO_EQUIPE else c for c in eq]
        reg = {"n": n, "categoria": "", "cc": "", "obs": ""}
        if len(eq) >= 3:
            reg.update(categoria=eq[0], cc=eq[1], obs=",".join(eq[2:]))
        else:
            # Alguém apagou o "—": decide pelo conteúdo.
            for c in eq:
                if not c:
                    continue
                if any(c.lower() in x.lower() or x.lower() in c.lower() for x in ccs) and not reg["cc"]:
                    reg["cc"] = c
                elif re.match(r"^\d\.\d{3}", c) and not reg["categoria"]:
                    reg["categoria"] = c
                else:
                    reg["obs"] = (reg["obs"] + " " + c).strip()
            if any(eq):
                avisos.append(f"Nº {n}: colunas da equipe incompletas, conferir ({' | '.join(eq)})")
        anterior[m.group(0)] = reg
    return anterior, avisos


def _texto(v):
    if v is None:
        return ""
    if isinstance(v, date):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, float):
        return f"{v:.2f}"
    v = str(v).strip()
    # Evita que o Sheets leia o texto como fórmula.
    return " " + v if v and v[0] in "=+-@" else v


def gravar(caminho, cabecalho, linhas):
    with open(caminho, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cabecalho)
        for l in linhas:
            w.writerow([_texto(v) for v in l])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--snippet", help="texto da planilha atual (contentSnippet do Drive)")
    ap.add_argument("--anterior", help="JSON com as linhas atuais (chave = ID Nibo)")
    ap.add_argument("--csv", required=True, help="CSV a subir no Drive")
    ap.add_argument("--listas", help="CSV com as listas de categorias e CC")
    a = ap.parse_args()

    hoje = datetime.now(timezone(timedelta(hours=-3))).date()
    ls = listas()
    anterior, avisos = {}, []
    if a.snippet:
        anterior, avisos = ler_snippet(open(a.snippet, encoding="utf-8").read(), ls["cc"])
    elif a.anterior:
        anterior = json.load(open(a.anterior, encoding="utf-8"))

    linhas = coletar(hoje)
    ids = {l["id"] for l in linhas}
    proximo = max([int(v.get("n") or 0) for v in anterior.values()] + [0]) + 1
    # Quem já estava na planilha mantém a ordem e o Nº; os novos vêm no fim.
    linhas.sort(key=lambda l: int(anterior[l["id"]].get("n") or 0) if l["id"] in anterior else 10**9)
    saida, novas = [], 0
    for l in linhas:
        ant = anterior.get(l["id"])
        if ant and ant.get("n"):
            n = int(ant["n"])
        else:
            n, proximo, novas = proximo, proximo + 1, novas + 1
            ant = ant or {}
        saida.append([n, l["tipo"], l["data"], l["competencia"], l["situacao"], l["conta"], l["pessoa"],
                      l["descricao"], l["referencia"], l["valor"], l["categoria"], l["cc"], l["pendencia"],
                      ant.get("categoria") or VAZIO_EQUIPE, ant.get("cc") or VAZIO_EQUIPE,
                      ant.get("obs") or VAZIO_EQUIPE, l["id"]])
    gravar(a.csv, COLUNAS, saida)

    if a.listas:
        n = max(len(v) for v in ls.values())
        col = lambda k, i: ls[k][i] if i < len(ls[k]) else ""
        gravar(a.listas, ["Categorias de Despesa", "Categorias de Receita", "Centros de Custo"],
               [[col("out", i), col("in", i), col("cc", i)] for i in range(n)])

    removidas = sorted(int(v.get("n") or 0) for k, v in anterior.items() if k not in ids)
    print(json.dumps({"linhas_lidas_da_planilha": len(anterior), "total": len(saida),
                      "mantidas": len(saida) - novas, "novas": novas,
                      "removidas_n": removidas, "avisos": avisos}, ensure_ascii=False))


if __name__ == "__main__":
    main()
