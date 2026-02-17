# Development-only configuration.
# TLS is disabled because Vault communicates over an internal Docker network
# that is not exposed to the host or internet (internal: true in compose.yaml).
#
# PRODUCTION: Deploy Vault with TLS enabled. See docker/vault-config.prod.hcl.

storage "file" {
  path = "/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}

disable_mlock = true

api_addr = "http://0.0.0.0:8200"
