# Rotina diária: planilha "Lançamentos para classificar" da DR Oral Clinic

Roda todo dia às 9h (America/Sao_Paulo). Passo a passo para a sessão agendada:

1. **Achar a planilha atual** no Drive, pasta "09. D R Oral Clinic"
   (id `1ki35mnqlusvm6KrhKQE7PiJ_QkTaofzi`):
   `search_files` com `parentId = '1ki35mnqlusvm6KrhKQE7PiJ_QkTaofzi' and title = 'DR Oral Clinic - Lançamentos para classificar (Categoria e CC)'`.
   Se houver mais de uma, usar a mais recente e avisar.
2. **Ler o que a equipe preencheu**: `get_file_metadata` dessa planilha com
   `snippetVerbosity: MAX_ALLOWED`. Gravar o campo `contentSnippet` inteiro, sem alterar,
   em `atual.txt`. (O snippet omite células vazias; por isso as colunas da equipe usam "—".)
3. **Gerar a nova versão**:
   `python3 rotinas/dr_oral_classificar.py --snippet atual.txt --csv nova.csv`
   Conferir o resumo impresso: `linhas_lidas_da_planilha` deve bater com o número de linhas
   da planilha atual. Se vier 0 ou muito menor, **parar** e não substituir nada.
4. **Subir**: `create_file` na mesma pasta, mesmo título, `contentMimeType: text/csv`,
   `textContent` = conteúdo exato de `nova.csv` (vira Planilha Google).
   Conferir com `get_file_metadata` (BRIEF) que o novo arquivo abriu com o cabeçalho.
5. **Arquivar a anterior**: `update_file` na planilha antiga movendo para a pasta
   "Histórico - Lançamentos para classificar" (id `1dxpEP0pp7vIIjiYoI-VafWc0cdlraxNy`) e
   renomeando para `DR Oral Clinic - Lançamentos para classificar (até AAAA-MM-DD)`.
   Nunca apagar.
6. **Resumo final** (curto, em português): total de linhas, novas, removidas (Nº) e avisos
   de colunas da equipe que o script não conseguiu ler com certeza.

Regras de "não identificado": categoria 3.503 (despesa) ou 1.112 (receita), ou centro de custo
"Não Identificado"/vazio. Chave de cruzamento: ID Nibo (scheduleId). Pagos/recebidos entram;
em aberto só se já venceu. Lista de categorias/CC: planilha "DR Oral Clinic - Listas de Categoria e CC".
