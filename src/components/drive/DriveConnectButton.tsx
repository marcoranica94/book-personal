import { HardDrive, Loader2, Unlink } from 'lucide-react'
import { useDriveStore } from '@/stores/driveStore'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'

export default function DriveConnectButton() {
  const { user } = useAuthStore()
  const { isConnected, isLoading, connect, disconnect } = useDriveStore()

  if (!user) return null

  async function handleDisconnect() {
    if (!confirm('Disconnettere Google Drive? La sincronizzazione verrà disabilitata.')) return
    try {
      await disconnect(user!.uid)
      toast.success('Google Drive disconnesso')
    } catch {
      toast.error('Errore durante la disconnessione')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Caricamento...
      </div>
    )
  }

  if (isConnected) {
    return (
      <button
        onClick={handleDisconnect}
        className="flex items-center gap-2 rounded-lg border border-red-800/40 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-900/20 hover:text-red-300"
      >
        <Unlink className="h-4 w-4" />
        Disconnetti Drive
      </button>
    )
  }

  return (
    <button
      onClick={connect}
      className="flex items-center gap-2 rounded-lg bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1557b0]"
    >
      <HardDrive className="h-4 w-4" />
      Connetti Google Drive
    </button>
  )
}
