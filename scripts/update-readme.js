const fs = require("fs");
const path = require("path");

const username = process.env.GITHUB_PROFILE_USERNAME || "minanagehsalalma";
const repoRoot = process.cwd();
const readmePath = path.join(repoRoot, "README.md");
const cvesPath = path.join(repoRoot, "data", "cves.json");

const signalStart = "<!--SIGNAL_START-->";
const signalEnd = "<!--SIGNAL_END-->";
const badgesStart = "<!--METRICS_BADGES_START-->";
const badgesEnd = "<!--METRICS_BADGES_END-->";
const cveStart = "<!--CVE_SECTION_START-->";
const cveEnd = "<!--CVE_SECTION_END-->";

async function getJson(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": `${username}-profile-updater`,
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

async function getAllPublicRepos() {
  const repos = [];
  let page = 1;

  while (true) {
    const batch = await getJson(`https://api.github.com/users/${username}/repos?per_page=100&page=${page}&sort=updated`);
    repos.push(...batch);
    if (batch.length < 100) {
      break;
    }
    page += 1;
  }

  return repos.filter((repo) => !repo.private);
}

function replaceSection(source, startMarker, endMarker, nextContent) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Missing marker pair: ${startMarker} / ${endMarker}`);
  }

  const before = source.slice(0, start + startMarker.length);
  const after = source.slice(end);
  return `${before}\n${nextContent}\n${after}`;
}

function loadCveData() {
  const raw = fs.readFileSync(cvesPath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    public: Array.isArray(parsed.public) ? parsed.public : [],
    assigned: Array.isArray(parsed.assigned) ? parsed.assigned : [],
  };
}

function getVendorMeta(vendor) {
  const normalized = String(vendor || "").trim().toLowerCase();
  if (normalized === "zyxel") {
    return { label: "Zyxel", color: "0F766E" };
  }
  if (normalized === "zte") {
    return { label: "ZTE", color: "15803D" };
  }
  return null;
}

function getTypeMeta(type) {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "credential disclosure") {
    return { label: "Credential Disclosure", color: "2563EB" };
  }
  if (normalized === "auth bypass") {
    return { label: "Auth Bypass", color: "F97316" };
  }
  if (normalized === "dos") {
    return { label: "DoS", color: "DC2626" };
  }
  return null;
}

function getStatusMeta(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "public") {
    return {
      alt: "Public",
      url: "https://img.shields.io/static/v1?label=status&amp;message=Public&amp;color=2ea043&amp;style=flat-square",
    };
  }
  return null;
}

function buildBadge(meta) {
  if (!meta) {
    return "";
  }
  if (meta.url) {
    return `<img src="${meta.url}" alt="${meta.alt}" height="20" align="absmiddle" />&nbsp;`;
  }
  const label = encodeURIComponent(meta.label);
  const message = meta.message ? `-${encodeURIComponent(meta.message)}` : "";
  const alt = meta.alt || meta.label;
  return `<img src="https://img.shields.io/badge/${label}${message}-${meta.color}?style=flat-square" alt="${alt}" height="20" align="absmiddle" />&nbsp;`;
}

function buildVendorBadge(vendor) {
  return buildBadge(getVendorMeta(vendor));
}

function buildScopeBadge(scopeBadge) {
  const label = String(scopeBadge || "").trim();
  if (!label) {
    return "";
  }
  return buildBadge({ label, color: "1F2937" });
}

function buildTypeBadge(typeBadge) {
  return buildBadge(getTypeMeta(typeBadge));
}

function buildStatusBadge(statusBadge) {
  return buildBadge(getStatusMeta(statusBadge));
}

function buildCveBlock(item, lead, suffix = "") {
  const badgeLine = [
    buildVendorBadge(item.vendor),
    buildScopeBadge(item.scope_badge),
    buildTypeBadge(item.type_badge),
    buildStatusBadge(item.status_badge),
  ].join("").trim();

  const product = item.product ? ` — ${item.product}` : "";
  const impact = item.impact || item.summary || "";

  return [
    "<p>",
    `  <strong>${lead}</strong>${product}<br/>`,
    `  ${impact}${suffix}<br/>`,
    `  ${badgeLine}`,
    "</p>",
  ].join("\n");
}

function getSharedAssignedReference(cves) {
  if (cves.assigned.length === 0) {
    return null;
  }

  const firstReference = cves.assigned[0]?.reference_url;
  if (!firstReference) {
    return null;
  }

  return cves.assigned.every((item) => item.reference_url === firstReference) ? firstReference : null;
}

function buildCveRecordLine(cves) {
  const sharedAssignedReference = getSharedAssignedReference(cves);
  if (sharedAssignedReference) {
    return `<p><strong>Status note:</strong> All assigned 2026 CVE IDs are currently covered in a single public <a href="${sharedAssignedReference}">reference gist</a> and can move into the public CVE section once broader publication catches up.</p>`;
  }
  const assignedWithReferences = cves.assigned.filter((item) => item.reference_url).length;
  if (cves.assigned.length > 0 && assignedWithReferences === cves.assigned.length) {
    return "<p><strong>Status note:</strong> The assigned CVE IDs now have public reference URLs and will move into the public CVE section once broader publication catches up.</p>";
  }
  if (cves.assigned.length > 0) {
    return "<p><strong>Status note:</strong> The assigned CVE IDs are tracked here and will move into the public CVE section once public reference URLs are available.</p>";
  }
  return `<p><strong>Status note:</strong> ${cves.public.length} public CVE records are listed below, each backed by a direct public reference.</p>`;
}

function buildCveSection(cves) {
  const parts = [];
  const sharedAssignedReference = getSharedAssignedReference(cves);

  parts.push("### Public CVEs", "");
  if (cves.public.length === 0) {
    parts.push("- No public CVEs listed yet.");
  } else {
    const publicCves = [...cves.public].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
    for (const item of publicCves) {
      parts.push(buildCveBlock(item, `<a href="${item.reference_url}"><code>${item.id}</code></a>`));
    }
  }

  if (cves.assigned.length > 0) {
    parts.push("", "### Assigned CVE IDs", "");
    const sharedNote = cves.assigned.every((item) => item.status_note === cves.assigned[0]?.status_note)
      ? cves.assigned[0].status_note
      : null;

    if (sharedNote) {
      parts.push(`_${sharedNote}_`, "");
    }

    if (sharedAssignedReference) {
      parts.push(`_All three currently share a single [reference gist](${sharedAssignedReference})._`, "");
    }

    const assignedCves = [...cves.assigned].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
    for (const item of assignedCves) {
      const suffix = sharedNote || !item.status_note ? "" : ` (${item.status_note})`;
      const lead = sharedAssignedReference
        ? `<code>${item.id}</code>`
        : (item.reference_url ? `<a href="${item.reference_url}"><code>${item.id}</code></a>` : `<code>${item.id}</code>`);
      parts.push(buildCveBlock(item, lead, suffix));
    }
  }

  return parts.join("\n");
}

async function main() {
  const profile = await getJson(`https://api.github.com/users/${username}`);
  const repos = await getAllPublicRepos();
  const cves = loadCveData();
  const totalStars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
  const now = new Date();
  const refreshedAt = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")} ${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")} UTC`;

  const signalSection = [
    "## Operational Snapshot",
    "",
    `> Auto-refreshed daily via GitHub Actions. Last refresh: ${refreshedAt}`,
    "",
    "<table>",
    "  <tr>",
    "    <td width=\"33%\">",
    "      <strong>Current role</strong><br/>",
    "      Red Team Researcher at Synack",
    "    </td>",
    "    <td width=\"33%\">",
    "      <strong>Independent research</strong><br/>",
    "      Since December 2020",
    "    </td>",
    "    <td width=\"33%\">",
    "      <strong>Current study</strong><br/>",
    "      MSc at University of Tuscia (UNITUS), Italy",
    "    </td>",
    "  </tr>",
    "</table>",
    "",
    "<p>",
    '  <a href="#public-cves">',
    `    <img src="https://img.shields.io/badge/Public%20CVEs-${cves.public.length}-0F766E?style=for-the-badge" alt="Public CVEs" />`,
    "  </a>",
    ...(cves.assigned.length > 0
      ? [
          '  <a href="#assigned-cve-ids">',
          `    <img src="https://img.shields.io/badge/Assigned%20CVE%20IDs-${cves.assigned.length}-7C3AED?style=for-the-badge" alt="Assigned CVE IDs" />`,
          "  </a>",
        ]
      : []),
    '  <a href="#selected-security-work">',
    '    <img src="https://img.shields.io/badge/Status-Active%20Research-166534?style=for-the-badge" alt="Active research" />',
    "  </a>",
    "</p>",
    "",
    buildCveRecordLine(cves),
  ].join("\n");

  const badgesSection = [
    `  <a href="https://github.com/${username}?tab=repositories">`,
    `    <img src="https://img.shields.io/badge/Public%20Repos-${profile.public_repos}-0F172A?style=for-the-badge&logo=github&logoColor=white" alt="Public repositories" />`,
    "  </a>",
    `  <a href="https://github.com/${username}?tab=repositories">`,
    `    <img src="https://img.shields.io/badge/Public%20Stars-${totalStars}-111111?style=for-the-badge&logo=github&logoColor=white" alt="Public stars" />`,
    "  </a>",
  ].join("\n");

  let readme = fs.readFileSync(readmePath, "utf8");
  readme = replaceSection(readme, signalStart, signalEnd, signalSection);
  readme = replaceSection(readme, badgesStart, badgesEnd, badgesSection);
  readme = replaceSection(readme, cveStart, cveEnd, buildCveSection(cves));
  fs.writeFileSync(readmePath, readme);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
