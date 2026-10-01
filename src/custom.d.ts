
/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_DEV_SERVER_URL?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
interface Window {
  linkpointDesktop?: {
    allowLoginEndpoint(url: string): Promise<boolean>;
    request(request: { url: string; method?: string; headers?: Record<string, string>; body?: string }): Promise<{
      ok: boolean;
      status: number;
      statusText: string;
      text: string;
      headers: Record<string, string>;
    }>;
    connectViewer(request: { loginUrl: string; username: string; password: string; start?: string; mfaToken?: string; mfaHash?: string }): Promise<Record<string, any>>;
    sendChat(request: { message: string; channel?: number; type?: number }): Promise<void>;
    sendInstantMessage(request: { recipientId: string; message: string }): Promise<void>;
    sendFriendRequest(request: { recipientId: string; message?: string }): Promise<void>;
    fetchFriends(): Promise<any[]>;
    teleport(request: { destination?: string; region?: string; x?: number; y?: number; z?: number }): Promise<{ requested: { region: string; x: number; y: number; z: number }; message: string }>;
    respondScriptDialog(request: { id: string; buttonIndex?: number; text?: string }): Promise<{ answered: boolean }>;
    acceptLure(request: { id: string }): Promise<{ accepted: boolean; message: string }>;
    dismissInteraction(request: { id: string }): Promise<{ dismissed: boolean }>;
    fetchProfilePhoto(request: { name: string; full?: boolean }): Promise<{ photoBytes: string | null; contentType?: string }>;
    touchObject(request: { id?: string; localId?: number; face?: number; uv?: number[]; st?: number[]; position?: number[] }): Promise<{ touched: string | number }>;
    sit(request: { id?: string }): Promise<{ sitting: string }>;
    stand(): Promise<{ standing: boolean }>;
    getBalance(): Promise<{ balance: number }>;
    disconnectViewer(): Promise<void>;
    onViewerEvent(listener: (event: { type: string; data: any }) => void): () => void;
  };
}
