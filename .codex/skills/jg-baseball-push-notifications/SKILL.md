---
name: jg-baseball-push-notifications
description: "Push notification workflow for jg-base-ball-community-app. Use when adding or modifying web push delivery, recipient targeting, subscription handling, or event dedupe. Trigger on requests about 推播、手機通知、web push、`src/utils/pushNotifications.ts`、`supabase/functions/send-push-notification`、`push_dispatch_events`、`eventKey`、`web_push_subscriptions`、或通知權限控制。"
---

# JG Baseball Push Notifications

## Overview

用這個 skill 處理前端推播入口、Edge Function 推播派送、收件權限與去重。把收件對象、事件去重、與入口一致性當成同一條流程設計。

## 讀取順序

1. 先讀 `AGENT.md`。
2. 讀 `src/utils/pushNotifications.ts` 與 `src/utils/pushNotifications.test.ts`。
3. 讀 `supabase/functions/send-push-notification/index.ts` 與 `supabase/functions/_shared/push.ts`。
4. 再讀實際發送通知的 `view`、`service`、`webhook` 或 Realtime 入口。

## 不可破壞規則

- 前端與表單入口的通知，優先統一走 `src/utils/pushNotifications.ts`。
- 收件對象以 `feature` + `action` 對應權限決定，不要把所有推播硬綁在 `leave_requests`。
- `targetRoles` 只能用來縮小原本符合權限的對象，不要拿它取代權限查詢。
- 同一事件若可能從表單、Realtime、重試或多個入口觸發，必須提供穩定 `eventKey`。
- 讓 `send-push-notification` 與 `push_dispatch_events` 負責 dedupe，不要在各入口各做一套。
- 排程型通知可用專屬 Edge Function，但仍必須寫入 `push_dispatch_events`，並確認 `get_notification_feed()` 可顯示對應 source。
- 通知 click deep link 不可只靠單一 hash、search 或 `postMessage`。`public/push-sw.js` 必須先寫 IndexedDB `jg-baseball-push-deeplink/pendingTargets/latest`，再同時帶 `?push_target=...` 與 `#/push-entry?target=...`，並用 service worker `postMessage` 通知已開啟的 client；前端統一透過 `src/utils/pushDeepLink.ts` 正規化與 consume target。
- 賽事提醒或舊 `/match-records?match_id=...` 連結都要導到 `/calendar?match_id=...`，讓「賽程與行事曆」負責開啟比賽詳情 dialog。

## 工作流程

1. 先決定這次事件的 `feature`、`action`、標題、內容與導向 URL。
2. 單筆事件用 `buildPushEventKey()`，多筆聚合事件用 `buildGroupedPushEventKey()`。
3. 若事件從前端發起，優先用 `dispatchPushNotification()`。
4. 若事件從 Edge Function 或 webhook 發起，沿用 `_shared/push.ts` 的權限與 subscription helper，不要重寫查詢。
5. 若可以定位新資料，讓 URL 帶入 highlight 或深連結參數；賽事通知使用 `/calendar?match_id=<id>`。

## 派送細節

- 讓 Edge Function 清理 404/410 的過期 subscription。
- 保留 provider 統計與 summary 回傳格式，方便後續追蹤。
- 改到通知規則時，一併檢查有沒有可能出現重複推播或漏發情境。
- 改到 click target 時，同步檢查 `public/push-sw.js`、`src/main.ts`、`src/views/PushEntryView.vue`、`src/composables/useNotificationFeed.ts`、`src/utils/pushDeepLink.ts` 與 `vite.config.ts` 的 `workbox.importScripts` 版本參數。

## 驗證

- 跑 `pnpm exec vitest run src/utils/pushNotifications.test.ts`。
- 改到 click target 或 deep link 時，補跑 `pnpm exec vitest run src/utils/pushDeepLink.test.ts src/composables/useNotificationFeed.test.ts`。
- 針對可能重複觸發的入口做一次 dedupe 檢查。
- 若動到 Edge Function payload 或 summary，確認前端呼叫端仍能正常解讀結果。
