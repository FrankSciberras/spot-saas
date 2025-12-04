declare module 'web-push' {
  interface PushSubscription {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  }

  interface SendResult {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  }

  interface VapidDetails {
    subject: string;
    publicKey: string;
    privateKey: string;
  }

  export function setVapidDetails(
    subject: string,
    publicKey: string,
    privateKey: string
  ): void;

  export function sendNotification(
    subscription: PushSubscription,
    payload: string | Buffer,
    options?: {
      TTL?: number;
      headers?: Record<string, string>;
      contentEncoding?: string;
      vapidDetails?: VapidDetails;
    }
  ): Promise<SendResult>;

  export function generateVAPIDKeys(): {
    publicKey: string;
    privateKey: string;
  };
}
