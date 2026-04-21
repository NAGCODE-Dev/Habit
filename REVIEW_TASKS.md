# Revisão da base de código: tarefas sugeridas (atualizada)

## 1) Erro de digitação / copy (UI)
**Tarefa:** corrigir textos sem acentuação em mensagens para o usuário, começando por:
- `"Digite uma quantidade valida em ml."` -> `"Digite uma quantidade válida em ml."`

**Referência:** `src/App.js` (toast de validação do input de água manual).

---

## 2) Correção de bug (analytics cache não usado)
**Tarefa:** evitar recomputar analytics em toda normalização de estado.

**Problema observado:** `normalizeAppState` chama `refreshAnalyticsCache` sempre, ignorando o caminho de cache (`getCachedAnalytics`) e degradando performance em uso intenso.

**Proposta:** usar estratégia:
1. tentar `getCachedAnalytics(state)`;
2. só recalcular se TTL expirou ou se `eventIndex.lastEventId` mudou.

**Referências:**
- `src/services/dayService.js` (`normalizeAppState`)
- `src/services/analyticsService.js` (`getCachedAnalytics`, `refreshAnalyticsCache`)

---

## 3) Ajuste de comentário/discrepância de documentação
**Tarefa:** documentar no `README.md` a arquitetura atual (event sourcing + snapshot + compaction + analytics), pois a documentação ainda descreve majoritariamente comportamento funcional e comandos, sem refletir a camada de dados introduzida.

**Referências:**
- `README.md`
- `src/services/eventService.js`
- `src/services/snapshotService.js`
- `src/services/analyticsService.js`

---

## 4) Melhoria de teste (regressão crítica de replay)
**Tarefa:** criar testes unitários para replay incremental com snapshot.

**Casos mínimos sugeridos:**
1. `reduceEvents(..., { baseDay, startAfterEventId })` deve aplicar apenas delta após `lastEventId`;
2. `compactDate` deve gerar snapshot e mover eventos para `eventArchive` sem perder reconstrução final;
3. `reconstructDayWithSnapshot` deve retornar o mesmo resultado do replay completo (consistência de estado);
4. migração `v5 -> v6` deve manter dados e apenas normalizar `analyticsCache`.

**Referências:**
- `src/services/eventService.js`
- `src/services/snapshotService.js`
- `src/services/integrityService.js`
