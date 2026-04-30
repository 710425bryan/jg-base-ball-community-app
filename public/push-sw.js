const normalizeTargetPath = (rawTarget) => {
  let nextTarget = typeof rawTarget === 'string' ? rawTarget.trim() : '';

  if (!nextTarget) {
    return '/dashboard';
  }

  if (nextTarget.startsWith('/#')) {
    nextTarget = nextTarget.slice(2);
  } else if (nextTarget.startsWith('#')) {
    nextTarget = nextTarget.slice(1);
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
  const urlToOpen = new URL(
    '/#/push-entry?target=' + encodeURIComponent(targetPath),
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (!client.url.startsWith(self.location.origin)) {
          continue;
        }

        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }

        if (typeof client.navigate === 'function') {
          return client.navigate(urlToOpen)
            .catch(() => {
              if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
              }

              return client;
            })
            .then(navigatedClient => {
              const focusTarget = navigatedClient || client;
              if (focusTarget && 'focus' in focusTarget) {
                return focusTarget.focus();
              }
            });
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
