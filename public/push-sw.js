const PUSH_NOTIFICATION_CLICK_MESSAGE = 'PUSH_NOTIFICATION_CLICK';
const PUSH_DEEP_LINK_DB_NAME = 'jg-baseball-push-deeplink';
const PUSH_DEEP_LINK_DB_VERSION = 1;
const PUSH_DEEP_LINK_STORE = 'pendingTargets';
const PUSH_DEEP_LINK_LATEST_KEY = 'latest';
const PUSH_DEEP_LINK_DIAGNOSTIC_KEY = 'latestDiagnostic';
const PUSH_DEEP_LINK_CACHE_NAME = 'jg-baseball-push-deeplink-cache';
const PUSH_DEEP_LINK_CACHE_TARGET_PATH = '/__push-deeplink/latest.json';
const PUSH_DEEP_LINK_CACHE_DIAGNOSTIC_PATH = '/__push-deeplink/diagnostic.json';

const normalizeTargetPath = (rawTarget) => {
  let nextTarget = typeof rawTarget === 'string' ? rawTarget.trim() : '';

  if (!nextTarget) {
    return '/dashboard';
  }

  if (nextTarget.startsWith('/#')) {
    nextTarget = nextTarget.slice(2);
  } else if (nextTarget.startsWith('#')) {
    nextTarget = nextTarget.slice(1);
  } else {
    try {
      const targetUrl = new URL(nextTarget, self.location.origin);
      if (targetUrl.origin !== self.location.origin) {
        return '/dashboard';
      }

      nextTarget = targetUrl.hash.startsWith('#/')
        ? targetUrl.hash.slice(1)
        : targetUrl.pathname + targetUrl.search;
    } catch (e) {
      // Keep relative non-URL values and normalize them below.
    }
  }

  if (!nextTarget.startsWith('/')) {
    nextTarget = '/' + nextTarget;
  }

  if (nextTarget.startsWith('//') || nextTarget.startsWith('/push-entry')) {
    return '/dashboard';
  }

  try {
    const targetUrl = new URL(nextTarget, self.location.origin);
    if (targetUrl.origin === self.location.origin && targetUrl.pathname === '/match-records') {
      const matchId = targetUrl.searchParams.get('match_id');
      if (matchId) {
        return '/calendar?match_id=' + encodeURIComponent(matchId);
      }
    }
  } catch (e) {
    // Fall through and let the app handle the original target.
  }

  return nextTarget;
};

const buildPushEntryUrl = (targetPath) => {
  const encodedTarget = encodeURIComponent(targetPath);

  return new URL(
    '/?push_target=' + encodedTarget + '#/push-entry?target=' + encodedTarget,
    self.location.origin
  ).href;
};

const postPushClickMessage = (client, targetPath) => {
  if (client && typeof client.postMessage === 'function') {
    client.postMessage({
      type: PUSH_NOTIFICATION_CLICK_MESSAGE,
      targetPath
    });
  }
};

const openPushDeepLinkDb = () => {
  if (!self.indexedDB) {
    return Promise.reject(new Error('IndexedDB is unavailable'));
  }

  return new Promise((resolve, reject) => {
    const request = self.indexedDB.open(PUSH_DEEP_LINK_DB_NAME, PUSH_DEEP_LINK_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(PUSH_DEEP_LINK_STORE)) {
        db.createObjectStore(PUSH_DEEP_LINK_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open push deep link DB'));
  });
};

const transactionDone = (transaction) =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });

const writeIndexedDbRecord = async (key, record) => {
  const db = await openPushDeepLinkDb();
  const transaction = db.transaction(PUSH_DEEP_LINK_STORE, 'readwrite');

  transaction.objectStore(PUSH_DEEP_LINK_STORE).put({
    ...record,
    id: key
  });

  await transactionDone(transaction);
};

const getCacheRequest = (path) =>
  new Request(new URL(path, self.location.origin).href, {
    cache: 'no-store',
    credentials: 'same-origin'
  });

const writeCachedJson = async (path, value) => {
  if (!self.caches) {
    throw new Error('Cache Storage is unavailable');
  }

  const cache = await self.caches.open(PUSH_DEEP_LINK_CACHE_NAME);
  await cache.put(
    getCacheRequest(path),
    new Response(JSON.stringify(value), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json'
      }
    })
  );
};

const getStorageStatus = (result) => result.status === 'fulfilled' ? 'saved' : 'failed';

const persistPushClickTarget = async (targetPath, createdAt) => {
  const targetRecord = {
    id: PUSH_DEEP_LINK_LATEST_KEY,
    targetPath,
    createdAt
  };

  const [indexedDbResult, cacheResult] = await Promise.allSettled([
    writeIndexedDbRecord(PUSH_DEEP_LINK_LATEST_KEY, targetRecord),
    writeCachedJson(PUSH_DEEP_LINK_CACHE_TARGET_PATH, targetRecord)
  ]);

  const diagnosticsRecord = {
    id: PUSH_DEEP_LINK_DIAGNOSTIC_KEY,
    source: 'notificationclick',
    targetPath,
    createdAt,
    indexedDb: getStorageStatus(indexedDbResult),
    cache: getStorageStatus(cacheResult),
    userAgent: self.navigator && self.navigator.userAgent ? self.navigator.userAgent : ''
  };

  await Promise.allSettled([
    writeIndexedDbRecord(PUSH_DEEP_LINK_DIAGNOSTIC_KEY, diagnosticsRecord),
    writeCachedJson(PUSH_DEEP_LINK_CACHE_DIAGNOSTIC_PATH, diagnosticsRecord)
  ]);

  return diagnosticsRecord;
};

const focusAndNotifyClient = (client, targetPath) => {
  if (!client) return undefined;

  if ('focus' in client) {
    return client.focus()
      .catch(() => client)
      .then((focusedClient) => {
        postPushClickMessage(focusedClient || client, targetPath);
        return focusedClient || client;
      });
  }

  postPushClickMessage(client, targetPath);
  return client;
};

self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const data = event.data.json();
      const title = data.title || '中港熊戰 新通知';
      const options = {
        body: data.body || '新訊息內容',
        icon: '/少棒元素_20260324_232837_0000.png',
        badge: '/少棒元素_20260324_232837_0000.png',
        data: {
          url: data.url || '/'
        }
      };
      event.waitUntil(self.registration.showNotification(title, options));
    } catch (e) {
      event.waitUntil(
        self.registration.showNotification('中港熊戰 新通知', {
          body: event.data.text() || '您有新的推播訊息！',
          icon: '/logo.jpg'
        })
      );
    }
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const targetPath = normalizeTargetPath(event.notification.data && event.notification.data.url);
  const urlToOpen = buildPushEntryUrl(targetPath);
  const createdAt = Date.now();

  const persistTarget = persistPushClickTarget(targetPath, createdAt)
    .catch(error => {
      console.warn('Failed to persist push notification target:', error);
    });

  const routeClient = clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(windowClients => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (!client.url.startsWith(self.location.origin)) {
          continue;
        }

        if (client.url === urlToOpen && 'focus' in client) {
          return focusAndNotifyClient(client, targetPath);
        }

        if (typeof client.navigate === 'function') {
          return client.navigate(urlToOpen)
            .catch(() => client)
            .then(navigatedClient => {
              return focusAndNotifyClient(navigatedClient || client, targetPath);
            });
        }

        return focusAndNotifyClient(client, targetPath);
      }

      if (clients.openWindow) {
        return clients.openWindow(urlToOpen)
          .then(client => focusAndNotifyClient(client, targetPath));
      }
    });

  event.waitUntil(Promise.allSettled([persistTarget, routeClient]));
});
