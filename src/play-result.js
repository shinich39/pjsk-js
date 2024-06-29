import path from 'path';
import fs from 'fs';
import util from './util.js';
import Jimp from 'jimp';
import Music from './music.js';
import { createWorker, PSM } from 'tesseract.js';

const DEBUG = false;
const DIFFICULTY_LIST = ["EASY","NORMAL","HARD","EXPERT","MASTER","APPEND"];
const DIFFICULTY_CHARS = getUniqueChars(DIFFICULTY_LIST);

function getUniqueChars(arr) {
  let result = [];
  for (const str of arr) {
    for (const ch of str) {
      if (result.indexOf(ch) === -1) {
        result.push(ch);
      }
    }
  }

  result.sort(function(a, b) {
    return a.localeCompare(b);
  });

  return result;
}

function findDiff(input) {
  input = util.toHalfWidth(input).toUpperCase();
  return DIFFICULTY_LIST.map(function(diff) {
    const { acc } = util.diff(input, util.toHalfWidth(diff));
    return {
      diff: diff,
      acc: acc,
    }
  })
  .sort(function(a, b) {
    return a.acc - b.acc;
  })
  .pop().diff;
}

function matchColor(a, b, threshold) {
  const aa = Jimp.intToRGBA(a);
  const bb = Jimp.intToRGBA(b);
  return Math.abs((aa.r+aa.g+aa.b)-(bb.r+bb.g+bb.b)) < (255 * 3) * (threshold || 0.1);
}

function matchColors(a, b, threshold) {
  for (let i = 0; i < a.length; i++) {
    for (let j = i+1; j < a.length; j++) {
      if (!matchColor(a[i], a[j], threshold)) {
        // console.log(1);
        return false;
      }
    }
  }
  for (let i = 0; i < b.length; i++) {
    for (let j = i+1; j < b.length; j++) {
      if (!matchColor(b[i], b[j], threshold)) {
        // console.log(2);
        return false;
      }
    }
  }
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (matchColor(a[i], b[j], threshold)) {
        // console.log(3);
        return false;
      }
    }
  }
  return true;
}

async function recognizeText(buffer, chars = [], langs = ["jpn"], mode, dpi = "300") {
  const worker = await createWorker(langs.join("+"));
  await worker.setParameters({
    tessedit_pageseg_mode: !mode ? PSM.SINGLE_LINE : mode,
    tessedit_char_whitelist: chars.length > 0 ? chars.join("") : undefined,
    preserve_interword_spaces: "1",
    user_defined_dpi: dpi,
  });
  const res = await worker.recognize(buffer);
  await worker.terminate();
  return res.data.text;
}


function detectHeader(imageA, imageB) {
  const imageWidth = imageA.bitmap.width;
  const imageHeight = imageA.bitmap.height;
  let headerLeft = 0;
  let headerRight = imageWidth;
  let headerTop = 0;
  let headerBottom = imageHeight;
  let coverRight = 0;
  let diffLeft = 0;
  let diffRight = 0;
  let diffTop = 0;
  let diffBottom = 0;

  const fixedY = 5;
  const fixedX = Math.floor(imageWidth * 0.5);

  let isHeaderLeftDetected = false,
      isHeaderRightDetected = false,
      isHeaderBottomDetected = false,
      isCoverRightDetected = false,
      isDiffLeftDetected = false,
      isDiffRightDetected = false,
      isDiffTopDetected = false,
      isDiffBottomDetected = false;

  // detect left
  for (let i = 2; i < imageWidth - 2; i++) {
    const arr = [
      imageB.getPixelColor(i-2, fixedY),
      imageB.getPixelColor(i-1, fixedY),
      imageB.getPixelColor(i, fixedY),
      imageB.getPixelColor(i+1, fixedY),
      imageB.getPixelColor(i+2, fixedY),
    ];

    const a = arr.slice(0, 2);
    const b = arr.slice(2);
    const isMatched = matchColors(a, b);
    if (isMatched) {
      headerLeft = i;
      isHeaderLeftDetected = true;
      break;
    }
  }

  if (!isHeaderLeftDetected) {
    throw new Error("Header left not found");
  }

  // detect right
  for (let i = imageWidth - 3; i >= 2; i--) {
    const arr = [
      imageB.getPixelColor(i-2, fixedY),
      imageB.getPixelColor(i-1, fixedY),
      imageB.getPixelColor(i, fixedY),
      imageB.getPixelColor(i+1, fixedY),
      imageB.getPixelColor(i+2, fixedY),
    ];

    const a = arr.slice(0, 3);
    const b = arr.slice(3);
    const isMatched = matchColors(a, b);
    if (isMatched) {
      headerRight = i;
      isHeaderRightDetected = true;
      break;
    }
  }

  if (!isHeaderRightDetected) {
    throw new Error("Header right not found");
  }

  // detect left
  for (let i = 2; i < imageHeight - 3; i++) {
    const arr = [
      imageB.getPixelColor(fixedX, i-2),
      imageB.getPixelColor(fixedX, i-1),
      imageB.getPixelColor(fixedX, i),
      imageB.getPixelColor(fixedX, i+1),
      imageB.getPixelColor(fixedX, i+2),
      imageB.getPixelColor(fixedX, i+3),
    ];

    const a = arr.slice(0, 3);
    const b = arr.slice(3);
    const isMatched = matchColors(a, b);
    if (isMatched) {
      headerBottom = i;
      isHeaderBottomDetected = true;
      break;
    }
  }

  if (!isHeaderBottomDetected) {
    throw new Error("Header bottom not found");
  }

  // detect cover right
  for (let i = headerLeft + Math.floor(headerBottom * 0.8); i < fixedX; i++) {
    const colA = [];
    const colB = [];
    for (let j = 3; j < headerBottom-3; j++) {
      colA.push(imageA.getPixelColor(i, j));
      colB.push(imageB.getPixelColor(i, j));
    }

    const isMatched = matchColors(colA, colB);
    if (isMatched) {
      coverRight = i;
      isCoverRightDetected = true;
      break;
    }
  }
  
  if (!isCoverRightDetected) {
    throw new Error("Cover right not found");
  }

  const headerCY = Math.floor(headerBottom * 0.5);

  // detect diff left
  for (let i = coverRight; i < fixedX; i++) {
    const colA = [];
    const colB = [];
    for (let j = 3; j < headerBottom-3; j++) {
      colA.push(imageA.getPixelColor(i, j));
      colB.push(imageB.getPixelColor(i, j));
    }

    const isMatched = matchColors(colA, colB);
    if (!isMatched) {
      diffLeft = i;
      isDiffLeftDetected = true;
      break;
    }
  }
  
  if (!isDiffLeftDetected) {
    throw new Error("Diff left not found");
  }

  // detect diff right
  for (let i = fixedX - 1; i >= coverRight; i--) {
    const colA = [];
    const colB = [];
    for (let j = headerCY; j < headerBottom-3; j++) {
      colA.push(imageA.getPixelColor(i, j));
      colB.push(imageB.getPixelColor(i, j));
    }

    const isMatched = matchColors(colA, colB);
    if (!isMatched) {
      diffRight = i;
      isDiffRightDetected = true;
      break;
    }
  }

  if (!isDiffRightDetected) {
    throw new Error("Diff rihgt not found");
  }

  // detect diff top
  for (let i = headerCY; i < headerBottom; i++) {
    const colA = [];
    const colB = [];
    for (let j = diffLeft; j < diffRight; j++) {
      colA.push(imageA.getPixelColor(j, i));
      colB.push(imageB.getPixelColor(j, i));
    }

    const isMatched = matchColors(colA, colB);
    if (!isMatched) {
      diffTop = i;
      isDiffTopDetected = true;
      break;
    }
  }

  if (!isDiffTopDetected) {
    throw new Error("Diff.T not found");
  }

  // detect diff bottom
  for (let i = headerBottom - 1; i >= headerCY; i--) {
    const colA = [];
    const colB = [];
    for (let j = diffLeft; j < diffRight; j++) {
      colA.push(imageA.getPixelColor(j, i));
      colB.push(imageB.getPixelColor(j, i));
    }

    const isMatched = matchColors(colA, colB);
    if (!isMatched) {
      diffBottom = i;
      isDiffBottomDetected = true;
      break;
    }
  }

  if (!isDiffBottomDetected) {
    throw new Error("Diff.B not found");
  }

  const header = {
    top: headerTop,
    left: headerLeft,
    width: headerRight - headerLeft,
    height: headerBottom - headerTop,
  }

  const title = {
    left: diffLeft,
    top: header.top,
    width: Math.floor(header.width * 0.5),
    height: Math.floor(header.height * 0.5),
  }

  const diff = {
    left: diffLeft,
    top: diffTop,
    width: diffRight - diffLeft,
    height: diffBottom - diffTop,
  }

  return {
    header,
    title,
    diff,
  }
}

function detectBoard(imageA, imageB, header) {
  const imageWidth = imageA.bitmap.width;
  const imageHeight = imageA.bitmap.height;
  let boardLeft = header.left;
  let boardRight = header.left + Math.floor(header.width * 0.25);
  let boardTop = Math.floor(imageHeight * 0.5);
  let boardBottom = imageHeight;
  let challengeX = boardRight - 5;
  let challengeY = boardTop + 5;
  let challengePixels = [
    imageB.getPixelColor(challengeX, challengeY),
    imageB.getPixelColor(challengeX-((boardRight - boardLeft) * 0.5), challengeY),
    imageB.getPixelColor(challengeX, challengeY+10),
    imageB.getPixelColor(challengeX-((boardRight - boardLeft) * 0.5), challengeY+10),
  ];
  let isChallenge = true;
  for (const p of challengePixels) {
    if (!matchColor(Jimp.rgbaToInt(0, 0, 0, 255), p)) {
      isChallenge = false;
      break;
    }
  }

  return {
    board: {
      left: boardLeft + Math.floor((boardRight - boardLeft) * 0.6),
      top: boardTop,
      width: Math.floor((boardRight - boardLeft) * 0.4),
      height: boardBottom - boardTop,
    },
    isChallenge: isChallenge,
  }
}


async function recognize(src) {
  const image = await Jimp.read(src);
  let hash = image.hash();

  // best text height: 32px
  image.scaleToFit(2500, 1600, Jimp.RESIZE_BEZIER);

  // title, easy, normal, hard
  let imageA = image.clone().color([{ apply: "xor", params: ["#008800"] }]).invert().grayscale().contrast(1);
  let imageAA = image.clone().color([{ apply: "xor", params: ["#008800"] }]).invert().grayscale().contrast(0.8);
  // expert, master, append, judgements, combo
  let imageB = image.clone().color([{ apply: "xor", params: ["#FF00FF"] }]).invert().grayscale().contrast(1);
  let imageBB = image.clone().color([{ apply: "xor", params: ["#FF00FF"] }]).invert().grayscale().contrast(0.8);

  if (DEBUG) {
    image.write("./tmp/" + Date.now() + "_O.png");
    imageA.write("./tmp/" + Date.now() + "_A.png");
    imageAA.write("./tmp/" + Date.now() + "_AA.png");
    imageB.write("./tmp/" + Date.now() + "_B.png");
    imageBB.write("./tmp/" + Date.now() + "_BB.png");
  }

  // header
  const headerSizes = detectHeader(imageA, imageB);

  // title
  const titleImage = imageAA.clone().crop(
    headerSizes.title.left,
    headerSizes.title.top,
    headerSizes.title.width,
    headerSizes.title.height,
  );

  if (DEBUG) {
    titleImage.write("./tmp/" + Date.now() + "_title.png");
  }

  const titleBuffer = await titleImage.getBufferAsync("image/png");
  const titleText = await recognizeText(titleBuffer, [], ["jpn"]);
  const music = Music.findMusic(titleText).music;

  if (DEBUG) {
    console.log("titleText:", titleText);
    console.log("Music:", music);
  }

  // diff
  const diffImageA = imageAA.clone().crop(
    headerSizes.diff.left,
    headerSizes.diff.top,
    Math.floor(headerSizes.diff.width * 0.5),
    headerSizes.diff.height,
  );

  const diffImageB = imageBB.clone().crop(
    headerSizes.diff.left,
    headerSizes.diff.top,
    Math.floor(headerSizes.diff.width * 0.5),
    headerSizes.diff.height,
  );

  if (DEBUG) {
    diffImageA.write("./tmp/" + Date.now() + "_diff_A.png");
    diffImageB.write("./tmp/" + Date.now() + "_diff_B.png");
  }

  const diffBufferA = await diffImageA.getBufferAsync("image/png");
  const diffTextA = await recognizeText(diffBufferA, DIFFICULTY_CHARS, ["eng"]);
  const diffBufferB = await diffImageB.getBufferAsync("image/png");
  const diffTextB = await recognizeText(diffBufferB, DIFFICULTY_CHARS, ["eng"]);
  const diffTextC = util.toHalfWidth(diffTextB.length > diffTextA.length ? diffTextB : diffTextA);
  const diffText = findDiff(diffTextC);

  if (DEBUG) {
    console.log("diffTextA:", diffTextA);
    console.log("diffTextB:", diffTextB);
    console.log("diffTextC:", diffTextC);
    console.log("diffText:", diffText);
  }

  const difficulty = Music.findDiff(music.id, diffText);

  if (!difficulty) {
    throw new Error("Difficulty not found.");
  }

  if (DEBUG) {
    console.log("Difficulty:", difficulty);
  }

  // board
  const boardSizes = detectBoard(imageA, imageB, headerSizes.header);

  // challenge
  const isChallenge = boardSizes.isChallenge;

  const boardImage = imageBB.clone().crop(
    boardSizes.board.left,
    boardSizes.board.top,
    boardSizes.board.width,
    boardSizes.board.height,
  );

  if (DEBUG) {
    boardImage.write("./tmp/" + Date.now() + "_board.png");
  }

  const boardBuffer = await boardImage.getBufferAsync("image/png");
  const boardText = await recognizeText(boardBuffer, ["0123456789"], ["eng"], PSM.SINGLE_BLOCK);
  const boardNumbers = boardText.split(/\s+/)
    .map(function(item) {
      const n = parseInt(item);
      return isNaN(n) ? 0 : n;
    });

  if (DEBUG) {
    console.log("boardText:", boardText);
    console.log("boardNumbers:", boardNumbers);
    console.log("isChallenge:", isChallenge);
  }

  let remainder = difficulty.totalNoteCount;
  for (let i = 0; i < 4; i++) {
    remainder -= boardNumbers[i];
  }
  if (remainder < 0) {
    throw new Error("Board not found");
  }
  boardNumbers[4] = remainder; // miss

  const judgements = {
    perfect: boardNumbers[0],
    great: boardNumbers[1],
    good: boardNumbers[2],
    bad: boardNumbers[3],
    miss: boardNumbers[4],
  }

  if (DEBUG) {
    console.log("judgements:", judgements);
  }

  hash += titleImage.hash();
  hash += diffImageA.hash();
  hash += boardImage.hash();

  let condition = "LIVE CLEAR";
  if (judgements.perfect === difficulty.totalNoteCount) {
    condition = "ALL PERFECT";
  } else if (judgements.perfect + judgements.great === difficulty.totalNoteCount) {
    condition = "FULL COMBO";
  }

  return {
    hash,
    isChallenge,
    title: music.title,
    difficulty: difficulty.musicDifficulty.toUpperCase(),
    playLevel: difficulty.playLevel,
    totalNoteCount: difficulty.totalNoteCount,
    condition,
    music,
    musicDifficulty: difficulty,
    judgements,
  }
}

export default {
  recognize,
};