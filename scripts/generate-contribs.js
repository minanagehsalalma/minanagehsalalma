const fs = require("fs");
const path = require("path");

const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";

const PALETTES = {
  dark: {
    empty: "#161b22",
    levels: ["#0e4429", "#006d32", "#26a641", "#39d353"],
  },
  light: {
    empty: "#ebedf0",
    levels: ["#9be9a8", "#40c463", "#30a14e", "#216e39"],
  },
};

const TEXT_COLORS = {
  dark: {
    primary: "#e6edf3",
    secondary: "#7d8590",
    accent: "#39d353",
  },
  light: {
    primary: "#1f2328",
    secondary: "#59636e",
    accent: "#216e39",
  },
};

const LEVEL_MAP = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

const CELL = 12;
const GAP = 2;
const ANGLE_DEG = 20;
const SHADE_LEFT = 0.88;
const SHADE_RIGHT = 0.74;
const BASE_COMMIT_HEIGHT = 8;
const MAX_COMMIT_HEIGHT = 18;
const FONT_STACK = "-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif";

const LAST_YEAR_QUERY = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            contributionCount
            contributionLevel
          }
        }
      }
    }
  }
}
`;

function resolveConfig() {
  const username =
    process.env.GITHUB_PROFILE_USERNAME ||
    process.env.GITHUB_REPOSITORY_OWNER ||
    process.env.GITHUB_ACTOR ||
    "minanagehsalalma";
  const token = process.env.GH_README_TOKEN || process.env.GITHUB_TOKEN;
  const outDir = process.env.CONTRIBS_OUTPUT_DIR || path.join(process.cwd(), "assets", "contribs");

  if (!token) {
    throw new Error("Missing GitHub token. Set GITHUB_TOKEN or GH_README_TOKEN.");
  }

  return { username, token, outDir };
}

async function githubGraphql(token, query, variables) {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "minanagehsalalma-profile-contribs",
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed: ${response.status} ${response.statusText} ${payload}`);
  }

  const data = JSON.parse(payload);
  if (data.errors) {
    throw new Error(`GitHub GraphQL returned errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data;
}

async function fetchContributionCalendar(token, username) {
  const data = await githubGraphql(token, LAST_YEAR_QUERY, { login: username });
  if (!data.user) {
    throw new Error(`GitHub user was not found: ${username}`);
  }

  return data.user.contributionsCollection.contributionCalendar;
}

function buildCells(calendar) {
  const dayTotals = [0, 0, 0, 0, 0, 0, 0];
  const cells = [];

  calendar.weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach((day, dayIndex) => {
      const count = day.contributionCount;
      const level = LEVEL_MAP[day.contributionLevel] ?? 0;
      dayTotals[dayIndex] += count;
      cells.push({ week: weekIndex, day: dayIndex, count, level });
    });
  });

  return {
    cells,
    stats: {
      totalContributions: calendar.totalContributions,
      dayTotals,
    },
    weeks: calendar.weeks.length,
  };
}

function shade(hexColor, factor) {
  const value = hexColor.replace("#", "");
  const red = Math.max(0, Math.min(255, Math.floor(parseInt(value.slice(0, 2), 16) * factor)));
  const green = Math.max(0, Math.min(255, Math.floor(parseInt(value.slice(2, 4), 16) * factor)));
  const blue = Math.max(0, Math.min(255, Math.floor(parseInt(value.slice(4, 6), 16) * factor)));
  return `#${red.toString(16).padStart(2, "0")}${green.toString(16).padStart(2, "0")}${blue
    .toString(16)
    .padStart(2, "0")}`;
}

function project(x, y, z) {
  const angle = (ANGLE_DEG * Math.PI) / 180;
  return [(x - y) * Math.cos(angle), (x + y) * Math.sin(angle) - z];
}

function pointsToString(points) {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function heightFromCount(count) {
  if (count <= 0) {
    return 0;
  }
  if (count === 1) {
    return BASE_COMMIT_HEIGHT;
  }

  return Math.min(MAX_COMMIT_HEIGHT, Math.round(BASE_COMMIT_HEIGHT + Math.log2(count) * 3));
}

function cubeFacesSvg(gridX, gridY, height, topColor) {
  const step = CELL + GAP;
  const x = gridX * step;
  const y = gridY * step;
  const size = CELL;

  const top = [
    project(x, y, height),
    project(x + size, y, height),
    project(x + size, y + size, height),
    project(x, y + size, height),
  ];

  const polygons = [`<polygon points="${pointsToString(top)}" fill="${topColor}"/>`];

  if (height > 0) {
    const left = [
      project(x, y + size, 0),
      project(x, y + size, height),
      project(x + size, y + size, height),
      project(x + size, y + size, 0),
    ];
    const right = [
      project(x + size, y + size, 0),
      project(x + size, y + size, height),
      project(x + size, y, height),
      project(x + size, y, 0),
    ];

    polygons.push(`<polygon points="${pointsToString(left)}" fill="${shade(topColor, SHADE_LEFT)}"/>`);
    polygons.push(`<polygon points="${pointsToString(right)}" fill="${shade(topColor, SHADE_RIGHT)}"/>`);
  }

  return polygons.join("\n");
}

function renderTopRightStats(x, y, paletteName, stats) {
  const text = TEXT_COLORS[paletteName];
  const numberSize = 34;
  const numberY = y + numberSize - 2;
  const labelY = numberY + 12;

  return [
    `<text x="${x.toFixed(2)}" y="${numberY.toFixed(2)}" text-anchor="end" font-family="${FONT_STACK}" font-size="${numberSize}" font-weight="700" fill="${text.accent}">${stats.totalContributions.toLocaleString("en-US")}</text>`,
    `<text x="${x.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="end" font-family="${FONT_STACK}" font-size="10" fill="${text.secondary}" letter-spacing="0.8">TOTAL CONTRIBUTIONS</text>`,
  ].join("\n");
}

function renderBottomLeftStats(x, y, paletteName, stats) {
  const palette = PALETTES[paletteName];
  const text = TEXT_COLORS[paletteName];
  const chartHeight = 54;
  const barWidth = 12;
  const barGap = 4;
  const labelY = y;
  const chartY = y - 18;
  const titleY = labelY + 20;
  const taglineY = titleY + 16;
  const maxValue = Math.max(...stats.dayTotals, 1);
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];
  const parts = [];

  stats.dayTotals.forEach((value, index) => {
    const barX = x + index * (barWidth + barGap);
    const height = (value / maxValue) * chartHeight;
    const barTop = chartY - height;
    const color = value === maxValue ? palette.levels[3] : palette.levels[1];

    parts.push(`<rect x="${barX.toFixed(2)}" y="${barTop.toFixed(2)}" width="${barWidth}" height="${height.toFixed(2)}" rx="1" fill="${color}"/>`);
    parts.push(`<text x="${(barX + barWidth / 2).toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="middle" font-family="${FONT_STACK}" font-size="11" fill="${text.secondary}">${dayLabels[index]}</text>`);
  });

  parts.push(`<text x="${x.toFixed(2)}" y="${titleY.toFixed(2)}" font-family="${FONT_STACK}" font-size="12" fill="${text.secondary}" letter-spacing="0.3">Most active days</text>`);
  parts.push(`<text x="${x.toFixed(2)}" y="${taglineY.toFixed(2)}" font-family="${FONT_STACK}" font-size="9" fill="${text.secondary}">Data pulled daily from GitHub.</text>`);
  parts.push(`<text x="${x.toFixed(2)}" y="${(taglineY + 10).toFixed(2)}" font-family="${FONT_STACK}" font-size="9" fill="${text.secondary}">Rolling last-12-month activity.</text>`);

  return parts.join("\n");
}

function renderSvg(cells, paletteName, stats, weeks) {
  const palette = PALETTES[paletteName];
  const maxHeight = Math.max(...cells.map((cell) => heightFromCount(cell.count)), 0);
  const step = CELL + GAP;
  const corners = [
    project(0, 0, 0),
    project(weeks * step, 0, 0),
    project(0, 7 * step, 0),
    project(weeks * step, 7 * step, 0),
    project(0, 0, maxHeight),
    project(weeks * step, 0, maxHeight),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const graphMinX = Math.min(...xs);
  const graphMaxX = Math.max(...xs);
  const graphMinY = Math.min(...ys);
  const graphMaxY = Math.max(...ys);
  const pad = 3;
  const extraBottom = 40;
  const minX = graphMinX - pad - 3;
  const minY = graphMinY - pad - 3;
  const width = graphMaxX - graphMinX + pad * 2 + 6;
  const height = graphMaxY - graphMinY + pad * 2 + 3 + extraBottom;
  const sortedCells = [...cells].sort((a, b) => a.week + a.day - (b.week + b.day) || a.week - b.week || a.day - b.day);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}" width="${Math.round(width)}" height="${Math.round(height)}" role="img" aria-label="Isometric GitHub contribution activity">`,
  ];

  sortedCells.forEach((cell) => {
    const color = cell.level === 0 ? palette.empty : palette.levels[cell.level - 1];
    parts.push(cubeFacesSvg(cell.week, cell.day, heightFromCount(cell.count), color));
  });

  parts.push(renderTopRightStats(graphMaxX, graphMinY, paletteName, stats));
  parts.push(renderBottomLeftStats(graphMinX, graphMaxY - 30, paletteName, stats));
  parts.push("</svg>");

  return parts.join("\n");
}

async function main() {
  const { username, token, outDir } = resolveConfig();
  const calendar = await fetchContributionCalendar(token, username);
  const { cells, stats, weeks } = buildCells(calendar);

  fs.mkdirSync(outDir, { recursive: true });

  for (const paletteName of ["dark", "light"]) {
    const svg = renderSvg(cells, paletteName, stats, weeks);
    const outputPath = path.join(outDir, `contribs-${paletteName}.svg`);
    fs.writeFileSync(outputPath, `${svg}\n`, "utf8");
    console.log(`wrote ${path.relative(process.cwd(), outputPath)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
