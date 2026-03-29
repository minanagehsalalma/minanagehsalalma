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

  const signalSection = [
    "## Signal",
    "",
    "_Metrics refresh automatically via GitHub Actions._",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    "| Current role | Red Team Researcher at Synack |",
    "| Independent research | Since December 2020 |",
    `| Public repositories | ${profile.public_repos} |`,
    `| Public stars across repos | ${totalStars} |`,
    `| Followers | ${profile.followers} |`,
    "| CVE record history | 2 public CVEs and 3 assigned 2026 CVE IDs pending public references |",
    "| Current study | MSc at University of Tuscia (UNITUS), Italy |",
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
