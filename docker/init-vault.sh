#!/bin/sh
set -e

if [ "$NODE_ENV" = "production" ]; then
  echo "ERROR: init-vault.sh must not run in production." >&2
  exit 1
fi

VAULT_ADDR="${VAULT_ADDR:-http://dhis2-cert-vault:8200}"
export VAULT_ADDR

echo "Waiting for Vault to be ready..."
until vault status -format=json 2>/dev/null | grep -q '"initialized"'; do
  sleep 1
done

echo "=== Enabling secrets engines ==="
vault secrets enable -path=secret kv-v2 2>/dev/null || true
vault secrets enable transit 2>/dev/null || true

echo "=== Creating Transit keys ==="
# Ed25519 for Verifiable Credential signing
vault write -f transit/keys/vc-signing type=ed25519 exportable=false allow_plaintext_backup=false

# AES256-GCM96 for OTP encryption
vault write -f transit/keys/otp-encryption type=aes256-gcm96

# AES256-GCM96 for audit log HMAC
vault write -f transit/keys/audit-hmac type=aes256-gcm96

echo "=== Enabling audit logging ==="
vault audit enable file file_path=/vault/logs/audit.log 2>/dev/null || true

echo "=== Seeding KV secrets (dev only) ==="
vault kv put secret/dhis2-cert \
  JWT_SECRET="dev-vault-jwt-secret-at-least-32-characters-long" \
  REDIS_PASSWORD="devpassword" \
  OTP_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  AUDIT_LOG_HMAC_KEY="$(openssl rand -base64 32)"

echo "=== Creating policy ==="
vault policy write dhis2-cert - <<'POLICY'
# Transit operations (sign, encrypt, decrypt, hmac)
path "transit/sign/vc-signing" {
  capabilities = ["update"]
}
path "transit/verify/vc-signing" {
  capabilities = ["update"]
}
path "transit/keys/vc-signing" {
  capabilities = ["read"]
}
path "transit/encrypt/otp-encryption" {
  capabilities = ["update"]
}
path "transit/decrypt/otp-encryption" {
  capabilities = ["update"]
}
path "transit/hmac/audit-hmac" {
  capabilities = ["update"]
}

# KV v2 read-only
path "secret/data/dhis2-cert" {
  capabilities = ["read"]
}

# Token self-management
path "auth/token/renew-self" {
  capabilities = ["update"]
}
path "auth/token/lookup-self" {
  capabilities = ["read"]
}

# Token revocation (for clean shutdown)
path "auth/token/revoke-self" {
  capabilities = ["update"]
}
POLICY

echo "=== Enabling AppRole auth ==="
vault auth enable approle 2>/dev/null || true

vault write auth/approle/role/dhis2-cert \
  token_policies="dhis2-cert" \
  secret_id_ttl=24h \
  token_ttl=1h \
  token_max_ttl=4h

ROLE_ID=$(vault read -field=role_id auth/approle/role/dhis2-cert/role-id)
SECRET_ID=$(vault write -f -field=secret_id auth/approle/role/dhis2-cert/secret-id)

CREDS_FILE="/vault/data/dev-credentials"
install -m 600 /dev/null "$CREDS_FILE"
cat > "$CREDS_FILE" <<EOF
VAULT_ROLE_ID=${ROLE_ID}
VAULT_SECRET_ID=${SECRET_ID}
EOF

echo ""
echo "============================================"
echo "  Vault initialized for development"
echo "============================================"
echo "  Credentials written to ${CREDS_FILE}"
echo "============================================"
