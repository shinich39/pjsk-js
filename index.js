'use strict';

import Music from "./src/music.js";
import playResult from "./src/play-result.js";

// esm
export default {
  update: Music.update,
  getMusics: Music.getMusics,
  getDiffs: Music.getDiffs,
  findMusic: Music.findMusic,
  findDiff: Music.findDiff,
  recognize: playResult.recognize,
}