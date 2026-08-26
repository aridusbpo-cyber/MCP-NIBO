#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Registra o MCP 'nibo' nos configs do Claude (Code e/ou Desktop) de forma SEGURA.

Por que em Python e nao em PowerShell:
  o ConvertFrom-Json do PowerShell 5.1 QUEBRA quando o .claude.json tem chaves
  que diferem so por maiuscula/minuscula (ex.: dois caminhos de projeto). O json
  do Python lida com isso e escreve de forma atomica (nunca deixa o arquivo corrompido).

- Faz BACKUP antes de qualquer alteracao.
- So mexe na chave mcpServers.nibo; preserva todo o resto.
- NAO grava token nenhum. Escrita comeca desligada (NIBO_ALLOW_WRITE=0).
"""
import json
import os
import shutil
import sys
import time
from pathlib import Path

HOME = Path(os.path.expanduser("~"))
SERVER_PATH = str(HOME / "nibo-mcp" / "server.py")
PYTHON = sys.executable  # o mesmo Python que rodou este script

BLOCK = {
    "type": "stdio",
    "command": PYTHON,
    "args": [SERVER_PATH],
    "env": {"NIBO_ALLOW_WRITE": "0"},
}


def register(config_path: Path, create_if_missing: bool):
    if not config_path.exists() and not create_if_missing:
        return None  # config nao existe e nao devemos criar (ex.: Desktop nao instalado)

    if config_path.exists():
        # backup com carimbo de data/hora
        bak = f"{config_path}.bak-{time.strftime('%Y%m%d-%H%M%S')}"
        shutil.copy2(config_path, bak)
        try:
            with open(config_path, encoding="utf-8") as f:
                cfg = json.load(f)
        except Exception as e:
            print(f"  [aviso] nao consegui ler {config_path.name} ({e}); pulando.")
            return None
        if not isinstance(cfg, dict):
            print(f"  [aviso] {config_path.name} nao e um objeto JSON; pulando.")
            return None
    else:
        config_path.parent.mkdir(parents=True, exist_ok=True)
        cfg = {}

    servers = cfg.get("mcpServers")
    if not isinstance(servers, dict):
        servers = {}
        cfg["mcpServers"] = servers
    servers["nibo"] = BLOCK

    # escrita atomica: grava em .tmp e substitui de uma vez
    tmp = f"{config_path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    os.replace(tmp, config_path)
    return str(config_path)


def main():
    claude_code = HOME / ".claude.json"
    claude_desktop = Path(os.environ.get("APPDATA", str(HOME))) / "Claude" / "claude_desktop_config.json"

    done = []
    # Claude Code: registra (cria se nao existir — o ecossistema usa .claude)
    r = register(claude_code, create_if_missing=True)
    if r:
        done.append(r)
    # Claude Desktop: so registra se ja estiver instalado
    r = register(claude_desktop, create_if_missing=False)
    if r:
        done.append(r)

    if done:
        print("  MCP 'nibo' registrado em:")
        for d in done:
            print(f"    - {d}")
        print("  (backup .bak-... criado antes de alterar)")
    else:
        print("  [aviso] nenhum config do Claude foi atualizado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
