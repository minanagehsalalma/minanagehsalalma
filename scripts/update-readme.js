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

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildCveRecordLine(cves) {
  const publicCount = cves.public.length;
  const assignedCount = cves.assigned.length;
  return `<p><strong>CVE record:</strong> ${pluralize(publicCount, "public CVE", "public CVEs")} and ${pluralize(assignedCount, "assigned CVE ID", "assigned CVE IDs")} currently tracked.</p>`;
}

function buildCveSection(cves) {
  const parts = [];

  parts.push("### Public CVEs", "");
  if (cves.public.length === 0) {
    parts.push("- No public CVEs listed yet.");
  } else {
    for (const item of cves.public) {
      parts.push(`- [\`${item.id}\`](${item.reference_url}): ${item.summary}`);
    }
  }

  parts.push("", "### Assigned CVE IDs", "");
  if (cves.assigned.length === 0) {
    parts.push("- No assigned CVE IDs pending publication.");
  } else {
    const sharedNote = cves.assigned.every((item) => item.status_note === cves.assigned[0]?.status_note)
      ? cves.assigned[0].status_note
      : null;

    if (sharedNote) {
      parts.push(`_${sharedNote}_`, "");
    }

    for (const item of cves.assigned) {
      const suffix = sharedNote || !item.status_note ? "" : ` (${item.status_note})`;
      parts.push(`- \`${item.id}\`: ${item.summary}${suffix}`);
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
    `  <img src="https://img.shields.io/badge/Public%20CVEs-${cves.public.length}-0F766E?style=for-the-badge" alt="Public CVEs" />`,
    `  <img src="https://img.shields.io/badge/Assigned%20CVE%20IDs-${cves.assigned.length}-7C3AED?style=for-the-badge" alt="Assigned CVE IDs" />`,
    '  <img src="https://img.shields.io/badge/Status-Active%20Research-166534?style=for-the-badge" alt="Active research" />',
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
