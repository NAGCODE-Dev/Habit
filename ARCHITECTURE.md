# Arquitetura

## Visão geral

O app é uma PWA local-first para rotina diária. O runtime vive em `src/app/*`, a interface continua sendo montada em HTML string a partir de componentes puros, e o estado persistido é reconstruído a partir de eventos + snapshots guardados em IndexedDB.

## Mapa do runtime

- `src/main.js`
  - bootstrap mínimo do navegador.
- `src/app/bootstrap.js`
  - cria o app e registra o service worker quando o ambiente permitir.
- `src/app/createAppRuntime.js`
  - orquestra ciclo de vida, estado, polling, render e persistência.
- `src/app/action-handlers.js`
  - roteia `click`, `change` e `input` por `data-action`.
- `src/app/render*.js`
  - monta banner, seções do dia, view de hoje e shell principal.
- `src/App.js`
  - fachada fina de compatibilidade sobre o runtime novo.

## Fluxo principal

1. O bootstrap cria o runtime e monta um estado inicial normalizado.
2. `loadState` lê o IndexedDB e `repairDatabase` aplica migração + saneamento.
3. `normalizeAppState` recompõe o dia atual via replay e snapshots.
4. O runtime renderiza o shell, escuta ações delegadas e persiste novas transições.
5. Analytics, lembretes e toasts são camadas derivadas sobre o estado já saneado.

## Fronteiras de responsabilidade

- `eventStore` + `eventService`
  - registram e reproduzem eventos imutáveis do domínio.
- `dayService`
  - traduz ações da interface em transições baseadas em evento.
- `snapshotService`
  - compacta datas antigas e recompõe dias com snapshot + delta.
- `integrityService`
  - mantém o contrato do estado persistido entre versões de schema.
- `storageService`
  - é a única camada que lê e grava o IndexedDB usado pelo app.
- `notifications`
  - encapsula Notification API, service worker messaging e periodic sync.

## Contrato do estado persistido

O estado salvo contém, no mínimo:

- `schemaVersion` e `version`
- `currentDayKey`
- `sectionsOpen`
- `preferences`
- `analyticsCache`
- `day`
- `events`
- `eventIndex`
- `snapshots`
- `eventArchive`
- `history`

`repairDatabase` é responsável por:

- aplicar migrações até o schema atual,
- descartar campos legados que não fazem mais parte do contrato,
- validar o shape do dia atual,
- deduplicar eventos e histórico,
- garantir que `day.date` acompanhe `currentDayKey`.

## Testes e automação

- `tests/unit/`
  - domínio, replay, integridade, persistência e notificações.
- `tests/artifact/`
  - contrato do build final em `dist`.
- `tests/e2e/`
  - smoke tests reais de navegador com Playwright.
