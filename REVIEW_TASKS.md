# Revisão da base de código: tarefas sugeridas

## 1) Erro de digitação/texto (copy)
**Tarefa sugerida:** padronizar a escrita da interface para português com acentuação correta (ex.: "Diferenca" -> "Diferença", "amanha" -> "amanhã", "agua" -> "água"), começando pela mensagem de desvio de horário.

- Referência principal: `src/services/date-utils.js` (`diffNotice`).
- Impacto: melhora clareza e percepção de qualidade sem alterar regra de negócio.

## 2) Correção de bug funcional
**Tarefa sugerida:** implementar a regra de negócio indicada para limite de "pular corrida" em até 2 vezes por semana.

- Hoje existe apenas dica visual no app, sem validação real.
- Referência principal: `src/App.js` (hint em "Pular hoje") e fluxo de toggle no estado.
- Impacto: evita inconsistência entre comportamento esperado e comportamento real.

## 3) Ajuste de documentação / discrepância
**Tarefa sugerida:** atualizar o `README.md` para documentar o comando de desenvolvimento (`npm run dev`) que já existe no `package.json`.

- Referências: `README.md` (seção de comandos) e `package.json` (script `dev`).
- Impacto: reduz atrito de onboarding e elimina inconsistência entre docs e scripts reais.

## 4) Melhoria de teste
**Tarefa sugerida:** criar testes unitários para lógica de lembrete de água e casos de borda de horário.

- Referência principal: `src/services/date-utils.js` (`findDueReminderHour`).
- Casos mínimos:
  - não dispara para hora já enviada;
  - dispara apenas dentro da janela [HH:00, HH:59];
  - retorna o lembrete mais recente quando mais de um horário estiver em atraso;
  - retorna `null` quando não há lembrete devido.
- Impacto: reduz regressões em uma regra temporal sensível.
