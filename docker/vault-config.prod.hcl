storage "file" {
  path = "/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_cert_file = "/vault/tls/tls.crt"
  tls_key_file  = "/vault/tls/tls.key"
  tls_min_version = "tls13"
}

# Enable audit logging to file (NIST SP 800-92)
audit "file" {
  file_path = "/vault/logs/audit.log"
}

disable_mlock = false

api_addr = "https://127.0.0.1:8200"

# Max request size (10 MiB)
max_request_size = 10485760

# Max lease TTL (768h = 32 days)
max_lease_ttl = "768h"

default_lease_ttl = "1h"
