export const CHANNEL_ID = "vscode";

export type StringMap = Record<string, string>;

export interface CommBridgeAccountConfig {
  enabled?: boolean;
  label?: string;
  outboundUrl?: string;
  authToken?: string;
  webhookSecret?: string;
  defaultRecipient?: string;
  headers?: StringMap;
}

export interface RootConfig {
  channels?: {
    [CHANNEL_ID]?: {
      accounts?: Record<string, CommBridgeAccountConfig>;
    };
  };
}

export interface AccountInspection {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  label?: string;
  outboundUrlStatus: "available" | "missing";
  authTokenStatus: "available" | "missing";
  authTokenSource?: "config";
  webhookSecretStatus: "available" | "missing";
  webhookSecretSource?: "config";
  defaultRecipientStatus: "available" | "missing";
}

export function getAccounts(cfg: RootConfig): Record<string, CommBridgeAccountConfig> {
  return cfg.channels?.[CHANNEL_ID]?.accounts ?? {};
}

export function listAccountIds(cfg: RootConfig): string[] {
  return Object.keys(getAccounts(cfg));
}

export function resolveAccount(cfg: RootConfig, accountId?: string): CommBridgeAccountConfig & { accountId: string } {
  const resolvedAccountId = accountId ?? "default";
  return {
    accountId: resolvedAccountId,
    ...getAccounts(cfg)[resolvedAccountId],
  };
}

export function inspectAccount(cfg: RootConfig, accountId?: string): AccountInspection {
  const account = resolveAccount(cfg, accountId);
  const configured = Boolean(account.outboundUrl);

  return {
    accountId: account.accountId,
    enabled: account.enabled !== false,
    configured,
    label: account.label,
    outboundUrlStatus: account.outboundUrl ? "available" : "missing",
    authTokenStatus: account.authToken ? "available" : "missing",
    authTokenSource: account.authToken ? "config" : undefined,
    webhookSecretStatus: account.webhookSecret ? "available" : "missing",
    webhookSecretSource: account.webhookSecret ? "config" : undefined,
    defaultRecipientStatus: account.defaultRecipient ? "available" : "missing",
  };
}

export function requireConfiguredAccount(cfg: RootConfig, accountId?: string): CommBridgeAccountConfig & { accountId: string } {
  const account = resolveAccount(cfg, accountId);

  if (!account.outboundUrl) {
    throw new Error(
      `Channel ${CHANNEL_ID} account ${account.accountId} is missing channels.${CHANNEL_ID}.accounts.${account.accountId}.outboundUrl`,
    );
  }

  return account;
}
