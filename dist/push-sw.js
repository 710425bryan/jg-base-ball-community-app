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
  
  // 提取 Edge Function 傳來的 url (處理 object object 問題)
  let targetPath = '/';
  if (event.notification.data && event.notification.data.url) {
    targetPath = event.notification.data.url;
  }
  
  // 因為 Vue 是用 Hash Router，強制補上 # 前綴
  if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;
  const urlToOpen = new URL('/#' + targetPath, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
