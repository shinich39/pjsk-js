import path from 'path';
import fs from 'fs';
import pjsk from "./index.js";
import musicList from "./src/music-list.js";

// console.log(pjsk.findMusic("Tell Your World"));


const images = [
  // "./test/challenge1.png",
  // "./test/challenge2.png",
  // "./test/easy.png",
  // "./test/normal.png",
  // "./test/hard.png",
  "./test/expert.png",
  // "./test/master.png",
  // "./test/append.png",
];

;(async function() {
  for (const image of images) {
    const res = await pjsk.recognize(image);
    console.log(res);
  }
})();


// ;(async function() {
//   const video = "./test/list.mp4";
//   await musicList.getFrames(video);
//   const files = fs.readdirSync("./tmp");
//   const file = path.join("./", "tmp", files[0]);
//   await musicList.isValidFrame(file);
//   console.log(files);
//   for (const file of files) {
//   }
// })();