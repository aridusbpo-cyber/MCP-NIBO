<#
==================================================================
  MCP do NIBO - Instalador automatico (Windows / PowerShell)
==================================================================
  O que este script faz por voce:
   1. Detecta o Python e instala as dependencias (mcp, httpx).
   2. Copia o servidor para  %USERPROFILE%\nibo-mcp\
   3. Registra o MCP no Claude (Code e/ou Desktop) SEM nenhum token,
      com escrita DESLIGADA por seguranca (NIBO_ALLOW_WRITE=0).
   4. Cria um cadastro VAZIO em  %USERPROFILE%\.nibo-mcp\empresas.json
      OU numa pasta na nuvem (OneDrive/Google Drive/Dropbox), para usar
      os mesmos tokens em varios computadores
      (so se ainda nao existir - nunca apaga tokens seus).

  Depois de rodar, VOCE coloca os seus proprios ApiTokens do Nibo.
  Nenhuma chave vem dentro deste pacote.

  Como usar:
   - Botao direito neste arquivo > "Executar com PowerShell"
   - OU no PowerShell:  powershell -ExecutionPolicy Bypass -File .\INSTALAR.ps1
==================================================================
#>

$ErrorActionPreference = "Stop"
$src = $PSScriptRoot
Write-Host ""
Write-Host "=== MCP do Nibo - Instalador ===" -ForegroundColor Cyan

# ---------- 1) Detectar Python ----------
$py = $null
foreach ($c in @("python","py")) {
    $cmd = Get-Command $c -ErrorAction SilentlyContinue
    if ($cmd) { $py = $cmd.Source; break }
}
if (-not $py) {
    Write-Host "ERRO: Python nao encontrado no PATH." -ForegroundColor Red
    Write-Host "Instale o Python 3.10+ (marque 'Add python.exe to PATH') em https://python.org e rode de novo." -ForegroundColor Red
    exit 1
}
Write-Host "-> Python: $py" -ForegroundColor DarkGray

# ---------- 2) Copiar servidor para pasta estavel ----------
$dest = Join-Path $env:USERPROFILE "nibo-mcp"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
if ((Resolve-Path $src).Path -ne (Resolve-Path $dest).Path) {
    foreach ($f in @("server.py","requirements.txt","empresas.exemplo.json",".gitignore","MANUAL-COMPLETO.md","instalar_config.py")) {
        $p = Join-Path $src $f
        if (Test-Path $p) { Copy-Item $p $dest -Force }
    }
}
$serverPath = Join-Path $dest "server.py"
Write-Host "-> Servidor instalado em: $dest" -ForegroundColor DarkGray

# ---------- 3) Instalar dependencias ----------
Write-Host "-> Instalando dependencias (mcp, httpx)..." -ForegroundColor Yellow
& $py -m pip install --quiet --upgrade pip 2>$null
& $py -m pip install --quiet -r (Join-Path $dest "requirements.txt")
if ($LASTEXITCODE -ne 0) {
    Write-Host "Aviso: falha ao instalar dependencias. Rode manualmente:" -ForegroundColor Red
    Write-Host "   `"$py`" -m pip install `"mcp[cli]`" httpx" -ForegroundColor Red
}

# ---------- 4) Onde guardar o cadastro (local ou nuvem) ----------
# Guardar numa pasta sincronizada (OneDrive/Google Drive/Dropbox) deixa os MESMOS
# tokens disponiveis em qualquer computador onde o instalador for rodado.
$credDir  = Join-Path $env:USERPROFILE ".nibo-mcp"
$localFile = Join-Path $credDir "empresas.json"
$credFile = $localFile
$sugestao = $null
foreach ($d in @($env:OneDriveCommercial, $env:OneDrive, "G:\Meu Drive", "G:\My Drive", (Join-Path $env:USERPROFILE "Dropbox"))) {
    if ($d -and (Test-Path $d)) { $sugestao = Join-Path $d "nibo-mcp"; break }
}
Write-Host ""
Write-Host "Onde guardar os tokens das empresas?" -ForegroundColor White
Write-Host "  [1] So neste computador: $credDir" -ForegroundColor Gray
if ($sugestao) { Write-Host "  [2] Na nuvem (vale em qualquer computador): $sugestao" -ForegroundColor Gray }
Write-Host "  [3] Outra pasta (ex.: uma pasta sincronizada)" -ForegroundColor Gray
$opcao = Read-Host "Escolha (Enter = 1)"
if ($opcao -eq "2" -and $sugestao) { $credDir = $sugestao }
elseif ($opcao -eq "3") { $credDir = Read-Host "Caminho da pasta" }
$credFile = Join-Path $credDir "empresas.json"
New-Item -ItemType Directory -Force -Path $credDir | Out-Null

if (-not (Test-Path $credFile)) {
    if (($credFile -ne $localFile) -and (Test-Path $localFile)) {
        # ja havia cadastro local: leva para a nuvem (o local fica como estava)
        Copy-Item $localFile $credFile -Force
        Write-Host "-> Cadastro local copiado para: $credFile" -ForegroundColor DarkGray
    } else {
        Copy-Item (Join-Path $dest "empresas.exemplo.json") $credFile -Force
        Write-Host "-> Cadastro criado (vazio p/ preencher): $credFile" -ForegroundColor DarkGray
    }
} else {
    Write-Host "-> Cadastro ja existe (mantido intacto): $credFile" -ForegroundColor DarkGray
}

# ---------- 5) Registrar o MCP nos configs do Claude (via Python) ----------
# O merge do JSON e feito em Python porque o ConvertFrom-Json do PowerShell 5.1
# quebra quando o .claude.json tem chaves que diferem so por maiuscula/minuscula.
Write-Host "-> Registrando o MCP no Claude (sem token, escrita desligada)..." -ForegroundColor Yellow
if ($credFile -ne $localFile) {
    & $py (Join-Path $dest "instalar_config.py") --cadastro $credFile
} else {
    & $py (Join-Path $dest "instalar_config.py")
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "Aviso: o registro automatico falhou. Veja o MANUAL-COMPLETO.md (Passo 2) para registrar na mao." -ForegroundColor Red
}

# ---------- Proximos passos ----------
Write-Host ""
Write-Host "==================== PRONTO! ====================" -ForegroundColor Cyan
Write-Host "Faltam SO os seus tokens do Nibo. Duas formas:" -ForegroundColor White
Write-Host ""
Write-Host "  A) Pelo chat (reinicie o Claude primeiro):" -ForegroundColor White
Write-Host '     "cadastre no Nibo a empresa cliente-a, nome ''Cliente A Ltda'', token SEU_TOKEN"' -ForegroundColor Gray
Write-Host ""
Write-Host "  B) Editando o arquivo:" -ForegroundColor White
Write-Host "     $credFile" -ForegroundColor Gray
Write-Host ""
Write-Host "Onde pegar o token: Nibo > Configuracoes > Integracoes/API." -ForegroundColor DarkGray
Write-Host "Para liberar ESCRITA depois: troque NIBO_ALLOW_WRITE p/ 1 no config e escrita:true na empresa." -ForegroundColor DarkGray
Write-Host "Teste com:  'status da conexao com o Nibo'" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
