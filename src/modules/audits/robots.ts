/**
 * Minimal robots.txt parser following Google's documented matching rules (RFC 9309):
 * groups by user-agent, most specific agent group wins, longest matching rule wins and
 * `allow` wins ties; `*` and `$` wildcards are supported.
 */

export interface RobotsRule {
  allow: boolean;
  path: string;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

export interface Robots {
  groups: RobotsGroup[];
  sitemaps: string[];
}

const MAX_LINES = 20_000;

export function parseRobots(text: string): Robots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r\n|\r|\n/).slice(0, MAX_LINES)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (field === "sitemap") {
      if (value) sitemaps.push(value);
    } else if ((field === "allow" || field === "disallow") && current) {
      // An empty Disallow means "allow everything" and adds no rule.
      if (value) current.rules.push({ allow: field === "allow", path: value });
    }
  }
  return { groups, sitemaps };
}

function groupFor(robots: Robots, userAgentToken: string): RobotsGroup | null {
  const token = userAgentToken.toLowerCase();
  let best: { group: RobotsGroup; length: number } | null = null;
  for (const group of robots.groups) {
    for (const agent of group.agents) {
      if (agent !== "*" && token.includes(agent) && (!best || agent.length > best.length)) {
        best = { group, length: agent.length };
      }
    }
  }
  if (best) return best.group;
  return robots.groups.find((group) => group.agents.includes("*")) ?? null;
}

/**
 * Rules and paths come from the website, so no regex here: each piece between wildcards is looked
 * for once, after the previous one, and a hostile rule has nothing to backtrack over.
 */
function ruleMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const pieces = (anchored ? pattern.slice(0, -1) : pattern).split("*");
  const last = pieces.length - 1;
  if (!path.startsWith(pieces[0]!)) return false;
  if (last === 0) return !anchored || path.length === pieces[0]!.length;
  let at = pieces[0]!.length;
  for (const piece of pieces.slice(1, last)) {
    const found = path.indexOf(piece, at);
    if (found < 0) return false;
    at = found + piece.length;
  }
  const tail = pieces[last]!;
  return anchored ? path.length - tail.length >= at && path.endsWith(tail) : path.includes(tail, at);
}

/** Whether `path` (pathname + search) may be crawled by `userAgentToken`. */
export function isAllowedByRobots(robots: Robots, userAgentToken: string, path: string): boolean {
  const group = groupFor(robots, userAgentToken);
  if (!group) return true;
  let best: RobotsRule | null = null;
  for (const rule of group.rules) {
    if (!ruleMatches(rule.path, path)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}
