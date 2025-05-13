import { BrowserWindow, app, ipcMain, shell } from "electron";

// Use CommonJS require for problematic modules
import { createRequire } from "module";
// Import ffmpeg related modules
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In production, node_modules are in extraResources
const isDev = !app.isPackaged;

const require = createRequire(import.meta.url);

const ffmpeg = require("fluent-ffmpeg");

// Set ffmpeg and ffprobe paths
const ffmpegPath = isDev
  ? ffmpegStatic
  : path.join(
      process.resourcesPath,
      "app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg"
    );

const ffprobePath = isDev
  ? ffprobeStatic.path
  : path.join(
      process.resourcesPath,
      "app.asar.unpacked/node_modules/ffprobe-static/bin/darwin/arm64/ffprobe"
    );

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

async function cleanupFiles(inputPath, outputPath) {
  try {
    await fs.promises.unlink(inputPath);
    await fs.promises.unlink(outputPath);
    return true;
  } catch (error) {
    return false;
  }
}

ipcMain.on("optimize-video", async (event, payload) => {
  // Accept both single file and array for backward compatibility
  const files = Array.isArray(payload) ? payload.slice(0, 10) : [payload];

  for (let i = 0; i < files.length; i++) {
    const { inputPath, outputName } = files[i];
    try {
      await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(inputPath, (err, metadata) => {
          if (err) {
            event.reply("optimization-complete", {
              success: false,
              error: err.message,
              index: i,
            });
            return reject(err);
          }
          ffmpeg(inputPath)
            .outputOptions(["-vcodec h264", "-acodec aac"])
            .on("progress", (progress) => {
              const percent = Math.round((progress.percent || 0) * 100) / 100;
              event.reply("optimization-progress", { percent, index: i });
            })
            .on("end", async () => {
              event.reply("optimization-complete", {
                success: true,
                index: i,
              });
              resolve();
            })
            .on("error", (err) => {
              event.reply("optimization-complete", {
                success: false,
                error: err.message,
                index: i,
              });
              reject(err);
            })
            .save(outputName);
        });
      });
    } catch (e) {
      // Already handled in event.reply above
      continue;
    }
  }
});

ipcMain.on("open-file", (event, filePath) => {
  shell.openPath(filePath);
});
