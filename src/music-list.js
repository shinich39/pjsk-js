import path from 'path';
import fs from 'fs';
import jsutl from './util.js';
import Jimp from 'jimp';
import Music from './music.js';
import { createWorker, PSM } from 'tesseract.js';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const DEBUG = true;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_PATH = path.join(__dirname, "..", "tmp");

function checkTempDir() {
  if (!fs.existsSync(TEMP_PATH)) {
    fs.mkdirSync(TEMP_PATH);
  }
}

function clearTempDir() {
  if (fs.existsSync(TEMP_PATH)) {
    fs.rmSync(TEMP_PATH, { recursive: true, force: true });
  }
}

function isSameColor(a, b, threshold) {
  const c1 = Jimp.intToRGBA(a);
  const c2 = Jimp.intToRGBA(b);
  return Math.abs((c1.r+c1.g+c1.b)-(c2.r+c2.g+c2.b)) < 255 * 3 * (threshold || 0.1);
}

function isSameColors(arr, threshold) {
  if (arr.length > 1) {
    for (let i = 0; i < arr.length - 1; i++) {
      if (!isSameColor(arr[i], arr[i + 1], threshold)) {
        return false;
      }
    }
  }
  return true;
}

function getFrames(src) {
  return new Promise(function(resolve, reject) {
    checkTempDir();

    const output = path.join(TEMP_PATH, "%04d.jpg");
    // const takeAtSecond = '1';
    // const numberOfFrames = '1';

    const ffmpeg = spawn('ffmpeg', [
      "-skip_frame",
      "noref",
      '-i',
      src,
      "-r",
      12, // 12 fps
      // "-s",
      // "1000x1000",
      // "-fps_mode",
      // "vfr",
      // "-frame_pts",
      // true,
      output,
      '-y', // overwrite
    ]);
    
    ffmpeg.stderr.on('data', (data) => {
      console.log(data.toString());
    });
    
    ffmpeg.on('exit', () => {
      console.log(`Image generated successfully`);
      resolve(TEMP_PATH);
    });
  });
}

async function isValidFrame(src) {
  const image = await Jimp.read(src);
  const imageA = image.clone().color([{ apply: "xor", params: ["#ffffff"] }]).grayscale().contrast(1);
  const imageB = image.clone().grayscale().contrast(1);

  if (DEBUG) {
    image.write("./debug/" + Date.now() + "_O.png");
    imageA.write("./debug/" + Date.now() + "_A.png");
    imageB.write("./debug/" + Date.now() + "_B.png");
  }

}

export default {
  getFrames,
  isValidFrame,
}