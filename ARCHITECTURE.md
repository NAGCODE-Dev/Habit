# Arquitetura

## Visão geral

O app é uma PWA local-first para rotina diária. O estado persistido fica em IndexedDB e é reconstruído a partir de eventos de domínio, com snapshots para reduzir replay e uma camada separada de analytics para consultas derivadas.

## Blocos principais

- `eventStore` + `eventService`
  - registram e reproduzem eventos imutáveis do domínio.
- `dayService`
  - aplica mutações da interface e grava novos eventos.
- `snapshotService`
  - gera snapshots por dia e recompõe o estado atual com snapshot + delta.
- `integrityService`
  - migra versões de schema, saneia payloads persistidos e garante shape consistente do estado.
- `analyticsService` + `analyticsQueryService`
  - calculam métricas e insights sem alterar a fonte de verdade.
- `notifications`
  - controla permissão, polling em foreground e integração com service worker para lembretes de água.

## Regras de domínio

1. A fonte de verdade é o histórico de eventos do usuário.
2. O dia atual sempre pode ser reconstruído por replay determinístico.
3. Snapshots são otimização de leitura, não uma segunda fonte de verdade.
4. Analytics e lembretes são camadas derivadas; não redefinem o estado manual do dia.

## Persistência

- `storageService` lê e grava o estado reparado no IndexedDB.
- `repairDatabase` aplica migrações de schema antes do app usar o estado.
- Ao montar, o app normaliza o conteúdo persistido e salva novamente o resultado saneado para manter o banco consistente.
