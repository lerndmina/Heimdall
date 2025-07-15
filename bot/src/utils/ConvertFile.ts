import ffmpeg from "fluent-ffmpeg";
import DeleteFile from "./DeleteFile";
import log from "./log";

export default async function (name: string, oldType: string, newType: string) {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(`${name}.${oldType}`)
      .toFormat("mp3")
      .on("error", (err) => {
        log.error(`FFMPEG ERR: ${err}`);
        reject(err);
      })
      .on("end", () => {
        resolve();
      })
      .save(`${name}.${newType}`);
  });
}
