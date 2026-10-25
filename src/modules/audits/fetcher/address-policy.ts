import { BlockList, isIP } from "node:net";

/**
 * Which resolved IP addresses the audit fetcher may connect to (B08a).
 *
 * Deny-list of every special-purpose range (IANA IPv4/IPv6 special-purpose registries).
 * IPv4-mapped IPv6 addresses ("::ffff:a.b.c.d") are matched against the IPv4 rules by
 * BlockList itself. Formats that embed an IPv4 inside IPv6 in other ways (NAT64, 6to4,
 * Teredo) are blocked as whole ranges instead of being decoded: a public business website
 * practically never resolves to them, and not decoding leaves nothing to get wrong.
 */
const blocked = new BlockList();

const IPV4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast (deprecated)
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

const IPV6_BLOCKED: [string, number][] = [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["::", 96], // deprecated IPv4-compatible
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard-only
  ["2001::", 32], // Teredo
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // deprecated site-local
  ["ff00::", 8], // multicast
];

for (const [network, prefix] of IPV4_BLOCKED) blocked.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of IPV6_BLOCKED) blocked.addSubnet(network, prefix, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}
