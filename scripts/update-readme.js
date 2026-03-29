const fs = require("fs");
const path = require("path");

const username = process.env.USERNAME || "minanagehsalalma";
const repoRoot = process.cwd();
const readmePath = path.join(repoRoot, "README.md");

const signalStart = "<!--SIGNAL_START-->";
const signalEnd = "<!--SIGNAL_END-->";
const badgesStart = "<!--METRICS_BADGES_START-->";
const badgesEnd = "<!--METRICS_BADGES_END-->";

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

async function main() {
  const profile = await getJson(`https://api.github.com/users/${username}`);
  const repos = await getAllPublicRepos();
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
    '  <img src="https://img.shields.io/badge/Public%20CVEs-2-0F766E?style=for-the-badge" alt="Public CVEs" />',
    '  <img src="https://img.shields.io/badge/Assigned%202026%20IDs-3-7C3AED?style=for-the-badge" alt="Assigned 2026 CVE IDs" />',
    '  <img src="https://img.shields.io/badge/Status-Active%20Research-166534?style=for-the-badge" alt="Active research" />',
    "</p>",
    "",
    "<p><strong>CVE record:</strong> 2 public CVEs and 3 assigned 2026 CVE IDs currently awaiting public reference URLs.</p>",
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
  fs.writeFileSync(readmePath, readme);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
