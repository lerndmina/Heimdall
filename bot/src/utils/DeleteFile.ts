import fs from "fs";
import { debugMsg } from "./TinyUtils";
import log from "./log";

export default function (name: string, type: string) {
  const filename = `${name}.${type}`;
  if (fs.existsSync(filename)) {
    debugMsg(`Deleting file ${filename}`);
    fs.unlinkSync(filename);
  } else {
    log(`File ${filename} does not exist.`);
  }
}
