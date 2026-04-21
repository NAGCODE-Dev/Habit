# Health Event Sourcing Platform (UHM + Telemetry Shadow)

## Princípios

1. **Event Store é a verdade imutável** para ações humanas intencionais.
2. **Telemetria externa é contexto** e fica em `telemetryShadow` (não vira evento de domínio).
3. **Unified Health Model (UHM)** é derivado de `core + telemetry`.
4. **Validação e normalização** são centralizadas no domínio (`domainGuards` + sanitização de replay).

## Implementação atual no projeto

- `src/services/eventService.js`
  - replay com sanitização (ignora eventos inválidos no histórico).
- `src/services/dayService.js`
  - mutações de domínio manuais (event store).
- `src/services/googleFitService.js`
  - integração com Google Fit Aggregate API.
- `src/services/telemetryService.js`
  - shadow store da telemetria (`telemetryShadow.googleFit[date]`).
- `src/services/healthModelService.js`
  - builder do UHM para combinar `core` e `telemetry`.
- `src/services/integrityService.js`
  - reparo/migração/sanitização do banco incluindo `telemetryShadow`.

## Regra de ouro

**Google Fit não escreve no histórico de eventos de hábitos.**

A sincronização atualiza apenas `telemetryShadow`, preservando replay determinístico do domínio e evitando inflar score manual.
