import path from 'path';
import fs from 'fs';
import octonode from 'octonode';
import { fileURLToPath } from 'url';
import util from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://github.com/Sekai-World/sekai-master-db-diff
const USER_NAME = "Sekai-World";
const REPO_NAME = "sekai-master-db-diff";
const REPO_MUSIC_PATH = "musics.json";
const REPO_DIFF_PATH = "musicDifficulties.json";
const MUSIC_PATH = path.join(__dirname, "..", "musics.json");
const DIFF_PATH = path.join(__dirname, "..", "musicDifficulties.json");
const CONFIG_PATH = path.join(__dirname, "..", "config.json");

let musics, musicDiffs;
if (fs.existsSync(MUSIC_PATH)) {
  musics = JSON.parse(fs.readFileSync(MUSIC_PATH, { encoding: "utf8" }));
}
if (fs.existsSync(DIFF_PATH)) {
  musicDiffs = JSON.parse(fs.readFileSync(DIFF_PATH, { encoding: "utf8" }));
}

// init
if (!musics || !musicDiffs) {
  try {
    updateMusics();
  } catch(err) {
    console.error(err);
  }
}

function getConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    const config = {};
    updateConfig(config);
    return config;
  } else {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, { encoding: "utf8" }));
  }
}

function updateConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { encoding: "utf8" });
}

function getCommitSha(repo) {
  if (!repo) {
    throw new Error("Can't not access to github.");
  }
  return new Promise(function(resolve, reject) {
    repo.commits(function(err, commits) {
      if (err) {
        reject(err);
        return;
      }

      const commit = commits[0]; // latest commit
      const sha = commit.sha;
      resolve(sha);
    });
  });
}

function downloadFile(repo, src, dst) {
  if (!repo) {
    throw new Error("Can't not access to github.");
  }
  return new Promise(function(resolve, reject) {
    repo.contents(src, function(err, res) {
      if (err) {
        reject(err);
        return;
      }

      fs.writeFileSync(dst, res.content, { encoding: "base64" });

      resolve();
    });
  });
}

async function updateMusics() {
  console.log("Check updates.");
  const config = getConfig();
  const client = octonode.client();
  const repo = client.repo(USER_NAME + "/" + REPO_NAME);
  const sha = await getCommitSha(repo);
  if (!fs.existsSync(MUSIC_PATH) || !fs.existsSync(DIFF_PATH) || sha !== config.COMMIT_SHA) {
    console.log("Updates found.");
    await downloadFile(repo, REPO_MUSIC_PATH, MUSIC_PATH);
    console.log("musics.json updated.");
    await downloadFile(repo, REPO_DIFF_PATH, DIFF_PATH);
    console.log("musicDifficulties.json updated.");
    config.COMMIT_SHA = sha;
    updateConfig(config);
    musics = JSON.parse(fs.readFileSync(MUSIC_PATH, { encoding: "utf-8" }));
    musicDiffs = JSON.parse(fs.readFileSync(DIFF_PATH, { encoding: "utf-8" }));
  } else { 
    console.log("No updates are available.");
  }
}

export default {
  update: updateMusics,
  getMusics: function() {
    if (!fs.existsSync(MUSIC_PATH)) {
      throw new Error("musics.json not found.");
    }
    return musics;
  },
  getDiffs: function() {
    if (!fs.existsSync(DIFF_PATH)) {
      throw new Error("musicDifficulties.json not found.");
    }
    return musicDiffs;
  },
  findMusic: function(input) {
    // normalize
    const a = util.toHalfWidth(input.replace(/[\r\n\s]/gi, ""));

    let acc = 0;
    let music = null;
    for (const m of musics) {
      // normalize
      const b = util.toHalfWidth(m.title.replace(/[\r\n\s]/gi, ""));
      const res = util.diff(a, b);

      if (acc < res.acc) {
        acc = res.acc;
        music = m;
      }
    }

    return {
      acc: acc,
      music: JSON.parse(JSON.stringify(music)),
    }
  },
  findDiff: function(musicId, difficulty) {
    if (!musicId) {
      throw new Error("Music ID not found.");
    }
    difficulty = difficulty.toLowerCase();
    const diff = musicDiffs.find(function(item) {
      return item.musicId === musicId && item.musicDifficulty === difficulty;
    });
    if (!diff) {
      throw new Error("Music difficulty not found.");
    }
    return diff;
  },
}