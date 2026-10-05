export interface ShareSetApi {
  copyLink: () => Promise<void>
  downloadJson: () => Promise<void>
  webShare: () => Promise<void>
  qrDataUrl: string | undefined
}

export function useShareSet(_setId: string): ShareSetApi {
  return { copyLink: async () => {}, downloadJson: async () => {}, webShare: async () => {}, qrDataUrl: undefined }
}
