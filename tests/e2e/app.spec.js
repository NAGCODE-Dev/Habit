import { expect, test } from "@playwright/test";

const DB_NAME = "habit-athlete-pwa";
const DB_STORE = "kv";
const APP_STATE_KEY = "app-state";
const APP_STATE_BACKUP_KEY = "app-state-backup";

async function writeAppState(page, state) {
  await page.evaluate(async ({ state, dbName, storeName, primaryKey, backupKey }) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName);
        }
      };

      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        store.put(state, primaryKey);
        store.put(state, backupKey);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      };

      request.onerror = () => reject(request.error);
    });
  }, {
    state,
    dbName: DB_NAME,
    storeName: DB_STORE,
    primaryKey: APP_STATE_KEY,
    backupKey: APP_STATE_BACKUP_KEY
  });
}

async function readAppState(page) {
  return page.evaluate(async ({ dbName, storeName, primaryKey }) => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName);
        }
      };

      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const getRequest = store.get(primaryKey);
        getRequest.onsuccess = () => resolve(getRequest.result ?? null);
        getRequest.onerror = () => reject(getRequest.error);
      };

      request.onerror = () => reject(request.error);
    });
  }, {
    dbName: DB_NAME,
    storeName: DB_STORE,
    primaryKey: APP_STATE_KEY
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__DISABLE_SERVICE_WORKER__ = true;
  });
});

test("carrega a home com header, hidratação e seções visíveis", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Rotina" })).toBeVisible();
  await expect(page.getByText("Hidratação", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sono" })).toBeVisible();
  await expect(page.getByText("Treino principal (15h - 17h/18h)")).toBeVisible();
});

test("adiciona água por preset e persiste após reload", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "+250 ml" }).click();
  await expect(page.getByRole("heading", { name: /250 ml \/ 3\.000 ml/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: /250 ml \/ 3\.000 ml/ })).toBeVisible();
});

test("água manual inválida mostra toast de erro", async ({ page }) => {
  await page.goto("/");

  await page.locator("#manual-water-amount").fill("0");
  await page.getByRole("button", { name: "Adicionar" }).click();

  await expect(page.getByText("Digite uma quantidade válida em ml.")).toBeVisible();
});

test("troca para histórico e reflete a URL", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Histórico" }).click();
  await expect(page).toHaveURL(/view=history/);
  await expect(page.getByRole("heading", { name: "Calendário" })).toBeVisible();
});

test("dispensa prompt de lembrete e mantém a preferência após reload", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Agora não" }).click();
  await expect(page.getByRole("button", { name: "Agora não" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("button", { name: "Agora não" })).toHaveCount(0);
});

test("boot com estado legado remove telemetryShadow e mantém o app funcional", async ({ page }) => {
  await page.goto("/");

  const { todayKey, now } = await page.evaluate(() => {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return {
      todayKey: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      now: now.toISOString()
    };
  });

  await writeAppState(page, {
    version: 6,
    schemaVersion: 6,
    currentDayKey: todayKey,
    day: {
      date: todayKey
    },
    events: [
      {
        id: "evt-seed-water",
        date: todayKey,
        type: "SNAPSHOT_SEEDED",
        payload: {
          day: {
            date: todayKey,
            water: {
              total: 400,
              logs: [
                {
                  id: "seed-water",
                  amount: 400,
                  timestamp: now
                }
              ]
            }
          }
        },
        timestamp: Date.parse(now)
      }
    ],
    eventIndex: {
      byDate: {
        [todayKey]: ["evt-seed-water"]
      },
      byType: {
        SNAPSHOT_SEEDED: ["evt-seed-water"]
      },
      lastEventId: "evt-seed-water"
    },
    telemetryShadow: {
      googleFit: {
        [todayKey]: { steps: 9000 }
      }
    }
  });

  await page.reload();

  await expect(page.getByRole("heading", { name: "Rotina" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /400 ml \/ 3\.000 ml/ })).toBeVisible();

  const state = await readAppState(page);
  expect(state.telemetryShadow).toBeUndefined();
});
