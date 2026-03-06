const CHANNEL_ID = "vscode";

function getAccounts(cfg) {
  return cfg?.channels?.[CHANNEL_ID]?.accounts ?? {};
}

function listAccountIds(cfg) {
  return Object.keys(getAccounts(cfg));
}

function resolveAccount(cfg, accountId) {
  const resolvedAccountId = accountId ?? "default";
  return {
    accountId: resolvedAccountId,
    ...getAccounts(cfg)[resolvedAccountId],
  };
}

function inspectAccount(cfg, accountId) {
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

function requireConfiguredAccount(cfg, accountId) {
  const account = resolveAccount(cfg, accountId);

  if (!account.outboundUrl) {
    throw new Error(
      `Channel ${CHANNEL_ID} account ${account.accountId} is missing channels.${CHANNEL_ID}.accounts.${account.accountId}.outboundUrl`,
    );
  }

  return account;
}

module.exports = {
  CHANNEL_ID,
  getAccounts,
  listAccountIds,
  resolveAccount,
  inspectAccount,
  requireConfiguredAccount,
};
