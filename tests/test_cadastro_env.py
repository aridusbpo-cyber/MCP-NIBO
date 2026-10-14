"""Carregamento de empresas: empresas.json + NIBO_TOKEN_<SLUG>.

Tokens aqui são fictícios. Nenhum teste chama a API do Nibo.
"""
import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402


@pytest.fixture
def ambiente(tmp_path, monkeypatch):
    """Isola o teste: só um empresas.json temporário e nenhuma variável NIBO_* herdada."""
    for var in list(os.environ):
        if var.startswith("NIBO_"):
            monkeypatch.delenv(var)
    arquivo = tmp_path / "empresas.json"
    monkeypatch.setattr(server, "_caminhos_possiveis", lambda: [arquivo])
    return arquivo


def _gravar(arquivo, padrao, empresas):
    arquivo.write_text(json.dumps({"padrao": padrao, "empresas": empresas}), encoding="utf-8")


def test_so_env(ambiente, monkeypatch):
    monkeypatch.setenv("NIBO_TOKEN_DR_ORAL", "tok-oral-1234")
    monkeypatch.setenv("NIBO_NOME_DR_ORAL", "Dr Oral Clínica")
    monkeypatch.setenv("NIBO_TOKEN_CAMILA", "tok-camila-5678")

    cfg = server._carregar()
    assert set(cfg["empresas"]) == {"dr_oral", "camila"}
    assert cfg["empresas"]["dr_oral"]["token"] == "tok-oral-1234"
    assert cfg["empresas"]["dr_oral"]["nome"] == "Dr Oral Clínica"
    assert cfg["empresas"]["camila"]["escrita"] is False
    assert "NIBO_TOKEN_DR_ORAL" in cfg["_origem"]
    assert "_aviso" not in cfg


def test_uma_empresa_vira_padrao(ambiente, monkeypatch):
    monkeypatch.setenv("NIBO_TOKEN_DR_PAULO", "tok-paulo")
    assert server._carregar()["padrao"] == "dr_paulo"


def test_padrao_pelo_env(ambiente, monkeypatch):
    monkeypatch.setenv("NIBO_TOKEN_DR_PAULO", "a")
    monkeypatch.setenv("NIBO_TOKEN_CAMILA", "b")
    monkeypatch.setenv("NIBO_EMPRESA_PADRAO", "CAMILA")
    assert server._carregar()["padrao"] == "camila"


def test_env_e_arquivo_somam(ambiente, monkeypatch):
    _gravar(ambiente, "cliente-a", {"cliente-a": {"nome": "A", "token": "tok-a", "escrita": True}})
    monkeypatch.setenv("NIBO_TOKEN_CAMILA", "tok-camila")

    cfg = server._carregar()
    assert set(cfg["empresas"]) == {"cliente-a", "camila"}
    assert cfg["padrao"] == "cliente-a"
    assert cfg["empresas"]["cliente-a"]["escrita"] is True


def test_env_vence_token_do_arquivo(ambiente, monkeypatch):
    _gravar(ambiente, "camila", {"camila": {"nome": "Camila", "token": "velho", "escrita": True}})
    monkeypatch.setenv("NIBO_TOKEN_CAMILA", "novo")

    emp = server._carregar()["empresas"]["camila"]
    assert emp["token"] == "novo"
    assert emp["nome"] == "Camila"      # nome e escrita do arquivo continuam valendo
    assert emp["escrita"] is True


def test_escrita_pelo_env(ambiente, monkeypatch):
    monkeypatch.setenv("NIBO_TOKEN_DR_ORAL", "x")
    monkeypatch.setenv("NIBO_ESCRITA_DR_ORAL", "1")
    assert server._carregar()["empresas"]["dr_oral"]["escrita"] is True


def test_fallback_para_arquivo_sem_env(ambiente):
    _gravar(ambiente, "cliente-a", {"cliente-a": {"nome": "A", "token": "tok-a"}})
    cfg = server._carregar()
    assert list(cfg["empresas"]) == ["cliente-a"]
    assert cfg["_origem"] == str(ambiente)


def test_token_vazio_e_nibo_api_token_ignorados(ambiente, monkeypatch):
    monkeypatch.setenv("NIBO_TOKEN_VAZIA", "   ")
    monkeypatch.setenv("NIBO_API_TOKEN", "legado")
    cfg = server._carregar()
    # sem empresas por NIBO_TOKEN_<SLUG>, cai no modo antigo de token único
    assert list(cfg["empresas"]) == ["padrao"]
    assert "_aviso" in cfg


def test_header_apitoken_por_empresa(ambiente, monkeypatch):
    monkeypatch.setenv("NIBO_TOKEN_DR_ORAL", "tok-oral")
    monkeypatch.setenv("NIBO_TOKEN_DR_PAULO", "tok-paulo")
    vistos = {}

    class Resp:
        status_code = 200
        text = "{}"

        def json(self):
            return {}

    def falso_client(token):
        class C:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def get(self, path, params=None):
                vistos.setdefault("tokens", []).append(token)
                return Resp()
        return C()

    monkeypatch.setattr(server, "_client", falso_client)
    server._get("categories", empresa="dr_oral")
    server._get("categories", empresa="dr_paulo")
    assert vistos["tokens"] == ["tok-oral", "tok-paulo"]


def test_client_real_usa_header_apitoken():
    with server._client("tok-xyz") as c:
        assert c.headers["ApiToken"] == "tok-xyz"


def test_salvar_nunca_grava_token_do_env(ambiente, monkeypatch):
    _gravar(ambiente, "cliente-a", {"cliente-a": {"nome": "A", "token": "tok-a"}})
    monkeypatch.setenv("NIBO_TOKEN_CAMILA", "segredo-env")

    r = server.adicionar_empresa("cliente-b", "B", "tok-b", confirmar=True)
    assert r["ok"]
    server.definir_empresa_padrao("camila")

    texto = ambiente.read_text(encoding="utf-8")
    assert "segredo-env" not in texto
    gravado = json.loads(texto)
    assert set(gravado["empresas"]) == {"cliente-a", "cliente-b"}
    assert gravado["padrao"] == "camila"


def test_remover_empresa_do_env_orienta(ambiente, monkeypatch):
    monkeypatch.setenv("NIBO_TOKEN_CAMILA", "x")
    r = server.remover_empresa("camila", confirmar=True)
    assert "NIBO_TOKEN_CAMILA" in r["como_resolver"]
    assert not ambiente.exists()


def test_listar_empresas_mascara_e_mostra_fonte(ambiente, monkeypatch):
    _gravar(ambiente, "cliente-a", {"cliente-a": {"nome": "A", "token": "tok-a-9999"}})
    monkeypatch.setenv("NIBO_TOKEN_CAMILA", "tok-camila-1234")
    lista = {e["apelido"]: e for e in server.listar_empresas()["empresas"]}
    assert lista["camila"] == {"apelido": "camila", "nome": "", "escrita": False,
                               "token": "...1234", "fonte": "env"}
    assert lista["cliente-a"]["fonte"] == "arquivo"
    assert "tok-camila-1234" not in json.dumps(server.listar_empresas())
