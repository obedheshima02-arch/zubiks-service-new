// sw.js - Service Worker PWA & Push Notification Handler for Zubiks Services

const CACHE_NAME = 'zubiks-cache-v2';

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Handling Notification Clicks
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (let client of clientList) {
                if ('focus' in client) {
                    client.postMessage({ action: 'NAVIGATE_NOTIFICATIONS' });
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow('/public/index.html#tab-user-notifications');
            }
        })
    );
});

// Handling Push Events
self.addEventListener('push', event => {
    let data = { title: 'Zubiks Service', body: 'Nouvelle mise à jour sur votre compte.' };
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }
    
    const options = {
        body: data.body || 'Une nouvelle opération a été enregistrée sur votre compte.',
        icon: 'icon-512.png',
        badge: 'icon-512.png',
        vibrate: [200, 100, 200],
        data: {
            dateOfArrival: Date.now()
        }
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || '🟢 Zubiks Service', options)
    );
});

// Fetch Strategy: Network First
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
