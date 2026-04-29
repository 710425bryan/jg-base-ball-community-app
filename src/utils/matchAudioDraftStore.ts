import type { MatchAudioTranscriptionResult } from './matchAudioTranscription'

export type MatchAudioDraftStatus =
  | 'recording'
  | 'paused'
  | 'ready'
  | 'processing'
  | 'transcribed'
  | 'applied'
  | 'error'

export interface MatchAudioDraftRecord {
  id: string
  scopeId: string
  inning: string
  mimeType: string
  status: MatchAudioDraftStatus
  chunkCount: number
  durationMs: number
  createdAt: string
  updatedAt: string
  transcript?: string
  result?: MatchAudioTranscriptionResult
  error?: string
  appliedAt?: string
}

interface MatchAudioChunkRecord {
  id: string
  draftId: string
  index: number
  blob: Blob
  createdAt: string
}

const DB_NAME = 'jg-baseball-match-audio'
const DB_VERSION = 1
const DRAFT_STORE = 'drafts'
const CHUNK_STORE = 'chunks'

const isIndexedDbAvailable = () =>
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined'

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB 操作失敗'))
  })

let dbPromise: Promise<IDBDatabase> | null = null

export const openMatchAudioDb = () => {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error('此瀏覽器不支援本機錄音暫存'))
  }

  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        const draftStore = db.createObjectStore(DRAFT_STORE, { keyPath: 'id' })
        draftStore.createIndex('scopeId', 'scopeId', { unique: false })
        draftStore.createIndex('updatedAt', 'updatedAt', { unique: false })
      }

      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        const chunkStore = db.createObjectStore(CHUNK_STORE, { keyPath: 'id' })
        chunkStore.createIndex('draftId', 'draftId', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('開啟錄音暫存失敗'))
  })

  return dbPromise
}

const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'))
  })

export const createMatchAudioDraftId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `audio-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const saveMatchAudioDraft = async (draft: MatchAudioDraftRecord) => {
  const db = await openMatchAudioDb()
  const transaction = db.transaction(DRAFT_STORE, 'readwrite')
  transaction.objectStore(DRAFT_STORE).put(draft)
  await transactionDone(transaction)
}

export const updateMatchAudioDraft = async (
  draftId: string,
  updater: (draft: MatchAudioDraftRecord) => MatchAudioDraftRecord
) => {
  const db = await openMatchAudioDb()
  const transaction = db.transaction(DRAFT_STORE, 'readwrite')
  const store = transaction.objectStore(DRAFT_STORE)
  const draft = await requestToPromise(store.get(draftId)) as MatchAudioDraftRecord | undefined

  if (!draft) {
    throw new Error('找不到錄音草稿')
  }

  const nextDraft = { ...updater(draft), updatedAt: new Date().toISOString() }
  store.put(nextDraft)
  await transactionDone(transaction)

  return nextDraft
}

export const addMatchAudioDraftChunk = async (draftId: string, index: number, blob: Blob) => {
  const db = await openMatchAudioDb()
  const transaction = db.transaction(CHUNK_STORE, 'readwrite')
  const chunk: MatchAudioChunkRecord = {
    id: `${draftId}:${index}`,
    draftId,
    index,
    blob,
    createdAt: new Date().toISOString(),
  }

  transaction.objectStore(CHUNK_STORE).put(chunk)
  await transactionDone(transaction)
}

export const listMatchAudioDrafts = async (scopeId: string) => {
  const db = await openMatchAudioDb()
  const transaction = db.transaction(DRAFT_STORE, 'readonly')
  const index = transaction.objectStore(DRAFT_STORE).index('scopeId')
  const drafts = await requestToPromise(index.getAll(scopeId)) as MatchAudioDraftRecord[]
  await transactionDone(transaction)

  return drafts.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export const getMatchAudioDraftChunks = async (draftId: string) => {
  const db = await openMatchAudioDb()
  const transaction = db.transaction(CHUNK_STORE, 'readonly')
  const index = transaction.objectStore(CHUNK_STORE).index('draftId')
  const chunks = await requestToPromise(index.getAll(draftId)) as MatchAudioChunkRecord[]
  await transactionDone(transaction)

  return chunks
    .sort((left, right) => left.index - right.index)
    .map((chunk) => chunk.blob)
}

export const deleteMatchAudioDraft = async (draftId: string) => {
  const db = await openMatchAudioDb()
  const transaction = db.transaction([DRAFT_STORE, CHUNK_STORE], 'readwrite')
  const draftStore = transaction.objectStore(DRAFT_STORE)
  const chunkStore = transaction.objectStore(CHUNK_STORE)
  const chunkIndex = chunkStore.index('draftId')
  const chunks = await requestToPromise(chunkIndex.getAll(draftId)) as MatchAudioChunkRecord[]

  chunks.forEach((chunk) => chunkStore.delete(chunk.id))
  draftStore.delete(draftId)
  await transactionDone(transaction)
}
