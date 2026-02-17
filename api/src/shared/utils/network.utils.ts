import type { Request } from 'express';

const IPV4_MAPPED_PREFIX = '::ffff:';

/**
 * Normalize an IP address by stripping the IPv4-mapped IPv6 prefix.
 *
 * Node.js returns IPv4 addresses in IPv4-mapped IPv6 format (e.g. `::ffff:192.168.1.1`)
 * when the server listens on IPv6. This strips the prefix to produce a clean IPv4 address
 * for storage and display.
 */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith(IPV4_MAPPED_PREFIX)) {
    return trimmed.slice(IPV4_MAPPED_PREFIX.length);
  }
  return trimmed;
}

/**
 * Extract the client IP address from an HTTP request.
 *
 * Priority:
 *   1. `x-forwarded-for` (first entry) — set by reverse proxies (Traefik, nginx).
 *   2. `x-real-ip` — alternative forwarding header.
 *   3. `req.ip` — Express-resolved IP (respects `trust proxy` setting).
 *   4. `req.socket.remoteAddress` — raw TCP socket address (ultimate fallback).
 *
 */
export function extractClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = normalizeIp(forwarded.split(',')[0] ?? '');
    if (first) return first;
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') {
    return normalizeIp(realIp) || null;
  }

  if (req.ip) {
    return normalizeIp(req.ip) || null;
  }

  const socketIp = req.socket?.remoteAddress;
  return socketIp ? normalizeIp(socketIp) || null : null;
}
