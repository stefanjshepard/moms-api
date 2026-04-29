export type AuthActorType = 'admin' | 'booking_client' | 'system_webhook' | 'anonymous';

export interface AuthContext {
  actorType: AuthActorType;
  actorId: string | null;
  authMethod: 'admin_key' | 'booking_token' | 'webhook_signature' | 'none';
}
