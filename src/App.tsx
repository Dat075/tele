import { useState, useEffect } from 'react'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { Api } from 'telegram/tl'
import { db } from './db'
import './index.css'

export default function App() {
  const [client, setClient] = useState<TelegramClient | null>(null)
  const [step, setStep] = useState<'api' | 'phone' | 'code' | 'setGroup' | 'connected'>('api')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [storagePeer, setStoragePeer] = useState<string>('-1003789047897')
  const [uploading, setUploading] = useState(false)
  const [recentFiles, setRecentFiles] = useState<any[]>([])
  const [status, setStatus] = useState('')

  // Khởi tạo lại session từ Dexie
  useEffect(() => {
    const init = async () => {
      try {
        const saved = await db.data.get(1)
        if (!saved) return

        const session = new StringSession(saved.sessionString || '')
        const tg = new TelegramClient(session, saved.apiId, saved.apiHash, {
          connectionRetries: 5,
        })

        await tg.connect()
        if (await tg.isUserAuthorized()) {
          setClient(tg)
          if (saved.storagePeer) {
            setStoragePeer(String(saved.storagePeer))
            setStep('connected')
            await loadRecentFiles(tg, saved.storagePeer)
          } else {
            setStep('setGroup')
          }
        }
      } catch (err) {
        console.error('Init error:', err)
      }
    }
    init()
  }, [])

  // Tự động xác nhận mã khi người dùng nhập đủ 5 ký tự
  useEffect(() => {
    if (step === 'code' && code.length >= 5 && client) {
      signIn()
    }
  }, [code, step, client])

  const saveToDB = async (tgClient: TelegramClient, peer: string | number) => {
    const sessionString = tgClient.session.save() as unknown as string
    await db.data.put({
      id: 1,
      sessionString,
      apiId: tgClient.apiId!,
      apiHash: tgClient.apiHash!,
      storagePeer: peer
    })
  }

  // ==================== BẮT ĐẦU - API HARDCODE ====================
  const handleSaveApi = async () => {
    const apiId = 24640384
    const apiHash = 'e68f1d53901b397d581861c7a8b30f74'

    const tg = new TelegramClient(new StringSession(''), apiId, apiHash, {
      connectionRetries: 5,
    })

    setClient(tg)
    await db.data.put({ id: 1, sessionString: '', apiId, apiHash, storagePeer: '' })
    setStep('phone')
    setStatus('')
  }

  // ==================== ĐĂNG NHẬP (ĐÃ SỬA) ====================
  const signIn = async () => {
    if (!client) return
    setStatus('Đang xử lý...')

    try {
      await client.start({
        phoneNumber: phone,
        phoneCode: async () => code,
        password: async () => '', // Thêm xử lý 2FA sau nếu cần
        onError: (err) => console.error(err),
      })

      await saveToDB(client, storagePeer)
      setStep('connected')
      setStatus('✅ Đăng nhập thành công!')
      await loadRecentFiles(client, storagePeer)
    } catch (err: any) {
      if (err.errorMessage === 'PHONE_CODE_INVALID') {
        setStatus('❌ Mã xác thực không đúng. Vui lòng thử lại.')
        setCode('')
      } else if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        setStatus('Tài khoản có bật 2FA. Chức năng này chưa hỗ trợ.')
      } else {
        setStatus('Lỗi đăng nhập: ' + (err.message || err))
      }
      console.error(err)
    }
  }

  // ==================== LƯU NHÓM LƯU TRỮ ====================
  const saveStorageGroup = async () => {
    if (!client || !storagePeer) return

    try {
      await client.getEntity(storagePeer)
      await saveToDB(client, storagePeer)
      setStep('connected')
      await loadRecentFiles(client, storagePeer)
      alert('✅ Nhóm đã được lưu vĩnh viễn!')
    } catch (err: any) {
      alert('Nhóm không hợp lệ: ' + err.message)
    }
  }

// ==================== UPLOAD FILE (ĐÃ SỬA randomId + TypeScript) ====================
const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file || !client) return

  setUploading(true)
  setStatus(`Đang upload ${file.name}...`)

  try {
    const peerEntity = await client.getEntity(storagePeer)

    const uploadedFile = await client.uploadFile({
      file: file,
      workers: 1,
    })

    await client.invoke(
      new Api.messages.SendMedia({
        peer: peerEntity,
        media: new Api.InputMediaUploadedDocument({
          file: uploadedFile,
          mimeType: file.type || 'application/octet-stream',
          attributes: [
            new Api.DocumentAttributeFilename({ fileName: file.name })
          ],
        }),
        message: `📎 ${file.name} • ${new Date().toLocaleString('vi-VN')}`,
        randomId: BigInt(`-${Date.now()}${Math.floor(Math.random() * 1000000)}`) as any,   // ← Fix ở đây
        silent: false,
      })
    )

    setStatus(`✅ Upload "${file.name}" thành công!`)
    await loadRecentFiles(client, storagePeer)
  } catch (err: any) {
    console.error('Upload error:', err)
    setStatus('Upload thất bại: ' + (err.message || err))
  } finally {
    setUploading(false)
    e.target.value = ''
  }
}

  // ==================== LOAD FILE GẦN ĐÂY ====================
  const loadRecentFiles = async (tgClient: TelegramClient, peer: string | number) => {
    try {
      const peerEntity = await tgClient.getEntity(peer)
      const messages = await tgClient.getMessages(peerEntity, { limit: 15 })

      // Chỉ lấy tin nhắn có media (document)
      const files = messages.filter((m: any) => m.media?.document)
      setRecentFiles(files)
    } catch (err) {
      console.error('Load files error:', err)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-gray-900 rounded-3xl p-8 shadow-2xl">
        <h1 className="text-4xl font-bold text-center mb-6">📦 Telegram Storage</h1>
        <p className="text-center text-sm text-gray-400 mb-8">
          Kết nối trực tiếp • Lưu file vào nhóm cố định
        </p>

        {status && (
          <p className="text-center mb-6 text-blue-400 font-medium">{status}</p>
        )}

        {/* Step 1: Bắt đầu */}
        {step === 'api' && (
          <button
            onClick={handleSaveApi}
            className="w-full py-5 bg-blue-600 hover:bg-blue-700 rounded-2xl text-xl font-semibold transition"
          >
            Bắt đầu (API đã hardcode)
          </button>
        )}

        {/* Step 2: Nhập số điện thoại */}
        {step === 'phone' && (
          <div className="space-y-4">
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+84xxxxxxxxx"
              className="input w-full"
            />
            <button
              onClick={signIn}
              className="btn-primary w-full"
              disabled={!phone}
            >
              Gửi mã xác thực
            </button>
          </div>
        )}

        {/* Step 3: Nhập mã xác thực */}
        {step === 'code' && (
          <div className="space-y-4">
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Nhập mã từ Telegram"
              className="input w-full text-center text-2xl tracking-widest"
              maxLength={5}
            />
            <p className="text-center text-sm text-gray-400">Đang chờ mã xác thực...</p>
          </div>
        )}

        {/* Step 4: Chọn nhóm lưu trữ */}
        {step === 'setGroup' && (
          <div className="space-y-4">
            <p className="text-center text-gray-300">Nhóm lưu trữ (ID nhóm)</p>
            <input
              type="text"
              value={storagePeer}
              onChange={e => setStoragePeer(e.target.value)}
              className="input w-full"
            />
            <button
              onClick={saveStorageGroup}
              className="btn-primary w-full"
            >
              Lưu nhóm vĩnh viễn
            </button>
          </div>
        )}

        {/* Step 5: Đã kết nối - Giao diện chính */}
        {step === 'connected' && client && (
          <div className="space-y-8">
            <div className="text-center">
              <p className="text-green-500 text-2xl mb-1">✅ Đã kết nối thành công</p>
              <p className="text-sm text-gray-400">
                Lưu vào nhóm: <strong>{storagePeer}</strong>
              </p>
            </div>

            {/* Upload Area */}
            <div className="border-2 border-dashed border-gray-700 rounded-3xl p-10 text-center hover:border-blue-500 transition">
              <input type="file" id="fileInput" className="hidden" onChange={uploadFile} />
              <label htmlFor="fileInput" className="cursor-pointer block">
                <span className="text-6xl mb-4 block">📤</span>
                <p className="text-xl font-medium">Chọn file để upload</p>
                <p className="text-sm text-gray-500 mt-2">Hỗ trợ tất cả định dạng</p>
              </label>
            </div>

            {uploading && <p className="text-center text-blue-400 animate-pulse">Đang upload file...</p>}

            {/* Danh sách file gần đây */}
            <div>
              <h3 className="font-medium mb-3 flex items-center gap-2">
                📋 File gần đây (10 mới nhất)
              </h3>
              <div className="max-h-80 overflow-auto space-y-2 pr-2">
                {recentFiles.length === 0 ? (
                  <p className="text-gray-500 text-center py-12">Chưa có file nào được upload</p>
                ) : (
                  recentFiles.map((msg, i) => {
                    const fileName = msg.media?.document?.attributes?.[0]?.fileName || 'File không tên'
                    return (
                      <div key={i} className="bg-gray-800 p-4 rounded-2xl text-sm break-all">
                        📎 {fileName}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}