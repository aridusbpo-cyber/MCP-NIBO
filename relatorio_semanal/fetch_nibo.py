"""Baixa da Nibo (DR Oral) tudo o que o relatório semanal usa, como JSON no diretório atual.
Requer a variável de ambiente NIBO_TOKEN_DR_ORAL."""
import os, json, requests
s = requests.Session(); s.headers["ApiToken"] = os.environ["NIBO_TOKEN_DR_ORAL"]
B = "https://api.nibo.com.br/empresas/v1/"

def tudo(path):
    out, skip = [], 0
    while True:
        r = s.get(B + path, timeout=60, params={"$top": 500, "$skip": skip}); r.raise_for_status(); d = r.json()
        out += d["items"]; skip += 500
        if skip >= d["count"]: return out

for path, nome in [("payments", "payments"), ("receipts", "receipts"), ("schedules/debit", "debit"),
                   ("schedules/credit", "credit"), ("categories", "categories")]:
    x = tudo(path); json.dump(x, open(nome + ".json", "w")); print(nome, len(x))
for path, nome in [("accounts", "accounts"), ("costcenters", "costcenters")]:
    r = s.get(B + path, params={"$top": 500}, timeout=60); r.raise_for_status(); json.dump(r.json(), open(nome + ".json", "w"))
rec = {}
for a in json.load(open("accounts.json"))["items"]:
    r = s.get(B + f"accounts/{a['id']}/reconciliation", params={"$top": 500}, timeout=60)
    rec[a["id"]] = r.json().get("items", []) if r.ok else []
json.dump(rec, open("recon.json", "w")); print("extrato pendente", sum(len(v) for v in rec.values()))
