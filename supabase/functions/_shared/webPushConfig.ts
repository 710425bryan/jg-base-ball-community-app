type WebPushConfigurator = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
};

// Subscriptions are bound to the public key. The configured secret pair must
// match the frontend public key; a rotation requires users to subscribe again.
export const configureWebPush = (
  webPush: WebPushConfigurator,
  getEnv: (name: string) => string | undefined,
) => {
  const names = ["VAPID_SUBJECT", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"] as const;
  const values = names.map((name) => getEnv(name)?.trim() || "");
  const missing = names.filter((_name, index) => !values[index]);
  if (missing.length > 0) {
    throw new Error(`Web Push configuration is missing: ${missing.join(", ")}`);
  }
  webPush.setVapidDetails(values[0]!, values[1]!, values[2]!);
};
