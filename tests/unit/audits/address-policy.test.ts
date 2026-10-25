import { describe, expect, it } from "vitest";
import { isPublicAddress } from "@/modules/audits/fetcher/address-policy";

describe("isPublicAddress", () => {
  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "151.101.1.69",
    "2606:4700:4700::1111",
    "2a00:1450:4003:80e::200e",
  ])("allows public address %s", (ip) => expect(isPublicAddress(ip)).toBe(true));

  it.each([
    ["0.0.0.0", "this network"],
    ["0.1.2.3", "this network"],
    ["10.0.0.1", "private"],
    ["10.255.255.255", "private"],
    ["100.64.0.1", "CGNAT"],
    ["127.0.0.1", "loopback"],
    ["127.255.255.254", "loopback"],
    ["169.254.169.254", "link-local / cloud metadata"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["192.0.0.1", "IETF protocol assignments"],
    ["192.0.2.1", "TEST-NET-1"],
    ["192.168.1.1", "private"],
    ["198.18.0.1", "benchmarking"],
    ["198.51.100.1", "TEST-NET-2"],
    ["203.0.113.1", "TEST-NET-3"],
    ["224.0.0.1", "multicast"],
    ["240.0.0.1", "reserved"],
    ["255.255.255.255", "broadcast"],
  ])("blocks IPv4 %s (%s)", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each([
    ["::", "unspecified"],
    ["::1", "loopback"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
    ["::ffff:7f00:1", "IPv4-mapped loopback (hex)"],
    ["::ffff:10.0.0.1", "IPv4-mapped private"],
    ["::ffff:169.254.169.254", "IPv4-mapped metadata"],
    ["64:ff9b::a00:1", "NAT64 to private"],
    ["64:ff9b::7f00:1", "NAT64 to loopback"],
    ["2002:7f00:1::1", "6to4 of loopback"],
    ["2002:a00:1::1", "6to4 of private"],
    ["2001::1", "Teredo"],
    ["2001:db8::1", "documentation"],
    ["fc00::1", "unique local"],
    ["fd12:3456::1", "unique local"],
    ["fe80::1", "link-local"],
    ["ff02::1", "multicast"],
    ["100::1", "discard-only"],
  ])("blocks IPv6 %s (%s)", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(["", "not-an-ip", "999.1.1.1", "localhost", "example.com"])("rejects non-IP input %j", (value) =>
    expect(isPublicAddress(value)).toBe(false),
  );
});
