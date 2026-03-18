import Dexie, { type Table } from 'dexie'

export interface AppData {
  id: number
  sessionString: string
  apiId: number
  apiHash: string
  storagePeer: string | number   // ← Nhóm cố định (ví dụ: '@my_storage' hoặc -1001234567890)
}

class TelegramDB extends Dexie {
  data!: Table<AppData>

  constructor() {
    super('TelegramStorageDB')
    this.version(1).stores({
      data: 'id,sessionString,apiId,apiHash,storagePeer'
    })
  }
}

export const db = new TelegramDB()