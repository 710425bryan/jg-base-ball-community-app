const PUSH_NOTIFICATION_CLICK_MESSAGE = 'PUSH_NOTIFICATION_CLICK';

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

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
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
    })
  );
});
